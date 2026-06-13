import { createBattleSnapshotFromAppState } from '../battle/snapshot.js';
import {
  BATTLE_RULES_VERSION,
  DATA_VERSION,
  stableStringify,
} from '../battle/snapshot.js';
import { WEATHER_LABELS, TERRAIN_LABELS } from '../core/constants.js';
import {
  buildSnapshotCacheKey,
  buildVersionedCacheKey,
} from '../battle/cache-keys.js';
import {
  buildTacticalSummary,
  findingsToHomeChips,
  findingsToQuickHighlights,
  findingsToThreatRows,
} from './tactical-findings-adapter.js';

export const PRODUCT_ADAPTERS_VERSION = 'product-adapters-v2';
export const PRODUCT_ADAPTERS_PERF_VERSION = 'product-adapters-memo-v1';

const ADAPTER_CACHE_LIMIT = 48;
const adapterCache = new Map();
const adapterStats = {
  hits: 0,
  misses: 0,
  evictions: 0,
};

function deepClone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function trimAdapterCache() {
  while (adapterCache.size > ADAPTER_CACHE_LIMIT) {
    let oldestKey = null;
    let oldestAt = Infinity;
    adapterCache.forEach((entry, key) => {
      const accessedAt = Number(entry?.lastAccessedAt || 0);
      if (accessedAt < oldestAt) {
        oldestAt = accessedAt;
        oldestKey = key;
      }
    });
    if (!oldestKey) break;
    adapterCache.delete(oldestKey);
    adapterStats.evictions += 1;
  }
}

function buildAdapterCacheKey(scope, snapshot, options = {}, extra = {}) {
  const snapshotKey = buildSnapshotCacheKey(snapshot, {
    adapter: scope,
  });
  return buildVersionedCacheKey({
    scope: `product-adapter:${scope}`,
    snapshot,
    snapshotKey,
    rulesVersion: BATTLE_RULES_VERSION,
    dataVersion: DATA_VERSION,
    context: {
      adapterVersion: PRODUCT_ADAPTERS_VERSION,
      perfVersion: PRODUCT_ADAPTERS_PERF_VERSION,
      options: stableStringify({
        highlightLimit: options.highlightLimit,
        threatLimit: options.threatLimit,
        responseLimit: options.responseLimit,
        minThreatSeverity: options.minThreatSeverity,
        includeActionEvidence: options.includeActionEvidence,
        includeGraph: options.includeGraph,
        phase: options.phase,
      }),
      extra,
    },
  });
}

function readCachedModel(key) {
  const cached = adapterCache.get(key);
  if (!cached) {
    adapterStats.misses += 1;
    return null;
  }
  cached.lastAccessedAt = Date.now();
  adapterStats.hits += 1;
  const model = deepClone(cached.model);
  model.debug = {
    ...(model.debug || {}),
    cacheHit: true,
    perfVersion: PRODUCT_ADAPTERS_PERF_VERSION,
  };
  return model;
}

function writeCachedModel(key, model) {
  const next = {
    model: deepClone({
      ...model,
      debug: {
        ...(model.debug || {}),
        cacheHit: false,
        perfVersion: PRODUCT_ADAPTERS_PERF_VERSION,
      },
    }),
    lastAccessedAt: Date.now(),
  };
  adapterCache.set(key, next);
  trimAdapterCache();
  return deepClone(next.model);
}

function clampLimit(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function buildSnapshot(appState = {}, options = {}) {
  return createBattleSnapshotFromAppState(appState, {
    selfTeam: options.selfTeam || appState.self || [],
    enemyTeam: options.enemyTeam || appState.enemy || [],
    field: options.field || appState.field || {},
    activeSelfSlots: options.activeSelfSlots || appState.activeSelfSlots || appState.leads?.self || [0, 1],
    activeEnemySlots: options.activeEnemySlots || appState.activeEnemySlots || appState.leads?.enemy || [0, 1],
    turn: options.turn || appState.turn1Battle?.turn || 1,
    phase: options.phase || 'product-adapter',
    source: options.source || PRODUCT_ADAPTERS_VERSION,
  });
}

function sideLabel(side) {
  return side === 'enemy' ? 'Rival' : side === 'self' ? 'Tu lado' : 'Mesa';
}

function importantFindings(summary, options = {}) {
  const rows = summary.threatRows || [];
  const limit = clampLimit(options.limit, 8);
  return rows
    .filter((row) => options.side ? row.side === options.side : true)
    .slice(0, limit);
}

function splitThreatLayers(rows = []) {
  return {
    individual: rows.filter((row) => row.scope === 'individual'),
    pair: rows.filter((row) => row.scope === 'pair'),
    core: rows.filter((row) => row.scope === 'global'),
    wincon: rows.filter((row) => row.scope === 'wincon'),
  };
}

function teamCount(team = []) {
  return (team || []).filter(Boolean).length;
}

function compactMonFromIndex(team = [], index, role = '') {
  const mon = team?.[index] || null;
  if (!mon) return null;
  return {
    index,
    id: mon.id || mon.name || mon.displayName || `slot-${index}`,
    name: mon.displayName || mon.name || `Slot ${index + 1}`,
    sprite: mon.sprite || '',
    role,
  };
}

function resolveHomePlan(appState = {}, options = {}) {
  const selectedId = appState.turnPlanSelection?.planId || options.selectedPlanId || null;
  const lockedPlans = appState.turnPlanSelection?.stablePlans || [];
  const currentPlans = options.currentPlans || [];
  const sourcePlans = lockedPlans.length ? lockedPlans : currentPlans;
  if (sourcePlans.length) {
    return sourcePlans.find((plan) => plan.id === selectedId) || sourcePlans[0];
  }
  return null;
}

function compactPlanForHome(plan = null, appState = {}) {
  if (!plan) return null;
  const selfBringIndices = (plan.selfBringIndices || []).slice(0, 4);
  const selfLeadIndices = (plan.selfLeadIndices || selfBringIndices.slice(0, 2)).slice(0, 2);
  const selfBackIndices = (plan.selfBackIndices || selfBringIndices.filter((idx) => !selfLeadIndices.includes(idx))).slice(0, 2);
  const enemyBringIndices = (plan.enemyBringIndices || []).slice(0, 4);
  const enemyLeadIndices = (plan.enemyLeadIndices || enemyBringIndices.slice(0, 2)).slice(0, 2);
  const enemyBackIndices = (plan.enemyBackIndices || enemyBringIndices.filter((idx) => !enemyLeadIndices.includes(idx))).slice(0, 2);
  return {
    id: plan.id || '',
    source: 'turn-plan',
    headline: plan.headline || plan.tacticalSignature || 'Linea estable',
    fieldSummary: plan.fieldSummary || 'Campo neutro',
    score: Number.isFinite(plan.score) ? plan.score : null,
    confidence: Number.isFinite(plan.confidence) ? plan.confidence : null,
    riskLevel: plan.riskLevel || 'medium',
    selected: appState.turnPlanSelection?.planId === plan.id,
    selfBringIndices,
    selfLeadIndices,
    selfBackIndices,
    enemyBringIndices,
    enemyLeadIndices,
    enemyBackIndices,
    bring: (plan.bring || selfBringIndices.map((idx) => compactMonFromIndex(appState.self, idx))).filter(Boolean).slice(0, 4),
    leads: (plan.leads || selfLeadIndices.map((idx) => compactMonFromIndex(appState.self, idx, 'lead'))).filter(Boolean).slice(0, 2),
    backline: (plan.backs || selfBackIndices.map((idx) => compactMonFromIndex(appState.self, idx, 'back'))).filter(Boolean).slice(0, 2),
    enemyBring: (plan.predictedEnemyBring || enemyBringIndices.map((idx) => compactMonFromIndex(appState.enemy, idx))).filter(Boolean).slice(0, 4),
    enemyLeads: (plan.predictedEnemyLeads || enemyLeadIndices.map((idx) => compactMonFromIndex(appState.enemy, idx, 'lead'))).filter(Boolean).slice(0, 2),
    actions: (plan.mainLine?.actions || []).slice(0, 2),
    previewBadges: (plan.previewBadges || []).slice(0, 4),
    findings: (plan.tacticalFindings || []).slice(0, 3),
    unsupportedMechanics: (plan.unsupportedMechanics || []).slice(0, 3),
  };
}

function compactLegacyBring(appState = {}) {
  const chosen = appState.chosenFour?.length >= 4
    ? appState.chosenFour.slice(0, 4)
    : (appState.combos?.[0]?.orderedIdx || appState.combos?.[0]?.indices || []).slice(0, 4);
  if (chosen.length < 4) return null;
  const leadSeed = appState.leads?.self?.length
    ? appState.leads.self
    : (appState.combos?.[0]?.leads || chosen.slice(0, 2));
  const leads = leadSeed.filter((idx) => chosen.includes(idx)).slice(0, 2);
  const backs = chosen.filter((idx) => !leads.includes(idx)).slice(0, 2);
  return {
    id: 'legacy-combo',
    source: 'legacy-combo',
    headline: 'Bring recomendado listo',
    fieldSummary: 'Campo actual',
    score: Number.isFinite(appState.combos?.[0]?.score) ? Math.round(appState.combos[0].score) : null,
    confidence: null,
    riskLevel: 'medium',
    selected: appState.chosenFour?.length >= 4,
    selfBringIndices: chosen,
    selfLeadIndices: leads,
    selfBackIndices: backs,
    enemyBringIndices: appState.chosenEnemyFour?.slice(0, 4) || [],
    enemyLeadIndices: appState.leads?.enemy?.slice(0, 2) || [],
    enemyBackIndices: [],
    bring: chosen.map((idx, index) => compactMonFromIndex(appState.self, idx, index < 2 ? 'lead' : 'back')).filter(Boolean),
    leads: leads.map((idx) => compactMonFromIndex(appState.self, idx, 'lead')).filter(Boolean),
    backline: backs.map((idx) => compactMonFromIndex(appState.self, idx, 'back')).filter(Boolean),
    enemyBring: (appState.chosenEnemyFour || []).slice(0, 4).map((idx, index) => compactMonFromIndex(appState.enemy, idx, index < 2 ? 'lead' : 'back')).filter(Boolean),
    enemyLeads: (appState.leads?.enemy || []).slice(0, 2).map((idx) => compactMonFromIndex(appState.enemy, idx, 'lead')).filter(Boolean),
    actions: [],
    previewBadges: [],
    findings: [],
    unsupportedMechanics: [],
  };
}

function fieldLabel(field = {}) {
  const labels = [];
  if (field.weather) labels.push(`Clima: ${WEATHER_LABELS[field.weather] || field.weather}`);
  if (field.terrain) labels.push(`Terreno: ${TERRAIN_LABELS[field.terrain] || field.terrain}`);
  if (field.trickRoom) labels.push('Trick Room');
  if (field.tailwindSelf) labels.push('Tu Tailwind');
  if (field.tailwindEnemy) labels.push('Tailwind rival');
  return labels.length ? labels.join(' / ') : 'Campo neutro';
}

function buildHomeAction(appState = {}, recommendedPlan = null, status = {}) {
  if (!status.readyForPreview) {
    return {
      kind: 'complete-teams',
      label: status.selfCount < 6 ? 'Completar mi equipo' : 'Completar rival',
      title: `${status.selfCount + status.enemyCount}/12 slots cargados`,
    };
  }
  if (recommendedPlan?.id && !recommendedPlan.selected) {
    return {
      kind: 'use-recommended-plan',
      planId: recommendedPlan.id,
      label: 'Usar plan',
      title: recommendedPlan.headline || 'Plan recomendado listo',
    };
  }
  if (appState.chosenFour?.length >= 4) {
    return {
      kind: 'open-simulator',
      label: 'Simular T1',
      title: 'Plan activo preparado',
    };
  }
  return {
    kind: 'scroll-plans',
    label: 'Ver Top 3',
    title: 'Elige una linea de salida',
  };
}

function aggregateConfidence(plan = null, highlights = []) {
  if (Number.isFinite(plan?.confidence)) {
    return { value: plan.confidence, level: plan.confidence >= 0.72 ? 'high' : plan.confidence >= 0.55 ? 'medium' : 'low' };
  }
  const values = highlights
    .map((item) => Number(item?.confidence?.value))
    .filter(Number.isFinite);
  if (!values.length) return { value: null, level: 'unknown' };
  const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
  return { value: Number(avg.toFixed(2)), level: avg >= 0.72 ? 'high' : avg >= 0.55 ? 'medium' : 'low' };
}

export function summarizeMatrixRows(rows = []) {
  const flat = (rows || []).flatMap((row) => row.cells || []);
  if (!flat.length) {
    return {
      cross: 0,
      ohkos: 0,
      pressure: 0,
      walls: 0,
      headline: 'Matrix lista cuando completes equipos',
    };
  }
  let ohkos = 0;
  let pressure = 0;
  let walls = 0;
  flat.forEach((cell) => {
    if (cell.ohko || cell.ohkoProb >= 50) ohkos += 1;
    else if ((cell.mult || 0) >= 2) pressure += 1;
    if ((cell.mult || 0) <= 0.5 || cell.blocked) walls += 1;
  });
  const topCell = [...flat].sort((a, b) => {
    const left = Number(b.maxPct ?? b.damage?.maxPct ?? b.ohkoProb ?? 0);
    const right = Number(a.maxPct ?? a.damage?.maxPct ?? a.ohkoProb ?? 0);
    return left - right;
  })[0] || null;
  return {
    cross: flat.length,
    ohkos,
    pressure,
    walls,
    headline: ohkos ? `${ohkos} KO claros en matrix` : pressure ? `${pressure} cruces de presion` : `${walls} muros/inmunidades`,
    topTarget: topCell ? {
      attacker: topCell.attacker?.displayName || topCell.attacker?.name || topCell.attackerName || null,
      defender: topCell.defender?.displayName || topCell.defender?.name || topCell.defenderName || null,
      move: topCell.move || topCell.moveName || null,
      maxPct: Number(topCell.maxPct ?? topCell.damage?.maxPct ?? 0) || null,
      mult: topCell.mult ?? null,
    } : null,
  };
}

function summarizeTurnOne(plan = null) {
  const actions = (plan?.actions || []).slice(0, 2);
  return {
    ready: actions.length > 0,
    actions,
    headline: actions.length
      ? actions.map((action) => action.move || action.effectClass || 'Accion').filter(Boolean).slice(0, 2).join(' + ')
      : 'El turno 1 se activa al fijar un plan',
  };
}

export function buildHomeTacticalModel(appState = {}, options = {}) {
  const startedAt = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  const snapshot = buildSnapshot(appState, { ...options, phase: 'home' });
  const planIds = (options.currentPlans || []).slice(0, 3).map((plan) => `${plan.id}:${plan.score}:${plan.confidence}`).join('|');
  const matrixRows = options.matrixRows || [];
  const matrixSummary = options.matrixSummary || null;
  const cacheKey = buildAdapterCacheKey('home', snapshot, options, {
    planIds,
    matrixRows: (matrixRows || []).length,
    matrixSummary: matrixSummary
      ? stableStringify({
        cross: matrixSummary.cross,
        ohkos: matrixSummary.ohkos,
        pressure: matrixSummary.pressure,
        walls: matrixSummary.walls,
        headline: matrixSummary.headline,
      })
      : null,
    selectedPlanId: appState.turnPlanSelection?.planId || null,
    chosenFour: (appState.chosenFour || []).join(','),
    chosenEnemyFour: (appState.chosenEnemyFour || []).join(','),
  });
  const cached = readCachedModel(cacheKey);
  if (cached) return cached;

  const summary = buildTacticalSummary(snapshot, {
    highlightLimit: options.highlightLimit || 12,
    minThreatSeverity: options.minThreatSeverity || 'medium',
    includeActionEvidence: options.includeActionEvidence ?? false,
    includeGraph: options.includeGraph ?? true,
  });
  const rawAdvantages = [
    ...(summary.bySide.self || []),
    ...(summary.bySide.global || []),
  ];
  const rawRisks = summary.bySide.enemy || [];
  const advantages = findingsToHomeChips(rawAdvantages, { limit: 2 });
  const risks = findingsToHomeChips(rawRisks, { limit: 2 });
  const topThreats = findingsToThreatRows(rawRisks, { minSeverity: options.minThreatSeverity || 'medium' }).slice(0, 3);
  const plan = compactPlanForHome(resolveHomePlan(appState, options), appState) || compactLegacyBring(appState);
  const status = {
    selfCount: teamCount(appState.self),
    enemyCount: teamCount(appState.enemy),
    readyForPlans: teamCount(appState.self) >= 4 && teamCount(appState.enemy) >= 4,
    readyForPreview: teamCount(appState.self) >= 6 && teamCount(appState.enemy) >= 6,
    chosen: appState.chosenFour?.length || 0,
  };
  const confidence = aggregateConfidence(plan, [...advantages, ...risks]);
  const verdict = !status.readyForPlans
    ? 'Carga equipos para leer el matchup'
    : plan?.headline || risks[0]?.label || advantages[0]?.label || 'Matchup listo para decidir';

  const computedModel = {
    schema: 'home-tactical-model-v1',
    version: PRODUCT_ADAPTERS_VERSION,
    snapshot,
    status,
    verdict,
    summary,
    advantages,
    risks,
    recommendedPlan: plan,
    recommendedBring: plan?.bring || [],
    leads: plan?.leads || [],
    backline: plan?.backline || [],
    fieldContext: {
      label: fieldLabel(appState.field || {}),
      raw: deepClone(appState.field || {}),
    },
    confidence,
    unsupportedMechanics: [
      ...(summary.summary?.unsupported || []),
      ...(plan?.unsupportedMechanics || []),
    ].slice(0, 4),
    topThreats,
    matrixSummary: matrixSummary || summarizeMatrixRows(matrixRows),
    turn1Preview: summarizeTurnOne(plan),
    action: buildHomeAction(appState, plan, status),
    debug: {
      cacheKey,
      adapter: 'home',
      durationMs: Math.round((typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()) - startedAt),
    },
  };

  return writeCachedModel(cacheKey, computedModel);
}

export function buildQuickModeProductModel(appState = {}, options = {}) {
  const snapshot = buildSnapshot(appState, { ...options, phase: 'quick' });
  const cacheKey = buildAdapterCacheKey('quick', snapshot, options);
  const cached = readCachedModel(cacheKey);
  if (cached) return cached;
  const summary = buildTacticalSummary(snapshot, {
    highlightLimit: options.highlightLimit || 10,
    minThreatSeverity: options.minThreatSeverity || 'medium',
    includeActionEvidence: options.includeActionEvidence ?? false,
    includeGraph: options.includeGraph ?? true,
  });
  return writeCachedModel(cacheKey, {
    schema: 'quick-product-model-v1',
    version: PRODUCT_ADAPTERS_VERSION,
    snapshot,
    summary,
    engines: summary.highlights.filter((item) => ['global', 'pair', 'wincon'].includes(item.scope)),
    threats: importantFindings(summary, { side: 'enemy', limit: options.threatLimit || 8 }),
    responses: summary.highlights
      .filter((item) => item.response)
      .slice(0, options.responseLimit || 5)
      .map((item) => ({ id: item.id, label: item.response, family: item.family, confidence: item.confidence })),
  });
}

export function buildThreatAnalysisProductModel(appState = {}, options = {}) {
  const snapshot = buildSnapshot(appState, { ...options, phase: 'threat-analysis' });
  const cacheKey = buildAdapterCacheKey('threat-analysis', snapshot, options);
  const cached = readCachedModel(cacheKey);
  if (cached) return cached;
  const summary = buildTacticalSummary(snapshot, {
    highlightLimit: options.highlightLimit || 14,
    minThreatSeverity: options.minThreatSeverity || 'medium',
    includeActionEvidence: options.includeActionEvidence ?? false,
    includeGraph: options.includeGraph ?? true,
  });
  const enemyFindings = summary.bySide.enemy || [];
  const rows = enemyFindings.length
    ? findingsToThreatRows(enemyFindings, { minSeverity: options.minThreatSeverity || 'medium' })
    : summary.threatRows;
  return writeCachedModel(cacheKey, {
    schema: 'threat-analysis-product-model-v1',
    version: PRODUCT_ADAPTERS_VERSION,
    snapshot,
    summary,
    rows,
    layers: splitThreatLayers(rows.length ? rows : summary.threatRows),
  });
}

export function buildTurn1ProductModel(appState = {}, options = {}) {
  const snapshot = buildSnapshot(appState, {
    ...options,
    phase: appState.turn1Battle?.active ? 'turn1-live' : 'turn1-preview',
  });
  const cacheKey = buildAdapterCacheKey('turn1', snapshot, options, {
    active: !!appState.turn1Battle?.active,
  });
  const cached = readCachedModel(cacheKey);
  if (cached) return cached;
  const summary = buildTacticalSummary(snapshot, {
    highlightLimit: options.highlightLimit || 8,
    minThreatSeverity: options.minThreatSeverity || 'medium',
    includeActionEvidence: options.includeActionEvidence ?? true,
    includeGraph: options.includeGraph ?? false,
  });
  const highlights = (summary.highlights || []).slice(0, options.highlightLimit || 8);
  return writeCachedModel(cacheKey, {
    schema: 'turn1-product-model-v1',
    version: PRODUCT_ADAPTERS_VERSION,
    snapshot,
    summary,
    highlights,
    enemyThreats: highlights.filter((item) => item.side === 'enemy'),
    selfEngines: highlights.filter((item) => item.side === 'self'),
    fieldWarnings: highlights.filter((item) => item.scope === 'global'),
  });
}

export function annotateTurnPlanWithProductFindings(plan = {}, tacticalSummary = null, options = {}) {
  const findings = tacticalSummary?.highlights || tacticalSummary?.summary?.highlights || [];
  const relevant = findings
    .filter((finding) => {
      if (!finding) return false;
      if (finding.side === 'enemy') return true;
      return ['global', 'pair', 'wincon'].includes(finding.scope);
    })
    .slice(0, options.limit || 4);
  return {
    ...plan,
    tacticalFindings: relevant,
    unsupportedMechanics: tacticalSummary?.summary?.unsupported || tacticalSummary?.unsupported || [],
    confidenceNotes: relevant.map((finding) => ({
      family: finding.family,
      level: finding.confidence?.level || 'medium',
      value: finding.confidence?.value ?? null,
      label: `${sideLabel(finding.side)}: ${finding.label}`,
    })),
  };
}

export function clearProductAdapterMemo() {
  adapterCache.clear();
  adapterStats.hits = 0;
  adapterStats.misses = 0;
  adapterStats.evictions = 0;
}

export function getProductAdapterCacheStats() {
  return {
    version: PRODUCT_ADAPTERS_PERF_VERSION,
    size: adapterCache.size,
    limit: ADAPTER_CACHE_LIMIT,
    ...adapterStats,
  };
}

export default {
  PRODUCT_ADAPTERS_VERSION,
  annotateTurnPlanWithProductFindings,
  buildHomeTacticalModel,
  buildQuickModeProductModel,
  buildThreatAnalysisProductModel,
  buildTurn1ProductModel,
  clearProductAdapterMemo,
  getProductAdapterCacheStats,
  summarizeMatrixRows,
};
