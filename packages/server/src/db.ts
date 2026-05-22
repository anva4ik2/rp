import { Pool } from "pg";
import { config } from "./config.js";
import { initMajesticFactions } from "./modules/init-factions.js";

// SSL is required for Railway-hosted Postgres (containers-*.railway.app and
// *.rlwy.net hostnames) and for any provider that sets PGSSLMODE/DATABASE_SSL.
// Local development (localhost / 127.0.0.1) skips SSL.
const needsSsl =
  !/(localhost|127\.0\.0\.1)/.test(config.databaseUrl) &&
  (config.databaseUrl.includes("railway") ||
    config.databaseUrl.includes("rlwy.net") ||
    config.databaseUrl.includes("sslmode=require") ||
    process.env.PGSSLMODE === "require" ||
    process.env.DATABASE_SSL === "true");

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined
});

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS characters (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      money_cash INTEGER NOT NULL DEFAULT 1000,
      money_bank INTEGER NOT NULL DEFAULT 5000,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS economy_logs (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      item_code TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (character_id, item_code)
    );
  `);

  // Extended inventory with slots and items data
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_definitions (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('food', 'drink', 'medicine', 'weapon', 'ammo', 'clothing', 'tool', 'key', 'misc', 'illegal')),
      weight INTEGER NOT NULL DEFAULT 1,
      max_stack INTEGER NOT NULL DEFAULT 100,
      consumable BOOLEAN NOT NULL DEFAULT FALSE,
      effect_type TEXT CHECK (effect_type IN ('health', 'hunger', 'thirst', 'stamina', 'armor', 'none')),
      effect_value INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      price INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS inventory_slots (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      slot_number INTEGER NOT NULL,
      item_code TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      UNIQUE (character_id, slot_number)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS character_jobs (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      job_code TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT FALSE,
      cooldown_until TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (character_id, job_code)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      model_code TEXT NOT NULL,
      plate TEXT NOT NULL UNIQUE,
      fuel INTEGER NOT NULL DEFAULT 100,
      is_spawned BOOLEAN NOT NULL DEFAULT FALSE,
      impounded BOOLEAN NOT NULL DEFAULT FALSE,
      insurance_level INTEGER NOT NULL DEFAULT 0,
      tuning_stage INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_keys (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      owner_character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      granted_by_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (vehicle_id, owner_character_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_catalog_custom (
      model_code TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS factions (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('government', 'crime', 'business', 'gang')),
      invite_code TEXT NOT NULL UNIQUE,
      treasury INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS faction_members (
      id SERIAL PRIMARY KEY,
      faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      rank_code TEXT NOT NULL DEFAULT 'recruit',
      is_leader BOOLEAN NOT NULL DEFAULT FALSE,
      on_duty BOOLEAN NOT NULL DEFAULT FALSE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (character_id),
      UNIQUE (faction_id, character_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS faction_ranks (
      id SERIAL PRIMARY KEY,
      faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
      rank_code TEXT NOT NULL,
      rank_weight INTEGER NOT NULL DEFAULT 1,
      can_invite BOOLEAN NOT NULL DEFAULT FALSE,
      can_manage_treasury BOOLEAN NOT NULL DEFAULT FALSE,
      can_issue_wanted BOOLEAN NOT NULL DEFAULT FALSE,
      can_arrest BOOLEAN NOT NULL DEFAULT FALSE,
      can_manage_vehicles BOOLEAN NOT NULL DEFAULT FALSE,
      can_capture_territory BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (faction_id, rank_code)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS faction_vehicles (
      id SERIAL PRIMARY KEY,
      faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
      model_code TEXT NOT NULL,
      plate TEXT NOT NULL UNIQUE,
      min_rank_code TEXT NOT NULL DEFAULT 'recruit',
      fuel INTEGER NOT NULL DEFAULT 100,
      is_spawned BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS faction_treasury_logs (
      id SERIAL PRIMARY KEY,
      faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      amount INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wanted_records (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      wanted_level INTEGER NOT NULL CHECK (wanted_level BETWEEN 1 AND 5),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS arrest_records (
      id SERIAL PRIMARY KEY,
      officer_character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      suspect_character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      jail_minutes INTEGER NOT NULL DEFAULT 0,
      fine_amount INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS territories (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      controlling_faction_id INTEGER REFERENCES factions(id) ON DELETE SET NULL,
      influence INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS territory_capture_logs (
      id SERIAL PRIMARY KEY,
      territory_id INTEGER NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
      faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    INSERT INTO territories (code, name)
    VALUES ('LS_DOCKS', 'Los Santos Docks'),
           ('SANDY', 'Sandy Shores'),
           ('PALETO', 'Paleto Bay')
    ON CONFLICT (code) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO faction_ranks
      (faction_id, rank_code, rank_weight, can_invite, can_manage_treasury, can_issue_wanted, can_arrest, can_manage_vehicles, can_capture_territory)
    SELECT f.id, 'leader', 100, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
    FROM factions f
    ON CONFLICT (faction_id, rank_code) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO faction_ranks
      (faction_id, rank_code, rank_weight, can_invite, can_manage_treasury, can_issue_wanted, can_arrest, can_manage_vehicles, can_capture_territory)
    SELECT f.id, 'member', 10,
           FALSE,
           FALSE,
           CASE WHEN f.type = 'government' THEN TRUE ELSE FALSE END,
           CASE WHEN f.type = 'government' THEN TRUE ELSE FALSE END,
           FALSE,
           CASE WHEN f.type IN ('gang', 'crime') THEN TRUE ELSE FALSE END
    FROM factions f
    ON CONFLICT (faction_id, rank_code) DO NOTHING;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS character_appearance (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
      face_shape INTEGER,
      skin_tone INTEGER,
      hair_style INTEGER,
      hair_color INTEGER,
      eye_color INTEGER,
      UNIQUE (character_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS character_clothing (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      slot TEXT NOT NULL,
      drawable INTEGER NOT NULL,
      texture INTEGER NOT NULL DEFAULT 0,
      UNIQUE (character_id, slot)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS character_stats (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      health INTEGER NOT NULL DEFAULT 100,
      armor INTEGER NOT NULL DEFAULT 0,
      hunger INTEGER NOT NULL DEFAULT 100,
      thirst INTEGER NOT NULL DEFAULT 100,
      stamina INTEGER NOT NULL DEFAULT 100,
      strength INTEGER NOT NULL DEFAULT 0,
      UNIQUE (character_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS character_position (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      x FLOAT NOT NULL,
      y FLOAT NOT NULL,
      z FLOAT NOT NULL,
      heading FLOAT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (character_id)
    );
  `);

  // Houses system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS houses (
      id SERIAL PRIMARY KEY,
      entrance_x FLOAT NOT NULL,
      entrance_y FLOAT NOT NULL,
      entrance_z FLOAT NOT NULL,
      interior_id INTEGER NOT NULL,
      price INTEGER NOT NULL,
      owner_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      locked BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS house_furniture (
      id SERIAL PRIMARY KEY,
      house_id INTEGER NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
      furniture_code TEXT NOT NULL,
      x FLOAT NOT NULL,
      y FLOAT NOT NULL,
      z FLOAT NOT NULL,
      rotation_x FLOAT NOT NULL DEFAULT 0,
      rotation_y FLOAT NOT NULL DEFAULT 0,
      rotation_z FLOAT NOT NULL DEFAULT 0
    );
  `);

  // Business system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('shop_247', 'clothing', 'gunshop', 'bar', 'club', 'restaurant', 'gas_station')),
      name TEXT NOT NULL,
      entrance_x FLOAT NOT NULL,
      entrance_y FLOAT NOT NULL,
      entrance_z FLOAT NOT NULL,
      interior_id INTEGER NOT NULL,
      price INTEGER NOT NULL,
      owner_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      locked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS business_products (
      id SERIAL PRIMARY KEY,
      business_id INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      product_code TEXT NOT NULL,
      price INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 100
    );
  `);

  // Garages system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS garages (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('public', 'house', 'faction', 'police')),
      name TEXT NOT NULL,
      x FLOAT NOT NULL,
      y FLOAT NOT NULL,
      z FLOAT NOT NULL,
      max_vehicles INTEGER NOT NULL DEFAULT 10,
      price INTEGER NOT NULL DEFAULT 0,
      owner_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      owner_house_id INTEGER REFERENCES houses(id) ON DELETE SET NULL,
      owner_faction_id INTEGER REFERENCES factions(id) ON DELETE SET NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS garage_spots (
      id SERIAL PRIMARY KEY,
      garage_id INTEGER NOT NULL REFERENCES garages(id) ON DELETE CASCADE,
      spot_number INTEGER NOT NULL,
      x FLOAT NOT NULL,
      y FLOAT NOT NULL,
      z FLOAT NOT NULL,
      heading FLOAT NOT NULL DEFAULT 0
    );
  `);

  // NPC shops
  await pool.query(`
    CREATE TABLE IF NOT EXISTS npc_shops (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('shop_247', 'clothing', 'gunshop', 'car_dealer', 'fuel_station')),
      name TEXT NOT NULL,
      x FLOAT NOT NULL,
      y FLOAT NOT NULL,
      z FLOAT NOT NULL,
      heading FLOAT NOT NULL DEFAULT 0,
      model_hash TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS npc_shop_items (
      id SERIAL PRIMARY KEY,
      shop_id INTEGER NOT NULL REFERENCES npc_shops(id) ON DELETE CASCADE,
      item_code TEXT NOT NULL,
      price INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT -1
    );
  `);

  // Weapons system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS character_weapons (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      weapon_code TEXT NOT NULL,
      ammo INTEGER NOT NULL DEFAULT 0,
      durability INTEGER NOT NULL DEFAULT 100,
      UNIQUE (character_id, weapon_code)
    );
  `);

  // Licenses system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS character_licenses (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      license_type TEXT NOT NULL CHECK (license_type IN ('driving_a', 'driving_b', 'driving_c', 'weapon', 'business', 'fishing', 'hunting')),
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      UNIQUE (character_id, license_type)
    );
  `);

  // Bank system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      account_number TEXT NOT NULL UNIQUE,
      balance INTEGER NOT NULL DEFAULT 0,
      is_primary BOOLEAN NOT NULL DEFAULT TRUE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id SERIAL PRIMARY KEY,
      from_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
      to_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
      amount INTEGER NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Phone system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS phones (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      phone_number TEXT NOT NULL UNIQUE,
      balance INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS phone_contacts (
      id SERIAL PRIMARY KEY,
      phone_id INTEGER NOT NULL REFERENCES phones(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone_number TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS phone_messages (
      id SERIAL PRIMARY KEY,
      from_phone_id INTEGER REFERENCES phones(id) ON DELETE SET NULL,
      to_phone_id INTEGER REFERENCES phones(id) ON DELETE SET NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  // Chat logs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_logs (
      id SERIAL PRIMARY KEY,
      character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      chat_type TEXT NOT NULL CHECK (chat_type IN ('global', 'local', 'me', 'do', 'try', 'ooc', 'faction', 'whisper', 'shout')),
      message TEXT NOT NULL,
      x FLOAT,
      y FLOAT,
      z FLOAT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Admin actions
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id SERIAL PRIMARY KEY,
      admin_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      target_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Reports system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      target_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'rejected')),
      admin_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      response TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    );
  `);

  // Bans
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      expires_at TIMESTAMPTZ,
      permanent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Family system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS families (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      tag TEXT NOT NULL UNIQUE,
      leader_character_id INTEGER REFERENCES characters(id),
      treasury INTEGER DEFAULT 0,
      color TEXT DEFAULT '#FFFFFF',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_members (
      id SERIAL PRIMARY KEY,
      family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
      character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
      rank_code TEXT NOT NULL,
      rank_weight INTEGER NOT NULL DEFAULT 1,
      can_invite BOOLEAN DEFAULT FALSE,
      can_manage_treasury BOOLEAN DEFAULT FALSE,
      can_kick BOOLEAN DEFAULT FALSE,
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(character_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_ranks (
      id SERIAL PRIMARY KEY,
      family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
      rank_code TEXT NOT NULL,
      rank_name TEXT NOT NULL,
      rank_weight INTEGER NOT NULL,
      can_invite BOOLEAN DEFAULT FALSE,
      can_manage_treasury BOOLEAN DEFAULT FALSE,
      can_kick BOOLEAN DEFAULT FALSE,
      UNIQUE(family_id, rank_code)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_treasury_logs (
      id SERIAL PRIMARY KEY,
      family_id INTEGER REFERENCES families(id),
      character_id INTEGER REFERENCES characters(id),
      action TEXT NOT NULL,
      amount INTEGER,
      details TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Marketplace
  await pool.query(`
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id SERIAL PRIMARY KEY,
      seller_character_id INTEGER REFERENCES characters(id),
      listing_type TEXT NOT NULL, -- 'item', 'vehicle', 'property'
      item_code TEXT,
      vehicle_id INTEGER REFERENCES vehicles(id),
      house_id INTEGER REFERENCES houses(id),
      business_id INTEGER REFERENCES businesses(id),
      price INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'active', -- 'active', 'sold', 'cancelled'
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Tablet system
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tablet_apps (
      id SERIAL PRIMARY KEY,
      app_code TEXT NOT NULL UNIQUE,
      app_name TEXT NOT NULL,
      category TEXT NOT NULL,
      icon TEXT,
      description TEXT
    );
  `);

  // Extended jobs for Majestic RP
  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_checkpoints (
      id SERIAL PRIMARY KEY,
      job_code TEXT NOT NULL,
      checkpoint_order INTEGER NOT NULL,
      x FLOAT NOT NULL,
      y FLOAT NOT NULL,
      z FLOAT NOT NULL,
      radius FLOAT NOT NULL DEFAULT 5
    );
  `);

  // ---------------------------------------------------------------------------
  // RAGE MP edition migrations (idempotent)
  // ---------------------------------------------------------------------------

  // Admin levels on users (0 = player, 1..5 = admin tiers, 5 = founder)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_level INTEGER NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS social_id TEXT;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_social_id_uniq ON users (social_id) WHERE social_id IS NOT NULL;`);

  // Starter vehicle flag (one-time gift per character)
  await pool.query(`ALTER TABLE characters ADD COLUMN IF NOT EXISTS starter_vehicle_granted BOOLEAN NOT NULL DEFAULT FALSE;`);

  // Persisted last position/heading/fuel of vehicles
  await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS pos_x FLOAT;`);
  await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS pos_y FLOAT;`);
  await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS pos_z FLOAT;`);
  await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS heading FLOAT;`);
  await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT TRUE;`);

  // Death log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS death_logs (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      killer_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      reason TEXT,
      x FLOAT, y FLOAT, z FLOAT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Ban types: demorgan (slow time 1:10) vs hard (permanent forever)
  await pool.query(`ALTER TABLE bans ADD COLUMN IF NOT EXISTS ban_type TEXT NOT NULL DEFAULT 'temp';`);
  await pool.query(`ALTER TABLE bans ADD COLUMN IF NOT EXISTS demorgan_minutes INTEGER;`);

  // De Morgan tracking: stores when the ban was issued so we can compute
  // remaining time with 10x slowdown (1 real second = 0.1 ban second).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS demorgan_tracking (
      id SERIAL PRIMARY KEY,
      ban_id INTEGER NOT NULL REFERENCES bans(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      remaining_minutes INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Ownership IDs for vehicles and items (unique server-wide IDs for admin teleport/give)
  await pool.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ownership_id TEXT UNIQUE;`);
  await pool.query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS ownership_id TEXT UNIQUE;`);
  await pool.query(`ALTER TABLE houses ADD COLUMN IF NOT EXISTS ownership_id TEXT UNIQUE;`);
  await pool.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ownership_id TEXT UNIQUE;`);

  // Prison / demorgan records (in-game jail time, separate from bans)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prison_records (
      id SERIAL PRIMARY KEY,
      character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      minutes INTEGER NOT NULL DEFAULT 10,
      officer_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      released_at TIMESTAMPTZ
    );
  `);

  // Admin spectate / report TP tracking
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_spectate_logs (
      id SERIAL PRIMARY KEY,
      admin_character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      target_character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
      action TEXT NOT NULL, -- 'start', 'stop', 'tp_map', 'tp_report', 'tp_player', 'tp_vehicle'
      x FLOAT, y FLOAT, z FLOAT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Initialize Majestic RP factions
  await initMajesticFactions();
}
