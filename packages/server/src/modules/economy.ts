import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";

const salarySchema = z.object({
  characterId: z.number().int().positive(),
  amount: z.number().int().positive().max(100000)
});

export const economyRouter = Router();

economyRouter.post("/salary", async (req, res) => {
  const parsed = salarySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE characters
         SET money_bank = money_bank + $1
       WHERE id = $2`,
      [parsed.data.amount, parsed.data.characterId]
    );
    await client.query(
      `INSERT INTO economy_logs (character_id, action, amount)
       VALUES ($1, $2, $3)`,
      [parsed.data.characterId, "salary", parsed.data.amount]
    );
    await client.query("COMMIT");
    return res.status(201).json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Salary transaction failed" });
  } finally {
    client.release();
  }
});
