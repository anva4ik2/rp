import { randomBytes } from "node:crypto";
import { pool } from "../db.js";

const STARTER_MODEL = process.env.STARTER_VEHICLE_MODEL ?? "blista";

function generatePlate(): string {
  return `RP-${randomBytes(2).toString("hex").toUpperCase()}`;
}
function generateOwnershipId(): string {
  return `VEH-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * Gifts a starter vehicle + keys to a character so the player can drive
 * immediately on first join. Idempotent: respects `characters.starter_vehicle_granted`.
 */
export async function grantStarterVehicleIfNeeded(characterId: number): Promise<void> {
  const c = await pool.query<{ starter_vehicle_granted: boolean }>(
    `SELECT starter_vehicle_granted FROM characters WHERE id = $1`,
    [characterId]
  );
  if (c.rowCount === 0 || c.rows[0].starter_vehicle_granted) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const veh = await client.query<{ id: number }>(
      `INSERT INTO vehicles (character_id, model_code, plate, fuel, locked, ownership_id)
       VALUES ($1, $2, $3, 100, TRUE, $4)
       RETURNING id`,
      [characterId, STARTER_MODEL, generatePlate(), generateOwnershipId()]
    );
    await client.query(
      `INSERT INTO vehicle_keys (vehicle_id, owner_character_id, granted_by_character_id)
       VALUES ($1, $2, NULL)
       ON CONFLICT (vehicle_id, owner_character_id) DO NOTHING`,
      [veh.rows[0].id, characterId]
    );
    await client.query(
      `UPDATE characters SET starter_vehicle_granted = TRUE WHERE id = $1`,
      [characterId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[starter] failed:", error);
  } finally {
    client.release();
  }
}
