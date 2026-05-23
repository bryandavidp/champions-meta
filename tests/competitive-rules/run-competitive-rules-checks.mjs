import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleHarness } from '../baseline/esm-loader.mjs';
import { cloneField, makeMon } from '../baseline/fixtures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = await createModuleHarness(ROOT);
await harness.loadGameDB();
await harness.loadEffectsRegistry();
const { setDebugMode } = await harness.importModule('utils/debug.js');
const { createBattleSnapshot } = await harness.importModule('battle/snapshot.js');
const {
  applySwitchInReactions,
  estimateActionOutcome,
  generateLegalActions,
  simulateTurn,
} = await harness.importModule('battle/action-core.js');
setDebugMode(false);

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
    source: 'competitive-rules-test',
  });
}

function move(snapshot, side, slot, moveName, targetSlot = undefined) {
  const wanted = String(moveName).toLowerCase().replace(/[^a-z0-9]/g, '');
  return generateLegalActions(snapshot, side, slot).find((action) => {
    const moveId = String(action.moveId || action.moveName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return moveId === wanted && (targetSlot === undefined || action.targetSlot === targetSlot);
  });
}

{
  const snapshot = snap({
    self: [
      makeMon('torkoal', { ability: 'Drought', moves: ['Eruption'], side: 'self' }),
      makeMon('hatterene', { item: 'Psychic Seed', moves: ['Trick Room'], side: 'self' }),
    ],
    enemy: [
      makeMon('indeedee', { ability: 'Psychic Surge', moves: ['Follow Me'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const result = applySwitchInReactions(snapshot);
  same(result.snapshot.field.weather, 'sun', 'Drought sets sun on switch-in');
  same(result.snapshot.field.terrain, 'psychic', 'Psychic Surge sets Psychic Terrain on switch-in');
  same(result.snapshot.sides.self.slots[1].pokemon.stages.spd, 1, 'Psychic Seed boosts SpD');
  same(result.snapshot.sides.self.slots[1].pokemon.itemState.consumed, true, 'Psychic Seed is consumed');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanineKanto', { ability: 'Intimidate', moves: ['Flare Blitz'], side: 'self' }),
      makeMon('whimsicott', { moves: ['Tailwind'], side: 'self' }),
    ],
    enemy: [
      makeMon('kingambit', { ability: 'Defiant', moves: ['Iron Head'], side: 'enemy' }),
      makeMon('milotic', { ability: 'Competitive', moves: ['Surf'], side: 'enemy' }),
    ],
  });
  const result = applySwitchInReactions(snapshot);
  same(result.snapshot.sides.enemy.slots[0].pokemon.stages.atk, 1, 'Defiant reacts to Intimidate with net +1 Atk');
  same(result.snapshot.sides.enemy.slots[1].pokemon.stages.atk, -1, 'Competitive still receives the Atk drop');
  same(result.snapshot.sides.enemy.slots[1].pokemon.stages.spa, 2, 'Competitive gains +2 SpA');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanineKanto', { ability: 'Intimidate', moves: ['Flare Blitz'], side: 'self' }),
      makeMon('whimsicott', { moves: ['Tailwind'], side: 'self' }),
    ],
    enemy: [
      makeMon('metagross', { ability: 'Clear Body', moves: ['Iron Head'], side: 'enemy' }),
      makeMon('tyranitar', { item: 'Clear Amulet', moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const result = applySwitchInReactions(snapshot);
  same(result.snapshot.sides.enemy.slots[0].pokemon.stages.atk, 0, 'Clear Body blocks Intimidate');
  same(result.snapshot.sides.enemy.slots[1].pokemon.stages.atk, 0, 'Clear Amulet blocks Intimidate');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanineKanto', { ability: 'Intimidate', moves: ['Flare Blitz'], side: 'self' }),
      makeMon('whimsicott', { moves: ['Tailwind'], side: 'self' }),
    ],
    enemy: [
      makeMon('arcanine', { ability: 'Guard Dog', moves: ['Flare Blitz'], side: 'enemy' }),
      makeMon('dragonite', { ability: 'Inner Focus', moves: ['Extreme Speed'], side: 'enemy' }),
    ],
  });
  const result = applySwitchInReactions(snapshot);
  same(result.snapshot.sides.enemy.slots[0].pokemon.stages.atk, 1, 'Guard Dog blocks Intimidate and boosts Atk');
  same(result.snapshot.sides.enemy.slots[1].pokemon.stages.atk, 0, 'Inner Focus blocks Intimidate');
}

{
  const snapshot = snap({
    self: [
      makeMon('raichu', { moves: ['Fake Out'], side: 'self' }),
      makeMon('excadrill', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('dragonite', { ability: 'Inner Focus', moves: ['Extreme Speed'], side: 'enemy' }),
      makeMon('amoonguss', { item: 'Covert Cloak', moves: ['Spore'], side: 'enemy' }),
    ],
  });
  const fakeOutDragonite = move(snapshot, 'self', 0, 'Fake Out', 0);
  const fakeOutCloak = move(snapshot, 'self', 0, 'Fake Out', 1);
  assert(simulateTurn(snapshot, [fakeOutDragonite]).events.some((event) => /retroceso/.test(event.reason || '') || /bloqueo/.test(event.reason || '')), 'Inner Focus blocks Fake Out flinch');
  assert(simulateTurn(snapshot, [fakeOutCloak]).events.some((event) => /retroceso/.test(event.reason || '') || /bloqueo/.test(event.reason || '')), 'Covert Cloak blocks Fake Out flinch');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanine', { item: 'Choice Band', moves: ['Flare Blitz', 'Head Smash'], side: 'self' }),
      makeMon('whimsicott', { moves: ['Tailwind'], side: 'self' }),
    ],
    enemy: [
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
      makeMon('kingambit', { moves: ['Iron Head'], side: 'enemy' }),
    ],
  });
  const first = simulateTurn(snapshot, [move(snapshot, 'self', 0, 'Flare Blitz', 0)]).snapshot;
  const nextHeadSmash = move(first, 'self', 0, 'Head Smash', 0);
  assert(/choice-lock/.test(nextHeadSmash.data.canFailReason || ''), 'Choice item locks the next move selection');
}

{
  const snapshot = snap({
    self: [
      makeMon('charizard', { item: 'Life Orb', moves: ['Air Slash'], side: 'self' }),
      makeMon('whimsicott', { moves: ['Tailwind'], side: 'self' }),
    ],
    enemy: [
      makeMon('amoonguss', { moves: ['Spore'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const result = simulateTurn(snapshot, [move(snapshot, 'self', 0, 'Air Slash', 0)]);
  assert(result.snapshot.sides.self.slots[0].pokemon.hpPct < 100, 'Life Orb applies recoil after damage');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanine', { moves: ['Head Smash'], side: 'self' }),
      makeMon('whimsicott', { moves: ['Tailwind'], side: 'self' }),
    ],
    enemy: [
      makeMon('charizard', { item: 'Charti Berry', moves: ['Air Slash'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const result = simulateTurn(snapshot, [move(snapshot, 'self', 0, 'Head Smash', 0)]);
  same(result.snapshot.sides.enemy.slots[0].pokemon.itemState.consumed, true, 'resist berry is consumed on super-effective hit');
}

{
  const snapshot = snap({
    self: [
      makeMon('whimsicott', { moves: ['Moonblast'], side: 'self' }),
      makeMon('amoonguss', { moves: ['Spore'], side: 'self' }),
    ],
    enemy: [
      makeMon('azumarill', { item: 'Sitrus Berry', hpPct: 55, moves: ['Aqua Jet'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const result = simulateTurn(snapshot, [move(snapshot, 'self', 0, 'Moonblast', 0)]);
  assert(result.events.some((event) => event.kind === 'heal' && event.actor === 'Azumarill'), 'Sitrus Berry heals when HP drops below threshold');
}

{
  const snapshot = snap({
    self: [
      makeMon('kingambit', { ability: 'Protosynthesis', item: 'Booster Energy', moves: ['Iron Head'], side: 'self' }),
      makeMon('whimsicott', { moves: ['Tailwind'], side: 'self' }),
    ],
    enemy: [
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
      makeMon('kingambit', { moves: ['Iron Head'], side: 'enemy' }),
    ],
  });
  const result = applySwitchInReactions(snapshot);
  same(result.snapshot.sides.self.slots[0].pokemon.itemState.consumed, true, 'Booster Energy is consumed');
  assert(!!result.snapshot.sides.self.slots[0].pokemon.volatiles.boosterStat, 'Booster Energy stores boosted stat');
}

{
  const full = snap({
    self: [
      makeMon('torkoal', { moves: ['Eruption'], hpPct: 100, side: 'self' }),
      makeMon('whimsicott', { moves: ['Tailwind'], side: 'self' }),
    ],
    enemy: [
      makeMon('kingambit', { moves: ['Iron Head'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const low = snap({
    self: [
      makeMon('torkoal', { moves: ['Eruption'], hpPct: 25, side: 'self' }),
      makeMon('whimsicott', { moves: ['Tailwind'], side: 'self' }),
    ],
    enemy: [
      makeMon('kingambit', { moves: ['Iron Head'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const fullDamage = estimateActionOutcome(full, move(full, 'self', 0, 'Eruption')).results[0].maxDamage;
  const lowDamage = estimateActionOutcome(low, move(low, 'self', 0, 'Eruption')).results[0].maxDamage;
  assert(fullDamage > lowDamage, 'Eruption scales down with missing HP');
}

{
  const snapshot = snap({
    self: [
      makeMon('clefairy', { moves: ['Helping Hand'], side: 'self' }),
      makeMon('arcanine', { moves: ['Flare Blitz'], side: 'self' }),
    ],
    enemy: [
      makeMon('amoonguss', { moves: ['Spore'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const baseline = estimateActionOutcome(snapshot, move(snapshot, 'self', 1, 'Flare Blitz', 0)).results[0].maxDamage;
  const boosted = simulateTurn(snapshot, [
    move(snapshot, 'self', 0, 'Helping Hand', 1),
    move(snapshot, 'self', 1, 'Flare Blitz', 0),
  ]).events.find((event) => event.kind === 'hit' && event.actor === 'Arcanine');
  assert(boosted?.damagePct > Math.floor((baseline / 181) * 100), 'Helping Hand increases ally damage output');
}

if (failures.length) {
  console.error('Competitive rule checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Competitive rule checks passed.');
