import { CACHE_KEY_PREFIX, POKEAPI_SPECIES_SLUG } from '../core/constants.js';
import { state } from '../core/state.js';
import { getResolvedEvs } from '../battle/stats.js';
import { normalizeText, slugFromSmogonName, displayFromSmogonName } from '../utils/text.js';

export function serializeSetSummary(set) {
  if (!set) return [];
  const lines = [];
  if (set.ability) lines.push(`Hab: ${set.ability}`);
  if (set.item) lines.push(`Obj: ${set.item}`);
  if (set.nature) lines.push(`Nat: ${set.nature}`);
  if (set.evs && typeof set.evs === "object") {
    const resolvedEvs = getResolvedEvs(set);
    const evOrder = ["hp", "atk", "def", "spa", "spd", "spe"];
    const activeEVs = evOrder
      .filter((k) => Number(resolvedEvs[k]) > 0)
      .map((k) => `${resolvedEvs[k]} ${k.toUpperCase()}`);
    if (activeEVs.length) lines.push(activeEVs.join(" / "));
  }
  return lines;
}

export function getCacheKey(rating) {
  return `${CACHE_KEY_PREFIX}${rating}`;
}

export function buildMetaIndex(json) {
  const rawData = json?.data || json?.Data || {};
  state.metaIndex = new Map();
  state.metaRanked = [];

  const ranked = Object.entries(rawData)
    .map(([name, entry], idx) => {
      const rawCount =
        Number(
          entry?.["Raw count"] ??
            entry?.raw ??
            entry?.usage ??
            entry?.count ??
            0,
        ) || 0;
      const slug = slugFromSmogonName(name);
      const displayName = displayFromSmogonName(name);
      const usage = rawCount;
      const record = {
        key: name,
        slug,
        displayName,
        entry: entry || {},
        usage,
        rankSeed: idx,
      };
      return record;
    })
    .sort((a, b) => {
      if (b.usage !== a.usage) return b.usage - a.usage;
      return a.rankSeed - b.rankSeed;
    });

  ranked.forEach((record, idx) => {
    record.rank = idx + 1;
    state.metaIndex.set(record.slug, record);
  });

  state.metaRanked = ranked;
}

export function buildFallbackIndex(jsonArray) {
  state.fallbackIndex = new Map();
  if (!Array.isArray(jsonArray) || jsonArray.length === 0) return;

  // Iteramos en orden inverso para que los JSON de mayor prioridad (los primeros del array)
  // sobreescriban los datos de menor prioridad.
  const reversed = [...jsonArray].reverse();

  for (const json of reversed) {
    const rawData = json?.data || json?.Data || {};
    Object.entries(rawData).forEach(([name, entry], idx) => {
      const slug = slugFromSmogonName(name);
      const displayName = displayFromSmogonName(name);
      const usage = Number(entry?.["Raw count"] ?? entry?.raw ?? entry?.usage ?? entry?.count ?? 0) || 0;
      state.fallbackIndex.set(slug, {
        key: name,
        slug,
        displayName,
        entry: entry || {},
        usage,
        rankSeed: idx,
      });
    });
  }
}

export function getMetaRecord(speciesId) {
  if (!speciesId) return null;
  const slug = normalizeText(speciesId);
  
  // 1. Coincidencia directa
  if (state.metaIndex.has(slug)) return state.metaIndex.get(slug);
  if (state.fallbackIndex.has(slug)) return state.fallbackIndex.get(slug);

  // 2. Búsqueda inversa para mapeos de PokeAPI (ej: 'palafin-hero' -> 'palafin')
  for (const [smogonKey, apiKey] of Object.entries(POKEAPI_SPECIES_SLUG)) {
    if (slug === apiKey) {
      if (state.metaIndex.has(smogonKey)) return state.metaIndex.get(smogonKey);
      if (state.fallbackIndex.has(smogonKey)) return state.fallbackIndex.get(smogonKey);
    }
  }

  // 3. Override directo hacia Smogon (ej: 'urshifu' -> 'urshifu-single-strike')
  const smogonOverride = slugFromSmogonName(slug);
  if (smogonOverride !== slug) {
    if (state.metaIndex.has(smogonOverride)) return state.metaIndex.get(smogonOverride);
    if (state.fallbackIndex.has(smogonOverride)) return state.fallbackIndex.get(smogonOverride);
  }

  // 4. Búsqueda agresiva ignorando guiones (ej: 'ironhands' -> 'iron-hands')
  const slugNoDash = slug.replace(/-/g, "");
  for (const [key, record] of state.metaIndex.entries()) {
    if (key.replace(/-/g, "") === slugNoDash) return record;
  }
  for (const [key, record] of state.fallbackIndex.entries()) {
    if (key.replace(/-/g, "") === slugNoDash) return record;
  }

  return null;
}
