import { ApiClient, type AuthResponse } from "@gta-rp/shared";
import { config } from "./config.js";

export interface BackendCharacter {
  id: number;
  firstName: string;
  lastName: string;
  moneyCash: number;
  moneyBank: number;
  position?: { x: number; y: number; z: number; heading: number } | null;
  health?: number;
  armor?: number;
}

const api = new ApiClient({ baseUrl: config.apiBaseUrl });
export { api };

export async function login(email: string, password: string): Promise<AuthResponse & { adminLevel?: number }> {
  return api.post<AuthResponse & { adminLevel?: number }>("/auth/login", { email, password });
}

export async function register(email: string, password: string): Promise<AuthResponse & { adminLevel?: number }> {
  return api.post<AuthResponse & { adminLevel?: number }>("/auth/register", { email, password });
}

export async function listCharacters(token: string): Promise<BackendCharacter[]> {
  const res = await api.get<{ characters: BackendCharacter[] }>("/characters", token);
  return res.characters ?? [];
}

export async function createCharacter(token: string, firstName: string, lastName: string): Promise<BackendCharacter> {
  return api.post<BackendCharacter>("/characters", { firstName, lastName }, token);
}

export async function getActiveCharacter(token: string): Promise<BackendCharacter | null> {
  try {
    return await api.get<BackendCharacter>("/characters/me", token);
  } catch {
    return null;
  }
}

export async function saveCharacterState(
  token: string,
  state: { x?: number; y?: number; z?: number; heading?: number; health?: number; armor?: number }
): Promise<void> {
  await api.post("/characters/save-state", state, token).catch(() => {
    /* endpoint optional, ignore */
  });
}
