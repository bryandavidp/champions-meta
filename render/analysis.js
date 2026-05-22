// render/analysis.js
// Responsabilidad: Paneles de análisis visual debajo de la matriz (Threats, Opportunities, Strategies, Speed Tiers, Defensive Alerts)

import { state } from '../core/state.js';
import { ANALYSIS, SPEED_ORDER, TURN_BRANCHES } from '../core/dom.js';
import { getFocusedTeam } from '../app-core.js';
import { renderAll, updateIcons } from '../render/app.js';
import { getEffectivenessBadgeHtml } from '../matrix/render.js';
import { TYPE_META, TYPE_CHART } from '../core/constants.js';
import { getTranslation } from '../utils/text.js';
import { scoreThreat, inferStrategies } from '../analysis/threats.js';
import { buildTurnPlans, setTurnPlansRenderCallback } from '../analysis/turn-branches.js';
import { evaluateKoConditions, renderKoConditionChips } from '../analysis/ko-conditions.js';
import { buildSpeedOrder } from '../analysis/speed-order.js';
import { calculateSpeed } from '../battle/speed.js';
import { getNatureSpeModifier, getResolvedEvs } from '../battle/stats.js';
import { recalculateActiveField } from '../battle/effects.js';
import { getContrastColor, effectiveness } from '../utils/types.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFilledTurnIndices(side) {
  return state[side].map((mon, index) => (mon ? index : null)).filter((index) => index !== null);
}

function getQuickTurnIndices(side) {
  const team = state[side];
  const filled = getFilledTurnIndices(side);
  const picked = (state.leads?.[side] || []).filter((index) => team[index]);
  const out = [...picked];

  if (side === 'self' && state.chosenFour?.length) {
    for (const index of state.chosenFour) {
      if (out.length >= 2) break;
      if (team[index] && !out.includes(index)) out.push(index);
    }
  }

  for (const index of filled) {
    if (out.length >= 2) break;
    if (!out.includes(index)) out.push(index);
  }
  return out.slice(0, 2);
}

function getBranchActiveMons(side) {
  if (state.uiMode === 'quick') {
    return getQuickTurnIndices(side).map((index) => state[side][index]).filter(Boolean);
  }

  if (state.uiMode === 'live' || (state.uiMode === 'expert' && state.battleFocus === 'active')) {
    const focused = getFocusedTeam(side).slice(0, 2);
    if (focused.length) return focused;
  }

  return getFilledTurnIndices(side).slice(0, 2).map((index) => state[side][index]).filter(Boolean);
}

function getTurnPlanOwnCombos() {
  const combos = (state.combos || []).slice(0, 6).map((combo) => ({
    indices: [...(combo.indices || [])],
    orderedIdx: [...(combo.orderedIdx || combo.indices || [])],
    leads: [...(combo.leads || [])],
    score: Number(combo.score || 0),
    planType: combo.planType || 'balanceado',
  }));

  if (state.uiMode === 'quick' && combos.length) {
    return combos;
  }

  const explicit = (() => {
    if (state.chosenFour?.length >= 4) {
      const leadSeed = state.uiMode === 'live'
        ? (state.activeSelfSlots?.length ? state.activeSelfSlots : state.leads?.self || [])
        : (state.leads?.self || []);
      return {
        indices: [...state.chosenFour.slice(0, 4)],
        orderedIdx: [
          ...leadSeed.filter((idx) => state.chosenFour.includes(idx)).slice(0, 2),
          ...state.chosenFour.filter((idx) => !leadSeed.includes(idx)),
        ],
        leads: leadSeed.filter((idx) => state.chosenFour.includes(idx)).slice(0, 2),
        score: 9999,
        planType: 'activo',
      };
    }

    const filled = state.self.map((mon, idx) => (mon ? idx : null)).filter((idx) => idx !== null);
    if (filled.length >= 4) {
      const leadSeed = state.uiMode === 'live'
        ? (state.activeSelfSlots?.length ? state.activeSelfSlots : filled)
        : (state.leads?.self?.length ? state.leads.self : filled);
      const chosen = filled.slice(0, 4);
      return {
        indices: chosen,
        orderedIdx: [
          ...leadSeed.filter((idx) => chosen.includes(idx)).slice(0, 2),
          ...chosen.filter((idx) => !leadSeed.includes(idx)),
        ],
        leads: leadSeed.filter((idx) => chosen.includes(idx)).slice(0, 2),
        score: 0,
        planType: 'baseline',
      };
    }
    return null;
  })();

  if (explicit) {
    const explicitKey = explicit.indices.slice().sort((a, b) => a - b).join(',');
    return [
      explicit,
      ...combos.filter((combo) => combo.indices.slice().sort((a, b) => a - b).join(',') !== explicitKey),
    ];
  }

  return combos;
}

let currentTurnPlans = [];
let currentTurnPlansStatus = 'idle';

function comboKey(indices = []) {
  return (indices || [])
    .filter(Number.isFinite)
    .slice()
    .sort((a, b) => a - b)
    .join(',');
}

function cloneTurnPlans(plans = []) {
  try {
    return structuredClone(plans);
  } catch (error) {
    return JSON.parse(JSON.stringify(plans));
  }
}

function monPlanSignature(mon) {
  if (!mon) return null;
  const set = mon.set || {};
  const evs = getResolvedEvs(mon);
  return {
    name: mon.name || mon.displayName || '',
    ability: set.ability || mon.ability || '',
    item: set.item || mon.item || '',
    nature: set.nature || '',
    moves: [...(set.moves || mon.moves || [])],
    evs,
    ivs: set.ivs || mon.ivs || {},
    teraType: set.teraType || mon.teraType || '',
  };
}

function turnPlanTeamSignature() {
  return JSON.stringify({
    mode: state.uiMode,
    self: state.self.map(monPlanSignature),
    enemy: state.enemy.map(monPlanSignature),
    enemyOverride: getTurnPlanEnemyOverrideIndices(),
  });
}

function getEnemyFilledIndices() {
  return state.enemy.map((mon, idx) => (mon ? idx : null)).filter((idx) => idx !== null);
}

function normalizeEnemyOverride(indices = []) {
  const filled = getEnemyFilledIndices();
  const next = [];
  (indices || []).forEach((idx) => {
    const value = Number(idx);
    if (Number.isFinite(value) && filled.includes(value) && !next.includes(value)) next.push(value);
  });
  for (const idx of filled) {
    if (next.length >= 4) break;
    if (!next.includes(idx)) next.push(idx);
  }
  return next.length >= 4 ? next.slice(0, 4) : [];
}

function getTurnPlanEnemyOverrideIndices() {
  if (!state.turnPlanEnemyOverride?.indices?.length) return [];
  return normalizeEnemyOverride(state.turnPlanEnemyOverride.indices);
}

function getLockedTurnPlansModel() {
  const selection = state.turnPlanSelection;
  if (!selection?.stablePlans?.length) return null;

  if (selection.teamSignature !== turnPlanTeamSignature()) {
    state.turnPlanSelection = null;
    return null;
  }

  return {
    status: 'ready',
    plans: cloneTurnPlans(selection.stablePlans),
    debug: { lockedBySelection: true, selectedPlanId: selection.planId },
  };
}

const ROLE_LABELS = {
  lead: 'LEAD',
  back: 'BACK',
  backline: 'BACK',
  'safe-pivot': 'PIVOT',
  closer: 'CIERRE',
  wincon: 'CIERRE',
};

function arraySameSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y).join(',');
  const right = [...b].sort((x, y) => x - y).join(',');
  return left === right;
}

function isPlanSelected(plan) {
  const own = plan?.selfBringIndices || [];
  const ownLeads = plan?.selfLeadIndices || [];
  const enemy = plan?.enemyBringIndices || [];
  const enemyLeads = plan?.enemyLeadIndices || [];
  return own.length >= 4
    && arraySameSet(state.chosenFour || [], own.slice(0, 4))
    && arraySameSet(state.leads?.self || [], ownLeads.slice(0, 2))
    && (!enemy.length || arraySameSet(state.chosenEnemyFour || [], enemy.slice(0, 4)))
    && (!enemyLeads.length || arraySameSet(state.leads?.enemy || [], enemyLeads.slice(0, 2)));
}

function planIntent(plan) {
  const actions = plan?.mainLine?.actions || [];
  const classes = actions.map((action) => action.effectClass || '');
  if ((plan?.confidence || 0) < 0.48 || (plan?.breakers || []).length >= 3) {
    return { key: 'risk-high', label: 'Riesgo alto', icon: 'alert-triangle' };
  }
  if (classes.some((item) => item.includes('speed') || item === 'tempo')) {
    return { key: 'tempo', label: 'Tempo', icon: 'wind' };
  }
  if (classes.some((item) => item.includes('protect') || item.includes('guard') || item === 'redirection')) {
    return { key: 'safe', label: 'Seguro', icon: 'shield' };
  }
  if (classes.some((item) => item.includes('damage'))) {
    return { key: 'aggressive', label: 'Agresivo', icon: 'swords' };
  }
  return { key: 'balanced', label: 'Balance', icon: 'sparkles' };
}

function roleLabel(role) {
  return ROLE_LABELS[role] || String(role || 'BACK').toUpperCase();
}

function typeStyle(type) {
  const key = String(type || '').toLowerCase();
  const color = TYPE_META[key]?.color || '#8da2c8';
  const contrast = getContrastColor(color);
  return `--type-color:${escapeHtml(color)};--type-contrast:${escapeHtml(contrast)};`;
}

const TYPE_ICON_MAP = {
  fire: 'flame',
  water: 'droplet',
  grass: 'leaf',
  electric: 'zap',
  ice: 'snowflake',
  rock: 'gem',
  ground: 'mountain',
  fairy: 'sparkles',
  dark: 'moon',
  steel: 'shield',
  ghost: 'ghost',
  psychic: 'brain',
  poison: 'skull',
  flying: 'feather',
  bug: 'bug',
  fighting: 'dumbbell',
  normal: 'circle',
  dragon: 'flame',
};

function typeIcon(type) {
  return TYPE_ICON_MAP[String(type || '').toLowerCase()] || 'circle';
}

function isTurnPlanLocked() {
  return state.uiMode === 'quick' && !!state.turnPlanSelection?.stablePlans?.length;
}

function areTurnPlansActionable() {
  return currentTurnPlansStatus === 'ready' || isTurnPlanLocked();
}

function actionIcon(action) {
  const kind = action?.effectClass || '';
  if (kind.includes('protect') || kind.includes('guard')) return 'shield';
  if (kind.includes('speed') || kind === 'tempo') return 'wind';
  if (kind.includes('pivot') || kind === 'switch') return 'refresh-cw';
  if (kind.includes('setup') || kind.includes('field')) return 'sparkles';
  if (kind.includes('redirection') || kind.includes('helping')) return 'hand';
  return 'swords';
}

function outcomeIcon(kind) {
  if (kind === 'ko-secure' || kind === 'ko-possible') return 'skull';
  if (kind === 'blocked') return 'shield-alert';
  if (kind === 'protect') return 'shield';
  if (kind === 'tempo') return 'wind';
  if (kind === 'pivot' || kind === 'switch') return 'refresh-cw';
  if (kind === 'spread') return 'target';
  if (kind === 'setup') return 'sparkles';
  return 'swords';
}

function outcomeLabel(action) {
  if (!action) return '';
  if (action.outcomeKind === 'ko-secure') return 'KO seguro';
  if (action.outcomeKind === 'ko-possible') return 'KO posible';
  if (action.outcomeKind === 'blocked') return action.riskNote || 'Bloqueado';
  if (action.isSpread || action.outcomeKind === 'spread') return 'Area x2';
  return action.damageRangeLabel || action.effectivenessLabel || action.riskNote || action.why || '';
}

function renderTypeBadge(type, compact = false) {
  const typeKey = String(type || '').toLowerCase();
  if (!typeKey) return '';
  const typeLabel = TYPE_META[typeKey]?.name || typeKey;
  return `
    <span class="turn-plan-type-badge ${compact ? 'is-compact' : ''}" style="${typeStyle(typeKey)}" title="Tipo ${escapeHtml(typeLabel)}">
      <i data-lucide="${typeIcon(typeKey)}"></i>
      <span>${escapeHtml(typeLabel)}</span>
    </span>
  `;
}

function renderOutcomeBadge(action, compact = false) {
  const label = outcomeLabel(action);
  if (!label) return '';
  const kind = action?.outcomeKind || action?.damageSeverity || 'info';
  return `
    <span class="turn-plan-outcome-badge is-${escapeHtml(kind)} ${compact ? 'is-compact' : ''}" title="${escapeHtml(label)}">
      <i data-lucide="${outcomeIcon(kind)}"></i>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderPriorityBadge(priority) {
  if (!Number.isFinite(priority) || priority === 0) return '';
  const label = `${priority > 0 ? '+' : ''}${priority}`;
  return `
    <span class="turn-plan-priority-badge" title="Prioridad ${escapeHtml(label)}">
      <i data-lucide="zap"></i>${escapeHtml(label)}
    </span>
  `;
}

function renderPlanRoster(items = [], side, leadCount = 2) {
  return `
    <div class="turn-plan-roster turn-plan-roster--${escapeHtml(side)}">
      ${items.slice(0, 4).map((item, index) => {
        const role = item.role || (index < leadCount ? 'lead' : 'back');
        return `
          <div class="turn-plan-pokemon ${index < leadCount ? 'is-lead' : 'is-back'} is-${escapeHtml(role)}">
            <img src="${item.sprite || ''}" alt="${escapeHtml(item.name || '')}">
            <div>
              <strong>${escapeHtml(item.name || '')}</strong>
              <span>${roleLabel(role)}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function compactName(name = '') {
  const value = String(name || '');
  return value.length > 13 ? `${value.slice(0, 12)}.` : value;
}

function renderEnemyPlanOptions(currentIndex) {
  return getEnemyFilledIndices().map((idx) => {
    const mon = state.enemy[idx];
    const label = mon?.displayName || mon?.name || `Slot ${idx + 1}`;
    return `<option value="${idx}" ${idx === currentIndex ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function renderMonToken(item = {}, side = 'self', index = 0, plan = null) {
  const role = item.role || (index < 2 ? 'lead' : 'back');
  const roleText = roleLabel(role);
  const label = item.name || 'Slot';
  const enemyIndices = plan?.enemyBringIndices || [];
  const enemyIndex = enemyIndices[index];
  const isEditableEnemy = side === 'enemy' && plan?.id && Number.isFinite(enemyIndex) && getEnemyFilledIndices().length >= 4;
  return `
    <label class="turn-plan-mon-token is-${escapeHtml(side)} is-${escapeHtml(role)} ${isEditableEnemy ? 'is-editable' : ''}" title="${escapeHtml(label)} - ${escapeHtml(roleText)}">
      <span class="turn-plan-mon-token__sprite">
        <img src="${item.sprite || ''}" alt="${escapeHtml(label)}">
      </span>
      <span class="turn-plan-mon-token__name">${escapeHtml(compactName(label))}</span>
      <span class="turn-plan-mon-token__role">${escapeHtml(roleText)}</span>
      ${isEditableEnemy ? `
        <select
          class="turn-plan-enemy-select"
          data-plan-id="${escapeHtml(plan.id || '')}"
          data-slot="${index}"
          aria-label="Cambiar rival ${index < 2 ? 'lead' : 'back'} ${index + 1}"
          title="Cambiar rival ${index < 2 ? 'lead' : 'back'} ${index + 1}"
        >
          ${renderEnemyPlanOptions(enemyIndex)}
        </select>
        <i class="turn-plan-mon-token__edit" data-lucide="chevrons-up-down" aria-hidden="true"></i>
      ` : ''}
    </label>
  `;
}

function renderPlanHeader(plan, index) {
  const isMain = index === 0;
  const intent = planIntent(plan);
  const risk = plan.riskLevel || intent.key;
  const headline = plan.headline || plan.tacticalSignature || 'Linea de apertura';
  const badges = [
    ...(plan.enemyOverrideActive ? [{ kind: 'enemy', label: 'Rival real' }] : []),
    ...(plan.previewBadges || []),
  ]
    .filter((badge) => !['field', 'ko', 'ko-possible'].includes(badge.kind))
    .slice(0, 2);
  return `
    <div class="turn-plan-header">
      <div class="turn-plan-header__main">
        <span class="turn-plan-card__kicker">${isMain ? 'Plan principal' : `Plan ${index + 1}`}</span>
        <div class="turn-plan-header__title-row">
          <strong>${escapeHtml(plan.fieldSummary || 'Campo neutro')}</strong>
          <span class="turn-plan-intent is-${intent.key}"><i data-lucide="${intent.icon}"></i>${intent.label}</span>
        </div>
        <div class="turn-plan-verdict is-${escapeHtml(risk)}" title="${escapeHtml(headline)}">
          <i data-lucide="${intent.icon}"></i>
          <span>${escapeHtml(headline)}</span>
        </div>
        ${badges.length ? `
          <div class="turn-plan-preview-badges">
            ${badges.map((badge) => `<span class="is-${escapeHtml(badge.kind || 'info')}">${escapeHtml(badge.label || '')}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="turn-plan-card__score" aria-label="Puntuacion ${escapeHtml(plan.score)} y confianza ${Math.round((plan.confidence || 0) * 100)}%">
        <strong>${plan.score}</strong>
        <span>${Math.round((plan.confidence || 0) * 100)}%</span>
      </div>
    </div>
  `;
}

function renderPlanMatchupRail(plan) {
  const selfMons = (plan.bring || []).slice(0, 4);
  const enemyMons = (plan.predictedEnemyBring || []).slice(0, 4);
  return `
    <div class="turn-plan-matchup-rail" aria-label="Bring recomendado contra rival previsto">
      <section class="turn-plan-matchup-side is-self">
        <span><i data-lucide="users"></i> Tu 4</span>
        <div>${selfMons.map((item, index) => renderMonToken(item, 'self', index, plan)).join('')}</div>
      </section>
      <div class="turn-plan-vs-pill">VS</div>
      <section class="turn-plan-matchup-side is-enemy">
        <span><i data-lucide="${plan.enemyOverrideActive ? 'user-check' : 'crosshair'}"></i> ${plan.enemyOverrideActive ? 'Rival real' : 'Rival'}</span>
        <div>${enemyMons.map((item, index) => renderMonToken(item, 'enemy', index, plan)).join('')}</div>
      </section>
    </div>
  `;
}

function renderTargetToken(action) {
  const sprites = action?.targetSprites?.length ? action.targetSprites : (action?.targetSprite ? [action.targetSprite] : []);
  const label = action?.target || 'Campo';
  return `
    <span class="turn-plan-target-token is-${escapeHtml(action?.targetSide || 'field')}" title="${escapeHtml(label)}">
      ${sprites.slice(0, 2).map((sprite) => `<img src="${sprite}" alt="">`).join('')}
      <span>${escapeHtml(compactName(label))}</span>
    </span>
  `;
}

function renderPlanCommand(action, index) {
  const moveLabel = getTranslation(action?.move, 'move') || action?.move || 'Accion';
  return `
    <div class="turn-plan-command is-${escapeHtml(action?.outcomeKind || action?.effectClass || 'info')} severity-${escapeHtml(action?.damageSeverity || 'none')}" title="${escapeHtml(action?.why || moveLabel)}">
      <div class="turn-plan-command__order">#${index + 1}</div>
      <div class="turn-plan-command__actor">
        ${action?.actorSprite ? `<img src="${action.actorSprite}" alt="${escapeHtml(action.actor || '')}">` : ''}
        <span>${escapeHtml(compactName(action?.actor || 'Slot'))}</span>
      </div>
      <i class="turn-plan-command__icon" data-lucide="${actionIcon(action)}"></i>
      <div class="turn-plan-command__move">
        <strong>${escapeHtml(moveLabel)}</strong>
        <div>
          ${renderTypeBadge(action?.type, true)}
          ${renderPriorityBadge(action?.priority)}
        </div>
      </div>
      <i class="turn-plan-command__arrow" data-lucide="arrow-right"></i>
      ${renderTargetToken(action)}
      <div class="turn-plan-command__result">
        ${renderOutcomeBadge(action, true)}
        ${(action?.effectivenessLabel && action.effectivenessLabel !== outcomeLabel(action)) ? `<span>${escapeHtml(action.effectivenessLabel)}</span>` : ''}
      </div>
    </div>
  `;
}

function renderPlanCommandRail(actions = []) {
  return `
    <div class="turn-plan-command-rail">
      <div class="turn-plan-rail-label"><i data-lucide="gamepad-2"></i> Turno 1</div>
      <div class="turn-plan-command-rail__list">
        ${actions.slice(0, 2).map((action, index) => renderPlanCommand(action, index)).join('')}
      </div>
    </div>
  `;
}

function renderPlanBoardDelta(delta = []) {
  const visible = (delta || []).slice(0, 4);
  if (!visible.length) {
    return `
      <div class="turn-plan-board-delta is-empty">
        <i data-lucide="activity"></i>
        <span>Sin bajas previstas en la linea principal</span>
      </div>
    `;
  }
  return `
    <div class="turn-plan-board-delta">
      ${visible.map((item) => {
        const sideLabel = item.side === 'self' ? 'Tu lado' : 'Rival';
        const hp = Math.max(0, Math.min(100, Number(item.afterHp || 0)));
        return `
          <span class="turn-plan-delta-token is-${escapeHtml(item.kind)} is-${escapeHtml(item.side)}" title="${escapeHtml(sideLabel)}: ${escapeHtml(item.name)} ${item.beforeHp}% a ${item.afterHp}%">
            ${item.sprite ? `<img src="${item.sprite}" alt="">` : ''}
            <span>${escapeHtml(compactName(item.name))}</span>
            <b>${item.beforeHp}->${item.afterHp}${item.fainted ? ' KO' : '%'}</b>
            <i class="turn-plan-hpbar"><em style="width:${hp}%"></em></i>
          </span>
        `;
      }).join('')}
    </div>
  `;
}

function renderPlanActionChip(action, orderIndex = null, compact = false) {
  if (!action) return '';
  const priorityLabel = Number.isFinite(action.priority) && action.priority !== 0
    ? `<span class="turn-plan-action-chip__prio"><i data-lucide="zap"></i>${action.priority > 0 ? '+' : ''}${action.priority}</span>`
    : '';
  const moveLabel = getTranslation(action.move, 'move') || action.move || 'Accion';
  const typeKey = String(action.type || '').toLowerCase();
  const meta = [
    action.damageRangeLabel,
    action.effectivenessLabel,
    action.isSpread ? 'Area' : '',
    action.riskNote,
  ].filter(Boolean);

  return `
    <div class="turn-plan-action-chip ${compact ? 'is-compact' : ''} ${action.effectClass ? `is-${escapeHtml(action.effectClass)}` : ''}">
      <div class="turn-plan-action-chip__head">
        ${orderIndex !== null ? `<span class="turn-plan-action-chip__order">#${orderIndex + 1}</span>` : ''}
        <span class="turn-plan-action-chip__actor">
          ${action.actorSprite ? `<img src="${action.actorSprite}" alt="${escapeHtml(action.actor || '')}">` : ''}
          <strong>${escapeHtml(action.actor || '')}</strong>
        </span>
        ${priorityLabel}
      </div>
      <div class="turn-plan-action-chip__body">
        <i data-lucide="${actionIcon(action)}"></i>
        <span>${escapeHtml(moveLabel)}</span>
        <i data-lucide="arrow-right"></i>
        ${renderTargetToken(action)}
      </div>
      <div class="turn-plan-action-chip__meta">
        ${renderTypeBadge(typeKey, true)}
        ${renderOutcomeBadge(action, true)}
        ${meta.slice(0, compact ? 2 : 4).map((item) => `<span>${escapeHtml(item)}</span>`).join('')}
      </div>
      ${!compact && action.why ? `<p>${escapeHtml(action.why)}</p>` : ''}
    </div>
  `;
}

function renderPlanEvents(events = []) {
  if (!events.length) return '<div class="muted-small">Sin evento critico visible.</div>';
  return `
    <div class="turn-plan-event-list">
      ${events.slice(0, 4).map((event) => `
        <div class="turn-plan-event turn-plan-event--${escapeHtml(event.kind || 'info')}">
          <strong>${escapeHtml(event.actor || event.label || 'Mesa')}</strong>
          <span>${escapeHtml(event.text || event.reason || `${event.move || 'Accion'} sobre ${event.target || 'mesa'}`)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSnapshotColumn(sideLabel, mons = []) {
  return `
    <div class="turn-plan-snapshot__side">
      <span class="turn-plan-snapshot__label">${escapeHtml(sideLabel)}</span>
      <div class="turn-plan-snapshot__mons">
        ${mons.map((mon) => `
          <div class="turn-plan-snapshot__mon ${mon.fainted ? 'is-ko' : ''}">
            <img src="${mon.sprite || ''}" alt="${escapeHtml(mon.name || '')}">
            <div>
              <strong>${escapeHtml(mon.name || '')}</strong>
              <small>${escapeHtml(mon.role || 'activa')}</small>
            </div>
            <span>${Math.max(0, Math.round(mon.hpPct || 0))}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPlanSnapshot(snapshot) {
  if (!snapshot) return '';
  return `
    <div class="turn-plan-snapshot">
      <div class="turn-plan-snapshot__field">${escapeHtml(snapshot.field || 'Campo neutro')}</div>
      <div class="turn-plan-snapshot__grid">
        ${renderSnapshotColumn('Tu lado', snapshot.self || [])}
        ${renderSnapshotColumn('Rival', snapshot.enemy || [])}
      </div>
    </div>
  `;
}

function renderPlanDetails(plan) {
  const why = (plan.why || []).map((item) => '<span class="turn-plan-chip">' + escapeHtml(item) + '</span>').join('');
  const breakers = (plan.breakers || []).length
    ? (plan.breakers || []).map((item) => '<span class="turn-plan-chip turn-plan-chip--warn">' + escapeHtml(item) + '</span>').join('')
    : '<span class="turn-plan-chip">Sin castigo claro detectado</span>';

  return `
    <div class="turn-plan-details">
      <section class="turn-plan-step">
        <div class="turn-plan-step__head">
          <strong>Turno 1</strong>
          <span>Tus dos comandos exactos</span>
        </div>
        <div class="turn-plan-action-grid">
          ${(plan.mainLine?.actions || []).map((action, index) => renderPlanActionChip(action, index)).join('')}
        </div>
        ${renderPlanSnapshot(plan.mainLine?.snapshot)}
      </section>
      <section class="turn-plan-step turn-plan-step--enemy">
        <div class="turn-plan-step__head">
          <strong>Si responden asi</strong>
          <span>Respuesta rival mas probable</span>
        </div>
        <div class="turn-plan-action-grid turn-plan-action-grid--enemy">
          ${(plan.enemyLikelyResponse?.actions || []).map((action, index) => renderPlanActionChip(action, index)).join('')}
        </div>
        ${renderPlanEvents(plan.enemyLikelyResponse?.events || [])}
        ${renderPlanSnapshot(plan.enemyLikelyResponse?.snapshot)}
      </section>
      ${(plan.contingencies || []).map((contingency) => {
        const isPunishLine = String(contingency.label || '').toLowerCase().includes('castigo');
        return `
        <section class="turn-plan-step ${isPunishLine ? 'turn-plan-step--warn' : 'turn-plan-step--follow'}">
          <div class="turn-plan-step__head">
            <strong>${escapeHtml(contingency.label || 'Continuacion')}</strong>
            <span>${isPunishLine ? 'Lo que mas te rompe' : 'Siguiente turno recomendado'}</span>
          </div>
          <div class="turn-plan-action-grid">
            ${(contingency.actions || []).map((action, index) => renderPlanActionChip(action, index)).join('')}
          </div>
          ${contingency.events ? renderPlanEvents(contingency.events) : ''}
          ${renderPlanSnapshot(contingency.snapshot)}
        </section>
      `;
      }).join('')}
    </div>
    <div class="turn-plan-card__meta">
      <div>
        <div class="turn-plan-side-label">Por que gana</div>
        <div class="turn-plan-chip-row">${why || '<span class="turn-plan-chip">Sin resumen tactico</span>'}</div>
      </div>
      <div>
        <div class="turn-plan-side-label">Que lo rompe</div>
        <div class="turn-plan-chip-row">${breakers}</div>
      </div>
    </div>
  `;
}

function renderPlanSummary(plan, index) {
  const selected = isPlanSelected(plan);
  const actions = (plan.mainLine?.actions || []).slice(0, 2);
  const locked = isTurnPlanLocked();
  const actionable = areTurnPlansActionable();

  return `
    <summary class="turn-plan-summary turn-plan-summary--dense" aria-label="${escapeHtml(plan.headline || 'Plan de partida')}">
      ${renderPlanHeader(plan, index)}
      ${renderPlanMatchupRail(plan)}
      ${renderPlanCommandRail(actions)}
      ${renderPlanBoardDelta(plan.deltaSummary || plan.mainLine?.boardDelta || [])}

      <div class="turn-plan-summary__footer">
        <button class="turn-plan-use-btn ${selected ? 'is-active' : ''} ${!actionable ? 'is-pending' : ''}" type="button" data-plan-id="${escapeHtml(plan.id || '')}" ${actionable ? '' : 'disabled aria-disabled="true"'}>
          <i data-lucide="${selected ? 'check-circle' : 'circle-plus'}"></i>
          ${selected ? 'Activo' : actionable ? 'Usar plan' : 'Calculando'}
        </button>
        ${locked ? '<button class="turn-plan-unlock-btn is-inline" type="button">Recalcular</button>' : ''}
        <span class="turn-plan-expand-label"><i data-lucide="chevron-down"></i> Detalles</span>
      </div>
    </summary>
  `;
}

function renderTurnPlanCard(plan, index) {
  const selected = isPlanSelected(plan);
  const intent = planIntent(plan);
  return `
    <details class="turn-plan-card turn-plan-card--dense ${index === 0 ? 'turn-plan-card--main' : ''} ${selected ? 'is-selected' : ''} is-${intent.key}" data-plan-id="${escapeHtml(plan.id || '')}">
      ${renderPlanSummary(plan, index)}
      ${renderPlanDetails(plan)}
    </details>
  `;
}

function fallbackPlanIndices(items = [], side) {
  const used = new Set();
  return items.map((item) => {
    const idx = state[side].findIndex((mon, index) => {
      if (!mon || used.has(index)) return false;
      return [mon.name, mon.displayName].includes(item.name);
    });
    if (idx >= 0) used.add(idx);
    return idx;
  }).filter((idx) => idx >= 0);
}

function replaceEnemyOverrideSlot(currentIndices, slot, newIndex) {
  const filled = getEnemyFilledIndices();
  const next = normalizeEnemyOverride(currentIndices);
  if (next.length < 4 || !filled.includes(newIndex)) return next;

  const boundedSlot = Math.max(0, Math.min(3, Number(slot) || 0));
  const previous = next[boundedSlot];
  const duplicateSlot = next.indexOf(newIndex);
  if (duplicateSlot >= 0 && duplicateSlot !== boundedSlot) {
    next[duplicateSlot] = previous;
  }
  next[boundedSlot] = newIndex;
  return normalizeEnemyOverride(next);
}

function applyTurnPlanEnemyOverride(planId, slot, enemyIndex) {
  const plan = currentTurnPlans.find((entry) => entry.id === planId);
  if (!plan) return;

  const current = getTurnPlanEnemyOverrideIndices().length >= 4
    ? getTurnPlanEnemyOverrideIndices()
    : normalizeEnemyOverride(plan.enemyBringIndices || fallbackPlanIndices(plan.predictedEnemyBring, 'enemy'));
  const next = replaceEnemyOverrideSlot(current, Number(slot), Number(enemyIndex));
  if (next.length < 4) return;

  state.turnPlanEnemyOverride = {
    indices: [...next],
    sourcePlanId: planId,
    sourceOwnKey: comboKey(plan.selfBringIndices || []),
    updatedAt: Date.now(),
  };
  state.turnPlanSelection = null;
  state.chosenEnemyFour = [...next];
  state.leads.enemy = next.slice(0, 2);
  state.activeEnemySlots = next.slice(0, 2);

  recalculateActiveField();
  renderTurnBranches();
}

export function applyTurnPlan(planId) {
  if (!areTurnPlansActionable()) return;
  const plan = currentTurnPlans.find((entry) => entry.id === planId);
  if (!plan) return;

  const selfBring = (plan.selfBringIndices?.length ? plan.selfBringIndices : fallbackPlanIndices(plan.bring, 'self'))
    .filter(Number.isFinite)
    .slice(0, 4);
  const selfLeads = (plan.selfLeadIndices?.length ? plan.selfLeadIndices : selfBring.slice(0, 2))
    .filter((idx) => selfBring.includes(idx))
    .slice(0, 2);
  const enemyBring = (plan.enemyBringIndices?.length ? plan.enemyBringIndices : fallbackPlanIndices(plan.predictedEnemyBring, 'enemy'))
    .filter(Number.isFinite)
    .slice(0, 4);
  const enemyLeads = (plan.enemyLeadIndices?.length ? plan.enemyLeadIndices : enemyBring.slice(0, 2))
    .filter((idx) => enemyBring.includes(idx))
    .slice(0, 2);

  if (selfBring.length < 4 || selfLeads.length < 2) return;

  state.turnPlanSelection = {
    planId,
    teamSignature: turnPlanTeamSignature(),
    stablePlans: cloneTurnPlans(currentTurnPlans),
    selectedAt: Date.now(),
  };

  state.chosenFour = [...selfBring];
  state.leads.self = [...selfLeads];
  state.activeSelfSlots = [...selfLeads];
  state.turn1Custom = false;

  if (enemyBring.length >= 4) state.chosenEnemyFour = [...enemyBring];
  if (enemyLeads.length >= 2) {
    state.leads.enemy = [...enemyLeads];
    state.activeEnemySlots = [...enemyLeads];
  }

  recalculateActiveField();
  renderAll();
}

function bindTurnPlanEvents() {
  const content = TURN_BRANCHES.content;
  if (!content || content.dataset.turnPlanEventsBound === 'true') return;
  content.dataset.turnPlanEventsBound = 'true';
  content.addEventListener('change', (event) => {
    const enemySelect = event.target.closest?.('.turn-plan-enemy-select');
    if (!enemySelect) return;
    event.stopPropagation();
    applyTurnPlanEnemyOverride(
      enemySelect.dataset.planId || '',
      Number(enemySelect.dataset.slot || 0),
      Number(enemySelect.value),
    );
  });
  content.addEventListener('click', (event) => {
    const enemySelect = event.target.closest?.('.turn-plan-enemy-select');
    if (enemySelect) {
      event.stopPropagation();
      return;
    }

    const resetEnemyBtn = event.target.closest?.('.turn-plan-enemy-reset-btn');
    if (resetEnemyBtn) {
      event.preventDefault();
      event.stopPropagation();
      state.turnPlanEnemyOverride = null;
      state.turnPlanSelection = null;
      renderTurnBranches();
      return;
    }

    const unlockBtn = event.target.closest?.('.turn-plan-unlock-btn');
    if (unlockBtn) {
      event.preventDefault();
      event.stopPropagation();
      state.turnPlanSelection = null;
      renderTurnBranches();
      return;
    }

    const useBtn = event.target.closest?.('.turn-plan-use-btn');
    if (!useBtn) return;
    event.preventDefault();
    event.stopPropagation();
    applyTurnPlan(useBtn.dataset.planId || '');
  });
}

export function renderTurnBranches() {
  const panel = TURN_BRANCHES.panel;
  const content = TURN_BRANCHES.content;
  if (!panel || !content) return;
  bindTurnPlanEvents();

  const isSupportedMode = ['quick', 'live', 'expert'].includes(state.uiMode);
  panel.style.display = isSupportedMode ? 'block' : 'none';
  if (!isSupportedMode) return;

  const lockedModel = state.uiMode === 'quick' ? getLockedTurnPlansModel() : null;
  const forcedEnemyIndices = getTurnPlanEnemyOverrideIndices();
  const plansModel = lockedModel || buildTurnPlans({
    mode: state.uiMode,
    selfTeam: state.self,
    enemyTeam: state.enemy,
    field: state.field,
    ownCombos: getTurnPlanOwnCombos(),
    preferredOwnCombo: state.uiMode === 'quick' ? [] : (state.chosenFour?.length ? state.chosenFour : []),
    topOwnCombos: state.uiMode === 'quick' ? 3 : 1,
    topEnemyCombos: 3,
    horizon: 2,
    enemyModel: 'meta-likely',
    beamWidth: state.uiMode === 'quick' ? 6 : 5,
    actionCapPerMon: 5,
    displayLimit: state.uiMode === 'quick' ? 3 : 1,
    forcedEnemyIndices,
  });

  const plans = plansModel?.plans || [];
  currentTurnPlans = plans;
  currentTurnPlansStatus = plansModel?.status || 'ready';
  const isExpert = state.uiMode === 'expert';
  const title = state.uiMode === 'quick'
    ? 'Top 3 planes de partida'
    : state.uiMode === 'live'
      ? 'Plan de turno en vivo'
      : 'Plan predictivo';
  const subtitle = state.uiMode === 'quick'
    ? 'Elige bring, leads y linea inicial antes del simulador.'
    : state.uiMode === 'live'
      ? 'Linea principal sobre la mesa actual con respuesta rival y continuacion.'
      : 'Resumen tactico de los openings mas solidos y de como se rompen.';

  if (!plans.length && plansModel?.status === 'error') {
    content.innerHTML = `
      <div class="turn-plan-empty">
        <strong>${title}</strong>
        <span>El planificador se ha detenido para no bloquear el navegador. Cierra el selector o ajusta un pick para intentarlo de nuevo.</span>
      </div>
    `;
    return;
  }

  if (!plans.length && plansModel?.status !== 'loading') {
    content.innerHTML = `<div class="turn-plan-empty"><strong>${title}</strong><span>Anade al menos cuatro Pokemon por lado para calcular bring, leads y lineas de 2 turnos.</span></div>`;
    return;
  }

  const statusChip = lockedModel
    ? '<span class="tiny-chip">Plan fijado</span>'
    : plansModel?.status === 'loading'
    ? '<span class="tiny-chip">Calculando...</span>'
    : `<span class="tiny-chip">${plans.length} ${plans.length === 1 ? 'plan' : 'planes'}</span>`;
  const enemyOverrideNote = forcedEnemyIndices.length >= 4
    ? `<div class="turn-plan-loading-note turn-plan-loading-note--enemy">
        Rival real fijado: los dos primeros tokens son los leads y los dos ultimos la backline.
        <button class="turn-plan-enemy-reset-btn" type="button">Volver a prediccion</button>
      </div>`
    : '';
  const refreshNote = lockedModel
    ? '<div class="turn-plan-loading-note">Recomendaciones fijadas: puedes probar el plan activo sin que cambie el Top 3 original.<button class="turn-plan-unlock-btn" type="button">Recalcular</button></div>'
    : plansModel?.status === 'loading'
      ? '<div class="turn-plan-loading-note">Actualizando el arbol con las nuevas condiciones de campo, bring y leads.</div>'
      : '';
  const cards = plans.map((plan, index) => renderTurnPlanCard(plan, index, state.uiMode)).join('');

  content.innerHTML = `
    <details class="turn-plans-shell" ${isExpert ? '' : 'open'}>
      <summary class="turn-plans-shell-summary">
        <span>
          <strong>${title}</strong>
          <small>${subtitle}</small>
        </span>
        ${statusChip}
      </summary>
      ${refreshNote}
      ${enemyOverrideNote}
      <div class="turn-plan-list">${cards}</div>
    </details>
  `;

  updateIcons();
}

setTurnPlansRenderCallback(() => {
  renderTurnBranches();
});

function renderSpeedOrderEntry(entry, firstMoverId) {
  const isFirst = entry.id === firstMoverId;
  const sideLabel = entry.side === 'self' ? 'Tu lado' : 'Rival';
  const modifiers = entry.modifiers.length
    ? entry.modifiers.slice(0, 3).map((item) => `<span class="speed-order-chip">${escapeHtml(item.label)}</span>`).join('')
    : '<span class="speed-order-chip">sin boost</span>';
  const ties = entry.tieCandidates.length
    ? `<span class="speed-order-chip speed-order-chip--tie">Tie con ${entry.tieCandidates.map((item) => escapeHtml(item.name)).join(', ')}</span>`
    : '';
  const priority = entry.priorityWindows
    .filter((item) => item.priority !== 0)
    .slice(0, 2)
    .map((item) => `<span class="speed-order-chip speed-order-chip--prio">${escapeHtml(item.move)} ${item.priority > 0 ? '+' : ''}${item.priority}</span>`)
    .join('');
  const blocked = entry.blockedPriorityReason
    ? `<span class="speed-order-chip speed-order-chip--blocked">${escapeHtml(entry.blockedPriorityReason)}</span>`
    : '';

  return `
    <article class="speed-order-card ${entry.side === 'self' ? 'speed-order-card--self' : 'speed-order-card--enemy'} ${isFirst ? 'is-first' : ''}">
      <div class="speed-order-rank">${entry.rank}</div>
      <img src="${entry.sprite}" alt="${escapeHtml(entry.name)}" class="speed-order-sprite">
      <div class="speed-order-main">
        <div class="speed-order-name-row">
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${sideLabel}</span>
        </div>
        <div class="speed-order-cause">${escapeHtml(entry.cause)}</div>
        <div class="speed-order-chip-row">
          ${priority}
          ${blocked}
          ${modifiers}
          ${ties}
        </div>
      </div>
      <div class="speed-order-values">
        <strong>${Math.abs(entry.effectiveSpeed)}</strong>
        <span>raw ${entry.rawSpeed}</span>
      </div>
    </article>
  `;
}

export function renderSpeedOrderPanel() {
  const panel = SPEED_ORDER.panel;
  const content = SPEED_ORDER.content;
  if (!panel || !content) return;

  const isSupportedMode = ['quick', 'live', 'expert'].includes(state.uiMode);
  panel.style.display = isSupportedMode ? 'block' : 'none';
  if (!isSupportedMode) return;

  const selfActive = getBranchActiveMons('self');
  const enemyActive = getBranchActiveMons('enemy');
  const model = buildSpeedOrder({
    selfActive,
    enemyActive,
    field: state.field,
  });

  if (!model.entries.length) {
    content.innerHTML = `
      <div class="speed-order-empty">
        <strong>Orden del turno</strong>
        <span>Añade activos en ambos lados para calcular quien mueve antes.</span>
      </div>
    `;
    return;
  }

  const firstMoverId = model.firstMover?.id || null;
  const fieldChips = [
    model.field.trickRoom ? 'Trick Room' : null,
    model.field.weather ? `Clima: ${model.field.weather}` : null,
    model.field.terrain ? `Terreno: ${model.field.terrain}` : null,
    model.field.tailwindSelf ? 'Tu Tailwind' : null,
    model.field.tailwindEnemy ? 'Tailwind rival' : null,
  ].filter(Boolean);

  content.innerHTML = `
    <details class="speed-order-sheet" open>
      <summary class="speed-order-summary">
        <span>
          <strong>Orden del turno</strong>
          <small>Quien mueve antes y por que.</small>
        </span>
        <span class="tiny-chip">${model.entries.length} slots</span>
      </summary>
      <div class="speed-order-field-row">
        ${fieldChips.length ? fieldChips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('') : '<span>Campo neutral</span>'}
      </div>
      <div class="speed-order-list">
        ${model.entries.map((entry) => renderSpeedOrderEntry(entry, firstMoverId)).join('')}
      </div>
    </details>
  `;
}

export function renderThreats() {
  const enemy = getFocusedTeam('enemy');

  if (!enemy.length) {
    ANALYSIS.threatList.innerHTML = `<div class="empty">Añade un rival para activar el semáforo.</div>`;
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

  ANALYSIS.threatList.innerHTML = html;

  updateIcons();
}

/**
 * Depende directamente del resultado `rows` generado por `getRows()` en matrix.
 * @param {Array} rows - Array de objetos devuelto por getRows()
 */
export function renderOpportunities(rows) {
  if (state.matrixMode === "defensive") {
    ANALYSIS.opportunityList.innerHTML = `<div class="muted-small">Las oportunidades ofensivas solo aplican en vista ofensiva.</div>`;
    return;
  }

  // Extraer todas las interacciones fuertes (mult >= 2)
  const allStrongHits = rows
    .flatMap((r) => r.cells)
    .filter((x) => x.mult >= 2)
    .sort((a, b) => b.mult - a.mult);

  if (!allStrongHits.length) {
    ANALYSIS.opportunityList.innerHTML = `<div class="empty">No hay ventanas de presión clara todavía.</div>`;
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

  ANALYSIS.opportunityList.className = "target-lock-board";

  ANALYSIS.opportunityList.innerHTML = topTargets.map(target => {
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
             const koChipsHtml = renderKoConditionChips(evaluateKoConditions(hit.attacker, hit.defender, hit, {
               attackerSide: 'self',
               defenderSide: 'enemy',
               field: state.field,
               maxVisible: 3,
             }), { compact: true });
             return `
               <div class="target-execution-row">
                 <img src="${hit.attacker.sprite}" class="sprite-micro" title="${hit.attacker.displayName}">
                 <div style="display:grid; gap:4px; min-width:0;">
                   <div style="display:flex; align-items:center; gap:4px; min-width:0;">
                     <span class="target-move-name">${getTranslation(hit.move, "move") || hit.type}</span>
                     <div class="type-icon-circle" style="position: static; width:14px; height:14px; background-color: ${typeMeta.color};"></div>
                     ${getEffectivenessBadgeHtml(hit.mult)}
                   </div>
                   ${koChipsHtml}
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

export function renderStrategies() {
  const enemy = state.enemy.filter(Boolean);
  const strategies = inferStrategies(enemy);

  if (!strategies.length) {
    ANALYSIS.strategyList.innerHTML = `<div class="empty">Sin datos para inferir estrategias.</div>`;
    return;
  }

  ANALYSIS.strategyList.style.display = "grid";
  ANALYSIS.strategyList.style.gridTemplateColumns = "repeat(auto-fit, minmax(140px, 1fr))";
  ANALYSIS.strategyList.style.gap = "8px";

  ANALYSIS.strategyList.innerHTML = strategies
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

export function renderSpeedTiers() {
  const speedTierList = ANALYSIS.speedTierList;
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
    const evsSpe = getResolvedEvs(item.mon).spe;
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

    return { ...item, spe, rawSpe, baseSpe, hasPriority, modReason, ringColor };
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
                  <div class="stat-base">Base ${item.baseSpe}</div>
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
            <div class="stat-base">Base ${item.baseSpe}</div>
          </div>
        </div>
      `;
    }
  });

  html += `</div>`;
  speedTierList.innerHTML = html;

  // Toggle buttons (estos se mantienen resolviendo dinamicamente pues dependen de estado, pero son fijos)
  const toggleTailwindSelfBtn = document.getElementById("toggleTailwindSelfBtn");
  if(toggleTailwindSelfBtn) toggleTailwindSelfBtn.className = `btn small ${state.field.tailwindSelf ? "blue" : "ghost"}`;
  
  const toggleTailwindEnemyBtn = document.getElementById("toggleTailwindEnemyBtn");
  if(toggleTailwindEnemyBtn) toggleTailwindEnemyBtn.className = `btn small ${state.field.tailwindEnemy ? "red" : "ghost"}`;
  
  const toggleTrickRoomBtn = document.getElementById("toggleTrickRoomBtn");
  if(toggleTrickRoomBtn) toggleTrickRoomBtn.className = `btn small ${state.field.trickRoom ? "gold" : "ghost"}`;

  renderSpeedOrderPanel();
  updateIcons();
}

export function renderDefensiveAlerts() {
  const alertList = ANALYSIS.defensiveAlertFloat;
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
