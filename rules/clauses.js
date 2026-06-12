// =========================================================================
// rules/clauses.js — Cláusulas oficiales de Ranked Battle (validaciones puras).
// Species Clause: sin especies repetidas. Item Clause: sin objetos repetidos.
// Cada validador devuelve una lista de violaciones (vacía = legal).
// =========================================================================

import { getCanonicalSpecies } from '../data/canonical/dex.js';

function normalizeId(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function monLabel(mon) {
  return mon?.displayName || mon?.name || 'Slot';
}

// Identidad de especie para la cláusula: la especie base canónica, de modo
// que dos formas de la misma especie (p.ej. base y Mega) cuenten como una.
export function speciesIdentity(mon) {
  const raw = mon?.speciesId || mon?.name || mon?.displayName || '';
  const canonical = getCanonicalSpecies(raw);
  return normalizeId(canonical?.baseSpeciesId || canonical?.id || raw);
}

export function checkSpeciesClause(team = []) {
  const seen = new Map();
  const violations = [];
  for (const mon of team) {
    if (!mon) continue;
    const id = speciesIdentity(mon);
    if (!id) continue;
    if (seen.has(id)) {
      violations.push({
        clause: 'species',
        message: `Species Clause: ${monLabel(mon)} repite especie con ${monLabel(seen.get(id))}.`,
        mons: [seen.get(id), mon],
      });
    } else {
      seen.set(id, mon);
    }
  }
  return violations;
}

export function checkItemClause(team = []) {
  const seen = new Map();
  const violations = [];
  for (const mon of team) {
    if (!mon) continue;
    const item = normalizeId(mon?.set?.item || mon?.item || '');
    if (!item) continue;
    if (seen.has(item)) {
      violations.push({
        clause: 'item',
        message: `Item Clause: ${monLabel(mon)} repite el objeto de ${monLabel(seen.get(item))}.`,
        mons: [seen.get(item), mon],
      });
    } else {
      seen.set(item, mon);
    }
  }
  return violations;
}

export const CLAUSE_CHECKS = {
  species: checkSpeciesClause,
  item: checkItemClause,
};
