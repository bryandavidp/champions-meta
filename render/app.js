// render/app.js
// Responsabilidad: Core UI Bootstrap. Modos de UI, renderAll(), orquestación principal.

import { state } from '../core/state.js';
import { LIVE, QUICK, UI_MODES } from '../core/dom.js';
import { UIMODE_KEY } from '../core/constants.js';
import { flowLog } from '../utils/debug.js';
import { renderDock } from './dock.js';
import { getRows, renderMatrix } from '../matrix/render.js';
import { renderThreats, renderOpportunities, renderStrategies, renderSpeedTiers, renderDefensiveAlerts } from './analysis.js';
import {
  evaluateAllCombos,
  renderTurn1Simulator,
  renderQuickLayer,
} from '../modes/quick.js';
import {
  isBattleFocusActive,
  renderActiveMatchupStrip,
  renderLiveBattleToolbar,
  renderLiveRecommendations,
  renderLiveStatePanel,
} from '../modes/live.js';
import {
  renderWeaknessSummary,
} from '../app-core.js';
import { recalculateActiveField } from '../battle/effects.js';

export function updateIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

export let isBatchUpdating = false;
let renderTimer = null;
let lastSelfLength = -1;
let lastEnemyLength = -1;

export function renderAll(force = false) {
  flowLog('renderAll: Solicitud de renderizado recibida', { force, isBatchUpdating, renderTimerActive: !!renderTimer });
  if (isBatchUpdating) return;
  if (renderTimer) cancelAnimationFrame(renderTimer);

  renderTimer = requestAnimationFrame(() => {
    renderTimer = null;
    flowLog('renderAll: requestAnimationFrame ejecutando _doRender');
    _doRender(force);
  });
}

export function _doRender(force = false) {
  flowLog('_doRender: Inicio', { force, uiMode: state.uiMode });
  renderUiMode();
  renderDock('self');
  renderDock('enemy');

  const isQuick = state.uiMode === 'quick';
  const isExpert = state.uiMode === 'expert';
  const isLive = state.uiMode === 'live';
  const currentSelfLength = state.self.filter(Boolean).length;
  const currentEnemyLength = state.enemy.filter(Boolean).length;
  const lengthsChanged = currentSelfLength !== lastSelfLength || currentEnemyLength !== lastEnemyLength;

  if (isQuick || force) {
    if (lengthsChanged || force || state.needsReevaluation) {
      flowLog('_doRender: Cambios estructurales detectados, disparando evaluateAllCombos', {
        lastSelfLength,
        currentSelfLength,
        lastEnemyLength,
        currentEnemyLength,
      });
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
    renderWeaknessSummary();
    renderSpeedTiers();
    renderDefensiveAlerts();
  }

  if (isLive || force) {
    const rows = getRows();
    renderMatrix(rows);
    renderLiveStatePanel();
    renderLiveRecommendations();
  }

  renderActiveMatchupStrip();
  renderLiveBattleToolbar();

  if (isBattleFocusActive()) {
    if (LIVE.matchupStrip) LIVE.matchupStrip.style.display = 'flex';
    if (LIVE.battleToolbar) LIVE.battleToolbar.style.display = 'flex';
  }

  flowLog('_doRender: Fin');
}

export function loadUiMode() {
  try {
    const saved = localStorage.getItem(UIMODE_KEY);
    if (saved === 'quick' || saved === 'expert' || saved === 'live') {
      state.uiMode = saved;
    }
  } catch {}
}

export function setUiMode(mode) {
  state.uiMode = mode;
  try {
    localStorage.setItem(UIMODE_KEY, mode);
  } catch {}

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

export function renderUiMode() {
  const isQuick = state.uiMode === 'quick';
  const isLive = state.uiMode === 'live';
  const hideExpertPanels = isQuick || isLive;

  document.querySelectorAll('#uiModeToggle .segmented-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === state.uiMode);
  });

  if (QUICK.previewPanel) QUICK.previewPanel.style.display = isQuick ? 'block' : 'none';
  if (QUICK.turn1Panel) QUICK.turn1Panel.style.display = isQuick ? 'block' : 'none';
  if (QUICK.combosSection) QUICK.combosSection.style.display = isQuick ? 'block' : 'none';

  const matrixSection = UI_MODES.matrixSectionTitle?.closest('section');
  if (matrixSection) matrixSection.style.display = hideExpertPanels ? 'none' : 'block';
  if (UI_MODES.insightGrid) UI_MODES.insightGrid.style.display = hideExpertPanels ? 'none' : 'grid';
  if (UI_MODES.defensiveAlertFloat) UI_MODES.defensiveAlertFloat.style.display = hideExpertPanels ? 'none' : 'flex';
}

export function setBatchUpdating(val) {
  isBatchUpdating = val;
}
