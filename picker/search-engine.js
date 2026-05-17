import { state } from '../core/state.js';
import { normalizeText } from '../utils/text.js';
import { ensurePokemonSearchIndex } from './search-index.js';
import { parseSearchQuery } from './search-parser.js';
import { getRecentBoost } from './recent-picks.js';

function getMetaBoost(entry) {
  const rank = Number(entry.rank || 9999);
  if (rank <= 10) return 120;
  if (rank <= 25) return 80;
  if (rank <= 50) return 45;
  if (rank <= 100) return 20;
  return 0;
}

function levenshteinWithinLimit(a, b, limit = 2) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > limit) return limit + 1;
    prev = curr;
  }
  return prev[b.length];
}

function fuzzyScore(entry, query) {
  if (!query || query.length < 3) return 0;
  const candidates = [
    entry.normalizedName,
    entry.normalizedDisplayName,
    entry.normalizedBaseName,
    ...entry.aliases.map((alias) => normalizeText(alias)),
  ];
  let best = 0;
  for (const candidate of candidates) {
    const slice = candidate.slice(0, Math.max(query.length + 2, 6));
    const dist = levenshteinWithinLimit(query, slice, 2);
    if (dist === 0) best = Math.max(best, 140);
    else if (dist === 1) best = Math.max(best, 90);
    else if (dist === 2) best = Math.max(best, 45);
  }
  return best;
}

export function scorePokemonEntry(entry, parsed, context = {}) {
  let score = 0;
  if (!parsed.hasQuery) {
    return getMetaBoost(entry) + getRecentBoost(entry, context);
  }

  const q = parsed.normalized;
  let matchedTextTokens = 0;
  if (entry.normalizedName === q) score += 1200;
  if (entry.normalizedDisplayName === q) score += 1200;
  if (entry.normalizedBaseName === q) score += 900;

  if (entry.normalizedName.startsWith(q)) score += 900;
  if (entry.normalizedDisplayName.startsWith(q)) score += 880;
  if (entry.normalizedBaseName.startsWith(q)) score += 620;

  const normalizedAliases = entry.aliases.map((alias) => normalizeText(alias));
  if (normalizedAliases.some((alias) => alias === q)) score += 1000;
  if (normalizedAliases.some((alias) => alias.startsWith(q))) score += 760;

  for (const token of parsed.textTokens) {
    let tokenMatched = false;
    if (entry.normalizedName.includes(token)) score += 220;
    if (entry.normalizedDisplayName.includes(token)) score += 220;
    if (entry.normalizedBaseName.includes(token)) score += 180;
    if (entry.aliasTokens.some((aliasToken) => aliasToken.includes(token))) score += 200;
    if (entry.searchText.includes(token)) score += 80;
    tokenMatched = entry.normalizedName.includes(token) ||
      entry.normalizedDisplayName.includes(token) ||
      entry.normalizedBaseName.includes(token) ||
      entry.aliasTokens.some((aliasToken) => aliasToken.includes(token)) ||
      entry.searchText.includes(token);
    if (tokenMatched) matchedTextTokens += 1;
  }

  for (const typeToken of parsed.typeFilters) {
    if (entry.typeTokens.includes(typeToken)) score += 180;
  }

  for (const formToken of parsed.formFilters) {
    if (entry.formTokens.includes(formToken)) score += 220;
  }

  for (const roleToken of parsed.roleFilters) {
    if (entry.roleTokens.includes(roleToken)) score += 170;
  }

  score += fuzzyScore(entry, q);
  if (parsed.textTokens.length && matchedTextTokens < parsed.textTokens.length) return 0;
  if (score <= 0) return 0;
  score += getMetaBoost(entry);
  score += getRecentBoost(entry, context);
  if (context.side === 'enemy') score += Number(entry.rank || 9999) <= 50 ? 20 : 0;

  return score;
}

export function explainPokemonScore(entry, parsed) {
  const reasons = [];
  if (parsed.typeFilters.some((token) => entry.typeTokens.includes(token))) reasons.push('tipo');
  if (parsed.formFilters.some((token) => entry.formTokens.includes(token))) reasons.push('forma');
  if (parsed.roleFilters.some((token) => entry.roleTokens.includes(token))) reasons.push('rol');
  if (Number(entry.rank || 9999) <= 50) reasons.push('meta');
  return reasons;
}

export function compareScoredPokemon(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if ((a.entry.rank ?? 9999) !== (b.entry.rank ?? 9999)) return (a.entry.rank ?? 9999) - (b.entry.rank ?? 9999);
  return (b.entry.usage ?? 0) - (a.entry.usage ?? 0);
}

export function searchPokemon(rawQuery, context = {}) {
  const entries = ensurePokemonSearchIndex();
  const parsed = parseSearchQuery(rawQuery);
  const side = context.side || state.modal.side;

  let scored = entries
    .map((entry) => ({
      entry,
      score: scorePokemonEntry(entry, parsed, { ...context, side }),
      reasons: explainPokemonScore(entry, parsed, context),
    }))
    .filter((row) => row.score > 0)
    .sort(compareScoredPokemon);

  if (!parsed.hasQuery) {
    scored = scored.slice(0, 18);
  }

  return {
    parsed,
    results: scored.slice(0, parsed.hasQuery ? 40 : 18),
  };
}
