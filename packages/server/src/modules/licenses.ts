import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";
import { getFactionMembershipByCharacterId } from "../faction-context.js";

const issueLicenseSchema = z.object({
  targetCharacterId: z.number().int().positive(),
  licenseType: z.enum(["driving_a", "driving_b", "driving_c", "weapon", "business", "fishing", "hunting"]),
  durationDays: z.number().int().min(1).max(365)
});

const revokeLicenseSchema = z.object({
  targetCharacterId: z.number().int().positive(),
  licenseType: z.enum(["driving_a", "driving_b", "driving_c", "weapon", "business", "fishing", "hunting"])
});

const licensePrices: Record<string, number> = {
  driving_a: 5000,
  driving_b: 8000,
  driving_c: 12000,
  weapon: 15000,
  business: 25000,
  fishing: 3000,
  hunting: 4000
};

const licenseNames: Record<string, string> = {
  driving_a: "Водительские права (категория A)",
  driving_b: "Водительские права (категория B)",
  driving_c: "Водительские права (категория C)",
  weapon: "Лицензия на оружие",
  business: "Лицензия на бизнес",
  fishing: "Лицензия на рыбалку",
  hunting: "Лицензия на охоту"
};

export const licensesRouter = Router();

// Get my licenses
licensesRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const licenses = await pool.query(
    `SELECT license_type, issued_at, expires_at
     FROM character_licenses
     WHERE character_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY issued_at DESC`,
    [characterId]
  );

  return res.json({
    licenses: licenses.rows.map(row => ({
      type: row.license_type,
      name: licenseNames[row.license_type] || row.license_type,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      valid: !row.expires_at || new Date(row.expires_at) > new Date()
    }))
  });
});

// Check if character has specific license
licensesRouter.get("/check/:characterId/:licenseType", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const characterId = parseInt(req.params.characterId, 10);
  const licenseType = req.params.licenseType;

  const license = await pool.query(
    `SELECT expires_at FROM character_licenses
     WHERE character_id = $1 AND license_type = $2
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [characterId, licenseType]
  );

  const hasLicense = (license.rowCount ?? 0) > 0;
  const valid = hasLicense && (!license.rows[0].expires_at || new Date(license.rows[0].expires_at) > new Date());

  return res.json({
    hasLicense,
    valid,
    expiresAt: license.rows[0]?.expires_at || null
  });
});

// Issue license (government only)
licensesRouter.post("/issue", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const officerCharacterId = await getCharacterIdByUserId(userId);
  if (!officerCharacterId) return res.status(404).json({ message: "Character not found" });

  const membership = await getFactionMembershipByCharacterId(officerCharacterId);
  if (!membership || membership.factionType !== "government" || !membership.onDuty) {
    return res.status(403).json({ message: "Government duty required" });
  }

  const parsed = issueLicenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const expiresAt = new Date(Date.now() + parsed.data.durationDays * 24 * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO character_licenses (character_id, license_type, issued_at, expires_at)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (character_id, license_type)
     DO UPDATE SET issued_at = NOW(), expires_at = EXCLUDED.expires_at`,
    [parsed.data.targetCharacterId, parsed.data.licenseType, expiresAt]
  );

  return res.json({
    ok: true,
    licenseType: parsed.data.licenseType,
    expiresAt
  });
});

// Revoke license (government only)
licensesRouter.post("/revoke", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const officerCharacterId = await getCharacterIdByUserId(userId);
  if (!officerCharacterId) return res.status(404).json({ message: "Character not found" });

  const membership = await getFactionMembershipByCharacterId(officerCharacterId);
  if (!membership || membership.factionType !== "government" || !membership.onDuty) {
    return res.status(403).json({ message: "Government duty required" });
  }

  const parsed = revokeLicenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `UPDATE character_licenses SET expires_at = NOW()
     WHERE character_id = $1 AND license_type = $2`,
    [parsed.data.targetCharacterId, parsed.data.licenseType]
  );

  return res.json({ ok: true });
});

// Buy license (player)
licensesRouter.post("/buy", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    licenseType: z.enum(["driving_a", "driving_b", "driving_c", "weapon", "business", "fishing", "hunting"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const price = licensePrices[parsed.data.licenseType];
  if (!price) {
    return res.status(400).json({ message: "Invalid license type" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if already has valid license
    const existing = await client.query(
      `SELECT expires_at FROM character_licenses
       WHERE character_id = $1 AND license_type = $2
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [characterId, parsed.data.licenseType]
    );

    if ((existing.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Already have this license" });
    }

    // Check money
    const character = await client.query(
      `SELECT money_bank FROM characters WHERE id = $1`,
      [characterId]
    );

    if ((character.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Character not found" });
    }

    if (character.rows[0].money_bank < price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough money" });
    }

    // Deduct money
    await client.query(
      `UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`,
      [price, characterId]
    );

    // Issue license (1 year validity)
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO character_licenses (character_id, license_type, issued_at, expires_at)
       VALUES ($1, $2, NOW(), $3)`,
      [characterId, parsed.data.licenseType, expiresAt]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      licenseType: parsed.data.licenseType,
      price,
      expiresAt
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to buy license" });
  } finally {
    client.release();
  }
});

// Get all license prices
licensesRouter.get("/prices", async (req, res) => {
  return res.json({
    prices: Object.entries(licensePrices).map(([type, price]) => ({
      type,
      name: licenseNames[type] || type,
      price
    }))
  });
});
