import { SMOGON_SPECIES_OVERRIDES, POKEAPI_SPECIES_SLUG, TYPE_META } from '../core/constants.js';
import { getGameDB } from '../core/runtime.js';

export const i18nCache = {};

export function getTranslation(name, category) {
  if (!name) return "";
  const cleanName = normalizeText(name);
  const key = `${category}:${cleanName}`;
  
  if (i18nCache[key]) return i18nCache[key];
  const db = getGameDB();
  if (db?.translations?.[key]) return db.translations[key];
  
  return name;
}

export function fetchTranslation(englishName, category) {
  const clean = normalizeText(englishName);
  const cacheKey = `${category}:${clean}`;
  
  const db = getGameDB();
  if (db?.translations?.[cacheKey]) {
    i18nCache[cacheKey] = db.translations[cacheKey];
  }
}

export function normalizeText(text) {
  if (!text) return "";
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function formatName(str) {
    if (!str) return '';
    // Separa palabras unidas por guiones o CamelCase, y capitaliza CADA palabra
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

export function compactName(name = "") {
  const pretty = formatName(name);
  if (pretty.length <= 16) return pretty;
  const parts = pretty.split(" ");
  if (parts.length > 1)
    return (
      parts[0] +
      " " +
      parts
        .slice(1)
        .map((p) => p[0])
        .join(".") +
      "."
    );
  return pretty.slice(0, 15) + "…";
}

export function slugFromSmogonName(name = "") {
  const n = normalizeText(name);
  if (SMOGON_SPECIES_OVERRIDES[n])
    return normalizeText(SMOGON_SPECIES_OVERRIDES[n]);
  if (n === "indeedee-f") return "indeedee-female";
  if (n === "indeedee") return "indeedee-male";
  if (n === "ogerpon-wellspring") return "ogerpon-wellspring-mask";
  if (n === "ogerpon-hearthflame") return "ogerpon-hearthflame-mask";
  if (n === "ogerpon-cornerstone") return "ogerpon-cornerstone-mask";
  if (n === "ogerpon") return "ogerpon-teal-mask";
  if (n === "maushold-four") return "maushold-family-of-four";
  if (n === "maushold-three") return "maushold-family-of-three";
  return n;
}

export function displayFromSmogonName(name = "") {
  const n = normalizeText(name);
  return SMOGON_SPECIES_OVERRIDES[n] || name;
}

export function pokeapiPokemonSlug(normalizedKey) {
  const mapped = POKEAPI_SPECIES_SLUG[normalizedKey];
  if (mapped) return mapped;
  if (/^tauros-paldea-(combat|blaze|aqua)$/.test(normalizedKey)) {
    return `${normalizedKey}-breed`;
  }
  return normalizedKey;
}

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function localizeMoveName(name) {
  if (!name) return '';
  return typeof getTranslation === 'function' ? getTranslation(name, 'move') : name;
}

export function localizeTypeName(type) {
  if (!type) return 'Sin tipo';
  return TYPE_META[type]?.name || formatName(type);
}
