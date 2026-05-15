import { DEBUG_MODE, FLOW_DEBUG, smartLog, flowLog, debounce, resetSmartLog, setDebugMode } from './utils/debug.js';
import { 
  i18nCache, getTranslation, fetchTranslation, normalizeText, formatName, 
  compactName, slugFromSmogonName, displayFromSmogonName, pokeapiPokemonSlug, 
  escapeHtml, localizeMoveName, localizeTypeName 
} from './utils/text.js';
import { hexToRgba, getContrastColor, typeDot, typeChip, effectiveness, fmtMult, effClass, topEntries, topKey } from './utils/types.js';
import { parseSpread, getNatureSpeModifier, natureMod, getBaseStatRaw, calcMonHP, stageMultiplier, calcOtherStatLv50, calculateEffectiveStats } from './battle/stats.js';
import { state, createInitialState } from './core/state.js';
import { getSavedTeams, setSavedTeams, saveCurrentTeam, deleteSavedTeam } from './teams/storage.js';
import { serializeSetSummary, getCacheKey, buildMetaIndex, buildFallbackIndex, getMetaRecord } from './data/meta.js';
import { chooseBestItem, buildDefaultSetForSpecies } from './data/sets.js';
import { ensureBattleState, homeSpriteFromPokemon, fetchPokemon, setOnPokemonFetched } from './data/pokemon.js';
import { ensureAbilityRegistry, ensureItemRegistry, ensureMoveRegistry, ensureStatusRegistry, warmupRegistries } from './battle/registry.js';
import { isSupportMove, fetchMoveInfo, getMoveCandidates } from './battle/moves.js';
import { getSpeedModifier, calculateSpeed } from './battle/speed.js';
import { getWeatherAndTerrainMultipliers, applyRegistryDamageModifiers, calculateDamageRolls, estimateMoveDamage, bestAttack } from './battle/damage.js';
import { scoreThreat, inferStrategies } from './analysis/threats.js';
import { tickField, recalculateActiveField, applySwitchInEffects, applyHazardsOnSwitchIn, applyMoveResolutionEffects } from './battle/effects.js';
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
  TEST_TEAMS,
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
setEffectsActiveIndicesCallback((side) => state.uiMode === 'quick' ? getTurn1ResolvedLeadIndices(side) : (side === 'self' ? state.activeSelfSlots : state.activeEnemySlots));

window.loggedMessages = window.loggedMessages || new Set();

function toggleDebug(force) {
  setDebugMode(force);
  renderAll();
}

function runDebugScenarios() {
  const scenarios = [];

  scenarios.push({
    name: 'Intimidate + Friend Guard + Reflect',
    setup: () => {
      const s = structuredClone(state);
      return s;
    },
  });

  for (const sc of scenarios) {
    sc.setup();
    const rows = getRows();
    console.log('[SCENARIO]', sc.name, rows);
  }
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

function scheduleMoveWarmup() {
  warmupRegistries();
  recalculateActiveField();
  renderAll();
  if (state.setEditor.index !== null) {
    renderSetEditor();
    if (state.setChoice.kind) renderSetChoiceList();
  }
}

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

function getRows() {
  const self = getFocusedTeam('self');
  const enemy = getFocusedTeam('enemy');
  if (!self.length || !enemy.length) return [];

  if (state.matrixMode === "defensive") {
    return enemy.map((attacker) => ({
      attacker,
      cells: self.map((defender) => {
        const best = bestAttack(attacker, defender);
        return {
          attacker,
          defender,
          type: best.type,
          mult: best.mult,
          rawMult: best.rawMult,
          wMul: best.wMul,
          terrMul: best.terrMul,
          blocked: best.blocked,
          move: best.move,
          damage: best.damage,
          minPct: best.minPct,
          maxPct: best.maxPct,
          ohkoProb: best.ohkoProb,
          ohko: best.ohko,
        };
      }),
    }));
  }

  return self.map((attacker) => ({
    attacker,
    cells: enemy.map((defender) => {
      const best = bestAttack(attacker, defender);
      return {
        attacker,
        defender,
        type: best.type,
        mult: best.mult,
        rawMult: best.rawMult,
        wMul: best.wMul,
        terrMul: best.terrMul,
        blocked: best.blocked,
        move: best.move,
        damage: best.damage,
        minPct: best.minPct,
        maxPct: best.maxPct,
        ohkoProb: best.ohkoProb,
        ohko: best.ohko,
      };
    }),
  }));
}

function matrixCellClass(cell) {
  if (state.matrixMode === "defensive") {
    if (cell.mult <= 0.5) return "eff-def-safe";
    if (cell.mult >= 2) return "eff-def-danger";
    return "eff-def-neutral";
  }
  return effClass(cell.mult);
}

function renderDock(side) {
  const arr = state[side];
  const mount = side === "self" ? selfSlots : enemySlots;

  mount.innerHTML = arr
    .map((mon, idx) => {
      if (!mon) {
        return `
            <button class="mini-slot empty" data-action="pick" data-side="${side}" data-index="${idx}" aria-label="Añadir slot ${idx + 1}">
              <span class="plus">+</span>
            </button>
          `;
      }

      const chosenIndex = side === "self" && state.uiMode === 'quick' && state.chosenFour ? state.chosenFour.indexOf(idx) : -1;
      const chosenBadge = chosenIndex !== -1
        ? `<div class="chosen-badge">${chosenIndex + 1}</div>`
        : '';

      return `
          <button class="mini-slot" data-action="pick" data-side="${side}" data-index="${idx}" aria-label="${mon.displayName}" ${side === "enemy" ? `data-scout="${mon.name}"` : ""}>
            ${chosenBadge}
            ${mon.name.includes("-mega") ? '<div class="mega-icon"></div>' : ""}
            <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
            ${side === "self" ? `<span class="slot-edit-dot" title="Set configurado"></span>` : ""}
            <span class="slot-remove" data-action="remove" data-side="${side}" data-index="${idx}"><i data-lucide="x" style="width:12px;height:12px;"></i></span>
          </button>
        `;
    })
    .join("");
}

function formatCellPct(cell) {
  if (cell.blocked || cell.mult === 0) return '0%';
  const min = Number.isFinite(cell.minPct) ? cell.minPct : 0;
  const max = Number.isFinite(cell.maxPct) ? cell.maxPct : 0;
  if (!min && !max) return '0%';
  if (min === max) return `${max}%`;
  return `${min}-${max}%`;
}

function describeWeatherEffect(cell) {
  if (!cell.weather || !cell.weatherMul || cell.weatherMul === 1) return '';
  return `${WEATHER_LABELS[cell.weather] || cell.weather} ${cell.weatherMul > 1 ? 'potencia' : 'reduce'}`;
}

function describeTerrainEffect(cell) {
  if (cell.blocked && cell.terrain === 'psychic') return 'Psíquico anula prioridad';
  if (!cell.terrain || !cell.terrainMul || cell.terrainMul === 1) return '';
  return `${TERRAIN_LABELS[cell.terrain] || cell.terrain} ${cell.terrainMul > 1 ? 'potencia' : 'reduce'}`;
}

function classifyMatrixCell(cell, offensive = true) {
  const maxPct = Number(cell.maxPct || 0);
  const minPct = Number(cell.minPct || 0);

  if (offensive) {
    if (cell.blocked) return { tone: 'blocked', label: 'Bloqueado', shortLabel: 'Bloqueado' };
    if (cell.mult === 0) return { tone: 'immune', label: 'Inmune', shortLabel: 'Inmune' };
    if (cell.ohkoProb >= 75 || (maxPct >= 100 && minPct >= 85)) {
      return { tone: 'ko', label: 'KO probable', shortLabel: 'KO' };
    }
    if (cell.mult >= 2 && maxPct >= 50) {
      return { tone: 'pressure', label: 'Presión alta', shortLabel: 'Presión' };
    }
    if (cell.mult > 1 || maxPct >= 25) {
      return { tone: 'chip', label: 'Chip útil', shortLabel: 'Chip' };
    }
    if (cell.mult < 1 || maxPct < 25) {
      return { tone: 'wall', label: 'Muro', shortLabel: 'Muro' };
    }
    return { tone: 'neutral', label: 'Neutral', shortLabel: 'Neutral' };
  }

  if (cell.mult === 0) return { tone: 'safe', label: 'Inmune', shortLabel: 'Inmune' };
  if (cell.mult < 1 && maxPct < 35) return { tone: 'safe', label: 'Cambio seguro', shortLabel: 'Seguro' };
  if (cell.ohkoProb >= 50 || maxPct >= 90 || cell.mult >= 4) {
    return { tone: 'danger', label: 'Peligro real', shortLabel: 'Peligro' };
  }
  if (cell.mult >= 2 || maxPct >= 50) {
    return { tone: 'respect', label: 'Respetar', shortLabel: 'Respeto' };
  }
  return { tone: 'neutral', label: 'Neutral', shortLabel: 'Neutral' };
}

function buildMatrixContextTags(cell, offensive, compact = false) {
  const tags = [];

  const weatherTag = describeWeatherEffect(cell);
  const terrainTag = describeTerrainEffect(cell);

  if (cell.blocked) {
    tags.push({ tone: 'blocked', label: terrainTag || 'Bloqueado por campo' });
  } else {
    if (weatherTag) {
      tags.push({
        tone: cell.weatherMul > 1 ? 'boost' : 'nerf',
        label: weatherTag
      });
    }

    if (terrainTag) {
      tags.push({
        tone: cell.terrainMul > 1 ? 'boost' : 'nerf',
        label: terrainTag
      });
    }

    if (cell.ohkoProb > 0 && cell.ohkoProb < 100) {
      tags.push({ tone: 'danger', label: `OHKO ${cell.ohkoProb}%` });
    }

    if (offensive && cell.mult >= 2 && cell.maxPct < 50) {
      tags.push({ tone: 'info', label: 'Buen tipo, daño medio' });
    }

    if (offensive && cell.mult < 1 && cell.maxPct < 25) {
      tags.push({ tone: 'blocked', label: 'No merece click' });
    }
  }

  return tags.slice(0, compact ? 1 : 3);
}

function getTacticalPhrase(cell, offensive) {
  if (offensive) {
    if (cell.blocked) return "Bloqueado por estado del campo";
    if (cell.mult === 0) return "Totalmente inmune al daño";
    if (cell.ohkoProb >= 75 || (cell.maxPct >= 100 && cell.minPct >= 85)) return "Amenaza KO si entra limpio";
    if (cell.mult >= 2 && cell.maxPct >= 50) return "Buena presión, fuerza respuesta";
    if (cell.mult > 1 || cell.maxPct >= 25) return "Buen chip, no fuerza cambio";
    if (cell.mult < 1 || cell.maxPct < 25) return "Resiste bien, no compensa pulsar";
    return "Daño aceptable sin ventaja clara";
  } else {
    if (cell.mult === 0) return "Inmune a su mejor ataque";
    if (cell.mult < 1 && cell.maxPct < 35) return "Entrada segura, resiste bien";
    if (cell.ohkoProb >= 50 || cell.maxPct >= 90 || cell.mult >= 4) return "Te castiga si pivotas aquí";
    if (cell.mult >= 2 || cell.maxPct >= 50) return "Amenaza fuerte, cuidado al entrar";
    return "Intercambio de daño parejo";
  }
}

function renderMatrixExplainer(rows, offensive) {
  const titleEl = document.getElementById('matrixExplainerTitle');
  const textEl = document.getElementById('matrixExplainerText');
  const badgesEl = document.getElementById('matrixExplainerBadges');
  const footEl = document.getElementById('matrixExplainerFoot');

  if (!titleEl || !textEl || !badgesEl || !footEl) return;

  if (offensive) {
    titleEl.textContent = 'Cómo leer esta matriz';
    textEl.textContent = 'Cada celda resume si conviene presionar, cuánto daño estimas y qué campo altera la lectura.';
    badgesEl.innerHTML = `
      <span class="matrix-state-badge matrix-state-badge--ko">KO probable</span>
      <span class="matrix-state-badge matrix-state-badge--pressure">Presión alta</span>
      <span class="matrix-state-badge matrix-state-badge--chip">Chip útil</span>
      <span class="matrix-state-badge">Neutral</span>
      <span class="matrix-state-badge matrix-state-badge--wall">Muro</span>
      <span class="matrix-state-badge matrix-state-badge--blocked">Inmune / bloqueado</span>
    `;
    footEl.textContent = 'Objetivo: detectar KOs, presión útil y muros reales de un vistazo.';
  } else {
    titleEl.textContent = 'Cómo leer esta matriz';
    textEl.textContent = 'Cada celda resume si puedes entrar seguro, qué amenaza recibes y qué campo empeora el cruce.';
    badgesEl.innerHTML = `
      <span class="matrix-state-badge matrix-state-badge--danger">Peligro real</span>
      <span class="matrix-state-badge matrix-state-badge--respect">Respetar</span>
      <span class="matrix-state-badge">Neutral</span>
      <span class="matrix-state-badge matrix-state-badge--safe">Cambio seguro</span>
      <span class="matrix-state-badge matrix-state-badge--blocked">Inmune</span>
    `;
    footEl.textContent = 'Objetivo: detectar entradas seguras, amenazas inmediatas e inmunidades antes de pivotar.';
  }
}

function loadMatrixPreferences() {
  try {
    const detailMode = localStorage.getItem(MATRIX_DETAIL_MODE_KEY);
    if (detailMode === 'compact' || detailMode === 'detailed') {
      state.matrixDetailMode = detailMode;
    } else {
      state.matrixDetailMode = 'detailed';
    }
    
    const helpSeen = localStorage.getItem(MATRIX_HELP_SEEN_KEY);
    if (!helpSeen) {
      state.matrixHelpOpen = true;
      localStorage.setItem(MATRIX_HELP_SEEN_KEY, "true");
    }
  } catch(e) {
    console.error(e);
  }
}

function setMatrixDetailMode(mode) {
  state.matrixDetailMode = mode;
  try { localStorage.setItem(MATRIX_DETAIL_MODE_KEY, mode); } catch(e){console.error(e);}
  triggerMatrixFlash();
  renderAll();
}

function toggleMatrixHelp(forceOpen) {
  state.matrixHelpOpen = forceOpen !== undefined ? forceOpen : !state.matrixHelpOpen;
  const panel = document.getElementById('matrixHelpPanel');
  const btn = document.getElementById('matrixHelpToggleBtn');
  if (panel && btn) {
    panel.classList.toggle('is-open', state.matrixHelpOpen);
    btn.setAttribute('aria-expanded', state.matrixHelpOpen ? 'true' : 'false');
  }
}

function sanitizeCell(cell) {
  const move = typeof cell.move === 'string' ? cell.move.trim() : '';

  const minPct = Number(cell.minPct);
  const maxPct = Number(cell.maxPct);
  const hasValidDamage = Number.isFinite(minPct) && Number.isFinite(maxPct);

  if (!move || !hasValidDamage) {
    console.warn(`[DEBUG] sanitizeCell: Cell flagged with dataIssue. Attacker: ${cell.attacker?.name}, Move: "${move}", hasValidDamage: ${hasValidDamage}`, cell);
    return { ...cell, move: null, minPct: null, maxPct: null, dataIssue: true };
  }

  return cell;
}

function buildMatrixCellMarkup(rowAttacker, rawCell, offensive, compact = false) {
  const cell = sanitizeCell(rawCell);
  const isCompact = compact;
  const verdict = classifyMatrixCell(cell, offensive);
  const moveLabel = cell.dataIssue ? 'Datos incompletos' : (localizeMoveName(cell.move) || 'Sin presión real');
  const rangeLabel = cell.dataIssue ? 'N/A' : formatCellPct(cell);
  
  const multLabel = cell.blocked ? 'inmune' : `x${fmtMult(cell.mult).replace('×', '')}`;
  
  let metaLine;
  if (cell.blocked) {
    metaLine = `0% · ${multLabel}`;
  } else {
    metaLine = cell.dataIssue ? `Sin daño · ${multLabel}` : `${rangeLabel} · ${multLabel}`;
  }
  
  const phrase = getTacticalPhrase(cell, offensive);

  const tags = buildMatrixContextTags(cell, offensive, isCompact);
  const payloadObject = {
    attacker: rowAttacker,
    defender: cell.defender,
    moveName: cell.move,
    moveType: cell.type || 'normal',
    mult: cell.mult ?? cell.rawMult ?? 1,
    rawMult: cell.rawMult ?? 1,
    wMul: cell.wMul ?? 1,
    terrMul: cell.terrMul ?? 1,
    damage: cell.damage ?? 0,
    minPct: cell.minPct,
    maxPct: cell.maxPct,
    ohkoProb: Number(cell.ohkoProb || 0),
    verdict: verdict.label,
    blocked: !!cell.blocked,
    offensive: offensive,
    tags: tags.map((tag) => tag.label),
    label: phrase,
    shortNote: metaLine,
    dataIssue: cell.dataIssue,
    debug: DEBUG_MODE
      ? {
          registryExplain: cell.registryExplain || [],
          rawMult: cell.rawMult,
          wMul: cell.wMul,
          terrMul: cell.terrMul,
        }
      : null,
  };

  if (cell.dataIssue) {
    console.warn(`[DEBUG] buildMatrixCellMarkup: dataIssue detected for ${rowAttacker?.name} vs ${cell.defender?.name}`, payloadObject);
  }

  const tooltipData = encodeURIComponent(JSON.stringify(payloadObject));

  const classes = [
    'cell',
    'matrix-cell-card',
    `matrix-cell-card--${verdict.tone}`,
    'clickable-cell'
  ];

  const stateLabel = isCompact ? verdict.shortLabel : verdict.label;
  const tagsHtml = tags.map(tag => `
        <span class="matrix-context-chip matrix-context-chip--${tag.tone}">
          ${escapeHtml(tag.label)}
        </span>
      `).join('');
  const chipsHtml = tags.length
    ? `<div class="matrix-cell-context">${tagsHtml}</div>`
    : '';

  if (isCompact) {
    return `
      <div class="${classes.join(' ')}" data-tooltip="${tooltipData}" title="Toca para lectura táctica">
        <div class="cell__top">
          <div class="cell__top-state">${escapeHtml(stateLabel)}</div>
          ${cell.type ? typeChip(cell.type) : ''}
        </div>
        <div class="cell__move ${cell.move ? '' : 'matrix-cell-move--muted'}">
          ${escapeHtml(moveLabel)}
        </div>
        <div class="cell__range">
          ${escapeHtml(metaLine)}
        </div>
        ${chipsHtml}
      </div>
    `;
  } else {
    return `
      <div class="${classes.join(' ')}" data-tooltip="${tooltipData}" title="Toca para lectura táctica">
        <div class="cell__top-state">${escapeHtml(stateLabel)}</div>
        <div class="cell__move-box">
          ${cell.type ? typeChip(cell.type) : ''}
          <span class="cell__move ${cell.move ? '' : 'matrix-cell-move--muted'}">${escapeHtml(moveLabel)}</span>
        </div>
        <div class="cell__dmg-box">
          <span class="cell__dmg-range">${rangeLabel}</span>
          <span class="cell__dmg-mult">${multLabel}</span>
        </div>
        <div class="cell__note">${escapeHtml(phrase)}</div>
      </div>
    `;
  }
}

function updateMatrixFieldUI() {
  const modeBtns = document.querySelectorAll("#matrixModeToggleGroup .segmented-btn");
  modeBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === state.matrixMode);
  });

  const detailBtns = document.querySelectorAll("#matrixDetailToggleGroup .segmented-btn");
  detailBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.detail === state.matrixDetailMode);
  });

  const title = document.getElementById("matrixSectionTitle");
  const sub = document.getElementById("matrixSectionSub");
  const legend = document.getElementById("matrixLegendChip");
  if (title)
    title.textContent =
      state.matrixMode === "defensive" ? "Matriz defensiva" : "Matriz ofensiva";
  if (sub) {
    if (state.matrixMode === "offensive") {
      sub.textContent = state.matrixDetailMode === "compact"
        ? "Cruces rápidos para detectar KO, presión útil y muros."
        : "Detalle de daño estimado, tipo y presión por cruce.";
    } else {
      sub.textContent = state.matrixDetailMode === "compact"
        ? "Qué amenazas te rompen y qué cruces aguantas."
        : "Daño entrante estimado con clima, terreno y sets actuales.";
    }
  }
  if (legend) {
    legend.textContent =
      state.matrixMode === "defensive"
        ? "Verde ≤×0.5 · Rojo ≥×2"
        : "×4 / ×2 · 💀 OHKO";
  }

  document.querySelectorAll("#matrixFieldControls [data-weather]").forEach((el) => {
    el.classList.toggle("on", state.field.weather === el.dataset.weather);
  });
  document.querySelectorAll("#matrixFieldControls [data-terrain]").forEach((el) => {
    el.classList.toggle("on", state.field.terrain === el.dataset.terrain);
  });
}

function renderMatrix(rows) {
  updateMatrixFieldUI();

  const offensive = state.matrixMode !== 'defensive';
  renderMatrixExplainer(rows, offensive);

  if (!rows.length) {
    matrixPlaceholder.classList.remove('hidden');
    matrixContainer.classList.add('hidden');
    matrixContainer.classList.remove('matrix-grid--compact');
    matrixStatus.textContent = '0 cruces';
    const mc = document.getElementById('metricCross');
    const ms = document.getElementById('metricStrong');
    const mp = document.getElementById('metricPeak');
    const ma = document.getElementById('metricAvg');
    if (mc) mc.textContent = '0';
    if (ms) ms.textContent = '0';
    if (mp) mp.textContent = '0';
    if (ma) ma.textContent = '0.00';
    return;
  }

  const self = getFocusedTeam('self');
  const enemy = getFocusedTeam('enemy');
  const colMons = offensive ? enemy : self;
  const flat = rows.flatMap((row) => row.cells);
  const cross = flat.length;
  const isCompact = state.matrixDetailMode === 'compact';

  let ohkos = 0;
  let pressure = 0;
  let walls = 0;

  flat.forEach((cell) => {
    if (cell.ohko || cell.ohkoProb >= 50) {
      ohkos++;
    } else if (cell.mult >= 2) {
      pressure++;
    }
    if (cell.mult <= 0.5 || cell.blocked) {
      walls++;
    }
  });

  const elOhko = document.getElementById('metricOhkoCount');
  const elPressure = document.getElementById('metricPressureCount');
  const elWall = document.getElementById('metricWallCount');
  
  if (elOhko) elOhko.innerHTML = `<strong>${ohkos}</strong> OHKOs`;
  if (elPressure) elPressure.innerHTML = `<strong>${pressure}</strong> Presión x2+`;
  if (elWall) elWall.innerHTML = `<strong>${walls}</strong> Muros/Inmunes`;

  matrixStatus.textContent = `${cross} cruces`;

  matrixContainer.classList.remove('matrix-grid--compact', 'matrix-grid--detailed');
  matrixContainer.classList.add(`matrix-grid--${state.matrixDetailMode}`);

  const colTag = offensive ? 'RIVAL' : 'TÚ';
  const colColor = offensive ? 'var(--red)' : 'var(--blue)';
  const rowTag = offensive ? 'TÚ' : 'RIVAL';
  const rowColor = offensive ? 'var(--blue)' : 'var(--red)';
  const theadBorder = offensive ? 'rgba(255, 59, 48, 0.4)' : 'rgba(50, 173, 230, 0.4)';
  const tbodyBorder = offensive ? 'rgba(50, 173, 230, 0.4)' : 'rgba(255, 59, 48, 0.4)';

  const thead = `
    <thead>
      <tr>
        <th class="corner" style="background:linear-gradient(to bottom right, transparent 49%, var(--line) 50%, transparent 51%); position:sticky; top:0; left:0; z-index:3;">
          <span style="position:absolute; top:4px; right:4px; font-size:0.55rem; font-weight:900; color:${colColor};">${colTag}</span>
          <span style="position:absolute; bottom:4px; left:4px; font-size:0.55rem; font-weight:900; color:${rowColor};">${rowTag}</span>
        </th>
        ${colMons.map((mon) => `
          <th style="border-bottom:2px solid ${theadBorder}">
            <div class="head-mon" title="${escapeHtml(mon.displayName)}">
              <div class="sprite">
                <img src="${mon.sprite}" alt="${escapeHtml(mon.displayName)}" loading="lazy">
              </div>
            </div>
          </th>
        `).join('')}
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${rows.map((row) => `
        <tr>
          <th style="border-right:2px solid ${tbodyBorder}">
            <div class="row-mon" title="${escapeHtml(row.attacker.displayName)}">
              <div class="sprite">
                <img src="${row.attacker.sprite}" alt="${escapeHtml(row.attacker.displayName)}" loading="lazy">
              </div>
            </div>
          </th>

          ${row.cells.map((cell) => `
            <td>
              ${buildMatrixCellMarkup(row.attacker, cell, offensive, isCompact)}
            </td>
          `).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;

  matrixContainer.innerHTML = `<table>${thead}${tbody}</table>`;
  matrixPlaceholder.classList.add('hidden');
  matrixContainer.classList.remove('hidden');
  updateIcons();
}

function renderThreats() {
  const enemy = getFocusedTeam('enemy');

  if (!enemy.length) {
    threatList.innerHTML = `<div class="empty">Añade un rival para activar el semáforo.</div>`;
    return;
  }

  const items = enemy
    .map((mon) => {
      const threat = scoreThreat(mon, getFocusedTeam('self'));
      return { mon, threat };
    })
    .sort((a, b) => b.threat.score - a.threat.score);

  const reds = items.filter(i => i.threat.level === 'red');
  const ambers = items.filter(i => i.threat.level === 'amber');
  const greens = items.filter(i => i.threat.level === 'green');

  let html = '';

  if (reds.length > 0) {
    html += reds.map(({ mon, threat }) => `
      <div class="threat-hero-card" data-scout="${mon.name}">
        <div class="threat-hero-sprite">
          <img src="${mon.sprite}" alt="${mon.displayName}">
        </div>
        <div>
          <div style="font-weight: 900; font-size: 1.15rem; color: #fff;">${mon.displayName}</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
            ${threat.reasons.map(r => `<span class="tag-pill tag-pill--danger">${r}</span>`).join("")}
            ${threat.isSupportThreat ? `<span class="tag-pill tag-pill--info"><i data-lucide="shield-alert"></i> Peligro de Soporte</span>` : ""}
          </div>
          ${threat.bestAnswers.length ? `
            <div class="threat-kill-chain">
              <span style="color: var(--muted); font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">Respuestas</span>
              <i data-lucide="arrow-right" style="color: var(--red); width: 14px; height: 14px;"></i>
              ${threat.bestAnswers.map(ans => `<img src="${ans.sprite}" class="sprite-micro" title="${ans.displayName}" style="width: 28px; height: 28px;">`).join("")}
            </div>
          ` : ""}
        </div>
      </div>
    `).join("");
  }

  if (ambers.length > 0) {
    html += `<div class="threat-amber-grid">`;
    html += ambers.map(({ mon, threat }) => `
      <div class="threat-compact-card" data-scout="${mon.name}">
        <img src="${mon.sprite}" style="width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" alt="${mon.displayName}">
        <div style="font-weight: 900; font-size: 0.85rem; color: #fff;">${mon.displayName}</div>
        ${threat.reasons.length ? `<div style="color: var(--orange); font-size: 0.65rem; line-height: 1.2;">${threat.reasons[0]}</div>` : ""}
        ${threat.isSupportThreat ? `<div style="color: var(--blue); font-size: 0.65rem; font-weight: bold; line-height: 1.2;">Soporte Clave</div>` : ""}
      </div>
    `).join("");
    html += `</div>`;
  }

  if (greens.length > 0) {
    html += `<div class="threat-walled-zone">`;
    html += greens.map(({ mon }) => `
      <div class="threat-walled-sprite" title="${mon.displayName}" data-scout="${mon.name}">
        <img src="${mon.sprite}" alt="${mon.displayName}">
        <div class="threat-walled-check"><i data-lucide="shield-check"></i></div>
      </div>
    `).join("");
    html += `</div>`;
  }

  threatList.innerHTML = html;

  updateIcons();
}

function renderOpportunities(rows) {
  if (state.matrixMode === "defensive") {
    opportunityList.innerHTML = `<div class="muted-small">Las oportunidades ofensivas solo aplican en vista ofensiva.</div>`;
    return;
  }

  // Extraer todas las interacciones fuertes (mult >= 2)
  const allStrongHits = rows
    .flatMap((r) => r.cells)
    .filter((x) => x.mult >= 2)
    .sort((a, b) => b.mult - a.mult);

  if (!allStrongHits.length) {
    opportunityList.innerHTML = `<div class="empty">No hay ventanas de presión clara todavía.</div>`;
    return;
  }

  // Agrupar por Defensor (El Pokémon rival vulnerable)
  const targets = {};
  allStrongHits.forEach(hit => {
    const defName = hit.defender.name;
    if (!targets[defName]) {
      targets[defName] = {
        defender: hit.defender,
        highestMult: hit.mult,
        ohkoRisk: hit.ohko || hit.ohkoProb >= 100,
        executioners: []
      };
    }
    // Añadir ejecutores (máximo 2 por target para no saturar la tarjeta)
    if (targets[defName].executioners.length < 2) {
      targets[defName].executioners.push(hit);
    }
    // Actualizar riesgo si alguien le hace OHKO
    if (hit.ohko || hit.ohkoProb >= 100) targets[defName].ohkoRisk = true;
  });

  // Convertir a array, ordenar por riesgo (OHKO primero, luego multiplicador) y tomar top 4
  const topTargets = Object.values(targets)
    .sort((a, b) => (b.ohkoRisk === a.ohkoRisk ? b.highestMult - a.highestMult : b.ohkoRisk ? 1 : -1))
    .slice(0, 4);

  opportunityList.className = "target-lock-board";

  opportunityList.innerHTML = topTargets.map(target => {
    const isHot = target.ohkoRisk || target.highestMult >= 4;
    const badgeText = target.ohkoRisk ? "💀 Riesgo OHKO" : `Peligro x${target.highestMult}`;
    const badgeClass = isHot ? "target-lethality-badge target-lethality-badge--hot" : "target-lethality-badge";

    return `
      <div class="target-bounty-card">
        <div class="${badgeClass}">${badgeText}</div>
        
        <div class="target-crosshair" title="${target.defender.displayName}">
          <img src="${target.defender.sprite}" alt="${target.defender.displayName}" loading="lazy">
        </div>

        <div class="target-executioners">
          ${target.executioners.map(hit => {
             const typeMeta = TYPE_META[hit.type] || { color: '#8aa2c6' };
             return `
               <div class="target-execution-row">
                 <img src="${hit.attacker.sprite}" class="sprite-micro" title="${hit.attacker.displayName}">
                 <div style="display:flex; align-items:center; gap:4px;">
                   <span class="target-move-name">${getTranslation(hit.move, "move") || hit.type}</span>
                   <div class="type-icon-circle" style="position: static; width:14px; height:14px; background-color: ${typeMeta.color};"></div>
                 </div>
               </div>
             `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  updateIcons();
}

function renderStrategies() {
  const enemy = state.enemy.filter(Boolean);
  const strategies = inferStrategies(enemy);

  if (!strategies.length) {
    strategyList.innerHTML = `<div class="empty">Sin datos para inferir estrategias.</div>`;
    return;
  }

  strategyList.style.display = "grid";
  strategyList.style.gridTemplateColumns = "repeat(auto-fit, minmax(140px, 1fr))";
  strategyList.style.gap = "8px";

  strategyList.innerHTML = strategies
    .map(
      (item) => `
        <div class="strategy-row">
          <div style="font-size: 1.6rem; color: var(--blue); margin-bottom: 4px; display: grid; place-items: center;">${item.icon}</div>
          <div class="row-title" style="font-size: 0.85rem;">${item.title}</div>
          <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:2px; margin-top:6px;">
            ${(item.triggers || []).map(t => `<img src="${t.sprite}" class="sprite-micro" title="${t.displayName}" alt="${t.displayName}">`).join('')}
          </div>
        </div>
      `,
    )
    .join("");

  updateIcons();
}


// =========================================================================
// 3. TEAM BUILDER & POKEDEX
// =========================================================================

async function loadSavedTeam(id, side = "self") {
  const teams = getSavedTeams();
  const team = teams.find((t) => t.id === id);
  if (!team) return;

  const mons = await Promise.all(
    team.mons.map(async (saved) => {
      try {
        const mon = await fetchPokemon(saved.name);
        mon.set = saved.set || mon.set;
        if (!Array.isArray(mon.set?.moves)) mon.set.moves = ["", "", "", ""];
        while (mon.set.moves.length < 4) mon.set.moves.push("");
        return mon;
      } catch {
        return saved;
      }
    }),
  );

  state[side] = mons.slice(0, 6);
  state.leads[side] = [];
  while (state[side].length < 6) state[side].push(null);
  mons.forEach(mon => {
    ensureBattleState(mon);
  });
  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  renderAll();
}

async function loadTestTeam(index, side = "self") {
  const team = TEST_TEAMS[index];
  if (!team) return;

  const mons = await Promise.all(
    team.mons.map(async (testMon) => {
      try {
        const mon = await fetchPokemon(testMon.name);
        mon.set = { ...mon.set, ...testMon.set };
        if (!Array.isArray(mon.set.moves)) mon.set.moves = ["", "", "", ""];
        while (mon.set.moves.length < 4) mon.set.moves.push("");
        ensureBattleState(mon);
        return mon;
      } catch {
        return null;
      }
    })
  );

  state[side] = mons.filter(Boolean).slice(0, 6);
  state.leads[side] = [];
  while (state[side].length < 6) state[side].push(null);
  
  if (side === "self") state.activeSelfSlots = [0, 1];
  if (side === "enemy") state.activeEnemySlots = [0, 1];
  
  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  renderAll();
}

function ensurePokedex() {
  if (!state.metaRanked.length) {
    state.pokedex = [];
    return;
  }

  state.pokedex = state.metaRanked.map((record) => ({
    name: record.slug,
    displayName: record.displayName,
    usage: record.usage,
    rank: record.rank,
  }));

  searchHint.textContent = `${state.pokedex.length} Pokémon meta cargados desde Smogon`;
}

function renderPokedex(query = "") {
  const q = normalizeText(query);
  const parts = q.split(/[-\s]+/).filter(Boolean);

  const list = state.pokedex
    .filter((mon) => {
      if (!q) return true;
      const monName = normalizeText(mon.name);
      const monDisplay = normalizeText(mon.displayName);
      return parts.every((p) => monName.includes(p) || monDisplay.includes(p));
    })
    .slice(0, q ? 80 : 15);

  if (!list.length) {
    resultList.innerHTML = `<div class="loader">No hay resultados.</div>`;
    return;
  }

  const quickPicksHtml = !q
    ? `<div style="grid-column: 1 / -1; margin-bottom: -4px;"><span class="tiny-chip" style="background: rgba(50, 173, 230, 0.12); border-color: rgba(50, 173, 230, 0.26);">Top Meta (Quick Picks)</span></div>`
    : "";

  resultList.innerHTML =
    quickPicksHtml +
    list
      .map(
        (mon) => `
        <div class="result">
          <div class="result-sprite">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/0.png" alt="${mon.displayName}" data-poke="${mon.name}" loading="lazy">
          </div>
          <div class="result-name">${mon.displayName}</div>
          <div class="result-meta">#${mon.rank} · ${mon.usage || 0}</div>
          <button class="pick-btn" data-action="pick-result" data-name="${mon.name}">Elegir</button>
        </div>
      `,
      )
      .join("");

  resultList.querySelectorAll("img[data-poke]").forEach(async (img) => {
    const name = img.dataset.poke;
    try {
      const mon = await fetchPokemon(name);
      img.src = mon.sprite || img.src;
    } catch {}
  });
}

function openModal(side, index) {
  state.modal = { side, index };
  modalTitle.textContent =
    side === "self"
      ? `Tu equipo · Slot ${index + 1}`
      : `Rival · Slot ${index + 1}`;
  pickerModal.classList.add("open");
  searchInput.value = "";
  renderPokedex("");
  setTimeout(() => searchInput.focus(), 20);
}

function closeModal() {
  pickerModal.classList.remove("open");
}

async function pickPokemonIntoSlot(side, index, name) {
  flowLog('pickPokemonIntoSlot: Inicio', { side, index, name });
  // Validaciones de Formato (Champions OU)
  if (side === "self") {
    const speciesId = normalizeText(name);
    if (state.self.some((m, i) => m && i !== index && m.name === speciesId)) {
      alert(`Species Clause: ${formatName(name)} ya está en tu equipo.`);
      return;
    }
    if (
      speciesId.includes("-mega") &&
      state.self.some((m, i) => m && i !== index && m.name.includes("-mega"))
    ) {
      alert("Mega Clause: Solo se permite una Mega Evolución por equipo.");
      return;
    }
  }
  try {
    const mon = await fetchPokemon(name);
    mon.set = buildDefaultSetForSpecies(mon.name, side, index);
    ensureBattleState(mon);
    state[side][index] = mon;
    
    // SOLUCIÓN: Si el usuario cambia un pokemon específico, quitamos ese índice de los leads guardados
    state.leads[side] = state.leads[side].filter((i) => i !== index);
    
    scheduleMoveWarmup();
    flowLog('pickPokemonIntoSlot: scheduleMoveWarmup finalizado, solicitando renderAll', { side, index });
    renderAll();
  } catch (err) {
    flowLog('pickPokemonIntoSlot: Error', err);
    alert(`No se pudo cargar ${name}`);
  }
}

function resetQuickCombosLock() {
  state.chosenFour = [];
  state.chosenEnemyFour = [];
  state.turn1Custom = false;
}

function clearAll() {
  state.self = Array(6).fill(null);
  state.enemy = Array(6).fill(null);
  
  // SOLUCIÓN: Vaciar los arrays de leads y reiniciar activos
  state.leads = { self: [], enemy: [] };
  state.activeSelfSlots = [0, 1];
  state.activeEnemySlots = [0, 1];
  
  resetQuickCombosLock();
  
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
  
  resetQuickCombosLock();
  
  recalculateActiveField();
  renderAll();
}

async function fillTeamWithSpecies(side, speciesList) {
  flowLog('fillTeamWithSpecies: Inicio', { side, speciesList });
  isBatchUpdating = true;
  try {
    const mons = [];
    for (let i = 0; i < Math.min(speciesList.length, 6); i++) {
      try {
        const mon = await fetchPokemon(speciesList[i]);
            mon.set = buildDefaultSetForSpecies(mon.name, side, i);
        ensureBattleState(mon);
        mons.push(mon);
      } catch {}
    }
    state[side] = mons;
    while (state[side].length < 6) state[side].push(null);
    
    // SOLUCIÓN: Limpiar los leads del turno 1 y resetear activos
    state.leads[side] = [];
    if (side === "self") state.activeSelfSlots = [0, 1];
    if (side === "enemy") state.activeEnemySlots = [0, 1];
    
    scheduleMoveWarmup();
    flowLog('fillTeamWithSpecies: Completado, scheduleMoveWarmup llamado', { side, monsCount: mons.length });
  } finally {
    isBatchUpdating = false;
    flowLog('fillTeamWithSpecies: finally -> solicitando renderAll', { side });
    renderAll();
  }
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

function calculateMvpScore(mon, selfTeam, enemyTeam) {
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

function getSelfCombos() {
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

function scoreEnemyThreatVsCombo(enemyMon, comboMons) {
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

function buildQuickCombos() {
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

function classifyTeamRoles(selfMons) {
  const roles = new Map();

  const baseScore = typeof scoreBoard === 'function' ? scoreBoard(state, 'self') : 0;

  for (const mon of selfMons) {
    if (!mon) continue;
    // "Quitar" mon del equipo y ver cuánto empeora el tablero
    const tmpState = structuredClone(state);
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

function evaluateCombo(indices) {
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

  selfLeads.forEach(sLead => {
    let sLeadSpeed = Number(calculateSpeed(sLead, 'self', simField));
    if (selfHasTailwind) sLeadSpeed *= 2;

    enemyLeads.forEach(eLead => {
      let eLeadSpeed = Number(calculateSpeed(eLead, 'enemy', simField));
      if (enemyHasTailwind) eLeadSpeed *= 2;

      // Buscar si el *otro* enemigo tiene redirección y lo va a usar
      const otherELead = enemyLeads.find(m => m !== eLead);
      let otherELeadRedirects = false;
      let otherELeadCand = null;
      if (otherELead) {
          const otherAtkOnAlly = bestAttack(otherELead, sLead, simField);
          otherELeadRedirects = ['followme', 'ragepowder'].includes(String(otherAtkOnAlly.move).toLowerCase().replace(/[^a-z]/g, ''));
      }

      // Daño/Amenaza de nuestros 4 vs sus 4 (Leads)
      let atkOnEnemy = bestAttack(sLead, eLead, simField);
      t1SimCache.attacks[`self_${sLead.name}_vs_enemy_${eLead.name}`] = atkOnEnemy;

      // Si el OTRO rival usa redirección, nuestros ataques single-target DEBEN ir al redirector, reduciendo el score si no lo matamos.
      if (otherELeadRedirects && !SPREAD_MOVES.has(String(atkOnEnemy.move).toLowerCase())) {
          const cand = getMoveCandidates(sLead).find(m => m.move === atkOnEnemy.move) || atkOnEnemy;
          const redirDmg = estimateMoveDamage(sLead, otherELead, cand, simField);
          // Reemplazamos el daño y reducimos el multiplicador al golpear al objetivo incorrecto
          atkOnEnemy = { ...atkOnEnemy, damage: redirDmg.damage, mult: 0.5, ohko: redirDmg.damage >= calcMonHP(otherELead) };
      }

      if (atkOnEnemy.mult >= 2) allyThreat += 15;
      else if (atkOnEnemy.mult >= 1) allyThreat += 5;
      if (atkOnEnemy.ohko) allyThreat += 10;

      const isAllyPriority = atkOnEnemy.move && (MOVE_PRIORITY_LEVELS[String(atkOnEnemy.move).toLowerCase()] || 0) > 0;
      const isAllySpread = atkOnEnemy.move && SPREAD_MOVES.has(String(atkOnEnemy.move).toLowerCase());

      if (isAllySpread && atkOnEnemy.ohko && !spreadWarning) {
         spreadWarning = `El KO de ${sLead.displayName || sLead.name} depende de daño en área (${atkOnEnemy.move}), que se reduce un 25% en Dobles.`;
      }
      
      if (atkOnEnemy.mult >= 2) {
         defaultStrategyParts.push(`Nuestro ${formatName(sLead.displayName || sLead.name)} frena a su ${formatName(eLead.displayName || eLead.name)} con daño x${atkOnEnemy.mult}.`);
      }

      // Daño/Amenaza de sus 4 vs nuestros 4 (Leads)
      const atkOnAlly = bestAttack(eLead, sLead, simField);

      if (atkOnAlly.mult >= 2) enemyThreat += 15;
      else if (atkOnAlly.mult >= 1) enemyThreat += 5;
      if (atkOnAlly.ohko) enemyThreat += 10;
      
      // 1. APLICAR FASE DE ENTRADA AL SIMFIELD ANTES DE NADA
      const simFieldLocal = { ...state.field };
      const applyHazards = (mon) => {
          if (!mon) return;
          const ab = (mon.set?.ability || mon.ability || mon.baseSpecies?.ability || '').toLowerCase().replace(/[^a-z]/g, '');
          if (ab === 'drought' || mon.name.toLowerCase().includes('charizardmegay')) simFieldLocal.weather = 'sun';
          if (ab === 'drizzle' || mon.name.toLowerCase().includes('pelipper')) simFieldLocal.weather = 'rain';
          if (ab === 'psychicsurge') simFieldLocal.terrain = 'psychic';
      };
      const sLead2 = (selfLeads || []).find(m => m !== sLead);
      const eLead2 = (enemyLeads || []).find(m => m !== eLead);
      applyHazards(sLead); applyHazards(sLead2);
      applyHazards(eLead); applyHazards(eLead2);

      // 2. CALCULAR VELOCIDAD USANDO EL SIMFIELD YA CON CLIMA
      let sLeadSpeedNum = Number(calculateSpeed(sLead, 'self', simFieldLocal)) || 0;
      let eLeadSpeedNum = Number(calculateSpeed(eLead, 'enemy', simFieldLocal)) || 0;
      if (selfHasTailwind) sLeadSpeedNum *= 2;
      if (enemyHasTailwind) eLeadSpeedNum *= 2;

      // 3. OBTENER PRIORIDAD ESTRICTA (Hardcodeada para evitar fallos de arrays externos)
      const getPrio = (moveObj) => {
          if (!moveObj || !moveObj.move) return 0;
          const m = moveObj.move.toLowerCase().replace(/[^a-z]/g, '');
          if (['fakeout', 'firstimpression'].includes(m)) return 3;
          if (['extremespeed'].includes(m)) return 2;
          if (['suckerpunch', 'aquajet', 'machpunch', 'bulletpunch', 'iceshard', 'shadowsneak', 'grassyglide'].includes(m)) return 1;
          if (['trickroom'].includes(m)) return -7;
          return 0;
      };

      const sPriority = getPrio(atkOnEnemy);
      const ePriority = getPrio(atkOnAlly);

      // 4. DECIDIR QUIÉN ATACA PRIMERO
      let enemyIsFaster = false;
      if (ePriority > sPriority) {
          enemyIsFaster = true;
      } else if (sPriority > ePriority) {
          enemyIsFaster = false;
      } else {
          enemyIsFaster = eLeadSpeedNum > sLeadSpeedNum;
      }

      // Logear la decisión del motor para debuguear desincronizaciones
      smartLog(
          `prio-${sLead.name}-${eLead.name}`,
          `⚖️ [PRIORITY CHECK] Aliado: ${sLead.name} (Vel:${sLeadSpeedNum}, Prio:${sPriority}) vs Rival: ${eLead.name} (Vel:${eLeadSpeedNum}, Prio:${ePriority}) => Ataca Primero: ${enemyIsFaster ? 'RIVAL' : 'ALIADO'}`
      );

      // INTELIGENCIA TÁCTICA: PROTECT Y FAKE OUT
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
    });
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

function evaluateAllCombos() {
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

function getTopThreatSummaries() {
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

function lockBestFour(preview) {
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

function applyQuickCombo(comboIndices) {
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

function renderQuickCombos() {
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

function renderQuickLayer() {
  if (state.uiMode !== 'quick') return;
  const rows = getRows();
  const preview = computeQuickPreview(rows);
  renderQuickPreview(preview);
  renderQuickCombos();
}

// --- PREVIEW UI ---
function computeQuickPreview(rows) {
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
function renderMvpBanner(mvp) {
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
function renderWeaknessSummary() {
  // Future
}

function renderPreviewSprite(mon) {
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

function getRoleLabel(mon) {
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

function getLeadSinergyText(leads) {
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

function getLeadPressureText(leads, enemyTeam) {
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
    return `Presiona a ${targets.join(', ')} y ${last}.`;
  }
  return `Presiona a ${targets[0]}.`;
}

function getLeadAvoidText(leads, enemyTeam) {
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

function getBenchEntryText(mon, enemyTeam) {
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

      const simIn = structuredClone(currentState);
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

function getBenchAvoidText(mon, enemyTeam) {
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

function getNoBringReason(mon, enemyTeam) {
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

function getPlanExplanation(title) {
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

function renderQuickPreview(preview) {
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

function renderSpeedTiers() {
  const speedTierList = document.getElementById("speedTierList");
  const allMons = [
    ...state.self.map((m) => (m ? { mon: m, side: "self" } : null)).filter(Boolean),
    ...state.enemy.map((m) => (m ? { mon: m, side: "enemy" } : null)).filter(Boolean),
  ];

  if (!allMons.length) {
    speedTierList.innerHTML = `<div class="empty">Añade Pokémon para ver el orden de velocidad.</div>`;
    return;
  }

  const PRIO_SET = new Set(['fakeout', 'sorpresa', 'firstimpression', 'extremespeed', 'velocidadextrema', 'suckerpunch', 'golpebajo', 'aquajet', 'acuajet', 'machpunch', 'ultrapuño', 'bulletpunch', 'puñobala', 'iceshard', 'cantohelado', 'shadowsneak', 'sombravil', 'grassyglide', 'fitimpulso']);

  const tiers = allMons.map((item) => {
    // 1. Calculamos la velocidad efectiva actual
    const spe = calculateSpeed(item.mon, item.side);
    
    // 2. Calculamos la velocidad NETA (Nivel 50 sin modificadores)
    const baseSpe = item.mon.baseStats?.speed || 100;
    const evsSpe = item.mon.set?.evs?.spe || 0;
    const nature = item.mon.set?.nature || "";
    let rawSpe = Math.floor(((2 * baseSpe + 31 + Math.floor(evsSpe / 4)) * 50) / 100) + 5;
    rawSpe = Math.floor(rawSpe * getNatureSpeModifier(nature));

    // 3. Evaluamos condiciones especiales
    const hasPriority = (item.mon.set?.moves || []).some(m => PRIO_SET.has(String(m).toLowerCase().replace(/[^a-z0-9]/g, '')));
    const ability = (item.mon.set?.ability || '').toLowerCase().replace(/[^a-z]/g, '');
    const obj = (item.mon.set?.item || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let modReason = null;
    let ringColor = null;

    if (Math.abs(spe) !== rawSpe) {
        if (['sandrush', 'impetuarena'].includes(ability)) { modReason = 'Ímpetu Arena'; ringColor = '#B6A136'; }
        else if (['chlorophyll', 'clorofila'].includes(ability)) { modReason = 'Clorofila'; ringColor = '#7AC74C'; }
        else if (['swiftswim', 'nadorapido'].includes(ability)) { modReason = 'Nado Rápido'; ringColor = '#6390F0'; }
        else if (['slushrush', 'quitanieves'].includes(ability)) { modReason = 'Quitanieves'; ringColor = '#96D9D6'; }
        else if (obj === 'choicescarf' || obj === 'pañueloeleccion') { modReason = 'Pañuelo'; ringColor = '#A98FF3'; }
        else if ((item.side === 'self' && state.field.tailwindSelf) || (item.side === 'enemy' && state.field.tailwindEnemy)) { modReason = 'Viento Afín'; ringColor = '#96D9D6'; }
    }

    // Prioridad sobrescribe el texto, pero mantiene el anillo del clima si existe
    if (hasPriority) {
        modReason = 'Prioridad';
        if (!ringColor) ringColor = 'var(--gold, #ffd700)';
    }

    return { ...item, spe, rawSpe, hasPriority, modReason, ringColor };
  }).sort((a, b) => b.spe - a.spe);

  // Agrupamos para calcular los empates (Ties)
  const blocks = [];
  for (let i = 0; i < tiers.length; ) {
    let j = i;
    while (j + 1 < tiers.length && tiers[j + 1].spe === tiers[i].spe && tiers[j + 1].hasPriority === tiers[i].hasPriority) j++;
    blocks.push(tiers.slice(i, j + 1));
    i = j + 1;
  }

  // Generamos el HTML del Timeline
  let html = `<div class="tactical-timeline-track">`;
  
  blocks.forEach((group) => {
    if (group.length > 1) {
      html += `
        <div class="timeline-tie-box">
          <div class="timeline-tie-label"><i data-lucide="zap"></i> Tie</div>
          ${group.map(item => {
            let ringStyle = item.ringColor ? `box-shadow: 0 0 0 3px #1a1a24, 0 0 0 5px ${item.ringColor};` : '';
            let labelHtml = item.modReason ? `<div class="timeline-mod-label ${item.hasPriority ? 'priority' : 'buff'}">${item.hasPriority ? '<i data-lucide="zap"></i>' : ''} ${item.modReason}</div>` : '';
            return `
              <div class="timeline-node" title="${item.mon.displayName}">
                ${labelHtml}
                <div class="timeline-avatar" style="${ringStyle}">
                  <img src="${item.mon.sprite}" alt="${item.mon.displayName}">
                  <div class="timeline-side-badge ${item.side}"></div>
                </div>
                <div class="timeline-stats">
                  <div class="stat-eff" style="${item.spe < 0 ? 'color: var(--purple);' : ''}">${Math.abs(item.spe)}</div>
                  <div class="stat-base">Base ${item.rawSpe}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      const item = group[0];
      let ringStyle = item.ringColor ? `box-shadow: 0 0 0 3px #1a1a24, 0 0 0 5px ${item.ringColor};` : '';
      let labelHtml = item.modReason ? `<div class="timeline-mod-label ${item.hasPriority ? 'priority' : 'buff'}">${item.hasPriority ? '<i data-lucide="zap"></i>' : ''} ${item.modReason}</div>` : '';
      html += `
        <div class="timeline-node" title="${item.mon.displayName}">
          ${labelHtml}
          <div class="timeline-avatar" style="${ringStyle}">
            <img src="${item.mon.sprite}" alt="${item.mon.displayName}">
            <div class="timeline-side-badge ${item.side}"></div>
          </div>
          <div class="timeline-stats">
            <div class="stat-eff" style="${item.spe < 0 ? 'color: var(--purple);' : ''}">${Math.abs(item.spe)}</div>
            <div class="stat-base">Base ${item.rawSpe}</div>
          </div>
        </div>
      `;
    }
  });

  html += `</div>`;
  speedTierList.innerHTML = html;

  document.getElementById("toggleTailwindSelfBtn").className =
    `btn small ${state.field.tailwindSelf ? "blue" : "ghost"}`;
  document.getElementById("toggleTailwindEnemyBtn").className =
    `btn small ${state.field.tailwindEnemy ? "red" : "ghost"}`;
  document.getElementById("toggleTrickRoomBtn").className =
    `btn small ${state.field.trickRoom ? "gold" : "ghost"}`;

  updateIcons();
}

function renderDefensiveAlerts() {
  const alertList = document.getElementById("defensiveAlertFloat");
  if (!alertList) return;
  const mons = state.self.filter(Boolean);
  if (mons.length < 3) {
    alertList.innerHTML = "";
    return;
  }

  const alerts = [];
  const types = Object.keys(TYPE_CHART);
  for (const t of types) {
    let weak = 0,
      resist = 0,
      immune = 0;
    for (const mon of mons) {
      let mult = effectiveness(t, mon.types);
      const ab = mon.set?.ability || "";

      if (
        t === "ground" &&
        (ab === "Levitate" || mon.set?.item === "Air Balloon")
      )
        mult = 0;
      if (
        t === "water" &&
        ["Water Absorb", "Storm Drain", "Dry Skin"].includes(ab)
      )
        mult = 0;
      if (t === "fire" && ["Flash Fire", "Well-Baked Body"].includes(ab))
        mult = 0;
      if (
        t === "electric" &&
        ["Volt Absorb", "Lightning Rod", "Motor Drive"].includes(ab)
      )
        mult = 0;
      if (t === "grass" && ["Sap Sipper"].includes(ab)) mult = 0;

      if (mult > 1) weak++;
      else if (mult === 0) immune++;
      else if (mult < 1) resist++;
    }

    const score = resist + immune - weak;
    if (score <= -2) {
      alerts.push({ type: t, name: TYPE_META[t].name, score });
    } else if (score >= 2) {
      alerts.push({ type: t, name: TYPE_META[t].name, score });
    }
  }

  if (!alerts.length) {
    alertList.innerHTML = "";
    return;
  }

  alertList.innerHTML = alerts
    .sort((a, b) => a.score - b.score)
    .map(
      (a) => {
        const isWeak = a.score < 0;
        const iconUrl = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/${a.type.toLowerCase()}.svg`;
        const typeColor = TYPE_META[a.type]?.color || '#fff';
        const iconContrast = getContrastColor(typeColor);
        const bgCol = isWeak ? 'rgba(255, 59, 48, 0.2)' : 'rgba(48, 209, 88, 0.2)';
        const borderCol = isWeak ? 'rgba(255, 59, 48, 0.4)' : 'rgba(48, 209, 88, 0.4)';
        const textCol = isWeak ? '#ffc8c4' : '#d4ffe3';
        const sign = a.score > 0 ? '+' : '';

        return `
        <div class="tiny-chip" style="background: ${bgCol}; border-color: ${borderCol}; color: ${textCol}; font-size: 0.75rem; padding: 4px 8px; gap: 8px;">
          <div class="type-icon-circle" style="position: static; background-color: ${typeColor}; width: 18px; height: 18px; box-shadow: none;">
            <div class="type-svg-mask" style="mask-image: url('${iconUrl}'); -webkit-mask-image: url('${iconUrl}'); background-color: ${iconContrast}; width: 10px; height: 10px;"></div>
          </div>
          <strong style="font-family: var(--poke-stat-font);">${sign}${a.score}</strong>
        </div>
      `;
    })
    .join("");
}

function isPhysicalAttacker(mon) {
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

function pruneInvalidTurn1Slots() {
  for (const side of ["self", "enemy"]) {
    state.leads[side] = state.leads[side].filter((i) => state[side][i]);
  }
}

function ensureTurn1LeadDefaults() {
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

function getTurn1ResolvedLeadIndices(side) {
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

function renderTurn1PickRows() {
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
        
        if (!mon) cls.push("t1-slot--empty");
        if (mon && on)
          cls.push(side === "self" ? "t1-slot--on-self" : "t1-slot--on-enemy");
        
        const isOptimal = side === "self" && mon && optimalNames.includes(mon.name);
        const badge = isOptimal ? `<div class="optimal-badge"><i data-lucide="star"></i> ÓPTIMO</div>` : '';
        
        const inner = mon
          ? `<img src="${mon.sprite}" alt="" loading="lazy">${badge}`
          : '<span class="t1-slot-ph">—</span>';
        const dis = mon ? "" : " disabled";
        return `<button type="button" class="${cls.join(" ")}" data-t1-slot data-side="${side}" data-idx="${i}" ${mon && side === "enemy" ? `data-scout="${mon.name}"` : ""}${dis}>${inner}</button>`;
      })
      .join("");
  };
  selfRow.innerHTML = build("self");
  enemyRow.innerHTML = build("enemy");
  
  // NUEVA LÓGICA: Añadir clase de bloqueo visual si hay 2 seleccionados
  selfRow.classList.toggle('t1-roster--locked', state.leads.self.length >= 2);
  enemyRow.classList.toggle('t1-roster--locked', state.leads.enemy.length >= 2);
}

function renderTurn1Simulator() {
  flowLog('renderTurn1Simulator: Inicio');
  const panel = document.getElementById("turn1SimulatorPanel");
  const list = document.getElementById("t1InsightsList");
  const emptyState = document.getElementById("t1EmptyState");
  const pickZone = document.getElementById("turn1PickZone");
  
  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);

  if (selfTeam.length < 2 || enemyTeam.length < 2) {
    flowLog('renderTurn1Simulator: Faltan mons, abortando y ocultando panel');
    panel.style.display = "none";
    return;
  }
  
  // En modo rápido, si no hay combinación de 4 elegida, mostramos estado vacío.
  if (state.uiMode === 'quick' && (!state.chosenFour || state.chosenFour.length < 4)) {
    panel.style.display = "block";
    emptyState.style.display = "block";
    pickZone.style.display = "none";
    list.innerHTML = "";
    flowLog('renderTurn1Simulator: Esperando bloqueo (lockBestFourBtn) en UI Rápida');
    return;
  }

  panel.style.display = "block";
  emptyState.style.display = "none";
  pickZone.style.display = "grid";

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
  
  initialLeads.forEach(l => applyHazards(l.mon));

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
    const activeWeather = weathers.length > 0 ? weathers[0] : null;
    const activeTerrain = terrains.length > 0 ? terrains[0] : null;
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
  document.querySelectorAll('.t1-slot-timeline-badge').forEach(e => e.remove());
  document.querySelectorAll('.t1-slot-stat-badge').forEach(e => e.remove());
  document.querySelectorAll('.t1-slot.t1-slot-ability-glow').forEach(e => e.classList.remove('t1-slot-ability-glow'));

  // Clonar leads para preservar estado
  let simLeads = leads.map(l => ({ ...l, mon: structuredClone(l.mon) }));

  // Limpiamos caché para que tome en cuenta los stages actualizados
  window.currentDamageCache = {};

  let selfLeads = simLeads.filter(x => x.side === "self");
  let enemyLeads = simLeads.filter(x => x.side === "enemy");

  let selfIntimidate = selfLeads.some(l => (l.mon.set?.ability || l.mon.ability || '').toLowerCase().includes('intimidate'));
  let enemyIntimidate = enemyLeads.some(l => (l.mon.set?.ability || l.mon.ability || '').toLowerCase().includes('intimidate'));

  // Helper robusto de prioridad
  const getPriority = (moveName) => {
      if (!moveName) return 0;
      // Normalizamos pero preservando espacios para MOVE_PRIORITY_LEVELS, o solo lowerCase
      return MOVE_PRIORITY_LEVELS[String(moveName).toLowerCase()] || 0;
  };

  let turnOrderLeads = simLeads.map(l => {
      let maxPrio = 0;
      const targets = l.side === 'self' ? enemyLeads : selfLeads;
      targets.forEach(t => {
          const atk = bestAttack(l.mon, t.mon, simFieldLocal);
          const currentPrio = getPriority(atk.move);
          if (currentPrio > maxPrio) maxPrio = currentPrio;
      });
      return { ...l, prio: maxPrio, spe: l.spe };
  }).sort((a, b) => {
      if (b.prio !== a.prio) return b.prio - a.prio;
      return b.spe - a.spe;
  });
  
  turnOrderLeads.forEach((l, idx) => l.turnRank = idx + 1);

  simLeads.forEach((l, index) => {
    const slotEl = document.querySelector(`.t1-slot[data-side="${l.side}"][data-idx="${l.realIdx}"]`);
    if (!slotEl) return;
    
    const hasPriority = l.mon.set?.moves?.some(m => (MOVE_PRIORITY_LEVELS[String(m).toLowerCase()] || 0) > 0);
    const prioIcon = hasPriority ? '<i data-lucide="zap" style="width: 10px; height: 10px; color: var(--gold); margin-right: 2px;"></i>' : '';
    const orderBadge = document.createElement('div');
    orderBadge.className = 't1-slot-timeline-badge';
    
    // Obtener rank actualizado
    const turnL = turnOrderLeads.find(t => t.realIdx === l.realIdx && t.side === l.side);
    orderBadge.innerHTML = `${prioIcon}${turnL ? turnL.turnRank : index + 1}<span>️⃣</span>`;
    slotEl.appendChild(orderBadge);
    
    const atkStage = l.mon.battle?.stages?.atk || 0;
    if (atkStage < 0) {
      const statBadge = document.createElement('div');
      statBadge.className = 't1-slot-stat-badge';
      statBadge.innerHTML = `${atkStage} Atk`;
      slotEl.appendChild(statBadge);
    } else if (atkStage > 0) {
      const statBadge = document.createElement('div');
      statBadge.className = 't1-slot-stat-badge';
      statBadge.innerHTML = `+${atkStage} Atk`;
      statBadge.style.background = 'var(--green)';
      statBadge.style.color = 'black';
      slotEl.appendChild(statBadge);
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
            const isPrio = l.maxPrio > 0;
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

            if (isPrio) {
                modReason = 'Prioridad';
                if (!ringColor) ringColor = 'var(--gold, #ffd700)';
            }

            const baseSpe = l.mon.baseStats?.speed || 100;
            const evsSpe = l.mon.set?.evs?.spe || 0;
            const nature = l.mon.set?.nature || "";
            let rawSpe = Math.floor(((2 * baseSpe + 31 + Math.floor(evsSpe / 4)) * 50) / 100) + 5;
            rawSpe = Math.floor(rawSpe * getNatureSpeModifier(nature));

            let ringStyle = ringColor ? `box-shadow: 0 0 0 3px #1a1a24, 0 0 0 5px ${ringColor};` : '';
            let labelHtml = modReason ? `<div class="timeline-mod-label ${isPrio ? 'priority' : 'buff'}">${isPrio ? '<i data-lucide="zap"></i>' : ''} ${modReason}</div>` : '';

            return `
              <div class="timeline-node" title="${l.mon.displayName}">
                ${labelHtml}
                <div class="timeline-avatar" style="${ringStyle}">
                  <img src="${l.mon.sprite}" alt="${l.mon.displayName}">
                  <div class="timeline-side-badge ${l.side}"></div>
                </div>
                <div class="timeline-stats">
                  <div class="stat-eff" style="${l.spe < 0 ? 'color: var(--purple);' : ''}">${Math.abs(l.spe)}</div>
                  <div class="stat-base">Base ${rawSpe}</div>
                </div>
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
                  if (last.spe === l.spe && last.maxPrio === l.maxPrio) {
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
  let enemyThreatsGrouped = {};

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
    const atkStage = mon.battle?.stages?.atk || 0;
    if (atkStage > 0) {
       activeModifiersHtml += `<span style="background: rgba(48, 209, 88, 0.15); border: 1px solid rgba(48, 209, 88, 0.4); color: #d4ffe3; padding: 2px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: 800; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;">Atk +1 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg></span>`;
    } else if (atkStage < 0) {
       activeModifiersHtml += `<span style="background: rgba(255, 59, 48, 0.15); border: 1px solid rgba(255, 59, 48, 0.4); color: #ffc8c4; padding: 2px 4px; border-radius: 4px; font-size: 0.65rem; font-weight: 800; display: inline-flex; align-items: center; gap: 2px; white-space: nowrap;">Atk -1 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>`;
    }

    if (activeModifiersHtml) {
        activeModifiersHtml = `<div class="combatant-modifiers" style="display: flex; flex-direction: row; gap: 4px; margin-top: 4px; flex-wrap: wrap;">${activeModifiersHtml}</div>`;
    }

    if (side === 'self') {
      const mySpeed = Math.abs((turnOrderLeads || []).find(l => l && l.mon && l.mon.name === mon?.name)?.spe || 0);
      const isFakeOutTarget = (fakeOutThreats || []).some(fo => Math.abs(fo.spe) > mySpeed);
      if (isFakeOutTarget && abilitySlug !== 'innerfocus') {
         badgeHtml += `<div class="badge-fakeout-alert pulse-anim"><i data-lucide="hand"></i></div>`;
      }
    }

    let emergencyBtnHtml = '';
    if (side === 'self' && allyOhkoThreats.has(mon.name)) {
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
      <div class="mobile-combatant-card card-${side === 'self' ? 'ally' : 'enemy'}">
        ${isDouble ? '<div class="double-target-warning" style="top: -6px; right: -6px; left: auto; transform: none; font-size: 9px; padding: 2px 6px;">⚠️ FOCO</div>' : ''}
        <div class="combatant-header" style="flex-direction: row; gap: 8px;">
          <div class="sprite-container" style="position: relative; display: inline-block;">
            <img src="${mon.sprite}" style="width: 40px; height: 40px; object-fit: cover; background: rgba(255,255,255,0.05); border-radius: 6px;">
            ${badgeHtml}
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: hidden;">
            <div class="combatant-name" style="font-size: 14px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${formatName(mon.displayName || mon.name)}</div>
            <div class="combatant-types" style="font-size: 10px;">${typesHtml}</div>
            ${activeModifiersHtml}
          </div>
        </div>
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
          <div class="hp-damage" style="width: 99%;"></div>
          <div class="hp-roll" style="width: 0%;"></div>
          <div class="hp-safe" style="width: 1%; background: #34c759;"></div>
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
    const rollW = Math.min(100, maxPct) - damageW;
    const safeW = Math.max(0, 100 - maxPct);
    return `
      <div class="predictive-hp-bar">
        <div class="hp-damage" style="width: ${damageW}%;"></div>
        <div class="hp-roll" style="width: ${rollW}%;"></div>
        <div class="hp-safe" style="width: ${safeW}%;"></div>
      </div>
    `;
  };

  let crossfireRowsHtml = '';
  let targetThreatsCount = {};
  let tacticalFeedHtml = '';

  const checkSurvival = (atk, defMon) => {
    const defItem = (defMon.set?.item || defMon.item || '').toLowerCase().replace(/[^a-z]/g, '');
    const defAbility = (defMon.set?.ability || defMon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
    const hasSash = defItem === 'focussash' || defItem === 'bandafocus';
    const hasSturdy = defAbility === 'sturdy' || defAbility === 'robustez';
    const isLethal = atk.ohko || atk.ohkoProb > 50;

    const isSavedBySash = hasSash && isLethal;
    const isSavedBySturdy = hasSturdy && isLethal;
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
    if (atkObj.mult >= 4) return `<span class="vector-badge badge-critical">💥 x4</span>`;
    if (atkObj.mult >= 2) return `<span class="vector-badge badge-warning">⚠️ x2</span>`;
    if (atkObj.blocked || atkObj.mult === 0) return `<span class="vector-badge badge-immune">🛡️ INM</span>`;
    return ''; // No mostrar pill si es daño neutro para limpiar ruido
  };

  const buildAllyVector = (sLead, eLead, atkMove, badgeHtml) => `
    <div class="crossfire-row vector-ally">
      <img src="${sLead.sprite}" class="sprite-micro" title="${sLead.displayName || sLead.name}">
      <div class="vector-line vector-line-right">
        <span>${formatName(getTranslation(atkMove.move, "move") || atkMove.move)}</span>
        <i data-lucide="arrow-right" style="width:14px; height:14px;"></i>
      </div>
      <img src="${eLead.sprite}" class="sprite-micro" title="${eLead.displayName || eLead.name}">
      ${badgeHtml}
    </div>
  `;

  const buildEnemyVector = (sLead, eLead, atkMove, badgeHtml) => `
    <div class="crossfire-row vector-enemy">
      <img src="${sLead.sprite}" class="sprite-micro" title="${sLead.displayName || sLead.name}">
      <div class="vector-line vector-line-left">
        <i data-lucide="arrow-left" style="width:14px; height:14px;"></i>
        <span>${formatName(getTranslation(atkMove.move, "move") || atkMove.move)}</span>
      </div>
      <img src="${eLead.sprite}" class="sprite-micro" title="${eLead.displayName || eLead.name}">
      ${badgeHtml}
    </div>
  `;

  const buildDoubleEnemyVector = (sLead, eLead1, eLead2) => `
    <div class="crossfire-row vector-enemy">
      <img src="${sLead.sprite}" class="sprite-micro" title="${sLead.displayName || sLead.name}">
      <div class="vector-line vector-line-left" style="color: var(--red); font-weight: bold;">
        <i data-lucide="arrow-left" style="width:14px; height:14px;"></i>
        <span>⚠️ Foco de Presión</span>
      </div>
      <div style="display:flex; gap:2px;">
        <img src="${eLead1.sprite}" class="sprite-micro" title="${eLead1.displayName || eLead1.name}">
        <img src="${eLead2.sprite}" class="sprite-micro" title="${eLead2.displayName || eLead2.name}">
      </div>
      <span class="vector-badge badge-lethal">💀 CRÍTICO</span>
    </div>
  `;

  for (const sObj of selfLeads) {
    for (const eObj of enemyLeads) {
      const s = sObj.mon;
      const e = eObj.mon;
      const speS = Math.abs(sObj.spe);
      const speE = Math.abs(eObj.spe);

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

      const sPriority = getPriority(atkS.move);
      const ePriority = getPriority(atkE.move);

      let sFaster = false;
      if (sPriority > ePriority) sFaster = true; 
      else if (ePriority > sPriority) sFaster = false; 
      else sFaster = speS >= speE; 

      const survE = checkSurvival(atkS, e);
      const survS = checkSurvival(atkE, s);

      const isOhkoS = survE.isLethal && !survE.survivesAt1HP;
      const isThreatS = atkS.mult >= 2 || survE.isLethal;
      
      const isOhkoE = survS.isLethal && !survS.survivesAt1HP;
      const isThreatE = atkE.mult >= 2 || survS.isLethal;

      // ZONA 3: Radar de Fuego Cruzado (Mobile-First) con Health Bars
      if (isThreatS) {
        const moveName = formatName(getTranslation(atkS.move, "move") || atkS.move);
        targetThreatsCount[e.name] = (targetThreatsCount[e.name] || 0) + 1;
        
        const badgeHtml = getCrossfireBadge(atkS, survE.survivesAt1HP);
        crossfireRowsHtml += buildAllyVector(s, e, atkS, badgeHtml);
        
        // ZONA 4: Feed Táctico (Opportunity)
        if (sFaster) {
          const hpBarHtml = getPredictiveHpBar(atkS.minPct, atkS.maxPct, atkS.ohkoProb, survE.survivesAt1HP);
          const headerText = survE.survivesAt1HP 
             ? `${formatName(s.displayName || s.name)} ataca, pero ${formatName(e.displayName || e.name)} resiste con 1 HP`
             : `${formatName(s.displayName || s.name)} elimina a ${formatName(e.displayName || e.name)}`;
             
          tacticalFeedHtml += `
            <article class="tactical-feed-card type-opportunity">
              <div class="tf-header">
                 <i data-lucide="crosshair"></i>
                 <span>${headerText}</span>
              </div>
              <div class="math-terminal" style="padding-bottom: 12px;">
                <div>> Ataque: <span class="term-accent" style="cursor:pointer; text-decoration:underline dashed;" onclick="showInfoTooltip(event, 'move', '${(atkS.move || '').toLowerCase().replace(/[^a-z0-9]/g, '')}')">${moveName}</span></div>
                <div>> Modificadores: ${atkS.tags && atkS.tags.length > 0 ? atkS.tags.join(' · ') : 'Ninguno'}</div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                   <div style="flex: 1;">${hpBarHtml}</div>
                   <span style="font-size: 0.65rem; opacity: 0.8;">${isOhkoS ? 'OHKO' : (survE.survivesAt1HP ? '1 HP' : `${atkS.minPct}-${atkS.maxPct}%`)}</span>
                </div>
              </div>
            </article>
          `;
        }
      }
      
      if (isThreatE) {
        const moveName = formatName(getTranslation(atkE.move, "move") || atkE.move);
        targetThreatsCount[s.name] = (targetThreatsCount[s.name] || 0) + 1;
        
        if (!enemyThreatsGrouped[s.name]) enemyThreatsGrouped[s.name] = [];
        enemyThreatsGrouped[s.name].push({ enemy: e, atk: atkE, isOhko: isOhkoE, moveName, survS });
        
        // ZONA 4: Feed Táctico (Critical)
        if (!sFaster) {
           const hpBarHtml = getPredictiveHpBar(atkE.minPct, atkE.maxPct, atkE.ohkoProb, survS.survivesAt1HP);
           const headerText = survS.survivesAt1HP 
               ? `${formatName(e.displayName || e.name)} ataca, pero ${formatName(s.displayName || s.name)} resiste con 1 HP`
               : `${formatName(e.displayName || e.name)} elimina a ${formatName(s.displayName || s.name)}`;
               
           tacticalFeedHtml += `
            <article class="tactical-feed-card type-critical">
              <div class="tf-header">
                 <i data-lucide="alert-triangle"></i>
                 <span>${headerText}</span>
              </div>
              <div class="math-terminal" style="padding-bottom: 12px;">
                <div>> Ataque: <span class="term-accent" style="cursor:pointer; text-decoration:underline dashed;" onclick="showInfoTooltip(event, 'move', '${(atkE.move || '').toLowerCase().replace(/[^a-z0-9]/g, '')}')">${moveName}</span></div>
                <div>> Modificadores: ${atkE.tags && atkE.tags.length > 0 ? atkE.tags.join(' · ') : 'Ninguno'}</div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                   <div style="flex: 1;">${hpBarHtml}</div>
                   <span style="font-size: 0.65rem; opacity: 0.8;">${isOhkoE ? 'OHKO' : (survS.survivesAt1HP ? '1 HP' : `${atkE.minPct}-${atkE.maxPct}%`)}</span>
                </div>
              </div>
            </article>
          `;
        }
      }
    }
  }

  // Procesar Agrupación Direccional
  Object.keys(enemyThreatsGrouped).forEach(allyName => {
      const threats = enemyThreatsGrouped[allyName];
      const allyObj = (selfLeads || []).find(l => l?.mon?.name === allyName);
      const ally = allyObj ? allyObj.mon : null;
      if (!ally) return;
      if (threats.length >= 2) {
          const survObj = threats[0].survS || threats[1].survS;
          crossfireRowsHtml += buildDoubleEnemyVector(ally, threats[0].enemy, threats[1].enemy, survObj);
      } else if (threats.length === 1) {
          const t = threats[0];
          const badgeHtml = getCrossfireBadge(t.atk, t.survS?.survivesAt1HP);
          crossfireRowsHtml += buildEnemyVector(ally, t.enemy, t.atk, badgeHtml);
      }
  });

  // ZONA 2 & 3: Roster Grid + Radar (Mobile-First)
  let rosterGridHtml = `
    <div class="mobile-roster-grid">
      ${selfLeads.map(l => {
         const isDouble = targetThreatsCount[l.mon.name] >= 2;
         return renderMobileCombatantCard(l.mon, 'self', isDouble);
      }).join('')}
      ${enemyLeads.map(l => {
         const isDouble = targetThreatsCount[l.mon.name] >= 2;
         return renderMobileCombatantCard(l.mon, 'enemy', isDouble);
      }).join('')}
    </div>
  `;

  let crossfireSectionHtml = crossfireRowsHtml ? `
    <div style="margin-top: 24px; margin-bottom: 24px;">
      <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
        <i data-lucide="radar" style="width: 16px; height: 16px; color: var(--red, #e74c3c);"></i> Vectores de Amenaza
      </div>
      <div class="crossfire-list">
        ${crossfireRowsHtml}
      </div>
    </div>
  ` : '';

  // --- INYECCIÓN DE CONDITION CARDS (TRICK ROOM Y FAKE OUT) ---
  const buildCondition = (type, icon, eyebrow, title, text) => `
      <article class="condition-card condition-card--${type}">
        <div class="condition-card__icon"><i data-lucide="${icon}"></i></div>
        <div class="condition-card__content">
          <div class="condition-card__eyebrow">${eyebrow}</div>
          <h4 class="condition-card__title">${title}</h4>
          <p class="condition-card__text">${text}</p>
        </div>
      </article>
  `;

  let conditionCards = [];
  const safeNormArray = (arr) => (arr || []).map(m => String(m).toLowerCase().replace(/[^a-z]/g, ''));

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
  
  tacticalFeedHtml += conditionCards.join('');

  // Render Final
  list.innerHTML = `
    <div class="tactical-zones-container">
      ${timelineHtml}
      ${rosterGridHtml}
      ${crossfireSectionHtml}
      <div class="tactical-feed" style="margin-top: 16px;">
        ${tacticalFeedHtml}
      </div>
    </div>
  `;

  if (typeof lucide !== "undefined" && lucide.createIcons) {

    lucide.createIcons({ root: document.getElementById("turn1SimulatorPanel") });
  }
  flowLog('renderTurn1Simulator: Fin - PROYECCIÓN DE CHOQUE LISTA');
}

function updateIcons() {
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
}

// --- MAIN RENDER ---
let isBatchUpdating = false;
let renderTimer = null;
let lastSelfLength = -1;
let lastEnemyLength = -1;


// =========================================================================
// 6. GLOBAL ORCHESTRATOR & INIT
// =========================================================================

function renderAll(force = false) {
  flowLog('renderAll: Solicitud de renderizado recibida', { force, isBatchUpdating, renderTimerActive: !!renderTimer });
  if (isBatchUpdating) return;
  if (renderTimer) cancelAnimationFrame(renderTimer);

  renderTimer = requestAnimationFrame(() => {
    flowLog('renderAll: requestAnimationFrame ejecutando _doRender');
    _doRender(force);
  });
}

function _doRender(force = false) {
  flowLog('_doRender: Inicio', { force, uiMode: state.uiMode });
  renderUiMode();
  renderDock("self");
  renderDock("enemy");

  const isQuick = state.uiMode === 'quick';
  const isExpert = state.uiMode === 'expert';
  const isLive = state.uiMode === 'live';

  const currentSelfLength = state.self.filter(Boolean).length;
  const currentEnemyLength = state.enemy.filter(Boolean).length;
  const lengthsChanged = currentSelfLength !== lastSelfLength || currentEnemyLength !== lastEnemyLength;

  if (isQuick || force) {
    if (lengthsChanged || force || state.needsReevaluation) {
      flowLog('_doRender: Cambios estructurales detectados, disparando evaluateAllCombos', { lastSelfLength, currentSelfLength });
      evaluateAllCombos();
      lastSelfLength = currentSelfLength;
      lastEnemyLength = currentEnemyLength;
      state.needsReevaluation = false;
    }
    renderTurn1Simulator();
    renderQuickLayer();
  }
  if (isExpert || force) {
    const rows = getRows();
    renderMatrix(rows);
    renderThreats();
    renderOpportunities(rows);
    renderStrategies();
    if (typeof renderWeaknessSummary === 'function') renderWeaknessSummary();
    renderSpeedTiers();
    renderDefensiveAlerts();
  }
  
  if (isLive || force) {
    const rows = getRows();
    renderMatrix(rows);
    if (typeof renderLiveStatePanel === 'function') renderLiveStatePanel();
    if (typeof renderLiveRecommendations === 'function') renderLiveRecommendations();
  }

  renderActiveMatchupStrip();
  renderLiveBattleToolbar();
  flowLog('_doRender: Fin');

  const strip = document.getElementById("activeMatchupStrip");
  const toolbar = document.getElementById("liveBattleToolbar");
  if (isBattleFocusActive()) {
    if (strip) strip.style.display = "flex";
    if (toolbar) toolbar.style.display = "flex";
  } else {
    if (strip) strip.style.display = "none";
    if (toolbar) toolbar.style.display = "none";
  }

  updateIcons();
}

document
  .getElementById("toggleTailwindSelfBtn")
  .addEventListener("click", () => {
    state.field.tailwindSelf = !state.field.tailwindSelf;
    renderSpeedTiers();
  });

document
  .getElementById("toggleTailwindEnemyBtn")
  .addEventListener("click", () => {
    state.field.tailwindEnemy = !state.field.tailwindEnemy;
    renderSpeedTiers();
  });

document.getElementById("toggleTrickRoomBtn").addEventListener("click", () => {
  state.field.trickRoom = !state.field.trickRoom;
  renderSpeedTiers();
});

function triggerMatrixFlash() {
  const tbl = document.querySelector('.matrix-grid table');
  if (tbl) {
    tbl.classList.remove('matrix-flash');
    void tbl.offsetWidth; // Force reflow
    tbl.classList.add('matrix-flash');
  }
}

const matrixModeToggleGroup = document.getElementById("matrixModeToggleGroup");
if (matrixModeToggleGroup) {
  matrixModeToggleGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (btn && btn.dataset.mode) {
      state.matrixMode = btn.dataset.mode;
      triggerMatrixFlash();
      renderAll();
    }
  });
}

const matrixDetailToggleGroup = document.getElementById("matrixDetailToggleGroup");
if (matrixDetailToggleGroup) {
  matrixDetailToggleGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (btn && btn.dataset.detail) {
      setMatrixDetailMode(btn.dataset.detail);
    }
  });
}

const matrixHelpToggleBtn = document.getElementById("matrixHelpToggleBtn");
if (matrixHelpToggleBtn) {
  matrixHelpToggleBtn.addEventListener("click", () => {
    toggleMatrixHelp();
  });
}

const matrixFieldControls = document.getElementById("matrixFieldControls");
if (matrixFieldControls) {
  matrixFieldControls.addEventListener("click", (e) => {
    const w = e.target.closest("[data-weather]");
    if (w && w.dataset.weather) {
      const v = w.dataset.weather;
      state.field.weather = state.field.weather === v ? null : v;
      triggerMatrixFlash();
      renderAll();
      return;
    }
    const t = e.target.closest("[data-terrain]");
    if (t && t.dataset.terrain) {
      const v = t.dataset.terrain;
      state.field.terrain = state.field.terrain === v ? null : v;
      triggerMatrixFlash();
      renderAll();
      return;
    }
  });
}

document.getElementById("turn1PickZone").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-t1-slot]");
  if (!btn || btn.disabled) return;
  const side = btn.dataset.side;
  const idx = Number(btn.dataset.idx);
  if (!state[side][idx]) return;
  
  if (side === "self") state.turn1Custom = true;
  
  const arr = state.leads[side];
  const pos = arr.indexOf(idx);
  if (pos >= 0) arr.splice(pos, 1);
  else if (arr.length < 2) arr.push(idx);
  else {
    arr.shift();
    arr.push(idx);
  }
  recalculateActiveField();
  renderAll();
});

selfSlots.addEventListener("click", async (e) => {
  const remove = e.target.closest('[data-action="remove"]');
  if (remove) {
    const idx = Number(remove.dataset.index);
    state.self[idx] = null;
    resetQuickCombosLock();
    renderAll();
    return;
  }

  const pick = e.target.closest('[data-action="pick"]');
  if (!pick) return;

  const idx = Number(pick.dataset.index);
  if (state.self[idx]) {
    openSetEditor(idx);
  } else {
    openModal("self", idx);
  }
});

enemySlots.addEventListener("click", async (e) => {
  const remove = e.target.closest('[data-action="remove"]');
  if (remove) {
    const idx = Number(remove.dataset.index);
    state.enemy[idx] = null;
    resetQuickCombosLock();
    renderAll();
    return;
  }
  const pick = e.target.closest('[data-action="pick"]');
  if (pick) openModal("enemy", Number(pick.dataset.index));
});

resultList.addEventListener("click", async (e) => {
  const btn = e.target.closest('[data-action="pick-result"]');
  if (!btn) return;

  const side = state.modal.side;
  const currentIndex = state.modal.index;

  await pickPokemonIntoSlot(side, currentIndex, btn.dataset.name);

  const nextIndex = state[side].findIndex((mon) => !mon);
  if (nextIndex !== -1) {
    state.modal.index = nextIndex;
    modalTitle.textContent =
      side === "self"
        ? `Tu equipo · Slot ${nextIndex + 1}`
        : `Rival · Slot ${nextIndex + 1}`;
    searchInput.value = "";
    renderPokedex("");
    setTimeout(() => searchInput.focus(), 20);
  } else {
    closeModal();
  }
});

searchInput.addEventListener("input", (e) => {
  renderPokedex(e.target.value);
});

document.getElementById("closeModalBtn").addEventListener("click", closeModal);
pickerModal.addEventListener("click", (e) => {
  if (e.target === pickerModal) closeModal();
});

document.getElementById("loadDemoBtn").addEventListener("click", async () => {
  await fillTeamWithSpecies("self", DEMO_SELF);
  await fillTeamWithSpecies("enemy", DEMO_ENEMY);
});

document.getElementById("swapBtn").addEventListener("click", swapTeams);
document.getElementById("clearBtn").addEventListener("click", clearAll);
document
  .querySelector('.team-config-btn[data-team="self"]')
  .addEventListener("click", () => renderTeamConfigDrawer("self"));
document
  .querySelector('.team-config-btn[data-team="enemy"]')
  .addEventListener("click", () => renderTeamConfigDrawer("enemy"));

ratingSelect.value = state.rating;
ratingSelect.addEventListener("change", async (e) => {
  state.rating = e.target.value;
  localStorage.setItem(RATING_STORAGE_KEY, String(state.rating));
  alert('La carga por rating ha sido simplificada. La app usa el data-bundle.json cargado.');
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

state.setEditor = { index: null };
state.setChoice = { kind: "", moveIndex: null, options: [], query: "" };

const setEditorModal = document.getElementById("setEditorModal");
const setEditorBody = document.getElementById("setEditorBody");
const setEditorTitle = document.getElementById("setEditorTitle");
const setEditorSubtitle = document.getElementById("setEditorSubtitle");

const setChoiceModal = document.getElementById("setChoiceModal");
const setChoiceTitle = document.getElementById("setChoiceTitle");
const setChoiceSubtitle = document.getElementById("setChoiceSubtitle");
const setChoiceSearch = document.getElementById("setChoiceSearch");
const setChoiceList = document.getElementById("setChoiceList");


// =========================================================================
// 5. SET EDITOR & MODALS
// =========================================================================

function ensureEditableSet(mon) {
  if (!mon.set || typeof mon.set !== "object") mon.set = {};
  if (!Array.isArray(mon.set.moves)) mon.set.moves = [];
  while (mon.set.moves.length < 4) mon.set.moves.push("");
  if (!mon.set.raw || typeof mon.set.raw !== "object") mon.set.raw = {};
  return mon.set;
}

function uniqValues(arr = []) {
  return [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))];
}

function getEditorMon() {
  const idx = state.setEditor.index;
  if (idx == null) return null;
  return state.self[idx] || null;
}

function getQuickOptions(mon, kind) {
  const set = ensureEditableSet(mon);
  const raw = set.raw || {};
  const entry =
    (typeof getMetaRecord === "function"
      ? getMetaRecord(mon.name)?.entry
      : null) || {};

  if (kind === "ability") {
    return uniqValues([
      ...(raw.abilities || []).map((x) => x.key),
      ...Object.keys(entry.Abilities || {}),
      set.ability || "",
    ]).slice(0, 10);
  }

  if (kind === "item") {
    return uniqValues([
      ...(raw.items || []).map((x) => x.key),
      ...Object.keys(entry.Items || {}),
      set.item || "",
    ]).slice(0, 12);
  }

  if (kind === "move") {
    return uniqValues([
      ...(raw.moves || []).map((x) => x.key),
      ...Object.keys(entry.Moves || {}),
      ...(set.moves || []),
    ]).slice(0, 18);
  }

  if (kind === "nature") {
    const editorNatureChoices = [
      "Jolly", "Adamant", "Timid", "Modest", "Bold", "Impish", "Careful", "Calm", 
      "Brave", "Relaxed", "Quiet", "Sassy", "Naive", "Hasty", "Lonely", "Naughty", 
      "Rash", "Mild", "Gentle", "Lax", "Hardy", "Docile", "Serious", "Bashful", "Quirky"
    ];
    return uniqValues([
      raw.nature || "",
      entry.nature || "",
      set.nature || "",
      ...editorNatureChoices
    ]);
  }

  return [];
}

function getTopSpreads(mon) {
  if (!mon) return [];
  const record = getMetaRecord(mon.name);
  const entry = record?.entry || {};
  const rawSpreads = entry.Spreads || entry["Spreads"] || {};
  const rawCount = entry["Raw count"] || 1;
  
  const top = topEntries(rawSpreads, 3);
  return top.map(sp => {
    const spread = parseSpread(sp.key);
    const pctVal = sp.value > 1 ? (sp.value / rawCount) : sp.value;
    const pct = (pctVal * 100).toFixed(0);
    
    const evStr = Object.entries(spread.evs).filter(([k,v]) => v > 0).map(([k,v]) => `${v} ${k.toUpperCase()}`).join(' / ') || "Sin EVs";
    const label = `${spread.nature || 'Neutral'} | ${evStr} (${pct}%)`;
    
    return { nature: spread.nature || '', evs: spread.evs, label };
  });
}

function guessSpreadRole(evs) {
  const hp = Number(evs.hp) || 0;
  const atk = Number(evs.atk) || 0;
  const def = Number(evs.def) || 0;
  const spa = Number(evs.spa) || 0;
  const spd = Number(evs.spd) || 0;
  const spe = Number(evs.spe) || 0;

  if (spe >= 200 && (atk >= 200 || spa >= 200)) return "Ofensivo Rápido";
  if (hp >= 200 && (def >= 150 || spd >= 150)) return "Bulky Pivot / Muro";
  if (hp >= 200 && (atk >= 150 || spa >= 150)) return "Bulky Ofensivo";
  if (def >= 200 || spd >= 200) return "Defensivo";
  return "Mixto / Específico";
}

function getMegaForm(baseSpecies, itemSlug) {
  if (!itemSlug || !itemSlug.includes('ite')) return null;
  
  const cleanBase = normalizeText(baseSpecies);
  let possibleMegaId = cleanBase + 'mega';
  
  // Casos especiales (Charizard X/Y, Mewtwo X/Y)
  if (itemSlug.endsWith('itex')) possibleMegaId = cleanBase + 'megax';
  if (itemSlug.endsWith('itey')) possibleMegaId = cleanBase + 'megay';
  
  const megaData = window.GameDB?.pokedex?.[possibleMegaId];
  // Solo devolver si el objeto coincide con el nombre del Pokémon (evita que Pikachu con Venusaurita brille)
  if (megaData && itemSlug.startsWith(cleanBase)) {
    return megaData;
  }
  return null;
}

function renderSetEditor() {
  const mon = getEditorMon();
  if (!mon) {
    setEditorBody.innerHTML = `<div class="empty">No hay Pokémon seleccionado.</div>`;
    return;
  }

  const set = ensureEditableSet(mon);
  const abilityOptions = getQuickOptions(mon, "ability");
  const itemOptions = getQuickOptions(mon, "item");
  const moveOptions = getQuickOptions(mon, "move");
  const spreadOptions = getTopSpreads(mon);

  const abiSlug = normalizeText(set.ability);
  const itemSlug = normalizeText(set.item);
  const abilityDesc = window.GameDB?.abilities?.[abiSlug]?.desc || "Sin descripción disponible.";
  const itemDesc = window.GameDB?.items?.[itemSlug]?.desc || "Sin descripción disponible.";
  const typesHtml = (mon.types || []).map(t => 
    `<span class="type-pill" style="background-color: var(--${t.toLowerCase()});">${t}</span>`
  ).join('');

  const megaForm = getMegaForm(mon.name, itemSlug);
  const megaHtml = megaForm 
    ? `<div class="mega-badge">✨ Permite Megaevolucionar a ${megaForm.displayName}</div>` 
    : '';
  const megaClass = megaForm ? 'mega-active' : '';

  setEditorTitle.textContent = `Editar set · ${mon.displayName}`;
  setEditorSubtitle.textContent =
    "Despliega para cambiar o usa las sugerencias rápidas.";

  const typeChips = (mon.types || []).map(typeChip).join("");
  const summaryLines = serializeSetSummary(set);

  const editorNatureChoices = [
    "Jolly",
    "Adamant",
    "Timid",
    "Modest",
    "Bold",
    "Impish",
    "Careful",
    "Calm",
    "Brave",
    "Relaxed",
    "Quiet",
    "Sassy",
    "Naive",
    "Hasty",
    "Lonely",
    "Naughty",
    "Rash",
    "Mild",
    "Gentle",
    "Lax",
    "Hardy",
    "Docile",
    "Serious",
    "Bashful",
    "Quirky",
  ];
  const curNature = set.nature || "";
  const natureList =
    curNature && !editorNatureChoices.includes(curNature)
      ? [curNature, ...editorNatureChoices]
      : editorNatureChoices;

  const evs =
    set.evs && typeof set.evs === "object"
      ? set.evs
      : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const evStatMeta = [
    { key: "hp", label: "HP" },
    { key: "atk", label: "Atk" },
    { key: "def", label: "Def" },
    { key: "spa", label: "SpA" },
    { key: "spd", label: "SpD" },
    { key: "spe", label: "Spe" },
  ];
  const evInputStyle =
    "box-sizing:border-box;margin-top:4px;background:#15233a;border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:8px;padding:6px;width:100%;font:inherit;";

  setEditorBody.innerHTML = `
        <section class="editor-hero">
          <div class="sprite-box">
            ${mon.name.includes("-mega") ? '<div class="mega-icon" style="width:18px;height:18px;top:4px;left:4px;"></div>' : ""}
            <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
          </div>

          <div style="min-width:0">
            <div class="editor-name">${mon.displayName}</div>
            <div class="editor-sub">${summaryLines.join(" · ") || "Set personalizable desde aquí"}</div>
            <div style="margin-top: 4px; margin-bottom: 12px;">${typesHtml}</div>
          </div>
        </section>

        <section class="editor-grid-2">
          <article class="editor-section">
            <button type="button" class="trait-card" data-action="edit-ability" style="text-align: left;">
              <div class="trait-label">Habilidad</div>
              <div class="trait-header">
                <i data-lucide="star" style="width:14px;height:14px;color:var(--gold);"></i> 
                ${getTranslation(set.ability, 'ability') || 'Toca para asignar'}
              </div>
              <div class="flavor-text">${abilityDesc}</div>
            </button>

            <div class="editor-pill-list" style="flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; margin-top: 8px;">
              ${abilityOptions
                .slice(0, 4)
                .map(
                  (value) => `
                <button class="editor-pill ${value === set.ability ? "active" : ""}" style="white-space: nowrap; flex-shrink: 0;" data-action="quick-ability" data-value="${value}">
                  ${getTranslation(value, "ability")}
                </button>
              `,
                )
                .join("")}
            </div>
          </article>

          <article class="editor-section">
            <button type="button" class="trait-card ${megaClass}" data-action="edit-item" ${mon.name.includes("-mega") ? "disabled" : ""} style="text-align: left;">
              <div class="trait-label">Objeto Equipado</div>
              <div class="trait-header">
                <i data-lucide="package" style="width:14px;height:14px;color:var(--blue);"></i> 
                ${getTranslation(set.item, 'item') || 'Toca para asignar'}
              </div>
              <div class="flavor-text">${itemDesc}</div>
              ${megaHtml}
            </button>

            <div class="editor-pill-list" style="flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; margin-top: 8px;">
              ${itemOptions
                .slice(0, 4)
                .map(
                  (value) => `
                <button class="editor-pill ${value === set.item ? "active" : ""}" style="white-space: nowrap; flex-shrink: 0;" data-action="quick-item" data-value="${value}" ${mon.name.includes("-mega") ? "disabled" : ""}>
                  ${getTranslation(value, "item")}
                </button>
              `,
                )
                .join("")}
            </div>
          </article>
        </section>

        <article class="editor-section">
          <div class="editor-section-head">
            <div>
              <strong>Naturaleza y EVs</strong>
            </div>
          </div>

          <button type="button" class="edit-trigger-btn" data-action="edit-nature">
            <span class="${set.nature ? 'val' : 'placeholder'}">${set.nature || 'Toca para asignar Naturaleza'}</span>
            <i data-lucide="chevron-right" style="width:16px;color:var(--muted);"></i>
          </button>

          <div class="editor-pill-list" style="margin-top: 8px; margin-bottom: 12px; flex-wrap: wrap;">
            ${spreadOptions.map(sp => `
              <button type="button" class="editor-pill" data-action="quick-spread" data-nature="${sp.nature}" data-evs='${JSON.stringify(sp.evs)}'>
                ${sp.label}
              </button>
            `).join('')}
          </div>

          <div class="ev-compact-grid" style="margin-top: 8px;">
            ${evStatMeta
              .map(
                ({ key, label }) => `
              <div class="ev-input-wrapper">
                <span>${label}</span>
                <input type="number" min="0" max="252" step="1" data-action="inline-ev" data-stat="${key}" value="${Number(evs[key]) || 0}">
              </div>
            `,
              )
              .join("")}
          </div>
        </article>

        <article class="editor-section">
          <div class="editor-section-head">
            <div>
              <strong>Movimientos</strong>
            </div>
          </div>

          <div class="moves-2x2-grid">
            ${(set.moves || [])
              .slice(0, 4)
              .map(
                (move, idx) => {
                  const slug = normalizeText(move);
                  const moveData = window.GameDB?.moves?.[slug];
                  const powerStr = moveData?.power ? `${moveData.power} BP` : '-- BP';
                  const typeColor = moveData ? `var(--${moveData.type})` : 'var(--muted)';
                  
                  let catIcon = '';
                  if (moveData?.damageClass === 'physical') catIcon = '<i data-lucide="swords" style="width:12px;height:12px;"></i>';
                  else if (moveData?.damageClass === 'special') catIcon = '<i data-lucide="orbit" style="width:12px;height:12px;"></i>';
                  else if (moveData?.damageClass === 'status') catIcon = '<i data-lucide="shield" style="width:12px;height:12px;"></i>';

                  const tooltip = moveData?.desc || 'Seleccionar movimiento';
                  const moveName = getTranslation(move, 'move') || '+ Añadir ataque';

                  return `
              <button type="button" class="move-slot-btn ${move ? '' : 'empty'}" style="--move-color: ${typeColor};" title="${escapeHtml(tooltip)}" data-action="edit-move" data-index="${idx}">
                <div class="move-slot-header">
                  <span class="val">${moveName}</span>
                  ${move ? `<span class="move-category-icon">${catIcon}</span>` : ''}
                </div>
                ${move ? `
                <div class="move-slot-stats">
                  <span>${powerStr}</span>
                </div>
                <div class="move-btn-clear" data-action="clear-move" data-index="${idx}"><i data-lucide="x" style="width:14px;height:14px;"></i></div>
                ` : ''}
              </button>
            `;
                }
              )
              .join("")}
          </div>
        </article>
      `;

  updateIcons();
}

function openSetEditor(index) {
  const mon = state.self[index];
  if (!mon) return;
  state.setEditor.index = index;
  ensureEditableSet(mon);
  renderSetEditor();
  setEditorModal.classList.add("open");
}

function closeSetEditor() {
  setEditorModal.classList.remove("open");
  state.setEditor.index = null;
}

function getChoiceStateLabel(kind, moveIndex = null) {
  if (kind === "ability")
    return {
      title: "Elegir habilidad",
      subtitle:
        "Selecciona una habilidad sugerida o escribe una personalizada.",
    };
  if (kind === "item")
    return {
      title: "Elegir objeto",
      subtitle: "Selecciona un objeto sugerido o escribe uno personalizado.",
    };
  if (kind === "nature")
    return {
      title: "Elegir naturaleza",
      subtitle: "Selecciona una naturaleza de la lista.",
    };
  return {
    title: `Elegir movimiento ${Number(moveIndex) + 1}`,
    subtitle: "Selecciona un movimiento sugerido o escribe uno personalizado.",
  };
}

function openSetChoice(kind, moveIndex = null) {
  const mon = getEditorMon();
  if (!mon) return;

  const options = getQuickOptions(mon, kind);
  state.setChoice = { kind, moveIndex, options, query: "" };

  const label = getChoiceStateLabel(kind, moveIndex);
  setChoiceTitle.textContent = label.title;
  setChoiceSubtitle.textContent = label.subtitle;
  setChoiceSearch.value = "";
  renderSetChoiceList();
  setChoiceModal.classList.add("open");
  setTimeout(() => setChoiceSearch.focus(), 30);
}

function closeSetChoice() {
  setChoiceModal.classList.remove("open");
  state.setChoice = { kind: "", moveIndex: null, options: [], query: "" };
}

function renderSetChoiceList() {
  const mon = getEditorMon();
  if (!mon) {
    setChoiceList.innerHTML = `<div class="empty">No hay Pokémon activo.</div>`;
    return;
  }

  const set = ensureEditableSet(mon);
  const q = normalizeText(setChoiceSearch.value || "");
  const kind = state.setChoice.kind;
  
  let options = [...(state.setChoice.options || [])];

  // Si hay un texto de búsqueda, expandimos la búsqueda a la base de datos global (GameDB)
  if (q && window.GameDB) {
    const dbMap = kind === 'move' ? window.GameDB.moves :
                  kind === 'ability' ? window.GameDB.abilities :
                  kind === 'item' ? window.GameDB.items : null;

    if (dbMap) {
      const extraMatches = [];
      for (const slug of Object.keys(dbMap)) {
        const translated = getTranslation(slug, kind);
        if (slug.includes(q) || normalizeText(translated).includes(q)) {
          extraMatches.push(slug);
        }
        // Límite de 50 resultados para mantener un rendimiento óptimo
        if (extraMatches.length >= 50) break;
      }
      options = uniqValues([...options, ...extraMatches]);
    }
  }

  const finalOptions = options
    .filter(Boolean)
    .filter((value) => {
      if (!q) return true;
      const translated = getTranslation(value, kind);
      return (
        normalizeText(value).includes(q) ||
        normalizeText(translated).includes(q)
      );
    });

  if (!finalOptions.length) {
    setChoiceList.innerHTML = `<div class="empty">Sin coincidencias. Puedes usar el texto escrito arriba.</div>`;
    return;
  }

  const currentValue =
    kind === "ability"
      ? set.ability || ""
      : kind === "item"
        ? set.item || ""
        : set.moves[state.setChoice.moveIndex] || "";

  setChoiceList.innerHTML = finalOptions
    .map((value) => {
      let translated = getTranslation(value, kind);
      
      // Fallback para capitalizar slugs directos si no hay traducción (ej: "closecombat" -> "Closecombat")
      if (translated === value && !value.includes(" ")) {
         translated = formatName(value);
      }
      
      const slug = normalizeText(value);

      const moveData = window.GameDB?.moves?.[slug];
      const abilityData = window.GameDB?.abilities?.[slug];
      const itemData = window.GameDB?.items?.[slug];

      let typeHtml = '';
      let desc = '';
      let styleAccent = '';
      let catIcon = '';
      let metricsHtml = '';
      let tooltipText = '';

      if (moveData) {
        typeHtml = `<span class="type-pill" style="background-color: var(--${moveData.type});">${moveData.type}</span>`;
        desc = moveData.desc || '';
        styleAccent = `border-left: 4px solid var(--${moveData.type});`;

        if (moveData.damageClass === 'physical') {
          catIcon = '<i data-lucide="swords" style="width:14px;height:14px; margin-left:4px; color:var(--muted);"></i>';
        } else if (moveData.damageClass === 'special') {
          catIcon = '<i data-lucide="orbit" style="width:14px;height:14px; margin-left:4px; color:var(--muted);"></i>';
        } else if (moveData.damageClass === 'status') {
          catIcon = '<i data-lucide="shield" style="width:14px;height:14px; margin-left:4px; color:var(--muted);"></i>';
        }

        const bp = moveData.power ? `${moveData.power} BP` : '-- BP';
        const acc = moveData.accuracy ? `${moveData.accuracy} Acc` : '-- Acc';
        let extraInfo = [bp, acc];
        if (moveData.hits > 1) extraInfo.push(`${moveData.hits} Golpes`);
        if (moveData.isSpread) extraInfo.push(`Área`);

        metricsHtml = `<div class="move-slot-stats" style="margin-top: 2px; margin-bottom: 4px;"><span>${extraInfo.join(' | ')}</span></div>`;
        
        const typeName = TYPE_META[moveData.type]?.name || moveData.type;
        const className = moveData.damageClass === 'physical' ? 'Físico' : moveData.damageClass === 'special' ? 'Especial' : 'Estado';
        tooltipText = `${typeName} | ${className}\n\n${desc}`;
      } else if (abilityData) {
        desc = abilityData.desc || '';
        tooltipText = desc;
      } else if (itemData) {
        desc = itemData.desc || '';
        tooltipText = desc;
      }

      const isCurrent = normalizeText(value) === normalizeText(currentValue);
      const currentBadge = isCurrent ? '<span class="tiny-chip" style="background: var(--blue); color: #fff; padding: 2px 4px; font-size: 0.55rem; border: none; margin-left: 6px;">Actual</span>' : '';

      return `
          <button class="choice-item ${isCurrent ? "active" : ""}" data-action="apply-choice" data-value="${value}" style="${styleAccent}" title="${escapeHtml(tooltipText)}">
            <div class="choice-item-header">
              <span class="choice-item-name" style="display:flex; align-items:center;">${translated} ${catIcon} ${currentBadge}</span>
              ${typeHtml}
            </div>
            ${metricsHtml}
            ${desc ? `<div class="flavor-text" style="text-align: left;">${desc}</div>` : ''}
          </button>
        `;
    })
    .join("");

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons({ root: setChoiceList });
  }
}

function applySetChoice(value) {
  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);
  const clean = String(value || "").trim();

  if (state.setChoice.kind === "ability") {
    set.ability = clean;
  } else if (state.setChoice.kind === "item") {
    const normalizedItem = normalizeText(clean);
    if (MEGA_STONES[normalizedItem]) {
      const hasOtherMega = state.self.some(
        (m, i) => m && i !== state.setEditor.index && m.name.includes("-mega"),
      );
      if (hasOtherMega) {
        alert(
          "Mega Clause: Ya tienes un Pokémon Megaevolucionado en el equipo.",
        );
        return;
      }
    }
    set.item = clean;
    if (
      MEGA_STONES[normalizedItem] &&
      mon.name !== MEGA_STONES[normalizedItem]
    ) {
      // Trigger species change
      const newSpecies = MEGA_STONES[normalizedItem];
      pickPokemonIntoSlot("self", state.setEditor.index, newSpecies).then(
        () => {
          const newMon = getEditorMon();
          if (newMon && newMon.set) {
            newMon.set.item = clean;
          }
          openSetEditor(state.setEditor.index);
        },
      );
      closeSetChoice();
      return; // early return since pickPokemonIntoSlot rebuilds the set
    }
  } else if (state.setChoice.kind === "move") {
    const idx = Number(state.setChoice.moveIndex);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = clean;
  }

  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
  closeSetChoice();
}

function clearSetChoiceValue() {
  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);

  if (state.setChoice.kind === "ability") {
    set.ability = "";
  } else if (state.setChoice.kind === "item") {
    set.item = "";
  } else if (state.setChoice.kind === "move") {
    const idx = Number(state.setChoice.moveIndex);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = "";
  }

  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
  closeSetChoice();
}

function resetCurrentSetToMeta() {
  const idx = state.setEditor.index;
  const mon = getEditorMon();
  if (idx == null || !mon) return;

  if (typeof buildDefaultSetForSpecies === "function") {
        mon.set = buildDefaultSetForSpecies(mon.name, "self", idx, mon.types);
  } else {
    mon.set = {
      ability: "",
      item: "",
      nature: "",
      evs: null,
      moves: ["", "", "", ""],
      raw: {},
    };
  }

  ensureEditableSet(mon);
  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
}

function changeCurrentPokemonFromEditor() {
  const idx = state.setEditor.index;
  if (idx == null) return;
  closeSetEditor();
  openModal("self", idx);
}

setEditorBody.addEventListener("change", (e) => {
  const input = e.target.closest('input[data-action="inline-ev"]');
  if (input) {
    const mon = getEditorMon();
    if (!mon) return;
    const set = ensureEditableSet(mon);
    if (!set.evs) set.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    let v = Number(input.value);
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(0, Math.min(252, Math.round(v)));
    set.evs[input.dataset.stat] = v;
    input.value = String(v);
    if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
    return;
  }

  const select = e.target.closest("select[data-action]");
  if (!select) return;

  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);
  const val = select.value;

  if (select.dataset.action === "inline-ability") {
    set.ability = val;
  } else if (select.dataset.action === "inline-item") {
    set.item = val;
    const normalizedItem = normalizeText(val);
    if (
      MEGA_STONES[normalizedItem] &&
      mon.name !== MEGA_STONES[normalizedItem]
    ) {
      const newSpecies = MEGA_STONES[normalizedItem];
      pickPokemonIntoSlot("self", state.setEditor.index, newSpecies).then(
        () => {
          const newMon = getEditorMon();
          if (newMon && newMon.set) newMon.set.item = val;
          openSetEditor(state.setEditor.index);
        },
      );
      return;
    }
  } else if (select.dataset.action === "inline-move") {
    const idx = Number(select.dataset.index);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = val;
  } else if (select.dataset.action === "inline-nature") {
    set.nature = val;
  }

  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
});

setEditorBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);

  if (btn.dataset.action === "edit-ability") openSetChoice("ability");
  if (btn.dataset.action === "edit-item") {
    if (mon.name.includes("-mega")) {
      alert("Los Pokémon Megaevolucionados no pueden cambiar de objeto.");
      return;
    }
    openSetChoice("item");
  }
  if (btn.dataset.action === "edit-nature") openSetChoice("nature");
  if (btn.dataset.action === "edit-move")
    openSetChoice("move", Number(btn.dataset.index));

  if (btn.dataset.action === "quick-ability") {
    set.ability = btn.dataset.value || "";
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }

  if (btn.dataset.action === "quick-item") {
    set.item = btn.dataset.value || "";
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }

  if (btn.dataset.action === "quick-spread") {
    const nature = btn.dataset.nature || "";
    const evs = JSON.parse(btn.dataset.evs || "{}");
    set.nature = nature;
    set.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs };
    if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }

  if (btn.dataset.action === "quick-move-any") {
    const firstEmpty = (set.moves || []).findIndex(
      (x) => !String(x || "").trim(),
    );
    openSetChoice("move", firstEmpty >= 0 ? firstEmpty : 0);
    setChoiceSearch.value = btn.dataset.value || "";
    renderSetChoiceList();
  }

  if (btn.dataset.action === "clear-move") {
    const idx = Number(btn.dataset.index);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = "";
    if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }
});

setChoiceSearch.addEventListener("input", renderSetChoiceList);

setChoiceList.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="apply-choice"]');
  if (!btn) return;
  applySetChoice(btn.dataset.value || "");
});

document
  .getElementById("closeSetEditorBtn")
  .addEventListener("click", closeSetEditor);
document.getElementById("doneSetBtn").addEventListener("click", closeSetEditor);
document
  .getElementById("resetSetBtn")
  .addEventListener("click", resetCurrentSetToMeta);
document
  .getElementById("changePokemonBtn")
  .addEventListener("click", changeCurrentPokemonFromEditor);

document
  .getElementById("closeSetChoiceBtn")
  .addEventListener("click", closeSetChoice);
document
  .getElementById("confirmSetChoiceBtn")
  .addEventListener("click", closeSetChoice);
document
  .getElementById("clearSetChoiceBtn")
  .addEventListener("click", clearSetChoiceValue);
document
  .getElementById("applyCustomChoiceBtn")
  .addEventListener("click", () => {
    const value = String(setChoiceSearch.value || "").trim();
    if (!value) return;
    applySetChoice(value);
  });

setEditorModal.addEventListener("click", (e) => {
  if (e.target === setEditorModal) closeSetEditor();
});

setChoiceModal.addEventListener("click", (e) => {
  if (e.target === setChoiceModal) closeSetChoice();
});

document.getElementById("bestFourCard").addEventListener("click", () => {
  // Feature: Click to highlight/expand best four (Future enhancement)
});

async function hydrateSavedState() {
  // Centralizado en el Drawer, ya no se renderiza en la inicialización
}

async function warmupLocalizationCaches() {
  // Future translation or cache warmups
}

function loadUiMode() {
  try {
    const saved = localStorage.getItem(UIMODE_KEY);
    if (saved === 'quick' || saved === 'expert' || saved === 'live') state.uiMode = saved;
  } catch {}
}

function setUiMode(mode) {
  state.uiMode = mode;
  try { localStorage.setItem(UIMODE_KEY, mode); } catch {}
  
  // Sincronizar las selecciones de leads (Quick) con slots activos (Expert)
  if (mode === 'expert' || mode === 'live') {
    if (state.leads.self.length > 0) state.activeSelfSlots = [...state.leads.self];
    if (state.leads.enemy.length > 0) state.activeEnemySlots = [...state.leads.enemy];
  } else {
    if (state.activeSelfSlots.length > 0) state.leads.self = [...state.activeSelfSlots];
    if (state.activeEnemySlots.length > 0) state.leads.enemy = [...state.activeEnemySlots];
  }
  
  recalculateActiveField();
  renderAll();
}

function renderUiMode() {
  const isQuick = state.uiMode === 'quick';
  const isLive = state.uiMode === 'live';

  // Toggle visual en el segmented
  document
    .querySelectorAll('#uiModeToggle .segmented-btn')
    .forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.uiMode);
    });

  // Secciones "Rápidas"
  const quickPreviewPanel = document.getElementById('quickPreviewPanel');
  const turn1Panel       = document.getElementById('turn1SimulatorPanel');
  const quickCombosSection = document.getElementById('quickCombosSection');
  
  if (quickPreviewPanel) quickPreviewPanel.style.display = isQuick ? 'block' : 'none';
  if (turn1Panel)        turn1Panel.style.display        = isQuick ? 'block' : 'none';
  if (quickCombosSection) quickCombosSection.style.display = isQuick ? 'block' : 'none';

  // Secciones "Expertas"
  const matrixSection = document.getElementById('matrixSectionTitle')?.closest('section');
  const insightGrid   = document.querySelector('.insight-grid');
  const dockAlerts    = document.getElementById('defensiveAlertFloat');

  if (matrixSection) matrixSection.style.display = (isQuick || isLive) ? 'none' : 'block';
  if (insightGrid)   insightGrid.style.display   = (isQuick || isLive) ? 'none' : 'grid';
  if (dockAlerts)    dockAlerts.style.display    = (isQuick || isLive) ? 'none' : 'flex';
}

const uiModeToggle = document.getElementById('uiModeToggle');
if (uiModeToggle) {
  uiModeToggle.addEventListener('click', e => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    setUiMode(btn.dataset.mode);
  });
}

window.GameDB = null;

async function initApp() {
  flowLog('initApp: Iniciando aplicación');
  loadUiMode();
  loadMatrixPreferences();
  
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
  renderAll();
  toggleMatrixHelp(state.matrixHelpOpen);
  flowLog('initApp: Aplicación inicializada con éxito');
}

initApp();

const damageTooltipContainer = document.createElement("div");
damageTooltipContainer.id = "damageTooltip";
document.body.appendChild(damageTooltipContainer);

matrixContainer.addEventListener("click", (e) => {
  const cell = e.target.closest('.clickable-cell[data-tooltip]');
  if (!cell) return;
  const data = JSON.parse(decodeURIComponent(cell.dataset.tooltip));

  const moveTypeStr = data.moveType || data.type || 'normal';
  const typeIcon = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/${moveTypeStr.toLowerCase()}.svg`;
  const typeColor = TYPE_META[moveTypeStr]?.color || '#fff';
  const iconContrast = getContrastColor(typeColor);

  /* damageTooltipContainer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div class="type-icon-circle" style="position: static; background-color: ${typeColor}; width: 20px; height: 20px; box-shadow: none;">
            <div class="type-svg-mask" style="mask-image: url('${typeIcon}'); -webkit-mask-image: url('${typeIcon}'); background-color: ${iconContrast}; width: 12px; height: 12px;"></div>
        </div>
        <strong style="font-size: 0.85rem; color: #fff;">${data.move} vs ${data.defender}</strong>
    </div>
    <div style="font-size: 0.75rem; color: var(--muted); margin-bottom: 2px;">Daño: <strong style="color: white;">${data.minPct}% - ${data.maxPct}%</strong></div>
    <div style="font-size: 0.75rem; color: var(--muted);">Probabilidad de OHKO: <strong style="color: ${data.ohkoProb > 0 ? 'var(--red)' : 'white'};">${data.ohkoProb}%</strong></div>
  `; */

 /*  damageTooltipContainer.style.left = `\${e.clientX + 15}px\`;
  damageTooltipContainer.style.top = `\${e.clientY + 15}px\`;
  damageTooltipContainer.classList.add('show'); */

  const rect = damageTooltipContainer.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
      damageTooltipContainer.style.left = '${e.clientX - rect.width - 15}px';
  }
  if (rect.bottom > window.innerHeight) {
      damageTooltipContainer.style.top = '${e.clientY - rect.height - 15}px';
  }

  clearTimeout(damageTooltipContainer.timeout);
  damageTooltipContainer.timeout = setTimeout(() => {
    damageTooltipContainer.classList.remove('show');
  }, 3000);
});

const scoutTooltipContainer = document.createElement("div");
scoutTooltipContainer.id = "scoutTooltip";
document.body.appendChild(scoutTooltipContainer);

function showScoutTooltip(slug, e) {
  if (!slug) return;
  const record = getMetaRecord(slug);
  if (!record || !record.entry) return;

  const formatNameSafe = (str, cat) => {
    const clean = normalizeText(str);
    return getTranslation(clean, cat) || formatName(clean);
  };

  const items = topEntries(record.entry.Items || {}, 3);
  const moves = topEntries(record.entry.Moves || {}, 5);

  if (!items.length && !moves.length) return;

  let html = `<div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${record.slug === 'aegislash-blade' ? '10026' : record.entry.id || 0}.png" onerror="this.style.display='none'" style="width:24px; height:24px;">
    <strong style="color: var(--gold); font-size: 0.9rem;">Scout: ${record.displayName}</strong>
  </div>`;

  if (items.length) {
    html += `<div class="scout-section-title"><i data-lucide="package" style="width:12px;height:12px;"></i> Objetos probables</div>`;
    items.forEach(i => {
      const pct = (i.value * 100).toFixed(1);
      html += `
        <div class="scout-bar-row">
          <div class="scout-bar-label">${formatNameSafe(i.key, 'item')}</div>
          <div class="scout-bar-track"><div class="scout-bar-fill" style="width: ${pct}%; background: var(--purple);"></div></div>
          <div class="scout-bar-pct">${pct}%</div>
        </div>
      `;
    });
  }

  if (moves.length) {
    html += `<div class="scout-section-title"><i data-lucide="crosshair" style="width:12px;height:12px;"></i> Ataques probables</div>`;
    moves.forEach(m => {
      const pct = (m.value * 100).toFixed(1);
      html += `
        <div class="scout-bar-row">
          <div class="scout-bar-label">${formatNameSafe(m.key, 'move')}</div>
          <div class="scout-bar-track"><div class="scout-bar-fill" style="width: ${pct}%; background: var(--blue);"></div></div>
          <div class="scout-bar-pct">${pct}%</div>
        </div>
      `;
    });
  }

  scoutTooltipContainer.innerHTML = html;
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons({ root: scoutTooltipContainer });
  }
  
  scoutTooltipContainer.classList.add('show');
  
  requestAnimationFrame(() => {
    const bounds = scoutTooltipContainer.getBoundingClientRect();
    let left = e.clientX + 15;
    let top = e.clientY + 15;
    if (left + bounds.width > window.innerWidth) left = e.clientX - bounds.width - 15;
    if (top + bounds.height > window.innerHeight) top = e.clientY - bounds.height - 15;
    
    scoutTooltipContainer.style.left = `${Math.max(10, left)}px`;
    scoutTooltipContainer.style.top = `${Math.max(10, top)}px`;
  });
  
  clearTimeout(scoutTooltipContainer.timeout);
  scoutTooltipContainer.timeout = setTimeout(() => {
    scoutTooltipContainer.classList.remove('show');
  }, 4000);
}

document.addEventListener("pointerenter", (e) => {
  if (e.pointerType !== 'mouse') return;
  if (!e.target || typeof e.target.closest !== 'function') return;
  const target = e.target.closest('[data-scout]');
  if (!target) return;
  showScoutTooltip(target.dataset.scout, e);
}, true);

document.addEventListener("pointerleave", (e) => {
  if (e.pointerType !== 'mouse') return;
  if (!e.target || typeof e.target.closest !== 'function') return;
  const target = e.target.closest('[data-scout]');
  if (target) scoutTooltipContainer.classList.remove('show');
}, true);

document.addEventListener("click", () => {
  if (scoutTooltipContainer) scoutTooltipContainer.classList.remove('show');
}, true);

// --- INFO TOOLTIP (Habilidades y Objetos) ---
const infoTooltipContainer = document.createElement("div");
infoTooltipContainer.id = "infoTooltip";
Object.assign(infoTooltipContainer.style, {
  position: 'fixed',
  zIndex: '9999',
  background: 'rgba(18, 22, 33, 0.95)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  padding: '14px',
  borderRadius: '16px',
  boxShadow: '0 12px 36px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  pointerEvents: 'none',
  opacity: '0',
  transform: 'translateY(8px)',
  transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  maxWidth: '260px',
  textAlign: 'left',
  color: '#fff'
});
document.body.appendChild(infoTooltipContainer);

window.showInfoTooltip = function(e, kind, slug) {
  if (e) e.stopPropagation(); // Evita que se cierre instantáneamente por el evento global
  if (!slug || slug === 'sinobjeto' || slug === 'desconocida') return;
  
  let data = null;
  let title = '';
  let icon = '';
  let color = '';
  
  if (kind === 'item' && window.GameDB?.items?.[slug]) {
    data = window.GameDB.items[slug];
    title = typeof getTranslation === 'function' ? getTranslation(data.name || slug, 'item') : formatName(slug);
    icon = 'package';
    color = 'var(--blue)';
  } else if (kind === 'ability' && window.GameDB?.abilities?.[slug]) {
    data = window.GameDB.abilities[slug];
    title = typeof getTranslation === 'function' ? getTranslation(data.name || slug, 'ability') : formatName(slug);
    icon = 'zap';
    color = 'var(--gold)';
  } else if (kind === 'move' && window.GameDB?.moves?.[slug]) {
    data = window.GameDB.moves[slug];
    title = typeof getTranslation === 'function' ? getTranslation(data.name || slug, 'move') : formatName(slug);
    icon = 'swords';
    color = 'var(--red)';
  }
  
  if (!data) {
    title = formatName(slug);
    data = { desc: 'No hay descripción detallada disponible en este momento.' };
    icon = kind === 'item' ? 'package' : 'zap';
    color = kind === 'item' ? 'var(--blue)' : 'var(--gold)';
  }
  
  const desc = data.desc || 'No hay descripción detallada disponible en este momento.';
  
  infoTooltipContainer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-bottom: 8px;">
      <i data-lucide="${icon}" style="color: ${color}; width: 16px; height: 16px;"></i>
      <strong style="color: #fff; font-size: 0.9rem; font-family: 'Cabinet Grotesk', sans-serif;">${title}</strong>
    </div>
    <div style="font-size: 0.75rem; color: var(--muted); line-height: 1.45;">
      ${desc}
    </div>
  `;
  
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons({ root: infoTooltipContainer });
  }
  
  infoTooltipContainer.style.opacity = '1';
  infoTooltipContainer.style.transform = 'translateY(0)';
  
  let clientX = e ? e.clientX : window.innerWidth / 2;
  let clientY = e ? e.clientY : window.innerHeight / 2;
  if (e && e.currentTarget) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!clientX) clientX = rect.left + rect.width / 2;
    if (!clientY) clientY = rect.top;
  }

  requestAnimationFrame(() => {
    const bounds = infoTooltipContainer.getBoundingClientRect();
    let left = clientX - (bounds.width / 2);
    let top = clientY - bounds.height - 15;
    
    if (top < 10) top = clientY + 25; // Si sale por arriba, mostrar por debajo
    if (left + bounds.width > window.innerWidth - 10) left = window.innerWidth - bounds.width - 10;
    if (left < 10) left = 10;
    
    infoTooltipContainer.style.left = `${left}px`;
    infoTooltipContainer.style.top = `${top}px`;
  });
  
  clearTimeout(infoTooltipContainer.timeout);
  infoTooltipContainer.timeout = setTimeout(() => {
    infoTooltipContainer.style.opacity = '0';
    infoTooltipContainer.style.transform = 'translateY(8px)';
  }, 10000);
};

document.addEventListener("click", () => {
  if (infoTooltipContainer) {
    infoTooltipContainer.style.opacity = '0';
    infoTooltipContainer.style.transform = 'translateY(8px)';
  }
}, true);

window.addEventListener("scroll", () => {
  if (infoTooltipContainer && infoTooltipContainer.style.opacity === '1') {
     infoTooltipContainer.style.opacity = '0';
     infoTooltipContainer.style.transform = 'translateY(8px)';
  }
}, true);

// --- Team Config Drawer ---
function renderTeamConfigDrawer(teamType) {
  let modalContainer = document.getElementById("teamConfigModal");
  if (!modalContainer) {
    modalContainer = document.createElement("div");
    modalContainer.id = "teamConfigModal";
    document.body.appendChild(modalContainer);
  }

  const title = teamType === 'self' ? 'Configuración de Tu Equipo' : 'Configuración del Rival';
  const icon = teamType === 'self' ? 'shield-half' : 'swords';
  const savedTeams = getSavedTeams();

  let quickActionsHtml = '';
  if (teamType === 'self') {
    quickActionsHtml += `
      <div class="save-bar" style="margin-bottom: 12px;">
        <input id="drawerSaveName" class="save-input" placeholder="Nombre del equipo" />
        <button class="btn green" onclick="handleDrawerAction('save', 'self')">Guardar Equipo</button>
      </div>
    `;
  }
  quickActionsHtml += `
    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
      <button class="btn blue" style="flex: 1;" onclick="handleDrawerAction('import', '${teamType}')"><i data-lucide="clipboard-paste"></i> Importar Paste</button>
      <button class="btn red" style="flex: 1;" onclick="handleDrawerAction('clear', '${teamType}')"><i data-lucide="trash-2"></i> Limpiar Slots</button>
    </div>
  `;

  const savedTeamsHtml = savedTeams.length ? savedTeams.map(team => `
    <div class="drawer-team-card">
      <div class="drawer-team-info">
        <div class="drawer-team-title">${team.name}</div>
        <div class="drawer-team-desc">${team.mons.length} slots · corte ${team.rating || state.rating}</div>
        <div class="drawer-team-sprites">
          ${team.mons.map(m => `<div class="drawer-team-sprite"><img src="${m.sprite}"></div>`).join('')}
        </div>
      </div>
      <div class="drawer-team-actions">
        <button class="btn small blue" onclick="handleDrawerAction('load-saved', '${teamType}', '${team.id}')">Cargar</button>
        ${teamType === 'self' ? `<button class="btn small red" onclick="handleDrawerAction('delete-saved', '${teamType}', '${team.id}')">Borrar</button>` : ''}
      </div>
    </div>
  `).join('') : '<div class="empty">No hay equipos guardados en tus cajas.</div>';

  const presetsHtml = META_PRESETS.map((preset, idx) => `
    <div class="drawer-team-card">
      <div class="drawer-team-info">
        <div class="drawer-team-title">${preset.name}</div>
        <div class="drawer-team-desc">${preset.desc}</div>
        <div class="drawer-team-sprites">
          ${preset.mons.map(slug => {
            const cached = state.cache.get(normalizeText(slug));
            const spriteUrl = cached ? cached.sprite : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${slug}.png`;
            return `<div class="drawer-team-sprite"><img src="${spriteUrl}" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'"></div>`;
          }).join('')}
        </div>
      </div>
      <div class="drawer-team-actions">
        <button class="btn small blue" onclick="handleDrawerAction('load-preset', '${teamType}', ${idx})">Cargar</button>
      </div>
    </div>
  `).join('');

  modalContainer.innerHTML = `
    <div class="premium-drawer-overlay" id="drawerOverlay" onclick="closeTeamDrawer(event)">
      <div class="premium-drawer" onclick="event.stopPropagation()">
        <div class="drawer-handle"></div>

        <div class="drawer-header">
          <div class="drawer-title">
            <i data-lucide="${icon}"></i>
            <span>${title}</span>
          </div>
          <button class="icon-btn" onclick="closeTeamDrawer()" style="background: rgba(255,255,255,0.05); border-radius: 50%; padding: 6px; border: none; cursor: pointer; color: #fff; display: grid; place-items: center;"><i data-lucide="x" style="width: 16px; height: 16px;"></i></button>
        </div>

        ${quickActionsHtml}

        <div class="drawer-tabs">
          <button class="drawer-tab active" onclick="switchDrawerTab('saved')">Mis Cajas</button>
          <button class="drawer-tab" onclick="switchDrawerTab('presets')">Top Meta</button>
        </div>

        <div class="drawer-tab-content active" id="tab-saved">
          <div class="drawer-scroll-list">
            ${savedTeamsHtml}
          </div>
        </div>

        <div class="drawer-tab-content" id="tab-presets">
          <div class="drawer-scroll-list">
            ${presetsHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    if (typeof section !== "undefined" && section) {
        lucide.createIcons({ root: section });
    } else {
        lucide.createIcons();
    }
  }

  const overlay = document.getElementById("drawerOverlay");
  void overlay.offsetWidth;
  overlay.classList.add("open");
}

window.closeTeamDrawer = function(e) {
  if (e && e.target !== e.currentTarget) return;
  const overlay = document.getElementById("drawerOverlay");
  if (overlay) {
    overlay.classList.remove("open");
  }
};

window.switchDrawerTab = function(tabId) {
  document.querySelectorAll('.drawer-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.drawer-tab-content').forEach(content => content.classList.remove('active'));
  
  if (tabId === 'saved') {
    document.querySelectorAll('.drawer-tab')[0].classList.add('active');
    document.getElementById('tab-saved').classList.add('active');
  } else {
    document.querySelectorAll('.drawer-tab')[1].classList.add('active');
    document.getElementById('tab-presets').classList.add('active');
  }
};

window.handleDrawerAction = async function(action, teamType, payload) {
  if (action === 'save') {
    const input = document.getElementById("drawerSaveName");
    saveCurrentTeam(input ? input.value : "");
    renderTeamConfigDrawer(teamType);
  } else if (action === 'import') {
    alert("En desarrollo: Importación de Poképaste");
  } else if (action === 'clear') {
    state[teamType] = Array(6).fill(null);
    state.leads[teamType] = [];
    if (teamType === "self") state.activeSelfSlots = [0, 1];
    if (teamType === "enemy") state.activeEnemySlots = [0, 1];
    renderAll();
    closeTeamDrawer();
  } else if (action === 'load-saved') {
    await loadSavedTeam(payload, teamType);
    closeTeamDrawer();
  } else if (action === 'delete-saved') {
    deleteSavedTeam(payload);
    renderTeamConfigDrawer(teamType);
  } else if (action === 'load-preset') {
    const preset = META_PRESETS[payload];
    await fillTeamWithSpecies(teamType, preset.mons);
    closeTeamDrawer();
  }
};

document.addEventListener('click', e => {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const btnLock = e.target.closest('#lockBestFourBtn');
  if (btnLock) {
    const preview = computeQuickPreview(getRows());
    lockBestFour(preview);
    return;
  }

  const comboCard = e.target.closest('.combo-card');
  if (comboCard) {
    const idxs = comboCard.dataset.combo.split(',').map(x => Number(x));
    applyQuickCombo(idxs);
    return;
  }
});
// --- LIVE BATTLE CENTER EXPERT MODE ---

function isBattleFocusActive() {
  return (state.uiMode === "expert" && state.battleFocus === "active") || state.uiMode === "live";
}

function getFilledIndices(side) {
  return state[side].map((m, i) => m ? i : null).filter(i => i !== null);
}

function normalizeActiveSlots(side) {
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

function getFocusedIndices(side) {
  if (!isBattleFocusActive()) return getFilledIndices(side);
  normalizeActiveSlots(side);
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  return state[activeKey];
}

function getFocusedTeam(side) {
  const indices = getFocusedIndices(side);
  return indices.map(i => state[side][i]).filter(Boolean);
}

function setBattleFocus(focus) {
  state.battleFocus = focus;
  const strip = document.getElementById("activeMatchupStrip");
  const toolbar = document.getElementById("liveBattleToolbar");
  if (strip) strip.style.display = focus === "active" ? "flex" : "none";
  if (toolbar) toolbar.style.display = focus === "active" ? "flex" : "none";
  renderAll();
}

function setActiveBattleSlot(side, activePosition, newTeamIndex) {
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

const _originalMatrixCellClass = matrixCellClass;
matrixCellClass = function(cell) {
  if (isBattleFocusActive()) {
    const tac = getTacticalCellClass(cell);
    return tac ? "cell--" + tac : _originalMatrixCellClass(cell);
  }
  return _originalMatrixCellClass(cell);
};

function renderActiveMatchupStrip() {
  if (!isBattleFocusActive()) return;
  normalizeActiveSlots("self");
  normalizeActiveSlots("enemy");
  
  const renderSlotBtn = (side, pos, idx) => {
    const mon = idx !== undefined && idx !== null ? state[side][idx] : null;
    const btn = document.getElementById(`active${side === "self" ? "Self" : "Enemy"}Slot${pos === 0 ? "A" : "B"}`);
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

function renderLiveBattleToolbar() {
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
  
  const elThreats = document.getElementById("battleUrgencyThreats");
  const elKills = document.getElementById("battleUrgencyKills");
  const elSafes = document.getElementById("battleUrgencySafeSwitches");
  
  if (elThreats) elThreats.innerHTML = `<i data-lucide="alert-circle" style="width:12px;height:12px;"></i> ${threats} Amenazas`;
  if (elKills) elKills.innerHTML = `<i data-lucide="crosshair" style="width:12px;height:12px;"></i> ${kills} KOs`;
  if (elSafes) elSafes.innerHTML = `<i data-lucide="shield-check" style="width:12px;height:12px;"></i> ${safes} Seguros`;
}

function openBattleSheet(payload) {
  state.battleSheet = { open: true, ...payload };
  renderBattleSheet();
  document.getElementById("battleSheetOverlay").style.display = "block";
  document.getElementById("battleSheet").classList.add("open");
}

function closeBattleSheet() {
  state.battleSheet.open = false;
  document.getElementById("battleSheetOverlay").style.display = "none";
  document.getElementById("battleSheet").classList.remove("open");
  
  state.selectedMatrixCell = null;
  document.querySelectorAll(".cell--selected").forEach(el => el.classList.remove("cell--selected"));
  document.querySelectorAll(".matrix-row-selected").forEach(el => el.classList.remove("matrix-row-selected"));
  document.querySelectorAll(".matrix-col-selected").forEach(el => el.classList.remove("matrix-col-selected"));
}

function getTacticalReasons(data) {
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

function getTacticalMeaning(data) {
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
    const activeIndices = getTurn1ResolvedLeadIndices("enemy");
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

function getSuggestedReserves(data) {
    const selfTeam = state.self.filter(Boolean);
    if (!selfTeam.length) return [];

    const activeSelfIndices = getTurn1ResolvedLeadIndices("self");
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

function renderBattleSheet() {
  const body = document.getElementById("battleSheetBody");
  const title = document.getElementById("battleSheetTitle");
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
         <div style="display:flex; gap:12px; font-size:0.8rem; color:var(--muted);">
            <span>Daño: <strong style="color:#fff;">${minPct}% - ${maxPct}% ${multStr ? `(${multStr})` : ''}</strong></span>
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

const focusToggle = document.getElementById("matrixFocusToggle");
if (focusToggle) {
  focusToggle.addEventListener("click", e => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    document.querySelectorAll("#matrixFocusToggle .segmented-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    setBattleFocus(btn.dataset.focus);
  });
}

document.getElementById("closeBattleSheetBtn")?.addEventListener("click", closeBattleSheet);
document.getElementById("battleSheetOverlay")?.addEventListener("click", closeBattleSheet);

document.addEventListener("click", e => {
  if (!isBattleFocusActive()) return;
  if (!e.target || typeof e.target.closest !== 'function') return;
  const cell = e.target.closest(".clickable-cell[data-tooltip]");
  if (!cell) return;

  e.preventDefault();
  e.stopPropagation();

  if (state.selectedMatrixCell === cell) {
    openBattleSheet({ cell });
  } else {
    document.querySelectorAll(".cell--selected").forEach(el => el.classList.remove("cell--selected"));
    document.querySelectorAll(".matrix-row-selected").forEach(el => el.classList.remove("matrix-row-selected"));
    document.querySelectorAll(".matrix-col-selected").forEach(el => el.classList.remove("matrix-col-selected"));

    cell.classList.add("cell--selected");
    const td = cell.closest("td");
    const tr = cell.closest("tr");
    if (tr) tr.classList.add("matrix-row-selected");
    if (td) {
      const colIndex = Array.from(tr.children).indexOf(td);
      const table = cell.closest("table");
      if (table) {
        table.querySelectorAll("tr").forEach(r => {
           if (r.children[colIndex]) r.children[colIndex].classList.add("matrix-col-selected");
        });
      }
    }
    state.selectedMatrixCell = cell;
  }
});

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

function getCandidateActions(state, side) {
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

function simulateTurn(state, actionsSelf, actionsEnemy) {
  if (DEBUG_MODE) console.groupCollapsed('🎬 [SIM_TURN] Resolviendo turno');
  // Clonar estado para no mutar directamente si quieres analizar "what-if"
  const nextState = structuredClone(state);

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
      prio = MOVE_PRIORITY_LEVELS[String(a.moveName).toLowerCase()] || 0;
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
          isSpread: info.isSpread || SPREAD_MOVES.has(moveName) || false
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

  if (DEBUG_MODE) console.groupEnd();
  return { nextState, log };
}

function scoreBoard(state, side) {
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

function suggestBestAction(state, side) {
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

function renderLiveRecommendations() {
  if (state.uiMode !== 'live') return;

  const suggestion = suggestBestAction(state, 'self');
  const mount = document.getElementById('liveRecommendations');
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

function renderLiveStatePanel() {
  const panel = document.getElementById('liveStatePanel');
  const selfMount = document.getElementById('liveStateSelfSlots');
  const enemyMount = document.getElementById('liveStateEnemySlots');
  const fieldMount = document.getElementById('liveFieldControls');

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

function attachLiveStateListeners() {
  const root = document.getElementById('liveStatePanel');
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
window.toggleDebug = toggleDebug;
window.runDebugScenarios = runDebugScenarios;

// Expose state globally for debug and HTML onclick handlers
window.state = state;