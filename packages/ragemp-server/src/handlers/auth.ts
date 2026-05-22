import { RPEvent } from "@gta-rp/shared";
import {
  api,
  createCharacter,
  getActiveCharacter,
  listCharacters,
  login,
  register,
  type BackendCharacter
} from "../auth.js";
import { config } from "../config.js";
import { clearSession, setSession, getSession, type PlayerSession } from "../session.js";
import { pushCharacter, notify, notifyError, pushHud } from "../hud.js";

declare const mp: any;

// Track pending auth per player (after login but before character selected)
const pendingTokens = new Map<number, { token: string; userId: number; adminLevel: number }>();

function clientErr(player: any, message: string): void {
  player.call(RPEvent.AuthFailed, [message]);
  notifyError(player, message);
}

async function activateCharacter(player: any, token: string, userId: number, adminLevel: number, character: BackendCharacter): Promise<void> {
  const session: PlayerSession = {
    token,
    characterId: character.id,
    userId,
    adminLevel,
    characterName: `${character.firstName} ${character.lastName}`
  };
  setSession(player.id, session);

  // Spawn player at saved or default position
  const pos = character.position
    ? new mp.Vector3(character.position.x, character.position.y, character.position.z)
    : new mp.Vector3(config.spawnPos.x, config.spawnPos.y, config.spawnPos.z);

  player.model = mp.joaat(config.defaultModel);
  player.spawn(pos);
  player.heading = character.position?.heading ?? 0;
  player.health = Math.max(1, character.health ?? 100);
  player.armour = Math.max(0, character.armor ?? 0);
  player.dimension = 0;
  player.name = `${character.firstName}_${character.lastName}`;

  player.call(RPEvent.AuthReady, [token, character.id]);
  pushCharacter(player, character);
  pushHud(player, {
    moneyCash: character.moneyCash,
    moneyBank: character.moneyBank,
    health: player.health,
    armor: player.armour
  });
  if (adminLevel > 0) {
    player.call(RPEvent.AdminLevel, [adminLevel]);
    notify(player, "info", `Admin level ${adminLevel} active`);
  }
  mp.console.log(`[auth] ${player.name} -> character ${character.id} (admin=${adminLevel})`);
}

export function registerAuthHandlers(): void {
  // ----------------- LOGIN -----------------
  mp.events.add(RPEvent.CefLogin, async (player: any, email: string, password: string) => {
    try {
      const res = await login(String(email).trim(), String(password));
      pendingTokens.set(player.id, { token: res.token, userId: res.userId, adminLevel: res.adminLevel ?? 0 });
      // Try to send their character list immediately
      const chars = await listCharacters(res.token);
      player.call(RPEvent.CefCharacters, [chars]);
      if (chars.length === 0) {
        notify(player, "info", "Создайте персонажа");
      }
    } catch (e: any) {
      if (e?.status === 403 || String(e).includes("403")) {
        const banInfo = e?.data || {};
        player.call("rp:auth:banned", [
          banInfo.banType || "temp",
          banInfo.permanent || false,
          banInfo.remainingText || "",
          banInfo.remainingMinutes || 0,
          banInfo.message || "Аккаунт забанен"
        ]);
        clientErr(player, banInfo.message || "Аккаунт забанен");
        return;
      }
      clientErr(player, "Неверный email или пароль");
    }
  });

  // ----------------- REGISTER -----------------
  mp.events.add(RPEvent.CefRegister, async (player: any, email: string, password: string) => {
    try {
      const res = await register(String(email).trim(), String(password));
      pendingTokens.set(player.id, { token: res.token, userId: res.userId, adminLevel: res.adminLevel ?? 0 });
      player.call(RPEvent.CefCharacters, [[]]);
      notify(player, "success", "Аккаунт создан. Создайте персонажа.");
    } catch (e) {
      clientErr(player, "Email занят или ошибка регистрации");
      mp.console.logError?.(String(e));
    }
  });

  // ----------------- LIST CHARACTERS -----------------
  mp.events.add(RPEvent.CefGetCharacters, async (player: any) => {
    const pending = pendingTokens.get(player.id) ?? getSession(player.id);
    if (!pending) return clientErr(player, "Сначала войдите в аккаунт");
    try {
      const chars = await listCharacters(pending.token);
      player.call(RPEvent.CefCharacters, [chars]);
    } catch (e) {
      clientErr(player, "Не удалось загрузить персонажей");
      mp.console.logError?.(String(e));
    }
  });

  // ----------------- CREATE CHARACTER -----------------
  mp.events.add(RPEvent.CefCreateCharacter, async (player: any, firstName: string, lastName: string) => {
    const pending = pendingTokens.get(player.id);
    if (!pending) return clientErr(player, "Сначала войдите в аккаунт");
    try {
      const character = await createCharacter(pending.token, String(firstName).trim(), String(lastName).trim());
      await activateCharacter(player, pending.token, pending.userId, pending.adminLevel, character);
      pendingTokens.delete(player.id);
    } catch (e) {
      clientErr(player, "Не удалось создать персонажа");
      mp.console.logError?.(String(e));
    }
  });

  // ----------------- SELECT CHARACTER -----------------
  mp.events.add(RPEvent.CefSelectCharacter, async (player: any, _characterId: number) => {
    const pending = pendingTokens.get(player.id);
    if (!pending) return clientErr(player, "Сначала войдите в аккаунт");
    try {
      // Backend currently returns the most recent character via /characters/me;
      // multi-character selection support would require an additional endpoint.
      const character = await getActiveCharacter(pending.token);
      if (!character) {
        clientErr(player, "Персонаж не найден");
        return;
      }
      await activateCharacter(player, pending.token, pending.userId, pending.adminLevel, character);
      pendingTokens.delete(player.id);
    } catch (e) {
      clientErr(player, "Не удалось выбрать персонажа");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add("playerQuit", (player: any) => {
    pendingTokens.delete(player.id);
    clearSession(player.id);
  });
}

export function dropPendingAuth(playerId: number): void {
  pendingTokens.delete(playerId);
}
