import { RPEvent, type InventoryItem } from "@gta-rp/shared";
import { api } from "../auth.js";
import { requireSession } from "../session.js";
import { notifyError } from "../hud.js";

declare const mp: any;

interface InventoryResponse {
  items: InventoryItem[];
}

export function registerInventoryHandlers(): void {
  mp.events.add(RPEvent.InventoryGet, async (player: any) => {
    try {
      const { token } = requireSession(player.id);
      const data = await api.get<InventoryResponse>("/inventory/me", token);
      player.call(RPEvent.InventoryData, [data.items]);
    } catch (e) {
      notifyError(player, "Не удалось загрузить инвентарь");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(
    RPEvent.InventoryUse,
    async (player: any, itemCode: string, quantity: number) => {
      try {
        const { token } = requireSession(player.id);
        await api.post("/inventory/use", { itemCode, quantity }, token);
        player.call(RPEvent.InventoryUsed, [itemCode, quantity]);
      } catch (e) {
        notifyError(player, "Не удалось использовать предмет");
        mp.console.logError?.(String(e));
      }
    }
  );
}
