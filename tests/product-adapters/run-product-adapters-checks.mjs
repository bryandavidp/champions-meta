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
const matrixExplainer = await harness.importModule('matrix/explainer.js');
const productAdapters = await harness.importModule('analysis/product-adapters.js');
setDebugMode(false);

const failures = [];

function assert(condition, label, details = '') {
  if (!condition) failures.push(details ? `${label}: ${details}` : label);
}

function same(actual, expected, label) {
  assert(Object.is(actual, expected), label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const appState = {
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

same(matrixCore.MATRIX_CORE_VERSION, 'matrix-core-v2', 'matrix core version');
same(matrixExplainer.MATRIX_EXPLAINER_VERSION, 'matrix-explainer-v2', 'matrix explainer version');
same(productAdapters.PRODUCT_ADAPTERS_VERSION, 'product-adapters-v2', 'product adapters version');

{
  const rows = matrixCore.getRows({
    selfTeam: appState.self,
    enemyTeam: appState.enemy,
    field: appState.field,
    mode: 'offensive',
  });
  assert(rows.length === 4, 'matrix core returns one row per focused self mon');
  const flat = rows.flatMap((row) => row.cells);
  assert(flat.length === 16, 'matrix core returns one cell per matchup');
  assert(flat.every((cell) => cell.schema === 'matrix-cell-v2'), 'matrix cells expose v2 schema');
  assert(flat.some((cell) => cell.confidence?.level), 'matrix cells carry confidence');
  assert(flat.some((cell) => Array.isArray(cell.trace)), 'matrix cells carry trace arrays');
  const explanation = matrixExplainer.buildMatrixCellExplanation(flat[0], true);
  assert(explanation.title && explanation.headline, 'matrix explainer builds reduced trace copy');
  assert(explanation.confidence?.level, 'matrix explainer exposes confidence');
}

{
  const home = productAdapters.buildHomeTacticalModel(appState, {
    activeSelfSlots: [0, 1],
    activeEnemySlots: [0, 1],
    highlightLimit: 8,
  });
  assert(home.schema === 'home-tactical-model-v1', 'home adapter schema');
  assert(home.status.readyForPlans, 'home adapter exposes matchup readiness');
  assert(Array.isArray(home.advantages), 'home adapter exposes advantages');
  assert(Array.isArray(home.risks), 'home adapter exposes risks');
  assert(home.fieldContext?.label, 'home adapter exposes field context');
  assert(home.action?.kind, 'home adapter exposes contextual action');
}

{
  const quick = productAdapters.buildQuickModeProductModel(appState, {
    activeSelfSlots: [0, 1],
    activeEnemySlots: [0, 1],
    highlightLimit: 8,
  });
  assert(quick.schema === 'quick-product-model-v1', 'quick adapter schema');
  assert(quick.snapshot?.schema === 'BattleSnapshot', 'quick adapter exposes battle snapshot');
  assert(quick.engines.length > 0, 'quick adapter exposes team engines');
  assert(quick.responses.length > 0, 'quick adapter exposes recommended responses');
}

{
  const threat = productAdapters.buildThreatAnalysisProductModel(appState, {
    activeSelfSlots: [0, 1],
    activeEnemySlots: [0, 1],
    highlightLimit: 12,
  });
  assert(threat.schema === 'threat-analysis-product-model-v1', 'threat adapter schema');
  assert(threat.rows.length > 0, 'threat adapter exposes rows');
  assert(Object.values(threat.layers).some((items) => items.length > 0), 'threat adapter splits layers');
}

{
  const turn1 = productAdapters.buildTurn1ProductModel(appState, {
    activeSelfSlots: [0, 1],
    activeEnemySlots: [0, 1],
    highlightLimit: 6,
  });
  assert(turn1.schema === 'turn1-product-model-v1', 'turn1 adapter schema');
  assert(turn1.highlights.length > 0, 'turn1 adapter exposes visible highlights');
  assert(turn1.highlights.every((item) => item.confidence), 'turn1 highlights carry confidence');
}

if (failures.length) {
  console.error('Product adapter checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product adapter checks passed.');
