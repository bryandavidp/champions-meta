import { DEBUG_MODE, smartLog, flowLog, debounce, resetSmartLog, configureDebugActions } from './utils/debug.js';
import { openSetEditor, closeSetEditor, renderSetEditor, ensureEditableSet, changeCurrentPokemonFromEditor, openSetChoice, closeSetChoice, renderSetChoiceList, applySetChoice, clearSetChoiceValue, resetCurrentSetToMeta, uniqValues, getEditorMon, getQuickOptions, getTopSpreads, guessSpreadRole, getMegaForm, getChoiceStateLabel } from './editor/set-editor.js';
import { renderDock } from './render/dock.js';
import { renderThreats, renderOpportunities, renderStrategies, renderDefensiveAlerts } from './render/analysis.js';
import { getRows, getEffectivenessBadgeHtml, renderMatrix, toggleMatrixHelp, loadMatrixPreferences } from './matrix/render.js';
import { ensurePokedex, renderPokedex, openModal, pickPokemonIntoSlot } from './picker/modal.js';
import { renderAll, loadUiMode, setUiMode, updateIcons, setBatchUpdating } from './render/app.js';
import * as quickMode from './modes/quick.js';
import { initEventBindings } from './events/bindings.js';
import { configureUiBridges, scheduleMoveWarmup } from './bridges/ui-bridges.js';
import { fillTeamWithSpecies } from './teams/actions.js';
import { 
  i18nCache, getTranslation, formatName, 
  compactName, slugFromSmogonName, displayFromSmogonName, pokeapiPokemonSlug, 
  escapeHtml, localizeMoveName, localizeTypeName 
} from './utils/text.js';
import { hexToRgba, typeDot, typeChip, effectiveness, fmtMult, effClass, topKey } from './utils/types.js';
import { parseSpread, natureMod, getBaseStatRaw, calcMonHP, stageMultiplier, calcOtherStatLv50, calculateEffectiveStats } from './battle/stats.js';
import { state, createInitialState } from './core/state.js';
import { LIVE } from './core/dom.js';
import { serializeSetSummary, getCacheKey, buildMetaIndex } from './data/meta.js';
import { chooseBestItem, buildDefaultSetForSpecies } from './data/sets.js';
import { ensureBattleState, homeSpriteFromPokemon, setOnPokemonFetched } from './data/pokemon.js';
import { ensureAbilityRegistry, ensureItemRegistry, ensureMoveRegistry, ensureStatusRegistry } from './battle/registry.js';
import { isSupportMove, fetchMoveInfo, getMoveCandidates } from './battle/moves.js';
import { getSpeedModifier, calculateSpeed } from './battle/speed.js';
import { resolveMovePriority } from './battle/formulas.js';
import { getWeatherAndTerrainMultipliers, applyRegistryDamageModifiers, calculateDamageRolls, estimateMoveDamage, bestAttack } from './battle/damage.js';
import { scoreThreat, inferStrategies } from './analysis/threats.js';
import { buildTurn1ProductModel } from './analysis/product-adapters.js';
import { evaluateKoConditions, renderKoConditionChips } from './analysis/ko-conditions.js';
import { tickField, recalculateActiveField, applySwitchInEffects, applyHazardsOnSwitchIn, applyMoveResolutionEffects } from './battle/effects.js';
import { isCanonicalSpreadMove } from './data/canonical/dex.js';
import {
  STORAGE_KEY,
  CACHE_KEY_PREFIX,
  RATING_STORAGE_KEY,

  SMOGON_MONTH,
  SMOGON_BASE,
  SMOGON_FILES,
  RATING_ORDER,
  MATRIX_DETAIL_MODE_KEY,
  MATRIX_HELP_SEEN_KEY,
  META_PRESETS,
  TACTICAL_ROLES,
  TYPE_META,
  TYPE_CHART,
  SMOGON_SPECIES_OVERRIDES,
  SUPPORT_MOVES,
  MOVE_TYPE_FALLBACK,
  DEMO_SELF,
  DEMO_ENEMY,
  MEGA_STONES,
  CUSTOM_TERMS,
  weatherNames,
  POKEAPI_SPECIES_SLUG,
  NATURE_PAIR,
  MOVE_PRIORITY_LEVELS,
  SPREAD_MOVES,
  GUARANTEED_MULTI_HITS,
  WEATHER_LABELS,
  TERRAIN_LABELS,
  TOOL_GROUPS,
  UIMODE_KEY
} from './core/constants.js';

import { setEffectsActiveIndicesCallback } from './battle/effects.js';
// Expose openSetEditor globally so it can be called by inline onclick handlers if any
window.openSetEditor = openSetEditor;
window.openModal = openModal;
window.setUiMode = setUiMode;
setEffectsActiveIndicesCallback((side) => state.uiMode === 'quick' ? quickMode.getTurn1ResolvedLeadIndices(side) : (side === 'self' ? state.activeSelfSlots : state.activeEnemySlots));

// Prioridad unificada: dex can\u00f3nico + habilidades (battle/formulas.js).
export function getPriority(moveName, mon = null) {
  return resolveMovePriority(moveName, mon, state.field);
}

window.loggedMessages = window.loggedMessages || new Set();

export function cloneSimulationState(sourceState) {
  return {
    ...sourceState,
    self: structuredClone(sourceState.self),
    enemy: structuredClone(sourceState.enemy),
    field: structuredClone(sourceState.field),
    leads: structuredClone(sourceState.leads),
    activeSelfSlots: [...sourceState.activeSelfSlots],
    activeEnemySlots: [...sourceState.activeEnemySlots],
    battleSheet: { open: false, side: null, slotKey: null, cell: null },
    selectedMatrixCell: null,
  };
}

// =========================================================================
// 1. DOM REFERENCES
// =========================================================================

const selfSlots = document.getElementById("selfSlots");
const enemySlots = document.getElementById("enemySlots");
const matrixContainer = document.getElementById("matrixContainer");
const matrixPlaceholder = document.getElementById("matrixPlaceholder");
const matrixStatus = document.getElementById("matrixStatus");
const threatList = document.getElementById("threatList");
const opportunityList = document.getElementById("opportunityList");
const strategyList = document.getElementById("strategyList");
const pickerModal = document.getElementById("pickerModal");
const searchInput = document.getElementById("searchInput");
const resultList = document.getElementById("resultList");
const searchHint = document.getElementById("searchHint");
const modalTitle = document.getElementById("modalTitle");
const ratingSelect = document.getElementById("ratingSelect");
const matrixSourceChip = document.getElementById("matrixSourceChip");
const metricMeta = document.getElementById("metricMeta");
const metaStatusText = document.getElementById("metaStatusText");

/** Slugs para https://pokeapi.co/api/v2/pokemon/{slug} (Smogon ≠ PokeAPI en muchas formas). */

// CORE ENGINE: calcula la velocidad efectiva de un mon (Tailwind/TR/registry).
// CORE ENGINE: calcula la velocidad efectiva de un mon (Tailwind/TR/registry).

// stage: entero de -6 a +6

// CORE ENGINE: calcula el daño base de un movimiento entre dos mons.

async function rehydrateCurrentTeamsSets() {
  for (const side of ["self", "enemy"]) {
    for (let i = 0; i < state[side].length; i++) {
      const mon = state[side][i];
      if (!mon) {
        continue;
      }
          mon.set = buildDefaultSetForSpecies(mon.name, side, i);
          ensureBattleState(mon);
    }
  }
  scheduleMoveWarmup();
}

// CORE ENGINE: elige el mejor movimiento ofensivo entre dos mons.

// CORE ENGINE: aplica efectos de entrada (clima, terreno, etc.).
// TO-DO(registry): aplicar TODOS los eventos relevantes de switch-in
// (hazards, rooms, side-conditions) cuando el registry esté completo.


// =========================================================================
// 2. MATRIX ENGINE & RENDERERS
// =========================================================================

// =========================================================================
// 3. TEAM BUILDER & POKEDEX
// =========================================================================

function clearAll() {
  state.self = Array(6).fill(null);
  state.enemy = Array(6).fill(null);
  
  // SOLUCIÓN: Vaciar los arrays de leads y reiniciar activos
  state.leads = { self: [], enemy: [] };
  state.activeSelfSlots = [0, 1];
  state.activeEnemySlots = [0, 1];
  
  quickMode.resetQuickCombosLock();
  
  recalculateActiveField();
  renderAll();
}

function swapTeams() {
  const temp = state.self;
  state.self = state.enemy;
  state.enemy = temp;
  
  // SOLUCIÓN: Intercambiar también las elecciones de Turno 1 y Expert
  const tempLeads = state.leads.self;
  state.leads.self = state.leads.enemy;
  state.leads.enemy = tempLeads;
  
  const tempActive = state.activeSelfSlots;
  state.activeSelfSlots = state.activeEnemySlots;
  state.activeEnemySlots = tempActive;
  
  quickMode.resetQuickCombosLock();
  
  recalculateActiveField();
  renderAll();
}


async function fillMetaPreset(side) {
  const top = state.metaRanked
    .slice(side === "self" ? 0 : 6, side === "self" ? 6 : 12)
    .map((x) => x.slug);
  if (!top.length) {
    alert("Meta no disponible todavía.");
    return;
  }
  await fillTeamWithSpecies(side, top);
}

function getPokemonUtilityFlags(mon) {
  const set = mon?.set || {};
  const moves = set.moves || [];
  const ability = set.ability || "";
  return {
    fakeOut: moves.includes("Fake Out"),
    tailwind: moves.includes("Tailwind"),
    trickRoom: moves.includes("Trick Room"),
    redirection: moves.includes("Follow Me") || moves.includes("Rage Powder"),
    protect: moves.includes("Protect") || moves.includes("Detect"),
    weather: ["Drizzle", "Drought", "Sand Stream", "Snow Warning"].includes(
      ability,
    ),
    pivot:
      moves.includes("U-turn") ||
      moves.includes("Volt Switch") ||
      moves.includes("Parting Shot"),
    intimidate: ability === "Intimidate",
  };
}

function scorePokemonForQuickPick(mon, enemyTeam) {
  let score = 50;
  const flags = getPokemonUtilityFlags(mon);

  if (flags.fakeOut) score += 15;
  if (flags.tailwind) score += 10;
  if (flags.redirection) score += 10;
  if (flags.weather) score += 10;
  if (flags.intimidate) score += 15;

  const enemy = enemyTeam.filter(Boolean);
  let strongHits = 0;
  let weakHits = 0;

  for (const e of enemy) {
    const attack = bestAttack(mon, e);
    if (attack.mult >= 2) strongHits++;
    else if (attack.mult < 1) weakHits++;

    const defense = bestAttack(e, mon);
    if (defense.mult >= 2) score -= 10;
    else if (defense.mult < 1) score += 5;
  }

  score += strongHits * 12;
  score -= weakHits * 5;

  return score;
}

function scoreLeadPair(monA, monB, enemyTeam) {
  return scoreLeadPairQuick(monA, monB, enemyTeam);
}

function scoreLeadPairQuick(monA, monB, enemyTeam) {
  let score =
    scorePokemonForQuickPick(monA, enemyTeam) +
    scorePokemonForQuickPick(monB, enemyTeam);
  const flagsA = getPokemonUtilityFlags(monA);
  const flagsB = getPokemonUtilityFlags(monB);

  if (
    (flagsA.fakeOut && flagsB.tailwind) ||
    (flagsB.fakeOut && flagsA.tailwind)
  )
    score += 20;
  if (
    (flagsA.fakeOut && flagsB.trickRoom) ||
    (flagsB.fakeOut && flagsA.trickRoom)
  )
    score += 20;
  if (
    (flagsA.redirection && !flagsB.redirection) ||
    (flagsB.redirection && !flagsA.redirection)
  )
    score += 15;
  if (flagsA.intimidate || flagsB.intimidate) score += 10;
  if (flagsA.weather || flagsB.weather) score += 5;

  if (flagsA.fakeOut && flagsB.fakeOut) score -= 15;
  if (flagsA.tailwind && flagsB.tailwind) score -= 15;

  return score;
}

export function calculateMvpScore(mon, selfTeam, enemyTeam) {
  let score = 0;
  let offensiveCount = 0;
  let isDefensiveWall = true;

  for (const enemyMon of enemyTeam) {
    if (!enemyMon) continue;

    if (bestAttack(mon, enemyMon).mult >= 2) {
      offensiveCount++;
    }

    // FIX: Invertir roles correctamente y verificar si el enemigo tiene amenaza real
    const enemyAttack = bestAttack(enemyMon, mon);
    if (enemyAttack.mult >= 2) {
      isDefensiveWall = false;
    }
  }

  if (offensiveCount >= 2) score += 10; // FIX: Flexibilizado a 2 presiones fuertes para detectar más MVPs
  if (isDefensiveWall) score += 15;
  return score;
}

export function getSelfCombos() {
  const team = state.self.map((mon, idx) => mon ? idx : null).filter(i => i !== null);
  if (team.length < 4) return [];
  const combos = [];
  for (let a = 0; a < team.length - 3; a++) {
    for (let b = a + 1; b < team.length - 2; b++) {
      for (let c = b + 1; c < team.length - 1; c++) {
        for (let d = c + 1; d < team.length; d++) {
          combos.push([team[a], team[b], team[c], team[d]]);
        }
      }
    }
  }
  return combos;
}

function scoreAntiStrategy(selfMons, enemyMons) {
  const enemyStrategies = inferStrategies(enemyMons);
  let score = 0;
  let notes = [];

  for (const strat of enemyStrategies) {
    if (strat.title === "Trick Room") {
      if (hasMoveInTeam(selfMons, ["Taunt", "Mofa", "Imprison"]) || selfMons.some(m => calculateSpeed(m, 'self') < 60)) {
        score += 20;
        notes.push("Frena Espacio Raro");
      } else {
        score -= 10;
      }
    }
    if (strat.title === "Viento Afín") {
      if (hasMoveInTeam(selfMons, ["Tailwind", "Trick Room", "Icy Wind", "Onda Trueno", "Viento Afín"])) {
        score += 15;
        notes.push("Compite en Tempo");
      }
    }
    if (strat.title === "Lluvia" || strat.title === "Sol" || strat.title === "Arena") {
      if (hasMoveInTeam(selfMons, ["Rain Dance", "Sunny Day", "Sandstorm", "Snowscape", "Danza Lluvia", "Día Soleado", "Tormenta Arena"]) ||
          selfMons.some(m => ["Drizzle", "Drought", "Sand Stream", "Snow Warning", "Cloud Nine", "Llovizna", "Sequía", "Chorro Arena", "Nevada"].includes(m.set?.ability))) {
        score += 25;
        notes.push("Interrumpe Clima");
      }
    }
    if (strat.title === "Soporte" || strat.title === "Pivot") {
      if (hasMoveInTeam(selfMons, ["Fake Out", "Sorpresa", "Protect", "Protección"])) {
        score += 10;
        notes.push("Frena Setup Inicial");
      }
    }
  }
  return { score, notes };
}

export function scoreEnemyThreatVsCombo(enemyMon, comboMons) {
  if (!comboMons.length) return { score: 0, maxEnemyPressure: 1 };
  const enemyVsSelf = comboMons.map(selfMon => bestAttack(enemyMon, selfMon));
  const maxEnemyPressure = Math.max(...enemyVsSelf.map(x => x.mult), 1);
  const strongAnswers = comboMons.filter(selfMon => bestAttack(selfMon, enemyMon).mult >= 2);

  const setMoves = enemyMon?.set?.moves || [];
  let score = 30;

  score += maxEnemyPressure >= 4 ? 28 : maxEnemyPressure >= 2 ? 16 : 6;
  if (setMoves.includes("Tailwind") || setMoves.includes("Viento Afín")) score += 14;
  
  if (setMoves.includes("Trick Room") || setMoves.includes("Espacio Raro")) {
    const isBeneficialForUs = comboMons.some(m => {
      const bSpe = m.baseStats?.speed || 100;
      const bAtk = m.baseStats?.attack || 0;
      const bSpa = m.baseStats?.["special-attack"] || 0;
      return bSpe <= 60 && (bAtk >= 90 || bSpa >= 90);
    });
    
    if (isBeneficialForUs) {
       score -= 10; // Sinergia por robo de campo, reducimos el peligro del enemigo
    } else {
       score += 14;
    }
  }

  if (setMoves.includes("Fake Out") || setMoves.includes("Sorpresa")) score += 10;
  if (setMoves.includes("Follow Me") || setMoves.includes("Rage Powder") || setMoves.includes("Señuelo") || setMoves.includes("Polvo Ira")) score += 10;
  if (setMoves.includes("Parting Shot") || setMoves.includes("Snarl") || setMoves.includes("Encore") || setMoves.includes("Última Palabra") || setMoves.includes("Alarido") || setMoves.includes("Otra Vez")) score += 8;
  if ((enemyMon.set?.ability || "").includes("Intimidat") || (enemyMon.set?.ability || "").includes("Intimidac")) score += 8;

  score -= Math.min(18, strongAnswers.length * 7);
  if (strongAnswers.some(x => bestAttack(x, enemyMon).mult >= 4)) score -= 6;

  return { score: Math.max(0, Math.min(100, score)), maxEnemyPressure };
}

let lastTeamHash = '';
let cachedQuickCombos = [];

export function buildQuickCombos() {
  window.comboSpeedCache = {};
  const teamHash = state.self.map(m => m ? m.name : '').join('|') + 'VS' + state.enemy.map(m => m ? m.name : '').join('|');
  if (teamHash === lastTeamHash && cachedQuickCombos.length > 0) {
    if (DEBUG_MODE) console.log('⚡ [QUICK COMBOS] Usando caché de combinaciones.');
    return cachedQuickCombos;
  }

  if (DEBUG_MODE) console.groupCollapsed('🤖 [QUICK COMBOS] Seleccionando Top 3 recomendaciones');

  if (!state.combos || state.combos.length === 0) {
      if (DEBUG_MODE) console.groupEnd();
      return [];
  }

  const selected = [];
  const usedLeads = new Set();

  for (const combo of state.combos) {
    const mons = combo.orderedIdx ? combo.orderedIdx.map(i => state.self[i]).filter(Boolean) : combo.indices.map(i => state.self[i]).filter(Boolean);
    if (mons.length < 2) continue;

    const leadSig = [mons[0].name, mons[1].name].sort().join('-');

    if (usedLeads.has(leadSig)) {
      if (DEBUG_MODE) console.log(`⏭️ Descartado: ${mons.map(m=>m.displayName).join(', ')} (leads ${mons[0].displayName} + ${mons[1].displayName} ya usados).`);
      continue;
    }

    selected.push(combo);
    usedLeads.add(leadSig);
    
    if (selected.length === 3) break;
  }

  if (selected.length < 3) {
    if (DEBUG_MODE) console.log('⚠️ No se encontraron 3 combos con leads únicos. Rellenando con los siguientes mejores.');
    for (const combo of state.combos) {
      if (!selected.includes(combo)) selected.push(combo);
      if (selected.length === 3) break;
    }
  }

  if (DEBUG_MODE) {
    console.log(`✅ Selección finalizada. Top 3 recomendaciones listas.`);
    console.groupEnd();
  }

  lastTeamHash = teamHash;
  cachedQuickCombos = selected;
  return selected;
}

function hasMoveInTeam(team, moveNames) {
  const target = new Set(moveNames.map(m => String(m).toLowerCase()));
  return team.some(mon =>
    mon?.set?.moves?.some(m => target.has(String(m).toLowerCase()))
  );
}

function scoreOffensiveCoverage(selfMons, enemyMons) {
  if (!enemyMons.length) return 0;

  let totalThreat = 0;
  let maxPossible = enemyMons.length * 100;

  for (const enemy of enemyMons) {
    let best = null;
    for (const selfMon of selfMons) {
      const res = bestAttack(selfMon, enemy);
      if (!best || res.damage > best.damage) best = res;
    }
    if (!best) continue;

    let score = 0;
    if (best.mult >= 2) score += 40;
    if (best.mult >= 4) score += 20;
    score += Math.min(40, best.ohkoProb * 0.4);

    totalThreat += score;
  }

  return Math.round((totalThreat / maxPossible) * 100);
}

function scoreDefensiveSafety(selfMons, enemyMons) {
  if (!enemyMons.length) return 0;

  let total = 0;
  const max = selfMons.length * 100;

  for (const selfMon of selfMons) {
    let worst = null;
    for (const enemy of enemyMons) {
      const res = bestAttack(enemy, selfMon);
      if (!worst || res.damage > worst.damage) worst = res;
    }
    if (!worst) continue;

    let score = 100;
    if (worst.mult >= 2) score -= 30;
    if (worst.mult >= 4) score -= 50;
    if (worst.ohkoProb >= 50) score -= 30;
    if (worst.ohkoProb >= 90) score -= 20;

    total += Math.max(0, score);
  }

  return Math.round((total / max) * 100);
}

function scoreSpeedAndTempo(selfMons, enemyMons) {
  const selfSpeeds  = selfMons.map(m => calculateSpeed(m, 'self')).sort((a,b)=>b-a);
  const enemySpeeds = enemyMons.map(m => calculateSpeed(m, 'enemy')).sort((a,b)=>b-a);

  if (!selfSpeeds.length || !enemySpeeds.length) return 0;

  const fastestEnemy = enemySpeeds[0];
  const outspeeders = selfSpeeds.filter(s => s > fastestEnemy).length;
  let score = (outspeeders / selfSpeeds.length) * 60;

  if (hasMoveInTeam(selfMons, ['Tailwind', 'Viento Afín'])) score += 20;
  if (hasMoveInTeam(selfMons, ['Trick Room', 'Espacio Raro'])) score += 20;
  if (hasMoveInTeam(selfMons, ['Thunder Wave', 'Icy Wind', 'Onda Trueno', 'Viento Hielo'])) score += 10;

  return Math.round(Math.min(100, score));
}

function scoreTools(selfMons) {
  let score = 0;

  if (hasMoveInTeam(selfMons, TOOL_GROUPS.fakeOut))      score += 25;
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.redir))        score += 25;
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.pivot))        score += 20;
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.protections))  score += 15;
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.statusCtrl))   score += 15;

  const protectUsers = selfMons.filter(m =>
    m?.set?.moves?.some(x => ['protect', 'protección', 'detect', 'detección'].includes(String(x).toLowerCase()))
  ).length;
  score += Math.min(20, protectUsers * 7);

  return Math.round(Math.min(100, score));
}

function scoreRedundancyPenalty(selfMons, enemyMons) {
  const weaknessCount = new Map();

  for (const selfMon of selfMons) {
    const types = selfMon.types || [];
    for (const attackType in TYPE_CHART) {
      const mult = effectiveness(attackType, types);
      if (mult >= 2) {
        weaknessCount.set(attackType, (weaknessCount.get(attackType) || 0) + 1);
      }
    }
  }

  let penalty = 0;
  for (const [type, count] of weaknessCount.entries()) {
    if (count >= 3) penalty += 15;
    else if (count === 2) penalty += 5;
  }

  for (const enemy of enemyMons) {
    const enemyMoves = enemy.set?.moves || [];
    for (const moveName of enemyMoves) {
      const moveId = String(moveName).toLowerCase().replace(/[^a-z0-9]/g, '');
      const moveData = typeof MOVES_DB !== 'undefined' ? MOVES_DB[moveId] : null;
      if (moveData && weaknessCount.get(moveData.type) >= 2) {
        penalty += 5;
      }
    }
  }

  return penalty;
}

export function classifyTeamRoles(selfMons) {
  const roles = new Map();

  const baseScore = typeof scoreBoard === 'function' ? scoreBoard(state, 'self') : 0;

  for (const mon of selfMons) {
    if (!mon) continue;
    // "Quitar" mon del equipo y ver cuánto empeora el tablero
    const tmpState = cloneSimulationState(state);
    const tmpSelf = tmpState.self;
    const idx = tmpSelf.findIndex((m) => m && m.name === mon.name);
    if (idx !== -1) {
      tmpSelf[idx] = null;
    }
    const newScore = typeof scoreBoard === 'function' ? scoreBoard(tmpState, 'self') : 0;
    const delta = baseScore - newScore;

    // delta grande -> wincon; delta pequeño -> redundante
    let role = 'glue';
    if (delta >= 2000) role = 'wincon';
    else if (delta <= 200) role = 'redundante';

    roles.set(mon, { role, impact: delta });
  }

  return roles;
}

function derivePlanType(m) {
  const { offCoverage, defSafety, speedControl, toolsScore, redundancyPen } = m;

  if (offCoverage >= 75 && speedControl >= 60 && defSafety < 55) {
    return 'agresivo';
  }
  if (defSafety >= 75 && offCoverage < 65) {
    return 'defensivo';
  }
  if (speedControl >= 70 && toolsScore >= 60) {
    return 'tempo';
  }
  if (redundancyPen >= 30 && defSafety < 60) {
    return 'riesgoso';
  }
  return 'balanceado';
}

function getTeamWeakTypes(selfMons) {
  const weaknessCount = new Map();
  for (const mon of selfMons) {
    const types = mon.types || [];
    for (const atk in TYPE_CHART) {
      if (effectiveness(atk, types) >= 2) {
        weaknessCount.set(atk, (weaknessCount.get(atk) || 0) + 1);
      }
    }
  }
  return Array.from(weaknessCount.entries())
    .sort((a,b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type]) => TYPE_META[type]?.name || type);
}

function getTeamStrongVsEnemy(selfMons, enemyMons) {
  const strongTargets = [];
  for (const enemy of enemyMons) {
    for (const selfMon of selfMons) {
      const best = bestAttack(selfMon, enemy);
      if (best.mult >= 2 || best.ohko) {
        strongTargets.push(enemy.displayName);
        break;
      }
    }
  }
  return [...new Set(strongTargets)].slice(0, 2);
}

function derivePlanText(planType, metrics, selfMons, enemyMons) {
  const weakTypes = getTeamWeakTypes(selfMons);
  const strongTargets = getTeamStrongVsEnemy(selfMons, enemyMons);

  const strongStr = strongTargets.length
    ? `Presionas especialmente bien a ${strongTargets.join(' y ')}.`
    : `Tienes opciones razonables contra la mayoría de amenazas rivales.`;

  const weakStr = weakTypes.length
    ? `Cuidado con ataques de tipo ${weakTypes.join(' y ')}.`
    : `No compartes debilidades graves entre tus cuatro Pokémon.`;

  let toolsList = [];
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.fakeOut)) toolsList.push('Fake Out');
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.redir)) toolsList.push('Redirección');
  if (hasMoveInTeam(selfMons, ['Tailwind', 'Viento Afín'])) toolsList.push('Tailwind');
  if (hasMoveInTeam(selfMons, ['Trick Room', 'Espacio Raro'])) toolsList.push('Trick Room');
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.pivot)) toolsList.push('Pivot');
  const toolsStr = toolsList.length ? `[${toolsList.join('], [')}]` : 'Sin utilidad destacada';

  switch (planType) {
    case 'agresivo':
      return {
        planTitle: 'Plan: Abrir pegando fuerte.',
        planDescription: `${strongStr} Tu defensa es más frágil, así que busca trades ventajosos en los primeros turnos.`,
        keyLine: 'Clave: No regales turnos; fuerza intercambios donde ganes el tempo.',
        toolsStr
      };
    case 'defensivo':
      return {
        planTitle: 'Plan: Absorber y castigar.',
        planDescription: `${weakStr} Juega alrededor de las amenazas clave y aprovecha tus resistencias para entrar y salir.`,
        keyLine: 'Clave: Prioriza Protect y cambios seguros antes de exponerte a OHKOs.',
        toolsStr
      };
    case 'tempo':
      return {
        planTitle: 'Plan: Controlar el tempo de la partida.',
        planDescription: `Tu combinación tiene buen acceso a control de velocidad. Establece Tailwind o Trick Room y luego presiona con tus breakers.`,
        keyLine: 'Clave: Usa el primer turno para fijar el ritmo (TW/TR) en lugar de buscar daño bruto.',
        toolsStr
      };
    case 'riesgoso':
      return {
        planTitle: 'Plan: Presión alta con riesgo elevado.',
        planDescription: `${strongStr} Sin embargo, ${weakStr.toLowerCase()}`,
        keyLine: 'Clave: Evita situaciones donde el rival pueda explotar tus debilidades compartidas.',
        toolsStr
      };
    default:
      return {
        planTitle: 'Plan: Presión equilibrada desde el turno 1.',
        planDescription: `${strongStr} ${weakStr}`,
        keyLine: 'Clave: Alterna turnos agresivos con turnos de protección y reposicionamiento.',
        toolsStr
      };
  }
}

export function evaluateCombo(indices) {
  const selfMons = indices.map(i => state.self[i]).filter(Boolean);
  const enemyMons = state.enemy.filter(Boolean);
  if (selfMons.length < 4 || !enemyMons.length) {
    return {
      indices,
      score: 0,
      planType: 'desconocido',
      planTitle: 'Datos insuficientes',
      planDescription: 'Añade 4 Pokémon propios y al menos 1 rival.',
      keyLine: '',
      toolsStr: ''
    };
  }

  // Inferencia de la Mejor Respuesta Rival (Micro-Simulación)
  const enemyThreats = enemyMons.map(enemy => ({
    enemy,
    threat: scoreEnemyThreatVsCombo(enemy, selfMons).score
  })).sort((a, b) => b.threat - a.threat);
  
  const expectedEnemyTeam = enemyThreats.slice(0, 4).map(e => e.enemy);
  if (!expectedEnemyTeam.length) expectedEnemyTeam.push(...enemyMons); // Fallback

  // Pre-seleccionamos nuestros leads contra el equipo previsto
  const comboTemp = { indices };
  chooseLeadsForCombo(comboTemp, expectedEnemyTeam);
  const selfLeads = comboTemp.leads.map(i => state.self[i]).filter(Boolean);
  const selfBacks = comboTemp.orderedIdx.slice(2).map(i => state.self[i]).filter(Boolean);

  // Inferimos probables leads rivales (los 2 más amenazantes) y backs
  const enemyLeads = expectedEnemyTeam.slice(0, 2);
  const enemyBacks = expectedEnemyTeam.slice(2, 4);

  // Clón del campo para la simulación de este combo
  const simField = { ...state.field };

  // Función interna rápida para aplicar climas/terrenos de entrada
  const applyEntryHazards = (mon) => {
      if (!mon) return;
      const ability = (mon.set?.ability || mon.ability || '').toLowerCase().replace(/\\s/g, '');
      if (ability === 'drought') simField.weather = 'sun';
      if (ability === 'drizzle') simField.weather = 'rain';
      if (ability === 'sandstream') simField.weather = 'sandstorm';
      if (ability === 'snowwarning') simField.weather = 'snow';
      if (ability === 'psychicsurge') simField.terrain = 'psychic';
      if (ability === 'grassysurge') simField.terrain = 'grassy';
      if (ability === 'electricsurge') simField.terrain = 'electric';
      if (ability === 'mistysurge') simField.terrain = 'misty';
  };

  // Aplicar a los 4 Pokémon en el campo
  applyEntryHazards(selfLeads[0]);
  applyEntryHazards(selfLeads[1]);
  applyEntryHazards(enemyLeads[0]);
  applyEntryHazards(enemyLeads[1]);

  // Flags para estrategias
  const selfHasTailwind = hasMoveInTeam(selfMons, ['Tailwind', 'Viento Afín']);
  const enemyHasTailwind = hasMoveInTeam(expectedEnemyTeam, ['Tailwind', 'Viento Afín']);
  const selfHasTR = hasMoveInTeam(selfMons, ['Trick Room', 'Espacio Raro']);
  const enemyHasTR = hasMoveInTeam(expectedEnemyTeam, ['Trick Room', 'Espacio Raro']);
  const enemyHasFakeOut = hasMoveInTeam(expectedEnemyTeam, ['Fake Out', 'Sorpresa']);
  const selfHasProtect = hasMoveInTeam(selfMons, ['Protect', 'Protección']);
  const selfHasCloak = selfMons.some(m => m.set?.item === 'Covert Cloak' || m.set?.item === 'Capa Furtiva');
  const enemyHasWeather = expectedEnemyTeam.some(m => m.set?.ability && ['Drizzle', 'Drought', 'Sand Stream', 'Snow Warning', 'Llovizna', 'Sequía', 'Chorro Arena', 'Nevada'].includes(m.set.ability));

  const SPREAD_MOVES = new Set(['earthquake', 'terremoto', 'dazzling gleam', 'brillo mágico', 'make it rain', 'fiebre dorada', 'rock slide', 'avalancha', 'water spout', 'salpicar', 'eruption', 'estallido', 'heat wave', 'onda ígnea', 'hyper voice', 'vozarrón', 'blizzard', 'ventisca', 'muddy water', 'agua lodosa', 'discharge', 'chispazo', 'icy wind', 'viento hielo', 'snarl', 'alarido', 'electroweb', 'red viscosa']);
  const SETUP_MOVES = new Set(['swords dance', 'danza espada', 'nasty plot', 'maquinación', 'dragon dance', 'danza dragón', 'quiver dance', 'danza aleteo', 'calm mind', 'paz mental', 'tailwind', 'viento afín', 'trick room', 'espacio raro']);

  // 1. Calcular Puntuación Neta Diferencial (Net Matchup Score)
  let allyThreat = 0;
  let enemyThreat = 0;
  let criticalRiskText = null;
  let isDeadTurn1 = false;
  let spreadWarning = null;
  let defaultStrategyParts = [];
  const t1SimCache = { field: simField, attacks: {} };

  // 1. APLICAR FASE DE ENTRADA AL SIMFIELD ANTES DE NADA
  const simFieldLocal = { ...state.field };
  const applyHazards = (mon) => {
      if (!mon) return;
      const ab = (mon.set?.ability || mon.ability || mon.baseSpecies?.ability || '').toLowerCase().replace(/[^a-z]/g, '');
      if (ab === 'drought' || mon.name.toLowerCase().includes('charizardmegay')) simFieldLocal.weather = 'sun';
      if (ab === 'drizzle' || mon.name.toLowerCase().includes('pelipper')) simFieldLocal.weather = 'rain';
      if (ab === 'psychicsurge') simFieldLocal.terrain = 'psychic';
  };
  selfLeads.forEach(applyHazards);
  enemyLeads.forEach(applyHazards);

  selfLeads.forEach(sLead => {
    let sLeadSpeedNum = Number(calculateSpeed(sLead, 'self', simFieldLocal)) || 0;
    if (selfHasTailwind) sLeadSpeedNum *= 2;

    let bestSingleTargetThreat = 0;
    let spreadThreat = 0;
    let chosenAtkOnEnemy = null;
    let chosenELead = null;

    const sAttacks = enemyLeads.map(eLead => {
      let eLeadSpeedNum = Number(calculateSpeed(eLead, 'enemy', simFieldLocal)) || 0;
      if (enemyHasTailwind) eLeadSpeedNum *= 2;

      const otherELead = enemyLeads.find(m => m !== eLead);
      let otherELeadRedirects = false;
      if (otherELead) {
          const otherAtkOnAlly = bestAttack(otherELead, sLead, simFieldLocal);
          otherELeadRedirects = ['followme', 'ragepowder', 'señuelo', 'polvoira'].includes(String(otherAtkOnAlly.move).toLowerCase().replace(/[^a-z]/g, ''));
      }

      let atkOnEnemy = bestAttack(sLead, eLead, simFieldLocal);
      t1SimCache.attacks[`self_${sLead.name}_vs_enemy_${eLead.name}`] = atkOnEnemy;

      const isSpread = atkOnEnemy.move && (isCanonicalSpreadMove(atkOnEnemy.move) || SPREAD_MOVES.has(String(atkOnEnemy.move).toLowerCase().replace(/[^a-z0-9]/g, '')));

      if (otherELeadRedirects && !isSpread) {
          const cand = getMoveCandidates(sLead).find(m => m.move === atkOnEnemy.move) || atkOnEnemy;
          const redirDmg = estimateMoveDamage(sLead, otherELead, cand, simFieldLocal);
          atkOnEnemy = { ...atkOnEnemy, damage: redirDmg.damage, mult: 0.5, ohko: redirDmg.damage >= calcMonHP(otherELead) };
      }

      let threatVal = 0;
      if (atkOnEnemy.mult >= 2) threatVal += 15;
      else if (atkOnEnemy.mult >= 1) threatVal += 5;
      if (atkOnEnemy.ohko) threatVal += 10;

      return { eLead, eLeadSpeedNum, atkOnEnemy, isSpread, threatVal };
    });

    // Separamos spread y single target para Ally
    const sSpread = sAttacks.filter(a => a.isSpread);
    if (sSpread.length > 0) {
      const moveGroups = {};
      sSpread.forEach(a => {
        const m = a.atkOnEnemy.move;
        if (!moveGroups[m]) moveGroups[m] = { val: 0, attacks: [] };
        moveGroups[m].val += a.threatVal;
        moveGroups[m].attacks.push(a);
      });
      let maxSpreadVal = -1;
      for (const m in moveGroups) {
        if (moveGroups[m].val > maxSpreadVal) {
           maxSpreadVal = moveGroups[m].val;
           spreadThreat = maxSpreadVal;
           chosenAtkOnEnemy = moveGroups[m].attacks[0].atkOnEnemy;
           chosenELead = moveGroups[m].attacks[0].eLead;
        }
      }
    }

    const sSingle = sAttacks.filter(a => !a.isSpread);
    if (sSingle.length > 0) {
      sSingle.sort((a,b) => b.threatVal - a.threatVal);
      bestSingleTargetThreat = sSingle[0].threatVal;
      if (bestSingleTargetThreat > spreadThreat || !chosenAtkOnEnemy) {
        chosenAtkOnEnemy = sSingle[0].atkOnEnemy;
        chosenELead = sSingle[0].eLead;
      }
    }

    allyThreat += Math.max(bestSingleTargetThreat, spreadThreat);

    if (chosenAtkOnEnemy && chosenELead) {
      const isAllySpread = chosenAtkOnEnemy.move && (isCanonicalSpreadMove(chosenAtkOnEnemy.move) || SPREAD_MOVES.has(String(chosenAtkOnEnemy.move).toLowerCase()));
      if (isAllySpread && chosenAtkOnEnemy.ohko && !spreadWarning) {
         spreadWarning = `El KO de ${sLead.displayName || sLead.name} depende de daño en área (${chosenAtkOnEnemy.move}), que se reduce un 25% en Dobles.`;
      }
      if (chosenAtkOnEnemy.mult >= 2) {
         defaultStrategyParts.push(`Nuestro ${formatName(sLead.displayName || sLead.name)} frena a su ${formatName(chosenELead.displayName || chosenELead.name)} con daño x${chosenAtkOnEnemy.mult}.`);
      }
    }
  });

  enemyLeads.forEach(eLead => {
    let eLeadSpeedNum = Number(calculateSpeed(eLead, 'enemy', simFieldLocal)) || 0;
    if (enemyHasTailwind) eLeadSpeedNum *= 2;

    let bestSingleTargetThreat = 0;
    let spreadThreat = 0;
    let worstAttackOnUs = null;

    const eAttacks = selfLeads.map(sLead => {
      let sLeadSpeedNum = Number(calculateSpeed(sLead, 'self', simFieldLocal)) || 0;
      if (selfHasTailwind) sLeadSpeedNum *= 2;

      let atkOnAlly = bestAttack(eLead, sLead, simFieldLocal);
      const isSpread = atkOnAlly.move && (isCanonicalSpreadMove(atkOnAlly.move) || SPREAD_MOVES.has(String(atkOnAlly.move).toLowerCase().replace(/[^a-z0-9]/g, '')));

      let threatVal = 0;
      if (atkOnAlly.mult >= 2) threatVal += 15;
      else if (atkOnAlly.mult >= 1) threatVal += 5;
      if (atkOnAlly.ohko) threatVal += 10;

      return { sLead, sLeadSpeedNum, atkOnAlly, isSpread, threatVal };
    });

    const eSpread = eAttacks.filter(a => a.isSpread);
    if (eSpread.length > 0) {
      const moveGroups = {};
      eSpread.forEach(a => {
        const m = a.atkOnAlly.move;
        if (!moveGroups[m]) moveGroups[m] = { val: 0, attacks: [] };
        moveGroups[m].val += a.threatVal;
        moveGroups[m].attacks.push(a);
      });
      let maxSpreadVal = -1;
      for (const m in moveGroups) {
        if (moveGroups[m].val > maxSpreadVal) {
           maxSpreadVal = moveGroups[m].val;
           spreadThreat = maxSpreadVal;
           worstAttackOnUs = moveGroups[m].attacks[0];
        }
      }
    }

    const eSingle = eAttacks.filter(a => !a.isSpread);
    if (eSingle.length > 0) {
      eSingle.sort((a,b) => b.threatVal - a.threatVal);
      bestSingleTargetThreat = eSingle[0].threatVal;
      if (bestSingleTargetThreat > spreadThreat || !worstAttackOnUs) {
        worstAttackOnUs = eSingle[0];
      }
    }

    enemyThreat += Math.max(bestSingleTargetThreat, spreadThreat);

    if (worstAttackOnUs) {
      const { sLead, sLeadSpeedNum, atkOnAlly } = worstAttackOnUs;

      const getPrio = (moveObj) => {
          if (!moveObj || !moveObj.move) return 0;
          return getPriority(moveObj.move);
      };

      const sPriority = getPrio(bestAttack(sLead, eLead, simFieldLocal));
      const ePriority = getPrio(atkOnAlly);

      let enemyIsFaster = false;
      if (ePriority > sPriority) {
          enemyIsFaster = true;
      } else if (sPriority > ePriority) {
          enemyIsFaster = false;
      } else {
          enemyIsFaster = eLeadSpeedNum > sLeadSpeedNum;
      }

      smartLog(
          `prio-${sLead.name}-${eLead.name}`,
          `⚖️ [PRIORITY CHECK] Aliado: ${sLead.name} (Vel:${sLeadSpeedNum}, Prio:${sPriority}) vs Rival: ${eLead.name} (Vel:${eLeadSpeedNum}, Prio:${ePriority}) => Ataca Primero: ${enemyIsFaster ? 'RIVAL' : 'ALIADO'}`
      );

      const sLeadMoves = (sLead.set?.moves || []).map(m => m.toLowerCase().replace(/[^a-z]/g, ''));
      const hasProtect = sLeadMoves.includes('protect') || sLeadMoves.includes('proteccion');
      const hasFakeOut = sLeadMoves.includes('fakeout') || sLeadMoves.includes('sorpresa');

      if (enemyIsFaster && atkOnAlly.ohko) {
          if (hasProtect) {
              allyThreat += 15;
              defaultStrategyParts.push(`El rival amenaza a ${sLead.displayName || sLead.name}, pero tenemos Protección para ganar la posición.`);
              atkOnAlly.ohko = false;
          } else if (hasFakeOut) {
              allyThreat += 20;
              defaultStrategyParts.push(`Usa Sorpresa con ${sLead.displayName || sLead.name} para neutralizar a la amenaza rival el Turno 1.`);
              atkOnAlly.ohko = false;
          } else {
              isDeadTurn1 = true;
              enemyThreat += 50; // Penalización masiva
              if (!criticalRiskText) {
                  criticalRiskText = `Riesgo Crítico: ${formatName(eLead.displayName || eLead.name)} supera en velocidad y elimina a ${formatName(sLead.displayName || sLead.name)}.`;
              }
          }
      }
    }
  });

  // 2. Sumar resistencia defensiva de Backs vs atacantes rivales
  let backDefenseScore = 0;
  selfBacks.forEach(sBack => {
    expectedEnemyTeam.forEach(eAtk => {
      const eAtkMove = bestAttack(eAtk, sBack);
      if (eAtkMove.mult < 1) backDefenseScore += 10; // resiste bien
      else if (eAtkMove.mult === 1) backDefenseScore += 2; // neutral
      else backDefenseScore -= 5; // débil
    });
  });

  // 3. Sinergia de Roles en Dobles
  let synergyScore = 0;
  let synergyText = null;

  if (selfLeads.length === 2) {
    const [lead1, lead2] = selfLeads;
    const hasFakeOut1 = (lead1.set?.moves || []).some(m => String(m).toLowerCase() === 'fake out' || String(m).toLowerCase() === 'sorpresa');
    const hasFakeOut2 = (lead2.set?.moves || []).some(m => String(m).toLowerCase() === 'fake out' || String(m).toLowerCase() === 'sorpresa');
    const hasSetup1 = (lead1.set?.moves || []).some(m => SETUP_MOVES.has(String(m).toLowerCase())) || (lead1.baseStats?.attack >= 120 || lead1.baseStats?.['special-attack'] >= 120);
    const hasSetup2 = (lead2.set?.moves || []).some(m => SETUP_MOVES.has(String(m).toLowerCase())) || (lead2.baseStats?.attack >= 120 || lead2.baseStats?.['special-attack'] >= 120);

    if ((hasFakeOut1 && hasSetup2) || (hasFakeOut2 && hasSetup1)) {
       synergyScore += 20;
       const foUser = hasFakeOut1 ? lead1 : lead2;
       const setupUser = hasFakeOut1 ? lead2 : lead1;
       synergyText = `Usa Sorpresa con ${foUser.displayName || foUser.name} para asegurar el ataque/setup de ${setupUser.displayName || setupUser.name}.`;
    }

    const redirMoves = ['follow me', 'señuelo', 'rage powder', 'polvo ira'];
    const hasRedir1 = (lead1.set?.moves || []).some(m => redirMoves.includes(String(m).toLowerCase()));
    const hasRedir2 = (lead2.set?.moves || []).some(m => redirMoves.includes(String(m).toLowerCase()));
    
    if (hasRedir1 || hasRedir2) {
       const redirUser = hasRedir1 ? lead1 : lead2;
       const protectedUser = hasRedir1 ? lead2 : lead1;
       const isProtectedWeak = enemyLeads.some(eLead => bestAttack(eLead, protectedUser).mult >= 2);
       if (isProtectedWeak) {
          synergyScore += 25;
          if (!synergyText) synergyText = `Redirige ataques con ${redirUser.displayName || redirUser.name} para proteger la debilidad de ${protectedUser.displayName || protectedUser.name}.`;
       }
    }
  }

  const selfHasIntimidate = selfMons.some(m => m.set?.ability && (String(m.set.ability).toLowerCase() === 'intimidate' || String(m.set.ability).toLowerCase() === 'intimidación'));
  const enemyHasPhysical = expectedEnemyTeam.some(m => (m.baseStats?.attack || 0) > 90);
  if (selfHasIntimidate && enemyHasPhysical) {
     synergyScore += 15;
     if (!synergyText) synergyText = synergyText ? synergyText + ' Usa Intimidación para debilitar a sus atacantes físicos.' : `Usa Intimidación para ciclar y debilitar a los atacantes físicos rivales.`;
  }

  // Pivot check
  let pivotText = null;
  if (!isDeadTurn1) {
      const scaryEnemy = enemyLeads.find(eLead => selfLeads.some(sLead => bestAttack(eLead, sLead).mult >= 2));
      if (scaryEnemy) {
          const safeBack = selfBacks.find(sBack => bestAttack(scaryEnemy, sBack).mult < 1);
          if (safeBack) {
              pivotText = `Riesgo de ${scaryEnemy.displayName || scaryEnemy.name}, pero tenemos a ${safeBack.displayName || safeBack.name} en reserva para pivotar.`;
          }
      }
  }

  // Net Matchup Score
  let rawScore = 30 + (allyThreat - enemyThreat) + backDefenseScore + synergyScore;
  
  if (isDeadTurn1) {
    rawScore = -100; // Asegurar que NUNCA tenga score positivo ni entre al Top 3
  }

  // 4. Planes Tácticos Contextuales (Lectura de Movimientos)
  let planType = 'balanceado';
  let planTitle = 'Plan: Presión equilibrada desde el turno 1.';
  let planDescription = 'Juega alternando turnos agresivos y de reposicionamiento según el matchup.';
  let planStrategy = [];

  if (criticalRiskText) {
    planStrategy.push(criticalRiskText);
  } else {
    // Si no hay OHKOs rápidos, busca ventajas de campo y sinergias
    if (synergyText) planStrategy.push(synergyText);
    else if (pivotText) planStrategy.push(pivotText);
    else if (defaultStrategyParts.length > 0) {
      // Eliminar duplicados
      const uniqueParts = [...new Set(defaultStrategyParts)];
      planStrategy.push(uniqueParts.slice(0, 2).join(' Mientras '));
    }
    
    if (spreadWarning) planStrategy.push(spreadWarning);

    if (selfHasTailwind && !enemyHasTailwind) {
      planType = 'tempo';
      planTitle = 'Control de Velocidad (Viento Afín) + Presión Ofensiva';
      planDescription = 'Aprovecha tu ventaja de Tailwind para golpear primero y superar sus amenazas.';
      rawScore += 10;
    }
    
    if (enemyHasFakeOut) {
      if (selfHasProtect || selfHasCloak) {
        planStrategy.push('Protección Turno 1 para evitar Sorpresa.');
        rawScore += 5;
      } else {
        planStrategy.push('Cuidado con Sorpresa (Fake Out) rival.');
        rawScore -= 5;
      }
    }

    if (selfHasTR && enemyHasTR) {
      planType = 'trickroom_war';
      planTitle = 'Guerra de Espacio Raro (Matchup de Velocidad Lenta)';
      planDescription = 'Ambos equipos tienen Espacio Raro. Intenta denegar su activación o usarla a tu favor.';
      rawScore += 15; 
    } else if (selfHasTR && !enemyHasTR) {
      planType = 'trickroom';
      planTitle = 'Control de Velocidad (Espacio Raro)';
      planDescription = 'Usa Espacio Raro para revertir su ventaja de velocidad.';
      rawScore += 10;
    }

    if (enemyHasWeather && simField.weather) planStrategy.push(`Clima rival detectado: ${weatherNames[simField.weather] || simField.weather}.`);
    else if (enemyHasWeather) planStrategy.push('Clima rival detectado.');
  }

  const strategyText = planStrategy.join(' ');

  // A diferencia de antes, permitimos scores negativos para que el sort los hunda
  const finalScore = isDeadTurn1 ? -100 : Math.round(rawScore);

  if (DEBUG_MODE) {
    const allyNames = selfLeads.map(m => m.displayName || m.name).join('+');
    const enemyNames = expectedEnemyTeam.map(m => m.displayName || m.name).slice(0,2).join('+');
    console.log(`[EVAL] Aliados: ${allyNames} | VS Previsto: ${enemyNames} | Puntuación Real: ${finalScore} | Estrategia: ${strategyText || 'Matchup neutral'}`);
  }

  const combo = {
    indices,
    mons: selfMons,
    score: finalScore,
    planType,
    planTitle,
    planDescription,
    keyLine: strategyText,
    toolsStr: '',
    planIcon: 'scale',
    leads: comboTemp.leads,
    leadScore: comboTemp.leadScore,
    orderedIdx: comboTemp.orderedIdx,
    predictedEnemyLeads: enemyLeads,
    predictedEnemyBack: enemyBacks
  };

  return combo;
}

function scoreLeadPairForCombo(monA, monB, enemyTeam) {
  let score = scorePokemonForQuickPick(monA, enemyTeam) + scorePokemonForQuickPick(monB, enemyTeam);
  const flagsA = getPokemonUtilityFlags(monA);
  const flagsB = getPokemonUtilityFlags(monB);
  if ((flagsA.fakeOut && flagsB.tailwind) || (flagsB.fakeOut && flagsA.tailwind)) score += 20;
  if ((flagsA.fakeOut && flagsB.trickRoom) || (flagsB.fakeOut && flagsA.trickRoom)) score += 20;
  if ((flagsA.redirection && !flagsB.redirection) || (flagsB.redirection && !flagsA.redirection)) score += 15;
  if (flagsA.intimidate || flagsB.intimidate) score += 10;
  if (flagsA.weather || flagsB.weather) score += 5;
  if (flagsA.fakeOut && flagsB.fakeOut) score -= 15;
  if (flagsA.tailwind && flagsB.tailwind) score -= 15;
  return score;
}

function chooseLeadsForCombo(combo, enemyTeam) {
  const indices = combo.indices;
  let bestPair = [indices[0], indices[1]];
  let bestScore = -Infinity;
  const chosenMons = indices.map(i => state.self[i]);

  for (let i = 0; i < indices.length; i++) {
    for (let j = i+1; j < indices.length; j++) {
      const pair = [indices[i], indices[j]];
      const s = scoreLeadPairForCombo(chosenMons[i], chosenMons[j], enemyTeam);
      if (s > bestScore) {
        bestScore = s;
        bestPair = pair;
      }
    }
  }
  combo.leads = bestPair;
  combo.leadScore = bestScore;
  combo.orderedIdx = [...bestPair, ...indices.filter(idx => !bestPair.includes(idx))];
}


// =========================================================================
// 4. TACTICAL ANALYSIS & QUICK PREVIEW
// =========================================================================

export function evaluateAllCombos() {
  flowLog('evaluateAllCombos: Inicio');
  const enemyTeam = state.enemy.filter(Boolean);
  if (state.self.filter(Boolean).length < 4 || !enemyTeam.length) {
    state.combos = [];
    return;
  }

  // --- RENDIMIENTO: PRE-CÁLCULO y CACHÉ O(1) ---
  window.comboSpeedCache = {};
  window.comboBestAttackCache = {};
  
  const allMons = [...state.self.filter(Boolean), ...enemyTeam];
  // Simulamos campo limpio para la evaluación base de combos
  const backupField = { weather: state.field.weather, terrain: state.field.terrain };
  state.field.weather = null;
  state.field.terrain = null;

  for (const mon of allMons) {
      window.comboSpeedCache[mon.name] = calculateSpeed(mon, state.self.includes(mon) ? 'self' : 'enemy');
      // Pre-llenamos el caché de daño (bestAttack) evaluando cada cruce 1 vez
      for (const target of allMons) {
          if (mon === target) continue;
          bestAttack(mon, target);
      }
  }

  const combosIndices = getSelfCombos();
  flowLog('evaluateAllCombos: Evaluando combinaciones', { totalCombos: combosIndices.length });
  const evaluated = combosIndices.map(indices => evaluateCombo(indices)).filter(Boolean);
  evaluated.sort((a, b) => b.score - a.score);
  state.combos = evaluated;

  // Restauramos estado y limpiamos caché temporal
  state.field.weather = backupField.weather;
  state.field.terrain = backupField.terrain;
  
  window.comboSpeedCache = null;
  window.comboBestAttackCache = null;
  flowLog('evaluateAllCombos: Fin', { combosCalculados: state.combos.length });
}

export function getTopThreatSummaries() {
  const enemy = state.enemy.filter(Boolean);
  if (!enemy.length) return [];

  const selfTeam = getFocusedTeam('self');
  const items = enemy.map(mon => ({ mon, threat: scoreThreat(mon, selfTeam) }));
  const reds = items.filter(i => i.threat.level === 'red');
  const ambers = items.filter(i => i.threat.level === 'amber');

  return [
    ...reds.slice(0, 2),
    ...ambers.slice(0, 1),
  ];
}

export function lockBestFour(preview) {
  const team = state.self;
  const best = preview.bestFour || [];
  if (!team || best.length < 4) return;

  const indices = [];
  for (let i = 0; i < team.length; i++) {
    if (!team[i]) continue;
    if (best.some(m => m.name === team[i].name) && !indices.includes(i)) {
      indices.push(i);
    }
  }
  if (indices.length < 4) return;

  state.chosenFour = indices.slice(0, 4);
  
  if (preview.leadPair && preview.leadPair.length === 2) {
    const leadIndices = preview.leadPair.map(m => team.findIndex(tm => tm && tm.name === m.name));
    if (!leadIndices.includes(-1)) {
      state.leads.self = leadIndices;
      state.turn1Custom = false;
    }
  }
  
  const comboEnemyScores = state.enemy.map((enemyMon, idx) => {
    if (!enemyMon) return null;
    return { idx, cScore: scoreEnemyThreatVsCombo(enemyMon, best).score };
  }).filter(Boolean).sort((a, b) => b.cScore - a.cScore);

  if (comboEnemyScores.length > 0) {
    const topFour = comboEnemyScores.slice(0, 4);
    state.chosenEnemyFour = topFour.map(item => item.idx);
    state.leads.enemy = topFour.slice(0, 2).map(item => item.idx);
  }
  
  recalculateActiveField();
  renderAll();
}

export function applyQuickCombo(comboIndices) {
  state.chosenFour = comboIndices;

  let combo = null;
  if (state.combos) {
    combo = state.combos.find(c => [...c.indices].sort().join(',') === [...comboIndices].sort().join(','));
    if (combo && combo.leads) {
      state.leads.self = [...combo.leads];
      state.turn1Custom = false;
    }
  }

  if (combo && combo.predictedEnemyLeads && combo.predictedEnemyBack) {
    // Extraer los índices reales de state.enemy usando los mons precalculados
    const expectedEnemyTeamIndices = [...combo.predictedEnemyLeads, ...combo.predictedEnemyBack]
      .map(mon => state.enemy.indexOf(mon))
      .filter(idx => idx !== -1);
    
    // Rellenar con otros enemigos si no alcanzan 4
    if (expectedEnemyTeamIndices.length < 4) {
       state.enemy.forEach((mon, idx) => {
         if (mon && !expectedEnemyTeamIndices.includes(idx)) {
           expectedEnemyTeamIndices.push(idx);
         }
       });
    }

    if (expectedEnemyTeamIndices.length >= 4) {
      state.chosenEnemyFour = expectedEnemyTeamIndices.slice(0, 4);
      state.leads.enemy = expectedEnemyTeamIndices.slice(0, 2);
    }
  } else {
    // Fallback: Recalcular si por alguna razón no está el combo guardado
    const selfMons = comboIndices.map(i => state.self[i]).filter(Boolean);
    const comboEnemyScores = state.enemy.map((enemyMon, idx) => {
      if (!enemyMon) return null;
      return { idx, cScore: scoreEnemyThreatVsCombo(enemyMon, selfMons).score };
    }).filter(Boolean).sort((a, b) => b.cScore - a.cScore);

    if (comboEnemyScores.length > 0) {
      const topFour = comboEnemyScores.slice(0, 4);
      state.chosenEnemyFour = topFour.map(item => item.idx);
      state.leads.enemy = topFour.slice(0, 2).map(item => item.idx);
    }
  }

  recalculateActiveField();
  renderAll();
}

export function renderQuickCombos() {
  window.currentDamageCache = {};
  const selfTeam  = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);
  const section = document.getElementById('quickCombosList');
  if (!section) return;

  if (selfTeam.length < 6 || enemyTeam.length < 6) {
    section.innerHTML = `
      <div class="empty">
        Completa ambos equipos para ver las combinaciones recomendadas.
      </div>`;
    return;
  }

  const combos = buildQuickCombos();
  if (!combos.length) {
    section.innerHTML = '<div class="empty">Añade 4 Pokémon y un rival para ver combinaciones recomendadas.</div>';
    return;
  }

  const enemyPlan = inferStrategies(enemyTeam);
  const enemyStratText = enemyPlan.length > 0 ? enemyPlan[0].title : 'Ofensiva directa';

  const isActiveCombo = (comboArr) => {
    if (state.activeComboKey && state.activeComboKey === comboArr.join(',')) return true;
    if (!state.chosenFour || state.chosenFour.length !== 4) return false;
    const sortedA = [...comboArr].sort();
    const sortedB = [...state.chosenFour].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
  };

  section.innerHTML = combos.map((combo, idx) => {
    const mons = combo.orderedIdx.map(i => state.self[i]).filter(Boolean);
    const allyLeads = mons.slice(0, 2);
    const allyBack = mons.slice(2, 4);
    const active = isActiveCombo(combo.orderedIdx);

    // Leer directamente la predicción guardada en el combo
    const predictedEnemyLeads = (combo.predictedEnemyLeads || []).map(mon => ({ mon }));
    const predictedEnemyBack = (combo.predictedEnemyBack || []).map(mon => ({ mon }));

    let ourPlan = combo.planDescription || "Presionar desde el primer turno.";
    if (combo.antiStratNotes && combo.antiStratNotes.length > 0) {
        ourPlan += ` <strong class="color-blue" style="display:block; margin-top:4px;"><i data-lucide="check-circle" style="width:12px;height:12px;"></i> Adaptación clave: ${combo.antiStratNotes.join(' · ')}</strong>`;
    }

    const topThreat = predictedEnemyLeads[0]?.mon;
    let enemyRisk = 'Amenaza desconocida';
    if (combo?.keyLine?.includes('Riesgo Crítico')) {
      enemyRisk = `<span style="color: #ff4d4d; font-weight: bold;">${combo.keyLine}</span>`;
    } else if (topThreat) {
      enemyRisk = `Estrategia <strong>${enemyStratText}</strong>. Buscarán tomar la iniciativa o anularte mediante <strong>${topThreat.displayName}</strong>.`;
    }

    const hasEnemyTR = enemyPlan.some(s => s.type === "Trick Room");
    const ourTRAbusers = mons.filter(m => {
      const bSpe = m.baseStats?.speed || 100;
      const bAtk = m.baseStats?.attack || 0;
      const bSpa = m.baseStats?.["special-attack"] || 0;
      return bSpe <= 60 && (bAtk >= 90 || bSpa >= 90);
    });

    if (hasEnemyTR && ourTRAbusers.length > 0 && !combo?.keyLine?.includes('Riesgo Crítico')) {
      enemyRisk = `El rival puede usar <strong>Trick Room</strong>, lo cual beneficia a nuestro <strong>${ourTRAbusers[0].displayName}</strong>.`;
      ourPlan += ` <span class="text-green" style="display:block; margin-top:4px;"><i data-lucide="check-square" style="width:12px;height:12px;"></i> Sinergia de campo: aprovechar el Trick Room rival con ${ourTRAbusers[0].displayName}.</span>`;
    }

    return `
      <div class="match-setter-card ${active ? 'active' : ''}" data-combo="${combo.orderedIdx.join(',')}">
        <div class="match-header">
          <div class="match-badge">SIMULACIÓN #${idx + 1}${active ? ' - ACTIVA' : ''}</div>
          <div class="match-score">Ventaja: <span class="${
            combo.score >= 80 ? 'text-green' : (combo.score < 0 ? 'text-red' : 'text-gold')
          }">${combo.score > 0 ? '+' : ''}${combo.score}</span></div>
        </div>

        <div class="clash-main-grid">
          <div class="clash-side ally">
            <div class="side-label">TU EQUIPO</div>
            <div class="pokemon-quad">
              <div class="quad-row leads">
                <div class="slot">${allyLeads[0] ? `<img src="${allyLeads[0].sprite}">` : ''}<span class="tag">LEAD</span></div>
                <div class="slot">${allyLeads[1] ? `<img src="${allyLeads[1].sprite}">` : ''}<span class="tag">LEAD</span></div>
              </div>
              <div class="quad-row back">
                <div class="slot">${allyBack[0] ? `<img src="${allyBack[0].sprite}">` : ''}<span class="tag">BACK</span></div>
                <div class="slot">${allyBack[1] ? `<img src="${allyBack[1].sprite}">` : ''}<span class="tag">BACK</span></div>
              </div>
            </div>
          </div>

          <div class="vs-center">VS</div>

          <div class="clash-side enemy">
            <div class="side-label">RIVAL (PREDICCIÓN)</div>
            <div class="pokemon-quad">
              <div class="quad-row leads">
                <div class="slot">${predictedEnemyLeads[0]?.mon ? `<img src="${predictedEnemyLeads[0].mon.sprite}">` : ''}<span class="tag">LEAD</span></div>
                <div class="slot">${predictedEnemyLeads[1]?.mon ? `<img src="${predictedEnemyLeads[1].mon.sprite}">` : ''}<span class="tag">LEAD</span></div>
              </div>
              <div class="quad-row back">
                <div class="slot">${predictedEnemyBack[0]?.mon ? `<img src="${predictedEnemyBack[0].mon.sprite}">` : ''}<span class="tag">BACK</span></div>
                <div class="slot">${predictedEnemyBack[1]?.mon ? `<img src="${predictedEnemyBack[1].mon.sprite}">` : ''}<span class="tag">BACK</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="tactical-briefing">
          <div class="plan-box">
            <i data-lucide="target"></i>
            <p><strong>Nuestra Estrategia:</strong> ${ourPlan}</p>
          </div>
          <div class="risk-box">
            <i data-lucide="zap"></i>
            <p><strong>Riesgo Rival:</strong> ${enemyRisk}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Agregar event listeners a las cards
  const cards = section.querySelectorAll('.match-setter-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const comboRaw = card.getAttribute('data-combo');
      if (comboRaw) {
        const comboIndices = comboRaw.split(',').map(Number);
        applyQuickCombo(comboIndices);
      }
    });
  });

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    if (typeof section !== "undefined" && section) {
        lucide.createIcons({ root: section });
    } else {
        lucide.createIcons();
    }
  }
}

export function renderQuickLayer() {
  // Legacy fallback only: the home now reads from HomeTacticalModel + Top 3.
  // Keep the old panels dormant so older expert/debug paths can be restored without
  // competing with the tactical home.
  if (state.uiMode !== 'quick') return;
  const quickPreviewPanel = document.getElementById("quickPreviewPanel");
  const quickCombosSection = document.getElementById("quickCombosSection");
  if (quickPreviewPanel) quickPreviewPanel.style.display = "none";
  if (quickCombosSection) quickCombosSection.style.display = "none";
}

// --- PREVIEW UI ---
export function computeQuickPreview(rows) {
  const enemyTeam = state.enemy.filter(Boolean);
  if (!state.combos || !state.combos.length || !enemyTeam.length) {
    return { enemyPlan: [], bestFour: [], leadPair: [], noBring: [], mvp: null };
  }
  
  let activeCombo = state.combos[0];
  if (state.chosenFour && state.chosenFour.length === 4) {
    const found = state.combos.find(c => c.indices.sort().join(',') === [...state.chosenFour].sort().join(','));
    if (found) activeCombo = found;
  }
  
  const bestFour = activeCombo.mons;
  const leadPair = activeCombo.leads ? activeCombo.leads.map(i => state.self[i]) : [];
  const noBring = state.self.filter(m => m && !bestFour.includes(m));
  const enemyPlan = inferStrategies(enemyTeam);

  let mvp = null;
  let maxScore = -1;
  for (const m of bestFour) {
      const score = calculateMvpScore(m, state.self.filter(Boolean), enemyTeam);
      if (score > maxScore) { maxScore = score; mvp = m; }
  }

  return { enemyPlan, bestFour, leadPair, noBring, mvp };
}

// --- Actualización de UI para MVP ---
export function renderMvpBanner(mvp) {
  const quickPreviewPanel = document.getElementById("quickPreviewPanel");
  let mvpBanner = document.getElementById("mvpBanner");

  if (!mvp) {
    if (mvpBanner) mvpBanner.remove();
    return;
  }

  if (!mvpBanner) {
    mvpBanner = document.createElement("div");
    mvpBanner.id = "mvpBanner";
    mvpBanner.className = "mvp-directive";

    // Inyectar justo después del header del panel
    const sectionHead = quickPreviewPanel.querySelector(".premium-header");
    if (sectionHead) {
      sectionHead.insertAdjacentElement("afterend", mvpBanner);
    } else {
      quickPreviewPanel.prepend(mvpBanner);
    }
  }

  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);
  let text = `<span>Mantén a tu</span> <img src="${mvp.sprite}" alt="${mvp.displayName}" style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"> <strong>${mvp.displayName}</strong> <span>vivo a toda costa.</span>`;

  if (typeof classifyTeamRoles === 'function') {
    const roles = classifyTeamRoles(selfTeam, enemyTeam);
    const mvpRole = roles.get(mvp);

    if (mvpRole) {
      const hp = mvp.battle?.hpPct ?? 100;
      if (mvpRole.role === 'wincon') {
         if (hp <= 40 && state.uiMode === 'live') {
             text = `<span>¡CUIDADO!</span> <img src="${mvp.sprite}" alt="${mvp.displayName}" style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"> <strong>${mvp.displayName}</strong> <span>(Wincon) está bajo de HP. Protégelo a toda costa.</span>`;
         } else {
             text = `<span>Asegura el wincon:</span> <img src="${mvp.sprite}" alt="${mvp.displayName}" style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"> <strong>${mvp.displayName}</strong> <span>es tu mejor baza.</span>`;
         }
      } else if (mvpRole.role === 'redundante') {
         text = `<span>Pivote disponible:</span> <img src="${mvp.sprite}" alt="${mvp.displayName}" style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"> <strong>${mvp.displayName}</strong> <span>puede usarse para desgaste o pivotar sin comprometer la victoria.</span>`;
      }
    }
  }

  mvpBanner.innerHTML = `
    <div class="mvp-directive-icon">
      <i data-lucide="crosshair" style="width: 24px; height: 24px;"></i>
    </div>
    <div class="mvp-directive-content">
      <div class="mvp-directive-title">Directiva Principal</div>
      <div class="mvp-directive-text">
        ${text}
      </div>
    </div>
  `;
  updateIcons();
}
export function renderWeaknessSummary() {
  // Future
}

export function renderPreviewSprite(mon) {
  return `
    <div style="position: relative; display: inline-block; width: 100%; height: 100%;">
      <img src="${mon.sprite}" alt="${mon.name || ''}" style="width: 100%; height: 100%; object-fit: contain;">
      
      ${mon.tacticalReason === 'weather' ? `
        <div style="position:absolute; top:-4px; right:-4px; background:var(--blue); border-radius:50%; width:16px; height:16px; display:grid; place-items:center; border: 2px solid #181820;" title="Respuesta clave al Clima/Terreno rival">
          <i data-lucide="cloud-lightning" style="width:10px; height:10px; color:#fff;"></i>
        </div>
      ` : ''}

      ${mon.tacticalReason === 'speed' ? `
        <div style="position:absolute; top:-4px; right:-4px; background:var(--purple); border-radius:50%; width:16px; height:16px; display:grid; place-items:center; border: 2px solid #181820;" title="Respuesta clave al Control de Velocidad rival">
          <i data-lucide="timer" style="width:10px; height:10px; color:#fff;"></i>
        </div>
      ` : ''}
    </div>
  `;
}

// --- HLEPERS PARA COPY TÁCTICO QUICK PREVIEW ---

export function getRoleLabel(mon) {
  if (!mon) return "Flexible";
  const moves = (mon.set?.moves || []).map(m => String(m).toLowerCase());
  if (moves.includes("tailwind") || moves.includes("trick room") || moves.includes("viento afín") || moves.includes("espacio raro")) return "Control de velocidad";
  if (moves.includes("fake out") || moves.includes("sorpresa")) return "Soporte de tempo";
  if (moves.includes("follow me") || moves.includes("rage powder") || moves.includes("señuelo")) return "Redirección";
  const rawAtk = getBaseStatRaw(mon, "attack");
  const rawSpa = getBaseStatRaw(mon, "special-attack");
  if (rawAtk > 100 || rawSpa > 100) return "Breaker";
  return "Pivot defensivo";
}

export function getLeadSinergyText(leads) {
  if (leads.length < 2) return "Apertura estándar.";
  const f1 = getPokemonUtilityFlags(leads[0]);
  const f2 = getPokemonUtilityFlags(leads[1]);
  if ((f1.fakeOut && f2.tailwind) || (f2.fakeOut && f1.tailwind)) return "Sorpresa + Viento Afín para control inicial.";
  if ((f1.fakeOut && f2.trickRoom) || (f2.fakeOut && f1.trickRoom)) return "Sorpresa + Espacio Raro para invertir la velocidad.";
  if (f1.redirection || f2.redirection) return "Redirección + setup o ataque protegido.";
  if (f1.intimidate || f2.intimidate) return "Intimidación + presión segura.";
  if (f1.fakeOut && f2.fakeOut) return "Doble Sorpresa para frenar el momentum rival.";
  return "Pareja flexible de presión equilibrada.";
}

export function getLeadPressureText(leads, enemyTeam) {
  const targets = [];
  for (const e of enemyTeam) {
    for (const l of leads) {
      if (bestAttack(l, e).mult >= 2) {
        targets.push(e.displayName);
        break;
      }
    }
  }
  if (!targets.length) return "Daño neutro y posicionamiento general.";
  if (targets.length > 1) {
    const last = targets.pop();
    return `Tiene super eficaz contra ${targets.join(', ')} y ${last}.`;
  }
  return `Tiene super eficaz contra ${targets[0]}.`;
}

export function getLeadAvoidText(leads, enemyTeam) {
  const threats = [];
  for (const e of enemyTeam) {
    for (const l of leads) {
      if (bestAttack(e, l).mult >= 2) {
        threats.push(e.displayName);
        break;
      }
    }
  }
  if (!threats.length) return "Matchup sólido contra la mayoría de aperturas.";
  if (threats.length > 1) {
    const last = threats.pop();
    return `Evita quedar expuesto ante ${threats.join(', ')} o ${last}.`;
  }
  return `Evita quedar expuesto ante ${threats[0]}.`;
}

export function getBenchEntryText(mon, enemyTeam) {
  if (state.uiMode === 'live') {
    // Bench como entrada reactiva según estado actual
    const currentState = state;
    let bestUse = 'Entra para estabilizar el daño o pivotar.';

    const enemies = enemyTeam.filter(Boolean);
    const targets = [];
    for (const e of enemies) {
      const res = bestAttack(mon, e);
      if (res.mult >= 2 && res.maxPct >= 50) targets.push(e.displayName);
    }

    if (targets.length > 1) {
      const last = targets.pop();
      bestUse = `Entra para presionar fuerte a ${targets.join(', ')} y ${last}.`;
    } else if (targets.length === 1) {
      bestUse = `Entra para presionar fuerte a ${targets[0]}.`;
    }

    const boardDelta = (() => {
      if (typeof simulateTurn !== 'function' || typeof scoreBoard !== 'function') return 0;

      const simIn = cloneSimulationState(currentState);
      const activeIdx = currentState.activeSelfSlots[0];
      const benchIdx = currentState.self.findIndex(m => m && m.name === mon.name);
      if (activeIdx === undefined || benchIdx === -1) return 0;

      const action = { kind: 'switch', side: 'self', userIndex: activeIdx, switchInIndex: benchIdx };
      const { nextState } = simulateTurn(currentState, [action], []);
      
      return scoreBoard(nextState, 'self') - scoreBoard(currentState, 'self');
    })();

    if (boardDelta > 0) {
      bestUse += ' Mejora tu posición global en el tablero.';
    }

    return bestUse;
  }

  // lógica original
  const targets = [];
  for (const e of enemyTeam) {
    if (bestAttack(mon, e).mult >= 2) targets.push(e.displayName);
  }
  if (targets.length > 1) {
    const last = targets.pop();
    return `Entra si necesitas presionar a ${targets.join(', ')} y ${last}.`;
  } else if (targets.length === 1) {
    return `Entra si necesitas presionar a ${targets[0]}.`;
  }
  return `Entra para estabilizar el daño o pivotar.`;
}

export function getBenchAvoidText(mon, enemyTeam) {
  if (state.uiMode === 'live') {
    const enemies = enemyTeam.filter(Boolean);
    let worst = 0;
    let worstName = null;

    for (const e of enemies) {
      const res = bestAttack(e, mon);
      const pct = res.maxPct || res.damage || 0;
      if (pct > worst) {
        worst = pct;
        worstName = e.displayName;
      }
    }

    if (!worstName) return 'Cuidado al exponerlo sin necesidad.';
    if (worst >= 100) return `No lo expongas si ${worstName} está activo: riesgo de OHKO.`;
    if (worst >= 60) return `Evita sacarlo frente a ${worstName}: recibe demasiada presión.`;

    return `Úsalo con prudencia cuando ${worstName} esté en campo.`;
  }

  // lógica original
  const threats = [];
  for (const e of enemyTeam) {
    if (bestAttack(e, mon).mult >= 2) threats.push(e.displayName);
  }
  if (threats.length > 1) {
    const last = threats.pop();
    return `No lo expongas si ${threats.join(', ')} o ${last} están activos.`;
  } else if (threats.length === 1) {
    return `No lo expongas si ${threats[0]} está activo.`;
  }
  return `Cuidado con recibir demasiado daño de desgaste.`;
}

export function getNoBringReason(mon, enemyTeam) {
  const punishers = [];
  for (const e of enemyTeam) {
     if (bestAttack(e, mon).mult >= 2) punishers.push(e.displayName);
  }
  if (punishers.length > 1) {
     const last = punishers.pop();
     return `Demasiado castigado por ${punishers.join(', ')} y ${last}.`;
  } else if (punishers.length === 1) {
     return `Demasiado castigado por ${punishers[0]}.`;
  }
  
  const speed = calculateSpeed(mon, "self");
  if (speed < 100 && !mon.set?.moves?.includes("Trick Room")) return "Pierde tempo de salida contra este equipo.";
  
  return "No aporta presión real ni utilidad clave en este matchup.";
}

export function getPlanExplanation(title) {
  const t = title.toLowerCase();
  if (t.includes('viento')) return "Buscará ganar tempo desde el turno 1.";
  if (t.includes('trick room')) return "Intentará invertir la velocidad para sus atacantes.";
  if (t.includes('lluvia')) return "Sus atacantes suben mucho bajo lluvia.";
  if (t.includes('sol')) return "Daño masivo de fuego y velocidad por habilidad.";
  if (t.includes('arena')) return "Daño residual y potenciación de stats.";
  if (t.includes('pivot')) return "Buscará reposicionar sin ceder presión.";
  if (t.includes('soporte')) return "Protegerá a sus atacantes principales.";
  if (t.includes('disrup')) return "Intentará anular tus condiciones de victoria.";
  return "Composición sólida que se adapta al matchup.";
}

export function renderQuickPreview(preview) {
  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);
  const panel = document.getElementById("quickPreviewPanel");

  if (selfTeam.length === 0 || enemyTeam.length === 0) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";
  renderMvpBanner(preview.mvp); // Renderizar el banner MVP

  const planList = document.getElementById("planRivalList");
  if (preview.enemyPlan.length) {
    planList.innerHTML = preview.enemyPlan
      .map(
        (item) => `
          <div class="qp-plan-item">
            <div class="qp-plan-item-header">
              <span class="qp-plan-icon">${item.icon}</span>
              <span class="qp-plan-title">${item.title}</span>
            </div>
            <div class="qp-plan-desc">${getPlanExplanation(item.title)}</div>
          </div>
        `,
      )
      .join("");
  } else {
    planList.innerHTML =
      '<div class="muted-small">Sin plan claro detectado.</div>';
  }

  const topThreats = getTopThreatSummaries();
  const threatChipsHtml = topThreats.map(({mon, threat}) => `
    <div class="tag-pill tag-pill--danger" style="margin-bottom: 4px;" data-scout="${mon.name}">
      <img src="${mon.sprite}" class="sprite-micro" alt="${mon.displayName}">
      <span>${mon.displayName}: ${threat.reasons[0] || 'Amenaza clave en T1'}</span>
    </div>
  `).join('');
  const planRivalCard = document.getElementById("planRivalCard");
  if (planRivalCard) {
    let threatRow = document.getElementById("quickThreatRow");
    if (!threatRow) {
      threatRow = document.createElement("div");
      threatRow.id = "quickThreatRow";
      threatRow.className = "quick-threat-row";
      threatRow.style.marginTop = "8px";
      planRivalCard.appendChild(threatRow);
    }
    threatRow.innerHTML = threatChipsHtml || '<span class="muted-small">Sin amenazas rojas claras.</span>';
  }

  const leadIds = new Set(preview.leadPair.map(m => m.name));
  const backline = preview.bestFour.filter(m => !leadIds.has(m.name));

  const synergyText = getLeadSinergyText(preview.leadPair);
  const pressureText = getLeadPressureText(preview.leadPair, enemyTeam);
  const avoidText = getLeadAvoidText(preview.leadPair, enemyTeam);

  const bestFourCard = document.getElementById("bestFourCard");
  
  // Tablero de Despliegue (Leads + Reserva integrados)
  bestFourCard.className = "deployment-zone";

  const getPlanIcon = (type) => {
    if (type === 'agresivo') return { icon: 'swords', color: 'var(--red)', label: 'Agresivo' };
    if (type === 'defensivo') return { icon: 'shield', color: 'var(--blue)', label: 'Defensivo' };
    if (type === 'tempo') return { icon: 'timer', color: 'var(--purple)', label: 'Tempo' };
    if (type === 'balanceado') return { icon: 'scale', color: 'var(--gold)', label: 'Balanceado' };
    return { icon: 'check', color: 'var(--blue)', label: 'Autorizado' };
  };
  const planInfo = preview.activeCombo ? getPlanIcon(preview.activeCombo.planType) : { icon: 'check', color: 'var(--blue)', label: 'Autorizado' };

  const headerHtml = `
      <div class="deployment-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <h3 style="margin: 0; font: 900 0.9rem/1 'Cabinet Grotesk', sans-serif; color: #fff;">Escuadrón Seleccionado</h3>
          ${state.turn1Custom ? '<span class="tiny-chip" style="background: var(--bg); color: var(--gold); border: 1px solid var(--gold); font-size:0.65rem;">Leads Custom</span>' : ''}
        </div>
        <span class="tiny-chip" style="color: ${planInfo.color}; border-color: ${planInfo.color}55; background: rgba(255,255,255,0.05); font-weight:800;"><i data-lucide="${planInfo.icon}" style="width:12px;height:12px;margin-right:4px;"></i> ${planInfo.label}</span>
      </div>`;

  if (preview.leadPair.length === 0 && backline.length === 0) {
    bestFourCard.innerHTML = headerHtml + `
      <div class="empty" style="margin-top: 12px;">Faltan Pokémon en el equipo</div>
    `;
  } else {
    bestFourCard.innerHTML = headerHtml + `
      <div class="qp-section">
        <h4 class="qp-section-title">Leads Recomendados</h4>
        <div class="qp-leads-row">
          ${preview.leadPair.map((m, mIdx) => `
            <div class="qp-lead-sprite" title="${m.displayName}">
              <img src="${m.sprite}">
              <span class="qp-lead-name">${m.displayName}</span>
            </div>
          `).join('<i data-lucide="plus" class="qp-lead-plus"></i>')}
        </div>
        <div class="qp-tactics-box">
          <div class="qp-tactic-row"><strong class="color-blue">Objetivo:</strong> <span>${synergyText}</span></div>
          <div class="qp-tactic-row"><strong class="color-green">Qué presiona:</strong> <span>${pressureText}</span></div>
          <div class="qp-tactic-row"><strong class="color-red">Qué evitar:</strong> <span>${avoidText}</span></div>
        </div>
      </div>

      <div class="qp-section">
        <h4 class="qp-section-title">Banquillo Situacional</h4>
        <p class="qp-section-desc">No son leads; guárdalos para cuando el rival muestre su plan o necesites cubrir amenazas concretas.</p>
        <div class="qp-bench-list">
          ${backline.map((m, mIdx) => `
            <div class="qp-bench-item">
              <img src="${m.sprite}" class="qp-bench-sprite">
              <div class="qp-bench-info">
                <div class="qp-bench-head">
                  <strong>${m.displayName}</strong>
                  <span class="qp-role-badge">${getRoleLabel(m)}</span>
                </div>
                <div class="qp-bench-tactic"><i data-lucide="check-circle" class="color-green"></i> ${getBenchEntryText(m, enemyTeam)}</div>
                <div class="qp-bench-tactic"><i data-lucide="x-circle" class="color-red"></i> ${getBenchAvoidText(m, enemyTeam)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <button class="btn gold full sticky-cta" id="lockBestFourBtn" style="margin-top: 12px;">
        Bloquear estos 4
      </button>
    `;
  }

  const noBringCard = document.getElementById("noBringCard");
  
  // Zona de Peligro (Bans)
  noBringCard.className = "hazard-zone";
  noBringCard.innerHTML = `
    <div class="deployment-header" style="border-bottom-color: rgba(255,59,48,0.2);">
      <h3 style="margin: 0; font: 900 0.9rem/1 'Cabinet Grotesk', sans-serif; color: #ffc8c4;">Evitar salvo lectura muy concreta</h3>
    </div>
    
    <div class="qp-nobring-list" style="margin-top: 12px;">
      ${preview.noBring.length > 0 ? preview.noBring.map(m => `
        <div class="qp-nobring-item">
          <div class="qp-nobring-sprite-box">
            <img src="${m.sprite}">
            <div class="qp-nobring-overlay"><i data-lucide="ban"></i></div>
          </div>
          <div class="qp-nobring-info">
            <strong>${m.displayName}</strong>
            <span>${getNoBringReason(m, enemyTeam)}</span>
          </div>
        </div>
      `).join('') : '<div class="muted-small">Todos los agentes autorizados.</div>'}
    </div>
  `;
  
  updateIcons();
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    if (typeof section !== "undefined" && section) {
        lucide.createIcons({ root: section });
    } else {
        lucide.createIcons();
    }
  }
}





export function isPhysicalAttacker(mon) {
  if (!mon) return false;
  const moves = mon.set?.moves || [];
  const hasPhysical = moves.some(
    (m) => state.moveTypeCache[m]?.damageClass === "physical",
  );
  if (hasPhysical) return true;
  const atk = mon.baseStats?.attack || 0;
  const spa = mon.baseStats?.['special-attack'] || 0;
  return atk > spa;
}

export function pruneInvalidTurn1Slots() {
  for (const side of ["self", "enemy"]) {
    state.leads[side] = state.leads[side].filter((i) => state[side][i]);
  }
}

export function ensureTurn1LeadDefaults() {
  const selfFilled = [0, 1, 2, 3, 4, 5].filter((i) => state.self[i]);
  const enemyFilled = [0, 1, 2, 3, 4, 5].filter((i) => state.enemy[i]);

  if (state.leads.self.length === 0 && selfFilled.length >= 2) {
    const rows = getRows();
    const preview = computeQuickPreview(rows);
    const optimalNames = preview.leadPair.map(m => m.name);
    const optimalIndices = selfFilled.filter(i => optimalNames.includes(state.self[i].name)).slice(0, 2);
    if (optimalIndices.length === 2) {
      state.leads.self = optimalIndices;
    } else {
      state.leads.self = selfFilled.slice(0, 2);
    }
  } else if (state.leads.self.length === 0 && selfFilled.length > 0) {
    state.leads.self = [...selfFilled];
  }

  if (state.leads.enemy.length === 0 && enemyFilled.length >= 2) {
    const sortedEnemyIndices = [...enemyFilled].sort((a, b) => {
      const rankA = state.enemy[a].metaRank || 999;
      const rankB = state.enemy[b].metaRank || 999;
      return rankA - rankB;
    });
    state.leads.enemy = sortedEnemyIndices.slice(0, 2);
  } else if (state.leads.enemy.length === 0 && enemyFilled.length > 0) {
    state.leads.enemy = [...enemyFilled];
  }
}

export function getTurn1ResolvedLeadIndices(side) {
  const team = state[side];
  const picked = state.leads[side].filter((i) => team[i]);
  const filled = [0, 1, 2, 3, 4, 5].filter((i) => team[i]);
  const out = [...picked];
  for (const i of filled) {
    if (out.length >= 2) break;
    if (!out.includes(i)) out.push(i);
  }
  return out.slice(0, 2);
}

function ensureTurn1BattleSession() {
  if (!state.turn1Battle) {
    state.turn1Battle = { active: false, turn: 1, log: [], lastActionId: 0, actedThisTurn: {}, lastResolvedOrder: null, pendingSwitch: null };
  }
  if (!Array.isArray(state.turn1Battle.log)) state.turn1Battle.log = [];
  if (!state.turn1Battle.actedThisTurn || typeof state.turn1Battle.actedThisTurn !== 'object') state.turn1Battle.actedThisTurn = {};
  if (!Number.isFinite(state.turn1Battle.turn)) state.turn1Battle.turn = 1;
  if (!Number.isFinite(state.turn1Battle.lastActionId)) state.turn1Battle.lastActionId = 0;
  if (!('lastResolvedOrder' in state.turn1Battle)) state.turn1Battle.lastResolvedOrder = null;
  if (!('pendingSwitch' in state.turn1Battle)) state.turn1Battle.pendingSwitch = null;
  return state.turn1Battle;
}

function setMonBattleDefaults(mon, side) {
  if (!mon) return;
  ensureBattleState(mon);
  mon.battle.side = side;
  if (!Number.isFinite(mon.battle.hpPct)) mon.battle.hpPct = 100;
  if (!mon.battle.status) mon.battle.status = 'none';
  if (!mon.battle.stages) mon.battle.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

function pushTurn1BattleLog(kind, title, text, meta = {}) {
  const session = ensureTurn1BattleSession();
  session.lastActionId += 1;
  session.log.unshift({
    id: session.lastActionId,
    kind,
    title,
    text,
    turn: session.turn,
    time: Date.now(),
    ...meta,
  });
  session.log = session.log.slice(0, 18);
}

function describeTurnPriority(prio, spe = null) {
  if (prio) return `prioridad ${prio > 0 ? '+' : ''}${prio}`;
  return spe === null ? 'prioridad normal' : `Vel ${Math.abs(spe)}`;
}

function clearTurn1Caches() {
  window.currentDamageCache = {};
  window.comboBestAttackCache = {};
}

function getTurnActionKey(side, idx) {
  return `${side}:${idx}`;
}

function canMoveBypassTurnLock(moveName) {
  const slug = getMoveSlug(moveName);
  return ['instruct', 'mandato'].includes(slug);
}

function getMoveSlug(moveName) {
  return String(moveName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isProtectMove(moveName) {
  const slug = getMoveSlug(moveName);
  return ['protect', 'proteccion', 'detect', 'deteccion', 'spikyshield', 'barreraespinosa', 'kingsshield', 'escudoreal', 'banefulbunker', 'bunker'].includes(slug);
}

function isStatusMoveForSimulation(moveName) {
  if (!moveName) return false;
  const info = getMoveInfoForSimulation(moveName);
  return info.damageClass === 'status' || (!info.power && info.damageClass !== 'physical' && info.damageClass !== 'special');
}

function hasTurnActionBeenUsed(side, idx) {
  const session = ensureTurn1BattleSession();
  return !!session.actedThisTurn?.[getTurnActionKey(side, idx)];
}

function getTurnActionLockLabel(side, idx) {
  const used = ensureTurn1BattleSession().actedThisTurn?.[getTurnActionKey(side, idx)];
  return used?.move ? `Ya actuó con ${formatName(getTranslation(used.move, 'move') || used.move)}` : 'Ya actuó este turno';
}

function clearTurnVolatiles(mon) {
  if (!mon?.battle) return;
  mon.battle.flinched = false;
  mon.battle.flinchedBy = null;
  mon.battle.protected = false;
  mon.battle.protectedBy = null;
  mon.battle.enteredThisTurn = false;
}

function advanceMonTurnState(mon) {
  if (!mon?.battle) return;
  clearTurnVolatiles(mon);
  if (mon.battle.tauntTurns) {
    mon.battle.tauntTurns = Math.max(0, Number(mon.battle.tauntTurns) - 1);
    if (!mon.battle.tauntTurns) {
      mon.battle.taunted = false;
      mon.battle.tauntTurns = 0;
    }
  }
}

function getHardTurnBlockReason(mon) {
  if (!mon) return 'no esta en mesa';
  const hpPct = mon.battle?.hpPct ?? 100;
  if (mon.fainted || hpPct <= 0) return 'esta debilitado';
  if (mon.battle?.enteredThisTurn) return 'acaba de entrar este turno';
  if (mon.battle?.flinched) {
    return mon.battle.flinchedBy ? `retrocede por ${mon.battle.flinchedBy}` : 'retrocede este turno';
  }
  if (mon.battle?.status === 'slp') return 'esta dormido';
  if (mon.battle?.status === 'frz') return 'esta congelado';
  return null;
}

function getActionBlockReason(mon, moveName = null) {
  const hardReason = getHardTurnBlockReason(mon);
  if (hardReason) return hardReason;
  if (moveName && mon?.battle?.taunted && isStatusMoveForSimulation(moveName)) {
    return 'Mofa bloquea movimientos de estado';
  }
  return null;
}

function getTurn1PendingActionQueue({ requestedSide = null, requestedIdx = null, requestedMove = null } = {}) {
  ensureTurn1LeadDefaults();
  const entries = [];
  const sides = ['self', 'enemy'];
  sides.forEach(side => {
    getTurn1ResolvedLeadIndices(side).forEach(idx => {
      const mon = state[side]?.[idx];
      if (!mon) return;
      setMonBattleDefaults(mon, side);
      if (mon.fainted || (mon.battle?.hpPct ?? 100) <= 0) return;
      if (getHardTurnBlockReason(mon)) return;
      if (hasTurnActionBeenUsed(side, idx)) return;
      const isRequested = side === requestedSide && Number(idx) === Number(requestedIdx);
      const requestedPrio = requestedMove ? getPriority(requestedMove, mon) : 0;
      const prio = isRequested ? requestedPrio : 0;
      const spe = calculateSpeed(mon, side, state.field);
      entries.push({ side, idx, mon, prio, spe });
    });
  });
  return entries.sort((a, b) => {
    if (b.prio !== a.prio) return b.prio - a.prio;
    if (b.spe !== a.spe) return b.spe - a.spe;
    if (a.side !== b.side) return a.side === 'self' ? -1 : 1;
    return a.idx - b.idx;
  });
}

function getTurn1ActionOrderBlock(side, idx, moveName) {
  const session = ensureTurn1BattleSession();
  if (!session.active) return null;
  if (session.pendingSwitch) {
    const switchMon = state[session.pendingSwitch.side]?.[session.pendingSwitch.sourceIdx];
    const switchName = formatName(
      session.pendingSwitch.sourceName
      || switchMon?.displayName
      || switchMon?.name
      || 'ese Pokemon'
    );
    return `Antes debes elegir el relevo de ${switchName}`;
  }
  const mon = state[side]?.[idx];
  const requestedPrio = getPriority(moveName, mon);
  const requestedSpe = mon ? calculateSpeed(mon, side, state.field) : 0;
  const last = session.lastResolvedOrder;
  if (last) {
    if (requestedPrio > last.prio) {
      return `La ventana de ${describeTurnPriority(requestedPrio)} ya pasÃ³`;
    }
    if (requestedPrio === last.prio && requestedSpe > last.spe) {
      return `Ese punto de velocidad ya pasÃ³; ya resolviste una acciÃ³n mÃ¡s lenta de ${describeTurnPriority(requestedPrio)}`;
    }
  }
  if (requestedPrio > 0) return null;
  const queue = getTurn1PendingActionQueue({ requestedSide: side, requestedIdx: idx, requestedMove: moveName });
  const current = queue.find(entry => entry.side === side && Number(entry.idx) === Number(idx));
  if (!current) return null;
  const first = queue[0];
  if (!first || (first.side === side && Number(first.idx) === Number(idx))) return null;
  if (first.prio === current.prio && first.spe === current.spe) return null;
  const firstName = formatName(first.mon.displayName || first.mon.name);
  const prioText = describeTurnPriority(first.prio, first.spe);
  return `Antes debe actuar ${firstName} (${prioText})`;
}

function applyManualSelfMoveEffects(attacker, moveName, side = 'self') {
  if (!attacker) return null;
  const slug = getMoveSlug(moveName);
  const attackerName = formatName(attacker.displayName || attacker.name);
  const f = state.field;
  const isSelfSide = side !== 'enemy';

  if (['tailwind', 'vientoafin'].includes(slug)) {
    if (isSelfSide) {
      f.tailwindSelf = true;
      f.tailwindSelfTurns = 4;
    } else {
      f.tailwindEnemy = true;
      f.tailwindEnemyTurns = 4;
    }
    return `${attackerName} activa Viento Afin para su lado durante 4 turnos.`;
  }

  if (['trickroom', 'espacioraro'].includes(slug)) {
    f.trickRoom = !f.trickRoom;
    f.trickRoomTurns = f.trickRoom ? 5 : 0;
    return `${attackerName} ${f.trickRoom ? 'activa' : 'desactiva'} Trick Room.`;
  }

  if (['reflect', 'reflejo'].includes(slug)) {
    if (isSelfSide) {
      f.reflectSelf = true;
      f.reflectSelfTurns = 5;
    } else {
      f.reflectEnemy = true;
      f.reflectEnemyTurns = 5;
    }
    return `${attackerName} levanta Reflejo.`;
  }

  if (['lightscreen', 'pantallaluz'].includes(slug)) {
    if (isSelfSide) {
      f.lightScreenSelf = true;
      f.lightScreenSelfTurns = 5;
    } else {
      f.lightScreenEnemy = true;
      f.lightScreenEnemyTurns = 5;
    }
    return `${attackerName} levanta Pantalla Luz.`;
  }

  if (['auroraveil', 'veloaurora'].includes(slug)) {
    if (isSelfSide) {
      f.auroraVeilSelf = true;
      f.auroraVeilSelfTurns = 5;
    } else {
      f.auroraVeilEnemy = true;
      f.auroraVeilEnemyTurns = 5;
    }
    return `${attackerName} activa Velo Aurora.`;
  }

  if (['wideguard', 'vastaguardia'].includes(slug)) {
    if (isSelfSide) f.wideGuardSelf = true;
    else f.wideGuardEnemy = true;
    return `${attackerName} protege a su lado de movimientos de area.`;
  }

  if (['quickguard', 'anticipo'].includes(slug)) {
    if (isSelfSide) f.quickGuardSelf = true;
    else f.quickGuardEnemy = true;
    return `${attackerName} protege a su lado de movimientos de prioridad.`;
  }

  if (['followme', 'senuelo', 'seuelo', 'ragepowder', 'polvoira'].includes(slug)) {
    if (isSelfSide) f.redirectionSelf = attacker.name || attacker.displayName || true;
    else f.redirectionEnemy = attacker.name || attacker.displayName || true;
    return `${attackerName} redirige la presion rival hacia si.`;
  }

  if (!isProtectMove(moveName)) return null;
  ensureBattleState(attacker);
  attacker.battle.protected = true;
  attacker.battle.protectedBy = formatName(getTranslation(moveName, 'move') || moveName);
  return `${attackerName} queda protegido hasta el final del turno.`;
}

function formatBattleStatus(status) {
  const map = {
    none: 'Sin estado',
    brn: 'Quemado',
    par: 'Paralizado',
    slp: 'Dormido',
    psn: 'Envenenado',
    tox: 'Tóxico',
    frz: 'Congelado',
  };
  return map[status] || formatName(status || 'Sin estado');
}

function getMoveInfoForSimulation(moveName) {
  const info = fetchMoveInfo(moveName) || {};
  return {
    move: moveName,
    type: info.type || 'normal',
    power: info.power || 0,
    damageClass: info.damageClass || 'status',
    hits: info.hits || GUARANTEED_MULTI_HITS[moveName] || 1,
    isSpread: info.isSpread || isCanonicalSpreadMove(moveName) || SPREAD_MOVES.has(getMoveSlug(moveName)),
  };
}

function isSwitchAfterMove(moveName) {
  const slug = getMoveSlug(moveName);
  return [
    'partingshot',
    'ultimapalabra',
    'uturn',
    'idayvuelta',
    'voltswitch',
    'voltiocambio',
    'flipturn',
  ].includes(slug);
}

function getTurn1BenchIndices(side) {
  const active = new Set(getTurn1ResolvedLeadIndices(side));
  return state[side]
    .map((mon, idx) => ({ mon, idx }))
    .filter(({ mon, idx }) => mon && !active.has(idx) && !(mon.fainted || (mon.battle?.hpPct ?? 100) <= 0))
    .map(({ idx }) => idx);
}

function getSpreadTargetEntries(targetSide) {
  return getTurn1ResolvedLeadIndices(targetSide)
    .map((idx) => ({ idx, mon: state[targetSide]?.[idx] }))
    .filter(({ mon }) => mon && !(mon.fainted || (mon.battle?.hpPct ?? 100) <= 0));
}

function applyManualMoveSideEffects(attacker, defender, moveName, targetSide) {
  const slug = getMoveSlug(moveName);
  if (!defender) return null;
  setMonBattleDefaults(defender, targetSide);

  const statusMoves = {
    willowisp: 'brn',
    fuegofatuo: 'brn',
    thunderwave: 'par',
    ondatrueno: 'par',
    spore: 'slp',
    espora: 'slp',
    sleeppowder: 'slp',
    somnifero: 'slp',
    toxic: 'tox',
    toxico: 'tox',
    poisonpowder: 'psn',
    venenopolvo: 'psn',
  };

  if (statusMoves[slug] && (!defender.battle.status || defender.battle.status === 'none')) {
    defender.battle.status = statusMoves[slug];
    return `${formatName(defender.displayName || defender.name)} queda ${formatBattleStatus(statusMoves[slug]).toLowerCase()}.`;
  }

  if (['icywind', 'vientohielo', 'electroweb', 'redviscosa', 'bulldoze'].includes(slug)) {
    defender.battle.stages.spe = Math.max(-6, (defender.battle.stages.spe || 0) - 1);
    return `${formatName(defender.displayName || defender.name)} pierde 1 nivel de Velocidad.`;
  }

  if (['partingshot', 'ultimapalabra'].includes(slug)) {
    defender.battle.stages.atk = Math.max(-6, (defender.battle.stages.atk || 0) - 1);
    defender.battle.stages.spa = Math.max(-6, (defender.battle.stages.spa || 0) - 1);
    return `${formatName(defender.displayName || defender.name)} recibe -1 Atk / -1 SpA.`;
  }

  if (['taunt', 'mofa'].includes(slug)) {
    defender.battle.taunted = true;
    defender.battle.tauntTurns = 3;
    return `${formatName(defender.displayName || defender.name)} queda bajo Mofa.`;
  }

  if (['fakeout', 'sorpresa'].includes(slug)) {
    defender.battle.flinched = true;
    defender.battle.flinchedBy = formatName(attacker?.displayName || attacker?.name || getTranslation(moveName, 'move') || moveName);
    return `${formatName(defender.displayName || defender.name)} queda marcado por retroceso este turno.`;
  }

  return null;
}

export function startTurn1BattleSimulation({ resetLog = false } = {}) {
  const session = ensureTurn1BattleSession();
  pruneInvalidTurn1Slots();
  ensureTurn1LeadDefaults();
  state.activeSelfSlots = getTurn1ResolvedLeadIndices('self');
  state.activeEnemySlots = getTurn1ResolvedLeadIndices('enemy');

  state.self.forEach(mon => setMonBattleDefaults(mon, 'self'));
  state.enemy.forEach(mon => setMonBattleDefaults(mon, 'enemy'));

  if (!session.active || resetLog) {
    session.turn = 1;
    session.actedThisTurn = {};
    session.lastResolvedOrder = null;
    session.pendingSwitch = null;
    state.self.forEach(clearTurnVolatiles);
    state.enemy.forEach(clearTurnVolatiles);
    if (resetLog) session.log = [];
  }
  session.active = true;

  recalculateActiveField();
  pushTurn1BattleLog(
    'start',
    'Simulación iniciada',
    'Se fija la mesa activa, se aplican entradas de campo y el simulador empieza a acumular turnos.',
  );
  clearTurn1Caches();
  renderAll();
}

export function resetTurn1BattleSimulation() {
  state.turn1Battle = { active: false, turn: 1, log: [], lastActionId: 0, actedThisTurn: {}, lastResolvedOrder: null, pendingSwitch: null };
  state.self.forEach(mon => {
    if (!mon) return;
    ensureBattleState(mon);
    mon.battle.hpPct = 100;
    mon.battle.status = 'none';
    mon.battle.taunted = false;
    mon.battle.tauntTurns = 0;
    mon.battle.flinched = false;
    mon.battle.flinchedBy = null;
    mon.battle.protected = false;
    mon.battle.protectedBy = null;
    mon.battle.enteredThisTurn = false;
    mon.battle.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    mon.fainted = false;
  });
  state.enemy.forEach(mon => {
    if (!mon) return;
    ensureBattleState(mon);
    mon.battle.hpPct = 100;
    mon.battle.status = 'none';
    mon.battle.taunted = false;
    mon.battle.tauntTurns = 0;
    mon.battle.flinched = false;
    mon.battle.flinchedBy = null;
    mon.battle.protected = false;
    mon.battle.protectedBy = null;
    mon.battle.enteredThisTurn = false;
    mon.battle.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    mon.fainted = false;
  });
  recalculateActiveField();
  clearTurn1Caches();
  renderAll();
}

export function advanceTurn1BattleSimulation() {
  const session = ensureTurn1BattleSession();
  if (!session.active) {
    startTurn1BattleSimulation();
    return;
  }
  if (session.pendingSwitch) {
    const pendingMon = state[session.pendingSwitch.side]?.[session.pendingSwitch.sourceIdx];
    const pendingName = formatName(
      session.pendingSwitch.sourceName
      || pendingMon?.displayName
      || pendingMon?.name
      || 'ese Pokemon'
    );
    pushTurn1BattleLog('blocked', 'Cambio pendiente', `No puedes avanzar de turno hasta elegir el relevo de ${pendingName}.`);
    renderAll();
    return;
  }
  tickField(state);
  state.self.forEach(advanceMonTurnState);
  state.enemy.forEach(advanceMonTurnState);
  session.actedThisTurn = {};
  session.lastResolvedOrder = null;
  session.pendingSwitch = null;
  session.turn += 1;
  pushTurn1BattleLog('turn', `Turno ${session.turn}`, 'Se reducen duraciones de clima, campo, Tailwind, pantallas y flags temporales.');
  clearTurn1Caches();
  renderAll();
}

export function applyTurn1FieldControl(kind, value, side = null) {
  const session = ensureTurn1BattleSession();
  session.active = true;
  const f = state.field;
  let label = '';

  if (kind === 'weather') {
    f.weather = f.weather === value ? null : value;
    f.weatherTurns = f.weather ? 5 : 0;
    label = f.weather ? `Clima: ${WEATHER_LABELS[f.weather] || weatherNames[f.weather] || formatName(f.weather)}` : 'Clima despejado';
  } else if (kind === 'terrain') {
    f.terrain = f.terrain === value ? null : value;
    f.terrainTurns = f.terrain ? 5 : 0;
    label = f.terrain ? `Terreno: ${TERRAIN_LABELS[f.terrain] || formatName(f.terrain)}` : 'Terreno neutral';
  } else if (kind === 'trickRoom') {
    f.trickRoom = !f.trickRoom;
    f.trickRoomTurns = f.trickRoom ? 5 : 0;
    label = f.trickRoom ? 'Trick Room activo' : 'Trick Room desactivado';
  } else if (kind === 'tailwind') {
    const flag = side === 'enemy' ? 'tailwindEnemy' : 'tailwindSelf';
    const turns = side === 'enemy' ? 'tailwindEnemyTurns' : 'tailwindSelfTurns';
    f[flag] = !f[flag];
    f[turns] = f[flag] ? 4 : 0;
    label = `${side === 'enemy' ? 'Rival' : 'Propio'}: ${f[flag] ? 'Tailwind activo' : 'Tailwind apagado'}`;
  }

  pushTurn1BattleLog('field', 'Campo ajustado', label || 'Se ajusta una propiedad del campo.');
  clearTurn1Caches();
  renderAll();
}

function applyTurn1MoveSelectionRuntime(payload = {}) {
  const session = ensureTurn1BattleSession();
  if (!session.active) {
    startTurn1BattleSimulation();
  }

  const side = payload.side;
  const userIndex = Number(payload.userIdx);
  const targetSide = payload.targetSide;
  const targetIndex = Number(payload.targetIdx);
  const targetMode = payload.targetMode || null;
  const moveName = payload.move;
  const attacker = state[side]?.[userIndex];

  if (!attacker || !moveName) return;
  setMonBattleDefaults(attacker, side);

  const actionKey = getTurnActionKey(side, userIndex);
  const attackerName = formatName(attacker.displayName || attacker.name);
  const moveLabel = formatName(getTranslation(moveName, 'move') || moveName);

  if (session.pendingSwitch) {
    const pendingMon = state[session.pendingSwitch.side]?.[session.pendingSwitch.sourceIdx];
    const pendingName = formatName(
      session.pendingSwitch.sourceName
      || pendingMon?.displayName
      || pendingMon?.name
      || 'ese Pokemon'
    );
    pushTurn1BattleLog('blocked', 'Cambio pendiente', `Antes de seguir debes elegir el relevo de ${pendingName}.`);
    renderAll();
    return;
  }

  if (attacker.fainted || (attacker.battle?.hpPct ?? 100) <= 0) {
    pushTurn1BattleLog('blocked', 'Accion invalida', `${attackerName} esta debilitado y no puede actuar.`);
    renderAll();
    return;
  }
  const actionBlockReason = getActionBlockReason(attacker, moveName);
  if (actionBlockReason) {
    pushTurn1BattleLog('blocked', 'Accion impedida', `${attackerName} no puede usar ${moveLabel}: ${actionBlockReason}.`);
    renderAll();
    return;
  }
  if (session.actedThisTurn[actionKey] && !canMoveBypassTurnLock(moveName)) {
    pushTurn1BattleLog('blocked', 'Accion ya usada', `${attackerName} ya actuo este turno. Avanza al siguiente turno para volver a mover.`);
    renderAll();
    return;
  }
  const orderBlockReason = getTurn1ActionOrderBlock(side, userIndex, moveName);
  if (orderBlockReason) {
    pushTurn1BattleLog('blocked', 'Orden de turno', `${attackerName} no puede resolver ${moveLabel} todavia. ${orderBlockReason}.`);
    renderAll();
    return;
  }

  ensureMoveRegistry(moveName);
  ensureAbilityRegistry(attacker.set?.ability);
  ensureItemRegistry(attacker.set?.item);

  const moveCandidate = getMoveInfoForSimulation(moveName);
  moveCandidate.priority = getPriority(moveName, attacker);
  const resolvedTargetSide = targetSide || (side === 'self' ? 'enemy' : 'self');
  const isSpreadSelection = targetMode === 'spread-foes' || (!!moveCandidate.isSpread && resolvedTargetSide !== side);
  let logText = `${attackerName} usa ${moveLabel}.`;
  const selfEffectText = applyManualSelfMoveEffects(attacker, moveName, side);
  if (selfEffectText) logText = selfEffectText;

  const targetEntries = isSpreadSelection
    ? getSpreadTargetEntries(resolvedTargetSide)
    : (Number.isFinite(targetIndex)
      ? [{ idx: targetIndex, mon: state[resolvedTargetSide]?.[targetIndex] }]
      : []);
  let hadSuccessfulTargetEffect = false;

  if (targetEntries.length) {
    const logSegments = [];
    for (const targetEntry of targetEntries) {
      const defender = targetEntry.mon;
      if (!defender) continue;
      setMonBattleDefaults(defender, resolvedTargetSide);
      const defenderName = formatName(defender.displayName || defender.name);
      if (defender.fainted || (defender.battle?.hpPct ?? 100) <= 0) {
        logSegments.push(`${defenderName} ya estaba fuera de combate.`);
        continue;
      }

      const attackerAbility = (attacker.set?.ability || attacker.ability || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z]/g, '');
      const pranksterBoosted = ['prankster', 'bromista'].includes(attackerAbility)
        && isStatusMoveForSimulation(moveName)
        && getPriority(moveName, attacker) > getPriority(moveName, null);
      const defenderIsDark = (defender.types || []).map((t) => String(t).toLowerCase()).includes('dark');
      if (pranksterBoosted && resolvedTargetSide !== side && defenderIsDark) {
        logSegments.push(`${defenderName} bloquea ${moveLabel} por ser de tipo Siniestro frente a Bromista.`);
        continue;
      }

      const result = estimateMoveDamage(attacker, defender, moveCandidate, state.field);
      const baseHP = calcMonHP(defender);
      const currentPct = defender.battle.hpPct ?? 100;
      const currentHP = Math.max(0, Math.floor((baseHP * currentPct) / 100));
      const rawNewHP = Math.max(0, currentHP - (result.damage || 0));
      let nextPct = Math.max(0, Math.floor((rawNewHP / baseHP) * 100));

      const itemId = (defender.set?.item || defender.item || '').toLowerCase().replace(/[^a-z]/g, '');
      const abilityId = (defender.set?.ability || defender.ability || '').toLowerCase().replace(/[^a-z]/g, '');
      const canHoldAtOne = currentPct >= 99 && nextPct <= 0 && ['focussash', 'bandafocus'].includes(itemId);
      const sturdyHold = currentPct >= 99 && nextPct <= 0 && ['sturdy', 'robustez'].includes(abilityId);
      if (canHoldAtOne || sturdyHold) {
        nextPct = 1;
        defender.battle.turn1Triggers = {
          ...(defender.battle.turn1Triggers || {}),
          [canHoldAtOne ? 'sash' : 'sturdy']: true,
        };
      }

      if (!result.blocked && result.damage > 0) {
        defender.battle.hpPct = nextPct;
        defender.fainted = nextPct <= 0;
        hadSuccessfulTargetEffect = true;
        logSegments.push(`${defenderName} recibe ${Math.max(0, currentPct - nextPct)}% y queda al ${nextPct}%${canHoldAtOne || sturdyHold ? ' aguantando a 1 PS' : ''}.`);
      } else if (result.blocked) {
        const blockName = result.immunityData?.name || 'proteccion o inmunidad';
        logSegments.push(`${defenderName} lo bloquea con ${formatName(blockName)}.`);
      }

      const sideEffectText = !result.blocked
        ? applyManualMoveSideEffects(attacker, defender, moveName, resolvedTargetSide)
        : null;
      if (sideEffectText) {
        hadSuccessfulTargetEffect = true;
        logSegments.push(sideEffectText);
      }
    }

    if (logSegments.length) {
      logText = `${attackerName} usa ${moveLabel}${isSpreadSelection ? ' sobre ambos rivales' : ''}: ${logSegments.join(' ')}`;
    }
  }

  if (!selfEffectText) {
    applyMoveResolutionEffects(attacker, { name: moveName, move: moveName });
  }

  if (isSwitchAfterMove(moveName) && hadSuccessfulTargetEffect) {
    const benchOptions = getTurn1BenchIndices(side);
    if (benchOptions.length) {
      session.pendingSwitch = {
        side,
        sourceIdx: userIndex,
        sourceName: attackerName,
        move: moveName,
        turn: session.turn,
      };
      logText += ` ${attackerName} debe retirarse ahora; elige un relevo.`;
    } else {
      logText += ` ${attackerName} deberia pivotar, pero no queda relevo disponible.`;
    }
  }

  if (!canMoveBypassTurnLock(moveName)) {
    session.actedThisTurn[actionKey] = {
      move: moveName,
      turn: session.turn,
      targetSide: resolvedTargetSide,
      targetIndex: Number.isFinite(targetIndex) ? targetIndex : null,
      targetMode: isSpreadSelection ? 'spread-foes' : null,
    };
    session.lastResolvedOrder = {
      prio: getPriority(moveName, attacker),
      spe: calculateSpeed(attacker, side, state.field),
      side,
      idx: userIndex,
      move: moveName,
    };
  }

  pushTurn1BattleLog('move', moveLabel, logText, {
    side,
    userIndex,
    targetSide: resolvedTargetSide,
    targetIndex: Number.isFinite(targetIndex) ? targetIndex : null,
    targetMode: isSpreadSelection ? 'spread-foes' : null,
  });
  clearTurn1Caches();
  renderAll();
}

export function applyTurn1MoveSelection(payload = {}) {
  return applyTurn1MoveSelectionRuntime(payload);
  const session = ensureTurn1BattleSession();
  if (!session.active) {
    startTurn1BattleSimulation();
  }

  const side = payload.side;
  const userIndex = Number(payload.userIdx);
  const targetSide = payload.targetSide;
  const targetIndex = Number(payload.targetIdx);
  const targetMode = payload.targetMode || null;
  const moveName = payload.move;
  const attacker = state[side]?.[userIndex];

  if (!attacker || !moveName) return;
  setMonBattleDefaults(attacker, side);

  const actionKey = getTurnActionKey(side, userIndex);
  const attackerName = formatName(attacker.displayName || attacker.name);
  const moveLabel = formatName(getTranslation(moveName, 'move') || moveName);
  if (session.pendingSwitch) {
    const pendingMon = state[session.pendingSwitch.side]?.[session.pendingSwitch.sourceIdx];
    const pendingName = formatName(
      session.pendingSwitch.sourceName
      || pendingMon?.displayName
      || pendingMon?.name
      || 'ese Pokemon'
    );
    pushTurn1BattleLog('blocked', 'Cambio pendiente', `Antes de seguir debes elegir el relevo de ${pendingName}.`);
    renderAll();
    return;
  }
  if (attacker.fainted || (attacker.battle?.hpPct ?? 100) <= 0) {
    pushTurn1BattleLog('blocked', 'Acción inválida', `${attackerName} está debilitado y no puede actuar.`);
    renderAll();
    return;
  }
  const actionBlockReason = getActionBlockReason(attacker, moveName);
  if (actionBlockReason) {
    pushTurn1BattleLog('blocked', 'Acción impedida', `${attackerName} no puede usar ${moveLabel}: ${actionBlockReason}.`);
    renderAll();
    return;
  }
  if (session.actedThisTurn[actionKey] && !canMoveBypassTurnLock(moveName)) {
    pushTurn1BattleLog('blocked', 'Acción ya usada', `${attackerName} ya actuó este turno. Avanza al siguiente turno para volver a mover.`);
    renderAll();
    return;
  }
  const orderBlockReason = getTurn1ActionOrderBlock(side, userIndex, moveName);
  if (orderBlockReason) {
    pushTurn1BattleLog('blocked', 'Orden de turno', `${attackerName} no puede resolver ${moveLabel} todavía. ${orderBlockReason}.`);
    renderAll();
    return;
  }

  ensureMoveRegistry(moveName);
  ensureAbilityRegistry(attacker.set?.ability);
  ensureItemRegistry(attacker.set?.item);

  const moveCandidate = getMoveInfoForSimulation(moveName);
  moveCandidate.priority = getPriority(moveName, attacker);
  let logText = `${attackerName} usa ${moveLabel}.`;
  const selfEffectText = applyManualSelfMoveEffects(attacker, moveName, side);
  if (selfEffectText) logText = selfEffectText;

  if (defender) {
    const defenderName = formatName(defender.displayName || defender.name);
    if (defender.fainted || (defender.battle?.hpPct ?? 100) <= 0) {
      pushTurn1BattleLog('blocked', 'Objetivo debilitado', `${attackerName} intenta ${moveLabel}, pero ${defenderName} ya está fuera de combate.`);
      renderAll();
      return;
    }
    const attackerAbility = (attacker.set?.ability || attacker.ability || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    const pranksterBoosted = ['prankster', 'bromista'].includes(attackerAbility) && isStatusMoveForSimulation(moveName) && getPriority(moveName, attacker) > getPriority(moveName, null);
    const defenderIsDark = (defender.types || []).map(t => String(t).toLowerCase()).includes('dark');
    if (pranksterBoosted && targetSide !== side && defenderIsDark) {
      pushTurn1BattleLog('blocked', 'Bromista bloqueado', `${attackerName} intenta ${moveLabel}, pero ${defenderName} es de tipo Siniestro y bloquea movimientos de estado con Bromista.`);
      if (!canMoveBypassTurnLock(moveName)) {
        session.actedThisTurn[actionKey] = { move: moveName, turn: session.turn, targetSide, targetIndex };
        session.lastResolvedOrder = {
          prio: getPriority(moveName, attacker),
          spe: calculateSpeed(attacker, side, state.field),
          side,
          idx: userIndex,
          move: moveName,
        };
      }
      renderAll();
      return;
    }
    const result = estimateMoveDamage(attacker, defender, moveCandidate, state.field);
    const baseHP = calcMonHP(defender);
    const currentPct = defender.battle.hpPct ?? 100;
    const currentHP = Math.max(0, Math.floor((baseHP * currentPct) / 100));
    const rawNewHP = Math.max(0, currentHP - (result.damage || 0));
    let nextPct = Math.max(0, Math.floor((rawNewHP / baseHP) * 100));

    const itemId = (defender.set?.item || defender.item || '').toLowerCase().replace(/[^a-z]/g, '');
    const abilityId = (defender.set?.ability || defender.ability || '').toLowerCase().replace(/[^a-z]/g, '');
    const canHoldAtOne = currentPct >= 99 && nextPct <= 0 && ['focussash', 'bandafocus'].includes(itemId);
    const sturdyHold = currentPct >= 99 && nextPct <= 0 && ['sturdy', 'robustez'].includes(abilityId);
    if (canHoldAtOne || sturdyHold) {
      nextPct = 1;
      defender.battle.turn1Triggers = { ...(defender.battle.turn1Triggers || {}), [canHoldAtOne ? 'sash' : 'sturdy']: true };
    }

    if (!result.blocked && result.damage > 0) {
      defender.battle.hpPct = nextPct;
      defender.fainted = nextPct <= 0;
      logText = `${attackerName} usa ${moveLabel} sobre ${defenderName}: ${Math.max(0, currentPct - nextPct)}% aplicado (${nextPct}% restante).`;
      if (canHoldAtOne || sturdyHold) logText += ` ${defenderName} aguanta a 1 PS.`;
    } else if (result.blocked) {
      const blockName = result.immunityData?.name || 'protección o inmunidad';
      logText = `${attackerName} intenta ${moveLabel} sobre ${defenderName}, pero lo bloquea ${formatName(blockName)}.`;
    }

    const sideEffectText = !result.blocked ? applyManualMoveSideEffects(attacker, defender, moveName, targetSide) : null;
    if (sideEffectText) logText += ` ${sideEffectText}`;
  }

  if (!selfEffectText) {
    applyMoveResolutionEffects(attacker, { name: moveName, move: moveName });
  }
  if (!canMoveBypassTurnLock(moveName)) {
    session.actedThisTurn[actionKey] = { move: moveName, turn: session.turn, targetSide, targetIndex };
    session.lastResolvedOrder = {
      prio: getPriority(moveName, attacker),
      spe: calculateSpeed(attacker, side, state.field),
      side,
      idx: userIndex,
      move: moveName,
    };
  }
  pushTurn1BattleLog('move', moveLabel, logText, { side, userIndex, targetSide, targetIndex });
  clearTurn1Caches();
  renderAll();
}

export function handleTurn1SimulatorClick(target) {
  if (document.activeElement?.matches?.('[data-t1-hp], [data-t1-status]')) {
    handleTurn1SimulatorChange(document.activeElement);
  }

  const command = target.closest?.('[data-t1-sim-command]');
  if (command) {
    const value = command.dataset.t1SimCommand;
    if (value === 'start') startTurn1BattleSimulation();
    if (value === 'next') advanceTurn1BattleSimulation();
    if (value === 'reset') resetTurn1BattleSimulation();
    return true;
  }

  const field = target.closest?.('[data-t1-field-kind]');
  if (field) {
    applyTurn1FieldControl(field.dataset.t1FieldKind, field.dataset.t1FieldValue, field.dataset.t1Side || null);
    return true;
  }

  const action = target.closest?.('[data-t1-action="move"]');
  if (action) {
    applyTurn1MoveSelection(action.dataset);
    return true;
  }

  return false;
}

export function handleTurn1SimulatorChange(target) {
  const hpInput = target.closest?.('[data-t1-hp]');
  if (hpInput) {
    const side = hpInput.dataset.side;
    const idx = Number(hpInput.dataset.idx);
    const mon = state[side]?.[idx];
    if (!mon) return true;
    setMonBattleDefaults(mon, side);
    mon.battle.hpPct = Math.max(0, Math.min(100, Number(hpInput.value) || 0));
    mon.fainted = mon.battle.hpPct <= 0;
    ensureTurn1BattleSession().active = true;
    clearTurn1Caches();
    renderAll();
    return true;
  }

  const statusSelect = target.closest?.('[data-t1-status]');
  if (statusSelect) {
    const side = statusSelect.dataset.side;
    const idx = Number(statusSelect.dataset.idx);
    const mon = state[side]?.[idx];
    if (!mon) return true;
    setMonBattleDefaults(mon, side);
    mon.battle.status = statusSelect.value || 'none';
    ensureStatusRegistry(mon.battle.status);
    ensureTurn1BattleSession().active = true;
    pushTurn1BattleLog('state', 'Estado manual', `${formatName(mon.displayName || mon.name)} ahora está: ${formatBattleStatus(mon.battle.status)}.`);
    clearTurn1Caches();
    renderAll();
    return true;
  }

  return false;
}

function initTurn1SimulatorRuntimeBindings() {
  if (window.__turn1SimulatorRuntimeBindingsReady) return;
  window.__turn1SimulatorRuntimeBindingsReady = true;
  document.addEventListener('click', (e) => {
    if (!e.target || typeof e.target.closest !== 'function') return;
    if (!e.target.closest('#turn1SimulatorPanel')) return;
    if (handleTurn1SimulatorClick(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  document.addEventListener('change', (e) => {
    if (!e.target || typeof e.target.closest !== 'function') return;
    if (!e.target.closest('#turn1SimulatorPanel')) return;
    if (handleTurn1SimulatorChange(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  document.addEventListener('input', (e) => {
    if (!e.target || typeof e.target.closest !== 'function') return;
    if (!e.target.closest('#turn1SimulatorPanel')) return;
    const hpInput = e.target.closest('[data-t1-hp]');
    if (!hpInput) return;
    const mon = state[hpInput.dataset.side]?.[Number(hpInput.dataset.idx)];
    if (!mon) return;
    setMonBattleDefaults(mon, hpInput.dataset.side);
    mon.battle.hpPct = Math.max(0, Math.min(100, Number(hpInput.value) || 0));
    mon.fainted = mon.battle.hpPct <= 0;
    ensureTurn1BattleSession().active = true;
    clearTurn1Caches();
  }, true);
}

export function renderTurn1PickRows() {
  const selfRow = document.getElementById("t1SelfPickRow");
  const enemyRow = document.getElementById("t1EnemyPickRow");
  if (!selfRow || !enemyRow) return;

  const rows = getRows();
  const preview = computeQuickPreview(rows);
  const optimalNames = preview.leadPair.map(m => m.name);

  const build = (side) => {
    const team = state[side];
    const picks = state.leads[side];
    return [0, 1, 2, 3, 4, 5]
      .map((i) => {
        const mon = team[i];
        const on = picks.includes(i);
        const cls = ["t1-slot"];
        const isKo = !!mon && (mon.fainted || (mon.battle?.hpPct ?? 100) <= 0);
        
        if (!mon) cls.push("t1-slot--empty");
        if (mon && on)
          cls.push(side === "self" ? "t1-slot--on-self" : "t1-slot--on-enemy");
        if (isKo) cls.push("t1-slot--ko");
        
        const isOptimal = side === "self" && mon && optimalNames.includes(mon.name);
        const koBadge = isKo ? `<div class="t1-slot-state-badge t1-slot-state-badge--ko">KO</div>` : '';
        const badge = isOptimal ? `<div class="optimal-badge t1-slot-effect"><i data-lucide="star"></i> ÓPTIMO</div>` : '';
        
        const inner = mon
          ? `<img src="${mon.sprite}" alt="" loading="lazy">`
          : '<span class="t1-slot-ph">—</span>';
        const dis = mon ? "" : " disabled";
        return `
          <div class="t1-slot-frame ${isOptimal ? 't1-slot-frame--optimal' : ''} ${isKo ? 't1-slot-frame--ko' : ''}">
            <button type="button" class="${cls.join(" ")}" data-t1-slot data-side="${side}" data-idx="${i}" ${mon && side === "enemy" ? `data-scout="${mon.name}"` : ""}${dis}>${inner}</button>
            ${badge}
            ${koBadge}
            <div class="t1-slot-effects" aria-hidden="true"></div>
          </div>`;
      })
      .join("");
  };
  selfRow.innerHTML = build("self");
  enemyRow.innerHTML = build("enemy");
  
  // NUEVA LÓGICA: Añadir clase de bloqueo visual si hay 2 seleccionados
  selfRow.classList.toggle('t1-roster--locked', state.leads.self.length >= 2);
  enemyRow.classList.toggle('t1-roster--locked', state.leads.enemy.length >= 2);
}

export function renderTurn1Simulator() {
  flowLog('renderTurn1Simulator: Inicio');
  const panel = document.getElementById("turn1SimulatorPanel");
  const list = document.getElementById("t1InsightsList");
  const emptyState = document.getElementById("t1EmptyState");
  const pickZone = document.getElementById("turn1PickZone");
  const activeBoard = document.getElementById("activeBoardContainer");
  const veredictoContainer = document.getElementById("veredictoT1Container");
  
  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);

  if (selfTeam.length < 2 || enemyTeam.length < 2) {
    flowLog('renderTurn1Simulator: Faltan mons, abortando y ocultando panel');
    panel.style.display = "none";
    return;
  }
  
  // En modo rapido el simulador es paso posterior: aparece tras fijar un plan.
  const quickPlanActive = state.uiMode !== 'quick'
    || (state.chosenFour?.length >= 4 && !!state.turnPlanSelection?.planId);
  if (!quickPlanActive) {
    panel.style.display = "none";
    emptyState.style.display = "none";
    if (activeBoard) activeBoard.style.display = "none";
    if (veredictoContainer) veredictoContainer.style.display = "none";
    list.innerHTML = "";
    flowLog('renderTurn1Simulator: Esperando plan activo en UI Rapida');
    return;
  }

  panel.style.display = "block";
  emptyState.style.display = "none";
  if (activeBoard) activeBoard.style.display = "block";
  if (veredictoContainer) veredictoContainer.style.display = "block";

  pruneInvalidTurn1Slots();
  ensureTurn1LeadDefaults();
  renderTurn1PickRows();

 const sIdx = getTurn1ResolvedLeadIndices("self");
  const eIdx = getTurn1ResolvedLeadIndices("enemy");
  const s1 = state.self[sIdx[0]];
  const s2 = state.self[sIdx[1]];
  const e1 = state.enemy[eIdx[0]];
  const e2 = state.enemy[eIdx[1]];

  // 1. PRIMERO: CALCULAR VELOCIDADES BASE PARA ORDEN DE ACTIVACIÓN
  const simFieldLocal = { ...state.field };
  const initialLeads = [
    { mon: s1, side: "self", spe: calculateSpeed(s1, "self", simFieldLocal), realIdx: sIdx[0] },
    { mon: s2, side: "self", spe: calculateSpeed(s2, "self", simFieldLocal), realIdx: sIdx[1] },
    { mon: e1, side: "enemy", spe: calculateSpeed(e1, "enemy", simFieldLocal), realIdx: eIdx[0] },
    { mon: e2, side: "enemy", spe: calculateSpeed(e2, "enemy", simFieldLocal), realIdx: eIdx[1] },
  ].filter((x) => x.mon).sort((a, b) => b.spe - a.spe); // Orden de más rápido a más lento

  const applyHazards = (mon) => {
    if (!mon) return;
    const ab = (mon.set?.ability || mon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
    
    if (ab === 'drought' || mon.name.toLowerCase().includes('charizardmegay')) simFieldLocal.weather = 'sun';
    if (ab === 'drizzle' || mon.name.toLowerCase().includes('pelipper')) simFieldLocal.weather = 'rain';
    if (ab === 'sandstream') simFieldLocal.weather = 'sandstorm';
    if (ab === 'snowwarning') simFieldLocal.weather = 'snow';
    if (ab === 'psychicsurge') simFieldLocal.terrain = 'psychic';
    if (ab === 'grassysurge') simFieldLocal.terrain = 'grassy';
    if (ab === 'electricsurge') simFieldLocal.terrain = 'electric';
    if (ab === 'mistysurge') simFieldLocal.terrain = 'misty';
  };
  
  if (!state.turn1Battle?.active) {
    initialLeads.forEach(l => applyHazards(l.mon));
  }

  // 2. SEGUNDO: RECALCULAR VELOCIDADES CON EL CAMPO FINAL (Climas aplicados)
  const leads = initialLeads.map(l => ({
    ...l,
    spe: calculateSpeed(l.mon, l.side, simFieldLocal)
  })).sort((a, b) => b.spe - a.spe);

  let weathers = [];
  let terrains = [];

  // === RENDER GLOBAL STATE BANNER ===
  const globalStateBanner = document.getElementById("t1GlobalFieldState");
  if (globalStateBanner) {
    const reversedLeads = [...leads].reverse();
    for (const lead of reversedLeads) {
      const ability = (lead.mon.set?.ability || lead.mon.ability || '').toLowerCase().replace(/\\s/g, '');
      const name = lead.mon.displayName || lead.mon.name;
      if (ability === 'drought') weathers.push({ type: 'sun', text: `${weatherNames['sun']} (vía ${formatName(name)})`, icon: 'sun' });
      if (ability === 'drizzle') weathers.push({ type: 'rain', text: `${weatherNames['rain']} (vía ${formatName(name)})`, icon: 'cloud-rain' });
      if (ability === 'sandstream') weathers.push({ type: 'sand', text: `${weatherNames['sandstorm']} (vía ${formatName(name)})`, icon: 'wind' });
      if (ability === 'snowwarning') weathers.push({ type: 'snow', text: `${weatherNames['snow']} (vía ${formatName(name)})`, icon: 'snowflake' });
      if (ability === 'psychicsurge') terrains.push({ type: 'psychic', text: `Campo Psíquico (vía ${formatName(name)})`, icon: 'orbit' });
      if (ability === 'grassysurge') terrains.push({ type: 'grassy', text: `Campo de Hierba (vía ${formatName(name)})`, icon: 'leaf' });
      if (ability === 'electricsurge') terrains.push({ type: 'electric', text: `Campo Eléctrico (vía ${formatName(name)})`, icon: 'zap' });
      if (ability === 'mistysurge') terrains.push({ type: 'misty', text: `Campo de Niebla (vía ${formatName(name)})`, icon: 'sparkles' });
    }
    const manualWeatherType = simFieldLocal.weather === 'sandstorm' ? 'sand' : simFieldLocal.weather;
    const manualWeatherIcon = { sun: 'sun', rain: 'cloud-rain', sand: 'wind', snow: 'snowflake' };
    const manualTerrainIcon = { electric: 'zap', grassy: 'leaf', psychic: 'orbit', misty: 'sparkles' };
    const activeWeather = state.turn1Battle?.active && manualWeatherType
      ? { type: manualWeatherType, text: WEATHER_LABELS[manualWeatherType] || weatherNames[manualWeatherType] || formatName(manualWeatherType), icon: manualWeatherIcon[manualWeatherType] || 'cloud-sun' }
      : (weathers.length > 0 ? weathers[0] : null);
    const activeTerrain = state.turn1Battle?.active && simFieldLocal.terrain
      ? { type: simFieldLocal.terrain, text: TERRAIN_LABELS[simFieldLocal.terrain] || formatName(simFieldLocal.terrain), icon: manualTerrainIcon[simFieldLocal.terrain] || 'sparkles' }
      : (terrains.length > 0 ? terrains[0] : null);
    if (!activeWeather && !activeTerrain) {
      globalStateBanner.style.display = 'none';
    } else {
      globalStateBanner.style.display = 'flex';
      let html = '';
      if (activeWeather) {
        html += `<div class="global-state-pill weather-pill-${activeWeather.type}">
                   <i data-lucide="${activeWeather.icon}"></i> <span>${activeWeather.text}</span>
                 </div>`;
      }
      if (activeTerrain) {
        html += `<div class="global-state-pill terrain-pill-${activeTerrain.type}">
                   <i data-lucide="${activeTerrain.icon}"></i> <span>${activeTerrain.text}</span>
                 </div>`;
      }
      globalStateBanner.innerHTML = html;
      if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons({ root: globalStateBanner });
    }
  }

// === RENDER LEAD BADGES (TIMELINE, STATS, ABILITY GLOW) ===
  document.querySelectorAll('.t1-slot-effects').forEach(e => e.innerHTML = '');
  document.querySelectorAll('.t1-slot.t1-slot-ability-glow').forEach(e => e.classList.remove('t1-slot-ability-glow'));

  // Clonar leads para preservar estado
  let simLeads = leads.map(l => ({ ...l, mon: structuredClone(l.mon) }));

  // Limpiamos caché para que tome en cuenta los stages actualizados
  window.currentDamageCache = {};

  const session = ensureTurn1BattleSession();
  const canRemainOnBoard = (entry) => !!entry?.mon && !entry.mon.fainted && (entry.mon.battle?.hpPct ?? 100) > 0;
  const canActThisTurn = (entry) => canRemainOnBoard(entry) && !getHardTurnBlockReason(entry.mon);
  const visibleSelfLeads = simLeads.filter(x => x.side === "self");
  const visibleEnemyLeads = simLeads.filter(x => x.side === "enemy");
  let selfLeads = visibleSelfLeads.filter(canActThisTurn);
  let enemyLeads = visibleEnemyLeads.filter(canActThisTurn);

  const getUsedTurnAction = (entry) => entry ? session.actedThisTurn?.[getTurnActionKey(entry.side, entry.realIdx)] : null;
  const getAppliedTargetLabel = (used) => {
    if (!used) return '';
    if (used.targetMode === 'spread-foes') {
      return used.targetSide === 'self' ? 'Objetivos: ambos aliados activos' : 'Objetivos: ambos rivales activos';
    }
    if (used.targetSide == null || !Number.isFinite(Number(used.targetIndex))) return '';
    const target = state[used.targetSide]?.[Number(used.targetIndex)];
    return target ? `Objetivo: ${formatName(target.displayName || target.name)}` : '';
  };
  const getActionVisualState = (entry, moveName, fallbackLabel = 'Aplicar') => {
    const isUnavailable = !entry || !canRemainOnBoard(entry);
    if (isUnavailable) {
      return { state: 'ko', disabled: true, icon: 'ban', label: 'KO', title: 'No puede actuar: está debilitado', detail: 'Fuera de combate' };
    }
    const used = getUsedTurnAction(entry);
    const acted = !!used && !canMoveBypassTurnLock(moveName);
    const exactApplied = acted && used.move === moveName;
    if (exactApplied) {
      const targetText = getAppliedTargetLabel(used);
      return { state: 'applied', disabled: true, icon: 'check-circle-2', label: 'Aplicado', title: targetText || 'Movimiento aplicado en este turno', detail: targetText || 'Acción resuelta' };
    }
    if (acted) {
      return { state: 'closed', disabled: true, icon: 'circle-slash-2', label: 'Cerrado', title: getTurnActionLockLabel(entry.side, entry.realIdx), detail: `Ya actuó con ${formatName(getTranslation(used.move, 'move') || used.move)}` };
    }
    const blockReason = getActionBlockReason(entry.mon, moveName);
    if (blockReason) {
      return { state: 'blocked', disabled: true, icon: 'lock', label: 'Bloqueado', title: `No puede actuar: ${blockReason}`, detail: blockReason };
    }
    const orderBlockReason = getTurn1ActionOrderBlock(entry.side, entry.realIdx, moveName);
    if (orderBlockReason) {
      return { state: 'waiting', disabled: true, icon: 'clock-3', label: 'En espera', title: orderBlockReason, detail: orderBlockReason };
    }
    const prio = getPriority(moveName, entry.mon);
    return { state: prio > 0 ? 'priority-ready' : 'ready', disabled: false, icon: prio > 0 ? 'zap' : 'play-circle', label: fallbackLabel, title: 'Aplicar este resultado a la simulación', detail: prio > 0 ? `Ventana de ${describeTurnPriority(prio)}` : 'Listo para resolver' };
  };
  const buildActionControl = (entry, moveName, label = 'Aplicar', className = 't1-apply-move-btn', attrs = '') => {
    const visual = getActionVisualState(entry, moveName, label);
    return `
      <button type="button" class="${className} is-${visual.state}" title="${escapeHtml(visual.title)}" ${visual.disabled ? 'disabled aria-disabled="true"' : ''} data-t1-action="move" data-side="${entry?.side || ''}" data-user-idx="${entry?.realIdx ?? ''}" ${attrs} data-move="${escapeHtml(moveName)}">
        <i data-lucide="${visual.icon}"></i>
        <span>${visual.label}</span>
      </button>`;
  };

  let selfIntimidate = selfLeads.some(l => (l.mon.set?.ability || l.mon.ability || '').toLowerCase().includes('intimidate'));
  let enemyIntimidate = enemyLeads.some(l => (l.mon.set?.ability || l.mon.ability || '').toLowerCase().includes('intimidate'));

  let turnOrderLeads = simLeads.filter(canActThisTurn).map(l => {
      let maxPrio = Math.max(0, ...(l.mon.set?.moves || []).filter(Boolean).map(m => getPriority(m, l.mon)));
      const targets = l.side === 'self' ? enemyLeads : selfLeads;
      targets.forEach(t => {
          const atk = bestAttack(l.mon, t.mon, simFieldLocal);
          const currentPrio = getPriority(atk.move, l.mon);
          if (currentPrio > maxPrio) maxPrio = currentPrio;
      });
      return {
        ...l,
        prioHint: maxPrio,
        hasPriorityOption: maxPrio > 0,
        spe: l.spe
      };
  }).sort((a, b) => b.spe - a.spe);
  
  turnOrderLeads.forEach((l, idx) => l.turnRank = idx + 1);

  simLeads.forEach((l, index) => {
    const slotEl = document.querySelector(`.t1-slot[data-side="${l.side}"][data-idx="${l.realIdx}"]`);
    if (!slotEl) return;
    const slotFrame = slotEl.closest('.t1-slot-frame') || slotEl;
    const slotEffects = slotFrame.querySelector?.('.t1-slot-effects') || slotFrame;
    const isSlotKo = !canRemainOnBoard(l);
    slotEl.classList.toggle('t1-slot--ko', isSlotKo);
    slotFrame.classList.toggle('t1-slot-frame--ko', isSlotKo);
    
    const hasPriority = l.mon.set?.moves?.some(m => getPriority(m, l.mon) > 0);
    const orderBadge = document.createElement('div');
    orderBadge.className = `t1-slot-effect t1-slot-timeline-badge ${hasPriority ? 'has-priority' : ''}`;
    
    // Obtener rank actualizado
    const turnL = turnOrderLeads.find(t => t.realIdx === l.realIdx && t.side === l.side);
    const turnBlockReason = getHardTurnBlockReason(l.mon);
    orderBadge.innerHTML = canActThisTurn(l)
      ? `${hasPriority ? '<i data-lucide="zap"></i>' : ''}<span>${turnL ? turnL.turnRank : index + 1}</span>`
      : `<span>${canRemainOnBoard(l) ? 'STOP' : 'KO'}</span>`;
    if (turnBlockReason && canRemainOnBoard(l)) orderBadge.title = turnBlockReason;
    slotEffects.appendChild(orderBadge);
    
    const stageLabels = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Vel' };
    const stages = l.mon.battle?.stages || {};
    const stageEntries = Object.entries(stageLabels)
      .map(([key, label]) => ({ label, stage: stages[key] || 0 }))
      .filter(x => x.stage);
    stageEntries.slice(0, 2).forEach(({ label, stage }) => {
      const statBadge = document.createElement('div');
      statBadge.className = `t1-slot-effect t1-slot-stat-badge ${stage > 0 ? 'is-positive' : 'is-negative'}`;
      statBadge.textContent = `${stage > 0 ? '+' : ''}${stage} ${label}`;
      slotEffects.appendChild(statBadge);
    });
    if (stageEntries.length > 2) {
      const moreBadge = document.createElement('div');
      moreBadge.className = 't1-slot-effect t1-slot-stat-badge is-neutral';
      moreBadge.textContent = `+${stageEntries.length - 2}`;
      slotEffects.appendChild(moreBadge);
    }
    if (l.mon.battle?.protected) {
      const protectBadge = document.createElement('div');
      protectBadge.className = 't1-slot-effect t1-slot-protect-badge';
      protectBadge.innerHTML = '<i data-lucide="shield"></i>';
      slotEffects.appendChild(protectBadge);
    }
    if (turnBlockReason && canRemainOnBoard(l)) {
      const stopBadge = document.createElement('div');
      stopBadge.className = 't1-slot-effect t1-slot-stop-badge';
      stopBadge.textContent = turnBlockReason.includes('retrocede') ? 'Flinch' : (l.mon.battle?.status === 'slp' ? 'Sleep' : (l.mon.battle?.status === 'frz' ? 'Freeze' : 'Stop'));
      slotEffects.appendChild(stopBadge);
    } else if (l.mon.battle?.taunted) {
      const stopBadge = document.createElement('div');
      stopBadge.className = 't1-slot-effect t1-slot-stop-badge is-taunt';
      stopBadge.textContent = 'Mofa';
      slotEffects.appendChild(stopBadge);
    }
    
    const ability = (l.mon.set?.ability || l.mon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
    const weather = state.field.weather || (weathers.length > 0 ? weathers[0].type : null);
    const isActiveAbility = 
      (['intimidate', 'drought', 'drizzle', 'sandstream', 'snowwarning', 'psychicsurge', 'grassysurge', 'electricsurge', 'mistysurge'].includes(ability)) ||
      (weather === 'sun' && ability === 'chlorophyll') ||
      (weather === 'rain' && ability === 'swiftswim') ||
      (weather === 'sand' && ability === 'sandrush') ||
      (weather === 'snow' && ability === 'slushrush');
      
    if (isActiveAbility) {
      slotEl.classList.add('t1-slot-ability-glow');
    }
  });

    // --- ZONAS 1 a 4: RENDERIZADO DE ALTA EFICIENCIA ---

  // Ocultar paneles antiguos
  const mPanel = document.getElementById("momentumPanel");
  if (mPanel) mPanel.style.display = "none";

  // ZONA 1: Timeline de Velocidad (Con Speed Ties)
  let timelineHtml = `
    <div class="zone-timeline ${state.field.trickRoom ? 'trick-room-active' : ''}">
      <div class="tactical-timeline-track">
        ${`` + (() => {
          const renderTimelineNode = (l) => {
            const hasPriorityOption = !!l.hasPriorityOption;
            const ability = (l.mon.set?.ability || l.mon.ability || '').toLowerCase().replace(/\s/g, '');
            const obj = (l.mon.set?.item || '').toLowerCase().replace(/[^a-z]/g, '');
            const weather = state.field.weather || (weathers.length > 0 ? weathers[0].type : null);
            const isSun = weather === 'sun';
            const isRain = weather === 'rain';
            const isSand = weather === 'sand' || weather === 'sandstorm';
            const isSnow = weather === 'snow' || weather === 'hail';

            let modReason = null;
            let ringColor = null;

            if (isSand && ['sandrush', 'impetuarena'].includes(ability)) { modReason = 'Ímpetu Arena'; ringColor = '#B6A136'; }
            else if (isSun && ['chlorophyll', 'clorofila'].includes(ability)) { modReason = 'Clorofila'; ringColor = '#7AC74C'; }
            else if (isRain && ['swiftswim', 'nadorapido'].includes(ability)) { modReason = 'Nado Rápido'; ringColor = '#6390F0'; }
            else if (isSnow && ['slushrush', 'quitanieves'].includes(ability)) { modReason = 'Quitanieves'; ringColor = '#96D9D6'; }
            else if (obj === 'choicescarf' || obj === 'pañueloeleccion') { modReason = 'Pañuelo'; ringColor = '#A98FF3'; }
            else if ((l.side === 'self' && state.field.tailwindSelf) || (l.side === 'enemy' && state.field.tailwindEnemy)) { modReason = 'Viento Afín'; ringColor = '#96D9D6'; }

            const baseSpe = l.mon.baseStats?.speed || 100;

            let ringStyle = ringColor ? `box-shadow: 0 0 0 3px #1a1a24, 0 0 0 5px ${ringColor};` : '';
            let labelHtml = modReason ? `<div class="timeline-mod-label buff">${modReason}</div>` : '<div class="timeline-mod-label timeline-mod-label--ghost">Base</div>';
            let priorityHtml = hasPriorityOption ? `<div class="timeline-option-badge"><i data-lucide="zap"></i> Prioridad</div>` : '';

            return `
              <div class="timeline-node" title="${l.mon.displayName}">
                ${labelHtml}
                <div class="timeline-avatar" style="${ringStyle}">
                  <img src="${l.mon.sprite}" alt="${l.mon.displayName}">
                  <div class="timeline-side-badge ${l.side}"></div>
                </div>
                <div class="timeline-stats">
                  <div class="stat-eff" style="${l.spe < 0 ? 'color: var(--purple);' : ''}">${Math.abs(l.spe)}</div>
                  <div class="stat-base">Base ${baseSpe}</div>
                </div>
                ${priorityHtml}
              </div>
            `;
          };

          const groupedLeads = [];
          let currentGroup = [];
          turnOrderLeads.forEach(l => {
              if (currentGroup.length === 0) {
                  currentGroup.push(l);
              } else {
                  const last = currentGroup[currentGroup.length - 1];
                  if (last.spe === l.spe) {
                      currentGroup.push(l);
                  } else {
                      groupedLeads.push(currentGroup);
                      currentGroup = [l];
                  }
              }
          });
          if (currentGroup.length > 0) groupedLeads.push(currentGroup);

          return groupedLeads.map(group => {
             if (group.length > 1) {
                 return `
                   <div class="timeline-tie-box">
                     <div class="timeline-tie-label"><i data-lucide="zap"></i> Tie</div>
                     ${group.map(renderTimelineNode).join('')}
                   </div>
                 `;
             } else {
                 return renderTimelineNode(group[0]);
             }
          }).join('');
        })()}
      </div>
    </div>
  `;
  
  const FAKE_OUT_MOVES = new Set(['fakeout', 'sorpresa']);
  const fakeOutThreats = enemyLeads.filter(l => (l.mon.set?.moves || []).some(m => FAKE_OUT_MOVES.has(String(m).toLowerCase().replace(/[^a-z]/g, ''))));

  let allyOhkoThreats = new Set();

  // Primero calculamos las amenazas para el Emergency Switch
  for (const sObj of selfLeads) {
    for (const eObj of enemyLeads) {
      const atkE = bestAttack(eObj.mon, sObj.mon, simFieldLocal);
      if (atkE.ohko || atkE.ohkoProb > 50) allyOhkoThreats.add(sObj.mon.name);
    }
  }

  // Helpers ZONA 2 (Mobile-First) con Badges y Banquillo
  const renderMobileCombatantCard = (mon, side, isDouble) => {
    const typesHtml = (mon.types || []).map(t => {
      const typeLower = t.toLowerCase();
      const translatedType = typeof getTranslation === 'function' ? getTranslation(typeLower, 'type') || formatName(t) : formatName(t);
      const meta = TYPE_META[typeLower] || { color: '#8aa2c6', name: translatedType };
      return `<span style="background: ${hexToRgba(meta.color, 0.2)}; border: 1px solid ${hexToRgba(meta.color, 0.5)}; color: #fff; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; font-weight: bold; font-size: 9px;"><div class="type-icon-circle" style="position: static; width:10px; height:10px; background-color: ${meta.color}; box-shadow: none; margin: 0;"></div> ${translatedType}</span>`;
    }).join('');
    const ability = mon.set?.ability || mon.ability || 'Desconocida';
    const item = mon.set?.item || 'Sin objeto';
    const hpPct = Math.max(0, Math.min(100, Math.round(mon.battle?.hpPct ?? 100)));
    const status = mon.battle?.status || 'none';
    const isFainted = mon.fainted || hpPct <= 0;
    const isProtected = !!mon.battle?.protected;
    const hardBlockReason = getHardTurnBlockReason(mon);
    const isTurnBlocked = !!hardBlockReason && !isFainted;
    const hpTone = hpPct <= 25 ? 'danger' : (hpPct <= 55 ? 'warning' : 'healthy');
    const stateLineHtml = `
      <div class="combatant-state-line">
        <div class="combatant-hp combatant-hp--${hpTone}">
          <span style="width:${hpPct}%;"></span>
        </div>
        <b>${hpPct}%</b>
        ${isFainted ? `<em class="is-ko">Debilitado</em>` : (isTurnBlocked ? `<em class="is-blocked" title="${escapeHtml(hardBlockReason)}">No actúa</em>` : (isProtected ? `<em class="is-protected">Protegido</em>` : (status && status !== 'none' ? `<em>${formatBattleStatus(status)}</em>` : (mon.battle?.taunted ? `<em class="is-blocked">Mofa</em>` : ''))))}
      </div>`;

    const translatedAbility = typeof getTranslation === 'function' && ability !== 'Desconocida' ? getTranslation(ability, 'ability') || formatName(ability) : formatName(ability);
    const translatedItem = typeof getTranslation === 'function' && item !== 'Sin objeto' ? getTranslation(item, 'item') || formatName(item) : formatName(item);

    const abilitySlug = ability.toLowerCase().replace(/[^a-z]/g, '');
    const itemSlug = item.toLowerCase().replace(/[^a-z]/g, '');
    let isAbilityTriggered = false;

    // 1. Climas y Terrenos
    const weatherSetters = ['drought', 'sequia', 'drizzle', 'llovizna', 'sandstream', 'chorroarena', 'snowwarning', 'nevasca', 'psychicsurge', 'grassysurge', 'electricsurge', 'mistysurge'];
    if (weatherSetters.includes(abilitySlug)) isAbilityTriggered = true;

    // 2. Intimidación
    if (abilitySlug === 'intimidate' || abilitySlug === 'intimidacion') isAbilityTriggered = true;

    // 3. Anti-Intimidación
    const opposingHasIntimidate = (side === 'self' && enemyIntimidate) || (side === 'enemy' && selfIntimidate);
    const antiIntimidateAbilities = ['defiant', 'competitivo', 'innerfocus', 'focointerno', 'clearbody', 'cuerpopuro', 'hypercutter', 'guarddog'];
    if (antiIntimidateAbilities.includes(abilitySlug) && opposingHasIntimidate) {
        isAbilityTriggered = true;
    }

    // 4. Abusadores de Clima (Speed & Power Boosters)
    const activeWeather = (simFieldLocal.weather || '').toLowerCase();

    if (activeWeather.includes('sun') && ['chlorophyll', 'clorofila', 'solarpower', 'podersolar'].includes(abilitySlug)) {
        isAbilityTriggered = true;
    }
    if (activeWeather.includes('rain') && ['swiftswim', 'nadorapido'].includes(abilitySlug)) {
        isAbilityTriggered = true;
    }
    if ((activeWeather.includes('sand') || activeWeather.includes('sandstorm')) && ['sandrush', 'impetuarena', 'sandforce', 'poderarena', 'sandveil', 'veloarena'].includes(abilitySlug)) {
        isAbilityTriggered = true;
    }
    if ((activeWeather.includes('snow') || activeWeather.includes('hail')) && ['slushrush', 'quitanieves', 'snowcloak', 'mantoacueo'].includes(abilitySlug)) {
        isAbilityTriggered = true;
    }

    // 5. Supervivencia (Sturdy) o Inmunidad
    if (mon.battle?.turn1Triggers?.sturdy || mon.battle?.turn1Triggers?.abilityImmunity) {
        isAbilityTriggered = true;
    }
    const itemGlow = (mon.battle?.turn1Triggers?.sash || mon.battle?.turn1Triggers?.itemImmunity) ? ' glow-active' : '';

    // Determinar Badges
    let badgeHtml = '';
    let activeModifiersHtml = '';
    
    // Determinar Rol Táctico
    let tacticalRoleText = '';
    let tacticalRoleColor = 'var(--muted)';
    
    const movesLower = (mon.set?.moves || []).map(m => getMoveSlug(m));
    if (isFainted) {
        tacticalRoleText = 'Debilitado';
        tacticalRoleColor = 'var(--muted)';
    } else if (side === 'self' && (isDouble || allyOhkoThreats.has(mon.name))) {
        tacticalRoleText = 'Objetivo rival';
        tacticalRoleColor = 'var(--red)';
    } else if (side === 'enemy' && isDouble) {
        tacticalRoleText = 'Objetivo viable';
        tacticalRoleColor = 'var(--green)';
    } else if (side === 'enemy' && fakeOutThreats.some(fo => fo.mon.name === mon.name)) {
        tacticalRoleText = 'Amenaza Sorpresa';
        tacticalRoleColor = 'var(--orange)';
    } else if (movesLower.some(m => ['trickroom', 'espacioraro', 'tailwind', 'vientoafin', 'followme', 'senuelo', 'seuelo', 'ragepowder', 'polvoira', 'fakeout', 'sorpresa'].includes(m))) {
        tacticalRoleText = 'Support';
        tacticalRoleColor = 'var(--blue)';
    } else if ((mon.baseStats?.attack > 110) || (mon.baseStats?.['special-attack'] > 110)) {
        tacticalRoleText = 'Presión';
        tacticalRoleColor = 'var(--gold)';
        if (mon.baseStats?.hp < 80 && mon.baseStats?.defense < 80 && mon.baseStats?.['special-defense'] < 80) {
            tacticalRoleText = 'Wincon frágil';
            tacticalRoleColor = 'var(--purple)';
        }
    } else {
        tacticalRoleText = 'Flexible';
    }

    const roleBadgeHtml = `<div style="font-size: 0.6rem; text-transform: uppercase; font-weight: 800; letter-spacing: 0.5px; color: ${tacticalRoleColor}; border: 1px solid ${tacticalRoleColor}; padding: 1px 4px; border-radius: 4px; display: inline-block; margin-bottom: 2px;">${tacticalRoleText}</div>`;

    const atkStage = mon.battle?.stages?.atk || 0;
    if (atkStage > 0) {
       activeModifiersHtml += `<span style="background: rgba(48, 209, 88, 0.15); border: 1px solid rgba(48, 209, 88, 0.4); color: #d4ffe3; padding: 2px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: 800; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;">Atk +1 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg></span>`;
    } else if (atkStage < 0) {
       activeModifiersHtml += `<span style="background: rgba(255, 59, 48, 0.15); border: 1px solid rgba(255, 59, 48, 0.4); color: #ffc8c4; padding: 2px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: 800; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;">Atk -1 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>`;
    }

    if (activeModifiersHtml) {
        activeModifiersHtml = `<div class="combatant-modifiers" style="display: flex; flex-direction: row; gap: 4px; margin-top: 4px; flex-wrap: wrap;">${activeModifiersHtml}</div>`;
    }

    if (!isFainted && side === 'self') {
      const mySpeed = Math.abs((turnOrderLeads || []).find(l => l && l.mon && l.mon.name === mon?.name)?.spe || 0);
      const isFakeOutTarget = (fakeOutThreats || []).some(fo => Math.abs(fo.spe) > mySpeed);
      if (isFakeOutTarget && abilitySlug !== 'innerfocus') {
         badgeHtml += `<div class="badge-fakeout-alert pulse-anim"><i data-lucide="hand"></i></div>`;
      }
    }

    let emergencyBtnHtml = '';
    if (!isFainted && side === 'self' && allyOhkoThreats.has(mon.name)) {
        // Encontrar un reemplazo usando getSuggestedReserves
        // Pasamos offensive: false, y los datos del defensor
        const attackerName = enemyLeads[0]?.mon?.name || 'unknown';
        const reservesData = { offensive: false, defender: mon?.name, attacker: attackerName };
        const reserves = typeof getSuggestedReserves === 'function' ? getSuggestedReserves(reservesData) : [];
        const safeReserves = reserves.filter(r => r.category === 'safe' || r.category === 'pivot').sort((a,b) => a.worstPct - b.worstPct);
        if (safeReserves.length > 0) {
            const bestReserve = safeReserves[0].candidate;
            emergencyBtnHtml = `
              <button type="button" class="btn-emergency-switch" onclick="alert('Cambio táctico a ${formatName(bestReserve.displayName || bestReserve.name)} recomendado.')">
                <i data-lucide="arrow-left-right" style="width: 14px; height: 14px;"></i>
                <img src="${bestReserve.sprite}" style="width: 18px; height: 18px; object-fit: contain;">
                <span>Sugerencia: Cambiar a ${formatName(bestReserve.displayName || bestReserve.name)}</span>
              </button>
            `;
        }
    }

    return `
      <div class="mobile-combatant-card card-${side === 'self' ? 'ally' : 'enemy'} ${isFainted ? 'is-fainted' : ''}">
        ${!isFainted && isDouble ? `<div class="double-target-warning" style="top: -6px; right: 25px; left: auto; transform: none; font-size: 9px; padding: 2px 6px;">${side === 'self' ? 'EN RIESGO' : 'FOCO ÚTIL'}</div>` : ''}
        <div class="combatant-header" style="flex-direction: row; gap: 8px;">
          <div class="sprite-container" style="position: relative; display: inline-block;">
            <img src="${mon.sprite}" style="width: 40px; height: 40px; object-fit: cover; background: rgba(255,255,255,0.05); border-radius: 6px;">
            ${badgeHtml}
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: hidden;">
            ${roleBadgeHtml}
            <div class="combatant-name" style="font-size: 14px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${formatName(mon.displayName || mon.name)}</div>
            <div class="combatant-types" style="font-size: 10px;">${typesHtml}</div>
            ${activeModifiersHtml}
          </div>
        </div>
        ${stateLineHtml}
        <div class="combatant-footer" style="display: flex; flex-direction: row; gap: 4px;">
          <div class="badge-item${itemGlow}" onclick="showInfoTooltip(event, 'item', '${itemSlug}')" style="flex: 1;"><i data-lucide="package"></i> <span class="truncate">${translatedItem}</span></div>
          <div class="badge-ability ${isAbilityTriggered ? 'glow-active' : ''}" onclick="showInfoTooltip(event, 'ability', '${abilitySlug}')" style="flex: 1;"><i data-lucide="zap"></i> <span class="truncate">${translatedAbility}</span></div>
        </div>
        ${emergencyBtnHtml}
      </div>
    `;
  };

  const getPredictiveHpBar = (minPct, maxPct, ohkoProb, survivesAt1HP) => {
    if (survivesAt1HP) {
      return `
        <div class="predictive-hp-bar">
            <div class="hp-safe" style="width: 1%; background: #ff9500;"></div>
          <div class="hp-roll" style="width: 0%;"></div>
            <div class="hp-damage" style="width: 99%;"></div>
        </div>
      `;
    }
    const isOhko = minPct >= 100 || ohkoProb >= 100;
    if (isOhko) {
       return `
        <div class="predictive-hp-bar is-ohko">
          <div class="hp-lethal" style="width: 100%;"></div>
          <i data-lucide="skull" class="ohko-skull"></i>
        </div>
       `;
    }
    const damageW = Math.min(100, minPct);
      const maxClamped = Math.min(100, maxPct);
      const rollW = maxClamped - damageW;
      const safeW = 100 - maxClamped;
    return `
      <div class="predictive-hp-bar">
          <div class="hp-safe" style="width: ${safeW}%;"></div>
        <div class="hp-roll" style="width: ${rollW}%;"></div>
          <div class="hp-damage" style="width: ${damageW}%;"></div>
      </div>
    `;
  };

  let crossfireRowsHtml = '';
  let targetThreatsCount = {};
  let tacticalFeedHtml = '';
  
  const tacticalEventsMap = new Map();
  const allVectors = [];

  const checkSurvival = (atk, defMon) => {
    const defItem = (defMon.set?.item || defMon.item || '').toLowerCase().replace(/[^a-z]/g, '');
    const defAbility = (defMon.set?.ability || defMon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
    const hasSash = defItem === 'focussash' || defItem === 'bandafocus';
    const hasSturdy = defAbility === 'sturdy' || defAbility === 'robustez';
    const currentPct = Math.max(0, Math.min(100, Number(defMon.battle?.hpPct ?? 100)));
    const isFullHp = currentPct >= 99;
    const maxPct = Number(atk.maxPct ?? atk.maxDamagePct ?? 0);
    const minPct = Number(atk.minPct ?? 0);
    const isLethal = atk.ohko || atk.ohkoProb > 50 || maxPct >= currentPct || minPct >= currentPct;

    const isSavedBySash = hasSash && isFullHp && maxPct >= 100;
    const isSavedBySturdy = hasSturdy && isFullHp && maxPct >= 100;
    const survivesAt1HP = isSavedBySash || isSavedBySturdy;

    if (survivesAt1HP) {
        if (!defMon.battle) defMon.battle = {};
        if (!defMon.battle.turn1Triggers) defMon.battle.turn1Triggers = {};
        if (isSavedBySash) defMon.battle.turn1Triggers.sash = true;
        if (isSavedBySturdy) defMon.battle.turn1Triggers.sturdy = true;
    }

    return { survivesAt1HP, isSavedBySash, isSavedBySturdy, isLethal };
  };

  const getCrossfireBadge = (atkObj, survivesAt1HP) => {
    if (atkObj.immunityData) {
        return `<span class="vector-badge badge-immune" style="border-color: #666; color: #ccc;">🛡️ INM: ${formatName(atkObj.immunityData.name)}</span>`;
    }
    if (survivesAt1HP) return `<span class="vector-badge badge-sash">🛡️ 1 HP</span>`;
    if (atkObj.ohko || atkObj.ohkoProb >= 80) return `<span class="vector-badge badge-lethal">💀 OHKO</span>`;
    if (atkObj.mult >= 4) return `<span class="vector-badge badge-critical">💥 x4 Súper Eficaz</span>`;
    if (atkObj.mult >= 2) return `<span class="vector-badge badge-warning">⚠️ x2 Eficaz</span>`;
    if (atkObj.mult <= 0.25) return `<span class="vector-badge badge-immune" style="background: rgba(50, 173, 230, 0.2); color: #d4f0ff; border: 1px solid rgba(50, 173, 230, 0.4);">🛡️ x${atkObj.mult} Muy poco eficaz</span>`;
    if (atkObj.mult <= 0.5) return `<span class="vector-badge badge-immune" style="background: rgba(50, 173, 230, 0.2); color: #d4f0ff; border: 1px solid rgba(50, 173, 230, 0.4);">🛡️ x0.5 Poco eficaz</span>`;
    if (atkObj.blocked || atkObj.mult === 0) return `<span class="vector-badge badge-immune">🛡️ INM</span>`;
    return `<span class="vector-badge" style="background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.3);">⚖️ x1 Neutro</span>`;
  };

  const buildAllyVector = (sLead, eLead, atkMove, badgeHtml, speedHtml) => `
    <div class="crossfire-row vector-ally">
      <img src="${sLead.sprite}" class="sprite-micro" title="${sLead.displayName || sLead.name}">
      <div class="vector-line vector-line-right">
        <div style="display:flex; flex-direction:column; align-items:flex-end; line-height:1;">
          <span>${formatName(getTranslation(atkMove.move, "move") || atkMove.move)}</span>
          ${speedHtml}
        </div>
        <i data-lucide="arrow-right" style="width:14px; height:14px; flex-shrink: 0;"></i>
      </div>
      <img src="${eLead.sprite}" class="sprite-micro" title="${eLead.displayName || eLead.name}">
      ${badgeHtml}
    </div>
  `;

  const buildEnemyVector = (sLead, eLead, atkMove, badgeHtml, speedHtml) => `
    <div class="crossfire-row vector-enemy">
      <img src="${sLead.sprite}" class="sprite-micro" title="${sLead.displayName || sLead.name}">
      <div class="vector-line vector-line-left">
        <i data-lucide="arrow-left" style="width:14px; height:14px; flex-shrink: 0;"></i>
        <div style="display:flex; flex-direction:column; align-items:flex-start; line-height:1;">
          <span>${formatName(getTranslation(atkMove.move, "move") || atkMove.move)}</span>
          ${speedHtml}
        </div>
      </div>
      <img src="${eLead.sprite}" class="sprite-micro" title="${eLead.displayName || eLead.name}">
      ${badgeHtml}
    </div>
  `;

  const upsertTacticalEventTarget = (key, eventBase, targetPayload) => {
    if (!tacticalEventsMap.has(key)) {
      tacticalEventsMap.set(key, { ...eventBase, targets: [] });
    }
    const event = tacticalEventsMap.get(key);
    if (!event.targets.some((target) => target.defender.side === targetPayload.defender.side && Number(target.defender.realIdx) === Number(targetPayload.defender.realIdx))) {
      event.targets.push(targetPayload);
    }
    if (eventBase.effectDesc && !event.effectDesc) event.effectDesc = eventBase.effectDesc;
    if (eventBase.isSpread) event.isSpread = true;
  };

  for (const sObj of selfLeads) {
    for (const eObj of enemyLeads) {
      const s = sObj.mon;
      const e = eObj.mon;
      const speS = Number(sObj.spe) || 0;
      const speE = Number(eObj.spe) || 0;

      const atkS = bestAttack(s, e, simFieldLocal);
      const atkE = bestAttack(e, s, simFieldLocal);

      // Registrar Inmunidades para activar Glow
      if (atkS.immunityData) {
          if (!e.battle) e.battle = {};
          if (!e.battle.turn1Triggers) e.battle.turn1Triggers = {};
          if (atkS.immunityData.type === 'ability') e.battle.turn1Triggers.abilityImmunity = true;
          if (atkS.immunityData.type === 'item') e.battle.turn1Triggers.itemImmunity = true;
      }
      
      if (atkE.immunityData) {
          if (!s.battle) s.battle = {};
          if (!s.battle.turn1Triggers) s.battle.turn1Triggers = {};
          if (atkE.immunityData.type === 'ability') s.battle.turn1Triggers.abilityImmunity = true;
          if (atkE.immunityData.type === 'item') s.battle.turn1Triggers.itemImmunity = true;
      }

      const sPriority = getPriority(atkS.move, s);
      const ePriority = getPriority(atkE.move, e);

      let sFaster = false;
      if (sPriority > ePriority) sFaster = true; 
      else if (ePriority > sPriority) sFaster = false; 
      else sFaster = speS >= speE; 

      const survE = checkSurvival(atkS, e);
      const survS = checkSurvival(atkE, s);

      const isOhkoS = survE.isLethal && !survE.survivesAt1HP;
      const isThreatS = atkS.mult >= 1 || survE.isLethal;
      
      const isOhkoE = survS.isLethal && !survS.survivesAt1HP;
      const isThreatE = atkE.mult >= 1 || survS.isLethal;

      // ZONA 3: Radar de Fuego Cruzado (Mobile-First) con Health Bars
      if (isThreatS) {
        const moveName = formatName(getTranslation(atkS.move, "move") || atkS.move);
        targetThreatsCount[e.name] = (targetThreatsCount[e.name] || 0) + 1;
        
        allVectors.push({
            isAlly: true,
            attacker: sObj,
            defender: eObj,
            atk: atkS,
            surv: survE,
            prio: sPriority,
            prioD: ePriority,
            spe: speS,
            sortScore: sPriority * 10000 + speS
        });
      }

      // Añadir al feed táctico todos los movimientos evaluados (aliados)
      const sMoveSlug = (atkS.move || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const sKey = `${s.name}_${atkS.move}`;
      if (!tacticalEventsMap.has(sKey)) {
          tacticalEventsMap.set(sKey, {
              isAlly: true,
              attacker: sObj,
              move: atkS.move,
              type: atkS.type,
              rawMult: atkS.rawMult,
              wMul: atkS.wMul,
              terrMul: atkS.terrMul,
              tags: atkS.tags,
              isSpread: isCanonicalSpreadMove(sMoveSlug) || SPREAD_MOVES.has(sMoveSlug),
              prio: sPriority,
              spe: speS,
              sortScore: sPriority * 10000 + speS,
              targets: []
          });
      }
      tacticalEventsMap.get(sKey).targets.push({ defender: eObj, atk: atkS, surv: survE, isOhko: isOhkoS, speD: speE, prioD: ePriority });
      
      if (isThreatE) {
        const moveName = formatName(getTranslation(atkE.move, "move") || atkE.move);
        targetThreatsCount[s.name] = (targetThreatsCount[s.name] || 0) + 1;
        
        allVectors.push({
            isAlly: false,
            attacker: eObj,
            defender: sObj,
            atk: atkE,
            surv: survS,
            prio: ePriority,
            prioD: sPriority,
            spe: speE,
            sortScore: ePriority * 10000 + speE
        });
      }

      // Añadir al feed táctico todos los movimientos evaluados (rivales)
      const eMoveSlug = (atkE.move || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const eKey = `${e.name}_${atkE.move}`;
      if (!tacticalEventsMap.has(eKey)) {
          tacticalEventsMap.set(eKey, {
              isAlly: false,
              attacker: eObj,
              move: atkE.move,
              type: atkE.type,
              rawMult: atkE.rawMult,
              wMul: atkE.wMul,
              terrMul: atkE.terrMul,
              tags: atkE.tags,
              isSpread: isCanonicalSpreadMove(eMoveSlug) || SPREAD_MOVES.has(eMoveSlug),
              prio: ePriority,
              spe: speE,
              sortScore: ePriority * 10000 + speE,
              targets: []
          });
      }
      tacticalEventsMap.get(eKey).targets.push({ defender: sObj, atk: atkE, surv: survS, isOhko: isOhkoE, speD: speS, prioD: sPriority });
    }
  }

  // --- INYECTAR MOVIMIENTOS TÁCTICOS Y DE SOPORTE AL FEED ---
  const buildSpecificMovePreview = (attackerEntry, defenderMon, move, prio) => {
      const damageObj = estimateMoveDamage(
          attackerEntry.mon,
          defenderMon,
          { ...move, isSpread: true, priority: prio },
          simFieldLocal
      );
      const baseHP = calcMonHP(defenderMon);
      const hpPct = defenderMon.battle?.hpPct ?? 100;
      const defHP = Math.max(1, Math.floor((baseHP * hpPct) / 100));
      const rawMult = effectiveness(move.type || 'normal', defenderMon?.types || []);
      const maxDamage = Number.isFinite(damageObj.maxDamage) ? damageObj.maxDamage : (damageObj.damage || 0);
      const minDamage = Number.isFinite(damageObj.minDamage) ? damageObj.minDamage : Math.floor(maxDamage * 0.85);
      const maxPct = Math.min(100, Math.floor((maxDamage / defHP) * 100));
      const minPct = Math.min(100, Math.floor((minDamage / defHP) * 100));
      let ohkoProb = 0;
      if (maxDamage >= defHP) {
          if (minDamage >= defHP) ohkoProb = 100;
          else ohkoProb = Math.floor(((maxDamage - defHP) / Math.max(1, maxDamage - minDamage)) * 100);
      }
      return {
          type: move.type || 'normal',
          mult: damageObj.blocked ? 0 : rawMult * (damageObj.wMul || 1) * (damageObj.terrMul || 1),
          rawMult,
          wMul: damageObj.wMul || 1,
          terrMul: damageObj.terrMul || 1,
          blocked: !!damageObj.blocked,
          move: move.move,
          power: move.power || 0,
          damage: maxDamage,
          minPct,
          maxPct,
          ohkoProb,
          ohko: ohkoProb > 0,
          registry: damageObj.registry || null,
          immunityData: damageObj.immunityData || null,
          tags: damageObj.tags || [],
      };
  };

  const registerSpreadMoveCoverage = (entry, defenders) => {
      const moves = getMoveCandidates(entry.mon)
          .filter(move => move && (move.isSpread || isCanonicalSpreadMove(move.move) || SPREAD_MOVES.has(getMoveSlug(move.move)) || SPREAD_MOVES.has(String(move.move || '').toLowerCase())));
      moves.forEach((move) => {
          const prio = getPriority(move.move, entry.mon);
          const key = `${entry.mon.name}_${move.move}`;
          const eventBase = {
              isAlly: entry.side === 'self',
              attacker: entry,
              move: move.move,
              type: move.type,
              rawMult: 1,
              wMul: 1,
              terrMul: 1,
              tags: move.tags || [],
              isSpread: true,
              prio,
              spe: Number(entry.spe) || 0,
              sortScore: prio * 10000 + (Number(entry.spe) || 0),
              targets: []
          };
          defenders.forEach((defenderEntry) => {
              if (!defenderEntry?.mon || !canRemainOnBoard(defenderEntry)) return;
              const atk = buildSpecificMovePreview(entry, defenderEntry.mon, move, prio);
              const surv = checkSurvival(atk, defenderEntry.mon);
              upsertTacticalEventTarget(key, eventBase, {
                  defender: defenderEntry,
                  atk,
                  surv,
                  isOhko: surv.isLethal && !surv.survivesAt1HP,
                  speD: Number(defenderEntry.spe) || 0,
                  prioD: Math.max(0, ...((defenderEntry.mon.set?.moves || []).filter(Boolean).map((candidateMove) => getPriority(candidateMove, defenderEntry.mon)))),
              });
          });
      });
  };
  selfLeads.forEach((entry) => registerSpreadMoveCoverage(entry, enemyLeads));
  enemyLeads.forEach((entry) => registerSpreadMoveCoverage(entry, selfLeads));

  const KEY_TACTICAL_MOVES = {
      'fakeout': "EFECTO: FLINCH",
      'sorpresa': "EFECTO: FLINCH",
      'trickroom': "CONTROL: ESPACIO RARO",
      'espacioraro': "CONTROL: ESPACIO RARO",
      'tailwind': "CONTROL: VIENTO AFÍN",
      'vientoafin': "CONTROL: VIENTO AFÍN",
      'followme': "REDIRECCIÓN",
      'señuelo': "REDIRECCIÓN",
      'ragepowder': "REDIRECCIÓN",
      'polvoira': "REDIRECCIÓN",
      'spore': "ESTADO: SUEÑO",
      'espora': "ESTADO: SUEÑO",
      'taunt': "ESTADO: MOFA",
      'mofa': "ESTADO: MOFA",
      'partingshot': "PIVOT / DEBUFF",
      'ultimapalabra': "PIVOT / DEBUFF",
      'icywind': "SPEED DROP",
      'vientohielo': "SPEED DROP",
      'electroweb': "SPEED DROP",
      'redviscosa': "SPEED DROP",
      'willowisp': "ESTADO: QUEMADURA",
      'fuegofatuo': "ESTADO: QUEMADURA",
      'thunderwave': "ESTADO: PARÁLISIS",
      'ondatrueno': "ESTADO: PARÁLISIS",
      'protect': "PROTECCIÓN",
      'proteccion': "PROTECCIÓN",
      'detect': "PROTECCIÓN",
      'deteccion': "PROTECCIÓN",
      'wideguard': "PROTECCIÓN ÁREA",
      'vastaguardia': "PROTECCIÓN ÁREA",
      'quickguard': "PROTECCIÓN PRIOR.",
      'anticipo': "PROTECCIÓN PRIOR.",
      'spikyshield': "PROTECCIÓN + DAÑO",
      'barreraespinosa': "PROTECCIÓN + DAÑO",
      'kingsshield': "PROTECCIÓN + DEBUFF",
      'escudoreal': "PROTECCIÓN + DEBUFF"
  };

  for (const lObj of simLeads) {
      const moves = lObj.mon.set?.moves || [];
      for (const m of moves) {
          if (!m) continue;
          const slug = getMoveSlug(m);
          if (KEY_TACTICAL_MOVES[slug]) {
              const key = `${lObj.mon.name}_${m}`;
              if (!tacticalEventsMap.has(key)) {
                  const prio = getPriority(m, lObj.mon);
                  const moveData = window.GameDB?.moves?.[slug] || { type: 'normal' };
                  
                  tacticalEventsMap.set(key, {
                      isAlly: lObj.side === 'self',
                      attacker: lObj,
                      move: m,
                      type: moveData.type,
                      rawMult: 1,
                      wMul: 1,
                      terrMul: 1,
                      tags: [],
                      isSpread: false,
                      prio: prio,
                      spe: Number(lObj.spe) || 0,
                      sortScore: prio * 10000 + (Number(lObj.spe) || 0),
                      targets: [],
                      isSupport: true,
                      effectDesc: KEY_TACTICAL_MOVES[slug]
                  });
              } else {
                  // Si ya existía por ser un ataque (ej. Fake Out, Icy Wind) le sumamos la info táctica
                  tacticalEventsMap.get(key).effectDesc = KEY_TACTICAL_MOVES[slug];
              }
          }
      }
  }

  const getTacticalEventUseScore = (event) => {
      let score = 0;
      if (event.effectDesc) score += 220;
      if (event.effectDesc?.includes('FLINCH')) score += 180;
      if (event.effectDesc?.includes('PROTECCI')) score += 120;
      if (event.effectDesc?.includes('ESPACIO RARO') || event.effectDesc?.includes('VIENTO')) score += 140;
      if (event.isSupport) score += 60;
      (event.targets || []).forEach(t => {
          if (t.isOhko) score += 260;
          if (t.surv?.survivesAt1HP) score += 140;
          if (t.atk?.immunityData) score += 110;
          score += Math.min(120, Number(t.atk?.maxPct) || 0);
          if (!event.isAlly && targetThreatsCount[t.defender.mon.name] >= 2) score += 180;
      });
      if (event.isSpread) score += 45;
      return score;
  };

  const tacticalEvents = Array.from(tacticalEventsMap.values()).map(event => ({
      ...event,
      useScore: getTacticalEventUseScore(event)
  }));
  tacticalEvents.sort((a, b) => {
      if (b.prio !== a.prio) return b.prio - a.prio;
      if (b.spe !== a.spe) return b.spe - a.spe;
      if (b.useScore !== a.useScore) return b.useScore - a.useScore;
      if (a.isAlly !== b.isAlly) return a.isAlly ? -1 : 1;
      return String(a.move || '').localeCompare(String(b.move || ''));
  });
  tacticalEvents.forEach((event, idx) => {
      event.sequenceRank = idx + 1;
  });

  const getSupportMoveTargetMode = (moveName) => {
      const slug = getMoveSlug(moveName);
      if (['fakeout', 'sorpresa', 'spore', 'espora', 'taunt', 'mofa', 'partingshot', 'ultimapalabra', 'willowisp', 'fuegofatuo', 'thunderwave', 'ondatrueno', 'toxic', 'toxico'].includes(slug)) {
          return 'opponent';
      }
      if (['icywind', 'vientohielo', 'electroweb', 'redviscosa', 'bulldoze'].includes(slug)) {
          return 'opponents';
      }
      return 'field';
  };

  const getSupportMoveTargetEntries = (event) => {
      const mode = getSupportMoveTargetMode(event.move);
      if (mode === 'field') return [];
      return event.attacker.side === 'self' ? enemyLeads : selfLeads;
  };

  const renderSupportTargetPicker = (event) => {
      const mode = getSupportMoveTargetMode(event.move);
      const targets = getSupportMoveTargetEntries(event);
      if (mode === 'field') {
          return buildActionControl(event.attacker, event.move, 'Aplicar efecto de campo', 't1-feed-apply-btn');
      }
      if (mode === 'opponents') {
          const opposingSide = event.attacker.side === 'self' ? 'enemy' : 'self';
          return `
            <div class="t1-target-picker">
              <div class="t1-target-picker__label">
                <i data-lucide="waves"></i>
                <span>Movimiento de area: actualiza dano y efectos sobre ambos rivales activos.</span>
              </div>
              ${buildActionControl(event.attacker, event.move, 'Aplicar a ambos rivales', 't1-feed-apply-btn', `data-target-mode="spread-foes" data-target-side="${opposingSide}"`)}
            </div>`;
      }
      if (!targets.length) {
          return `<div class="t1-target-picker is-empty"><i data-lucide="ban"></i><span>No hay objetivos activos para aplicar este efecto.</span></div>`;
      }
      const helper = mode === 'opponents'
          ? 'Movimiento de zona: aplica el efecto a cada rival que quieras registrar.'
          : 'Elige el objetivo exacto para que PS, estados y cálculos siguientes sean coherentes.';
      return `
        <div class="t1-target-picker">
          <div class="t1-target-picker__label">
            <i data-lucide="crosshair"></i>
            <span>${helper}</span>
          </div>
          <div class="t1-target-picker__options">
            ${targets.map(t => `
              ${buildActionControl(
                event.attacker,
                event.move,
                formatName(t.mon.displayName || t.mon.name),
                't1-target-choice-btn',
                `data-target-side="${t.side}" data-target-idx="${t.realIdx}"`
              ).replace('<span>', `<img src="${t.mon.sprite}" alt=""> <span>`)}
            `).join('')}
          </div>
        </div>`;
  };

  const buildFeedCard = (event) => {
      const isAlly = event.isAlly;
      const glowColor = isAlly ? 'var(--blue)' : (event.isSupport ? 'var(--orange)' : 'var(--red)');
      
      const moveName = formatName(getTranslation(event.move, "move") || event.move);
      const moveSlug = (event.move || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const moveData = window.GameDB?.moves?.[moveSlug] || {};
      const dmgClass = moveData.damageClass === 'physical' ? 'Físico' : (moveData.damageClass === 'special' ? 'Especial' : 'Estado');
      const sequenceBadge = `<span class="t1-sequence-badge" title="Orden estimado de resolución">#${event.sequenceRank || '?'}</span>`;
      const tempoBadge = `<span class="tag-pill t1-tempo-pill">${event.prio ? `Prio ${event.prio > 0 ? '+' : ''}${event.prio}` : `Vel ${Math.abs(event.spe || 0)}`}</span>`;
      const visualState = getActionVisualState(event.attacker, event.move, 'Aplicar');
      const visualTitle = visualState.state === 'priority-ready' ? 'Prioridad disponible' : (visualState.state === 'ready' ? 'Listo para actuar' : visualState.label);
      const visualDetail = escapeHtml(visualState.detail || '');
      const actionStatusHtml = `
        <div class="t1-action-status t1-action-status--${visualState.state}">
          <span><i data-lucide="${visualState.icon}"></i>${visualTitle}</span>
          <small>${visualDetail}</small>
        </div>`;

      const itemSlug = (event.attacker.mon.set?.item || event.attacker.mon.item || '').toLowerCase().replace(/[^a-z]/g, '');
      const isMega = event.attacker.mon.name.includes('-mega') || !!MEGA_STONES[itemSlug];
      const megaIcon = isMega ? `<div class="mega-icon" style="position:static; display:flex; align-items:center; justify-content:center; width:16px; height:16px; margin: 0 4px; flex-shrink:0;" title="Megaevolución activa"></div>` : '';

      const isChoice = ['choicescarf', 'choiceband', 'choicespecs', 'pañueloeleccion', 'cintaelegida', 'gafaseleccion'].includes(itemSlug);

      let innerHtml = '';
      
      if (event.targets && event.targets.length > 0) {
          innerHtml = event.targets.map(t => {
              const isLethal = t.isOhko;
              const koInfo = evaluateKoConditions(event.attacker.mon, t.defender.mon, t.atk, {
                  field: simFieldLocal,
                  attackerSide: event.attacker.side,
                  defenderSide: t.defender.side,
                  attackerEntry: event.attacker,
                  defenderEntry: t.defender,
                  attackerPriority: event.prio,
                  defenderPriority: t.prioD,
                  maxVisible: 3
              });
              const koChipsHtml = renderKoConditionChips(koInfo);
              let hpBarHtml = '';
              let dmgLabel = '';

              if (t.surv.survivesAt1HP) {
                  hpBarHtml = `<div style="width:100%; height:8px; background:rgba(0,0,0,0.5); border-radius:4px; display:flex; overflow:hidden; margin-top:4px;"><div style="width:1%; background:var(--green);"></div><div style="width:99%; background:var(--red);"></div></div>`;
                  dmgLabel = `<strong style="color:var(--gold);">SOBREVIVE (FOCUS)</strong>`;
              } else if (isLethal || t.atk.minPct >= 100) {
                  hpBarHtml = `<div style="width:100%; height:8px; background:rgba(0,0,0,0.5); border-radius:4px; display:flex; overflow:hidden; margin-top:4px;"><div style="width:100%; background:var(--red);"></div></div>`;
                  dmgLabel = `<strong style="color:var(--red);">100%</strong>`;
              } else {
                  const maxC = Math.min(100, t.atk.maxPct || 0);
                  const safeW = 100 - maxC;
                  hpBarHtml = `<div style="width:100%; height:8px; background:rgba(0,0,0,0.5); border-radius:4px; display:flex; overflow:hidden; margin-top:4px;"><div style="width:${safeW}%; background:var(--green);"></div><div style="width:${maxC}%; background:var(--red);"></div></div>`;
                  dmgLabel = `<strong style="color:#fff;">${t.atk.minPct}-${t.atk.maxPct}%</strong>`;
              }

              let outspeedBadge = '';
              if (event.prio > t.prioD) outspeedBadge = `<span class="tag-pill tag-pill--success" style="font-size: 0.65rem;"><i data-lucide="zap" style="width:10px;height:10px;"></i> Prio</span>`;
              else if (event.prio < t.prioD) outspeedBadge = `<span class="tag-pill tag-pill--danger" style="font-size: 0.65rem;"><i data-lucide="alert-triangle" style="width:10px;height:10px;"></i> -Prio</span>`;
              else if (event.spe > t.speD) outspeedBadge = `<span class="tag-pill tag-pill--success" style="font-size: 0.65rem;"><i data-lucide="fast-forward" style="width:10px;height:10px;"></i> Antes</span>`;
              else if (event.spe < t.speD) outspeedBadge = `<span class="tag-pill tag-pill--danger" style="font-size: 0.65rem;"><i data-lucide="skip-back" style="width:10px;height:10px;"></i> Después</span>`;
              else outspeedBadge = `<span class="tag-pill tag-pill--warning" style="font-size: 0.65rem;"><i data-lucide="help-circle" style="width:10px;height:10px;"></i> Speed Tie</span>`;

              return `
              <details style="padding: 12px; cursor: pointer;">
                 <summary style="display: flex; flex-direction: column; list-style: none;">
                   <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-family: var(--poke-stat-font); margin-bottom: 6px;">
                     <div style="display: flex; align-items: center; gap: 8px;">
                       ${sequenceBadge}
                       <img src="${event.attacker.mon.sprite}" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));" title="${event.attacker.mon.displayName || event.attacker.mon.name}">
                       ${megaIcon}
                       <strong style="text-transform: uppercase; font-size: 0.9rem;">${moveName}</strong>
                       <i data-lucide="arrow-right" style="width:16px;height:16px;color:var(--muted); margin: 0 4px;"></i>
                       <img src="${t.defender.mon.sprite}" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));" title="${t.defender.mon.displayName || t.defender.mon.name}">
                     </div>
                     ${outspeedBadge}
                   </div>
                   
                   <div style="display:flex; gap:6px; margin-bottom: 8px; align-items: center; flex-wrap: wrap;">
                     ${tempoBadge}
                     ${event.type ? typeChip(event.type) : ''}
                     ${event.isSpread ? `<span class="tag-pill tag-pill--info" style="font-size: 0.6rem;">Area x2</span>` : ''}
                     <span class="tag-pill" style="background: rgba(255,255,255,0.1); color: #fff; font-size: 0.6rem; padding: 2px 6px; border: 1px solid rgba(255,255,255,0.2);">${dmgClass}</span>
                     ${t.atk.mult !== undefined ? getEffectivenessBadgeHtml(t.atk.mult) : ''}
                   </div>

                   ${hpBarHtml}
                   <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-top: 8px; color: var(--muted);">
                     <span>Daño Estimado: ${dmgLabel}</span>
                     <span style="font-size: 0.6rem; color: var(--muted); display:flex; align-items:center; gap:4px;"><i data-lucide="chevron-down" style="width:12px;height:12px;"></i> Detalles</span>
                   </div>
                 </summary>

                 <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); display:flex; flex-direction:column; gap:8px;">
                   <div style="display:flex; gap:6px; align-items: center; flex-wrap: wrap;">
                     ${event.prio !== 0 ? `<span class="tag-pill" style="background: var(--gold); color: #000; font-size: 0.6rem; padding: 2px 6px;">Prio ${event.prio > 0 ? '+'+event.prio : event.prio}</span>` : ''}
                     ${isChoice ? `<span class="tag-pill tag-pill--danger" style="font-size: 0.6rem; padding: 2px 6px;"><i data-lucide="lock" style="width:10px;height:10px; margin-right:4px;"></i> Bloqueado en ${moveName}</span>` : ''}
                   </div>
                   ${koChipsHtml}
                   ${buildActionControl(event.attacker, event.move, 'Aplicar a la simulación', 't1-feed-apply-btn', `data-target-side="${t.defender.side}" data-target-idx="${t.defender.realIdx}"`)}
                 </div>
              </details>
              `;
          }).join('<div style="height: 1px; background: var(--line); margin: 0 12px;"></div>');
      } else {
          innerHtml = `
            <div style="display: flex; flex-direction: column; padding: 12px;">
                 <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85rem; font-family: var(--poke-stat-font); margin-bottom: 6px;">
                   <div style="display: flex; align-items: center; gap: 8px;">
                     ${sequenceBadge}
                     <img src="${event.attacker.mon.sprite}" style="width: 32px; height: 32px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));" title="${event.attacker.mon.displayName || event.attacker.mon.name}">
                     ${megaIcon}
                     <strong style="text-transform: uppercase; font-size: 0.9rem; color: var(--orange);">${moveName}</strong>
                   </div>
                 </div>
                 
                 <div style="display:flex; gap:6px; margin-bottom: 4px; align-items: center; flex-wrap: wrap;">
                   ${tempoBadge}
                   ${event.type ? typeChip(event.type) : ''}
                   ${event.isSpread ? `<span class="tag-pill tag-pill--info" style="font-size: 0.6rem;">Area x2</span>` : ''}
                   ${event.prio !== 0 ? `<span class="tag-pill" style="background: var(--gold); color: #000; font-size: 0.6rem; padding: 2px 6px;">Prio ${event.prio > 0 ? '+'+event.prio : event.prio}</span>` : ''}
                   <span class="tag-pill" style="background: rgba(255,255,255,0.1); color: #fff; font-size: 0.6rem; padding: 2px 6px; border: 1px solid rgba(255,255,255,0.2);">${dmgClass}</span>
                   ${isChoice ? `<span class="tag-pill tag-pill--danger" style="font-size: 0.6rem; padding: 2px 6px;"><i data-lucide="lock" style="width:10px;height:10px; margin-right:4px;"></i> Bloqueado en ${moveName}</span>` : ''}
                   ${event.effectDesc ? `<span class="tag-pill tag-pill--warning" style="font-size: 0.65rem;">${event.effectDesc}</span>` : ''}
                 </div>
                 ${renderSupportTargetPicker(event)}
              </div>
          `;
      }

      return `
      <article class="tactical-feed-card t1-action-card t1-action-card--${visualState.state} t1-action-card--${isAlly ? 'ally' : 'enemy'}" style="border-left: 4px solid ${glowColor}; box-shadow: -4px 0 16px ${hexToRgba(glowColor, 0.15)}; background: rgba(0,0,0,0.25); border-radius: 12px; margin-bottom: 12px; overflow: hidden; border-top: 1px solid var(--line); border-right: 1px solid var(--line); border-bottom: 1px solid var(--line);">
        ${actionStatusHtml}
        ${innerHtml}
      </article>
      `;
  };

  const isCriticalEvent = (event) => {
      if (event.effectDesc && (event.effectDesc.includes("FLINCH") || event.effectDesc.includes("PROTECCIÓN") || event.effectDesc.includes("ESPACIO RARO"))) return true;
      if (event.prio !== 0) return true;
      if (event.targets && event.targets.length > 0) {
          for (const t of event.targets) {
              if (t.surv && t.surv.survivesAt1HP) return true;
              if (t.atk && t.atk.immunityData) return true;
              if (!event.isAlly && targetThreatsCount[t.defender.mon.name] >= 2) return true;
              if (t.isOhko && (!event.isAlly || (event.prio < t.prioD) || (event.prio === t.prioD && event.spe < t.speD))) return true;
          }
      }
      return false;
  };

  let criticalCardsHtml = tacticalEvents.map(buildFeedCard).join('');
  let exchangeCardsHtml = '';

  const renderVectorRow = (v) => {
      const isSpread = v.atk.move && (isCanonicalSpreadMove(v.atk.move) || SPREAD_MOVES.has(String(v.atk.move).toLowerCase().replace(/[^a-z0-9]/g, '')));
      const spreadBadge = isSpread ? `<span class="tag-pill tag-pill--info" style="font-size:0.55rem; padding:1px 4px; margin-left:4px; background:#444; border:1px solid #666; color:#ddd;">Spread 0.75x</span>` : '';
      
      let rollText = '';
      if (v.atk.minPct !== undefined && v.atk.maxPct !== undefined) {
          if (v.atk.minPct >= 100 || v.atk.ohko) {
               // Letal, no requiere texto de roll aquí
          } else if (v.atk.ohkoProb > 0) {
               rollText = `<span style="font-size: 0.65rem; color: var(--orange); margin-left: 6px; font-weight: 700; white-space: nowrap;">[${v.atk.minPct}% - ${v.atk.maxPct}%] (${v.atk.ohkoProb}% KO)</span>`;
          } else {
               rollText = `<span style="font-size: 0.65rem; color: var(--muted); margin-left: 6px; white-space: nowrap;">[${v.atk.minPct}% - ${v.atk.maxPct}%]</span>`;
          }
      }

      const badgeHtml = getCrossfireBadge(v.atk, v.surv.survivesAt1HP);
      const koInfo = evaluateKoConditions(v.attacker.mon, v.defender.mon, v.atk, {
          field: simFieldLocal,
          attackerSide: v.attacker.side,
          defenderSide: v.defender.side,
          attackerEntry: v.attacker,
          defenderEntry: v.defender,
          attackerPriority: v.prio,
          defenderPriority: v.prioD,
          maxVisible: 3
      });
      const koChipsHtml = renderKoConditionChips(koInfo, { compact: true });
      const prioText = v.prio !== 0 ? `<span style="color:var(--gold);">[Prio ${v.prio > 0 ? '+'+v.prio : v.prio}]</span>` : '';
      const focusText = (!v.isAlly && targetThreatsCount[v.defender.mon.name] >= 2) ? `<span style="color:var(--red); font-weight:bold; font-size:0.6rem; margin-right:4px;">⚠️ FOCO</span>` : '';
      const speedHtml = `<span style="font-size:0.55rem; color:var(--muted); display:flex; gap:4px; align-items:center; justify-content:center; margin-top:2px;">${focusText} ${prioText} Vel ${Math.abs(v.spe)}</span>`;

      const moveName = formatName(getTranslation(v.atk.move, "move") || v.atk.move);
      const atkMon = v.attacker.mon;
      const defMon = v.defender.mon;
      const rowClass = v.isAlly ? "vector-ally" : "vector-enemy";
      const lineClass = v.isAlly ? "vector-line-right" : "vector-line-left";

      return `
      <div class="crossfire-row ${rowClass}">
        <img src="${atkMon.sprite}" class="sprite-micro" title="${atkMon.displayName || atkMon.name}">
        <div class="vector-line ${lineClass}">
          <div style="display:flex; flex-direction:column; align-items:center; line-height:1.2;">
            <div style="display:flex; align-items:center; gap: 4px;">
                <span style="font-weight: 800;">${moveName}</span> ${spreadBadge} ${rollText}
            </div>
            ${koChipsHtml}
            ${speedHtml}
          </div>
          <i data-lucide="arrow-right" style="width:14px; height:14px; flex-shrink: 0; margin-left: 4px; color: inherit;"></i>
        </div>
        <img src="${defMon.sprite}" class="sprite-micro" title="${defMon.displayName || defMon.name}">
        ${badgeHtml}
        ${isSpread
          ? buildActionControl(v.attacker, v.atk.move, 'Aplicar area', 't1-apply-move-btn', `data-target-mode="spread-foes" data-target-side="${v.defender.side}"`)
          : buildActionControl(v.attacker, v.atk.move, 'Aplicar', 't1-apply-move-btn', `data-target-side="${v.defender.side}" data-target-idx="${v.defender.realIdx}"`)}
      </div>`;
  };

  allVectors.sort((a, b) => b.sortScore - a.sortScore);
  
  const guaranteedKOs = allVectors.filter(v => v.atk.ohko || v.atk.minPct >= 100);
  const possibleKOs = allVectors.filter(v => !v.atk.ohko && v.atk.minPct < 100 && v.atk.ohkoProb > 0);
  const warnings = allVectors.filter(v => !v.atk.ohko && v.atk.ohkoProb === 0);

  let crossfireGroupsHtml = '';
  if (guaranteedKOs.length > 0) {
      crossfireGroupsHtml += `
          <details open style="margin-bottom: 8px; background: rgba(255, 59, 48, 0.05); border: 1px solid rgba(255, 59, 48, 0.2); border-radius: 8px; padding: 4px;">
              <summary style="font-size: 0.75rem; font-weight: 800; color: var(--red); cursor: pointer; padding: 4px; display: flex; align-items: center;"><i data-lucide="skull" style="width:14px; height:14px; margin-right:4px;"></i> KOs Garantizados</summary>
              <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px;">${guaranteedKOs.map(renderVectorRow).join('')}</div>
          </details>
      `;
  }
  if (possibleKOs.length > 0) {
      crossfireGroupsHtml += `
          <details open style="margin-bottom: 8px; background: rgba(255, 179, 77, 0.05); border: 1px solid rgba(255, 179, 77, 0.2); border-radius: 8px; padding: 4px;">
              <summary style="font-size: 0.75rem; font-weight: 800; color: var(--orange); cursor: pointer; padding: 4px; display: flex; align-items: center;"><i data-lucide="dice-5" style="width:14px; height:14px; margin-right:4px;"></i> Posibles KOs (Rolls)</summary>
              <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px;">${possibleKOs.map(renderVectorRow).join('')}</div>
          </details>
      `;
  }
  if (warnings.length > 0) {
      crossfireGroupsHtml += `
          <details open style="margin-bottom: 8px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 4px;">
              <summary style="font-size: 0.75rem; font-weight: 800; color: var(--muted); cursor: pointer; padding: 4px; display: flex; align-items: center;"><i data-lucide="alert-triangle" style="width:14px; height:14px; margin-right:4px;"></i> Advertencias (Presión/Ties)</summary>
              <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px;">${warnings.map(renderVectorRow).join('')}</div>
          </details>
      `;
  }

  crossfireRowsHtml = crossfireGroupsHtml;

  // ZONA 2 & 3: Roster Grid + Radar (Mobile-First)
  let rosterGridHtml = `
    <div class="mobile-roster-grid">
      ${visibleSelfLeads.map(l => {
         const isDouble = canActThisTurn(l) && allVectors.filter(v => !v.isAlly && v.defender.side === 'self' && v.defender.mon.name === l.mon.name).length >= 2;
         return renderMobileCombatantCard(l.mon, 'self', isDouble);
      }).join('')}
      ${visibleEnemyLeads.map(l => {
         const isDouble = canActThisTurn(l) && allVectors.filter(v => v.isAlly && v.defender.side === 'enemy' && v.defender.mon.name === l.mon.name).length >= 2;
         return renderMobileCombatantCard(l.mon, 'enemy', isDouble);
      }).join('')}
    </div>
  `;

  let crossfireSectionHtml = crossfireRowsHtml ? `
    <div class="t1-crossfire-section">
      <div class="t1-zone-heading t1-zone-heading--danger">
        <span><i data-lucide="radar"></i> Vectores de amenaza</span>
        <p>Quién amenaza a quién, con qué daño y si el KO queda negado por Focus Sash, Sturdy o inmunidad.</p>
      </div>
      <div class="crossfire-list">
        ${crossfireRowsHtml}
      </div>
    </div>
  ` : '';

  const renderFieldBtn = (kind, value, label, icon, active, side = '') => `
    <button type="button" class="t1-field-btn ${active ? 'is-active' : ''}" data-t1-field-kind="${kind}" data-t1-field-value="${value}" ${side ? `data-t1-side="${side}"` : ''}>
      <i data-lucide="${icon}"></i>
      <span>${label}</span>
    </button>`;
  const pendingNormalQueue = session.active ? getTurn1PendingActionQueue() : [];
  const nextNormalActor = pendingNormalQueue[0] || null;
  const openPriorityEntries = [...visibleSelfLeads, ...visibleEnemyLeads]
    .filter(canActThisTurn)
    .filter(entry => !hasTurnActionBeenUsed(entry.side, entry.realIdx))
    .map(entry => {
      const moves = (entry.mon.set?.moves || []).filter(move => getPriority(move, entry.mon) > 0 && !getActionBlockReason(entry.mon, move) && !getTurn1ActionOrderBlock(entry.side, entry.realIdx, move));
      return moves.length ? { entry, move: moves.sort((a, b) => getPriority(b, entry.mon) - getPriority(a, entry.mon))[0] } : null;
    })
    .filter(Boolean);
  const pendingSwitchPrompt = session.pendingSwitch
    ? `${formatName(session.pendingSwitch.sourceName || state[session.pendingSwitch.side]?.[session.pendingSwitch.sourceIdx]?.displayName || state[session.pendingSwitch.side]?.[session.pendingSwitch.sourceIdx]?.name || 'Ese Pokemon')} debe salir ahora`
    : '';
  const turnCursorHtml = session.active ? `
    <div class="t1-turn-cursor">
      <div class="t1-turn-cursor__main">
        <span><i data-lucide="sparkles"></i> Ventana actual</span>
        <strong>${session.pendingSwitch ? pendingSwitchPrompt : (nextNormalActor ? `${formatName(nextNormalActor.mon.displayName || nextNormalActor.mon.name)} por ${describeTurnPriority(0, nextNormalActor.spe)}` : 'Sin acciones pendientes')}</strong>
      </div>
      ${session.pendingSwitch ? `<div class="t1-turn-cursor__pending"><i data-lucide="repeat"></i><span>Selecciona el relevo en el tablero activo para continuar el turno.</span></div>` : ''}
      ${openPriorityEntries.length ? `
        <div class="t1-turn-cursor__priority">
          ${openPriorityEntries.slice(0, 3).map(({ entry, move }) => `<span><i data-lucide="zap"></i>${formatName(entry.mon.displayName || entry.mon.name)} puede usar ${formatName(getTranslation(move, 'move') || move)}</span>`).join('')}
        </div>` : '<div class="t1-turn-cursor__priority is-muted">No quedan ventanas de prioridad abiertas.</div>'}
    </div>` : '';
  const renderMonStateControl = (entry) => {
    const original = state[entry.side]?.[entry.realIdx];
    const hp = Math.max(0, Math.min(100, Math.round(original?.battle?.hpPct ?? 100)));
    const status = original?.battle?.status || 'none';
    const name = formatName(original?.displayName || original?.name || 'Slot');
    const isFainted = original?.fainted || hp <= 0;
    const hasActed = hasTurnActionBeenUsed(entry.side, entry.realIdx);
    const isNextNormal = nextNormalActor && nextNormalActor.side === entry.side && Number(nextNormalActor.idx) === Number(entry.realIdx);
    const hasPriorityOpen = openPriorityEntries.some(p => p.entry.side === entry.side && Number(p.entry.realIdx) === Number(entry.realIdx));
    const isProtected = !!original?.battle?.protected;
    const hardBlockReason = getHardTurnBlockReason(original);
    const isTurnBlocked = !!hardBlockReason && !isFainted;
    const stateChip = isFainted
      ? '<span class="t1-ko-chip">KO</span>'
      : (isTurnBlocked
        ? `<span class="t1-stop-chip" title="${escapeHtml(hardBlockReason)}">No actúa</span>`
        : (isProtected
          ? '<span class="t1-protect-chip">Protegido</span>'
          : (original?.battle?.taunted
            ? '<span class="t1-stop-chip is-taunt">Mofa</span>'
            : (hasActed ? '<span class="t1-action-chip">Actuó</span>' : ''))));
    const displayedStateChip = original?.battle?.enteredThisTurn
      ? '<span class="t1-stop-chip is-entry">Entrando</span>'
      : stateChip;
    return `
      <article class="t1-state-card t1-state-card--${entry.side} ${isFainted ? 'is-fainted' : ''} ${hasActed ? 'has-acted' : ''} ${isNextNormal ? 'is-next' : ''} ${hasPriorityOpen ? 'has-priority-open' : ''}">
        <img src="${original?.sprite || ''}" alt="">
        <div class="t1-state-card__main">
          <div class="t1-state-card__name">
            <strong>${name}</strong>
            ${displayedStateChip}
          </div>
          <label>
            <span>PS</span>
            <input type="number" min="0" max="100" value="${hp}" data-t1-hp data-side="${entry.side}" data-idx="${entry.realIdx}">
          </label>
          <select data-t1-status data-side="${entry.side}" data-idx="${entry.realIdx}" aria-label="Estado de ${name}">
            ${['none', 'brn', 'par', 'slp', 'psn', 'tox', 'frz'].map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${formatBattleStatus(s)}</option>`).join('')}
          </select>
        </div>
      </article>`;
  };
  const recentLogHtml = session.log.length ? session.log.slice(0, 5).map(item => `
    <li class="t1-log-item t1-log-item--${item.kind}">
      <span>T${item.turn}</span>
      <strong>${item.title}</strong>
      <p>${item.text}</p>
    </li>`).join('') : `<li class="t1-log-empty">Pulsa Start para fijar la mesa y empezar a acumular lo que ocurre.</li>`;
  const t1ControlsHtml = `
    <div class="t1-sim-control-panel">
      <div class="t1-sim-control-panel__top">
        <div>
          <div class="t1-command-brief__eyebrow">Simulación acumulada</div>
          <h3>${session.active ? `Turno ${session.turn} en curso` : 'Mesa aún no iniciada'}</h3>
          <p>${session.active ? 'Cada movimiento aplicado cambia PS, estados y campo para recalcular lo siguiente.' : 'Inicia la partida para convertir esta lectura de turno 1 en seguimiento real.'}</p>
        </div>
        <div class="t1-sim-actions">
          <button type="button" class="btn blue" data-t1-sim-command="start"><i data-lucide="play"></i> Start</button>
          <button type="button" class="btn ghost" data-t1-sim-command="next"><i data-lucide="skip-forward"></i> Siguiente turno</button>
          <button type="button" class="btn ghost" data-t1-sim-command="reset"><i data-lucide="rotate-ccw"></i> Reset</button>
        </div>
      </div>

      <div class="t1-field-console">
        <div class="t1-field-console__group">
          <span>Clima</span>
          ${renderFieldBtn('weather', 'sun', 'Sol', 'sun', state.field.weather === 'sun')}
          ${renderFieldBtn('weather', 'rain', 'Lluvia', 'cloud-rain', state.field.weather === 'rain')}
          ${renderFieldBtn('weather', 'sand', 'Arena', 'wind', state.field.weather === 'sand' || state.field.weather === 'sandstorm')}
          ${renderFieldBtn('weather', 'snow', 'Nieve', 'snowflake', state.field.weather === 'snow')}
        </div>
        <div class="t1-field-console__group">
          <span>Campo</span>
          ${renderFieldBtn('terrain', 'electric', 'Eléctrico', 'zap', state.field.terrain === 'electric')}
          ${renderFieldBtn('terrain', 'grassy', 'Hierba', 'leaf', state.field.terrain === 'grassy')}
          ${renderFieldBtn('terrain', 'psychic', 'Psíquico', 'orbit', state.field.terrain === 'psychic')}
          ${renderFieldBtn('terrain', 'misty', 'Niebla', 'sparkles', state.field.terrain === 'misty')}
        </div>
        <div class="t1-field-console__group">
          <span>Velocidad</span>
          ${renderFieldBtn('trickRoom', 'toggle', 'Trick Room', 'timer-reset', !!state.field.trickRoom)}
          ${renderFieldBtn('tailwind', 'toggle', 'Tailwind propio', 'wind', !!state.field.tailwindSelf, 'self')}
          ${renderFieldBtn('tailwind', 'toggle', 'Tailwind rival', 'wind', !!state.field.tailwindEnemy, 'enemy')}
        </div>
      </div>

      <div class="t1-state-console">
        ${turnCursorHtml}
        <div class="t1-state-console__grid">
          ${[...visibleSelfLeads, ...visibleEnemyLeads].map(renderMonStateControl).join('')}
        </div>
        <ol class="t1-battle-log">${recentLogHtml}</ol>
      </div>
    </div>
  `;

  // --- INYECCIÓN DE CONDITION CARDS (TRICK ROOM Y FAKE OUT) ---
  const turn1EngineModel = buildTurn1ProductModel(state, {
    activeSelfSlots: sIdx,
    activeEnemySlots: eIdx,
    field: simFieldLocal,
    highlightLimit: 6,
    includeActionEvidence: true,
    includeGraph: false,
  });
  const renderEngineHighlight = (item) => {
    const confidence = item.confidence || {};
    const level = confidence.level || 'medium';
    const value = Number(confidence.value);
    const confidenceLabel = Number.isFinite(value) ? `${Math.round(value * 100)}%` : level;
    const iconMap = {
      speed_control: 'wind',
      weather_core: 'cloud-sun',
      terrain_core: 'sparkles',
      fake_out_setup: 'hand',
      redirection_setup: 'shield',
      spread_abuse: 'radio-tower',
      immunity_core: 'shield-check',
      anti_intimidate: 'badge-alert',
      priority_games: 'zap',
      priority_denial: 'shield-alert',
      setup_support: 'sparkles',
      defensive_layering: 'layers',
      trap_perish_lock: 'lock',
      ally_protected_nuke: 'crosshair',
      status_pressure: 'activity',
      variable_power_wincon: 'trending-up',
      late_game_cleaner: 'flag',
      partner_engine: 'network',
    };
    return `
      <article class="t1-engine-finding is-${escapeHtml(item.severity || 'medium')}">
        <div class="t1-engine-finding__icon"><i data-lucide="${iconMap[item.family] || 'info'}"></i></div>
        <div class="t1-engine-finding__body">
          <div class="t1-engine-finding__top">
            <strong>${escapeHtml(item.label || item.family || 'Finding tactico')}</strong>
            <span class="engine-confidence engine-confidence--${escapeHtml(level)}">${escapeHtml(confidenceLabel)}</span>
          </div>
          ${item.response ? `<p><i data-lucide="reply"></i>${escapeHtml(item.response)}</p>` : ''}
        </div>
      </article>
    `;
  };
  const turn1EngineHtml = turn1EngineModel.highlights?.length
    ? `
      <section class="t1-engine-panel">
        <div class="t1-zone-heading">
          <span>Lectura del engine</span>
          <p>Findings derivados de snapshot, reglas y trazas compartidas con matrix, planes y threat analysis.</p>
        </div>
        <div class="t1-engine-grid">
          ${turn1EngineModel.highlights.slice(0, 6).map(renderEngineHighlight).join('')}
        </div>
      </section>
    `
    : '';

  const buildCondition = (type, icon, eyebrow, title, text, metaHtml = '') => `
      <article class="condition-card condition-card--${type}">
        <div class="condition-card__icon"><i data-lucide="${icon}"></i></div>
        <div class="condition-card__content">
          <div class="condition-card__eyebrow">${eyebrow}</div>
          <h4 class="condition-card__title">${title}</h4>
          <p class="condition-card__text">${text}</p>
          ${metaHtml ? `<div class="condition-card__chain">${metaHtml}</div>` : ''}
        </div>
      </article>
  `;

  let conditionCards = [];
  const safeNormArray = (arr) => (arr || []).map(m => String(m).toLowerCase().replace(/[^a-z]/g, ''));
  const monLabel = (mon) => formatName(mon?.displayName || mon?.name || 'desconocido');
  const hasAnyMove = (mon, moveSet) => safeNormArray(mon?.set?.moves).some(m => moveSet.has(m));
  const abilityId = (mon) => String(mon?.set?.ability || mon?.ability || '').toLowerCase().replace(/[^a-z]/g, '');
  const chip = (label, sprite = null) => `
    <span class="condition-card__chip">
      ${sprite ? `<img src="${sprite}" alt="">` : ''}
      ${label}
    </span>`;

  const TRICK_ROOM = new Set(["trickroom", "espacioraro"]);
  const trickRoomUsers = leads.filter(x => safeNormArray(x.mon.set?.moves).some(m => TRICK_ROOM.has(m)));
  if (trickRoomUsers.length > 0) {
    const userNames = trickRoomUsers.map(u => formatName(u.mon.displayName || u.mon.name)).join(', ');
    conditionCards.push(buildCondition('speed', 'clock', 'Alerta de Campo', 'Espacio Raro Posible', `Detectado en: <b>${userNames}</b>. Puede invertir el orden de turnos.`));
  }

  const antiPriorityAbilities = new Set(['innerfocus', 'armortail', 'dazzling', 'queenlymajesty', 'shielddust']);
  let validFakeOutUsers = [];
  
  for (const foUser of leads) {
    const hasFakeOut = safeNormArray(foUser.mon.set?.moves).some(m => FAKE_OUT_MOVES.has(m));
    if (!hasFakeOut) continue;
    
    const opponents = foUser.side === 'self' ? enemyLeads : selfLeads;
    const canHitSomeone = opponents.some(opp => {
       const abilityId = (opp.mon.set?.ability || opp.mon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
       const isGhost = (opp.mon.types || []).map(t => t.toLowerCase()).includes('ghost');
       return !antiPriorityAbilities.has(abilityId) && !isGhost;
    });

    if (canHitSomeone) {
       validFakeOutUsers.push(foUser);
    }
  }

  if (validFakeOutUsers.length > 0) {
     const userNames = validFakeOutUsers.map(u => formatName(u.mon.displayName || u.mon.name)).join(', ');
     conditionCards.push(buildCondition('priority', 'hand', 'Alerta de Prioridad', 'Amenaza con Sorpresa', `Detectado en: <b>${userNames}</b>. Oponentes válidos en riesgo de retroceso.`));
  }

  const SETUP_MOVES = new Set(['trickroom', 'espacioraro', 'tailwind', 'vientoafin', 'swordsdance', 'danzasespada', 'nastyplot', 'maquinacion', 'calmmind', 'pazmental', 'bulkup', 'corpulencia', 'dragondance', 'danzadragon', 'quiverdance', 'danzaleteo', 'shellsmash', 'rompecoraza']);
  const PERISH_MOVES = new Set(['perishsong', 'cantoperish', 'cantumortal']);
  const TRAP_ABILITIES = new Set(['shadowtag', 'sombratrampa', 'arenatrap', 'trampaarena']);
  const PRIORITY_DENIAL_ABILITIES = new Set(['armortail', 'dazzling', 'queenlymajesty', 'shielddust']);
  const WEATHER_SETTERS = {
    sun: new Set(['drought', 'sequia']),
    rain: new Set(['drizzle', 'llovizna']),
    sand: new Set(['sandstream', 'chorroarena']),
    snow: new Set(['snowwarning', 'nevasca'])
  };
  const WEATHER_ABUSERS = {
    sun: new Set(['chlorophyll', 'clorofila', 'solarpower', 'podersolar', 'protosynthesis']),
    rain: new Set(['swiftswim', 'nadorapido', 'raindish']),
    sand: new Set(['sandrush', 'impetuarena', 'sandforce', 'poderarena', 'sandveil', 'veloarena']),
    snow: new Set(['slushrush', 'quitanieves', 'snowcloak', 'mantoacueo'])
  };

  const pushSideCondition = ({ side, type, icon, eyebrow, title, text, actors = [] }) => {
    const sideLabel = side === 'enemy' ? 'Rival' : 'Propio';
    const metaHtml = actors.map(actor => chip(monLabel(actor.mon || actor), actor.mon?.sprite || actor.sprite)).join('');
    conditionCards.push(buildCondition(type, icon, `${eyebrow} · ${sideLabel}`, title, text, metaHtml));
  };

  ['enemy', 'self'].forEach(side => {
    const sideLeads = side === 'enemy' ? enemyLeads : selfLeads;
    const fakeOutUsersSide = sideLeads.filter(l => hasAnyMove(l.mon, FAKE_OUT_MOVES));
    const setupUsers = sideLeads.filter(l => hasAnyMove(l.mon, SETUP_MOVES));
    if (side === 'enemy' && fakeOutUsersSide.length > 0 && setupUsers.some(su => !fakeOutUsersSide.some(fo => fo.mon.name === su.mon.name))) {
      const blocker = fakeOutUsersSide[0];
      const enabler = setupUsers.find(su => su.mon.name !== blocker.mon.name) || setupUsers[0];
      pushSideCondition({
        side,
        type: 'priority',
        icon: 'hand',
        eyebrow: 'Combo de tempo',
        title: 'Sorpresa puede comprar setup',
        text: `<b>${monLabel(blocker.mon)}</b> puede frenar una respuesta mientras <b>${monLabel(enabler.mon)}</b> cambia el ritmo del turno.`,
        actors: [blocker, enabler]
      });
    }

    const trSettersSide = sideLeads.filter(l => hasAnyMove(l.mon, TRICK_ROOM));
    const slowPartners = sideLeads.filter(l => !trSettersSide.some(tr => tr.mon.name === l.mon.name) && (l.mon.baseStats?.speed || 100) <= 70);
    if (side === 'enemy' && trSettersSide.length > 0 && slowPartners.length > 0) {
      pushSideCondition({
        side,
        type: 'speed',
        icon: 'timer-reset',
        eyebrow: 'Control de velocidad',
        title: 'Trick Room + sweeper lento',
        text: `Si <b>${monLabel(trSettersSide[0].mon)}</b> activa Espacio Raro, <b>${monLabel(slowPartners[0].mon)}</b> pasa de lento a amenaza de tempo.`,
        actors: [trSettersSide[0], slowPartners[0]]
      });
    }

    const perishUsers = sideLeads.filter(l => hasAnyMove(l.mon, PERISH_MOVES));
    const trapUsers = sideLeads.filter(l => TRAP_ABILITIES.has(abilityId(l.mon)));
    if (side === 'enemy' && perishUsers.length > 0 && trapUsers.length > 0) {
      pushSideCondition({
        side,
        type: 'pressure',
        icon: 'lock',
        eyebrow: 'Trampa de cierre',
        title: 'Canto Mortal + bloqueo de cambio',
        text: `<b>${monLabel(perishUsers[0].mon)}</b> y <b>${monLabel(trapUsers[0].mon)}</b> pueden convertir un turno pasivo en una ruta de cierre.`,
        actors: [perishUsers[0], trapUsers[0]]
      });
    }

    const denialUsers = sideLeads.filter(l => PRIORITY_DENIAL_ABILITIES.has(abilityId(l.mon)));
    const psychicTerrainActive = (simFieldLocal.terrain || '').toLowerCase().includes('psychic');
    if (side === 'enemy' && (denialUsers.length > 0 || psychicTerrainActive)) {
      const actorText = denialUsers.length > 0 ? `<b>${monLabel(denialUsers[0].mon)}</b>` : '<b>Campo Psíquico</b>';
      pushSideCondition({
        side,
        type: 'priority',
        icon: 'shield-alert',
        eyebrow: 'Bloqueo de prioridad',
        title: 'La prioridad puede no resolver',
        text: `${actorText} limita Fake Out, Extreme Speed o planes de remate por prioridad.`,
        actors: denialUsers.slice(0, 2)
      });
    }

    Object.entries(WEATHER_SETTERS).forEach(([weatherKey, setterAbilities]) => {
      const setter = sideLeads.find(l => setterAbilities.has(abilityId(l.mon)));
      const abuser = sideLeads.find(l => setter && l.mon.name !== setter.mon.name && WEATHER_ABUSERS[weatherKey]?.has(abilityId(l.mon)));
      if (side === 'enemy' && setter && abuser) {
        pushSideCondition({
          side,
          type: 'weather',
          icon: weatherKey === 'rain' ? 'cloud-rain' : (weatherKey === 'sun' ? 'sun' : 'wind'),
          eyebrow: 'Sinergia de campo',
          title: 'Clima + abusador activo',
          text: `<b>${monLabel(setter.mon)}</b> activa el campo que potencia a <b>${monLabel(abuser.mon)}</b>. La lectura de velocidad/daño cambia desde turno 1.`,
          actors: [setter, abuser]
        });
      }
    });
  });

  const enemyDoubleFocus = selfLeads
    .map(target => {
      const incoming = allVectors.filter(v => !v.isAlly && v.defender.mon.name === target.mon.name);
      const lethal = incoming.filter(v => v.surv.isLethal || v.atk.ohkoProb > 0);
      return { target, incoming, lethal };
    })
    .filter(row => row.incoming.length >= 2)
    .sort((a, b) => b.lethal.length - a.lethal.length || b.incoming.length - a.incoming.length)[0];

  if (enemyDoubleFocus) {
    const attackers = enemyDoubleFocus.incoming.map(v => v.attacker).filter((v, idx, arr) => arr.findIndex(x => x.mon.name === v.mon.name) === idx).slice(0, 2);
    conditionCards.unshift(buildCondition(
      'pressure',
      'crosshair',
      'Presión conjunta · Rival',
      `Foco doble sobre ${monLabel(enemyDoubleFocus.target.mon)}`,
      `Ambos leads rivales tienen una línea útil hacia <b>${monLabel(enemyDoubleFocus.target.mon)}</b>. Si no proteges, pivoteas o niegas tempo, ese slot puede colapsar antes de aportar.`,
      [enemyDoubleFocus.target, ...attackers].map(actor => chip(monLabel(actor.mon), actor.mon.sprite)).join('')
    ));
  }

  const enemySashStopsKo = allVectors.find(v => v.isAlly && (v.surv.isSavedBySash || v.surv.isSavedBySturdy));
  if (enemySashStopsKo) {
    const stopName = enemySashStopsKo.surv.isSavedBySash ? 'Focus Sash' : 'Sturdy';
    conditionCards.push(buildCondition(
      'pressure',
      'shield',
      'Supervivencia crítica · Rival',
      `${stopName} cambia el KO real`,
      `<b>${monLabel(enemySashStopsKo.defender.mon)}</b> parece caer, pero sobrevive a 1 PS. Planifica chip, doble foco o protección posterior.`,
      [enemySashStopsKo.attacker, enemySashStopsKo.defender].map(actor => chip(monLabel(actor.mon), actor.mon.sprite)).join('')
    ));
  }
  
  if (conditionCards.length > 0) {
    criticalCardsHtml = `
      <div class="condition-grid t1-condition-grid">
        ${conditionCards.slice(0, 8).join('')}
      </div>
      ${criticalCardsHtml}
    `;
  }

  // --- VEREDICTO T1 ---
  let iniciativaText = "Tie probable";
  let iniciativaDetail = "El primer intercambio depende del empate de velocidad o de prioridad.";
  let riesgoText = "Sin KO limpio detectado";
  let riesgoDetail = "No hay una ruta inmediata de colapso, pero revisa rolls y cambios de campo.";
  let planText = "Presión directa";
  let planDetail = "Puedes avanzar con tu mejor línea ofensiva si no concedes control de velocidad.";
  let pairPressureText = "Presión repartida";
  let pairPressureDetail = "El rival no concentra claramente ambos slots sobre un mismo objetivo.";
  let comboText = "Sin combo crítico visible";
  let comboDetail = "Las amenazas importantes parecen individuales, no una cadena de turno 1.";
  let fieldText = "Campo neutro";
  let fieldDetail = "Sin clima, terreno o inversión activa que cambie la lectura base.";

  if (turnOrderLeads.length > 0) {
     const fastest = turnOrderLeads[0];
     const secondFastest = turnOrderLeads.length > 1 ? turnOrderLeads[1] : null;
     if (secondFastest && fastest.spe === secondFastest.spe && fastest.side !== secondFastest.side) {
        iniciativaText = "Tie probable";
     } else if (fastest.side === 'self') {
        iniciativaText = "Mueves antes";
     } else {
        iniciativaText = "Rival mueve antes";
     }
     const firstMoveLabel = `Vel ${Math.abs(fastest.spe)}`;
     iniciativaDetail = `${monLabel(fastest.mon)} abre el orden base por ${firstMoveLabel}${fastest.hasPriorityOption ? ', con opcion de prioridad si la declara' : ''}.`;
  }

  const doubleTargetAlly = enemyDoubleFocus?.target || selfLeads.find(l => targetThreatsCount[l.mon.name] >= 2);
  if (doubleTargetAlly) {
     riesgoText = `Foco doble sobre ${formatName(doubleTargetAlly.mon.displayName || doubleTargetAlly.mon.name)}`;
     riesgoDetail = "Ambos rivales tienen presión útil sobre el mismo lead; Protect, cambio o negar tempo gana valor.";
  } else if (allyOhkoThreats.size > 0) {
     riesgoText = `KO crítico sobre ${Array.from(allyOhkoThreats).map(n => formatName(n)).join(', ')}`;
     riesgoDetail = "Hay una línea rival de KO o roll alto antes de que ese slot pueda estabilizarse.";
  }

  const hasFakeOutEnemy = validFakeOutUsers.some(fo => fo.side === 'enemy');
  const enemyHasSash = allVectors.some(v => v.isAlly && v.surv.isSavedBySash);
  const activeFieldBits = [];
  const currentWeather = simFieldLocal.weather === 'sandstorm' ? 'sand' : simFieldLocal.weather;
  if (state.turn1Battle?.active && currentWeather) activeFieldBits.push(WEATHER_LABELS[currentWeather] || weatherNames[currentWeather] || formatName(currentWeather));
  else if (weathers[0]) activeFieldBits.push(weathers[0].text);
  if (state.turn1Battle?.active && simFieldLocal.terrain) activeFieldBits.push(TERRAIN_LABELS[simFieldLocal.terrain] || formatName(simFieldLocal.terrain));
  else if (terrains[0]) activeFieldBits.push(terrains[0].text);
  if (state.field.trickRoom) activeFieldBits.push('Trick Room activo');
  if (state.field.tailwindSelf) activeFieldBits.push('Tu Tailwind');
  if (state.field.tailwindEnemy) activeFieldBits.push('Tailwind rival');

  if (activeFieldBits.length > 0) {
    fieldText = activeFieldBits.slice(0, 2).join(' + ');
    fieldDetail = "Estas condiciones alteran velocidad, prioridad o daño antes de interpretar los KOs.";
  }

  if (enemyDoubleFocus) {
    pairPressureText = `${monLabel(enemyDoubleFocus.target.mon)} bajo foco`;
    pairPressureDetail = "La pareja rival no solo amenaza daño: concentra el turno sobre el mismo slot.";
  } else {
    const enemyPressureVectors = allVectors.filter(v => !v.isAlly);
    const enemyAttackers = new Set(enemyPressureVectors.map(v => v.attacker.mon.name));
    if (enemyAttackers.size >= 2) {
      pairPressureText = "Dos fuentes de presión";
      pairPressureDetail = "Los dos leads rivales tienen líneas relevantes, aunque no siempre al mismo objetivo.";
    }
  }

  const firstEnemyComboCard = conditionCards.find(card => card.includes('· Rival') && !card.includes('Supervivencia crítica') && !card.includes('Presión conjunta'));
  if (firstEnemyComboCard) {
    const titleMatch = firstEnemyComboCard.match(/<h4 class="condition-card__title">([^<]+)<\/h4>/);
    const textMatch = firstEnemyComboCard.match(/<p class="condition-card__text">([\s\S]*?)<\/p>/);
    comboText = titleMatch ? titleMatch[1] : "Combo rival crítico";
    comboDetail = textMatch ? textMatch[1].replace(/<[^>]+>/g, '') : "Hay una sinergia rival que cambia la lectura del turno 1.";
  }

  if (hasFakeOutEnemy) {
      planText = "Negar Fake Out";
      planDetail = "Prioriza Inner Focus, tipo Fantasma, Protect o doble presión sobre el usuario de Sorpresa.";
  } else if (doubleTargetAlly || allyOhkoThreats.size > 0) {
      planText = "Protect + pivot";
      planDetail = "No entregues el slot amenazado: fuerza scout, reposiciona o castiga al atacante más rápido.";
  } else if (enemyHasSash) {
      planText = "Jugar alrededor de Sash";
      planDetail = "El KO aparente no cierra el turno: busca chip, doble foco o una segunda acción segura.";
  } else {
      const bestAllyVector = allVectors
        .filter(v => v.isAlly)
        .sort((a, b) => (b.surv.isLethal - a.surv.isLethal) || (b.atk.maxPct || 0) - (a.atk.maxPct || 0))[0];
      if (bestAllyVector) {
        planText = `Presionar a ${monLabel(bestAllyVector.defender.mon)}`;
        planDetail = `${monLabel(bestAllyVector.attacker.mon)} tiene la mejor línea ofensiva visible sin depender de un nuevo modo de juego.`;
      }
  }

  if (veredictoContainer) {
    veredictoContainer.innerHTML = `
      <div class="veredicto-t1-banner t1-command-brief">
         <div class="t1-command-brief__headline">
            <div>
              <div class="t1-command-brief__eyebrow">Lectura táctica del turno 1</div>
              <h3>${planText}</h3>
            </div>
            <span class="t1-command-brief__stance ${iniciativaText === 'Mueves antes' ? 'is-good' : (iniciativaText === 'Rival mueve antes' ? 'is-danger' : 'is-warning')}">${iniciativaText}</span>
         </div>
         <p class="t1-command-brief__plan">${planDetail}</p>
         <div class="t1-brief-grid">
            <article class="t1-brief-cell">
              <span><i data-lucide="zap"></i> Tempo</span>
              <strong class="${iniciativaText === 'Rival mueve antes' ? 'is-danger' : ''}">${iniciativaText}</strong>
              <p>${iniciativaDetail}</p>
            </article>
            <article class="t1-brief-cell">
              <span><i data-lucide="alert-triangle"></i> Lead en peligro</span>
              <strong class="${riesgoText.includes('Sin KO') ? '' : 'is-danger'}">${riesgoText}</strong>
              <p>${riesgoDetail}</p>
            </article>
            <article class="t1-brief-cell">
              <span><i data-lucide="crosshair"></i> Presión rival</span>
              <strong>${pairPressureText}</strong>
              <p>${pairPressureDetail}</p>
            </article>
            <article class="t1-brief-cell">
              <span><i data-lucide="route"></i> Combo decisivo</span>
              <strong class="${comboText === 'Sin combo crítico visible' ? '' : 'is-warning'}">${comboText}</strong>
              <p>${comboDetail}</p>
            </article>
            <article class="t1-brief-cell">
              <span><i data-lucide="cloud-sun"></i> Campo</span>
              <strong>${fieldText}</strong>
              <p>${fieldDetail}</p>
            </article>
            <article class="t1-brief-cell t1-brief-cell--action">
              <span><i data-lucide="target"></i> Lectura sugerida</span>
              <strong>${planText}</strong>
              <p>${planDetail}</p>
            </article>
         </div>
      </div>
    `;
  }

  // Render Final
  list.innerHTML = `
    <div class="tactical-zones-container">
      ${t1ControlsHtml}
      ${turn1EngineHtml}
      <div class="t1-zone-heading t1-zone-heading--center">
        <span>Orden previsto de activación</span>
        <p>Orden base por velocidad efectiva. La prioridad se marca como opcion disponible, pero no reordena esta vista hasta elegir un movimiento.</p>
      </div>
      ${timelineHtml}
      <div class="t1-zone-heading">
        <span>Combatientes en mesa</span>
        <p>Roles, activaciones, objetos críticos, objetivos marcados y KOs que ya no participan en el cálculo.</p>
      </div>
      ${rosterGridHtml}
      ${crossfireSectionHtml}
      <div class="tactical-feed" style="margin-top: 16px;">
        ${criticalCardsHtml ? `
        <div class="t1-zone-heading t1-zone-heading--danger">
          <span>Decisiones críticas en orden de turno</span>
          <p>Una sola cola: prioridad primero, luego velocidad efectiva y después utilidad táctica. Solo puede actuar el siguiente Pokémon pendiente.</p>
        </div>
        ${criticalCardsHtml}
        ` : ''}
      </div>
    </div>
  `;

  if (typeof lucide !== "undefined" && lucide.createIcons) {

    lucide.createIcons({ root: document.getElementById("turn1SimulatorPanel") });
  }
  flowLog('renderTurn1Simulator: Fin - PROYECCIÓN DE CHOQUE LISTA');
}

async function hydrateSavedState() {
  // Centralizado en el Drawer, ya no se renderiza en la inicialización
}

async function warmupLocalizationCaches() {
  // Future translation or cache warmups
}

window.GameDB = null;
let bootstrapped = false;

async function initApp() {
  flowLog('initApp: Iniciando aplicación');
  loadUiMode();
  loadMatrixPreferences();
  updateIcons();
  
  try {
    const res = await fetch('./data/data-bundle.json');
    window.GameDB = await res.json();
    
    if (DEBUG_MODE) {
      console.groupCollapsed(`📦 [DATABASE STARTUP] Inspección de data-bundle.json`);
      console.log(`🔹 Pokémon Activos: ${Object.keys(window.GameDB?.pokedex || {}).length}`);
      console.log(`🔹 Movimientos Cargados: ${Object.keys(window.GameDB?.moves || {}).length} (⚠️ Revisa si están los multi-palabra como 'flareblitz')`);
      console.log(`🔹 Traducciones Listas: ${Object.keys(window.GameDB?.translations || {}).length}`);
      console.groupEnd();
    }
  } catch (e) {
    console.error("No se pudo cargar data-bundle.json", e);
    return;
  }
  
  Object.assign(i18nCache, window.GameDB.translations || {});
  
  state.smogonRaw = window.GameDB.smogon;
  buildMetaIndex(state.smogonRaw);
  
  ensurePokedex();
  await rehydrateCurrentTeamsSets();
  updateIcons();
  renderAll();
  toggleMatrixHelp(state.matrixHelpOpen);
  flowLog('initApp: Aplicación inicializada con éxito');
}

export function bootstrapApp() {
  if (bootstrapped) return;
  bootstrapped = true;

  updateIcons();

  configureUiBridges({
    renderAll,
    renderSetEditor,
    renderSetChoiceList,
    setBatchUpdating,
  });

  configureDebugActions({
    renderAll,
    getRows,
    cloneSimulationState,
    getState: () => state,
  });

  initEventBindings({
    clearAll,
    swapTeams,
  });
  initTurn1SimulatorRuntimeBindings();

  initApp();
}

// --- LIVE BATTLE CENTER EXPERT MODE ---

export function isBattleFocusActive() {
  return (state.uiMode === "expert" && state.battleFocus === "active") || state.uiMode === "live";
}

export function getFilledIndices(side) {
  return state[side].map((m, i) => m ? i : null).filter(i => i !== null);
}

export function normalizeActiveSlots(side) {
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  const filled = getFilledIndices(side);
  if (filled.length === 0) {
    state[activeKey] = [];
    return;
  }
  let current = state[activeKey].filter(idx => filled.includes(idx));
  for (const idx of filled) {
    if (current.length >= 2) break;
    if (!current.includes(idx)) current.push(idx);
  }
  state[activeKey] = current;
}

export function getFocusedIndices(side) {
  if (!isBattleFocusActive()) return getFilledIndices(side);
  normalizeActiveSlots(side);
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  return state[activeKey];
}

export function getFocusedTeam(side) {
  const indices = getFocusedIndices(side);
  return indices.map(i => state[side][i]).filter(Boolean);
}

export function setBattleFocus(focus) {
  state.battleFocus = focus;
  if (LIVE.matchupStrip) LIVE.matchupStrip.style.display = focus === "active" ? "flex" : "none";
  if (LIVE.battleToolbar) LIVE.battleToolbar.style.display = focus === "active" ? "flex" : "none";
  renderAll();
}

export function setActiveBattleSlot(side, activePosition, newTeamIndex) {
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  const current = [...state[activeKey]];
  
  if (current.includes(newTeamIndex)) {
    const otherPos = current.indexOf(newTeamIndex);
    current[otherPos] = current[activePosition];
  }
  current[activePosition] = newTeamIndex;
  state[activeKey] = current;
  closeBattleSheet();
  recalculateActiveField();
  renderAll();
}

function getTacticalCellClass(cell) {
  if (cell.ohko || cell.ohkoProb >= 50) return "ko-probable";
  if (cell.mult >= 2) return "pressure-high";
  if (cell.mult >= 1) return "pressure-medium";
  if (cell.mult === 0 || cell.mult <= 0.25) return "bad-entry";
  if (cell.mult <= 0.5) return "safe-switch";
  return "";
}

window.matrixCellClassOverride = function(cell) {
  if (typeof isBattleFocusActive === 'function' && isBattleFocusActive()) {
    const tac = getTacticalCellClass(cell);
    if (tac) return "cell--" + tac;
  }
  return null;
};

export function renderActiveMatchupStrip() {
  if (!isBattleFocusActive()) return;
  normalizeActiveSlots("self");
  normalizeActiveSlots("enemy");
  
  const renderSlotBtn = (side, pos, idx) => {
    const mon = idx !== undefined && idx !== null ? state[side][idx] : null;
    const btn = side === "self"
      ? (pos === 0 ? LIVE.selfSlotA : LIVE.selfSlotB)
      : (pos === 0 ? LIVE.enemySlotA : LIVE.enemySlotB);
    if (!btn) return;
    if (mon) {
      btn.innerHTML = `<img src="${mon.sprite}" alt="${mon.displayName}">`;
      btn.className = `active-slot-btn active-slot-btn--${side}`;
      btn.onclick = () => openBattleSheet({ side, activePosition: pos, isSelector: true });
    } else {
      btn.innerHTML = `<i data-lucide="plus" style="color:var(--muted);width:20px;height:20px;"></i>`;
      btn.className = `active-slot-btn empty`;
    }
        btn.onclick = () => openBattleSheet({ side, activePosition: pos, isSelector: true });
  };

  renderSlotBtn("self", 0, state.activeSelfSlots[0]);
  renderSlotBtn("self", 1, state.activeSelfSlots[1]);
  renderSlotBtn("enemy", 0, state.activeEnemySlots[0]);
  renderSlotBtn("enemy", 1, state.activeEnemySlots[1]);
  updateIcons();
}

export function renderLiveBattleToolbar() {
  if (!isBattleFocusActive()) return;
  const selfMons = getFocusedTeam("self");
  const enemyMons = getFocusedTeam("enemy");
  
  let threats = 0;
  let kills = 0;
  let safes = 0;
  
  for (const e of enemyMons) {
    let threatensMe = false;
    let safeSwitchForMe = true;
    for (const s of selfMons) {
      const eAtk = bestAttack(e, s);
      if (eAtk.mult >= 2 || eAtk.ohko) threatensMe = true;
      if (eAtk.mult >= 1) safeSwitchForMe = false;
      
      const sAtk = bestAttack(s, e);
      if (sAtk.ohko || sAtk.ohkoProb >= 80) kills++;
    }
    if (threatensMe) threats++;
    if (safeSwitchForMe) safes++;
  }
  
  if (LIVE.urgencyThreats) LIVE.urgencyThreats.innerHTML = `<i data-lucide="alert-circle" style="width:12px;height:12px;"></i> ${threats} Amenazas`;
  if (LIVE.urgencyKills) LIVE.urgencyKills.innerHTML = `<i data-lucide="crosshair" style="width:12px;height:12px;"></i> ${kills} KOs`;
  if (LIVE.urgencySafeSwitches) LIVE.urgencySafeSwitches.innerHTML = `<i data-lucide="shield-check" style="width:12px;height:12px;"></i> ${safes} Seguros`;
}

export function openBattleSheet(payload) {
  state.battleSheet = { open: true, ...payload };
  renderBattleSheet();
  if (LIVE.sheetOverlay) LIVE.sheetOverlay.style.display = "block";
  if (LIVE.sheetModal) LIVE.sheetModal.classList.add("open");
}

export function closeBattleSheet() {
  state.battleSheet.open = false;
  if (LIVE.sheetOverlay) LIVE.sheetOverlay.style.display = "none";
  if (LIVE.sheetModal) LIVE.sheetModal.classList.remove("open");
  
  state.selectedMatrixCell = null;
  document.querySelectorAll(".cell--selected").forEach(el => el.classList.remove("cell--selected"));
  document.querySelectorAll(".matrix-row-selected").forEach(el => el.classList.remove("matrix-row-selected"));
  document.querySelectorAll(".matrix-col-selected").forEach(el => el.classList.remove("matrix-col-selected"));
}

export function getTacticalReasons(data) {
   const reasons = [];
   if (data.blocked) reasons.push("Prioridad anulada por campo o inmunidad.");
   if (data.rawMult === 0 && !data.blocked) reasons.push("Inmunidad total por tipos o habilidad.");
   if (data.rawMult > 1) reasons.push(`Golpe muy eficaz (x${data.rawMult}).`);
   if (data.rawMult < 1 && data.rawMult > 0) reasons.push(`Golpe poco eficaz (x${data.rawMult}).`);
   if (data.wMul > 1) reasons.push("Daño potenciado por el clima activo.");
   if (data.wMul < 1) reasons.push("Daño reducido por el clima activo.");
   if (data.terrMul > 1) reasons.push("Daño potenciado por el terreno activo.");
   if (data.terrMul < 1) reasons.push("Daño reducido por el terreno activo.");
   if (data.maxPct < 35 && !data.blocked && data.mult > 0) reasons.push("El daño base estimado es muy bajo.");
   if (data.ohkoProb > 0) reasons.push(`Alta amenaza de KO directo (${data.ohkoProb}%).`);
   if (!reasons.length) reasons.push("Cruce neutral. Sin modificadores especiales.");
   return reasons;
}

export function getTacticalMeaning(data) {
  const mult = data.mult ?? data.rawMult ?? 1;
  const attacker = data.attacker;
  const moves = attacker?.set?.moves ?? [];
  
  const hasFakeOut = moves.some(m => String(m).toLowerCase().includes('fake out') || String(m).toLowerCase().includes('sorpresa'));
  const hasProtect = moves.some(m => ['protect','detect','protección','detección'].includes(String(m).toLowerCase()));
  
  if (mult === 0 || data.blocked) return 'Inmune o bloqueado. Considera cambiar de objetivo o usar un ataque neutro.';
  if (mult >= 4 || (data.ohkoProb >= 80)) return '¡KO casi garantizado! Presiona sin dudar este turno.';
  if (mult >= 2) return 'Ventaja clara. Entra o ataca con confianza.';
  if (mult <= 0.5) return 'Desventaja. Considera cambio seguro o usar soporte.';
  if (hasFakeOut) return 'Fake Out disponible. Paraliza primero, luego decide.';
  if (hasProtect) return 'Protect disponible. Scouting o stall si hay duda.';
  return 'Cruce neutral. Evalúa velocidad y prioridad antes de comprometerte.';
}

function getActiveEnemyLeads(targetEnemyName) {
    const activeIndices = quickMode.getTurn1ResolvedLeadIndices("enemy");
    let enemies = activeIndices.map(i => state.enemy[i]).filter(Boolean);
    
    const hasEnemy = enemies.some(e => e.name === targetEnemyName);
    if (!hasEnemy) {
        const specificEnemy = state.enemy.find(e => e && e.name === targetEnemyName);
        if (specificEnemy) {
            enemies = [specificEnemy, enemies.length > 0 ? enemies[0] : null].filter(Boolean);
        }
    }
    return enemies;
}

function classifyReserve(candidate, activeEnemies) {
    let worstPct = 0;
    let worstMult = 0;
    let ohkoRisk = false;

    for (const enemy of activeEnemies) {
        if (!enemy) continue;
        const atk = bestAttack(enemy, candidate); 
        if (atk.maxPct > worstPct) worstPct = atk.maxPct;
        if (atk.mult > worstMult) worstMult = atk.mult;
        if (atk.ohkoProb > 0) ohkoRisk = true;
    }

    let category = "unsafe";
    let reason = "Recibe demasiado daño al entrar.";

    if (!ohkoRisk && worstPct <= 35 && worstMult <= 0.5) {
        category = "safe";
        reason = "Absorbe bien la presión de los rivales en mesa.";
    } else if (!ohkoRisk && worstPct <= 55 && worstMult <= 1) {
        category = "pivot";
        reason = "Aguanta el golpe para facilitar un reposicionamiento.";
    } else if (ohkoRisk) {
        category = "unsafe";
        reason = "Se expone a un OHKO directo si entra ahora.";
    } else {
        category = "unsafe";
        reason = "Desventaja letal. El daño recibido no compensa.";
    }

    return { candidate, category, reason, worstPct, worstMult };
}

export function getSuggestedReserves(data) {
    const selfTeam = state.self.filter(Boolean);
    if (!selfTeam.length) return [];

    const activeSelfIndices = quickMode.getTurn1ResolvedLeadIndices("self");
    const activeSelfNames = activeSelfIndices.map(i => state.self[i]?.name).filter(Boolean);
    
    const currentSelfName = data.offensive ? data.attacker : data.defender;
    if (!activeSelfNames.includes(currentSelfName)) activeSelfNames.push(currentSelfName);

    const bench = selfTeam.filter(m => !activeSelfNames.includes(m.name));
    if (!bench.length) return [];

    const targetEnemyName = data.offensive ? data.defender : data.attacker;
    const activeEnemies = getActiveEnemyLeads(targetEnemyName);

    const evaluated = bench.map(cand => classifyReserve(cand, activeEnemies));
    
    evaluated.sort((a, b) => {
       const catScore = { "safe": 1, "pivot": 2, "unsafe": 3 };
       if (catScore[a.category] !== catScore[b.category]) return catScore[a.category] - catScore[b.category];
       return a.worstPct - b.worstPct;
    });

    return evaluated.slice(0, 3);
}

export function renderBattleSheet() {
  const body = LIVE.sheetBody;
  const title = LIVE.sheetTitle;
  const { side, activePosition, isSelector, cell } = state.battleSheet;

  if (isSelector) {
    title.textContent = "Elegir Activo";
    const team = state[side];
    const filledIndices = getFilledIndices(side);
    const currentActive = side === "self" ? state.activeSelfSlots : state.activeEnemySlots;
    
    body.innerHTML = `
      <div class="sheet-tactical-label">Reservas Disponibles</div>
      <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:8px;">
        ${filledIndices.map(idx => {
          const mon = team[idx];
          const isAct = currentActive.includes(idx);
          return `
            <div class="sheet-squad-btn ${isAct ? "active" : ""}" onclick="setActiveBattleSlot('${side}', ${activePosition}, ${idx})" style="position:relative;">
              ${isAct ? `<span style="position:absolute; top:-4px; right:-4px; background:var(--blue); color:#fff; border-radius:50%; width:16px; height:16px; font-size:10px; display:grid; place-items:center;"><i data-lucide="check" style="width:10px;height:10px;"></i></span>` : ""}
              <img src="${mon.sprite}" alt="${mon.displayName}">
            </div>
          `;
        }).join("")}
      </div>
    `;
    updateIcons();
    return;
  }

  if (cell) {
    title.textContent = "Lectura Táctica";
    const data = JSON.parse(decodeURIComponent(cell.dataset.tooltip));
    const attackerObj = data.attacker || {};
    const defenderObj = data.defender || {};
    
    const attackerName = attackerObj.displayName ?? attackerObj.name ?? data.attackerName ?? 'Atacante';
    const defenderName = defenderObj.displayName ?? defenderObj.name ?? data.defenderName ?? 'Defensor';
    const attackerSprite = attackerObj.sprite ?? '';
    const defenderSprite = defenderObj.sprite ?? '';
    
    const attackerTypes = attackerObj.types?.map(t => typeChip(t)).join('') ?? '';
    const defenderTypes = defenderObj.types?.map(t => typeChip(t)).join('') ?? '';
    
    const moveName = data.moveName ?? data.move ?? 'Desconocido';
    const moveType = data.moveType ?? data.type ?? 'normal';
    const minPct = data.minPct ?? 0;
    const maxPct = data.maxPct ?? 0;
    const mult = data.mult ?? data.rawMult ?? null;
    const multStr = mult !== null ? fmtMult(mult) : '';
    
    const reserves = getSuggestedReserves(data);
    const reasons = getTacticalReasons(data);
    const meaning = getTacticalMeaning(data);
    const effBadgeHtml = getEffectivenessBadgeHtml(mult !== null ? mult : 1);
    const sheetKoConditions = data.koConditions?.length
      ? { tags: data.koConditions, visible: data.koConditions.slice(0, 3), hiddenCount: Math.max(0, data.koConditions.length - 3) }
      : evaluateKoConditions(attackerObj, defenderObj, {
          ...data,
          move: moveName,
          type: moveType,
          minPct,
          maxPct,
          ohkoProb: data.ohkoProb || 0,
        }, {
          field: state.field,
          attackerSide: data.offensive ? 'self' : 'enemy',
          defenderSide: data.offensive ? 'enemy' : 'self',
          maxVisible: 3,
        });
    const sheetKoChipsHtml = renderKoConditionChips(sheetKoConditions);

    body.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          ${attackerSprite ? `<img src="${attackerSprite}" class="sprite-sm" alt="${attackerName}" style="width:40px;height:40px;object-fit:contain;border-radius:50%;background:rgba(0,0,0,0.3);">` : ''}
          <div>
            <div style="font-size:1.1rem; font-weight:900;">${attackerName}</div>
            <div style="display:flex; gap:4px; margin-top:4px;">${attackerTypes}</div>
          </div>
        </div>
        <i data-lucide="arrow-right" style="color:var(--muted); font-size:1.2rem;"></i>
        <div style="display:flex; align-items:center; gap:8px;">
          ${defenderSprite ? `<img src="${defenderSprite}" class="sprite-sm" alt="${defenderName}" style="width:40px;height:40px;object-fit:contain;border-radius:50%;background:rgba(0,0,0,0.3);">` : ''}
          <div>
            <div style="font-size:1.1rem; font-weight:900;">${defenderName}</div>
            <div style="display:flex; gap:4px; margin-top:4px;">${defenderTypes}</div>
          </div>
        </div>
      </div>
      
      <div class="sheet-tactical-block" style="margin-top: 16px;">
         <div class="sheet-tactical-label">Mejor Opción Estimada</div>
         <div class="sheet-tactical-val" style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
           ${typeDot(moveType)} <span style="font-size:1rem; font-weight:700;">${moveName}</span>
         </div>
         ${sheetKoChipsHtml}
         <div style="display:flex; align-items:center; gap:12px; font-size:0.8rem; color:var(--muted);">
            <span>Daño: <strong style="color:#fff;">${minPct}% - ${maxPct}%</strong></span>
            ${effBadgeHtml}
            ${data.ohkoProb > 0 ? `<span>Riesgo OHKO: <strong style="color:var(--red);">${data.ohkoProb}%</strong></span>` : ''}
         </div>
      </div>

      <div class="sheet-tactical-block">
         <div class="sheet-tactical-label">Por qué pasa</div>
         <ul class="sheet-reasons-list">
            ${reasons.map(r => `<li><i data-lucide="info"></i> ${r}</li>`).join('')}
         </ul>
      </div>

      <div class="sheet-tactical-block">
         <div class="sheet-tactical-label">Qué significa en mesa</div>
         <div class="sheet-tactical-meaning">${meaning}</div>
      </div>

      <div class="sheet-tactical-block">
         <div class="sheet-tactical-label">Banca Sugerida (Evaluada vs Rival Activo)</div>
         ${reserves.length > 0 ? `
           <div class="sheet-reserves-list">
             ${reserves.map(r => `
               <div class="sheet-reserve-item ${r.category === 'unsafe' ? 'sheet-reserve-item--unsafe' : ''}">
                 <img src="${r.candidate.sprite}" alt="${r.candidate.displayName}">
                 <div class="sheet-reserve-info">
                   <strong>${r.candidate.displayName} <span class="tag-pill ${r.category === 'safe' ? 'tag-pill--success' : r.category === 'pivot' ? 'tag-pill--warning' : 'tag-pill--danger'}">${r.category === 'safe' ? 'Seguro' : r.category === 'pivot' ? 'Pivot' : 'Riesgo'}</span></strong>
                   <span>${r.reason}</span>
                 </div>
               </div>
             `).join('')}
           </div>
         ` : `<div class="muted-small">No tienes banca segura o disponible.</div>`}
      </div>

      ${data.debug ? `
      <div class="sheet-tactical-block" style="border: 1px dashed var(--gold); padding: 8px; background: rgba(255,215,0,0.05); margin-top:12px; border-radius:8px;">
         <div class="sheet-tactical-label" style="color: var(--gold);"><i data-lucide="bug" style="width:14px;height:14px;"></i> Debug Data</div>
         <ul class="sheet-reasons-list" style="font-family: monospace; font-size: 0.75rem; color: var(--gold); margin-top:4px;">
            <li>rawMult: ${data.debug.rawMult}</li>
            <li>wMul: ${data.debug.wMul}</li>
            <li>terrMul: ${data.debug.terrMul}</li>
            ${(data.debug.registryExplain || []).map(r => `<li>${r}</li>`).join('')}
         </ul>
      </div>
      ` : ''}
    `;
    updateIcons();
    return;
  }
}


/**
 * @typedef {Object} Action
 * @property {'move'|'switch'} kind
 * @property {'self'|'enemy'} side
 * @property {number} userIndex  índice en state[side]
 * @property {string} [moveName]
 * @property {('ally'|'foes'|'self'|number)} [target]  slot objetivo
 * @property {number} [switchInIndex] índice de bench al que se hace switch
 */


// =========================================================================
// 7. LIVE MATCH SIMULATOR (VGC MODE)
// =========================================================================

export function getCandidateActions(state, side) {
  if (DEBUG_MODE) console.groupCollapsed('🧠 [AI_THINKING] Generando acciones para', side);
  const team = state[side];
  const enemyTeam = state[side === 'self' ? 'enemy' : 'self'];
  const activeSlots = side === 'self' ? state.activeSelfSlots : state.activeEnemySlots;

  const actions = [];

  for (const userIndex of activeSlots) {
    const mon = team[userIndex];
    if (!mon) continue;

    const moves = mon.set?.moves || [];
    // 1) Mejor ataque ofensivo al target más amenazante
    let bestOffense = null;
    let bestOffenseTarget = null;
    for (let i = 0; i < enemyTeam.length; i++) {
      const enemy = enemyTeam[i];
      if (!enemy) continue;
      const best = bestAttack(mon, enemy);
      if (!bestOffense || best.damage > bestOffense.damage) {
        bestOffense = best;
        bestOffenseTarget = i;
      }
    }
    if (bestOffense && bestOffenseTarget !== null) {
      actions.push({
        kind: 'move',
        side,
        userIndex,
        moveName: bestOffense.move,
        target: bestOffenseTarget,
      });
    }

    // 2) Movimiento de soporte “estrella”
    const supportPriority = ['Trick Room', 'Tailwind', 'Follow Me', 'Rage Powder', 'Protect', 'Detect', 'Fake Out'];
    const supportPick = supportPriority.find((name) => moves.includes(name));
    if (supportPick) {
      actions.push({
        kind: 'move',
        side,
        userIndex,
        moveName: supportPick,
        target: 'foes',
      });
    }

    // 3) Mejor cambio defensivo (bench más seguro)
    const benchIndices = team
      .map((m, idx) => (m && !activeSlots.includes(idx) ? idx : null))
      .filter((x) => x !== null);

    if (benchIndices.length) {
      let bestBench = null;
      let bestBenchScore = -Infinity;
      for (const benchIdx of benchIndices) {
        const candidate = team[benchIdx];
        let worstThreat = 0;
        for (const enemy of enemyTeam) {
          if (!enemy) continue;
          const atk = bestAttack(enemy, candidate);
          worstThreat = Math.max(worstThreat, atk.maxPct || atk.damage || 0);
        }
        const score = -worstThreat; // queremos minimizar daño
        if (score > bestBenchScore) {
          bestBenchScore = score;
          bestBench = benchIdx;
        }
      }
      if (bestBench !== null) {
        actions.push({
          kind: 'switch',
          side,
          userIndex,
          switchInIndex: bestBench,
        });
      }
    }
  }

  if (DEBUG_MODE) {
      console.table(actions.map(a => ({
          Tipo: a.kind, 
          Usuario: state[side][a.userIndex]?.name, 
          Movimiento_o_Cambio: a.moveName || state[side][a.switchInIndex]?.name,
          Target: a.target
      })));
      console.groupEnd();
  }

  return actions;
}

export function simulateTurn(state, actionsSelf, actionsEnemy) {
  if (DEBUG_MODE) console.groupCollapsed('🎬 [SIM_TURN] Resolviendo turno');
  // Clonar estado para no mutar directamente si quieres analizar "what-if"
  const nextState = cloneSimulationState(state);

  const all = [...actionsSelf, ...actionsEnemy];

  // Asignar prioridad base y velocidad para ordenar
  const withOrder = all.map((a) => {
    const team = nextState[a.side];
    const mon = team[a.userIndex];
    if (!mon) {
      return { action: a, prio: -Infinity, spe: -Infinity };
    }

    let prio = 0;
    if (a.kind === 'move' && a.moveName) {
      prio = getPriority(a.moveName, mon);
    }
    const sideKey = a.side;
    const spe = calculateSpeed(mon, sideKey); // ya usa TR y registry

    return { action: a, prio, spe };
  });

  withOrder.sort((a, b) => {
    if (b.prio !== a.prio) return b.prio - a.prio;
    return b.spe - a.spe;
  });

  if (DEBUG_MODE) {
      console.log('⚡ [ACTION_SORT] Orden de resolución:');
      withOrder.forEach((item, i) => {
          const monName = nextState[item.action.side][item.action.userIndex]?.name;
          console.log(`  ${i+1}. ${monName} | Acción: ${item.action.kind} | Prio: ${item.prio} | Spe: ${item.spe}`);
      });
  }

  const log = [];

  // Helpers para aplicar daño
  const applyDamage = (side, index, dmg) => {
    const team = nextState[side];
    const mon = team[index];
    if (!mon) return;
    ensureBattleState(mon);
    const baseHP = calcMonHP(mon);
    const currentHP = Math.max(1, Math.floor((baseHP * (mon.battle.hpPct ?? 100)) / 100));
    const newHP = Math.max(0, currentHP - dmg);
    mon.battle.hpPct = Math.max(0, Math.floor((newHP / baseHP) * 100));
    if (mon.battle.hpPct <= 0) {
      mon.fainted = true;
      if (DEBUG_MODE) console.log(`💀 [SIM_FAINT] ${mon.name} ha caído debilitado.`);
    }
  };

  for (const { action } of withOrder) {
    const team = nextState[action.side];
    const enemySide = action.side === 'self' ? 'enemy' : 'self';
    const enemyTeam = nextState[enemySide];

    const mon = team[action.userIndex];
    if (!mon || mon.fainted) continue;

    if (action.kind === 'switch') {
      const inMon = team[action.switchInIndex];
      if (!inMon || inMon.fainted) continue;

      // swap en el slot
      const tmp = team[action.userIndex];
      team[action.userIndex] = inMon;
      team[action.switchInIndex] = tmp;

      ensureBattleState(team[action.userIndex]);
      applySwitchInEffects(team[action.userIndex], action.side); // ya actualiza campo
      if (DEBUG_MODE) console.log(`🔄 [SIM_SWITCH] ${team[action.switchInIndex].name} sale, entra ${inMon.name} (Lado: ${action.side})`);
      log.push({
        type: 'switch',
        side: action.side,
        outIndex: action.switchInIndex,
        inIndex: action.userIndex,
      });
      continue;
    }

    if (action.kind === 'move' && action.moveName) {
      ensureMoveRegistry(action.moveName); // de Fase 3, para efectos de campo
      ensureAbilityRegistry(mon.set?.ability);
      ensureItemRegistry(mon.set?.item);

      const moveName = action.moveName;
      const actionBlockReason = getActionBlockReason(mon, moveName);
      if (actionBlockReason) {
        log.push({
          type: 'blocked',
          side: action.side,
          fromIndex: action.userIndex,
          move: moveName,
          reason: actionBlockReason,
        });
        continue;
      }
      if (isProtectMove(moveName)) {
        ensureBattleState(mon);
        mon.battle.protected = true;
        mon.battle.protectedBy = formatName(getTranslation(moveName, 'move') || moveName);
        log.push({
          type: 'protect',
          side: action.side,
          fromIndex: action.userIndex,
          move: moveName,
        });
      }
      let targets = [];

      if (typeof action.target === 'number') {
        targets = [{ side: enemySide, index: action.target }];
      } else if (action.target === 'foes') {
        targets = enemyTeam
          .map((em, idx) => (em && !em.fainted ? { side: enemySide, index: idx } : null))
          .filter(Boolean);
      } else if (action.target === 'ally') {
        const allySlots = action.side === 'self' ? nextState.activeSelfSlots : nextState.activeEnemySlots;
        targets = allySlots
          .map((idx) => (idx !== action.userIndex && team[idx] ? { side: action.side, index: idx } : null))
          .filter(Boolean);
      }

      for (const t of targets) {
        const atkMon = mon;
        const defMon = nextState[t.side][t.index];
        if (!defMon || defMon.fainted) continue;

        const info = state.moveTypeCache[moveName] || {};
        const moveCandidate = {
          move: moveName,
          type: info.type || 'normal',
          power: info.power || 0,
          damageClass: info.damageClass || 'physical',
          hits: info.hits || GUARANTEED_MULTI_HITS[moveName] || 1,
          isSpread: info.isSpread || isCanonicalSpreadMove(moveName) || SPREAD_MOVES.has(moveName) || false,
          priority: getPriority(moveName, atkMon)
        };

        const { damage, blocked } = estimateMoveDamage(atkMon, defMon, moveCandidate, nextState.field);

        if (!blocked && damage > 0) {
          applyDamage(t.side, t.index, damage);
          if (DEBUG_MODE) {
              console.log(`💥 [SIM_HIT] ${atkMon.name} usa ${moveName} contra ${defMon.name} -> Daño: ${damage} HP | HP restante: ${nextState[t.side][t.index].battle.hpPct}%`);
          }
          log.push({
            type: 'hit',
            side: action.side,
            fromIndex: action.userIndex,
            toSide: t.side,
            toIndex: t.index,
            move: moveName,
            damage,
          });
        } else if (blocked) {
          log.push({
            type: 'blocked',
            side: action.side,
            fromIndex: action.userIndex,
            toSide: t.side,
            toIndex: t.index,
            move: moveName,
          });
        }
        if (!blocked && !defMon.fainted) {
          const sideEffectText = applyManualMoveSideEffects(atkMon, defMon, moveName, t.side);
          if (sideEffectText) {
            log.push({
              type: 'sideEffect',
              side: action.side,
              fromIndex: action.userIndex,
              toSide: t.side,
              toIndex: t.index,
              move: moveName,
              text: sideEffectText,
            });
          }
        }
      }

      // Aplicar efectos secundarios de campo tras resolución
      if (typeof applyMoveResolutionEffects === 'function') {
        applyMoveResolutionEffects(mon, { name: moveName });
      }

      continue;
    }
  }

  // Final de turno: decrementar duraciones
  if (typeof tickField === 'function') {
    tickField(nextState);
  }
  nextState.self.forEach(advanceMonTurnState);
  nextState.enemy.forEach(advanceMonTurnState);

  if (DEBUG_MODE) console.groupEnd();
  return { nextState, log };
}

export function scoreBoard(state, side) {
  const self = state[side];
  const enemy = state[side === 'self' ? 'enemy' : 'self'];

  let selfScore = 0;
  let enemyScore = 0;

  for (const mon of self) {
    if (!mon) continue;
    ensureBattleState(mon);
    const baseHP = calcMonHP(mon);
    const hpWeight = (mon.battle.hpPct ?? 100) / 100;
    selfScore += baseHP * hpWeight;
  }

  for (const mon of enemy) {
    if (!mon) continue;
    ensureBattleState(mon);
    const baseHP = calcMonHP(mon);
    const hpWeight = (mon.battle.hpPct ?? 100) / 100;
    enemyScore += baseHP * hpWeight;
  }

  // Lógica simple de amenaza actual
  let threatPenalty = 0;
  if (state.matrixMode === 'defensive') {
    // Si matrixMode no es accesible directo sin getRows, se podría calcular un aproximado
    for (const enemyMon of enemy) {
      if (!enemyMon) continue;
      for (const selfMon of self) {
        if (!selfMon) continue;
        const atk = bestAttack(enemyMon, selfMon);
        if (atk.mult >= 2 && (atk.maxPct || 0) >= 50) threatPenalty += 50;
      }
    }
  }

  // Bonus si TR activo y tienes abusers vivos
  let tempoBonus = 0;
  if (state.field && state.field.trickRoom) {
    const slowAbusers = self.filter((m) => m && calculateSpeed(m, side) < 0);
    tempoBonus += slowAbusers.length * 500;
  }

  return selfScore - enemyScore - threatPenalty + tempoBonus;
}

export function suggestBestAction(state, side) {
  const actionsSelf = getCandidateActions(state, side);
  const actionsEnemy = getCandidateActions(state, side === 'self' ? 'enemy' : 'self');

  if (!actionsSelf.length) return [];

  const evaluatedActions = [];
  
  if (DEBUG_MODE) console.groupCollapsed('⚖️ [AI_THINKING] Evaluando escenarios (Minimax) para', side);

  for (const aSelf of actionsSelf) {
    // Supón que el rival elige una de sus acciones; usa un criterio simple
    let worstOutcome = Infinity;

    for (const aEnemy of actionsEnemy.length ? actionsEnemy : [{ kind: 'none' }]) {
      const { nextState } = simulateTurn(state, [aSelf], aEnemy.kind === 'none' ? [] : [aEnemy]);
      const score = scoreBoard(nextState, side);
      // Queremos ser conservadores: peor caso
      if (score < worstOutcome) worstOutcome = score;
    }

    if (DEBUG_MODE) console.log(`Evaluando acción: ${aSelf.moveName || 'Switch a ' + aSelf.switchInIndex} -> Peor escenario (Score): ${worstOutcome}`);
    evaluatedActions.push({ action: aSelf, score: worstOutcome });
  }

  evaluatedActions.sort((a, b) => b.score - a.score);
  const top3 = evaluatedActions.slice(0, 3);
  
  if (DEBUG_MODE) {
      console.log('🏆 Top 3 decisiones:', top3.map(e => `${e.action.moveName || 'Switch ' + e.action.switchInIndex} (${e.score})`));
      console.groupEnd();
  }
  
  return top3;
}

export function renderLiveRecommendations() {
  if (state.uiMode !== 'live') return;

  const suggestion = suggestBestAction(state, 'self');
  const mount = LIVE.recommendations;
  if (!mount) return;

  if (!suggestion || !suggestion.action) {
    mount.innerHTML = '<div class="muted-small">Sin recomendación clara.</div>';
    return;
  }

  const a = suggestion.action;
  const team = state.self;
  const mon = team[a.userIndex];
  
  if (!mon) return;

  let text = '';

  if (a.kind === 'move' && a.moveName === 'Protect') {
    // Busca partner con Trick Room
    const allyIdx = state.activeSelfSlots.find((i) => i !== a.userIndex);
    const ally = state.self[allyIdx];
    const hasTR = ally?.set?.moves?.includes('Trick Room');
    if (hasTR) {
      text = `Turno actual: proteger a ${mon.displayName} mientras ${ally.displayName} activa Trick Room. Al siguiente turno tendrás prioridad de velocidad con tus sweepers lentos.`;
    } else {
      text = `Proteger a ${mon.displayName} este turno reduce el riesgo de perderlo ante la presión rival.`;
    }
  } else if (a.kind === 'move') {
    text = `Recomendación: atacar con ${mon.displayName} usando ${a.moveName}.`;
  } else if (a.kind === 'switch') {
    const inMon = state.self[a.switchInIndex];
    text = `Recomendación: cambiar a ${mon.displayName} por ${inMon ? inMon.displayName : 'otro'} para mejorar el cruce defensivo.`;
  }

  mount.innerHTML = `<p>${text}</p>`;
}

export function renderLiveStatePanel() {
  const panel = LIVE.statePanel;
  const selfMount = LIVE.stateSelfSlots;
  const enemyMount = LIVE.stateEnemySlots;
  const fieldMount = LIVE.fieldControls;

  if (!panel || !selfMount || !enemyMount || !fieldMount) return;

  const isLive = state.uiMode === 'live';
  panel.style.display = isLive ? 'block' : 'none';
  if (!isLive) return;

  const renderMonControls = (mon, side, idx) => {
    if (!mon) {
      return `
        <div class="live-slot-card live-slot-card--empty">
          <div class="live-slot-title">Slot ${idx + 1}</div>
          <div class="muted-small">Vacío</div>
        </div>
      `;
    }

    ensureBattleState(mon);

    const b = mon.battle;
    const hp = b.hpPct ?? 100;
    const stages = b.stages || {};
    const status = b.status || '';

    const stageSelect = (statKey, label) => {
      const val = stages[statKey] ?? 0;
      const options = [];
      for (let s = -6; s <= 6; s++) {
        options.push(
          `<option value="${s}" ${s === val ? 'selected' : ''}>${s > 0 ? '+' + s : s}</option>`
        );
      }
      return `
        <label class="live-stat-stage">
          <span>${label}</span>
          <select
            data-live="stage"
            data-side="${side}"
            data-index="${idx}"
            data-stat="${statKey}"
          >
            ${options.join('')}
          </select>
        </label>
      `;
    };

    return `
      <div class="live-slot-card">
        <div class="live-slot-title">
          <img src="${mon.sprite}" alt="${mon.displayName}" class="sprite-micro" />
          <span>${mon.displayName}</span>
        </div>

        <label class="live-hp-control">
          <span>HP %</span>
          <input
            type="number"
            min="1"
            max="100"
            value="${hp}"
            data-live="hp"
            data-side="${side}"
            data-index="${idx}"
          />
        </label>

        <div class="live-stages-row">
          ${stageSelect('atk', 'Atk')}
          ${stageSelect('def', 'Def')}
          ${stageSelect('spa', 'SpA')}
          ${stageSelect('spd', 'SpD')}
          ${stageSelect('spe', 'Spe')}
        </div>

        <label class="live-status-control">
          <span>Estado</span>
          <select
            data-live="status"
            data-side="${side}"
            data-index="${idx}"
          >
            <option value="" ${status === '' ? 'selected' : ''}>Ninguno</option>
            <option value="brn" ${status === 'brn' ? 'selected' : ''}>Quemado</option>
            <option value="par" ${status === 'par' ? 'selected' : ''}>Parálisis</option>
            <option value="slp" ${status === 'slp' ? 'selected' : ''}>Sueño</option>
            <option value="psn" ${status === 'psn' ? 'selected' : ''}>Veneno</option>
            <option value="tox" ${status === 'tox' ? 'selected' : ''}>Tóxico</option>
            <option value="frz" ${status === 'frz' ? 'selected' : ''}>Congelado</option>
          </select>
        </label>
      </div>
    `;
  };

  selfMount.innerHTML = state.self
    .map((mon, idx) => renderMonControls(mon, 'self', idx))
    .join('');

  enemyMount.innerHTML = state.enemy
    .map((mon, idx) => renderMonControls(mon, 'enemy', idx))
    .join('');

  const f = state.field;

  fieldMount.innerHTML = `
    <div class="live-field-row">
      <label>
        <span>Clima</span>
        <select data-live="field-weather">
          <option value="" ${!f.weather ? 'selected' : ''}>Ninguno</option>
          <option value="sun" ${f.weather === 'sun' ? 'selected' : ''}>Sol</option>
          <option value="rain" ${f.weather === 'rain' ? 'selected' : ''}>Lluvia</option>
          <option value="sand" ${f.weather === 'sand' ? 'selected' : ''}>Arena</option>
          <option value="snow" ${f.weather === 'snow' ? 'selected' : ''}>Nieve</option>
        </select>
      </label>
      <label>
        <span>Turnos clima</span>
        <input type="number" min="0" max="8"
          value="${f.weatherTurns || 0}"
          data-live="field-weatherTurns"
        />
      </label>
    </div>

    <div class="live-field-row">
      <label>
        <span>Terreno</span>
        <select data-live="field-terrain">
          <option value="" ${!f.terrain ? 'selected' : ''}>Ninguno</option>
          <option value="electric" ${f.terrain === 'electric' ? 'selected' : ''}>Eléctrico</option>
          <option value="grassy" ${f.terrain === 'grassy' ? 'selected' : ''}>Hierba</option>
          <option value="psychic" ${f.terrain === 'psychic' ? 'selected' : ''}>Psíquico</option>
          <option value="misty" ${f.terrain === 'misty' ? 'selected' : ''}>Niebla</option>
        </select>
      </label>
      <label>
        <span>Turnos terreno</span>
        <input type="number" min="0" max="8"
          value="${f.terrainTurns || 0}"
          data-live="field-terrainTurns"
        />
      </label>
    </div>

    <div class="live-field-row">
      <label>
        <input type="checkbox" data-live="field-trickRoom" ${f.trickRoom ? 'checked' : ''} />
        Trick Room (${f.trickRoomTurns || 0} turnos)
      </label>
    </div>

    <div class="live-field-row">
      <label>
        <input type="checkbox" data-live="field-tailwindSelf" ${f.tailwindSelf ? 'checked' : ''} />
        Tailwind (self) (${f.tailwindSelfTurns || 0})
      </label>
      <label>
        <input type="checkbox" data-live="field-tailwindEnemy" ${f.tailwindEnemy ? 'checked' : ''} />
        Tailwind (enemy) (${f.tailwindEnemyTurns || 0})
      </label>
    </div>
  `;

  attachLiveStateListeners();
}

export function attachLiveStateListeners() {
  const root = LIVE.statePanel;
  if (!root) return;

  const updateLive = () => {
    window.currentDamageCache = {};
    if (typeof renderLiveStatePanel === 'function') renderLiveStatePanel();
    if (typeof renderLiveRecommendations === 'function') renderLiveRecommendations();
    const rows = getRows();
    renderMatrix(rows);
    renderLiveBattleToolbar();
    updateIcons();
  };

  root.querySelectorAll('[data-live]').forEach((el) => {
    const kind = el.getAttribute('data-live');

    if (kind === 'hp') {
      el.onchange = (e) => {
        const side = el.dataset.side;
        const idx = Number(el.dataset.index);
        const mon = state[side][idx];
        if (!mon) return;
        ensureBattleState(mon);
        const v = Math.max(1, Math.min(100, Number(e.target.value) || 1));
        mon.battle.hpPct = v;
        updateLive();
      };
    }

    if (kind === 'stage') {
      el.onchange = (e) => {
        const side = el.dataset.side;
        const idx = Number(el.dataset.index);
        const statKey = el.dataset.stat;
        const mon = state[side][idx];
        if (!mon) return;
        ensureBattleState(mon);
        const v = Math.max(-6, Math.min(6, Number(e.target.value) || 0));
        mon.battle.stages[statKey] = v;
        updateLive();
      };
    }

    if (kind === 'status') {
      el.onchange = (e) => {
        const side = el.dataset.side;
        const idx = Number(el.dataset.index);
        const mon = state[side][idx];
        if (!mon) return;
        ensureBattleState(mon);
        mon.battle.status = e.target.value || null;
        updateLive();
      };
    }

    if (kind.startsWith('field-')) {
      el.onchange = (e) => {
        const key = kind.replace('field-', '');
        const f = state.field;

        if (key === 'weather' || key === 'terrain') {
          f[key] = e.target.value || null;
        } else if (key === 'trickRoom') {
          f.trickRoom = e.target.checked;
          if (f.trickRoom && f.trickRoomTurns === 0) f.trickRoomTurns = 5;
          if (!f.trickRoom) f.trickRoomTurns = 0;
        } else if (key === 'tailwindSelf' || key === 'tailwindEnemy') {
          f[key] = e.target.checked;
          const turnsKey = key + 'Turns';
          if (f[key] && f[turnsKey] === 0) f[turnsKey] = 4;
          if (!f[key]) f[turnsKey] = 0;
        } else if (key === 'weatherTurns' || key === 'terrainTurns') {
          f[key] = Math.max(0, Math.min(8, Number(e.target.value) || 0));
        }

        updateLive();
      };
    }
  });
}

// --- EXPOSE GLOBALS FOR UI EVENTS ---
window.setActiveBattleSlot = setActiveBattleSlot;

// Expose state globally for debug and HTML onclick handlers
window.state = state;
