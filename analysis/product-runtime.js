import {
  BATTLE_RULES_VERSION,
  DATA_VERSION,
  stableStringify,
} from '../battle/snapshot.js';

export const PRODUCT_RUNTIME_VERSION = 'product-runtime-v1';
export const PRODUCT_RUNTIME_RESULT_SCHEMA = 'ProductComputationResult';

function deepClone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function inferConfidence(data, fallback = null) {
  if (data?.confidence) return deepClone(data.confidence);
  if (Number.isFinite(fallback?.value) || fallback?.level) return deepClone(fallback);
  return { value: null, level: 'unknown' };
}

function inferUnsupported(data, fallback = []) {
  const source = Array.isArray(data?.unsupportedMechanics)
    ? data.unsupportedMechanics
    : Array.isArray(data?.unsupported)
      ? data.unsupported
      : fallback;
  return deepClone(source || []);
}

function normalizeCacheKey(scope, request = {}) {
  if (request.cacheKey) return String(request.cacheKey);
  const payload = {
    runtimeVersion: PRODUCT_RUNTIME_VERSION,
    scope,
    snapshotKey: request.snapshotKey || request.snapshot?.meta?.snapshotKey || null,
    rulesVersion: request.rulesVersion || BATTLE_RULES_VERSION,
    dataVersion: request.dataVersion || DATA_VERSION,
    actionContext: request.actionContext || null,
    plannerConfig: request.plannerConfig || null,
    uiMode: request.uiMode || null,
    context: request.context || null,
  };
  return `${scope}:${hashString(stableStringify(payload))}`;
}

function trimCache(cache, limit, stats) {
  while (cache.size > limit) {
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
    stats.evictions += 1;
  }
}

function buildResult({
  status = 'ready',
  data = null,
  stale = false,
  cacheKey = '',
  requestId = 0,
  generation = 0,
  error = null,
  confidence = null,
  unsupported = null,
  perf = {},
} = {}) {
  return {
    schema: PRODUCT_RUNTIME_RESULT_SCHEMA,
    runtimeVersion: PRODUCT_RUNTIME_VERSION,
    status,
    data: deepClone(data),
    stale: !!stale,
    confidence: inferConfidence(data, confidence),
    unsupported: inferUnsupported(data, unsupported || []),
    perf: deepClone(perf || {}),
    cacheKey,
    requestId,
    generation,
    error: error ? String(error?.message || error) : null,
    generatedAt: Date.now(),
  };
}

export function createProductRuntime({
  scope = 'product',
  limit = 48,
  isMobileMainThreadBlocked = null,
} = {}) {
  const cache = new Map();
  const stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    staleResults: 0,
    errors: 0,
    mobileSkips: 0,
  };
  let latestResult = buildResult({ status: 'idle' });
  let requestId = 0;
  let generation = 0;
  let activeRequestId = 0;
  let activeCacheKey = '';

  function readCache(cacheKey) {
    const cached = cache.get(cacheKey);
    if (!cached) {
      stats.misses += 1;
      return null;
    }
    cached.lastAccessedAt = Date.now();
    stats.hits += 1;
    return buildResult({
      ...cached.result,
      status: cached.result.status === 'ready' ? 'ready' : cached.result.status,
      stale: false,
      perf: {
        ...(cached.result.perf || {}),
        cacheHit: true,
        cacheSize: cache.size,
      },
    });
  }

  function writeCache(cacheKey, result) {
    cache.set(cacheKey, {
      result: deepClone(result),
      generatedAt: Date.now(),
      lastAccessedAt: Date.now(),
    });
    trimCache(cache, limit, stats);
  }

  function shouldSkipMobile(request) {
    return request.allowMainThreadOnMobile === false
      && typeof isMobileMainThreadBlocked === 'function'
      && isMobileMainThreadBlocked(request);
  }

  function computeSync(request = {}, computeFn) {
    const cacheKey = normalizeCacheKey(scope, request);
    const cached = request.bypassCache ? null : readCache(cacheKey);
    if (cached) return cached;

    requestId += 1;
    generation += 1;
    activeRequestId = requestId;
    activeCacheKey = cacheKey;

    if (shouldSkipMobile(request)) {
      stats.mobileSkips += 1;
      const skipped = buildResult({
        status: latestResult?.data ? 'stale' : 'error',
        data: latestResult?.data || null,
        stale: !!latestResult?.data,
        cacheKey,
        requestId,
        generation,
        error: 'mobile-main-thread-protection',
        confidence: latestResult?.confidence,
        unsupported: latestResult?.unsupported,
        perf: {
          cacheHit: false,
          skipped: true,
          reason: 'mobile-main-thread-protection',
        },
      });
      latestResult = skipped;
      return deepClone(skipped);
    }

    const startedAt = nowMs();
    try {
      const data = computeFn({
        requestId,
        generation,
        cacheKey,
      });
      const result = buildResult({
        status: 'ready',
        data,
        stale: false,
        cacheKey,
        requestId,
        generation,
        perf: {
          durationMs: Math.round(nowMs() - startedAt),
          cacheHit: false,
          cacheSize: cache.size + 1,
        },
      });
      writeCache(cacheKey, result);
      latestResult = result;
      return deepClone(result);
    } catch (error) {
      stats.errors += 1;
      const result = buildResult({
        status: latestResult?.data ? 'stale' : 'error',
        data: latestResult?.data || null,
        stale: !!latestResult?.data,
        cacheKey,
        requestId,
        generation,
        error,
        confidence: latestResult?.confidence,
        unsupported: latestResult?.unsupported,
        perf: {
          durationMs: Math.round(nowMs() - startedAt),
          cacheHit: false,
          error: true,
        },
      });
      latestResult = result;
      return deepClone(result);
    }
  }

  async function compute(request = {}, computeFn) {
    const cacheKey = normalizeCacheKey(scope, request);
    const cached = request.bypassCache ? null : readCache(cacheKey);
    if (cached) return cached;

    requestId += 1;
    generation += 1;
    const localRequestId = requestId;
    const localGeneration = generation;
    activeRequestId = localRequestId;
    activeCacheKey = cacheKey;

    const startedAt = nowMs();
    const emitProgress = (data, meta = {}) => {
      if (activeRequestId !== localRequestId || activeCacheKey !== cacheKey) return null;
      const progressive = buildResult({
        status: 'progressive',
        data,
        stale: false,
        cacheKey,
        requestId: localRequestId,
        generation: localGeneration,
        perf: {
          durationMs: Math.round(nowMs() - startedAt),
          progressive: true,
          ...(meta.perf || {}),
        },
      });
      latestResult = progressive;
      return deepClone(progressive);
    };

    try {
      const data = await computeFn({
        requestId: localRequestId,
        generation: localGeneration,
        cacheKey,
        emitProgress,
      });
      const isStale = activeRequestId !== localRequestId || activeCacheKey !== cacheKey;
      const result = buildResult({
        status: isStale ? 'stale' : 'ready',
        data,
        stale: isStale,
        cacheKey,
        requestId: localRequestId,
        generation: localGeneration,
        perf: {
          durationMs: Math.round(nowMs() - startedAt),
          cacheHit: false,
          cacheSize: cache.size + (isStale ? 0 : 1),
        },
      });
      if (isStale) {
        stats.staleResults += 1;
        return deepClone(result);
      }
      writeCache(cacheKey, result);
      latestResult = result;
      return deepClone(result);
    } catch (error) {
      stats.errors += 1;
      const result = buildResult({
        status: latestResult?.data ? 'stale' : 'error',
        data: latestResult?.data || null,
        stale: !!latestResult?.data,
        cacheKey,
        requestId: localRequestId,
        generation: localGeneration,
        error,
        confidence: latestResult?.confidence,
        unsupported: latestResult?.unsupported,
        perf: {
          durationMs: Math.round(nowMs() - startedAt),
          cacheHit: false,
          error: true,
        },
      });
      latestResult = result;
      return deepClone(result);
    }
  }

  function peek(cacheKey = activeCacheKey) {
    const cached = cache.get(cacheKey);
    return cached ? deepClone(cached.result) : null;
  }

  function clear() {
    cache.clear();
    latestResult = buildResult({ status: 'idle' });
    stats.hits = 0;
    stats.misses = 0;
    stats.evictions = 0;
    stats.staleResults = 0;
    stats.errors = 0;
    stats.mobileSkips = 0;
  }

  function getStats() {
    return {
      runtimeVersion: PRODUCT_RUNTIME_VERSION,
      scope,
      size: cache.size,
      limit,
      activeRequestId,
      activeCacheKey,
      ...stats,
      latestStatus: latestResult.status,
      latestStale: !!latestResult.stale,
    };
  }

  return {
    compute,
    computeSync,
    peek,
    clear,
    getStats,
  };
}

export default {
  PRODUCT_RUNTIME_RESULT_SCHEMA,
  PRODUCT_RUNTIME_VERSION,
  createProductRuntime,
};
