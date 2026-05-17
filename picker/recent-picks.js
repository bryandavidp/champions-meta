import { state } from '../core/state.js';

export function ensurePickerSearchState() {
  if (!state.pickerSearch) {
    state.pickerSearch = {
      index: [],
      indexReady: false,
      highlightedIndex: 0,
      recent: [],
      lastQuery: '',
      quickFiltersOpen: true,
      filters: { type: null, form: null, role: null },
    };
  }
  return state.pickerSearch;
}

export function registerRecentPick(name, side) {
  const searchState = ensurePickerSearchState();
  const next = [
    { name, side, ts: Date.now() },
    ...(searchState.recent || []).filter((item) => item.name !== name),
  ];
  searchState.recent = next.slice(0, 24);
}

export function getRecentBoost(entry) {
  const recent = ensurePickerSearchState().recent || [];
  const hit = recent.findIndex((item) => item.name === entry.name);
  if (hit === -1) return 0;
  return Math.max(10, 80 - hit * 10);
}

export function getRecentEntries(entries, limit = 8) {
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  return (ensurePickerSearchState().recent || [])
    .map((item) => byName.get(item.name))
    .filter(Boolean)
    .slice(0, limit);
}
