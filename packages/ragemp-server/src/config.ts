import dotenv from "dotenv";
dotenv.config();

export const config = {
  apiBaseUrl: process.env.API_BASE_URL ?? "http://localhost:3000",
  spawnPos: { x: -1038.2, y: -2737.8, z: 13.8 },
  defaultModel: "mp_m_freemode_01",
  authSalt: process.env.AUTH_SALT ?? "ragemp-default-salt",
  adminToken: process.env.ADMIN_TOKEN ?? "",
  // How often we poll backend admin queues and persist character state.
  adminPollMs: Number(process.env.ADMIN_POLL_MS ?? 3000),
  positionSaveMs: Number(process.env.POSITION_SAVE_MS ?? 30_000)
} as const;
