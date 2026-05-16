import { state } from '../core/state.js';
import { clearComboBestAttackCache, clearComboSpeedCache, clearDamageCache } from '../core/runtime.js';
import { resetSmartLog } from '../utils/debug.js';
import { recalculateActiveField } from '../battle/effects.js';
import { renderAll } from '../render/app.js';

export {
  buildQuickCombos,
  evaluateAllCombos,
  renderQuickCombos,
  renderQuickLayer,
  renderQuickPreview,
  renderMvpBanner,
  renderTurn1Simulator,
  renderTurn1PickRows,
  lockBestFour,
  applyQuickCombo,
  computeQuickPreview,
  getTurn1ResolvedLeadIndices,
} from '../app-core.js';
export function resetQuickCombosLock() {
  state.chosenFour = [];
  state.chosenEnemyFour = [];
  state.turn1Custom = false;
  resetSmartLog();
  clearDamageCache();
  clearComboBestAttackCache();
  clearComboSpeedCache();
}

export function toggleTurn1LeadSlot(side, idx) {
  if (!state[side]?.[idx]) return;

  if (side === 'self') state.turn1Custom = true;

  const picks = state.leads[side];
  const pos = picks.indexOf(idx);
  if (pos >= 0) {
    picks.splice(pos, 1);
  } else if (picks.length < 2) {
    picks.push(idx);
  } else {
    picks.shift();
    picks.push(idx);
  }

  resetSmartLog();
  clearDamageCache();
  recalculateActiveField();
  renderAll();
}
