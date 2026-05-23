import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import type { CreateCharacterPayload } from "@gta-rp/shared";
import { getUserIdFromRequest } from "../auth.js";
import { grantStarterVehicleIfNeeded } from "./starter.js";

const createCharacterSchema = z.object({
  firstName: z.string().min(2).max(24),
  lastName: z.string().min(2).max(24)
});

const saveStateSchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  z: z.number().finite().optional(),
  heading: z.number().finite().optional(),
  health: z.number().int().min(0).max(200).optional(),
  armor: z.number().int().min(0).max(200).optional()
});

export const characterRouter = Router();

characterRouter.post("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const parsed = createCharacterSchema.safeParse(req.body satisfies CreateCharacterPayload);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  const result = await pool.query<{
    id: number;
    user_id: number;
    first_name: string;
    last_name: string;
    money_cash: number;
    money_bank: number;
    created_at: string;
  }>(
    `INSERT INTO characters (user_id, first_name, last_name)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, first_name, last_name, money_cash, money_bank, created_at`,
    [userId, parsed.data.firstName, parsed.data.lastName]
  );

  const character = result.rows[0];
  // Gift starter vehicle so the player can drive immediately on first join.
  await grantStarterVehicleIfNeeded(character.id).catch((e) =>
    console.error("[character.create] starter grant failed", e)
  );

  return res.status(201).json({
    id: character.id,
    userId: character.user_id,
    firstName: character.first_name,
    lastName: character.last_name,
    moneyCash: character.money_cash,
    moneyBank: character.money_bank,
    createdAt: character.created_at
  });
});

characterRouter.get("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const result = await pool.query<{
    id: number;
    first_name: string;
    last_name: string;
    money_cash: number;
    money_bank: number;
    created_at: string;
  }>(
    `SELECT id, first_name, last_name, money_cash, money_bank, created_at
       FROM characters WHERE user_id = $1 ORDER BY id ASC`,
    [userId]
  );

  return res.json({
    characters: result.rows.map((c) => ({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      moneyCash: c.money_cash,
      moneyBank: c.money_bank,
      createdAt: c.created_at
    }))
  });
});

characterRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const result = await pool.query<{
    id: number;
    user_id: number;
    first_name: string;
    last_name: string;
    money_cash: number;
    money_bank: number;
    created_at: string;
    pos_x: number | null;
    pos_y: number | null;
    pos_z: number | null;
    heading: number | null;
    health: number | null;
    armor: number | null;
  }>(
    `SELECT c.id, c.user_id, c.first_name, c.last_name, c.money_cash, c.money_bank, c.created_at,
            cp.x AS pos_x, cp.y AS pos_y, cp.z AS pos_z, cp.heading,
            cs.health, cs.armor
       FROM characters c
       LEFT JOIN character_position cp ON cp.character_id = c.id
       LEFT JOIN character_stats cs ON cs.character_id = c.id
      WHERE c.user_id = $1 ORDER BY c.id DESC LIMIT 1`,
    [userId]
  );

  if (result.rowCount === 0) return res.status(404).json({ message: "Character not found" });
  const row = result.rows[0];

  // Ensure starter vehicle exists even for pre-RAGE-MP characters.
  await grantStarterVehicleIfNeeded(row.id).catch(() => {});

  return res.json({
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    moneyCash: row.money_cash,
    moneyBank: row.money_bank,
    createdAt: row.created_at,
    position:
      row.pos_x !== null && row.pos_y !== null && row.pos_z !== null
        ? { x: row.pos_x, y: row.pos_y, z: row.pos_z, heading: row.heading ?? 0 }
        : null,
    health: row.health ?? 100,
    armor: row.armor ?? 0
  });
});

/**
 * Save current position / health / armor of the active character.
 * Called periodically by the RAGE MP server bridge and on disconnect.
 */
characterRouter.post("/save-state", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const parsed = saveStateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const ch = await pool.query<{ id: number }>(
    `SELECT id FROM characters WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (ch.rowCount === 0) return res.status(404).json({ message: "Character not found" });
  const characterId = ch.rows[0].id;

  const { x, y, z, heading, health, armor } = parsed.data;
  if (x !== undefined && y !== undefined && z !== undefined) {
    await pool.query(
      `INSERT INTO character_position (character_id, x, y, z, heading, updated_at)
       VALUES ($1, $2, $3, $4, COALESCE($5, 0), NOW())
       ON CONFLICT (character_id)
       DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z, heading = EXCLUDED.heading, updated_at = NOW()`,
      [characterId, x, y, z, heading]
    );
  }
  if (health !== undefined || armor !== undefined) {
    await pool.query(
      `INSERT INTO character_stats (character_id, health, armor)
       VALUES ($1, COALESCE($2, 100), COALESCE($3, 0))
       ON CONFLICT (character_id)
       DO UPDATE SET
         health = COALESCE(EXCLUDED.health, character_stats.health),
         armor = COALESCE(EXCLUDED.armor, character_stats.armor)`,
      [characterId, health, armor]
    );
  }
  return res.json({ ok: true });
});
