import { RPEvent, type HudState } from "@gta-rp/shared";
import type { BackendCharacter } from "./auth.js";

declare const mp: any;

export function pushHud(player: any, state: HudState): void {
  player.call(RPEvent.HudFull, [state]);
}

export function pushCharacter(player: any, character: BackendCharacter): void {
  player.call(RPEvent.CharacterSet, [
    {
      id: character.id,
      firstName: character.firstName,
      lastName: character.lastName
    }
  ]);
  pushHud(player, {
    moneyCash: character.moneyCash,
    moneyBank: character.moneyBank
  });
}

export function notify(
  player: any,
  kind: "success" | "error" | "info" | "warning",
  message: string
): void {
  player.call(RPEvent.Notification, [kind, message]);
}

export function notifyError(player: any, message: string): void {
  notify(player, "error", message);
}
