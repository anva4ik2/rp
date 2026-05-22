import { Router } from "express";
import { z } from "zod";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";
import { pool } from "../db.js";
import { getFactionMembershipByCharacterId, getFactionPermissions } from "../faction-context.js";

const joinFactionSchema = z.object({
  inviteCode: z.string().min(4).max(32)
});

const dutySchema = z.object({
  onDuty: z.boolean()
});

const spawnFactionVehicleSchema = z.object({
  factionVehicleId: z.number().int().positive(),
  spawned: z.boolean()
});

const treasuryChangeSchema = z.object({
  amount: z.number().int().positive().max(200000)
});

const rankWeight: Record<string, number> = {
  recruit: 1,
  member: 10,
  officer: 30,
  sergeant: 50,
  captain: 70,
  chief: 100,
  leader: 100
};

function hasRank(currentRank: string, requiredRank: string): boolean {
  return (rankWeight[currentRank] ?? 0) >= (rankWeight[requiredRank] ?? 0);
}

export const factionsRouter = Router();

factionsRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const member = await pool.query<{
    faction_id: number;
    rank_code: string;
    is_leader: boolean;
    on_duty: boolean;
    faction_name: string;
    faction_type: string;
    treasury: number;
  }>(
    `SELECT fm.faction_id,
            fm.rank_code,
            fm.is_leader,
            fm.on_duty,
            f.name AS faction_name,
            f.type AS faction_type,
            f.treasury
       FROM faction_members fm
       JOIN factions f ON f.id = fm.faction_id
      WHERE fm.character_id = $1`,
    [characterId]
  );

  if (member.rowCount === 0) return res.status(404).json({ message: "Faction membership not found" });
  const row = member.rows[0];
  return res.json({
    factionId: row.faction_id,
    factionName: row.faction_name,
    factionType: row.faction_type,
    rankCode: row.rank_code,
    isLeader: row.is_leader,
    onDuty: row.on_duty,
    treasury: row.treasury
  });
});

factionsRouter.post("/join", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = joinFactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const faction = await pool.query<{ id: number }>(`SELECT id FROM factions WHERE invite_code = $1`, [
    parsed.data.inviteCode
  ]);
  if (faction.rowCount === 0) return res.status(404).json({ message: "Invalid invite code" });

  try {
    await pool.query(
      `INSERT INTO faction_members (faction_id, character_id, rank_code, is_leader, on_duty)
       VALUES ($1, $2, 'recruit', FALSE, FALSE)`,
      [faction.rows[0].id, characterId]
    );
    return res.status(201).json({ ok: true, factionId: faction.rows[0].id });
  } catch {
    return res.status(409).json({ message: "Character already has a faction" });
  }
});

factionsRouter.post("/duty", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = dutySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const result = await pool.query(
    `UPDATE faction_members SET on_duty = $1 WHERE character_id = $2`,
    [parsed.data.onDuty, characterId]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: "Faction membership not found" });

  return res.json({ ok: true });
});

factionsRouter.get("/vehicles", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const membership = await pool.query<{ faction_id: number; rank_code: string }>(
    `SELECT faction_id, rank_code FROM faction_members WHERE character_id = $1`,
    [characterId]
  );
  if (membership.rowCount === 0) return res.status(404).json({ message: "Faction membership not found" });

  const vehicles = await pool.query<{
    id: number;
    model_code: string;
    plate: string;
    fuel: number;
    is_spawned: boolean;
    min_rank_code: string;
  }>(
    `SELECT id, model_code, plate, fuel, is_spawned, min_rank_code
       FROM faction_vehicles
      WHERE faction_id = $1
      ORDER BY id DESC`,
    [membership.rows[0].faction_id]
  );

  return res.json({
    vehicles: vehicles.rows
      .filter((vehicle) => hasRank(membership.rows[0].rank_code, vehicle.min_rank_code))
      .map((vehicle) => ({
        id: vehicle.id,
        modelCode: vehicle.model_code,
        plate: vehicle.plate,
        fuel: vehicle.fuel,
        isSpawned: vehicle.is_spawned,
        minRankCode: vehicle.min_rank_code
      }))
  });
});

factionsRouter.post("/vehicles/spawn", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = spawnFactionVehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const membership = await pool.query<{ faction_id: number; rank_code: string }>(
    `SELECT faction_id, rank_code FROM faction_members WHERE character_id = $1`,
    [characterId]
  );
  if (membership.rowCount === 0) return res.status(404).json({ message: "Faction membership not found" });

  const targetVehicle = await pool.query<{ min_rank_code: string }>(
    `SELECT min_rank_code FROM faction_vehicles WHERE id = $1 AND faction_id = $2`,
    [parsed.data.factionVehicleId, membership.rows[0].faction_id]
  );
  if (targetVehicle.rowCount === 0) return res.status(404).json({ message: "Faction vehicle not found" });
  if (!hasRank(membership.rows[0].rank_code, targetVehicle.rows[0].min_rank_code)) {
    return res.status(403).json({ message: "Rank too low for this faction vehicle" });
  }

  const result = await pool.query(
    `UPDATE faction_vehicles
        SET is_spawned = $1
      WHERE id = $2 AND faction_id = $3`,
    [parsed.data.spawned, parsed.data.factionVehicleId, membership.rows[0].faction_id]
  );
  if (result.rowCount === 0) return res.status(404).json({ message: "Faction vehicle not found" });

  return res.json({ ok: true });
});

factionsRouter.post("/treasury/deposit", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });
  const membership = await getFactionMembershipByCharacterId(characterId);
  if (!membership) return res.status(404).json({ message: "Faction membership not found" });
  const permissions = await getFactionPermissions(characterId);
  if (!permissions?.canManageTreasury) {
    return res.status(403).json({ message: "Treasury permission required" });
  }

  const parsed = treasuryChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const wallet = await pool.query<{ money_bank: number }>(`SELECT money_bank FROM characters WHERE id = $1`, [
    characterId
  ]);
  if (wallet.rowCount === 0) return res.status(404).json({ message: "Character not found" });
  if (wallet.rows[0].money_bank < parsed.data.amount) {
    return res.status(400).json({ message: "Not enough bank money" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`, [
      parsed.data.amount,
      characterId
    ]);
    await client.query(`UPDATE factions SET treasury = treasury + $1 WHERE id = $2`, [
      parsed.data.amount,
      membership.factionId
    ]);
    await client.query(
      `INSERT INTO faction_treasury_logs (faction_id, character_id, action, amount)
       VALUES ($1, $2, $3, $4)`,
      [membership.factionId, characterId, "deposit", parsed.data.amount]
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Treasury deposit failed" });
  } finally {
    client.release();
  }

  return res.status(201).json({ ok: true });
});

factionsRouter.post("/treasury/withdraw", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });
  const membership = await getFactionMembershipByCharacterId(characterId);
  if (!membership) return res.status(404).json({ message: "Faction membership not found" });
  const permissions = await getFactionPermissions(characterId);
  if (!permissions?.canManageTreasury) {
    return res.status(403).json({ message: "Treasury permission required" });
  }

  const parsed = treasuryChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const treasury = await pool.query<{ treasury: number }>(`SELECT treasury FROM factions WHERE id = $1`, [
    membership.factionId
  ]);
  if (treasury.rowCount === 0) return res.status(404).json({ message: "Faction not found" });
  if (treasury.rows[0].treasury < parsed.data.amount) {
    return res.status(400).json({ message: "Not enough treasury balance" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE factions SET treasury = treasury - $1 WHERE id = $2`, [
      parsed.data.amount,
      membership.factionId
    ]);
    await client.query(`UPDATE characters SET money_bank = money_bank + $1 WHERE id = $2`, [
      parsed.data.amount,
      characterId
    ]);
    await client.query(
      `INSERT INTO faction_treasury_logs (faction_id, character_id, action, amount)
       VALUES ($1, $2, $3, $4)`,
      [membership.factionId, characterId, "withdraw", parsed.data.amount]
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Treasury withdraw failed" });
  } finally {
    client.release();
  }

  return res.status(201).json({ ok: true });
});
