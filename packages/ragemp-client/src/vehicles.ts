import { RPEvent } from "@gta-rp/shared";
import { notify } from "./browser.js";

declare const mp: any;

let currentVehicle: any | null = null;

export function initVehicles(): void {
  mp.events.add("playerEnterVehicle", (vehicle: any) => {
    currentVehicle = vehicle;
  });

  mp.events.add("playerLeaveVehicle", () => {
    currentVehicle = null;
  });

  // Server tells us to spawn / despawn — server has already created the entity,
  // we just react with notifications + optional client-side polish.
  mp.events.add(RPEvent.VehiclesSpawned, (vehicleId: number) => {
    notify("success", `Транспорт ${vehicleId} заспавнен`);
  });
  mp.events.add(RPEvent.VehiclesDespawned, () => {
    notify("info", "Транспорт убран");
  });
  mp.events.add(RPEvent.VehiclesImpounded, () => {
    notify("warning", "Транспорт на штрафстоянке");
  });

  // Lock & engine toggles
  mp.keys.bind(0x4A, false, () => toggleEngine()); // J
  mp.keys.bind(0x4C, false, () => toggleLock()); // L
}

function toggleEngine(): void {
  if (!currentVehicle) return;
  const handle = currentVehicle.handle;
  const isOn = mp.game.vehicle.isVehicleEngineRunning?.(handle) ?? false;
  mp.game.invoke("0x2497C4717C8B881E", handle, !isOn, true, false); // SET_VEHICLE_ENGINE_ON
  notify("info", !isOn ? "Двигатель запущен" : "Двигатель заглушен");
  const vehicleId = currentVehicle.getVariable?.("vehicleId");
  if (vehicleId) mp.events.callRemote(RPEvent.VehiclesEngineSync, vehicleId, !isOn);
}

function toggleLock(): void {
  if (!currentVehicle) return;
  const vehicleId = currentVehicle.getVariable?.("vehicleId");
  if (!vehicleId) {
    notify("error", "Это не ваш транспорт");
    return;
  }
  const wasLocked = !!currentVehicle.locked;
  currentVehicle.locked = !wasLocked;
  notify("info", !wasLocked ? "Машина закрыта" : "Машина открыта");
  mp.events.callRemote(RPEvent.VehiclesLockSync, vehicleId, !wasLocked);
}
