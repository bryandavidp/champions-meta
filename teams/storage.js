import { STORAGE_KEY } from '../core/constants.js';
import { state } from '../core/state.js';
import { resolveCanonicalId } from '../data/canonical/dex.js';

// v5: envoltura versionada { version, regulationId, teams } con validación de
// shape y migración automática desde el array plano v4 (que se conserva como
// backup, no se borra). Los consumidores siguen viendo un array de equipos.
export const STORAGE_KEY_V5 = 'offensive-matrix-saved-teams-v5';
const STORE_VERSION = 5;

function sanitizeMon(mon) {
  if (!mon || typeof mon !== 'object' || !mon.name) return null;
  const name = String(mon.name);
  return {
    // Normaliza ids con el dex canónico: repara equipos guardados cuando los
    // aliases base→forma estaban envenenados (butterfree→butterfreegmax).
    name: resolveCanonicalId('species', name) || name,
    displayName: String(mon.displayName || name),
    sprite: typeof mon.sprite === 'string' ? mon.sprite : '',
    types: Array.isArray(mon.types) ? mon.types.filter((t) => typeof t === 'string') : [],
    set: mon.set && typeof mon.set === 'object' ? mon.set : {},
  };
}

function sanitizeTeam(entry, index) {
  if (!entry || typeof entry !== 'object' || !Array.isArray(entry.mons)) return null;
  const mons = entry.mons.map(sanitizeMon).filter(Boolean);
  if (!mons.length) return null;
  return {
    id: String(entry.id || `${Date.now()}-${index}`),
    name: String(entry.name || `Equipo ${index + 1}`),
    rating: entry.rating != null ? String(entry.rating) : null,
    regulationId: entry.regulationId ? String(entry.regulationId) : null,
    mons,
  };
}

function sanitizeTeams(teams) {
  return (Array.isArray(teams) ? teams : []).map(sanitizeTeam).filter(Boolean);
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStore(teams) {
  try {
    localStorage.setItem(STORAGE_KEY_V5, JSON.stringify({
      version: STORE_VERSION,
      regulationId: state.rules?.regulationId || null,
      teams,
    }));
  } catch {
    // localStorage lleno o inaccesible: la app sigue funcionando sin persistir.
  }
}

function loadTeams() {
  const v5 = readJson(STORAGE_KEY_V5);
  if (v5 && typeof v5 === 'object' && Array.isArray(v5.teams)) {
    return sanitizeTeams(v5.teams);
  }

  // Migración v4 → v5 (el array v4 queda como backup, no se borra).
  const v4 = readJson(STORAGE_KEY);
  if (Array.isArray(v4) && v4.length) {
    const teams = sanitizeTeams(v4);
    writeStore(teams);
    return teams;
  }
  return [];
}

export function getSavedTeams() {
  return loadTeams();
}

export function setSavedTeams(teams) {
  writeStore(sanitizeTeams(teams));
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
    regulationId: state.rules?.regulationId || null,
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
