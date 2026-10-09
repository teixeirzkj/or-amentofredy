// Backend local: arquivos em data/ (uso em desenvolvimento ou num servidor próprio).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// Em serverless (Vercel/Lambda) o projeto é somente leitura: usa /tmp, que é efêmero. Serve pra testar, não pra produção.
export const IS_EPHEMERAL = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
export const DATA_DIR = IS_EPHEMERAL ? path.join(os.tmpdir(), "fredy-orcamentos") : path.join(ROOT, "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

async function ensureDirs() {
  await fs.mkdir(path.join(DATA_DIR, "proposals"), { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}
const safe = (p) => {
  const full = path.join(DATA_DIR, p);
  if (!full.startsWith(DATA_DIR)) throw new Error("caminho inválido");
  return full;
};

export async function writeJson(name, obj) {
  await ensureDirs();
  const file = safe(name);
  await fs.writeFile(file + ".tmp", JSON.stringify(obj, null, 2), "utf8");
  await fs.rename(file + ".tmp", file);
}
export async function readJson(name) {
  try {
    return JSON.parse(await fs.readFile(safe(name), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
export async function listJson(prefix) {
  await ensureDirs();
  const dir = safe(prefix);
  const out = [];
  for (const f of await fs.readdir(dir)) {
    if (!f.endsWith(".json")) continue;
    try { out.push(JSON.parse(await fs.readFile(path.join(dir, f), "utf8"))); } catch { /* ignora corrompido */ }
  }
  return out;
}
export async function writeImage(id, buf) {
  await ensureDirs();
  await fs.writeFile(path.join(UPLOADS_DIR, id), buf);
  return `/uploads/${id}`;
}

const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
export async function readImage(id) {
  try {
    const buf = await fs.readFile(path.join(UPLOADS_DIR, id));
    return { buf, mime: MIME[id.split(".").pop()] || "application/octet-stream" };
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
