import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleHarness } from '../baseline/esm-loader.mjs';
import { cloneField, makeMon } from '../baseline/fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = await createModuleHarness(ROOT);
await harness.loadGameDB();
await harness.loadEffectsRegistry();
const { setDebugMode } = await harness.importModule('utils/debug.js');
const snapshotModule = await harness.importModule('battle/snapshot.js');
const actionCore = await harness.importModule('battle/action-core.js');
const actionAdapters = await harness.importModule('battle/action-adapters.js');
setDebugMode(false);

const {
  createBattleSnapshot,
  createCandidateAction,
} = snapshotModule;
const {
  ACTION_CORE_VERSION,
  generateLegalActions,
  resolvePriority,
  resolveActionOrder,
  resolveTargets,
  estimateActionOutcome,
  simulateTurn,
} = actionCore;
const {
  createSnapshotFromLegacyBattleState,
  legacyPlanActionToCandidateAction,
  estimateLegacyActionOutcome,
} = actionAdapters;

const failures = [];

function assert(condition, label, details = '') {
  if (!condition) failures.push(details ? `${label}: ${details}` : label);
}

function same(actual, expected, label) {
  assert(Object.is(actual, expected), label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function snap({ self, enemy, field = {}, turn = 1, activeSelfSlots = [0, 1], activeEnemySlots = [0, 1] }) {
  return createBattleSnapshot({
    selfTeam: self,
    enemyTeam: enemy,
    field: cloneField(field),
    activeSelfSlots,
    activeEnemySlots,
    turn,
    phase: 'live',
    source: 'action-core-test',
  });
}

function findMove(actions, moveName, targetSlot = undefined) {
  const wanted = String(moveName).toLowerCase().replace(/[^a-z0-9]/g, '');
  return actions.find((action) => {
    const moveId = String(action.moveId || action.moveName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return moveId === wanted && (targetSlot === undefined || action.targetSlot === targetSlot);
  });
}

same(ACTION_CORE_VERSION, 'action-core-v1', 'action core version');

{
  const snapshot = snap({
    self: [
      makeMon('whimsicott', { ability: 'Prankster', moves: ['Tailwind', 'Taunt'], side: 'self' }),
      makeMon('excadrill', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
      makeMon('arcanine', { moves: ['Flare Blitz'], side: 'enemy' }),
    ],
  });
  const actions = generateLegalActions(snapshot, 'self', 0);
  const tailwind = findMove(actions, 'tailwind');
  same(tailwind.dynamicPriority, 1, 'Prankster raises Tailwind priority');
  same(resolvePriority(tailwind, snapshot), 1, 'resolvePriority returns dynamic Prankster priority');
}

{
  const snapshot = snap({
    self: [
      makeMon('whimsicott', { ability: 'Prankster', moves: ['Taunt'], side: 'self' }),
      makeMon('excadrill', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
      makeMon('arcanine', { moves: ['Flare Blitz'], side: 'enemy' }),
    ],
  });
  const taunt = findMove(generateLegalActions(snapshot, 'self', 0), 'taunt', 0);
  const result = simulateTurn(snapshot, [taunt]);
  assert(result.events.some((event) => event.kind === 'blocked' && /Siniestro|Bromista/.test(event.reason)), 'Dark type blocks hostile Prankster status');
}

{
  const snapshot = snap({
    self: [
      makeMon('raichu', { moves: ['Fake Out'], side: 'self' }),
      makeMon('excadrill', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('arcanine', { moves: ['Flare Blitz'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
    field: { terrain: 'psychic' },
  });
  const fakeOut = findMove(generateLegalActions(snapshot, 'self', 0), 'fakeout', 0);
  const result = simulateTurn(snapshot, [fakeOut]);
  assert(result.events.some((event) => event.kind === 'blocked' && /Campo Psiquico/.test(event.reason)), 'Psychic Terrain blocks priority into grounded target');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanine', { moves: ['Extreme Speed'], side: 'self' }),
      makeMon('excadrill', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('farigiraf', { ability: 'Armor Tail', moves: ['Psychic'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const extremeSpeed = findMove(generateLegalActions(snapshot, 'self', 0), 'extremespeed', 1);
  const result = simulateTurn(snapshot, [extremeSpeed]);
  assert(result.events.some((event) => event.kind === 'blocked' && /prioridad/.test(event.reason)), 'Armor Tail side blocks priority attacks');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanine', { moves: ['Extreme Speed'], side: 'self' }),
      makeMon('excadrill', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('whimsicott', { moves: ['Quick Guard'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const quickGuard = findMove(generateLegalActions(snapshot, 'enemy', 0), 'quickguard');
  const extremeSpeed = findMove(generateLegalActions(snapshot, 'self', 0), 'extremespeed', 1);
  const result = simulateTurn(snapshot, [quickGuard, extremeSpeed]);
  assert(result.events.some((event) => event.kind === 'blocked' && /Quick Guard/.test(event.reason)), 'Quick Guard blocks later priority move');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanine', { moves: ['Head Smash'], side: 'self' }),
      makeMon('excadrill', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('indeedee', { moves: ['Follow Me'], side: 'enemy' }),
      makeMon('hatterene', { moves: ['Trick Room'], side: 'enemy' }),
    ],
  });
  const followMe = findMove(generateLegalActions(snapshot, 'enemy', 0), 'followme');
  const headSmashIntoHatterene = findMove(generateLegalActions(snapshot, 'self', 0), 'headsmash', 1);
  const result = simulateTurn(snapshot, [followMe, headSmashIntoHatterene]);
  assert(result.events.some((event) => event.kind === 'hit' && event.target === 'Indeedee-F'), 'Follow Me redirects single-target attack');
}

{
  const snapshot = snap({
    self: [
      makeMon('excadrill', { moves: ['Earthquake'], side: 'self' }),
      makeMon('dragonite', { moves: ['Extreme Speed'], side: 'self' }),
    ],
    enemy: [
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
      makeMon('kingambit', { moves: ['Iron Head'], side: 'enemy' }),
    ],
  });
  const earthquake = findMove(generateLegalActions(snapshot, 'self', 0), 'earthquake');
  const outcome = estimateActionOutcome(snapshot, earthquake);
  same(resolveTargets(earthquake, snapshot).length, 3, 'Earthquake targets all adjacent Pokemon');
  assert(outcome.results.filter((result) => !result.blocked && result.maxDamage > 0).length >= 2, 'Earthquake damages both grounded foes');
  assert(outcome.results.some((result) => result.blocked && /tierra/.test(result.blockReason)), 'Earthquake respects airborne ally immunity');
}

{
  const fullSash = snap({
    self: [
      makeMon('arcanine', { moves: ['Flare Blitz'], side: 'self' }),
      makeMon('excadrill', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('whimsicott', { item: 'Focus Sash', moves: ['Tailwind'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const attackFull = findMove(generateLegalActions(fullSash, 'self', 0), 'flareblitz', 0);
  const resultFull = simulateTurn(fullSash, [attackFull]);
  same(resultFull.snapshot.sides.enemy.slots[0].pokemon.hpPct, 1, 'Focus Sash survives only from full HP');

  const chippedSash = snap({
    self: [
      makeMon('arcanine', { moves: ['Flare Blitz'], side: 'self' }),
      makeMon('excadrill', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('whimsicott', { item: 'Focus Sash', hpPct: 9, moves: ['Tailwind'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const attackChipped = findMove(generateLegalActions(chippedSash, 'self', 0), 'flareblitz', 0);
  const resultChipped = simulateTurn(chippedSash, [attackChipped]);
  same(resultChipped.snapshot.sides.enemy.slots[0].pokemon.fainted, true, 'Focus Sash does not save chipped Pokemon');
}

{
  const snapshot = snap({
    self: [
      makeMon('torkoal', { moves: ['Eruption'], side: 'self' }),
      makeMon('amoonguss', { moves: ['Spore'], side: 'self' }),
    ],
    enemy: [
      makeMon('charizard', { moves: ['Air Slash'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
    field: { trickRoom: true },
  });
  const eruption = findMove(generateLegalActions(snapshot, 'self', 0), 'eruption');
  const airSlash = findMove(generateLegalActions(snapshot, 'enemy', 0), 'airslash', 0);
  const order = resolveActionOrder(snapshot, [eruption, airSlash]);
  same(order[0].actor, 'Torkoal', 'Trick Room makes slower Pokemon act first');
}

{
  const snapshot = snap({
    self: [
      makeMon('charizard', { moves: ['Weather Ball'], side: 'self' }),
      makeMon('excadrill', { moves: ['Protect'], side: 'self' }),
    ],
    enemy: [
      makeMon('excadrill', { moves: ['Earthquake'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
    field: { weather: 'sun' },
  });
  const weatherBall = findMove(generateLegalActions(snapshot, 'self', 0), 'weatherball', 0);
  const outcome = estimateActionOutcome(snapshot, weatherBall);
  same(outcome.results[0].type, 'fire', 'Weather Ball changes type in sun');
  assert(outcome.results[0].maxDamage > 0, 'Weather Ball produces damage in sun');
}

{
  const snapshot = snap({
    self: [
      makeMon('rotomWash', { moves: ['Discharge'], side: 'self' }),
      makeMon('raichu', { ability: 'Lightning Rod', moves: ['Fake Out'], side: 'self' }),
    ],
    enemy: [
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
      makeMon('kingambit', { moves: ['Iron Head'], side: 'enemy' }),
    ],
  });
  const discharge = findMove(generateLegalActions(snapshot, 'self', 0), 'discharge');
  const outcome = estimateActionOutcome(snapshot, discharge);
  assert(outcome.results.some((result) => result.blocked && /Lightning Rod|Pararrayos/i.test(result.blockReason)), 'Electric absorb abilities block Discharge target damage');
}

{
  const legacyState = {
    self: [
      makeMon('excadrill', { moves: ['Earthquake'], side: 'self' }),
      makeMon('dragonite', { moves: ['Extreme Speed'], side: 'self' }),
    ],
    enemy: [
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
      makeMon('kingambit', { moves: ['Iron Head'], side: 'enemy' }),
    ],
    field: cloneField(),
    activeSelfSlots: [0, 1],
    activeEnemySlots: [0, 1],
  };
  const snapshot = createSnapshotFromLegacyBattleState(legacyState);
  const action = legacyPlanActionToCandidateAction({
    side: 'self',
    userIndex: 0,
    kind: 'move',
    moveName: 'Earthquake',
    targetMode: 'spread-foes',
  }, snapshot);
  same(action.targetMode, 'allAdjacentFoes', 'legacy adapter maps spread-foes target mode');
  const outcome = estimateLegacyActionOutcome(snapshot, action);
  assert(outcome.results.length >= 2, 'legacy adapter estimates core outcome');
}

if (failures.length) {
  console.error('Action core checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Action core checks passed.');
