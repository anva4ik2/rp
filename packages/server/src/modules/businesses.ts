import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const buyBusinessSchema = z.object({
  businessId: z.number().int().positive()
});

const lockBusinessSchema = z.object({
  businessId: z.number().int().positive(),
  locked: z.boolean()
});

const depositSchema = z.object({
  businessId: z.number().int().positive(),
  amount: z.number().int().min(1).max(1000000)
});

const withdrawSchema = z.object({
  businessId: z.number().int().positive(),
  amount: z.number().int().min(1).max(1000000)
});

const addProductSchema = z.object({
  businessId: z.number().int().positive(),
  productCode: z.string(),
  price: z.number().int().min(1),
  stock: z.number().int().min(0).max(1000)
});

export const businessesRouter = Router();

// Get all businesses
businessesRouter.get("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const businesses = await pool.query(
    `SELECT b.id, b.type, b.name, b.entrance_x, b.entrance_y, b.entrance_z,
            b.interior_id, b.price, b.balance, b.locked, b.created_at,
            c.first_name as owner_first_name, c.last_name as owner_last_name
     FROM businesses b
     LEFT JOIN characters c ON b.owner_character_id = c.id
     ORDER BY b.id ASC`
  );

  return res.json({
    businesses: businesses.rows.map(row => ({
      id: row.id,
      type: row.type,
      name: row.name,
      entrance: { x: row.entrance_x, y: row.entrance_y, z: row.entrance_z },
      interiorId: row.interior_id,
      price: row.price,
      balance: row.balance,
      locked: row.locked,
      owner: row.owner_first_name ? `${row.owner_first_name} ${row.owner_last_name}` : null,
      createdAt: row.created_at
    }))
  });
});

// Get my businesses
businessesRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const businesses = await pool.query(
    `SELECT b.id, b.type, b.name, b.entrance_x, b.entrance_y, b.entrance_z,
            b.interior_id, b.price, b.balance, b.locked, b.created_at
     FROM businesses b
     WHERE b.owner_character_id = $1
     ORDER BY b.id ASC`,
    [characterId]
  );

  return res.json({
    businesses: businesses.rows.map(row => ({
      id: row.id,
      type: row.type,
      name: row.name,
      entrance: { x: row.entrance_x, y: row.entrance_y, z: row.entrance_z },
      interiorId: row.interior_id,
      price: row.price,
      balance: row.balance,
      locked: row.locked,
      createdAt: row.created_at
    }))
  });
});

// Buy business
businessesRouter.post("/buy", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = buyBusinessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if business exists and is not owned
    const business = await client.query(
      `SELECT id, price, owner_character_id FROM businesses WHERE id = $1`,
      [parsed.data.businessId]
    );

    if ((business.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Business not found" });
    }

    if (business.rows[0].owner_character_id) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Business already owned" });
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

    if (character.rows[0].money_bank < business.rows[0].price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough money" });
    }

    // Deduct money and assign business
    await client.query(
      `UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`,
      [business.rows[0].price, characterId]
    );

    await client.query(
      `UPDATE businesses SET owner_character_id = $1, balance = 0, locked = FALSE WHERE id = $2`,
      [characterId, parsed.data.businessId]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      businessId: parsed.data.businessId,
      price: business.rows[0].price
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to buy business" });
  } finally {
    client.release();
  }
});

// Sell business
businessesRouter.post("/sell", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({ businessId: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check if business is owned by character
    const business = await client.query(
      `SELECT id, price, owner_character_id, balance FROM businesses WHERE id = $1`,
      [parsed.data.businessId]
    );

    if ((business.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Business not found" });
    }

    if (business.rows[0].owner_character_id !== characterId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "You don't own this business" });
    }

    const sellPrice = Math.floor(business.rows[0].price * 0.6); // 60% of original price

    // Add money and remove ownership
    await client.query(
      `UPDATE characters SET money_bank = money_bank + $1 WHERE id = $2`,
      [sellPrice + business.rows[0].balance, characterId]
    );

    await client.query(
      `UPDATE businesses SET owner_character_id = NULL, balance = 0, locked = TRUE WHERE id = $1`,
      [parsed.data.businessId]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      businessId: parsed.data.businessId,
      sellPrice,
      balanceReturned: business.rows[0].balance
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to sell business" });
  } finally {
    client.release();
  }
});

// Lock/unlock business
businessesRouter.post("/lock", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = lockBusinessSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check ownership
  const business = await pool.query(
    `SELECT owner_character_id FROM businesses WHERE id = $1`,
    [parsed.data.businessId]
  );

  if ((business.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Business not found" });
  }

  if (business.rows[0].owner_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this business" });
  }

  await pool.query(
    `UPDATE businesses SET locked = $1 WHERE id = $2`,
    [parsed.data.locked, parsed.data.businessId]
  );

  return res.json({ ok: true, locked: parsed.data.locked });
});

// Deposit to business treasury
businessesRouter.post("/deposit", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check ownership
  const business = await pool.query(
    `SELECT owner_character_id FROM businesses WHERE id = $1`,
    [parsed.data.businessId]
  );

  if ((business.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Business not found" });
  }

  if (business.rows[0].owner_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this business" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check character money
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

    // Deduct cash and add to business
    await client.query(
      `UPDATE characters SET money_cash = money_cash - $1 WHERE id = $2`,
      [parsed.data.amount, characterId]
    );

    await client.query(
      `UPDATE businesses SET balance = balance + $1 WHERE id = $2`,
      [parsed.data.amount, parsed.data.businessId]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      amount: parsed.data.amount,
      newBalance: business.rows[0].balance + parsed.data.amount
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Deposit failed" });
  } finally {
    client.release();
  }
});

// Withdraw from business treasury
businessesRouter.post("/withdraw", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = withdrawSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check ownership
  const business = await pool.query(
    `SELECT owner_character_id, balance FROM businesses WHERE id = $1`,
    [parsed.data.businessId]
  );

  if ((business.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Business not found" });
  }

  if (business.rows[0].owner_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this business" });
  }

  if (business.rows[0].balance < parsed.data.amount) {
    return res.status(400).json({ message: "Not enough funds in business" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Deduct from business and add to character
    await client.query(
      `UPDATE businesses SET balance = balance - $1 WHERE id = $2`,
      [parsed.data.amount, parsed.data.businessId]
    );

    await client.query(
      `UPDATE characters SET money_cash = money_cash + $1 WHERE id = $2`,
      [parsed.data.amount, characterId]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      amount: parsed.data.amount,
      newBalance: business.rows[0].balance - parsed.data.amount
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Withdrawal failed" });
  } finally {
    client.release();
  }
});

// Get business products
businessesRouter.get("/:businessId/products", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const businessId = parseInt(req.params.businessId, 10);
  if (isNaN(businessId)) return res.status(400).json({ message: "Invalid business ID" });

  const products = await pool.query(
    `SELECT id, product_code, price, stock FROM business_products WHERE business_id = $1`,
    [businessId]
  );

  return res.json({
    products: products.rows.map(row => ({
      id: row.id,
      productCode: row.product_code,
      price: row.price,
      stock: row.stock
    }))
  });
});

// Add product
businessesRouter.post("/products", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = addProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check ownership
  const business = await pool.query(
    `SELECT owner_character_id FROM businesses WHERE id = $1`,
    [parsed.data.businessId]
  );

  if ((business.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Business not found" });
  }

  if (business.rows[0].owner_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this business" });
  }

  await pool.query(
    `INSERT INTO business_products (business_id, product_code, price, stock)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (business_id, product_code)
     DO UPDATE SET price = EXCLUDED.price, stock = EXCLUDED.stock`,
    [parsed.data.businessId, parsed.data.productCode, parsed.data.price, parsed.data.stock]
  );

  return res.status(201).json({ ok: true });
});

// Buy product from business
businessesRouter.post("/buy-product", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().min(1).max(10)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get product and business
    const product = await client.query(
      `SELECT bp.price, bp.stock, b.locked FROM business_products bp
       JOIN businesses b ON bp.business_id = b.id
       WHERE bp.id = $1`,
      [parsed.data.productId]
    );

    if ((product.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.rows[0].stock < parsed.data.quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough stock" });
    }

    if (product.rows[0].locked) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Business is locked" });
    }

    const totalPrice = product.rows[0].price * parsed.data.quantity;

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

    // Deduct money, add to business, reduce stock
    await client.query(
      `UPDATE characters SET money_cash = money_cash - $1 WHERE id = $2`,
      [totalPrice, characterId]
    );

    await client.query(
      `UPDATE business_products SET stock = stock - $1 WHERE id = $2`,
      [parsed.data.quantity, parsed.data.productId]
    );

    const businessId = await client.query(
      `SELECT business_id FROM business_products WHERE id = $1`,
      [parsed.data.productId]
    );

    await client.query(
      `UPDATE businesses SET balance = balance + $1 WHERE id = $2`,
      [totalPrice, businessId.rows[0].business_id]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      totalPrice,
      quantity: parsed.data.quantity
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Purchase failed" });
  } finally {
    client.release();
  }
});
