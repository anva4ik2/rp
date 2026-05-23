// Centralized mutable client-side state.
// Keep it tiny — used to share between modules without import cycles.

export interface ClientState {
  authToken: string | null;
  characterId: number | null;
  browser: any | null;
  cefVisible: boolean;
  adminMode: boolean;
  adminLevel: number;
}

export const state: ClientState = {
  authToken: null,
  characterId: null,
  browser: null,
  cefVisible: false,
  adminMode: false,
  adminLevel: 0
};
