import { RPEvent } from "@gta-rp/shared";
import { config } from "./config.js";
import { api, saveCharacterState } from "./auth.js";
import { clearSession, getSession, allSessions } from "./session.js";
import { notifyError } from "./hud.js";
import { registerInventoryHandlers } from "./handlers/inventory.js";
import { registerJobHandlers } from "./handlers/jobs.js";
import {
  registerVehicleHandlers,
  cleanupPlayerVehicles,
  spawnPlayerVehicles,
  persistAllVehiclePositions
} from "./handlers/vehicles.js";
import { registerChatHandlers } from "./handlers/chat.js";
import { registerAuthHandlers } from "./handlers/auth.js";
import { registerAdminHandlers } from "./handlers/admin.js";
import { registerRpFeatureHandlers } from "./handlers/rp-features.js";

declare const mp: any;

mp.console.log(`[ragemp-server] starting, api=${config.apiBaseUrl}`);

registerAuthHandlers();
registerInventoryHandlers();
registerJobHandlers();
registerVehicleHandlers();
registerChatHandlers();
registerAdminHandlers();
registerRpFeatureHandlers();

// On join: place the player on a neutral camera while CEF login is shown.
// We spawn them at hospital after the CEF auth flow completes (handlers/auth.ts).
mp.events.add("playerJoin", (player: any) => {
  mp.console.log(`[ragemp-server] join: ${player.name} (id=${player.id})`);
  player.dimension = 9999; // hide while at CEF login
  // Tell client to show login UI
  player.call(RPEvent.UiShow, ["auth-screen"]);
});

mp.events.add("playerReady", (player: any) => {
  // Re-emit in case UiShow was lost
  player.call(RPEvent.UiShow, ["auth-screen"]);
});

// When the client signals that CEF finished loading and the player completed
// the login flow, the auth handler already activated the session. We just need
// to spawn their persistent vehicles here.
mp.events.add(RPEvent.AuthReady, (player: any) => {
  // Defer so spawn happens after model has been set
  setTimeout(() => spawnPlayerVehicles(player).catch((e) => mp.console.logError?.(String(e))), 500);
});

mp.events.add("playerQuit", async (player: any) => {
  const session = getSession(player.id);
  if (session) {
    cleanupPlayerVehicles(session.characterId);
    await saveCharacterState(session.token, {
      x: player.position?.x,
      y: player.position?.y,
      z: player.position?.z,
      heading: player.heading,
      health: player.health,
      armor: player.armour
    }).catch(() => {});
  }
  clearSession(player.id);
});

mp.events.add("playerDeath", (player: any) => {
  const session = getSession(player.id);
  if (!session) return;
  api.post(
    "/anticheat/death",
    {
      reason: "death",
      x: player.position?.x,
      y: player.position?.y,
      z: player.position?.z
    },
    session.token
  ).catch(() => {});
  setTimeout(() => {
    player.spawn(new mp.Vector3(config.spawnPos.x, config.spawnPos.y, config.spawnPos.z));
    player.health = 100;
    player.armour = 0;
  }, 5000);
});

// Periodic state persistence so a crash doesn't lose progress.
setInterval(() => {
  persistAllVehiclePositions().catch(() => {});
  for (const [pid, session] of allSessions()) {
    const player = mp.players.at(pid);
    if (!player) continue;
    saveCharacterState(session.token, {
      x: player.position?.x,
      y: player.position?.y,
      z: player.position?.z,
      heading: player.heading,
      health: player.health,
      armor: player.armour
    }).catch(() => {});
  }
}, config.positionSaveMs);

// Generic error capture
mp.events.add("incomingConnection", (_ip: string, _serial: string) => {
  // Hook for ban checks before joining if needed in the future.
});

export {};
