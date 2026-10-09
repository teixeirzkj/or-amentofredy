// Backend Vercel Blob: usado quando o store está conectado ao projeto (BLOB_READ_WRITE_TOKEN, ou BLOB_STORE_ID + OIDC).
// JSONs (propostas, biblioteca) ficam privados; fotos ficam públicas (o cliente abre pela URL).
import { put, get, list, BlobNotFoundError } from "@vercel/blob";

const PREFIX = process.env.BLOB_PREFIX || "fredy-orcamentos/";

async function streamToText(stream) {
  return new Response(stream).text();
}

export async function writeJson(name, obj) {
  await put(PREFIX + name, JSON.stringify(obj), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export async function readJson(name) {
  try {
    const res = await get(PREFIX + name, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    return JSON.parse(await streamToText(res.stream));
  } catch (err) {
    if (err instanceof BlobNotFoundError || err?.name === "BlobNotFoundError") return null;
    throw err;
  }
}

export async function listJson(prefix, { max = 80 } = {}) {
  const blobs = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX + prefix, cursor, limit: 200 });
    blobs.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor && blobs.length < 1000);
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const newest = blobs.filter((b) => b.pathname.endsWith(".json")).slice(0, max);
  const docs = await Promise.all(newest.map((b) => readJson(b.pathname.slice(PREFIX.length)).catch(() => null)));
  return docs.filter(Boolean);
}

// Fotos também ficam privadas (funciona em store público ou privado) e são servidas pelo app em /uploads/:id.
export async function writeImage(id, buf, mime) {
  await put(`${PREFIX}uploads/${id}`, buf, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: mime,
  });
  return `/uploads/${id}`;
}

export async function readImage(id) {
  try {
    const res = await get(`${PREFIX}uploads/${id}`, { access: "private" });
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
    return { buf, mime: res.blob.contentType || "application/octet-stream" };
  } catch (err) {
    if (err instanceof BlobNotFoundError || err?.name === "BlobNotFoundError") return null;
    throw err;
  }
}
