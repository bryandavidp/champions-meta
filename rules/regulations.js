// =========================================================================
// rules/regulations.js — Regulaciones oficiales de Ranked Battle de
// Pokémon Champions, como DATOS (el motor no cambia entre regulaciones).
//
// Fuentes (consultadas 2026-06-12): Serebii (Ranked Battle Regulation M-A y
// M-B), Victory Road (Champions Regulations), Game8.
//
// roster: Set de speciesIds canónicos legales (rules/rosters/*, generados
// desde las listas oficiales de Serebii y validados contra
// data/canonical/generated.js en tests/rules), o null si la lista de una
// futura regulación aún no está verificada — nunca se inventa una lista.
// =========================================================================

import { REGULATION_M_A_ROSTER } from './rosters/regulation-m-a.js';
import { REGULATION_M_B_ROSTER } from './rosters/regulation-m-b.js';

export const REGULATIONS = {
  'M-A': {
    id: 'M-A',
    label: 'Regulación M-A',
    from: '2026-04-08',
    to: '2026-06-17',
    // 183 especies base + 60 Megas + formas regionales (lista oficial Serebii).
    roster: new Set(REGULATION_M_A_ROSTER),
    // Mega Lucario Z y Mega Garchomp Z están vetadas en M-A.
    bannedSpecies: new Set(['lucariomegaz', 'garchompmegaz']),
    mechanic: 'mega',
    omniRing: { oncePerBattle: true },
    clauses: ['species', 'item'],
    formats: ['doubles', 'singles'],
  },
  'M-B': {
    id: 'M-B',
    label: 'Regulación M-B',
    from: '2026-06-17',
    to: '2026-09-02',
    // M-A + Mega Raichu X/Y (lista oficial Serebii).
    roster: new Set(REGULATION_M_B_ROSTER),
    bannedSpecies: new Set(),
    mechanic: 'mega',
    omniRing: { oncePerBattle: true },
    clauses: ['species', 'item'],
    formats: ['doubles', 'singles'],
  },
};

export const DEFAULT_REGULATION_ID = 'M-B';

export function getRegulation(id) {
  return REGULATIONS[id] || null;
}

export function listRegulations() {
  return Object.values(REGULATIONS);
}

// Regulación vigente por fecha (las regulaciones rotan el día indicado en
// `to`, que es a la vez el `from` de la siguiente).
export function getActiveRegulation(date = new Date()) {
  // Duck-typing en vez de instanceof: las Date pueden venir de otro realm (vm de tests).
  const iso = typeof date?.toISOString === 'function'
    ? date.toISOString().slice(0, 10)
    : String(date).slice(0, 10);
  const active = listRegulations().find((reg) => iso >= reg.from && iso < reg.to);
  return active || getRegulation(DEFAULT_REGULATION_ID) || listRegulations().at(-1) || null;
}
