import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const MAX_SLOTS = 30;
const MAX_WEIGHT = 50;

const useItemSchema = z.object({
  slotNumber: z.number().int().min(0).max(MAX_SLOTS - 1),
  quantity: z.number().int().min(1).max(100)
});

const moveItemSchema = z.object({
  fromSlot: z.number().int().min(0).max(MAX_SLOTS - 1),
  toSlot: z.number().int().min(0).max(MAX_SLOTS - 1),
  quantity: z.number().int().min(1).max(100)
});

const dropItemSchema = z.object({
  slotNumber: z.number().int().min(0).max(MAX_SLOTS - 1),
  quantity: z.number().int().min(1).max(100),
  x: z.number(),
  y: z.number(),
  z: z.number()
});

// Initialize item definitions
async function initItemDefinitions(): Promise<void> {
  const items = [
    // Food
    { code: "burger", name: "Бургер", category: "food", weight: 1, maxStack: 10, consumable: true, effectType: "hunger", effectValue: 25, price: 50 },
    { code: "pizza", name: "Пицца", category: "food", weight: 2, maxStack: 5, consumable: true, effectType: "hunger", effectValue: 40, price: 80 },
    { code: "sandwich", name: "Сэндвич", category: "food", weight: 1, maxStack: 15, consumable: true, effectType: "hunger", effectValue: 15, price: 30 },
    { code: "hotdog", name: "Хот-дог", category: "food", weight: 1, maxStack: 10, consumable: true, effectType: "hunger", effectValue: 20, price: 40 },
    
    // Drinks
    { code: "water", name: "Вода", category: "drink", weight: 1, maxStack: 20, consumable: true, effectType: "thirst", effectValue: 20, price: 20 },
    { code: "soda", name: "Газировка", category: "drink", weight: 1, maxStack: 15, consumable: true, effectType: "thirst", effectValue: 25, price: 35 },
    { code: "coffee", name: "Кофе", category: "drink", weight: 1, maxStack: 10, consumable: true, effectType: "stamina", effectValue: 30, price: 45 },
    { code: "beer", name: "Пиво", category: "drink", weight: 1, maxStack: 12, consumable: true, effectType: "thirst", effectValue: 15, price: 60 },
    
    // Medicine
    { code: "bandage", name: "Бинт", category: "medicine", weight: 1, maxStack: 10, consumable: true, effectType: "health", effectValue: 15, price: 100 },
    { code: "medkit", name: "Аптечка", category: "medicine", weight: 2, maxStack: 5, consumable: true, effectType: "health", effectValue: 50, price: 500 },
    { code: "painkillers", name: "Обезболивающее", category: "medicine", weight: 1, maxStack: 8, consumable: true, effectType: "health", effectValue: 25, price: 200 },
    
    // Tools
    { code: "lockpick", name: "Отмычка", category: "tool", weight: 1, maxStack: 5, consumable: false, effectType: "none", effectValue: 0, price: 500 },
    { code: "repairkit", name: "Ремонт-кит", category: "tool", weight: 3, maxStack: 3, consumable: true, effectType: "none", effectValue: 0, price: 1000 },
    { code: "phone", name: "Телефон", category: "misc", weight: 1, maxStack: 1, consumable: false, effectType: "none", effectValue: 0, price: 5000 },
    { code: "watch", name: "Часы", category: "misc", weight: 1, maxStack: 1, consumable: false, effectType: "none", effectValue: 0, price: 2000 },
    
    // Keys
    { code: "house_key", name: "Ключ от дома", category: "key", weight: 0.5, maxStack: 1, consumable: false, effectType: "none", effectValue: 0, price: 0 },
    { code: "vehicle_key", name: "Ключ от авто", category: "key", weight: 0.5, maxStack: 1, consumable: false, effectType: "none", effectValue: 0, price: 0 },
    { code: "business_key", name: "Ключ от бизнеса", category: "key", weight: 0.5, maxStack: 1, consumable: false, effectType: "none", effectValue: 0, price: 0 },
    
    // Illegal
    { code: "drugs_bag", name: "Пакет с наркотиками", category: "illegal", weight: 1, maxStack: 20, consumable: false, effectType: "none", effectValue: 0, price: 500 },
    { code: "weapon_pistol", name: "Пистолет", category: "weapon", weight: 2, maxStack: 1, consumable: false, effectType: "none", effectValue: 0, price: 5000 },
    { code: "ammo_pistol", name: "Патроны (9мм)", category: "ammo", weight: 0.5, maxStack: 50, consumable: false, effectType: "none", effectValue: 0, price: 50 },
    
    // Clothing
    { code: "mask", name: "Маска", category: "clothing", weight: 1, maxStack: 1, consumable: false, effectType: "none", effectValue: 0, price: 500 },
    { code: "bag", name: "Рюкзак", category: "clothing", weight: 2, maxStack: 1, consumable: false, effectType: "none", effectValue: 0, price: 1500 }
  ];

  for (const item of items) {
    await pool.query(
      `INSERT INTO item_definitions (code, name, category, weight, max_stack, consumable, effect_type, effect_value, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (code) DO NOTHING`,
      [item.code, item.name, item.category, item.weight, item.maxStack, item.consumable, item.effectType, item.effectValue, item.price]
    );
  }
}

// Initialize inventory slots for character
async function initInventorySlots(characterId: number): Promise<void> {
  for (let i = 0; i < MAX_SLOTS; i++) {
    await pool.query(
      `INSERT INTO inventory_slots (character_id, slot_number, item_code, quantity)
       VALUES ($1, $2, NULL, 0)
       ON CONFLICT (character_id, slot_number) DO NOTHING`,
      [characterId, i]
    );
  }
}

// Calculate total weight
async function calculateWeight(characterId: number): Promise<number> {
  const result = await pool.query(
    `SELECT SUM(id.weight * s.quantity) as total_weight
       FROM inventory_slots s
       LEFT JOIN item_definitions id ON s.item_code = id.code
       WHERE s.character_id = $1 AND s.item_code IS NOT NULL`,
    [characterId]
  );
  return (result.rows[0]?.total_weight ?? 0) as number;
}

export const inventoryFullRouter = Router();

// Get full inventory
inventoryFullRouter.get("/full", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  await initInventorySlots(characterId);
  await initItemDefinitions();

  const slots = await pool.query(
    `SELECT s.slot_number, s.item_code, s.quantity, 
            id.name, id.category, id.weight, id.consumable, id.effect_type, id.effect_value, id.description
       FROM inventory_slots s
       LEFT JOIN item_definitions id ON s.item_code = id.code
       WHERE s.character_id = $1
       ORDER BY s.slot_number ASC`,
    [characterId]
  );

  const totalWeight = await calculateWeight(characterId);

  return res.json({
    slots: slots.rows.map(row => ({
      slotNumber: row.slot_number,
      itemCode: row.item_code,
      quantity: row.quantity,
      item: row.item_code ? {
        code: row.item_code,
        name: row.name,
        category: row.category,
        weight: row.weight,
        consumable: row.consumable,
        effectType: row.effect_type,
        effectValue: row.effect_value,
        description: row.description
      } : null
    })),
    totalWeight,
    maxWeight: MAX_WEIGHT,
    maxSlots: MAX_SLOTS
  });
});

// Use item
inventoryFullRouter.post("/use", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = useItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const slot = await pool.query(
    `SELECT s.item_code, s.quantity, id.consumable, id.effect_type, id.effect_value
       FROM inventory_slots s
       LEFT JOIN item_definitions id ON s.item_code = id.code
       WHERE s.character_id = $1 AND s.slot_number = $2`,
    [characterId, parsed.data.slotNumber]
  );

  if ((slot.rowCount ?? 0) === 0 || !slot.rows[0].item_code) {
    return res.status(400).json({ message: "Slot is empty" });
  }

  if (slot.rows[0].quantity < parsed.data.quantity) {
    return res.status(400).json({ message: "Not enough items" });
  }

  if (!slot.rows[0].consumable) {
    return res.status(400).json({ message: "Item is not consumable" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Update inventory
    const newQuantity = slot.rows[0].quantity - parsed.data.quantity;
    if (newQuantity <= 0) {
      await client.query(
        `UPDATE inventory_slots SET item_code = NULL, quantity = 0
         WHERE character_id = $1 AND slot_number = $2`,
        [characterId, parsed.data.slotNumber]
      );
    } else {
      await client.query(
        `UPDATE inventory_slots SET quantity = $1
         WHERE character_id = $2 AND slot_number = $3`,
        [newQuantity, characterId, parsed.data.slotNumber]
      );
    }

    // Apply effect to stats
    if (slot.rows[0].effect_type && slot.rows[0].effect_type !== "none") {
      const effectField = slot.rows[0].effect_type === "health" ? "health" :
                         slot.rows[0].effect_type === "hunger" ? "hunger" :
                         slot.rows[0].effect_type === "thirst" ? "thirst" :
                         slot.rows[0].effect_type === "stamina" ? "stamina" : "health";
      
      const effectValue = slot.rows[0].effect_value * parsed.data.quantity;
      
      await client.query(
        `UPDATE character_stats SET ${effectField} = LEAST(${effectField} + $1, 100)
         WHERE character_id = $2`,
        [effectValue, characterId]
      );
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      effectType: slot.rows[0].effect_type,
      effectValue: slot.rows[0].effect_value * parsed.data.quantity
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to use item" });
  } finally {
    client.release();
  }
});

// Move item between slots
inventoryFullRouter.post("/move", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = moveItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  if (parsed.data.fromSlot === parsed.data.toSlot) {
    return res.status(400).json({ message: "Cannot move to same slot" });
  }

  const fromSlot = await pool.query(
    `SELECT item_code, quantity FROM inventory_slots
     WHERE character_id = $1 AND slot_number = $2`,
    [characterId, parsed.data.fromSlot]
  );

  if ((fromSlot.rowCount ?? 0) === 0 || !fromSlot.rows[0].item_code) {
    return res.status(400).json({ message: "Source slot is empty" });
  }

  if (fromSlot.rows[0].quantity < parsed.data.quantity) {
    return res.status(400).json({ message: "Not enough items" });
  }

  const toSlot = await pool.query(
    `SELECT item_code, quantity FROM inventory_slots
     WHERE character_id = $1 AND slot_number = $2`,
    [characterId, parsed.data.toSlot]
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // If target slot has same item, merge
    if ((toSlot.rowCount ?? 0) > 0 && toSlot.rows[0].item_code === fromSlot.rows[0].item_code) {
      await client.query(
        `UPDATE inventory_slots SET quantity = quantity + $1
         WHERE character_id = $2 AND slot_number = $3`,
        [parsed.data.quantity, characterId, parsed.data.toSlot]
      );
      
      const newFromQuantity = fromSlot.rows[0].quantity - parsed.data.quantity;
      if (newFromQuantity <= 0) {
        await client.query(
          `UPDATE inventory_slots SET item_code = NULL, quantity = 0
           WHERE character_id = $1 AND slot_number = $2`,
          [characterId, parsed.data.fromSlot]
        );
      } else {
        await client.query(
          `UPDATE inventory_slots SET quantity = $1
           WHERE character_id = $2 AND slot_number = $3`,
          [newFromQuantity, characterId, parsed.data.fromSlot]
        );
      }
    } else {
      // Swap or move
      if ((toSlot.rowCount ?? 0) > 0 && toSlot.rows[0].item_code) {
        // Swap
        await client.query(
          `UPDATE inventory_slots SET item_code = $1, quantity = $2
           WHERE character_id = $3 AND slot_number = $4`,
          [fromSlot.rows[0].item_code, parsed.data.quantity, characterId, parsed.data.toSlot]
        );
        
        const newFromQuantity = fromSlot.rows[0].quantity - parsed.data.quantity;
        if (newFromQuantity <= 0) {
          await client.query(
            `UPDATE inventory_slots SET item_code = $1, quantity = $2
             WHERE character_id = $3 AND slot_number = $4`,
            [toSlot.rows[0].item_code, toSlot.rows[0].quantity, characterId, parsed.data.fromSlot]
          );
        } else {
          await client.query(
            `UPDATE inventory_slots SET item_code = $1, quantity = $2
             WHERE character_id = $3 AND slot_number = $4`,
            [toSlot.rows[0].item_code, toSlot.rows[0].quantity, characterId, parsed.data.fromSlot]
          );
        }
      } else {
        // Move to empty slot
        const newFromQuantity = fromSlot.rows[0].quantity - parsed.data.quantity;
        if (newFromQuantity <= 0) {
          await client.query(
            `UPDATE inventory_slots SET item_code = NULL, quantity = 0
             WHERE character_id = $1 AND slot_number = $2`,
            [characterId, parsed.data.fromSlot]
          );
        } else {
          await client.query(
            `UPDATE inventory_slots SET quantity = $1
             WHERE character_id = $2 AND slot_number = $3`,
            [newFromQuantity, characterId, parsed.data.fromSlot]
          );
        }
        
        await client.query(
          `UPDATE inventory_slots SET item_code = $1, quantity = $2
           WHERE character_id = $3 AND slot_number = $4`,
          [fromSlot.rows[0].item_code, parsed.data.quantity, characterId, parsed.data.toSlot]
        );
      }
    }

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to move item" });
  } finally {
    client.release();
  }
});

// Drop item
inventoryFullRouter.post("/drop", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = dropItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const slot = await pool.query(
    `SELECT item_code, quantity FROM inventory_slots
     WHERE character_id = $1 AND slot_number = $2`,
    [characterId, parsed.data.slotNumber]
  );

  if ((slot.rowCount ?? 0) === 0 || !slot.rows[0].item_code) {
    return res.status(400).json({ message: "Slot is empty" });
  }

  if (slot.rows[0].quantity < parsed.data.quantity) {
    return res.status(400).json({ message: "Not enough items" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const newQuantity = slot.rows[0].quantity - parsed.data.quantity;
    if (newQuantity <= 0) {
      await client.query(
        `UPDATE inventory_slots SET item_code = NULL, quantity = 0
         WHERE character_id = $1 AND slot_number = $2`,
        [characterId, parsed.data.slotNumber]
      );
    } else {
      await client.query(
        `UPDATE inventory_slots SET quantity = $1
         WHERE character_id = $2 AND slot_number = $3`,
        [newQuantity, characterId, parsed.data.slotNumber]
      );
    }

    // Create dropped item (world item)
    await client.query(
      `INSERT INTO inventory_items (character_id, item_code, quantity)
       VALUES ($1, $2, $3)`,
      [characterId, slot.rows[0].item_code, parsed.data.quantity]
    );

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to drop item" });
  } finally {
    client.release();
  }
});

// Add item to inventory
inventoryFullRouter.post("/add", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    itemCode: z.string(),
    quantity: z.number().int().min(1).max(100)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await initInventorySlots(characterId);
  await initItemDefinitions();

  // Get item weight
  const itemDef = await pool.query(
    `SELECT weight, max_stack FROM item_definitions WHERE code = $1`,
    [parsed.data.itemCode]
  );

  if ((itemDef.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Item not found" });
  }

  const itemWeight = itemDef.rows[0].weight;
  const maxStack = itemDef.rows[0].max_stack;
  const totalWeightToAdd = itemWeight * parsed.data.quantity;

  const currentWeight = await calculateWeight(characterId);
  if (currentWeight + totalWeightToAdd > MAX_WEIGHT) {
    return res.status(400).json({ message: "Inventory is too heavy" });
  }

  // Find empty slot or existing slot with same item
  const existingSlot = await pool.query(
    `SELECT slot_number, quantity FROM inventory_slots
     WHERE character_id = $1 AND item_code = $2 AND quantity < $3
     ORDER BY slot_number ASC LIMIT 1`,
    [characterId, parsed.data.itemCode, maxStack]
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if ((existingSlot.rowCount ?? 0) > 0) {
      // Add to existing slot
      const canAdd = Math.min(maxStack - existingSlot.rows[0].quantity, parsed.data.quantity);
      await client.query(
        `UPDATE inventory_slots SET quantity = quantity + $1
         WHERE character_id = $2 AND slot_number = $3`,
        [canAdd, characterId, existingSlot.rows[0].slot_number]
      );

      const remaining = parsed.data.quantity - canAdd;
      if (remaining > 0) {
        // Find empty slot
        const emptySlot = await client.query(
          `SELECT slot_number FROM inventory_slots
           WHERE character_id = $1 AND item_code IS NULL
           ORDER BY slot_number ASC LIMIT 1`,
          [characterId]
        );

        if ((emptySlot.rowCount ?? 0) > 0) {
          await client.query(
            `UPDATE inventory_slots SET item_code = $1, quantity = $2
             WHERE character_id = $3 AND slot_number = $4`,
            [parsed.data.itemCode, remaining, characterId, emptySlot.rows[0].slot_number]
          );
        } else {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "Inventory is full" });
        }
      }
    } else {
      // Find empty slot
      const emptySlot = await client.query(
        `SELECT slot_number FROM inventory_slots
         WHERE character_id = $1 AND item_code IS NULL
         ORDER BY slot_number ASC LIMIT 1`,
        [characterId]
      );

      if (emptySlot.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Inventory is full" });
      }

      await client.query(
        `UPDATE inventory_slots SET item_code = $1, quantity = $2
         WHERE character_id = $3 AND slot_number = $4`,
        [parsed.data.itemCode, parsed.data.quantity, characterId, emptySlot.rows[0].slot_number]
      );
    }

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to add item" });
  } finally {
    client.release();
  }
});
