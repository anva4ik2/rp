import { pool } from "../db.js";

// Majestic RP factions initialization
export async function initMajesticFactions(): Promise<void> {
  console.log("[init] Initializing Majestic RP factions...");

  // Government factions
  const governmentFactions = [
    {
      name: "LSPD - Полиция Лос-Сантоса",
      type: "government" as const,
      inviteCode: "LSPD",
      ranks: [
        { code: "cadet", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: true, canArrest: true, canManageVehicles: false, canCaptureTerritory: false },
        { code: "officer", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "sergeant", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "lieutenant", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "captain", weight: 70, canInvite: true, canManageTreasury: true, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "chief", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false }
      ]
    },
    {
      name: "FIB - Федеральное бюро расследований",
      type: "government" as const,
      inviteCode: "FIB",
      ranks: [
        { code: "agent", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "special_agent", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "senior_agent", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "assistant_director", weight: 70, canInvite: true, canManageTreasury: true, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "director", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false }
      ]
    },
    {
      name: "EMS - Скорая помощь",
      type: "government" as const,
      inviteCode: "EMS",
      ranks: [
        { code: "intern", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: false },
        { code: "paramedic", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false },
        { code: "doctor", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false },
        { code: "senior_doctor", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false },
        { code: "chief_medical", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false }
      ]
    },
    {
      name: "FIB - Спецназ",
      type: "government" as const,
      inviteCode: "SWAT",
      ranks: [
        { code: "recruit", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: true, canArrest: true, canManageVehicles: false, canCaptureTerritory: false },
        { code: "operator", weight: 30, canInvite: false, canManageTreasury: false, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "team_leader", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false },
        { code: "commander", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: true, canArrest: true, canManageVehicles: true, canCaptureTerritory: false }
      ]
    }
  ];

  // Crime factions (ОПГ)
  const crimeFactions = [
    {
      name: "Балласы",
      type: "gang" as const,
      inviteCode: "BALLAS",
      ranks: [
        { code: "novice", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "soldier", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "enforcer", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "og", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "leader", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    },
    {
      name: "Вагос",
      type: "gang" as const,
      inviteCode: "VAGOS",
      ranks: [
        { code: "novice", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "soldier", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "enforcer", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "og", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "leader", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    },
    {
      name: "Фамилиас",
      type: "gang" as const,
      inviteCode: "FAMILIES",
      ranks: [
        { code: "novice", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "soldier", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "enforcer", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "og", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "leader", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    },
    {
      name: "Ацтекас",
      type: "gang" as const,
      inviteCode: "AZTECAS",
      ranks: [
        { code: "novice", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "soldier", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "enforcer", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "og", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "leader", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    },
    {
      name: "Мара Salvatrucha",
      type: "gang" as const,
      inviteCode: "MS13",
      ranks: [
        { code: "novice", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "soldier", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "enforcer", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "og", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "leader", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    },
    {
      name: "Sang",
      type: "gang" as const,
      inviteCode: "SANG",
      ranks: [
        { code: "novice", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "soldier", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "enforcer", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "og", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "leader", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    }
  ];

  // Mafia factions
  const mafiaFactions = [
    {
      name: "Русская мафия",
      type: "crime" as const,
      inviteCode: "RUSMAFIA",
      ranks: [
        { code: "shesterka", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "boyevik", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "avtoritet", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "pakhan", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "vor", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    },
    {
      name: "Итальянская мафия",
      type: "crime" as const,
      inviteCode: "ITALIAN",
      ranks: [
        { code: "associate", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "soldier", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "capo", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "underboss", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "don", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    },
    {
      name: "Картель",
      type: "crime" as const,
      inviteCode: "CARTEL",
      ranks: [
        { code: "sicario", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "lieutenant", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "capo", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "boss", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "el_jefe", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    },
    {
      name: "Якудза",
      type: "crime" as const,
      inviteCode: "YAKUZA",
      ranks: [
        { code: "wakagashira", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: true },
        { code: "kyodai", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "shatei", weight: 30, canInvite: true, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "so-honbucho", weight: 50, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true },
        { code: "oyabun", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: true }
      ]
    }
  ];

  // Business factions
  const businessFactions = [
    {
      name: "Такси",
      type: "business" as const,
      inviteCode: "TAXI",
      ranks: [
        { code: "driver", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false },
        { code: "dispatcher", weight: 30, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false },
        { code: "manager", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false }
      ]
    },
    {
      name: "Механики",
      type: "business" as const,
      inviteCode: "MECHANIC",
      ranks: [
        { code: "apprentice", weight: 1, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: false, canCaptureTerritory: false },
        { code: "mechanic", weight: 10, canInvite: false, canManageTreasury: false, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false },
        { code: "master", weight: 30, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false },
        { code: "owner", weight: 100, canInvite: true, canManageTreasury: true, canIssueWanted: false, canArrest: false, canManageVehicles: true, canCaptureTerritory: false }
      ]
    }
  ];

  const allFactions = [...governmentFactions, ...crimeFactions, ...mafiaFactions, ...businessFactions];

  for (const faction of allFactions) {
    // Create faction
    const result = await pool.query(
      `INSERT INTO factions (name, type, invite_code, treasury)
       VALUES ($1, $2, $3, 0)
       ON CONFLICT (invite_code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [faction.name, faction.type, faction.inviteCode]
    );

    const factionId = result.rows[0].id;

    // Create ranks
    for (const rank of faction.ranks) {
      await pool.query(
        `INSERT INTO faction_ranks
           (faction_id, rank_code, rank_weight, can_invite, can_manage_treasury, can_issue_wanted, can_arrest, can_manage_vehicles, can_capture_territory)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (faction_id, rank_code)
         DO UPDATE SET
           rank_weight = EXCLUDED.rank_weight,
           can_invite = EXCLUDED.can_invite,
           can_manage_treasury = EXCLUDED.can_manage_treasury,
           can_issue_wanted = EXCLUDED.can_issue_wanted,
           can_arrest = EXCLUDED.can_arrest,
           can_manage_vehicles = EXCLUDED.can_manage_vehicles,
           can_capture_territory = EXCLUDED.can_capture_territory`,
        [
          factionId,
          rank.code,
          rank.weight,
          rank.canInvite,
          rank.canManageTreasury,
          rank.canIssueWanted,
          rank.canArrest,
          rank.canManageVehicles,
          rank.canCaptureTerritory
        ]
      );
    }

    console.log(`[init] Created faction: ${faction.name} (${faction.type})`);
  }

  console.log("[init] Majestic RP factions initialized successfully!");
}
