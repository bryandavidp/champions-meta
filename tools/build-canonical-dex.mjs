import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'data/canonical/generated.js');
const DATA_BUNDLE = path.join(ROOT, 'data/data-bundle.json');
const PKMN_DEX_VERSION = '0.10.9';

const MOVE_FLAGS = [
  'contact', 'protect', 'mirror', 'snatch', 'reflectable', 'authentic',
  'sound', 'punch', 'bite', 'bullet', 'slicing', 'wind', 'powder', 'dance',
  'pulse', 'aura', 'bomb', 'defrost', 'charge', 'recharge', 'gravity',
  'heal', 'metronome', 'nonsky', 'allyanim',
];

const TARGET_MODE_MAP = {
  normal: 'normal',
  self: 'self',
  adjacentAlly: 'adjacentAlly',
  adjacentAllyOrSelf: 'adjacentAllyOrSelf',
  allySide: 'allySide',
  foeSide: 'foeSide',
  allAdjacent: 'allAdjacent',
  allAdjacentFoes: 'allAdjacentFoes',
  all: 'all',
  field: 'field',
  scripted: 'scripted',
  randomNormal: 'randomNormal',
};

const WEATHER_IDS = {
  sun: ['sun', 'sunnyday', 'drought', 'sol', 'sequia'],
  rain: ['rain', 'raindance', 'drizzle', 'lluvia'],
  sand: ['sand', 'sandstorm', 'sandstream', 'tormentaarena'],
  snow: ['snow', 'snowscape', 'snowwarning', 'nieve'],
  hail: ['hail', 'granizo'],
  harshsun: ['harshsun', 'desolateland'],
  heavyrain: ['heavyrain', 'primordialsea'],
  strongwinds: ['strongwinds', 'deltastream'],
};

const TERRAIN_IDS = {
  electric: ['electric', 'electricterrain', 'campoelectrico'],
  grassy: ['grassy', 'grassyterrain', 'campohierba'],
  misty: ['misty', 'mistyterrain', 'camponiebla'],
  psychic: ['psychic', 'psychicterrain', 'campopsiquico'],
};

const STATUS_IDS = {
  brn: ['brn', 'burn', 'burned', 'quemado'],
  frz: ['frz', 'freeze', 'frozen', 'congelado'],
  par: ['par', 'paralysis', 'paralizado'],
  psn: ['psn', 'poison', 'poisoned', 'veneno'],
  tox: ['tox', 'toxic', 'toxico'],
  slp: ['slp', 'sleep', 'dormido'],
  fnt: ['fnt', 'fainted', 'debilitado'],
};

function toID(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .replace(/[^a-z0-9]+/g, '');
}

function lower(value) {
  return value == null ? null : String(value).toLowerCase();
}

function clean(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value === 'function') return undefined;
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const next = clean(item);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

function functionKeys(value) {
  return Object.entries(value || {})
    .filter(([, item]) => typeof item === 'function')
    .map(([key]) => key)
    .sort();
}

function normalizeFlags(flags = {}) {
  const out = {};
  for (const flag of MOVE_FLAGS) out[flag] = !!flags[flag];
  for (const [key, value] of Object.entries(flags || {})) out[toID(key)] = !!value;
  return out;
}

function normalizeMultihit(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const min = Number(raw[0] || 1);
    const max = Number(raw[1] || min);
    return { raw, min, max, exact: min === max ? min : null };
  }
  const exact = Number(raw || 1);
  return { raw, min: exact, max: exact, exact };
}

function moveHits(raw) {
  const hit = normalizeMultihit(raw);
  return hit?.exact || hit?.min || 1;
}

function isSpreadTarget(target) {
  return ['allAdjacent', 'allAdjacentFoes', 'all'].includes(target);
}

function isAllyHitTarget(target) {
  return ['allAdjacent', 'all'].includes(target);
}

function callbacksForMove(move) {
  const hooks = functionKeys(move);
  const callbacks = {};
  if (typeof move.basePowerCallback === 'function') callbacks.power = move.id;
  if (typeof move.onModifyType === 'function' || typeof move.typeCallback === 'function') callbacks.type = move.id;
  if (typeof move.onModifyPriority === 'function') callbacks.priority = move.id;
  if (typeof move.damageCallback === 'function') callbacks.damage = move.id;
  if (typeof move.onTry === 'function' || typeof move.onTryMove === 'function') callbacks.tryMove = move.id;
  if (hooks.length) callbacks.runtimeHooks = hooks;
  return callbacks;
}

function callbackTags(move) {
  const tags = [];
  const callbacks = callbacksForMove(move);
  const text = `${move.name || ''} ${move.desc || ''} ${move.shortDesc || ''}`.toLowerCase();
  if (
    callbacks.power ||
    /power (doubles|varies|depends|is equal|is higher|is based)|weigh|speed|hp|faster|slower/.test(text)
  ) tags.push('variable-power');
  if (callbacks.type || /type changes|type varies|type and power|becomes|weather ball|terrain pulse/.test(text)) tags.push('dynamic-type');
  if (callbacks.priority) tags.push('dynamic-priority');
  if (move.selfSwitch) tags.push('pivot');
  if (move.sideCondition) tags.push('side-condition');
  if (move.weather) tags.push('weather-setter');
  if (move.terrain) tags.push('terrain-setter');
  if (move.pseudoWeather) tags.push('field-condition');
  if (move.status) tags.push('status');
  if (move.volatileStatus) tags.push('volatile');
  if (move.boosts || move.selfBoost) tags.push('stat-stage');
  return [...new Set(tags)];
}

function inferredCallbacks(move) {
  const callbacks = callbacksForMove(move);
  const tags = callbackTags(move);
  if (!callbacks.power && tags.includes('variable-power')) callbacks.power = move.id;
  if (!callbacks.type && tags.includes('dynamic-type')) callbacks.type = move.id;
  if (!callbacks.priority && tags.includes('dynamic-priority')) callbacks.priority = move.id;
  return callbacks;
}

function formKind(species) {
  const forme = String(species.forme || '').toLowerCase();
  if (forme.includes('mega') || species.requiredItem && /ite$|orb$|mask$/i.test(species.requiredItem)) return 'mega-or-item-form';
  if (/(alola|galar|hisui|paldea|paldean)/.test(forme)) return 'regional';
  if (species.battleOnly) return 'battle-only';
  if (forme) return 'form';
  return 'base';
}

function abilityTags(ability) {
  const text = `${ability.name || ''} ${ability.desc || ''} ${ability.shortDesc || ''}`.toLowerCase();
  const hooks = functionKeys(ability);
  const tags = [];
  if (/sunlight|rain|sandstorm|snow|terrain/.test(text)) tags.push('field-setter-or-abuser');
  if (/priority/.test(text)) tags.push('priority');
  if (/immune|immunity|absorbs|no damage/.test(text)) tags.push('immunity');
  if (/speed|doubled|halved/.test(text)) tags.push('speed-control');
  if (/stat|attack|defense|special attack|special defense/.test(text)) tags.push('stat-modifier');
  if (/switches in|entering battle|on switch-in/.test(text)) tags.push('switch-in');
  if (/contact/.test(text)) tags.push('contact');
  if (hooks.length) tags.push('runtime-hooks');
  return [...new Set(tags)];
}

function itemTags(item) {
  const text = `${item.name || ''} ${item.desc || ''} ${item.shortDesc || ''}`.toLowerCase();
  const tags = [];
  if (item.megaStone || item.megaEvolves) tags.push('form-change');
  if (/choice/.test(item.id || item.name || '')) tags.push('choice');
  if (/berry/.test(item.id || item.name || '')) tags.push('berry');
  if (/survive|1 hp|full hp/.test(text)) tags.push('survival');
  if (/boost|raises|increases|holder's/.test(text)) tags.push('stat-or-damage-modifier');
  if (/terrain/.test(text)) tags.push('terrain-seed');
  if (/immune|prevents|protects/.test(text)) tags.push('prevention');
  if (functionKeys(item).length) tags.push('runtime-hooks');
  return [...new Set(tags)];
}

function addAlias(aliasTable, kind, alias, id) {
  const key = toID(alias);
  if (!key || !id) return;
  aliasTable[kind][key] = id;
}

function addTranslationAliases(aliasTable, translations, kind, id) {
  const value = translations[`${kind}:${id}`];
  const table = kind === 'move' ? 'moves' : kind === 'ability' ? 'abilities' : kind === 'item' ? 'items' : `${kind}s`;
  if (value) addAlias(aliasTable, table, value, id);
}

function legacyMoveEntry(id, legacy, translations) {
  const target = legacy.isSpread ? 'allAdjacentFoes' : 'normal';
  return {
    id,
    name: id,
    displayName: translations[`move:${id}`] || id,
    type: lower(legacy.type || 'normal'),
    category: lower(legacy.damageClass || 'physical'),
    damageClass: lower(legacy.damageClass || 'physical'),
    basePower: legacy.power || 0,
    power: legacy.power || 0,
    accuracy: true,
    pp: null,
    priority: 0,
    target,
    targetMode: target,
    flags: normalizeFlags({ protect: true, mirror: true }),
    flagTags: [],
    multihit: normalizeMultihit(legacy.hits || 1),
    hits: legacy.hits || 1,
    isSpread: !!legacy.isSpread,
    allyHit: false,
    spreadModifier: legacy.isSpread ? 0.75 : 1,
    drain: null,
    recoil: null,
    heal: null,
    selfdestruct: null,
    secondary: null,
    secondaries: null,
    boosts: null,
    selfBoosts: null,
    volatileStatus: null,
    status: null,
    sideCondition: null,
    weather: null,
    terrain: null,
    pseudoWeather: null,
    callbacks: {},
    callbackTags: [],
    critRatio: 1,
    willCrit: false,
    ignoreAbility: false,
    ignoreImmunity: false,
    ignoreDefensive: false,
    overrideOffensiveStat: null,
    overrideDefensiveStat: null,
    overrideOffensivePokemon: null,
    usesDefenseStat: false,
    usesTargetAttack: false,
    bypassProtect: false,
    bypassSubstitute: false,
    desc: legacy.desc || '',
    localizedDesc: legacy.desc || '',
    source: { mechanics: 'legacy-custom', visual: 'data-bundle' },
  };
}

function legacySpeciesEntry(id, legacy, translations) {
  const stats = legacy.baseStats || {};
  return {
    id,
    num: legacy.id || 0,
    name: legacy.name || id,
    displayName: legacy.displayName || translations[`species:${id}`] || legacy.name || id,
    baseSpecies: legacy.displayName || legacy.name || id,
    baseSpeciesId: toID(legacy.name || id),
    forme: id.includes('mega') ? 'Mega' : '',
    formKind: id.includes('mega') ? 'custom-mega' : 'legacy-custom',
    types: (legacy.types || ['normal']).map(lower),
    baseStats: {
      hp: stats.hp || 80,
      atk: stats.atk || stats.attack || 80,
      def: stats.def || stats.defense || 80,
      spa: stats.spa || stats['special-attack'] || 80,
      spd: stats.spd || stats['special-defense'] || 80,
      spe: stats.spe || stats.speed || 80,
    },
    abilities: {},
    abilityIds: {},
    requiredItem: null,
    requiredItemId: null,
    requiredAbility: null,
    battleOnly: false,
    canMega: id.includes('mega'),
    isMega: id.includes('mega'),
    isRegional: false,
    isBattleOnly: false,
    weightkg: null,
    heightm: null,
    gender: null,
    sprite: legacy.sprite || '',
    tags: ['legacy-custom'],
    source: { mechanics: 'data-bundle-custom', visual: 'data-bundle' },
  };
}

async function importDexFromTemp() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'champions-canonical-dex-'));
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmBin, [
    'install',
    `@pkmn/dex@${PKMN_DEX_VERSION}`,
    '--prefix',
    temp,
    '--no-save',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ], { stdio: 'inherit', shell: process.platform === 'win32' });
  const modulePath = path.join(temp, 'node_modules/@pkmn/dex/build/index.mjs');
  const mod = await import(pathToFileURL(modulePath).href);
  return { mod, cleanup: () => rm(temp, { recursive: true, force: true }) };
}

async function main() {
  const legacyDb = JSON.parse(await readFile(DATA_BUNDLE, 'utf8'));
  const { mod, cleanup } = await importDexFromTemp();
  const { Dex } = mod;

  const translations = legacyDb.translations || {};
  const legacyPokedex = legacyDb.pokedex || {};
  const legacyMoves = legacyDb.moves || {};
  const aliases = { species: {}, moves: {}, abilities: {}, items: {}, weather: {}, terrain: {}, statuses: {}, targetModes: {} };

  const species = {};
  for (const raw of Dex.species.all()) {
    if (!raw.exists) continue;
    const id = raw.id;
    const legacy = legacyPokedex[id] || null;
    const abilityIds = {};
    for (const [slot, ability] of Object.entries(raw.abilities || {})) {
      abilityIds[slot] = toID(ability);
    }
    species[id] = {
      id,
      num: raw.num || 0,
      name: raw.name,
      displayName: translations[`species:${id}`] || legacy?.displayName || raw.name,
      baseSpecies: raw.baseSpecies || raw.name,
      baseSpeciesId: toID(raw.baseSpecies || raw.name),
      forme: raw.forme || '',
      formKind: formKind(raw),
      types: (raw.types || []).map(lower),
      baseStats: { ...raw.baseStats },
      abilities: clean(raw.abilities || {}),
      abilityIds,
      requiredItem: raw.requiredItem || null,
      requiredItemId: raw.requiredItem ? toID(raw.requiredItem) : null,
      requiredAbility: raw.requiredAbility || null,
      battleOnly: raw.battleOnly || false,
      canMega: !!(raw.forme && /mega/i.test(raw.forme)) || !!raw.requiredItem && /ite$/i.test(raw.requiredItem),
      isMega: !!(raw.forme && /mega/i.test(raw.forme)),
      isRegional: /(alola|galar|hisui|paldea|paldean)/i.test(raw.forme || raw.name),
      isBattleOnly: !!raw.battleOnly,
      weightkg: raw.weightkg ?? null,
      heightm: raw.heightm ?? null,
      gender: raw.gender || null,
      sprite: legacy?.sprite || '',
      tags: [
        raw.forme ? 'form' : 'base',
        raw.battleOnly ? 'battle-only' : null,
        raw.requiredItem ? 'item-form' : null,
      ].filter(Boolean),
      source: { mechanics: `@pkmn/dex@${PKMN_DEX_VERSION}`, visual: legacy ? 'data-bundle' : null },
    };
    addAlias(aliases, 'species', raw.name, id);
    addAlias(aliases, 'species', raw.baseSpecies, id);
    addAlias(aliases, 'species', raw.id, id);
    addAlias(aliases, 'species', species[id].displayName, id);
  }

  for (const [id, legacy] of Object.entries(legacyPokedex)) {
    if (!species[id]) species[id] = legacySpeciesEntry(id, legacy, translations);
    addAlias(aliases, 'species', id, id);
    addAlias(aliases, 'species', legacy.displayName, id);
  }

  const moves = {};
  for (const raw of Dex.moves.all()) {
    if (!raw.exists) continue;
    const id = raw.id;
    const legacy = legacyMoves[id] || null;
    const flags = normalizeFlags(raw.flags || {});
    const targetMode = TARGET_MODE_MAP[raw.target] || raw.target || 'normal';
    const multihit = normalizeMultihit(raw.multihit);
    const callbacks = inferredCallbacks(raw);
    moves[id] = {
      id,
      num: raw.num || 0,
      name: raw.name,
      displayName: translations[`move:${id}`] || raw.name,
      type: lower(raw.type || legacy?.type || 'normal'),
      category: lower(raw.category || legacy?.damageClass || 'status'),
      damageClass: lower(raw.category || legacy?.damageClass || 'status'),
      basePower: raw.basePower || legacy?.power || 0,
      power: raw.basePower || legacy?.power || 0,
      accuracy: raw.accuracy,
      pp: raw.pp ?? null,
      priority: Number.isFinite(raw.priority) ? raw.priority : 0,
      target: raw.target || 'normal',
      targetMode,
      flags,
      flagTags: Object.keys(flags).filter((flag) => flags[flag]),
      multihit,
      hits: moveHits(raw.multihit || legacy?.hits || 1),
      isSpread: isSpreadTarget(targetMode),
      allyHit: isAllyHitTarget(targetMode),
      spreadModifier: isSpreadTarget(targetMode) ? 0.75 : 1,
      drain: clean(raw.drain) || null,
      recoil: clean(raw.recoil) || null,
      heal: clean(raw.heal) || null,
      selfdestruct: raw.selfdestruct || null,
      secondary: clean(raw.secondary) || null,
      secondaries: clean(raw.secondaries) || null,
      boosts: clean(raw.boosts) || null,
      selfBoosts: clean(raw.selfBoost) || clean(raw.selfBoosts) || null,
      volatileStatus: raw.volatileStatus || null,
      status: raw.status || null,
      sideCondition: raw.sideCondition || null,
      weather: raw.weather ? toID(raw.weather) : null,
      terrain: raw.terrain ? toID(raw.terrain).replace(/terrain$/, '') : null,
      pseudoWeather: raw.pseudoWeather || null,
      callbacks,
      callbackTags: callbackTags(raw),
      critRatio: raw.critRatio || 1,
      willCrit: !!raw.willCrit,
      ignoreAbility: !!raw.ignoreAbility,
      ignoreImmunity: !!raw.ignoreImmunity,
      ignoreDefensive: !!raw.ignoreDefensive,
      ignoreEvasion: !!raw.ignoreEvasion,
      overrideOffensiveStat: raw.overrideOffensiveStat || null,
      overrideDefensiveStat: raw.overrideDefensiveStat || null,
      overrideOffensivePokemon: raw.overrideOffensivePokemon || null,
      usesDefenseStat: raw.overrideOffensiveStat === 'def',
      usesTargetAttack: raw.overrideOffensivePokemon === 'target',
      bypassProtect: !flags.protect && lower(raw.category) !== 'status',
      bypassSubstitute: !!flags.authentic || !!raw.ignoreSubstitute,
      hasSheerForceBoost: !!raw.hasSheerForceBoost,
      desc: raw.desc || legacy?.desc || '',
      shortDesc: raw.shortDesc || '',
      localizedDesc: legacy?.desc || '',
      source: { mechanics: `@pkmn/dex@${PKMN_DEX_VERSION}`, visual: legacy ? 'data-bundle' : null },
    };
    addAlias(aliases, 'moves', raw.name, id);
    addAlias(aliases, 'moves', raw.id, id);
    addTranslationAliases(aliases, translations, 'move', id);
  }

  for (const [id, legacy] of Object.entries(legacyMoves)) {
    if (!moves[id]) moves[id] = legacyMoveEntry(id, legacy, translations);
    addAlias(aliases, 'moves', id, id);
    addTranslationAliases(aliases, translations, 'move', id);
  }

  const abilities = {};
  for (const raw of Dex.abilities.all()) {
    if (!raw.exists) continue;
    const id = raw.id;
    abilities[id] = {
      id,
      num: raw.num || 0,
      name: raw.name,
      displayName: translations[`ability:${id}`] || raw.name,
      desc: raw.desc || legacyDb.abilities?.[id]?.desc || '',
      shortDesc: raw.shortDesc || '',
      rating: raw.rating ?? null,
      runtimeHooks: functionKeys(raw),
      tags: abilityTags(raw),
      source: { mechanics: `@pkmn/dex@${PKMN_DEX_VERSION}`, visual: legacyDb.abilities?.[id] ? 'data-bundle' : null },
    };
    addAlias(aliases, 'abilities', raw.name, id);
    addAlias(aliases, 'abilities', raw.id, id);
    addTranslationAliases(aliases, translations, 'ability', id);
  }

  for (const [id, legacy] of Object.entries(legacyDb.abilities || {})) {
    if (!abilities[id]) {
      abilities[id] = {
        id,
        num: 0,
        name: id,
        displayName: translations[`ability:${id}`] || id,
        desc: legacy.desc || '',
        shortDesc: '',
        rating: null,
        runtimeHooks: [],
        tags: ['legacy-custom'],
        source: { mechanics: 'legacy-custom', visual: 'data-bundle' },
      };
    }
    addAlias(aliases, 'abilities', id, id);
    addTranslationAliases(aliases, translations, 'ability', id);
  }

  const items = {};
  for (const raw of Dex.items.all()) {
    if (!raw.exists) continue;
    const id = raw.id;
    items[id] = {
      id,
      num: raw.num || 0,
      name: raw.name,
      displayName: translations[`item:${id}`] || raw.name,
      desc: raw.desc || legacyDb.items?.[id]?.desc || '',
      shortDesc: raw.shortDesc || '',
      fling: clean(raw.fling) || null,
      naturalGift: clean(raw.naturalGift) || null,
      boosts: clean(raw.boosts) || null,
      megaStone: raw.megaStone || null,
      megaStoneId: raw.megaStone ? toID(raw.megaStone) : null,
      megaEvolves: raw.megaEvolves || null,
      megaEvolvesId: raw.megaEvolves ? toID(raw.megaEvolves) : null,
      itemUser: clean(raw.itemUser) || null,
      isBerry: /berry$/i.test(raw.name || id),
      isChoice: /^choice/i.test(raw.name || id),
      runtimeHooks: functionKeys(raw),
      tags: itemTags(raw),
      source: { mechanics: `@pkmn/dex@${PKMN_DEX_VERSION}`, visual: legacyDb.items?.[id] ? 'data-bundle' : null },
    };
    addAlias(aliases, 'items', raw.name, id);
    addAlias(aliases, 'items', raw.id, id);
    addTranslationAliases(aliases, translations, 'item', id);
  }

  for (const [id, legacy] of Object.entries(legacyDb.items || {})) {
    if (!items[id]) {
      items[id] = {
        id,
        num: 0,
        name: id,
        displayName: translations[`item:${id}`] || id,
        desc: legacy.desc || '',
        shortDesc: '',
        fling: null,
        naturalGift: null,
        boosts: null,
        megaStone: null,
        megaStoneId: null,
        megaEvolves: null,
        megaEvolvesId: null,
        itemUser: null,
        isBerry: /berry$/.test(id),
        isChoice: /^choice/.test(id),
        runtimeHooks: [],
        tags: ['legacy-custom'],
        source: { mechanics: 'legacy-custom', visual: 'data-bundle' },
      };
    }
    addAlias(aliases, 'items', id, id);
    addTranslationAliases(aliases, translations, 'item', id);
  }

  for (const [id, values] of Object.entries(WEATHER_IDS)) values.forEach((alias) => addAlias(aliases, 'weather', alias, id));
  for (const [id, values] of Object.entries(TERRAIN_IDS)) values.forEach((alias) => addAlias(aliases, 'terrain', alias, id));
  for (const [id, values] of Object.entries(STATUS_IDS)) values.forEach((alias) => addAlias(aliases, 'statuses', alias, id));
  for (const value of Object.values(TARGET_MODE_MAP)) addAlias(aliases, 'targetModes', value, value);
  for (const [alias, value] of Object.entries(TARGET_MODE_MAP)) addAlias(aliases, 'targetModes', alias, value);
  for (const [alias, value] of Object.entries(Dex.data.Aliases || {})) {
    const targetId = toID(value);
    if (species[targetId]) addAlias(aliases, 'species', alias, targetId);
    if (moves[targetId]) addAlias(aliases, 'moves', alias, targetId);
    if (abilities[targetId]) addAlias(aliases, 'abilities', alias, targetId);
    if (items[targetId]) addAlias(aliases, 'items', alias, targetId);
  }

  const dex = {
    metadata: {
      version: '1.0.0',
      generatedAt: null,
      sourcePriority: [
        `mechanics:@pkmn/dex@${PKMN_DEX_VERSION}`,
        'meta:data-bundle.smogon',
        'visual:data-bundle.pokeapi/translations',
        'custom:data-bundle overrides',
      ],
      counts: {
        species: Object.keys(species).length,
        moves: Object.keys(moves).length,
        abilities: Object.keys(abilities).length,
        items: Object.keys(items).length,
      },
    },
    enums: {
      weather: Object.keys(WEATHER_IDS),
      terrain: Object.keys(TERRAIN_IDS),
      statuses: Object.keys(STATUS_IDS),
      targetModes: [...new Set(Object.values(TARGET_MODE_MAP))],
      moveFlags: MOVE_FLAGS,
      sideConditions: ['reflect', 'lightscreen', 'auroraveil', 'tailwind', 'stealthrock', 'spikes', 'toxicspikes', 'stickyweb', 'wideguard', 'quickguard'],
    },
    aliases,
    species,
    moves,
    abilities,
    items,
  };

  const body = [
    '// Generated by tools/build-canonical-dex.mjs. Do not edit by hand.',
    `export const CANONICAL_DEX = ${JSON.stringify(dex, null, 2)};`,
    '',
  ].join('\n');
  await writeFile(OUTPUT, body, 'utf8');
  await cleanup();
  console.log(`CanonicalDex generated: ${path.relative(ROOT, OUTPUT)}`);
  console.log(dex.metadata.counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
