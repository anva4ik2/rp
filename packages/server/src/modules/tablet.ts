import { Router } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { getUserIdFromRequest } from "../auth.js";
import { getCharacterIdByUserId } from "../character-context.js";
import { getFactionMembershipByCharacterId } from "../faction-context.js";

const tabletApps: Array<{ code: string; name: string; category: string; icon: string; description: string }> = [
  { code: "family", name: "Семья", category: "social", icon: "users", description: "Управление семьей" },
  { code: "faction", name: "Фракция", category: "organization", icon: "shield", description: "Управление фракцией" },
  { code: "house", name: "Дом", category: "property", icon: "home", description: "Управление домом" },
  { code: "business", name: "Бизнес", category: "property", icon: "briefcase", description: "Управление бизнесом" },
  { code: "marketplace", name: "Маркетплейс", category: "shop", icon: "shopping-bag", description: "Покупка и продажа" },
  { code: "bank", name: "Банк", category: "finance", icon: "dollar-sign", description: "Банковские операции" },
  { code: "jobs", name: "Работы", category: "work", icon: "briefcase", description: "Поиск работы" },
  { code: "news", name: "Новости", category: "media", icon: "newspaper", description: "Новости города" },
  { code: "map", name: "Карта", category: "navigation", icon: "map", description: "Карта города" },
  { code: "settings", name: "Настройки", category: "system", icon: "cog", description: "Настройки планшета" }
];

export const tabletRouter = Router();

// Get tablet apps
tabletRouter.get("/apps", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  // Get character's affiliations
  const familyMembership = await pool.query(
    `SELECT family_id FROM family_members WHERE character_id = $1`,
    [characterId]
  );

  const factionMembership = await getFactionMembershipByCharacterId(characterId);
  const houseOwnership = await pool.query(
    `SELECT id FROM houses WHERE owner_character_id = $1`,
    [characterId]
  );

  const businessOwnership = await pool.query(
    `SELECT id FROM businesses WHERE owner_character_id = $1`,
    [characterId]
  );

  // Filter apps based on affiliations
  const availableApps = tabletApps.filter(app => {
    if (app.code === "family" && (familyMembership.rowCount ?? 0) === 0) return false;
    if (app.code === "faction" && !factionMembership) return false;
    if (app.code === "house" && (houseOwnership.rowCount ?? 0) === 0) return false;
    if (app.code === "business" && (businessOwnership.rowCount ?? 0) === 0) return false;
    return true;
  });

  return res.json({
    apps: availableApps
  });
});

// Get family data for tablet
tabletRouter.get("/family", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const membership = await pool.query(
    `SELECT fm.family_id, fm.rank_code, fm.rank_weight, fm.can_invite, fm.can_manage_treasury, fm.can_kick,
            f.name as family_name, f.tag, f.color, f.treasury
     FROM family_members fm
     JOIN families f ON fm.family_id = f.id
     WHERE fm.character_id = $1`,
    [characterId]
  );

  if ((membership.rowCount ?? 0) === 0) {
    return res.json({ family: null });
  }

  const members = await pool.query(
    `SELECT fm.character_id, fm.rank_code, fm.rank_weight, fm.joined_at, fm.is_online,
            c.first_name, c.last_name
     FROM family_members fm
     JOIN characters c ON fm.character_id = c.id
     WHERE fm.family_id = $1
     ORDER BY fm.rank_weight DESC`,
    [membership.rows[0].family_id]
  );

  return res.json({
    family: {
      id: membership.rows[0].family_id,
      name: membership.rows[0].family_name,
      tag: membership.rows[0].tag,
      color: membership.rows[0].color,
      treasury: membership.rows[0].treasury,
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
        isOnline: m.is_online,
        joinedAt: m.joined_at
      }))
    }
  });
});

// Get faction data for tablet
tabletRouter.get("/faction", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const membership = await getFactionMembershipByCharacterId(characterId);
  if (!membership) {
    return res.json({ faction: null });
  }

  // Get faction details
  const factionDetails = await pool.query(
    `SELECT name, treasury FROM factions WHERE id = $1`,
    [membership.factionId]
  );

  // Get rank details
  const rankDetails = await pool.query(
    `SELECT rank_weight FROM faction_ranks WHERE faction_id = $1 AND rank_code = $2`,
    [membership.factionId, membership.rankCode]
  );

  const members = await pool.query(
    `SELECT fm.character_id, fm.rank_code, fm.on_duty,
            c.first_name, c.last_name
     FROM faction_members fm
     JOIN characters c ON fm.character_id = c.id
     WHERE fm.faction_id = $1
     ORDER BY fm.rank_weight DESC`,
    [membership.factionId]
  );

  return res.json({
    faction: {
      id: membership.factionId,
      name: factionDetails.rows[0]?.name || "Unknown",
      type: membership.factionType,
      treasury: factionDetails.rows[0]?.treasury || 0,
      myRank: membership.rankCode,
      myRankWeight: rankDetails.rows[0]?.rank_weight || 0,
      onDuty: membership.onDuty,
      members: members.rows.map(m => ({
        characterId: m.character_id,
        name: `${m.first_name} ${m.last_name}`,
        rankCode: m.rank_code,
        onDuty: m.on_duty
      }))
    }
  });
});

// Get house data for tablet
tabletRouter.get("/house", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const house = await pool.query(
    `SELECT h.id, h.entrance_x, h.entrance_y, h.entrance_z, h.interior_id, h.price, h.locked
     FROM houses h
     WHERE h.owner_character_id = $1`,
    [characterId]
  );

  if ((house.rowCount ?? 0) === 0) {
    return res.json({ house: null });
  }

  const furniture = await pool.query(
    `SELECT id, furniture_code, x, y, z FROM house_furniture WHERE house_id = $1`,
    [house.rows[0].id]
  );

  return res.json({
    house: {
      id: house.rows[0].id,
      entrance: { x: house.rows[0].entrance_x, y: house.rows[0].entrance_y, z: house.rows[0].entrance_z },
      interiorId: house.rows[0].interior_id,
      price: house.rows[0].price,
      locked: house.rows[0].locked,
      furnitureCount: furniture.rowCount ?? 0
    }
  });
});

// Get business data for tablet
tabletRouter.get("/business", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const business = await pool.query(
    `SELECT b.id, b.type, b.name, b.entrance_x, b.entrance_y, b.entrance_z, b.price, b.balance, b.locked
     FROM businesses b
     WHERE b.owner_character_id = $1`,
    [characterId]
  );

  if ((business.rowCount ?? 0) === 0) {
    return res.json({ business: null });
  }

  const products = await pool.query(
    `SELECT id, product_code, price, stock FROM business_products WHERE business_id = $1`,
    [business.rows[0].id]
  );

  return res.json({
    business: {
      id: business.rows[0].id,
      type: business.rows[0].type,
      name: business.rows[0].name,
      entrance: { x: business.rows[0].entrance_x, y: business.rows[0].entrance_y, z: business.rows[0].entrance_z },
      price: business.rows[0].price,
      balance: business.rows[0].balance,
      locked: business.rows[0].locked,
      productsCount: products.rowCount ?? 0
    }
  });
});

// Get bank data for tablet
tabletRouter.get("/bank", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const character = await pool.query(
    `SELECT money_cash, money_bank FROM characters WHERE id = $1`,
    [characterId]
  );

  if ((character.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: "Character not found" });
  }

  const accounts = await pool.query(
    `SELECT id, account_number, balance, is_primary FROM bank_accounts WHERE character_id = $1`,
    [characterId]
  );

  return res.json({
    bank: {
      cash: character.rows[0].money_cash,
      bank: character.rows[0].money_bank,
      accounts: accounts.rows.map(a => ({
        id: a.id,
        accountNumber: a.account_number,
        balance: a.balance,
        isPrimary: a.is_primary
      }))
    }
  });
});

// Get jobs data for tablet
tabletRouter.get("/jobs", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const jobData = await pool.query(
    `SELECT job_code, level, xp, total_earnings FROM character_jobs WHERE character_id = $1`,
    [characterId]
  );

  const availableJobs = [
    { code: "courier", name: "Курьер", payout: 250 },
    { code: "miner", name: "Шахтер", payout: 320 },
    { code: "taxi", name: "Таксист", payout: 280 },
    { code: "medic", name: "Медик", payout: 360 },
    { code: "mechanic", name: "Механик", payout: 330 },
    { code: "tow", name: "Эвакуатор", payout: 300 },
    { code: "trucker", name: "Дальнобойщик", payout: 450 },
    { code: "security", name: "Инкассатор", payout: 500 },
    { code: "garbage", name: "Мусорщик", payout: 280 },
    { code: "bus", name: "Автобусник", payout: 350 },
    { code: "postman", name: "Почтальон", payout: 220 },
    { code: "farmer", name: "Фермер", payout: 300 },
    { code: "fisherman", name: "Рыбак", payout: 280 },
    { code: "lumberjack", name: "Лесоруб", payout: 340 },
    { code: "pizza", name: "Доставка пиццы", payout: 260 },
    { code: "waiter", name: "Официант", payout: 240 },
    { code: "bartender", name: "Бармен", payout: 270 },
    { code: "warehouse", name: "Кладовщик", payout: 320 },
    { code: "construction", name: "Строитель", payout: 380 },
    { code: "fuel", name: "Развозчик топлива", payout: 310 },
    { code: "janitor", name: "Дворник", payout: 230 }
  ];

  return res.json({
    jobs: {
      current: (jobData.rowCount ?? 0) > 0 ? {
        code: jobData.rows[0].job_code,
        level: jobData.rows[0].level,
        xp: jobData.rows[0].xp,
        totalEarnings: jobData.rows[0].total_earnings
      } : null,
      available: availableJobs
    }
  });
});

// Get news data for tablet
tabletRouter.get("/news", async (req, res) => {
  const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 10;

  // For now, return sample news (in real implementation, this would come from a database table)
  const news = [
    { id: 1, title: "Открытие нового бизнес-центра", content: "В центре города открылся новый бизнес-центр с множеством офисов и магазинов.", date: new Date().toISOString(), category: "economy" },
    { id: 2, title: "Полиция усиливает патрулирование", content: "LSPD объявляет об усилении патрулирования в ночное время.", date: new Date(Date.now() - 86400000).toISOString(), category: "crime" },
    { id: 3, title: "Городской фестиваль на выходных", content: "На выходных будет проходить городской фестиваль с концертами и ярмаркой.", date: new Date(Date.now() - 172800000).toISOString(), category: "events" }
  ];

  return res.json({
    news: news.slice(0, limit)
  });
});

// Toggle tablet state
tabletRouter.post("/toggle", async (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return res.status(404).json({ message: "Character not found" });

  const schema = z.object({ isOpen: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  // In a real implementation, this would update the character's tablet state
  // For now, just return success
  return res.json({ ok: true, isOpen: parsed.data.isOpen });
});
