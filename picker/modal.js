// picker/modal.js
// Responsabilidad: Orquestacion del modal de seleccion y Pokedex

import { state } from '../core/state.js';
import { PICKER } from '../core/dom.js';
import { normalizeText, formatName } from '../utils/text.js';
import { ensureBattleState, fetchPokemon } from '../data/pokemon.js';
import { buildDefaultSetForSpecies } from '../data/sets.js';
import { scheduleMoveWarmup } from '../bridges/ui-bridges.js';
import { renderAll } from '../render/app.js';
import { flowLog } from '../utils/debug.js';
import { ensurePokemonSearchIndex, invalidatePokemonSearchIndex } from './search-index.js';
import { searchPokemon } from './search-engine.js';
import { renderPokemonResults } from './render-results.js';
import { registerRecentPick } from './recent-picks.js';
import { bindPickerKeyboard } from './keyboard.js';

let pendingPickerRender = false;
let pickingInProgress = false;

function isTouchViewport() {
  return typeof window !== 'undefined'
    && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 760);
}

function focusSearchInput() {
  if (isTouchViewport()) return;
  setTimeout(() => PICKER.searchInput.focus(), 20);
}

export function ensurePokedex() {
  if (!state.metaRanked.length) {
    state.pokedex = [];
    invalidatePokemonSearchIndex();
    return;
  }

  state.pokedex = state.metaRanked.map((record) => ({
    name: record.slug,
    displayName: record.displayName,
    usage: record.usage,
    rank: record.rank,
  }));

  invalidatePokemonSearchIndex();
  ensurePokemonSearchIndex();
  document.getElementById('searchHint').textContent = `${state.pokedex.length} Pokemon meta cargados desde Smogon`;
}

export function renderPokedex(query = '') {
  ensurePokemonSearchIndex();
  const payload = searchPokemon(query, {
    side: state.modal.side,
    slotIndex: state.modal.index,
  });

  state.pickerSearch.lastQuery = query;
  state.pickerSearch.highlightedIndex = Math.min(
    state.pickerSearch.highlightedIndex || 0,
    Math.max(0, payload.results.length - 1),
  );

  PICKER.resultList.innerHTML = renderPokemonResults(payload, query);
}

export function openModal(side, index) {
  state.modal = { side, index };
  PICKER.title.textContent =
    side === 'self'
      ? `Tu equipo · Slot ${index + 1}`
      : `Rival · Slot ${index + 1}`;
  PICKER.modal.classList.add('open');
  PICKER.searchInput.value = '';
  state.pickerSearch.highlightedIndex = 0;
  ensurePokemonSearchIndex();
  renderPokedex('');
  focusSearchInput();
}

export function closeModal(options = {}) {
  PICKER.modal.classList.remove('open');
  if (options.flushRender === false || !pendingPickerRender) return;
  pendingPickerRender = false;
  requestAnimationFrame(() => renderAll());
}

export async function pickPokemonIntoSlot(side, index, name, options = {}) {
  flowLog('pickPokemonIntoSlot: Inicio', { side, index, name });
  if (side === 'self') {
    const speciesId = normalizeText(name);
    if (state.self.some((mon, i) => mon && i !== index && mon.name === speciesId)) {
      alert(`Species Clause: ${formatName(name)} ya esta en tu equipo.`);
      return false;
    }
    if (
      speciesId.includes('mega') &&
      state.self.some((mon, i) => mon && i !== index && mon.name.includes('mega'))
    ) {
      alert('Mega Clause: Solo se permite una Mega Evolucion por equipo.');
      return false;
    }
  }

  try {
    const mon = await fetchPokemon(name);
    mon.set = buildDefaultSetForSpecies(mon.name, side, index);
    ensureBattleState(mon);
    state[side][index] = mon;
    state.leads[side] = state.leads[side].filter((i) => i !== index);

    scheduleMoveWarmup({ render: options.deferRender !== true });
    flowLog('pickPokemonIntoSlot: scheduleMoveWarmup finalizado', { side, index, deferRender: options.deferRender === true });
    return true;
  } catch (err) {
    flowLog('pickPokemonIntoSlot: Error', err);
    alert(`No se pudo cargar ${name}`);
    return false;
  }
}

PICKER.resultList.addEventListener('click', async (event) => {
  if (pickingInProgress) return;

  const toggleBtn = event.target.closest('[data-action="toggle-picker-filters"]');
  if (toggleBtn) {
    state.pickerSearch.quickFiltersOpen = state.pickerSearch.quickFiltersOpen === false;
    renderPokedex(PICKER.searchInput.value);
    return;
  }

  const btn = event.target.closest('[data-action="pick-result"]');
  if (!btn) return;

  const side = state.modal.side;
  const currentIndex = state.modal.index;
  const name = btn.dataset.name;

  pickingInProgress = true;
  btn.disabled = true;

  const picked = await pickPokemonIntoSlot(side, currentIndex, name, { deferRender: true })
    .finally(() => {
      pickingInProgress = false;
      btn.disabled = false;
    });
  if (!picked) return;
  pendingPickerRender = true;
  registerRecentPick(name, side);

  const nextIndex = state[side].findIndex((mon) => !mon);
  if (nextIndex !== -1) {
    state.modal.index = nextIndex;
    PICKER.title.textContent =
      side === 'self'
        ? `Tu equipo · Slot ${nextIndex + 1}`
        : `Rival · Slot ${nextIndex + 1}`;
    PICKER.searchInput.value = '';
    state.pickerSearch.highlightedIndex = 0;
    renderPokedex('');
    focusSearchInput();
  } else {
    closeModal();
  }
});

PICKER.searchInput.addEventListener('input', (event) => {
  state.pickerSearch.highlightedIndex = 0;
  renderPokedex(event.target.value);
});

bindPickerKeyboard({ renderPokedex });

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
PICKER.modal.addEventListener('click', (event) => {
  if (event.target === PICKER.modal) closeModal();
});
