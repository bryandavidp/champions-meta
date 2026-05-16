// picker/modal.js
// Responsabilidad: Orquestación del modal de selección y Pokedex

import { state } from '../core/state.js';
import { PICKER } from '../core/dom.js';
import { normalizeText, formatName } from '../utils/text.js';
import { ensureBattleState, fetchPokemon } from '../data/pokemon.js';
import { buildDefaultSetForSpecies } from '../data/sets.js';
import { scheduleMoveWarmup } from '../bridges/ui-bridges.js';
import { renderAll } from '../render/app.js';
import { flowLog } from '../utils/debug.js';

export function ensurePokedex() {
  if (!state.metaRanked.length) {
    state.pokedex = [];
    return;
  }

  state.pokedex = state.metaRanked.map((record) => ({
    name: record.slug,
    displayName: record.displayName,
    usage: record.usage,
    rank: record.rank,
  }));

  document.getElementById("searchHint").textContent = `${state.pokedex.length} Pokémon meta cargados desde Smogon`;
}

export function renderPokedex(query = "") {
  const q = normalizeText(query);
  const parts = q.split(/[-\s]+/).filter(Boolean);

  const list = state.pokedex
    .filter((mon) => {
      if (!q) return true;
      const monName = normalizeText(mon.name);
      const monDisplay = normalizeText(mon.displayName);
      return parts.every((p) => monName.includes(p) || monDisplay.includes(p));
    })
    .slice(0, q ? 80 : 15);

  if (!list.length) {
    PICKER.resultList.innerHTML = `<div class="loader">No hay resultados.</div>`;
    return;
  }

  const quickPicksHtml = !q
    ? `<div style="grid-column: 1 / -1; margin-bottom: -4px;"><span class="tiny-chip" style="background: rgba(50, 173, 230, 0.12); border-color: rgba(50, 173, 230, 0.26);">Top Meta (Quick Picks)</span></div>`
    : "";

  PICKER.resultList.innerHTML =
    quickPicksHtml +
    list
      .map(
        (mon) => `
        <div class="result">
          <div class="result-sprite">
            <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/0.png" alt="${mon.displayName}" data-poke="${mon.name}" loading="lazy">
          </div>
          <div class="result-name">${mon.displayName}</div>
          <div class="result-meta">#${mon.rank} · ${mon.usage || 0}</div>
          <button class="pick-btn" data-action="pick-result" data-name="${mon.name}">Elegir</button>
        </div>
      `,
      )
      .join("");

  PICKER.resultList.querySelectorAll("img[data-poke]").forEach(async (img) => {
    const name = img.dataset.poke;
    try {
      const mon = await fetchPokemon(name);
      img.src = mon.sprite || img.src;
    } catch {}
  });
}

export function openModal(side, index) {
  state.modal = { side, index };
  PICKER.title.textContent =
    side === "self"
      ? `Tu equipo · Slot ${index + 1}`
      : `Rival · Slot ${index + 1}`;
  PICKER.modal.classList.add("open");
  PICKER.searchInput.value = "";
  renderPokedex("");
  setTimeout(() => PICKER.searchInput.focus(), 20);
}

export function closeModal() {
  PICKER.modal.classList.remove("open");
}

export async function pickPokemonIntoSlot(side, index, name) {
  flowLog('pickPokemonIntoSlot: Inicio', { side, index, name });
  // Validaciones de Formato (Champions OU)
  if (side === "self") {
    const speciesId = normalizeText(name);
    if (state.self.some((m, i) => m && i !== index && m.name === speciesId)) {
      alert(`Species Clause: ${formatName(name)} ya está en tu equipo.`);
      return;
    }
    if (
      speciesId.includes("-mega") &&
      state.self.some((m, i) => m && i !== index && m.name.includes("-mega"))
    ) {
      alert("Mega Clause: Solo se permite una Mega Evolución por equipo.");
      return;
    }
  }
  try {
    const mon = await fetchPokemon(name);
    mon.set = buildDefaultSetForSpecies(mon.name, side, index);
    ensureBattleState(mon);
    state[side][index] = mon;
    
    // SOLUCIÓN: Si el usuario cambia un pokemon específico, quitamos ese índice de los leads guardados
    state.leads[side] = state.leads[side].filter((i) => i !== index);
    
    scheduleMoveWarmup();
    flowLog('pickPokemonIntoSlot: scheduleMoveWarmup finalizado, solicitando renderAll', { side, index });
    renderAll();
  } catch (err) {
    flowLog('pickPokemonIntoSlot: Error', err);
    alert(`No se pudo cargar ${name}`);
  }
}


PICKER.resultList.addEventListener("click", async (e) => {
  const btn = e.target.closest('[data-action="pick-result"]');
  if (!btn) return;

  const side = state.modal.side;
  const currentIndex = state.modal.index;

  await pickPokemonIntoSlot(side, currentIndex, btn.dataset.name);

  const nextIndex = state[side].findIndex((mon) => !mon);
  if (nextIndex !== -1) {
    state.modal.index = nextIndex;
    PICKER.title.textContent =
      side === "self"
        ? `Tu equipo · Slot ${nextIndex + 1}`
        : `Rival · Slot ${nextIndex + 1}`;
    PICKER.searchInput.value = "";
    renderPokedex("");
    setTimeout(() => PICKER.searchInput.focus(), 20);
  } else {
    closeModal();
  }
});

PICKER.searchInput.addEventListener("input", (e) => {
  renderPokedex(e.target.value);
});

document.getElementById("closeModalBtn").addEventListener("click", closeModal);
PICKER.modal.addEventListener("click", (e) => {
  if (e.target === PICKER.modal) closeModal();
});
