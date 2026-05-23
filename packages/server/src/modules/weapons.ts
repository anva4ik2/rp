import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";
import { getFactionMembershipByCharacterId, getFactionPermissions } from "../faction-context.js";

const addWeaponSchema = z.object({
  weaponCode: z.string().min(2).max(32),
  ammo: z.number().int().min(0).max(500)
});

const updateAmmoSchema = z.object({
  weaponCode: z.string().min(2).max(32),
  ammo: z.number().int().min(0).max(500)
});

const confiscateSchema = z.object({
  targetCharacterId: z.number().int().positive()
});

const weaponDefinitions: Record<string, { name: string; maxAmmo: number; damage: number; category: string }> = {
  pistol: { name: "Пистолет", maxAmmo: 120, damage: 25, category: "handgun" },
  combat_pistol: { name: "Боевой пистолет", maxAmmo: 120, damage: 30, category: "handgun" },
  smg: { name: "ПП", maxAmmo: 300, damage: 20, category: "smg" },
  assault_rifle: { name: "Штурмовая винтовка", maxAmmo: 300, damage: 35, category: "rifle" },
  carbine: { name: "Карабин", maxAmmo: 300, damage: 32, category: "rifle" },
  shotgun: { name: "Дробовик", maxAmmo: 80, damage: 50, category: "shotgun" },
  sniper: { name: "Снайперская винтовка", maxAmmo: 60, damage: 90, category: "sniper" },
  rpg: { name: "РПГ", maxAmmo: 10, damage: 150, category: "heavy" },
  knife: { name: "Нож", maxAmmo: 0, damage: 15, category: "melee" },
  bat: { name: "Бита", maxAmmo: 0, damage: 10, category: "melee" }
};

export const weaponsRouter = Router();

// Get character weapons
weaponsRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const weapons = await pool.query(
    `SELECT weapon_code, ammo, durability FROM character_weapons WHERE character_id = $1`,
    [characterId]
  );

  return res.json({
    weapons: weapons.rows.map(row => {
      const def = weaponDefinitions[row.weapon_code] || { name: row.weapon_code, maxAmmo: 100, damage: 0, category: "unknown" };
      return {
        weaponCode: row.weapon_code,
        name: def.name,
        ammo: row.ammo,
        maxAmmo: def.maxAmmo,
        durability: row.durability,
        damage: def.damage,
        category: def.category
      };
    })
  });
});

// Add weapon (admin only or specific conditions)
weaponsRouter.post("/add", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = addWeaponSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  if (!weaponDefinitions[parsed.data.weaponCode]) {
    return res.status(400).json({ message: "Unknown weapon" });
  }

  await pool.query(
    `INSERT INTO character_weapons (character_id, weapon_code, ammo, durability)
     VALUES ($1, $2, $3, 100)
     ON CONFLICT (character_id, weapon_code)
     DO UPDATE SET ammo = character_weapons.ammo + EXCLUDED.ammo, durability = 100`,
    [characterId, parsed.data.weaponCode, parsed.data.ammo]
  );

  return res.status(201).json({ ok: true });
});

// Update ammo
weaponsRouter.post("/ammo", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = updateAmmoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const weapon = await pool.query(
    `SELECT ammo FROM character_weapons WHERE character_id = $1 AND weapon_code = $2`,
    [characterId, parsed.data.weaponCode]
  );

  if ((weapon.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Weapon not found" });
  }

  await pool.query(
    `UPDATE character_weapons SET ammo = $1 WHERE character_id = $2 AND weapon_code = $3`,
    [parsed.data.ammo, characterId, parsed.data.weaponCode]
  );

  return res.json({ ok: true });
});

// Reduce ammo (when shooting)
weaponsRouter.post("/shoot", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    weaponCode: z.string(),
    shots: z.number().int().min(1).max(10)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const weapon = await pool.query(
    `SELECT ammo, durability FROM character_weapons WHERE character_id = $1 AND weapon_code = $2`,
    [characterId, parsed.data.weaponCode]
  );

  if ((weapon.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Weapon not found" });
  }

  if (weapon.rows[0].ammo < parsed.data.shots) {
    return res.status(400).json({ message: "Not enough ammo" });
  }

  const newAmmo = weapon.rows[0].ammo - parsed.data.shots;
  const durabilityLoss = parsed.data.shots * 0.5;
  const newDurability = Math.max(0, weapon.rows[0].durability - durabilityLoss);

  await pool.query(
    `UPDATE character_weapons SET ammo = $1, durability = $2 WHERE character_id = $3 AND weapon_code = $4`,
    [newAmmo, newDurability, characterId, parsed.data.weaponCode]
  );

  // Remove weapon if durability is 0
  if (newDurability <= 0) {
    await pool.query(
      `DELETE FROM character_weapons WHERE character_id = $1 AND weapon_code = $2`,
      [characterId, parsed.data.weaponCode]
    );
  }

  return res.json({
    ok: true,
    ammo: newAmmo,
    durability: newDurability,
    broken: newDurability <= 0
  });
});

// Repair weapon
weaponsRouter.post("/repair", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    weaponCode: z.string()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const repairCost = 500;

  const character = await pool.query(
    `SELECT money_bank FROM characters WHERE id = $1`,
    [characterId]
  );

  if ((character.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Character not found" });
  }

  if (character.rows[0].money_bank < repairCost) {
    return res.status(400).json({ message: "Not enough money" });
  }

  const weapon = await pool.query(
    `SELECT durability FROM character_weapons WHERE character_id = $1 AND weapon_code = $2`,
    [characterId, parsed.data.weaponCode]
  );

  if ((weapon.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Weapon not found" });
  }

  if (weapon.rows[0].durability >= 100) {
    return res.status(400).json({ message: "Weapon is already in perfect condition" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`,
      [repairCost, characterId]
    );
    await client.query(
      `UPDATE character_weapons SET durability = 100 WHERE character_id = $1 AND weapon_code = $2`,
      [characterId, parsed.data.weaponCode]
    );
    await client.query("COMMIT");
    return res.json({ ok: true, repairCost });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Repair failed" });
  } finally {
    client.release();
  }
});

// Confiscate weapons (government only)
weaponsRouter.post("/confiscate", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const officerCharacterId = await getCharacterIdByUserId(userId);
  if (!officerCharacterId) return res.status(404).json({ message: "Character not found" });

  const membership = await getFactionMembershipByCharacterId(officerCharacterId);
  const permissions = await getFactionPermissions(officerCharacterId);

  if (!membership || membership.factionType !== "government" || !membership.onDuty) {
    return res.status(403).json({ message: "Government duty required" });
  }

  const parsed = confiscateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const weapons = await pool.query(
    `SELECT weapon_code, ammo FROM character_weapons WHERE character_id = $1`,
    [parsed.data.targetCharacterId]
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM character_weapons WHERE character_id = $1`,
      [parsed.data.targetCharacterId]
    );
    await client.query("COMMIT");
    return res.json({
      ok: true,
      confiscated: weapons.rows.map(row => ({ weaponCode: row.weapon_code, ammo: row.ammo }))
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Confiscation failed" });
  } finally {
    client.release();
  }
});

// Drop weapon
weaponsRouter.post("/drop", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    weaponCode: z.string(),
    x: z.number(),
    y: z.number(),
    z: z.number()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `DELETE FROM character_weapons WHERE character_id = $1 AND weapon_code = $2`,
    [characterId, parsed.data.weaponCode]
  );

  return res.json({ ok: true });
});
