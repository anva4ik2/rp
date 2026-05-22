import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const appearanceSchema = z.object({
  gender: z.enum(["male", "female"]),
  faceShape: z.number().int().min(0).max(45).optional(),
  skinTone: z.number().int().min(0).max(45).optional(),
  hairStyle: z.number().int().min(0).max(73).optional(),
  hairColor: z.number().int().min(0).max(63).optional(),
  eyeColor: z.number().int().min(0).max(31).optional(),
  facialHair: z.number().int().min(0).max(28).optional(),
  facialHairColor: z.number().int().min(0).max(63).optional(),
  eyebrows: z.number().int().min(0).max(33).optional(),
  eyebrowsColor: z.number().int().min(0).max(63).optional(),
  noseWidth: z.number().int().min(-10).max(10).optional(),
  noseHeight: z.number().int().min(-10).max(10).optional(),
  cheekboneWidth: z.number().int().min(-10).max(10).optional(),
  cheekboneHeight: z.number().int().min(-10).max(10).optional(),
  jawWidth: z.number().int().min(-10).max(10).optional(),
  jawHeight: z.number().int().min(-10).max(10).optional(),
  lipThickness: z.number().int().min(-10).max(10).optional()
});

const clothingSchema = z.object({
  slot: z.string().min(1).max(20),
  drawable: z.number().int().min(0).max(255),
  texture: z.number().int().min(0).max(255).default(0)
});

const statsSchema = z.object({
  health: z.number().int().min(0).max(200).optional(),
  armor: z.number().int().min(0).max(100).optional(),
  hunger: z.number().int().min(0).max(100).optional(),
  thirst: z.number().int().min(0).max(100).optional(),
  stamina: z.number().int().min(0).max(100).optional(),
  strength: z.number().int().min(0).max(100).optional()
});

const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  heading: z.number().optional()
});

export const characterFullRouter = Router();

// Get full character data
characterFullRouter.get("/full", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const character = await pool.query(
    `SELECT id, first_name, last_name, money_cash, money_bank, created_at
       FROM characters WHERE id = $1`,
    [characterId]
  );
  if (character.rowCount === 0) return res.status(404).json({ message: "Character not found" });

  const appearance = await pool.query(
    `SELECT * FROM character_appearance WHERE character_id = $1`,
    [characterId]
  );

  const clothing = await pool.query(
    `SELECT slot, drawable, texture FROM character_clothing WHERE character_id = $1`,
    [characterId]
  );

  const stats = await pool.query(
    `SELECT * FROM character_stats WHERE character_id = $1`,
    [characterId]
  );

  const position = await pool.query(
    `SELECT * FROM character_position WHERE character_id = $1`,
    [characterId]
  );

  return res.json({
    character: {
      id: character.rows[0].id,
      firstName: character.rows[0].first_name,
      lastName: character.rows[0].last_name,
      moneyCash: character.rows[0].money_cash,
      moneyBank: character.rows[0].money_bank,
      createdAt: character.rows[0].created_at
    },
    appearance: (appearance.rowCount ?? 0) > 0 ? {
      gender: appearance.rows[0].gender,
      faceShape: appearance.rows[0].face_shape,
      skinTone: appearance.rows[0].skin_tone,
      hairStyle: appearance.rows[0].hair_style,
      hairColor: appearance.rows[0].hair_color,
      eyeColor: appearance.rows[0].eye_color,
      facialHair: appearance.rows[0].facial_hair,
      facialHairColor: appearance.rows[0].facial_hair_color,
      eyebrows: appearance.rows[0].eyebrows,
      eyebrowsColor: appearance.rows[0].eyebrows_color,
      noseWidth: appearance.rows[0].nose_width,
      noseHeight: appearance.rows[0].nose_height,
      cheekboneWidth: appearance.rows[0].cheekbone_width,
      cheekboneHeight: appearance.rows[0].cheekbone_height,
      jawWidth: appearance.rows[0].jaw_width,
      jawHeight: appearance.rows[0].jaw_height,
      lipThickness: appearance.rows[0].lip_thickness
    } : null,
    clothing: clothing.rows.map(row => ({
      slot: row.slot,
      drawable: row.drawable,
      texture: row.texture
    })),
    stats: (stats.rowCount ?? 0) > 0 ? {
      health: stats.rows[0].health,
      armor: stats.rows[0].armor,
      hunger: stats.rows[0].hunger,
      thirst: stats.rows[0].thirst,
      stamina: stats.rows[0].stamina,
      strength: stats.rows[0].strength
    } : null,
    position: (position.rowCount ?? 0) > 0 ? {
      x: position.rows[0].x,
      y: position.rows[0].y,
      z: position.rows[0].z,
      heading: position.rows[0].heading
    } : null
  });
});

// Update appearance
characterFullRouter.post("/appearance", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = appearanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `INSERT INTO character_appearance
       (character_id, gender, face_shape, skin_tone, hair_style, hair_color, eye_color,
        facial_hair, facial_hair_color, eyebrows, eyebrows_color,
        nose_width, nose_height, cheekbone_width, cheekbone_height,
        jaw_width, jaw_height, lip_thickness)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT (character_id)
     DO UPDATE SET
       gender = EXCLUDED.gender,
       face_shape = EXCLUDED.face_shape,
       skin_tone = EXCLUDED.skin_tone,
       hair_style = EXCLUDED.hair_style,
       hair_color = EXCLUDED.hair_color,
       eye_color = EXCLUDED.eye_color,
       facial_hair = EXCLUDED.facial_hair,
       facial_hair_color = EXCLUDED.facial_hair_color,
       eyebrows = EXCLUDED.eyebrows,
       eyebrows_color = EXCLUDED.eyebrows_color,
       nose_width = EXCLUDED.nose_width,
       nose_height = EXCLUDED.nose_height,
       cheekbone_width = EXCLUDED.cheekbone_width,
       cheekbone_height = EXCLUDED.cheekbone_height,
       jaw_width = EXCLUDED.jaw_width,
       jaw_height = EXCLUDED.jaw_height,
       lip_thickness = EXCLUDED.lip_thickness`,
    [
      characterId,
      parsed.data.gender,
      parsed.data.faceShape,
      parsed.data.skinTone,
      parsed.data.hairStyle,
      parsed.data.hairColor,
      parsed.data.eyeColor,
      parsed.data.facialHair,
      parsed.data.facialHairColor,
      parsed.data.eyebrows,
      parsed.data.eyebrowsColor,
      parsed.data.noseWidth,
      parsed.data.noseHeight,
      parsed.data.cheekboneWidth,
      parsed.data.cheekboneHeight,
      parsed.data.jawWidth,
      parsed.data.jawHeight,
      parsed.data.lipThickness
    ]
  );

  return res.json({ ok: true });
});

// Update clothing
characterFullRouter.post("/clothing", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = clothingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `INSERT INTO character_clothing (character_id, slot, drawable, texture)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (character_id, slot)
     DO UPDATE SET drawable = EXCLUDED.drawable, texture = EXCLUDED.texture`,
    [characterId, parsed.data.slot, parsed.data.drawable, parsed.data.texture]
  );

  return res.json({ ok: true });
});

// Update stats
characterFullRouter.post("/stats", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = statsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `INSERT INTO character_stats (character_id, health, armor, hunger, thirst, stamina, strength)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (character_id)
     DO UPDATE SET
       health = COALESCE(EXCLUDED.health, character_stats.health),
       armor = COALESCE(EXCLUDED.armor, character_stats.armor),
       hunger = COALESCE(EXCLUDED.hunger, character_stats.hunger),
       thirst = COALESCE(EXCLUDED.thirst, character_stats.thirst),
       stamina = COALESCE(EXCLUDED.stamina, character_stats.stamina),
       strength = COALESCE(EXCLUDED.strength, character_stats.strength)`,
    [
      characterId,
      parsed.data.health,
      parsed.data.armor,
      parsed.data.hunger,
      parsed.data.thirst,
      parsed.data.stamina,
      parsed.data.strength
    ]
  );

  return res.json({ ok: true });
});

// Update position
characterFullRouter.post("/position", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = positionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `INSERT INTO character_position (character_id, x, y, z, heading)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (character_id)
     DO UPDATE SET x = EXCLUDED.x, y = EXCLUDED.y, z = EXCLUDED.z, heading = EXCLUDED.heading, updated_at = NOW()`,
    [characterId, parsed.data.x, parsed.data.y, parsed.data.z, parsed.data.heading ?? 0]
  );

  return res.json({ ok: true });
});
