import { Router } from "express";
import { z } from "zod";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";
import { getFactionMembershipByCharacterId, getFactionPermissions } from "../faction-context.js";
import { pool } from "../db.js";

const wantedSchema = z.object({
  targetCharacterId: z.number().int().positive(),
  reason: z.string().min(3).max(120),
  wantedLevel: z.number().int().min(1).max(5)
});

const arrestSchema = z.object({
  suspectCharacterId: z.number().int().positive(),
  reason: z.string().min(3).max(120),
  jailMinutes: z.number().int().min(0).max(180),
  fineAmount: z.number().int().min(0).max(500000)
});

const clearWantedSchema = z.object({
  targetCharacterId: z.number().int().positive()
});

const captureSchema = z.object({
  territoryCode: z.string().min(2).max(32),
  points: z.number().int().min(1).max(100)
});

export const crimeRouter = Router();

crimeRouter.get("/wanted", async (_req, res) => {
  const wanted = await pool.query<{
    id: number;
    character_id: number;
    reason: string;
    wanted_level: number;
    created_at: string;
  }>(
    `SELECT id, character_id, reason, wanted_level, created_at
       FROM wanted_records
      WHERE active = TRUE
      ORDER BY wanted_level DESC, id DESC
      LIMIT 100`
  );

  return res.json({
    records: wanted.rows.map((row) => ({
      id: row.id,
      characterId: row.character_id,
      reason: row.reason,
      wantedLevel: row.wanted_level,
      createdAt: row.created_at
    }))
  });
});

crimeRouter.post("/wanted", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });
  const membership = await getFactionMembershipByCharacterId(characterId);
  const permissions = await getFactionPermissions(characterId);
  if (!membership || membership.factionType !== "government" || !membership.onDuty || !permissions?.canIssueWanted) {
    return res.status(403).json({ message: "Government duty required" });
  }

  const parsed = wantedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `INSERT INTO wanted_records (character_id, reason, wanted_level, active)
     VALUES ($1, $2, $3, TRUE)`,
    [parsed.data.targetCharacterId, parsed.data.reason, parsed.data.wantedLevel]
  );

  return res.status(201).json({ ok: true });
});

crimeRouter.post("/wanted/clear", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });
  const membership = await getFactionMembershipByCharacterId(characterId);
  const permissions = await getFactionPermissions(characterId);
  if (!membership || membership.factionType !== "government" || !membership.onDuty || !permissions?.canIssueWanted) {
    return res.status(403).json({ message: "Government duty required" });
  }

  const parsed = clearWantedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `UPDATE wanted_records
        SET active = FALSE, closed_at = NOW()
      WHERE character_id = $1 AND active = TRUE`,
    [parsed.data.targetCharacterId]
  );
  return res.json({ ok: true });
});

crimeRouter.post("/arrest", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const officerCharacterId = await getCharacterIdByUserId(userId);
  if (!officerCharacterId) return res.status(404).json({ message: "Character not found" });
  const membership = await getFactionMembershipByCharacterId(officerCharacterId);
  const permissions = await getFactionPermissions(officerCharacterId);
  if (!membership || membership.factionType !== "government" || !membership.onDuty || !permissions?.canArrest) {
    return res.status(403).json({ message: "Government duty required" });
  }

  const parsed = arrestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO arrest_records (officer_character_id, suspect_character_id, reason, jail_minutes, fine_amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        officerCharacterId,
        parsed.data.suspectCharacterId,
        parsed.data.reason,
        parsed.data.jailMinutes,
        parsed.data.fineAmount
      ]
    );
    if (parsed.data.fineAmount > 0) {
      await client.query(
        `UPDATE characters
            SET money_bank = GREATEST(money_bank - $1, 0)
          WHERE id = $2`,
        [parsed.data.fineAmount, parsed.data.suspectCharacterId]
      );
    }
    await client.query(
      `UPDATE wanted_records
          SET active = FALSE, closed_at = NOW()
        WHERE character_id = $1 AND active = TRUE`,
      [parsed.data.suspectCharacterId]
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Arrest transaction failed" });
  } finally {
    client.release();
  }

  return res.status(201).json({ ok: true });
});

crimeRouter.get("/territories", async (_req, res) => {
  const territories = await pool.query<{
    code: string;
    name: string;
    controlling_faction_id: number | null;
    influence: number;
  }>(
    `SELECT code, name, controlling_faction_id, influence
       FROM territories
      ORDER BY code ASC`
  );

  return res.json({
    territories: territories.rows.map((territory) => ({
      code: territory.code,
      name: territory.name,
      controllingFactionId: territory.controlling_faction_id,
      influence: territory.influence
    }))
  });
});

crimeRouter.post("/territories/capture", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });
  const membership = await getFactionMembershipByCharacterId(characterId);
  const permissions = await getFactionPermissions(characterId);
  if (
    !membership ||
    (membership.factionType !== "gang" && membership.factionType !== "crime") ||
    !permissions?.canCaptureTerritory
  ) {
    return res.status(403).json({ message: "Crime faction required" });
  }

  const parsed = captureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const territory = await pool.query<{ id: number; influence: number; controlling_faction_id: number | null }>(
    `SELECT id, influence, controlling_faction_id FROM territories WHERE code = $1`,
    [parsed.data.territoryCode]
  );
  if (territory.rowCount === 0) return res.status(404).json({ message: "Territory not found" });

  const current = territory.rows[0];
  const sameFaction = current.controlling_faction_id === membership.factionId;
  const updatedInfluence = sameFaction ? Math.min(current.influence + parsed.data.points, 100) : current.influence - parsed.data.points;
  let nextFactionId = current.controlling_faction_id;
  let nextInfluence = updatedInfluence;
  if (!sameFaction && updatedInfluence <= 0) {
    nextFactionId = membership.factionId;
    nextInfluence = Math.min(parsed.data.points, 100);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE territories
          SET controlling_faction_id = $1,
              influence = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [nextFactionId, nextInfluence, current.id]
    );
    await client.query(
      `INSERT INTO territory_capture_logs (territory_id, faction_id, points)
       VALUES ($1, $2, $3)`,
      [current.id, membership.factionId, parsed.data.points]
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Territory capture failed" });
  } finally {
    client.release();
  }

  return res.json({
    ok: true,
    controllingFactionId: nextFactionId,
    influence: nextInfluence
  });
});
