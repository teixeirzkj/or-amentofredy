// Busca de fotos na internet:
// - Hotel: Google Places API (New) — fotos do hotel específico. As imagens são servidas por /img/place/... (proxy, sem guardar cópia).
// - Destino: Unsplash (ou Pexels) — foto de capa, hotlink direto como as APIs pedem, com crédito do fotógrafo.

const GOOGLE_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || "";
const PEXELS_KEY = process.env.PEXELS_API_KEY || "";

export const imagesAvailable = () => ({ hotels: Boolean(GOOGLE_KEY), destinations: Boolean(UNSPLASH_KEY || PEXELS_KEY) });

// Cache em memória (vale por instância; na Vercel dura enquanto a função estiver quente).
const cache = new Map();
const TTL = 60 * 60 * 1000;
function remember(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = fn();
  value.catch?.(() => cache.delete(key));
  cache.set(key, { value, exp: Date.now() + TTL });
  if (cache.size > 500) cache.clear();
  return value;
}

const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;
export const isPlacePhotoName = (n) => PHOTO_NAME.test(n || "");
export const placePhotoUrl = (name, w = 1600) => `/img/place/${encodeURIComponent(name)}?w=${w}`;

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  let body = null;
  try { body = await res.json(); } catch { /* sem corpo */ }
  if (!res.ok) {
    const msg = body?.error?.message || body?.errors?.[0] || body?.error || `HTTP ${res.status}`;
    throw Object.assign(new Error(String(msg).slice(0, 200)), { status: res.status === 429 ? 429 : 502, upstream: res.status });
  }
  return body;
}

/* ---------- Hotel (Google Places) ---------- */
/** @returns {Promise<{place:{id,name,address,lat,lng}|null, photos:Array<{url,thumb,name,credit}>}>} */
export function searchHotelPhotos({ name, city }) {
  if (!GOOGLE_KEY) throw Object.assign(new Error("Busca de fotos de hotel desligada: defina GOOGLE_PLACES_API_KEY."), { status: 503 });
  const query = [name, city].filter(Boolean).join(" ").trim();
  if (!query) throw Object.assign(new Error("Informe o nome do hotel."), { status: 400 });
  return remember(`hotel:${query.toLowerCase()}`, async () => {
    const data = await fetchJson("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.photos,places.types",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", maxResultCount: 3 }),
    });
    const places = data?.places || [];
    // Prefere um resultado que seja hospedagem, se houver.
    const lodging = places.find((p) => (p.types || []).some((t) => /lodging|hotel|resort|inn|guest_house|hostel/.test(t)));
    const p = lodging || places[0];
    if (!p) return { place: null, photos: [] };
    const photos = (p.photos || []).filter((ph) => isPlacePhotoName(ph.name)).slice(0, 10).map((ph) => ({
      name: ph.name,
      url: placePhotoUrl(ph.name, 1600),
      thumb: placePhotoUrl(ph.name, 480),
      credit: ph.authorAttributions?.[0]?.displayName || "",
    }));
    return {
      place: { id: p.id, name: p.displayName?.text || "", address: p.formattedAddress || "", lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null },
      photos,
    };
  });
}

/** Baixa a foto do Google pra servir via proxy (sem persistir). */
export async function fetchPlacePhoto(name, width = 1600) {
  if (!GOOGLE_KEY) throw Object.assign(new Error("GOOGLE_PLACES_API_KEY não configurada."), { status: 503 });
  if (!isPlacePhotoName(name)) throw Object.assign(new Error("Foto inválida."), { status: 400 });
  const w = Math.min(1600, Math.max(200, Math.round(Number(width) || 1600)));
  const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&key=${encodeURIComponent(GOOGLE_KEY)}`, { redirect: "follow" });
  if (!res.ok) throw Object.assign(new Error("Foto não encontrada no Google."), { status: res.status === 404 ? 404 : 502 });
  const mime = res.headers.get("content-type") || "image/jpeg";
  return { buf: Buffer.from(await res.arrayBuffer()), mime };
}

/* ---------- Destino (Unsplash / Pexels) ---------- */
/** @returns {Promise<Array<{url,thumb,credit,creditLink,source,track}>>} */
export function searchDestinationPhotos({ city, region }) {
  if (!UNSPLASH_KEY && !PEXELS_KEY) throw Object.assign(new Error("Busca de fotos de destino desligada: defina UNSPLASH_ACCESS_KEY ou PEXELS_API_KEY."), { status: 503 });
  const q = [city, region].filter(Boolean).join(" ").trim();
  if (!q) throw Object.assign(new Error("Informe o destino."), { status: 400 });
  return remember(`dest:${q.toLowerCase()}`, async () => {
    for (const query of [`${q} praia`, q, `${q} turismo`]) {
      const list = UNSPLASH_KEY ? await unsplash(query) : await pexels(query);
      if (list.length) return list;
    }
    return [];
  });
}

async function unsplash(query) {
  const u = new URL("https://api.unsplash.com/search/photos");
  u.search = new URLSearchParams({ query, orientation: "landscape", per_page: "8", content_filter: "high" }).toString();
  const data = await fetchJson(u, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}`, "Accept-Version": "v1" } });
  return (data?.results || []).map((r) => ({
    url: `${r.urls.raw}&w=1800&q=80&auto=format&fit=max`,
    thumb: r.urls.small,
    credit: r.user?.name || "",
    creditLink: r.user?.links?.html ? `${r.user.links.html}?utm_source=fredy&utm_medium=referral` : "",
    source: "Unsplash",
    track: r.links?.download_location || "",
  }));
}

async function pexels(query) {
  const u = new URL("https://api.pexels.com/v1/search");
  u.search = new URLSearchParams({ query, orientation: "landscape", per_page: "8", locale: "pt-BR" }).toString();
  const data = await fetchJson(u, { headers: { Authorization: PEXELS_KEY } });
  return (data?.photos || []).map((p) => ({
    url: p.src?.large2x || p.src?.large,
    thumb: p.src?.medium,
    credit: p.photographer || "",
    creditLink: p.photographer_url || "",
    source: "Pexels",
    track: "",
  }));
}

/** Unsplash pede que a escolha de uma foto dispare o "download" (só telemetria deles). */
export async function trackDownload(track) {
  if (!UNSPLASH_KEY || !/^https:\/\/api\.unsplash\.com\//.test(track || "")) return;
  try { await fetch(track, { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}`, "Accept-Version": "v1" } }); } catch { /* telemetria */ }
}
