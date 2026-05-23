import { RPEvent, type JobRecord } from "@gta-rp/shared";
import { api } from "../auth.js";
import type { BackendCharacter } from "../auth.js";
import { requireSession } from "../session.js";
import { notifyError, pushHud } from "../hud.js";

declare const mp: any;

interface JobsResponse {
  jobs: JobRecord[];
}

export function registerJobHandlers(): void {
  mp.events.add(RPEvent.JobsGet, async (player: any) => {
    try {
      const { token } = requireSession(player.id);
      const data = await api.get<JobsResponse>("/jobs/me", token);
      player.call(RPEvent.JobsData, [data.jobs]);
    } catch (e) {
      notifyError(player, "Не удалось загрузить работы");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(RPEvent.JobsStart, async (player: any, jobCode: string) => {
    try {
      const { token } = requireSession(player.id);
      await api.post("/jobs/start", { jobCode }, token);
      player.call(RPEvent.JobsStarted, [jobCode]);
    } catch (e) {
      notifyError(player, "Не удалось начать работу");
      mp.console.logError?.(String(e));
    }
  });

  mp.events.add(
    RPEvent.JobsComplete,
    async (player: any, jobCode: string, distanceMeters: number) => {
      try {
        const { token } = requireSession(player.id);
        const result = await api.post<{ payout: number; xpGain: number }>(
          "/jobs/complete",
          { jobCode, distanceMeters },
          token
        );
        const character = await api.get<BackendCharacter>("/characters/me", token);
        pushHud(player, {
          moneyCash: character.moneyCash,
          moneyBank: character.moneyBank
        });
        player.call(RPEvent.JobsCompleted, [result.payout, result.xpGain]);
      } catch (e) {
        notifyError(player, "Не удалось завершить работу");
        mp.console.logError?.(String(e));
      }
    }
  );
}
