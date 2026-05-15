import { STORAGE_KEY } from '../core/constants.js';
import { state } from '../core/state.js';

export function getSavedTeams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function setSavedTeams(teams) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
}

export function saveCurrentTeam(teamName) {
  const name = (teamName || "").trim();
  const mons = state.self.filter(Boolean);

  if (!mons.length) {
    alert("Tu equipo está vacío.");
    return;
  }

  const teams = getSavedTeams();
  const entry = {
    id: String(Date.now()),
    name: name || `Equipo ${teams.length + 1}`,
    rating: state.rating,
    mons: mons.map((mon) => ({
      name: mon.name,
      displayName: mon.displayName,
      sprite: mon.sprite,
      types: mon.types,
      set: mon.set,
    })),
  };

  teams.unshift(entry);
  setSavedTeams(teams.slice(0, 20));
}

export function deleteSavedTeam(id) {
  const teams = getSavedTeams().filter((t) => t.id !== id);
  setSavedTeams(teams);
}
