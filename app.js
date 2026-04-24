/*
 * Pokémon VGC Team Builder & Comparator
 * Fase 1
 * - HTML semántico + JS Vanilla
 * - Sin CSS
 * - Búsqueda inline, cache PokeAPI, análisis básico por tipos, persistencia local
 */

// =========================================================
// Estado global
// =========================================================
const appState = {
  selfTeam: Array(6).fill(null),
  enemyTeam: Array(6).fill(null),
  pokemonIndex: [],
  pokemonCache: new Map(),
  currentSearch: {
    side: null,
    slotIndex: null,
    anchorElement: null,
  },
  savedTeams: [],
  ui: {
    loadingSearch: false,
  },
};

// =========================================================
// Configuración general
// =========================================================
const POKEAPI_BASE = "https://pokeapi.co/api/v2";
const POKEMON_INDEX_LIMIT = 1025;
const CACHE_STORAGE_KEY = "vgc-team-builder-pokemon-cache-v1";
const TEAMS_STORAGE_KEY = "vgc-team-builder-saved-teams-v1";
const FALLBACK_ENEMY_META = [
  "incineroar",
  "rillaboom",
  "flutter-mane",
  "urshifu-rapid-strike",
  "amoonguss",
  "gholdengo",
];

// =========================================================
// Tabla de tipos completa (18x18)
// Multiplicadores ofensivos: attackType -> defenseType
// =========================================================
const TYPE_CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ice: 2,
    bug: 2,
    rock: 0.5,
    dragon: 0.5,
    steel: 2,
  },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: {
    water: 2,
    electric: 0.5,
    grass: 0.5,
    ground: 0,
    flying: 2,
    dragon: 0.5,
  },
  grass: {
    fire: 0.5,
    water: 2,
    grass: 0.5,
    poison: 0.5,
    ground: 2,
    flying: 0.5,
    bug: 0.5,
    rock: 2,
    dragon: 0.5,
    steel: 0.5,
  },
  ice: {
    fire: 0.5,
    water: 0.5,
    grass: 2,
    ground: 2,
    flying: 2,
    dragon: 2,
    steel: 0.5,
    ice: 0.5,
  },
  fighting: {
    normal: 2,
    ice: 2,
    poison: 0.5,
    flying: 0.5,
    psychic: 0.5,
    bug: 0.5,
    rock: 2,
    ghost: 0,
    dark: 2,
    steel: 2,
    fairy: 0.5,
  },
  poison: {
    grass: 2,
    poison: 0.5,
    ground: 0.5,
    rock: 0.5,
    ghost: 0.5,
    steel: 0,
    fairy: 2,
  },
  ground: {
    fire: 2,
    electric: 2,
    grass: 0.5,
    poison: 2,
    flying: 0,
    bug: 0.5,
    rock: 2,
    steel: 2,
  },
  flying: {
    electric: 0.5,
    grass: 2,
    fighting: 2,
    bug: 2,
    rock: 0.5,
    steel: 0.5,
  },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: {
    fire: 0.5,
    grass: 2,
    fighting: 0.5,
    poison: 0.5,
    flying: 0.5,
    psychic: 2,
    ghost: 0.5,
    dark: 2,
    steel: 0.5,
    fairy: 0.5,
  },
  rock: {
    fire: 2,
    ice: 2,
    fighting: 0.5,
    ground: 0.5,
    flying: 2,
    bug: 2,
    steel: 0.5,
  },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: {
    fire: 0.5,
    water: 0.5,
    electric: 0.5,
    ice: 2,
    rock: 2,
    steel: 0.5,
    fairy: 2,
  },
  fairy: {
    fire: 0.5,
    fighting: 2,
    poison: 0.5,
    dragon: 2,
    dark: 2,
    steel: 0.5,
  },
};

const ALL_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
];

// =========================================================
// Referencias del DOM
// =========================================================
const dom = {
  selfTeamGrid: document.getElementById("selfTeamGrid"),
  enemyTeamGrid: document.getElementById("enemyTeamGrid"),
  stickyPicksBar: document.getElementById("stickyPicksBar"),
  searchPortal: document.getElementById("searchPortal"),
  pokemonSearchInput: document.getElementById("pokemonSearchInput"),
  pokemonSearchResults: document.getElementById("pokemonSearchResults"),
  closeSearchPortalBtn: document.getElementById("closeSearchPortalBtn"),
  loadEnemyMetaBtn: document.getElementById("loadEnemyMetaBtn"),
  swapSidesBtn: document.getElementById("swapSidesBtn"),
  recoList: document.getElementById("recoList"),
  threatList: document.getElementById("threatList"),
  reasonList: document.getElementById("reasonList"),
  enemyQuickBoard: document.getElementById("enemyQuickBoard"),
  saveTeamForm: document.getElementById("saveTeamForm"),
  teamNameInput: document.getElementById("teamNameInput"),
  savedTeamsList: document.getElementById("savedTeamsList"),
};

// =========================================================
// Utilidades
// =========================================================
function slugToLabel(slug) {
  return String(slug)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTypes(types = []) {
  return types.map(slugToLabel).join(" / ");
}

function clampTeamLength(team) {
  return [...team]
    .slice(0, 6)
    .concat(Array(Math.max(0, 6 - team.length)).fill(null))
    .slice(0, 6);
}

function debounce(callback, delay = 150) {
  let timeoutId = null;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

function safeJSONParse(rawValue, fallbackValue) {
  try {
    return JSON.parse(rawValue) ?? fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function getTeamBySide(side) {
  return side === "enemy" ? appState.enemyTeam : appState.selfTeam;
}

function setTeamBySide(side, nextTeam) {
  const normalizedTeam = clampTeamLength(nextTeam);
  if (side === "enemy") {
    appState.enemyTeam = normalizedTeam;
    return;
  }
  appState.selfTeam = normalizedTeam;
}

function getSpriteFromPayload(payload) {
  return (
    payload?.sprites?.other?.showdown?.front_default ||
    payload?.sprites?.other?.home?.front_default ||
    payload?.sprites?.other?.["official-artwork"]?.front_default ||
    payload?.sprites?.front_default ||
    ""
  );
}

function getPokemonStat(pokemon, statName) {
  return pokemon?.stats?.[statName] ?? 0;
}

function sanitizeTeamForStorage(team) {
  return team.filter(Boolean).map((member) => member.name);
}

function getEmptyStateMarkup(message) {
  return `<p>${message}</p>`;
}

// =========================================================
// Persistencia
// =========================================================
function loadPokemonCacheFromStorage() {
  const rawCache = safeJSONParse(localStorage.getItem(CACHE_STORAGE_KEY), {});
  Object.entries(rawCache).forEach(([name, payload]) => {
    appState.pokemonCache.set(name, payload);
  });
}

function persistPokemonCache() {
  const serializableCache = Object.fromEntries(appState.pokemonCache.entries());
  localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(serializableCache));
}

function loadSavedTeamsFromStorage() {
  appState.savedTeams = safeJSONParse(
    localStorage.getItem(TEAMS_STORAGE_KEY),
    [],
  );
}

function persistSavedTeams() {
  localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify(appState.savedTeams));
}

// =========================================================
// PokeAPI + índice de búsqueda
// =========================================================
async function loadPokemonIndex() {
  try {
    const response = await fetch(
      `${POKEAPI_BASE}/pokemon?limit=${POKEMON_INDEX_LIMIT}`,
    );
    if (!response.ok) {
      throw new Error("No se pudo cargar el índice general de Pokémon.");
    }

    const data = await response.json();
    appState.pokemonIndex = (data.results || []).map((item) => item.name);
  } catch (error) {
    console.error(error);

    // Fallback mínimo para seguir probando el builder aunque falle la API.
    appState.pokemonIndex = [
      "incineroar",
      "rillaboom",
      "amoonguss",
      "pelipper",
      "archaludon",
      "gholdengo",
      "dragonite",
      "murkrow",
      "grimmsnarl",
      "farigiraf",
      "ursaluna-bloodmoon",
      "urshifu-rapid-strike",
      "flutter-mane",
      "ogerpon-wellspring-mask",
      "chien-pao",
    ];
  }
}

async function fetchPokemonData(pokemonName) {
  const normalizedName = String(pokemonName).trim().toLowerCase();
  if (!normalizedName) return null;

  if (appState.pokemonCache.has(normalizedName)) {
    return appState.pokemonCache.get(normalizedName);
  }

  const response = await fetch(`${POKEAPI_BASE}/pokemon/${normalizedName}`);
  if (!response.ok) {
    throw new Error(`No se encontró el Pokémon: ${normalizedName}`);
  }

  const payload = await response.json();
  const normalizedData = {
    id: payload.id,
    name: payload.name,
    displayName: slugToLabel(payload.name),
    sprite: getSpriteFromPayload(payload),
    types: payload.types.map((entry) => entry.type.name),
    stats: Object.fromEntries(
      payload.stats.map((statEntry) => [
        statEntry.stat.name,
        statEntry.base_stat,
      ]),
    ),
  };

  appState.pokemonCache.set(normalizedName, normalizedData);
  persistPokemonCache();
  return normalizedData;
}

function filterPokemonIndex(query) {
  const normalizedQuery = String(query).trim().toLowerCase();

  if (!normalizedQuery) {
    return appState.pokemonIndex.slice(0, 24);
  }

  const startsWithMatches = appState.pokemonIndex.filter((name) =>
    name.startsWith(normalizedQuery),
  );
  const includesMatches = appState.pokemonIndex.filter(
    (name) =>
      !name.startsWith(normalizedQuery) && name.includes(normalizedQuery),
  );

  return [...startsWithMatches, ...includesMatches].slice(0, 24);
}

// =========================================================
// Cálculo de tipos y matchups
// =========================================================
function getTypeMultiplier(attackType, defenseTypes = []) {
  return defenseTypes.reduce((multiplier, defenseType) => {
    const attackingTypeChart = TYPE_CHART[attackType] || {};
    const currentModifier = attackingTypeChart[defenseType] ?? 1;
    return multiplier * currentModifier;
  }, 1);
}

function getTeamTypeProfile(team) {
  const profile = ALL_TYPES.reduce((accumulator, type) => {
    accumulator[type] = {
      weak: 0,
      resist: 0,
      immune: 0,
      neutral: 0,
    };
    return accumulator;
  }, {});

  team.filter(Boolean).forEach((member) => {
    ALL_TYPES.forEach((attackType) => {
      const multiplier = getTypeMultiplier(attackType, member.types);
      if (multiplier === 0) {
        profile[attackType].immune += 1;
      } else if (multiplier > 1) {
        profile[attackType].weak += 1;
      } else if (multiplier < 1) {
        profile[attackType].resist += 1;
      } else {
        profile[attackType].neutral += 1;
      }
    });
  });

  return profile;
}

function getBestSTABMatchup(attacker, defender) {
  const bestRelevantAttackStat = Math.max(
    getPokemonStat(attacker, "attack"),
    getPokemonStat(attacker, "special-attack"),
  );

  const stabOptions = attacker.types.map((type) => {
    const multiplier = getTypeMultiplier(type, defender.types);
    const stab = 1.5;
    const offensivePressure =
      multiplier * stab * (bestRelevantAttackStat / 100);

    return {
      type,
      multiplier,
      pressure: offensivePressure,
    };
  });

  return (
    stabOptions.sort((a, b) => b.pressure - a.pressure)[0] || {
      type: attacker.types[0] || "normal",
      multiplier: 1,
      pressure: 0,
    }
  );
}

function getCoverageSummary(team) {
  const profile = getTeamTypeProfile(team);

  const weaknesses = ALL_TYPES.map((type) => ({
    type,
    score: profile[type].weak - profile[type].resist - profile[type].immune,
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const resistances = ALL_TYPES.map((type) => ({
    type,
    score: profile[type].resist + profile[type].immune - profile[type].weak,
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return { weaknesses, resistances };
}

// =========================================================
// Motor de análisis estilo ChampionsLab (versión inicial)
// =========================================================
function calculateThreats() {
  const selfMembers = appState.selfTeam.filter(Boolean);
  const enemyMembers = appState.enemyTeam.filter(Boolean);

  if (!selfMembers.length || !enemyMembers.length) {
    return [];
  }

  return enemyMembers
    .map((enemy) => {
      const targets = selfMembers
        .map((selfMember) => {
          const bestEnemySTAB = getBestSTABMatchup(enemy, selfMember);
          return {
            targetName: selfMember.displayName,
            attackType: bestEnemySTAB.type,
            multiplier: bestEnemySTAB.multiplier,
            pressure: bestEnemySTAB.pressure,
          };
        })
        .sort((a, b) => b.pressure - a.pressure);

      const totalPressure = targets.reduce(
        (sum, current) => sum + current.pressure,
        0,
      );
      const maxPressure = targets[0]?.pressure ?? 0;

      let severity = "amarillo";
      if (maxPressure >= 4 || totalPressure >= 12) severity = "rojo";
      else if (maxPressure >= 2.5 || totalPressure >= 8) severity = "naranja";

      return {
        pokemon: enemy,
        severity,
        totalPressure,
        primaryTargets: targets.slice(0, 3),
      };
    })
    .sort((a, b) => b.totalPressure - a.totalPressure);
}

function recommendPicks() {
  const selfMembers = appState.selfTeam.filter(Boolean);
  const enemyMembers = appState.enemyTeam.filter(Boolean);

  if (!selfMembers.length || !enemyMembers.length) {
    return [];
  }

  return selfMembers
    .map((selfMember) => {
      const matchupBreakdown = enemyMembers.map((enemyMember) => {
        const selfIntoEnemy = getBestSTABMatchup(selfMember, enemyMember);
        const enemyIntoSelf = getBestSTABMatchup(enemyMember, selfMember);

        const offenseScore = selfIntoEnemy.pressure;
        const defenseBonus = enemyIntoSelf.multiplier <= 0.5 ? 1.25 : 0;
        const immunityBonus = enemyIntoSelf.multiplier === 0 ? 0.75 : 0;
        const riskPenalty = enemyIntoSelf.pressure * 0.7;
        const matchupScore =
          offenseScore + defenseBonus + immunityBonus - riskPenalty;

        return {
          enemyName: enemyMember.displayName,
          bestAttackType: selfIntoEnemy.type,
          offenseScore,
          defenseBonus,
          riskPenalty,
          matchupScore,
          offenseMultiplier: selfIntoEnemy.multiplier,
          defenseMultiplier: enemyIntoSelf.multiplier,
        };
      });

      const totalScore = matchupBreakdown.reduce(
        (sum, current) => sum + current.matchupScore,
        0,
      );
      const favorableTargets = matchupBreakdown
        .filter((entry) => entry.offenseMultiplier > 1)
        .sort((a, b) => b.matchupScore - a.matchupScore)
        .slice(0, 3);

      const defensiveChecks = matchupBreakdown
        .filter((entry) => entry.defenseMultiplier <= 0.5)
        .map((entry) => entry.enemyName)
        .slice(0, 3);

      return {
        pokemon: selfMember,
        totalScore,
        favorableTargets,
        defensiveChecks,
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 4);
}

function buildReasonEntries(recommendations) {
  return recommendations.map((entry) => {
    const targetText = entry.favorableTargets.length
      ? `Amenaza a ${entry.favorableTargets.map((target) => target.enemyName).join(", ")} con STAB de ${slugToLabel(entry.favorableTargets[0].bestAttackType)}.`
      : "No destaca por cobertura directa, pero mantiene un cruce estable.";

    const defensiveText = entry.defensiveChecks.length
      ? ` Además ofrece buena entrada defensiva frente a ${entry.defensiveChecks.join(", ")}.`
      : " Además no queda tan castigado en el intercambio inicial.";

    return {
      pokemonName: entry.pokemon.displayName,
      text: `${targetText}${defensiveText}`,
    };
  });
}

// =========================================================
// Render de slots, análisis y persistencia visual
// =========================================================
function getSlotMarkup(side, slotIndex, pokemon) {
  if (!pokemon) {
    return `
      <article class="team-slot team-slot-empty" data-side="${side}" data-slot-index="${slotIndex}" role="listitem">
        <button
          type="button"
          class="team-slot-trigger empty-slot-trigger"
          data-action="open-search"
          data-side="${side}"
          data-slot-index="${slotIndex}"
        >
          Añadir Pokémon
        </button>
      </article>
    `;
  }

  return `
    <article class="team-slot team-slot-filled" data-side="${side}" data-slot-index="${slotIndex}" role="listitem">
      <div class="pokemon-slot-card">
        <div class="pokemon-slot-media">
          ${pokemon.sprite ? `<img src="${pokemon.sprite}" alt="Sprite de ${pokemon.displayName}" width="96" height="96" loading="lazy" />` : `<p>Sin sprite</p>`}
        </div>

        <div class="pokemon-slot-content">
          <h4>${pokemon.displayName}</h4>
          <div class="type-pills">
            ${pokemon.types.map((type) => `<span class="type-pill" data-type="${type}">${slugToLabel(type)}</span>`).join("")}
            </div>
          <p>HP ${getPokemonStat(pokemon, "hp")} | Atk ${getPokemonStat(pokemon, "attack")} | Def ${getPokemonStat(pokemon, "defense")}</p>
          <p>SpA ${getPokemonStat(pokemon, "special-attack")} | SpD ${getPokemonStat(pokemon, "special-defense")} | Spe ${getPokemonStat(pokemon, "speed")}</p>
        </div>

        <div class="pokemon-slot-actions">
          <button type="button" data-action="open-search" data-side="${side}" data-slot-index="${slotIndex}">Cambiar</button>
          <button type="button" data-action="remove-pokemon" data-side="${side}" data-slot-index="${slotIndex}">Eliminar</button>
        </div>
      </div>
    </article>
  `;
}

function renderTeamGrid(side) {
  const targetGrid = side === "enemy" ? dom.enemyTeamGrid : dom.selfTeamGrid;
  const team = getTeamBySide(side);
  targetGrid.innerHTML = team
    .map((pokemon, index) => getSlotMarkup(side, index, pokemon))
    .join("");
}

function renderStickyPicksBar() {
  const recommended = recommendPicks();

  if (!recommended.length) {
    dom.stickyPicksBar.innerHTML = getEmptyStateMarkup(
      "Aquí aparecerán los mini-sprites de tus picks recomendados cuando ambos equipos tengan Pokémon.",
    );
    return;
  }

  dom.stickyPicksBar.innerHTML = `
    <div class="sticky-picks-track">
      ${recommended
        .map(
          (entry) => `
        <article class="sticky-pick-card">
          ${entry.pokemon.sprite ? `<img src="${entry.pokemon.sprite}" alt="Mini-sprite de ${entry.pokemon.displayName}" width="72" height="72" loading="lazy" />` : ""}
          <p>${entry.pokemon.displayName}</p>
        </article>
      `,
        )
        .join("")}
    </div>
  `;
}

function renderRecommendationList(recommendations) {
  if (!recommendations.length) {
    dom.recoList.innerHTML = getEmptyStateMarkup(
      "Tus 4 mejores picks sugeridos aparecerán aquí.",
    );
    return;
  }

  dom.recoList.innerHTML = `
    <ol class="recommendation-list">
      ${recommendations
        .map(
          (entry) => `
        <li class="recommendation-item">
          <strong>${entry.pokemon.displayName}</strong>
          <p>Score del cruce: ${entry.totalScore.toFixed(2)}</p>
          <p>Targets favorables: ${entry.favorableTargets.length ? entry.favorableTargets.map((target) => target.enemyName).join(", ") : "Sin targets claros"}</p>
        </li>
      `,
        )
        .join("")}
    </ol>
  `;
}

function renderThreatList(threats) {
  if (!threats.length) {
    dom.threatList.innerHTML = getEmptyStateMarkup(
      "Las mayores amenazas del rival aparecerán aquí.",
    );
    return;
  }

  dom.threatList.innerHTML = `
    <ul class="threat-list">
      ${threats
        .map(
          (entry) => `
        <li class="threat-item severity-${entry.severity}">
          <strong>${entry.pokemon.displayName}</strong>
          <p>Semáforo: ${entry.severity.toUpperCase()}</p>
          <p>Presión total: ${entry.totalPressure.toFixed(2)}</p>
          <p>Castiga a: ${entry.primaryTargets.map((target) => `${target.targetName} (${slugToLabel(target.attackType)} x${target.multiplier})`).join(", ")}</p>
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
}

function renderReasonList(recommendations) {
  const reasons = buildReasonEntries(recommendations);

  if (!reasons.length) {
    dom.reasonList.innerHTML = getEmptyStateMarkup(
      "Aquí se explicará por qué conviene elegir los picks sugeridos.",
    );
    return;
  }

  dom.reasonList.innerHTML = `
    <ul class="reason-list">
      ${reasons
        .map(
          (reason) => `
        <li class="reason-item">
          <strong>${reason.pokemonName}</strong>
          <p>${reason.text}</p>
        </li>
      `,
        )
        .join("")}
    </ul>
  `;
}

function renderEnemyQuickBoard() {
  const enemyMembers = appState.enemyTeam.filter(Boolean);

  if (!enemyMembers.length) {
    dom.enemyQuickBoard.innerHTML = getEmptyStateMarkup(
      "El resumen rápido del rival aparecerá al completar el lado enemy.",
    );
    return;
  }

  const { weaknesses, resistances } = getCoverageSummary(enemyMembers);

  dom.enemyQuickBoard.innerHTML = `
    <section class="enemy-summary-block">
      <h4>Pokémon detectados</h4>
      <p>${enemyMembers.map((member) => member.displayName).join(", ")}</p>
    </section>

    <section class="enemy-summary-block">
      <h4>Debilidades acumuladas</h4>
      <ul>
        ${weaknesses.length ? weaknesses.map((item) => `<li>${slugToLabel(item.type)}: ${item.score}</li>`).join("") : "<li>No hay huecos ofensivos claros por tipo.</li>"}
      </ul>
    </section>

    <section class="enemy-summary-block">
      <h4>Resistencias acumuladas</h4>
      <ul>
        ${resistances.length ? resistances.map((item) => `<li>${slugToLabel(item.type)}: ${item.score}</li>`).join("") : "<li>No hay resistencias acumuladas especialmente marcadas.</li>"}
      </ul>
    </section>
  `;
}

function renderSavedTeams() {
  if (!appState.savedTeams.length) {
    dom.savedTeamsList.innerHTML = getEmptyStateMarkup(
      "No hay equipos guardados en localStorage.",
    );
    return;
  }

  dom.savedTeamsList.innerHTML = appState.savedTeams
    .map(
      (savedTeam, index) => `
      <article class="saved-team-card" data-saved-team-index="${index}">
        <h3>${savedTeam.name}</h3>
        <p>${savedTeam.members.map(slugToLabel).join(", ")}</p>
        <div class="saved-team-actions">
          <button type="button" data-action="load-saved-team" data-saved-team-index="${index}">Cargar</button>
          <button type="button" data-action="delete-saved-team" data-saved-team-index="${index}">Eliminar</button>
        </div>
      </article>
    `,
    )
    .join("");
}

function renderAnalysis() {
  const threats = calculateThreats();
  const recommendations = recommendPicks();

  renderRecommendationList(recommendations);
  renderThreatList(threats);
  renderReasonList(recommendations);
  renderEnemyQuickBoard();
}

function renderAll() {
  renderTeamGrid("self");
  renderTeamGrid("enemy");
  renderStickyPicksBar();
  renderAnalysis();
  renderSavedTeams();
}

// =========================================================
// Portal de búsqueda inline
// =========================================================
function renderSearchResults(results) {
  if (!results.length) {
    dom.pokemonSearchResults.innerHTML = "<li>No se encontraron Pokémon.</li>";
    return;
  }

  dom.pokemonSearchResults.innerHTML = results
    .map(
      (name) => `
      <li>
        <button type="button" data-action="select-search-result" data-pokemon-name="${name}">
          ${slugToLabel(name)}
        </button>
      </li>
    `,
    )
    .join("");
}

function positionSearchPortal(anchorElement) {
  // En esta fase, el portal se inserta dentro del slot clickeado para quedar inline.
  anchorElement.appendChild(dom.searchPortal);
}

function openSearchPortal(side, slotIndex, anchorElement) {
  appState.currentSearch = {
    side,
    slotIndex,
    anchorElement,
  };

  positionSearchPortal(anchorElement);
  dom.searchPortal.hidden = false;
  dom.searchPortal.setAttribute("aria-hidden", "false");
  dom.pokemonSearchInput.value = "";
  renderSearchResults(filterPokemonIndex(""));
  dom.pokemonSearchInput.focus();
}

function closeSearchPortal() {
  appState.currentSearch = {
    side: null,
    slotIndex: null,
    anchorElement: null,
  };

  dom.searchPortal.hidden = true;
  dom.searchPortal.setAttribute("aria-hidden", "true");
}

const handleSearchInput = debounce((event) => {
  const results = filterPokemonIndex(event.target.value);
  renderSearchResults(results);
});

async function addPokemonToCurrentSlot(pokemonName) {
  const { side, slotIndex } = appState.currentSearch;
  if (side === null || slotIndex === null) return;

  try {
    const pokemonData = await fetchPokemonData(pokemonName);
    const nextTeam = [...getTeamBySide(side)];
    nextTeam[slotIndex] = pokemonData;
    setTeamBySide(side, nextTeam);
    closeSearchPortal();
    renderAll();
  } catch (error) {
    console.error(error);
    alert(`No se pudo cargar ${pokemonName}. Revisa el nombre o la conexión.`);
  }
}

// =========================================================
// Acciones de equipo
// =========================================================
function removePokemon(side, slotIndex) {
  const nextTeam = [...getTeamBySide(side)];
  nextTeam[slotIndex] = null;
  setTeamBySide(side, nextTeam);
  renderAll();
}

function swapSides() {
  const currentSelf = [...appState.selfTeam];
  const currentEnemy = [...appState.enemyTeam];
  appState.selfTeam = currentEnemy;
  appState.enemyTeam = currentSelf;
  renderAll();
}

async function hydrateTeamFromNames(side, names) {
  const normalizedNames = names
    .map((name) => String(name).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 6);
  const nextTeam = Array(6).fill(null);

  for (let index = 0; index < normalizedNames.length; index += 1) {
    try {
      nextTeam[index] = await fetchPokemonData(normalizedNames[index]);
    } catch (error) {
      console.warn(`No se pudo cargar ${normalizedNames[index]}`, error);
    }
  }

  setTeamBySide(side, nextTeam);
  renderAll();
}

async function loadEnemyMetaPrompt() {
  const promptValue = window.prompt(
    "Introduce hasta 6 Pokémon separados por comas para el rival.\nSi dejas el valor por defecto, se cargará un meta de ejemplo.",
    FALLBACK_ENEMY_META.join(", "),
  );

  if (promptValue === null) return;
  const selectedNames = promptValue.trim()
    ? promptValue.split(",")
    : FALLBACK_ENEMY_META;
  await hydrateTeamFromNames("enemy", selectedNames);
}

// =========================================================
// Equipos guardados en localStorage
// =========================================================
function saveCurrentSelfTeam(event) {
  event.preventDefault();

  const teamName = dom.teamNameInput.value.trim();
  const members = sanitizeTeamForStorage(appState.selfTeam);

  if (!teamName) {
    alert("Escribe un nombre para guardar el equipo.");
    return;
  }

  if (!members.length) {
    alert("Añade al menos un Pokémon a tu equipo antes de guardar.");
    return;
  }

  const savedEntry = {
    id: crypto.randomUUID(),
    name: teamName,
    members,
    savedAt: new Date().toISOString(),
  };

  appState.savedTeams = [savedEntry, ...appState.savedTeams];
  persistSavedTeams();
  dom.saveTeamForm.reset();
  renderSavedTeams();
}

async function loadSavedTeam(savedIndex) {
  const selectedTeam = appState.savedTeams[savedIndex];
  if (!selectedTeam) return;
  await hydrateTeamFromNames("self", selectedTeam.members);
}

function deleteSavedTeam(savedIndex) {
  appState.savedTeams = appState.savedTeams.filter(
    (_, index) => index !== savedIndex,
  );
  persistSavedTeams();
  renderSavedTeams();
}

// =========================================================
// Eventos
// =========================================================
function handleDocumentClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const action = actionButton.dataset.action;

  if (action === "open-search") {
    const side = actionButton.dataset.side;
    const slotIndex = Number(actionButton.dataset.slotIndex);
    const slotElement = actionButton.closest(".team-slot");
    openSearchPortal(side, slotIndex, slotElement);
    return;
  }

  if (action === "remove-pokemon") {
    removePokemon(
      actionButton.dataset.side,
      Number(actionButton.dataset.slotIndex),
    );
    return;
  }

  if (action === "select-search-result") {
    addPokemonToCurrentSlot(actionButton.dataset.pokemonName);
    return;
  }

  if (action === "load-saved-team") {
    loadSavedTeam(Number(actionButton.dataset.savedTeamIndex));
    return;
  }

  if (action === "delete-saved-team") {
    deleteSavedTeam(Number(actionButton.dataset.savedTeamIndex));
  }
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape" && !dom.searchPortal.hidden) {
    closeSearchPortal();
  }
}

function bindEvents() {
  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleGlobalKeydown);
  dom.pokemonSearchInput.addEventListener("input", handleSearchInput);
  dom.closeSearchPortalBtn.addEventListener("click", closeSearchPortal);
  dom.loadEnemyMetaBtn.addEventListener("click", loadEnemyMetaPrompt);
  dom.swapSidesBtn.addEventListener("click", swapSides);
  dom.saveTeamForm.addEventListener("submit", saveCurrentSelfTeam);
}

// =========================================================
// Inicialización
// =========================================================
async function initApp() {
  loadPokemonCacheFromStorage();
  loadSavedTeamsFromStorage();
  bindEvents();
  renderAll();
  await loadPokemonIndex();
}

initApp();
