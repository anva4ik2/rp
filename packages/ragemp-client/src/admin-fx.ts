/**
 * Client-side admin effects:
 *  - ESP overlay (names over players/vehicles)
 *  - Fly mode (WASD + Space/Ctrl movement without collision)
 *  - Noclip (same as fly but with reduced alpha)
 *  - Spectate (camera follows target player)
 *  - Crown icon above admin heads (visible to all players)
 *
 * Activated by server via events.
 */
declare const mp: any;

let espOn = false;
let flyOn = false;
let noclipOn = false;
let spectateOn = false;
let spectateTarget: any = null;
let flyTickId: any = null;
let espTickId: any = null;
let spectateTickId: any = null;
let crownTickId: any = null;

function drawText3D(x: number, y: number, z: number, text: string, color = [255, 204, 51, 220]): void {
  mp.game.invoke("0xAA0008F3BBB8F416", x, y, z, false);
  mp.game.graphics.drawText(text, [0, 0], {
    font: 4,
    color: color as any,
    scale: [0.32, 0.32],
    outline: true,
    centre: true
  });
  mp.game.invoke("0xFF0B610F6BE0D7AF");
}

function drawCrown(x: number, y: number, z: number): void {
  mp.game.invoke("0xAA0008F3BBB8F416", x, y, z, false);
  mp.game.graphics.drawText("👑 АДМИН", [0, 0], {
    font: 4,
    color: [255, 215, 0, 255],
    scale: [0.28, 0.28],
    outline: true,
    centre: true
  });
  mp.game.invoke("0xFF0B610F6BE0D7AF");
}

export function initAdminFx(): void {
  // ---- ESP ----
  mp.events.add("rp:esp", (on: boolean) => {
    espOn = !!on;
    if (espOn && !espTickId) {
      espTickId = setInterval(() => {
        try {
          mp.players.forEachInStreamRange?.((p: any) => {
            if (p === mp.players.local) return;
            const pos = p.position;
            const dist = mp.players.local.position?.dist?.(pos) ?? 0;
            drawText3D(pos.x, pos.y, pos.z + 1.1, `${p.name ?? "?"} | ${dist.toFixed(0)}m`);
          });
          mp.vehicles.forEachInStreamRange?.((v: any) => {
            const pos = v.position;
            drawText3D(pos.x, pos.y, pos.z + 1.2, `${v.numberPlate ?? "?"}`);
          });
        } catch {/*noop*/}
      }, 100);
    } else if (!espOn && espTickId) {
      clearInterval(espTickId);
      espTickId = null;
    }
  });

  // ---- Fly / Noclip movement tick ----
  function startMovementTick(): void {
    if (flyTickId) return;
    const player = mp.players.local;
    flyTickId = setInterval(() => {
      if (!player.position) return;
      const speed = noclipOn ? 0.8 : 0.4;
      const rot = player.getRotation?.(2) ?? { z: player.heading ?? 0 };
      const yaw = ((rot.z ?? 0) * Math.PI) / 180;
      let dx = 0, dy = 0, dz = 0;
      if (mp.keys.isUp(87)) { dx -= Math.sin(yaw) * speed; dy += Math.cos(yaw) * speed; }
      if (mp.keys.isUp(83)) { dx += Math.sin(yaw) * speed; dy -= Math.cos(yaw) * speed; }
      if (mp.keys.isUp(65)) { dx -= Math.cos(yaw) * speed; dy -= Math.sin(yaw) * speed; }
      if (mp.keys.isUp(68)) { dx += Math.cos(yaw) * speed; dy += Math.sin(yaw) * speed; }
      if (mp.keys.isUp(32)) dz += speed;
      if (mp.keys.isUp(17)) dz -= speed;
      if (dx || dy || dz) {
        player.position = new mp.Vector3(player.position.x + dx, player.position.y + dy, player.position.z + dz);
      }
    }, 16);
  }
  function stopMovementTick(): void {
    if (flyTickId) { clearInterval(flyTickId); flyTickId = null; }
  }

  // ---- Fly ----
  mp.events.add("rp:fly", (on: boolean) => {
    flyOn = !!on;
    if (flyOn) startMovementTick(); else if (!noclipOn) stopMovementTick();
  });

  // ---- Noclip ----
  mp.events.add("rp:noclip", (on: boolean) => {
    noclipOn = !!on;
    if (noclipOn) startMovementTick(); else if (!flyOn) stopMovementTick();
  });

  // ---- Spectate ----
  mp.events.add("rp:spectate", (on: boolean, targetCharacterId: number | null) => {
    spectateOn = !!on;
    const localPlayer = mp.players.local;
    if (spectateOn && targetCharacterId) {
      // Find target player by characterId variable
      mp.players.forEachInStreamRange?.((p: any) => {
        if (p.getVariable?.("characterId") === targetCharacterId) spectateTarget = p;
      });
      if (!spectateTickId) {
        spectateTickId = setInterval(() => {
          if (spectateTarget && spectateTarget.handle) {
            const pos = spectateTarget.position;
            mp.game.cam.setGameplayCamRelativeHeading?.(0);
            // Smoothly follow target from above-behind
            const offset = new mp.Vector3(pos.x, pos.y - 5, pos.z + 3);
            localPlayer.position = offset;
          }
        }, 50);
      }
    } else {
      spectateTarget = null;
      if (spectateTickId) { clearInterval(spectateTickId); spectateTickId = null; }
      // Restore position to ground
      localPlayer.position = new mp.Vector3(localPlayer.position.x, localPlayer.position.y, localPlayer.position.z);
    }
  });

  // ---- Crown Icon (render above any player with adminMode variable) ----
  if (!crownTickId) {
    crownTickId = setInterval(() => {
      try {
        mp.players.forEachInStreamRange?.((p: any) => {
          if (p.getVariable?.("adminMode") === true) {
            const pos = p.position;
            drawCrown(pos.x, pos.y, pos.z + 1.35);
          }
        });
      } catch {/*noop*/}
    }, 120);
  }
}
