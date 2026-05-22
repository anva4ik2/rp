import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const startJobSchema = z.object({
  jobCode: z.enum(["courier", "miner", "taxi", "medic", "mechanic", "tow", "trucker", "security", "garbage", "bus", "postman", "farmer", "fisherman", "lumberjack", "pizza", "waiter", "bartender", "warehouse", "construction", "fuel", "janitor"])
});

const completeJobSchema = z.object({
  jobCode: z.enum(["courier", "miner", "taxi", "medic", "mechanic", "tow", "trucker", "security", "garbage", "bus", "postman", "farmer", "fisherman", "lumberjack", "pizza", "waiter", "bartender", "warehouse", "construction", "fuel", "janitor"]),
  distanceMeters: z.number().int().min(100).max(20000)
});

const payoutByJob: Record<"courier" | "miner" | "taxi" | "medic" | "mechanic" | "tow" | "trucker" | "security" | "garbage" | "bus" | "postman" | "farmer" | "fisherman" | "lumberjack" | "pizza" | "waiter" | "bartender" | "warehouse" | "construction" | "fuel" | "janitor", number> = {
  courier: 250,
  miner: 320,
  taxi: 280,
  medic: 360,
  mechanic: 330,
  tow: 300,
  trucker: 450,
  security: 500,
  garbage: 280,
  bus: 350,
  postman: 220,
  farmer: 300,
  fisherman: 280,
  lumberjack: 340,
  pizza: 260,
  waiter: 240,
  bartender: 270,
  warehouse: 320,
  construction: 380,
  fuel: 310,
  janitor: 230
};

export const jobsRouter = Router();

jobsRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const jobs = await pool.query<{
    job_code: string;
    level: number;
    xp: number;
    active: boolean;
  }>(`SELECT job_code, level, xp, active FROM character_jobs WHERE character_id = $1`, [characterId]);

  return res.json({
    jobs: jobs.rows.map((job) => ({
      jobCode: job.job_code,
      level: job.level,
      xp: job.xp,
      active: job.active
    }))
  });
});

jobsRouter.post("/start", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = startJobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const cooldown = await pool.query<{ cooldown_until: string | null }>(
    `SELECT cooldown_until FROM character_jobs WHERE character_id = $1 AND job_code = $2`,
    [characterId, parsed.data.jobCode]
  );
  if ((cooldown.rowCount ?? 0) > 0 && cooldown.rows[0].cooldown_until) {
    const until = new Date(cooldown.rows[0].cooldown_until).getTime();
    if (until > Date.now()) return res.status(429).json({ message: "Job cooldown active" });
  }

  await pool.query(`UPDATE character_jobs SET active = FALSE WHERE character_id = $1`, [characterId]);
  await pool.query(
    `INSERT INTO character_jobs (character_id, job_code, active, updated_at)
     VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP)
     ON CONFLICT (character_id, job_code)
     DO UPDATE SET active = TRUE, updated_at = CURRENT_TIMESTAMP`,
    [characterId, parsed.data.jobCode]
  );

  return res.json({ ok: true });
});

jobsRouter.post("/complete", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = completeJobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const jobState = await pool.query<{ active: boolean }>(
    `SELECT active FROM character_jobs WHERE character_id = $1 AND job_code = $2`,
    [characterId, parsed.data.jobCode]
  );
  if (jobState.rowCount === 0 || !jobState.rows[0].active) {
    return res.status(400).json({ message: "Job is not active" });
  }

  const xpGain = Math.max(10, Math.floor(parsed.data.distanceMeters / 100));
  const basePayout = payoutByJob[parsed.data.jobCode];
  const salary = basePayout + Math.floor(parsed.data.distanceMeters / 25) + Math.floor(xpGain / 2);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE character_jobs
          SET xp = xp + $1,
              level = CASE WHEN xp + $1 >= level * 100 THEN level + 1 ELSE level END,
              active = FALSE,
              cooldown_until = NOW() + INTERVAL '30 seconds',
              updated_at = CURRENT_TIMESTAMP
        WHERE character_id = $2 AND job_code = $3`,
      [xpGain, characterId, parsed.data.jobCode]
    );
    await client.query(
      `UPDATE characters SET money_bank = money_bank + $1 WHERE id = $2`,
      [salary, characterId]
    );
    await client.query(
      `INSERT INTO economy_logs (character_id, action, amount) VALUES ($1, $2, $3)`,
      [characterId, `job_${parsed.data.jobCode}`, salary]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to complete job" });
  } finally {
    client.release();
  }

  return res.json({
    ok: true,
    payout: salary,
    xpGain
  });
});
