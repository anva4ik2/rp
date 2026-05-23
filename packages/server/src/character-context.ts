import { pool } from "./db.js";

export async function getCharacterIdByUserId(userId: number): Promise<number | null> {
  const character = await pool.query<{ id: number }>(
    `SELECT id FROM characters WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (character.rowCount === 0) return null;
  return character.rows[0].id;
}
