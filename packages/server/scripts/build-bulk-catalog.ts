import fs from "node:fs/promises";
import path from "node:path";

type Tier = "economy" | "comfort" | "sport" | "premium" | "super";
type Region = "EU" | "RU" | "CIS" | "DE";

type BulkVehicle = {
  modelCode: string;
  displayName: string;
  brand: string;
  price: number;
  tier: Tier;
  regions: Region[];
  access: string[];
};

const brands = [
  "Dinka",
  "Karin",
  "Obey",
  "Benefactor",
  "Ubermacht",
  "Lampadati",
  "Pfister",
  "Enus",
  "Grotti",
  "Pegassi",
  "Truffade",
  "Annis",
  "Bravado",
  "Vapid",
  "Declasse",
  "Ocelot",
  "Coil",
  "Vulcar",
  "Albany",
  "Gallivanter"
];

const tierPool: Array<{ tier: Tier; min: number; max: number }> = [
  { tier: "economy", min: 35000, max: 140000 },
  { tier: "comfort", min: 150000, max: 520000 },
  { tier: "sport", min: 540000, max: 1900000 },
  { tier: "premium", min: 900000, max: 3500000 },
  { tier: "super", min: 2100000, max: 7000000 }
];

const regionsPool: Region[][] = [
  ["EU"],
  ["DE", "EU"],
  ["RU", "CIS"],
  ["RU", "CIS", "EU"],
  ["EU", "DE", "RU", "CIS"]
];

function pseudoRand(seed: number): number {
  const x = Math.sin(seed * 999) * 10000;
  return x - Math.floor(x);
}

function pick<T>(arr: T[], indexSeed: number): T {
  return arr[Math.floor(pseudoRand(indexSeed) * arr.length)];
}

function buildVehicle(index: number): BulkVehicle {
  const tierDef = pick(tierPool, index + 11);
  const brand = pick(brands, index + 37);
  const regions = pick(regionsPool, index + 59);
  const spread = tierDef.max - tierDef.min;
  const price = Math.round(tierDef.min + pseudoRand(index + 83) * spread);
  const modelCode = `civx_${tierDef.tier}_${String(index + 1).padStart(3, "0")}`;
  const displayName = `${brand} ${tierDef.tier.toUpperCase()} ${index + 1}`;

  return {
    modelCode,
    displayName,
    brand,
    price,
    tier: tierDef.tier,
    regions,
    access: ["civilian"]
  };
}

async function main(): Promise<void> {
  const targetCount = 240;
  const items = Array.from({ length: targetCount }, (_, index) => buildVehicle(index));
  const payload = {
    items,
    replaceAll: false
  };

  const outputDir = path.resolve(process.cwd(), "catalog");
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.resolve(outputDir, "bulk-civilian-240.json");
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  console.log(`Generated ${targetCount} vehicles at ${outputPath}`);
}

main().catch((error) => {
  console.error("Catalog build failed:", error);
  process.exit(1);
});
