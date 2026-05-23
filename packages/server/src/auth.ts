import jwt from "jsonwebtoken";
import type { Request } from "express";
import { config } from "./config.js";

type JwtPayload = { userId: number };

export function getUserIdFromRequest(req: Request): number | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const token = auth.replace("Bearer ", "");
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    return payload.userId;
  } catch {
    return null;
  }
}
