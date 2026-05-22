import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const transferSchema = z.object({
  toAccountNumber: z.string().min(10).max(20),
  amount: z.number().int().min(1).max(1000000),
  description: z.string().max(200).optional()
});

const createAccountSchema = z.object({
  isPrimary: z.boolean().optional()
});

function generateAccountNumber(): string {
  return "RU" + Math.floor(Math.random() * 10000000000).toString().padStart(10, "0");
}

export const bankRouter = Router();

// Get bank accounts
bankRouter.get("/accounts", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const accounts = await pool.query(
    `SELECT id, account_number, balance, is_primary FROM bank_accounts WHERE character_id = $1`,
    [characterId]
  );

  return res.json({
    accounts: accounts.rows.map(row => ({
      id: row.id,
      accountNumber: row.account_number,
      balance: row.balance,
      isPrimary: row.is_primary
    }))
  });
});

// Create bank account
bankRouter.post("/accounts", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const existingAccounts = await pool.query(
    `SELECT COUNT(*) as count FROM bank_accounts WHERE character_id = $1`,
    [characterId]
  );

  if (existingAccounts.rows[0].count >= 3) {
    return res.status(400).json({ message: "Maximum 3 accounts allowed" });
  }

  const accountNumber = generateAccountNumber();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // If this is primary, unset primary on other accounts
    if (parsed.data.isPrimary) {
      await client.query(
        `UPDATE bank_accounts SET is_primary = FALSE WHERE character_id = $1`,
        [characterId]
      );
    }

    const result = await client.query(
      `INSERT INTO bank_accounts (character_id, account_number, balance, is_primary)
       VALUES ($1, $2, 0, $3)
       RETURNING id, account_number, is_primary`,
      [characterId, accountNumber, parsed.data.isPrimary ?? false]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      account: {
        id: result.rows[0].id,
        accountNumber: result.rows[0].account_number,
        balance: 0,
        isPrimary: result.rows[0].is_primary
      }
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to create account" });
  } finally {
    client.release();
  }
});

// Transfer money
bankRouter.post("/transfer", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Get primary account
  const fromAccount = await pool.query(
    `SELECT id, balance FROM bank_accounts WHERE character_id = $1 AND is_primary = TRUE`,
    [characterId]
  );

  if ((fromAccount.rowCount ?? 0) === 0) {
    return res.status(400).json({ message: "No primary account found" });
  }

  if (fromAccount.rows[0].balance < parsed.data.amount) {
    return res.status(400).json({ message: "Insufficient funds" });
  }

  // Get target account
  const toAccount = await pool.query(
    `SELECT id, character_id FROM bank_accounts WHERE account_number = $1`,
    [parsed.data.toAccountNumber]
  );

  if ((toAccount.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Target account not found" });
  }

  if (toAccount.rows[0].id === fromAccount.rows[0].id) {
    return res.status(400).json({ message: "Cannot transfer to same account" });
  }

  const transferFee = Math.floor(parsed.data.amount * 0.01); // 1% fee
  const totalDeduction = parsed.data.amount + transferFee;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Deduct from sender
    await client.query(
      `UPDATE bank_accounts SET balance = balance - $1 WHERE id = $2`,
      [totalDeduction, fromAccount.rows[0].id]
    );

    // Add to receiver
    await client.query(
      `UPDATE bank_accounts SET balance = balance + $1 WHERE id = $2`,
      [parsed.data.amount, toAccount.rows[0].id]
    );

    // Log transaction
    await client.query(
      `INSERT INTO bank_transactions (from_account_id, to_account_id, amount, description)
       VALUES ($1, $2, $3, $4)`,
      [fromAccount.rows[0].id, toAccount.rows[0].id, parsed.data.amount, parsed.data.description ?? "Transfer"]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      amount: parsed.data.amount,
      fee: transferFee,
      totalDeduction,
      newBalance: fromAccount.rows[0].balance - totalDeduction
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Transfer failed" });
  } finally {
    client.release();
  }
});

// Get transaction history
bankRouter.get("/transactions", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 20;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;

  const transactions = await pool.query(
    `SELECT bt.id, bt.amount, bt.description, bt.created_at,
            fa.account_number as from_account,
            ta.account_number as to_account
       FROM bank_transactions bt
       LEFT JOIN bank_accounts fa ON bt.from_account_id = fa.id
       LEFT JOIN bank_accounts ta ON bt.to_account_id = ta.id
       WHERE bt.from_account_id IN (SELECT id FROM bank_accounts WHERE character_id = $1)
          OR bt.to_account_id IN (SELECT id FROM bank_accounts WHERE character_id = $1)
       ORDER BY bt.created_at DESC
       LIMIT $2 OFFSET $3`,
    [characterId, limit, offset]
  );

  return res.json({
    transactions: transactions.rows.map(row => ({
      id: row.id,
      amount: row.amount,
      description: row.description,
      fromAccount: row.from_account,
      toAccount: row.to_account,
      createdAt: row.created_at
    }))
  });
});

// Deposit cash to bank
bankRouter.post("/deposit", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    amount: z.number().int().min(1).max(1000000)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get character cash
    const character = await client.query(
      `SELECT money_cash FROM characters WHERE id = $1`,
      [characterId]
    );

    if ((character.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Character not found" });
    }

    if (character.rows[0].money_cash < parsed.data.amount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough cash" });
    }

    // Deduct cash
    await client.query(
      `UPDATE characters SET money_cash = money_cash - $1 WHERE id = $2`,
      [parsed.data.amount, characterId]
    );

    // Add to primary bank account
    const account = await client.query(
      `SELECT id FROM bank_accounts WHERE character_id = $1 AND is_primary = TRUE`,
      [characterId]
    );

    if ((account.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No primary bank account" });
    }

    await client.query(
      `UPDATE bank_accounts SET balance = balance + $1 WHERE id = $2`,
      [parsed.data.amount, account.rows[0].id]
    );

    // Log transaction
    await client.query(
      `INSERT INTO bank_transactions (from_account_id, to_account_id, amount, description)
       VALUES ($1, $1, $2, 'Cash deposit')`,
      [account.rows[0].id, parsed.data.amount]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      amount: parsed.data.amount,
      newCash: character.rows[0].money_cash - parsed.data.amount
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Deposit failed" });
  } finally {
    client.release();
  }
});

// Withdraw cash from bank
bankRouter.post("/withdraw", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    amount: z.number().int().min(1).max(1000000)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get primary bank account
    const account = await client.query(
      `SELECT id, balance FROM bank_accounts WHERE character_id = $1 AND is_primary = TRUE`,
      [characterId]
    );

    if ((account.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No primary bank account" });
    }

    if (account.rows[0].balance < parsed.data.amount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough funds in bank" });
    }

    // Deduct from bank
    await client.query(
      `UPDATE bank_accounts SET balance = balance - $1 WHERE id = $2`,
      [parsed.data.amount, account.rows[0].id]
    );

    // Add cash
    await client.query(
      `UPDATE characters SET money_cash = money_cash + $1 WHERE id = $2`,
      [parsed.data.amount, characterId]
    );

    // Log transaction
    await client.query(
      `INSERT INTO bank_transactions (from_account_id, to_account_id, amount, description)
       VALUES ($1, $1, $2, 'Cash withdrawal')`,
      [account.rows[0].id, parsed.data.amount]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      amount: parsed.data.amount,
      newBalance: account.rows[0].balance - parsed.data.amount
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Withdrawal failed" });
  } finally {
    client.release();
  }
});
