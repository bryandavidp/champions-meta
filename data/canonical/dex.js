import { CANONICAL_DEX } from './generated.js';
import {
  canonicalizeStatus,
  canonicalizeTargetMode,
  canonicalizeTerrain,
  canonicalizeWeather,
  normalizeMoveFlags,
  toCanonicalId,
} from './normalization.js';

export { CANONICAL_DEX as CanonicalDex };
export {
  canonicalizeStatus,
  canonicalizeTargetMode,
  canonicalizeTerrain,
  canonicalizeWeather,
  normalizeMoveFlags,
  toCanonicalId,
};

const TABLE_BY_KIND = {
  species: 'species',
  form: 'species',
  pokemon: 'species',
  move: 'moves',
  moves: 'moves',
  ability: 'abilities',
  abilities: 'abilities',
  item: 'items',
  items: 'items',
};

function tableName(kind) {
  return TABLE_BY_KIND[kind] || kind;
}

export function resolveCanonicalId(kind, value) {
  const table = tableName(kind);
  const raw = toCanonicalId(value);
  if (!raw) return '';
  return CANONICAL_DEX.aliases?.[table]?.[raw] || raw;
}

function getEntry(kind, value) {
  const table = tableName(kind);
  const id = resolveCanonicalId(table, value);
  return id ? CANONICAL_DEX[table]?.[id] || null : null;
}

export function getCanonicalSpecies(value) {
  return getEntry('species', value);
}

export function getCanonicalMove(value) {
  return getEntry('moves', value);
}

export function getCanonicalAbility(value) {
  return getEntry('abilities', value);
}

export function getCanonicalItem(value) {
  return getEntry('items', value);
}

export function getCanonicalMovePriority(value) {
  const move = typeof value === 'object' ? value : getCanonicalMove(value);
  return Number.isFinite(move?.priority) ? move.priority : 0;
}

export function isCanonicalSpreadMove(value) {
  const move = typeof value === 'object' ? value : getCanonicalMove(value);
  return !!move?.isSpread;
}

export function getCanonicalMoveFlag(value, flag) {
  const move = typeof value === 'object' ? value : getCanonicalMove(value);
  return !!move?.flags?.[toCanonicalId(flag)];
}

export function toLegacyMoveInfo(moveOrName) {
  const move = typeof moveOrName === 'object' ? moveOrName : getCanonicalMove(moveOrName);
  if (!move) return null;
  const flags = normalizeMoveFlags(move.flags || {});
  return {
    id: move.id,
    name: move.name,
    type: move.type,
    damageClass: move.category,
    category: move.category,
    power: move.basePower || 0,
    basePower: move.basePower || 0,
    accuracy: move.accuracy,
    priority: Number.isFinite(move.priority) ? move.priority : 0,
    target: move.target,
    targetMode: move.targetMode || canonicalizeTargetMode(move.target),
    hits: move.hits || 1,
    multihit: move.multihit || null,
    isSpread: !!move.isSpread,
    allyHit: !!move.allyHit,
    makesContact: !!flags.contact,
    isSound: !!flags.sound,
    isPunch: !!flags.punch,
    isBite: !!flags.bite,
    isBullet: !!flags.bullet,
    isSlicing: !!flags.slicing,
    isWind: !!flags.wind,
    isPowder: !!flags.powder,
    isDance: !!flags.dance,
    isPulse: !!flags.pulse,
    isAura: !!flags.aura,
    isBomb: !!flags.bomb,
    flags,
    drain: move.drain || null,
    recoil: move.recoil || null,
    heal: move.heal || null,
    selfdestruct: move.selfdestruct || null,
    secondary: move.secondary || null,
    secondaries: move.secondaries || null,
    boosts: move.boosts || null,
    selfBoosts: move.selfBoosts || null,
    volatileStatus: move.volatileStatus || null,
    status: move.status || null,
    sideCondition: move.sideCondition || null,
    weather: move.weather || null,
    terrain: move.terrain || null,
    pseudoWeather: move.pseudoWeather || null,
    callbacks: move.callbacks || {},
    critRatio: move.critRatio || 1,
    willCrit: !!move.willCrit,
    ignoreAbility: !!move.ignoreAbility,
    ignoreImmunity: !!move.ignoreImmunity,
    ignoreDefensive: !!move.ignoreDefensive,
    overrideOffensiveStat: move.overrideOffensiveStat || null,
    overrideDefensiveStat: move.overrideDefensiveStat || null,
    overrideOffensivePokemon: move.overrideOffensivePokemon || null,
    usesDefenseStat: !!move.usesDefenseStat,
    usesTargetAttack: !!move.usesTargetAttack,
    spreadModifier: move.spreadModifier || (move.isSpread ? 0.75 : 1),
    bypassProtect: !!move.bypassProtect,
    bypassSubstitute: !!move.bypassSubstitute,
    desc: move.localizedDesc || move.shortDesc || move.desc || '',
    source: move.source || {},
  };
}

export function toLegacySpeciesInfo(speciesOrName) {
  const species = typeof speciesOrName === 'object' ? speciesOrName : getCanonicalSpecies(speciesOrName);
  if (!species) return null;
  return {
    id: species.num || 0,
    name: species.id,
    displayName: species.displayName || species.name,
    sprite: species.sprite || '',
    types: species.types || [],
    baseStats: {
      hp: species.baseStats?.hp || 80,
      attack: species.baseStats?.atk || 80,
      defense: species.baseStats?.def || 80,
      'special-attack': species.baseStats?.spa || 80,
      'special-defense': species.baseStats?.spd || 80,
      speed: species.baseStats?.spe || 80,
      atk: species.baseStats?.atk || 80,
      def: species.baseStats?.def || 80,
      spa: species.baseStats?.spa || 80,
      spd: species.baseStats?.spd || 80,
      spe: species.baseStats?.spe || 80,
    },
    canonical: species,
  };
}
