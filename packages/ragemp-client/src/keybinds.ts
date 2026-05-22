import { RPEvent } from "@gta-rp/shared";
import { showScreen, hideUi, notify } from "./browser.js";
import { state } from "./state.js";

declare const mp: any;

const KEY = {
  F1: 0x70,
  F2: 0x71,
  F5: 0x74,
  F6: 0x75,
  I: 0x49,
  T: 0x54,
  ESC: 0x1B,
  P: 0x50,
  T_CHAT: 0x59 // Y — open chat
};

export function initKeybinds(): void {
  mp.keys.bind(KEY.F1, false, () => {
    if (!state.authToken) return;
    state.cefVisible ? hideUi() : showScreen("interaction-screen");
  });
  mp.keys.bind(KEY.F2, false, () => {
    if (!state.authToken) return;
    showScreen("interaction-screen");
  });
  mp.keys.bind(KEY.I, false, () => {
    if (!state.authToken) return;
    mp.events.callRemote(RPEvent.InventoryGet);
    showScreen("inventory-screen");
  });
  mp.keys.bind(KEY.T, false, () => {
    if (!state.authToken) return;
    showScreen("tablet-screen");
  });
  mp.keys.bind(KEY.ESC, false, () => {
    if (state.cefVisible) hideUi();
  });
  mp.keys.bind(KEY.F5, false, () => {
    if (!state.authToken || state.adminLevel < 1) return;
    state.adminMode = !state.adminMode;
    mp.events.callRemote("rp:admin:mode", state.adminMode);
  });
  mp.keys.bind(KEY.F6, false, () => {
    if (!state.authToken || state.adminLevel < 2 || !state.adminMode) return;
    const blip = mp.game.ui.getFirstBlipInfoId(8); // 8 = waypoint blip
    if (blip && mp.game.ui.doesBlipExist(blip)) {
      const coords = mp.game.ui.getBlipInfoIdCoord(blip);
      mp.events.callRemote("rp:tp:map", coords.x, coords.y, coords.z);
    } else {
      notify("error", "Поставьте метку на карте");
    }
  });
}
