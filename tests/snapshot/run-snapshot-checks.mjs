import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleHarness } from '../baseline/esm-loader.mjs';
import { cloneField, makeMon } from '../baseline/fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = await createModuleHarness(ROOT);
await harness.loadGameDB();
await harness.loadEffectsRegistry();
const snapshotModule = await harness.importModule('battle/snapshot.js');
const cacheModule = await harness.importModule('battle/cache-keys.js');
const explainModule = await harness.importModule('battle/explain.js');
const { setDebugMode } = await harness.importModule('utils/debug.js');
const { state } = await harness.importModule('core/state.js');
const { buildTurnPlansSnapshot } = await harness.importModule('analysis/turn-plans-engine.js');
setDebugMode(false);

const {
  BATTLE_SNAPSHOT_VERSION,
  createBattleSnapshot,
  createBattleSnapshotFromAppState,
  createCandidateAction,
  cloneBattleSnapshot,
  hydrateBattleSnapshot,
  serializeBattleSnapshot,
  snapshotToLegacySimulationState,
} = snapshotModule;
const { buildSnapshotCacheKey, buildVersionedCacheKey } = cacheModule;
const { createExplainEvent, eventsToExplainEvents } = explainModule;

const failures = [];

function assert(condition, label, details = '') {
  if (!condition) failures.push(details ? `${label}: ${details}` : label);
}

function same(actual, expected, label) {
  assert(Object.is(actual, expected), label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const selfTeam = [
  makeMon('whimsicott', { ability: 'Prankster', item: 'Focus Sash', moves: ['Tailwind', 'Moonblast'], side: 'self' }),
  makeMon('excadrill', { ability: 'Sand Rush', item: 'Life Orb', moves: ['Earthquake', 'Protect'], side: 'self' }),
  makeMon('tyranitar', { ability: 'Sand Stream', item: 'Assault Vest', moves: ['Rock Slide'], side: 'self' }),
  makeMon('azumarill', { ability: 'Huge Power', item: 'Sitrus Berry', moves: ['Aqua Jet'], side: 'self' }),
];
const enemyTeam = [
  makeMon('indeedee', { ability: 'Psychic Surge', item: 'Safety Goggles', moves: ['Follow Me'], side: 'enemy' }),
  makeMon('hatterene', { ability: 'Magic Bounce', item: 'Focus Sash', moves: ['Trick Room'], side: 'enemy' }),
  makeMon('torkoal', { ability: 'Drought', item: 'Charcoal', moves: ['Eruption'], side: 'enemy' }),
  makeMon('amoonguss', { ability: 'Regenerator', item: 'Covert Cloak', moves: ['Spore'], side: 'enemy' }),
];
const field = cloneField({
  weather: 'tormenta arena',
  weatherTurns: 4,
  terrain: 'Campo Psiquico',
  terrainTurns: 5,
  tailwindSelf: true,
  tailwindSelfTurns: 3,
});

const snapshot = createBattleSnapshot({
  selfTeam,
  enemyTeam,
  field,
  activeSelfSlots: [0, 1],
  activeEnemySlots: [0, 1],
  turn: 2,
  phase: 'live',
  source: 'snapshot-test',
  unsupportedMechanics: ['commander'],
  confidence: { value: 0.72, reasons: ['fixture'] },
});

same(snapshot.version, BATTLE_SNAPSHOT_VERSION, 'snapshot version');
same(snapshot.turn, 2, 'snapshot turn');
same(snapshot.field.weather, 'sand', 'weather canonicalized');
same(snapshot.field.terrain, 'psychic', 'terrain canonicalized');
same(snapshot.sides.self.activeSlots.join(','), '0,1', 'self active slots');
same(snapshot.sides.enemy.activeSlots.join(','), '0,1', 'enemy active slots');
same(snapshot.sides.self.slots[0].pokemon.speciesId, 'whimsicott', 'species canonical id');
same(snapshot.sides.self.slots[0].pokemon.set.abilityId, 'prankster', 'ability canonical id');
same(snapshot.sides.self.slots[0].pokemon.set.itemId, 'focussash', 'item canonical id');
same(snapshot.sides.self.slots[1].pokemon.set.moves[0].id, 'earthquake', 'move canonical id');
same(snapshot.sides.self.slots[1].pokemon.set.moves[0].targetMode, 'allAdjacent', 'move target mode');
assert(Object.isFrozen(snapshot), 'snapshot is frozen');
assert(Object.isFrozen(snapshot.sides.self.slots[0].pokemon), 'pokemon state is frozen');

const serialized = serializeBattleSnapshot(snapshot);
const cloned = cloneBattleSnapshot(snapshot);
same(serializeBattleSnapshot(cloned), serialized, 'clone serialization stable');
same(serializeBattleSnapshot(hydrateBattleSnapshot(serialized)), serialized, 'hydrate serialization stable');

selfTeam[0].battle.hpPct = 12;
same(snapshot.sides.self.slots[0].pokemon.hpPct, 100, 'snapshot isolated from app mutation');

const legacy = snapshotToLegacySimulationState(snapshot);
same(legacy.self[0].battle.hpPct, 100, 'legacy adapter hp');
same(legacy.self[1].set.moves[0], 'Earthquake', 'legacy adapter preserves app move name');
same(legacy.field.weather, 'sand', 'legacy adapter weather');
same(legacy.field.tailwindSelf, true, 'legacy adapter side condition');

const appSnapshot = createBattleSnapshotFromAppState({
  self: selfTeam,
  enemy: enemyTeam,
  field,
  activeSelfSlots: [1, 2],
  activeEnemySlots: [0, 3],
  turn1Battle: { active: true, turn: 4 },
});
same(appSnapshot.phase, 'live', 'app adapter phase');
same(appSnapshot.sides.self.activeSlots.join(','), '1,2', 'app adapter self slots');

const keyA = buildSnapshotCacheKey(snapshot);
const keyB = buildSnapshotCacheKey(cloned);
same(keyA, keyB, 'snapshot cache key stable');

const changedSnapshot = createBattleSnapshot({
  selfTeam,
  enemyTeam,
  field: { ...field, weather: 'sun' },
  activeSelfSlots: [0, 1],
  activeEnemySlots: [0, 1],
});
assert(buildSnapshotCacheKey(changedSnapshot) !== keyA, 'snapshot cache key changes with relevant field');
assert(buildVersionedCacheKey({ scope: 'test', snapshot, context: { horizon: 2 } }) !== buildVersionedCacheKey({ scope: 'test', snapshot, context: { horizon: 1 } }), 'versioned key includes context');

const action = createCandidateAction({
  side: 'self',
  userSlot: 1,
  move: 'Earthquake',
  targetMode: 'allAdjacent',
  effectClass: 'damage',
});
same(action.schema, 'candidate-action-v1', 'candidate action schema');
same(action.moveId, 'earthquake', 'candidate action move id');
same(action.targetMode, 'allAdjacent', 'candidate action target mode');

const explain = createExplainEvent({
  code: 'turn.damage.hit',
  message: 'Excadrill usa Earthquake',
  side: 'self',
  actor: 'Excadrill',
  target: 'Indeedee-F',
  confidence: 0.6,
});
same(explain.schema, 'explain-event-v1', 'explain event schema');
same(explain.confidence.level, 'medium', 'explain confidence level');

const convertedEvents = eventsToExplainEvents([
  { kind: 'hit', side: 'self', actor: 'Excadrill', move: 'Earthquake', target: 'Indeedee-F', damagePct: 80, hpPct: 20, isSpread: true },
  { kind: 'blocked', side: 'enemy', actor: 'Indeedee-F', move: 'Fake Out', target: 'Whimsicott', reason: 'Campo Psiquico' },
]);
same(convertedEvents[0].code, 'turn.damage.hit', 'hit explain event code');
same(convertedEvents[1].code, 'turn.action.blocked', 'blocked explain event code');

state.self = structuredClone(selfTeam);
state.enemy = structuredClone(enemyTeam);
state.field = structuredClone(field);
state.activeSelfSlots = [0, 1];
state.activeEnemySlots = [0, 1];
const appStateBeforePlanner = JSON.stringify({
  self: state.self,
  enemy: state.enemy,
  field: state.field,
  activeSelfSlots: state.activeSelfSlots,
  activeEnemySlots: state.activeEnemySlots,
});
const plannerModel = buildTurnPlansSnapshot({
  selfTeam,
  enemyTeam,
  field,
  ownCombos: [{ indices: [0, 1, 2, 3], orderedIdx: [0, 1, 2, 3], leads: [0, 1], score: 100, planType: 'test' }],
  topOwnCombos: 1,
  topEnemyCombos: 1,
  displayLimit: 1,
});
const appStateAfterPlanner = JSON.stringify({
  self: state.self,
  enemy: state.enemy,
  field: state.field,
  activeSelfSlots: state.activeSelfSlots,
  activeEnemySlots: state.activeEnemySlots,
});
same(appStateAfterPlanner, appStateBeforePlanner, 'planner does not mutate app state');
assert(plannerModel.debug?.snapshotKey, 'planner returns snapshot cache key');
assert(Array.isArray(plannerModel.plans?.[0]?.mainLine?.explainEvents), 'planner exposes explain events');

if (failures.length) {
  console.error('Snapshot checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Snapshot checks passed.');
