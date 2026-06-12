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
import { blocksFlinch } from './battle/rule-registry.js';
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
import { getFocusedTeam, getSuggestedReserves, scoreBoard, simulateTurn } from './modes/live.js';
import * as championsRules from './rules/index.js';
// Expose openSetEditor globally so it can be called by inline onclick handlers if any
window.openSetEditor = openSetEditor;
window.openModal = openModal;
window.setUiMode = setUiMode;

// Capa de regulaciones oficiales (rules/): expuesta para la UI y la consola.
// validateCurrentTeam() valida el equipo propio contra la regulación activa
// en state.rules (cláusulas species/item, tamaño, vetos y roster si existe).
window.ChampionsRules = {
  ...championsRules,
  validateCurrentTeam() {
    return championsRules.validateTeam(state.self, {
      regulation: state.rules?.regulationId,
      format: state.rules?.format || 'doubles',
    });
  },
  setRegulation(regulationId) {
    const reg = championsRules.getRegulation(regulationId);
    if (!reg) return null;
    state.rules = { ...(state.rules || {}), regulationId: reg.id };
    return reg;
  },
};
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

// --- QUICK MODE + TURNO 1: implementación extraída a modes/quick.js ---
// Reexports de compatibilidad para consumidores legados.
export {
  renderWeaknessSummary,
  getTurn1ResolvedLeadIndices,
  advanceMonTurnState,
  applyManualMoveSideEffects,
  getActionBlockReason,
  isProtectMove,
} from './modes/quick.js';
import { clearAll, swapTeams, initTurn1SimulatorRuntimeBindings } from './modes/quick.js';

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

// --- LIVE BATTLE CENTER: implementación extraída a modes/live.js ---
// Reexport de compatibilidad para consumidores legados (render/analysis.js,
// matrix/render.js importan getFocusedTeam desde app-core).
export { getFocusedTeam } from './modes/live.js';
