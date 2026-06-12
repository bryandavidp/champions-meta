import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleHarness } from '../baseline/esm-loader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = await createModuleHarness(ROOT);
const rules = await harness.importModule('rules/index.js');
const { CanonicalDex } = await harness.importModule('data/canonical/dex.js');

const {
  FORMATS,
  RANKED_BATTLE_RULES,
  getActiveRegulation,
  getFormat,
  getRegulation,
  isSpeciesLegal,
  listRegulations,
  validateTeam,
} = rules;

const failures = [];

function assert(condition, label, details = '') {
  if (!condition) failures.push(details ? `${label}: ${details}` : label);
}

function same(actual, expected, label) {
  assert(Object.is(actual, expected), label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function mon(name, item = null) {
  return { name, displayName: name, set: item ? { item } : {} };
}

// --- Regulación activa por fecha --------------------------------------------
same(getActiveRegulation(new Date('2026-06-12'))?.id, 'M-A', 'el 12-jun rige M-A');
same(getActiveRegulation(new Date('2026-06-17'))?.id, 'M-B', 'el 17-jun arranca M-B');
same(getActiveRegulation(new Date('2026-08-01'))?.id, 'M-B', 'el 1-ago sigue M-B');
same(getActiveRegulation(new Date('2027-01-01'))?.id, 'M-B', 'fuera de rango cae a la regulación por defecto');
same(listRegulations().length >= 2, true, 'hay al menos M-A y M-B definidas');

// --- Formatos y reglas de ranked ---------------------------------------------
same(getFormat('doubles').pick, 4, 'dobles elige 4');
same(getFormat('doubles').teamMin, 4, 'dobles exige equipo de 4-6');
same(getFormat('singles').pick, 3, 'singles elige 3');
same(FORMATS.doubles.activePerSide, 2, 'dobles juega 2 activos por lado');
same(RANKED_BATTLE_RULES.level, 50, 'auto-nivel 50');
same(RANKED_BATTLE_RULES.timers.teamPreviewSeconds, 90, 'team preview de 90s');
same(RANKED_BATTLE_RULES.timers.turnSeconds, 60, 'turno de 60s');

// --- Roster oficial y vetos -----------------------------------------------------
const regA = getRegulation('M-A');
const regB = getRegulation('M-B');
assert(regA.roster?.size >= 250, 'el roster de M-A está poblado (259 ids oficiales)');
same(regB.roster.size, regA.roster.size + 2, 'M-B añade exactamente Mega Raichu X e Y');
same(isSpeciesLegal('lucariomegaz', 'M-A').legal, false, 'Mega Lucario Z vetada en M-A');
same(isSpeciesLegal('garchompmegaz', 'M-A').legal, false, 'Mega Garchomp Z vetada en M-A');
same(isSpeciesLegal('lucariomegaz', 'M-B').legal, false, 'Mega Lucario Z fuera del roster M-B (no legal por tener la base)');
same(isSpeciesLegal('raichumegax', 'M-A').legal, false, 'Mega Raichu X aún no es legal en M-A');
same(isSpeciesLegal('raichumegax', 'M-B').legal, true, 'Mega Raichu X es legal en M-B');
same(isSpeciesLegal('Garchomp', 'M-A').legal, true, 'Garchomp base es legal en M-A');
same(isSpeciesLegal('Koraidon', 'M-A').legal, false, 'Koraidon está fuera del roster M-A');
same(isSpeciesLegal('Tauros-Paldea-Aqua', 'M-A').legal, true, 'las formas regionales del roster son legales');

// Integridad: todos los ids del roster existen en el dex canónico.
for (const reg of [regA, regB]) {
  const missing = [...reg.roster].filter((id) => !CanonicalDex.species[id]);
  assert(missing.length === 0, `roster ${reg.id} validado contra el dex`, missing.join(', '));
}

// --- Cláusulas -----------------------------------------------------------------
const speciesDup = validateTeam(
  [mon('Charizard'), mon('Charizard-Mega-Y'), mon('Pikachu'), mon('Snorlax')],
  { regulation: 'M-A', format: 'doubles' },
);
same(speciesDup.legal, false, 'Species Clause: base + Mega de la misma especie es ilegal');
assert(speciesDup.violations.some((v) => v.rule === 'clause-species'), 'Species Clause reporta la violación');

const itemDup = validateTeam(
  [mon('Garchomp', 'Choice Scarf'), mon('Dragonite', 'Choice Scarf'), mon('Pikachu'), mon('Snorlax')],
  { regulation: 'M-B', format: 'doubles' },
);
same(itemDup.legal, false, 'Item Clause: objeto repetido es ilegal');
assert(itemDup.violations.some((v) => v.rule === 'clause-item'), 'Item Clause reporta la violación');

const legalTeam = validateTeam(
  [mon('Garchomp', 'Choice Scarf'), mon('Dragonite', 'Leftovers'), mon('Pikachu', 'Light Ball'), mon('Snorlax')],
  { regulation: 'M-B', format: 'doubles' },
);
same(legalTeam.legal, true, 'equipo del roster sin duplicados es legal');
same(legalTeam.warnings.some((w) => w.rule === 'roster-unverified'), false,
  'con roster poblado ya no hay advertencia de roster sin verificar');

const offRoster = validateTeam(
  [mon('Koraidon'), mon('Garchomp'), mon('Pikachu'), mon('Snorlax')],
  { regulation: 'M-B', format: 'doubles' },
);
same(offRoster.legal, false, 'un equipo con un Pokémon fuera de roster es ilegal');
assert(offRoster.violations.some((v) => v.rule === 'roster'), 'la violación de roster se reporta');

// --- Tamaño de equipo -----------------------------------------------------------
const small = validateTeam([mon('Pikachu')], { regulation: 'M-B', format: 'doubles' });
assert(small.warnings.some((w) => w.rule === 'team-size'), 'equipo de 1 avisa de tamaño en dobles');
const seven = validateTeam(
  ['Pikachu', 'Eevee', 'Garchomp', 'Dragonite', 'Charizard', 'Blastoise', 'Venusaur'].map((n) => mon(n)),
  { regulation: 'M-B', format: 'doubles' },
);
same(seven.legal, false, 'equipo de 7 es ilegal');

if (failures.length) {
  console.error('Rules checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Rules checks passed (${listRegulations().length} regulaciones, formatos dobles/singles, cláusulas species+item).`);
