import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

/**
 * Admin levels:
 *   0 — player (no admin)
 *   1 — helper        (kick, mute, accept reports, spectate)
 *   2 — moderator     (+ teleport players, freeze, jail)
 *   3 — game-admin    (+ ban, give items, set money)
 *   4 — head-admin    (+ create factions, give vehicles, edit catalog)
 *   5 — founder       (+ set admin levels, full DB control)
 *
 * Authentication options:
 *   - `x-admin-token` header (full access, level 5 equivalent) — recommended for
 *     server-to-server (RAGE MP bridge, CI scripts).
 *   - Bearer JWT of a user with `users.admin_level >= required`.
 */

interface AdminContext {
  byToken: boolean;
  userId: number | null;
  level: number;
  characterId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminContext;
    }
  }
}

export async function loadAdminContext(req: Request): Promise<AdminContext | null> {
  const token = req.headers["x-admin-token"];
  if (typeof token === "string" && token === config.adminToken) {
    return { byToken: true, userId: null, level: 5, characterId: null };
  }
  const userId = getUserIdFromRequest(req);
  if (!userId) return null;
  const result = await pool.query<{ admin_level: number }>(
    `SELECT admin_level FROM users WHERE id = $1`,
    [userId]
  );
  if (result.rowCount === 0) return null;
  const level = result.rows[0].admin_level ?? 0;
  if (level <= 0) return null;
  const characterId = await getCharacterIdByUserId(userId);
  return { byToken: false, userId, level, characterId };
}

function requireLevel(minLevel: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ctx = await loadAdminContext(req);
    if (!ctx) return res.status(403).json({ message: "Forbidden" });
    if (ctx.level < minLevel) return res.status(403).json({ message: `Need admin level ${minLevel}` });
    req.admin = ctx;
    return next();
  };
}

async function audit(adminCharacterId: number | null, targetCharacterId: number | null, action: string, details?: string): Promise<void> {
  await pool.query(
    `INSERT INTO admin_logs (admin_character_id, target_character_id, action, details)
     VALUES ($1, $2, $3, $4)`,
    [adminCharacterId, targetCharacterId, action, details ?? null]
  );
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const giveMoneySchema = z.object({
  characterId: z.number().int().positive(),
  amount: z.number().int().min(1).max(500000),
  to: z.enum(["cash", "bank"])
});

const setMoneySchema = z.object({
  characterId: z.number().int().positive(),
  cash: z.number().int().min(0).optional(),
  bank: z.number().int().min(0).optional()
});

const kickSchema = z.object({
  characterId: z.number().int().positive(),
  reason: z.string().min(1).max(200)
});

const banSchema = z.object({
  userId: z.number().int().positive().optional(),
  characterId: z.number().int().positive().optional(),
  reason: z.string().min(1).max(500),
  hours: z.number().int().min(0).max(24 * 365).default(0), // 0 = permanent
  permanent: z.boolean().default(false)
});

const teleportSchema = z.object({
  characterId: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  heading: z.number().default(0)
});

const setAdminLevelSchema = z.object({
  userId: z.number().int().positive(),
  level: z.number().int().min(0).max(5)
});

const giveVehicleSchema = z.object({
  characterId: z.number().int().positive(),
  modelCode: z.string().min(2).max(64)
});

const healSchema = z.object({
  characterId: z.number().int().positive(),
  health: z.number().int().min(1).max(200).default(100),
  armor: z.number().int().min(0).max(200).default(100)
});

const createFactionSchema = z.object({
  name: z.string().min(3).max(64),
  type: z.enum(["government", "crime", "business", "gang"]),
  inviteCode: z.string().min(4).max(32)
});

const addFactionMemberSchema = z.object({
  factionId: z.number().int().positive(),
  characterId: z.number().int().positive(),
  rankCode: z.string().min(2).max(32).default("recruit"),
  isLeader: z.boolean().default(false)
});

const addFactionVehicleSchema = z.object({
  factionId: z.number().int().positive(),
  modelCode: z.string().min(2).max(32),
  plate: z.string().min(3).max(16),
  minRankCode: z.string().min(2).max(32).default("recruit")
});

const upsertFactionRankSchema = z.object({
  factionId: z.number().int().positive(),
  rankCode: z.string().min(2).max(32),
  rankWeight: z.number().int().min(1).max(1000).default(1),
  canInvite: z.boolean().default(false),
  canManageTreasury: z.boolean().default(false),
  canIssueWanted: z.boolean().default(false),
  canArrest: z.boolean().default(false),
  canManageVehicles: z.boolean().default(false),
  canCaptureTerritory: z.boolean().default(false)
});

const catalogVehicleSchema = z.object({
  modelCode: z.string().min(2).max(64),
  displayName: z.string().min(2).max(120),
  brand: z.string().min(1).max(120),
  price: z.number().int().min(0).max(100000000),
  tier: z.enum(["economy", "comfort", "sport", "super", "service", "government", "crime", "premium"]),
  regions: z.array(z.enum(["EU", "RU", "CIS", "DE"])).min(1),
  access: z.array(z.string().min(2).max(32)).min(1),
  minRankCode: z.string().min(2).max(32).optional()
});

const bulkCatalogSchema = z.object({
  items: z.array(catalogVehicleSchema).min(1),
  replaceAll: z.boolean().default(false)
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const adminRouter = Router();

// "Who am I" — used by CEF to decide whether to show admin panel
adminRouter.get("/me", async (req, res) => {
  const ctx = await loadAdminContext(req);
  if (!ctx) return res.json({ isAdmin: false, level: 0 });
  return res.json({ isAdmin: true, level: ctx.level, byToken: ctx.byToken, characterId: ctx.characterId });
});

// Lookup characters by partial name (level 1+)
adminRouter.get("/search", requireLevel(1), async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ characters: [] });
  const rows = await pool.query(
    `SELECT c.id, c.first_name, c.last_name, c.user_id, u.admin_level
       FROM characters c
       JOIN users u ON u.id = c.user_id
      WHERE c.first_name ILIKE $1 OR c.last_name ILIKE $1 OR (c.first_name || ' ' || c.last_name) ILIKE $1
      LIMIT 25`,
    [`%${q}%`]
  );
  return res.json({
    characters: rows.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      adminLevel: r.admin_level,
      name: `${r.first_name} ${r.last_name}`
    }))
  });
});

// Logs (level 1+)
adminRouter.get("/logs", requireLevel(1), async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
  const rows = await pool.query(
    `SELECT al.id, al.admin_character_id, al.target_character_id, al.action, al.details, al.created_at,
            ac.first_name AS admin_first, ac.last_name AS admin_last,
            tc.first_name AS target_first, tc.last_name AS target_last
       FROM admin_logs al
       LEFT JOIN characters ac ON al.admin_character_id = ac.id
       LEFT JOIN characters tc ON al.target_character_id = tc.id
      ORDER BY al.created_at DESC
      LIMIT $1`,
    [limit]
  );
  return res.json({
    logs: rows.rows.map((r) => ({
      id: r.id,
      action: r.action,
      details: r.details,
      admin: r.admin_first ? `${r.admin_first} ${r.admin_last}` : null,
      target: r.target_first ? `${r.target_first} ${r.target_last}` : null,
      targetCharacterId: r.target_character_id,
      createdAt: r.created_at
    }))
  });
});

// Reports queue (level 1+)
adminRouter.get("/reports", requireLevel(1), async (_req, res) => {
  const rows = await pool.query(
    `SELECT r.id, r.reason, r.status, r.response, r.created_at,
            rc.first_name AS reporter_first, rc.last_name AS reporter_last,
            tc.first_name AS target_first, tc.last_name AS target_last,
            r.reporter_character_id, r.target_character_id
       FROM reports r
       LEFT JOIN characters rc ON r.reporter_character_id = rc.id
       LEFT JOIN characters tc ON r.target_character_id = tc.id
      ORDER BY r.created_at DESC
      LIMIT 100`
  );
  return res.json({
    reports: rows.rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      status: r.status,
      response: r.response,
      reporter: r.reporter_first ? `${r.reporter_first} ${r.reporter_last}` : null,
      target: r.target_first ? `${r.target_first} ${r.target_last}` : null,
      reporterCharacterId: r.reporter_character_id,
      targetCharacterId: r.target_character_id,
      createdAt: r.created_at
    }))
  });
});

// Kick (level 1+). Implementation note: backend can't kick the player by itself;
// the RAGE MP server bridge polls or subscribes. We return a directive that
// the bridge resolves to an actual `player.kick`. Bridge does this by reading
// `/admin/pending-kicks` (simple poll) or by direct call after admin command.
/**
 * Pending actions queue. The RAGE MP bridge polls `/admin/pending` and drains
 * these arrays, applying each effect on the live game world.
 */
interface PendingFlag { characterId: number; on: boolean; at: number }
interface PendingVehicleAction { characterId: number; vehicleId?: number; modelCode?: string; at: number }

const pending = {
  kicks: [] as Array<{ characterId: number; reason: string; at: number }>,
  teleports: [] as Array<{ characterId: number; x: number; y: number; z: number; heading: number; at: number }>,
  heals: [] as Array<{ characterId: number; health: number; armor: number; at: number }>,
  freezes: [] as PendingFlag[],
  godmodes: [] as PendingFlag[],
  invisible: [] as PendingFlag[],
  fly: [] as PendingFlag[],
  noclip: [] as PendingFlag[],
  esp: [] as PendingFlag[],
  mutes: [] as PendingFlag[],
  weapons: [] as Array<{ characterId: number; weaponCode: string; ammo: number; at: number }>,
  vehicleSpawn: [] as PendingVehicleAction[],
  vehicleRepair: [] as PendingVehicleAction[],
  vehicleDelete: [] as PendingVehicleAction[],
  vehicleRespawn: [] as PendingVehicleAction[],
  announcements: [] as Array<{ message: string; kind: string; at: number }>,
  spectate: [] as Array<{ adminCharacterId: number; targetCharacterId: number | null; on: boolean; at: number }>,
  prison: [] as Array<{ characterId: number; minutes: number; reason: string; on: boolean; at: number }>,
  giveLevel: [] as Array<{ characterId: number; level: number; at: number }>,
  factionRemove: [] as Array<{ characterId: number; at: number }>
};

adminRouter.get("/pending", async (req, res) => {
  const ctx = await loadAdminContext(req);
  if (!ctx || !ctx.byToken) return res.status(403).json({ message: "Forbidden" });
  // Drain all queues atomically.
  const drained: Record<string, unknown> = {};
  for (const key of Object.keys(pending) as Array<keyof typeof pending>) {
    drained[key] = (pending[key] as unknown[]).splice(0);
  }
  return res.json(drained);
});

adminRouter.post("/kick", requireLevel(1), async (req, res) => {
  const parsed = kickSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  pending.kicks.push({ characterId: parsed.data.characterId, reason: parsed.data.reason, at: Date.now() });
  await audit(req.admin!.characterId, parsed.data.characterId, "kick", parsed.data.reason);
  return res.json({ ok: true });
});

adminRouter.post("/teleport", requireLevel(2), async (req, res) => {
  const parsed = teleportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  pending.teleports.push({ ...parsed.data, at: Date.now() });
  await audit(req.admin!.characterId, parsed.data.characterId, "teleport", `${parsed.data.x.toFixed(1)},${parsed.data.y.toFixed(1)},${parsed.data.z.toFixed(1)}`);
  return res.json({ ok: true });
});

adminRouter.post("/heal", requireLevel(2), async (req, res) => {
  const parsed = healSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  pending.heals.push({ ...parsed.data, at: Date.now() });
  await pool.query(
    `INSERT INTO character_stats (character_id, health, armor)
     VALUES ($1, $2, $3)
     ON CONFLICT (character_id) DO UPDATE SET health = EXCLUDED.health, armor = EXCLUDED.armor`,
    [parsed.data.characterId, parsed.data.health, parsed.data.armor]
  );
  await audit(req.admin!.characterId, parsed.data.characterId, "heal", `${parsed.data.health}/${parsed.data.armor}`);
  return res.json({ ok: true });
});

adminRouter.post("/ban", requireLevel(3), async (req, res) => {
  const parsed = banSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  let userId = parsed.data.userId;
  if (!userId && parsed.data.characterId) {
    const r = await pool.query<{ user_id: number }>(`SELECT user_id FROM characters WHERE id = $1`, [parsed.data.characterId]);
    if (r.rowCount === 0) return res.status(404).json({ message: "Character not found" });
    userId = r.rows[0].user_id;
  }
  if (!userId) return res.status(400).json({ message: "userId or characterId required" });

  const banType = (req.body?.banType as string) || "temp";
  const isHard = banType === "hard" || parsed.data.permanent;
  const isDemorgan = banType === "demorgan";
  const hours = parsed.data.hours || 0;

  // Hard ban: permanent forever, no expiry
  // De Morgan: time flows 10x slower (1 real sec = 0.1 ban sec)
  const expiresAt = isHard ? null : new Date(Date.now() + hours * 3600_000);

  const banResult = await pool.query<{ id: number }>(
    `INSERT INTO bans (user_id, reason, banned_by, expires_at, permanent, ban_type, demorgan_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [userId, parsed.data.reason, req.admin?.userId ?? null, expiresAt, isHard, banType, isDemorgan ? hours * 60 : null]
  );

  if (isDemorgan) {
    await pool.query(
      `INSERT INTO demorgan_tracking (ban_id, user_id, remaining_minutes)
       VALUES ($1, $2, $3)`,
      [banResult.rows[0].id, userId, hours * 60]
    );
  }

  await audit(req.admin!.characterId, parsed.data.characterId ?? null, "ban", `${banType} ${hours}h ${parsed.data.reason}`);
  // Also enqueue a kick
  if (parsed.data.characterId) pending.kicks.push({ characterId: parsed.data.characterId, reason: `Banned (${banType}): ${parsed.data.reason}`, at: Date.now() });
  return res.json({ ok: true, banType, permanent: isHard });
});

adminRouter.post("/set-admin-level", requireLevel(5), async (req, res) => {
  const parsed = setAdminLevelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(`UPDATE users SET admin_level = $1 WHERE id = $2`, [parsed.data.level, parsed.data.userId]);
  await audit(req.admin!.characterId, null, "set_admin_level", `user=${parsed.data.userId} lvl=${parsed.data.level}`);
  return res.json({ ok: true });
});

adminRouter.post("/give-money", requireLevel(3), async (req, res) => {
  const parsed = giveMoneySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const field = parsed.data.to === "cash" ? "money_cash" : "money_bank";
  await pool.query(`UPDATE characters SET ${field} = ${field} + $1 WHERE id = $2`, [parsed.data.amount, parsed.data.characterId]);
  await pool.query(`INSERT INTO economy_logs (character_id, action, amount) VALUES ($1, $2, $3)`, [parsed.data.characterId, `admin_give_${parsed.data.to}`, parsed.data.amount]);
  await audit(req.admin!.characterId, parsed.data.characterId, "give_money", `${parsed.data.to} +${parsed.data.amount}`);
  return res.status(201).json({ ok: true });
});

adminRouter.post("/set-money", requireLevel(3), async (req, res) => {
  const parsed = setMoneySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  if (parsed.data.cash !== undefined) await pool.query(`UPDATE characters SET money_cash = $1 WHERE id = $2`, [parsed.data.cash, parsed.data.characterId]);
  if (parsed.data.bank !== undefined) await pool.query(`UPDATE characters SET money_bank = $1 WHERE id = $2`, [parsed.data.bank, parsed.data.characterId]);
  await audit(req.admin!.characterId, parsed.data.characterId, "set_money", `cash=${parsed.data.cash ?? "-"} bank=${parsed.data.bank ?? "-"}`);
  return res.json({ ok: true });
});

adminRouter.post("/give-vehicle", requireLevel(4), async (req, res) => {
  const parsed = giveVehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const plate = `ADM-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const ownershipId = `VEH-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const v = await pool.query<{ id: number }>(
    `INSERT INTO vehicles (character_id, model_code, plate, ownership_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [parsed.data.characterId, parsed.data.modelCode, plate, ownershipId]
  );
  await pool.query(
    `INSERT INTO vehicle_keys (vehicle_id, owner_character_id, granted_by_character_id)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [v.rows[0].id, parsed.data.characterId, req.admin!.characterId]
  );
  await audit(req.admin!.characterId, parsed.data.characterId, "give_vehicle", parsed.data.modelCode);
  return res.status(201).json({ ok: true, vehicleId: v.rows[0].id, plate, ownershipId });
});

adminRouter.post("/factions", requireLevel(4), async (req, res) => {
  const parsed = createFactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  try {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO factions (name, type, invite_code) VALUES ($1, $2, $3) RETURNING id`,
      [parsed.data.name, parsed.data.type, parsed.data.inviteCode]
    );
    await audit(req.admin!.characterId, null, "create_faction", parsed.data.name);
    return res.status(201).json({ id: result.rows[0].id });
  } catch {
    return res.status(409).json({ message: "Faction already exists or invite code is not unique" });
  }
});

adminRouter.post("/factions/member", requireLevel(3), async (req, res) => {
  const parsed = addFactionMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  try {
    await pool.query(
      `INSERT INTO faction_members (faction_id, character_id, rank_code, is_leader, on_duty)
       VALUES ($1, $2, $3, $4, FALSE)`,
      [parsed.data.factionId, parsed.data.characterId, parsed.data.rankCode, parsed.data.isLeader]
    );
    await audit(req.admin!.characterId, parsed.data.characterId, "faction_join", `f=${parsed.data.factionId} rank=${parsed.data.rankCode}`);
    return res.status(201).json({ ok: true });
  } catch {
    return res.status(409).json({ message: "Character is already in faction or invalid faction" });
  }
});

adminRouter.post("/factions/vehicle", requireLevel(4), async (req, res) => {
  const parsed = addFactionVehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  try {
    const result = await pool.query<{ id: number }>(
      `INSERT INTO faction_vehicles (faction_id, model_code, plate, min_rank_code) VALUES ($1, $2, $3, $4) RETURNING id`,
      [parsed.data.factionId, parsed.data.modelCode, parsed.data.plate, parsed.data.minRankCode]
    );
    return res.status(201).json({ id: result.rows[0].id });
  } catch {
    return res.status(409).json({ message: "Vehicle plate already exists or faction invalid" });
  }
});

adminRouter.post("/factions/rank", requireLevel(4), async (req, res) => {
  const parsed = upsertFactionRankSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(
    `INSERT INTO faction_ranks
       (faction_id, rank_code, rank_weight, can_invite, can_manage_treasury, can_issue_wanted, can_arrest, can_manage_vehicles, can_capture_territory)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (faction_id, rank_code)
     DO UPDATE SET
       rank_weight = EXCLUDED.rank_weight,
       can_invite = EXCLUDED.can_invite,
       can_manage_treasury = EXCLUDED.can_manage_treasury,
       can_issue_wanted = EXCLUDED.can_issue_wanted,
       can_arrest = EXCLUDED.can_arrest,
       can_manage_vehicles = EXCLUDED.can_manage_vehicles,
       can_capture_territory = EXCLUDED.can_capture_territory`,
    [
      parsed.data.factionId,
      parsed.data.rankCode,
      parsed.data.rankWeight,
      parsed.data.canInvite,
      parsed.data.canManageTreasury,
      parsed.data.canIssueWanted,
      parsed.data.canArrest,
      parsed.data.canManageVehicles,
      parsed.data.canCaptureTerritory
    ]
  );
  return res.status(201).json({ ok: true });
});

adminRouter.post("/vehicles/catalog/bulk", requireLevel(4), async (req, res) => {
  const parsed = bulkCatalogSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (parsed.data.replaceAll) await client.query(`DELETE FROM vehicle_catalog_custom`);
    for (const item of parsed.data.items) {
      await client.query(
        `INSERT INTO vehicle_catalog_custom (model_code, data, enabled, updated_at)
         VALUES ($1, $2::jsonb, TRUE, NOW())
         ON CONFLICT (model_code)
         DO UPDATE SET data = EXCLUDED.data, enabled = TRUE, updated_at = NOW()`,
        [item.modelCode, JSON.stringify(item)]
      );
    }
    await client.query("COMMIT");
    return res.status(201).json({ ok: true, upserted: parsed.data.items.length });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Catalog bulk import failed" });
  } finally {
    client.release();
  }
});

// =============================================================================
// Extended admin features
// =============================================================================

const flagSchema = z.object({ characterId: z.number().int().positive(), on: z.boolean() });
const muteSchema = z.object({ characterId: z.number().int().positive(), minutes: z.number().int().min(0).max(1440).default(60), reason: z.string().max(200).default("") });
const announceSchema = z.object({ message: z.string().min(1).max(500), kind: z.enum(["info", "warning", "error", "success"]).default("info") });
const giveWeaponSchema = z.object({ characterId: z.number().int().positive(), weaponCode: z.string().min(2).max(64), ammo: z.number().int().min(0).max(99999).default(120) });
const unbanSchema = z.object({ userId: z.number().int().positive() });
const vehicleByIdSchema = z.object({ vehicleId: z.number().int().positive() });
const setNameSchema = z.object({ characterId: z.number().int().positive(), firstName: z.string().min(2).max(24), lastName: z.string().min(2).max(24) });
const clearInvSchema = z.object({ characterId: z.number().int().positive() });

function enqueueFlag(queue: { characterId: number; on: boolean; at: number }[], data: { characterId: number; on: boolean }): void {
  queue.push({ ...data, at: Date.now() });
}

// ---- Bans management ----
adminRouter.get("/bans", requireLevel(1), async (_req, res) => {
  const rows = await pool.query(
    `SELECT b.id, b.user_id, b.reason, b.permanent, b.expires_at, b.created_at,
            u.email,
            (SELECT first_name || ' ' || last_name FROM characters
              WHERE user_id = b.user_id ORDER BY id DESC LIMIT 1) AS character_name,
            (SELECT first_name || ' ' || last_name FROM characters
              WHERE user_id = b.banned_by ORDER BY id DESC LIMIT 1) AS banned_by_name
       FROM bans b
       LEFT JOIN users u ON u.id = b.user_id
      WHERE b.permanent OR b.expires_at IS NULL OR b.expires_at > NOW()
      ORDER BY b.created_at DESC LIMIT 200`
  );
  return res.json({ bans: rows.rows });
});

adminRouter.post("/unban", requireLevel(3), async (req, res) => {
  const parsed = unbanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });
  const r = await pool.query(`DELETE FROM bans WHERE user_id = $1`, [parsed.data.userId]);
  await audit(req.admin!.characterId, null, "unban", `user=${parsed.data.userId} removed=${r.rowCount}`);
  return res.json({ ok: true, removed: r.rowCount });
});

// ---- Player runtime flags (forwarded to RAGE MP bridge) ----
adminRouter.post("/freeze", requireLevel(2), async (req, res) => {
  const p = flagSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  enqueueFlag(pending.freezes, p.data);
  await audit(req.admin!.characterId, p.data.characterId, p.data.on ? "freeze" : "unfreeze");
  return res.json({ ok: true });
});

adminRouter.post("/godmode", requireLevel(3), async (req, res) => {
  const p = flagSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  enqueueFlag(pending.godmodes, p.data);
  await audit(req.admin!.characterId, p.data.characterId, p.data.on ? "god_on" : "god_off");
  return res.json({ ok: true });
});

adminRouter.post("/invisible", requireLevel(2), async (req, res) => {
  const p = flagSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  enqueueFlag(pending.invisible, p.data);
  await audit(req.admin!.characterId, p.data.characterId, p.data.on ? "invis_on" : "invis_off");
  return res.json({ ok: true });
});

adminRouter.post("/fly", requireLevel(3), async (req, res) => {
  const p = flagSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  enqueueFlag(pending.fly, p.data);
  await audit(req.admin!.characterId, p.data.characterId, p.data.on ? "fly_on" : "fly_off");
  return res.json({ ok: true });
});

adminRouter.post("/esp", requireLevel(1), async (req, res) => {
  const p = flagSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  enqueueFlag(pending.esp, p.data);
  await audit(req.admin!.characterId, p.data.characterId, p.data.on ? "esp_on" : "esp_off");
  return res.json({ ok: true });
});

// ---- Mute (chat) ----
adminRouter.post("/mute", requireLevel(2), async (req, res) => {
  const p = muteSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  // Persist a record in admin_logs (lightweight) and propagate runtime flag.
  enqueueFlag(pending.mutes, { characterId: p.data.characterId, on: true });
  await audit(req.admin!.characterId, p.data.characterId, "mute", `${p.data.minutes}m ${p.data.reason}`);
  return res.json({ ok: true });
});

adminRouter.post("/unmute", requireLevel(2), async (req, res) => {
  const p = z.object({ characterId: z.number().int().positive() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  enqueueFlag(pending.mutes, { characterId: p.data.characterId, on: false });
  await audit(req.admin!.characterId, p.data.characterId, "unmute");
  return res.json({ ok: true });
});

// ---- Weapons ----
adminRouter.post("/give-weapon", requireLevel(3), async (req, res) => {
  const p = giveWeaponSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(
    `INSERT INTO character_weapons (character_id, weapon_code, ammo)
     VALUES ($1, $2, $3)
     ON CONFLICT (character_id, weapon_code) DO UPDATE SET ammo = character_weapons.ammo + EXCLUDED.ammo`,
    [p.data.characterId, p.data.weaponCode, p.data.ammo]
  );
  pending.weapons.push({ ...p.data, at: Date.now() });
  await audit(req.admin!.characterId, p.data.characterId, "give_weapon", `${p.data.weaponCode} x${p.data.ammo}`);
  return res.json({ ok: true });
});

// ---- Vehicle management ----
adminRouter.post("/vehicle/repair", requireLevel(2), async (req, res) => {
  const p = vehicleByIdSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(`UPDATE vehicles SET fuel = 100 WHERE id = $1`, [p.data.vehicleId]);
  pending.vehicleRepair.push({ characterId: 0, vehicleId: p.data.vehicleId, at: Date.now() });
  await audit(req.admin!.characterId, null, "vehicle_repair", `veh=${p.data.vehicleId}`);
  return res.json({ ok: true });
});

adminRouter.post("/vehicle/respawn", requireLevel(2), async (req, res) => {
  const p = vehicleByIdSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  pending.vehicleRespawn.push({ characterId: 0, vehicleId: p.data.vehicleId, at: Date.now() });
  await audit(req.admin!.characterId, null, "vehicle_respawn", `veh=${p.data.vehicleId}`);
  return res.json({ ok: true });
});

adminRouter.post("/vehicle/delete", requireLevel(3), async (req, res) => {
  const p = vehicleByIdSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(`DELETE FROM vehicles WHERE id = $1`, [p.data.vehicleId]);
  pending.vehicleDelete.push({ characterId: 0, vehicleId: p.data.vehicleId, at: Date.now() });
  await audit(req.admin!.characterId, null, "vehicle_delete", `veh=${p.data.vehicleId}`);
  return res.json({ ok: true });
});

// ---- Announcement (global) ----
adminRouter.post("/announce", requireLevel(3), async (req, res) => {
  const p = announceSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  pending.announcements.push({ ...p.data, at: Date.now() });
  await audit(req.admin!.characterId, null, "announce", p.data.message);
  return res.json({ ok: true });
});

// ---- Profile editing ----
adminRouter.post("/set-name", requireLevel(5), async (req, res) => {
  const p = setNameSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(`UPDATE characters SET first_name = $1, last_name = $2 WHERE id = $3`, [
    p.data.firstName,
    p.data.lastName,
    p.data.characterId
  ]);
  await audit(req.admin!.characterId, p.data.characterId, "set_name", `${p.data.firstName} ${p.data.lastName}`);
  return res.json({ ok: true });
});

adminRouter.post("/clear-inventory", requireLevel(4), async (req, res) => {
  const p = clearInvSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(`DELETE FROM inventory_items WHERE character_id = $1`, [p.data.characterId]);
  await pool.query(`DELETE FROM inventory_slots WHERE character_id = $1`, [p.data.characterId]);
  await audit(req.admin!.characterId, p.data.characterId, "clear_inv");
  return res.json({ ok: true });
});

// ---- Online players (the RAGE MP bridge pushes its current roster here) ----
let lastOnlineRoster: Array<{ playerId: number; characterId: number; characterName: string; adminLevel: number; ping: number }> = [];
let lastRosterUpdate = 0;

adminRouter.post("/online", async (req, res) => {
  const ctx = await loadAdminContext(req);
  if (!ctx || !ctx.byToken) return res.status(403).json({ message: "Forbidden" });
  const body = (req.body ?? {}) as { players?: typeof lastOnlineRoster };
  lastOnlineRoster = Array.isArray(body.players) ? body.players : [];
  lastRosterUpdate = Date.now();
  return res.json({ ok: true });
});

adminRouter.get("/online", requireLevel(1), async (_req, res) => {
  return res.json({ players: lastOnlineRoster, updatedAt: lastRosterUpdate });
});

// ---- Noclip ----
adminRouter.post("/noclip", requireLevel(3), async (req, res) => {
  const p = flagSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  enqueueFlag(pending.noclip, p.data);
  await audit(req.admin!.characterId, p.data.characterId, p.data.on ? "noclip_on" : "noclip_off");
  return res.json({ ok: true });
});

// ---- Spectate ----
const spectateSchema = z.object({ adminCharacterId: z.number().int().positive(), targetCharacterId: z.number().int().positive().nullable().default(null), on: z.boolean() });
adminRouter.post("/spectate", requireLevel(2), async (req, res) => {
  const p = spectateSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  pending.spectate.push({ ...p.data, at: Date.now() });
  await pool.query(
    `INSERT INTO admin_spectate_logs (admin_character_id, target_character_id, action) VALUES ($1, $2, $3)`,
    [p.data.adminCharacterId, p.data.targetCharacterId ?? null, p.data.on ? "start" : "stop"]
  );
  await audit(req.admin!.characterId, p.data.targetCharacterId ?? null, p.data.on ? "spectate_on" : "spectate_off");
  return res.json({ ok: true });
});

// ---- Prison (in-game jail / demorgan) ----
const prisonSchema = z.object({ characterId: z.number().int().positive(), minutes: z.number().int().min(1).max(120), reason: z.string().min(1).max(200), on: z.boolean().default(true) });
adminRouter.post("/prison", requireLevel(2), async (req, res) => {
  const p = prisonSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  if (p.data.on) {
    await pool.query(
      `INSERT INTO prison_records (character_id, reason, minutes, active) VALUES ($1, $2, $3, TRUE)`,
      [p.data.characterId, p.data.reason, p.data.minutes]
    );
  } else {
    await pool.query(
      `UPDATE prison_records SET active = FALSE, released_at = NOW() WHERE character_id = $1 AND active = TRUE`,
      [p.data.characterId]
    );
  }
  pending.prison.push({ ...p.data, at: Date.now() });
  await audit(req.admin!.characterId, p.data.characterId, p.data.on ? "prison" : "release", `${p.data.minutes}m ${p.data.reason}`);
  return res.json({ ok: true });
});

// ---- Give Level (RP level / exp) ----
const giveLevelSchema = z.object({ characterId: z.number().int().positive(), level: z.number().int().min(1).max(100) });
adminRouter.post("/give-level", requireLevel(3), async (req, res) => {
  const p = giveLevelSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(`UPDATE characters SET level = $1 WHERE id = $2`, [p.data.level, p.data.characterId]);
  pending.giveLevel.push({ ...p.data, at: Date.now() });
  await audit(req.admin!.characterId, p.data.characterId, "give_level", `lvl=${p.data.level}`);
  return res.json({ ok: true });
});

// ---- Faction Remove ----
const factionRemoveSchema = z.object({ characterId: z.number().int().positive() });
adminRouter.post("/faction-remove", requireLevel(3), async (req, res) => {
  const p = factionRemoveSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  await pool.query(`DELETE FROM faction_members WHERE character_id = $1`, [p.data.characterId]);
  pending.factionRemove.push({ ...p.data, at: Date.now() });
  await audit(req.admin!.characterId, p.data.characterId, "faction_remove");
  return res.json({ ok: true });
});

// ---- TP Map (teleport to coordinates) ----
const tpMapSchema = z.object({ characterId: z.number().int().positive(), x: z.number(), y: z.number(), z: z.number(), heading: z.number().default(0) });
adminRouter.post("/tp-map", requireLevel(2), async (req, res) => {
  const p = tpMapSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Invalid payload" });
  pending.teleports.push({ ...p.data, at: Date.now() });
  await pool.query(
    `INSERT INTO admin_spectate_logs (admin_character_id, action, x, y, z) VALUES ($1, $2, $3, $4, $5)`,
    [req.admin!.characterId ?? null, "tp_map", p.data.x, p.data.y, p.data.z]
  );
  await audit(req.admin!.characterId, p.data.characterId, "tp_map", `${p.data.x.toFixed(1)},${p.data.y.toFixed(1)},${p.data.z.toFixed(1)}`);
  return res.json({ ok: true });
});

// ---- TP Report (teleport admin to report reporter or target) ----
adminRouter.post("/tp-report", requireLevel(2), async (req, res) => {
  const reportId = z.number().int().positive().safeParse(req.body?.reportId);
  if (!reportId.success) return res.status(400).json({ message: "reportId required" });
  const r = await pool.query(
    `SELECT reporter_character_id, target_character_id FROM reports WHERE id = $1`,
    [reportId.data]
  );
  if (r.rowCount === 0) return res.status(404).json({ message: "Report not found" });
  const row = r.rows[0];
  const targetCharacterId = (req.body?.toTarget ? row.target_character_id : row.reporter_character_id) as number;
  if (!targetCharacterId) return res.status(404).json({ message: "No character to teleport to" });
  pending.teleports.push({ characterId: targetCharacterId, x: 0, y: 0, z: 0, heading: 0, at: Date.now() });
  await audit(req.admin!.characterId, targetCharacterId, "tp_report", `report=${reportId.data}`);
  return res.json({ ok: true, targetCharacterId });
});

// ---- TP Vehicle (teleport admin to vehicle by ownership_id) ----
adminRouter.post("/tp-vehicle", requireLevel(2), async (req, res) => {
  const oid = z.string().min(1).max(64).safeParse(req.body?.ownershipId);
  if (!oid.success) return res.status(400).json({ message: "ownershipId required" });
  const v = await pool.query<{ pos_x: number; pos_y: number; pos_z: number; character_id: number }>(
    `SELECT pos_x, pos_y, pos_z, character_id FROM vehicles WHERE ownership_id = $1`,
    [oid.data]
  );
  if (v.rowCount === 0) return res.status(404).json({ message: "Vehicle not found" });
  const row = v.rows[0];
  pending.teleports.push({
    characterId: req.admin!.characterId ?? 0,
    x: row.pos_x ?? 0,
    y: row.pos_y ?? 0,
    z: (row.pos_z ?? 0) + 2,
    heading: 0,
    at: Date.now()
  });
  await audit(req.admin!.characterId, null, "tp_vehicle", `oid=${oid.data}`);
  return res.json({ ok: true, pos: { x: row.pos_x, y: row.pos_y, z: row.pos_z } });
});

// ---- Check ban status (used by auth on login) ----
adminRouter.get("/check-ban/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID" });

  const ban = await pool.query(
    `SELECT id, reason, permanent, ban_type, demorgan_minutes, created_at
     FROM bans
     WHERE user_id = $1
       AND (permanent = TRUE OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (ban.rowCount === 0) return res.json({ banned: false });

  const row = ban.rows[0];
  let remainingText = "";
  let remainingMinutes = 0;

  if (row.ban_type === "demorgan" && row.demorgan_minutes) {
    // Compute remaining with 10x slowdown
    const track = await pool.query(
      `SELECT issued_at, remaining_minutes FROM demorgan_tracking WHERE ban_id = $1`,
      [row.id]
    );
    if (track.rowCount && track.rowCount > 0) {
      const elapsedSec = (Date.now() - new Date(track.rows[0].issued_at).getTime()) / 1000;
      const consumedMinutes = elapsedSec / 600; // 1 ban minute = 600 real seconds (10x slower)
      remainingMinutes = Math.max(0, Math.ceil(row.demorgan_minutes - consumedMinutes));
      const remainingHours = Math.floor(remainingMinutes / 60);
      const remMin = remainingMinutes % 60;
      remainingText = `${remainingHours}ч ${remMin}м (De Morgan)`;
    }
  }

  return res.json({
    banned: true,
    reason: row.reason,
    permanent: row.permanent,
    banType: row.ban_type,
    remainingText,
    remainingMinutes
  });
});
