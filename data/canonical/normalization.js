export const CANONICAL_ID_PATTERN = /[^a-z0-9]+/g;

export function stripDiacritics(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function toCanonicalId(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(CANONICAL_ID_PATTERN, '');
}

export function toAliasKey(value) {
  return toCanonicalId(value);
}

export const CANONICAL_WEATHER = Object.freeze({
  NONE: null,
  SUN: 'sun',
  RAIN: 'rain',
  SAND: 'sand',
  SNOW: 'snow',
  HAIL: 'hail',
  HARSH_SUN: 'harshsun',
  HEAVY_RAIN: 'heavyrain',
  STRONG_WINDS: 'strongwinds',
});

export const CANONICAL_TERRAIN = Object.freeze({
  NONE: null,
  ELECTRIC: 'electric',
  GRASSY: 'grassy',
  MISTY: 'misty',
  PSYCHIC: 'psychic',
});

export const CANONICAL_STATUS = Object.freeze({
  NONE: null,
  BURN: 'brn',
  FREEZE: 'frz',
  PARALYSIS: 'par',
  POISON: 'psn',
  TOXIC: 'tox',
  SLEEP: 'slp',
  FAINTED: 'fnt',
});

export const CANONICAL_TARGET_MODE = Object.freeze({
  NORMAL: 'normal',
  SELF: 'self',
  ADJACENT_ALLY: 'adjacentAlly',
  ADJACENT_ALLY_OR_SELF: 'adjacentAllyOrSelf',
  ALLY_SIDE: 'allySide',
  FOE_SIDE: 'foeSide',
  ALL_ADJACENT: 'allAdjacent',
  ALL_ADJACENT_FOES: 'allAdjacentFoes',
  ALL: 'all',
  FIELD: 'field',
  SCRIPTED: 'scripted',
  RANDOM_NORMAL: 'randomNormal',
});

export const CANONICAL_MOVE_FLAGS = Object.freeze([
  'contact',
  'protect',
  'mirror',
  'snatch',
  'reflectable',
  'authentic',
  'sound',
  'punch',
  'bite',
  'bullet',
  'slicing',
  'wind',
  'powder',
  'dance',
  'pulse',
  'aura',
  'bomb',
  'defrost',
  'charge',
  'recharge',
  'gravity',
  'heal',
  'metronome',
  'nonsky',
  'allyanim',
]);

const WEATHER_ALIASES = new Map([
  ['none', null],
  ['clear', null],
  ['despejado', null],
  ['sun', 'sun'],
  ['sunnyday', 'sun'],
  ['sol', 'sun'],
  ['drought', 'sun'],
  ['sequia', 'sun'],
  ['rain', 'rain'],
  ['raindance', 'rain'],
  ['lluvia', 'rain'],
  ['drizzle', 'rain'],
  ['llovizna', 'rain'],
  ['sand', 'sand'],
  ['sandstorm', 'sand'],
  ['tormentaarena', 'sand'],
  ['sandstream', 'sand'],
  ['chorroarena', 'sand'],
  ['snow', 'snow'],
  ['snowscape', 'snow'],
  ['nieve', 'snow'],
  ['snowwarning', 'snow'],
  ['nevada', 'snow'],
  ['hail', 'hail'],
  ['granizo', 'hail'],
  ['harshsunlight', 'harshsun'],
  ['desolateland', 'harshsun'],
  ['heavyrain', 'heavyrain'],
  ['primordialsea', 'heavyrain'],
  ['strongwinds', 'strongwinds'],
  ['deltastream', 'strongwinds'],
]);

const TERRAIN_ALIASES = new Map([
  ['none', null],
  ['neutral', null],
  ['electric', 'electric'],
  ['electricterrain', 'electric'],
  ['campoelectrico', 'electric'],
  ['grassy', 'grassy'],
  ['grassyterrain', 'grassy'],
  ['campohierba', 'grassy'],
  ['misty', 'misty'],
  ['mistyterrain', 'misty'],
  ['camponiebla', 'misty'],
  ['psychic', 'psychic'],
  ['psychicterrain', 'psychic'],
  ['campopsiquico', 'psychic'],
]);

const STATUS_ALIASES = new Map([
  ['none', null],
  ['healthy', null],
  ['brn', 'brn'],
  ['burn', 'brn'],
  ['burned', 'brn'],
  ['quemado', 'brn'],
  ['frz', 'frz'],
  ['freeze', 'frz'],
  ['frozen', 'frz'],
  ['congelado', 'frz'],
  ['par', 'par'],
  ['paralysis', 'par'],
  ['paralizado', 'par'],
  ['psn', 'psn'],
  ['poison', 'psn'],
  ['poisoned', 'psn'],
  ['veneno', 'psn'],
  ['tox', 'tox'],
  ['toxic', 'tox'],
  ['toxico', 'tox'],
  ['slp', 'slp'],
  ['sleep', 'slp'],
  ['dormido', 'slp'],
  ['fnt', 'fnt'],
  ['fainted', 'fnt'],
  ['debilitado', 'fnt'],
]);

const TARGET_ALIASES = new Map([
  ['normal', 'normal'],
  ['any', 'normal'],
  ['adjacentfoe', 'normal'],
  ['self', 'self'],
  ['adjacentally', 'adjacentAlly'],
  ['adjacentallyorself', 'adjacentAllyOrSelf'],
  ['allyside', 'allySide'],
  ['foeside', 'foeSide'],
  ['alladjacent', 'allAdjacent'],
  ['alladjacentfoes', 'allAdjacentFoes'],
  ['allopponents', 'allAdjacentFoes'],
  ['allotherpokemon', 'allAdjacent'],
  ['allpokemon', 'all'],
  ['all', 'all'],
  ['field', 'field'],
  ['scripted', 'scripted'],
  ['randomnormal', 'randomNormal'],
]);

function fromAlias(map, value, fallback = null) {
  if (value == null || value === '') return fallback;
  const key = toAliasKey(value);
  return map.has(key) ? map.get(key) : fallback;
}

export function canonicalizeWeather(value) {
  return fromAlias(WEATHER_ALIASES, value, value == null || value === '' ? null : toAliasKey(value));
}

export function canonicalizeTerrain(value) {
  return fromAlias(TERRAIN_ALIASES, value, value == null || value === '' ? null : toAliasKey(value));
}

export function canonicalizeStatus(value) {
  return fromAlias(STATUS_ALIASES, value, value == null || value === '' ? null : toAliasKey(value));
}

export function canonicalizeTargetMode(value) {
  return fromAlias(TARGET_ALIASES, value, value == null || value === '' ? 'normal' : value);
}

export function normalizeMoveFlags(flags = {}) {
  const out = {};
  for (const flag of CANONICAL_MOVE_FLAGS) {
    out[flag] = !!flags[flag];
  }
  for (const [key, value] of Object.entries(flags || {})) {
    out[toCanonicalId(key)] = !!value;
  }
  return out;
}
