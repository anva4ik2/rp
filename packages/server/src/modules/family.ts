import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";

const createFamilySchema = z.object({
  name: z.string().min(2).max(30),
  tag: z.string().min(2).max(6).toUpperCase(),
  color: z.string().optional()
});

const inviteMemberSchema = z.object({
  targetCharacterId: z.number().int().positive()
});

const depositSchema = z.object({
  amount: z.number().int().min(1).max(1000000)
});

const setRankSchema = z.object({
  memberCharacterId: z.number().int().positive(),
  rankCode: z.string()
});

const kickMemberSchema = z.object({
  memberCharacterId: z.number().int().positive()
});

const createRankSchema = z.object({
  rankCode: z.string(),
  rankName: z.string(),
  rankWeight: z.number().int().min(1).max(100),
  canInvite: z.boolean().optional(),
  canManageTreasury: z.boolean().optional(),
  canKick: z.boolean().optional()
});

export const familyRouter = Router();

// Get my family
familyRouter.get("/me", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const membership = await pool.query(
    `SELECT fm.id, fm.family_id, fm.rank_code, fm.rank_weight, fm.can_invite, fm.can_manage_treasury, fm.can_kick,
            f.name as family_name, f.tag, f.color, f.treasury,
            c.first_name as leader_first_name, c.last_name as leader_last_name
     FROM family_members fm
     JOIN families f ON fm.family_id = f.id
     LEFT JOIN characters c ON f.leader_character_id = c.id
     WHERE fm.character_id = $1`,
    [characterId]
  );

  if (membership.rowCount === 0) {
    return res.json({ family: null });
  }

  // Get all family members
  const members = await pool.query(
    `SELECT fm.character_id, fm.rank_code, fm.rank_weight, fm.joined_at,
            c.first_name, c.last_name
     FROM family_members fm
     JOIN characters c ON fm.character_id = c.id
     WHERE fm.family_id = $1
     ORDER BY fm.rank_weight DESC, fm.joined_at ASC`,
    [membership.rows[0].family_id]
  );

  return res.json({
    family: {
      id: membership.rows[0].family_id,
      name: membership.rows[0].family_name,
      tag: membership.rows[0].tag,
      color: membership.rows[0].color,
      treasury: membership.rows[0].treasury,
      leader: membership.rows[0].leader_first_name ? `${membership.rows[0].leader_first_name} ${membership.rows[0].leader_last_name}` : null,
      myRank: membership.rows[0].rank_code,
      myRankWeight: membership.rows[0].rank_weight,
      canInvite: membership.rows[0].can_invite,
      canManageTreasury: membership.rows[0].can_manage_treasury,
      canKick: membership.rows[0].can_kick,
      members: members.rows.map(m => ({
        characterId: m.character_id,
        name: `${m.first_name} ${m.last_name}`,
        rankCode: m.rank_code,
        rankWeight: m.rank_weight,
        joinedAt: m.joined_at
      }))
    }
  });
});

// Create family
familyRouter.post("/", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = createFamilySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const creationCost = 50000;

  // Check if already in a family
  const existingMembership = await pool.query(
    `SELECT id FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((existingMembership.rowCount ?? 0) > 0) {
    return res.status(400).json({ message: "Already in a family" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check money
    const character = await client.query(
      `SELECT money_bank FROM characters WHERE id = $1`,
      [characterId]
    );

    if ((character.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Character not found" });
    }

    if (character.rows[0].money_bank < creationCost) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough money" });
    }

    // Create family
    const familyResult = await client.query(
      `INSERT INTO families (name, tag, leader_character_id, color)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [parsed.data.name, parsed.data.tag, characterId, parsed.data.color ?? '#FFFFFF']
    );

    // Add leader as member
    await client.query(
      `INSERT INTO family_members (family_id, character_id, rank_code, rank_weight, can_invite, can_manage_treasury, can_kick)
       VALUES ($1, $2, 'leader', 100, TRUE, TRUE, TRUE)`,
      [familyResult.rows[0].id, characterId]
    );

    // Create default ranks
    await client.query(
      `INSERT INTO family_ranks (family_id, rank_code, rank_name, rank_weight, can_invite, can_manage_treasury, can_kick)
       VALUES 
        ($1, 'leader', 'Глава', 100, TRUE, TRUE, TRUE),
        ($1, 'right_hand', 'Правая рука', 80, TRUE, TRUE, TRUE),
        ($1, 'member', 'Член', 10, FALSE, FALSE, FALSE)`,
      [familyResult.rows[0].id]
    );

    // Deduct money
    await client.query(
      `UPDATE characters SET money_bank = money_bank - $1 WHERE id = $2`,
      [creationCost, characterId]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      ok: true,
      familyId: familyResult.rows[0].id,
      cost: creationCost
    });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Failed to create family" });
  } finally {
    client.release();
  }
});

// Invite member
familyRouter.post("/invite", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = inviteMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // Check permissions
  const membership = await pool.query(
    `SELECT family_id, can_invite FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0 || !membership.rows[0].can_invite) {
    return res.status(403).json({ message: "No permission to invite" });
  }

  // Check if target already in a family
  const targetMembership = await pool.query(
    `SELECT id FROM family_members WHERE character_id = $1`,
    [parsed.data.targetCharacterId]
  );

  if ((targetMembership.rowCount ?? 0) > 0) {
    return res.status(400).json({ message: "Target already in a family" });
  }

  await pool.query(
    `INSERT INTO family_members (family_id, character_id, rank_code, rank_weight)
     VALUES ($1, $2, 'member', 10)`,
    [membership.rows[0].family_id, parsed.data.targetCharacterId]
  );

  return res.json({ ok: true });
});

// Deposit to family treasury
familyRouter.post("/treasury/deposit", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const membership = await pool.query(
    `SELECT family_id FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Not in a family" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check money
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

    // Deduct and deposit
    await client.query(
      `UPDATE characters SET money_cash = money_cash - $1 WHERE id = $2`,
      [parsed.data.amount, characterId]
    );

    await client.query(
      `UPDATE families SET treasury = treasury + $1 WHERE id = $2`,
      [parsed.data.amount, membership.rows[0].family_id]
    );

    // Log transaction
    await client.query(
      `INSERT INTO family_treasury_logs (family_id, character_id, action, amount, details)
       VALUES ($1, $2, 'deposit', $3, 'Cash deposit')`,
      [membership.rows[0].family_id, characterId, parsed.data.amount]
    );

    await client.query("COMMIT");

    return res.json({ ok: true, amount: parsed.data.amount });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Deposit failed" });
  } finally {
    client.release();
  }
});

// Withdraw from family treasury
familyRouter.post("/treasury/withdraw", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = depositSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const membership = await pool.query(
    `SELECT family_id, can_manage_treasury FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0 || !membership.rows[0].can_manage_treasury) {
    return res.status(403).json({ message: "No permission to withdraw" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check treasury
    const family = await client.query(
      `SELECT treasury FROM families WHERE id = $1`,
      [membership.rows[0].family_id]
    );

    if ((family.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Family not found" });
    }

    if (family.rows[0].treasury < parsed.data.amount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Not enough funds in treasury" });
    }

    // Withdraw and add to character
    await client.query(
      `UPDATE families SET treasury = treasury - $1 WHERE id = $2`,
      [parsed.data.amount, membership.rows[0].family_id]
    );

    await client.query(
      `UPDATE characters SET money_cash = money_cash + $1 WHERE id = $2`,
      [parsed.data.amount, characterId]
    );

    // Log transaction
    await client.query(
      `INSERT INTO family_treasury_logs (family_id, character_id, action, amount, details)
       VALUES ($1, $2, 'withdraw', $3, 'Cash withdrawal')`,
      [membership.rows[0].family_id, characterId, parsed.data.amount]
    );

    await client.query("COMMIT");

    return res.json({ ok: true, amount: parsed.data.amount });
  } catch {
    await client.query("ROLLBACK");
    return res.status(500).json({ message: "Withdrawal failed" });
  } finally {
    client.release();
  }
});

// Set member rank
familyRouter.post("/rank", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = setRankSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const membership = await pool.query(
    `SELECT family_id, rank_weight FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Not in a family" });
  }

  // Check if target is in same family
  const targetMembership = await pool.query(
    `SELECT family_id FROM family_members WHERE character_id = $1`,
    [parsed.data.memberCharacterId]
  );

  if ((targetMembership.rowCount ?? 0) === 0 || targetMembership.rows[0].family_id !== membership.rows[0].family_id) {
    return res.status(400).json({ message: "Target not in your family" });
  }

  // Get rank details
  const rank = await pool.query(
    `SELECT rank_weight, can_invite, can_manage_treasury, can_kick
     FROM family_ranks
     WHERE family_id = $1 AND rank_code = $2`,
    [membership.rows[0].family_id, parsed.data.rankCode]
  );

  if ((rank.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Rank not found" });
  }

  // Check if my rank is higher than target rank
  if (membership.rows[0].rank_weight <= rank.rows[0].rank_weight) {
    return res.status(403).json({ message: "Cannot set rank equal or higher than yours" });
  }

  await pool.query(
    `UPDATE family_members
     SET rank_code = $1, rank_weight = $2, can_invite = $3, can_manage_treasury = $4, can_kick = $5
     WHERE character_id = $6`,
    [parsed.data.rankCode, rank.rows[0].rank_weight, rank.rows[0].can_invite, rank.rows[0].can_manage_treasury, rank.rows[0].can_kick, parsed.data.memberCharacterId]
  );

  return res.json({ ok: true });
});

// Kick member
familyRouter.post("/kick", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = kickMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const membership = await pool.query(
    `SELECT family_id, rank_weight, can_kick FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0 || !membership.rows[0].can_kick) {
    return res.status(403).json({ message: "No permission to kick" });
  }

  // Check if target is in same family
  const targetMembership = await pool.query(
    `SELECT family_id, rank_weight FROM family_members WHERE character_id = $1`,
    [parsed.data.memberCharacterId]
  );

  if ((targetMembership.rowCount ?? 0) === 0 || targetMembership.rows[0].family_id !== membership.rows[0].family_id) {
    return res.status(400).json({ message: "Target not in your family" });
  }

  // Check if my rank is higher than target rank
  if (membership.rows[0].rank_weight <= targetMembership.rows[0].rank_weight) {
    return res.status(403).json({ message: "Cannot kick member with equal or higher rank" });
  }

  await pool.query(
    `DELETE FROM family_members WHERE character_id = $1`,
    [parsed.data.memberCharacterId]
  );

  return res.json({ ok: true });
});

// Leave family
familyRouter.post("/leave", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const membership = await pool.query(
    `SELECT family_id, rank_code FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Not in a family" });
  }

  if (membership.rows[0].rank_code === 'leader') {
    return res.status(400).json({ message: "Leader cannot leave family" });
  }

  await pool.query(
    `DELETE FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  return res.json({ ok: true });
});

// Create custom rank
familyRouter.post("/ranks", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const parsed = createRankSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const membership = await pool.query(
    `SELECT family_id, rank_code FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Not in a family" });
  }

  if (membership.rows[0].rank_code !== 'leader') {
    return res.status(403).json({ message: "Only leader can create ranks" });
  }

  await pool.query(
    `INSERT INTO family_ranks (family_id, rank_code, rank_name, rank_weight, can_invite, can_manage_treasury, can_kick)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [membership.rows[0].family_id, parsed.data.rankCode, parsed.data.rankName, parsed.data.rankWeight, parsed.data.canInvite ?? false, parsed.data.canManageTreasury ?? false, parsed.data.canKick ?? false]
  );

  return res.status(201).json({ ok: true });
});

// Get family ranks
familyRouter.get("/ranks", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const membership = await pool.query(
    `SELECT family_id FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Not in a family" });
  }

  const ranks = await pool.query(
    `SELECT rank_code, rank_name, rank_weight, can_invite, can_manage_treasury, can_kick
     FROM family_ranks
     WHERE family_id = $1
     ORDER BY rank_weight DESC`,
    [membership.rows[0].family_id]
  );

  return res.json({
    ranks: ranks.rows.map(r => ({
      code: r.rank_code,
      name: r.rank_name,
      weight: r.rank_weight,
      canInvite: r.can_invite,
      canManageTreasury: r.can_manage_treasury,
      canKick: r.can_kick
    }))
  });
});

// Get treasury logs
familyRouter.get("/treasury/logs", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const membership = await pool.query(
    `SELECT family_id FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Not in a family" });
  }

  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 20;

  const logs = await pool.query(
    `SELECT ftl.action, ftl.amount, ftl.details, ftl.created_at,
            c.first_name, c.last_name
     FROM family_treasury_logs ftl
     LEFT JOIN characters c ON ftl.character_id = c.id
     WHERE ftl.family_id = $1
     ORDER BY ftl.created_at DESC
     LIMIT $2`,
    [membership.rows[0].family_id, limit]
  );

  return res.json({
    logs: logs.rows.map(row => ({
      action: row.action,
      amount: row.amount,
      details: row.details,
      character: row.first_name ? `${row.first_name} ${row.last_name}` : null,
      createdAt: row.created_at
    }))
  });
});
