import { TEST_TEAMS } from '../core/constants.js';
import { state } from '../core/state.js';
import { getSavedTeams } from './storage.js';
import { fetchPokemon, ensureBattleState } from '../data/pokemon.js';
import { buildDefaultSetForSpecies, resolveTeamItems } from '../data/sets.js';
import { flowLog } from '../utils/debug.js';
import { scheduleMoveWarmup, requestUiRender, setBatchUpdatingBridge } from '../bridges/ui-bridges.js';

export async function loadSavedTeam(id, side = 'self') {
  const teams = getSavedTeams();
  const team = teams.find((entry) => entry.id === id);
  if (!team) return;

  const mons = await Promise.all(
    team.mons.map(async (saved) => {
      try {
        const mon = await fetchPokemon(saved.name);
        mon.set = saved.set || mon.set;
        if (!Array.isArray(mon.set?.moves)) mon.set.moves = ['', '', '', ''];
        while (mon.set.moves.length < 4) mon.set.moves.push('');
        return mon;
      } catch {
        return saved;
      }
    }),
  );

  state[side] = mons.slice(0, 6);
  state.leads[side] = [];
  while (state[side].length < 6) state[side].push(null);
  mons.forEach((mon) => {
    ensureBattleState(mon);
  });
  scheduleMoveWarmup();
}

export async function loadTestTeam(index, side = 'self') {
  const team = TEST_TEAMS[index];
  if (!team) return;

  const mons = await Promise.all(
    team.mons.map(async (testMon) => {
      try {
        const mon = await fetchPokemon(testMon.name);
        mon.set = { ...mon.set, ...testMon.set };
        if (!Array.isArray(mon.set.moves)) mon.set.moves = ['', '', '', ''];
        while (mon.set.moves.length < 4) mon.set.moves.push('');
        ensureBattleState(mon);
        return mon;
      } catch {
        return null;
      }
    }),
  );

  state[side] = mons.filter(Boolean).slice(0, 6);
  state.leads[side] = [];
  while (state[side].length < 6) state[side].push(null);

  if (side === 'self') state.activeSelfSlots = [0, 1];
  if (side === 'enemy') state.activeEnemySlots = [0, 1];

  scheduleMoveWarmup();
}

export async function fillTeamWithSpecies(side, speciesList) {
  flowLog('fillTeamWithSpecies: Inicio', { side, speciesList });
  setBatchUpdatingBridge(true);
  try {
    const mons = [];
    for (let i = 0; i < Math.min(speciesList.length, 6); i++) {
      try {
        const mon = await fetchPokemon(speciesList[i]);
        mon.set = buildDefaultSetForSpecies(mon.name, side, i);
        ensureBattleState(mon);
        mons.push(mon);
      } catch {}
    }
    resolveTeamItems(mons);
    state[side] = mons;
    while (state[side].length < 6) state[side].push(null);

    state.leads[side] = [];
    if (side === 'self') state.activeSelfSlots = [0, 1];
    if (side === 'enemy') state.activeEnemySlots = [0, 1];

    scheduleMoveWarmup();
    flowLog('fillTeamWithSpecies: Completado, scheduleMoveWarmup llamado', { side, monsCount: mons.length });
  } finally {
    setBatchUpdatingBridge(false);
    flowLog('fillTeamWithSpecies: finally -> solicitando renderAll', { side });
    requestUiRender();
  }
}
