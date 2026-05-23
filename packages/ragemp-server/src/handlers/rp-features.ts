import { RPEvent } from "@gta-rp/shared";
import { api } from "../auth.js";
import { getSession } from "../session.js";
import { notify, notifyError } from "../hud.js";

declare const mp: any;

// Generic RP feature bridge: client CEF -> server -> backend API -> server -> client CEF
export function registerRpFeatureHandlers(): void {
  // ---- PHONE ----
  mp.events.add("cef:phone:add-contact", async (player: any, name: string, number: string) => {
    const session = getSession(player.id);
    if (!session) return;
    await api.post("/phone/contacts", { name, phoneNumber: number }, session.token).catch(() => {});
    notify(player, "success", "Контакт добавлен");
  });
  mp.events.add("cef:phone:send-msg", async (player: any, toNumber: string, text: string) => {
    const session = getSession(player.id);
    if (!session) return;
    await api.post("/phone/messages", { toPhoneNumber: toNumber, message: text }, session.token).catch(() => {});
    notify(player, "success", "Сообщение отправлено");
  });
  mp.events.add("cef:phone:bank-transfer", async (player: any, toAccount: string, amount: number) => {
    const session = getSession(player.id);
    if (!session) return;
    await api.post("/bank/transfer", { toAccountNumber: toAccount, amount, description: "Phone transfer" }, session.token).catch(() => {});
    notify(player, "success", "Перевод выполнен");
  });
  mp.events.add("cef:phone:load", async (player: any) => {
    const session = getSession(player.id);
    if (!session) return;
    try {
      const [contacts, messages, bank] = await Promise.all([
        api.get<any>("/phone/contacts", session.token),
        api.get<any>("/phone/messages", session.token),
        api.get<any>("/bank/accounts", session.token)
      ]);
      player.call("rp:phone:data", [{ contacts: contacts?.contacts || [], messages: messages?.messages || [], bankBalance: bank?.accounts?.[0]?.balance || 0 }]);
    } catch {/* noop */}
  });

  // ---- TABLET ----
  mp.events.add("cef:tablet:load", async (player: any, tab: string) => {
    const session = getSession(player.id);
    if (!session) return;
    try {
      let payload: any = {};
      if (tab === "market") {
        const res = await api.get<any>("/marketplace?limit=50", session.token);
        payload = { market: res?.listings || [] };
      } else if (tab === "jobs") {
        const res = await api.get<any>("/jobs", session.token);
        payload = { jobs: res?.jobs || [] };
      } else if (tab === "houses") {
        const res = await api.get<any>("/houses?limit=50", session.token);
        payload = { houses: res?.houses || [] };
      } else if (tab === "businesses") {
        const res = await api.get<any>("/businesses?limit=50", session.token);
        payload = { businesses: res?.businesses || [] };
      } else if (tab === "factions") {
        const res = await api.get<any>("/factions", session.token);
        payload = { factions: res?.factions || [] };
      }
      player.call("rp:tablet:data", [payload]);
    } catch {/* noop */}
  });
  mp.events.add("cef:tablet:buy", async (player: any, listingId: number) => {
    const session = getSession(player.id);
    if (!session) return;
    await api.post("/marketplace/buy", { listingId }, session.token).catch(() => {});
    notify(player, "success", "Покупка оформлена");
  });

  // ---- SHOP 24/7 ----
  mp.events.add("cef:shop:buy", async (player: any, itemCode: string, quantity: number) => {
    const session = getSession(player.id);
    if (!session) return;
    await api.post("/npc-shops/buy", { itemCode, quantity }, session.token).catch(() => {});
    notify(player, "success", `Куплено: ${itemCode} x${quantity}`);
  });
  mp.events.add("cef:shop:load", async (player: any, shopId: number) => {
    const session = getSession(player.id);
    if (!session) return;
    try {
      const res = await api.get<any>(`/npc-shops/${shopId}/items`, session.token);
      player.call("rp:shop:data", [{ items: res?.items || [] }]);
    } catch {/* noop */}
  });

  // ---- MAP TP (waypoint) ----
  mp.events.add("rp:tp:map", async (player: any, x: number, y: number, z: number) => {
    const session = getSession(player.id);
    if (!session || session.adminLevel < 2) return notifyError(player, "Нет прав");
    player.position = new mp.Vector3(x, y, z);
    notify(player, "success", `Телепорт на маркер`);
  });
}
