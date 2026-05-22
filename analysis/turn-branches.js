import { state } from '../core/state.js';

const cache = new Map();
let currentKey = '';
let latestEntry = {
  status: 'idle',
  key: '',
  plans: [],
  debug: {},
  stale: false,
};
let requestId = 0;
let worker = null;
let renderCallback = null;
let mainThreadFallbackPromise = null;
const inflightKeys = new Set();
const requestMetaMap = new Map();
const requestTimeoutMap = new Map();
const PLANNER_TIMEOUT_MS = 9000;

function deepClone(value) {
  return value == null ? value : structuredClone(value);
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
  };
}

function scheduleRender() {
  if (typeof renderCallback === 'function') {
    requestAnimationFrame(() => renderCallback());
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
  cache.set(key, expired);
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
      plans: deepClone(cache.get(key)?.plans || latestEntry.plans || []),
      debug: {
        ...(cache.get(key)?.debug || latestEntry.debug || {}),
        fallbackReason: reason,
        fallbackSkipped: 'mobile-main-thread-protection',
      },
      stale: true,
      error: reason,
      generatedAt: Date.now(),
    };
    cache.set(key, entry);
    if (currentKey === key) {
      setLatestEntry(entry);
      scheduleRender();
    }
    return;
  }

  try {
    await computeOnMainThread(key, payload);
    const entry = cache.get(key);
    if (entry) {
      cache.set(key, {
        ...entry,
        debug: {
          ...(entry.debug || {}),
          fallbackReason: reason,
        },
      });
      if (currentKey === key) {
        setLatestEntry(cache.get(key));
        scheduleRender();
      }
    }
  } catch (error) {
    const entry = {
      status: 'error',
      key,
      plans: deepClone(cache.get(key)?.plans || latestEntry.plans || []),
      debug: {
        ...(cache.get(key)?.debug || latestEntry.debug || {}),
        fallbackReason: reason,
      },
      stale: true,
      error: error?.message || reason,
      generatedAt: Date.now(),
    };
    cache.set(key, entry);
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
      clearRequestTimeout(data.requestId);
      requestTimeoutMap.set(data.requestId, setTimeout(() => {
        const currentMeta = requestMetaMap.get(data.requestId);
        if (!currentMeta) return;
        abandonWorker('worker-progress-timeout');
      }, 8000));
      const entry = cache.get(key);
      if (!entry) return;
      const next = {
        ...entry,
        status: 'loading',
        plans: deepClone(data.progress?.plans || entry.plans || []),
        debug: {
          ...(entry.debug || {}),
          ...(data.progress?.debug || {}),
        },
        stale: false,
      };
      cache.set(key, next);
      if (currentKey === key || latestEntry.status === 'loading') {
        setLatestEntry({ ...next, key });
        scheduleRender();
      }
      return;
    }

    if (data.type === 'turn-plans-result') {
      inflightKeys.delete(key);
      releaseRequest(data.requestId);
      const next = {
        status: 'ready',
        key,
        plans: deepClone(data.result?.plans || []),
        debug: deepClone(data.result?.debug || {}),
        stale: false,
        generatedAt: Date.now(),
      };
      cache.set(key, next);
      if (currentKey === key || latestEntry.status !== 'ready') {
        setLatestEntry(next);
        scheduleRender();
      }
      return;
    }

    if (data.type === 'turn-plans-error') {
      const { payload } = meta;
      releaseRequest(data.requestId);
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
  return {
    mode: input.mode || state.uiMode || 'quick',
    selfTeam: deepClone(input.selfTeam || []),
    enemyTeam: deepClone(input.enemyTeam || []),
    field: deepClone(input.field || {}),
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
  return JSON.stringify({
    mode: payload.mode,
    self: payload.selfTeam.map(monSignature),
    enemy: payload.enemyTeam.map(monSignature),
    field: fieldSignature(payload.field),
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
  });
}

async function computeOnMainThread(key, payload) {
  if (!mainThreadFallbackPromise) {
    mainThreadFallbackPromise = import('./turn-plans-engine.js');
  }
  const planner = await mainThreadFallbackPromise;
  const result = planner.buildTurnPlansSnapshot(payload);
  const entry = {
    status: 'ready',
    key,
    plans: deepClone(result.plans || []),
    debug: deepClone(result.debug || {}),
    stale: false,
    generatedAt: Date.now(),
  };
  cache.set(key, entry);
  if (currentKey === key) {
    setLatestEntry(entry);
    scheduleRender();
  }
}

function requestComputation(key, payload) {
  if (inflightKeys.has(key)) return;
  inflightKeys.add(key);

  const currentReady = cache.get(key);
  const loadingEntry = {
    status: 'loading',
    key,
    plans: deepClone(currentReady?.plans || latestEntry.plans || []),
    debug: deepClone(currentReady?.debug || latestEntry.debug || {}),
    stale: !!(currentReady?.plans?.length || latestEntry.plans?.length),
    generatedAt: Date.now(),
  };
  cache.set(key, loadingEntry);
  setLatestEntry(loadingEntry);

  const activeWorker = getWorker();
  if (activeWorker) {
    requestId += 1;
    const currentRequestId = requestId;
    requestMetaMap.set(currentRequestId, { key, payload });
    requestTimeoutMap.set(currentRequestId, setTimeout(() => {
      const meta = requestMetaMap.get(currentRequestId);
      if (!meta) return;
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
    };
    cache.set(key, entry);
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

  const existing = expireLoadingEntry(key, cache.get(key)) || cache.get(key);
  if (existing?.status === 'ready') {
    setLatestEntry(existing);
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
