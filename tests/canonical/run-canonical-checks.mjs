import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleHarness } from '../baseline/esm-loader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = await createModuleHarness(ROOT);
const dex = await harness.importModule('data/canonical/dex.js');

const {
  CanonicalDex,
  canonicalizeTerrain,
  canonicalizeWeather,
  getCanonicalAbility,
  getCanonicalItem,
  getCanonicalMove,
  getCanonicalMoveFlag,
  getCanonicalMovePriority,
  getCanonicalSpecies,
  isCanonicalSpreadMove,
  resolveCanonicalId,
  toLegacyMoveInfo,
  toLegacySpeciesInfo,
} = dex;

const failures = [];

function assert(condition, label, details = '') {
  if (!condition) {
    failures.push(details ? `${label}: ${details}` : label);
  }
}

function same(actual, expected, label) {
  assert(Object.is(actual, expected), label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const counts = {
  species: Object.keys(CanonicalDex.species || {}).length,
  moves: Object.keys(CanonicalDex.moves || {}).length,
  abilities: Object.keys(CanonicalDex.abilities || {}).length,
  items: Object.keys(CanonicalDex.items || {}).length,
};

assert(counts.species >= 1500, 'species coverage', JSON.stringify(counts));
assert(counts.moves >= 1000, 'move coverage', JSON.stringify(counts));
assert(counts.abilities >= 370, 'ability coverage', JSON.stringify(counts));
assert(counts.items >= 650, 'item coverage', JSON.stringify(counts));

same(resolveCanonicalId('moves', 'Viento Afin'), 'tailwind', 'Spanish move alias resolves to Tailwind');
same(resolveCanonicalId('moves', 'Viento Afín'), 'tailwind', 'accented Spanish move alias resolves to Tailwind');
same(resolveCanonicalId('items', 'Banda Focus'), 'focussash', 'Spanish item alias resolves to Focus Sash');
same(resolveCanonicalId('species', 'Mega Charizard Y'), 'charizardmegay', 'form alias resolves to Mega Charizard Y');
// Regresión: el alias de una forma no debe secuestrar a la especie base.
same(resolveCanonicalId('species', 'Butterfree'), 'butterfree', 'base species resolves to itself (not Gmax form)');
same(resolveCanonicalId('species', 'Venusaur'), 'venusaur', 'base species resolves to itself (not Mega form)');
same(getCanonicalSpecies('Venusaur')?.isMega ?? false, false, 'Venusaur base is not flagged as Mega');
same(canonicalizeWeather('tormenta arena'), 'sand', 'Spanish weather alias resolves to sand');
same(canonicalizeTerrain('Campo Psiquico'), 'psychic', 'Spanish terrain alias resolves to psychic');

const earthquake = getCanonicalMove('earthquake');
assert(earthquake, 'Earthquake exists');
same(earthquake?.targetMode, 'allAdjacent', 'Earthquake target mode');
same(earthquake?.isSpread, true, 'Earthquake spread flag');
same(earthquake?.allyHit, true, 'Earthquake hits adjacent ally');
same(getCanonicalMoveFlag('earthquake', 'protect'), true, 'Earthquake protect flag');
same(isCanonicalSpreadMove('earthquake'), true, 'Spread helper detects Earthquake');

const discharge = getCanonicalMove('discharge');
same(discharge?.targetMode, 'allAdjacent', 'Discharge target mode');
same(discharge?.allyHit, true, 'Discharge hits adjacent ally');

const hyperVoice = getCanonicalMove('Hyper Voice');
same(hyperVoice?.flags?.sound, true, 'Hyper Voice sound flag');
same(hyperVoice?.isSpread, true, 'Hyper Voice spread flag');

const tailwind = getCanonicalMove('tailwind');
same(tailwind?.sideCondition, 'tailwind', 'Tailwind side condition');
same(tailwind?.flags?.wind, true, 'Tailwind wind flag');

const trickRoom = getCanonicalMove('trickroom');
same(trickRoom?.pseudoWeather, 'trickroom', 'Trick Room pseudo weather');
same(getCanonicalMovePriority('trickroom'), -7, 'Trick Room priority');

const protect = getCanonicalMove('protect');
same(protect?.volatileStatus, 'protect', 'Protect volatile status');
same(getCanonicalMovePriority('protect'), 4, 'Protect priority');

const fakeOut = getCanonicalMove('fakeout');
same(getCanonicalMovePriority(fakeOut), 3, 'Fake Out priority');
assert(
  fakeOut?.secondary?.volatileStatus === 'flinch' ||
    fakeOut?.secondaries?.some((secondary) => secondary?.volatileStatus === 'flinch'),
  'Fake Out flinch secondary'
);

const bodyPress = getCanonicalMove('bodypress');
same(bodyPress?.usesDefenseStat, true, 'Body Press uses user defense');
same(bodyPress?.overrideOffensiveStat, 'def', 'Body Press offensive stat override');

const foulPlay = getCanonicalMove('foulplay');
same(foulPlay?.usesTargetAttack, true, 'Foul Play uses target attack');
same(foulPlay?.overrideOffensivePokemon, 'target', 'Foul Play offensive Pokemon override');

const weatherBall = getCanonicalMove('weatherball');
assert(weatherBall?.callbacks?.power || weatherBall?.callbacks?.type, 'Weather Ball dynamic callbacks', JSON.stringify(weatherBall?.callbacks || {}));
assert(weatherBall?.callbackTags?.includes('dynamic-type'), 'Weather Ball tagged as dynamic type');

const charizardY = getCanonicalSpecies('charizardmegay');
same(charizardY?.baseSpeciesId, 'charizard', 'Mega Charizard Y base species');
same(charizardY?.requiredItemId, 'charizarditey', 'Mega Charizard Y required item');
same(charizardY?.isMega, true, 'Mega Charizard Y mega flag');

const whimsicott = getCanonicalSpecies('whimsicott');
same(whimsicott?.abilityIds?.H, 'chlorophyll', 'Whimsicott hidden ability slot');
same(whimsicott?.abilityIds?.['0'], 'prankster', 'Whimsicott Prankster slot');

const prankster = getCanonicalAbility('Bromista');
same(prankster?.id, 'prankster', 'Spanish ability alias resolves to Prankster');
assert(prankster?.tags?.includes('priority'), 'Prankster priority tag');

const focusSash = getCanonicalItem('Banda Focus');
same(focusSash?.id, 'focussash', 'Focus Sash item exists');
assert(focusSash?.tags?.includes('survival'), 'Focus Sash survival tag');

const legacyMove = toLegacyMoveInfo('Earthquake');
same(legacyMove?.isSpread, true, 'legacy move adapter preserves spread');
same(legacyMove?.damageClass, 'physical', 'legacy move adapter preserves damage class');

const legacySpecies = toLegacySpeciesInfo('Azumarill');
same(legacySpecies?.baseStats?.speed, 50, 'legacy species adapter exposes PokeAPI speed key');
same(legacySpecies?.baseStats?.spe, 50, 'legacy species adapter exposes Showdown speed key');

if (failures.length) {
  console.error('Canonical dex checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Canonical dex checks passed (${counts.species} species, ${counts.moves} moves, ${counts.abilities} abilities, ${counts.items} items).`);
