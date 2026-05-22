/**
 * GTA RP Core — CEF UI (RAGE MP).
 *
 * Bidirectional bridge:
 *  - Browser  -> Client : `mp.trigger('eventName', ...)`
 *  - Client   -> Browser: window dispatchEvent('rp:show' | 'rp:hide' | 'rp:event')
 */
const RPEvent = {
  AuthReady: "rp:auth:ready",
  AuthFailed: "rp:auth:failed",
  CharacterSet: "rp:character",
  HudFull: "rp:hud:full",
  Notification: "rp:notify",
  InventoryGet: "rp:inv:get",
  InventoryData: "rp:inv:data",
  InventoryUse: "rp:inv:use",
  ChatSend: "rp:chat:send",
  ChatMessage: "rp:chat:msg",
  CefLogin: "cef:login",
  CefRegister: "cef:register",
  CefGetCharacters: "cef:characters:get",
  CefCharacters: "cef:characters:list",
  CefCreateCharacter: "cef:characters:create",
  CefSelectCharacter: "cef:characters:select",
  CefClose: "cef:close",
  CefAction: "cef:action",
  CefAdminCommand: "cef:admin:cmd",
  AdminLevel: "rp:admin:level",
  AdminLog: "rp:admin:log",
  AdminMode: "rp:admin:mode",
  AdminBanned: "rp:auth:banned",
  Fly: "rp:fly",
  Esp: "rp:esp",
  Noclip: "rp:noclip",
  Spectate: "rp:spectate",
  TpMap: "rp:tp:map",
  UiCefReady: "rp:ui:ready"
};

const trigger = (...args) => {
  if (typeof mp !== "undefined" && mp.trigger) mp.trigger(...args);
};

const state = {
  adminLevel: 0,
  selectedCharacter: null,
  inventory: [],
  selectedInventoryIdx: -1,
  selectedAdminTarget: null
};

// ---------- helpers ----------
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
function show(id) { $("#" + id)?.classList.remove("hidden"); }
function hide(id) { $("#" + id)?.classList.add("hidden"); }
function showOnly(id) {
  $$(".screen.full-screen").forEach(el => el.classList.add("hidden"));
  show(id);
}
function notify(kind, msg) {
  const host = $("#notify-host");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "notify " + (kind || "info");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ---------- AUTH ----------
function bindAuth() {
  $$(".tab").forEach(t => t.addEventListener("click", () => {
    $$(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const which = t.dataset.tab;
    $("#login-form").classList.toggle("hidden", which !== "login");
    $("#register-form").classList.toggle("hidden", which !== "register");
    $("#auth-error").textContent = "";
  }));

  $("#login-form")?.addEventListener("submit", e => {
    e.preventDefault();
    $("#auth-error").textContent = "";
    trigger(RPEvent.CefLogin, $("#login-email").value, $("#login-password").value);
  });
  $("#register-form")?.addEventListener("submit", e => {
    e.preventDefault();
    $("#auth-error").textContent = "";
    trigger(RPEvent.CefRegister, $("#register-email").value, $("#register-password").value);
  });
}

function renderCharacters(chars) {
  showOnly("characters-screen");
  const host = $("#character-list");
  host.innerHTML = "";
  if (!chars || chars.length === 0) {
    host.innerHTML = `<div style="opacity:.7;text-align:center;padding:20px;">У вас пока нет персонажей</div>`;
    return;
  }
  for (const c of chars) {
    const card = document.createElement("div");
    card.className = "character-card";
    card.innerHTML = `
      <h3>${escapeHtml(c.firstName + " " + c.lastName)}</h3>
      <p>💵 $${(c.moneyCash || 0).toLocaleString()} · 🏦 $${(c.moneyBank || 0).toLocaleString()}</p>
    `;
    card.addEventListener("click", () => {
      state.selectedCharacter = c.id;
      trigger(RPEvent.CefSelectCharacter, c.id);
    });
    host.appendChild(card);
  }
}

function bindCharacterCreate() {
  $("#show-create-character")?.addEventListener("click", () => showOnly("character-create-screen"));
  $("#cancel-create")?.addEventListener("click", () => showOnly("characters-screen"));
  $("#character-create-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const f = $("#char-first-name").value.trim();
    const l = $("#char-last-name").value.trim();
    if (!f || !l) return;
    trigger(RPEvent.CefCreateCharacter, f, l);
  });
}

// ---------- HUD ----------
function updateHud(d) {
  if (d.moneyCash !== undefined) $("#hud-cash").textContent = d.moneyCash.toLocaleString();
  if (d.moneyBank !== undefined) $("#hud-bank").textContent = d.moneyBank.toLocaleString();
  if (d.health !== undefined) $("#health-fill").style.width = Math.max(0, Math.min(100, d.health)) + "%";
  if (d.armor !== undefined) $("#armor-fill").style.width = Math.max(0, Math.min(100, d.armor)) + "%";
  if (d.job !== undefined) $("#hud-job").textContent = d.job || "Безработный";
  if (d.faction !== undefined) {
    const f = $("#hud-faction");
    if (d.faction) { f.textContent = d.faction; f.classList.remove("hidden"); }
    else f.classList.add("hidden");
  }
}

// ---------- CHAT ----------
const chatHistory = [];
function appendChat(type, name, text) {
  const log = $("#chat-log");
  if (!log) return;
  const div = document.createElement("div");
  div.className = "msg " + (type || "global");
  const safe = escapeHtml(text);
  if (type === "me") div.textContent = `* ${name} ${text}`;
  else if (type === "do") div.textContent = `* ${text} (( ${name} ))`;
  else if (type === "system") div.textContent = text;
  else div.textContent = `${name}: ${text}`;
  log.appendChild(div);
  // Keep last 30
  while (log.children.length > 30) log.removeChild(log.firstChild);
  // Auto-fade after 12s
  setTimeout(() => { div.style.transition = "opacity .8s"; div.style.opacity = "0.25"; }, 12000);
}

let chatInputOpen = false;
function openChatInput() {
  if (chatInputOpen) return;
  chatInputOpen = true;
  $("#chat-form").classList.remove("hidden");
  $("#chat-input").value = "";
  $("#chat-input").focus();
}
function closeChatInput(send) {
  if (!chatInputOpen) return;
  chatInputOpen = false;
  const v = $("#chat-input").value.trim();
  $("#chat-form").classList.add("hidden");
  $("#chat-input").blur();
  if (send && v) {
    // Slash command? Map to /me /do /try /b prefixes
    if (v.startsWith("/")) {
      const parts = v.slice(1).split(" ");
      const cmd = parts.shift();
      const rest = parts.join(" ");
      // Special-case admin panel
      if (cmd === "admin") return openAdminPanel();
      trigger("rp:command", cmd, rest);
    } else {
      trigger(RPEvent.ChatSend, "global", v);
    }
  }
}
function bindChat() {
  $("#chat-form")?.addEventListener("submit", e => { e.preventDefault(); closeChatInput(true); });
  $("#chat-input")?.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); closeChatInput(false); }
  });
}

// ---------- INVENTORY ----------
function renderInventory(items) {
  state.inventory = items || [];
  const grid = $("#inventory-grid");
  grid.innerHTML = "";
  for (let i = 0; i < 30; i++) {
    const slot = document.createElement("div");
    slot.className = "inventory-slot";
    if (state.inventory[i]) {
      slot.innerHTML = `📦<span class="inventory-slot-quantity">${state.inventory[i].quantity}</span>`;
      slot.title = state.inventory[i].itemCode;
      slot.addEventListener("click", () => {
        $$(".inventory-slot").forEach(s => s.classList.remove("selected"));
        slot.classList.add("selected");
        state.selectedInventoryIdx = i;
      });
      slot.addEventListener("dblclick", () => {
        trigger(RPEvent.InventoryUse, state.inventory[i].itemCode, 1);
      });
    }
    grid.appendChild(slot);
  }
}

// ---------- INTERACTION ----------
function bindInteraction() {
  $$(".close-btn").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.screen;
    $("#" + id)?.classList.add("hidden");
    trigger(RPEvent.CefClose);
  }));
  $$(".interaction-option").forEach(o => o.addEventListener("click", () => {
    const a = o.dataset.action;
    hide("interaction-screen");
    if (a === "inventory") {
      trigger(RPEvent.InventoryGet);
      show("inventory-screen");
    } else {
      trigger(RPEvent.CefAction, a);
    }
  }));
}

// ---------- ADMIN PANEL ----------
function openAdminPanel() {
  if (state.adminLevel < 1) {
    notify("error", "Нет прав");
    return;
  }
  $("#admin-level-badge").textContent = "L" + state.adminLevel;
  show("admin-screen");
}
function bindAdmin() {
  $$(".admin-tab").forEach(t => t.addEventListener("click", () => {
    $$(".admin-tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const which = t.dataset.adminTab;
    $$(".admin-pane").forEach(p => p.classList.toggle("hidden", p.dataset.adminPane !== which));
    if (which === "logs") trigger(RPEvent.CefAdminCommand, "logs", {});
  }));

  $("#admin-search-btn")?.addEventListener("click", () => {
    const q = $("#admin-search").value.trim();
    if (!q) return;
    trigger(RPEvent.CefAdminCommand, "search", { q });
  });
  $("#admin-search")?.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); $("#admin-search-btn").click(); }
  });

  $("#admin-refresh-logs")?.addEventListener("click", () => trigger(RPEvent.CefAdminCommand, "logs", {}));

  $$(".admin-action").forEach(b => b.addEventListener("click", () => {
    if (!state.selectedAdminTarget) return notify("warning", "Сначала выберите игрока");
    const action = b.dataset.action;
    const id = state.selectedAdminTarget.id;
    switch (action) {
      case "kick": trigger(RPEvent.CefAdminCommand, "kick", { characterId: id, reason: "Kicked by admin" }); break;
      case "heal": trigger(RPEvent.CefAdminCommand, "heal", { characterId: id, health: 100, armor: 100 }); break;
      case "freeze": trigger(RPEvent.CefAdminCommand, "freeze", { characterId: id, on: true }); break;
      case "unfreeze": trigger(RPEvent.CefAdminCommand, "freeze", { characterId: id, on: false }); break;
      case "god-on": trigger(RPEvent.CefAdminCommand, "godmode", { characterId: id, on: true }); break;
      case "god-off": trigger(RPEvent.CefAdminCommand, "godmode", { characterId: id, on: false }); break;
      case "invis-on": trigger(RPEvent.CefAdminCommand, "invisible", { characterId: id, on: true }); break;
      case "invis-off": trigger(RPEvent.CefAdminCommand, "invisible", { characterId: id, on: false }); break;
      case "mute": trigger(RPEvent.CefAdminCommand, "mute", { characterId: id, minutes: 60, reason: "Spam" }); break;
      case "unmute": trigger(RPEvent.CefAdminCommand, "unmute", { characterId: id }); break;
      case "ban": trigger(RPEvent.CefAdminCommand, "ban", { characterId: id, reason: "Banned by admin", hours: 1, permanent: false }); break;
      case "give-money": trigger(RPEvent.CefAdminCommand, "give-money", { characterId: id, amount: 10000, to: "cash" }); break;
      case "give-vehicle": trigger(RPEvent.CefAdminCommand, "give-vehicle", { characterId: id, modelCode: "blista" }); break;
      case "give-weapon": trigger(RPEvent.CefAdminCommand, "give-weapon", { characterId: id, weaponCode: "weapon_assaultrifle", ammo: 120 }); break;
      case "clear-inventory": trigger(RPEvent.CefAdminCommand, "clear-inventory", { characterId: id }); break;
    }
  }));

  $("#admin-announce-btn")?.addEventListener("click", () => {
    const txt = $("#admin-announce-text").value.trim();
    if (!txt) return;
    trigger(RPEvent.CefAdminCommand, "announce", { message: txt, kind: "info" });
    $("#admin-announce-text").value = "";
  });
}
function renderAdminSearch(results) {
  const host = $("#admin-search-results");
  host.innerHTML = "";
  for (const r of results || []) {
    const el = document.createElement("div");
    el.className = "admin-list-item";
    el.textContent = `#${r.id} · ${r.name} · admin L${r.adminLevel || 0}`;
    el.addEventListener("click", () => {
      $$(".admin-list-item").forEach(x => x.classList.remove("selected"));
      el.classList.add("selected");
      state.selectedAdminTarget = r;
      $("#admin-selected").textContent = `Выбран: ${r.name} (id ${r.id})`;
    });
    host.appendChild(el);
  }
}
function renderAdminLogs(logs) {
  const host = $("#admin-logs");
  host.innerHTML = "";
  for (const l of logs || []) {
    const el = document.createElement("div");
    el.className = "admin-list-item";
    el.innerHTML = `<b>${escapeHtml(l.action)}</b> · ${escapeHtml(l.admin || "system")} → ${escapeHtml(l.target || "—")} <i style="opacity:.6">${escapeHtml(l.details || "")}</i>`;
    host.appendChild(el);
  }
}

// ---------- BRIDGE EVENTS (client_packages -> browser) ----------
window.addEventListener("rp:show", e => {
  const screen = e.detail || "hud";
  if (screen === "auth-screen") showOnly("auth-screen");
  else if (screen === "characters-screen") showOnly("characters-screen");
  else if (screen === "hud-screen" || screen === "hud") {
    $$(".screen.full-screen").forEach(el => el.classList.add("hidden"));
    show("hud"); show("chat");
  }
  else if (screen === "inventory-screen") show("inventory-screen");
  else if (screen === "interaction-screen") show("interaction-screen");
  else if (screen === "admin-screen") openAdminPanel();
});
window.addEventListener("rp:hide", () => {
  $$(".screen.modal").forEach(el => el.classList.add("hidden"));
});
window.addEventListener("rp:event", e => {
  const { event, payload } = e.detail || {};
  switch (event) {
    case RPEvent.AuthReady:
      $$(".screen.full-screen").forEach(el => el.classList.add("hidden"));
      show("hud"); show("chat");
      break;
    case RPEvent.AuthFailed:
      showOnly("auth-screen");
      $("#auth-error").textContent = payload || "Ошибка";
      break;
    case RPEvent.CefCharacters:
      renderCharacters(payload);
      break;
    case RPEvent.CharacterSet:
      // payload: { id, firstName, lastName }
      break;
    case RPEvent.HudFull:
      updateHud(payload || {});
      break;
    case RPEvent.Notification:
      notify(payload?.kind || "info", payload?.message || "");
      break;
    case RPEvent.InventoryData:
      renderInventory(payload);
      break;
    case RPEvent.ChatMessage:
      appendChat(payload?.channel || "global", payload?.name || "?", payload?.text || "");
      break;
    case RPEvent.AdminLevel:
      state.adminLevel = payload || 0;
      const badge = $("#hud-admin");
      if (state.adminLevel > 0) {
        badge.textContent = "Admin L" + state.adminLevel;
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
      break;
    case RPEvent.AdminLog:
      if (Array.isArray(payload)) renderAdminLogs(payload);
      else if (payload?.kind === "search") renderAdminSearch(payload.results);
      else if (payload?.kind === "bans") renderAdminBans(payload.results);
      else if (payload?.kind === "online") renderAdminOnline(payload.results);
      break;
    case RPEvent.AdminBanned:
      showBanScreen(payload);
      break;
    case "rp:phone:data":
      renderPhoneContacts(payload?.contacts || []);
      renderPhoneMessages(payload?.messages || []);
      updatePhoneBank(payload?.bankBalance || 0);
      break;
    case "rp:tablet:data":
      renderTabletMarket(payload?.market || []);
      renderTabletJobs(payload?.jobs || []);
      renderTabletHouses(payload?.houses || []);
      renderTabletBusinesses(payload?.businesses || []);
      renderTabletFactions(payload?.factions || []);
      break;
    case "rp:shop:data":
      renderShopItems(payload?.items || []);
      break;
  }
});

// ---------- GLOBAL KEYS (CEF gets keydown when not focused on input) ----------
window.addEventListener("keydown", e => {
  if (chatInputOpen) return;
  // T or Y: open chat input
  if (e.code === "KeyT" || e.code === "KeyY") {
    e.preventDefault(); openChatInput();
  }
});

// ---------- HELPERS ----------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- INIT ----------
window.addEventListener("DOMContentLoaded", () => {
  bindAuth();
  bindCharacterCreate();
  bindChat();
  bindInteraction();
  bindAdmin();
  bindPhone();
  bindTablet();
  enhanceAdminActions();
  showOnly("auth-screen");
  // Tell server we are ready
  trigger(RPEvent.UiCefReady);
});

// ---------- BAN SCREEN ----------
function showBanScreen(data) {
  if (!data) return;
  showOnly("ban-screen");
  $("#ban-reason").textContent = "Причина: " + (data.message || "").replace("Banned: ", "");
  if (data.permanent) {
    $("#ban-permanent").classList.remove("hidden");
    $("#ban-remaining").classList.add("hidden");
  } else {
    $("#ban-permanent").classList.add("hidden");
    $("#ban-remaining").classList.remove("hidden");
    $("#ban-remaining").textContent = data.remainingText || "Ожидайте разблокировки";
  }
}

// ---------- PHONE ----------
function bindPhone() {
  $$(".phone-tab").forEach(t => t.addEventListener("click", () => {
    $$(".phone-tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const which = t.dataset.phoneTab;
    $$(".phone-pane").forEach(p => p.classList.toggle("hidden", p.dataset.phonePane !== which));
  }));
  $("#phone-add-contact")?.addEventListener("click", () => {
    trigger("cef:phone:add-contact", $("#phone-add-name").value, $("#phone-add-number").value);
  });
  $("#phone-send-msg")?.addEventListener("click", () => {
    trigger("cef:phone:send-msg", $("#phone-msg-to").value, $("#phone-msg-text").value);
    $("#phone-msg-text").value = "";
  });
  $("#phone-bank-transfer")?.addEventListener("click", () => {
    trigger("cef:phone:bank-transfer", $("#phone-bank-to").value, parseInt($("#phone-bank-amount").value || "0", 10));
  });
}
function renderPhoneContacts(list) {
  const host = $("#phone-contacts-list"); if (!host) return;
  host.innerHTML = "";
  for (const c of list) {
    const el = document.createElement("div"); el.className = "admin-list-item";
    el.textContent = `${c.name} · ${c.phoneNumber}`;
    host.appendChild(el);
  }
}
function renderPhoneMessages(list) {
  const host = $("#phone-messages-list"); if (!host) return;
  host.innerHTML = "";
  for (const m of list) {
    const el = document.createElement("div"); el.className = "admin-list-item";
    el.textContent = `${m.from || "?"}: ${m.message}`;
    host.appendChild(el);
  }
}
function updatePhoneBank(balance) {
  const el = $("#phone-bank-balance"); if (el) el.textContent = "$" + balance.toLocaleString();
}

// ---------- TABLET ----------
function bindTablet() {
  $$(".tablet-tab").forEach(t => t.addEventListener("click", () => {
    $$(".tablet-tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const which = t.dataset.tabletTab;
    $$(".tablet-pane").forEach(p => p.classList.toggle("hidden", p.dataset.tabletPane !== which));
    trigger("cef:tablet:load", which);
  }));
  $("#tablet-market-refresh")?.addEventListener("click", () => trigger("cef:tablet:load", "market"));
}
function renderTabletMarket(list) {
  const host = $("#tablet-market-list"); if (!host) return;
  host.innerHTML = "";
  for (const item of list) {
    const el = document.createElement("div"); el.className = "admin-list-item";
    el.innerHTML = `<b>${escapeHtml(item.title)}</b> · $${item.price} · ${escapeHtml(item.listingType || "item")}`;
    el.addEventListener("click", () => trigger("cef:tablet:buy", item.id));
    host.appendChild(el);
  }
}
function renderTabletJobs(list) {
  const host = $("#tablet-jobs-list"); if (!host) return;
  host.innerHTML = "";
  for (const j of list) {
    const el = document.createElement("div"); el.className = "admin-list-item";
    el.textContent = `${j.jobCode} · Уровень ${j.level}`;
    host.appendChild(el);
  }
}
function renderTabletHouses(list) {
  const host = $("#tablet-houses-list"); if (!host) return;
  host.innerHTML = "";
  for (const h of list) {
    const el = document.createElement("div"); el.className = "admin-list-item";
    el.textContent = `Дом #${h.id} · $${h.price}`;
    host.appendChild(el);
  }
}
function renderTabletBusinesses(list) {
  const host = $("#tablet-businesses-list"); if (!host) return;
  host.innerHTML = "";
  for (const b of list) {
    const el = document.createElement("div"); el.className = "admin-list-item";
    el.textContent = `${b.name} · $${b.price}`;
    host.appendChild(el);
  }
}
function renderTabletFactions(list) {
  const host = $("#tablet-factions-list"); if (!host) return;
  host.innerHTML = "";
  for (const f of list) {
    const el = document.createElement("div"); el.className = "admin-list-item";
    el.textContent = `${f.name} · ${f.type}`;
    host.appendChild(el);
  }
}

// ---------- SHOP ----------
function renderShopItems(list) {
  const host = $("#shop-items"); if (!host) return;
  host.innerHTML = "";
  for (const item of list) {
    const el = document.createElement("div"); el.className = "admin-list-item row";
    el.innerHTML = `<span>${escapeHtml(item.name || item.itemCode)}</span><span>$${item.price}</span>`;
    const btn = document.createElement("button"); btn.className = "primary small"; btn.textContent = "Купить";
    btn.addEventListener("click", () => trigger("cef:shop:buy", item.itemCode, 1));
    el.appendChild(btn);
    host.appendChild(el);
  }
}

// ---------- ENHANCED ADMIN ----------
function renderAdminBans(list) {
  const host = $("#admin-logs"); if (!host) return;
  host.innerHTML = "";
  for (const b of list || []) {
    const el = document.createElement("div"); el.className = "admin-list-item";
    el.textContent = `User ${b.userId} · ${b.banType || "temp"} · ${b.reason}`;
    host.appendChild(el);
  }
}
function renderAdminOnline(list) {
  const host = $("#admin-logs"); if (!host) return;
  host.innerHTML = "";
  for (const p of list || []) {
    const el = document.createElement("div"); el.className = "admin-list-item";
    el.textContent = `${p.characterName} · admin L${p.adminLevel} · ${p.ping}ms`;
    host.appendChild(el);
  }
}

// Update bindAdmin with new actions
function enhanceAdminActions() {
  // Add extra actions dynamically if not present
  const container = $(".admin-actions .row.wrap");
  if (!container) return;
  const extras = [
    { action: "noclip-on", label: "Noclip ON" },
    { action: "noclip-off", label: "Noclip OFF" },
    { action: "spectate", label: "Spectate" },
    { action: "prison", label: "Prison 10м" },
    { action: "unprison", label: "Unprison" },
    { action: "give-level", label: "+Level" },
    { action: "faction-remove", label: "Kick Frac" },
    { action: "tp-map", label: "TP Map" },
  ];
  for (const btn of extras) {
    const b = document.createElement("button"); b.className = "admin-action"; b.dataset.action = btn.action; b.textContent = btn.label;
    b.addEventListener("click", () => {
      if (!state.selectedAdminTarget) return notify("warning", "Сначала выберите игрока");
      const id = state.selectedAdminTarget.id;
      switch (btn.action) {
        case "noclip-on": trigger(RPEvent.CefAdminCommand, "noclip", { characterId: id, on: true }); break;
        case "noclip-off": trigger(RPEvent.CefAdminCommand, "noclip", { characterId: id, on: false }); break;
        case "spectate": trigger(RPEvent.CefAdminCommand, "spectate", { adminCharacterId: state.characterId, targetCharacterId: id, on: true }); break;
        case "prison": trigger(RPEvent.CefAdminCommand, "prison", { characterId: id, minutes: 10, reason: "Admin", on: true }); break;
        case "unprison": trigger(RPEvent.CefAdminCommand, "prison", { characterId: id, minutes: 0, reason: "", on: false }); break;
        case "give-level": trigger(RPEvent.CefAdminCommand, "give-level", { characterId: id, level: 5 }); break;
        case "faction-remove": trigger(RPEvent.CefAdminCommand, "faction-remove", { characterId: id }); break;
        case "tp-map":
          const x = prompt("X:"); const y = prompt("Y:"); const z = prompt("Z:");
          if (x && y && z) trigger(RPEvent.CefAdminCommand, "tp-map", { characterId: id, x: parseFloat(x), y: parseFloat(y), z: parseFloat(z) });
          break;
      }
    });
    container.appendChild(b);
  }
}

// Expose for client_packages debugging
if (typeof window !== "undefined") {
  window.__rp = { trigger, state, openChatInput, openAdminPanel };
}
