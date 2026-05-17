import { TYPE_META } from '../core/constants.js';
import { state } from '../core/state.js';
import { getGameDB } from '../core/runtime.js';
import { formatName, normalizeText } from '../utils/text.js';
import { ALIAS_FALLBACK_TYPES, FORM_TOKENS, POKEMON_ALIASES, ROLE_TAGS, TYPE_ALIASES } from './search-aliases.js';
import { tokenizeSearchString } from './search-parser.js';
import { ensurePickerSearchState } from './recent-picks.js';

const DEFAULT_SPRITE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/0.png';

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function prettyPokemonLabel(rawName) {
  let value = String(rawName || '')
    .replace(/mega([xy])$/i, ' mega $1')
    .replace(/mega$/i, ' mega')
    .replace(/(hisui|galar|alola|paldea|therian|incarnate)$/i, ' $1')
    .replace(/(wash|heat|mow|frost|fan)$/i, ' $1')
    .replace(/rapidstrike$/i, ' rapid strike')
    .replace(/singlestrike$/i, ' single strike');

  value = value
    .replace(/-/g, ' ')
    .replace(/\bmega\b/gi, 'Mega')
    .replace(/\bhisui\b/gi, 'Hisui')
    .replace(/\bgalar\b/gi, 'Galar')
    .replace(/\balola\b/gi, 'Alola')
    .replace(/\bpaldea\b/gi, 'Paldea')
    .replace(/\btherian\b/gi, 'Therian')
    .replace(/\bincarnate\b/gi, 'Incarnate')
    .replace(/\bwash\b/gi, 'Wash')
    .replace(/\bheat\b/gi, 'Heat')
    .replace(/\bmow\b/gi, 'Mow')
    .replace(/\brapid strike\b/gi, 'Rapid Strike')
    .replace(/\bsingle strike\b/gi, 'Single Strike')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return value;
}

function getBaseSpeciesLabel(mon) {
  const label = mon.displayName || mon.name || '';
  return label.split(/[-\s]/)[0] || label;
}

function getDbData(mon) {
  return getGameDB()?.pokedex?.[mon.name] || null;
}

function getMetaRecord(mon) {
  return state.metaIndex?.get(mon.name) || null;
}

function getAliasesForPokemon(mon) {
  const pretty = prettyPokemonLabel(mon.displayName || mon.name);
  const base = getBaseSpeciesLabel(mon);
  const fromSlug = String(mon.name || '').split('-').join(' ');
  const manualAliases = Object.entries(POKEMON_ALIASES)
    .filter(([key]) => normalizeText(key) === normalizeText(mon.name))
    .flatMap(([, aliases]) => aliases);
  return unique([
    ...manualAliases,
    pretty,
    fromSlug,
    base,
  ]);
}

function inferFormTokens(mon) {
  const source = normalizeText(`${mon.name} ${mon.displayName || ''}`);
  const tokens = [];
  Object.entries(FORM_TOKENS).forEach(([form, aliases]) => {
    const hasForm = source.includes(normalizeText(form));
    const hasAlias = aliases.some((alias) => {
      const normalizedAlias = normalizeText(alias);
      return normalizedAlias.length >= 2 && source.includes(normalizedAlias);
    });
    if (hasForm || hasAlias) {
      tokens.push(form, ...aliases.map((alias) => normalizeText(alias)));
    }
  });
  return unique(tokens.map((token) => normalizeText(token)));
}

function inferTypeTokens(types = []) {
  const tokens = [];
  types.forEach((type) => {
    tokens.push(type);
    tokens.push(TYPE_META[type]?.name);
    tokens.push(...(TYPE_ALIASES[type] || []));
  });
  return unique(tokens.map((token) => normalizeText(token)));
}

function inferRoleTokens(mon, metaRecord) {
  const entry = metaRecord?.entry || {};
  const moveKeys = Object.keys(entry.Moves || entry.moves || {});
  const abilityKeys = Object.keys(entry.Abilities || entry.abilities || {});
  const itemKeys = Object.keys(entry.Items || entry.items || {});
  const source = normalizeText([
    mon.name,
    mon.displayName,
    ...moveKeys,
    ...abilityKeys,
    ...itemKeys,
  ].join(' '));
  const roles = [];

  Object.entries(ROLE_TAGS).forEach(([role, aliases]) => {
    if (aliases.some((alias) => source.includes(normalizeText(alias)))) roles.push(role);
  });

  return unique(roles);
}

function inferSearchTags(mon) {
  const source = normalizeText(`${mon.name} ${mon.displayName || ''}`);
  return {
    isMega: source.includes('mega'),
    isRegional: ['hisui', 'galar', 'alola', 'paldea'].some((token) => source.includes(token)),
    isHisui: source.includes('hisui'),
    isGalar: source.includes('galar'),
    isAlola: source.includes('alola'),
    isPaldea: source.includes('paldea'),
    isParadox: /^(greattusk|irontreads|brutebonnet|fluttermane|slitherwing|sandyshocks|roaringmoon|ironbundle|ironhands|ironjugulis|ironmoth|ironthorns|walkingwake|ironleaves|gougingfire|ragingbolt|ironboulder|ironcrown)/.test(source),
    isLegendary: false,
  };
}

export function invalidatePokemonSearchIndex() {
  const searchState = ensurePickerSearchState();
  searchState.index = [];
  searchState.indexReady = false;
  searchState.highlightedIndex = 0;
}

export function buildPokemonSearchIndex() {
  const searchState = ensurePickerSearchState();
  const seen = new Set((state.pokedex || []).map((mon) => normalizeText(mon.name)));
  const aliasFallbacks = Object.keys(POKEMON_ALIASES)
    .filter((name) => !seen.has(normalizeText(name)))
    .map((name) => ({
      name,
      displayName: prettyPokemonLabel(name),
      usage: 0,
      rank: null,
      types: ALIAS_FALLBACK_TYPES[name] || [],
      aliasFallback: true,
    }));
  const pokedex = [...(state.pokedex || []), ...aliasFallbacks];

  searchState.index = pokedex.map((mon) => {
    const dbData = getDbData(mon);
    const metaRecord = getMetaRecord(mon);
    const displayNamePretty = prettyPokemonLabel(mon.displayName || dbData?.displayName || mon.name);
    const types = mon.types || dbData?.types || [];
    const sprite = mon.sprite || dbData?.sprite || DEFAULT_SPRITE;
    const aliases = getAliasesForPokemon({ ...mon, displayName: displayNamePretty });
    const aliasTokens = unique(aliases.flatMap(tokenizeSearchString));
    const formTokens = inferFormTokens({ ...mon, displayName: displayNamePretty });
    const typeTokens = inferTypeTokens(types);
    const roleTokens = inferRoleTokens(mon, metaRecord);

    return {
      ...mon,
      displayNamePretty,
      baseDisplayName: formatName(getBaseSpeciesLabel(mon)),
      sprite,
      types,
      normalizedName: normalizeText(mon.name),
      normalizedDisplayName: normalizeText(displayNamePretty),
      normalizedBaseName: normalizeText(getBaseSpeciesLabel(mon)),
      aliases,
      aliasTokens,
      formTokens,
      typeTokens,
      roleTokens,
      tags: inferSearchTags(mon),
      searchText: normalizeText([
        mon.name,
        mon.displayName,
        displayNamePretty,
        ...aliases,
        ...formTokens,
        ...typeTokens,
        ...roleTokens,
      ].join(' ')),
    };
  });

  searchState.indexReady = true;
  return searchState.index;
}

export function ensurePokemonSearchIndex() {
  const searchState = ensurePickerSearchState();
  if (!searchState.indexReady) buildPokemonSearchIndex();
  return searchState.index;
}

export function fallbackSprite() {
  return DEFAULT_SPRITE;
}
