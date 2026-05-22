import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";

const itemChangeSchema = z.object({
  itemCode: z.string().min(2).max(40),
  quantity: z.number().int().positive().max(1000)
});

async function getCharacterIdByUserId(userId: number): Promise<number | null> {
  const character = await pool.query<{ id: number }>(
    `SELECT id FROM characters WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (character.rowCount === 0) return null;
  return character.rows[0].id;
}

export const inventoryRouter = Router();

inventoryRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const items = await pool.query<{
    item_code: string;
    quantity: number;
  }>(`SELECT item_code, quantity FROM inventory_items WHERE character_id = $1 ORDER BY item_code ASC`, [
    characterId
  ]);

  return res.json({
    items: items.rows.map((item) => ({
      itemCode: item.item_code,
      quantity: item.quantity
    }))
  });
});

inventoryRouter.post("/add", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = itemChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `INSERT INTO inventory_items (character_id, item_code, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (character_id, item_code)
     DO UPDATE SET quantity = inventory_items.quantity + EXCLUDED.quantity`,
    [characterId, parsed.data.itemCode, parsed.data.quantity]
  );

  return res.status(201).json({ ok: true });
});

inventoryRouter.post("/use", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = itemChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const item = await pool.query<{ quantity: number }>(
    `SELECT quantity FROM inventory_items WHERE character_id = $1 AND item_code = $2`,
    [characterId, parsed.data.itemCode]
  );
  if (item.rowCount === 0 || item.rows[0].quantity < parsed.data.quantity) {
    return res.status(400).json({ message: "Not enough items" });
  }

  await pool.query(
    `UPDATE inventory_items
        SET quantity = quantity - $1
      WHERE character_id = $2 AND item_code = $3`,
    [parsed.data.quantity, characterId, parsed.data.itemCode]
  );
  await pool.query(
    `DELETE FROM inventory_items
      WHERE character_id = $1 AND item_code = $2 AND quantity <= 0`,
    [characterId, parsed.data.itemCode]
  );

  return res.json({ ok: true });
});
