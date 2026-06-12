// =========================================================================
// rules/regulations.js — Regulaciones oficiales de Ranked Battle de
// Pokémon Champions, como DATOS (el motor no cambia entre regulaciones).
//
// Fuentes (consultadas 2026-06-12): Serebii (Ranked Battle Regulation M-A y
// M-B), Victory Road (Champions Regulations), Game8.
//
// roster: Set de speciesIds canónicos legales, o null si el roster completo
// aún no está verificado contra una fuente oficial. Con roster null la
// validación de roster se OMITE y se reporta como "no verificado" — nunca
// se inventa una lista. Para poblarlo: tools/build-regulation-roster.mjs
// (pendiente) debe validar cada id contra data/canonical/generated.js.
// =========================================================================

export const REGULATIONS = {
  'M-A': {
    id: 'M-A',
    label: 'Regulación M-A',
    from: '2026-04-08',
    to: '2026-06-17',
    // ~186 especies (las transferibles vía Pokémon HOME en el lanzamiento),
    // 59 con Mega. Lista completa pendiente de verificación → null.
    roster: null,
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
    // Añade especies y las nuevas Mega Raichu X/Y. Lista completa pendiente
    // de verificación → null.
    roster: null,
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
