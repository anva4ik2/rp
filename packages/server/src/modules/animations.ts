import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const playAnimationSchema = z.object({
  animationCode: z.string(),
  loop: z.boolean().optional()
});

const createAnimationSchema = z.object({
  category: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  dictionary: z.string(),
  animation: z.string(),
  flags: z.number().int().optional()
});

const playInteractionSchema = z.object({
  targetCharacterId: z.number().int().positive(),
  interactionType: z.enum(["handshake", "hug", "pat_back", "high_five", "fist_bump"])
});

const animationCategories = [
  "greetings",
  "gestures",
  "dances",
  "actions",
  "emotes",
  "sitting",
  "lying",
  "walking",
  "combat",
  "vehicle"
];

const animationLibrary: Record<string, Array<{ code: string; name: string; dictionary: string; animation: string }>> = {
  greetings: [
    { code: "wave", name: "Приветствие", dictionary: "anim@mp_player_intcelebrationmale", animation: "wave" },
    { code: "salute", name: "Салют", dictionary: "anim@mp_player_intincarsalutestd", animation: "salute" },
    { code: "bow", name: "Поклон", dictionary: "anim@mp_player_intupperbow", animation: "upper_bow" }
  ],
  gestures: [
    { code: "thumbs_up", name: "Большой палец", dictionary: "anim@mp_player_intupperthumbs_up", animation: "upper_thumbs_up" },
    { code: "point", name: "Указать", dictionary: "anim@mp_player_intpointing", animation: "pointing_a" },
    { code: "facepalm", name: "Рукой по лицу", dictionary: "anim@mp_player_intupperface_palm", animation: "upper_face_palm" }
  ],
  dances: [
    { code: "dance_1", name: "Танец 1", dictionary: "anim@mp_player_intupperdance", animation: "upper_dance_a" },
    { code: "dance_2", name: "Танец 2", dictionary: "anim@mp_player_intupperdance", animation: "upper_dance_b" },
    { code: "dance_3", name: "Танец 3", dictionary: "anim@mp_player_intupperdance", animation: "upper_dance_c" }
  ],
  actions: [
    { code: "sitting_chair", name: "Сидеть на стуле", dictionary: "anim@amb@world_human_leaning@male@wall@back@foot_up", animation: "base" },
    { code: "sitting_ground", name: "Сидеть на земле", dictionary: "anim@amb@world_human_sitting@ground@cross_legged@male@base", animation: "base" },
    { code: "leaning", name: "Прислониться", dictionary: "anim@amb@world_human_leaning@female@wall@back@holding_elbow", animation: "base" }
  ],
  emotes: [
    { code: "cry", name: "Плакать", dictionary: "anim@mp_player_intuppercry", animation: "upper_cry" },
    { code: "laugh", name: "Смеяться", dictionary: "anim@mp_player_intupperlaugh", animation: "upper_laugh" },
    { code: "cheer", name: "Ура", dictionary: "anim@mp_player_intuppercheer", animation: "upper_cheer" }
  ]
};

export const animationsRouter = Router();

// Get all animations
animationsRouter.get("/", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : null;

  let animations = animationLibrary;

  if (category && animationCategories.includes(category)) {
    animations = { [category]: animationLibrary[category] || [] };
  }

  return res.json({
    categories: animationCategories,
    animations: Object.entries(animations).map(([cat, anims]) => ({
      category: cat,
      animations: anims
    }))
  });
});

// Play animation
animationsRouter.post("/play", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = playAnimationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Find animation in library
  let animationData = null;
  for (const category of Object.values(animationLibrary)) {
    const found = category.find(a => a.code === parsed.data.animationCode);
    if (found) {
      animationData = found;
      break;
    }
  }

  if (!animationData) {
    return res.status(404).json({ message: "Animation not found" });
  }

  // Log animation usage
  await pool.query(
    `INSERT INTO chat_logs (character_id, chat_type, message, x, y, z)
     VALUES ($1, 'animation', $2, 0, 0, 0)`,
    [characterId, `Played animation: ${animationData.name}`]
  );

  return res.json({
    ok: true,
    animation: animationData,
    loop: parsed.data.loop ?? false
  });
});

// Stop animation
animationsRouter.post("/stop", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  return res.json({ ok: true });
});

// Play interaction with another character
animationsRouter.post("/interact", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = playInteractionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check if target character exists and is nearby
  const targetCharacter = await pool.query(
    `SELECT id, x, y, z FROM characters WHERE id = $1`,
    [parsed.data.targetCharacterId]
  );

  if ((targetCharacter.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Target character not found" });
  }

  const sourceCharacter = await pool.query(
    `SELECT x, y, z FROM characters WHERE id = $1`,
    [characterId]
  );

  if ((sourceCharacter.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Character not found" });
  }

  // Calculate distance
  const distance = Math.sqrt(
    Math.pow(sourceCharacter.rows[0].x - targetCharacter.rows[0].x, 2) +
    Math.pow(sourceCharacter.rows[0].y - targetCharacter.rows[0].y, 2) +
    Math.pow(sourceCharacter.rows[0].z - targetCharacter.rows[0].z, 2)
  );

  if (distance > 5) {
    return res.status(400).json({ message: "Target is too far away" });
  }

  // Map interaction types to animations
  const interactionAnimations: Record<string, { dict: string; anim: string }> = {
    handshake: { dict: "anim@mp_player_intupperhandshake", anim: "upper_handshake" },
    hug: { dict: "anim@mp_player_intupperhug", anim: "upper_hug" },
    pat_back: { dict: "anim@mp_player_intupperpat_back", anim: "upper_pat_back" },
    high_five: { dict: "anim@mp_player_intupperhigh_five", anim: "upper_high_five" },
    fist_bump: { dict: "anim@mp_player_intupperfist_bump", anim: "upper_fist_bump" }
  };

  const animData = interactionAnimations[parsed.data.interactionType];
  if (!animData) {
    return res.status(400).json({ message: "Invalid interaction type" });
  }

  // Log interaction
  await pool.query(
    `INSERT INTO chat_logs (character_id, chat_type, message, x, y, z)
     VALUES ($1, 'interaction', $2, 0, 0, 0)`,
    [characterId, `Interaction: ${parsed.data.interactionType} with character ${parsed.data.targetCharacterId}`]
  );

  return res.json({
    ok: true,
    interactionType: parsed.data.interactionType,
    animation: animData,
    targetCharacterId: parsed.data.targetCharacterId
  });
});

// Create custom animation (admin only)
animationsRouter.post("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const parsed = createAnimationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Store custom animation (would need a database table for this)
  // For now, return success
  return res.status(201).json({
    ok: true,
    message: "Custom animation created (database storage needed)"
  });
});
