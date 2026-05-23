// Stores per-player JWT + active character id. Keyed by RAGE MP player.id (numeric).

export interface PlayerSession {
  token: string;
  characterId: number;
  userId: number;
  adminLevel: number;
  characterName: string;
}

const sessions = new Map<number, PlayerSession>();

export function setSession(playerId: number, session: PlayerSession): void {
  sessions.set(playerId, session);
}

export function getSession(playerId: number): PlayerSession | undefined {
  return sessions.get(playerId);
}

export function requireSession(playerId: number): PlayerSession {
  const s = sessions.get(playerId);
  if (!s) throw new Error(`No active session for player ${playerId}`);
  return s;
}

export function clearSession(playerId: number): void {
  sessions.delete(playerId);
}

export function getSessionByCharacterId(characterId: number): { playerId: number; session: PlayerSession } | undefined {
  for (const [pid, s] of sessions) {
    if (s.characterId === characterId) return { playerId: pid, session: s };
  }
  return undefined;
}

export function allSessions(): IterableIterator<[number, PlayerSession]> {
  return sessions.entries();
}
