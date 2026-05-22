import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { authRouter } from "./modules/auth.js";
import { characterRouter } from "./modules/character.js";
import { characterFullRouter } from "./modules/character-full.js";
import { economyRouter } from "./modules/economy.js";
import { inventoryRouter } from "./modules/inventory.js";
import { inventoryFullRouter } from "./modules/inventory-full.js";
import { jobsRouter } from "./modules/jobs.js";
import { vehiclesRouter } from "./modules/vehicles.js";
import { factionsRouter } from "./modules/factions.js";
import { crimeRouter } from "./modules/crime.js";
import { adminRouter } from "./modules/admin.js";
import { chatRouter } from "./modules/chat.js";
import { weaponsRouter } from "./modules/weapons.js";
import { bankRouter } from "./modules/bank.js";
import { anticheatRouter } from "./modules/anticheat.js";
import { moderationRouter } from "./modules/moderation.js";
import { licensesRouter } from "./modules/licenses.js";
import { housesRouter } from "./modules/houses.js";
import { businessesRouter } from "./modules/businesses.js";
import { npcShopsRouter } from "./modules/npc-shops.js";
import { garagesRouter } from "./modules/garages.js";
import { animationsRouter } from "./modules/animations.js";
import { phoneRouter } from "./modules/phone.js";
import { familyRouter } from "./modules/family.js";
import { tabletRouter } from "./modules/tablet.js";
import { marketplaceRouter } from "./modules/marketplace.js";
import { config } from "./config.js";
import { pool, runMigrations } from "./db.js";

function allowOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (config.corsOrigins.includes("*")) return true;
  return config.corsOrigins.includes(origin);
}

async function bootstrap(): Promise<void> {
  await runMigrations();

  const app = express();
  const authLimiter = rateLimit({
    windowMs: config.authRateLimitWindowMs,
    max: config.authRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many auth attempts, please try again later." }
  });

  app.set("trust proxy", config.trustProxy);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (allowOrigin(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true
    })
  );
  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/ready", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      return res.json({ status: "ready" });
    } catch {
      return res.status(503).json({ status: "not_ready" });
    }
  });

  app.use("/auth", authLimiter, authRouter);
  app.use("/characters", characterRouter);
  app.use("/characters-full", characterFullRouter);
  app.use("/economy", economyRouter);
  app.use("/inventory", inventoryRouter);
  app.use("/inventory-full", inventoryFullRouter);
  app.use("/jobs", jobsRouter);
  app.use("/vehicles", vehiclesRouter);
  app.use("/factions", factionsRouter);
  app.use("/crime", crimeRouter);
  app.use("/chat", chatRouter);
  app.use("/weapons", weaponsRouter);
  app.use("/bank", bankRouter);
  app.use("/anticheat", anticheatRouter);
  app.use("/moderation", moderationRouter);
  app.use("/licenses", licensesRouter);
  app.use("/houses", housesRouter);
  app.use("/businesses", businessesRouter);
  app.use("/npc-shops", npcShopsRouter);
  app.use("/garages", garagesRouter);
  app.use("/animations", animationsRouter);
  app.use("/phone", phoneRouter);
  app.use("/family", familyRouter);
  app.use("/tablet", tabletRouter);
  app.use("/marketplace", marketplaceRouter);
  app.use("/admin", adminRouter);

  app.listen(config.port, () => {
    console.log(`[server] running on http://localhost:${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("[server] fatal:", error);
  process.exit(1);
});
