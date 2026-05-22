import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const createGarageSchema = z.object({
  type: z.enum(["public", "house", "faction", "police"]),
  name: z.string().min(1).max(100),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  maxVehicles: z.number().int().min(1).max(50).optional()
});

const addSpotSchema = z.object({
  garageId: z.number().int().positive(),
  spotNumber: z.number().int().min(0).max(49),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  heading: z.number().optional()
});

const parkVehicleSchema = z.object({
  garageId: z.number().int().positive(),
  vehicleId: z.number().int().positive(),
  spotNumber: z.number().int().min(0).max(49)
});

export const garagesRouter = Router();

// Get all garages
garagesRouter.get("/", async (req, res) => {
  const garages = await pool.query(
    `SELECT g.id, g.type, g.name, g.x, g.y, g.z, g.max_vehicles, g.price,
            c.first_name as owner_first_name, c.last_name as owner_last_name,
            h.id as house_id, f.id as faction_id
     FROM garages g
     LEFT JOIN characters c ON g.owner_character_id = c.id
     LEFT JOIN houses h ON g.owner_house_id = h.id
     LEFT JOIN factions f ON g.owner_faction_id = f.id
     ORDER BY g.id ASC`
  );

  return res.json({
    garages: garages.rows.map(row => ({
      id: row.id,
      type: row.type,
      name: row.name,
      position: { x: row.x, y: row.y, z: row.z },
      maxVehicles: row.max_vehicles,
      price: row.price,
      owner: row.owner_first_name ? `${row.owner_first_name} ${row.owner_last_name}` : null,
      houseId: row.house_id,
      factionId: row.faction_id
    }))
  });
});

// Get my garages
garagesRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const garages = await pool.query(
    `SELECT g.id, g.type, g.name, g.x, g.y, g.z, g.max_vehicles
     FROM garages g
     WHERE g.owner_character_id = $1
     ORDER BY g.id ASC`,
    [characterId]
  );

  return res.json({
    garages: garages.rows.map(row => ({
      id: row.id,
      type: row.type,
      name: row.name,
      position: { x: row.x, y: row.y, z: row.z },
      maxVehicles: row.max_vehicles
    }))
  });
});

// Get garage spots
garagesRouter.get("/:garageId/spots", async (req, res) => {
  const garageId = parseInt(req.params.garageId, 10);
  if (isNaN(garageId)) return res.status(400).json({ message: "Invalid garage ID" });

  const spots = await pool.query(
    `SELECT id, spot_number, x, y, z, heading FROM garage_spots WHERE garage_id = $1 ORDER BY spot_number ASC`,
    [garageId]
  );

  return res.json({
    spots: spots.rows.map(row => ({
      id: row.id,
      spotNumber: row.spot_number,
      position: { x: row.x, y: row.y, z: row.z },
      heading: row.heading
    }))
  });
});

// Get vehicles in garage
garagesRouter.get("/:garageId/vehicles", async (req, res) => {
  const garageId = parseInt(req.params.garageId, 10);
  if (isNaN(garageId)) return res.status(400).json({ message: "Invalid garage ID" });

  const vehicles = await pool.query(
    `SELECT v.id, v.model_code, v.plate, v.fuel, v.is_spawned
     FROM vehicles v
     WHERE v.garage_id = $1
     ORDER BY v.id ASC`,
    [garageId]
  );

  return res.json({
    vehicles: vehicles.rows.map(row => ({
      id: row.id,
      modelCode: row.model_code,
      plate: row.plate,
      fuel: row.fuel,
      isSpawned: row.is_spawned
    }))
  });
});

// Create garage (admin only)
garagesRouter.post("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const parsed = createGarageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const result = await pool.query(
    `INSERT INTO garages (type, name, x, y, z, max_vehicles, price)
     VALUES ($1, $2, $3, $4, $5, $6, 0)
     RETURNING id`,
    [parsed.data.type, parsed.data.name, parsed.data.x, parsed.data.y, parsed.data.z, parsed.data.maxVehicles ?? 10]
  );

  return res.status(201).json({
    ok: true,
    garageId: result.rows[0].id
  });
});

// Add spot to garage (admin only)
garagesRouter.post("/spots", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const parsed = addSpotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  await pool.query(
    `INSERT INTO garage_spots (garage_id, spot_number, x, y, z, heading)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [parsed.data.garageId, parsed.data.spotNumber, parsed.data.x, parsed.data.y, parsed.data.z, parsed.data.heading ?? 0]
  );

  return res.status(201).json({ ok: true });
});

// Park vehicle in garage
garagesRouter.post("/park", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = parkVehicleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check vehicle ownership
  const vehicle = await pool.query(
    `SELECT owner_character_id FROM vehicles WHERE id = $1`,
    [parsed.data.vehicleId]
  );

  if ((vehicle.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Vehicle not found" });
  }

  if (vehicle.rows[0].owner_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this vehicle" });
  }

  // Update vehicle garage and despawn
  await pool.query(
    `UPDATE vehicles SET garage_id = $1, is_spawned = FALSE WHERE id = $2`,
    [parsed.data.garageId, parsed.data.vehicleId]
  );

  // Update vehicle position to spot
  const spot = await pool.query(
    `SELECT x, y, z, heading FROM garage_spots WHERE garage_id = $1 AND spot_number = $2`,
    [parsed.data.garageId, parsed.data.spotNumber]
  );

  if ((spot.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Spot not found" });
  }

  await pool.query(
    `UPDATE vehicles SET x = $1, y = $2, z = $3, heading = $4 WHERE id = $5`,
    [spot.rows[0].x, spot.rows[0].y, spot.rows[0].z, spot.rows[0].heading, parsed.data.vehicleId]
  );

  return res.json({ ok: true });
});

// Spawn vehicle from garage
garagesRouter.post("/spawn", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({
    vehicleId: z.number().int().positive(),
    x: z.number(),
    y: z.number(),
    z: z.number(),
    heading: z.number()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check vehicle ownership
  const vehicle = await pool.query(
    `SELECT owner_character_id FROM vehicles WHERE id = $1`,
    [parsed.data.vehicleId]
  );

  if ((vehicle.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Vehicle not found" });
  }

  if (vehicle.rows[0].owner_character_id !== characterId) {
    return res.status(403).json({ message: "You don't own this vehicle" });
  }

  // Update vehicle position and spawn
  await pool.query(
    `UPDATE vehicles SET x = $1, y = $2, z = $3, heading = $4, is_spawned = TRUE, garage_id = NULL WHERE id = $5`,
    [parsed.data.x, parsed.data.y, parsed.data.z, parsed.data.heading, parsed.data.vehicleId]
  );

  return res.json({ ok: true });
});

// Delete garage (admin only)
garagesRouter.delete("/:garageId", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const garageId = parseInt(req.params.garageId, 10);
  if (isNaN(garageId)) return res.status(400).json({ message: "Invalid garage ID" });

  await pool.query(
    `DELETE FROM garage_spots WHERE garage_id = $1`,
    [garageId]
  );

  await pool.query(
    `DELETE FROM garages WHERE id = $1`,
    [garageId]
  );

  return res.json({ ok: true });
});

// Delete spot (admin only)
garagesRouter.delete("/spots/:spotId", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const spotId = parseInt(req.params.spotId, 10);
  if (isNaN(spotId)) return res.status(400).json({ message: "Invalid spot ID" });

  await pool.query(
    `DELETE FROM garage_spots WHERE id = $1`,
    [spotId]
  );

  return res.json({ ok: true });
});
