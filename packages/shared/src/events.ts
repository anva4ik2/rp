// Centralized event name constants shared by RAGE MP server, client and CEF.
// Using constants prevents typos and keeps both sides in sync.

export const RPEvent = {
  // Auth / session
  AuthReady: "rp:auth:ready",
  AuthFailed: "rp:auth:failed",
  CharacterSet: "rp:character",
  Error: "rp:error",
  Notification: "rp:notify",

  // HUD
  HudMoney: "rp:hud:money",
  HudHealth: "rp:hud:health",
  HudJob: "rp:hud:job",
  HudFaction: "rp:hud:faction",
  HudFull: "rp:hud:full",

  // Inventory
  InventoryGet: "rp:inv:get",
  InventoryData: "rp:inv:data",
  InventoryUse: "rp:inv:use",
  InventoryUsed: "rp:inv:used",
  InventoryDrop: "rp:inv:drop",

  // Jobs
  JobsGet: "rp:jobs:get",
  JobsData: "rp:jobs:data",
  JobsStart: "rp:jobs:start",
  JobsStarted: "rp:jobs:started",
  JobsComplete: "rp:jobs:complete",
  JobsCompleted: "rp:jobs:completed",

  // Vehicles
  VehiclesGet: "rp:veh:get",
  VehiclesData: "rp:veh:data",
  VehiclesCatalogGet: "rp:veh:catalog:get",
  VehiclesCatalog: "rp:veh:catalog",
  VehiclesBuy: "rp:veh:buy",
  VehiclesBought: "rp:veh:bought",
  VehiclesSpawn: "rp:veh:spawn",
  VehiclesSpawned: "rp:veh:spawned",
  VehiclesDespawn: "rp:veh:despawn",
  VehiclesDespawned: "rp:veh:despawned",
  VehiclesKeysGive: "rp:veh:keys:give",
  VehiclesKeysGiven: "rp:veh:keys:given",
  VehiclesImpound: "rp:veh:impound",
  VehiclesImpounded: "rp:veh:impounded",
  VehiclesRelease: "rp:veh:release",
  VehiclesReleased: "rp:veh:released",
  VehiclesInsurance: "rp:veh:insurance",
  VehiclesInsured: "rp:veh:insured",
  VehiclesUpgrade: "rp:veh:upgrade",
  VehiclesUpgraded: "rp:veh:upgraded",
  VehiclesLockSync: "rp:veh:lock",
  VehiclesEngineSync: "rp:veh:engine",

  // Chat
  ChatSend: "rp:chat:send",
  ChatMessage: "rp:chat:msg",

  // CEF browser controls
  UiShow: "rp:ui:show",
  UiHide: "rp:ui:hide",
  UiCefReady: "rp:ui:ready",

  // CEF <-> Client bridge (used inside browser via mp.trigger)
  CefLogin: "cef:login",
  CefRegister: "cef:register",
  CefGetCharacters: "cef:characters:get",
  CefCharacters: "cef:characters:list",
  CefCreateCharacter: "cef:characters:create",
  CefSelectCharacter: "cef:characters:select",
  CefClose: "cef:close",
  CefAction: "cef:action",
  CefAdminCommand: "cef:admin:cmd",

  // Spawn / position restore
  PlayerSpawned: "rp:player:spawned",
  PositionSync: "rp:player:pos",

  // Admin
  AdminLevel: "rp:admin:level",
  AdminLog: "rp:admin:log",
  AdminMode: "rp:admin:mode",
  AdminBanned: "rp:auth:banned",

  // Admin effects
  Fly: "rp:fly",
  Esp: "rp:esp",
  Noclip: "rp:noclip",
  Spectate: "rp:spectate",

  // Map teleport
  TpMap: "rp:tp:map"
} as const;

export type RPEventName = (typeof RPEvent)[keyof typeof RPEvent];

export type NotificationKind = "success" | "error" | "info" | "warning";

export interface HudState {
  moneyCash?: number;
  moneyBank?: number;
  health?: number;
  armor?: number;
  job?: string;
  faction?: string;
}

export interface InventoryItem {
  itemCode: string;
  quantity: number;
}

export interface VehicleRecord {
  id: number;
  modelCode: string;
  plate: string;
  fuel: number;
  isSpawned: boolean;
  hasKey?: boolean;
}

export interface JobRecord {
  jobCode: string;
  level: number;
  xp: number;
  active?: boolean;
}
