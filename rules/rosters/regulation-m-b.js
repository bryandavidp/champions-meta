// =========================================================================
// rules/rosters/regulation-m-b.js — Roster legal de la Regulación M-B.
//
// Delta sobre M-A según la lista oficial "Newly Useable Pokémon" de Serebii
// (serebii.net/pokemonchampions/rankedbattle/regulationm-b.shtml,
// extraído el 2026-06-12): añade Mega Raichu X y Mega Raichu Y.
// Mega Lucario Z y Mega Garchomp Z siguen fuera del roster mientras no
// aparezcan en la lista oficial de usables.
// =========================================================================

import { REGULATION_M_A_ROSTER } from './regulation-m-a.js';

export const REGULATION_M_B_ROSTER = [
  ...REGULATION_M_A_ROSTER,
  'raichumegax',
  'raichumegay',
];
