export type Character = {
  id: number;
  userId: number;
  firstName: string;
  lastName: string;
  moneyCash: number;
  moneyBank: number;
  createdAt: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
};

export type LoginPayload = RegisterPayload;

export type CreateCharacterPayload = {
  firstName: string;
  lastName: string;
};

export type AuthResponse = {
  token: string;
  userId: number;
};

export type ApiError = {
  message: string;
};

export * from "./events.js";
export * from "./api-client.js";
