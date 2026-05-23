import { canonicalizeTargetMode, resolveCanonicalId, toCanonicalId } from '../data/canonical/dex.js';
import { createBattleSnapshot, createCandidateAction } from './snapshot.js';
import { estimateActionOutcome, simulateTurn } from './action-core.js';

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeLegacyTargetMode(mode) {
  if (mode === 'single-target') return 'normal';
  if (mode === 'spread-foes') return 'allAdjacentFoes';
  if (mode === 'ally') return 'adjacentAlly';
  if (mode === 'self') return 'self';
  if (mode === 'switch') return 'switch';
  return canonicalizeTargetMode(mode || 'normal');
}

export function createSnapshotFromLegacyBattleState(legacyState = {}, options = {}) {
  return createBattleSnapshot({
    selfTeam: options.selfTeam || legacyState.self || [],
    enemyTeam: options.enemyTeam || legacyState.enemy || [],
    field: options.field || legacyState.field || {},
    activeSelfSlots: options.activeSelfSlots || legacyState.activeSelfSlots || legacyState.leads?.self || [0, 1],
    activeEnemySlots: options.activeEnemySlots || legacyState.activeEnemySlots || legacyState.leads?.enemy || [0, 1],
    turn: options.turn || legacyState.turn || legacyState.turn1Battle?.turn || 1,
    phase: options.phase || 'simulation',
    source: options.source || 'legacy-action-adapter',
    meta: options.meta || {},
  });
}

export function legacyPlanActionToCandidateAction(action = {}, snapshot = null) {
  const side = action.side || 'self';
  const kind = action.kind || (action.switchInIndex != null ? 'switch' : 'move');
  const moveName = action.moveName || action.move || action.name || null;
  const moveId = moveName ? (resolveCanonicalId('moves', moveName) || toCanonicalId(moveName)) : null;
  const targetMode = normalizeLegacyTargetMode(action.targetMode || action.mode);
  const targetSlot = Number.isFinite(Number(action.targetIndex))
    ? Number(action.targetIndex)
    : Number.isFinite(Number(action.targetSlot))
      ? Number(action.targetSlot)
      : Number.isFinite(Number(action.switchInIndex))
        ? Number(action.switchInIndex)
        : null;
  return createCandidateAction({
    id: action.id || null,
    side,
    userSlot: Number(action.userIndex ?? action.userSlot ?? 0),
    kind,
    move: moveId || moveName,
    targetSide: action.targetSide ?? (kind === 'switch' ? side : null),
    targetSlot,
    targetMode,
    priority: Number.isFinite(action.dynamicPriority) ? action.dynamicPriority : undefined,
    effectClass: action.effectClass || 'damage',
    flags: {
      legal: action.canFailReason ? false : true,
      isSpread: !!action.isSpread || targetMode === 'allAdjacentFoes' || targetMode === 'allAdjacent',
      isPivot: !!action.isPivot,
      isGuard: !!action.isGuard,
      isRedirection: !!action.isRedirection,
    },
    unsupported: action.unsupported || [],
    data: {
      legacyAction: clonePlain(action),
      canFailReason: action.canFailReason || null,
      score: action.score ?? null,
      why: action.why || '',
    },
  });
}

export function legacyPairToCandidateActions(pair = {}, snapshot = null) {
  return (pair.actions || []).map((action) => legacyPlanActionToCandidateAction(action, snapshot));
}

export function estimateLegacyActionOutcome(snapshot, legacyAction, options = {}) {
  const action = legacyAction?.schema === 'candidate-action-v1'
    ? legacyAction
    : legacyPlanActionToCandidateAction(legacyAction, snapshot);
  return estimateActionOutcome(snapshot, action, options);
}

export function simulateLegacyPlanTurn(snapshot, pairSelf = {}, pairEnemy = {}, options = {}) {
  const actions = [
    ...legacyPairToCandidateActions(pairSelf, snapshot),
    ...legacyPairToCandidateActions(pairEnemy, snapshot),
  ];
  return simulateTurn(snapshot, actions, options);
}
