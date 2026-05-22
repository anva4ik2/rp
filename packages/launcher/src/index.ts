import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

dotenv.config();

type ManifestFile = {
  path: string;
  sha256: string;
};

type Manifest = {
  files: ManifestFile[];
};

const serverBaseUrl = process.env.LAUNCHER_PATCH_BASE_URL ?? "http://localhost:4000/static";
const gamePath = process.env.GTA_PATH ?? "C:/Games/GTA5/GTA5.exe";
const clientDir = process.env.CLIENT_DIR ?? "./runtime-client";

async function sha256File(filePath: string): Promise<string> {
  const file = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(file).digest("hex");
}

async function ensureDir(targetPath: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
}

async function syncClientFiles(): Promise<void> {
  const manifestRes = await fetch(`${serverBaseUrl}/manifest.json`);
  if (!manifestRes.ok) throw new Error("Failed to fetch manifest");
  const manifest = (await manifestRes.json()) as Manifest;

  for (const item of manifest.files) {
    const localPath = path.resolve(clientDir, item.path);
    let needsDownload = true;
    try {
      const existingHash = await sha256File(localPath);
      needsDownload = existingHash !== item.sha256;
    } catch {
      needsDownload = true;
    }

    if (!needsDownload) continue;

    const fileRes = await fetch(`${serverBaseUrl}/${item.path}`);
    if (!fileRes.ok) {
      throw new Error(`Failed to download ${item.path}`);
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    await ensureDir(localPath);
    await fs.writeFile(localPath, Buffer.from(arrayBuffer));
    console.log(`[launcher] updated ${item.path}`);
  }
}

function startGame(): void {
  const child = spawn(gamePath, [], { stdio: "inherit" });
  child.on("exit", (code) => {
    console.log(`[launcher] game closed with code ${code ?? 0}`);
  });
}

async function main(): Promise<void> {
  console.log("[launcher] sync started");
  await syncClientFiles();
  console.log("[launcher] sync complete");
  startGame();
}

main().catch((error) => {
  console.error("[launcher] fatal:", error);
  process.exit(1);
});
