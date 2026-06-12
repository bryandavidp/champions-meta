// =========================================================================
// rules/formats.js — Formatos de Ranked Battle de Pokémon Champions.
// Fuente: Serebii (Ranked Battle Regulation M-A / M-B), junio 2026.
// La app solo cablea 'doubles' (formato oficial VGC); 'singles' queda
// definido como dato para una fase futura.
// =========================================================================

export const FORMATS = {
  doubles: {
    id: 'doubles',
    label: 'Dobles (VGC)',
    teamMin: 4,
    teamMax: 6,
    pick: 4,
    activePerSide: 2,
  },
  singles: {
    id: 'singles',
    label: 'Singles',
    teamMin: 3,
    teamMax: 6,
    pick: 3,
    activePerSide: 1,
  },
};

// Reglas comunes de Ranked: auto-nivel 50 y timers oficiales.
export const RANKED_BATTLE_RULES = {
  level: 50,
  autoLevel: true,
  timers: {
    teamPreviewSeconds: 90,
    playerTotalMinutes: 10,
    turnSeconds: 60,
  },
};

export function getFormat(id) {
  return FORMATS[id] || FORMATS.doubles;
}
