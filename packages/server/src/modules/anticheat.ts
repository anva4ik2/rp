import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const MAX_SPEED = 50; // m/s
const MAX_TELEPORT_DISTANCE = 100; // meters
const MAX_MONEY_PER_MINUTE = 100000;
const SUSPICIOUS_ACTION_THRESHOLD = 5;

const positionUpdateSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  heading: z.number().optional(),
  timestamp: z.number()
});

const actionLogSchema = z.object({
  actionType: z.enum(["teleport", "speed_hack", "money_spawn", "weapon_spawn", "invalid_action"]),
  details: z.string().max(500),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional()
});

// Store last positions for speed checks
const lastPositions = new Map<number, { x: number; y: number; z: number; timestamp: number }>();

// Store action counts for suspicious activity detection
const actionCounts = new Map<number, Map<string, number>>();

export const anticheatRouter = Router();

// Update position for anti-cheat validation
anticheatRouter.post("/position", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = positionUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const lastPos = lastPositions.get(characterId);
  const now = Date.now();

  if (lastPos) {
    const timeDiff = (now - lastPos.timestamp) / 1000; // seconds
    if (timeDiff > 0) {
      const distance = Math.sqrt(
        Math.pow(parsed.data.x - lastPos.x, 2) +
        Math.pow(parsed.data.y - lastPos.y, 2) +
        Math.pow(parsed.data.z - lastPos.z, 2)
      );
      const speed = distance / timeDiff;

      // Check for speed hack
      if (speed > MAX_SPEED) {
        await logSuspiciousAction(characterId, "speed_hack", `Speed: ${speed.toFixed(2)} m/s, Distance: ${distance.toFixed(2)}m, Time: ${timeDiff.toFixed(2)}s`, parsed.data.x, parsed.data.y, parsed.data.z);
        return res.status(403).json({ message: "Suspicious movement detected", reason: "speed_hack", speed });
      }

      // Check for teleport
      if (distance > MAX_TELEPORT_DISTANCE && timeDiff < 2) {
        await logSuspiciousAction(characterId, "teleport", `Distance: ${distance.toFixed(2)}m, Time: ${timeDiff.toFixed(2)}s`, parsed.data.x, parsed.data.y, parsed.data.z);
        return res.status(403).json({ message: "Teleport detected", reason: "teleport", distance });
      }
    }
  }

  lastPositions.set(characterId, { x: parsed.data.x, y: parsed.data.y, z: parsed.data.z, timestamp: now });

  return res.json({ ok: true });
});

// Log suspicious action
async function logSuspiciousAction(
  characterId: number,
  actionType: "teleport" | "speed_hack" | "money_spawn" | "weapon_spawn" | "invalid_action",
  details: string,
  x?: number,
  y?: number,
  z?: number
): Promise<void> {
  await pool.query(
    `INSERT INTO admin_logs (admin_character_id, target_character_id, action, details, created_at)
     VALUES (NULL, $1, $2, $3, NOW())`,
    [characterId, `ANTICHEAT: ${actionType}`, details]
  );

  // Increment action count
  const counts = actionCounts.get(characterId) || new Map();
  const currentCount = (counts.get(actionType) || 0) + 1;
  counts.set(actionType, currentCount);
  actionCounts.set(characterId, counts);

  // Check if threshold exceeded
  if (currentCount >= SUSPICIOUS_ACTION_THRESHOLD) {
    // Could auto-ban here, but for now just log
    console.log(`[anticheat] Character ${characterId} exceeded threshold for ${actionType}: ${currentCount}`);
  }
}

// Validate money change
anticheatRouter.post("/validate-money", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    amount: z.number().int(),
    reason: z.string()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check for suspicious money spawn
  if (parsed.data.amount > MAX_MONEY_PER_MINUTE && parsed.data.reason !== "admin") {
    await logSuspiciousAction(characterId, "money_spawn", `Amount: ${parsed.data.amount}, Reason: ${parsed.data.reason}`);
    return res.status(403).json({ message: "Suspicious money change detected" });
  }

  return res.json({ ok: true });
});

// Validate weapon spawn
anticheatRouter.post("/validate-weapon", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    weaponCode: z.string(),
    source: z.enum(["inventory", "pickup", "spawn"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check for suspicious weapon spawn
  if (parsed.data.source === "spawn") {
    await logSuspiciousAction(characterId, "weapon_spawn", `Weapon: ${parsed.data.weaponCode}, Source: ${parsed.data.source}`);
    return res.status(403).json({ message: "Suspicious weapon spawn detected" });
  }

  return res.json({ ok: true });
});

// Get anticheat logs (admin only)
anticheatRouter.get("/logs", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;

  const logs = await pool.query(
    `SELECT al.id, al.target_character_id, al.action, al.details, al.created_at,
            c.first_name, c.last_name
       FROM admin_logs al
       LEFT JOIN characters c ON al.target_character_id = c.id
       WHERE al.action LIKE 'ANTICHEAT:%'
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return res.json({
    logs: logs.rows.map(row => ({
      id: row.id,
      characterId: row.target_character_id,
      characterName: row.first_name ? `${row.first_name} ${row.last_name}` : null,
      action: row.action.replace("ANTICHEAT: ", ""),
      details: row.details,
      createdAt: row.created_at
    }))
  });
});

// Get character suspicious action count
anticheatRouter.get("/status/:characterId", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const characterId = parseInt(req.params.characterId, 10);
  if (isNaN(characterId)) return res.status(400).json({ message: "Invalid character ID" });

  const counts = actionCounts.get(characterId) || new Map();

  return res.json({
    characterId,
    suspiciousActions: Object.fromEntries(counts),
    totalActions: Array.from(counts.values()).reduce((a, b) => a + b, 0)
  });
});

// Log a death event (called by RAGE MP server on `playerDeath`)
const deathSchema = z.object({
  killerCharacterId: z.number().int().positive().optional(),
  reason: z.string().max(200).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional()
});
anticheatRouter.post("/death", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = deathSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `INSERT INTO death_logs (character_id, killer_character_id, reason, x, y, z)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      characterId,
      parsed.data.killerCharacterId ?? null,
      parsed.data.reason ?? "unknown",
      parsed.data.x ?? null,
      parsed.data.y ?? null,
      parsed.data.z ?? null
    ]
  );
  // Reset HP on respawn
  await pool.query(
    `INSERT INTO character_stats (character_id, health, armor)
     VALUES ($1, 100, 0)
     ON CONFLICT (character_id) DO UPDATE SET health = 100, armor = 0`,
    [characterId]
  );
  return res.json({ ok: true });
});

// Reset position tracking (on character disconnect)
anticheatRouter.post("/disconnect", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  lastPositions.delete(characterId);
  actionCounts.delete(characterId);

  return res.json({ ok: true });
});
