// =========================================================================
// battle/formulas.js — FUENTE ÚNICA de las matemáticas del motor.
//
// Módulo puro: sin DOM, sin estado global, sin registry bridge. Los
// adaptadores (battle/damage.js, battle/speed.js, battle/stats.js,
// battle/action-core.js, app-core.js) delegan aquí y aplican encima los
// modificadores dependientes de su formato de datos (registry, volatiles).
// =========================================================================

import { NATURE_PAIR, MOVE_PRIORITY_LEVELS } from '../core/constants.js';
import { getCanonicalMove, getCanonicalMovePriority } from '../data/canonical/dex.js';

export const FORMULAS_VERSION = 1;

function normalizeId(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// --- Stats -----------------------------------------------------------------

export function stageMultiplier(stage) {
  if (!Number.isFinite(stage) || stage === 0) return 1;
  if (stage > 0) return (2 + stage) / 2;
  return 2 / (2 - stage);
}

export function natureMultiplier(nature, stat) {
  const pair = NATURE_PAIR[nature];
  if (!pair) return 1;
  if (pair[0] === stat) return 1.1;
  if (pair[1] === stat) return 0.9;
  return 1;
}

export function baseStatAt({ base, iv = 31, ev = 0, level = 50 }) {
  const safeBase = Number.isFinite(Number(base)) ? Number(base) : 80;
  return Math.floor(((2 * safeBase + iv + Math.floor((ev || 0) / 4)) * level) / 100) + 5;
}

export function maxHpAt({ base, iv = 31, ev = 0, level = 50 }) {
  const safeBase = Number.isFinite(Number(base)) ? Number(base) : 80;
  return Math.floor(((2 * safeBase + iv + Math.floor((ev || 0) / 4)) * level) / 100) + level + 10;
}

// --- Daño ------------------------------------------------------------------

// 16 rolls oficiales (0.85x–1.00x). Todo golpe que conecta hace al menos 1.
export function damageRolls(baseTotal) {
  const rolls = [];
  for (let i = 0; i < 16; i += 1) {
    rolls.push(Math.max(1, Math.floor(baseTotal * (0.85 + (i / 15) * 0.15))));
  }
  return {
    rolls,
    minDamage: rolls[0],
    maxDamage: rolls[15],
    critDamage: Math.max(1, Math.floor(baseTotal * 1.5)),
  };
}

export function weatherDamageMultiplier(type, weather) {
  const t = normalizeId(type);
  const w = normalizeId(weather);
  if (w === 'sun' || w === 'sunnyday') {
    if (t === 'fire') return 1.5;
    if (t === 'water') return 0.5;
  }
  if (w === 'rain' || w === 'raindance' || w === 'rainstorm') {
    if (t === 'water') return 1.5;
    if (t === 'fire') return 0.5;
  }
  return 1;
}

// Boost defensivo pasivo de clima: Arena → x1.5 SpD de tipos Roca,
// Nieve → x1.5 Def de tipos Hielo.
export function weatherDefenseMultiplier(category, weather, defenderTypes = []) {
  const w = normalizeId(weather);
  const types = (defenderTypes || []).map(normalizeId);
  if ((w === 'sand' || w === 'sandstorm') && category === 'special' && types.includes('rock')) return 1.5;
  if ((w === 'snow' || w === 'hail') && category === 'physical' && types.includes('ice')) return 1.5;
  return 1;
}

const GRASSY_HALVED_MOVES = new Set(['earthquake', 'bulldoze', 'magnitude']);

export function terrainDamageMultiplier(type, moveName, { terrain, attackerGrounded = true, defenderGrounded = true } = {}) {
  const t = normalizeId(type);
  const terr = normalizeId(terrain);
  if (!terr) return 1;
  let mult = 1;
  if (terr === 'electric' && t === 'electric' && attackerGrounded) mult *= 1.3;
  if (terr === 'grassy' && t === 'grass' && attackerGrounded) mult *= 1.3;
  if (terr === 'psychic' && t === 'psychic' && attackerGrounded) mult *= 1.3;
  if (terr === 'misty' && t === 'dragon' && defenderGrounded) mult *= 0.5;
  if (terr === 'grassy' && GRASSY_HALVED_MOVES.has(normalizeId(moveName)) && defenderGrounded) mult *= 0.5;
  return mult;
}

// Potencia base dinámica (casos puros, compartidos por ambos pipelines).
// Los casos que dependen de velocidad/peso del snapshot (Gyro Ball,
// Electro Ball, Low Kick, Heavy Slam) viven en el consumidor.
export function dynamicBasePower(moveName, basePower, ctx = {}) {
  const id = normalizeId(moveName);
  const hpRatio = Math.max(0, Math.min(1, (ctx.attackerHpPct ?? 100) / 100));

  if (id === 'eruption' || id === 'waterspout' || id === 'dragonenergy') {
    return Math.max(1, Math.floor(150 * hpRatio));
  }
  if (id === 'flail' || id === 'reversal') {
    if (hpRatio <= 1 / 48) return 200;
    if (hpRatio <= 4 / 48) return 150;
    if (hpRatio <= 9 / 48) return 100;
    if (hpRatio <= 16 / 48) return 80;
    if (hpRatio <= 32 / 48) return 40;
    return 20;
  }
  if ((id === 'hex' || id === 'infernalparade') && ctx.defenderHasStatus) {
    return (basePower || 65) * 2;
  }
  if (id === 'acrobatics' && !ctx.attackerHasItem) return 110;
  if (id === 'facade' && ctx.attackerHasStatus) return 140;
  if (id === 'storedpower' || id === 'powertrip') {
    return 20 + Math.max(0, Number(ctx.attackerPositiveBoosts || 0)) * 20;
  }
  if (id === 'ragefist') {
    return Math.min(350, 50 + Math.max(0, Number(ctx.timesHit || 0)) * 50);
  }
  if (id === 'lastrespects') {
    return Math.min(5050, 50 + Math.max(0, Number(ctx.faintedAllies || 0)) * 50);
  }
  return basePower;
}

// --- Prioridad -------------------------------------------------------------

function readMonField(mon, keys) {
  for (const key of keys) {
    const value = mon?.set?.[key] ?? mon?.[key];
    if (value) return value;
  }
  return '';
}

function monIsGrounded(mon) {
  const item = normalizeId(readMonField(mon, ['item']));
  if (item === 'ironball' || item === 'bolaferrea') return true;
  const types = (mon?.types || []).map(normalizeId);
  if (types.includes('flying')) return false;
  const ability = normalizeId(readMonField(mon, ['ability']));
  if (ability === 'levitate' || ability === 'levitacion') return false;
  if (item === 'airballoon' || item === 'globohelio') return false;
  return true;
}

function moveIsStatus(canonicalMove) {
  if (!canonicalMove) return false;
  const category = normalizeId(canonicalMove.category || canonicalMove.damageClass);
  return category === 'status';
}

// Prioridad efectiva de un movimiento: dex canónico primero,
// MOVE_PRIORITY_LEVELS solo como fallback, y después habilidades del usuario.
// La interacción con Trick Room NO se resuelve aquí: TR invierte el orden
// dentro del bracket de velocidad, nunca la prioridad (ver compareActionOrder).
export function resolveMovePriority(moveName, mon = null, field = null) {
  if (!moveName) return 0;
  const canonical = getCanonicalMove(moveName);
  let priority = canonical
    ? getCanonicalMovePriority(canonical)
    : (MOVE_PRIORITY_LEVELS[String(moveName).toLowerCase()] ?? MOVE_PRIORITY_LEVELS[normalizeId(moveName)] ?? 0);

  const moveId = canonical?.id || normalizeId(moveName);

  // Grassy Glide solo gana +1 en Terreno Hierba con el usuario en tierra.
  if (moveId === 'grassyglide' && normalizeId(field?.terrain) === 'grassy' && (!mon || monIsGrounded(mon))) {
    priority += 1;
  }

  if (mon) {
    const ability = normalizeId(readMonField(mon, ['ability']));
    if ((ability === 'prankster' || ability === 'bromista') && moveIsStatus(canonical)) {
      priority += 1;
    }
    if (ability === 'galewings' || ability === 'alasvendaval') {
      const hpPct = mon?.battle?.hpPct ?? mon?.hpPct ?? 100;
      if (normalizeId(canonical?.type) === 'flying' && hpPct >= 100) priority += 1;
    }
    if (ability === 'triage' && (canonical?.flags?.heal || canonical?.drain)) {
      priority += 3;
    }
  }
  return priority;
}

// Comparador oficial de orden de acción: bracket de prioridad primero;
// dentro del bracket decide la velocidad (invertida bajo Trick Room).
export function compareActionOrder(a, b, trickRoom = false) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (a.speed !== b.speed) return trickRoom ? a.speed - b.speed : b.speed - a.speed;
  return 0;
}
