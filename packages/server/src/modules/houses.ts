import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const buyHouseSchema = z.object({
  houseId: z.number().int().positive()
});

const lockHouseSchema = z.object({
  houseId: z.number().int().positive(),
  locked: z.boolean()
});

const addFurnitureSchema = z.object({
  houseId: z.number().int().positive(),
  furnitureCode: z.string(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  rotationX: z.number().optional(),
  rotationY: z.number().optional(),
  rotationZ: z.number().optional()
});

const removeFurnitureSchema = z.object({
  furnitureId: z.number().int().positive()
});

export const housesRouter = Router();

// Get all houses
housesRouter.get("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const houses = await pool.query(
    `SELECT h.id, h.entrance_x, h.entrance_y, h.entrance_z, h.interior_id,
            h.price, h.locked, h.created_at,
            c.first_name as owner_first_name, c.last_name as owner_last_name
     FROM houses h
     LEFT JOIN characters c ON h.owner_character_id = c.id
     ORDER BY h.id ASC`
  );

  return res.json({
    houses: houses.rows.map(row => ({
      id: row.id,
      entrance: { x: row.entrance_x, y: row.entrance_y, z: row.entrance_z },
      interiorId: row.interior_id,
      price: row.price,
      locked: row.locked,
      owner: row.owner_first_name ? `${row.owner_first_name} ${row.owner_last_name}` : null,
      createdAt: row.created_at
    }))
  });
});

// Get my houses
housesRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const houses = await pool.query(
    `SELECT h.id, h.entrance_x, h.entrance_y, h.entrance_z, h.interior_id,
            h.price, h.locked, h.created_at
     FROM houses h
     WHERE h.owner_character_id = $1
     ORDER BY h.id ASC`,
    [characterId]
  );

  return res.json({
    houses: houses.rows.map(row => ({
      id: row.id,
      entrance: { x: row.entrance_x, y: row.entrance_y, z: row.entrance_z },
      interiorId: row.interior_id,
      price: row.price,
      locked: row.locked,
      createdAt: row.created_at
    }))
  });
});

// Buy house
housesRouter.post("/buy", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = buyHouseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if house exists and is not owned
    const house = await client.query(
      `SELECT id, price, owner_character_id FROM houses WHERE id = $1`,
      [parsed.data.houseId]
    );

    if ((house.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "House not found" });
    }

    if (house.rows[0].owner_character_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "House already owned" });
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

    if (character.rows[0].money_bank < house.rows[0].price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough money" });
    }

    // Deduct money and assign house
    await client.query(
      `UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`,
      [house.rows[0].price, characterId]
    );

    await client.query(
      `UPDATE houses SET owner_character_id = $1, locked = TRUE WHERE id = $2`,
      [characterId, parsed.data.houseId]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      houseId: parsed.data.houseId,
      price: house.rows[0].price
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to buy house" });
  } finally {
    client.release();
  }
});

// Sell house
housesRouter.post("/sell", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({ houseId: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if house is owned by character
    const house = await client.query(
      `SELECT id, price, owner_character_id FROM houses WHERE id = $1`,
      [parsed.data.houseId]
    );

    if ((house.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "House not found" });
    }

    if (house.rows[0].owner_character_id !== characterId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "You don't own this house" });
    }

    const sellPrice = Math.floor(house.rows[0].price * 0.7); // 70% of original price

    // Add money and remove ownership
    await client.query(
      `UPDATE characters SET money_bank = money_bank + $1 WHERE id = $2`,
      [sellPrice, characterId]
    );

    await client.query(
      `UPDATE houses SET owner_character_id = NULL, locked = TRUE WHERE id = $1`,
      [parsed.data.houseId]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      houseId: parsed.data.houseId,
      sellPrice
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to sell house" });
  } finally {
    client.release();
  }
});

// Lock/unlock house
housesRouter.post("/lock", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = lockHouseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check ownership
  const house = await pool.query(
    `SELECT owner_character_id FROM houses WHERE id = $1`,
    [parsed.data.houseId]
  );

  if ((house.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "House not found" });
  }

  if (house.rows[0].owner_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this house" });
  }

  await pool.query(
    `UPDATE houses SET locked = $1 WHERE id = $2`,
    [parsed.data.locked, parsed.data.houseId]
  );

  return res.json({ ok: true, locked: parsed.data.locked });
});

// Get house furniture
housesRouter.get("/:houseId/furniture", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const houseId = parseInt(req.params.houseId, 10);
  if (isNaN(houseId)) return res.status(400).json({ message: "Invalid house ID" });

  const furniture = await pool.query(
    `SELECT id, furniture_code, x, y, z, rotation_x, rotation_y, rotation_z
     FROM house_furniture
     WHERE house_id = $1`,
    [houseId]
  );

  return res.json({
    furniture: furniture.rows.map(row => ({
      id: row.id,
      furnitureCode: row.furniture_code,
      position: { x: row.x, y: row.y, z: row.z },
      rotation: { x: row.rotation_x, y: row.rotation_y, z: row.rotation_z }
    }))
  });
});

// Add furniture
housesRouter.post("/furniture", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = addFurnitureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check ownership
  const house = await pool.query(
    `SELECT owner_character_id FROM houses WHERE id = $1`,
    [parsed.data.houseId]
  );

  if ((house.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "House not found" });
  }

  if (house.rows[0].owner_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this house" });
  }

  await pool.query(
    `INSERT INTO house_furniture (house_id, furniture_code, x, y, z, rotation_x, rotation_y, rotation_z)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      parsed.data.houseId,
      parsed.data.furnitureCode,
      parsed.data.x,
      parsed.data.y,
      parsed.data.z,
      parsed.data.rotationX ?? 0,
      parsed.data.rotationY ?? 0,
      parsed.data.rotationZ ?? 0
    ]
  );

  return res.status(201).json({ ok: true });
});

// Remove furniture
housesRouter.delete("/furniture/:furnitureId", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const furnitureId = parseInt(req.params.furnitureId, 10);
  if (isNaN(furnitureId)) return res.status(400).json({ message: "Invalid furniture ID" });

  // Get furniture and check house ownership
  const furniture = await pool.query(
    `SELECT house_id FROM house_furniture WHERE id = $1`,
    [furnitureId]
  );

  if ((furniture.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Furniture not found" });
  }

  const house = await pool.query(
    `SELECT owner_character_id FROM houses WHERE id = $1`,
    [furniture.rows[0].house_id]
  );

  if ((house.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "House not found" });
  }

  if (house.rows[0].owner_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this house" });
  }

  await pool.query(
    `DELETE FROM house_furniture WHERE id = $1`,
    [furnitureId]
  );

  return res.json({ ok: true });
});
