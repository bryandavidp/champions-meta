// matrix/core.js
// Helpers puros de matriz. Desde Fase 6 la celda se calcula con BattleSnapshot + action-core.

import {
  BATTLE_RULES_VERSION,
  DATA_VERSION,
  createBattleSnapshot,
} from '../battle/snapshot.js';
import {
  buildSnapshotCacheKey,
  buildVersionedCacheKey,
} from '../battle/cache-keys.js';
import {
  estimateActionOutcome,
  generateLegalActions,
} from '../battle/action-core.js';
import { DAMAGE_THRESHOLDS } from '../core/constants.js';

export const MATRIX_CORE_VERSION = 'matrix-core-v2';
export const MATRIX_PERF_VERSION = 'matrix-memo-v1';

const MATRIX_CACHE_LIMIT = 24;
const rowsCache = new Map();
const matrixStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
};

function deepClone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function trimRowsCache() {
  while (rowsCache.size > MATRIX_CACHE_LIMIT) {
    let oldestKey = null;
    let oldestAt = Infinity;
    rowsCache.forEach((entry, key) => {
      const accessedAt = Number(entry?.lastAccessedAt || 0);
      if (accessedAt < oldestAt) {
        oldestAt = accessedAt;
        oldestKey = key;
      }
    });
    if (!oldestKey) break;
    rowsCache.delete(oldestKey);
    matrixStats.evictions += 1;
  }
}

function firstActivePair(team = []) {
  const indices = team
    .map((mon, index) => (mon && !mon.fainted ? index : null))
    .filter(Number.isFinite);
  return indices.length >= 2 ? indices.slice(0, 2) : indices;
}

function buildRowsCacheKey({ selfTeam = [], enemyTeam = [], field = {}, mode = 'offensive' } = {}) {
  const snapshot = createBattleSnapshot({
    selfTeam,
    enemyTeam,
    field,
    activeSelfSlots: firstActivePair(selfTeam),
    activeEnemySlots: firstActivePair(enemyTeam),
    phase: 'matrix',
    source: 'matrix-core-cache',
  });
  const snapshotKey = buildSnapshotCacheKey(snapshot, {
    matrixMode: mode,
  });
  return buildVersionedCacheKey({
    scope: 'matrix-rows',
    snapshot,
    snapshotKey,
    rulesVersion: BATTLE_RULES_VERSION,
    dataVersion: DATA_VERSION,
    context: {
      mode,
      coreVersion: MATRIX_CORE_VERSION,
      perfVersion: MATRIX_PERF_VERSION,
    },
  });
}

function readRowsCache(key) {
  const cached = rowsCache.get(key);
  if (!cached) {
    matrixStats.misses += 1;
    return null;
  }
  cached.lastAccessedAt = Date.now();
  matrixStats.hits += 1;
  return deepClone(cached.rows);
}

function writeRowsCache(key, rows) {
  rowsCache.set(key, {
    rows: deepClone(rows),
    lastAccessedAt: Date.now(),
  });
  trimRowsCache();
  return rows;
}

function firstPartnerIndex(team = [], index) {
  const found = team.findIndex((mon, idx) => idx !== index && !!mon && !mon.fainted);
  return found >= 0 ? found : index;
}

function actionTargetsSlot(action, targetSide, targetSlot) {
  if (action.kind !== 'move') return false;
  if (action.targetMode === 'allAdjacent' || action.targetMode === 'allAdjacentFoes' || action.targetMode === 'all') return true;
  return action.targetSide === targetSide && Number(action.targetSlot) === Number(targetSlot);
}

function buildCellSnapshot({
  selfTeam,
  enemyTeam,
  field,
  attackerSide,
  attackerIndex,
  defenderSide,
  defenderIndex,
}) {
  const selfActive = attackerSide === 'self'
    ? [attackerIndex, firstPartnerIndex(selfTeam, attackerIndex)]
    : [defenderIndex, firstPartnerIndex(selfTeam, defenderIndex)];
  const enemyActive = attackerSide === 'enemy'
    ? [attackerIndex, firstPartnerIndex(enemyTeam, attackerIndex)]
    : [defenderIndex, firstPartnerIndex(enemyTeam, defenderIndex)];

  return createBattleSnapshot({
    selfTeam,
    enemyTeam,
    field,
    activeSelfSlots: [...new Set(selfActive)].filter(Number.isFinite),
    activeEnemySlots: [...new Set(enemyActive)].filter(Number.isFinite),
    phase: 'matrix',
    source: 'matrix-core',
  });
}

function resultForDefender(outcome, defenderSide, defenderIndex) {
  const targets = outcome?.targets || [];
  const results = outcome?.results || [];
  const index = targets.findIndex((target) => target.side === defenderSide && Number(target.slot) === Number(defenderIndex));
  if (index < 0) return null;
  return {
    target: targets[index],
    result: results[index],
  };
}

function traceValue(result, phase, key, fallback = null) {
  const entry = (result?.trace || []).find((item) => item.phase === phase);
  return entry?.[key] ?? fallback;
}

function ohkoProbabilityFromResult(result) {
  if (!result || result.blocked) return 0;
  if (result.survival?.survives) return 0;
  const rolls = result.rolls || [];
  if (!rolls.length) return (result.maxPct || 0) >= 100 ? 100 : 0;
  const targetHp = Math.max(1, result.maxDamage / Math.max(0.01, (result.maxPct || 1) / 100));
  const hits = rolls.filter((roll) => roll >= targetHp).length;
  return Math.round((hits / rolls.length) * 100);
}

function outcomeToCell({
  attacker,
  defender,
  action,
  result,
  target,
  offensive,
}) {
  const modifiers = traceValue(result, 'modifiers', 'finalModifier', 1);
  const weatherMul = traceValue(result, 'modifiers', 'weather', 1);
  const terrainMul = traceValue(result, 'modifiers', 'terrain', 1);
  const typeEffectiveness = result?.typeEffectiveness ?? 1;
  const ohkoProb = ohkoProbabilityFromResult(result);
  const confidenceValue = action?.confidence?.value ?? (result?.blocked ? 0.82 : 0.88);
  return {
    schema: 'matrix-cell-v2',
    engineVersion: MATRIX_CORE_VERSION,
    attacker,
    defender,
    type: result?.type || action?.data?.moveType || 'normal',
    mult: result?.blocked ? 0 : typeEffectiveness,
    rawMult: typeEffectiveness,
    wMul: weatherMul,
    terrMul: terrainMul,
    weatherMul,
    terrainMul,
    finalModifier: modifiers,
    blocked: !!result?.blocked,
    blockReason: result?.blockReason || null,
    move: action?.moveName || action?.moveId || '',
    moveId: action?.moveId || null,
    damage: result?.damage || 0,
    minPct: result?.minPct ?? 0,
    maxPct: result?.maxPct ?? 0,
    ohkoProb,
    ohko: ohkoProb >= 100 || (!!result && !result.survival?.survives && (result.minPct || 0) >= 100),
    priority: Number(action?.dynamicPriority ?? action?.priority ?? action?.data?.priority ?? 0),
    effectClass: action?.effectClass || 'damage',
    targetMode: action?.targetMode || null,
    targetRedirected: !!target?.redirected,
    confidence: {
      value: confidenceValue,
      level: confidenceValue >= 0.8 ? 'high' : confidenceValue >= 0.55 ? 'medium' : 'low',
    },
    unsupportedMechanics: action?.unsupported || [],
    explainEvents: result?.explainEvents || [],
    trace: result?.trace || [],
    offensive,
  };
}

function emptyCell(attacker, defender, offensive, reason = 'sin accion legal') {
  return {
    schema: 'matrix-cell-v2',
    engineVersion: MATRIX_CORE_VERSION,
    attacker,
    defender,
    type: 'normal',
    mult: 0,
    rawMult: 0,
    wMul: 1,
    terrMul: 1,
    blocked: true,
    blockReason: reason,
    move: '',
    moveId: null,
    damage: 0,
    minPct: 0,
    maxPct: 0,
    ohkoProb: 0,
    ohko: false,
    priority: 0,
    effectClass: 'none',
    targetMode: null,
    confidence: { value: 0.45, level: 'low' },
    unsupportedMechanics: ['no-legal-damage-action'],
    explainEvents: [],
    trace: [],
    dataIssue: true,
    offensive,
  };
}

export function evaluateMatrixCell({
  selfTeam = [],
  enemyTeam = [],
  field = {},
  attackerSide = 'self',
  attackerIndex = 0,
  defenderSide = 'enemy',
  defenderIndex = 0,
  offensive = true,
} = {}) {
  const attackerTeam = attackerSide === 'self' ? selfTeam : enemyTeam;
  const defenderTeam = defenderSide === 'self' ? selfTeam : enemyTeam;
  const attacker = attackerTeam[attackerIndex];
  const defender = defenderTeam[defenderIndex];
  if (!attacker || !defender) return emptyCell(attacker, defender, offensive, 'slot vacio');

  const snapshot = buildCellSnapshot({
    selfTeam,
    enemyTeam,
    field,
    attackerSide,
    attackerIndex,
    defenderSide,
    defenderIndex,
  });
  const actions = generateLegalActions(snapshot, attackerSide, attackerIndex, { includeSwitches: false })
    .filter((action) => action.flags?.legal !== false && actionTargetsSlot(action, defenderSide, defenderIndex));
  const scored = actions
    .map((action) => {
      const outcome = estimateActionOutcome(snapshot, action);
      const targetResult = resultForDefender(outcome, defenderSide, defenderIndex);
      if (!targetResult) return null;
      const score = targetResult.result?.blocked
        ? -1
        : ((targetResult.result?.maxPct || 0) + (targetResult.result?.typeEffectiveness || 1) * 8 + (targetResult.result?.survival?.survives ? 4 : 0));
      return { action, outcome, ...targetResult, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return emptyCell(attacker, defender, offensive);
  return outcomeToCell({
    attacker,
    defender,
    action: best.action,
    result: best.result,
    target: best.target,
    offensive,
  });
}

export function getRows({
  selfTeam = [],
  enemyTeam = [],
  field = {},
  mode = 'offensive',
} = {}) {
  const self = selfTeam.filter(Boolean);
  const enemy = enemyTeam.filter(Boolean);
  if (!self.length || !enemy.length) return [];

  const cacheKey = buildRowsCacheKey({ selfTeam, enemyTeam, field, mode });
  const cached = readRowsCache(cacheKey);
  if (cached) return cached;

  if (mode === 'defensive') {
    return writeRowsCache(cacheKey, enemy.map((attacker) => {
      const attackerIndex = enemyTeam.indexOf(attacker);
      return {
        attacker,
        cells: self.map((defender) => evaluateMatrixCell({
          selfTeam,
          enemyTeam,
          field,
          attackerSide: 'enemy',
          attackerIndex,
          defenderSide: 'self',
          defenderIndex: selfTeam.indexOf(defender),
          offensive: false,
        })),
      };
    }));
  }

  return writeRowsCache(cacheKey, self.map((attacker) => {
    const attackerIndex = selfTeam.indexOf(attacker);
    return {
      attacker,
      cells: enemy.map((defender) => evaluateMatrixCell({
        selfTeam,
        enemyTeam,
        field,
        attackerSide: 'self',
        attackerIndex,
        defenderSide: 'enemy',
        defenderIndex: enemyTeam.indexOf(defender),
        offensive: true,
      })),
    };
  }));
}

export function clearMatrixMemo() {
  rowsCache.clear();
  matrixStats.hits = 0;
  matrixStats.misses = 0;
  matrixStats.evictions = 0;
}

export function getMatrixCacheStats() {
  return {
    version: MATRIX_PERF_VERSION,
    size: rowsCache.size,
    limit: MATRIX_CACHE_LIMIT,
    ...matrixStats,
  };
}

export function formatCellPct(cell) {
  if (cell.blocked || cell.mult === 0) return '0%';
  const min = Number.isFinite(cell.minPct) ? cell.minPct : 0;
  const max = Number.isFinite(cell.maxPct) ? cell.maxPct : 0;
  if (!min && !max) return '0%';
  if (min === max) return `${max}%`;
  return `${min}-${max}%`;
}

export function classifyMatrixCell(cell, offensive = true) {
  const maxPct = Number(cell.maxPct || 0);
  const minPct = Number(cell.minPct || 0);

  if (offensive) {
    if (cell.blocked) return { tone: 'blocked', label: cell.blockReason || 'Bloqueado', shortLabel: 'Bloq.' };
    if (cell.mult === 0) return { tone: 'immune', label: 'Inmune', shortLabel: 'Inmune' };
    if (cell.ohkoProb >= DAMAGE_THRESHOLDS.koLikelyOhko || (maxPct >= 100 && minPct >= 85)) return { tone: 'ko', label: 'KO probable', shortLabel: 'KO' };
    if (cell.mult >= 2 && maxPct >= DAMAGE_THRESHOLDS.pressureMaxPct) return { tone: 'pressure', label: 'Presion alta', shortLabel: 'Presion' };
    if (cell.mult > 1 || maxPct >= DAMAGE_THRESHOLDS.chipMaxPct) return { tone: 'chip', label: 'Chip util', shortLabel: 'Chip' };
    if (cell.mult < 1 || maxPct < DAMAGE_THRESHOLDS.chipMaxPct) return { tone: 'wall', label: 'Muro', shortLabel: 'Muro' };
    return { tone: 'neutral', label: 'Neutral', shortLabel: 'Neutral' };
  }

  if (cell.blocked || cell.mult === 0) return { tone: 'safe', label: cell.blockReason || 'Inmune', shortLabel: 'Inmune' };
  if (cell.mult < 1 && maxPct < 35) return { tone: 'safe', label: 'Cambio seguro', shortLabel: 'Seguro' };
  if (cell.ohkoProb >= 50 || maxPct >= 90 || cell.mult >= 4) return { tone: 'danger', label: 'Peligro real', shortLabel: 'Peligro' };
  if (cell.mult >= 2 || maxPct >= 50) return { tone: 'respect', label: 'Respetar', shortLabel: 'Respeto' };
  return { tone: 'neutral', label: 'Neutral', shortLabel: 'Neutral' };
}

export function buildMatrixContextTags(cell, offensive, compact = false) {
  const tags = [];
  if (cell.blocked) tags.push({ tone: 'blocked', label: cell.blockReason || 'Bloqueado' });
  if (cell.targetRedirected) tags.push({ tone: 'warning', label: 'Redirigido' });
  if (cell.priority > 0) tags.push({ tone: 'boost', label: `Prioridad +${cell.priority}` });
  if (cell.weatherMul > 1) tags.push({ tone: 'boost', label: 'Clima potencia' });
  if (cell.weatherMul < 1) tags.push({ tone: 'nerf', label: 'Clima reduce' });
  if (cell.terrainMul > 1) tags.push({ tone: 'boost', label: 'Terreno potencia' });
  if (cell.terrainMul < 1) tags.push({ tone: 'nerf', label: 'Terreno reduce' });
  if (cell.ohkoProb > 0 && cell.ohkoProb < 100) tags.push({ tone: 'danger', label: `OHKO ${cell.ohkoProb}%` });
  if (cell.confidence?.level === 'low') tags.push({ tone: 'warning', label: 'Confianza baja' });
  if (cell.unsupportedMechanics?.length) tags.push({ tone: 'warning', label: 'Mecanica parcial' });
  if (offensive && cell.mult >= 2 && cell.maxPct < 50) tags.push({ tone: 'info', label: 'Buen tipo, dano medio' });
  if (offensive && cell.mult < 1 && cell.maxPct < 25 && !cell.blocked) tags.push({ tone: 'blocked', label: 'No merece click' });
  return tags.slice(0, compact ? 2 : 4);
}

export function getTacticalPhrase(cell, offensive) {
  if (offensive) {
    if (cell.blocked) return cell.blockReason ? `Bloqueado: ${cell.blockReason}` : 'Bloqueado por regla o campo';
    if (cell.mult === 0) return 'Totalmente inmune al dano';
    if (cell.ohkoProb >= 75 || (cell.maxPct >= 100 && cell.minPct >= 85)) return 'Amenaza KO si entra limpio';
    if (cell.mult >= 2 && cell.maxPct >= 50) return 'Buena presion, fuerza respuesta';
    if (cell.mult > 1 || cell.maxPct >= 25) return 'Buen chip, no fuerza cambio';
    if (cell.mult < 1 || cell.maxPct < 25) return 'Resiste bien, no compensa pulsar';
    return 'Dano aceptable sin ventaja clara';
  }
  if (cell.blocked || cell.mult === 0) return cell.blockReason ? `Entrada protegida: ${cell.blockReason}` : 'Inmune a su mejor ataque';
  if (cell.mult < 1 && cell.maxPct < 35) return 'Entrada segura, resiste bien';
  if (cell.ohkoProb >= 50 || cell.maxPct >= 90 || cell.mult >= 4) return 'Te castiga si pivotas aqui';
  if (cell.mult >= 2 || cell.maxPct >= 50) return 'Amenaza fuerte, cuidado al entrar';
  return 'Intercambio de dano parejo';
}

export function sanitizeCell(cell) {
  const minPct = Number(cell?.minPct);
  const maxPct = Number(cell?.maxPct);
  if (!cell || !Number.isFinite(minPct) || !Number.isFinite(maxPct)) {
    return { ...(cell || {}), move: null, minPct: null, maxPct: null, dataIssue: true };
  }
  return cell;
}
