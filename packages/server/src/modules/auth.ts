import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import type { LoginPayload, RegisterPayload } from "@gta-rp/shared";
import { config } from "../config.js";
import { pool } from "../db.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const loginSchema = registerSchema;

function signToken(userId: number): string {
  return jwt.sign({ userId }, config.jwtSecret, {
    expiresIn: "7d"
  });
}

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body satisfies RegisterPayload);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const email = parsed.data.email.toLowerCase();
    // Auto-promote configured email to founder (level 5) on first registration.
    const founderEmail = (process.env.BOOTSTRAP_FOUNDER_EMAIL ?? "").toLowerCase();
    const adminLevel = founderEmail && email === founderEmail ? 5 : 0;
    const result = await pool.query<{ id: number; admin_level: number }>(
      `INSERT INTO users (email, password_hash, admin_level)
       VALUES ($1, $2, $3) RETURNING id, admin_level`,
      [email, passwordHash, adminLevel]
    );
    const token = signToken(result.rows[0].id);
    return res.status(201).json({ token, userId: result.rows[0].id, adminLevel: result.rows[0].admin_level });
  } catch (error) {
    return res.status(409).json({ message: "Email already exists" });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body satisfies LoginPayload);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  const userResult = await pool.query<{
    id: number;
    password_hash: string;
    admin_level: number;
  }>(`SELECT id, password_hash, COALESCE(admin_level, 0) AS admin_level FROM users WHERE email = $1`, [
    parsed.data.email.toLowerCase()
  ]);

  if (userResult.rowCount === 0) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const user = userResult.rows[0];
  const passwordOk = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // Reject login if an active ban exists for this user.
  const ban = await pool.query<{ id: number; reason: string; expires_at: string | null; permanent: boolean; ban_type: string; demorgan_minutes: number | null }>(
    `SELECT id, reason, expires_at, permanent, ban_type, demorgan_minutes FROM bans
      WHERE user_id = $1 AND (permanent OR expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  if ((ban.rowCount ?? 0) > 0) {
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
    return res.status(403).json({
      message: `Banned: ${row.reason}`,
      banType: row.ban_type,
      permanent: row.permanent,
      remainingText,
      remainingMinutes
    });
  }

  const token = signToken(user.id);
  return res.json({ token, userId: user.id, adminLevel: user.admin_level });
});
