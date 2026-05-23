import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const buyItemSchema = z.object({
  shopId: z.number().int().positive(),
  itemCode: z.string(),
  quantity: z.number().int().min(1).max(100)
});

const createShopSchema = z.object({
  type: z.enum(["shop_247", "clothing", "gunshop", "car_dealer", "fuel_station"]),
  name: z.string().min(1).max(100),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  heading: z.number().optional(),
  modelHash: z.string()
});

const addShopItemSchema = z.object({
  shopId: z.number().int().positive(),
  itemCode: z.string(),
  price: z.number().int().min(1),
  stock: z.number().int().min(-1).max(1000) // -1 for unlimited
});

export const npcShopsRouter = Router();

// Get all NPC shops
npcShopsRouter.get("/", async (req, res) => {
  const shops = await pool.query(
    `SELECT id, type, name, x, y, z, heading, model_hash FROM npc_shops ORDER BY id ASC`
  );

  return res.json({
    shops: shops.rows.map(row => ({
      id: row.id,
      type: row.type,
      name: row.name,
      position: { x: row.x, y: row.y, z: row.z },
      heading: row.heading,
      modelHash: row.model_hash
    }))
  });
});

// Get shop items
npcShopsRouter.get("/:shopId/items", async (req, res) => {
  const shopId = parseInt(req.params.shopId, 10);
  if (isNaN(shopId)) return res.status(400).json({ message: "Invalid shop ID" });

  const items = await pool.query(
    `SELECT id, item_code, price, stock FROM npc_shop_items WHERE shop_id = $1`,
    [shopId]
  );

  return res.json({
    items: items.rows.map(row => ({
      id: row.id,
      itemCode: row.item_code,
      price: row.price,
      stock: row.stock
    }))
  });
});

// Buy item from NPC shop
npcShopsRouter.post("/buy", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = buyItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get item and check stock
    const item = await client.query(
      `SELECT price, stock FROM npc_shop_items WHERE shop_id = $1 AND item_code = $2`,
      [parsed.data.shopId, parsed.data.itemCode]
    );

    if ((item.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Item not found in shop" });
    }

    if (item.rows[0].stock !== -1 && item.rows[0].stock < parsed.data.quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough stock" });
    }

    const totalPrice = item.rows[0].price * parsed.data.quantity;

    // Check character money
    const character = await client.query(
      `SELECT money_cash FROM characters WHERE id = $1`,
      [characterId]
    );

    if ((character.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Character not found" });
    }

    if (character.rows[0].money_cash < totalPrice) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough money" });
    }

    // Deduct money
    await client.query(
      `UPDATE characters SET money_cash = money_cash - $1 WHERE id = $2`,
      [totalPrice, characterId]
    );

    // Update stock if not unlimited
    if (item.rows[0].stock !== -1) {
      await client.query(
        `UPDATE npc_shop_items SET stock = stock - $1 WHERE shop_id = $2 AND item_code = $3`,
        [parsed.data.quantity, parsed.data.shopId, parsed.data.itemCode]
      );
    }

    // Add item to inventory (using inventory-full logic)
    await client.query(
      `INSERT INTO inventory_items (character_id, item_code, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id, item_code)
       DO UPDATE SET quantity = inventory_items.quantity + EXCLUDED.quantity`,
      [characterId, parsed.data.itemCode, parsed.data.quantity]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      itemCode: parsed.data.itemCode,
      quantity: parsed.data.quantity,
      totalPrice
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Purchase failed" });
  } finally {
    client.release();
  }
});

// Create NPC shop (admin only)
npcShopsRouter.post("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const parsed = createShopSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const result = await pool.query(
    `INSERT INTO npc_shops (type, name, x, y, z, heading, model_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [parsed.data.type, parsed.data.name, parsed.data.x, parsed.data.y, parsed.data.z, parsed.data.heading ?? 0, parsed.data.modelHash]
  );

  return res.status(201).json({
    ok: true,
    shopId: result.rows[0].id
  });
});

// Add item to NPC shop (admin only)
npcShopsRouter.post("/items", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const parsed = addShopItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `INSERT INTO npc_shop_items (shop_id, item_code, price, stock)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (shop_id, item_code)
     DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock`,
    [parsed.data.shopId, parsed.data.itemCode, parsed.data.price, parsed.data.stock]
  );

  return res.status(201).json({ ok: true });
});

// Delete NPC shop (admin only)
npcShopsRouter.delete("/:shopId", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const shopId = parseInt(req.params.shopId, 10);
  if (isNaN(shopId)) return res.status(400).json({ message: "Invalid shop ID" });

  await pool.query(
    `DELETE FROM npc_shops WHERE id = $1`,
    [shopId]
  );

  return res.json({ ok: true });
});

// Delete item from NPC shop (admin only)
npcShopsRouter.delete("/items/:itemId", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const itemId = parseInt(req.params.itemId, 10);
  if (isNaN(itemId)) return res.status(400).json({ message: "Invalid item ID" });

  await pool.query(
    `DELETE FROM npc_shop_items WHERE id = $1`,
    [itemId]
  );

  return res.json({ ok: true });
});
