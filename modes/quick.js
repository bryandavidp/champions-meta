import { state } from '../core/state.js';
import { clearComboBestAttackCache, clearComboSpeedCache, clearDamageCache } from '../core/runtime.js';
import { resetSmartLog } from '../utils/debug.js';
import { applySwitchInEffects, recalculateActiveField } from '../battle/effects.js';
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
  handleTurn1SimulatorClick,
  handleTurn1SimulatorChange,
  startTurn1BattleSimulation,
  resetTurn1BattleSimulation,
  advanceTurn1BattleSimulation,
  applyTurn1MoveSelection,
  applyTurn1FieldControl,
} from '../app-core.js';
export function resetQuickCombosLock() {
  state.chosenFour = [];
  state.chosenEnemyFour = [];
  state.turn1Custom = false;
  state.turn1Battle = { active: false, turn: 1, log: [], lastActionId: 0, actedThisTurn: {}, lastResolvedOrder: null, pendingSwitch: null };
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
  const sessionActive = !!state.turn1Battle?.active;
  const pendingSwitch = sessionActive ? state.turn1Battle?.pendingSwitch : null;
  const isKo = (mon) => !!mon && (mon.fainted || (mon.battle?.hpPct ?? 100) <= 0);
  const resolvedActives = new Set(
    (side === 'self' ? state.activeSelfSlots : state.activeEnemySlots).filter((slot) => Number.isFinite(slot))
  );

  if (sessionActive && pendingSwitch) {
    if (pendingSwitch.side !== side) return;
    if (resolvedActives.has(idx) || isKo(state[side][idx])) return;
    const replacePos = picks.indexOf(pendingSwitch.sourceIdx);
    if (replacePos < 0) return;
    picks[replacePos] = idx;

    const mon = state[side][idx];
    if (mon) {
      if (!mon.battle) mon.battle = {};
      mon.battle.side = side;
      if (!Number.isFinite(mon.battle.hpPct)) mon.battle.hpPct = 100;
      if (!mon.battle.status) mon.battle.status = 'none';
      if (!mon.battle.stages) mon.battle.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      mon.battle.protected = false;
      mon.battle.protectedBy = null;
      mon.battle.flinched = false;
      mon.battle.flinchedBy = null;
      mon.battle.enteredThisTurn = true;
      applySwitchInEffects(mon, side);
      mon.fainted = (mon.battle.hpPct ?? 100) <= 0;
    }

    state.turn1Battle.pendingSwitch = null;
    state.activeSelfSlots = state.leads.self.slice(0, 2);
    state.activeEnemySlots = state.leads.enemy.slice(0, 2);
    renderAll();
    return;
  }

  if (sessionActive && pos < 0 && isKo(state[side][idx])) return;
  let selectedNewActive = false;
  let replacedKo = false;

  if (pos >= 0) {
    if (sessionActive) return;
    picks.splice(pos, 1);
  } else if (picks.length < 2) {
    picks.push(idx);
    selectedNewActive = true;
  } else {
    const koPos = picks.findIndex(i => isKo(state[side]?.[i]));
    if (koPos >= 0) {
      picks[koPos] = idx;
      replacedKo = true;
    } else {
      picks.shift();
      picks.push(idx);
    }
    selectedNewActive = true;
  }

  clearDamageCache();
  clearComboBestAttackCache();
  clearComboSpeedCache();

  if (sessionActive && selectedNewActive) {
    const mon = state[side][idx];
    if (mon) {
      if (!mon.battle) mon.battle = {};
      mon.battle.side = side;
      if (!Number.isFinite(mon.battle.hpPct)) mon.battle.hpPct = 100;
      if (!mon.battle.status) mon.battle.status = 'none';
      if (!mon.battle.stages) mon.battle.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      mon.battle.protected = false;
      mon.battle.protectedBy = null;
      mon.battle.flinched = false;
      mon.battle.flinchedBy = null;
      mon.battle.enteredThisTurn = true;
      applySwitchInEffects(mon, side);
      mon.fainted = (mon.battle.hpPct ?? 100) <= 0;
    }
  } else {
    state.turn1Battle = { active: false, turn: 1, log: [], lastActionId: 0, actedThisTurn: {}, lastResolvedOrder: null, pendingSwitch: null };
    resetSmartLog();
    recalculateActiveField();
  }

  state.activeSelfSlots = state.leads.self.slice(0, 2);
  state.activeEnemySlots = state.leads.enemy.slice(0, 2);

  if (replacedKo) {
    state.turn1Custom = true;
  }
  renderAll();
}
