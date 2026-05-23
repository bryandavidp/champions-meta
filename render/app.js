// render/app.js
// Responsabilidad: Core UI Bootstrap. Modos de UI, renderAll(), orquestación principal.

import { state } from '../core/state.js';
import { HOME, LIVE, QUICK, UI_MODES } from '../core/dom.js';
import { UIMODE_KEY } from '../core/constants.js';
import { flowLog } from '../utils/debug.js';
import { renderDock } from './dock.js';
import { getRows, renderMatrix } from '../matrix/render.js';
import { renderThreats, renderOpportunities, renderStrategies, renderSpeedTiers, renderDefensiveAlerts, renderTurnBranches, renderSpeedOrderPanel, getCurrentTurnPlansForHome } from './analysis.js';
import { buildHomeTacticalModel, summarizeMatrixRows } from '../analysis/product-adapters.js';
import { createProductRuntime } from '../analysis/product-runtime.js';
import {
  evaluateAllCombos,
  renderTurn1Simulator,
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

const homeMatrixRuntime = createProductRuntime({
  scope: 'home-matrix-summary',
  limit: 18,
  isMobileMainThreadBlocked: () => (
    typeof window !== 'undefined'
    && state.uiMode === 'quick'
    && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 760)
  ),
});

export function updateIcons() {
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stableUiSignature(value) {
  return JSON.stringify(value, Object.keys(value || {}).sort());
}

function monMatrixSignature(mon) {
  if (!mon) return 'empty';
  return JSON.stringify({
    name: mon.name,
    displayName: mon.displayName,
    ability: mon.set?.ability || mon.ability || '',
    item: mon.set?.item || mon.item || '',
    moves: mon.set?.moves || [],
    hpPct: mon.battle?.hpPct ?? 100,
    status: mon.battle?.status || 'none',
    fainted: !!mon.fainted,
  });
}

function fieldMatrixSignature(field = {}) {
  return stableUiSignature({
    weather: field.weather || null,
    terrain: field.terrain || null,
    trickRoom: !!field.trickRoom,
    tailwindSelf: !!field.tailwindSelf,
    tailwindEnemy: !!field.tailwindEnemy,
    reflectSelf: !!field.reflectSelf,
    reflectEnemy: !!field.reflectEnemy,
    lightScreenSelf: !!field.lightScreenSelf,
    lightScreenEnemy: !!field.lightScreenEnemy,
    auroraVeilSelf: !!field.auroraVeilSelf,
    auroraVeilEnemy: !!field.auroraVeilEnemy,
    quickGuardSelf: !!field.quickGuardSelf,
    quickGuardEnemy: !!field.quickGuardEnemy,
    wideGuardSelf: !!field.wideGuardSelf,
    wideGuardEnemy: !!field.wideGuardEnemy,
  });
}

function buildHomeMatrixCacheKey() {
  return [
    'home-matrix-summary-v1',
    state.uiMode,
    state.matrixMode,
    state.self.map(monMatrixSignature).join('|'),
    state.enemy.map(monMatrixSignature).join('|'),
    fieldMatrixSignature(state.field),
    (state.chosenFour || []).join(','),
    (state.chosenEnemyFour || []).join(','),
    (state.activeSelfSlots || []).join(','),
    (state.activeEnemySlots || []).join(','),
  ].join('::');
}

function getHomeMatrixSummary(readyForMatrix) {
  if (!readyForMatrix) return null;
  const result = homeMatrixRuntime.computeSync({
    cacheKey: buildHomeMatrixCacheKey(),
    uiMode: state.uiMode,
    allowMainThreadOnMobile: false,
    context: {
      mode: state.matrixMode,
      source: 'renderHomeTacticalShell',
    },
  }, () => summarizeMatrixRows(getRows()));
  return result.data
    ? {
      ...result.data,
      runtime: {
        status: result.status,
        stale: !!result.stale,
        cacheHit: !!result.perf?.cacheHit,
        durationMs: result.perf?.durationMs ?? null,
        skipped: !!result.perf?.skipped,
      },
    }
    : {
      cross: 0,
      ohkos: 0,
      pressure: 0,
      walls: 0,
      headline: result.perf?.skipped ? 'Matrix diferida en movil' : 'Matrix lista cuando completes equipos',
      runtime: {
        status: result.status,
        stale: !!result.stale,
        cacheHit: false,
        durationMs: result.perf?.durationMs ?? null,
        skipped: !!result.perf?.skipped,
      },
    };
}

function isHomeRuntimeDebugEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    return window.location.search.includes('debug=1')
      || window.localStorage?.getItem('championsDebug') === 'true';
  } catch {
    return false;
  }
}

function compactName(value = '') {
  const text = String(value || 'Slot');
  return text.length > 13 ? `${text.slice(0, 12)}.` : text;
}

function tacticalIcon(family = '', side = '') {
  const key = String(family || '').replace(/-/g, '_');
  const map = {
    speed_control: 'wind',
    weather_core: 'cloud-sun',
    terrain_core: 'sparkles',
    fakeout_setup: 'hand',
    redirection_setup: 'shield',
    spread_abuse: 'radio-tower',
    immunity_core: 'shield-check',
    priority_games: 'zap',
    priority_denial: 'shield-alert',
    setup_support: 'sparkles',
    defensive_layering: 'layers',
    individual_threat: 'alert-triangle',
    pair_threat: 'network',
    global_engine: 'activity',
    win_condition: 'flag',
  };
  return map[key] || (side === 'enemy' ? 'alert-triangle' : 'check-circle');
}

function renderHomeSlot(side, index, model) {
  const mon = state[side]?.[index];
  const plan = model?.recommendedPlan || {};
  const leadIndices = side === 'self' ? plan.selfLeadIndices || [] : plan.enemyLeadIndices || [];
  const backIndices = side === 'self' ? plan.selfBackIndices || [] : plan.enemyBackIndices || [];
  const isLead = leadIndices.includes(index);
  const isBack = backIndices.includes(index);
  const enemyThreatSlots = new Set((model?.topThreats || [])
    .map((row) => row.primarySubject?.slot)
    .filter(Number.isFinite));
  const isThreat = side === 'enemy' && enemyThreatSlots.has(index);
  const role = isLead ? 'LEAD' : isBack ? 'BACK' : isThreat ? 'RISK' : '';

  if (!mon) {
    return `
      <button class="home-rail-slot is-empty is-${side}" type="button" data-home-action="pick-empty" data-side="${side}" data-index="${index}" aria-label="Anadir ${side} slot ${index + 1}">
        <span>+</span>
      </button>
    `;
  }

  return `
    <button class="home-rail-slot is-${side} ${isLead ? 'is-lead' : ''} ${isBack ? 'is-back' : ''} ${isThreat ? 'is-threat' : ''}" type="button" data-home-action="edit-slot" data-side="${side}" data-index="${index}" title="${escapeHtml(mon.displayName || mon.name)}">
      <img src="${escapeHtml(mon.sprite || '')}" alt="${escapeHtml(mon.displayName || mon.name)}" loading="lazy">
      <span>${escapeHtml(compactName(mon.displayName || mon.name))}</span>
      ${role ? `<b>${role}</b>` : ''}
    </button>
  `;
}

function renderHomeRail(model) {
  if (!HOME.selfRail || !HOME.enemyRail) return;
  HOME.selfRail.innerHTML = Array.from({ length: 6 }, (_, index) => renderHomeSlot('self', index, model)).join('');
  HOME.enemyRail.innerHTML = Array.from({ length: 6 }, (_, index) => renderHomeSlot('enemy', index, model)).join('');
}

function renderHomeInsightStrip(model) {
  if (!HOME.insightStrip) return;
  const items = [
    ...(model?.advantages || []).map((item) => ({ ...item, kind: 'advantage' })),
    ...(model?.risks || []).map((item) => ({ ...item, kind: 'risk' })),
  ].slice(0, 4);
  if (!items.length) {
    HOME.insightStrip.innerHTML = `
      <span class="home-insight-chip is-empty">
        <i data-lucide="info"></i>
        <span>Completa equipos para activar ventajas y riesgos tacticos.</span>
      </span>
    `;
    return;
  }
  HOME.insightStrip.innerHTML = items.map((item) => `
    <span class="home-insight-chip is-${item.kind} severity-${escapeHtml(item.severity || 'info')}" title="${escapeHtml(item.response || item.label || '')}">
      <i data-lucide="${tacticalIcon(item.family, item.side)}"></i>
      <span>${escapeHtml(item.label || item.family || 'Insight')}</span>
      ${item.confidence?.value ? `<b>${Math.round(item.confidence.value * 100)}%</b>` : ''}
    </span>
  `).join('');
}

function renderConfidenceBadge(confidence = {}) {
  const level = confidence.level || 'unknown';
  const label = Number.isFinite(confidence.value) ? `${Math.round(confidence.value * 100)}%` : 'pendiente';
  return `<span class="ui-badge home-confidence-badge is-${escapeHtml(level)}"><i data-lucide="gauge"></i>${escapeHtml(label)}</span>`;
}

function renderHomeMonToken(mon = {}, side = 'self', role = '') {
  if (!mon?.name) return '';
  return `
    <span class="home-mon-token is-${side}" title="${escapeHtml(mon.name)}">
      ${mon.sprite ? `<img src="${escapeHtml(mon.sprite)}" alt="${escapeHtml(mon.name)}">` : ''}
      <span>${escapeHtml(compactName(mon.name))}</span>
      ${role || mon.role ? `<b>${escapeHtml(String(role || mon.role).toUpperCase())}</b>` : ''}
    </span>
  `;
}

function renderActionPill(action = {}, index = 0) {
  if (!action?.move && !action?.effectClass) {
    return `
      <span class="home-action-pill is-empty">
        <b>#${index + 1}</b>
        <span>Accion pendiente</span>
      </span>
    `;
  }
  const target = action.target || 'Rival';
  const result = action.damageRangeLabel || action.effectivenessLabel || action.outcomeKind || action.effectClass || '';
  return `
    <span class="home-action-pill is-${escapeHtml(action.outcomeKind || action.effectClass || 'damage')}">
      <b>#${index + 1}</b>
      ${action.actorSprite ? `<img src="${escapeHtml(action.actorSprite)}" alt="${escapeHtml(action.actor || '')}">` : ''}
      <strong>${escapeHtml(action.move || action.effectClass || 'Accion')}</strong>
      <i data-lucide="arrow-right"></i>
      <span class="is-enemy">${escapeHtml(compactName(target))}</span>
      ${result ? `<em>${escapeHtml(result)}</em>` : ''}
    </span>
  `;
}

function renderHomeSnapshot(model) {
  if (!HOME.snapshotCard) return;
  const plan = model.recommendedPlan || null;
  const risk = plan?.riskLevel || (model.risks?.[0]?.severity || 'medium');
  const unsupported = (model.unsupportedMechanics || []).length;
  const matrixRuntime = model.matrixSummary?.runtime || {};
  const debugVisible = isHomeRuntimeDebugEnabled();
  const adapterStats = model.debug || {};
  HOME.snapshotCard.innerHTML = `
    <div class="home-card-head">
      <span class="home-section-kicker">Snapshot tactico</span>
      ${renderConfidenceBadge(model.confidence)}
    </div>
    <div class="home-snapshot-main is-${escapeHtml(risk)}">
      <i data-lucide="${plan ? 'crosshair' : 'info'}"></i>
      <strong>${escapeHtml(model.verdict || 'Completa equipos para leer el matchup')}</strong>
    </div>
    <div class="home-snapshot-meta">
      <span class="ui-chip is-field"><i data-lucide="activity"></i>${escapeHtml(model.fieldContext?.label || 'Campo neutro')}</span>
      ${plan?.score !== null && plan?.score !== undefined ? `<span class="ui-chip is-tempo"><i data-lucide="bar-chart-3"></i>Score ${escapeHtml(plan.score)}</span>` : ''}
      ${unsupported ? `<span class="ui-chip is-unknown"><i data-lucide="alert-triangle"></i>${unsupported} parcial</span>` : ''}
      ${debugVisible ? `<span class="home-runtime-debug" title="Runtime home/matrix"><i data-lucide="cpu"></i>${matrixRuntime.cacheHit ? 'hit' : matrixRuntime.skipped ? 'skip' : 'miss'} · ${escapeHtml(matrixRuntime.durationMs ?? adapterStats.durationMs ?? 0)}ms</span>` : ''}
    </div>
  `;
}

function renderHomeFieldRibbon(model) {
  if (!HOME.fieldRibbon) return;
  const field = model.fieldContext?.raw || {};
  const chips = [
    field.weather ? ['cloud-sun', `Clima ${field.weather}`, 'field'] : null,
    field.terrain ? ['sparkles', `Terreno ${field.terrain}`, 'setup'] : null,
    field.trickRoom ? ['timer-reset', 'Trick Room', 'tempo'] : null,
    field.tailwindSelf ? ['wind', 'Tu Tailwind', 'self'] : null,
    field.tailwindEnemy ? ['wind', 'Tailwind rival', 'enemy'] : null,
  ].filter(Boolean);
  HOME.fieldRibbon.innerHTML = chips.length
    ? chips.map(([icon, label, kind]) => `<span class="ui-chip is-${kind}"><i data-lucide="${icon}"></i>${escapeHtml(label)}</span>`).join('')
    : '<span class="ui-chip is-field"><i data-lucide="activity"></i>Campo neutro</span>';
}

function renderHomeRecommendedBring(model) {
  if (!HOME.recommendedBringCard) return;
  const plan = model.recommendedPlan;
  const bring = model.recommendedBring || [];
  HOME.recommendedBringCard.innerHTML = `
    <div class="home-card-head">
      <span class="home-section-kicker">Bring recomendado</span>
      <span class="ui-badge is-self">${bring.length || 0}/4</span>
    </div>
    <div class="home-card-title-row">
      <strong>${escapeHtml(plan?.headline || 'Esperando Top 3')}</strong>
      ${plan?.selected ? '<span class="ui-badge is-selected"><i data-lucide="check-circle"></i>Activo</span>' : ''}
    </div>
    <div class="home-bring-strip">
      ${bring.length ? bring.map((mon, index) => renderHomeMonToken(mon, 'self', index < 2 ? 'lead' : (mon.role || 'back'))).join('') : '<span class="muted-small">Completa equipos para calcular el bring.</span>'}
    </div>
    <button class="ui-action-btn is-self" type="button" data-home-action="${plan?.selected ? 'open-simulator' : plan?.id ? 'use-recommended-plan' : 'scroll-plans'}" ${plan?.id ? `data-plan-id="${escapeHtml(plan.id)}"` : ''}>
      <i data-lucide="${plan?.selected ? 'play' : 'circle-plus'}"></i>
      ${plan?.selected ? 'Abrir simulador' : plan?.id ? 'Usar este plan' : 'Ver Top 3'}
    </button>
  `;
}

function renderHomeLeadPlan(model) {
  if (!HOME.leadPlanCard) return;
  const leads = model.leads || [];
  const backline = model.backline || [];
  const actions = model.turn1Preview?.actions || [];
  HOME.leadPlanCard.innerHTML = `
    <div class="home-card-head">
      <span class="home-section-kicker">Apertura</span>
      <span class="ui-badge is-tempo"><i data-lucide="gamepad-2"></i>T1</span>
    </div>
    <div class="home-lead-row">
      ${leads.length ? leads.map((mon) => renderHomeMonToken(mon, 'self', 'lead')).join('') : '<span class="muted-small">Leads pendientes</span>'}
    </div>
    <div class="home-backline-row">
      ${backline.length ? backline.map((mon) => renderHomeMonToken(mon, 'self', 'back')).join('') : ''}
    </div>
    <div class="home-turn-actions">
      ${(actions.length ? actions : [{}, {}]).slice(0, 2).map((action, index) => renderActionPill(action, index)).join('')}
    </div>
  `;
}

function renderThreatSubject(row = {}) {
  const subject = row.primarySubject || {};
  const mon = Number.isFinite(subject.slot) ? state.enemy?.[subject.slot] : null;
  const name = subject.label || mon?.displayName || mon?.name || row.family || 'Amenaza';
  const sprite = mon?.sprite || '';
  return { name, sprite };
}

function renderHomeThreatLane(model) {
  if (!HOME.threatLane) return;
  const threats = (model.topThreats || []).slice(0, 3);
  HOME.threatLane.innerHTML = `
    <div class="home-card-head">
      <span class="home-section-kicker">Threat lane</span>
      <button class="ui-icon-btn" type="button" data-home-action="open-threats" title="Ver amenazas completas"><i data-lucide="external-link"></i></button>
    </div>
    <div class="home-threat-list">
      ${threats.length ? threats.map((row) => {
        const subject = renderThreatSubject(row);
        return `
          <article class="home-threat-item severity-${escapeHtml(row.severity || 'medium')}">
            ${subject.sprite ? `<img src="${escapeHtml(subject.sprite)}" alt="${escapeHtml(subject.name)}">` : '<i data-lucide="alert-triangle"></i>'}
            <div>
              <strong class="is-enemy">${escapeHtml(compactName(subject.name))}</strong>
              <span>${escapeHtml(row.message || row.family || 'Amenaza relevante')}</span>
              ${row.recommendedResponse ? `<em>${escapeHtml(row.recommendedResponse)}</em>` : ''}
            </div>
            ${row.confidenceValue ? `<b>${Math.round(row.confidenceValue * 100)}%</b>` : ''}
          </article>
        `;
      }).join('') : '<div class="muted-small">Sin amenazas compactas todavia.</div>'}
    </div>
  `;
}

function renderHomeDetailTeasers(model) {
  if (!HOME.detailTeasers) return;
  const matrix = model.matrixSummary || {};
  const turnReady = state.chosenFour?.length >= 4 && !!state.turnPlanSelection?.planId;
  HOME.detailTeasers.innerHTML = `
    <button class="home-detail-teaser is-matrix" type="button" data-home-action="open-matrix">
      <i data-lucide="layout-grid"></i>
      <span><strong>Matrix</strong><small>${escapeHtml(matrix.headline || 'Cruces detallados')}</small></span>
      <b>${matrix.cross || 0}</b>
    </button>
    <button class="home-detail-teaser is-speed" type="button" data-home-action="open-speed-detail">
      <i data-lucide="wind"></i>
      <span><strong>Tempo</strong><small>${escapeHtml(model.fieldContext?.label || 'Orden y campo')}</small></span>
      <b>Ver</b>
    </button>
    <button class="home-detail-teaser is-sim" type="button" data-home-action="${turnReady ? 'open-simulator' : 'scroll-plans'}">
      <i data-lucide="play-circle"></i>
      <span><strong>Simulador T1</strong><small>${turnReady ? 'Plan activo listo' : 'Fija un plan primero'}</small></span>
      <b>${turnReady ? 'Abrir' : 'Plan'}</b>
    </button>
  `;
}

function setHomeChip(el, icon, label) {
  if (!el) return;
  el.innerHTML = `<i data-lucide="${icon}"></i> ${escapeHtml(label)}`;
}

function confidenceLabel(confidence = {}) {
  if (Number.isFinite(confidence.value)) return `${Math.round(confidence.value * 100)}% confianza`;
  return confidence.level === 'unknown' ? 'Lectura pendiente' : `${confidence.level || 'media'} confianza`;
}

export function renderHomeTacticalShell() {
  const turnPlans = getCurrentTurnPlansForHome();
  const readyForMatrix = state.self.filter(Boolean).length >= 2 && state.enemy.filter(Boolean).length >= 2;
  const matrixSummary = getHomeMatrixSummary(readyForMatrix);
  const model = buildHomeTacticalModel(state, {
    currentPlans: turnPlans.plans,
    plansStatus: turnPlans.status,
    matrixSummary,
    highlightLimit: 12,
    threatLimit: 4,
  });

  if (HOME.title) {
    HOME.title.textContent = model.recommendedPlan?.headline || model.verdict || 'Prepara el plan de partida';
  }
  setHomeChip(HOME.fieldChip, 'activity', model.fieldContext?.label || 'Campo neutro');
  setHomeChip(HOME.verdictChip, model.recommendedPlan ? 'crosshair' : 'info', model.verdict || 'Esperando equipos');
  setHomeChip(HOME.confidenceChip, 'gauge', confidenceLabel(model.confidence));
  if (HOME.readyChip) {
    HOME.readyChip.textContent = `${model.status.selfCount + model.status.enemyCount}/12 slots`;
    HOME.readyChip.classList.toggle('is-ready', model.status.readyForPreview);
  }
  renderHomeRail(model);
  renderHomeInsightStrip(model);
  renderHomeSnapshot(model);
  renderHomeFieldRibbon(model);
  renderHomeRecommendedBring(model);
  renderHomeLeadPlan(model);
  renderHomeThreatLane(model);
  renderHomeDetailTeasers(model);

  const showMobileAction = state.uiMode === 'quick' || state.uiMode === 'live';
  if (HOME.mobileActionBar) HOME.mobileActionBar.style.display = showMobileAction ? 'flex' : 'none';
  if (HOME.mobileActionKicker) HOME.mobileActionKicker.textContent = model.recommendedPlan ? 'Plan recomendado' : 'Siguiente paso';
  if (HOME.mobileActionTitle) HOME.mobileActionTitle.textContent = model.action?.title || model.verdict || 'Completa ambos equipos';
  if (HOME.primaryCta) {
    HOME.primaryCta.textContent = model.action?.label || 'Continuar';
    HOME.primaryCta.dataset.homeAction = model.action?.kind || 'complete-teams';
    if (model.action?.planId) HOME.primaryCta.dataset.planId = model.action.planId;
    else delete HOME.primaryCta.dataset.planId;
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
    renderTurnBranches();
    renderSpeedOrderPanel();
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
    renderTurnBranches();
    renderSpeedOrderPanel();
  }

  if (isLive || force) {
    const rows = getRows();
    renderMatrix(rows);
    renderLiveStatePanel();
    renderTurnBranches();
    renderSpeedOrderPanel();
    renderLiveRecommendations();
  }

  renderActiveMatchupStrip();
  renderLiveBattleToolbar();

  if (isBattleFocusActive()) {
    if (LIVE.matchupStrip) LIVE.matchupStrip.style.display = 'flex';
    if (LIVE.battleToolbar) LIVE.battleToolbar.style.display = 'flex';
  }

  renderHomeTacticalShell();
  updateIcons();
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
  document.body.dataset.uiMode = state.uiMode;

  if (QUICK.previewPanel) QUICK.previewPanel.style.display = 'none';
  if (QUICK.combosSection) QUICK.combosSection.style.display = 'none';
  const quickPlanActive = state.chosenFour?.length >= 4 && !!state.turnPlanSelection?.planId;
  if (QUICK.turn1Panel) QUICK.turn1Panel.style.display = isQuick && quickPlanActive ? 'block' : 'none';

  const matrixSection = UI_MODES.matrixSectionTitle?.closest('section');
  if (matrixSection) matrixSection.style.display = hideExpertPanels ? 'none' : 'block';
  if (UI_MODES.insightGrid) UI_MODES.insightGrid.style.display = hideExpertPanels ? 'none' : 'grid';
  if (UI_MODES.defensiveAlertFloat) UI_MODES.defensiveAlertFloat.style.display = hideExpertPanels ? 'none' : 'flex';
  if (UI_MODES.turnBranchesPanel) UI_MODES.turnBranchesPanel.style.display = (isQuick || isLive || state.uiMode === 'expert') ? 'block' : 'none';
}

export function setBatchUpdating(val) {
  isBatchUpdating = val;
}
