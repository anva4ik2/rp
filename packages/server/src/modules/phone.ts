import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

function generatePhoneNumber(): string {
  return "7" + Math.floor(Math.random() * 1000000000).toString().padStart(9, "0");
}

const buyPhoneSchema = z.object({
  number: z.string().optional()
});

const addContactSchema = z.object({
  name: z.string().min(1).max(50),
  phoneNumber: z.string().min(10).max(15)
});

const sendSmsSchema = z.object({
  toPhoneNumber: z.string().min(10).max(15),
  message: z.string().min(1).max(500)
});

const startCallSchema = z.object({
  toPhoneNumber: z.string().min(10).max(15)
});

export const phoneRouter = Router();

// Get my phone
phoneRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const phone = await pool.query(
    `SELECT id, phone_number, balance FROM phones WHERE character_id = $1`,
    [characterId]
  );

  if ((phone.rowCount ?? 0) === 0) {
    return res.json({ phone: null });
  }

  return res.json({
    phone: {
      id: phone.rows[0].id,
      phoneNumber: phone.rows[0].phone_number,
      balance: phone.rows[0].balance
    }
  });
});

// Buy phone
phoneRouter.post("/buy", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = buyPhoneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const phonePrice = 500;

  // Check if already has phone
  const existingPhone = await pool.query(
    `SELECT id FROM phones WHERE character_id = $1`,
    [characterId]
  );

  if ((existingPhone.rowCount ?? 0) > 0) {
    return res.status(400).json({ message: "Already have a phone" });
  }

  const phoneNumber = parsed.data.number || generatePhoneNumber();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check money
    const character = await client.query(
      `SELECT money_bank FROM characters WHERE id = $1`,
      [characterId]
    );

    if ((character.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Character not found" });
    }

    if (character.rows[0].money_bank < phonePrice) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough money" });
    }

    // Deduct money and create phone
    await client.query(
      `UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`,
      [phonePrice, characterId]
    );

    const result = await client.query(
      `INSERT INTO phones (character_id, phone_number, balance)
       VALUES ($1, $2, 100)
       RETURNING id`,
      [characterId, phoneNumber]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      phone: {
        id: result.rows[0].id,
        phoneNumber,
        balance: 100
      }
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to buy phone" });
  } finally {
    client.release();
  }
});

// Get contacts
phoneRouter.get("/contacts", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const contacts = await pool.query(
    `SELECT id, name, phone_number FROM phone_contacts WHERE phone_id IN (SELECT id FROM phones WHERE character_id = $1)`,
    [characterId]
  );

  return res.json({
    contacts: contacts.rows.map(row => ({
      id: row.id,
      name: row.name,
      phoneNumber: row.phone_number
    }))
  });
});

// Add contact
phoneRouter.post("/contacts", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = addContactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Get phone ID
  const phone = await pool.query(
    `SELECT id FROM phones WHERE character_id = $1`,
    [characterId]
  );

  if ((phone.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Phone not found" });
  }

  await pool.query(
    `INSERT INTO phone_contacts (phone_id, name, phone_number)
     VALUES ($1, $2, $3)`,
    [phone.rows[0].id, parsed.data.name, parsed.data.phoneNumber]
  );

  return res.status(201).json({ ok: true });
});

// Delete contact
phoneRouter.delete("/contacts/:contactId", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const contactId = parseInt(req.params.contactId, 10);
  if (isNaN(contactId)) return res.status(400).json({ message: "Invalid contact ID" });

  await pool.query(
    `DELETE FROM phone_contacts
     WHERE id = $1 AND phone_id IN (SELECT id FROM phones WHERE character_id = $2)`,
    [contactId, characterId]
  );

  return res.json({ ok: true });
});

// Get SMS
phoneRouter.get("/sms", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const messages = await pool.query(
    `SELECT pm.id, pm.message, pm.created_at, pm.is_read,
            p.phone_number as from_number,
            c.first_name as from_first_name, c.last_name as from_last_name
     FROM phone_messages pm
     JOIN phones p ON pm.from_phone_id = p.id
     LEFT JOIN characters c ON p.character_id = c.id
     WHERE pm.to_phone_id IN (SELECT id FROM phones WHERE character_id = $1)
     ORDER BY pm.created_at DESC`,
    [characterId]
  );

  return res.json({
    messages: messages.rows.map(row => ({
      id: row.id,
      message: row.message,
      from: row.from_number,
      fromName: row.from_first_name ? `${row.from_first_name} ${row.from_last_name}` : null,
      isRead: row.is_read,
      createdAt: row.created_at
    }))
  });
});

// Send SMS
phoneRouter.post("/sms", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = sendSmsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const smsCost = 10;

  // Get from phone
  const fromPhone = await pool.query(
    `SELECT id, balance FROM phones WHERE character_id = $1`,
    [characterId]
  );

  if ((fromPhone.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Phone not found" });
  }

  if (fromPhone.rows[0].balance < smsCost) {
    return res.status(400).json({ message: "Not enough balance" });
  }

  // Get to phone
  const toPhone = await pool.query(
    `SELECT id FROM phones WHERE phone_number = $1`,
    [parsed.data.toPhoneNumber]
  );

  if ((toPhone.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Phone number not found" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Deduct balance
    await client.query(
      `UPDATE phones SET balance = balance - $1 WHERE id = $2`,
      [smsCost, fromPhone.rows[0].id]
    );

    // Send message
    await client.query(
      `INSERT INTO phone_messages (from_phone_id, to_phone_id, message, is_read)
       VALUES ($1, $2, $3, FALSE)`,
      [fromPhone.rows[0].id, toPhone.rows[0].id, parsed.data.message]
    );

    await client.query("COMMIT");

    return res.json({ ok: true, cost: smsCost });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to send SMS" });
  } finally {
    client.release();
  }
});

// Mark SMS as read
phoneRouter.put("/sms/:messageId/read", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const messageId = parseInt(req.params.messageId, 10);
  if (isNaN(messageId)) return res.status(400).json({ message: "Invalid message ID" });

  await pool.query(
    `UPDATE phone_messages SET is_read = TRUE
     WHERE id = $1 AND to_phone_id IN (SELECT id FROM phones WHERE character_id = $2)`,
    [messageId, characterId]
  );

  return res.json({ ok: true });
});

// Get call history
phoneRouter.get("/calls", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const calls = await pool.query(
    `SELECT pc.id, pc.status, pc.started_at, pc.ended_at, pc.duration,
            p1.phone_number as from_number,
            p2.phone_number as to_number
     FROM phone_calls pc
     JOIN phones p1 ON pc.from_phone_id = p1.id
     JOIN phones p2 ON pc.to_phone_id = p2.id
     WHERE pc.from_phone_id IN (SELECT id FROM phones WHERE character_id = $1)
        OR pc.to_phone_id IN (SELECT id FROM phones WHERE character_id = $1)
     ORDER BY pc.started_at DESC`,
    [characterId]
  );

  return res.json({
    calls: calls.rows.map(row => ({
      id: row.id,
      status: row.status,
      from: row.from_number,
      to: row.to_number,
      duration: row.duration,
      startedAt: row.started_at,
      endedAt: row.ended_at
    }))
  });
});

// Start call
phoneRouter.post("/calls", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = startCallSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const callCostPerMinute = 5;

  // Get from phone
  const fromPhone = await pool.query(
    `SELECT id, balance FROM phones WHERE character_id = $1`,
    [characterId]
  );

  if ((fromPhone.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Phone not found" });
  }

  if (fromPhone.rows[0].balance < callCostPerMinute) {
    return res.status(400).json({ message: "Not enough balance" });
  }

  // Get to phone
  const toPhone = await pool.query(
    `SELECT id FROM phones WHERE phone_number = $1`,
    [parsed.data.toPhoneNumber]
  );

  if ((toPhone.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Phone number not found" });
  }

  // Create call record
  const result = await pool.query(
    `INSERT INTO phone_calls (from_phone_id, to_phone_id, status, started_at)
     VALUES ($1, $2, 'ringing', NOW())
     RETURNING id`,
    [fromPhone.rows[0].id, toPhone.rows[0].id]
  );

  return res.json({
    ok: true,
    callId: result.rows[0].id,
    status: "ringing"
  });
});

// End call
phoneRouter.put("/calls/:callId/end", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const callId = parseInt(req.params.callId, 10);
  if (isNaN(callId)) return res.status(400).json({ message: "Invalid call ID" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get call details
    const call = await client.query(
      `SELECT from_phone_id, to_phone_id, started_at FROM phone_calls WHERE id = $1`,
      [callId]
    );

    if ((call.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Call not found" });
    }

    const duration = Math.floor((Date.now() - new Date(call.rows[0].started_at).getTime()) / 1000 / 60); // minutes
    const cost = duration * 5;

    // Update call
    await client.query(
      `UPDATE phone_calls SET status = 'ended', ended_at = NOW(), duration = $1 WHERE id = $2`,
      [duration, callId]
    );

    // Deduct balance
    await client.query(
      `UPDATE phones SET balance = balance - $1 WHERE id = $2`,
      [cost, call.rows[0].from_phone_id]
    );

    await client.query("COMMIT");

    return res.json({ ok: true, duration, cost });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to end call" });
  } finally {
    client.release();
  }
});

// Add balance to phone (admin only)
phoneRouter.post("/balance", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const schema = z.object({
    phoneNumber: z.string(),
    amount: z.number().int().min(1).max(10000)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `UPDATE phones SET balance = balance + $1 WHERE phone_number = $2`,
    [parsed.data.amount, parsed.data.phoneNumber]
  );

  return res.json({ ok: true });
});
