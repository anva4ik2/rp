import { pool } from "./db.js";

export type FactionMembership = {
  factionId: number;
  factionType: "government" | "crime" | "business" | "gang";
  rankCode: string;
  isLeader: boolean;
  onDuty: boolean;
};

export type FactionPermissions = {
  canInvite: boolean;
  canManageTreasury: boolean;
  canIssueWanted: boolean;
  canArrest: boolean;
  canManageVehicles: boolean;
  canCaptureTerritory: boolean;
};

export async function getFactionMembershipByCharacterId(
  characterId: number
): Promise<FactionMembership | null> {
  const membership = await pool.query<{
    faction_id: number;
    faction_type: "government" | "crime" | "business" | "gang";
    rank_code: string;
    is_leader: boolean;
    on_duty: boolean;
  }>(
    `SELECT fm.faction_id,
            f.type AS faction_type,
            fm.rank_code,
            fm.is_leader,
            fm.on_duty
       FROM faction_members fm
       JOIN factions f ON f.id = fm.faction_id
      WHERE fm.character_id = $1`,
    [characterId]
  );

  if (membership.rowCount === 0) return null;
  const row = membership.rows[0];
  return {
    factionId: row.faction_id,
    factionType: row.faction_type,
    rankCode: row.rank_code,
    isLeader: row.is_leader,
    onDuty: row.on_duty
  };
}

export async function getFactionPermissions(characterId: number): Promise<FactionPermissions | null> {
  const permissions = await pool.query<{
    can_invite: boolean;
    can_manage_treasury: boolean;
    can_issue_wanted: boolean;
    can_arrest: boolean;
    can_manage_vehicles: boolean;
    can_capture_territory: boolean;
  }>(
    `SELECT fr.can_invite,
            fr.can_manage_treasury,
            fr.can_issue_wanted,
            fr.can_arrest,
            fr.can_manage_vehicles,
            fr.can_capture_territory
       FROM faction_members fm
       JOIN faction_ranks fr
         ON fr.faction_id = fm.faction_id
        AND fr.rank_code = fm.rank_code
      WHERE fm.character_id = $1`,
    [characterId]
  );
  if (permissions.rowCount === 0) return null;
  const row = permissions.rows[0];
  return {
    canInvite: row.can_invite,
    canManageTreasury: row.can_manage_treasury,
    canIssueWanted: row.can_issue_wanted,
    canArrest: row.can_arrest,
    canManageVehicles: row.can_manage_vehicles,
    canCaptureTerritory: row.can_capture_territory
  };
}
