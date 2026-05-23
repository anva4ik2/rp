import { RPEvent } from "@gta-rp/shared";
import { state } from "./state.js";

declare const mp: any;

const CEF_URL = "package://gta-rp-core/cef/index.html";

export function initBrowser(): void {
  if (state.browser) return;
  state.browser = mp.browsers.new(CEF_URL);
  // Wait for CEF to load, then signal server
  setTimeout(() => {
    mp.events.callRemote(RPEvent.UiCefReady);
  }, 1500);
}

export function showScreen(screen: string): void {
  if (!state.browser) initBrowser();
  state.cefVisible = true;
  mp.gui.cursor.show(true, true);
  state.browser.execute(`window.dispatchEvent(new CustomEvent('rp:show', { detail: '${screen}' }))`);
}

export function hideUi(): void {
  state.cefVisible = false;
  mp.gui.cursor.show(false, false);
  if (state.browser) {
    state.browser.execute(`window.dispatchEvent(new CustomEvent('rp:hide'))`);
  }
}

export function pushToCef(event: string, payload: unknown): void {
  if (!state.browser) return;
  const safe = JSON.stringify(payload ?? null);
  state.browser.execute(
    `window.dispatchEvent(new CustomEvent('rp:event', { detail: { event: '${event}', payload: ${safe} } }))`
  );
}

export function notify(kind: "success" | "error" | "info" | "warning", message: string): void {
  pushToCef(RPEvent.Notification, { kind, message });
}
