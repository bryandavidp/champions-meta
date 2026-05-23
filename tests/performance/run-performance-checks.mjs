import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleHarness } from '../baseline/esm-loader.mjs';
import { cloneField, makeMon } from '../baseline/fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = await createModuleHarness(ROOT);
await harness.loadGameDB();
await harness.loadEffectsRegistry();

const { setDebugMode } = await harness.importModule('utils/debug.js');
await harness.importModule('battle/snapshot.js');
const matrixCore = await harness.importModule('matrix/core.js');
const productAdapters = await harness.importModule('analysis/product-adapters.js');
const turnBranches = await harness.importModule('analysis/turn-branches.js');
const productRuntime = await harness.importModule('analysis/product-runtime.js');
setDebugMode(false);

const failures = [];

function assert(condition, label, details = '') {
  if (!condition) failures.push(details ? `${label}: ${details}` : label);
}

function buildState() {
  return {
    self: [
      makeMon('whimsicott', { ability: 'Prankster', moves: ['Tailwind', 'Taunt'], side: 'self' }),
      makeMon('torkoal', { ability: 'Drought', moves: ['Eruption', 'Protect'], side: 'self' }),
      makeMon('excadrill', { ability: 'Sand Rush', moves: ['Earthquake', 'Iron Head'], side: 'self' }),
      makeMon('dragonite', { moves: ['Extreme Speed'], side: 'self' }),
    ],
    enemy: [
      makeMon('tyranitar', { ability: 'Sand Stream', moves: ['Rock Slide'], side: 'enemy' }),
      makeMon('farigiraf', { ability: 'Armor Tail', moves: ['Trick Room'], side: 'enemy' }),
      makeMon('kingambit', { ability: 'Defiant', moves: ['Iron Head'], side: 'enemy' }),
      makeMon('azumarill', { moves: ['Aqua Jet', 'Play Rough'], side: 'enemy' }),
    ],
    field: cloneField({ weather: 'sun' }),
    leads: { self: [0, 1], enemy: [0, 1] },
    turn1Battle: { active: false, turn: 1 },
  };
}

const appState = buildState();

assert(turnBranches.TURN_PLANS_PERF_VERSION === 'turn-plans-perf-v1', 'turn plans perf version is exposed');
const turnPerf = turnBranches.getTurnPlansPerformanceState();
assert(turnPerf.cacheLimit >= 12, 'turn plans cache limit is bounded but useful');
assert(Number.isFinite(turnPerf.inflightCount), 'turn plans exposes inflight count');

productAdapters.clearProductAdapterMemo();
const quickFirst = productAdapters.buildQuickModeProductModel(appState, {
  activeSelfSlots: [0, 1],
  activeEnemySlots: [0, 1],
  highlightLimit: 8,
});
const quickSecond = productAdapters.buildQuickModeProductModel(appState, {
  activeSelfSlots: [0, 1],
  activeEnemySlots: [0, 1],
  highlightLimit: 8,
});
const adapterStats = productAdapters.getProductAdapterCacheStats();
assert(quickFirst.schema === quickSecond.schema, 'quick adapter returns stable schema across memo hits');
assert(quickSecond.debug?.cacheHit === true, 'quick adapter second call reports cache hit');
assert(adapterStats.hits >= 1, 'product adapter cache records hits');
assert(adapterStats.size === 1, 'product adapter cache keeps one entry for identical context');

const threatModel = productAdapters.buildThreatAnalysisProductModel(appState, {
  activeSelfSlots: [0, 1],
  activeEnemySlots: [0, 1],
  highlightLimit: 10,
});
const turn1Model = productAdapters.buildTurn1ProductModel(appState, {
  activeSelfSlots: [0, 1],
  activeEnemySlots: [0, 1],
  highlightLimit: 6,
});
const adapterStatsAfterVariants = productAdapters.getProductAdapterCacheStats();
assert(threatModel.debug?.cacheHit === false, 'threat adapter first call is a miss');
assert(turn1Model.debug?.cacheHit === false, 'turn1 adapter first call is a miss');
assert(adapterStatsAfterVariants.size === 3, 'adapter cache separates quick, threat and turn1 contexts');

matrixCore.clearMatrixMemo();
const matrixFirst = matrixCore.getRows({
  selfTeam: appState.self,
  enemyTeam: appState.enemy,
  field: appState.field,
  mode: 'offensive',
});
const matrixSecond = matrixCore.getRows({
  selfTeam: appState.self,
  enemyTeam: appState.enemy,
  field: appState.field,
  mode: 'offensive',
});
const matrixStats = matrixCore.getMatrixCacheStats();
assert(matrixFirst.length === matrixSecond.length, 'matrix memo returns same row count');
assert(JSON.stringify(matrixFirst) === JSON.stringify(matrixSecond), 'matrix memo returns stable row payload');
assert(matrixStats.hits >= 1, 'matrix cache records hits');
assert(matrixStats.size === 1, 'matrix cache keeps one entry for identical context');

const defensiveRows = matrixCore.getRows({
  selfTeam: appState.self,
  enemyTeam: appState.enemy,
  field: appState.field,
  mode: 'defensive',
});
const matrixStatsAfterMode = matrixCore.getMatrixCacheStats();
assert(defensiveRows.length === appState.enemy.length, 'matrix defensive mode still computes rows');
assert(matrixStatsAfterMode.size === 2, 'matrix cache separates offensive and defensive modes');

sameRuntimeChecks:
{
  assert(productRuntime.PRODUCT_RUNTIME_VERSION === 'product-runtime-v1', 'product runtime version is exposed');
  const runtime = productRuntime.createProductRuntime({ scope: 'test-runtime', limit: 2 });
  const first = runtime.computeSync({ cacheKey: 'a' }, () => ({ value: 1, confidence: { value: 0.7, level: 'medium' } }));
  const second = runtime.computeSync({ cacheKey: 'a' }, () => ({ value: 2 }));
  const stats = runtime.getStats();
  assert(first.status === 'ready', 'product runtime sync first computation is ready');
  assert(second.data.value === 1, 'product runtime returns cached sync data');
  assert(second.perf.cacheHit === true, 'product runtime marks cache hits');
  assert(stats.hits >= 1, 'product runtime records hits');
}

{
  const runtime = productRuntime.createProductRuntime({ scope: 'async-runtime', limit: 4 });
  const slow = runtime.compute({ cacheKey: 'slow' }, () => new Promise((resolve) => {
    setTimeout(() => resolve({ value: 'slow' }), 20);
  }));
  const fast = runtime.compute({ cacheKey: 'fast' }, () => Promise.resolve({ value: 'fast' }));
  const fastResult = await fast;
  const slowResult = await slow;
  assert(fastResult.status === 'ready', 'product runtime async current request is ready');
  assert(slowResult.status === 'stale', 'superseded async request returns stale result');
  assert(runtime.peek('slow') === null, 'stale async request does not overwrite cache');
}

{
  const runtime = productRuntime.createProductRuntime({
    scope: 'mobile-guard-runtime',
    isMobileMainThreadBlocked: () => true,
  });
  const guarded = runtime.computeSync({ cacheKey: 'guarded', allowMainThreadOnMobile: false }, () => ({ value: 'blocked' }));
  assert(guarded.status === 'error', 'mobile guard blocks first unsafe main-thread computation');
  assert(guarded.error === 'mobile-main-thread-protection', 'mobile guard exposes reason');
  assert(runtime.getStats().mobileSkips === 1, 'mobile guard records skips');
}

if (failures.length) {
  console.error('Performance checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Performance checks passed.');
