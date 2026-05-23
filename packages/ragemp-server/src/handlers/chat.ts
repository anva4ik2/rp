import { RPEvent } from "@gta-rp/shared";
import { api } from "../auth.js";
import { requireSession, getSession } from "../session.js";

declare const mp: any;

// Chat channels: "global" | "local" | "me" | "do" | "try" | "ooc"
type ChatChannel = "global" | "local" | "me" | "do" | "try" | "ooc";

const LOCAL_RANGE = 20.0;

function broadcastInRange(originPlayer: any, range: number, html: string): void {
  const ox = originPlayer.position.x;
  const oy = originPlayer.position.y;
  const oz = originPlayer.position.z;
  mp.players.forEach((p: any) => {
    const dx = p.position.x - ox;
    const dy = p.position.y - oy;
    const dz = p.position.z - oz;
    if (dx * dx + dy * dy + dz * dz <= range * range) {
      p.outputChatBox(html);
    }
  });
}

export function registerChatHandlers(): void {
  // Native RAGE chat hook
  mp.events.add("playerChat", (player: any, text: string) => {
    if (!text || !text.trim()) return;
    relay(player, "global", text);
  });

  // CEF / client triggered chat
  mp.events.add(
    RPEvent.ChatSend,
    (player: any, channel: ChatChannel, text: string) => {
      relay(player, channel, text);
    }
  );

  // Slash commands
  mp.events.add("playerCommand", (player: any, cmd: string) => {
    const [name, ...rest] = cmd.split(" ");
    const msg = rest.join(" ");
    switch (name) {
      case "me":
        return relay(player, "me", msg);
      case "do":
        return relay(player, "do", msg);
      case "try":
        return relay(player, "try", msg);
      case "b":
      case "ooc":
        return relay(player, "ooc", msg);
      case "l":
      case "local":
        return relay(player, "local", msg);
      default:
        player.outputChatBox(`!{#ff5555}Неизвестная команда: /${name}`);
    }
  });
}

function relay(player: any, channel: ChatChannel, text: string): void {
  if (!text) return;
  const session = getSession(player.id);
  const name = player.name ?? `Player_${player.id}`;
  let line = "";
  switch (channel) {
    case "global":
      line = `!{#cccccc}[OOC] ${name}: ${escape(text)}`;
      mp.players.broadcast(line);
      break;
    case "ooc":
      line = `!{#9999ff}(( ${name}: ${escape(text)} ))`;
      broadcastInRange(player, LOCAL_RANGE, line);
      break;
    case "local":
      line = `!{#ffffff}${name}: ${escape(text)}`;
      broadcastInRange(player, LOCAL_RANGE, line);
      break;
    case "me":
      line = `!{#c084fc}* ${name} ${escape(text)}`;
      broadcastInRange(player, LOCAL_RANGE, line);
      break;
    case "do":
      line = `!{#fbbf24}* ${escape(text)} (( ${name} ))`;
      broadcastInRange(player, LOCAL_RANGE, line);
      break;
    case "try":
      line = `!{#fb7185}* ${name} попытался: ${escape(text)} (${Math.random() < 0.5 ? "успешно" : "неудачно"})`;
      broadcastInRange(player, LOCAL_RANGE, line);
      break;
  }
  // Best-effort backend chat log (does not block)
  if (session) {
    api
      .post("/chat", { channel, message: text }, session.token)
      .catch(() => {
        /* noop */
      });
  }
  player.call(RPEvent.ChatMessage, [channel, name, text]);
}

function escape(s: string): string {
  return String(s).replace(/[<>]/g, "");
}
