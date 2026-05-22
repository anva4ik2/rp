import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const chatSchema = z.object({
  type: z.enum(["global", "local", "me", "do", "try", "ooc", "faction", "whisper", "shout"]),
  message: z.string().min(1).max(500),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional()
});

const LOCAL_CHAT_RANGE = 15;
const WHISPER_RANGE = 5;
const SHOUT_RANGE = 30;

export const chatRouter = Router();

// Lightweight chat logger used by RAGE MP server bridge. Accepts both `type`
// and `channel` keys so we are forgiving to legacy callers.
chatRouter.post("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const body = req.body ?? {};
  const type = (body.type ?? body.channel ?? "global") as string;
  const message = String(body.message ?? "").slice(0, 500);
  if (!message) return res.status(400).json({ message: "Empty" });
  await pool.query(
    `INSERT INTO chat_logs (character_id, chat_type, message)
     VALUES ($1, $2, $3)`,
    [characterId, type, message]
  );
  return res.json({ ok: true });
});

// Send chat message
chatRouter.post("/send", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Get character name
  const character = await pool.query(
    `SELECT first_name, last_name FROM characters WHERE id = $1`,
    [characterId]
  );
  if (character.rowCount === 0) return res.status(404).json({ message: "Character not found" });

  const characterName = `${character.rows[0].first_name} ${character.rows[0].last_name}`;

  // Log message
  await pool.query(
    `INSERT INTO chat_logs (character_id, chat_type, message, x, y, z)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [characterId, parsed.data.type, parsed.data.message, parsed.data.x, parsed.data.y, parsed.data.z]
  );

  // Format message based on type
  let formattedMessage: string;
  let range: number | null = null;

  switch (parsed.data.type) {
    case "global":
      formattedMessage = `[G] ${characterName}: ${parsed.data.message}`;
      break;
    case "local":
      formattedMessage = `${characterName} говорит: ${parsed.data.message}`;
      range = LOCAL_CHAT_RANGE;
      break;
    case "me":
      formattedMessage = `* ${characterName} ${parsed.data.message}`;
      range = LOCAL_CHAT_RANGE;
      break;
    case "do":
      formattedMessage = `* ${parsed.data.message} (( ${characterName} ))`;
      range = LOCAL_CHAT_RANGE;
      break;
    case "try":
      const success = Math.random() > 0.5;
      formattedMessage = `* ${characterName} ${parsed.data.message} ${success ? "| Успешно" : "| Неудачно"}`;
      range = LOCAL_CHAT_RANGE;
      break;
    case "ooc":
      formattedMessage = `(( ${characterName}: ${parsed.data.message} ))`;
      range = LOCAL_CHAT_RANGE;
      break;
    case "whisper":
      formattedMessage = `${characterName} шепчет: ${parsed.data.message}`;
      range = WHISPER_RANGE;
      break;
    case "shout":
      formattedMessage = `${characterName} кричит: ${parsed.data.message.toUpperCase()}`;
      range = SHOUT_RANGE;
      break;
    case "faction":
      formattedMessage = `[Фракция] ${characterName}: ${parsed.data.message}`;
      range = null; // Faction chat is global for faction members
      break;
    default:
      formattedMessage = `${characterName}: ${parsed.data.message}`;
  }

  return res.json({
    ok: true,
    message: formattedMessage,
    type: parsed.data.type,
    range,
    characterName,
    originalMessage: parsed.data.message
  });
});

// Get recent chat history (for admin/logs)
chatRouter.get("/history", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;

  const logs = await pool.query(
    `SELECT cl.id, cl.chat_type, cl.message, cl.x, cl.y, cl.z, cl.created_at,
            c.first_name, c.last_name
       FROM chat_logs cl
       LEFT JOIN characters c ON cl.character_id = c.id
       ORDER BY cl.created_at DESC
       LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return res.json({
    logs: logs.rows.map(row => ({
      id: row.id,
      type: row.chat_type,
      message: row.message,
      position: row.x ? { x: row.x, y: row.y, z: row.z } : null,
      character: row.first_name ? `${row.first_name} ${row.last_name}` : null,
      createdAt: row.created_at
    }))
  });
});

// Get chat history for specific character
chatRouter.get("/history/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 20;

  const logs = await pool.query(
    `SELECT cl.chat_type, cl.message, cl.created_at
       FROM chat_logs cl
       WHERE cl.character_id = $1
       ORDER BY cl.created_at DESC
       LIMIT $2`,
    [characterId, limit]
  );

  return res.json({
    logs: logs.rows.map(row => ({
      type: row.chat_type,
      message: row.message,
      createdAt: row.created_at
    }))
  });
});
