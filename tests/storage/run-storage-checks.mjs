import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleHarness } from '../baseline/esm-loader.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harness = await createModuleHarness(ROOT);

const V4_KEY = 'offensive-matrix-saved-teams-v4';
const V5_KEY = 'offensive-matrix-saved-teams-v5';

// Siembra un v4 con un equipo válido, otro corrupto y un mon malformado.
harness.context.localStorage.setItem(V4_KEY, JSON.stringify([
  {
    id: '1',
    name: 'Equipo legado',
    rating: '1760',
    mons: [
      { name: 'garchomp', displayName: 'Garchomp', sprite: '', types: ['dragon', 'ground'], set: { item: 'Choice Scarf' } },
      { name: null },
      'basura',
    ],
  },
  { id: '2', name: 'Equipo vacío', mons: [] },
  'no-es-un-equipo',
]));

const storage = await harness.importModule('teams/storage.js');

const failures = [];
function assert(condition, label, details = '') {
  if (!condition) failures.push(details ? `${label}: ${details}` : label);
}
function same(actual, expected, label) {
  assert(Object.is(actual, expected), label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const teams = storage.getSavedTeams();
same(teams.length, 1, 'la migración descarta equipos corruptos o vacíos');
same(teams[0].name, 'Equipo legado', 'el equipo válido sobrevive');
same(teams[0].mons.length, 1, 'los mons malformados se descartan');
same(teams[0].mons[0].name, 'garchomp', 'el id canónico se conserva');

const v5 = JSON.parse(harness.context.localStorage.getItem(V5_KEY));
same(v5?.version, 5, 'el store migrado queda versionado como v5');
assert(Array.isArray(v5?.teams), 'el v5 envuelve los equipos en un objeto');
assert(harness.context.localStorage.getItem(V4_KEY) !== null, 'el v4 se conserva como backup');

storage.setSavedTeams([...teams, { id: '3', name: 'Nuevo', mons: [{ name: 'dragonite', set: {} }] }]);
same(storage.getSavedTeams().length, 2, 'setSavedTeams escribe y relee en v5');

if (failures.length) {
  console.error('Storage checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Storage checks passed (migración v4→v5 con saneo de shape).');
