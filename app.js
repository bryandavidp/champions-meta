'use strict';

const TEAM_SIZE = 6;
const MOVES_PER_SLOT = 4;
const DEBOUNCE_MS = 260;
const LS_KEY = 'champions_meta_myTeam_v2';
const API = 'https://pokeapi.co/api/v2';

const cache = {
  pokemonList: null,
  pokemon: new Map(),
  species: new Map(),
  abilities: new Map(),
  moves: new Map(),
  types: new Map(),
  moveList: null,
};

function makeMoveSlot() {
  return { input: '', move: null, status: 'empty', error: null };
}

function makeSlot() {
  return {
    nameInput: '',
    pokemon: null,
    moves: Array.from({ length: MOVES_PER_SLOT }, makeMoveSlot),
    resolvedMoves: [],
    status: 'empty',
    error: null,
  };
}

const state = {
  myTeam: Array.from({ length: TEAM_SIZE }, makeSlot),
  rivalTeam: Array.from({ length: TEAM_SIZE }, makeSlot),
  analysis: {
    summary: null,
    coverage: [],
    threats: [],
    weakPicks: [],
    signals: [],
  },
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

const TYPE_EFFECTIVENESS = {
  normal: { weakTo: ['fighting'], immuneTo: ['ghost'], resistantTo: [] },
  fire: { weakTo: ['water', 'ground', 'rock'], immuneTo: [], resistantTo: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'] },
  water: { weakTo: ['electric', 'grass'], immuneTo: [], resistantTo: ['fire', 'water', 'ice', 'steel'] },
  electric: { weakTo: ['ground'], immuneTo: [], resistantTo: ['electric', 'flying', 'steel'] },
  grass: { weakTo: ['fire', 'ice', 'poison', 'flying', 'bug'], immuneTo: [], resistantTo: ['water', 'electric', 'grass', 'ground'] },
  ice: { weakTo: ['fire', 'fighting', 'rock', 'steel'], immuneTo: [], resistantTo: ['ice'] },
  fighting: { weakTo: ['flying', 'psychic', 'fairy'], immuneTo: [], resistantTo: ['bug', 'rock', 'dark'] },
  poison: { weakTo: ['ground', 'psychic'], immuneTo: [], resistantTo: ['grass', 'fighting', 'poison', 'bug', 'fairy'] },
  ground: { weakTo: ['water', 'grass', 'ice'], immuneTo: ['electric'], resistantTo: ['poison', 'rock'] },
  flying: { weakTo: ['electric', 'ice', 'rock'], immuneTo: ['ground'], resistantTo: ['grass', 'fighting', 'bug'] },
  psychic: { weakTo: ['bug', 'ghost', 'dark'], immuneTo: [], resistantTo: ['fighting', 'psychic'] },
  bug: { weakTo: ['fire', 'flying', 'rock'], immuneTo: [], resistantTo: ['grass', 'fighting', 'ground'] },
  rock: { weakTo: ['water', 'grass', 'fighting', 'ground', 'steel'], immuneTo: [], resistantTo: ['normal', 'fire', 'poison', 'flying'] },
  ghost: { weakTo: ['ghost', 'dark'], immuneTo: ['normal', 'fighting'], resistantTo: ['poison', 'bug'] },
  dragon: { weakTo: ['ice', 'dragon', 'fairy'], immuneTo: [], resistantTo: ['fire', 'water', 'electric', 'grass'] },
  dark: { weakTo: ['fighting', 'bug', 'fairy'], immuneTo: ['psychic'], resistantTo: ['ghost', 'dark'] },
  steel: { weakTo: ['fire', 'fighting', 'ground'], immuneTo: ['poison'], resistantTo: ['normal', 'grass', 'ice', 'flying', 'psychic', 'bug', 'rock', 'dragon', 'steel', 'fairy'] },
  fairy: { weakTo: ['poison', 'steel'], immuneTo: ['dragon'], resistantTo: ['fighting', 'bug', 'dark'] },
};

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function extractId(url) {
  const m = url?.match(/\/(\d+)\/?$/);
  return m ? parseInt(m[1], 10) : null;
}

function getSpanishName(namesArray, fallback = '') {
  const entry = Array.isArray(namesArray) ? namesArray.find(n => n.language?.name === 'es') : null;
  return entry?.name || fallback;
}

function typeLabel(type) {
  return TYPE_ES[type] || capitalize(type);
}

function typeClass(type) {
  return TYPE_CLASS[type] || 'type-chip--normal';
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

function slotAt(team, index) {
  return team === 'my' ? state.myTeam[index] : state.rivalTeam[index];
}

async function loadPokemonList() {
  if (cache.pokemonList) return cache.pokemonList;
  const res = await fetch(`${API}/pokemon?limit=10000`);
  if (!res.ok) throw new Error('No se pudo cargar la lista de Pokémon');
  const data = await res.json();
  cache.pokemonList = data.results.map(p => ({ name: p.name, id: extractId(p.url), url: p.url }));
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

async function fetchMove(slug) {
  const key = String(slug).toLowerCase();
  if (cache.moves.has(key)) return cache.moves.get(key);
  const res = await fetch(`${API}/move/${key}`);
  if (!res.ok) return null;
  const data = await res.json();
  cache.moves.set(key, data);
  return data;
}

async function loadMoveList() {
  if (cache.moveList) return cache.moveList;
  const res = await fetch(`${API}/move?limit=10000`);
  if (!res.ok) throw new Error('No se pudo cargar la lista de movimientos');
  const data = await res.json();
  const base = data.results.slice(0, 2500);
  const resolved = [];
  for (const item of base) {
    const move = await fetchMove(item.name).catch(() => null);
    if (!move) continue;
    resolved.push({
      name: move.name,
      nameEs: getSpanishName(move.names, capitalize(move.name.replace(/-/g, ' '))),
      type: move.type?.name || 'normal',
    });
  }
  cache.moveList = resolved;
  return cache.moveList;
}

function computeWeaknesses(types) {
  const allTypes = Object.keys(TYPE_EFFECTIVENESS);
  const result = {};
  allTypes.forEach(t => { result[t] = 1; });
  allTypes.forEach(atk => {
    const entry = TYPE_EFFECTIVENESS[atk];
    if (!entry) return;
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

function computeTypeMultiplier(attackType, defenderTypes) {
  const entry = TYPE_EFFECTIVENESS[attackType];
  if (!entry) return 1;
  let mult = 1;
  defenderTypes.forEach(defType => {
    if (entry.weakTo.includes(defType)) mult *= 2;
    if (entry.resistantTo.includes(defType)) mult *= 0.5;
    if (entry.immuneTo.includes(defType)) mult = 0;
  });
  return mult;
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

  const nameEs = species ? getSpanishName(species.names, capitalize(entry.name)) : capitalize(entry.name);
  const types = pokemon.types.map(t => t.type.name);
  const typesEs = types.map(typeLabel);

  const abilitySlugs = pokemon.abilities.map(a => a.ability.name);
  const abilityDataArr = await Promise.all(abilitySlugs.map(fetchAbility));
  const abilitiesEs = abilityDataArr.map((data, i) => {
    if (!data) return capitalize(abilitySlugs[i].replace(/-/g, ' '));
    return getSpanishName(data.names, capitalize(abilitySlugs[i].replace(/-/g, ' ')));
  });

  const statsMap = {};
  pokemon.stats.forEach(s => { statsMap[s.stat.name] = s.base_stat; });

  const weaknessGroups = getWeaknessGroups(types);
  const animated = pokemon.sprites?.versions?.['generation-v']?.['black-white']?.animated?.front_default || null;
  const staticSprite = pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

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

async function resolveMove(nameOrId) {
  const query = String(nameOrId).toLowerCase().trim();
  const move = await fetchMove(query);
  if (!move) throw new Error(`Movimiento "${nameOrId}" no encontrado`);

  const nameEs = getSpanishName(move.names, capitalize(move.name.replace(/-/g, ' ')));
  const type = move.type?.name || 'normal';
  return {
    id: move.id,
    nameEn: move.name,
    nameEs,
    type,
    typeEs: typeLabel(type),
    damageClass: move.damage_class?.name || 'status',
    accuracy: move.accuracy ?? null,
    power: move.power ?? null,
    pp: move.pp ?? null,
    isOffensive: move.damage_class?.name !== 'status',
    effect: '',
  };
}

function makeMoveState() {
  return { input: '', move: null, status: 'empty', error: null };
}

function renderTypeBadges(typesEs, typesEn) {
  return typesEs.map((tEs, i) => {
    const tEn = typesEn[i] || '';
    return `<span class="type-chip ${typeClass(tEn)}" title="${escapeHtml(tEs)}">${escapeHtml(tEs)}</span>`;
  }).join('');
}

function renderStats(stats) {
  const labels = { hp: 'HP', atk: 'ATQ', def: 'DEF', spa: 'SATQ', spd: 'SDEF', spe: 'VEL' };
  return Object.entries(labels).map(([key, label]) => `
    <div class="stat-pill">
      <span class="stat-pill__label">${label}</span>
      <span class="stat-pill__value">${stats[key] ?? '–'}</span>
    </div>
  `).join('');
}

function renderWeaknesses(groups) {
  const blocks = [];
  const renderGroup = (title, badge, cls, items, mult) => {
    if (!items.length) return '';
    return `
      <div class="matchup-block ${cls}">
        <div class="matchup-block__head">
          <div class="matchup-block__title"><span class="matchup-block__badge">${badge}</span>${title}</div>
        </div>
        <div class="matchup-grid">
          ${items.map(t => `<span class="matchup-chip ${mult === '4×' ? 'matchup-chip--4x' : mult === '2×' ? 'matchup-chip--2x' : mult === '¼' ? 'matchup-chip--quarter' : mult === '½' ? 'matchup-chip--half' : 'matchup-chip--immune'}"><span class="matchup-chip__mult">${mult}</span>${escapeHtml(typeLabel(t))}</span>`).join('')}
        </div>
      </div>
    `;
  };

  if (groups.weak4x.length || groups.weak2x.length) {
    blocks.push(renderGroup('Debilidades', '▲', 'matchup-block--weak', groups.weak4x, '4×'));
    blocks.push(renderGroup('', '', 'matchup-block--weak', groups.weak2x, '2×'));
  }
  if (groups.resist4x.length || groups.resist2x.length) {
    blocks.push(renderGroup('Resistencias', '▼', 'matchup-block--resist', groups.resist4x, '¼'));
    blocks.push(renderGroup('', '', 'matchup-block--resist', groups.resist2x, '½'));
  }
  if (groups.immune.length) {
    blocks.push(renderGroup('Inmunidades', '⊘', 'matchup-block--immune', groups.immune, '0×'));
  }
  return blocks.length ? `<div class="slot__matchup">${blocks.join('')}</div>` : '';
}

function renderMoveRow(team, index, moveIndex, moveState) {
  const inputId = `move-${team}-${index}-${moveIndex}`;
  return `
    <div class="move-row" data-move-row="${moveIndex}">
      <div class="move-field">
        <input
          id="${inputId}"
          class="move-input"
          type="search"
          inputmode="search"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="Mov. ${moveIndex + 1}"
          data-team="${team}"
          data-index="${index}"
          data-move-index="${moveIndex}"
          value="${escapeHtml(moveState.input || '')}"
          aria-label="Movimiento ${moveIndex + 1}"
        />
        <ul class="move-ac" id="move-ac-${team}-${index}-${moveIndex}" role="listbox"></ul>
      </div>
      <div class="move-meta">
        ${moveState.move ? `
          <span class="move-chip ${typeClass(moveState.move.type)}">${escapeHtml(moveState.move.typeEs)}</span>
          <span class="move-chip ${moveState.move.damageClass === 'status' ? 'move-chip--statusmove' : 'move-chip--damage'}">
            ${moveState.move.damageClass === 'status' ? 'Estado' : (moveState.move.power ? `${moveState.move.power}` : 'Ofensivo')}
          </span>
        ` : `<span class="move-chip move-chip--status">Vacío</span>`}
      </div>
    </div>
  `;
}

function renderMovesBlock(index, slot) {
  return `
    <div class="slot__moves">
      <div class="moves-head">
        <span class="moves-head__title">Movimientos</span>
      </div>
      <div class="moves-grid">
        ${slot.moves.map((m, i) => renderMoveRow('my', index, i, m)).join('')}
      </div>
    </div>
  `;
}

function renderFilledCard(pokemon, team, index) {
  return `
    <div class="slot__card">
      <div class="slot__card-top">
        <div class="slot__sprite-wrap">
          <img class="slot__sprite" src="${pokemon.sprite}" alt="${escapeHtml(pokemon.nameEs)}" loading="lazy" decoding="async" />
        </div>
        <div class="slot__meta">
          <div class="slot__name-row">
            <div class="slot__name">${escapeHtml(pokemon.nameEs)}</div>
          </div>
          <div class="slot__type-row">
            ${pokemon.types.map((t, i) => `<span class="type-chip ${typeClass(t)}" title="${escapeHtml(pokemon.typesEs[i])}">${escapeHtml(pokemon.typesEs[i])}</span>`).join('')}
          </div>
        </div>
        <button class="slot__btn-remove" data-team="${team}" data-index="${index}" aria-label="Eliminar ${escapeHtml(pokemon.nameEs)}">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71 12 12.01l-6.29-6.3-1.42 1.42 6.3 6.29-6.3 6.29 1.42 1.42 6.29-6.3 6.29 6.3 1.42-1.42-6.3-6.29 6.3-6.29z"/></svg>
        </button>
      </div>
      <div class="slot__body">
        <div class="slot__stats">${renderStats(pokemon.stats)}</div>
        <div class="slot__abilities">${pokemon.abilitiesEs.map(a => `<span class="ability-chip">${escapeHtml(a)}</span>`).join('')}</div>
        ${renderWeaknesses(pokemon.weaknessGroups)}
        ${team === 'my' ? renderMovesBlock(index, state.myTeam[index]) : ''}
      </div>
    </div>
  `;
}

function getSlotEl(team, index) {
  const gridId = team === 'my' ? 'myTeamGrid' : 'rivalTeamGrid';
  return document.getElementById(gridId)?.querySelector(`[data-slot-index="${index}"]`);
}

function renderSlot(team, index) {
  const slotEl = getSlotEl(team, index);
  if (!slotEl) return;
  const slot = slotAt(team, index);
  slotEl.className = `slot slot--${team}`;
  switch (slot.status) {
    case 'empty':
      slotEl.innerHTML = `<div class="slot__empty" data-team="${team}" data-index="${index}" role="button" tabindex="0" aria-label="Añadir Pokémon al slot ${index + 1}"><span class="slot__empty-icon">＋</span><span class="slot__empty-label">Añadir</span></div>`;
      break;
    case 'input':
      slotEl.classList.add('slot--active');
      slotEl.innerHTML = `<div class="slot__input-wrap"><input class="slot__input" type="search" inputmode="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Buscar Pokémon…" data-team="${team}" data-index="${index}" value="${escapeHtml(slot.nameInput)}" aria-label="Buscar Pokémon para slot ${index + 1}" aria-autocomplete="list" /><ul class="autocomplete-list" id="ac-${team}-${index}" role="listbox" aria-label="Sugerencias"></ul></div>`;
      initPokemonAutocomplete(slotEl.querySelector('.slot__input'), slotEl.querySelector('.autocomplete-list'), team, index);
      slotEl.querySelector('.slot__input')?.focus({ preventScroll: true });
      break;
    case 'loading':
      slotEl.innerHTML = `<div class="slot__loading"><div class="spinner"></div><span>Cargando…</span></div>`;
      break;
    case 'error':
      slotEl.innerHTML = `<div class="slot__error"><span class="slot__error-msg">⚠️ ${escapeHtml(slot.error || 'Error desconocido')}</span><button class="slot__error-retry" data-team="${team}" data-index="${index}">Reintentar</button></div>`;
      break;
    case 'filled':
      slotEl.classList.add('slot--filled');
      slotEl.innerHTML = renderFilledCard(slot.pokemon, team, index);
      break;
  }
}

function renderAllSlots(team) {
  const arr = team === 'my' ? state.myTeam : state.rivalTeam;
  arr.forEach((_, i) => renderSlot(team, i));
}

function initGrid(team) {
  const gridId = team === 'my' ? 'myTeamGrid' : 'rivalTeamGrid';
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  for (let i = 0; i < TEAM_SIZE; i++) {
    const el = document.createElement('div');
    el.className = `slot slot--${team}`;
    el.setAttribute('data-slot-index', i);
    el.setAttribute('role', 'listitem');
    grid.appendChild(el);
  }
}

function handleSlotActivation(team, index) {
  const slot = slotAt(team, index);
  if (slot.status === 'empty') {
    slot.status = 'input';
    slot.nameInput = '';
    renderSlot(team, index);
  }
}

function handleRemove(team, index) {
  const slot = slotAt(team, index);
  slot.status = 'empty';
  slot.pokemon = null;
  slot.nameInput = '';
  slot.error = null;
  slot.moves = Array.from({ length: MOVES_PER_SLOT }, makeMoveSlot);
  slot.resolvedMoves = [];
  renderSlot(team, index);
  if (team === 'my') recomputeAnalysis();
}

function handleRetry(team, index) {
  const slot = slotAt(team, index);
  slot.status = 'input';
  slot.error = null;
  slot.nameInput = '';
  renderSlot(team, index);
}

function clearTeam(team) {
  const arr = team === 'my' ? state.myTeam : state.rivalTeam;
  arr.forEach(slot => {
    slot.status = 'empty';
    slot.pokemon = null;
    slot.nameInput = '';
    slot.error = null;
    slot.moves = Array.from({ length: MOVES_PER_SLOT }, makeMoveSlot);
    slot.resolvedMoves = [];
  });
  renderAllSlots(team);
  if (team === 'my') recomputeAnalysis();
}

function cancelInput(team, index) {
  const slot = slotAt(team, index);
  slot.status = 'empty';
  slot.nameInput = '';
  renderSlot(team, index);
}

function initPokemonAutocomplete(input, listEl, team, index) {
  let highlighted = -1;

  function currentSlot() {
    return slotAt(team, index);
  }

  function updateHighlight(items, newIdx) {
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.remove('is-highlighted');
    highlighted = newIdx;
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.add('is-highlighted');
  }

  const doSearch = debounce(async (query) => {
    if (currentSlot().status !== 'input') return;
    if (!query || query.length < 2) {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      return;
    }

    const list = await loadPokemonList().catch(() => null);
    if (!list) return;

    if (input.value.trim().toLowerCase() !== query) return;

    const q = query.toLowerCase();
    const results = list.filter(p => p.name.includes(q) || String(p.id) === q).slice(0, 8);

    if (!results.length) {
      listEl.innerHTML  = '><span class="autocomplete-list__name">Sin resultados</span></li>';
      listEl.classList.add('is-open');
      return;
    }

    highlighted = -1;
    listEl.innerHTML = results.map(p => `
      >
        <img class="autocomplete-list__img" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png" alt="" loading="lazy" decoding="async" />
        <span class="autocomplete-list__name">${capitalize(p.name)}</span>
        <span class="autocomplete-list__id">#${String(p.id).padStart(4, '0')}</span>
      </li>
    `).join('');
    listEl.classList.add('is-open');
  }, DEBOUNCE_MS);

  async function selectPokemon(nameEn) {
    const slot = currentSlot();
    slot.status = 'loading';
    listEl.innerHTML = '';
    listEl.classList.remove('is-open');
    renderSlot(team, index);
    try {
      const resolved = await resolvePokemon(nameEn);
      slot.pokemon = resolved;
      slot.status = 'filled';
      slot.error = null;
    } catch (e) {
      slot.status = 'error';
      slot.error = e.message || 'Error al cargar el Pokémon';
    }
    renderSlot(team, index);
    if (team === 'my') recomputeAnalysis();
  }

  input.addEventListener('input', () => {
    const slot = currentSlot();
    if (slot.status !== 'input') return;
    slot.nameInput = input.value;
    doSearch(input.value.trim().toLowerCase());
  });

  input.addEventListener('keydown', async (e) => {
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
        if (name) await selectPokemon(name);
      }
    } else if (e.key === 'Escape') {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      cancelInput(team, index);
    }
  });

  listEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('.autocomplete-list__item');
    if (item?.dataset.name) selectPokemon(item.dataset.name);
  });

  listEl.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.autocomplete-list__item');
    if (item?.dataset.name) {
      e.preventDefault();
      selectPokemon(item.dataset.name);
    }
  }, { passive: false });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      const slot = currentSlot();
      if (slot.status === 'input') {
        listEl.innerHTML = '';
        listEl.classList.remove('is-open');
        if (!slot.nameInput.trim()) cancelInput(team, index);
      }
    }, 180);
  });
}

function initMoveAutocomplete(input, listEl, team, index, moveIndex) {
  let highlighted = -1;

  function currentMove() {
    return slotAt(team, index).moves[moveIndex];
  }

  function updateHighlight(items, newIdx) {
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.remove('is-highlighted');
    highlighted = newIdx;
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.add('is-highlighted');
  }

  const doSearch = debounce(async (query) => {
    if (!query || query.length < 2) {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      return;
    }

    const list = await loadMoveList().catch(() => null);
    if (!list) return;
    if (input.value.trim().toLowerCase() !== query) return;

    const q = query.toLowerCase();
    const results = list.filter(m => m.name.includes(q) || (m.nameEs || '').toLowerCase().includes(q)).slice(0, 8);

    if (!results.length) {
      listEl.innerHTML  = '><span class="move-ac__name">Sin resultados</span></li>';
      listEl.classList.add('is-open');
      return;
    }

    highlighted = -1;
    listEl.innerHTML = results.map(m => `
      >
        <span class="move-ac__name">${escapeHtml(m.nameEs || capitalize(m.name.replace(/-/g, ' ')))}</span>
        <span class="move-ac__meta">
          <span class="move-chip ${typeClass(m.type)}">${escapeHtml(typeLabel(m.type))}</span>
        </span>
      </li>
    `).join('');
    listEl.classList.add('is-open');
  }, DEBOUNCE_MS);

  async function selectMove(nameEn) {
    const moveState = currentMove();
    moveState.status = 'loading';
    listEl.innerHTML = '';
    listEl.classList.remove('is-open');
    renderSlot(team, index);
    try {
      const resolved = await resolveMove(nameEn);
      moveState.move = resolved;
      moveState.input = resolved.nameEs;
      moveState.status = 'filled';
      moveState.error = null;
      await syncResolvedMoves(team, index);
    } catch (e) {
      moveState.status = 'error';
      moveState.error = e.message || 'Error al cargar el movimiento';
    }
    renderSlot(team, index);
    if (team === 'my') recomputeAnalysis();
  }

  input.addEventListener('input', () => {
    const moveState = currentMove();
    moveState.input = input.value;
    doSearch(input.value.trim().toLowerCase());
  });

  input.addEventListener('keydown', async (e) => {
    const items = Array.from(listEl.querySelectorAll('.move-ac__item'));
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateHighlight(items, Math.min(highlighted + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateHighlight(items, Math.max(highlighted - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && items[highlighted]) await selectMove(items[highlighted].dataset.name);
    } else if (e.key === 'Escape') {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
    }
  });

  listEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('.move-ac__item');
    if (item?.dataset.name) selectMove(item.dataset.name);
  });

  listEl.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.move-ac__item');
    if (item?.dataset.name) {
      e.preventDefault();
      selectMove(item.dataset.name);
    }
  }, { passive: false });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!currentMove().input.trim()) {
        currentMove().move = null;
        currentMove().status = 'empty';
        renderSlot(team, index);
        if (team === 'my') recomputeAnalysis();
      } else {
        listEl.innerHTML = '';
        listEl.classList.remove('is-open');
      }
    }, 180);
  });
}

async function syncResolvedMoves(team, index) {
  const slot = slotAt(team, index);
  const resolved = [];
  for (const m of slot.moves) {
    if (m.move?.nameEn) {
      const data = await resolveMove(m.move.nameEn).catch(() => null);
      if (data) resolved.push(data);
    }
  }
  slot.resolvedMoves = resolved;
}

function getAttackingTypeScore(move) {
  if (!move || move.damageClass === 'status') return 0;
  return (move.power || 50) * (move.accuracy ? move.accuracy / 100 : 1);
}

function scoreCoverageAgainstPokemon(attackingMoves, defender) {
  if (!defender) return 0;
  let best = 0;
  for (const move of attackingMoves) {
    if (!move || move.damageClass === 'status') continue;
    const mult = computeTypeMultiplier(move.type, defender.types);
    const base = getAttackingTypeScore(move);
    best = Math.max(best, base * mult);
  }
  return best;
}

function getFallbackStabMoves(pokemon) {
  const types = pokemon?.types || [];
  return types.map(t => ({
    nameEn: `stab-${t}`,
    nameEs: `STAB ${typeLabel(t)}`,
    type: t,
    typeEs: typeLabel(t),
    damageClass: 'special',
    accuracy: 100,
    power: 60,
    pp: null,
    isFallback: true,
  }));
}

function getEffectiveAttackPool(slot) {
  const fromMoves = (slot.resolvedMoves || []).filter(m => m && m.damageClass !== 'status');
  return fromMoves.length ? fromMoves : getFallbackStabMoves(slot.pokemon || {});
}

function computeTeamCoverage(myTeam, rivalTeam) {
  const rivalMembers = rivalTeam.filter(s => s?.pokemon);
  return myTeam.map((slot, index) => {
    if (!slot?.pokemon) return { index, score: 0, label: 'Vacío' };
    const pool = getEffectiveAttackPool(slot);
    let total = 0;
    let bestTargets = [];
    rivalMembers.forEach(r => {
      const score = scoreCoverageAgainstPokemon(pool, r.pokemon);
      total += score;
      if (score > 0) bestTargets.push({ nameEs: r.pokemon.nameEs, score });
    });
    bestTargets.sort((a, b) => b.score - a.score);
    return {
      index,
      nameEs: slot.pokemon.nameEs,
      score: total,
      bestTargets: bestTargets.slice(0, 3),
    };
  });
}

function computeRivalThreats(myTeam, rivalTeam) {
  const myMembers = myTeam.filter(s => s?.pokemon);
  return rivalTeam.map((slot, index) => {
    if (!slot?.pokemon) return { index, score: 0 };
    const attackTypes = slot.pokemon.types;
    let score = 0;
    let hits = [];
    myMembers.forEach(m => {
      const mult = Math.max(...attackTypes.map(t => computeTypeMultiplier(t, m.pokemon.types)));
      if (mult > 1) {
        score += mult;
        hits.push({ nameEs: m.pokemon.nameEs, mult });
      }
    });
    hits.sort((a, b) => b.mult - a.mult);
    return {
      index,
      nameEs: slot.pokemon.nameEs,
      score,
      hits: hits.slice(0, 3),
    };
  });
}

function computeWeakPicks(myTeam, rivalTeam) {
  return myTeam.map((slot, index) => {
    if (!slot?.pokemon) return { index, score: 0 };
    const pool = getEffectiveAttackPool(slot);
    let pressure = 0;
    rivalTeam.forEach(r => {
      if (!r?.pokemon) return;
      const best = Math.max(...pool.map(m => scoreCoverageAgainstPokemon([m], r.pokemon)));
      pressure += best;
    });
    const coverageCount = pool.filter(m => m.damageClass !== 'status').length;
    return {
      index,
      nameEs: slot.pokemon.nameEs,
      pressure,
      coverageCount,
      score: pressure + coverageCount * 20,
    };
  }).sort((a, b) => a.score - b.score);
}

function getRepeatedWeaknesses(myTeam) {
  const counts = {};
  myTeam.forEach(s => {
    if (!s.pokemon) return;
    const groups = s.pokemon.weaknessGroups;
    [...groups.weak4x, ...groups.weak2x].forEach(t => {
      counts[t] = (counts[t] || 0) + 1;
    });
  });
  return Object.entries(counts).filter(([, n]) => n >= 2).map(([t]) => t);
}

function buildAnalysis() {
  const myFilled = state.myTeam.filter(s => s.pokemon);
  const rivalFilled = state.rivalTeam.filter(s => s.pokemon);

  if (!myFilled.length && !rivalFilled.length) {
    state.analysis = { summary: null, coverage: [], threats: [], weakPicks: [], signals: [] };
    renderAnalysis();
    return;
  }

  const coverage = computeTeamCoverage(state.myTeam, state.rivalTeam)
    .filter(x => x.nameEs)
    .sort((a, b) => b.score - a.score);

  const threats = computeRivalThreats(state.myTeam, state.rivalTeam)
    .filter(x => x.nameEs)
    .sort((a, b) => b.score - a.score);

  const weakPicks = computeWeakPicks(state.myTeam, state.rivalTeam)
    .filter(x => x.nameEs)
    .slice(0, 3);

  const signals = [];
  if (coverage[0]) signals.push({ kind: 'good', text: `${coverage[0].nameEs} presiona mejor el matchup` });
  if (coverage[1]) signals.push({ kind: 'good', text: `${coverage[1].nameEs} también aporta buena cobertura` });
  if (threats[0]) signals.push({ kind: 'bad', text: `${threats[0].nameEs} es la mayor amenaza rival` });

  const repeatedWeaknesses = getRepeatedWeaknesses(state.myTeam);
  if (repeatedWeaknesses.length) {
    signals.push({ kind: 'warn', text: `Debilidad compartida: ${repeatedWeaknesses.slice(0, 2).map(typeLabel).join(' y ')}` });
  }

  state.analysis = {
    summary: {
      myCount: myFilled.length,
      rivalCount: rivalFilled.length,
      bestPressure: coverage[0] || null,
      biggestThreat: threats[0] || null,
    },
    coverage,
    threats,
    weakPicks,
    signals,
  };

  renderAnalysis();
}

function renderAnalysisList(items, kind) {
  if (!items.length) return '<div class="analysis-empty">Añade Pokémon para ver el análisis.</div>';
  return items.map(item => {
    if (kind === 'coverage') {
      const chips = item.bestTargets.map(t => `<span class="analysis-chip analysis-chip--good">${escapeHtml(t.nameEs)}</span>`).join('');
      return `<div class="analysis-card"><div class="analysis-card__title">Presión ofensiva</div><div class="analysis-copy">${escapeHtml(item.nameEs)} suma ${Math.round(item.score)} puntos de presión aproximada.</div><div class="analysis-card__body">${chips}</div></div>`;
    }
    if (kind === 'threats') {
      const chips = item.hits.map(t => `<span class="analysis-chip analysis-chip--bad">${escapeHtml(t.nameEs)}</span>`).join('');
      return `<div class="analysis-card"><div class="analysis-card__title">Amenaza rival</div><div class="analysis-copy">${escapeHtml(item.nameEs)} castiga varias piezas de tu equipo.</div><div class="analysis-card__body">${chips}</div></div>`;
    }
    if (kind === 'weakPicks') {
      return `<div class="analysis-card"><div class="analysis-card__title">Pick con menos valor</div><div class="analysis-copy">${escapeHtml(item.nameEs)} aporta menos presión relativa en este matchup.</div></div>`;
    }
    return '';
  }).join('');
}

function renderAnalysis() {
  const overview = document.getElementById('matchupOverview');
  const tactical = document.getElementById('tacticalRead');

  if (!state.analysis.summary) {
    overview.innerHTML = `<div class="analysis-empty">Añade al menos un Pokémon a cada lado para empezar a ver la visión del matchup.</div>`;
    tactical.innerHTML = `<div class="analysis-empty">Los movimientos de tu equipo activarán esta lectura táctica.</div>`;
    return;
  }

  const s = state.analysis.summary;
  overview.innerHTML = `
    <div class="analysis-card">
      <div class="analysis-card__title">Estado general</div>
      <div class="analysis-copy">Tu equipo tiene ${s.myCount} Pokémon definidos y el rival ${s.rivalCount}. ${s.bestPressure ? `El mayor peso ofensivo lo tiene <strong>${escapeHtml(s.bestPressure.nameEs)}</strong>.` : ''} ${s.biggestThreat ? `La amenaza principal rival es <strong>${escapeHtml(s.biggestThreat.nameEs)}</strong>.` : ''}</div>
    </div>
    ${state.analysis.signals.map(sig => `
      <div class="analysis-card">
        <div class="analysis-card__title">${sig.kind === 'good' ? 'Señal positiva' : sig.kind === 'bad' ? 'Ojo' : 'Debilidad repetida'}</div>
        <div class="analysis-copy">${escapeHtml(sig.text)}</div>
      </div>
    `).join('')}
  `;

  tactical.innerHTML = `
    ${renderAnalysisList(state.analysis.coverage.slice(0, 3), 'coverage')}
    ${renderAnalysisList(state.analysis.threats.slice(0, 3), 'threats')}
    ${renderAnalysisList(state.analysis.weakPicks.slice(0, 3), 'weakPicks')}
  `;
}

function recomputeAnalysis() {
  buildAnalysis();
}

function serializeMyTeam() {
  return state.myTeam.map(slot => ({
    nameInput: slot.nameInput,
    pokemon: slot.pokemon,
    moves: slot.moves,
    resolvedMoves: slot.resolvedMoves,
    status: slot.status,
    error: slot.error,
  }));
}

function saveMyTeam() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(serializeMyTeam()));
    showToast('Equipo guardado');
  } catch {
    showToast('No se pudo guardar');
  }
}

function persistAuto() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(serializeMyTeam()));
  } catch {}
}

async function loadSavedTeam() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return;
    saved.forEach((savedSlot, i) => {
      if (i < TEAM_SIZE && savedSlot) {
        state.myTeam[i] = {
          ...makeSlot(),
          nameInput: savedSlot.nameInput || '',
          pokemon: savedSlot.pokemon || null,
          moves: Array.isArray(savedSlot.moves) ? savedSlot.moves.map(m => ({
            input: m?.input || '',
            move: m?.move || null,
            status: m?.status || 'empty',
            error: m?.error || null,
          })).concat(Array.from({ length: Math.max(0, 4 - (savedSlot.moves?.length || 0)) }, makeMoveSlot)).slice(0, 4) : Array.from({ length: 4 }, makeMoveSlot),
          resolvedMoves: savedSlot.resolvedMoves || [],
          status: savedSlot.status || (savedSlot.pokemon ? 'filled' : 'empty'),
          error: savedSlot.error || null,
        };
      }
    });
  } catch {}
}

function renderAll() {
  renderAllSlots('my');
  renderAllSlots('rival');
  renderAnalysis();
}

function initGrid(team) {
  const gridId = team === 'my' ? 'myTeamGrid' : 'rivalTeamGrid';
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  for (let i = 0; i < TEAM_SIZE; i++) {
    const el = document.createElement('div');
    el.className = `slot slot--${team}`;
    el.setAttribute('data-slot-index', i);
    el.setAttribute('role', 'listitem');
    grid.appendChild(el);
  }
}

function renderAllSlots(team) {
  const arr = team === 'my' ? state.myTeam : state.rivalTeam;
  arr.forEach((_, i) => renderSlot(team, i));
}

function handleSlotActivation(team, index) {
  const slot = slotAt(team, index);
  if (slot.status === 'empty') {
    slot.status = 'input';
    slot.nameInput = '';
    renderSlot(team, index);
  }
}

function handleRemove(team, index) {
  const slot = slotAt(team, index);
  slot.status = 'empty';
  slot.pokemon = null;
  slot.nameInput = '';
  slot.error = null;
  slot.moves = Array.from({ length: MOVES_PER_SLOT }, makeMoveSlot);
  slot.resolvedMoves = [];
  renderSlot(team, index);
  if (team === 'my') recomputeAnalysis();
}

function handleRetry(team, index) {
  const slot = slotAt(team, index);
  slot.status = 'input';
  slot.error = null;
  slot.nameInput = '';
  renderSlot(team, index);
}

function clearTeam(team) {
  const arr = team === 'my' ? state.myTeam : state.rivalTeam;
  arr.forEach(slot => {
    slot.status = 'empty';
    slot.pokemon = null;
    slot.nameInput = '';
    slot.error = null;
    slot.moves = Array.from({ length: MOVES_PER_SLOT }, makeMoveSlot);
    slot.resolvedMoves = [];
  });
  renderAllSlots(team);
  if (team === 'my') recomputeAnalysis();
}

function cancelInput(team, index) {
  const slot = slotAt(team, index);
  slot.status = 'empty';
  slot.nameInput = '';
  renderSlot(team, index);
}

function initPokemonAutocomplete(input, listEl, team, index) {
  let highlighted = -1;

  function currentSlot() {
    return slotAt(team, index);
  }

  function updateHighlight(items, newIdx) {
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.remove('is-highlighted');
    highlighted = newIdx;
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.add('is-highlighted');
  }

  const doSearch = debounce(async (query) => {
    if (currentSlot().status !== 'input') return;
    if (!query || query.length < 2) {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      return;
    }

    const list = await loadPokemonList().catch(() => null);
    if (!list) return;

    if (input.value.trim().toLowerCase() !== query) return;

    const q = query.toLowerCase();
    const results = list.filter(p => p.name.includes(q) || String(p.id) === q).slice(0, 8);

    if (!results.length) {
      listEl.innerHTML  = '><span class="autocomplete-list__name">Sin resultados</span></li>';
      listEl.classList.add('is-open');
      return;
    }

    highlighted = -1;
    listEl.innerHTML = results.map(p => `
      >
        <img class="autocomplete-list__img" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png" alt="" loading="lazy" decoding="async" />
        <span class="autocomplete-list__name">${capitalize(p.name)}</span>
        <span class="autocomplete-list__id">#${String(p.id).padStart(4, '0')}</span>
      </li>
    `).join('');
    listEl.classList.add('is-open');
  }, DEBOUNCE_MS);

  async function selectPokemon(nameEn) {
    const slot = currentSlot();
    slot.status = 'loading';
    listEl.innerHTML = '';
    listEl.classList.remove('is-open');
    renderSlot(team, index);
    try {
      const resolved = await resolvePokemon(nameEn);
      slot.pokemon = resolved;
      slot.status = 'filled';
      slot.error = null;
    } catch (e) {
      slot.status = 'error';
      slot.error = e.message || 'Error al cargar el Pokémon';
    }
    renderSlot(team, index);
    if (team === 'my') recomputeAnalysis();
  }

  input.addEventListener('input', () => {
    const slot = currentSlot();
    if (slot.status !== 'input') return;
    slot.nameInput = input.value;
    doSearch(input.value.trim().toLowerCase());
  });

  input.addEventListener('keydown', async (e) => {
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
        if (name) await selectPokemon(name);
      }
    } else if (e.key === 'Escape') {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      cancelInput(team, index);
    }
  });

  listEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('.autocomplete-list__item');
    if (item?.dataset.name) selectPokemon(item.dataset.name);
  });

  listEl.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.autocomplete-list__item');
    if (item?.dataset.name) {
      e.preventDefault();
      selectPokemon(item.dataset.name);
    }
  }, { passive: false });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      const slot = currentSlot();
      if (slot.status === 'input') {
        listEl.innerHTML = '';
        listEl.classList.remove('is-open');
        if (!slot.nameInput.trim()) cancelInput(team, index);
      }
    }, 180);
  });
}

function initMoveAutocomplete(input, listEl, team, index, moveIndex) {
  let highlighted = -1;

  function currentMove() {
    return slotAt(team, index).moves[moveIndex];
  }

  function updateHighlight(items, newIdx) {
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.remove('is-highlighted');
    highlighted = newIdx;
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.add('is-highlighted');
  }

  const doSearch = debounce(async (query) => {
    if (!query || query.length < 2) {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      return;
    }

    const list = await loadMoveList().catch(() => null);
    if (!list) return;
    if (input.value.trim().toLowerCase() !== query) return;

    const q = query.toLowerCase();
    const results = list.filter(m => m.name.includes(q) || (m.nameEs || '').toLowerCase().includes(q)).slice(0, 8);

    if (!results.length) {
      listEl.innerHTML  = '><span class="move-ac__name">Sin resultados</span></li>';
      listEl.classList.add('is-open');
      return;
    }

    highlighted = -1;
    listEl.innerHTML = results.map(m => `
      >
        <span class="move-ac__name">${escapeHtml(m.nameEs || capitalize(m.name.replace(/-/g, ' ')))}</span>
        <span class="move-ac__meta">
          <span class="move-chip ${typeClass(m.type)}">${escapeHtml(typeLabel(m.type))}</span>
        </span>
      </li>
    `).join('');
    listEl.classList.add('is-open');
  }, DEBOUNCE_MS);

  async function selectMove(nameEn) {
    const moveState = currentMove();
    moveState.status = 'loading';
    listEl.innerHTML = '';
    listEl.classList.remove('is-open');
    renderSlot(team, index);
    try {
      const resolved = await resolveMove(nameEn);
      moveState.move = resolved;
      moveState.input = resolved.nameEs;
      moveState.status = 'filled';
      moveState.error = null;
      await syncResolvedMoves(team, index);
    } catch (e) {
      moveState.status = 'error';
      moveState.error = e.message || 'Error al cargar el movimiento';
    }
    renderSlot(team, index);
    if (team === 'my') recomputeAnalysis();
  }

  input.addEventListener('input', () => {
    const moveState = currentMove();
    moveState.input = input.value;
    doSearch(input.value.trim().toLowerCase());
  });

  input.addEventListener('keydown', async (e) => {
    const items = Array.from(listEl.querySelectorAll('.move-ac__item'));
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateHighlight(items, Math.min(highlighted + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateHighlight(items, Math.max(highlighted - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && items[highlighted]) await selectMove(items[highlighted].dataset.name);
    } else if (e.key === 'Escape') {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
    }
  });

  listEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('.move-ac__item');
    if (item?.dataset.name) selectMove(item.dataset.name);
  });

  listEl.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.move-ac__item');
    if (item?.dataset.name) {
      e.preventDefault();
      selectMove(item.dataset.name);
    }
  }, { passive: false });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!currentMove().input.trim()) {
        currentMove().move = null;
        currentMove().status = 'empty';
        renderSlot(team, index);
        if (team === 'my') recomputeAnalysis();
      } else {
        listEl.innerHTML = '';
        listEl.classList.remove('is-open');
      }
    }, 180);
  });
}

function renderMoveRow(team, index, moveIndex, moveState) {
  const inputId = `move-${team}-${index}-${moveIndex}`;
  return `
    <div class="move-row" data-move-row="${moveIndex}">
      <div class="move-field">
        <input
          id="${inputId}"
          class="move-input"
          type="search"
          inputmode="search"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="Mov. ${moveIndex + 1}"
          data-team="${team}"
          data-index="${index}"
          data-move-index="${moveIndex}"
          value="${escapeHtml(moveState.input || '')}"
          aria-label="Movimiento ${moveIndex + 1}"
        />
        <ul class="move-ac" id="move-ac-${team}-${index}-${moveIndex}" role="listbox"></ul>
      </div>
      <div class="move-meta">
        ${moveState.move ? `
          <span class="move-chip ${typeClass(moveState.move.type)}">${escapeHtml(moveState.move.typeEs)}</span>
          <span class="move-chip ${moveState.move.damageClass === 'status' ? 'move-chip--statusmove' : 'move-chip--damage'}">
            ${moveState.move.damageClass === 'status' ? 'Estado' : (moveState.move.power ? `${moveState.move.power}` : 'Ofensivo')}
          </span>
        ` : `<span class="move-chip move-chip--status">Vacío</span>`}
      </div>
    </div>
  `;
}

function renderMovesBlock(index, slot) {
  return `
    <div class="slot__moves">
      <div class="moves-head">
        <span class="moves-head__title">Movimientos</span>
      </div>
      <div class="moves-grid">
        ${slot.moves.map((m, i) => renderMoveRow('my', index, i, m)).join('')}
      </div>
    </div>
  `;
}

function renderFilledCard(pokemon, team, index) {
  return `
    <div class="slot__card">
      <div class="slot__card-top">
        <div class="slot__sprite-wrap">
          <img class="slot__sprite" src="${pokemon.sprite}" alt="${escapeHtml(pokemon.nameEs)}" loading="lazy" decoding="async" />
        </div>
        <div class="slot__meta">
          <div class="slot__name-row">
            <div class="slot__name">${escapeHtml(pokemon.nameEs)}</div>
          </div>
          <div class="slot__type-row">
            ${pokemon.types.map((t, i) => `<span class="type-chip ${typeClass(t)}" title="${escapeHtml(pokemon.typesEs[i])}">${escapeHtml(pokemon.typesEs[i])}</span>`).join('')}
          </div>
        </div>
        <button class="slot__btn-remove" data-team="${team}" data-index="${index}" aria-label="Eliminar ${escapeHtml(pokemon.nameEs)}">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M18.3 5.71 12 12.01l-6.29-6.3-1.42 1.42 6.3 6.29-6.3 6.29 1.42 1.42 6.29-6.3 6.29 6.3 1.42-1.42-6.3-6.29 6.3-6.29z"/></svg>
        </button>
      </div>
      <div class="slot__body">
        <div class="slot__stats">${renderStats(pokemon.stats)}</div>
        <div class="slot__abilities">${pokemon.abilitiesEs.map(a => `<span class="ability-chip">${escapeHtml(a)}</span>`).join('')}</div>
        ${renderWeaknesses(pokemon.weaknessGroups)}
        ${team === 'my' ? renderMovesBlock(index, state.myTeam[index]) : ''}
      </div>
    </div>
  `;
}

function getSlotEl(team, index) {
  const gridId = team === 'my' ? 'myTeamGrid' : 'rivalTeamGrid';
  return document.getElementById(gridId)?.querySelector(`[data-slot-index="${index}"]`);
}

function renderSlot(team, index) {
  const slotEl = getSlotEl(team, index);
  if (!slotEl) return;
  const slot = slotAt(team, index);
  slotEl.className = `slot slot--${team}`;
  switch (slot.status) {
    case 'empty':
      slotEl.innerHTML = `<div class="slot__empty" data-team="${team}" data-index="${index}" role="button" tabindex="0" aria-label="Añadir Pokémon al slot ${index + 1}"><span class="slot__empty-icon">＋</span><span class="slot__empty-label">Añadir</span></div>`;
      break;
    case 'input':
      slotEl.classList.add('slot--active');
      slotEl.innerHTML = `<div class="slot__input-wrap"><input class="slot__input" type="search" inputmode="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Buscar Pokémon…" data-team="${team}" data-index="${index}" value="${escapeHtml(slot.nameInput)}" aria-label="Buscar Pokémon para slot ${index + 1}" aria-autocomplete="list" /><ul class="autocomplete-list" id="ac-${team}-${index}" role="listbox" aria-label="Sugerencias"></ul></div>`;
      initPokemonAutocomplete(slotEl.querySelector('.slot__input'), slotEl.querySelector('.autocomplete-list'), team, index);
      slotEl.querySelector('.slot__input')?.focus({ preventScroll: true });
      break;
    case 'loading':
      slotEl.innerHTML = `<div class="slot__loading"><div class="spinner"></div><span>Cargando…</span></div>`;
      break;
    case 'error':
      slotEl.innerHTML = `<div class="slot__error"><span class="slot__error-msg">⚠️ ${escapeHtml(slot.error || 'Error desconocido')}</span><button class="slot__error-retry" data-team="${team}" data-index="${index}">Reintentar</button></div>`;
      break;
    case 'filled':
      slotEl.classList.add('slot--filled');
      slotEl.innerHTML = renderFilledCard(slot.pokemon, team, index);
      break;
  }
}

function renderAllSlots(team) {
  const arr = team === 'my' ? state.myTeam : state.rivalTeam;
  arr.forEach((_, i) => renderSlot(team, i));
}

function initPokemonAutocomplete(input, listEl, team, index) {
  let highlighted = -1;

  function currentSlot() {
    return slotAt(team, index);
  }

  function updateHighlight(items, newIdx) {
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.remove('is-highlighted');
    highlighted = newIdx;
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.add('is-highlighted');
  }

  const doSearch = debounce(async (query) => {
    if (currentSlot().status !== 'input') return;
    if (!query || query.length < 2) {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      return;
    }

    const list = await loadPokemonList().catch(() => null);
    if (!list) return;
    if (input.value.trim().toLowerCase() !== query) return;

    const q = query.toLowerCase();
    const results = list.filter(p => p.name.includes(q) || String(p.id) === q).slice(0, 8);

    if (!results.length) {
      listEl.innerHTML  = '><span class="autocomplete-list__name">Sin resultados</span></li>';
      listEl.classList.add('is-open');
      return;
    }

    highlighted = -1;
    listEl.innerHTML = results.map(p => `
      >
        <img class="autocomplete-list__img" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png" alt="" loading="lazy" decoding="async" />
        <span class="autocomplete-list__name">${capitalize(p.name)}</span>
        <span class="autocomplete-list__id">#${String(p.id).padStart(4, '0')}</span>
      </li>
    `).join('');
    listEl.classList.add('is-open');
  }, DEBOUNCE_MS);

  async function selectPokemon(nameEn) {
    const slot = currentSlot();
    slot.status = 'loading';
    listEl.innerHTML = '';
    listEl.classList.remove('is-open');
    renderSlot(team, index);
    try {
      const resolved = await resolvePokemon(nameEn);
      slot.pokemon = resolved;
      slot.status = 'filled';
      slot.error = null;
    } catch (e) {
      slot.status = 'error';
      slot.error = e.message || 'Error al cargar el Pokémon';
    }
    renderSlot(team, index);
    if (team === 'my') recomputeAnalysis();
  }

  input.addEventListener('input', () => {
    const slot = currentSlot();
    if (slot.status !== 'input') return;
    slot.nameInput = input.value;
    doSearch(input.value.trim().toLowerCase());
  });

  input.addEventListener('keydown', async (e) => {
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
        if (name) await selectPokemon(name);
      }
    } else if (e.key === 'Escape') {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      cancelInput(team, index);
    }
  });

  listEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('.autocomplete-list__item');
    if (item?.dataset.name) selectPokemon(item.dataset.name);
  });

  listEl.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.autocomplete-list__item');
    if (item?.dataset.name) {
      e.preventDefault();
      selectPokemon(item.dataset.name);
    }
  }, { passive: false });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      const slot = currentSlot();
      if (slot.status === 'input') {
        listEl.innerHTML = '';
        listEl.classList.remove('is-open');
        if (!slot.nameInput.trim()) cancelInput(team, index);
      }
    }, 180);
  });
}

function initMoveAutocomplete(input, listEl, team, index, moveIndex) {
  let highlighted = -1;

  function currentMove() {
    return slotAt(team, index).moves[moveIndex];
  }

  function updateHighlight(items, newIdx) {
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.remove('is-highlighted');
    highlighted = newIdx;
    if (highlighted >= 0 && items[highlighted]) items[highlighted].classList.add('is-highlighted');
  }

  const doSearch = debounce(async (query) => {
    if (!query || query.length < 2) {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
      return;
    }

    const list = await loadMoveList().catch(() => null);
    if (!list) return;
    if (input.value.trim().toLowerCase() !== query) return;

    const q = query.toLowerCase();
    const results = list.filter(m => m.name.includes(q) || (m.nameEs || '').toLowerCase().includes(q)).slice(0, 8);

    if (!results.length) {
      listEl.innerHTML  = '><span class="move-ac__name">Sin resultados</span></li>';
      listEl.classList.add('is-open');
      return;
    }

    highlighted = -1;
    listEl.innerHTML = results.map(m => `
      >
        <span class="move-ac__name">${escapeHtml(m.nameEs || capitalize(m.name.replace(/-/g, ' ')))}</span>
        <span class="move-ac__meta">
          <span class="move-chip ${typeClass(m.type)}">${escapeHtml(typeLabel(m.type))}</span>
        </span>
      </li>
    `).join('');
    listEl.classList.add('is-open');
  }, DEBOUNCE_MS);

  async function selectMove(nameEn) {
    const moveState = currentMove();
    moveState.status = 'loading';
    listEl.innerHTML = '';
    listEl.classList.remove('is-open');
    renderSlot(team, index);
    try {
      const resolved = await resolveMove(nameEn);
      moveState.move = resolved;
      moveState.input = resolved.nameEs;
      moveState.status = 'filled';
      moveState.error = null;
      await syncResolvedMoves(team, index);
    } catch (e) {
      moveState.status = 'error';
      moveState.error = e.message || 'Error al cargar el movimiento';
    }
    renderSlot(team, index);
    if (team === 'my') recomputeAnalysis();
  }

  input.addEventListener('input', () => {
    const moveState = currentMove();
    moveState.input = input.value;
    doSearch(input.value.trim().toLowerCase());
  });

  input.addEventListener('keydown', async (e) => {
    const items = Array.from(listEl.querySelectorAll('.move-ac__item'));
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      updateHighlight(items, Math.min(highlighted + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      updateHighlight(items, Math.max(highlighted - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && items[highlighted]) await selectMove(items[highlighted].dataset.name);
    } else if (e.key === 'Escape') {
      listEl.innerHTML = '';
      listEl.classList.remove('is-open');
    }
  });

  listEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const item = e.target.closest('.move-ac__item');
    if (item?.dataset.name) selectMove(item.dataset.name);
  });

  listEl.addEventListener('touchstart', (e) => {
    const item = e.target.closest('.move-ac__item');
    if (item?.dataset.name) {
      e.preventDefault();
      selectMove(item.dataset.name);
    }
  }, { passive: false });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!currentMove().input.trim()) {
        currentMove().move = null;
        currentMove().status = 'empty';
        renderSlot(team, index);
        if (team === 'my') recomputeAnalysis();
      } else {
        listEl.innerHTML = '';
        listEl.classList.remove('is-open');
      }
    }, 180);
  });
}

async function syncResolvedMoves(team, index) {
  const slot = slotAt(team, index);
  const resolved = [];
  for (const m of slot.moves) {
    if (m.move?.nameEn) {
      const data = await resolveMove(m.move.nameEn).catch(() => null);
      if (data) resolved.push(data);
    }
  }
  slot.resolvedMoves = resolved;
}

function getAttackingTypeScore(move) {
  if (!move || move.damageClass === 'status') return 0;
  return (move.power || 50) * (move.accuracy ? move.accuracy / 100 : 1);
}

function scoreCoverageAgainstPokemon(attackingMoves, defender) {
  if (!defender) return 0;
  let best = 0;
  for (const move of attackingMoves) {
    if (!move || move.damageClass === 'status') continue;
    const mult = computeTypeMultiplier(move.type, defender.types);
    const base = getAttackingTypeScore(move);
    best = Math.max(best, base * mult);
  }
  return best;
}

function getFallbackStabMoves(pokemon) {
  const types = pokemon?.types || [];
  return types.map(t => ({
    nameEn: `stab-${t}`,
    nameEs: `STAB ${typeLabel(t)}`,
    type: t,
    typeEs: typeLabel(t),
    damageClass: 'special',
    accuracy: 100,
    power: 60,
    pp: null,
    isFallback: true,
  }));
}

function getEffectiveAttackPool(slot) {
  const fromMoves = (slot.resolvedMoves || []).filter(m => m && m.damageClass !== 'status');
  return fromMoves.length ? fromMoves : getFallbackStabMoves(slot.pokemon || {});
}

function computeTeamCoverage(myTeam, rivalTeam) {
  const rivalMembers = rivalTeam.filter(s => s?.pokemon);
  return myTeam.map((slot, index) => {
    if (!slot?.pokemon) return { index, score: 0, label: 'Vacío' };
    const pool = getEffectiveAttackPool(slot);
    let total = 0;
    let bestTargets = [];
    rivalMembers.forEach(r => {
      const score = scoreCoverageAgainstPokemon(pool, r.pokemon);
      total += score;
      if (score > 0) bestTargets.push({ nameEs: r.pokemon.nameEs, score });
    });
    bestTargets.sort((a, b) => b.score - a.score);
    return {
      index,
      nameEs: slot.pokemon.nameEs,
      score: total,
      bestTargets: bestTargets.slice(0, 3),
    };
  });
}

function computeRivalThreats(myTeam, rivalTeam) {
  const myMembers = myTeam.filter(s => s?.pokemon);
  return rivalTeam.map((slot, index) => {
    if (!slot?.pokemon) return { index, score: 0 };
    const attackTypes = slot.pokemon.types;
    let score = 0;
    let hits = [];
    myMembers.forEach(m => {
      const mult = Math.max(...attackTypes.map(t => computeTypeMultiplier(t, m.pokemon.types)));
      if (mult > 1) {
        score += mult;
        hits.push({ nameEs: m.pokemon.nameEs, mult });
      }
    });
    hits.sort((a, b) => b.mult - a.mult);
    return {
      index,
      nameEs: slot.pokemon.nameEs,
      score,
      hits: hits.slice(0, 3),
    };
  });
}

function computeWeakPicks(myTeam, rivalTeam) {
  return myTeam.map((slot, index) => {
    if (!slot?.pokemon) return { index, score: 0 };
    const pool = getEffectiveAttackPool(slot);
    let pressure = 0;
    rivalTeam.forEach(r => {
      if (!r?.pokemon) return;
      const best = Math.max(...pool.map(m => scoreCoverageAgainstPokemon([m], r.pokemon)));
      pressure += best;
    });
    const coverageCount = pool.filter(m => m.damageClass !== 'status').length;
    return {
      index,
      nameEs: slot.pokemon.nameEs,
      pressure,
      coverageCount,
      score: pressure + coverageCount * 20,
    };
  }).sort((a, b) => a.score - b.score);
}

function buildAnalysis() {
  const myFilled = state.myTeam.filter(s => s.pokemon);
  const rivalFilled = state.rivalTeam.filter(s => s.pokemon);

  if (!myFilled.length && !rivalFilled.length) {
    state.analysis = { summary: null, coverage: [], threats: [], weakPicks: [], signals: [] };
    renderAnalysis();
    return;
  }

  const coverage = computeTeamCoverage(state.myTeam, state.rivalTeam).filter(x => x.nameEs).sort((a, b) => b.score - a.score);
  const threats = computeRivalThreats(state.myTeam, state.rivalTeam).filter(x => x.nameEs).sort((a, b) => b.score - a.score);
  const weakPicks = computeWeakPicks(state.myTeam, state.rivalTeam).filter(x => x.nameEs).slice(0, 3);

  const signals = [];
  if (coverage[0]) signals.push({ kind: 'good', text: `${coverage[0].nameEs} presiona mejor el matchup` });
  if (coverage[1]) signals.push({ kind: 'good', text: `${coverage[1].nameEs} también aporta buena cobertura` });
  if (threats[0]) signals.push({ kind: 'bad', text: `${threats[0].nameEs} es la mayor amenaza rival` });

  const repeatedWeaknesses = getRepeatedWeaknesses(state.myTeam);
  if (repeatedWeaknesses.length) {
    signals.push({ kind: 'warn', text: `Debilidad compartida: ${repeatedWeaknesses.slice(0, 2).map(typeLabel).join(' y ')}` });
  }

  state.analysis = {
    summary: {
      myCount: myFilled.length,
      rivalCount: rivalFilled.length,
      bestPressure: coverage[0] || null,
      biggestThreat: threats[0] || null,
    },
    coverage,
    threats,
    weakPicks,
    signals,
  };

  renderAnalysis();
}

function getRepeatedWeaknesses(myTeam) {
  const counts = {};
  myTeam.forEach(s => {
    if (!s.pokemon) return;
    const groups = s.pokemon.weaknessGroups;
    [...groups.weak4x, ...groups.weak2x].forEach(t => {
      counts[t] = (counts[t] || 0) + 1;
    });
  });
  return Object.entries(counts).filter(([, n]) => n >= 2).map(([t]) => t);
}

function renderAnalysisList(items, kind) {
  if (!items.length) return '<div class="analysis-empty">Añade Pokémon para ver el análisis.</div>';
  return items.map(item => {
    if (kind === 'coverage') {
      const chips = item.bestTargets.map(t => `<span class="analysis-chip analysis-chip--good">${escapeHtml(t.nameEs)}</span>`).join('');
      return `<div class="analysis-card"><div class="analysis-card__title">Presión ofensiva</div><div class="analysis-copy">${escapeHtml(item.nameEs)} suma ${Math.round(item.score)} puntos de presión aproximada.</div><div class="analysis-card__body">${chips}</div></div>`;
    }
    if (kind === 'threats') {
      const chips = item.hits.map(t => `<span class="analysis-chip analysis-chip--bad">${escapeHtml(t.nameEs)}</span>`).join('');
      return `<div class="analysis-card"><div class="analysis-card__title">Amenaza rival</div><div class="analysis-copy">${escapeHtml(item.nameEs)} castiga varias piezas de tu equipo.</div><div class="analysis-card__body">${chips}</div></div>`;
    }
    if (kind === 'weakPicks') {
      return `<div class="analysis-card"><div class="analysis-card__title">Pick con menos valor</div><div class="analysis-copy">${escapeHtml(item.nameEs)} aporta menos presión relativa en este matchup.</div></div>`;
    }
    return '';
  }).join('');
}

function renderAnalysis() {
  const overview = document.getElementById('matchupOverview');
  const tactical = document.getElementById('tacticalRead');

  if (!state.analysis.summary) {
    overview.innerHTML = `<div class="analysis-empty">Añade al menos un Pokémon a cada lado para empezar a ver la visión del matchup.</div>`;
    tactical.innerHTML = `<div class="analysis-empty">Los movimientos de tu equipo activarán esta lectura táctica.</div>`;
    return;
  }

  const s = state.analysis.summary;
  overview.innerHTML = `
    <div class="analysis-card">
      <div class="analysis-card__title">Estado general</div>
      <div class="analysis-copy">Tu equipo tiene ${s.myCount} Pokémon definidos y el rival ${s.rivalCount}. ${s.bestPressure ? `El mayor peso ofensivo lo tiene <strong>${escapeHtml(s.bestPressure.nameEs)}</strong>.` : ''} ${s.biggestThreat ? `La amenaza principal rival es <strong>${escapeHtml(s.biggestThreat.nameEs)}</strong>.` : ''}</div>
    </div>
    ${state.analysis.signals.map(sig => `
      <div class="analysis-card">
        <div class="analysis-card__title">${sig.kind === 'good' ? 'Señal positiva' : sig.kind === 'bad' ? 'Ojo' : 'Debilidad repetida'}</div>
        <div class="analysis-copy">${escapeHtml(sig.text)}</div>
      </div>
    `).join('')}
  `;

  tactical.innerHTML = `
    ${renderAnalysisList(state.analysis.coverage.slice(0, 3), 'coverage')}
    ${renderAnalysisList(state.analysis.threats.slice(0, 3), 'threats')}
    ${renderAnalysisList(state.analysis.weakPicks.slice(0, 3), 'weakPicks')}
  `;
}

function recomputeAnalysis() {
  buildAnalysis();
}

async function loadSavedTeam() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved)) return;
    saved.forEach((savedSlot, i) => {
      if (i < TEAM_SIZE && savedSlot) {
        state.myTeam[i] = {
          ...makeSlot(),
          nameInput: savedSlot.nameInput || '',
          pokemon: savedSlot.pokemon || null,
          moves: Array.isArray(savedSlot.moves)
            ? savedSlot.moves.map(m => ({ input: m?.input || '', move: m?.move || null, status: m?.status || 'empty', error: m?.error || null }))
              .concat(Array.from({ length: Math.max(0, 4 - (savedSlot.moves?.length || 0)) }, makeMoveSlot))
              .slice(0, 4)
            : Array.from({ length: 4 }, makeMoveSlot),
          resolvedMoves: savedSlot.resolvedMoves || [],
          status: savedSlot.status || (savedSlot.pokemon ? 'filled' : 'empty'),
          error: savedSlot.error || null,
        };
      }
    });
  } catch {}
}

function bindEvents() {
  ['myTeamGrid', 'rivalTeamGrid'].forEach(gridId => {
    const grid = document.getElementById(gridId);

    grid.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.slot__btn-remove');
      if (removeBtn) {
        handleRemove(removeBtn.dataset.team, parseInt(removeBtn.dataset.index, 10));
        return;
      }

      const retryBtn = e.target.closest('.slot__error-retry');
      if (retryBtn) {
        handleRetry(retryBtn.dataset.team, parseInt(retryBtn.dataset.index, 10));
        return;
      }

      const emptyArea = e.target.closest('.slot__empty');
      if (emptyArea) {
        handleSlotActivation(emptyArea.dataset.team, parseInt(emptyArea.dataset.index, 10));
      }
    });

    grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const emptyArea = e.target.closest('.slot__empty');
        if (emptyArea) {
          e.preventDefault();
          handleSlotActivation(emptyArea.dataset.team, parseInt(emptyArea.dataset.index, 10));
        }
      }
    });
  });

  document.getElementById('saveTeamBtn')?.addEventListener('click', () => {
    saveMyTeam();
    persistAuto();
  });

  document.getElementById('clearMyTeamBtn')?.addEventListener('click', () => {
    if (confirm('¿Limpiar todo mi equipo?')) clearTeam('my');
  });

  document.getElementById('clearRivalTeamBtn')?.addEventListener('click', () => {
    if (confirm('¿Limpiar el equipo rival?')) clearTeam('rival');
  });

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('champions_meta_theme', next);
    const icon = document.querySelector('.theme-toggle__icon');
    if (icon) icon.textContent = next === 'light' ? '☀️' : '🌙';
  });

  document.getElementById('myTeamGrid').addEventListener('input', (e) => {
    const moveInput = e.target.closest('.move-input');
    if (!moveInput) return;
    const team = moveInput.dataset.team;
    const index = parseInt(moveInput.dataset.index, 10);
    const moveIndex = parseInt(moveInput.dataset.moveIndex, 10);
    const slot = slotAt(team, index);
    const moveState = slot.moves[moveIndex];
    moveState.input = moveInput.value;
    const ac = document.getElementById(`move-ac-${team}-${index}-${moveIndex}`);
    if (ac) initMoveAutocomplete(moveInput, ac, team, index, moveIndex);
    persistAuto();
  });
}

function persistAuto() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(serializeMyTeam()));
  } catch {}
}

function serializeMyTeam() {
  return state.myTeam.map(slot => ({
    nameInput: slot.nameInput,
    pokemon: slot.pokemon,
    moves: slot.moves,
    resolvedMoves: slot.resolvedMoves,
    status: slot.status,
    error: slot.error,
  }));
}

async function init() {
  const savedTheme = localStorage.getItem('champions_meta_theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  initGrid('my');
  initGrid('rival');
  renderAll();
  bindEvents();
  loadPokemonList().catch(() => {});
  await loadSavedTeam();
  renderAll();
  recomputeAnalysis();
  persistAuto();
}

document.addEventListener('DOMContentLoaded', init);
