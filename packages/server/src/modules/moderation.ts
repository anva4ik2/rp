import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const createReportSchema = z.object({
  targetCharacterId: z.number().int().positive().optional(),
  reason: z.string().min(5).max(500)
});

const updateReportSchema = z.object({
  status: z.enum(["pending", "in_progress", "resolved", "rejected"]),
  response: z.string().max(1000).optional()
});

const banSchema = z.object({
  targetUserId: z.number().int().positive(),
  reason: z.string().min(5).max(500),
  permanent: z.boolean().optional(),
  durationHours: z.number().int().min(1).max(8760).optional()
});

export const moderationRouter = Router();

// Create report
moderationRouter.post("/reports", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = createReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const result = await pool.query(
    `INSERT INTO reports (reporter_character_id, target_character_id, reason, status, created_at)
     VALUES ($1, $2, $3, 'pending', NOW())
     RETURNING id, created_at`,
    [characterId, parsed.data.targetCharacterId || null, parsed.data.reason]
  );

  return res.status(201).json({
    ok: true,
    report: {
      id: result.rows[0].id,
      reason: parsed.data.reason,
      status: "pending",
      createdAt: result.rows[0].created_at
    }
  });
});

// Get all reports (admin)
moderationRouter.get("/reports", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;

  let query = `
    SELECT r.id, r.status, r.reason, r.response, r.created_at, r.resolved_at,
           rc.first_name as reporter_first_name, rc.last_name as reporter_last_name,
           tc.first_name as target_first_name, tc.last_name as target_last_name,
           ac.first_name as admin_first_name, ac.last_name as admin_last_name
    FROM reports r
    LEFT JOIN characters rc ON r.reporter_character_id = rc.id
    LEFT JOIN characters tc ON r.target_character_id = tc.id
    LEFT JOIN characters ac ON r.admin_character_id = ac.id
  `;
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (statusFilter) {
    query += ` WHERE r.status = $${paramIndex}`;
    params.push(statusFilter);
    paramIndex++;
  }

  query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const reports = await pool.query(query, params);

  return res.json({
    reports: reports.rows.map(row => ({
      id: row.id,
      status: row.status,
      reason: row.reason,
      response: row.response,
      reporter: row.reporter_first_name ? `${row.reporter_first_name} ${row.reporter_last_name}` : null,
      target: row.target_first_name ? `${row.target_first_name} ${row.target_last_name}` : null,
      admin: row.admin_first_name ? `${row.admin_first_name} ${row.admin_last_name}` : null,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at
    }))
  });
});

// Get my reports
moderationRouter.get("/reports/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const reports = await pool.query(
    `SELECT id, status, reason, response, created_at, resolved_at
     FROM reports
     WHERE reporter_character_id = $1
     ORDER BY created_at DESC`,
    [characterId]
  );

  return res.json({
    reports: reports.rows.map(row => ({
      id: row.id,
      status: row.status,
      reason: row.reason,
      response: row.response,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at
    }))
  });
});

// Update report (admin)
moderationRouter.put("/reports/:id", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const adminCharacterId = await getCharacterIdByUserId(userId);
  if (!adminCharacterId) return res.status(404).json({ message: "Character not found" });

  const parsed = updateReportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const reportId = parseInt(req.params.id, 10);
  if (isNaN(reportId)) return res.status(400).json({ message: "Invalid report ID" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE reports SET status = $1, response = $2, admin_character_id = $3
       WHERE id = $4`,
      [parsed.data.status, parsed.data.response || null, adminCharacterId, reportId]
    );

    if (parsed.data.status === "resolved" || parsed.data.status === "rejected") {
      await client.query(
        `UPDATE reports SET resolved_at = NOW() WHERE id = $1`,
        [reportId]
      );
    }

    await client.query("COMMIT");

    return res.json({ ok: true });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to update report" });
  } finally {
    client.release();
  }
});

// Ban user (admin)
moderationRouter.post("/ban", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const parsed = banSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const banType = (req.body?.banType as string) || "temp";
  const isHard = banType === "hard" || parsed.data.permanent;
  const isDemorgan = banType === "demorgan";
  const hours = parsed.data.durationHours || 0;
  const expiresAt = isHard ? null : new Date(Date.now() + hours * 3600_000);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const banResult = await client.query<{ id: number }>(
      `INSERT INTO bans (user_id, reason, banned_by, expires_at, permanent, ban_type, demorgan_minutes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id`,
      [parsed.data.targetUserId, parsed.data.reason, userId, expiresAt, isHard, banType, isDemorgan ? hours * 60 : null]
    );

    if (isDemorgan) {
      await client.query(
        `INSERT INTO demorgan_tracking (ban_id, user_id, remaining_minutes)
         VALUES ($1, $2, $3)`,
        [banResult.rows[0].id, parsed.data.targetUserId, hours * 60]
      );
    }

    await client.query("COMMIT");

    return res.json({ ok: true, banType, permanent: isHard, expiresAt });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to ban user" });
  } finally {
    client.release();
  }
});

// Check if user is banned
moderationRouter.get("/check-ban/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (isNaN(userId)) return res.status(400).json({ message: "Invalid user ID" });

  const ban = await pool.query(
    `SELECT id, reason, expires_at, permanent, ban_type, demorgan_minutes, created_at
     FROM bans
     WHERE user_id = $1
       AND (permanent = TRUE OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  if (ban.rowCount === 0) {
    return res.json({ banned: false });
  }

  const row = ban.rows[0];
  let remainingText = "";
  let remainingMinutes = 0;

  if (row.ban_type === "demorgan" && row.demorgan_minutes) {
    const track = await pool.query(
      `SELECT issued_at FROM demorgan_tracking WHERE ban_id = $1`,
      [row.id]
    );
    if (track.rowCount && track.rowCount > 0) {
      const elapsedSec = (Date.now() - new Date(track.rows[0].issued_at).getTime()) / 1000;
      const consumedMinutes = elapsedSec / 600;
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
    remainingMinutes,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  });
});

// Get active bans
moderationRouter.get("/bans", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;

  const bans = await pool.query(
    `SELECT b.id, b.user_id, b.reason, b.expires_at, b.permanent, b.ban_type, b.created_at,
            u.email
     FROM bans b
     LEFT JOIN users u ON b.user_id = u.id
     WHERE b.permanent = TRUE OR b.expires_at > NOW()
     ORDER BY b.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return res.json({
    bans: bans.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      reason: row.reason,
      permanent: row.permanent,
      banType: row.ban_type,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    }))
  });
});

// Unban user (admin)
moderationRouter.delete("/ban/:userId", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const targetUserId = parseInt(req.params.userId, 10);
  if (isNaN(targetUserId)) return res.status(400).json({ message: "Invalid user ID" });

  await pool.query(
    `UPDATE bans SET expires_at = NOW() WHERE user_id = $1`,
    [targetUserId]
  );

  return res.json({ ok: true });
});

// Get admin logs
moderationRouter.get("/logs", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;

  const logs = await pool.query(
    `SELECT al.id, al.action, al.details, al.created_at,
            ac.first_name as admin_first_name, ac.last_name as admin_last_name,
            tc.first_name as target_first_name, tc.last_name as target_last_name
     FROM admin_logs al
     LEFT JOIN characters ac ON al.admin_character_id = ac.id
     LEFT JOIN characters tc ON al.target_character_id = tc.id
     ORDER BY al.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return res.json({
    logs: logs.rows.map(row => ({
      id: row.id,
      action: row.action,
      details: row.details,
      admin: row.admin_first_name ? `${row.admin_first_name} ${row.admin_last_name}` : null,
      target: row.target_first_name ? `${row.target_first_name} ${row.target_last_name}` : null,
      createdAt: row.created_at
    }))
  });
});
