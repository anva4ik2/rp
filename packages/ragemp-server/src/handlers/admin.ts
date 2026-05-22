import { RPEvent } from "@gta-rp/shared";
import { config } from "../config.js";
import { api } from "../auth.js";
import { allSessions, getSession, getSessionByCharacterId } from "../session.js";
import { notify, notifyError } from "../hud.js";

declare const mp: any;

interface PendingKick { characterId: number; reason: string }
interface PendingTeleport { characterId: number; x: number; y: number; z: number; heading: number }
interface PendingHeal { characterId: number; health: number; armor: number }

// Runtime flag tracking. The backend is the source of truth; we cache locally
// so we can apply per-frame effects (god heal, freeze position, etc).
export const runtime = {
  muted: new Set<number>(),
  frozen: new Map<number, { x: number; y: number; z: number }>(),
  god: new Set<number>(),
  invisible: new Set<number>(),
  fly: new Set<number>(),
  noclip: new Set<number>(),
  esp: new Set<number>()
};

function applyFlag(characterId: number, on: boolean, set: Set<number>, onChange?: (player: any, on: boolean) => void): void {
  const entry = getSessionByCharacterId(characterId);
  if (!entry) return;
  const player = mp.players.at(entry.playerId);
  if (!player) return;
  if (on) set.add(entry.playerId); else set.delete(entry.playerId);
  if (onChange) onChange(player, on);
}

async function pollAdminQueue(): Promise<void> {
  if (!config.adminToken) return;
  try {
    const url = `${config.apiBaseUrl}/admin/pending`;
    const res = await fetch(url, { headers: { "x-admin-token": config.adminToken } });
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, any[]>;

    for (const k of data.kicks ?? []) {
      const entry = getSessionByCharacterId(k.characterId);
      if (entry) mp.players.at(entry.playerId)?.kick(k.reason);
    }
    for (const t of data.teleports ?? []) {
      const entry = getSessionByCharacterId(t.characterId);
      const p = entry ? mp.players.at(entry.playerId) : null;
      if (p) {
        p.position = new mp.Vector3(t.x, t.y, t.z);
        p.heading = t.heading;
        notify(p, "info", "Вас телепортировал админ");
      }
    }
    for (const h of data.heals ?? []) {
      const entry = getSessionByCharacterId(h.characterId);
      const p = entry ? mp.players.at(entry.playerId) : null;
      if (p) { p.health = h.health; p.armour = h.armor; notify(p, "success", "Вас вылечил админ"); }
    }
    for (const f of data.freezes ?? []) {
      applyFlag(f.characterId, f.on, runtime.frozen as any, (player, on) => {
        if (on) {
          runtime.frozen.set(player.id, { x: player.position.x, y: player.position.y, z: player.position.z });
          player.freezePosition?.(true);
        } else {
          runtime.frozen.delete(player.id);
          player.freezePosition?.(false);
        }
        notify(player, "warning", on ? "Вы заморожены" : "Разморожены");
      });
    }
    for (const g of data.godmodes ?? []) {
      applyFlag(g.characterId, g.on, runtime.god, (player, on) => {
        player.invincible = on;
        notify(player, "info", on ? "Godmode ON" : "Godmode OFF");
      });
    }
    for (const i of data.invisible ?? []) {
      applyFlag(i.characterId, i.on, runtime.invisible, (player, on) => {
        player.alpha = on ? 0 : 255;
        notify(player, "info", on ? "Invisible ON" : "Invisible OFF");
      });
    }
    for (const f of data.fly ?? []) {
      applyFlag(f.characterId, f.on, runtime.fly, (player, on) => {
        player.collision = !on;
        player.call("rp:fly", [on]);
        notify(player, "info", on ? "Fly ON (двигайтесь стрелками)" : "Fly OFF");
      });
    }
    for (const e of data.esp ?? []) {
      applyFlag(e.characterId, e.on, runtime.esp, (player, on) => {
        player.call("rp:esp", [on]);
        notify(player, "info", on ? "ESP ON" : "ESP OFF");
      });
    }
    for (const m of data.mutes ?? []) {
      applyFlag(m.characterId, m.on, runtime.muted, (player, on) => {
        notify(player, on ? "warning" : "info", on ? "Вы замьючены" : "Размьючены");
      });
    }
    for (const w of data.weapons ?? []) {
      const entry = getSessionByCharacterId(w.characterId);
      const p = entry ? mp.players.at(entry.playerId) : null;
      if (p) {
        try { p.giveWeapon(mp.joaat(w.weaponCode), w.ammo); } catch { /* ignore bad code */ }
        notify(p, "success", `Получено оружие ${w.weaponCode} x${w.ammo}`);
      }
    }
    for (const a of data.announcements ?? []) {
      mp.players.broadcast(`!{#ffcc33}[ОБЪЯВЛЕНИЕ] ${a.message}`);
      mp.players.forEach((p: any) => notify(p, a.kind || "info", a.message));
    }
    // Vehicle queue: handled via callbacks registered in vehicles module
    for (const v of data.vehicleRepair ?? []) {
      mp.events.call("rp:internal:veh-repair", v.vehicleId);
    }
    for (const v of data.vehicleRespawn ?? []) {
      mp.events.call("rp:internal:veh-respawn", v.vehicleId);
    }
    for (const v of data.vehicleDelete ?? []) {
      mp.events.call("rp:internal:veh-delete", v.vehicleId);
    }
    for (const n of data.noclip ?? []) {
      applyFlag(n.characterId, n.on, runtime.noclip, (player, on) => {
        player.collision = !on;
        player.alpha = on ? 120 : 255;
        player.call("rp:noclip", [on]);
        notify(player, "info", on ? "Noclip ON" : "Noclip OFF");
      });
    }
    for (const s of data.spectate ?? []) {
      const entry = getSessionByCharacterId(s.adminCharacterId);
      const adminPlayer = entry ? mp.players.at(entry.playerId) : null;
      if (adminPlayer) {
        adminPlayer.call("rp:spectate", [s.on, s.targetCharacterId ?? null]);
        notify(adminPlayer, "info", s.on ? `Spectate ON` : "Spectate OFF");
      }
    }
    for (const p of data.prison ?? []) {
      const entry = getSessionByCharacterId(p.characterId);
      const player = entry ? mp.players.at(entry.playerId) : null;
      if (player) {
        if (p.on) {
          player.position = new mp.Vector3(1648.0, 2530.0, 45.0); // Bolingbroke Penitentiary
          player.freezePosition?.(true);
          notify(player, "error", `Деморган: ${p.reason} — ${p.minutes} мин`);
          mp.players.broadcast(`!{#ff3333}[ДЕМОРГАН] ${player.name} отправлен на ${p.minutes} мин. Причина: ${p.reason}`);
        } else {
          player.freezePosition?.(false);
          player.spawn(new mp.Vector3(config.spawnPos.x, config.spawnPos.y, config.spawnPos.z));
          notify(player, "success", "Вы свободны");
        }
      }
    }
    for (const g of data.giveLevel ?? []) {
      const entry = getSessionByCharacterId(g.characterId);
      const player = entry ? mp.players.at(entry.playerId) : null;
      if (player) notify(player, "success", `Ваш уровень изменен: ${g.level}`);
    }
    for (const f of data.factionRemove ?? []) {
      const entry = getSessionByCharacterId(f.characterId);
      const player = entry ? mp.players.at(entry.playerId) : null;
      if (player) notify(player, "warning", "Вас исключили из фракции администратором");
    }
  } catch (e) {
    mp.console.logError?.(`[admin poll] ${String(e)}`);
  }
}

// Push current online roster to backend so /admin/online endpoint stays live.
async function pushOnlineRoster(): Promise<void> {
  if (!config.adminToken) return;
  try {
    const players: any[] = [];
    for (const [pid, s] of allSessions()) {
      const p = mp.players.at(pid);
      players.push({
        playerId: pid,
        characterId: s.characterId,
        characterName: s.characterName,
        adminLevel: s.adminLevel,
        ping: p?.ping ?? 0
      });
    }
    await fetch(`${config.apiBaseUrl}/admin/online`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": config.adminToken },
      body: JSON.stringify({ players })
    });
  } catch {
    /* noop */
  }
}

// In-game chat commands available to admins (level checks server-side via JWT)
function findOnlinePlayerByName(name: string): any | null {
  const lowered = name.toLowerCase();
  for (const [pid, s] of allSessions()) {
    if (s.characterName.toLowerCase().includes(lowered)) {
      return mp.players.at(pid);
    }
  }
  return null;
}

export function registerAdminHandlers(): void {
  // Poll backend queues so admin actions from CEF/admin panel propagate to live game
  if (config.adminToken) {
    setInterval(pollAdminQueue, config.adminPollMs);
    setInterval(pushOnlineRoster, 10_000);
  } else {
    mp.console.log("[admin] ADMIN_TOKEN not set; admin queue polling disabled");
  }

  // Mute filter — drop chat messages from muted players before broadcast.
  mp.events.add("playerChat", (player: any, _text: string, cancel?: any) => {
    if (runtime.muted.has(player.id)) {
      notifyError(player, "Вы замьючены");
      if (cancel) cancel.cancel = true;
    }
  });

  // Periodic god-mode HP refill (in case some damage slips through).
  setInterval(() => {
    for (const pid of runtime.god) {
      const p = mp.players.at(pid);
      if (p) { p.health = 100; p.armour = 100; }
    }
  }, 1500);

  // /kick "Name" reason
  mp.events.addCommand("kick", async (player: any, _full: string, name: string, ...reasonParts: string[]) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 1) return notifyError(player, "Нет прав");
    if (!name) return notify(player, "warning", "/kick <имя> <причина>");
    const target = findOnlinePlayerByName(name);
    if (!target) return notify(player, "warning", "Игрок не найден");
    const reason = reasonParts.join(" ") || "Kicked by admin";
    await api.post("/admin/kick", { characterId: getSession(target.id)!.characterId, reason }, session.token).catch(() => {});
    target.kick(reason);
  });

  // /heal [name]
  mp.events.addCommand("heal", async (player: any, _full: string, name?: string) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 2) return notifyError(player, "Нет прав");
    const target = name ? findOnlinePlayerByName(name) : player;
    if (!target) return notify(player, "warning", "Игрок не найден");
    target.health = 100;
    target.armour = 100;
    const ts = getSession(target.id);
    if (ts) {
      await api.post("/admin/heal", { characterId: ts.characterId, health: 100, armor: 100 }, session.token).catch(() => {});
    }
    notify(player, "success", `Вылечен ${target.name}`);
  });

  // /tp <name> — teleport to a player
  mp.events.addCommand("tp", (player: any, _full: string, name?: string) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 2) return notifyError(player, "Нет прав");
    if (!name) return notify(player, "warning", "/tp <имя>");
    const target = findOnlinePlayerByName(name);
    if (!target) return notify(player, "warning", "Игрок не найден");
    player.position = target.position;
    notify(player, "success", `Телепортирован к ${target.name}`);
  });

  // /bring <name> — bring a player to you
  mp.events.addCommand("bring", (player: any, _full: string, name?: string) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 2) return notifyError(player, "Нет прав");
    if (!name) return notify(player, "warning", "/bring <имя>");
    const target = findOnlinePlayerByName(name);
    if (!target) return notify(player, "warning", "Игрок не найден");
    target.position = player.position;
    notify(target, "info", `Вас призвал админ ${session.characterName}`);
  });

  // /veh <modelCode> — spawn a temporary vehicle next to you
  mp.events.addCommand("veh", (player: any, _full: string, modelCode?: string) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 2) return notifyError(player, "Нет прав");
    if (!modelCode) return notify(player, "warning", "/veh <модель>");
    try {
      const pos = player.position;
      const veh = mp.vehicles.new(mp.joaat(modelCode), new mp.Vector3(pos.x + 3, pos.y, pos.z), {
        heading: player.heading,
        numberPlate: "ADMIN",
        locked: false,
        engine: true,
        dimension: player.dimension
      });
      veh.setVariable("temporary", true);
      notify(player, "success", `Spawned ${modelCode}`);
    } catch (e) {
      notifyError(player, `Модель не найдена: ${modelCode}`);
      mp.console.logError?.(String(e));
    }
  });

  // /setmoney <name> <cash|bank> <amount>
  mp.events.addCommand(
    "setmoney",
    async (player: any, _full: string, name?: string, kind?: string, amountStr?: string) => {
      const session = getSession(player.id);
      if (!session || session.adminLevel < 3) return notifyError(player, "Нет прав");
      if (!name || !kind || !amountStr) return notify(player, "warning", "/setmoney <имя> <cash|bank> <сумма>");
      const target = findOnlinePlayerByName(name);
      if (!target) return notify(player, "warning", "Игрок не найден");
      const ts = getSession(target.id);
      if (!ts) return;
      const amount = parseInt(amountStr, 10);
      const body = kind === "cash" ? { characterId: ts.characterId, cash: amount } : { characterId: ts.characterId, bank: amount };
      await api.post("/admin/set-money", body, session.token).catch(() => {});
      notify(player, "success", `Установлено ${kind}=${amount} для ${target.name}`);
    }
  );

  // /ban <name> <hours> <reason>
  mp.events.addCommand(
    "ban",
    async (player: any, _full: string, name?: string, hoursStr?: string, ...reasonParts: string[]) => {
      const session = getSession(player.id);
      if (!session || session.adminLevel < 3) return notifyError(player, "Нет прав");
      if (!name) return notify(player, "warning", "/ban <имя> [часы] <причина>");
      const target = findOnlinePlayerByName(name);
      if (!target) return notify(player, "warning", "Игрок не найден");
      const hours = parseInt(hoursStr ?? "0", 10) || 0;
      const reason = reasonParts.join(" ") || "Banned by admin";
      const ts = getSession(target.id);
      if (!ts) return;
      await api.post("/admin/ban", { characterId: ts.characterId, hours, reason, permanent: hours === 0 }, session.token).catch(() => {});
      target.kick(`Banned: ${reason}`);
    }
  );

  // /spectate <name>
  mp.events.addCommand("spectate", (player: any, _full: string, name?: string) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 1) return notifyError(player, "Нет прав");
    if (!name) {
      player.spectating = false;
      return notify(player, "info", "Spectate off");
    }
    const target = findOnlinePlayerByName(name);
    if (!target) return notify(player, "warning", "Игрок не найден");
    player.spectating = true;
    player.position = target.position;
    notify(player, "info", `Spectating ${target.name}`);
  });

  // /setadmin <name> <level> — founder only
  mp.events.addCommand(
    "setadmin",
    async (player: any, _full: string, name?: string, lvlStr?: string) => {
      const session = getSession(player.id);
      if (!session || session.adminLevel < 5) return notifyError(player, "Нет прав");
      if (!name || !lvlStr) return notify(player, "warning", "/setadmin <имя> <0-5>");
      const target = findOnlinePlayerByName(name);
      if (!target) return notify(player, "warning", "Игрок не найден");
      const ts = getSession(target.id);
      if (!ts) return;
      const lvl = Math.max(0, Math.min(5, parseInt(lvlStr, 10) || 0));
      await api.post("/admin/set-admin-level", { userId: ts.userId, level: lvl }, session.token).catch(() => {});
      ts.adminLevel = lvl;
      target.call(RPEvent.AdminLevel, [lvl]);
      notify(player, "success", `${target.name} -> admin ${lvl}`);
    }
  );

  // ---- Helper to call backend admin endpoint by chat command ----
  const callAdmin = async (player: any, path: string, body: any) => {
    const session = getSession(player.id);
    if (!session) return notifyError(player, "Нет сессии");
    try {
      await api.post(path, body, session.token);
      notify(player, "success", `OK: ${path}`);
    } catch (e) {
      notifyError(player, `Ошибка: ${path}`);
      mp.console.logError?.(String(e));
    }
  };
  const targetSessionByName = (name: string) => {
    const t = findOnlinePlayerByName(name);
    return t ? { player: t, session: getSession(t.id)! } : null;
  };

  // /freeze <name>, /unfreeze <name>
  mp.events.addCommand("freeze", async (player: any, _f: string, name?: string) => {
    if (!name) return notify(player, "warning", "/freeze <имя>");
    const t = targetSessionByName(name); if (!t) return notify(player, "warning", "Игрок не найден");
    await callAdmin(player, "/admin/freeze", { characterId: t.session.characterId, on: true });
  });
  mp.events.addCommand("unfreeze", async (player: any, _f: string, name?: string) => {
    if (!name) return notify(player, "warning", "/unfreeze <имя>");
    const t = targetSessionByName(name); if (!t) return notify(player, "warning", "Игрок не найден");
    await callAdmin(player, "/admin/freeze", { characterId: t.session.characterId, on: false });
  });

  // /god [name] — toggle god on yourself or target
  mp.events.addCommand("god", async (player: any, _f: string, name?: string) => {
    const target = name ? targetSessionByName(name) : { player, session: getSession(player.id)! };
    if (!target) return notify(player, "warning", "Игрок не найден");
    const on = !runtime.god.has(target.player.id);
    await callAdmin(player, "/admin/godmode", { characterId: target.session.characterId, on });
  });

  // /invis [name]
  mp.events.addCommand("invis", async (player: any, _f: string, name?: string) => {
    const target = name ? targetSessionByName(name) : { player, session: getSession(player.id)! };
    if (!target) return notify(player, "warning", "Игрок не найден");
    const on = !runtime.invisible.has(target.player.id);
    await callAdmin(player, "/admin/invisible", { characterId: target.session.characterId, on });
  });

  // /fly
  mp.events.addCommand("fly", async (player: any) => {
    const s = getSession(player.id);
    if (!s) return;
    const on = !runtime.fly.has(player.id);
    await callAdmin(player, "/admin/fly", { characterId: s.characterId, on });
  });

  // /esp
  mp.events.addCommand("esp", async (player: any) => {
    const s = getSession(player.id);
    if (!s) return;
    const on = !runtime.esp.has(player.id);
    await callAdmin(player, "/admin/esp", { characterId: s.characterId, on });
  });

  // /mute <name> [minutes] [reason]
  mp.events.addCommand("mute", async (player: any, _f: string, name?: string, minStr?: string, ...rest: string[]) => {
    if (!name) return notify(player, "warning", "/mute <имя> [минуты] [причина]");
    const t = targetSessionByName(name); if (!t) return notify(player, "warning", "Игрок не найден");
    await callAdmin(player, "/admin/mute", {
      characterId: t.session.characterId,
      minutes: parseInt(minStr ?? "60", 10) || 60,
      reason: rest.join(" ")
    });
  });
  mp.events.addCommand("unmute", async (player: any, _f: string, name?: string) => {
    if (!name) return notify(player, "warning", "/unmute <имя>");
    const t = targetSessionByName(name); if (!t) return notify(player, "warning", "Игрок не найден");
    await callAdmin(player, "/admin/unmute", { characterId: t.session.characterId });
  });

  // /announce <message>
  mp.events.addCommand("announce", async (player: any, _f: string, ...parts: string[]) => {
    const msg = parts.join(" ");
    if (!msg) return notify(player, "warning", "/announce <текст>");
    await callAdmin(player, "/admin/announce", { message: msg, kind: "info" });
  });

  // /giveweapon <name> <weaponCode> [ammo]
  mp.events.addCommand(
    "giveweapon",
    async (player: any, _f: string, name?: string, weapon?: string, ammoStr?: string) => {
      if (!name || !weapon) return notify(player, "warning", "/giveweapon <имя> <модель> [патроны]");
      const t = targetSessionByName(name); if (!t) return notify(player, "warning", "Игрок не найден");
      await callAdmin(player, "/admin/give-weapon", {
        characterId: t.session.characterId,
        weaponCode: weapon,
        ammo: parseInt(ammoStr ?? "120", 10) || 120
      });
    }
  );

  // /unban <userId>
  mp.events.addCommand("unban", async (player: any, _f: string, userIdStr?: string) => {
    if (!userIdStr) return notify(player, "warning", "/unban <userId>");
    await callAdmin(player, "/admin/unban", { userId: parseInt(userIdStr, 10) });
  });

  // /admins — list online admins
  mp.events.addCommand("admins", (player: any) => {
    const admins: string[] = [];
    for (const [, s] of allSessions()) {
      if (s.adminLevel > 0) admins.push(`${s.characterName} (L${s.adminLevel})`);
    }
    player.outputChatBox(`!{#ffcc33}Online admins: ${admins.join(", ") || "none"}`);
  });

  // /online — list online players (everyone can use)
  mp.events.addCommand("online", (player: any) => {
    const names: string[] = [];
    for (const [, s] of allSessions()) names.push(s.characterName);
    player.outputChatBox(`Online (${names.length}): ${names.join(", ")}`);
  });

  // /clearinv <name>
  mp.events.addCommand("clearinv", async (player: any, _f: string, name?: string) => {
    if (!name) return notify(player, "warning", "/clearinv <имя>");
    const t = targetSessionByName(name); if (!t) return notify(player, "warning", "Игрок не найден");
    await callAdmin(player, "/admin/clear-inventory", { characterId: t.session.characterId });
  });

  // /repairveh — repair current vehicle the admin sits in
  mp.events.addCommand("repairveh", async (player: any) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 2) return notifyError(player, "Нет прав");
    const veh = player.vehicle;
    if (!veh) return notify(player, "warning", "Сядьте в машину");
    veh.repair();
    notify(player, "success", "Машина починена");
    const vid = veh.getVariable?.("vehicleId");
    if (vid) await api.post("/admin/vehicle/repair", { vehicleId: vid }, session.token).catch(() => {});
  });

  // /noclip [name]
  mp.events.addCommand("noclip", async (player: any, _f: string, name?: string) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 3) return notifyError(player, "Нет прав");
    const target = name ? targetSessionByName(name) : { player, session: getSession(player.id)! };
    if (!target) return notify(player, "warning", "Игрок не найден");
    const on = !runtime.noclip.has(target.player.id);
    await callAdmin(player, "/admin/noclip", { characterId: target.session.characterId, on });
  });

  // /spectate <name>
  mp.events.addCommand("spectate", async (player: any, _f: string, name?: string) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 2) return notifyError(player, "Нет прав");
    if (!name) {
      player.call("rp:spectate", [false, null]);
      return notify(player, "info", "Spectate OFF");
    }
    const target = findOnlinePlayerByName(name);
    if (!target) return notify(player, "warning", "Игрок не найден");
    const ts = getSession(target.id);
    if (!ts) return;
    await callAdmin(player, "/admin/spectate", { adminCharacterId: session.characterId, targetCharacterId: ts.characterId, on: true });
  });

  // /prison <name> <minutes> <reason>
  mp.events.addCommand("prison", async (player: any, _f: string, name?: string, minStr?: string, ...reasonParts: string[]) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 2) return notifyError(player, "Нет прав");
    if (!name || !minStr) return notify(player, "warning", "/prison <имя> <минуты> <причина>");
    const target = targetSessionByName(name);
    if (!target) return notify(player, "warning", "Игрок не найден");
    await callAdmin(player, "/admin/prison", {
      characterId: target.session.characterId,
      minutes: parseInt(minStr, 10) || 10,
      reason: reasonParts.join(" ") || "Админ",
      on: true
    });
  });
  mp.events.addCommand("unprison", async (player: any, _f: string, name?: string) => {
    if (!name) return notify(player, "warning", "/unprison <имя>");
    const target = targetSessionByName(name); if (!target) return notify(player, "warning", "Игрок не найден");
    await callAdmin(player, "/admin/prison", { characterId: target.session.characterId, minutes: 0, reason: "", on: false });
  });

  // /givelevel <name> <level>
  mp.events.addCommand("givelevel", async (player: any, _f: string, name?: string, lvlStr?: string) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 3) return notifyError(player, "Нет прав");
    if (!name || !lvlStr) return notify(player, "warning", "/givelevel <имя> <уровень>");
    const target = targetSessionByName(name);
    if (!target) return notify(player, "warning", "Игрок не найден");
    await callAdmin(player, "/admin/give-level", { characterId: target.session.characterId, level: parseInt(lvlStr, 10) || 1 });
  });

  // /gotoveh <ownershipId>
  mp.events.addCommand("gotoveh", async (player: any, _f: string, oid?: string) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 2) return notifyError(player, "Нет прав");
    if (!oid) return notify(player, "warning", "/gotoveh <ownershipId>");
    const data = await api.post("/admin/tp-vehicle", { ownershipId: oid }, session.token).catch(() => null);
    if (!data) return notifyError(player, "Машина не найдена");
    notify(player, "success", `TP к машине ${oid}`);
  });

  // F5 Admin Mode toggle (noclip + invis + fly + crown)
  mp.events.add("rp:admin:mode", async (player: any, on: boolean) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 1) return;
    player.setVariable("adminMode", on);
    // Toggle noclip
    await callAdmin(player, "/admin/noclip", { characterId: session.characterId, on });
    // Toggle invisible
    await callAdmin(player, "/admin/invisible", { characterId: session.characterId, on });
    // Toggle fly
    await callAdmin(player, "/admin/fly", { characterId: session.characterId, on });
    notify(player, on ? "warning" : "info", on ? "Admin Mode ON (F5)" : "Admin Mode OFF (F5)");
  });

  // CEF admin actions proxy — for the in-game admin panel
  mp.events.add(RPEvent.CefAdminCommand, async (player: any, action: string, payload: any) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 1) return notifyError(player, "Нет прав");
    try {
      switch (action) {
        case "logs": {
          const data = await api.get<{ logs: unknown[] }>("/admin/logs?limit=100", session.token);
          player.call(RPEvent.AdminLog, [data.logs]);
          return;
        }
        case "search": {
          const data = await api.get<{ characters: unknown[] }>(
            `/admin/search?q=${encodeURIComponent(String(payload?.q ?? ""))}`,
            session.token
          );
          player.call(RPEvent.AdminLog, [{ kind: "search", results: data.characters }]);
          return;
        }
        case "bans": {
          const data = await api.get<{ bans: unknown[] }>("/admin/bans", session.token);
          player.call(RPEvent.AdminLog, [{ kind: "bans", results: data.bans }]);
          return;
        }
        case "online": {
          const data = await api.get<{ players: unknown[] }>("/admin/online", session.token);
          player.call(RPEvent.AdminLog, [{ kind: "online", results: data.players }]);
          return;
        }
        case "kick":
        case "heal":
        case "teleport":
        case "ban":
        case "unban":
        case "give-money":
        case "set-money":
        case "give-vehicle":
        case "give-weapon":
        case "freeze":
        case "godmode":
        case "invisible":
        case "fly":
        case "noclip":
        case "esp":
        case "mute":
        case "unmute":
        case "announce":
        case "set-name":
        case "clear-inventory":
        case "vehicle/repair":
        case "vehicle/respawn":
        case "vehicle/delete":
        case "spectate":
        case "prison":
        case "give-level":
        case "faction-remove":
        case "tp-map":
        case "tp-report":
        case "tp-vehicle": {
          await api.post(`/admin/${action}`, payload ?? {}, session.token);
          notify(player, "success", `OK: ${action}`);
          return;
        }
        default:
          notify(player, "warning", `Неизвестная команда: ${action}`);
      }
    } catch (e) {
      notifyError(player, `Ошибка: ${action}`);
      mp.console.logError?.(String(e));
    }
  });
}
