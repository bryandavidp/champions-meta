const POKE_API_BASE = "https://pokeapi.co/api/v2";
const STORAGE_KEYS = {
  myTeam: "pokedoubles-preview-my-team-v1",
  theme: "pokedoubles-preview-theme-v1"
};

const TYPE_NAMES = [
  "normal", "fire", "water", "electric", "grass", "ice",
  "fighting", "poison", "ground", "flying", "psychic",
  "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy"
];

const SUPPORT_MOVE_WEIGHTS = {
  "protect": 2,
  "fake-out": 7,
  "tailwind": 9,
  "trick-room": 9,
  "icy-wind": 6,
  "electroweb": 6,
  "thunder-wave": 5,
  "will-o-wisp": 5,
  "helping-hand": 5,
  "rage-powder": 7,
  "follow-me": 7,
  "wide-guard": 7,
  "quick-guard": 4,
  "spore": 8,
  "snarl": 5,
  "taunt": 4,
  "encore": 4,
  "parting-shot": 6,
  "coaching": 4,
  "ally-switch": 4,
  "breaking-swipe": 5
};

const ABILITY_WEIGHTS = {
  "intimidate": 6,
  "prankster": 6,
  "levitate": 4,
  "lightning-rod": 5,
  "storm-drain": 5,
  "flash-fire": 4,
  "water-absorb": 4,
  "volt-absorb": 4,
  "motor-drive": 4,
  "dry-skin": 4,
  "friend-guard": 6,
  "magic-bounce": 5,
  "regenerator": 3,
  "drizzle": 4,
  "drought": 4,
  "snow-warning": 3,
  "sand-stream": 3,
  "inner-focus": 2
};

const SELF_HIT_MOVES = {
  "earthquake": { immuneTypes: ["flying"], immuneAbilities: ["levitate"] },
  "discharge": { immuneTypes: ["ground"], immuneAbilities: ["lightning-rod", "volt-absorb", "motor-drive"] },
  "surf": { immuneAbilities: ["storm-drain", "water-absorb", "dry-skin"] }
};

const state = {
  myTeam: Array.from({ length: 6 }, createEmptySlot),
  rivalTeam: Array.from({ length: 6 }, createEmptySlot),
  detailsTab: "my",
  analysis: null,
  loadingAnalysis: false
};

const cache = {
  pokemon: new Map(),
  moves: new Map(),
  types: new Map(),
  pokemonIndex: null,
  moveIndex: null,
  allTypesReady: false
};

const storageFallback = {
  myTeam: null,
  theme: null
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  applyInitialTheme();
  hydrateMyTeam();
  bindGlobalEvents();
  renderAll();
}

function createEmptySlot() {
  return {
    nameInput: "",
    pokemon: null,
    moves: ["", "", "", ""],
    status: "empty",
    error: ""
  };
}

function bindGlobalEvents() {
  document.getElementById("themeToggle").addEventListener("click", toggleTheme);
  document.getElementById("heroAnalyzeBtn").addEventListener("click", analyzeMatchup);
  document.getElementById("stickyAnalyzeBtn").addEventListener("click", analyzeMatchup);
  document.getElementById("loadSavedTeamBtn").addEventListener("click", hydrateMyTeamAndRender);
  document.getElementById("clearMyTeamBtn").addEventListener("click", clearMyTeam);
  document.getElementById("clearRivalTeamBtn").addEventListener("click", clearRivalTeam);

  document.getElementById("detailsMyTab").addEventListener("click", () => setDetailsTab("my"));
  document.getElementById("detailsRivalTab").addEventListener("click", () => setDetailsTab("rival"));

  document.getElementById("myTeamGrid").addEventListener("click", onTeamGridClick);
  document.getElementById("rivalTeamGrid").addEventListener("click", onTeamGridClick);
  document.getElementById("myTeamGrid").addEventListener("input", onTeamGridInput);
  document.getElementById("rivalTeamGrid").addEventListener("input", onTeamGridInput);
  document.getElementById("myTeamGrid").addEventListener("change", onTeamGridChange);
  document.getElementById("rivalTeamGrid").addEventListener("change", onTeamGridChange);
  document.getElementById("myTeamGrid").addEventListener("focusin", onTeamGridFocusIn);
  document.getElementById("rivalTeamGrid").addEventListener("focusin", onTeamGridFocusIn);
}

function onTeamGridFocusIn(event) {
  if (event.target.matches(".pokemon-input")) {
    ensurePokemonIndex();
  }
  if (event.target.matches(".move-input")) {
    ensureMoveIndex();
  }
}

function onTeamGridInput(event) {
  const el = event.target;
  const teamKey = el.dataset.team;
  const index = Number(el.dataset.index);

  if (el.matches(".pokemon-input")) {
    state[teamKey][index].nameInput = el.value;
  }

  if (el.matches(".move-input")) {
    const moveIndex = Number(el.dataset.moveIndex);
    state[teamKey][index].moves[moveIndex] = el.value;
    if (teamKey === "my") {
      persistMyTeam();
      updateSaveIndicator("Equipo guardado");
    }
  }
}

function onTeamGridChange(event) {
  const el = event.target;
  if (el.matches(".pokemon-input")) {
    const teamKey = el.dataset.team;
    const index = Number(el.dataset.index);
    const typed = el.value.trim();
    if (typed.length >= 2) {
      loadPokemonIntoSlot(teamKey, index, typed);
    }
  }
}

function onTeamGridClick(event) {
  const loadBtn = event.target.closest("[data-action='load-slot']");
  const clearBtn = event.target.closest("[data-action='clear-slot']");

  if (loadBtn) {
    const teamKey = loadBtn.dataset.team;
    const index = Number(loadBtn.dataset.index);
    const input = document.querySelector(
      `.pokemon-input[data-team="${teamKey}"][data-index="${index}"]`
    );
    loadPokemonIntoSlot(teamKey, index, input.value.trim());
    return;
  }

  if (clearBtn) {
    const teamKey = clearBtn.dataset.team;
    const index = Number(clearBtn.dataset.index);
    clearSlot(teamKey, index);
  }
}

function setDetailsTab(tab) {
  state.detailsTab = tab;
  document.getElementById("detailsMyTab").classList.toggle("is-active", tab === "my");
  document.getElementById("detailsRivalTab").classList.toggle("is-active", tab === "rival");
  document.getElementById("detailsMyTab").setAttribute("aria-selected", String(tab === "my"));
  document.getElementById("detailsRivalTab").setAttribute("aria-selected", String(tab === "rival"));
  renderDetails();
}

function clearSlot(teamKey, index) {
  const previousMoves = teamKey === "my" ? ["", "", "", ""] : state[teamKey][index].moves;
  state[teamKey][index] = createEmptySlot();
  state[teamKey][index].moves = previousMoves;
  if (teamKey === "my") {
    persistMyTeam();
    updateSaveIndicator("Equipo guardado");
  }
  state.analysis = null;
  renderAll();
}

function clearMyTeam() {
  state.myTeam = Array.from({ length: 6 }, createEmptySlot);
  persistMyTeam();
  updateSaveIndicator("Equipo borrado");
  state.analysis = null;
  renderAll();
}

function clearRivalTeam() {
  state.rivalTeam = Array.from({ length: 6 }, createEmptySlot);
  state.analysis = null;
  renderAll();
}

async function loadPokemonIntoSlot(teamKey, index, rawName) {
  const nameInput = rawName.trim();
  if (!nameInput) return;

  state[teamKey][index].status = "loading";
  state[teamKey][index].error = "";
  state[teamKey][index].nameInput = nameInput;
  renderTeamGrid(teamKey);

  try {
    const pokemon = await fetchPokemonData(nameInput);
    state[teamKey][index].pokemon = pokemon;
    state[teamKey][index].status = "ready";
    state[teamKey][index].error = "";
    state[teamKey][index].nameInput = pokemon.displayName;
    if (teamKey === "my") {
      persistMyTeam();
      updateSaveIndicator("Equipo guardado");
    }
  } catch (error) {
    state[teamKey][index].pokemon = null;
    state[teamKey][index].status = "error";
    state[teamKey][index].error = "No se pudo cargar ese Pokémon.";
  }

  state.analysis = null;
  renderAll();
}

async function fetchPokemonData(name) {
  const normalized = normalizeApiName(name);
  if (cache.pokemon.has(normalized)) {
    return structuredClone(cache.pokemon.get(normalized));
  }

  const data = await fetchJSON(`${POKE_API_BASE}/pokemon/${normalized}`);
  await ensureTypeChart();

  const pokemon = {
    id: data.id,
    name: data.name,
    displayName: formatDisplayName(data.name),
    sprite:
      data.sprites.other?.["official-artwork"]?.front_default ||
      data.sprites.other
