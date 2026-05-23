import { RPEvent } from "@gta-rp/shared";
import { initBrowser, pushToCef, showScreen, hideUi, notify } from "./browser.js";
import { initVehicles } from "./vehicles.js";
import { initKeybinds } from "./keybinds.js";
import { initAdminFx } from "./admin-fx.js";
import { state } from "./state.js";

declare const mp: any;

mp.console.logInfo?.("[ragemp-client] starting");

// Boot: open CEF immediately. Player sees login form. Server waits for
// `rp:ui:ready` and the CEF login flow.
initBrowser();
initVehicles();
initKeybinds();
initAdminFx();

// ===== CEF -> Server proxy =====
// CEF `mp.trigger(...)` calls arrive in client_packages. Forward every event
// our server cares about so `handlers/auth.ts`, `handlers/admin.ts`, etc.
// receive them.
const proxyEvent = (name: string) =>
  mp.events.add(name, (...args: any[]) => mp.events.callRemote(name, ...args));

[
  RPEvent.CefLogin,
  RPEvent.CefRegister,
  RPEvent.CefGetCharacters,
  RPEvent.CefCreateCharacter,
  RPEvent.CefAdminCommand,
  RPEvent.ChatSend,
  RPEvent.InventoryGet,
  RPEvent.InventoryUse,
  RPEvent.JobsGet,
  RPEvent.JobsStart,
  RPEvent.JobsComplete,
  RPEvent.VehiclesGet,
  RPEvent.VehiclesCatalogGet,
  RPEvent.VehiclesBuy,
  RPEvent.VehiclesSpawn,
  RPEvent.VehiclesDespawn,
  RPEvent.UiCefReady,
  "cef:phone:add-contact",
  "cef:phone:send-msg",
  "cef:phone:bank-transfer",
  "cef:phone:load",
  "cef:tablet:load",
  "cef:tablet:buy",
  "cef:shop:buy",
  "cef:shop:load"
].forEach(proxyEvent);

// ===== Server -> client wiring =====
mp.events.add(RPEvent.AuthReady, (token: string, characterId: number) => {
  state.authToken = token;
  state.characterId = characterId;
  hideUi();
  notify("success", "Вход выполнен");
});

mp.events.add(RPEvent.AuthFailed, (reason: string) => {
  notify("error", `Ошибка входа: ${reason}`);
  showScreen("auth-screen");
});

mp.events.add(RPEvent.AdminBanned, (banType: string, permanent: boolean, remainingText: string, _remainingMinutes: number, message: string) => {
  pushToCef("rp:auth:banned", { banType, permanent, remainingText, message });
  showScreen("ban-screen");
});

mp.events.add(RPEvent.AdminLevel, (level: number) => {
  state.adminLevel = level;
  pushToCef(RPEvent.AdminLevel, level);
});

mp.events.add(RPEvent.CharacterSet, (character: any) => {
  state.characterId = character.id;
  pushToCef(RPEvent.CharacterSet, character);
});

mp.events.add(RPEvent.HudFull, (data: any) => pushToCef(RPEvent.HudFull, data));
mp.events.add(RPEvent.HudMoney, (cash: number, bank: number) =>
  pushToCef(RPEvent.HudFull, { moneyCash: cash, moneyBank: bank })
);
mp.events.add(RPEvent.HudHealth, (health: number, armor: number) =>
  pushToCef(RPEvent.HudFull, { health, armor })
);
mp.events.add(RPEvent.HudJob, (job: string) => pushToCef(RPEvent.HudFull, { job }));
mp.events.add(RPEvent.HudFaction, (faction: string) => pushToCef(RPEvent.HudFull, { faction }));

mp.events.add(RPEvent.Notification, (kind: any, message: string) => notify(kind, message));
mp.events.add(RPEvent.Error, (message: string) => notify("error", message));

mp.events.add(RPEvent.InventoryData, (items: any) => pushToCef(RPEvent.InventoryData, items));
mp.events.add(RPEvent.JobsData, (jobs: any) => pushToCef(RPEvent.JobsData, jobs));
mp.events.add(RPEvent.VehiclesData, (vehicles: any) => pushToCef(RPEvent.VehiclesData, vehicles));
mp.events.add(RPEvent.VehiclesCatalog, (vehicles: any) =>
  pushToCef(RPEvent.VehiclesCatalog, vehicles)
);

mp.events.add(RPEvent.ChatMessage, (channel: string, name: string, text: string) => {
  pushToCef(RPEvent.ChatMessage, { channel, name, text });
});

// ===== CEF -> client (browser uses mp.trigger which becomes 'cef:*' events here) =====
mp.events.add(RPEvent.CefClose, () => hideUi());

mp.events.add(RPEvent.CefAction, (action: string) => {
  switch (action) {
    case "inventory":
      mp.events.callRemote(RPEvent.InventoryGet);
      showScreen("inventory-screen");
      break;
    case "tablet":
      showScreen("tablet-screen");
      mp.events.callRemote("cef:tablet:load", "market");
      break;
    case "phone":
      showScreen("phone-screen");
      mp.events.callRemote("cef:phone:load");
      break;
    case "shop":
      showScreen("shop-screen");
      mp.events.callRemote("cef:shop:load", 1);
      break;
    case "handsup":
      // Play handsup animation native
      mp.game.invoke(
        "0xEA47FE3719165B94",
        mp.players.local.handle,
        "missminuteman_1ig_2",
        "handsup_base",
        8.0,
        -8.0,
        -1,
        49,
        0,
        false,
        false,
        false
      );
      break;
  }
});

// Forward CEF login/register/character events to the server. The server
// authenticates the player and responds with CharacterSet / CefCharacters
// events. Client_packages does not need to do anything special here besides
// proxying. (Most CEF events are direct from browser via mp.trigger and arrive
// at the server thanks to the unified `mp.events.add` namespace; these handlers
// only run client-side if needed to maintain state.)
mp.events.add(RPEvent.CefSelectCharacter, (characterId: number) => {
  state.characterId = characterId;
});

// CEF asked us to run a slash command. Forward to server via standard chat event
// using the appropriate channel mapping.
mp.events.add("rp:command", (cmd: string, rest: string) => {
  // Server handles /me /do /try /b /local via the addCommand handlers, but
  // those are triggered by the player's chat input (not the browser). Re-route
  // slash commands through `rp:chat:send` so they hit the server's chat module.
  const channelMap: Record<string, string> = {
    me: "me",
    do: "do",
    try: "try",
    b: "ooc",
    ooc: "ooc",
    l: "local",
    local: "local",
    g: "global",
    global: "global"
  };
  const ch = channelMap[cmd];
  if (ch) {
    mp.events.callRemote(RPEvent.ChatSend, ch, rest);
  } else {
    // Unknown — let server handle as a slash command (kick, heal, etc.)
    mp.events.callRemote("rp:slash", cmd, rest);
  }
});
