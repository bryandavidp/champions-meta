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
  allTypesReady: false,
  typePromise: null,
  pokemonIndexPromise: null,
  moveIndexPromise: null
};

const storageFallback = {
  myTeam: null,
  theme: null
};

document.addEventListener("DOMContentLoaded", init);

function init() {
  try {
    applyInitialTheme();
    hydrateMyTeam();
    bindGlobalEvents();
    renderAll();
  } catch (error) {
    console.error("Init error:", error);
    renderFatalError();
  }
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
  const byId = (id) => document.getElementById(id);

  byId("themeToggle")?.addEventListener("click", toggleTheme);
  byId("heroAnalyzeBtn")?.addEventListener("click", analyzeMatchup);
  byId("stickyAnalyzeBtn")?.addEventListener("click", analyzeMatchup);
  byId("loadSavedTeamBtn")?.addEventListener("click", hydrateMyTeamAndRender);
  byId("clearMyTeamBtn")?.addEventListener("click", clearMyTeam);
  byId("clearRivalTeamBtn")?.addEventListener("click", clearRivalTeam);

  byId("detailsMyTab")?.addEventListener("click", () => setDetailsTab("my"));
  byId("detailsRivalTab")?.addEventListener("click", () => setDetailsTab("rival"));

  byId("myTeamGrid")?.addEventListener("click", onTeamGridClick);
  byId("rivalTeamGrid")?.addEventListener("click", onTeamGridClick);

  byId("myTeamGrid")?.addEventListener("input", onTeamGridInput);
  byId("rivalTeamGrid")?.addEventListener("input", onTeamGridInput);

  byId("myTeamGrid")?.addEventListener("change", onTeamGridChange);
  byId("rivalTeamGrid")?.addEventListener("change", onTeamGridChange);

  byId("myTeamGrid")?.addEventListener("focusin", onTeamGridFocusIn);
  byId("rivalTeamGrid")?.addEventListener("focusin", onTeamGridFocusIn);
}

function onTeamGridFocusIn(event) {
  if (event.target.matches(".pokemon-input")) {
    void ensurePokemonIndex();
  }
  if (event.target.matches(".move-input")) {
    void ensureMoveIndex();
  }
}

function onTeamGridInput(event) {
  const el = event.target;
  const teamKey = el.dataset.team;
  const index = Number(el.dataset.index);

  if (!teamKey || Number.isNaN(index) || !state[teamKey]) return;

  if (el.matches(".pokemon-input")) {
    state[teamKey][index].nameInput = el.value;
  }

  if (el.matches(".move-input")) {
    const moveIndex = Number(el.dataset.moveIndex);
    if (Number.isNaN(moveIndex)) return;
    state[teamKey][index].moves[moveIndex] = el.value;
    if (teamKey === "myTeam") {
      persistMyTeam();
      updateSaveIndicator("Equipo guardado");
    }
  }
}

function onTeamGridChange(event) {
  const el = event.target;
  if (!el.matches(".pokemon-input")) return;

  const teamKey = el.dataset.team;
  const index = Number(el.dataset.index);
  const typed = el.value.trim();

  if (!teamKey || Number.isNaN(index) || !state[teamKey]) return;
  if (typed.length < 2) return;

  void loadPokemonIntoSlot(teamKey, index, typed);
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
    if (input) {
      void loadPokemonIntoSlot(teamKey, index, input.value.trim());
    }
    return;
  }

  if (clearBtn) {
    const teamKey = clearBtn.dataset.team;
    const index = Number(clearBtn.dataset.index);
    if (!teamKey || Number.isNaN(index) || !state[teamKey]) return;
    clearSlot(teamKey, index);
  }
}

function setDetailsTab(tab) {
  state.detailsTab = tab;

  const myTab = document.getElementById("detailsMyTab");
  const rivalTab = document.getElementById("detailsRivalTab");

  myTab?.classList.toggle("is-active", tab === "my");
  rivalTab?.classList.toggle("is-active", tab === "rival");

  myTab?.setAttribute("aria-selected", String(tab === "my"));
  rivalTab?.setAttribute("aria-selected", String(tab === "rival"));

  renderDetails();
}

function clearSlot(teamKey, index) {
  const oldSlot = state[teamKey][index];
  const fresh = createEmptySlot();

  if (teamKey === "myTeam") {
    fresh.moves = ["", "", "", ""];
  } else {
    fresh.moves = oldSlot.moves ? [...oldSlot.moves] : ["", "", "", ""];
  }

  state[teamKey][index] = fresh;
  state.analysis = null;

  if (teamKey === "myTeam") {
    persistMyTeam();
    updateSaveIndicator("Equipo guardado");
  }

  renderAll();
}

function clearMyTeam() {
  state.myTeam = Array.from({ length: 6 }, createEmptySlot);
  state.analysis = null;
  persistMyTeam();
  updateSaveIndicator("Equipo borrado");
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

    if (teamKey === "myTeam") {
      persistMyTeam();
      updateSaveIndicator("Equipo guardado");
    }
  } catch (error) {
    console.error("loadPokemonIntoSlot error:", error);
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
    return deepCopy(cache.pokemon.get(normalized));
  }

  const data = await fetchJSON(`${POKE_API_BASE}/pokemon/${normalized}`);
  await ensureTypeChart();

  const types = [...data.types]
    .sort((a, b) => a.slot - b.slot)
    .map((entry) => entry.type.name);

  const stats = {};
  for (const statEntry of data.stats) {
    stats[statEntry.stat.name] = statEntry.base_stat;
  }

  const abilities = data.abilities
    .map((entry) => ({
      name: entry.ability.name,
      displayName: formatDisplayName(entry.ability.name),
      hidden: entry.is_hidden
    }))
    .sort((a, b) => Number(a.hidden) - Number(b.hidden));

  const pokemon = {
    id: data.id,
    name: data.name,
    displayName: formatDisplayName(data.name),
    sprite:
      data.sprites?.other?.["official-artwork"]?.front_default ||
      data.sprites?.other?.home?.front_default ||
      data.sprites?.front_default ||
      "",
    types,
    stats: {
      hp: stats.hp || 0,
      attack: stats.attack || 0,
      defense: stats.defense || 0,
      "special-attack": stats["special-attack"] || 0,
      "special-defense": stats["special-defense"] || 0,
      speed: stats.speed || 0
    },
    abilities,
    baseStatTotal: Object.values(stats).reduce((sum, value) => sum + value, 0),
    matchup: buildTypeProfile(types)
  };

  cache.pokemon.set(normalized, pokemon);
  return deepCopy(pokemon);
}

async function fetchMoveData(name) {
  const normalized = normalizeApiName(name);
  if (!normalized) return null;

  if (cache.moves.has(normalized)) {
    return deepCopy(cache.moves.get(normalized));
  }

  const data = await fetchJSON(`${POKE_API_BASE}/move/${normalized}`);

  const move = {
    name: data.name,
    displayName: formatDisplayName(data.name),
    type: data.type?.name || "normal",
    power: data.power || 0,
    accuracy: data.accuracy || 100,
    pp: data.pp || 0,
    target: data.target?.name || "selected-pokemon",
    damageClass: data.damage_class?.name || "status",
    metaCategory: data.meta?.category?.name || "",
    isSpread: isSpreadTarget(data.target?.name || ""),
    supportWeight: SUPPORT_MOVE_WEIGHTS[data.name] || inferSupportWeight(data),
    priority: data.priority || 0
  };

  cache.moves.set(normalized, move);
  return deepCopy(move);
}

function inferSupportWeight(moveData) {
  const moveName = moveData.name;
  if (SUPPORT_MOVE_WEIGHTS[moveName]) return SUPPORT_MOVE_WEIGHTS[moveName];

  const target = moveData.target?.name || "";
  const damageClass = moveData.damage_class?.name || "";
  const metaCategory = moveData.meta?.category?.name || "";

  if (damageClass === "status" && ["users-field", "entire-field", "user-and-allies"].includes(target)) {
    return 5;
  }

  if (damageClass === "status" && ["net-good-stats", "heal", "ailment"].includes(metaCategory)) {
    return 4;
  }

  return 0;
}

async function ensureTypeChart() {
  if (cache.allTypesReady) return;
  if (cache.typePromise) {
    await cache.typePromise;
    return;
  }

  cache.typePromise = Promise.all(
    TYPE_NAMES.map(async (typeName) => {
      const data = await fetchJSON(`${POKE_API_BASE}/type/${typeName}`);
      cache.types.set(typeName, {
        name: typeName,
        doubleTo: data.damage_relations.double_damage_to.map((t) => t.name),
        halfTo: data.damage_relations.half_damage_to.map((t) => t.name),
        noneTo: data.damage_relations.no_damage_to.map((t) => t.name)
      });
    })
  ).then(() => {
    cache.allTypesReady = true;
  }).finally(() => {
    cache.typePromise = null;
  });

  await cache.typePromise;
}

async function ensurePokemonIndex() {
  if (cache.pokemonIndex) return cache.pokemonIndex;
  if (cache.pokemonIndexPromise) return cache.pokemonIndexPromise;

  cache.pokemonIndexPromise = fetchJSON(`${POKE_API_BASE}/pokemon?limit=1500&offset=0`)
    .then((data) => {
      cache.pokemonIndex = data.results.map((entry) => ({
        name: entry.name,
        displayName: formatDisplayName(entry.name)
      }));
      populateDatalist("pokemonOptions", cache.pokemonIndex.map((item) => item.displayName));
      return cache.pokemonIndex;
    })
    .catch((error) => {
      console.error("Pokemon index error:", error);
      cache.pokemonIndex = [];
      return [];
    })
    .finally(() => {
      cache.pokemonIndexPromise = null;
    });

  return cache.pokemonIndexPromise;
}

async function ensureMoveIndex() {
  if (cache.moveIndex) return cache.moveIndex;
  if (cache.moveIndexPromise) return cache.moveIndexPromise;

  cache.moveIndexPromise = fetchJSON(`${POKE_API_BASE}/move?limit=10000&offset=0`)
    .then((data) => {
      cache.moveIndex = data.results.map((entry) => ({
        name: entry.name,
        displayName: formatDisplayName(entry.name)
      }));
      populateDatalist("moveOptions", cache.moveIndex.map((item) => item.displayName));
      return cache.moveIndex;
    })
    .catch((error) => {
      console.error("Move index error:", error);
      cache.moveIndex = [];
      return [];
    })
    .finally(() => {
      cache.moveIndexPromise = null;
    });

  return cache.moveIndexPromise;
}

function populateDatalist(id, values) {
  const datalist = document.getElementById(id);
  if (!datalist) return;
  if (datalist.childElementCount > 0) return;

  const fragment = document.createDocumentFragment();
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    fragment.appendChild(option);
  });
  datalist.appendChild(fragment);
}

async function analyzeMatchup() {
  const myEntries = getFilledEntries("myTeam");
  const rivalEntries = getFilledEntries("rivalTeam");

  if (!myEntries.length || !rivalEntries.length) {
    state.analysis = {
      error: "Necesitas al menos 1 Pokémon en tu equipo y 1 en el rival para analizar."
    };
    state.loadingAnalysis = false;
    renderAll();
    return;
  }

  state.loadingAnalysis = true;
  renderOverview();
  renderRecommendation();

  try {
    await ensureTypeChart();

    const preparedMyEntries = await Promise.all(
      myEntries.map(async (entry) => {
        const movesResolved = await resolveMoves(entry.slot.moves);
        return {
          ...entry,
          movesResolved
        };
      })
    );

    const scoredMy = preparedMyEntries.map((entry) =>
      scoreMyPokemon(entry, preparedMyEntries, rivalEntries)
    ).sort((a, b) => b.score - a.score);

    const top4 = scoredMy.slice(0, 4);

    const leadPairs = buildLeadPairs(top4.length >= 2 ? top4 : scoredMy, rivalEntries)
      .sort((a, b) => b.score - a.score);

    const bestLead = leadPairs[0] || null;
    const altLead = leadPairs.find((pair) => !samePair(pair, bestLead)) || null;

    const threats = rivalEntries
      .map((entry) => scoreRivalThreat(entry, preparedMyEntries))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const weakPicks = [...scoredMy]
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.min(2, scoredMy.length));

    const summary = buildSummary(top4, rivalEntries, scoredMy, threats);

    state.analysis = {
      error: null,
      scoredMy,
      top4,
      bestLead,
      altLead,
      threats,
      weakPicks,
      summary
    };
  } catch (error) {
    console.error("analyzeMatchup error:", error);
    state.analysis = {
      error: "Ha fallado el análisis. Revisa conexión o nombres de Pokémon/movimientos."
    };
  } finally {
    state.loadingAnalysis = false;
    renderAll();
  }
}

function getFilledEntries(teamKey) {
  return state[teamKey]
    .map((slot, index) => ({ slot, index }))
    .filter((entry) => entry.slot?.pokemon);
}

async function resolveMoves(moveNames) {
  const cleaned = moveNames
    .map((name) => name.trim())
    .filter(Boolean);

  if (!cleaned.length) return [];

  const resolved = await Promise.all(
    cleaned.map(async (name) => {
      try {
        return await fetchMoveData(name);
      } catch (error) {
        console.warn("Move resolve failed:", name, error);
        return null;
      }
    })
  );

  return resolved.filter(Boolean);
}

function scoreMyPokemon(entry, allMyEntries, rivalEntries) {
  const pokemon = entry.slot.pokemon;
  const movesResolved = entry.movesResolved;
  const attackOptions = getAttackOptions(pokemon, movesResolved);

  let offensiveScore = 0;
  let defensiveScore = 0;
  let utilityScore = 0;
  let sharedWeakPenalty = 0;

  const goodInto = [];
  const badInto = [];
  const reasons = [];
  const cautions = [];

  rivalEntries.forEach((rivalEntry) => {
    const rival = rivalEntry.slot.pokemon;
    const bestAttack = getBestAttackVsTarget(attackOptions, rival);

    offensiveScore += bestAttack.value;

    if (bestAttack.multiplier >= 2) {
      goodInto.push(rival.displayName);
    } else if (bestAttack.multiplier <= 0.5) {
      badInto.push(rival.displayName);
    }

    const incomingMultiplier = getBestStabMultiplier(rival.types, pokemon.types);
    if (incomingMultiplier === 0) defensiveScore += 7;
    else if (incomingMultiplier <= 0.5) defensiveScore += 4;
    else if (incomingMultiplier === 1) defensiveScore += 1;
    else if (incomingMultiplier >= 4) defensiveScore -= 9;
    else defensiveScore -= 5;
  });

  const supportSummary = summarizeSupport(movesResolved);
  utilityScore += supportSummary.score;

  const abilityUtility = pokemon.abilities.reduce((sum, ability) => {
    return sum + (ABILITY_WEIGHTS[ability.name] || 0);
  }, 0);
  utilityScore += Math.min(abilityUtility, 8);

  const speed = pokemon.stats.speed || 0;
  if (speed >= 120) utilityScore += 5;
  else if (speed >= 100) utilityScore += 3;
  else if (speed >= 80) utilityScore += 1;

  const allies = allMyEntries.filter((ally) => ally.index !== entry.index);
  allies.forEach((ally) => {
    const overlap = intersection(
      pokemon.matchup.weaknesses,
      ally.slot.pokemon.matchup.weaknesses
    );
    sharedWeakPenalty += overlap.length * 1.6;
  });

  const movePressurePenalty = goodInto.length === 0 ? 5 : 0;
  const score =
    round1(offensiveScore * 1.05 + defensiveScore + utilityScore - sharedWeakPenalty - movePressurePenalty);

  if (goodInto.length) {
    reasons.push(`Buena cobertura contra ${goodInto.slice(0, 3).join(", ")}.`);
  }

  if (supportSummary.labels.length) {
    reasons.push(`${supportSummary.labels.slice(0, 2).join(" + ")} aporta utilidad real en dobles.`);
  }

  if (pokemon.matchup.immunities.length) {
    reasons.push(`Aporta inmunidades útiles: ${pokemon.matchup.immunities.slice(0, 2).join(", ")}.`);
  }

  if (badInto.length >= Math.max(2, Math.ceil(rivalEntries.length / 2))) {
    cautions.push(`Tus movimientos presionan mal a ${badInto.slice(0, 3).join(", ")}.`);
  }

  if (sharedWeakPenalty >= 3.2) {
    cautions.push("Comparte debilidades importantes con otros picks.");
  }

  if (!movesResolved.some((move) => move.damageClass !== "status")) {
    cautions.push("No tiene suficiente presión ofensiva real con el moveset actual.");
  }

  return {
    ...entry,
    score,
    offensiveScore: round1(offensiveScore),
    defensiveScore: round1(defensiveScore),
    utilityScore: round1(utilityScore),
    sharedWeakPenalty: round1(sharedWeakPenalty),
    goodInto,
    badInto,
    reasons: uniqueShort(reasons),
    cautions: uniqueShort(cautions),
    supportSummary
  };
}

function buildLeadPairs(candidates, rivalEntries) {
  const pairs = [];

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];

      let score = a.score + b.score;
      const reasons = [];

      const coverageUnion = new Set([...a.goodInto, ...b.goodInto]);
      score += coverageUnion.size * 1.8;
      if (coverageUnion.size >= 2) {
        reasons.push("Lead fuerte por cobertura ofensiva conjunta.");
      }

      const sharedWeak = intersection(
        a.slot.pokemon.matchup.weaknesses,
        b.slot.pokemon.matchup.weaknesses
      );
      if (sharedWeak.length) {
        score -= sharedWeak.length * 3;
        reasons.push(`Ojo con debilidad compartida a ${sharedWeak.slice(0, 2).join(", ")}.`);
      }

      const aSupport = a.supportSummary.names;
      const bSupport = b.supportSummary.names;
      const pairSupport = [...aSupport, ...bSupport];

      if (pairSupport.includes("fake-out") && pairSupport.some((m) => ["tailwind", "trick-room", "spore", "rage-powder", "follow-me"].includes(m))) {
        score += 6;
        reasons.push("Turno 1 fuerte: presión + setup/soporte.");
      }

      if (pairSupport.includes("tailwind")) {
        const avgSpeed = (a.slot.pokemon.stats.speed + b.slot.pokemon.stats.speed) / 2;
        if (avgSpeed >= 85) {
          score += 4;
          reasons.push("Tailwind mejora mucho el plan de lead.");
        }
      }

      if (pairSupport.includes("trick-room")) {
        const avgSpeed = (a.slot.pokemon.stats.speed + b.slot.pokemon.stats.speed) / 2;
        if (avgSpeed <= 75) {
          score += 4;
          reasons.push("Lead coherente para activar Trick Room.");
        } else {
          score -= 2;
        }
      }

      const selfHitCheck = evaluateSelfHitSynergy(a, b);
      score += selfHitCheck.score;
      reasons.push(...selfHitCheck.reasons);

      rivalEntries.forEach((rivalEntry) => {
        const rival = rivalEntry.slot.pokemon;
        const pairWeak = Math.max(
          getBestStabMultiplier(rival.types, a.slot.pokemon.types),
          getBestStabMultiplier(rival.types, b.slot.pokemon.types)
        );
        if (pairWeak >= 2) score -= 0.8;
      });

      pairs.push({
        score: round1(score),
        members: [a, b],
        reasons: uniqueShort(reasons).slice(0, 4)
      });
    }
  }

  return pairs;
}

function evaluateSelfHitSynergy(a, b) {
  let score = 0;
  const reasons = [];
  const aMoves = a.movesResolved.map((move) => move.name);
  const bMoves = b.movesResolved.map((move) => move.name);

  aMoves.forEach((moveName) => {
    if (!SELF_HIT_MOVES[moveName]) return;
    if (partnerIsSafeFromSelfHit(b.slot.pokemon, SELF_HIT_MOVES[moveName])) {
      score += 3;
      reasons.push(`Buen encaje: ${formatDisplayName(moveName)} no castiga a tu compañero.`);
    } else {
      score -= 5;
      reasons.push(`Evita abrir con ${formatDisplayName(moveName)} si dañas a tu compañero.`);
    }
  });

  bMoves.forEach((moveName) => {
    if (!SELF_HIT_MOVES[moveName]) return;
    if (partnerIsSafeFromSelfHit(a.slot.pokemon, SELF_HIT_MOVES[moveName])) {
      score += 3;
    } else {
      score -= 5;
    }
  });

  return { score, reasons };
}

function partnerIsSafeFromSelfHit(pokemon, rule) {
  const hasImmuneType = (rule.immuneTypes || []).some((type) => pokemon.types.includes(type));
  const hasImmuneAbility = (rule.immuneAbilities || []).some((ability) =>
    pokemon.abilities.some((entry) => entry.name === ability)
  );
  return hasImmuneType || hasImmuneAbility;
}

function scoreRivalThreat(entry, myEntries) {
  const rival = entry.slot.pokemon;
  let score = 0;
  const punishes = [];

  myEntries.forEach((myEntry) => {
    const myPokemon = myEntry.slot.pokemon;
    const mult = getBestStabMultiplier(rival.types, myPokemon.types);

    if (mult >= 4) {
      score += 11;
      punishes.push(myPokemon.displayName);
    } else if (mult >= 2) {
      score += 7;
      punishes.push(myPokemon.displayName);
    } else if (mult <= 0.5) {
      score += 1;
    } else {
      score += 3;
    }
  });

  const speed = rival.stats.speed || 0;
  if (speed >= 120) score += 5;
  else if (speed >= 100) score += 3;
  else if (speed >= 80) score += 1;

  const abilityScore = rival.abilities.reduce((sum, ability) => sum + (ABILITY_WEIGHTS[ability.name] || 0), 0);
  score += Math.min(abilityScore, 7);

  const reasons = [];
  if (punishes.length) {
    reasons.push(`Presiona a ${uniqueShort(punishes).slice(0, 3).join(", ")}.`);
  }
  if (speed >= 100) {
    reasons.push("Amenaza por velocidad base alta.");
  }
  const supportAbility = rival.abilities.find((ability) => ABILITY_WEIGHTS[ability.name] >= 5);
  if (supportAbility) {
    reasons.push(`Habilidad molesta: ${supportAbility.displayName}.`);
  }

  return {
    ...entry,
    score: round1(score),
    reasons: uniqueShort(reasons)
  };
}

function buildSummary(top4, rivalEntries, scoredMy, threats) {
  const sharedWeaknessCounts = countTypeOccurrences(top4.flatMap((entry) => entry.slot.pokemon.matchup.weaknesses));
  const sharedWeaknesses = Object.entries(sharedWeaknessCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => ({ type, count }));

  const immunityCounts = countTypeOccurrences(top4.flatMap((entry) => entry.slot.pokemon.matchup.immunities));
  const usefulImmunities = Object.entries(immunityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, count]) => ({ type, count }));

  const favorable = scoredMy.filter((entry) => entry.goodInto.length >= 2).length;
  const risky = scoredMy.filter((entry) => entry.cautions.length >= 2).length;
  const mainThreat = threats[0]?.slot?.pokemon?.displayName || "—";
  const rivalCore = rivalEntries.slice(0, 3).map((entry) => entry.slot.pokemon.displayName);

  return {
    favorable,
    risky,
    mainThreat,
    rivalCore,
    sharedWeaknesses,
    usefulImmunities
  };
}

function getAttackOptions(pokemon, movesResolved) {
  const damagingMoves = movesResolved.filter((move) => move.damageClass !== "status");

  if (damagingMoves.length) {
    return damagingMoves.map((move) => ({
      name: move.name,
      displayName: move.displayName,
      type: move.type,
      power: move.power || 60,
      accuracy: move.accuracy || 100,
      isSpread: move.isSpread,
      stab: pokemon.types.includes(move.type),
      priority: move.priority || 0
    }));
  }

  return pokemon.types.map((type) => ({
    name: `${type}-stab`,
    displayName: formatDisplayName(type),
    type,
    power: 60,
    accuracy: 100,
    isSpread: false,
    stab: true,
    priority: 0
  }));
}

function getBestAttackVsTarget(options, targetPokemon) {
  let best = {
    multiplier: 0,
    value: 0,
    move: null
  };

  options.forEach((option) => {
    const multiplier = getTypeMultiplier(option.type, targetPokemon.types);
    const stabBonus = option.stab ? 1.25 : 1;
    const powerFactor = Math.max(1.2, (option.power || 60) / 35);
    const spreadFactor = option.isSpread ? 1.1 : 1;
    const priorityFactor = option.priority > 0 ? 1.08 : 1;
    const accuracyFactor = (option.accuracy || 100) / 100;

    const value = multiplier * stabBonus * powerFactor * spreadFactor * priorityFactor * accuracyFactor * 4;

    if (value > best.value) {
      best = {
        multiplier,
        value,
        move: option
      };
    }
  });

  return {
    ...best,
    value: round1(best.value)
  };
}

function getBestStabMultiplier(attackerTypes, defenderTypes) {
  return Math.max(...attackerTypes.map((type) => getTypeMultiplier(type, defenderTypes)));
}

function getTypeMultiplier(attackingType, defendingTypes) {
  const attack = cache.types.get(attackingType);
  if (!attack) return 1;

  return defendingTypes.reduce((multiplier, defendingType) => {
    if (attack.noneTo.includes(defendingType)) return multiplier * 0;
    if (attack.doubleTo.includes(defendingType)) return multiplier * 2;
    if (attack.halfTo.includes(defendingType)) return multiplier * 0.5;
    return multiplier * 1;
  }, 1);
}

function buildTypeProfile(types) {
  const weaknesses = [];
  const resistances = [];
  const immunities = [];

  TYPE_NAMES.forEach((attackType) => {
    const multiplier = getTypeMultiplier(attackType, types);
    if (multiplier === 0) immunities.push(attackType);
    else if (multiplier > 1) weaknesses.push(attackType);
    else if (multiplier < 1) resistances.push(attackType);
  });

  return { weaknesses, resistances, immunities };
}

function summarizeSupport(movesResolved) {
  const names = [];
  let score = 0;

  movesResolved.forEach((move) => {
    if (move.supportWeight > 0) {
      names.push(move.name);
      score += move.supportWeight;
    }
    if (move.name === "protect") score += 1;
    if (move.isSpread && move.damageClass !== "status") score += 1.5;
  });

  return {
    names: uniqueShort(names),
    labels: uniqueShort(names.map((name) => formatDisplayName(name))),
    score: Math.min(score, 14)
  };
}

function renderAll() {
  renderTeamGrid("myTeam");
  renderTeamGrid("rivalTeam");
  renderOverview();
  renderRecommendation();
  renderDetails();
}

function renderTeamGrid(teamKey) {
  const container = document.getElementById(teamKey === "myTeam" ? "myTeamGrid" : "rivalTeamGrid");
  if (!container) return;

  container.innerHTML = state[teamKey]
    .map((slot, index) => renderTeamSlot(slot, teamKey, index))
    .join("");
}

function renderTeamSlot(slot, teamKey, index) {
  const slotTitle = `${teamKey === "myTeam" ? "Mi slot" : "Rival"} ${index + 1}`;
  const isMyTeam = teamKey === "myTeam";

  let content = `
    <div class="slot-placeholder">
      Busca un Pokémon y pulsa cargar.
    </div>
  `;

  if (slot.status === "loading") {
    content = `
      <div class="slot-summary">
        <div class="skeleton skeleton-line lg"></div>
        <div class="skeleton skeleton-line md"></div>
        <div class="skeleton skeleton-line sm"></div>
      </div>
    `;
  } else if (slot.status === "error") {
    content = `
      <div class="error-state">
        <h3>Error al cargar</h3>
        <p>${escapeHtml(slot.error || "No se pudo cargar.")}</p>
      </div>
    `;
  } else if (slot.pokemon) {
    content = `
      <div class="slot-summary">
        <div class="pokemon-row">
          <div class="sprite-frame">
            ${slot.pokemon.sprite
              ? `<img src="${escapeHtml(slot.pokemon.sprite)}" alt="${escapeHtml(slot.pokemon.displayName)}" width="64" height="64" loading="lazy">`
              : `<span>${escapeHtml(slot.pokemon.displayName.slice(0, 2).toUpperCase())}</span>`}
          </div>

          <div>
            <div class="pokemon-name">
              <strong>${escapeHtml(slot.pokemon.displayName)}</strong>
              <span class="small-chip">${slot.pokemon.baseStatTotal} BST</span>
            </div>

            <div class="badge-row">
              ${slot.pokemon.types.map(renderTypeChip).join("")}
            </div>
          </div>
        </div>

        <div class="chips-wrap">
          ${slot.pokemon.abilities.slice(0, 3).map((ability) => `<span class="small-chip">${escapeHtml(ability.displayName)}</span>`).join("")}
        </div>

        <div class="stat-grid">
          ${renderStatPill("HP", slot.pokemon.stats.hp)}
          ${renderStatPill("Atk", slot.pokemon.stats.attack)}
          ${renderStatPill("Def", slot.pokemon.stats.defense)}
          ${renderStatPill("SpA", slot.pokemon.stats["special-attack"])}
          ${renderStatPill("SpD", slot.pokemon.stats["special-defense"])}
          ${renderStatPill("Spe", slot.pokemon.stats.speed)}
        </div>

        <div class="chips-wrap">
          ${slot.pokemon.matchup.weaknesses.slice(0, 5).map((type) => `<span class="small-chip weak">Débil a ${escapeHtml(formatDisplayName(type))}</span>`).join("")}
          ${slot.pokemon.matchup.resistances.slice(0, 5).map((type) => `<span class="small-chip good">Resiste ${escapeHtml(formatDisplayName(type))}</span>`).join("")}
          ${slot.pokemon.matchup.immunities.slice(0, 3).map((type) => `<span class="small-chip warn">Inmune a ${escapeHtml(formatDisplayName(type))}</span>`).join("")}
        </div>
      </div>
    `;
  }

  const movesPanel = isMyTeam
    ? `
      <details class="moves-panel" ${slot.pokemon ? "" : ""}>
        <summary>
          <span>Movimientos reales</span>
          <span>${countFilled(slot.moves)}/4</span>
        </summary>
        <div class="moves-grid">
          ${slot.moves.map((move, moveIndex) => `
            <input
              class="text-input move-input"
              type="text"
              placeholder="Movimiento ${moveIndex + 1}"
              value="${escapeAttribute(move)}"
              list="moveOptions"
              data-team="${teamKey}"
              data-index="${index}"
              data-move-index="${moveIndex}"
              autocomplete="off"
              spellcheck="false"
            />
          `).join("")}
        </div>
      </details>
    `
    : "";

  return `
    <article class="team-slot">
      <div class="slot-head">
        <span class="slot-label">${escapeHtml(slotTitle)}</span>
        <div class="slot-tools">
          <button
            class="micro-btn"
            type="button"
            data-action="clear-slot"
            data-team="${teamKey}"
            data-index="${index}"
            aria-label="Vaciar slot ${index + 1}"
          >
            Vaciar
          </button>
        </div>
      </div>

      <div class="search-row">
        <input
          class="text-input pokemon-input"
          type="text"
          placeholder="Ej: Incineroar"
          value="${escapeAttribute(slot.nameInput)}"
          list="pokemonOptions"
          data-team="${teamKey}"
          data-index="${index}"
          autocomplete="off"
          spellcheck="false"
        />
        <button
          class="icon-btn"
          type="button"
          data-action="load-slot"
          data-team="${teamKey}"
          data-index="${index}"
          aria-label="Cargar Pokémon"
          title="Cargar"
        >
          ↗
        </button>
      </div>

      ${content}
      ${movesPanel}
    </article>
  `;
}

function renderOverview() {
  const container = document.getElementById("overviewContent");
  if (!container) return;

  if (state.loadingAnalysis) {
    container.innerHTML = renderLoadingCards(3);
    return;
  }

  if (!state.analysis) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Aún no hay análisis</h3>
        <p>Carga tu equipo, mete el rival y pulsa analizar para ver la lectura general del matchup.</p>
      </div>
    `;
    return;
  }

  if (state.analysis.error) {
    container.innerHTML = `
      <div class="error-state">
        <h3>No se pudo generar el análisis</h3>
        <p>${escapeHtml(state.analysis.error)}</p>
      </div>
    `;
    return;
  }

  const summary = state.analysis.summary;

  container.innerHTML = `
    <div class="summary-grid">
      <article class="summary-card">
        <h3 class="summary-title">Pulso del matchup</h3>
        <p class="card-subtext">Visión rápida antes de decidir tus 4.</p>
        <div class="chips-wrap">
          <span class="small-chip good">${summary.favorable} picks con presión clara</span>
          <span class="small-chip warn">${summary.risky} picks con más riesgo</span>
          <span class="small-chip">Amenaza principal: ${escapeHtml(summary.mainThreat)}</span>
        </div>
      </article>

      <article class="summary-card">
        <h3 class="summary-title">Núcleo rival visible</h3>
        <p class="card-subtext">Primeros nombres detectados del rival.</p>
        <div class="reason-list">
          ${summary.rivalCore.map((name) => `<span class="reason-bullet">${escapeHtml(name)}</span>`).join("") || `<span class="reason-bullet">Sin datos</span>`}
        </div>
      </article>

      <article class="summary-card">
        <h3 class="summary-title">Debilidades compartidas</h3>
        <p class="card-subtext">Si repites estas debilidades, evita sobrecargar tu top 4.</p>
        <div class="chips-wrap">
          ${summary.sharedWeaknesses.length
            ? summary.sharedWeaknesses.map((entry) => `<span class="small-chip weak">${escapeHtml(formatDisplayName(entry.type))} ×${entry.count}</span>`).join("")
            : `<span class="small-chip good">Sin solapamiento grave</span>`}
        </div>
      </article>

      <article class="summary-card">
        <h3 class="summary-title">Inmunidades útiles</h3>
        <p class="card-subtext">Puntos de entrada o leads que dan margen táctico.</p>
        <div class="chips-wrap">
          ${summary.usefulImmunities.length
            ? summary.usefulImmunities.map((entry) => `<span class="small-chip warn">${escapeHtml(formatDisplayName(entry.type))} ×${entry.count}</span>`).join("")
            : `<span class="small-chip">Sin inmunidades repetidas</span>`}
        </div>
      </article>
    </div>
  `;
}

function renderRecommendation() {
  const container = document.getElementById("recommendationContent");
  if (!container) return;

  if (state.loadingAnalysis) {
    container.innerHTML = renderLoadingCards(4);
    return;
  }

  if (!state.analysis) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Recomendación táctica pendiente</h3>
        <p>Cuando analices el matchup aparecerán aquí tu top 4, el mejor lead y los picks poco recomendables.</p>
      </div>
    `;
    return;
  }

  if (state.analysis.error) {
    container.innerHTML = `
      <div class="error-state">
        <h3>Error de recomendación</h3>
        <p>${escapeHtml(state.analysis.error)}</p>
      </div>
    `;
    return;
  }

  const { top4, bestLead, altLead, threats, weakPicks } = state.analysis;

  container.innerHTML = `
    <article class="recommendation-card">
      <div class="score-card-head">
        <div>
          <h3 class="card-title">Top 4 para llevar</h3>
          <p class="card-subtext">Ordenados por matchup, utilidad y cobertura real.</p>
        </div>
      </div>

      <div class="content-stack">
        ${top4.map((entry, idx) => `
          <div class="pick-item">
            <div>
              <strong>#${idx + 1} ${escapeHtml(entry.slot.pokemon.displayName)}</strong>
              <div class="reason-list">
                ${entry.reasons.slice(0, 2).map((reason) => `<span class="reason-bullet">${escapeHtml(reason)}</span>`).join("")}
              </div>
            </div>
            <span class="score-chip small-chip">${entry.score}</span>
          </div>
        `).join("")}
      </div>
    </article>

    <article class="recommendation-card">
      <h3 class="card-title">Mejor lead de 2</h3>
      <p class="card-subtext">La pareja con mejor presión inicial y sinergia táctica.</p>
      ${bestLead ? `
        <div class="pick-item">
          <div>
            <strong>${escapeHtml(bestLead.members[0].slot.pokemon.displayName)} + ${escapeHtml(bestLead.members[1].slot.pokemon.displayName)}</strong>
            <div class="reason-list">
              ${bestLead.reasons.map((reason) => `<span class="reason-bullet">${escapeHtml(reason)}</span>`).join("")}
            </div>
          </div>
          <span class="score-chip small-chip good">${bestLead.score}</span>
        </div>
      ` : `<p class="inline-message">No hay suficientes picks para recomendar lead.</p>`}
    </article>

    <article class="recommendation-card">
      <h3 class="card-title">Lead alternativo</h3>
      <p class="card-subtext">Plan B útil si esperas otra apertura rival.</p>
      ${altLead ? `
        <div class="pick-item">
          <div>
            <strong>${escapeHtml(altLead.members[0].slot.pokemon.displayName)} + ${escapeHtml(altLead.members[1].slot.pokemon.displayName)}</strong>
            <div class="reason-list">
              ${altLead.reasons.map((reason) => `<span class="reason-bullet">${escapeHtml(reason)}</span>`).join("")}
            </div>
          </div>
          <span class="score-chip small-chip warn">${altLead.score}</span>
        </div>
      ` : `<p class="inline-message">No hay una alternativa clara todavía.</p>`}
    </article>

    <article class="recommendation-card">
      <h3 class="card-title">Amenazas y malos picks</h3>
      <p class="card-subtext">Qué respetar y qué evitar salvo lectura muy concreta.</p>

      <div class="content-stack">
        <div>
          <strong>Amenazas rivales</strong>
          <div class="reason-list">
            ${threats.map((entry) => `
              <span class="reason-bullet">
                ${escapeHtml(entry.slot.pokemon.displayName)} · ${entry.reasons[0] || "Alta presión general."}
              </span>
            `).join("")}
          </div>
        </div>

        <div>
          <strong>Picks poco recomendables</strong>
          <div class="reason-list">
            ${weakPicks.map((entry) => `
              <span class="reason-bullet">
                ${escapeHtml(entry.slot.pokemon.displayName)} · ${(entry.cautions[0] || "Menor presión o peor encaje en este matchup.")}
              </span>
            `).join("")}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderDetails() {
  const container = document.getElementById("detailsContent");
  if (!container) return;

  const teamKey = state.detailsTab === "my" ? "myTeam" : "rivalTeam";
  const entries = getFilledEntries(teamKey);

  if (!entries.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Sin detalles todavía</h3>
        <p>${teamKey === "myTeam" ? "Carga tu equipo principal para ver cada ficha detallada." : "Añade el rival para ver las amenazas una a una."}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = entries.map((entry) => {
    const pokemon = entry.slot.pokemon;
    const analysisEntry = state.analysis?.scoredMy?.find((item) => item.index === entry.index && teamKey === "myTeam");
    const moveLabels = teamKey === "myTeam"
      ? entry.slot.moves.filter(Boolean).map((move) => `<span class="small-chip">${escapeHtml(move)}</span>`).join("")
      : "";

    return `
      <article class="detail-card">
        <div class="detail-head">
          <div class="sprite-frame">
            ${pokemon.sprite
              ? `<img src="${escapeHtml(pokemon.sprite)}" alt="${escapeHtml(pokemon.displayName)}" width="64" height="64" loading="lazy">`
              : `<span>${escapeHtml(pokemon.displayName.slice(0, 2).toUpperCase())}</span>`}
          </div>

          <div>
            <div class="pokemon-name">
              <strong>${escapeHtml(pokemon.displayName)}</strong>
              ${analysisEntry ? `<span class="small-chip good">Score ${analysisEntry.score}</span>` : ""}
            </div>
            <div class="badge-row">
              ${pokemon.types.map(renderTypeChip).join("")}
            </div>
          </div>
        </div>

        <div class="chips-wrap">
          ${pokemon.abilities.map((ability) => `<span class="small-chip">${escapeHtml(ability.displayName)}</span>`).join("")}
        </div>

        <div class="stat-grid">
          ${renderStatPill("HP", pokemon.stats.hp)}
          ${renderStatPill("Atk", pokemon.stats.attack)}
          ${renderStatPill("Def", pokemon.stats.defense)}
          ${renderStatPill("SpA", pokemon.stats["special-attack"])}
          ${renderStatPill("SpD", pokemon.stats["special-defense"])}
          ${renderStatPill("Spe", pokemon.stats.speed)}
        </div>

        <div class="chips-wrap">
          ${pokemon.matchup.weaknesses.map((type) => `<span class="small-chip weak">${escapeHtml(formatDisplayName(type))}</span>`).join("")}
          ${pokemon.matchup.resistances.map((type) => `<span class="small-chip good">${escapeHtml(formatDisplayName(type))}</span>`).join("")}
          ${pokemon.matchup.immunities.map((type) => `<span class="small-chip warn">${escapeHtml(formatDisplayName(type))}</span>`).join("")}
        </div>

        ${teamKey === "myTeam" ? `
          <div>
            <p class="detail-copy">Movimientos introducidos</p>
            <div class="chips-wrap">
              ${moveLabels || `<span class="small-chip">Sin movimientos aún</span>`}
            </div>
          </div>
        ` : ""}

        ${analysisEntry ? `
          <div>
            <p class="detail-copy">Razones para este pick</p>
            <div class="reason-list">
              ${analysisEntry.reasons.map((reason) => `<span class="reason-bullet">${escapeHtml(reason)}</span>`).join("")}
              ${analysisEntry.cautions.map((reason) => `<span class="reason-bullet">${escapeHtml(reason)}</span>`).join("")}
            </div>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function renderLoadingCards(count) {
  return Array.from({ length: count }, () => `
    <article class="summary-card">
      <div class="skeleton skeleton-line lg"></div>
      <div class="skeleton skeleton-line md"></div>
      <div class="skeleton skeleton-line sm"></div>
    </article>
  `).join("");
}

function hydrateMyTeamAndRender() {
  hydrateMyTeam();
  renderAll();
}

function hydrateMyTeam() {
  const raw = safeStorageGet(STORAGE_KEYS.myTeam);
  if (!raw) return;

  let saved;
  try {
    saved = JSON.parse(raw);
  } catch (error) {
    console.warn("Saved team parse error:", error);
    return;
  }

  if (!Array.isArray(saved)) return;

  saved.slice(0, 6).forEach((savedSlot, index) => {
    const slot = createEmptySlot();
    slot.moves = Array.isArray(savedSlot?.moves)
      ? savedSlot.moves.slice(0, 4).map((value) => String(value || ""))
      : ["", "", "", ""];
    slot.nameInput = String(savedSlot?.name || "");
    state.myTeam[index] = slot;

    if (slot.nameInput.trim()) {
      void loadPokemonIntoSlot("myTeam", index, slot.nameInput.trim());
    }
  });
}

function persistMyTeam() {
  const payload = state.myTeam.map((slot) => ({
    name: slot.pokemon?.name || slot.nameInput || "",
    moves: Array.isArray(slot.moves) ? slot.moves.slice(0, 4) : ["", "", "", ""]
  }));

  safeStorageSet(STORAGE_KEYS.myTeam, JSON.stringify(payload));
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return storageFallback[key] ?? null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    storageFallback[key] = value;
  }
}

function applyInitialTheme() {
  const saved = safeStorageGet(STORAGE_KEYS.theme);
  const systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (systemDark ? "dark" : "light");

  document.documentElement.setAttribute("data-theme", theme);
  updateThemeToggle(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";

  document.documentElement.setAttribute("data-theme", next);
  safeStorageSet(STORAGE_KEYS.theme, next);
  updateThemeToggle(next);
}

function updateThemeToggle(theme) {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  btn.setAttribute("aria-label", theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
  btn.innerHTML = `<span class="theme-icon">${theme === "dark" ? "☀" : "◐"}</span>`;
}

function updateSaveIndicator(message) {
  const el = document.getElementById("saveIndicator");
  if (!el) return;
  el.textContent = message;
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} at ${url}`);
  }
  return response.json();
}

function normalizeApiName(value) {
  if (!value) return "";

  const aliases = {
    "mr mime": "mr-mime",
    "mime jr": "mime-jr",
    "type null": "type-null",
    "jangmo o": "jangmo-o",
    "hakamo o": "hakamo-o",
    "kommo o": "kommo-o",
    "tapu koko": "tapu-koko",
    "tapu lele": "tapu-lele",
    "tapu bulu": "tapu-bulu",
    "tapu fini": "tapu-fini",
    "great tusk": "great-tusk",
    "iron hands": "iron-hands",
    "iron bundle": "iron-bundle",
    "roaring moon": "roaring-moon",
    "flutter mane": "flutter-mane",
    "chien pao": "chien-pao",
    "wo chien": "wo-chien",
    "ting lu": "ting-lu",
    "chi yu": "chi-yu",
    "nidoran♀": "nidoran-f",
    "nidoran♂": "nidoran-m",
    "nidoran f": "nidoran-f",
    "nidoran m": "nidoran-m",
    "farfetch'd": "farfetchd",
    "sirfetch'd": "sirfetchd",
    "will o wisp": "will-o-wisp"
  };

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.:]/g, " ")
    .replace(/['’]/g, "")
    .replace(/♀/g, "♀")
    .replace(/♂/g, "♂")
    .replace(/\s+/g, " ")
    .trim();

  if (aliases[normalized]) return aliases[normalized];

  return normalized
    .replace(/[%]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function formatDisplayName(value) {
  if (!value) return "";
  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bSp Atk\b/g, "SpA")
    .replace(/\bSp Def\b/g, "SpD");
}

function renderTypeChip(type) {
  return `<span class="type-chip" style="--type-color: var(--type-${escapeAttribute(type)})">${escapeHtml(formatDisplayName(type))}</span>`;
}

function renderStatPill(label, value) {
  return `
    <div class="stat-pill">
      <span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-value">${escapeHtml(String(value))}</span>
    </div>
  `;
}

function renderFatalError() {
  const targets = ["overviewContent", "recommendationContent", "detailsContent"];
  targets.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `
      <div class="error-state">
        <h3>Error crítico</h3>
        <p>La app no pudo inicializarse. Revisa la consola para ver el detalle.</p>
      </div>
    `;
  });
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function intersection(a, b) {
  const setB = new Set(b);
  return [...new Set(a)].filter((item) => setB.has(item));
}

function uniqueShort(items) {
  return [...new Set(items)].filter(Boolean);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function countFilled(values) {
  return values.filter((value) => value && value.trim()).length;
}

function samePair(a, b) {
  if (!a || !b) return false;
  const aIds = a.members.map((member) => member.slot.pokemon.id).sort((x, y) => x - y);
  const bIds = b.members.map((member) => member.slot.pokemon.id).sort((x, y) => x - y);
  return aIds[0] === bIds[0] && aIds[1] === bIds[1];
}

function countTypeOccurrences(types) {
  return types.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
}

function isSpreadTarget(target) {
  return [
    "all-opponents",
    "all-other-pokemon",
    "all-pokemon",
    "entire-field",
    "user-and-allies"
  ].includes(target);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
