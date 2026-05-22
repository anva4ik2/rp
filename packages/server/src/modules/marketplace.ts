import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const createListingSchema = z.object({
  listingType: z.enum(["item", "vehicle", "property"]),
  itemCode: z.string().optional(),
  vehicleId: z.number().int().positive().optional(),
  houseId: z.number().int().positive().optional(),
  businessId: z.number().int().positive().optional(),
  price: z.number().int().min(1).max(100000000),
  title: z.string().min(3).max(100),
  description: z.string().max(500).optional()
});

const buyListingSchema = z.object({
  listingId: z.number().int().positive()
});

const updateListingSchema = z.object({
  listingId: z.number().int().positive(),
  status: z.enum(["active", "cancelled"])
});

export const marketplaceRouter = Router();

// Get all listings
marketplaceRouter.get("/", async (req, res) => {
  const listingType = typeof req.query.type === "string" ? req.query.type : null;
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
  const offset = typeof req.query.offset === "string" ? parseInt(req.query.offset, 10) : 0;

  let query = `
    SELECT ml.id, ml.listing_type, ml.price, ml.title, ml.description, ml.status, ml.created_at,
            c.first_name as seller_first_name, c.last_name as seller_last_name,
            v.model_code as vehicle_model,
            h.entrance_x as house_x, h.entrance_y as house_y, h.entrance_z as house_z,
            b.name as business_name
    FROM marketplace_listings ml
    LEFT JOIN characters c ON ml.seller_character_id = c.id
    LEFT JOIN vehicles v ON ml.vehicle_id = v.id
    LEFT JOIN houses h ON ml.house_id = h.id
    LEFT JOIN businesses b ON ml.business_id = b.id
  `;
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (listingType) {
    query += ` WHERE ml.listing_type = $${paramIndex}`;
    params.push(listingType);
    paramIndex++;
  }

  query += ` AND ml.status = 'active' ORDER BY ml.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  const listings = await pool.query(query, params);

  return res.json({
    listings: listings.rows.map(row => ({
      id: row.id,
      type: row.listing_type,
      price: row.price,
      title: row.title,
      description: row.description,
      seller: row.seller_first_name ? `${row.seller_first_name} ${row.seller_last_name}` : null,
      vehicleModel: row.vehicle_model,
      housePosition: row.house_x ? { x: row.house_x, y: row.house_y, z: row.house_z } : null,
      businessName: row.business_name,
      createdAt: row.created_at
    }))
  });
});

// Get my listings
marketplaceRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const listings = await pool.query(
    `SELECT ml.id, ml.listing_type, ml.price, ml.title, ml.description, ml.status, ml.created_at,
            v.model_code as vehicle_model,
            h.entrance_x as house_x, h.entrance_y as house_y, h.entrance_z as house_z,
            b.name as business_name
     FROM marketplace_listings ml
     LEFT JOIN vehicles v ON ml.vehicle_id = v.id
     LEFT JOIN houses h ON ml.house_id = h.id
     LEFT JOIN businesses b ON ml.business_id = b.id
     WHERE ml.seller_character_id = $1
     ORDER BY ml.created_at DESC`,
    [characterId]
  );

  return res.json({
    listings: listings.rows.map(row => ({
      id: row.id,
      type: row.listing_type,
      price: row.price,
      title: row.title,
      description: row.description,
      status: row.status,
      vehicleModel: row.vehicle_model,
      housePosition: row.house_x ? { x: row.house_x, y: row.house_y, z: row.house_z } : null,
      businessName: row.business_name,
      createdAt: row.created_at
    }))
  });
});

// Create listing
marketplaceRouter.post("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = createListingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Validate ownership based on listing type
    if (parsed.data.listingType === "vehicle" && parsed.data.vehicleId) {
      const vehicle = await client.query(
        `SELECT owner_character_id FROM vehicles WHERE id = $1`,
        [parsed.data.vehicleId]
      );
      if ((vehicle.rowCount ?? 0) === 0 || vehicle.rows[0].owner_character_id !== characterId) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "You don't own this vehicle" });
      }
    } else if (parsed.data.listingType === "property" && parsed.data.houseId) {
      const house = await client.query(
        `SELECT owner_character_id FROM houses WHERE id = $1`,
        [parsed.data.houseId]
      );
      if ((house.rowCount ?? 0) === 0 || house.rows[0].owner_character_id !== characterId) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "You don't own this house" });
      }
    } else if (parsed.data.listingType === "property" && parsed.data.businessId) {
      const business = await client.query(
        `SELECT owner_character_id FROM businesses WHERE id = $1`,
        [parsed.data.businessId]
      );
      if ((business.rowCount ?? 0) === 0 || business.rows[0].owner_character_id !== characterId) {
        await client.query("ROLLBACK");
        return res.status(403).json({ message: "You don't own this business" });
      }
    } else if (parsed.data.listingType === "item" && parsed.data.itemCode) {
      // Check if character has the item
      const item = await client.query(
        `SELECT quantity FROM inventory_items WHERE character_id = $1 AND item_code = $2`,
        [characterId, parsed.data.itemCode]
      );
      if ((item.rowCount ?? 0) === 0 || item.rows[0].quantity < 1) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "You don't have this item" });
      }
    }

    const result = await client.query(
      `INSERT INTO marketplace_listings (seller_character_id, listing_type, item_code, vehicle_id, house_id, business_id, price, title, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        characterId,
        parsed.data.listingType,
        parsed.data.itemCode || null,
        parsed.data.vehicleId || null,
        parsed.data.houseId || null,
        parsed.data.businessId || null,
        parsed.data.price,
        parsed.data.title,
        parsed.data.description || null
      ]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      listingId: result.rows[0].id
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to create listing" });
  } finally {
    client.release();
  }
});

// Buy listing
marketplaceRouter.post("/buy", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = buyListingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get listing
    const listing = await client.query(
      `SELECT * FROM marketplace_listings WHERE id = $1 AND status = 'active'`,
      [parsed.data.listingId]
    );

    if ((listing.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Listing not found" });
    }

    if (listing.rows[0].seller_character_id === characterId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Cannot buy your own listing" });
    }

    // Check buyer money
    const buyer = await client.query(
      `SELECT money_bank FROM characters WHERE id = $1`,
      [characterId]
    );

    if ((buyer.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Character not found" });
    }

    if (buyer.rows[0].money_bank < listing.rows[0].price) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough money" });
    }

    // Transfer ownership based on type
    if (listing.rows[0].listing_type === "vehicle" && listing.rows[0].vehicle_id) {
      await client.query(
        `UPDATE vehicles SET owner_character_id = $1 WHERE id = $2`,
        [characterId, listing.rows[0].vehicle_id]
      );
    } else if (listing.rows[0].listing_type === "property" && listing.rows[0].house_id) {
      await client.query(
        `UPDATE houses SET owner_character_id = $1 WHERE id = $2`,
        [characterId, listing.rows[0].house_id]
      );
    } else if (listing.rows[0].listing_type === "property" && listing.rows[0].business_id) {
      await client.query(
        `UPDATE businesses SET owner_character_id = $1 WHERE id = $2`,
        [characterId, listing.rows[0].business_id]
      );
    } else if (listing.rows[0].listing_type === "item" && listing.rows[0].item_code) {
      // Remove item from seller
      await client.query(
        `UPDATE inventory_items SET quantity = quantity - 1 WHERE character_id = $1 AND item_code = $2`,
        [listing.rows[0].seller_character_id, listing.rows[0].item_code]
      );
      // Add item to buyer
      await client.query(
        `INSERT INTO inventory_items (character_id, item_code, quantity)
         VALUES ($1, $2, 1)
         ON CONFLICT (character_id, item_code)
         DO UPDATE SET quantity = inventory_items.quantity + 1`,
        [characterId, listing.rows[0].item_code]
      );
    }

    // Transfer money
    await client.query(
      `UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`,
      [listing.rows[0].price, characterId]
    );

    await client.query(
      `UPDATE characters SET money_bank = money_bank + $1 WHERE id = $2`,
      [listing.rows[0].price, listing.rows[0].seller_character_id]
    );

    // Update listing status
    await client.query(
      `UPDATE marketplace_listings SET status = 'sold' WHERE id = $1`,
      [parsed.data.listingId]
    );

    await client.query("COMMIT");

    return res.json({
      ok: true,
      price: listing.rows[0].price,
      type: listing.rows[0].listing_type
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Purchase failed" });
  } finally {
    client.release();
  }
});

// Update listing (cancel)
marketplaceRouter.put("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = updateListingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check ownership
  const listing = await pool.query(
    `SELECT seller_character_id FROM marketplace_listings WHERE id = $1`,
    [parsed.data.listingId]
  );

  if ((listing.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Listing not found" });
  }

  if (listing.rows[0].seller_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this listing" });
  }

  await pool.query(
    `UPDATE marketplace_listings SET status = $1 WHERE id = $2`,
    [parsed.data.status, parsed.data.listingId]
  );

  return res.json({ ok: true });
});

// Delete listing
marketplaceRouter.delete("/:listingId", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const listingId = parseInt(req.params.listingId, 10);
  if (isNaN(listingId)) return res.status(400).json({ message: "Invalid listing ID" });

  // Check ownership
  const listing = await pool.query(
    `SELECT seller_character_id FROM marketplace_listings WHERE id = $1`,
    [listingId]
  );

  if ((listing.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Listing not found" });
  }

  if (listing.rows[0].seller_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this listing" });
  }

  await pool.query(
    `DELETE FROM marketplace_listings WHERE id = $1`,
    [listingId]
  );

  return res.json({ ok: true });
});
