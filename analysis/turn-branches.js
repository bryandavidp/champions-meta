import { state } from '../core/state.js';
import {
  BATTLE_RULES_VERSION,
  DATA_VERSION,
  createBattleSnapshot,
} from '../battle/snapshot.js';
import { buildSnapshotCacheKey, buildVersionedCacheKey } from '../battle/cache-keys.js';

const cache = new Map();
const CACHE_LIMIT = 24;
export const TURN_PLANS_PERF_VERSION = 'turn-plans-perf-v1';
let currentKey = '';
let latestEntry = {
  status: 'idle',
  key: '',
  plans: [],
  debug: {},
  stale: false,
};
let requestId = 0;
let requestGeneration = 0;
let activeRequestId = 0;
let currentGeneration = 0;
let worker = null;
let renderCallback = null;
let scheduledRenderFrame = 0;
let mainThreadFallbackPromise = null;
const inflightKeys = new Set();
const requestMetaMap = new Map();
const requestTimeoutMap = new Map();
const PLANNER_TIMEOUT_MS = 9000;

function deepClone(value) {
  return value == null ? value : structuredClone(value);
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function trimCache() {
  while (cache.size > CACHE_LIMIT) {
    let oldestKey = null;
    let oldestAt = Infinity;
    cache.forEach((entry, key) => {
      const accessedAt = Number(entry?.lastAccessedAt || entry?.generatedAt || 0);
      if (accessedAt < oldestAt) {
        oldestAt = accessedAt;
        oldestKey = key;
      }
    });
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function setCacheEntry(key, entry) {
  const next = {
    ...entry,
    key,
    perfVersion: TURN_PLANS_PERF_VERSION,
    lastAccessedAt: Date.now(),
  };
  cache.set(key, next);
  trimCache();
  return next;
}

function getCacheEntry(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  entry.lastAccessedAt = Date.now();
  return entry;
}

function setLatestEntry(entry) {
  latestEntry = {
    status: entry.status || 'idle',
    key: entry.key || '',
    plans: deepClone(entry.plans || []),
    debug: deepClone(entry.debug || {}),
    stale: !!entry.stale,
    error: entry.error || null,
    generatedAt: entry.generatedAt || Date.now(),
    requestId: entry.requestId || 0,
    generation: entry.generation || 0,
    snapshotKey: entry.snapshotKey || null,
    perfVersion: entry.perfVersion || TURN_PLANS_PERF_VERSION,
    perf: deepClone(entry.perf || {}),
  };
}

function scheduleRender() {
  if (typeof renderCallback === 'function') {
    if (scheduledRenderFrame) return;
    scheduledRenderFrame = requestAnimationFrame(() => {
      scheduledRenderFrame = 0;
      renderCallback();
    });
  }
}

function clearRequestTimeout(requestIdValue) {
  const timer = requestTimeoutMap.get(requestIdValue);
  if (timer) {
    clearTimeout(timer);
    requestTimeoutMap.delete(requestIdValue);
  }
}

function releaseRequest(requestIdValue) {
  clearRequestTimeout(requestIdValue);
  requestMetaMap.delete(requestIdValue);
}

function isRequestCurrent(meta, requestIdValue) {
  return !!meta
    && meta.key === currentKey
    && meta.generation === currentGeneration
    && Number(requestIdValue) === Number(activeRequestId);
}

function cancelSupersededRequests(activeKey, generation) {
  [...requestMetaMap.entries()].forEach(([pendingRequestId, meta]) => {
    if (!meta) return;
    if (meta.key === activeKey && meta.generation === generation) return;
    if (meta.generation >= generation) return;
    inflightKeys.delete(meta.key);
    releaseRequest(pendingRequestId);
  });
}

function expireLoadingEntry(key, existing) {
  if (!existing || existing.status !== 'loading') return null;
  if (Date.now() - (existing.generatedAt || 0) <= PLANNER_TIMEOUT_MS) return null;

  inflightKeys.delete(key);
  [...requestMetaMap.entries()].forEach(([pendingRequestId, meta]) => {
    if (meta?.key === key) releaseRequest(pendingRequestId);
  });

  try {
    worker?.terminate();
  } catch {}
  worker = null;

  const expired = {
    status: 'error',
    key,
    plans: deepClone(existing.plans || latestEntry.plans || []),
    debug: {
      ...(existing.debug || latestEntry.debug || {}),
      fallbackReason: 'planner-timeout',
    },
    stale: true,
    error: 'planner-timeout',
    generatedAt: Date.now(),
  };
  setCacheEntry(key, expired);
  return expired;
}

function shouldSkipMainThreadFallback(payload = {}) {
  if (typeof window === 'undefined') return false;
  const mobileLike = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 760;
  return mobileLike && payload.mode === 'quick';
}

async function fallbackToMainThread(key, payload, reason = 'worker-fallback') {
  inflightKeys.delete(key);
  if (shouldSkipMainThreadFallback(payload)) {
    const entry = {
      status: 'error',
      key,
      plans: deepClone(getCacheEntry(key)?.plans || latestEntry.plans || []),
      debug: {
        ...(getCacheEntry(key)?.debug || latestEntry.debug || {}),
        fallbackReason: reason,
        fallbackSkipped: 'mobile-main-thread-protection',
      },
      stale: true,
      error: reason,
      generatedAt: Date.now(),
      snapshotKey: payload.snapshotKey,
    };
    setCacheEntry(key, entry);
    if (currentKey === key) {
      setLatestEntry(entry);
      scheduleRender();
    }
    return;
  }

  try {
    await computeOnMainThread(key, payload);
    const entry = getCacheEntry(key);
    if (entry) {
      setCacheEntry(key, {
        ...entry,
        debug: {
          ...(entry.debug || {}),
          fallbackReason: reason,
        },
      });
      if (currentKey === key) {
        setLatestEntry(getCacheEntry(key));
        scheduleRender();
      }
    }
  } catch (error) {
    const entry = {
      status: 'error',
      key,
      plans: deepClone(getCacheEntry(key)?.plans || latestEntry.plans || []),
      debug: {
        ...(getCacheEntry(key)?.debug || latestEntry.debug || {}),
        fallbackReason: reason,
      },
      stale: true,
      error: error?.message || reason,
      generatedAt: Date.now(),
      snapshotKey: payload.snapshotKey,
    };
    setCacheEntry(key, entry);
    if (currentKey === key) {
      setLatestEntry(entry);
      scheduleRender();
    }
  }
}

function abandonWorker(reason = 'worker-runtime-error') {
  const brokenWorker = worker;
  worker = null;
  try {
    brokenWorker?.terminate();
  } catch {}

  const pending = [...requestMetaMap.entries()];
  pending.forEach(([pendingRequestId, meta]) => {
    releaseRequest(pendingRequestId);
    if (!meta) return;
    fallbackToMainThread(meta.key, meta.payload, reason);
  });
}

function getWorker() {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('./turn-plans-worker.js', import.meta.url), {
      type: 'module',
      name: 'turn-plans-worker',
    });
  } catch (error) {
    try {
      worker = new Worker(new URL('./turn-plans-worker.js', import.meta.url));
    } catch (classicError) {
      console.warn('[turn-plans] Worker unavailable, using main thread fallback.', classicError || error);
      worker = null;
      return null;
    }
  }

  worker.onerror = (event) => {
    console.warn('[turn-plans] Worker crashed, switching to main thread.', event?.message || event);
    abandonWorker(event?.message || 'worker-onerror');
  };

  worker.onmessageerror = () => {
    console.warn('[turn-plans] Worker message error, switching to main thread.');
    abandonWorker('worker-message-error');
  };

  worker.onmessage = (event) => {
    const data = event?.data || {};
    if (!data.requestId) return;
    const meta = requestMetaMap.get(data.requestId);
    if (!meta) return;
    const key = meta.key;

    if (data.type === 'turn-plans-progress') {
      if (!isRequestCurrent(meta, data.requestId)) return;
      clearRequestTimeout(data.requestId);
      requestTimeoutMap.set(data.requestId, setTimeout(() => {
        const currentMeta = requestMetaMap.get(data.requestId);
        if (!currentMeta) return;
        abandonWorker('worker-progress-timeout');
      }, 8000));
      const entry = getCacheEntry(key);
      if (!entry) return;
      const next = {
        ...entry,
        status: 'loading',
        plans: deepClone(data.progress?.plans || entry.plans || []),
        debug: {
          ...(entry.debug || {}),
          ...(data.progress?.debug || {}),
          progressive: true,
          worker: true,
        },
        stale: false,
        requestId: data.requestId,
        generation: meta.generation,
        snapshotKey: meta.payload?.snapshotKey,
      };
      setCacheEntry(key, next);
      if (isRequestCurrent(meta, data.requestId)) {
        setLatestEntry({ ...next, key });
        scheduleRender();
      }
      return;
    }

    if (data.type === 'turn-plans-result') {
      inflightKeys.delete(key);
      releaseRequest(data.requestId);
      const durationMs = Math.round(nowMs() - (meta.startedAt || nowMs()));
      const next = {
        status: 'ready',
        key,
        plans: deepClone(data.result?.plans || []),
        debug: {
          ...(deepClone(data.result?.debug || {})),
          worker: true,
          cacheHit: false,
        },
        stale: false,
        generatedAt: Date.now(),
        requestId: data.requestId,
        generation: meta.generation,
        snapshotKey: meta.payload?.snapshotKey,
        perf: {
          durationMs,
          workerDurationMs: data.result?.debug?.workerDurationMs ?? null,
        },
      };
      setCacheEntry(key, next);
      if (isRequestCurrent(meta, data.requestId)) {
        setLatestEntry(next);
        scheduleRender();
      }
      return;
    }

    if (data.type === 'turn-plans-cancelled') {
      inflightKeys.delete(key);
      releaseRequest(data.requestId);
      return;
    }

    if (data.type === 'turn-plans-error') {
      const { payload } = meta;
      releaseRequest(data.requestId);
      if (!isRequestCurrent(meta, data.requestId)) return;
      fallbackToMainThread(key, payload, data.error || 'worker-error');
    }
  };
  return worker;
}

function monSignature(mon) {
  if (!mon) return 'empty';
  return JSON.stringify({
    name: mon.name,
    displayName: mon.displayName,
    ability: mon.set?.ability || mon.ability || '',
    item: mon.set?.item || mon.item || '',
    moves: mon.set?.moves || [],
    nature: mon.set?.nature || '',
    evs: mon.set?.evs || {},
    hpPct: mon.battle?.hpPct ?? 100,
    status: mon.battle?.status || 'none',
    stages: mon.battle?.stages || {},
    fainted: !!mon.fainted,
  });
}

function fieldSignature(field) {
  return JSON.stringify({
    weather: field?.weather || null,
    weatherTurns: field?.weatherTurns || 0,
    terrain: field?.terrain || null,
    terrainTurns: field?.terrainTurns || 0,
    trickRoom: !!field?.trickRoom,
    trickRoomTurns: field?.trickRoomTurns || 0,
    tailwindSelf: !!field?.tailwindSelf,
    tailwindSelfTurns: field?.tailwindSelfTurns || 0,
    tailwindEnemy: !!field?.tailwindEnemy,
    tailwindEnemyTurns: field?.tailwindEnemyTurns || 0,
    reflectSelf: !!field?.reflectSelf,
    reflectEnemy: !!field?.reflectEnemy,
    lightScreenSelf: !!field?.lightScreenSelf,
    lightScreenEnemy: !!field?.lightScreenEnemy,
    auroraVeilSelf: !!field?.auroraVeilSelf,
    auroraVeilEnemy: !!field?.auroraVeilEnemy,
    hazards: field?.hazards || {},
  });
}

function comboTransport(combo) {
  return {
    indices: [...(combo.indices || [])],
    orderedIdx: [...(combo.orderedIdx || combo.indices || [])],
    leads: [...(combo.leads || [])],
    score: Number(combo.score || 0),
    planType: combo.planType || 'balanceado',
  };
}

function buildPreferredCombo(input) {
  if (Array.isArray(input.preferredOwnCombo)) {
    const preferred = input.preferredOwnCombo.filter(Number.isFinite);
    return preferred.length >= 4 ? preferred.slice(0, 4) : [];
  }
  if (state.chosenFour?.length >= 4) return [...state.chosenFour.slice(0, 4)];
  return [];
}

function normalizeForcedEnemyIndices(input = {}) {
  const source = Array.isArray(input.forcedEnemyIndices)
    ? input.forcedEnemyIndices
    : (state.turnPlanEnemyOverride?.indices || []);
  const out = [];
  source.forEach((idx) => {
    const value = Number(idx);
    if (Number.isFinite(value) && !out.includes(value)) out.push(value);
  });
  return out.length >= 4 ? out.slice(0, 4) : [];
}

function buildPayload(input = {}) {
  const ownCombos = (input.ownCombos || []).map(comboTransport);
  const activeSelfSlots = input.activeSelfSlots || state.activeSelfSlots || state.leads?.self || [0, 1];
  const activeEnemySlots = input.activeEnemySlots || state.activeEnemySlots || state.leads?.enemy || [0, 1];
  const battleSnapshot = createBattleSnapshot({
    selfTeam: input.selfTeam || [],
    enemyTeam: input.enemyTeam || [],
    field: input.field || {},
    activeSelfSlots,
    activeEnemySlots,
    turn: input.turn || state.turn1Battle?.turn || 1,
    phase: input.mode === 'quick' ? 'preview' : 'analysis',
    source: 'turn-plans-build-payload',
    meta: {
      planner: {
        mode: input.mode || state.uiMode || 'quick',
      },
    },
  });
  const snapshotKey = buildSnapshotCacheKey(battleSnapshot, {
    activeSelfSlots,
    activeEnemySlots,
  });
  return {
    mode: input.mode || state.uiMode || 'quick',
    selfTeam: deepClone(input.selfTeam || []),
    enemyTeam: deepClone(input.enemyTeam || []),
    field: deepClone(input.field || {}),
    battleSnapshot,
    snapshotKey,
    rulesVersion: BATTLE_RULES_VERSION,
    dataVersion: DATA_VERSION,
    ownCombos,
    preferredOwnCombo: buildPreferredCombo(input),
    topOwnCombos: Number(input.topOwnCombos || (input.mode === 'quick' ? 3 : 1)),
    topEnemyCombos: Number(input.topEnemyCombos || 3),
    horizon: Number(input.horizon || 2),
    enemyModel: input.enemyModel || 'meta-likely',
    beamWidth: Number(input.beamWidth || 6),
    actionCapPerMon: Number(input.actionCapPerMon || 5),
    displayLimit: Number(input.displayLimit || (input.mode === 'quick' ? 3 : 1)),
    forcedEnemyIndices: normalizeForcedEnemyIndices(input),
  };
}

function buildKey(payload) {
  return buildVersionedCacheKey({
    scope: 'turn-plans',
    snapshot: payload.battleSnapshot,
    snapshotKey: payload.snapshotKey,
    rulesVersion: payload.rulesVersion,
    dataVersion: payload.dataVersion,
    context: {
      mode: payload.mode,
      ownCombos: payload.ownCombos.map((combo) => ({
        indices: combo.indices,
        orderedIdx: combo.orderedIdx,
        leads: combo.leads,
        score: combo.score,
        planType: combo.planType,
      })),
      preferredOwnCombo: payload.preferredOwnCombo,
      topOwnCombos: payload.topOwnCombos,
      topEnemyCombos: payload.topEnemyCombos,
      horizon: payload.horizon,
      enemyModel: payload.enemyModel,
      beamWidth: payload.beamWidth,
      actionCapPerMon: payload.actionCapPerMon,
      displayLimit: payload.displayLimit,
      forcedEnemyIndices: payload.forcedEnemyIndices,
    },
  });
}

async function computeOnMainThread(key, payload) {
  if (!mainThreadFallbackPromise) {
    mainThreadFallbackPromise = import('./turn-plans-engine.js');
  }
  const planner = await mainThreadFallbackPromise;
  const startedAt = nowMs();
  const result = planner.buildTurnPlansSnapshot(payload);
  const entry = {
    status: 'ready',
    key,
    plans: deepClone(result.plans || []),
    debug: {
      ...(deepClone(result.debug || {})),
      worker: false,
      cacheHit: false,
    },
    stale: false,
    generatedAt: Date.now(),
    snapshotKey: payload.snapshotKey,
    perf: {
      durationMs: Math.round(nowMs() - startedAt),
      mainThread: true,
    },
  };
  setCacheEntry(key, entry);
  if (currentKey === key) {
    setLatestEntry(entry);
    scheduleRender();
  }
}

function requestComputation(key, payload) {
  if (inflightKeys.has(key)) return;
  requestGeneration += 1;
  currentGeneration = requestGeneration;
  inflightKeys.add(key);
  cancelSupersededRequests(key, currentGeneration);

  const currentReady = getCacheEntry(key);
  const loadingEntry = {
    status: 'loading',
    key,
    plans: deepClone(currentReady?.plans || latestEntry.plans || []),
    debug: {
      ...(deepClone(currentReady?.debug || latestEntry.debug || {})),
      progressive: true,
      cacheHit: false,
    },
    stale: !!(currentReady?.plans?.length || latestEntry.plans?.length),
    generatedAt: Date.now(),
    generation: currentGeneration,
    snapshotKey: payload.snapshotKey,
  };
  setCacheEntry(key, loadingEntry);
  setLatestEntry(loadingEntry);

  const activeWorker = getWorker();
  if (activeWorker) {
    requestId += 1;
    const currentRequestId = requestId;
    activeRequestId = currentRequestId;
    const workerLoadingEntry = setCacheEntry(key, {
      ...loadingEntry,
      requestId: currentRequestId,
      debug: {
        ...(loadingEntry.debug || {}),
        worker: true,
      },
    });
    setLatestEntry(workerLoadingEntry);
    requestMetaMap.set(currentRequestId, {
      key,
      payload,
      generation: currentGeneration,
      startedAt: nowMs(),
    });
    requestTimeoutMap.set(currentRequestId, setTimeout(() => {
      const meta = requestMetaMap.get(currentRequestId);
      if (!meta) return;
      if (!isRequestCurrent(meta, currentRequestId)) return;
      abandonWorker('worker-timeout');
    }, 8000));
    activeWorker.postMessage({
      type: 'compute-turn-plans',
      requestId: currentRequestId,
      payload,
    });
    return;
  }

  computeOnMainThread(key, payload).catch((error) => {
    inflightKeys.delete(key);
    const entry = {
      status: 'error',
      key,
      plans: deepClone(loadingEntry.plans || []),
      debug: deepClone(loadingEntry.debug || {}),
      stale: true,
      error: error?.message || 'main-thread-planner-error',
      snapshotKey: payload.snapshotKey,
    };
    setCacheEntry(key, entry);
    setLatestEntry(entry);
    scheduleRender();
  });
}

export function setTurnPlansRenderCallback(callback) {
  renderCallback = callback;
}

export function buildTurnPlans(input = {}) {
  const payload = buildPayload(input);
  const key = buildKey(payload);
  currentKey = key;

  const existing = expireLoadingEntry(key, getCacheEntry(key)) || getCacheEntry(key);
  if (existing?.status === 'ready') {
    const hit = setCacheEntry(key, {
      ...existing,
      debug: {
        ...(existing.debug || {}),
        cacheHit: true,
      },
    });
    setLatestEntry(hit);
    return latestEntry;
  }

  if (existing?.status === 'error') {
    setLatestEntry(existing);
    return latestEntry;
  }

  if (!existing || existing.status !== 'loading') {
    requestComputation(key, payload);
  } else {
    setLatestEntry(existing);
  }

  return latestEntry;
}

export function buildTurnBranches(input = {}) {
  const model = buildTurnPlans(input);
  if (!model?.plans?.length) return [];

  return model.plans.map((plan, index) => ({
    id: plan.id || `plan-${index}`,
    score: plan.score || 0,
    label: index === 0 ? 'Plan principal' : `Plan ${index + 1}`,
    style: index === 0 ? 'agresiva' : 'tecnica',
    outcome: plan.why?.[0] || 'Plan de turno',
    actions: {
      self: (plan.mainLine?.actions || []).map((action) => ({
        actor: action.actor,
        move: action.move,
        target: action.target,
        damage: null,
      })),
      enemy: (plan.enemyLikelyResponse?.actions || []).map((action) => ({
        actor: action.actor,
        move: action.move,
        target: action.target,
        damage: null,
      })),
    },
    conditions: plan.why || [],
    invalidators: plan.breakers || [],
    confidence: plan.confidence || 0.5,
  }));
}

export function getTurnPlansCacheEntry() {
  return latestEntry;
}

export function getTurnPlansPerformanceState() {
  return {
    version: TURN_PLANS_PERF_VERSION,
    cacheSize: cache.size,
    cacheLimit: CACHE_LIMIT,
    currentKey,
    currentGeneration,
    activeRequestId,
    inflightCount: inflightKeys.size,
    latestStatus: latestEntry.status,
    latestStale: !!latestEntry.stale,
  };
}
