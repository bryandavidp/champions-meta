import { normalizeText } from '../utils/text.js';
import { FORM_TOKENS, ROLE_TAGS, TYPE_ALIASES } from './search-aliases.js';

function buildLookup(source) {
  const out = new Map();
  Object.entries(source).forEach(([key, values]) => {
    out.set(normalizeText(key), key);
    values.forEach((value) => out.set(normalizeText(value), key));
  });
  return out;
}

export const TYPE_TOKEN_LOOKUP = buildLookup(TYPE_ALIASES);
export const FORM_TOKEN_LOOKUP = buildLookup(FORM_TOKENS);
export const ROLE_TOKEN_LOOKUP = buildLookup(ROLE_TAGS);

export function tokenizeSearchString(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[\s/_-]+/)
    .map((token) => normalizeText(token))
    .filter(Boolean);
}

export function canonicalTypeToken(token) {
  return TYPE_TOKEN_LOOKUP.get(normalizeText(token)) || null;
}

export function canonicalFormToken(token) {
  return FORM_TOKEN_LOOKUP.get(normalizeText(token)) || null;
}

export function canonicalRoleToken(token) {
  return ROLE_TOKEN_LOOKUP.get(normalizeText(token)) || null;
}

export function parseSearchQuery(rawQuery) {
  const raw = String(rawQuery || '').trim();
  const normalized = normalizeText(raw);
  const tokens = tokenizeSearchString(raw);
  const typeFilters = [];
  const formFilters = [];
  const roleFilters = [];
  let textTokens = [];
  const coveredTextTokens = new Set();

  for (const token of tokens) {
    const type = canonicalTypeToken(token);
    const form = canonicalFormToken(token);
    const role = canonicalRoleToken(token);
    if (type) typeFilters.push(type);
    else if (form) formFilters.push(form);
    else if (role) roleFilters.push(role);
    else textTokens.push(token);
  }

  for (const [alias, type] of TYPE_TOKEN_LOOKUP.entries()) {
    if (alias.length >= 3 && normalized.includes(alias) && !typeFilters.includes(type)) {
      typeFilters.push(type);
      tokenizeSearchString(alias).forEach((token) => coveredTextTokens.add(token));
    }
  }
  for (const [alias, form] of FORM_TOKEN_LOOKUP.entries()) {
    if (alias.length >= 3 && normalized.includes(alias) && !formFilters.includes(form)) {
      formFilters.push(form);
      tokenizeSearchString(alias).forEach((token) => coveredTextTokens.add(token));
    }
  }
  for (const [alias, role] of ROLE_TOKEN_LOOKUP.entries()) {
    if (alias.length >= 3 && normalized.includes(alias) && !roleFilters.includes(role)) {
      roleFilters.push(role);
      tokenizeSearchString(alias).forEach((token) => coveredTextTokens.add(token));
    }
  }
  textTokens = textTokens.filter((token) => !coveredTextTokens.has(token));

  return {
    raw,
    normalized,
    tokens,
    hasQuery: tokens.length > 0,
    typeFilters,
    formFilters,
    roleFilters,
    textTokens,
  };
}
