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
  SYNERGY_ENGINE_VERSION,
  SYNERGY_FAMILIES,
  buildSynergyReport,
  buildThreatGraph,
  detectTacticalFindings,
} = await harness.importModule('analysis/synergy-engine.js');
const {
  TACTICAL_FINDINGS_ADAPTER_VERSION,
  buildTacticalSummary,
} = await harness.importModule('analysis/tactical-findings-adapter.js');
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
    phase: 'analysis',
    source: 'synergy-engine-test',
  });
}

function hasFamily(report, family, side = null) {
  return report.findings.some((finding) => finding.family === family && (!side || finding.side === side));
}

function finding(report, family, side = null) {
  return report.findings.find((item) => item.family === family && (!side || item.side === side));
}

same(SYNERGY_ENGINE_VERSION, 'synergy-engine-v1', 'synergy engine version');
same(TACTICAL_FINDINGS_ADAPTER_VERSION, 'tactical-findings-adapter-v1', 'tactical adapter version');

{
  const snapshot = snap({
    self: [
      makeMon('whimsicott', { ability: 'Prankster', moves: ['Tailwind'], side: 'self' }),
      makeMon('torkoal', { moves: ['Eruption'], side: 'self' }),
    ],
    enemy: [
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
      makeMon('kingambit', { moves: ['Iron Head'], side: 'enemy' }),
    ],
  });
  const report = buildSynergyReport(snapshot);
  assert(hasFamily(report, SYNERGY_FAMILIES.SPEED_CONTROL, 'self'), 'Whimsicott Tailwind creates speed-control finding');
  assert(hasFamily(report, SYNERGY_FAMILIES.VARIABLE_POWER_WINCON, 'self'), 'Torkoal Eruption creates variable-power wincon finding');
  assert(report.graph.edges.some((edge) => edge.family === SYNERGY_FAMILIES.SPEED_CONTROL && edge.type === 'enables'), 'speed control graph links enabler to payoff');
  const summary = buildTacticalSummary(snapshot, { highlightLimit: 4, includeActionEvidence: false });
  assert(summary.highlights.length > 0, 'tactical summary exposes quick highlights');
  assert(!!summary.byFamily[SYNERGY_FAMILIES.SPEED_CONTROL], 'tactical summary groups findings by family');
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
  const report = buildSynergyReport(snapshot);
  assert(hasFamily(report, SYNERGY_FAMILIES.SPREAD_ABUSE, 'self'), 'Earthquake creates spread pressure finding');
  const immunity = finding(report, SYNERGY_FAMILIES.IMMUNITY_CORE, 'self');
  assert(!!immunity, 'Dragonite ally immunity creates immunity-core finding');
  assert(immunity.evidence.some((entry) => /tierra|ground|inmun/i.test(JSON.stringify(entry))), 'immunity evidence includes block reason');
}

{
  const snapshot = snap({
    self: [
      makeMon('raichu', { moves: ['Fake Out'], side: 'self' }),
      makeMon('hatterene', { moves: ['Trick Room'], side: 'self' }),
    ],
    enemy: [
      makeMon('arcanine', { moves: ['Flare Blitz'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const report = buildSynergyReport(snapshot);
  assert(hasFamily(report, SYNERGY_FAMILIES.FAKE_OUT_SETUP, 'self'), 'Fake Out + Trick Room creates setup finding');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanine', { moves: ['Head Smash'], side: 'self' }),
      makeMon('kingambit', { moves: ['Iron Head'], side: 'self' }),
    ],
    enemy: [
      makeMon('indeedee', { ability: 'Psychic Surge', moves: ['Follow Me'], side: 'enemy' }),
      makeMon('hatterene', { moves: ['Trick Room'], side: 'enemy' }),
    ],
    field: { terrain: 'psychic' },
  });
  const report = buildSynergyReport(snapshot);
  assert(hasFamily(report, SYNERGY_FAMILIES.REDIRECTION_SETUP, 'enemy'), 'Follow Me + Trick Room creates redirection setup finding');
  assert(hasFamily(report, SYNERGY_FAMILIES.TERRAIN_CORE, 'enemy'), 'Psychic terrain creates terrain core finding');
  assert(hasFamily(report, SYNERGY_FAMILIES.PRIORITY_DENIAL, 'enemy'), 'Psychic terrain creates priority-denial context');
}

{
  const snapshot = snap({
    self: [
      makeMon('charizard', { moves: ['Weather Ball', 'Solar Beam'], side: 'self' }),
      makeMon('torkoal', { ability: 'Drought', moves: ['Eruption'], side: 'self' }),
    ],
    enemy: [
      makeMon('azumarill', { moves: ['Aqua Jet'], side: 'enemy' }),
      makeMon('kingambit', { moves: ['Iron Head'], side: 'enemy' }),
    ],
    field: { weather: 'sun' },
  });
  const report = buildSynergyReport(snapshot);
  assert(hasFamily(report, SYNERGY_FAMILIES.WEATHER_CORE, 'self'), 'Drought/sun + Weather Ball creates weather core finding');
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
  const report = buildSynergyReport(snapshot);
  assert(hasFamily(report, SYNERGY_FAMILIES.ANTI_INTIMIDATE, 'enemy'), 'Defiant/Competitive against Intimidate creates anti-intimidate finding');
}

{
  const snapshot = snap({
    self: [
      makeMon('arcanine', { moves: ['Extreme Speed'], side: 'self' }),
      makeMon('azumarill', { moves: ['Aqua Jet'], side: 'self' }),
    ],
    enemy: [
      makeMon('farigiraf', { ability: 'Armor Tail', moves: ['Psychic'], side: 'enemy' }),
      makeMon('tyranitar', { moves: ['Rock Slide'], side: 'enemy' }),
    ],
  });
  const findings = detectTacticalFindings(snapshot);
  assert(findings.some((entry) => entry.family === SYNERGY_FAMILIES.PRIORITY_DENIAL && entry.side === 'enemy'), 'Armor Tail creates priority-denial finding');
  assert(findings.some((entry) => entry.family === SYNERGY_FAMILIES.PRIORITY_GAMES && entry.side === 'self'), 'priority moves create priority-games finding');
  const graph = buildThreatGraph(snapshot);
  assert(graph.nodes.some((node) => node.type === 'pokemon' && node.label === 'Farigiraf'), 'threat graph includes Farigiraf node');
}

if (failures.length) {
  console.error('Synergy engine checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Synergy engine checks passed.');
