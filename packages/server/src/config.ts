import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  ADMIN_TOKEN: z.string().default("dev-admin-token"),
  CORS_ORIGINS: z.string().default("*"),
  RATE_LIMIT_WINDOW_MS: z.string().default("60000"),
  RATE_LIMIT_MAX: z.string().default("120"),
  AUTH_RATE_LIMIT_WINDOW_MS: z.string().default("60000"),
  AUTH_RATE_LIMIT_MAX: z.string().default("20"),
  TRUST_PROXY: z.string().default("true")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid env:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  port: Number(parsed.data.PORT),
  databaseUrl: parsed.data.DATABASE_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  adminToken: parsed.data.ADMIN_TOKEN,
  corsOrigins: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim()),
  rateLimitWindowMs: Number(parsed.data.RATE_LIMIT_WINDOW_MS),
  rateLimitMax: Number(parsed.data.RATE_LIMIT_MAX),
  authRateLimitWindowMs: Number(parsed.data.AUTH_RATE_LIMIT_WINDOW_MS),
  authRateLimitMax: Number(parsed.data.AUTH_RATE_LIMIT_MAX),
  trustProxy: parsed.data.TRUST_PROXY.toLowerCase() === "true"
};
