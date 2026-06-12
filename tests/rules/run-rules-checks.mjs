import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleHarness } from '../baseline/esm-loader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = await createModuleHarness(ROOT);
const rules = await harness.importModule('rules/index.js');

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

// --- Vetos verificados de M-A -------------------------------------------------
const banned = isSpeciesLegal('Lucario-Mega-Z', 'M-A');
// Mega Lucario Z no existe en @pkmn/dex (es exclusiva de Champions): si no es
// canónica, la legalidad queda sin verificar pero NO se inventa un veredicto.
assert(banned.legal === false || banned.verified === false,
  'Mega Lucario Z: vetada si es canónica, o sin verificar si no existe en el dex');

// --- Cláusulas -----------------------------------------------------------------
const speciesDup = validateTeam(
  [mon('Charizard'), mon('Charizard-Mega-Y'), mon('Pikachu'), mon('Eevee')],
  { regulation: 'M-A', format: 'doubles' },
);
same(speciesDup.legal, false, 'Species Clause: base + Mega de la misma especie es ilegal');
assert(speciesDup.violations.some((v) => v.rule === 'clause-species'), 'Species Clause reporta la violación');

const itemDup = validateTeam(
  [mon('Garchomp', 'Choice Scarf'), mon('Dragonite', 'Choice Scarf'), mon('Pikachu'), mon('Eevee')],
  { regulation: 'M-B', format: 'doubles' },
);
same(itemDup.legal, false, 'Item Clause: objeto repetido es ilegal');
assert(itemDup.violations.some((v) => v.rule === 'clause-item'), 'Item Clause reporta la violación');

const legalTeam = validateTeam(
  [mon('Garchomp', 'Choice Scarf'), mon('Dragonite', 'Leftovers'), mon('Pikachu', 'Light Ball'), mon('Eevee')],
  { regulation: 'M-B', format: 'doubles' },
);
same(legalTeam.legal, true, 'equipo sin duplicados es legal');
assert(legalTeam.warnings.some((w) => w.rule === 'roster-unverified'),
  'con roster sin poblar se advierte que la legalidad por roster no se valida');

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
