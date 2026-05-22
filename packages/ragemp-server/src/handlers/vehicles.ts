import { RPEvent, type VehicleRecord } from "@gta-rp/shared";
import { api } from "../auth.js";
import type { BackendCharacter } from "../auth.js";
import { requireSession, getSessionByCharacterId } from "../session.js";
import { notifyError, pushHud } from "../hud.js";

declare const mp: any;

interface VehiclesResponse {
  vehicles: VehicleRecord[];
}

// Track spawned RAGE MP vehicle entities so we can despawn / impound server-side too.
const spawnedVehicles = new Map<number, any>();

export function getSpawnedVehicle(dbId: number): any | undefined {
  return spawnedVehicles.get(dbId);
}

function spawnVehicleEntity(
  modelCode: string,
  plate: string,
  x: number,
  y: number,
  z: number,
  heading: number
): any {
  const model = mp.joaat(modelCode);
  const veh = mp.vehicles.new(model, new mp.Vector3(x, y, z), {
    heading,
    numberPlate: plate,
    locked: true,
    engine: false,
    dimension: 0
  });
  return veh;
}

export function registerVehicleHandlers(): void {
  mp.events.add(RPEvent.VehiclesGet, async (player: any) => {
    try {
      const { token } = requireSession(player.id);
      const data = await api.get<VehiclesResponse>("/vehicles/me", token);
      player.call(RPEvent.VehiclesData, [data.vehicles]);
    } catch (e) {
      notifyError(player, "Не удалось загрузить транспорт");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(RPEvent.VehiclesCatalogGet, async (player: any) => {
    try {
      const data = await api.get<{ vehicles: unknown[] }>("/vehicles/catalog");
      player.call(RPEvent.VehiclesCatalog, [data.vehicles]);
    } catch (e) {
      notifyError(player, "Не удалось загрузить каталог");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(RPEvent.VehiclesBuy, async (player: any, modelCode: string) => {
    try {
      const { token } = requireSession(player.id);
      await api.post("/vehicles/buy", { modelCode }, token);
      const character = await api.get<BackendCharacter>("/characters/me", token);
      pushHud(player, { moneyCash: character.moneyCash, moneyBank: character.moneyBank });
      player.call(RPEvent.VehiclesBought, [modelCode]);
    } catch (e) {
      notifyError(player, "Покупка не удалась");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(
    RPEvent.VehiclesSpawn,
    async (player: any, vehicleId: number) => {
      try {
        const { token } = requireSession(player.id);
        const pos = player.position;
        const heading = player.heading;
        await api.post(
          "/vehicles/spawn",
          { vehicleId, x: pos.x, y: pos.y, z: pos.z, heading },
          token
        );
        // Fetch fresh metadata so we know the model & plate
        const data = await api.get<VehiclesResponse>("/vehicles/me", token);
        const record = data.vehicles.find((v) => v.id === vehicleId);
        if (!record) {
          notifyError(player, "Транспорт не найден");
          return;
        }
        // Destroy previous if respawn
        const existing = spawnedVehicles.get(vehicleId);
        if (existing && existing.destroy) existing.destroy();

        const veh = spawnVehicleEntity(record.modelCode, record.plate, pos.x, pos.y, pos.z + 0.5, heading);
        veh.setVariable("vehicleId", vehicleId);
        veh.setVariable("ownerCharacterId", requireSession(player.id).characterId);
        spawnedVehicles.set(vehicleId, veh);

        player.call(RPEvent.VehiclesSpawned, [vehicleId]);
      } catch (e) {
        notifyError(player, "Не удалось заспавнить транспорт");
        mp.console.logError?.(String(e));
      }
    }
  );

  mp.events.add(RPEvent.VehiclesDespawn, async (player: any, vehicleId: number) => {
    try {
      const { token } = requireSession(player.id);
      const veh = spawnedVehicles.get(vehicleId);
      const pos = veh?.position ?? player.position;
      const heading = veh?.heading ?? player.heading;
      await api.post(
        "/vehicles/despawn",
        { vehicleId, x: pos.x, y: pos.y, z: pos.z, heading },
        token
      );
      if (veh?.destroy) veh.destroy();
      spawnedVehicles.delete(vehicleId);
      player.call(RPEvent.VehiclesDespawned, [vehicleId]);
    } catch (e) {
      notifyError(player, "Не удалось убрать транспорт");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(
    RPEvent.VehiclesKeysGive,
    async (player: any, targetCharacterId: number, vehicleId: number) => {
      try {
        const { token } = requireSession(player.id);
        await api.post("/vehicles/keys/give", { targetCharacterId, vehicleId }, token);
        player.call(RPEvent.VehiclesKeysGiven, [vehicleId]);
      } catch (e) {
        notifyError(player, "Не удалось передать ключи");
        mp.console.logError?.(String(e));
      }
    }
  );

  mp.events.add(RPEvent.VehiclesImpound, async (player: any, vehicleId: number) => {
    try {
      const { token } = requireSession(player.id);
      await api.post("/vehicles/impound", { vehicleId }, token);
      const veh = spawnedVehicles.get(vehicleId);
      if (veh?.destroy) veh.destroy();
      spawnedVehicles.delete(vehicleId);
      player.call(RPEvent.VehiclesImpounded, [vehicleId]);
    } catch (e) {
      notifyError(player, "Не удалось забрать на штрафстоянку");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(RPEvent.VehiclesRelease, async (player: any, vehicleId: number) => {
    try {
      const { token } = requireSession(player.id);
      await api.post("/vehicles/impound/release", { vehicleId }, token);
      player.call(RPEvent.VehiclesReleased, [vehicleId]);
    } catch (e) {
      notifyError(player, "Не удалось освободить транспорт");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(RPEvent.VehiclesInsurance, async (player: any, vehicleId: number) => {
    try {
      const { token } = requireSession(player.id);
      await api.post("/vehicles/tuning/insurance", { vehicleId }, token);
      player.call(RPEvent.VehiclesInsured, [vehicleId]);
    } catch (e) {
      notifyError(player, "Покупка страховки не удалась");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(
    RPEvent.VehiclesUpgrade,
    async (player: any, vehicleId: number, upgradeType: string) => {
      try {
        const { token } = requireSession(player.id);
        await api.post("/vehicles/tuning/upgrade", { vehicleId, upgradeType }, token);
        player.call(RPEvent.VehiclesUpgraded, [vehicleId, upgradeType]);
      } catch (e) {
        notifyError(player, "Тюнинг не удался");
        mp.console.logError?.(String(e));
      }
    }
  );

  // Lock sync — client tells server, server broadcasts new lock state to everyone in stream range
  mp.events.add(RPEvent.VehiclesLockSync, (player: any, vehicleId: number, locked: boolean) => {
    const veh = spawnedVehicles.get(vehicleId);
    if (veh) veh.locked = locked;
    mp.players.broadcast(`[veh] ${vehicleId} locked=${locked}`);
  });

  // ----- Internal events from admin queue -----
  mp.events.add("rp:internal:veh-repair", (vehicleId: number) => {
    const veh = spawnedVehicles.get(vehicleId);
    if (veh) {
      veh.repair?.();
      veh.engineHealth = 1000;
      veh.bodyHealth = 1000;
    }
  });
  mp.events.add("rp:internal:veh-respawn", (vehicleId: number) => {
    const veh = spawnedVehicles.get(vehicleId);
    if (!veh) return;
    const pos = veh.position;
    const heading = veh.heading;
    const plate = veh.numberPlate;
    const model = veh.model;
    const owner = veh.getVariable?.("ownerCharacterId");
    veh.destroy();
    spawnedVehicles.delete(vehicleId);
    const fresh = mp.vehicles.new(model, pos, { heading, numberPlate: plate, locked: true, engine: false, dimension: 0 });
    fresh.setVariable("vehicleId", vehicleId);
    if (owner) fresh.setVariable("ownerCharacterId", owner);
    spawnedVehicles.set(vehicleId, fresh);
  });
  mp.events.add("rp:internal:veh-delete", (vehicleId: number) => {
    const veh = spawnedVehicles.get(vehicleId);
    if (veh?.destroy) veh.destroy();
    spawnedVehicles.delete(vehicleId);
  });
}

/**
 * Spawns all of the player's persisted vehicles on login. The first vehicle
 * (most recent) is placed next to the player so they can immediately drive away,
 * the rest are spawned at their last known position (or skipped if unknown).
 */
export async function spawnPlayerVehicles(player: any): Promise<void> {
  const session = requireSession(player.id);
  const data = await api.get<VehiclesResponse & { vehicles: Array<VehicleRecord & { pos_x?: number; pos_y?: number; pos_z?: number; heading?: number }> }>(
    "/vehicles/me",
    session.token
  );
  if (!data.vehicles || data.vehicles.length === 0) return;
  const ownerCharacterId = session.characterId;
  const playerPos = player.position;
  let placedNextToPlayer = false;

  for (const record of data.vehicles) {
    const r = record as any;
    let x = r.pos_x, y = r.pos_y, z = r.pos_z, heading = r.heading ?? 0;
    if ((x === null || x === undefined) && !placedNextToPlayer) {
      // Place beside player so they can hop in immediately.
      x = playerPos.x + 3;
      y = playerPos.y;
      z = playerPos.z;
      heading = player.heading;
      placedNextToPlayer = true;
    }
    if (x === null || x === undefined) continue;
    if (spawnedVehicles.has(record.id)) continue;
    try {
      const veh = mp.vehicles.new(mp.joaat(record.modelCode), new mp.Vector3(x, y, z + 0.5), {
        heading,
        numberPlate: record.plate,
        locked: true,
        engine: false,
        dimension: 0
      });
      veh.setVariable("vehicleId", record.id);
      veh.setVariable("ownerCharacterId", ownerCharacterId);
      spawnedVehicles.set(record.id, veh);
    } catch (e) {
      mp.console.logError?.(`spawnPlayerVehicles failed for ${record.modelCode}: ${String(e)}`);
    }
  }
}

/**
 * Persists positions of all currently spawned vehicles back to the backend.
 * Called periodically so a server crash does not lose state.
 */
export async function persistAllVehiclePositions(): Promise<void> {
  for (const [vehicleId, veh] of spawnedVehicles) {
    try {
      const ownerCharacterId = veh.getVariable?.("ownerCharacterId");
      if (!ownerCharacterId) continue;
      const entry = getSessionByCharacterId(ownerCharacterId);
      if (!entry) continue;
      await api.post(
        "/vehicles/position",
        {
          vehicleId,
          x: veh.position.x,
          y: veh.position.y,
          z: veh.position.z,
          heading: veh.heading ?? 0,
          locked: !!veh.locked
        },
        entry.session.token
      );
    } catch {
      /* noop */
    }
  }
}

export function cleanupPlayerVehicles(characterId: number): void {
  for (const [id, veh] of spawnedVehicles) {
    if (veh.getVariable?.("ownerCharacterId") === characterId) {
      try {
        veh.destroy();
      } catch {
        /* noop */
      }
      spawnedVehicles.delete(id);
    }
  }
}
