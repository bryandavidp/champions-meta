/* ============================================================
   CHAMPIONS META · app.js
   Fase 1 — Team Preview Pokémon Dobles 4v4
   ============================================================ */

'use strict';

/* ============================================================
   CONSTANTES
   ============================================================ */
const TEAM_SIZE = 6;
const DEBOUNCE_MS = 280;
const LS_KEY = 'champions_meta_myTeam_v1';
const API = 'https://pokeapi.co/api/v2';

/* ============================================================
   CACHE
   ============================================================ */
const cache = {
  pokemonList: null,       // [{name, url, id}] — lista completa en inglés
  pokemon: new Map(),      // id → full pokemon object
  species: new Map(),      // id → species (con nombres ES)
  types: new Map(),        // slug → type data (con nombres ES y damage_relations)
  abilities: new Map(),    // slug → ability (con nombres ES)
  typeChart: new Map(),    // slug → {name_es, damage_relations}
};

/* ============================================================
   ESTADO
   ============================================================ */
function makeSlot() {
  return {
    nameInput: '',
    pokemon: null,    // objeto completo resuelto
    status: 'empty',  // 'empty' | 'input' | 'loading' | 'error' | 'filled'
    error: null,
    moves: [null, null, null, null], // para Fase 2
  };
}

const state = {
  myTeam:    Array.from({ length: TEAM_SIZE }, makeSlot),
  rivalTeam: Array.from({ length: TEAM_SIZE }, makeSlot),
};


/* ============================================================
   UTILIDADES
   ============================================================ */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractId(url) {
  const m = url.match(/\/(\d+)\/?$/);
  return m ? parseInt(m[1], 10) : null;
}

function getSpanishName(namesArray, fallback = '') {
  if (!Array.isArray(namesArray)) return fallback;
  const entry = namesArray.find(n => n.language?.name === 'es');
  return entry ? entry.name : fallback;
}

function showToast(msg, duration = 2200) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('is-visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('is-visible'), duration);
}

/* ============================================================
   TABLA DE TIPOS (cálculo de debilidades/resistencias)
   ============================================================ */

// Tabla de efectividad estática (evita múltiples fetches encadenados)
const TYPE_EFFECTIVENESS = {
  normal:   { weakTo: ['fighting'], immuneTo: ['ghost'], resistantTo: [] },
  fire:     { weakTo: ['water','ground','rock'], immuneTo: [], resistantTo: ['fire','grass','ice','bug','steel','fairy'] },
  water:    { weakTo: ['electric','grass'], immuneTo: [], resistantTo: ['fire','water','ice','steel'] },
  electric: { weakTo: ['ground'], immuneTo: [], resistantTo: ['electric','flying','steel'] },
  grass:    { weakTo: ['fire','ice','poison','flying','bug'], immuneTo: [], resistantTo: ['water','electric','grass','ground'] },
  ice:      { weakTo: ['fire','fighting','rock','steel'], immuneTo: [], resistantTo: ['ice'] },
  fighting: { weakTo: ['flying','psychic','fairy'], immuneTo: [], resistantTo: ['bug','rock','dark'] },
  poison:   { weakTo: ['ground','psychic'], immuneTo: [], resistantTo: ['grass','fighting','poison','bug','fairy'] },
  ground:   { weakTo: ['water','grass','ice'], immuneTo: ['electric'], resistantTo: ['poison','rock'] },
  flying:   { weakTo: ['electric','ice','rock'], immuneTo: ['ground'], resistantTo: ['grass','fighting','bug'] },
  psychic:  { weakTo: ['bug','ghost','dark'], immuneTo: [], resistantTo: ['fighting','psychic'] },
  bug:      { weakTo: ['fire','flying','rock'], immuneTo: [], resistantTo: ['grass','fighting','ground'] },
  rock:     { weakTo: ['water','grass','fighting','ground','steel'], immuneTo: [], resistantTo: ['normal','fire','poison','flying'] },
  ghost:    { weakTo: ['ghost','dark'], immuneTo: ['normal','fighting'], resistantTo: ['poison','bug'] },
  dragon:   { weakTo: ['ice','dragon','fairy'], immuneTo: [], resistantTo: ['fire','water','electric','grass'] },
  dark:     { weakTo: ['fighting','bug','fairy'], immuneTo: ['psychic'], resistantTo: ['ghost','dark'] },
  steel:    { weakTo: ['fire','fighting','ground'], immuneTo: ['poison'], resistantTo: ['normal','grass','ice','flying','psychic','bug','rock','dragon','steel','fairy'] },
  fairy:    { weakTo: ['poison','steel'], immuneTo: ['dragon'], resistantTo: ['fighting','bug','dark'] },
};

const TYPE_ES = {
  normal:'Normal', fire:'Fuego', water:'Agua', electric:'Eléctrico', grass:'Planta',
  ice:'Hielo', fighting:'Lucha', poison:'Veneno', ground:'Tierra', flying:'Volador',
  psychic:'Psíquico', bug:'Bicho', rock:'Roca', ghost:'Fantasma', dragon:'Dragón',
  dark:'Siniestro', steel:'Acero', fairy:'Hada', stellar:'Estelar',
};

const TYPE_ES = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  electric: 'Eléctrico',
  grass: 'Planta',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psíquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragón',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada',
  stellar: 'Estelar',
};

const TYPE_CLASS = {
  normal: 'type-chip--normal',
  fire: 'type-chip--fire',
  water: 'type-chip--water',
  electric: 'type-chip--electric',
  grass: 'type-chip--grass',
  ice: 'type-chip--ice',
  fighting: 'type-chip--fighting',
  poison: 'type-chip--poison',
  ground: 'type-chip--ground',
  flying: 'type-chip--flying',
  psychic: 'type-chip--psychic',
  bug: 'type-chip--bug',
  rock: 'type-chip--rock',
  ghost: 'type-chip--ghost',
  dragon: 'type-chip--dragon',
  dark: 'type-chip--dark',
  steel: 'type-chip--steel',
  fairy: 'type-chip--fairy',
  stellar: 'type-chip--stellar',
};

function safeTitle(str = '') {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTypeLabel(type) {
  return TYPE_ES[type] || safeTitle(type);
}

function getTypeClass(type) {
  return TYPE_CLASS[type] || 'type-chip--normal';
}

function computeWeaknesses(types) {
  // types: array de strings en inglés (slugs)
  const mult = {};

  // inicializar todos en 1
  Object.keys(TYPE_EFFECTIVENESS).forEach(t => { mult[t] = 1; });

  types.forEach(atkType => {
    const entry = TYPE_EFFECTIVENESS[atkType];
    if (!entry) return;

    // Para cada tipo del Pokémon defensor recibimos daño de atkType según las reglas inversas
    // Reinterpretamos: iteramos tipos atacantes y revisamos qué tipos defensores son weak/resist/immune
  });

  // Enfoque correcto: por cada tipo atacante (atkType), miramos el Pokémon defensor
  // Resetear
  const allTypes = Object.keys(TYPE_EFFECTIVENESS);
  const result = {};
  allTypes.forEach(atk => { result[atk] = 1; });

  allTypes.forEach(atk => {
    const entry = TYPE_EFFECTIVENESS[atk];
    if (!entry) return;
    // ¿Los tipos del Pokémon están en weakTo del atacante?
    types.forEach(defType => {
      if (entry.weakTo.includes(defType)) result[atk] *= 2;
      if (entry.resistantTo.includes(defType)) result[atk] *= 0.5;
      if (entry.immuneTo.includes(defType)) result[atk] = 0;
    });
  });

  return result;
}

function getWeaknessGroups(types) {
  const mult = computeWeaknesses(types);
  const weak4x = [], weak2x = [], resist4x = [], resist2x = [], immune = [];
  Object.entries(mult).forEach(([t, m]) => {
    if (m === 0) immune.push(t);
    else if (m >= 4) weak4x.push(t);
    else if (m >= 2) weak2x.push(t);
    else if (m <= 0.25) resist4x.push(t);
    else if (m <= 0.5) resist2x.push(t);
  });
  return { weak4x, weak2x, resist4x, resist2x, immune };
}

/* ============================================================
   API FETCH
   ============================================================ */
async function loadPokemonList() {
  if (cache.pokemonList) return cache.pokemonList;
  const res = await fetch(`${API}/pokemon?limit=10000`);
  if (!res.ok) throw new Error('No se pudo cargar la lista de Pokémon');
  const data = await res.json();
  cache.pokemonList = data.results.map(p => ({
    name: p.name,
    id: extractId(p.url),
    url: p.url,
  }));
  return cache.pokemonList;
}

async function fetchPokemon(id) {
  if (cache.pokemon.has(id)) return cache.pokemon.get(id);
  const res = await fetch(`${API}/pokemon/${id}`);
  if (!res.ok) throw new Error(`Pokémon #${id} no encontrado`);
  const data = await res.json();
  cache.pokemon.set(id, data);
  return data;
}

async function fetchSpecies(id) {
  if (cache.species.has(id)) return cache.species.get(id);
  const res = await fetch(`${API}/pokemon-species/${id}`);
  if (!res.ok) return null;
  const data = await res.json();
  cache.species.set(id, data);
  return data;
}

async function fetchAbility(slug) {
  if (cache.abilities.has(slug)) return cache.abilities.get(slug);
  const res = await fetch(`${API}/ability/${slug}`);
  if (!res.ok) return null;
  const data = await res.json();
  cache.abilities.set(slug, data);
  return data;
}

async function resolvePokemon(nameOrId) {
  const list = await loadPokemonList();
  const query = String(nameOrId).toLowerCase().trim();
  let entry = list.find(p => p.name === query || String(p.id) === query);

  if (!entry) {
    const byId = parseInt(query, 10);
    if (!isNaN(byId)) entry = list.find(p => p.id === byId);
  }

  if (!entry) throw new Error(`"${nameOrId}" no encontrado`);

  const id = entry.id;
  const pokemon = await fetchPokemon(id);
  const species = await fetchSpecies(id);

  const nameEs = species
    ? getSpanishName(species.names, safeTitle(entry.name))
    : safeTitle(entry.name);

  const types = pokemon.types.map(t => t.type.name);
  const typesEs = types.map(getTypeLabel);

  const abilitySlugs = pokemon.abilities.map(a => a.ability.name);
  const abilityDataArr = await Promise.all(abilitySlugs.map(s => fetchAbility(s)));
  const abilitiesEs = abilityDataArr.map((data, i) => {
    if (!data) return safeTitle(abilitySlugs[i].replace(/-/g, ' '));
    return getSpanishName(data.names, safeTitle(abilitySlugs[i].replace(/-/g, ' ')));
  });

  const statsMap = {};
  pokemon.stats.forEach(s => { statsMap[s.stat.name] = s.base_stat; });

  const weaknessGroups = getWeaknessGroups(types);

  const animated =
    pokemon.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default ||
    null;

  const staticSprite =
    pokemon.sprites?.other?.['official-artwork']?.front_default ||
    pokemon.sprites?.front_default ||
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

  return {
    id,
    nameEn: entry.name,
    nameEs,
    sprite: animated || staticSprite,
    spriteStatic: staticSprite,
    isAnimated: Boolean(animated),
    types,
    typesEs,
    stats: {
      hp: statsMap.hp,
      atk: statsMap.attack,
      def: statsMap.defense,
      spa: statsMap['special-attack'],
      spd: statsMap['special-defense'],
      spe: statsMap.speed,
    },
    abilitiesEs,
    weaknessGroups,
  };
}

/* ============================================================
   PERSISTENCIA
   ============================================================ */
function serializeTeam(team) {
  return team.map(slot => ({
    nameEn: slot.pokemon?.nameEn || null,
    status: slot.status === 'filled' ? 'filled' : 'empty',
  }));
}

function saveMyTeam() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(serializeTeam(state.myTeam)));
    showToast('✅ Equipo guardado');
  } catch (e) {
    showToast('❌ Error al guardar');
  }
}

async function loadSavedTeam() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return;
    const promises = saved.map(async (entry, i) => {
      if (entry.status === 'filled' && entry.nameEn) {
        state.myTeam[i].status = 'loading';
        renderSlot('my', i);
        try {
          const resolved = await resolvePokemon(entry.nameEn);
          state.myTeam[i].pokemon = resolved;
          state.myTeam[i].status = 'filled';
        } catch {
          state.myTeam[i].status = 'empty';
        }
        renderSlot('my', i);
      }
    });
    await Promise.all(promises);
  } catch (e) {
    // fail silently
  }
}

/* ============================================================
   RENDER — quirúrgico por slot
   ============================================================ */
function getSlotEl(team, index) {
  const gridId = team === 'my' ? 'myTeamGrid' : 'rivalTeamGrid';
  const grid = document.getElementById(gridId);
  return grid?.querySelector(`[data-slot-index="${index}"]`);
}

function renderTypeBadges(typesEs, typesEn) {
  return typesEs.map((tEs, i) => {
    const tEn = typesEn[i] || '';
    return `<span class="type-badge type--${tEn}" title="${tEs}">${tEs}</span>`;
  }).join('');
}

function renderStats(stats) {
  const labels = { hp:'HP', atk:'Atk', def:'Def', spa:'SpA', spd:'SpD', spe:'Vel' };
  return Object.entries(labels).map(([key, label]) =>
    `<div class="stat-item">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${stats[key] ?? '–'}</span>
    </div>`
  ).join('');
}

function renderWeaknesses(groups) {
  const rows = [];

  const renderBadges = (arr, cls, title) => {
    if (!arr.length) return '';
    const badges = arr.map(t => {
      const tEs = TYPE_ES[t] || capitalize(t);
      return `<span class="matchup-badge type--${t} ${cls}" title="${tEs}">${tEs}</span>`;
    }).join('');
    return `<div class="matchup-row">
      <span class="matchup-label" title="${title}">${title}</span>
      ${badges}
    </div>`;
  };

  rows.push(renderBadges(groups.weak4x, 'matchup-badge--4x', '4×'));
  rows.push(renderBadges(groups.weak2x, 'matchup-badge--2x', '2×'));
  rows.push(renderBadges(groups.immune, 'matchup-badge--immune', '0×'));
  rows.push(renderBadges(groups.resist2x, 'matchup-badge--half', '½'));
  rows.push(renderBadges(groups.resist4x, 'matchup-badge--quarter', '¼'));

  const content = rows.filter(Boolean).join('');
  if (!content) return '';
  return `<div class="slot__matchup">${content}</div>`;
}

function renderFilledCard(pokemon, team, index) {
  const weakBlocks = renderMatchupBlocks(pokemon.weaknessGroups);

  return `
    <div class="slot__card">
      <div class="slot__card-top">
        <div class="slot__sprite-wrap">
          <img
            class="slot__sprite"
            src="${pokemon.sprite}"
            alt="${escapeHtml(pokemon.nameEs)}"
            loading="lazy"
            decoding="async"
          />
        </div>

        <div class="slot__meta">
          <div class="slot__name-row">
            <div class="slot__name">${escapeHtml(pokemon.nameEs)}</div>
          </div>

          <div class="slot__type-row">
            ${pokemon.types.map((t, i) => `
              <span class="type-chip ${getTypeClass(t)}" title="${escapeHtml(pokemon.typesEs[i])}">
                ${escapeHtml(pokemon.typesEs[i])}
              </span>
            `).join('')}
          </div>
        </div>

        <button class="slot__btn-remove" data-team="${team}" data-index="${index}" aria-label="Eliminar ${escapeHtml(pokemon.nameEs)}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path fill="currentColor" d="M18.3 5.71 12 12.01l-6.29-6.3-1.42 1.42 6.3 6.29-6.3 6.29 1.42 1.42 6.29-6.3 6.29 6.3 1.42-1.42-6.3-6.29 6.3-6.29z"/>
          </svg>
        </button>
      </div>

      <div class="slot__body">
        <div class="slot__stats">
          ${renderStatPills(pokemon.stats)}
        </div>

        <div class="slot__abilities">
          ${pokemon.abilitiesEs.map(a => `<span class="ability-chip">${escapeHtml(a)}</span>`).join('')}
        </div>

        ${weakBlocks}
      </div>
    </div>
  `;
}

function renderSlot(team, index) {
  const slotEl = getSlotEl(team, index);
  if (!slotEl) return;

  const slot = team === 'my' ? state.myTeam[index] : state.rivalTeam[index];
  const colorClass = team === 'my' ? 'slot--my' : 'slot--rival';

  // Limpiar clases de estado previas
  slotEl.className = `slot ${colorClass}`;

  switch (slot.status) {
    case 'empty': {
      slotEl.innerHTML = `
        <div class="slot__empty" data-team="${team}" data-index="${index}" role="button" tabindex="0" aria-label="Añadir Pokémon al slot ${index + 1}">
          <span class="slot__empty-icon">＋</span>
          <span class="slot__empty-label">Añadir</span>
        </div>`;
      break;
    }

    case 'input': {
      slotEl.classList.add('slot--active');
      slotEl.innerHTML = `
        <div class="slot__input-wrap">
          <input
            class="slot__input"
            type="search"
            inputmode="search"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="Buscar Pokémon…"
            data-team="${team}"
            data-index="${index}"
            value="${escapeHtml(slot.nameInput)}"
            aria-label="Buscar Pokémon para slot ${index + 1}"
            aria-autocomplete="list"
          />
          <ul class="autocomplete-list" id="ac-${team}-${index}" role="listbox" aria-label="Sugerencias"></ul>
        </div>`;

      // Montar autocomplete y enfocar SIN scroll
      const input = slotEl.querySelector('.slot__input');
      const list = slotEl.querySelector('.autocomplete-list');
      initAutocomplete(input, list, team, index);
      // Foco sin scroll
      input.focus({ preventScroll: true });
      break;
    }

    case 'loading': {
      slotEl.innerHTML = `
        <div class="slot__loading">
          <div class="spinner"></div>
          <span>Cargando…</span>
        </div>`;
      break;
    }

    case 'error': {
      slotEl.innerHTML = `
        <div class="slot__error">
          <span class="slot__error-msg">⚠️ ${escapeHtml(slot.error || 'Error desconocido')}</span>
          <button class="slot__error-retry" data-team="${team}" data-index="${index}">Reintentar</button>
        </div>`;
      break;
    }

    case 'filled': {
      slotEl.classList.add('slot--filled');
      slotEl.innerHTML = renderFilledCard(slot.pokemon, team, index);
      break;
    }
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAllSlots(team) {
  const arr = team === 'my' ? state.myTeam : state.rivalTeam;
  arr.forEach((_, i) => renderSlot(team, i));
}

/* ============================================================
   AUTOCOMPLETE
   ============================================================ */
function initAutocomplete(input, listEl, team, index) {
  let currentQuery = '';
  let pokemonListLoaded = false;
  let highlighted = -1;

  function getSlotState() {
    return team === 'my' ? state.myTeam[index] : state.rivalTeam[index];
  }

  function updateHighlight(items, newIdx) {
    if (highlighted >= 0 && items[highlighted]) {
      items[highlighted].classList.remove('is-highlighted');
    }
    highlighted = newIdx;
    if (highlighted >= 0 && items[highlighted]) {
      items[highlighted].classList.add('is-highlighted');
    }
  }

  const doSearch = debounce(async (query) => {
    // Re-verificar que el slot sigue en modo input
    if (getSlotState().status !== 'input') return;
    if (!query || query.length < 2) {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      return;
    }

    let list;
    try {
      list = await loadPokemonList();
      pokemonListLoaded = true;
    } catch {
      return;
    }

    // Si el input ha cambiado mientras cargaba, no actualizar
    if (input.value.trim().toLowerCase() !== query) return;

    const q = query.toLowerCase();
    const results = list
      .filter(p => p.name.includes(q) || String(p.id) === q)
      .slice(0, 8);

    if (!results.length) {
      listEl.innerHTML = '<li style="padding:12px;font-size:.8rem;color:var(--clr-text-muted);">Sin resultados</li>';
      listEl.classList.add('is-open');
      return;
    }

    highlighted = -1;
    listEl.innerHTML = results.map((p, i) =>
      `<li class="autocomplete-list__item"
          role="option"
          data-name="${p.name}"
          data-id="${p.id}"
          tabindex="-1">
        <img class="autocomplete-list__img"
             src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png"
             alt=""
             loading="lazy"
             decoding="async" />
        <span class="autocomplete-list__name">${capitalize(p.name)}</span>
        <span class="autocomplete-list__id">#${String(p.id).padStart(4,'0')}</span>
      </li>`
    ).join('');

    listEl.classList.add('is-open');
  }, DEBOUNCE_MS);

  async function selectPokemon(nameEn) {
    const slotState = getSlotState();
    slotState.status = 'loading';
    // NO re-renderizar el slot completo para no perder foco — solo cerrar el dropdown
    listEl.innerHTML = '';
    listEl.classList.remove('is-open');

    // Renderizar solo el loading
    renderSlot(team, index);

    try {
      const resolved = await resolvePokemon(nameEn);
      slotState.pokemon = resolved;
      slotState.status = 'filled';
    } catch (e) {
      slotState.status = 'error';
      slotState.error = e.message || 'Error al cargar el Pokémon';
    }

    renderSlot(team, index);
  }

  // ---- EVENTOS ----

  input.addEventListener('input', () => {
    const slotState = getSlotState();
    if (slotState.status !== 'input') return;
    slotState.nameInput = input.value;
    const query = input.value.trim().toLowerCase();
    currentQuery = query;
    doSearch(query);
  });

  input.addEventListener('keydown', (e) => {
    const items = Array.from(listEl.querySelectorAll('.autocomplete-list__item'));
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateHighlight(items, Math.min(highlighted + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateHighlight(items, Math.max(highlighted - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && items[highlighted]) {
        const name = items[highlighted].dataset.name;
        if (name) selectPokemon(name);
      }
    } else if (e.key === 'Escape') {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      cancelInput(team, index);
    }
  });

  // mousedown en vez de click para que se ejecute ANTES del blur del input
  listEl.addEventListener('mousedown', (e) => {
    e.preventDefault(); // evita que el input pierda el foco
    const item = e.target.closest('.autocomplete-list__item');
    if (item && item.dataset.name) {
      selectPokemon(item.dataset.name);
    }
  });

  // Touch: igual que mousedown
  listEl.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.autocomplete-list__item');
    if (item && item.dataset.name) {
      e.preventDefault();
      selectPokemon(item.dataset.name);
    }
  }, { passive: false });

  input.addEventListener('blur', () => {
    // Pequeño delay para que mousedown/touchstart se ejecuten primero
    setTimeout(() => {
      const slotState = getSlotState();
      if (slotState.status === 'input') {
        listEl.innerHTML = '';
        listEl.classList.remove('is-open');
        // Si no hay nada escrito, volver a empty
        if (!slotState.nameInput.trim()) {
          cancelInput(team, index);
        }
      }
    }, 200);
  });
}

function cancelInput(team, index) {
  const slot = team === 'my' ? state.myTeam[index] : state.rivalTeam[index];
  slot.status = 'empty';
  slot.nameInput = '';
  renderSlot(team, index);
}

/* ============================================================
   SCAFFOLD DE SLOTS — crear elementos DOM base sin innerHTML
   ============================================================ */
function buildSlotScaffold(team, index) {
  const el = document.createElement('div');
  el.className = `slot slot--${team === 'my' ? 'my' : 'rival'}`;
  el.setAttribute('data-slot-index', index);
  el.setAttribute('role', 'listitem');
  return el;
}

function initGrid(team) {
  const gridId = team === 'my' ? 'myTeamGrid' : 'rivalTeamGrid';
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < TEAM_SIZE; i++) {
    grid.appendChild(buildSlotScaffold(team, i));
  }
}

/* ============================================================
   EVENTOS
   ============================================================ */
function handleSlotActivation(team, index) {
  const slot = team === 'my' ? state.myTeam[index] : state.rivalTeam[index];
  if (slot.status === 'empty') {
    slot.status = 'input';
    slot.nameInput = '';
    renderSlot(team, index);
  }
}

function handleRemove(team, index) {
  const slot = team === 'my' ? state.myTeam[index] : state.rivalTeam[index];
  slot.status = 'empty';
  slot.pokemon = null;
  slot.nameInput = '';
  slot.error = null;
  renderSlot(team, index);
}

function handleRetry(team, index) {
  const slot = team === 'my' ? state.myTeam[index] : state.rivalTeam[index];
  slot.status = 'input';
  slot.error = null;
  slot.nameInput = '';
  renderSlot(team, index);
}

function clearTeam(team) {
  const arr = team === 'my' ? state.myTeam : state.rivalTeam;
  arr.forEach((slot, i) => {
    slot.status = 'empty';
    slot.pokemon = null;
    slot.nameInput = '';
    slot.error = null;
  });
  renderAllSlots(team);
}

function bindEvents() {
  // Delegación de eventos en grids
  ['myTeamGrid', 'rivalTeamGrid'].forEach(gridId => {
    const grid = document.getElementById(gridId);
    const team = gridId === 'myTeamGrid' ? 'my' : 'rival';

    grid.addEventListener('click', (e) => {
      // Activar slot vacío
      const emptyEl = e.target.closest('[data-slot-index]');
      if (!emptyEl) return;
      const index = parseInt(emptyEl.dataset.slotIndex ?? emptyEl.closest('[data-slot-index]')?.dataset.slotIndex, 10);

      // Botón eliminar
      const removeBtn = e.target.closest('.slot__btn-remove');
      if (removeBtn) {
        const t = removeBtn.dataset.team;
        const i = parseInt(removeBtn.dataset.index, 10);
        handleRemove(t, i);
        return;
      }

      // Retry
      const retryBtn = e.target.closest('.slot__error-retry');
      if (retryBtn) {
        const t = retryBtn.dataset.team;
        const i = parseInt(retryBtn.dataset.index, 10);
        handleRetry(t, i);
        return;
      }

      // Activar slot vacío
      const emptyArea = e.target.closest('.slot__empty');
      if (emptyArea) {
        const t = emptyArea.dataset.team;
        const i = parseInt(emptyArea.dataset.index, 10);
        handleSlotActivation(t, i);
        return;
      }
    });

    // Teclado en slot vacío (accesibilidad)
    grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const emptyArea = e.target.closest('.slot__empty');
        if (emptyArea) {
          e.preventDefault();
          const t = emptyArea.dataset.team;
          const i = parseInt(emptyArea.dataset.index, 10);
          handleSlotActivation(t, i);
        }
      }
    });
  });

  // Guardar
  document.getElementById('saveTeamBtn')?.addEventListener('click', saveMyTeam);

  // Limpiar equipos
  document.getElementById('clearMyTeamBtn')?.addEventListener('click', () => {
    if (confirm('¿Limpiar todo mi equipo?')) clearTeam('my');
  });
  document.getElementById('clearRivalTeamBtn')?.addEventListener('click', () => {
    if (confirm('¿Limpiar el equipo rival?')) clearTeam('rival');
  });
}

function bindTheme() {
  const btn = document.getElementById('themeToggle');
  const icon = btn?.querySelector('.theme-toggle__icon');
  const html = document.documentElement;

  // Cargar tema guardado
  const saved = localStorage.getItem('champions_meta_theme');
  if (saved) {
    html.setAttribute('data-theme', saved);
    if (icon) icon.textContent = saved === 'light' ? '☀️' : '🌙';
  }

  btn?.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    if (icon) icon.textContent = next === 'light' ? '☀️' : '🌙';
    localStorage.setItem('champions_meta_theme', next);
  });
}

function renderStatPills(stats) {
  const map = [
    ['hp', 'HP'],
    ['atk', 'ATQ'],
    ['def', 'DEF'],
    ['spa', 'SATQ'],
    ['spd', 'SDEF'],
    ['spe', 'VEL'],
  ];

  return map.map(([key, label]) => `
    <div class="stat-pill">
      <span class="stat-pill__label">${label}</span>
      <span class="stat-pill__value">${stats[key] ?? '–'}</span>
    </div>
  `).join('');
}

function renderMatchupBlocks(groups) {
  const blocks = [];

  const makeChip = (type, mult, suffixClass = '') => `
    <span class="matchup-chip ${suffixClass} ${getMatchupMultiplierClass(mult)}">
      <span class="matchup-chip__mult">${mult}</span>
      ${escapeHtml(getTypeLabel(type))}
    </span>
  `;

  if (groups.weak4x.length || groups.weak2x.length) {
    blocks.push(`
      <div class="matchup-block matchup-block--weak">
        <div class="matchup-block__head">
          <div class="matchup-block__title">
            <span class="matchup-block__badge">▲</span>
            Debilidades
          </div>
        </div>
        <div class="matchup-grid">
          ${groups.weak4x.map(t => makeChip(t, '4×', 'matchup-chip--4x')).join('')}
          ${groups.weak2x.map(t => makeChip(t, '2×', 'matchup-chip--2x')).join('')}
        </div>
      </div>
    `);
  }

  if (groups.resist4x.length || groups.resist2x.length) {
    blocks.push(`
      <div class="matchup-block matchup-block--resist">
        <div class="matchup-block__head">
          <div class="matchup-block__title">
            <span class="matchup-block__badge">▼</span>
            Resistencias
          </div>
        </div>
        <div class="matchup-grid">
          ${groups.resist4x.map(t => makeChip(t, '¼', 'matchup-chip--quarter')).join('')}
          ${groups.resist2x.map(t => makeChip(t, '½', 'matchup-chip--half')).join('')}
        </div>
      </div>
    `);
  }

  if (groups.immune.length) {
    blocks.push(`
      <div class="matchup-block matchup-block--immune">
        <div class="matchup-block__head">
          <div class="matchup-block__title">
            <span class="matchup-block__badge">⊘</span>
            Inmunidades
          </div>
        </div>
        <div class="matchup-grid">
          ${groups.immune.map(t => makeChip(t, '0×', 'matchup-chip--immune')).join('')}
        </div>
      </div>
    `);
  }

  return blocks.length ? `<div class="slot__matchup">${blocks.join('')}</div>` : '';
}

function getMatchupMultiplierClass(mult) {
  if (mult === '4×') return 'matchup-chip--4x';
  if (mult === '2×') return 'matchup-chip--2x';
  if (mult === '½') return 'matchup-chip--half';
  if (mult === '¼') return 'matchup-chip--quarter';
  return 'matchup-chip--immune';
}

/* ============================================================
   INIT
   ============================================================ */
async function init() {
  bindTheme();

  // Construir grids
  initGrid('my');
  initGrid('rival');

  // Renderizar estado inicial
  renderAllSlots('my');
  renderAllSlots('rival');

  // Eventos
  bindEvents();

  // Cargar lista de Pokémon en segundo plano (pre-warm del caché)
  loadPokemonList().catch(() => {});

  // Restaurar equipo guardado
  await loadSavedTeam();
}

document.addEventListener('DOMContentLoaded', init);
