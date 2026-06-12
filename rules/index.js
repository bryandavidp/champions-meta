// =========================================================================
// rules/index.js — API pública de la capa de regulaciones.
// validateTeam(team, { regulation, format }) → { legal, violations, warnings }
// Las violaciones marcan ilegalidades verificadas; las advertencias señalan
// lo que no se puede verificar (p.ej. roster aún no poblado). Nunca bloquea
// la edición: la UI decide cómo mostrarlo.
// =========================================================================

import { getCanonicalSpecies } from '../data/canonical/dex.js';
import { CLAUSE_CHECKS, speciesIdentity } from './clauses.js';
import { FORMATS, RANKED_BATTLE_RULES, getFormat } from './formats.js';
import {
  DEFAULT_REGULATION_ID,
  REGULATIONS,
  getActiveRegulation,
  getRegulation,
  listRegulations,
} from './regulations.js';

export {
  CLAUSE_CHECKS,
  DEFAULT_REGULATION_ID,
  FORMATS,
  RANKED_BATTLE_RULES,
  REGULATIONS,
  getActiveRegulation,
  getFormat,
  getRegulation,
  listRegulations,
  speciesIdentity,
};

function monLabel(mon) {
  return mon?.displayName || mon?.name || 'Slot';
}

export function isSpeciesLegal(monOrName, regulation) {
  const reg = typeof regulation === 'string' ? getRegulation(regulation) : regulation;
  if (!reg) return { legal: true, verified: false, reason: 'sin regulación' };
  const species = getCanonicalSpecies(
    typeof monOrName === 'string' ? monOrName : (monOrName?.speciesId || monOrName?.name || monOrName?.displayName || ''),
  );
  const id = species?.id || null;
  if (!id) return { legal: true, verified: false, reason: 'especie no canónica' };
  if (reg.bannedSpecies?.has(id)) return { legal: false, verified: true, reason: `vetado en ${reg.id}` };
  if (!reg.roster) return { legal: true, verified: false, reason: `roster de ${reg.id} no verificado` };
  // Las Megas se listan una a una en el roster oficial: una Mega fuera de
  // lista NO es legal por tener su base en el roster. Para el resto de
  // formas (género, cosméticas) basta con la especie base.
  const inRoster = species?.isMega
    ? reg.roster.has(id)
    : reg.roster.has(id) || (species?.baseSpeciesId && reg.roster.has(species.baseSpeciesId));
  return inRoster
    ? { legal: true, verified: true, reason: null }
    : { legal: false, verified: true, reason: `fuera del roster de ${reg.id}` };
}

export function validateTeam(team = [], { regulation = null, format = 'doubles' } = {}) {
  const reg = (typeof regulation === 'string' ? getRegulation(regulation) : regulation) || getActiveRegulation();
  const fmt = getFormat(format);
  const mons = (team || []).filter(Boolean);
  const violations = [];
  const warnings = [];

  // Tamaño de equipo según formato (4–6 en dobles).
  if (mons.length > 0 && mons.length < fmt.teamMin) {
    warnings.push({
      rule: 'team-size',
      message: `Equipo incompleto para ${fmt.label}: ${mons.length}/${fmt.teamMin} mínimo (se eligen ${fmt.pick}).`,
    });
  }
  if (mons.length > fmt.teamMax) {
    violations.push({
      rule: 'team-size',
      message: `Equipo de ${mons.length} supera el máximo de ${fmt.teamMax} en ${fmt.label}.`,
    });
  }

  // Cláusulas de la regulación (species + item).
  for (const clauseId of reg?.clauses || []) {
    const check = CLAUSE_CHECKS[clauseId];
    if (!check) continue;
    for (const violation of check(mons)) {
      violations.push({ rule: `clause-${violation.clause}`, message: violation.message, mons: violation.mons });
    }
  }

  // Legalidad de especies (vetos verificados + roster si está poblado).
  let rosterUnverified = false;
  for (const mon of mons) {
    const legality = isSpeciesLegal(mon, reg);
    if (!legality.legal) {
      violations.push({ rule: 'roster', message: `${monLabel(mon)}: ${legality.reason}.`, mons: [mon] });
    } else if (!legality.verified && reg && !reg.roster) {
      rosterUnverified = true;
    }
  }
  if (rosterUnverified && reg) {
    warnings.push({
      rule: 'roster-unverified',
      message: `El roster completo de ${reg.id} aún no está cargado: la legalidad por roster no se valida (los vetos conocidos sí).`,
    });
  }

  return {
    legal: violations.length === 0,
    regulationId: reg?.id || null,
    format: fmt.id,
    violations,
    warnings,
  };
}

// Identificador estable para versionar caches que dependan de la regulación.
export const RULES_VERSION = 1;
