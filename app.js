const STORAGE_KEY = "offensive-matrix-saved-teams-v4";
const CACHE_KEY_PREFIX = "smogon-chaos-cache-2026-04-";
const RATING_STORAGE_KEY = "smogon-champions-rating";
const SMOGON_MONTH = "2026-04";
const SMOGON_BASE = "./data/";

let DEBUG_MODE = true;
let FLOW_DEBUG = true;

window.loggedMessages = window.loggedMessages || new Set();

function smartLog(key, message) {
    if (!DEBUG_MODE) return;
    if (!window.loggedMessages.has(key)) {
        console.log(message);
        window.loggedMessages.add(key);
    }
}

function flowLog(msg, data) {
    if (!DEBUG_MODE || !FLOW_DEBUG) return;
    console.log(`[FLOW] ${msg}`, data !== undefined ? data : '');
}

function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// Llama a esto SOLO en renderQuickCombos() o updateLive() para reiniciar el rastreador al hacer clic
function resetSmartLog() {
    window.loggedMessages.clear();
    window.currentDamageCache = {}; // Aprovechamos para limpiar la caché aquí y NO en los bucles
}

function toggleDebug(force) {
  DEBUG_MODE = typeof force === 'boolean' ? force : !DEBUG_MODE;
  renderAll();
}

function runDebugScenarios() {
  const scenarios = [];

  scenarios.push({
    name: 'Intimidate + Friend Guard + Reflect',
    setup: () => {
      const s = structuredClone(state);
      return s;
    },
  });

  for (const sc of scenarios) {
    sc.setup();
    const rows = getRows();
    console.log('[SCENARIO]', sc.name, rows);
  }
}
const SMOGON_FILES = {
  0: "gen9championsou-0.json",
  1500: "gen9championsou-1500.json",
  1630: "gen9championsou-1630.json",
  1760: "gen9championsou-1760.json",
};
const RATING_ORDER = ["1760", "1630", "1500", "0"];

const MATRIX_DETAIL_MODE_KEY = "offensive-matrix-detail-v1";
const MATRIX_HELP_SEEN_KEY = "offensive-matrix-help-seen-v1";

const META_PRESETS = [
  {
    name: "Hyper Offense",
    desc: "Presión constante y setups ofensivos.",
    mons: ["meowscarada", "samurott-hisui", "dragapult", "volcarona", "ceruledge", "kingambit"]
  },
  {
    name: "Bulky Balance",
    desc: "Core sólido con mega-evolución defensiva.",
    mons: ["meganium-mega", "rotom-wash", "corviknight", "sneasler", "garchomp", "clefable"]
  },
  {
    name: "Clima Arena",
    desc: "Control de clima y daño residual.",
    mons: ["tyranitar", "excadrill", "aegislash", "primarina", "dragonite", "hatterene"]
  }
];

const TACTICAL_ROLES = {
  weatherSetters: ['drizzle', 'drought', 'sand stream', 'snow warning', 'llovizna', 'sequía', 'chorro arena', 'nevada'],
  terrainSetters: ['grassy surge', 'psychic surge', 'electric surge', 'misty surge', 'herbogénesis', 'psicogénesis', 'electrogénesis', 'nebulogénesis'],
  speedControl: ['trick room', 'espacio raro', 'tailwind', 'viento afín']
};

const TYPE_META = {
  normal: { name: "Normal", short: "N", color: "#A8A77A", icon: "N" },
  fire: { name: "Fire", short: "F", color: "#EE8130", icon: "F" },
  water: { name: "Water", short: "W", color: "#6390F0", icon: "W" },
  electric: { name: "Electric", short: "E", color: "#F7D02C", icon: "E" },
  grass: { name: "Grass", short: "G", color: "#7AC74C", icon: "G" },
  ice: { name: "Ice", short: "I", color: "#96D9D6", icon: "I" },
  fighting: { name: "Fighting", short: "Ft", color: "#C22E28", icon: "F" },
  poison: { name: "Poison", short: "P", color: "#A33EA1", icon: "P" },
  ground: { name: "Ground", short: "Gd", color: "#E2BF65", icon: "G" },
  flying: { name: "Flying", short: "Fl", color: "#A98FF3", icon: "F" },
  psychic: { name: "Psychic", short: "P", color: "#F95587", icon: "P" },
  bug: { name: "Bug", short: "B", color: "#A6B91A", icon: "B" },
  rock: { name: "Rock", short: "R", color: "#B6A136", icon: "R" },
  ghost: { name: "Ghost", short: "Gh", color: "#735797", icon: "G" },
  dragon: { name: "Dragon", short: "D", color: "#6F35FC", icon: "D" },
  dark: { name: "Dark", short: "D", color: "#705746", icon: "D" },
  steel: { name: "Steel", short: "S", color: "#B7B7CE", icon: "S" },
  fairy: { name: "Fairy", short: "Fa", color: "#D685AD", icon: "F" },
};

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

const SMOGON_SPECIES_OVERRIDES = {
  aegislash: "Aegislash-Shield",
  mimikyu: "Mimikyu-Disguised",
  minior: "Minior-Red-Meteor",
  toxtricity: "Toxtricity-Amped",
  urshifu: "Urshifu-Single-Strike",
  enamorus: "Enamorus-Incarnate",
  thundurus: "Thundurus-Incarnate",
  tornadus: "Tornadus-Incarnate",
  landorus: "Landorus-Incarnate",
  shaymin: "Shaymin-Land",
  "landorus-therian": "Landorus-Therian",
  "tornadus-incarnate": "Tornadus-Incarnate",
  "tornadus-therian": "Tornadus-Therian",
  "thundurus-incarnate": "Thundurus-Incarnate",
  "thundurus-therian": "Thundurus-Therian",
  "ogerpon-wellspring-mask": "Ogerpon-Wellspring",
  "ogerpon-hearthflame-mask": "Ogerpon-Hearthflame",
  "ogerpon-cornerstone-mask": "Ogerpon-Cornerstone",
  "ogerpon-teal-mask": "Ogerpon",
  "rotom-wash": "Rotom-Wash",
  "rotom-heat": "Rotom-Heat",
  "rotom-mow": "Rotom-Mow",
  "rotom-frost": "Rotom-Frost",
  "rotom-fan": "Rotom-Fan",
  "charizard-mega-y": "Charizard-Mega-Y",
  "charizard-mega-x": "Charizard-Mega-X",
  "tyranitar-mega": "Tyranitar-Mega",
  "gengar-mega": "Gengar-Mega",
  gengarmega: "Gengar-Mega",
  "aerodactyl-mega": "Aerodactyl-Mega",
  "dragonite-mega": "Dragonite-Mega",
  "froslass-mega": "Froslass-Mega",
  "floette-mega": "Floette-Mega",
  "meganium-mega": "Meganium-Mega",
  "starmie-mega": "Starmie-Mega",
  "indeedee-female": "Indeedee-F",
  "indeedee-male": "Indeedee",
  "urshifu-rapid-strike": "Urshifu-Rapid-Strike",
  "urshifu-single-strike": "Urshifu-Single-Strike",
  "basculegion-female": "Basculegion-F",
  "enamorus-incarnate": "Enamorus",
  "enamorus-therian": "Enamorus-Therian",
  "tauros-paldea-combat-breed": "Tauros-Paldea-Combat",
  "tauros-paldea-blaze-breed": "Tauros-Paldea-Blaze",
  "tauros-paldea-aqua-breed": "Tauros-Paldea-Aqua",
  "maushold-family-of-four": "Maushold",
  "maushold-family-of-three": "Maushold-Four",
};

const SUPPORT_MOVES = new Set([
  "Protect",
  "Tailwind",
  "Trick Room",
  "Encore",
  "Follow Me",
  "Rage Powder",
  "Helping Hand",
  "Wide Guard",
  "Quick Guard",
  "Parting Shot",
  "Snarl",
  "Taunt",
  "Thunder Wave",
  "Icy Wind",
  "Will-O-Wisp",
  "Spore",
  "Sleep Powder",
  "Rage Fist?",
  "Life Dew",
  "Recover",
  "Roost",
  "Synthesis",
  "Substitute",
  "Safeguard",
  "Detect",
  "Ally Switch",
  "Fake Tears",
  "Haze",
  "Rain Dance",
  "Sunny Day",
  "Sandstorm",
  "Coaching",
  "After You",
  "Helping Hand",
  "Perish Song",
  "Disable",
  "Light Screen",
  "Reflect",
  "Aurora Veil",
  "King's Shield",
  "Baneful Bunker",
]);

const MOVE_TYPE_FALLBACK = {
  "Fake Out": "normal",
  "Parting Shot": "dark",
  "Flare Blitz": "fire",
  "Knock Off": "dark",
  "Darkest Lariat": "dark",
  "Throat Chop": "dark",
  Moonblast: "fairy",
  Encore: "normal",
  "Heat Wave": "fire",
  "Earth Power": "ground",
  "Make It Rain": "steel",
  "Shadow Ball": "ghost",
  "Hydro Pump": "water",
  Thunderbolt: "electric",
  "Bleakwind Storm": "flying",
  Hurricane: "flying",
  Tailwind: "flying",
  "Trick Room": "psychic",
  "Expanding Force": "psychic",
  "Armor Cannon": "fire",
  "Meteor Mash": "steel",
  "Surging Strikes": "water",
  "Close Combat": "fighting",
  "Aqua Jet": "water",
  "Sucker Punch": "dark",
  "Extreme Speed": "normal",
  Protect: "normal",
  "Rage Powder": "bug",
  Spore: "grass",
  "Drain Punch": "fighting",
  "Wild Charge": "electric",
  "Heavy Slam": "steel",
  "Rock Slide": "rock",
  Earthquake: "ground",
  "Iron Head": "steel",
  "Play Rough": "fairy",
  "Aqua Tail": "water",
  Liquidation: "water",
  "Ivy Cudgel": "grass",
  "Ivy Cudgel-Wellspring": "water",
  "Ivy Cudgel-Hearthflame": "fire",
  "Ivy Cudgel-Cornerstone": "rock",
  "Power Whip": "grass",
  "Leaf Blade": "grass",
  "Wood Hammer": "grass",
  "Dragon Claw": "dragon",
  "Draco Meteor": "dragon",
  "Air Slash": "flying",
  "Heat Crash": "fire",
  "Flash Cannon": "steel",
  Overheat: "fire",
  "Volt Switch": "electric",
  Thunderclap: "electric",
  "Jet Punch": "water",
  "Shadow Sneak": "ghost",
  Hex: "ghost",
  "Pollen Puff": "bug",
  "Giga Drain": "grass",
  "Strength Sap": "grass",
  "Raging Bolt": "dragon",
  "Body Press": "fighting",
  "Foul Play": "dark",
  "Tera Blast": "normal",
};

const DEMO_SELF = [
  "arcanine-hisui",
  "azumarill",
  "kingambit",
  "farigiraf",
  "tyranitar",
  "excadrill-mega",
];
const DEMO_ENEMY = [
  "charizard-mega-y",
  "whimsicott",
  "farigiraf",
  "venusaur",
  "aegislash",
  "azumarill",
];

const MEGA_STONES = {
  meganiumite: "meganium-mega",
  starmieite: "starmie-mega",
  dragonitemite: "dragonite-mega",
  froslassite: "froslass-mega",
  floetteite: "floette-mega",
  venusaurite: "venusaur-mega",
  "charizardite x": "charizard-mega-x",
  "charizardite y": "charizard-mega-y",
  blastoisinite: "blastoise-mega",
  alakazite: "alakazam-mega",
  gengarite: "gengar-mega",
  kangaskhanite: "kangaskhan-mega",
  pinsirite: "pinsir-mega",
  gyaradosite: "gyarados-mega",
  aerodactylite: "aerodactyl-mega",
  "mewtwonite x": "mewtwo-mega-x",
  "mewtwonite y": "mewtwo-mega-y",
  ampharosite: "ampharos-mega",
  scizorite: "scizor-mega",
  heracronite: "heracross-mega",
  houndoominite: "houndoom-mega",
  tyranitarite: "tyranitar-mega",
  sceptilite: "sceptile-mega",
  blazikenite: "blaziken-mega",
  swampertite: "swampert-mega",
  gardevoirite: "gardevoir-mega",
  sablenite: "sableye-mega",
  mawilite: "mawile-mega",
  aggronite: "aggron-mega",
  medichamite: "medicham-mega",
  manectite: "manectric-mega",
  banettite: "banette-mega",
  absolite: "absol-mega",
  garchompite: "garchomp-mega",
  lucarionite: "lucario-mega",
  abomasite: "abomasnow-mega",
  latiasite: "latias-mega",
  latiosite: "latios-mega",
  rayquazite: "rayquaza-mega",
  galladite: "gallade-mega",
  audinite: "audino-mega",
  diancite: "diancie-mega",
  cameruptite: "camerupt-mega",
  glalitite: "glalie-mega",
  salamencite: "salamence-mega",
  metagrossite: "metagross-mega",
  altarianite: "altaria-mega",
  lopunnite: "lopunny-mega",
  pidgeotite: "pidgeot-mega",
  beedrillite: "beedrill-mega",
  slowbronite: "slowbro-mega",
  steelixite: "steelix-mega",
  sharpedonite: "sharpedo-mega",
};

function tickField(state) {
  const f = state.field;
  if (!f) return;

  const dec = (keyFlag, keyTurns) => {
    if (f[keyTurns] > 0) {
      f[keyTurns] -= 1;
      if (f[keyTurns] <= 0) {
        f[keyFlag] = false;
        f[keyTurns] = 0;
      }
    }
  };

  // Clima y terreno (si quieres que duren X turnos en vez de infinito)
  dec('weather', 'weatherTurns'); // opcional: si weatherTurns llega a 0, puedes setear weather = null
  dec('terrain', 'terrainTurns'); // idem

  // Trick Room
  if (f.trickRoomTurns > 0) {
    f.trickRoomTurns -= 1;
    if (f.trickRoomTurns <= 0) {
      f.trickRoom = false;
      f.trickRoomTurns = 0;
    }
  }

  // Tailwind
  dec('tailwindSelf', 'tailwindSelfTurns');
  dec('tailwindEnemy', 'tailwindEnemyTurns');

  // Pantallas / velos
  dec('reflectSelf', 'reflectSelfTurns');
  dec('lightScreenSelf', 'lightScreenSelfTurns');
  dec('auroraVeilSelf', 'auroraVeilSelfTurns');

  dec('reflectEnemy', 'reflectEnemyTurns');
  dec('lightScreenEnemy', 'lightScreenEnemyTurns');
  dec('auroraVeilEnemy', 'auroraVeilEnemyTurns');

  // Flags de turno: quick/wide guard y redirección se limpian cada turno
  f.quickGuardSelf = false;
  f.wideGuardSelf = false;
  f.redirectionSelf = null;

  f.quickGuardEnemy = false;
  f.wideGuardEnemy = false;
  f.redirectionEnemy = null;
}

const state = {
  self: Array(6).fill(null),
  enemy: Array(6).fill(null),
  modal: { side: "self", index: 0 },
  pokedex: [],
  cache: new Map(),
  loadingList: false,
  moveTypeCache: {},
  smogonRaw: null,
  metaIndex: new Map(),
  fallbackIndex: new Map(),
  metaRanked: [],
  rating: localStorage.getItem(RATING_STORAGE_KEY) || "1760",
  loadingMeta: false,
  field: {
    // Clima y terreno
    weather: null,
    weatherTurns: 0,
    terrain: null,
    terrainTurns: 0,

    // Rooms
    trickRoom: false,
    trickRoomTurns: 0,

    // Tailwind
    tailwindSelf: false,
    tailwindSelfTurns: 0,
    tailwindEnemy: false,
    tailwindEnemyTurns: 0,

    // Pantallas / velos lado self
    reflectSelf: false,
    reflectSelfTurns: 0,
    lightScreenSelf: false,
    lightScreenSelfTurns: 0,
    auroraVeilSelf: false,
    auroraVeilSelfTurns: 0,

    // Pantallas / velos lado enemy
    reflectEnemy: false,
    reflectEnemyTurns: 0,
    lightScreenEnemy: false,
    lightScreenEnemyTurns: 0,
    auroraVeilEnemy: false,
    auroraVeilEnemyTurns: 0,

    // Hazards
    hazards: {
      self: { rocks: false, spikes: 0, tspikes: 0, web: false },
      enemy: { rocks: false, spikes: 0, tspikes: 0, web: false },
    },

    // Flags de turno para guard/redirección
    quickGuardSelf: false,
    wideGuardSelf: false,
    redirectionSelf: null,   // p.ej. slug del mon que redirige, o true
    quickGuardEnemy: false,
    wideGuardEnemy: false,
    redirectionEnemy: null,
  },
  matrixMode: "offensive",
  matrixDetailMode: "detailed",
  matrixHelpOpen: false,
  leads: { self: [], enemy: [] },
  uiMode: 'quick',
  chosenFour: [],
  chosenEnemyFour: [],
  battleFocus: 'active',
  activeSelfSlots: [0, 1],
  activeEnemySlots: [0, 1],
  selectedMatrixCell: null,
  turn1Custom: false,
  battleSheet: { open: false, side: null, slotKey: null, cell: null },
};

const selfSlots = document.getElementById("selfSlots");
const enemySlots = document.getElementById("enemySlots");
const matrixContainer = document.getElementById("matrixContainer");
const matrixPlaceholder = document.getElementById("matrixPlaceholder");
const matrixStatus = document.getElementById("matrixStatus");
const threatList = document.getElementById("threatList");
const opportunityList = document.getElementById("opportunityList");
const strategyList = document.getElementById("strategyList");
const pickerModal = document.getElementById("pickerModal");
const searchInput = document.getElementById("searchInput");
const resultList = document.getElementById("resultList");
const searchHint = document.getElementById("searchHint");
const modalTitle = document.getElementById("modalTitle");
const ratingSelect = document.getElementById("ratingSelect");
const matrixSourceChip = document.getElementById("matrixSourceChip");
const metricMeta = document.getElementById("metricMeta");
const metaStatusText = document.getElementById("metaStatusText");

const i18nCache = {};

function getTranslation(name, category) {
  if (!name) return "";
  const cleanName = normalizeText(name);
  const key = `${category}:${cleanName}`;
  
  if (i18nCache[key]) return i18nCache[key];
  if (window.GameDB?.translations?.[key]) return window.GameDB.translations[key];
  
  return name;
}

const CUSTOM_TERMS = new Set([
  "megasol",
  "meganiumite",
  "dragonitemite",
  "starmieite",
  "froslassite",
  "floetteite",
  "meganium-mega",
  "starmie-mega",
  "dragonite-mega",
  "froslass-mega",
  "floette-mega",
]);

function isSupportMove(moveName) {
  const n = normalizeText(moveName);
  for (const sm of SUPPORT_MOVES) {
    if (normalizeText(sm) === n) return true;
  }
  return false;
}

function fetchTranslation(englishName, category) {
  const clean = normalizeText(englishName);
  const cacheKey = `${category}:${clean}`;
  
  if (window.GameDB?.translations?.[cacheKey]) {
    i18nCache[cacheKey] = window.GameDB.translations[cacheKey];
  }
}

function normalizeText(text) {
  if (!text) return "";
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatName(str) {
    if (!str) return '';
    // Separa palabras unidas por guiones o CamelCase, y capitaliza CADA palabra
    return str
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

const weatherNames = { 'sun': 'Sol', 'rain': 'Lluvia', 'sandstorm': 'Tormenta Arena', 'snow': 'Nieve', 'none': 'Despejado' };

function compactName(name = "") {
  const pretty = formatName(name);
  if (pretty.length <= 16) return pretty;
  const parts = pretty.split(" ");
  if (parts.length > 1)
    return (
      parts[0] +
      " " +
      parts
        .slice(1)
        .map((p) => p[0])
        .join(".") +
      "."
    );
  return pretty.slice(0, 15) + "…";
}

function slugFromSmogonName(name = "") {
  const n = normalizeText(name);
  if (SMOGON_SPECIES_OVERRIDES[n])
    return normalizeText(SMOGON_SPECIES_OVERRIDES[n]);
  if (n === "indeedee-f") return "indeedee-female";
  if (n === "indeedee") return "indeedee-male";
  if (n === "ogerpon-wellspring") return "ogerpon-wellspring-mask";
  if (n === "ogerpon-hearthflame") return "ogerpon-hearthflame-mask";
  if (n === "ogerpon-cornerstone") return "ogerpon-cornerstone-mask";
  if (n === "ogerpon") return "ogerpon-teal-mask";
  if (n === "maushold-four") return "maushold-family-of-four";
  if (n === "maushold-three") return "maushold-family-of-three";
  return n;
}

function displayFromSmogonName(name = "") {
  const n = normalizeText(name);
  return SMOGON_SPECIES_OVERRIDES[n] || name;
}

/** Slugs para https://pokeapi.co/api/v2/pokemon/{slug} (Smogon ≠ PokeAPI en muchas formas). */
const POKEAPI_SPECIES_SLUG = {
  palafin: "palafin-hero",
  basculegion: "basculegion-male",
  "basculegion-f": "basculegion-female",
  aegislash: "aegislash-shield",
  mimikyu: "mimikyu-disguised",
  morpeko: "morpeko-full-belly",
  lycanroc: "lycanroc-midday",
  gourgeist: "gourgeist-average",
  meowstic: "meowstic-male",
  maushold: "maushold-family-of-three",
  "meowstic-m-mega": "meowstic-mega",
  "meowstic-f-mega": "meowstic-mega",
  dudunsparce: "dudunsparce-two-segment",
  "ogerpon-wellspring": "ogerpon-wellspring-mask",
  "ogerpon-hearthflame": "ogerpon-hearthflame-mask",
  "ogerpon-cornerstone": "ogerpon-cornerstone-mask",
  "urshifu": "urshifu-single-strike",
};

function pokeapiPokemonSlug(normalizedKey) {
  const mapped = POKEAPI_SPECIES_SLUG[normalizedKey];
  if (mapped) return mapped;
  if (/^tauros-paldea-(combat|blaze|aqua)$/.test(normalizedKey)) {
    return `${normalizedKey}-breed`;
  }
  return normalizedKey;
}

function homeSpriteFromPokemon(data) {
  return (
    data?.sprites?.other?.home?.front_default ||
    data?.sprites?.other?.["official-artwork"]?.front_default ||
    data?.sprites?.front_default ||
    ""
  );
}

function hexToRgba(hex, alpha = 0.25) {
  if (!hex) return `rgba(255,255,255,${alpha})`;
  let c = hex.replace("#", "");
  if (c.length === 3)
    c = c
      .split("")
      .map((x) => x + x)
      .join("");
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getContrastColor(hexcolor) {
  if (!hexcolor) return 'white';
  let hex = hexcolor.replace('#', '');
  if (hex.length === 3) {
      hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  }
  const r = parseInt(hex.substr(0,2), 16);
  const g = parseInt(hex.substr(2,2), 16);
  const b = parseInt(hex.substr(4,2), 16);
  const yiq = ((r*299)+(g*587)+(b*114))/1000;
  return (yiq >= 128) ? 'black' : 'white';
}

function typeDot(type) {
  const meta = TYPE_META[type] || { color: "#8aa2c6", name: type };
  const iconUrl = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/${type.toLowerCase()}.svg`;
  const iconColor = getContrastColor(meta.color);
  return `<div class="type-icon-circle" style="background-color: ${meta.color};" title="Tipo: ${meta.name}">
            <div class="type-svg-mask" style="mask-image: url('${iconUrl}'); -webkit-mask-image: url('${iconUrl}'); background-color: ${iconColor};"></div>
          </div>`;
}

function typeChip(type) {
  const meta = TYPE_META[type] || { name: type, color: "#8aa2c6", icon: "•" };
  return `<span class="type-chip-mini" style="background:${hexToRgba(meta.color, 0.18)};border-color:${hexToRgba(meta.color, 0.36)}">${meta.icon} ${meta.name}</span>`;
}

function effectiveness(attackType, defendTypes = []) {
  return defendTypes.reduce((acc, t) => {
    const key = String(t).toLowerCase();
    const table = TYPE_CHART[String(attackType).toLowerCase()] || {};
    return acc * (table[key] ?? 1);
  }, 1);
}

function fmtMult(mult) {
  if (mult === 0) return "×0";
  if (mult === 0.25) return "×.25";
  if (mult === 0.5) return "×.5";
  if (mult === 1) return "×1";
  if (mult === 2) return "×2";
  if (mult === 4) return "×4";
  // FIX: Formateo seguro para modificadores de clima/terreno
  return `×${Number(mult.toFixed(2))}`;
}

function effClass(mult) {
  if (mult === 4) return "eff-4";
  if (mult === 2) return "eff-2";
  if (mult === 1) return "eff-1";
  if (mult === 0.5) return "eff-05";
  if (mult === 0.25) return "eff-025";
  if (mult === 0) return "eff-0";
  return "eff-1";
}

function topEntries(obj = {}, limit = 4) {
  return Object.entries(obj || {})
    .filter(([, v]) => typeof v === "number" && isFinite(v))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

function topKey(obj = {}, fallback = "") {
  return topEntries(obj, 1)[0]?.key || fallback;
}

function parseSpread(spreadKey = "") {
  const [naturePart, evPart = ""] = String(spreadKey).split(":");
  const values = evPart.split("/").map((x) => Number(x || 0));
  return {
    nature: naturePart || null,
    evs: {
      hp: values[0] || 0,
      atk: values[1] || 0,
      def: values[2] || 0,
      spa: values[3] || 0,
      spd: values[4] || 0,
      spe: values[5] || 0,
    },
  };
}

function getNatureSpeModifier(nature) {
  if (["Timid", "Hasty", "Jolly", "Naive"].includes(nature)) return 1.1;
  if (["Brave", "Relaxed", "Quiet", "Sassy"].includes(nature)) return 0.9;
  return 1;
}

function getSpeedModifier(field, side, ability, item) {
  let modifier = 1;
  if ((side === "self" && field.tailwindSelf) || (side === "enemy" && field.tailwindEnemy)) {
    modifier *= 2;
  }
  if (field.weather === "rain" && ability === "Swift Swim") modifier *= 2;
  if (field.weather === "sun" && ability === "Chlorophyll") modifier *= 2;
  if (field.weather === "sand" && ability === "Sand Rush") modifier *= 2;
  if (item === "Choice Scarf") modifier *= 1.5;
  if (item === "Iron Ball") modifier *= 0.5;
  return modifier;
}

function logSpeedCalc(mon, side, baseSpe, evsSpe, nature, modifier, trickRoom, finalSpe) {
  if (!DEBUG_MODE) return;
  /* console.groupCollapsed(`🚀 [SPEED CALC] ${mon.name} (${side})`);
  console.log(`📊 Stats -> Base: ${baseSpe} | EVs: ${evsSpe} | Naturaleza: ${nature}`);
  console.log(`⚙️ Modificadores -> Multiplicador Final: x${modifier} | Trick Room: ${trickRoom ? 'SÍ' : 'NO'}`);
  console.log(`🏁 Velocidad Efectiva: ${trickRoom ? -finalSpe : finalSpe}`);
  console.groupEnd(); */
}

// CORE ENGINE: calcula la velocidad efectiva de un mon (Tailwind/TR/registry).
// CORE ENGINE: calcula la velocidad efectiva de un mon (Tailwind/TR/registry).
function calculateSpeed(mon, side, currentField = state.field) {
  if (!mon) return 0;

  // 1. Crear una clave de caché robusta basada en las condiciones
  const weatherKey = currentField?.weather || 'none';
  const trKey = currentField?.trickRoom ? 'tr' : 'notr';
  const tailwindKey = (side === "self" && currentField?.tailwindSelf) || (side === "enemy" && currentField?.tailwindEnemy) ? 'tw' : 'notw';
  
  const cacheKey = `${mon.name}-${weatherKey}-${trKey}-${tailwindKey}`;

  window.comboSpeedCache = window.comboSpeedCache || {};
  if (window.comboSpeedCache[cacheKey] !== undefined) {
      return window.comboSpeedCache[cacheKey];
  }

  const baseSpe = mon.baseStats?.speed || 100;
  const evsSpe = mon.set?.evs?.spe || 0;
  const nature = mon.set?.nature || "";

  // Level 50 stat calculation
  let spe = Math.floor(((2 * baseSpe + 31 + Math.floor(evsSpe / 4)) * 50) / 100) + 5;
  spe = Math.floor(spe * getNatureSpeModifier(nature));

  let mod = 1;

  if ((side === "self" && currentField.tailwindSelf) || (side === "enemy" && currentField.tailwindEnemy)) {
    mod *= 2;
  }

  const ability = (mon.set?.ability || mon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
  const item = (mon.set?.item || mon.item || '').toLowerCase().replace(/[^a-z]/g, '');
  const weatherStr = (currentField?.weather || state.field?.weather || '').toLowerCase();

  let trigger = '';

  if (weatherStr.includes('sun') && ability.includes('chlorophyll')) { mod *= 2; trigger = '☀️ Clorofila'; }
  if (weatherStr.includes('rain') && ability.includes('swiftswim')) { mod *= 2; trigger = '🌧️ Nado Rápido'; }
  if (weatherStr.includes('sand') && ability.includes('sandrush')) { mod *= 2; trigger = '🏜️ Ímpetu Arena'; }
  if (weatherStr.includes('snow') && ability.includes('slushrush')) { mod *= 2; trigger = '❄️ Quitanieves'; }
  if (weatherStr.includes('hail') && ability.includes('slushrush')) { mod *= 2; trigger = '❄️ Quitanieves'; }

  if (item === 'choicescarf') { mod *= 1.5; trigger = '🧣 Pañuelo Elección'; }
  if (item === 'ironball') { mod *= 0.5; trigger = '🪨 Bola Férrea'; }

  if (window.EffectsRegistryBridge) {
    const regSpeed = window.EffectsRegistryBridge.resolveSpeedModifiers(mon, {
      side,
      holder: mon,
      field: currentField
    });
    mod *= regSpeed.modifiers.speed;
  }

  const finalSpe = Math.floor(spe * mod);

  smartLog(
      `spd-${cacheKey}`,
      `🏎️ [SPEED] ${mon.displayName || mon.name} | Base: ${baseSpe} | Mod: x${mod} ${trigger ? '('+trigger+')' : ''} | FINAL: ${finalSpe}`
  );

  const result = currentField.trickRoom ? -finalSpe : finalSpe;
  
  // 2. Guardar en caché antes de salir
  window.comboSpeedCache[cacheKey] = result;
  return result;
}
const NATURE_PAIR = {
  Adamant: ["atk", "spa"],
  Bold: ["def", "atk"],
  Brave: ["atk", "spe"],
  Calm: ["spd", "atk"],
  Careful: ["spd", "spa"],
  Hasty: ["spe", "def"],
  Impish: ["def", "spa"],
  Jolly: ["spe", "spa"],
  Lonely: ["atk", "def"],
  Mild: ["spa", "def"],
  Modest: ["spa", "atk"],
  Naive: ["spe", "spd"],
  Naughty: ["atk", "spd"],
  Quiet: ["spa", "spe"],
  Rash: ["spa", "spd"],
  Relaxed: ["def", "spe"],
  Sassy: ["spd", "spe"],
  Timid: ["spe", "atk"],
  Gentle: ["spd", "def"],
  Lax: ["def", "spd"],
};

function natureMod(nature, stat) {
  const p = NATURE_PAIR[nature];
  if (!p) return 1;
  if (p[0] === stat) return 1.1;
  if (p[1] === stat) return 0.9;
  return 1;
}

function getBaseStatRaw(mon, apiName) {
  const fallbackKeys = {
    "attack": "atk",
    "defense": "def",
    "special-attack": "spa",
    "special-defense": "spd",
    "speed": "spe",
    "hp": "hp"
  };
  
  // Intenta con el nombre de la API
  const val = mon?.baseStats?.[apiName];
  if (val !== undefined && val !== null) return val;
  
  // Intenta con el nombre de Smogon
  const fallbackVal = mon?.baseStats?.[fallbackKeys[apiName]];
  if (fallbackVal !== undefined && fallbackVal !== null) return fallbackVal;
  
  if (DEBUG_MODE) console.warn(`⚠️ Faltan stats para ${mon?.name}. Se usa 80 por defecto para evitar crashes.`);
  return 80; // Nunca devuelvas 0 en stats para no romper la división
}

function calcMonHP(mon) {
  const b = getBaseStatRaw(mon, "hp");
  const ev = mon.set?.evs?.hp || 0;
  return Math.floor(((2 * b + 31 + Math.floor(ev / 4)) * 50) / 100) + 60;
}

// stage: entero de -6 a +6
function stageMultiplier(stage) {
  // Fórmula estándar de Showdown
  if (!Number.isFinite(stage) || stage === 0) return 1;
  if (stage > 0) {
    return (2 + stage) / 2;
  }
  // stage < 0
  return 2 / (2 - stage);
}

function calcOtherStatLv50(base, ev, natureMultiplier, stage = 0) {
  const evSafe = Number(ev || 0);
  const inner =
    Math.floor(((2 * base + 31 + Math.floor(evSafe / 4)) * 50) / 100) + 5;

  const staged = inner * stageMultiplier(stage);
  return Math.floor(staged * natureMultiplier);
}

const PRIORITY_MOVES = new Set([
  "Fake Out",
  "Extreme Speed",
  "Quick Attack",
  "Mach Punch",
  "Bullet Punch",
  "Aqua Jet",
  "Ice Shard",
  "Shadow Sneak",
  "Sucker Punch",
  "Vacuum Wave",
  "Upper Hand",
  "Jet Punch",
  "Accelerock",
  "Water Shuriken",
  "Feint",
  "Follow Me",
  "Rage Powder",
  "Wide Guard",
  "Quick Guard",
  "Protect",
  "Detect",
  "Helping Hand",
]);

// Movimientos típicos de spread en dobles
const SPREAD_MOVES = new Set([
  'Rock Slide',
  'Heat Wave',
  'Earthquake',
  'Snarl',
  'Dazzling Gleam',
  'Make It Rain',
  'Bleakwind Storm',
  'Hurricane', // según formato, ajústalo
  // añade aquí los que uses más en Champions OU
]);

// Multi-hits garantizados (aprox. corto plazo)
const GUARANTEED_MULTI_HITS = {
  'Surging Strikes': 3,
  'Triple Axel': 3, // ojo, técnicamente puede fallar hits posteriores
  'Dual Chop': 2,
  'Population Bomb': 10, // placeholder, a ajustar cuando uses PokeAPI
};

function calculateEffectiveStats(attacker, defender, dmgClass) {
  const natA = attacker.set?.nature || "";
  const natD = defender.set?.nature || "";
  const evA = attacker.set?.evs || {};
  const evD = defender.set?.evs || {};
  const stagesA = attacker.battle?.stages || {};
  const stagesD = defender.battle?.stages || {};

  if (dmgClass === "physical") {
    return {
      atkS: calcOtherStatLv50(getBaseStatRaw(attacker, "attack"), evA.atk, natureMod(natA, "atk"), stagesA.atk || 0),
      defS: calcOtherStatLv50(getBaseStatRaw(defender, "defense"), evD.def, natureMod(natD, "def"), stagesD.def || 0)
    };
  }
  return {
    atkS: calcOtherStatLv50(getBaseStatRaw(attacker, "special-attack"), evA.spa, natureMod(natA, "spa"), stagesA.spa || 0),
    defS: calcOtherStatLv50(getBaseStatRaw(defender, "special-defense"), evD.spd, natureMod(natD, "spd"), stagesD.spd || 0)
  };
}

function getWeatherAndTerrainMultipliers(field, candType, candMove) {
  let wMul = 1;
  const w = field.weather;
  if (w === "sun") {
    if (candType === "fire") wMul *= 1.5;
    if (candType === "water") wMul *= 0.5;
  } else if (w === "rain") {
    if (candType === "water") wMul *= 1.5;
    if (candType === "fire") wMul *= 0.5;
  }

  let terrMul = 1;
  if (field.terrain === "electric" && candType === "electric") terrMul *= 1.3;
  if (field.terrain === "grassy" && candMove === "Earthquake") terrMul *= 0.5;

  return { wMul, terrMul };
}

function applyRegistryDamageModifiers(attacker, defender, cand, fieldSnapshot, eff, dmgClass, stats) {
  let registry = null;
  let registryDamageMul = 1;
  let blockedByRegistry = false;
  let { atkS, defS } = stats;

  if (!window.EffectsRegistryBridge) {
    return { registry, registryDamageMul, blockedByRegistry, atkS, defS };
  }

  try {
    registry = window.EffectsRegistryBridge.resolveDamageModifiers(
      attacker, defender, cand, { field: fieldSnapshot, effectiveness: eff }
    );

    if (registry?.final) {
      if (Number.isFinite(registry.final.damageMultiplier)) registryDamageMul *= registry.final.damageMultiplier;
      if (Number.isFinite(registry.final.attackMultiplier) && dmgClass === 'physical') atkS = Math.floor(atkS * registry.final.attackMultiplier);
      if (Number.isFinite(registry.final.specialAttackMultiplier) && dmgClass === 'special') atkS = Math.floor(atkS * registry.final.specialAttackMultiplier);
      if (Number.isFinite(registry.final.specialDefenseMultiplier) && dmgClass === 'special') defS = Math.max(1, Math.floor(defS * registry.final.specialDefenseMultiplier));

      const prev = registry.prevention?.final || {};
      if (prev.immune || prev.blockedByPriority || prev.blockedByStatus || prev.blockedBySecondaryShield) {
        blockedByRegistry = true;
      }
    }
  } catch (e) {
    console.warn('[DEBUG] resolveDamageModifiers error', e);
  }

  return { registry, registryDamageMul, blockedByRegistry, atkS, defS };
}

function calculateDamageRolls(baseTotal) {
  const rolls = [];
  for (let i = 0; i < 16; i++) {
    rolls.push(Math.floor(baseTotal * (0.85 + (i / 15) * 0.15)));
  }
  return { maxDamage: Math.max(...rolls), minDamage: Math.min(...rolls), critDamage: Math.floor(baseTotal * 1.5) };
}

function logDamageCalcInfo(attacker, defender, cand, dmgClass, atkS, defSafe, eff, wMul, terrMul, registryDamageMul, isSpread, hits, minDamage, maxDamage) {
  if (!DEBUG_MODE) return;
  const atkStatRaw = getBaseStatRaw(attacker, dmgClass === 'physical' ? 'attack' : 'special-attack');
  const defStatRaw = getBaseStatRaw(defender, dmgClass === 'physical' ? 'defense' : 'special-defense');
  const stab = (attacker.types || []).includes(cand.type) ? 1.5 : 1;

  /* console.groupCollapsed(`⚔️ [DAMAGE CALC] ${attacker.name} usa ${cand.move} vs ${defender.name}`);
  console.log(`🔹 Movimiento -> Poder Base: ${cand.power || 0} | Tipo: ${cand.type} | Clase: ${dmgClass.toUpperCase()}`);
  console.log(`🔹 Stats Base Brutos -> Atk/SpA Base: ${atkStatRaw} | Def/SpD Base: ${defStatRaw}`);
  console.log(`🔹 Stats Reales (Nv50+EVs) -> Atacante: ${atkS} | Defensor: ${defSafe}`);
  console.log(`🔹 Multiplicadores -> STAB: ${stab} | Eficacia: x${eff} | Clima: x${wMul} | Terreno: x${terrMul} | Registro: x${registryDamageMul}`);
  console.log(`🔹 Golpes Múltiples: ${hits} | Penalización por Spread: ${isSpread ? 'SÍ (x0.75)' : 'NO'}`);
  console.log(`🏁 Rango de Daño Resultante: ${minDamage} - ${maxDamage} HP`);
  console.groupEnd(); */
}

// CORE ENGINE: calcula el daño base de un movimiento entre dos mons.
function estimateMoveDamage(attacker, defender, cand, field) {
  if (!attacker || !defender || !cand) return { damage: 0, minDamage: 0, maxDamage: 0 };

  window.currentDamageCache = window.currentDamageCache || {};
  const moveNameStr = typeof cand === 'string' ? cand : (cand.move || cand.name || 'unknown');
  const cacheKey = `${attacker.name}-${defender.name}-${moveNameStr}-${field?.weather || 'none'}`;

  // SHORT-CIRCUIT: Salir inmediatamente, cero logs, cero lag
  if (window.currentDamageCache[cacheKey]) {
      return window.currentDamageCache[cacheKey];
  }

  let basePower = cand.power || 0;
  const info = state.moveTypeCache[cand.move];
  const dmgClass = cand.damageClass || info?.damageClass || "physical";
  
  if (basePower <= 0 || dmgClass === "status") {
      const res = { damage: 0, minDamage: 0, maxDamage: 0, blocked: false };
      window.currentDamageCache[cacheKey] = res;
      return res;
  }

  const moveName = cand.move || '';
  const isSpread = !!cand.isSpread || SPREAD_MOVES.has(moveName.toLowerCase());
  const hits = cand.hits || GUARANTEED_MULTI_HITS[moveName] || 1;

  let moveType = cand.type;

  // Lógica de Weather Ball protegida
  const moveId = moveName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (moveId === 'weatherball' && field.weather) {
      basePower = 100;
      if (field.weather === 'sun') moveType = 'fire';
      else if (field.weather === 'rain') moveType = 'water';
      else if (field.weather === 'sand' || field.weather === 'sandstorm') moveType = 'rock';
      else if (field.weather === 'snow' || field.weather === 'hail') moveType = 'ice';
  }

  const eff = effectiveness(moveType, defender.types || []);
  let { wMul, terrMul } = getWeatherAndTerrainMultipliers(field, moveType, moveName);

  // Modificadores de clima reales
  if (field.weather === 'sun') {
      if (moveType.toLowerCase() === 'fire') wMul = 1.5;
      else if (moveType.toLowerCase() === 'water') wMul = 0.5;
  } else if (field.weather === 'rain') {
      if (moveType.toLowerCase() === 'water') wMul = 1.5;
      else if (moveType.toLowerCase() === 'fire') wMul = 0.5;
  }

  let { atkS: atkStat, defS: defStat } = calculateEffectiveStats(attacker, defender, dmgClass);

  const getStageMul = (stage) => {
      if (!stage) return 1;
      return stage > 0 ? (2 + stage) / 2 : 2 / (2 - stage);
  };

  // Aplicar stages si el Pokémon está en el campo activo (tiene objeto battle)
  if (attacker.battle?.stages) {
      const atkKey = dmgClass === 'physical' ? 'atk' : 'spa';
      atkStat = Math.floor(atkStat * getStageMul(attacker.battle.stages[atkKey]));
  }
  if (defender.battle?.stages) {
      const defKey = dmgClass === 'physical' ? 'def' : 'spd';
      defStat = Math.floor(defStat * getStageMul(defender.battle.stages[defKey]));
  }

  // Habilidades ofensivas (Huge Power) sanitizadas
  const attackerAbility = (attacker.set?.ability || attacker.ability || '').toLowerCase().replace(/\s/g, '');
  if ((attackerAbility === 'hugepower' || attackerAbility === 'purepower') && dmgClass === 'physical') {
      atkStat *= 2; 
  }

  // Objetos defensivos sanitizados
  const defenderItem = (defender.set?.item || '').toLowerCase().replace(/\s/g, '');
  if (defenderItem === 'eviolite') {
      defStat *= 1.5;
  } else if (defenderItem === 'assaultvest' && dmgClass === 'special') {
      defStat *= 1.5;
  }

  const fieldSnapshot = window.EffectsRegistryBridge
    ? window.EffectsRegistryBridge.createCurrentFieldSnapshot(state)
    : field;

  const regResult = applyRegistryDamageModifiers(attacker, defender, { ...cand, type: moveType, power: basePower }, fieldSnapshot, eff, dmgClass, { atkS: atkStat, defS: defStat });
  atkStat = regResult.atkS;
  defStat = regResult.defS;

  const stab = (attacker.types || []).some(t => t.toLowerCase() === moveType.toLowerCase()) ? 1.5 : 1;
  const defSafe = Math.max(1, defStat);

  const blocked = (field.terrain === 'psychic' && PRIORITY_MOVES.has(moveName)) || regResult.blockedByRegistry;

  if (blocked) {
    const res = { damage: 0, minDamage: 0, maxDamage: 0, blocked: true, wMul, terrMul, registry: regResult.registry };
    window.currentDamageCache[cacheKey] = res;
    return res;
  }

  let basePerHit = (((((22 * basePower * atkStat) / defSafe) / 50) + 2) * stab * eff * wMul * terrMul * regResult.registryDamageMul);
  if (isSpread) basePerHit *= 0.75;

  // Habilidad defensiva: Fur Coat
  const defenderAbility = (defender.set?.ability || '').toLowerCase().replace(/\s/g, '');
  if (defenderAbility === 'furcoat' && dmgClass === 'physical') {
      basePerHit *= 0.5;
  }

  const { maxDamage, minDamage, critDamage } = calculateDamageRolls(basePerHit * hits);

  // NUEVO LOG INTELIGENTE (Justo antes de guardar en caché y hacer return)
  const atkStage = attacker.battle?.stages?.atk || 0;
  const defStage = defender.battle?.stages?.def || 0;
  
  const tags = [];
  if (wMul > 1 && field.weather === 'sun') tags.push("🔥 Sol x1.5");
  if (wMul > 1 && (field.weather === 'rain' || field.weather === 'rainstorm')) tags.push("💧 Lluvia x1.5");
  if (wMul < 1 && field.weather === 'sun') tags.push("🔥 Sol x0.5");
  if (wMul < 1 && (field.weather === 'rain' || field.weather === 'rainstorm')) tags.push("💧 Lluvia x0.5");
  if (stab > 1) tags.push("⚔️ STAB");
  if (isSpread) tags.push("📉 Spread x0.75");
  if (atkStage < 0) tags.push("🛡️ Intimidado x0.66");

  smartLog(
      `dmg-${cacheKey}`, 
      `💥 [DAMAGE] ${attacker.name} [Atk: ${atkStat} (Stage:${atkStage})] usa ${moveNameStr} vs ${defender.name} [Def: ${defStat} (Stage:${defStage})] | BP: ${basePower} | Modificadores: Clima(${wMul || 1}), Spread(${isSpread ? '0.75' : '1'}) | Rango: ${minDamage} - ${maxDamage}`
  );

  const finalResult = {
    damage: maxDamage,
    minDamage,
    maxDamage,
    critDamage,
    blocked: false,
    wMul,
    terrMul,
    registry: regResult.registry,
    tags
  };

  // 3. GUARDAR EN LA CACHÉ ANTES DE SALIR
  window.currentDamageCache[cacheKey] = finalResult;
  return finalResult;
}

function serializeSetSummary(set) {
  if (!set) return [];
  const lines = [];
  if (set.ability) lines.push(`Hab: ${set.ability}`);
  if (set.item) lines.push(`Obj: ${set.item}`);
  if (set.nature) lines.push(`Nat: ${set.nature}`);
  if (set.evs && typeof set.evs === "object") {
    const evOrder = ["hp", "atk", "def", "spa", "spd", "spe"];
    const activeEVs = evOrder
      .filter((k) => Number(set.evs[k]) > 0)
      .map((k) => `${set.evs[k]} ${k.toUpperCase()}`);
    if (activeEVs.length) lines.push(activeEVs.join(" / "));
  }
  return lines;
}

function getCacheKey(rating) {
  return `${CACHE_KEY_PREFIX}${rating}`;
}

function buildMetaIndex(json) {
  const rawData = json?.data || json?.Data || {};
  state.metaIndex = new Map();
  state.metaRanked = [];

  const ranked = Object.entries(rawData)
    .map(([name, entry], idx) => {
      const rawCount =
        Number(
          entry?.["Raw count"] ??
            entry?.raw ??
            entry?.usage ??
            entry?.count ??
            0,
        ) || 0;
      const slug = slugFromSmogonName(name);
      const displayName = displayFromSmogonName(name);
      const usage = rawCount;
      const record = {
        key: name,
        slug,
        displayName,
        entry: entry || {},
        usage,
        rankSeed: idx,
      };
      return record;
    })
    .sort((a, b) => {
      if (b.usage !== a.usage) return b.usage - a.usage;
      return a.rankSeed - b.rankSeed;
    });

  ranked.forEach((record, idx) => {
    record.rank = idx + 1;
    state.metaIndex.set(record.slug, record);
  });

  state.metaRanked = ranked;
}

function buildFallbackIndex(jsonArray) {
  state.fallbackIndex = new Map();
  if (!Array.isArray(jsonArray) || jsonArray.length === 0) return;

  // Iteramos en orden inverso para que los JSON de mayor prioridad (los primeros del array)
  // sobreescriban los datos de menor prioridad.
  const reversed = [...jsonArray].reverse();

  for (const json of reversed) {
    const rawData = json?.data || json?.Data || {};
    Object.entries(rawData).forEach(([name, entry], idx) => {
      const slug = slugFromSmogonName(name);
      const displayName = displayFromSmogonName(name);
      const usage = Number(entry?.["Raw count"] ?? entry?.raw ?? entry?.usage ?? entry?.count ?? 0) || 0;
      state.fallbackIndex.set(slug, {
        key: name,
        slug,
        displayName,
        entry: entry || {},
        usage,
        rankSeed: idx,
      });
    });
  }
}

function getMetaRecord(speciesId) {
  if (!speciesId) return null;
  const slug = normalizeText(speciesId);
  
  // 1. Coincidencia directa
  if (state.metaIndex.has(slug)) return state.metaIndex.get(slug);
  if (state.fallbackIndex.has(slug)) return state.fallbackIndex.get(slug);

  // 2. Búsqueda inversa para mapeos de PokeAPI (ej: 'palafin-hero' -> 'palafin')
  for (const [smogonKey, apiKey] of Object.entries(POKEAPI_SPECIES_SLUG)) {
    if (slug === apiKey) {
      if (state.metaIndex.has(smogonKey)) return state.metaIndex.get(smogonKey);
      if (state.fallbackIndex.has(smogonKey)) return state.fallbackIndex.get(smogonKey);
    }
  }

  // 3. Override directo hacia Smogon (ej: 'urshifu' -> 'urshifu-single-strike')
  const smogonOverride = slugFromSmogonName(slug);
  if (smogonOverride !== slug) {
    if (state.metaIndex.has(smogonOverride)) return state.metaIndex.get(smogonOverride);
    if (state.fallbackIndex.has(smogonOverride)) return state.fallbackIndex.get(smogonOverride);
  }

  // 4. Búsqueda agresiva ignorando guiones (ej: 'ironhands' -> 'iron-hands')
  const slugNoDash = slug.replace(/-/g, "");
  for (const [key, record] of state.metaIndex.entries()) {
    if (key.replace(/-/g, "") === slugNoDash) return record;
  }
  for (const [key, record] of state.fallbackIndex.entries()) {
    if (key.replace(/-/g, "") === slugNoDash) return record;
  }

  return null;
}

function chooseBestItem(itemEntries, side, ignoreIndex = -1, speciesId = "") {
  // Force mega stone if species is a mega
  const entryPair = Object.entries(MEGA_STONES).find(
    ([, megaId]) => megaId === speciesId,
  );
  if (entryPair) {
    return formatName(entryPair[0]);
  }

  const usedItems = new Set(
    state[side]
      .map((mon, idx) => (idx === ignoreIndex ? null : mon?.set?.item))
      .filter(Boolean)
      .map(i => normalizeText(i))
  );
  const sorted = topEntries(itemEntries, 8).map((x) => formatName(normalizeText(x.key)));
  const free = sorted.find((item) => !usedItems.has(normalizeText(item)));
  return free || sorted[0] || "";
}

function buildDefaultSetForSpecies(speciesId, side = "self", slotIndex = -1) {
  const record = getMetaRecord(speciesId);
  const entry = record?.entry || null;

  

  if (!entry) {
    return {
      source: "fallback",
      rating: state.rating,
      ability: "",
      item: chooseBestItem({}, side, slotIndex, speciesId),
      nature: "",
      evs: null,
      moves: [],
      teammates: [],
    };
  }

  const formatSmogonStr = (str, cat) => formatName(normalizeText(str));

  const abilities = topEntries(entry.Abilities || {}, 3).map(x => ({...x, key: formatSmogonStr(x.key, 'ability')}));
  const items = topEntries(entry.Items || {}, 6).map(x => ({...x, key: formatSmogonStr(x.key, 'item')}));
  const moves = topEntries(entry.Moves || {}, 8)
    .map((x) => formatSmogonStr(x.key, "move"))
    .filter(Boolean)
    .filter((move) => !normalizeText(move).includes("nothing"))
    .slice(0, 4);

  const spreads = topEntries(entry.Spreads || entry["Spreads"] || {}, 3);
  const spread = parseSpread(spreads[0]?.key || "");
  const teammates = topEntries(entry.Teammates || {}, 6).map((x) =>
    slugFromSmogonName(x.key),
  );

  const mon = {
    source: "smogon-chaos",
    rating: state.rating,
    ability: abilities[0]?.key || "",
    item: chooseBestItem(entry.Items || {}, side, slotIndex, speciesId),
    nature: spread.nature || "",
    evs: spread.evs || null,
    moves,
    teammates,
    raw: {
      abilities,
      items,
      spreads,
      moves: topEntries(entry.Moves || {}, 8).map(x => ({...x, key: formatSmogonStr(x.key, 'move')})),
      teammates: topEntries(entry.Teammates || {}, 6),
    },
  };

  ensureBattleState(mon);
  return mon;
}

function ensureBattleState(mon) {
  if (!mon) return mon;
  if (!mon.battle) {
    mon.battle = {
      // HP en porcentaje relativo al máximo calculado por calcMonHP
      hpPct: 100,
      // Stages de stats, al estilo Showdown (-6..+6)
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      // Estado principal: 'brn', 'par', 'slp', 'psn', 'tox', 'frz', etc.
      status: null,
      // Nombre del movimiento bloqueado por Choice
      choiceLocked: null,
      // Flag de si el Sash sigue intacto
      sashIntact: mon.set?.item === 'Focus Sash',
      // Contadores especiales (ej. Rage Fist, Anger Shell, etc.)
      boostStacks: {
        rageFist: 0,
      },
    };
  }
  return mon;
}

async function fetchPokemon(name) {
  const key = normalizeText(name);
  if (CUSTOM_TERMS.has(key)) {
    // Fallback para Pokémon custom del formato sin API
    return {
      name: key,
      displayName: formatName(name),
      sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png",
      types: ["normal"],
      baseStats: {
        "hp": 100, "attack": 100, "defense": 100,
        "special-attack": 100, "special-defense": 100, "speed": 100
      },
        set: buildDefaultSetForSpecies(key, "self", -1, ["normal"]),
    };
  }
  if (state.cache.has(key)) {
    const cloned = structuredClone(state.cache.get(key));
      cloned.set = buildDefaultSetForSpecies(key, "self", -1, cloned.types);
      ensureBattleState(cloned);
    return cloned;
  }
  
  if (!window.GameDB) return null;
  
  const dbData = window.GameDB.pokedex[key];
  if (!dbData) {
    console.warn(`[DEBUG] Pokémon no encontrado o ignorado por Smogon: ${name}`);
    const fallback = {
      id: 0, 
      name: key, 
      displayName: name, 
      sprite: '',
      types: ['normal'],
      baseStats: { hp: 100, attack: 100, defense: 100, "special-attack": 100, "special-defense": 100, speed: 100 },
      metaRank: null, 
      usage: 0
    };
    fallback.set = buildDefaultSetForSpecies(key, "self", -1, fallback.types);
    ensureBattleState(fallback);
    return fallback;
  }

  const record = getMetaRecord(key);

  const mon = {
    id: dbData.id,
    name: key,
    displayName: dbData.displayName,
    sprite: dbData.sprite,
    types: dbData.types,
    baseStats: dbData.baseStats,
    metaRank: record?.rank || null,
    usage: record?.usage || 0,
  };

  state.cache.set(key, structuredClone(mon));

  mon.set = buildDefaultSetForSpecies(key, "self", -1, mon.types);
  ensureBattleState(mon);
  scheduleMoveWarmup();
  return structuredClone(mon);
}

function ensureAbilityRegistry(abilityName) {
  if (!window.EffectsRegistryBridge || !abilityName) return;
  const slug = normalizeText(abilityName);
  if (window.EffectsRegistryBridge.getAbilityEntry(slug)) return;

  let entry = null;

  switch (slug) {
    case 'intimidate':
      entry = {
        slug,
        name: 'Intimidate',
        triggers: ['on_switch_in'],
        effects: [
          {
            kind: 'modify_stat_stage',
            target: 'foe',
            stat: 'atk',
            value: -1,
          },
        ],
      };
      break;

    case 'swiftswim':
      entry = {
        slug,
        name: 'Swift Swim',
        triggers: ['on_speed_calc'],
        effects: [
          {
            kind: 'speed_multiplier',
            value: 2,
            when: { weather: 'rain' },
          },
        ],
      };
      break;

    case 'chlorophyll':
      entry = {
        slug,
        name: 'Chlorophyll',
        triggers: ['on_speed_calc'],
        effects: [
          {
            kind: 'speed_multiplier',
            value: 2,
            when: { weather: 'sun' },
          },
        ],
      };
      break;

    case 'sandrush':
      entry = {
        slug,
        name: 'Sand Rush',
        triggers: ['on_speed_calc'],
        effects: [
          {
            kind: 'speed_multiplier',
            value: 2,
            when: { weather: 'sand' },
          },
        ],
      };
      break;

    case 'friendguard':
      entry = {
        slug,
        name: 'Friend Guard',
        triggers: ['on_damage_calc_taken'],
        effects: [
          {
            kind: 'final_damage_multiplier',
            value: 0.75,
            target: 'ally',
          },
        ],
      };
      break;

    case 'goodasgold':
      entry = {
        slug,
        name: 'Good as Gold',
        triggers: ['on_try_status'],
        effects: [
          {
            kind: 'grant_immunity',
            move_damage_class: 'status',
          },
        ],
      };
      break;

    case 'armortail':
      entry = {
        slug,
        name: 'Armor Tail',
        triggers: ['on_try_hit'],
        effects: [
          {
            kind: 'block_priority',
          },
        ],
      };
      break;

    case 'waterabsorb':
      entry = {
        slug,
        name: 'Water Absorb',
        triggers: ['on_damage_calc_taken'],
        effects: [
          {
            kind: 'grant_immunity',
            move_type: 'water',
          },
          {
            kind: 'heal_fraction',
            value: 0.25,
            when: { move_type: 'water' },
          },
        ],
      };
      break;

    // Añade aquí otras habilidades clave (lightning-rod, storm-drain, ruins...)
    default:
      break;
  }

  if (entry) {
    window.EffectsRegistryBridge.upsertAbilityEntry(slug, entry);
  }
}

function ensureItemRegistry(itemName) {
  if (!window.EffectsRegistryBridge || !itemName) return;
  const slug = normalizeText(itemName);
  if (window.EffectsRegistryBridge.getItemEntry(slug)) return;

  let entry = null;

  switch (slug) {
    case 'lifeorb':
      entry = {
        slug,
        name: 'Life Orb',
        triggers: ['on_damage_calc', 'on_after_hit'],
        effects: [
          {
            kind: 'final_damage_multiplier',
            value: 1.3,
          },
          {
            kind: 'recoil_fraction',
            value: 0.1,
            target: 'self',
          },
        ],
      };
      break;

    case 'choiceband':
      entry = {
        slug,
        name: 'Choice Band',
        triggers: ['on_damage_calc', 'on_move_selected'],
        effects: [
          {
            kind: 'stat_multiplier',
            stat: 'atk',
            value: 1.5,
          },
          {
            kind: 'choice_lock',
          },
        ],
      };
      break;

    case 'choicespecs':
      entry = {
        slug,
        name: 'Choice Specs',
        triggers: ['on_damage_calc', 'on_move_selected'],
        effects: [
          {
            kind: 'stat_multiplier',
            stat: 'spa',
            value: 1.5,
          },
          {
            kind: 'choice_lock',
          },
        ],
      };
      break;

    case 'assaultvest':
      entry = {
        slug,
        name: 'Assault Vest',
        triggers: ['on_defense_calc'],
        effects: [
          {
            kind: 'special_defense_multiplier',
            value: 1.5,
          },
          {
            kind: 'forbid_status_moves',
          },
        ],
      };
      break;

    case 'clearamulet':
      entry = {
        slug,
        name: 'Clear Amulet',
        triggers: ['on_stat_drop_attempt'],
        effects: [
          {
            kind: 'block_stat_drop',
          },
        ],
      };
      break;

    case 'covertcloak':
      entry = {
        slug,
        name: 'Covert Cloak',
        triggers: ['on_secondary_effect_attempt'],
        effects: [
          {
            kind: 'block_secondary_effects',
          },
        ],
      };
      break;

    case 'focussash':
      entry = {
        slug,
        name: 'Focus Sash',
        triggers: ['on_lethal_hit'],
        effects: [
          {
            kind: 'survive_at_1hp',
          },
        ],
      };
      break;

    // Berries mitigadoras, Weakness Policy, etc. se pueden añadir aquí
    default:
      break;
  }

  if (entry) {
    window.EffectsRegistryBridge.upsertItemEntry(slug, entry);
  }
}

function ensureMoveRegistry(moveName) {
  if (!window.EffectsRegistryBridge || !moveName) return;
  const slug = normalizeText(moveName);
  if (window.EffectsRegistryBridge.getMoveEntry(slug)) return;

  let entry = null;

  switch (slug) {
    case 'trickroom':
      entry = {
        slug,
        name: 'Trick Room',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'toggle_room',
            room: 'trickRoom',
            value: true,
            turns: 5,
          },
        ],
      };
      break;

    case 'tailwind':
      entry = {
        slug,
        name: 'Tailwind',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'self',
            condition: 'tailwind',
            turns: 4,
          },
        ],
      };
      break;

    case 'reflect':
      entry = {
        slug,
        name: 'Reflect',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'self',
            condition: 'reflect',
            turns: 5,
          },
        ],
      };
      break;

    case 'lightscreen':
      entry = {
        slug,
        name: 'Light Screen',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'self',
            condition: 'light_screen',
            turns: 5,
          },
        ],
      };
      break;

    case 'auroraveil':
      entry = {
        slug,
        name: 'Aurora Veil',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'self',
            condition: 'aurora_veil',
            turns: 5,
          },
        ],
      };
      break;

    case 'wideguard':
      entry = {
        slug,
        name: 'Wide Guard',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'protect_side_from_spread',
            side: 'self',
          },
        ],
      };
      break;

    case 'quickguard':
      entry = {
        slug,
        name: 'Quick Guard',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'protect_side_from_priority',
            side: 'self',
          },
        ],
      };
      break;

    case 'followme':
    case 'ragepowder':
      entry = {
        slug,
        name: moveName,
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_redirection',
            side: 'self',
            value: true,
          },
        ],
      };
      break;

    case 'stealthrock':
      entry = {
        slug,
        name: 'Stealth Rock',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'enemy',
            condition: 'stealth_rock',
          },
        ],
      };
      break;

    case 'spikes':
      entry = {
        slug,
        name: 'Spikes',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'enemy',
            condition: 'spikes',
          },
        ],
      };
      break;

    case 'toxicspikes':
      entry = {
        slug,
        name: 'Toxic Spikes',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'enemy',
            condition: 'toxic_spikes',
          },
        ],
      };
      break;

    case 'stickyweb':
      entry = {
        slug,
        name: 'Sticky Web',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'enemy',
            condition: 'sticky_web',
          },
        ],
      };
      break;

    // Protect se gestiona más por flags y hooks on_try_hit/on_move_resolution
    default:
      break;
  }

  if (entry) {
    window.EffectsRegistryBridge.upsertMoveEntry(slug, entry);
  }
}

function ensureStatusRegistry(statusName) {
  if (!window.EffectsRegistryBridge || !statusName) return;
  const slug = normalizeText(statusName);
  if (window.EffectsRegistryBridge.getStatusEntry && window.EffectsRegistryBridge.getStatusEntry(slug)) return;

  let entry = null;

  switch (slug) {
    case 'brn':
      entry = {
        slug,
        name: 'Burn',
        triggers: ['on_damage_calc'],
        effects: [
          {
            kind: 'attack_multiplier',
            value: 0.5,
            unless: ['guts']
          }
        ],
      };
      break;
  }

  if (entry && window.EffectsRegistryBridge.upsertStatusEntry) {
    window.EffectsRegistryBridge.upsertStatusEntry(slug, entry);
  }
}

function fetchMoveInfo(moveName) {
  if (!moveName) return null;

  const cached = state.moveTypeCache[moveName];
  if (cached) return cached;

  const slug = normalizeText(moveName);

  if (CUSTOM_TERMS.has(slug)) {
    const info = {
      type: 'normal',
      damageClass: 'status',
      power: 0,
      hits: 1,
      isSpread: false,
      makesContact: false,
      isSound: false,
      isPunch: false,
      isBite: false,
      isBullet: false,
    };
    state.moveTypeCache[moveName] = info;
    return info;
  }

  let fallbackType = MOVE_TYPE_FALLBACK[moveName];
  if (!fallbackType) fallbackType = MOVE_TYPE_FALLBACK[formatName(slug)] || null;

  const info = window.GameDB?.moves?.[slug] || window.GameDB?.moves?.[moveName.toLowerCase()];
  
  if (info) {
    if (DEBUG_MODE && !state.moveTypeCache[moveName]) {
      //console.log(`✅ [MOVE CACHE] "${moveName}" cargado en RAM -> Poder: ${info.power}, Tipo: ${info.type}, Clase: ${info.damageClass}`);
    }
    state.moveTypeCache[moveName] = info;
    return info;
  }
  
  if (DEBUG_MODE && !state.moveTypeCache[moveName]) {
    /* console.groupCollapsed(`❌ [MOVE MISSING] Ataque Fantasma: "${moveName}" no existe en la Base de Datos Local`);
    console.warn(`Se buscó usando la clave: "${slug}". Al no existir, el simulador le aplicará Poder 0 (Daño 0).`);
    console.log(`💡 Pista: Si es un ataque de 2 palabras, el script de Python probablemente falló al cruzar los nombres con la PokeAPI.`);
    console.groupEnd(); */
  }

  const fallbackInfo = {
    type: fallbackType || 'normal',
    damageClass: isSupportMove(moveName) ? 'status' : 'physical',
    power: 0,
    hits: 1,
    isSpread: false,
    makesContact: false,
    isSound: false,
    isPunch: false,
    isBite: false,
    isBullet: false,
  };
  state.moveTypeCache[moveName] = fallbackInfo;
  return fallbackInfo;
}

function warmupRegistries() {
  const mons = [...state.self, ...state.enemy].filter(Boolean);
  mons.forEach(mon => {
    const set = mon.set || {};
    if (set.ability) ensureAbilityRegistry(set.ability);
    if (set.item) ensureItemRegistry(set.item);
    (set.moves || []).filter(Boolean).forEach(m => {
      ensureMoveRegistry(m);
      fetchMoveInfo(m);
    });
    if (mon.battle?.status) ensureStatusRegistry(mon.battle.status);
  });
}

function recalculateActiveField() {
  // Limpiamos los estados autogenerados
  state.field.weather = null;
  state.field.weatherTurns = 0;
  state.field.terrain = null;
  state.field.terrainTurns = 0;

  const actives = [];
  
  const sIdx = (state.uiMode === 'quick') ? getTurn1ResolvedLeadIndices("self") : state.activeSelfSlots;
  const eIdx = (state.uiMode === 'quick') ? getTurn1ResolvedLeadIndices("enemy") : state.activeEnemySlots;

  sIdx.forEach(i => {
     const m = state.self[i];
     if (m) actives.push({ mon: m, side: 'self', spe: calculateSpeed(m, 'self') });
  });
  eIdx.forEach(i => {
     const m = state.enemy[i];
     if (m) actives.push({ mon: m, side: 'enemy', spe: calculateSpeed(m, 'enemy') });
  });

  // Orden de resolución: de MÁS a MENOS rápido.
  // El más lento aplica su clima de último, por lo que es el que prevalece.
  actives.sort((a, b) => b.spe - a.spe);

  for (const cand of actives) {
    applySwitchInEffects(cand.mon, cand.side);
  }
}

function scheduleMoveWarmup() {
  warmupRegistries();
  recalculateActiveField();
  renderAll();
  if (state.setEditor.index !== null) {
    renderSetEditor();
    if (state.setChoice.kind) renderSetChoiceList();
  }
}

async function rehydrateCurrentTeamsSets() {
  for (const side of ["self", "enemy"]) {
    for (let i = 0; i < state[side].length; i++) {
      const mon = state[side][i];
      if (!mon) continue;
          mon.set = buildDefaultSetForSpecies(mon.name, side, i, mon.types);
          ensureBattleState(mon);
    }
  }
  scheduleMoveWarmup();
}

function getMoveCandidates(mon) {
  const moves = mon?.set?.moves || [];
  const resolved = moves
    .map((move) => {
      const info = state.moveTypeCache[move];
      if (!info || !info.type) return null;
      if (info.damageClass === "status") return null;
      return {
        move,
        type: info.type,
        power: info.power || 0,
        damageClass: info.damageClass || "physical",
        hits: info.hits || 1,
        isSpread: info.isSpread || false,
      };
    })
    .filter(Boolean);

  if (resolved.length) return resolved;

  const fallbackMoves = moves
    .map((move) => {
      let type = MOVE_TYPE_FALLBACK[move];
      if (!type) {
         const slug = normalizeText(move);
         type = MOVE_TYPE_FALLBACK[formatName(slug)];
      }
      if (!type || isSupportMove(move)) return null;
      return { move, type, power: 0, damageClass: "physical", hits: 1, isSpread: false };
    })
    .filter(Boolean);

  if (fallbackMoves.length) return fallbackMoves;

  return (mon?.types || []).map((type) => ({
    move: TYPE_META[type]?.name || type,
    type,
    power: 0,
    damageClass: "special",
    hits: 1,
    isSpread: false,
  }));
}

// CORE ENGINE: elige el mejor movimiento ofensivo entre dos mons.
function bestAttack(attacker, defender, field = state.field) {
  if (window.comboBestAttackCache) {
      const cacheKey = `${attacker.name}-${defender.name}-${field.weather}-${field.terrain}`;
      if (window.comboBestAttackCache[cacheKey]) return window.comboBestAttackCache[cacheKey];
  }

  const candidates = getMoveCandidates(attacker);
  if (!candidates.length) {
    console.warn(`[DEBUG] bestAttack: No candidates for attacker ${attacker?.name} vs ${defender?.name}`);
    return {
      type: "normal",
      mult: 1,
      rawMult: 1,
      wMul: 1,
      terrMul: 1,
      blocked: false,
      move: "",
      power: 0,
      damage: 0,
      minPct: 0,
      maxPct: 0,
      ohkoProb: 0,
      ohko: false,
    };
  }

  const baseHP = calcMonHP(defender);
  const hpPct = defender.battle?.hpPct ?? 100;
  const defHP = Math.max(1, Math.floor((baseHP * hpPct) / 100));
  const scored = candidates.map((c) => {
    const cacheKey = `${attacker.name}-${defender.name}-${c.move}-${field.weather}-${field.terrain}`;
    let damageObj;
    if (window.currentDamageCache[cacheKey]) {
        damageObj = window.currentDamageCache[cacheKey];
    } else {
        damageObj = estimateMoveDamage(attacker, defender, c, field);
        window.currentDamageCache[cacheKey] = damageObj;
    }
    
    const {
      damage,
      minDamage: minRoll,
      maxDamage: maxRoll,
      blocked,
      wMul = 1,
      terrMul = 1,
      registry = null
    } = damageObj;
    
    const rawMult = effectiveness(c.type, defender?.types || []);
    const mult = blocked ? 0 : rawMult * wMul * terrMul;
    
    const maxDamage = Number.isFinite(maxRoll) ? maxRoll : damage;
    const minDamage = Number.isFinite(minRoll) ? minRoll : Math.floor(maxDamage * 0.85);
    const maxPct = Math.min(100, Math.floor((maxDamage / defHP) * 100));
    const minPct = Math.min(100, Math.floor((minDamage / defHP) * 100));
    
    let ohkoProb = 0;
    if (maxDamage >= defHP) {
        if (minDamage >= defHP) ohkoProb = 100;
        else ohkoProb = Math.floor(((maxDamage - defHP) / Math.max(1, maxDamage - minDamage)) * 100);
    }
    const ohko = ohkoProb > 0;

    return {
      type: c.type,
      mult,
      rawMult,
      wMul,
      terrMul,
      blocked,
      move: c.move || TYPE_META[c.type]?.name || c.type,
      power: c.power || 0,
      damage: maxDamage,
      minPct, maxPct, ohkoProb,
      ohko,
      registry,
      registryReasons: registry ? registry.reasons : [],
      registryExplain: (window.EffectsRegistryBridge && registry) ? window.EffectsRegistryBridge.buildExplainLines(registry) : [],
      tags: damageObj.tags || []
    };
  });

  scored.sort((a, b) => {
    if (b.damage !== a.damage) return b.damage - a.damage;
    if (b.mult !== a.mult) return b.mult - a.mult;
    return (b.power || 0) - (a.power || 0);
  });

  if (window.comboBestAttackCache) {
      const cacheKey = `${attacker.name}-${defender.name}`;
      window.comboBestAttackCache[cacheKey] = scored[0];
  }

  if (DEBUG_MODE) {
    /* console.groupCollapsed(`🎯 [BEST ATTACK] ${attacker?.name} vs ${defender?.name}`);
    scored.forEach((s, i) => {
       console.log(`  [${i+1}] ${s.move} -> Daño: ${s.damage} HP (${s.minPct}% - ${s.maxPct}%) | Mult: x${s.mult}`);
    });
    console.log(`🏆 Movimiento Elegido: ${scored[0]?.move}`);
    console.groupEnd(); */
  }

  return scored[0];
}

// CORE ENGINE: aplica efectos de entrada (clima, terreno, etc.).
// TODO(registry): aplicar TODOS los eventos relevantes de switch-in
// (hazards, rooms, side-conditions) cuando el registry esté completo.
function applySwitchInEffects(mon, explicitSide) {
  if (!mon || !window.EffectsRegistryBridge) return;

  const fieldSnapshot =
    window.EffectsRegistryBridge.createCurrentFieldSnapshot(state);

  const entry = window.EffectsRegistryBridge.resolveSwitchIn(mon, {
    holder: mon,
    field: fieldSnapshot,
  });

  if (!entry || !Array.isArray(entry.events)) return;

  const side = explicitSide || mon.side || mon.battle?.side || 'self';
  const oppSide = side === 'self' ? 'enemy' : 'self';

  for (const ev of entry.events) {
    const payload = ev.payload || {};

    if (ev.kind === 'set_weather') {
      state.field.weather = payload.weather || payload.value || null;
      state.field.weatherTurns = payload.turns || 5;
    }

    if (ev.kind === 'set_terrain') {
      state.field.terrain = payload.terrain || payload.value || null;
      state.field.terrainTurns = payload.turns || 5;
    }

    if (ev.kind === 'toggle_room') {
      if (payload.room === 'trickRoom') {
        const next = !state.field.trickRoom;
        state.field.trickRoom = next;
        state.field.trickRoomTurns = next ? payload.turns || 5 : 0;
      }
    }

    if (ev.kind === 'set_side_condition') {
      const targetSide = payload.side || side; // por defecto, lado del owner
      const isSelf = targetSide === 'self';
      const f = state.field;

      switch (payload.condition) {
        case 'reflect':
          if (isSelf) {
            f.reflectSelf = true;
            f.reflectSelfTurns = payload.turns || 5;
          } else {
            f.reflectEnemy = true;
            f.reflectEnemyTurns = payload.turns || 5;
          }
          break;
        case 'light_screen':
          if (isSelf) {
            f.lightScreenSelf = true;
            f.lightScreenSelfTurns = payload.turns || 5;
          } else {
            f.lightScreenEnemy = true;
            f.lightScreenEnemyTurns = payload.turns || 5;
          }
          break;
        case 'aurora_veil':
          if (isSelf) {
            f.auroraVeilSelf = true;
            f.auroraVeilSelfTurns = payload.turns || 5;
          } else {
            f.auroraVeilEnemy = true;
            f.auroraVeilEnemyTurns = payload.turns || 5;
          }
          break;
        case 'tailwind':
          if (isSelf) {
            f.tailwindSelf = true;
            f.tailwindSelfTurns = payload.turns || 4;
          } else {
            f.tailwindEnemy = true;
            f.tailwindEnemyTurns = payload.turns || 4;
          }
          break;
        case 'stealth_rock':
          state.field.hazards[targetSide].rocks = true;
          break;
        case 'spikes':
          state.field.hazards[targetSide].spikes = Math.min(
            3,
            (state.field.hazards[targetSide].spikes || 0) + 1
          );
          break;
        case 'toxic_spikes':
          state.field.hazards[targetSide].tspikes = Math.min(
            2,
            (state.field.hazards[targetSide].tspikes || 0) + 1
          );
          break;
        case 'sticky_web':
          state.field.hazards[targetSide].web = true;
          break;
        default:
          break;
      }
    }
  }
}

function applyMoveResolutionEffects(attacker, move) {
  if (!attacker || !move || !window.EffectsRegistryBridge) return;

  const fieldSnapshot =
    window.EffectsRegistryBridge.createCurrentFieldSnapshot(state);

  const entry = window.EffectsRegistryBridge.resolveMoveResolution(attacker, move, {
    holder: attacker,
    move,
    field: fieldSnapshot,
  });

  if (!entry || !Array.isArray(entry.events)) return;

  if (DEBUG_MODE && entry && entry.reasons && entry.reasons.length > 0) {
     console.groupCollapsed(`🎬 [MOVE RESOLUTION] ${attacker.displayName || attacker.name} usó ${move.name || move.move || move} y generó efectos`);
     console.log(`Efectos causados por: ${entry.reasons.join(', ')}`);
     if (entry.events && entry.events.length > 0) {
         entry.events.forEach(ev => console.log(`  ↳ Evento disparado: ${ev.kind}`, ev.payload || ''));
     }
     console.groupEnd();
  }

  const side = attacker.side || attacker.battle?.side || 'self';
  const oppSide = side === 'self' ? 'enemy' : 'self';

  for (const ev of entry.events) {
    const payload = ev.payload || {};
    const f = state.field;

    if (ev.kind === 'set_weather') {
      f.weather = payload.weather || payload.value || null;
      f.weatherTurns = payload.turns || 5;
    }

    if (ev.kind === 'set_terrain') {
      f.terrain = payload.terrain || payload.value || null;
      f.terrainTurns = payload.turns || 5;
    }

    if (ev.kind === 'toggle_room' && payload.room === 'trickRoom') {
      const next = !f.trickRoom;
      f.trickRoom = next;
      f.trickRoomTurns = next ? payload.turns || 5 : 0;
    }

    if (ev.kind === 'set_side_condition') {
      const targetSide = payload.side || side;
      const isSelf = targetSide === 'self';

      switch (payload.condition) {
        case 'reflect':
          if (isSelf) {
            f.reflectSelf = true;
            f.reflectSelfTurns = payload.turns || 5;
          } else {
            f.reflectEnemy = true;
            f.reflectEnemyTurns = payload.turns || 5;
          }
          break;
        case 'light_screen':
          if (isSelf) {
            f.lightScreenSelf = true;
            f.lightScreenSelfTurns = payload.turns || 5;
          } else {
            f.lightScreenEnemy = true;
            f.lightScreenEnemyTurns = payload.turns || 5;
          }
          break;
        case 'aurora_veil':
          if (isSelf) {
            f.auroraVeilSelf = true;
            f.auroraVeilSelfTurns = payload.turns || 5;
          } else {
            f.auroraVeilEnemy = true;
            f.auroraVeilEnemyTurns = payload.turns || 5;
          }
          break;
        case 'tailwind':
          if (isSelf) {
            f.tailwindSelf = true;
            f.tailwindSelfTurns = payload.turns || 4;
          } else {
            f.tailwindEnemy = true;
            f.tailwindEnemyTurns = payload.turns || 4;
          }
          break;
        case 'stealth_rock':
          f.hazards[targetSide].rocks = true;
          break;
        case 'spikes':
          f.hazards[targetSide].spikes = Math.min(
            3,
            (f.hazards[targetSide].spikes || 0) + 1
          );
          break;
        case 'toxic_spikes':
          f.hazards[targetSide].tspikes = Math.min(
            2,
            (f.hazards[targetSide].tspikes || 0) + 1
          );
          break;
        case 'sticky_web':
          f.hazards[targetSide].web = true;
          break;
        default:
          break;
      }
    }

    if (ev.kind === 'protect_side_from_spread') {
      const targetSide = payload.side || side;
      if (targetSide === 'self') {
        f.wideGuardSelf = true;
      } else {
        f.wideGuardEnemy = true;
      }
    }

    if (ev.kind === 'protect_side_from_priority') {
      const targetSide = payload.side || side;
      if (targetSide === 'self') {
        f.quickGuardSelf = true;
      } else {
        f.quickGuardEnemy = true;
      }
    }

    if (ev.kind === 'set_redirection') {
      const targetSide = payload.side || side;
      const value = payload.value || attacker.name || attacker.displayName || true;
      if (targetSide === 'self') {
        f.redirectionSelf = value;
      } else {
        f.redirectionEnemy = value;
      }
    }
  }
}
function getRows() {
  const self = getFocusedTeam('self');
  const enemy = getFocusedTeam('enemy');
  if (!self.length || !enemy.length) return [];

  if (state.matrixMode === "defensive") {
    return enemy.map((attacker) => ({
      attacker,
      cells: self.map((defender) => {
        const best = bestAttack(attacker, defender);
        return {
          attacker,
          defender,
          type: best.type,
          mult: best.mult,
          rawMult: best.rawMult,
          wMul: best.wMul,
          terrMul: best.terrMul,
          blocked: best.blocked,
          move: best.move,
          damage: best.damage,
          minPct: best.minPct,
          maxPct: best.maxPct,
          ohkoProb: best.ohkoProb,
          ohko: best.ohko,
        };
      }),
    }));
  }

  return self.map((attacker) => ({
    attacker,
    cells: enemy.map((defender) => {
      const best = bestAttack(attacker, defender);
      return {
        attacker,
        defender,
        type: best.type,
        mult: best.mult,
        rawMult: best.rawMult,
        wMul: best.wMul,
        terrMul: best.terrMul,
        blocked: best.blocked,
        move: best.move,
        damage: best.damage,
        minPct: best.minPct,
        maxPct: best.maxPct,
        ohkoProb: best.ohkoProb,
        ohko: best.ohko,
      };
    }),
  }));
}

function matrixCellClass(cell) {
  if (state.matrixMode === "defensive") {
    if (cell.mult <= 0.5) return "eff-def-safe";
    if (cell.mult >= 2) return "eff-def-danger";
    return "eff-def-neutral";
  }
  return effClass(cell.mult);
}

function renderDock(side) {
  const arr = state[side];
  const mount = side === "self" ? selfSlots : enemySlots;

  mount.innerHTML = arr
    .map((mon, idx) => {
      if (!mon) {
        return `
            <button class="mini-slot empty" data-action="pick" data-side="${side}" data-index="${idx}" aria-label="Añadir slot ${idx + 1}">
              <span class="plus">+</span>
            </button>
          `;
      }

      const chosenIndex = side === "self" && state.uiMode === 'quick' && state.chosenFour ? state.chosenFour.indexOf(idx) : -1;
      const chosenBadge = chosenIndex !== -1
        ? `<div class="chosen-badge">${chosenIndex + 1}</div>`
        : '';

      return `
          <button class="mini-slot" data-action="pick" data-side="${side}" data-index="${idx}" aria-label="${mon.displayName}" ${side === "enemy" ? `data-scout="${mon.name}"` : ""}>
            ${chosenBadge}
            ${mon.name.includes("-mega") ? '<div class="mega-icon"></div>' : ""}
            <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
            ${side === "self" ? `<span class="slot-edit-dot" title="Set configurado"></span>` : ""}
            <span class="slot-remove" data-action="remove" data-side="${side}" data-index="${idx}"><i data-lucide="x" style="width:12px;height:12px;"></i></span>
          </button>
        `;
    })
    .join("");
}

const WEATHER_LABELS = {
  sun: 'Sol',
  rain: 'Lluvia',
  sand: 'Arena',
  snow: 'Nieve'
};

const TERRAIN_LABELS = {
  electric: 'Campo eléctrico',
  grassy: 'Campo de hierba',
  psychic: 'Campo psíquico',
  misty: 'Campo de niebla'
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function localizeMoveName(name) {
  if (!name) return '';
  return typeof getTranslation === 'function' ? getTranslation(name, 'move') : name;
}

function localizeTypeName(type) {
  if (!type) return 'Sin tipo';
  return TYPE_META[type]?.name || formatName(type);
}

function formatCellPct(cell) {
  if (cell.blocked || cell.mult === 0) return '0%';
  const min = Number.isFinite(cell.minPct) ? cell.minPct : 0;
  const max = Number.isFinite(cell.maxPct) ? cell.maxPct : 0;
  if (!min && !max) return '0%';
  if (min === max) return `${max}%`;
  return `${min}-${max}%`;
}

function describeWeatherEffect(cell) {
  if (!cell.weather || !cell.weatherMul || cell.weatherMul === 1) return '';
  return `${WEATHER_LABELS[cell.weather] || cell.weather} ${cell.weatherMul > 1 ? 'potencia' : 'reduce'}`;
}

function describeTerrainEffect(cell) {
  if (cell.blocked && cell.terrain === 'psychic') return 'Psíquico anula prioridad';
  if (!cell.terrain || !cell.terrainMul || cell.terrainMul === 1) return '';
  return `${TERRAIN_LABELS[cell.terrain] || cell.terrain} ${cell.terrainMul > 1 ? 'potencia' : 'reduce'}`;
}

function classifyMatrixCell(cell, offensive = true) {
  const maxPct = Number(cell.maxPct || 0);
  const minPct = Number(cell.minPct || 0);

  if (offensive) {
    if (cell.blocked) return { tone: 'blocked', label: 'Bloqueado', shortLabel: 'Bloqueado' };
    if (cell.mult === 0) return { tone: 'immune', label: 'Inmune', shortLabel: 'Inmune' };
    if (cell.ohkoProb >= 75 || (maxPct >= 100 && minPct >= 85)) {
      return { tone: 'ko', label: 'KO probable', shortLabel: 'KO' };
    }
    if (cell.mult >= 2 && maxPct >= 50) {
      return { tone: 'pressure', label: 'Presión alta', shortLabel: 'Presión' };
    }
    if (cell.mult > 1 || maxPct >= 25) {
      return { tone: 'chip', label: 'Chip útil', shortLabel: 'Chip' };
    }
    if (cell.mult < 1 || maxPct < 25) {
      return { tone: 'wall', label: 'Muro', shortLabel: 'Muro' };
    }
    return { tone: 'neutral', label: 'Neutral', shortLabel: 'Neutral' };
  }

  if (cell.mult === 0) return { tone: 'safe', label: 'Inmune', shortLabel: 'Inmune' };
  if (cell.mult < 1 && maxPct < 35) return { tone: 'safe', label: 'Cambio seguro', shortLabel: 'Seguro' };
  if (cell.ohkoProb >= 50 || maxPct >= 90 || cell.mult >= 4) {
    return { tone: 'danger', label: 'Peligro real', shortLabel: 'Peligro' };
  }
  if (cell.mult >= 2 || maxPct >= 50) {
    return { tone: 'respect', label: 'Respetar', shortLabel: 'Respeto' };
  }
  return { tone: 'neutral', label: 'Neutral', shortLabel: 'Neutral' };
}

function buildMatrixContextTags(cell, offensive, compact = false) {
  const tags = [];

  const weatherTag = describeWeatherEffect(cell);
  const terrainTag = describeTerrainEffect(cell);

  if (cell.blocked) {
    tags.push({ tone: 'blocked', label: terrainTag || 'Bloqueado por campo' });
  } else {
    if (weatherTag) {
      tags.push({
        tone: cell.weatherMul > 1 ? 'boost' : 'nerf',
        label: weatherTag
      });
    }

    if (terrainTag) {
      tags.push({
        tone: cell.terrainMul > 1 ? 'boost' : 'nerf',
        label: terrainTag
      });
    }

    if (cell.ohkoProb > 0 && cell.ohkoProb < 100) {
      tags.push({ tone: 'danger', label: `OHKO ${cell.ohkoProb}%` });
    }

    if (offensive && cell.mult >= 2 && cell.maxPct < 50) {
      tags.push({ tone: 'info', label: 'Buen tipo, daño medio' });
    }

    if (offensive && cell.mult < 1 && cell.maxPct < 25) {
      tags.push({ tone: 'blocked', label: 'No merece click' });
    }
  }

  return tags.slice(0, compact ? 1 : 3);
}

function getTacticalPhrase(cell, offensive) {
  if (offensive) {
    if (cell.blocked) return "Bloqueado por estado del campo";
    if (cell.mult === 0) return "Totalmente inmune al daño";
    if (cell.ohkoProb >= 75 || (cell.maxPct >= 100 && cell.minPct >= 85)) return "Amenaza KO si entra limpio";
    if (cell.mult >= 2 && cell.maxPct >= 50) return "Buena presión, fuerza respuesta";
    if (cell.mult > 1 || cell.maxPct >= 25) return "Buen chip, no fuerza cambio";
    if (cell.mult < 1 || cell.maxPct < 25) return "Resiste bien, no compensa pulsar";
    return "Daño aceptable sin ventaja clara";
  } else {
    if (cell.mult === 0) return "Inmune a su mejor ataque";
    if (cell.mult < 1 && cell.maxPct < 35) return "Entrada segura, resiste bien";
    if (cell.ohkoProb >= 50 || cell.maxPct >= 90 || cell.mult >= 4) return "Te castiga si pivotas aquí";
    if (cell.mult >= 2 || cell.maxPct >= 50) return "Amenaza fuerte, cuidado al entrar";
    return "Intercambio de daño parejo";
  }
}

function renderMatrixExplainer(rows, offensive) {
  const titleEl = document.getElementById('matrixExplainerTitle');
  const textEl = document.getElementById('matrixExplainerText');
  const badgesEl = document.getElementById('matrixExplainerBadges');
  const footEl = document.getElementById('matrixExplainerFoot');

  if (!titleEl || !textEl || !badgesEl || !footEl) return;

  if (offensive) {
    titleEl.textContent = 'Cómo leer esta matriz';
    textEl.textContent = 'Cada celda resume si conviene presionar, cuánto daño estimas y qué campo altera la lectura.';
    badgesEl.innerHTML = `
      <span class="matrix-state-badge matrix-state-badge--ko">KO probable</span>
      <span class="matrix-state-badge matrix-state-badge--pressure">Presión alta</span>
      <span class="matrix-state-badge matrix-state-badge--chip">Chip útil</span>
      <span class="matrix-state-badge">Neutral</span>
      <span class="matrix-state-badge matrix-state-badge--wall">Muro</span>
      <span class="matrix-state-badge matrix-state-badge--blocked">Inmune / bloqueado</span>
    `;
    footEl.textContent = 'Objetivo: detectar KOs, presión útil y muros reales de un vistazo.';
  } else {
    titleEl.textContent = 'Cómo leer esta matriz';
    textEl.textContent = 'Cada celda resume si puedes entrar seguro, qué amenaza recibes y qué campo empeora el cruce.';
    badgesEl.innerHTML = `
      <span class="matrix-state-badge matrix-state-badge--danger">Peligro real</span>
      <span class="matrix-state-badge matrix-state-badge--respect">Respetar</span>
      <span class="matrix-state-badge">Neutral</span>
      <span class="matrix-state-badge matrix-state-badge--safe">Cambio seguro</span>
      <span class="matrix-state-badge matrix-state-badge--blocked">Inmune</span>
    `;
    footEl.textContent = 'Objetivo: detectar entradas seguras, amenazas inmediatas e inmunidades antes de pivotar.';
  }
}

function loadMatrixPreferences() {
  try {
    const detailMode = localStorage.getItem(MATRIX_DETAIL_MODE_KEY);
    if (detailMode === 'compact' || detailMode === 'detailed') {
      state.matrixDetailMode = detailMode;
    } else {
      state.matrixDetailMode = 'detailed';
    }
    
    const helpSeen = localStorage.getItem(MATRIX_HELP_SEEN_KEY);
    if (!helpSeen) {
      state.matrixHelpOpen = true;
      localStorage.setItem(MATRIX_HELP_SEEN_KEY, "true");
    }
  } catch(e) {}
}

function setMatrixDetailMode(mode) {
  state.matrixDetailMode = mode;
  try { localStorage.setItem(MATRIX_DETAIL_MODE_KEY, mode); } catch(e){}
  triggerMatrixFlash();
  renderAll();
}

function toggleMatrixHelp(forceOpen) {
  state.matrixHelpOpen = forceOpen !== undefined ? forceOpen : !state.matrixHelpOpen;
  const panel = document.getElementById('matrixHelpPanel');
  const btn = document.getElementById('matrixHelpToggleBtn');
  if (panel && btn) {
    panel.classList.toggle('is-open', state.matrixHelpOpen);
    btn.setAttribute('aria-expanded', state.matrixHelpOpen ? 'true' : 'false');
  }
}

function sanitizeCell(cell) {
  const move = typeof cell.move === 'string' ? cell.move.trim() : '';

  const minPct = Number(cell.minPct);
  const maxPct = Number(cell.maxPct);
  const hasValidDamage = Number.isFinite(minPct) && Number.isFinite(maxPct);

  if (!move || !hasValidDamage) {
    console.warn(`[DEBUG] sanitizeCell: Cell flagged with dataIssue. Attacker: ${cell.attacker?.name}, Move: "${move}", hasValidDamage: ${hasValidDamage}`, cell);
    return { ...cell, move: null, minPct: null, maxPct: null, dataIssue: true };
  }

  return cell;
}

function buildMatrixCellMarkup(rowAttacker, rawCell, offensive, compact = false) {
  const cell = sanitizeCell(rawCell);
  const isCompact = compact;
  const verdict = classifyMatrixCell(cell, offensive);
  const moveLabel = cell.dataIssue ? 'Datos incompletos' : (localizeMoveName(cell.move) || 'Sin presión real');
  const typeLabel = localizeTypeName(cell.type);
  const rangeLabel = cell.dataIssue ? 'N/A' : formatCellPct(cell);
  
  const multLabel = cell.blocked ? 'inmune' : `x${fmtMult(cell.mult).replace('×', '')}`;
  const metaLine = cell.blocked ? `0% · ${multLabel}` : (cell.dataIssue ? `Sin daño · ${multLabel}` : `${rangeLabel} · ${multLabel}`);
  
  const phrase = getTacticalPhrase(cell, offensive);

  const tags = buildMatrixContextTags(cell, offensive, isCompact);
  const payloadObject = {
    attacker: rowAttacker,
    defender: cell.defender,
    moveName: cell.move,
    moveType: cell.type || 'normal',
    mult: cell.mult ?? cell.rawMult ?? 1,
    rawMult: cell.rawMult ?? 1,
    wMul: cell.wMul ?? 1,
    terrMul: cell.terrMul ?? 1,
    damage: cell.damage ?? 0,
    minPct: cell.minPct,
    maxPct: cell.maxPct,
    ohkoProb: Number(cell.ohkoProb || 0),
    verdict: verdict.label,
    blocked: !!cell.blocked,
    offensive: offensive,
    tags: tags.map((tag) => tag.label),
    label: phrase,
    shortNote: metaLine,
    dataIssue: cell.dataIssue,
    debug: DEBUG_MODE
      ? {
          registryExplain: cell.registryExplain || [],
          rawMult: cell.rawMult,
          wMul: cell.wMul,
          terrMul: cell.terrMul,
        }
      : null,
  };

  if (cell.dataIssue) {
    console.warn(`[DEBUG] buildMatrixCellMarkup: dataIssue detected for ${rowAttacker?.name} vs ${cell.defender?.name}`, payloadObject);
  }

  const tooltipData = encodeURIComponent(JSON.stringify(payloadObject));

  const classes = [
    'cell',
    'matrix-cell-card',
    `matrix-cell-card--${verdict.tone}`,
    'clickable-cell'
  ];

  const stateLabel = isCompact ? verdict.shortLabel : verdict.label;
  const chipsHtml = tags.length
    ? `<div class="matrix-cell-context">${tags.map(tag => `
        <span class="matrix-context-chip matrix-context-chip--${tag.tone}">
          ${escapeHtml(tag.label)}
        </span>
      `).join('')}</div>`
    : '';

  if (isCompact) {
    return `
      <div class="${classes.join(' ')}" data-tooltip="${tooltipData}" title="Toca para lectura táctica">
        <div class="cell__top">
          <div class="cell__top-state">${escapeHtml(stateLabel)}</div>
          ${cell.type ? typeChip(cell.type) : ''}
        </div>
        <div class="cell__move ${cell.move ? '' : 'matrix-cell-move--muted'}">
          ${escapeHtml(moveLabel)}
        </div>
        <div class="cell__range">
          ${escapeHtml(metaLine)}
        </div>
        ${chipsHtml}
      </div>
    `;
  } else {
    return `
      <div class="${classes.join(' ')}" data-tooltip="${tooltipData}" title="Toca para lectura táctica">
        <div class="cell__top-state">${escapeHtml(stateLabel)}</div>
        <div class="cell__move-box">
          ${cell.type ? typeChip(cell.type) : ''}
          <span class="cell__move ${cell.move ? '' : 'matrix-cell-move--muted'}">${escapeHtml(moveLabel)}</span>
        </div>
        <div class="cell__dmg-box">
          <span class="cell__dmg-range">${rangeLabel}</span>
          <span class="cell__dmg-mult">${multLabel}</span>
        </div>
        <div class="cell__note">${escapeHtml(phrase)}</div>
      </div>
    `;
  }
}

function updateMatrixFieldUI() {
  const modeBtns = document.querySelectorAll("#matrixModeToggleGroup .segmented-btn");
  modeBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === state.matrixMode);
  });

  const detailBtns = document.querySelectorAll("#matrixDetailToggleGroup .segmented-btn");
  detailBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.detail === state.matrixDetailMode);
  });

  const title = document.getElementById("matrixSectionTitle");
  const sub = document.getElementById("matrixSectionSub");
  const legend = document.getElementById("matrixLegendChip");
  if (title)
    title.textContent =
      state.matrixMode === "defensive" ? "Matriz defensiva" : "Matriz ofensiva";
  if (sub) {
    if (state.matrixMode === "offensive") {
      sub.textContent = state.matrixDetailMode === "compact"
        ? "Cruces rápidos para detectar KO, presión útil y muros."
        : "Detalle de daño estimado, tipo y presión por cruce.";
    } else {
      sub.textContent = state.matrixDetailMode === "compact"
        ? "Qué amenazas te rompen y qué cruces aguantas."
        : "Daño entrante estimado con clima, terreno y sets actuales.";
    }
  }
  if (legend) {
    legend.textContent =
      state.matrixMode === "defensive"
        ? "Verde ≤×0.5 · Rojo ≥×2"
        : "×4 / ×2 · 💀 OHKO";
  }

  document.querySelectorAll("#matrixFieldControls [data-weather]").forEach((el) => {
    el.classList.toggle("on", state.field.weather === el.dataset.weather);
  });
  document.querySelectorAll("#matrixFieldControls [data-terrain]").forEach((el) => {
    el.classList.toggle("on", state.field.terrain === el.dataset.terrain);
  });
}

function renderMatrix(rows) {
  updateMatrixFieldUI();

  const offensive = state.matrixMode !== 'defensive';
  renderMatrixExplainer(rows, offensive);

  if (!rows.length) {
    matrixPlaceholder.classList.remove('hidden');
    matrixContainer.classList.add('hidden');
    matrixContainer.classList.remove('matrix-grid--compact');
    matrixStatus.textContent = '0 cruces';
    const mc = document.getElementById('metricCross');
    const ms = document.getElementById('metricStrong');
    const mp = document.getElementById('metricPeak');
    const ma = document.getElementById('metricAvg');
    if (mc) mc.textContent = '0';
    if (ms) ms.textContent = '0';
    if (mp) mp.textContent = '0';
    if (ma) ma.textContent = '0.00';
    return;
  }

  const self = getFocusedTeam('self');
  const enemy = getFocusedTeam('enemy');
  const colMons = offensive ? enemy : self;
  const flat = rows.flatMap((row) => row.cells);
  const cross = flat.length;
  const isCompact = state.matrixDetailMode === 'compact';

  let ohkos = 0;
  let pressure = 0;
  let walls = 0;

  flat.forEach((cell) => {
    if (cell.ohko || cell.ohkoProb >= 50) {
      ohkos++;
    } else if (cell.mult >= 2) {
      pressure++;
    }
    if (cell.mult <= 0.5 || cell.blocked) {
      walls++;
    }
  });

  const elOhko = document.getElementById('metricOhkoCount');
  const elPressure = document.getElementById('metricPressureCount');
  const elWall = document.getElementById('metricWallCount');
  
  if (elOhko) elOhko.innerHTML = `<strong>${ohkos}</strong> OHKOs`;
  if (elPressure) elPressure.innerHTML = `<strong>${pressure}</strong> Presión x2+`;
  if (elWall) elWall.innerHTML = `<strong>${walls}</strong> Muros/Inmunes`;

  matrixStatus.textContent = `${cross} cruces`;

  matrixContainer.classList.remove('matrix-grid--compact', 'matrix-grid--detailed');
  matrixContainer.classList.add(`matrix-grid--${state.matrixDetailMode}`);

  const colTag = offensive ? 'RIVAL' : 'TÚ';
  const colColor = offensive ? 'var(--red)' : 'var(--blue)';
  const rowTag = offensive ? 'TÚ' : 'RIVAL';
  const rowColor = offensive ? 'var(--blue)' : 'var(--red)';
  const theadBorder = offensive ? 'rgba(255, 59, 48, 0.4)' : 'rgba(50, 173, 230, 0.4)';
  const tbodyBorder = offensive ? 'rgba(50, 173, 230, 0.4)' : 'rgba(255, 59, 48, 0.4)';

  const thead = `
    <thead>
      <tr>
        <th class="corner" style="background:linear-gradient(to bottom right, transparent 49%, var(--line) 50%, transparent 51%); position:sticky; top:0; left:0; z-index:3;">
          <span style="position:absolute; top:4px; right:4px; font-size:0.55rem; font-weight:900; color:${colColor};">${colTag}</span>
          <span style="position:absolute; bottom:4px; left:4px; font-size:0.55rem; font-weight:900; color:${rowColor};">${rowTag}</span>
        </th>
        ${colMons.map((mon) => `
          <th style="border-bottom:2px solid ${theadBorder}">
            <div class="head-mon" title="${escapeHtml(mon.displayName)}">
              <div class="sprite">
                <img src="${mon.sprite}" alt="${escapeHtml(mon.displayName)}" loading="lazy">
              </div>
            </div>
          </th>
        `).join('')}
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${rows.map((row) => `
        <tr>
          <th style="border-right:2px solid ${tbodyBorder}">
            <div class="row-mon" title="${escapeHtml(row.attacker.displayName)}">
              <div class="sprite">
                <img src="${row.attacker.sprite}" alt="${escapeHtml(row.attacker.displayName)}" loading="lazy">
              </div>
            </div>
          </th>

          ${row.cells.map((cell) => `
            <td>
              ${buildMatrixCellMarkup(row.attacker, cell, offensive, isCompact)}
            </td>
          `).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;

  matrixContainer.innerHTML = `<table>${thead}${tbody}</table>`;
  matrixPlaceholder.classList.add('hidden');
  matrixContainer.classList.remove('hidden');
  updateIcons();
}

function scoreThreat(enemyMon) {
  const selfTeam = getFocusedTeam('self');
  if (!selfTeam.length)
    return { score: 0, level: "green", reasons: [], bestAnswers: [] };

  const selfRows = selfTeam.map((selfMon) => ({
    mon: selfMon,
    result: bestAttack(selfMon, enemyMon),
  }));

  const enemyVsSelf = selfTeam.map((selfMon) => bestAttack(enemyMon, selfMon));
  const maxEnemyPressure = Math.max(...enemyVsSelf.map((x) => x.mult), 1);
  const strongAnswers = selfRows
    .filter((x) => x.result.mult >= 2)
    .sort((a, b) => b.result.mult - a.result.mult);
  const setMoves = enemyMon?.set?.moves || [];
  let score = 30;

  score += maxEnemyPressure >= 4 ? 28 : maxEnemyPressure >= 2 ? 16 : 6;
  if (setMoves.includes("Tailwind")) score += 14;
  if (setMoves.includes("Trick Room")) score += 14;
  if (setMoves.includes("Fake Out")) score += 10;
  if (setMoves.includes("Follow Me") || setMoves.includes("Rage Powder"))
    score += 10;
  if (
    setMoves.includes("Parting Shot") ||
    setMoves.includes("Snarl") ||
    setMoves.includes("Encore")
  )
    score += 8;
  if ((enemyMon.set?.ability || "") === "Intimidate") score += 8;
  if ((enemyMon.set?.item || "") === "Focus Sash") score += 5;
  if (
    enemyMon.set?.teammates?.some((t) =>
      state.enemy.filter(Boolean).some((m) => m.name === t),
    )
  )
    score += 5;

  score -= Math.min(18, strongAnswers.length * 7);
  if (strongAnswers.some((x) => x.result.mult >= 4)) score -= 6;

  score = Math.max(0, Math.min(100, score));

  let level = "green";
  if (score >= 65) level = "red";
  else if (score >= 40) level = "amber";

  const reasons = [];
  if (setMoves.includes("Tailwind")) reasons.push("Tailwind");
  if (setMoves.includes("Trick Room")) reasons.push("Trick Room");
  if (setMoves.includes("Fake Out")) reasons.push("Fake Out");
  if (setMoves.includes("Follow Me") || setMoves.includes("Rage Powder"))
    reasons.push("Redirección");
  if ((enemyMon.set?.ability || "") === "Intimidate")
    reasons.push("Intimidate");

  const bestAnswers = strongAnswers.slice(0, 2).map((x) => x.mon);
  const isSupportThreat = maxEnemyPressure < 2 && score >= 40;

  if (DEBUG_MODE) {
    /* console.groupCollapsed(`🚨 [THREAT SCORE] Evaluando peligro de ${enemyMon?.name}`);
    console.log(`⚔️ Presión Máxima vs tu equipo: x${maxEnemyPressure}`);
    console.log(`🛠️ Utilidad Detectada -> Tailwind: ${setMoves.includes("Tailwind")}, Trick Room: ${setMoves.includes("Trick Room")}, Fake Out: ${setMoves.includes("Fake Out")}, Redirección: ${setMoves.includes("Follow Me") || setMoves.includes("Rage Powder")}`);
    console.log(`🛡️ Respuestas fuertes en tu equipo: ${strongAnswers.length} Pokémon`);
    console.log(`🏁 Puntuación Final: ${score} (Nivel: ${level.toUpperCase()}) | ¿Amenaza pura de soporte?: ${isSupportThreat ? 'SÍ' : 'NO'}`);
    console.groupEnd(); */
  }

  return { score, level, reasons: reasons.slice(0, 3), bestAnswers, maxEnemyPressure, isSupportThreat };
}

function renderThreats() {
  const enemy = getFocusedTeam('enemy');

  if (!enemy.length) {
    threatList.innerHTML = `<div class="empty">Añade un rival para activar el semáforo.</div>`;
    return;
  }

  const items = enemy
    .map((mon) => {
      const threat = scoreThreat(mon);
      return { mon, threat };
    })
    .sort((a, b) => b.threat.score - a.threat.score);

  const reds = items.filter(i => i.threat.level === 'red');
  const ambers = items.filter(i => i.threat.level === 'amber');
  const greens = items.filter(i => i.threat.level === 'green');

  let html = '';

  if (reds.length > 0) {
    html += reds.map(({ mon, threat }) => `
      <div class="threat-hero-card" data-scout="${mon.name}">
        <div class="threat-hero-sprite">
          <img src="${mon.sprite}" alt="${mon.displayName}">
        </div>
        <div>
          <div style="font-weight: 900; font-size: 1.15rem; color: #fff;">${mon.displayName}</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
            ${threat.reasons.map(r => `<span class="tag-pill tag-pill--danger">${r}</span>`).join("")}
            ${threat.isSupportThreat ? `<span class="tag-pill tag-pill--info"><i data-lucide="shield-alert"></i> Peligro de Soporte</span>` : ""}
          </div>
          ${threat.bestAnswers.length ? `
            <div class="threat-kill-chain">
              <span style="color: var(--muted); font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">Respuestas</span>
              <i data-lucide="arrow-right" style="color: var(--red); width: 14px; height: 14px;"></i>
              ${threat.bestAnswers.map(ans => `<img src="${ans.sprite}" class="sprite-micro" title="${ans.displayName}" style="width: 28px; height: 28px;">`).join("")}
            </div>
          ` : ""}
        </div>
      </div>
    `).join("");
  }

  if (ambers.length > 0) {
    html += `<div class="threat-amber-grid">`;
    html += ambers.map(({ mon, threat }) => `
      <div class="threat-compact-card" data-scout="${mon.name}">
        <img src="${mon.sprite}" style="width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" alt="${mon.displayName}">
        <div style="font-weight: 900; font-size: 0.85rem; color: #fff;">${mon.displayName}</div>
        ${threat.reasons.length ? `<div style="color: var(--orange); font-size: 0.65rem; line-height: 1.2;">${threat.reasons[0]}</div>` : ""}
        ${threat.isSupportThreat ? `<div style="color: var(--blue); font-size: 0.65rem; font-weight: bold; line-height: 1.2;">Soporte Clave</div>` : ""}
      </div>
    `).join("");
    html += `</div>`;
  }

  if (greens.length > 0) {
    html += `<div class="threat-walled-zone">`;
    html += greens.map(({ mon }) => `
      <div class="threat-walled-sprite" title="${mon.displayName}" data-scout="${mon.name}">
        <img src="${mon.sprite}" alt="${mon.displayName}">
        <div class="threat-walled-check"><i data-lucide="shield-check"></i></div>
      </div>
    `).join("");
    html += `</div>`;
  }

  threatList.innerHTML = html;

  updateIcons();
}

function renderOpportunities(rows) {
  if (state.matrixMode === "defensive") {
    opportunityList.innerHTML = `<div class="muted-small">Las oportunidades ofensivas solo aplican en vista ofensiva.</div>`;
    return;
  }

  // Extraer todas las interacciones fuertes (mult >= 2)
  const allStrongHits = rows
    .flatMap((r) => r.cells)
    .filter((x) => x.mult >= 2)
    .sort((a, b) => b.mult - a.mult);

  if (!allStrongHits.length) {
    opportunityList.innerHTML = `<div class="empty">No hay ventanas de presión clara todavía.</div>`;
    return;
  }

  // Agrupar por Defensor (El Pokémon rival vulnerable)
  const targets = {};
  allStrongHits.forEach(hit => {
    const defName = hit.defender.name;
    if (!targets[defName]) {
      targets[defName] = {
        defender: hit.defender,
        highestMult: hit.mult,
        ohkoRisk: hit.ohko || hit.ohkoProb >= 100,
        executioners: []
      };
    }
    // Añadir ejecutores (máximo 2 por target para no saturar la tarjeta)
    if (targets[defName].executioners.length < 2) {
      targets[defName].executioners.push(hit);
    }
    // Actualizar riesgo si alguien le hace OHKO
    if (hit.ohko || hit.ohkoProb >= 100) targets[defName].ohkoRisk = true;
  });

  // Convertir a array, ordenar por riesgo (OHKO primero, luego multiplicador) y tomar top 4
  const topTargets = Object.values(targets)
    .sort((a, b) => (b.ohkoRisk === a.ohkoRisk ? b.highestMult - a.highestMult : b.ohkoRisk ? 1 : -1))
    .slice(0, 4);

  opportunityList.className = "target-lock-board";

  opportunityList.innerHTML = topTargets.map(target => {
    const isHot = target.ohkoRisk || target.highestMult >= 4;
    const badgeText = target.ohkoRisk ? "💀 Riesgo OHKO" : `Peligro x${target.highestMult}`;
    const badgeClass = isHot ? "target-lethality-badge target-lethality-badge--hot" : "target-lethality-badge";

    return `
      <div class="target-bounty-card">
        <div class="${badgeClass}">${badgeText}</div>
        
        <div class="target-crosshair" title="${target.defender.displayName}">
          <img src="${target.defender.sprite}" alt="${target.defender.displayName}" loading="lazy">
        </div>

        <div class="target-executioners">
          ${target.executioners.map(hit => {
             const typeMeta = TYPE_META[hit.type] || { color: '#8aa2c6' };
             return `
               <div class="target-execution-row">
                 <img src="${hit.attacker.sprite}" class="sprite-micro" title="${hit.attacker.displayName}">
                 <div style="display:flex; align-items:center; gap:4px;">
                   <span class="target-move-name">${getTranslation(hit.move, "move") || hit.type}</span>
                   <div class="type-icon-circle" style="position: static; width:14px; height:14px; background-color: ${typeMeta.color};"></div>
                 </div>
               </div>
             `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  updateIcons();
}

function inferStrategies(team) {
  const mons = team.filter(Boolean);
  if (!mons.length) return [];

  const strategies = [];

  const getSetters = (moves, abilities) => mons.filter(m => {
    const mvs = m?.set?.moves || [];
    const ab = m?.set?.ability;
    if (moves && mvs.some(x => moves.includes(x))) return true;
    if (abilities && abilities.includes(ab)) return true;
    return false;
  });

  const getAbusers = (type) => mons.filter(m => {
    const bSpe = m?.baseStats?.speed || 100;
    const bAtk = m?.baseStats?.attack || 0;
    const bSpa = m?.baseStats?.["special-attack"] || 0;
    const hasOffense = (bAtk >= 90 || bSpa >= 90);
    
    if (type === "Trick Room") return bSpe <= 60 && hasOffense;
    if (type === "Tailwind") return bSpe >= 70 && bSpe <= 100 && hasOffense;
    if (type === "Rain") return m?.set?.ability === "Swift Swim" || (m?.types || []).includes("water");
    if (type === "Sun") return m?.set?.ability === "Chlorophyll" || (m?.types || []).includes("fire");
    return false;
  });

  const trSetters = getSetters(["Trick Room"]);
  const trAbusers = getAbusers("Trick Room");
  if (trSetters.length > 0) {
    strategies.push({
      icon: '<i data-lucide="orbit"></i>',
      title: "Trick Room",
      triggers: [...new Set([...trSetters, ...trAbusers])],
      type: "Trick Room"
    });
  }

  const tailwindSetters = getSetters(["Tailwind", "Icy Wind"]);
  const tailwindAbusers = getAbusers("Tailwind");
  if (tailwindSetters.length > 0) {
    strategies.push({
      icon: '<i data-lucide="wind"></i>',
      title: "Viento Afín",
      triggers: [...new Set([...tailwindSetters, ...tailwindAbusers])],
      type: "Tailwind"
    });
  }

  const rainSetters = getSetters(null, ["Drizzle"]);
  const rainAbusers = getAbusers("Rain");
  if (rainSetters.length > 0) {
    strategies.push({
      icon: '<i data-lucide="cloud-rain"></i>',
      title: "Lluvia",
      triggers: [...new Set([...rainSetters, ...rainAbusers])],
      type: "Rain"
    });
  }

  const sunSetters = getSetters(null, ["Drought"]);
  const sunAbusers = getAbusers("Sun");
  if (sunSetters.length > 0) {
    strategies.push({
      icon: '<i data-lucide="sun"></i>',
      title: "Sol",
      triggers: [...new Set([...sunSetters, ...sunAbusers])],
      type: "Sun"
    });
  }

  const sandSetters = getSetters(null, ["Sand Stream"]);
  const sandAbusers = mons.filter(m => m?.set?.ability === "Sand Rush" || (m?.types || []).includes("rock"));
  if (sandSetters.length > 0) {
    strategies.push({
      icon: '<i data-lucide="mountain"></i>',
      title: "Arena",
      triggers: [...new Set([...sandSetters, ...sandAbusers])],
      type: "Sand"
    });
  }

  const pivotMons = getSetters(["Fake Out", "Parting Shot", "Volt Switch", "U-turn"], ["Intimidate"]);
  if (pivotMons.length > 0) {
    strategies.push({
      icon: '<i data-lucide="refresh-cw"></i>',
      title: "Pivot",
      triggers: pivotMons,
      type: "Pivot"
    });
  }

  const supportMons = getSetters(["Follow Me", "Rage Powder", "Helping Hand", "Wide Guard"]);
  if (supportMons.length > 0) {
    strategies.push({
      icon: '<i data-lucide="shield"></i>',
      title: "Soporte",
      triggers: supportMons,
      type: "Support"
    });
  }

  const disruptMons = getSetters(["Perish Song", "Disable"]);
  if (disruptMons.length > 0) {
    strategies.push({
      icon: '<i data-lucide="music"></i>',
      title: "Disrupción",
      triggers: disruptMons,
      type: "Disrupt"
    });
  }

  if (!strategies.length) {
    const teammatePairs = mons.flatMap((m) => m?.set?.teammates || []);
    const topTeammateHits = teammatePairs.reduce(
      (acc, t) => ((acc[t] = (acc[t] || 0) + 1), acc),
      {},
    );
    const paired = topEntries(topTeammateHits, 1)[0]?.key;
    strategies.push({
      icon: '<i data-lucide="puzzle"></i>',
      title: "Flexible",
      triggers: paired ? mons.filter(m => m.name === paired) : mons.slice(0, 3),
      type: "Flexible"
    });
  }

  return strategies.slice(0, 4);
}

function renderStrategies() {
  const enemy = state.enemy.filter(Boolean);
  const strategies = inferStrategies(enemy);

  if (!strategies.length) {
    strategyList.innerHTML = `<div class="empty">Sin datos para inferir estrategias.</div>`;
    return;
  }

  strategyList.style.display = "grid";
  strategyList.style.gridTemplateColumns = "repeat(auto-fit, minmax(140px, 1fr))";
  strategyList.style.gap = "8px";

  strategyList.innerHTML = strategies
    .map(
      (item) => `
        <div class="strategy-row">
          <div style="font-size: 1.6rem; color: var(--blue); margin-bottom: 4px; display: grid; place-items: center;">${item.icon}</div>
          <div class="row-title" style="font-size: 0.85rem;">${item.title}</div>
          <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:2px; margin-top:6px;">
            ${(item.triggers || []).map(t => `<img src="${t.sprite}" class="sprite-micro" title="${t.displayName}" alt="${t.displayName}">`).join('')}
          </div>
        </div>
      `,
    )
    .join("");

  updateIcons();
}

function getSavedTeams() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setSavedTeams(teams) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
}

function saveCurrentTeam(teamName) {
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

async function loadSavedTeam(id, side = "self") {
  const teams = getSavedTeams();
  const team = teams.find((t) => t.id === id);
  if (!team) return;

  const mons = await Promise.all(
    team.mons.map(async (saved) => {
      try {
        const mon = await fetchPokemon(saved.name);
        mon.set = saved.set || mon.set;
        if (!Array.isArray(mon.set?.moves)) mon.set.moves = ["", "", "", ""];
        while (mon.set.moves.length < 4) mon.set.moves.push("");
        return mon;
      } catch {
        return saved;
      }
    }),
  );

  state[side] = mons.slice(0, 6);
  state.leads[side] = [];
  while (state[side].length < 6) state[side].push(null);
  mons.forEach(mon => {
    ensureBattleState(mon);
    // applySwitchInEffects(mon);
  });
  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  renderAll();
}

function deleteSavedTeam(id) {
  const teams = getSavedTeams().filter((t) => t.id !== id);
  setSavedTeams(teams);
}

function ensurePokedex() {
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

  searchHint.textContent = `${state.pokedex.length} Pokémon meta cargados desde Smogon`;
}

function renderPokedex(query = "") {
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
    resultList.innerHTML = `<div class="loader">No hay resultados.</div>`;
    return;
  }

  const quickPicksHtml = !q
    ? `<div style="grid-column: 1 / -1; margin-bottom: -4px;"><span class="tiny-chip" style="background: rgba(50, 173, 230, 0.12); border-color: rgba(50, 173, 230, 0.26);">Top Meta (Quick Picks)</span></div>`
    : "";

  resultList.innerHTML =
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

  resultList.querySelectorAll("img[data-poke]").forEach(async (img) => {
    const name = img.dataset.poke;
    try {
      const mon = await fetchPokemon(name);
      img.src = mon.sprite || img.src;
    } catch {}
  });
}

function openModal(side, index) {
  state.modal = { side, index };
  modalTitle.textContent =
    side === "self"
      ? `Tu equipo · Slot ${index + 1}`
      : `Rival · Slot ${index + 1}`;
  pickerModal.classList.add("open");
  searchInput.value = "";
  renderPokedex("");
  setTimeout(() => searchInput.focus(), 20);
}

function closeModal() {
  pickerModal.classList.remove("open");
}

async function pickPokemonIntoSlot(side, index, name) {
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
    mon.set = buildDefaultSetForSpecies(mon.name, side, index, mon.types);
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

function resetQuickCombosLock() {
  state.chosenFour = [];
  state.chosenEnemyFour = [];
  state.turn1Custom = false;
}

function clearAll() {
  state.self = Array(6).fill(null);
  state.enemy = Array(6).fill(null);
  
  // SOLUCIÓN: Vaciar los arrays de leads y reiniciar activos
  state.leads = { self: [], enemy: [] };
  state.activeSelfSlots = [0, 1];
  state.activeEnemySlots = [0, 1];
  
  resetQuickCombosLock();
  
  recalculateActiveField();
  renderAll();
}

function swapTeams() {
  const temp = state.self;
  state.self = state.enemy;
  state.enemy = temp;
  
  // SOLUCIÓN: Intercambiar también las elecciones de Turno 1 y Expert
  const tempLeads = state.leads.self;
  state.leads.self = state.leads.enemy;
  state.leads.enemy = tempLeads;
  
  const tempActive = state.activeSelfSlots;
  state.activeSelfSlots = state.activeEnemySlots;
  state.activeEnemySlots = tempActive;
  
  resetQuickCombosLock();
  
  recalculateActiveField();
  renderAll();
}

async function fillTeamWithSpecies(side, speciesList) {
  flowLog('fillTeamWithSpecies: Inicio', { side, speciesList });
  isBatchUpdating = true;
  try {
    const mons = [];
    for (let i = 0; i < Math.min(speciesList.length, 6); i++) {
      try {
        const mon = await fetchPokemon(speciesList[i]);
            mon.set = buildDefaultSetForSpecies(mon.name, side, i, mon.types);
        ensureBattleState(mon);
        mons.push(mon);
      } catch {}
    }
    state[side] = mons;
    while (state[side].length < 6) state[side].push(null);
    
    // SOLUCIÓN: Limpiar los leads del turno 1 y resetear activos
    state.leads[side] = [];
    if (side === "self") state.activeSelfSlots = [0, 1];
    if (side === "enemy") state.activeEnemySlots = [0, 1];
    
    scheduleMoveWarmup();
    flowLog('fillTeamWithSpecies: Completado, scheduleMoveWarmup llamado', { side, monsCount: mons.length });
  } finally {
    isBatchUpdating = false;
    flowLog('fillTeamWithSpecies: finally -> solicitando renderAll', { side });
    renderAll();
  }
}

async function fillMetaPreset(side) {
  const top = state.metaRanked
    .slice(side === "self" ? 0 : 6, side === "self" ? 6 : 12)
    .map((x) => x.slug);
  if (!top.length) {
    alert("Meta no disponible todavía.");
    return;
  }
  await fillTeamWithSpecies(side, top);
}


function getPokemonUtilityFlags(mon) {
  const set = mon?.set || {};
  const moves = set.moves || [];
  const ability = set.ability || "";
  const item = set.item || "";
  return {
    fakeOut: moves.includes("Fake Out"),
    tailwind: moves.includes("Tailwind"),
    trickRoom: moves.includes("Trick Room"),
    redirection: moves.includes("Follow Me") || moves.includes("Rage Powder"),
    protect: moves.includes("Protect") || moves.includes("Detect"),
    weather: ["Drizzle", "Drought", "Sand Stream", "Snow Warning"].includes(
      ability,
    ),
    pivot:
      moves.includes("U-turn") ||
      moves.includes("Volt Switch") ||
      moves.includes("Parting Shot"),
    intimidate: ability === "Intimidate",
  };
}

function scorePokemonForQuickPick(mon, enemyTeam) {
  let score = 50;
  const flags = getPokemonUtilityFlags(mon);

  if (flags.fakeOut) score += 15;
  if (flags.tailwind) score += 10;
  if (flags.redirection) score += 10;
  if (flags.weather) score += 10;
  if (flags.intimidate) score += 15;

  const enemy = enemyTeam.filter(Boolean);
  let strongHits = 0;
  let weakHits = 0;

  for (const e of enemy) {
    const attack = bestAttack(mon, e);
    if (attack.mult >= 2) strongHits++;
    else if (attack.mult < 1) weakHits++;

    const defense = bestAttack(e, mon);
    if (defense.mult >= 2) score -= 10;
    else if (defense.mult < 1) score += 5;
  }

  score += strongHits * 12;
  score -= weakHits * 5;

  return score;
}

function scoreLeadPair(monA, monB, enemyTeam) {
  return scoreLeadPairQuick(monA, monB, enemyTeam);
}

function scoreLeadPairQuick(monA, monB, enemyTeam) {
  let score =
    scorePokemonForQuickPick(monA, enemyTeam) +
    scorePokemonForQuickPick(monB, enemyTeam);
  const flagsA = getPokemonUtilityFlags(monA);
  const flagsB = getPokemonUtilityFlags(monB);

  if (
    (flagsA.fakeOut && flagsB.tailwind) ||
    (flagsB.fakeOut && flagsA.tailwind)
  )
    score += 20;
  if (
    (flagsA.fakeOut && flagsB.trickRoom) ||
    (flagsB.fakeOut && flagsA.trickRoom)
  )
    score += 20;
  if (
    (flagsA.redirection && !flagsB.redirection) ||
    (flagsB.redirection && !flagsA.redirection)
  )
    score += 15;
  if (flagsA.intimidate || flagsB.intimidate) score += 10;
  if (flagsA.weather || flagsB.weather) score += 5;

  if (flagsA.fakeOut && flagsB.fakeOut) score -= 15;
  if (flagsA.tailwind && flagsB.tailwind) score -= 15;

  return score;
}

function calculateMvpScore(mon, selfTeam, enemyTeam) {
  let score = 0;
  let offensiveCount = 0;
  let isDefensiveWall = true;

  for (const enemyMon of enemyTeam) {
    if (!enemyMon) continue;

    if (bestAttack(mon, enemyMon).mult >= 2) {
      offensiveCount++;
    }

    // FIX: Invertir roles correctamente y verificar si el enemigo tiene amenaza real
    const enemyAttack = bestAttack(enemyMon, mon);
    if (enemyAttack.mult >= 2) {
      isDefensiveWall = false;
    }
  }

  if (offensiveCount >= 2) score += 10; // FIX: Flexibilizado a 2 presiones fuertes para detectar más MVPs
  if (isDefensiveWall) score += 15;
  return score;
}

function getSelfCombos() {
  const team = state.self.map((mon, idx) => mon ? idx : null).filter(i => i !== null);
  if (team.length < 4) return [];
  const combos = [];
  for (let a = 0; a < team.length - 3; a++) {
    for (let b = a + 1; b < team.length - 2; b++) {
      for (let c = b + 1; c < team.length - 1; c++) {
        for (let d = c + 1; d < team.length; d++) {
          combos.push([team[a], team[b], team[c], team[d]]);
        }
      }
    }
  }
  return combos;
}

function scoreAntiStrategy(selfMons, enemyMons) {
  const enemyStrategies = inferStrategies(enemyMons);
  let score = 0;
  let notes = [];

  for (const strat of enemyStrategies) {
    if (strat.title === "Trick Room") {
      if (hasMoveInTeam(selfMons, ["Taunt", "Mofa", "Imprison"]) || selfMons.some(m => calculateSpeed(m, 'self') < 60)) {
        score += 20;
        notes.push("Frena Espacio Raro");
      } else {
        score -= 10;
      }
    }
    if (strat.title === "Viento Afín") {
      if (hasMoveInTeam(selfMons, ["Tailwind", "Trick Room", "Icy Wind", "Onda Trueno", "Viento Afín"])) {
        score += 15;
        notes.push("Compite en Tempo");
      }
    }
    if (strat.title === "Lluvia" || strat.title === "Sol" || strat.title === "Arena") {
      if (hasMoveInTeam(selfMons, ["Rain Dance", "Sunny Day", "Sandstorm", "Snowscape", "Danza Lluvia", "Día Soleado", "Tormenta Arena"]) ||
          selfMons.some(m => ["Drizzle", "Drought", "Sand Stream", "Snow Warning", "Cloud Nine", "Llovizna", "Sequía", "Chorro Arena", "Nevada"].includes(m.set?.ability))) {
        score += 25;
        notes.push("Interrumpe Clima");
      }
    }
    if (strat.title === "Soporte" || strat.title === "Pivot") {
      if (hasMoveInTeam(selfMons, ["Fake Out", "Sorpresa", "Protect", "Protección"])) {
        score += 10;
        notes.push("Frena Setup Inicial");
      }
    }
  }
  return { score, notes };
}

function scoreEnemyThreatVsCombo(enemyMon, comboMons) {
  if (!comboMons.length) return { score: 0, maxEnemyPressure: 1 };
  const enemyVsSelf = comboMons.map(selfMon => bestAttack(enemyMon, selfMon));
  const maxEnemyPressure = Math.max(...enemyVsSelf.map(x => x.mult), 1);
  const strongAnswers = comboMons.filter(selfMon => bestAttack(selfMon, enemyMon).mult >= 2);

  const setMoves = enemyMon?.set?.moves || [];
  let score = 30;

  score += maxEnemyPressure >= 4 ? 28 : maxEnemyPressure >= 2 ? 16 : 6;
  if (setMoves.includes("Tailwind") || setMoves.includes("Viento Afín")) score += 14;
  
  if (setMoves.includes("Trick Room") || setMoves.includes("Espacio Raro")) {
    const isBeneficialForUs = comboMons.some(m => {
      const bSpe = m.baseStats?.speed || 100;
      const bAtk = m.baseStats?.attack || 0;
      const bSpa = m.baseStats?.["special-attack"] || 0;
      return bSpe <= 60 && (bAtk >= 90 || bSpa >= 90);
    });
    
    if (isBeneficialForUs) {
       score -= 10; // Sinergia por robo de campo, reducimos el peligro del enemigo
    } else {
       score += 14;
    }
  }

  if (setMoves.includes("Fake Out") || setMoves.includes("Sorpresa")) score += 10;
  if (setMoves.includes("Follow Me") || setMoves.includes("Rage Powder") || setMoves.includes("Señuelo") || setMoves.includes("Polvo Ira")) score += 10;
  if (setMoves.includes("Parting Shot") || setMoves.includes("Snarl") || setMoves.includes("Encore") || setMoves.includes("Última Palabra") || setMoves.includes("Alarido") || setMoves.includes("Otra Vez")) score += 8;
  if ((enemyMon.set?.ability || "").includes("Intimidat") || (enemyMon.set?.ability || "").includes("Intimidac")) score += 8;

  score -= Math.min(18, strongAnswers.length * 7);
  if (strongAnswers.some(x => bestAttack(x, enemyMon).mult >= 4)) score -= 6;

  return { score: Math.max(0, Math.min(100, score)), maxEnemyPressure };
}

let lastTeamHash = '';
let cachedQuickCombos = [];

function buildQuickCombos() {
  window.comboSpeedCache = {};
  const teamHash = state.self.map(m => m ? m.name : '').join('|') + 'VS' + state.enemy.map(m => m ? m.name : '').join('|');
  if (teamHash === lastTeamHash && cachedQuickCombos.length > 0) {
    if (DEBUG_MODE) console.log('⚡ [QUICK COMBOS] Usando caché de combinaciones.');
    return cachedQuickCombos;
  }

  if (DEBUG_MODE) console.groupCollapsed('🤖 [QUICK COMBOS] Seleccionando Top 3 recomendaciones');

  if (!state.combos || state.combos.length === 0) {
      if (DEBUG_MODE) console.groupEnd();
      return [];
  }

  const selected = [];
  const usedLeads = new Set();

  for (const combo of state.combos) {
    const mons = combo.orderedIdx ? combo.orderedIdx.map(i => state.self[i]).filter(Boolean) : combo.indices.map(i => state.self[i]).filter(Boolean);
    if (mons.length < 2) continue;

    const leadSig = [mons[0].name, mons[1].name].sort().join('-');

    if (usedLeads.has(leadSig)) {
      if (DEBUG_MODE) console.log(`⏭️ Descartado: ${mons.map(m=>m.displayName).join(', ')} (leads ${mons[0].displayName} + ${mons[1].displayName} ya usados).`);
      continue;
    }

    selected.push(combo);
    usedLeads.add(leadSig);
    
    if (selected.length === 3) break;
  }

  if (selected.length < 3) {
    if (DEBUG_MODE) console.log('⚠️ No se encontraron 3 combos con leads únicos. Rellenando con los siguientes mejores.');
    for (const combo of state.combos) {
      if (!selected.includes(combo)) selected.push(combo);
      if (selected.length === 3) break;
    }
  }

  if (DEBUG_MODE) {
    console.log(`✅ Selección finalizada. Top 3 recomendaciones listas.`);
    console.groupEnd();
  }

  lastTeamHash = teamHash;
  cachedQuickCombos = selected;
  return selected;
}

function hasMoveInTeam(team, moveNames) {
  const target = new Set(moveNames.map(m => String(m).toLowerCase()));
  return team.some(mon =>
    mon?.set?.moves?.some(m => target.has(String(m).toLowerCase()))
  );
}

function scoreOffensiveCoverage(selfMons, enemyMons) {
  if (!enemyMons.length) return 0;

  let totalThreat = 0;
  let maxPossible = enemyMons.length * 100;

  for (const enemy of enemyMons) {
    let best = null;
    for (const selfMon of selfMons) {
      const res = bestAttack(selfMon, enemy);
      if (!best || res.damage > best.damage) best = res;
    }
    if (!best) continue;

    let score = 0;
    if (best.mult >= 2) score += 40;
    if (best.mult >= 4) score += 20;
    score += Math.min(40, best.ohkoProb * 0.4);

    totalThreat += score;
  }

  return Math.round((totalThreat / maxPossible) * 100);
}

function scoreDefensiveSafety(selfMons, enemyMons) {
  if (!enemyMons.length) return 0;

  let total = 0;
  const max = selfMons.length * 100;

  for (const selfMon of selfMons) {
    let worst = null;
    for (const enemy of enemyMons) {
      const res = bestAttack(enemy, selfMon);
      if (!worst || res.damage > worst.damage) worst = res;
    }
    if (!worst) continue;

    let score = 100;
    if (worst.mult >= 2) score -= 30;
    if (worst.mult >= 4) score -= 50;
    if (worst.ohkoProb >= 50) score -= 30;
    if (worst.ohkoProb >= 90) score -= 20;

    total += Math.max(0, score);
  }

  return Math.round((total / max) * 100);
}

function scoreSpeedAndTempo(selfMons, enemyMons) {
  const selfSpeeds  = selfMons.map(m => calculateSpeed(m, 'self')).sort((a,b)=>b-a);
  const enemySpeeds = enemyMons.map(m => calculateSpeed(m, 'enemy')).sort((a,b)=>b-a);

  if (!selfSpeeds.length || !enemySpeeds.length) return 0;

  const fastestEnemy = enemySpeeds[0];
  const outspeeders = selfSpeeds.filter(s => s > fastestEnemy).length;
  let score = (outspeeders / selfSpeeds.length) * 60;

  if (hasMoveInTeam(selfMons, ['Tailwind', 'Viento Afín'])) score += 20;
  if (hasMoveInTeam(selfMons, ['Trick Room', 'Espacio Raro'])) score += 20;
  if (hasMoveInTeam(selfMons, ['Thunder Wave', 'Icy Wind', 'Onda Trueno', 'Viento Hielo'])) score += 10;

  return Math.round(Math.min(100, score));
}

const TOOL_GROUPS = {
  fakeOut:   ['Fake Out', 'Sorpresa'],
  redir:     ['Follow Me', 'Rage Powder', 'Señuelo', 'Polvo Ira'],
  pivot:     ['Parting Shot', 'U-turn', 'Volt Switch', 'Flip Turn', 'Ida y Vuelta', 'Voltiocambio'],
  protections: ['Wide Guard', 'Quick Guard', 'Vasta Guardia', 'Anticipo'],
  statusCtrl: ['Taunt', 'Haze', 'Mofa', 'Niebla'],
};

function scoreTools(selfMons) {
  let score = 0;

  if (hasMoveInTeam(selfMons, TOOL_GROUPS.fakeOut))      score += 25;
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.redir))        score += 25;
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.pivot))        score += 20;
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.protections))  score += 15;
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.statusCtrl))   score += 15;

  const protectUsers = selfMons.filter(m =>
    m?.set?.moves?.some(x => ['protect', 'protección', 'detect', 'detección'].includes(String(x).toLowerCase()))
  ).length;
  score += Math.min(20, protectUsers * 7);

  return Math.round(Math.min(100, score));
}

function scoreRedundancyPenalty(selfMons, enemyMons) {
  const weaknessCount = new Map();

  for (const selfMon of selfMons) {
    const types = selfMon.types || [];
    for (const attackType in TYPE_CHART) {
      const mult = effectiveness(attackType, types);
      if (mult >= 2) {
        weaknessCount.set(attackType, (weaknessCount.get(attackType) || 0) + 1);
      }
    }
  }

  let penalty = 0;
  for (const [type, count] of weaknessCount.entries()) {
    if (count >= 3) penalty += 15;
    else if (count === 2) penalty += 5;
  }

  for (const enemy of enemyMons) {
    const enemyMoves = enemy.set?.moves || [];
    for (const moveName of enemyMoves) {
      const moveId = String(moveName).toLowerCase().replace(/[^a-z0-9]/g, '');
      const moveData = typeof MOVES_DB !== 'undefined' ? MOVES_DB[moveId] : null;
      if (moveData && weaknessCount.get(moveData.type) >= 2) {
        penalty += 5;
      }
    }
  }

  return penalty;
}

function classifyTeamRoles(selfMons, enemyMons) {
  const roles = new Map();

  const baseScore = typeof scoreBoard === 'function' ? scoreBoard(state, 'self') : 0;

  for (const mon of selfMons) {
    if (!mon) continue;
    // "Quitar" mon del equipo y ver cuánto empeora el tablero
    const tmpState = structuredClone(state);
    const tmpSelf = tmpState.self;
    const idx = tmpSelf.findIndex((m) => m && m.name === mon.name);
    if (idx !== -1) {
      tmpSelf[idx] = null;
    }
    const newScore = typeof scoreBoard === 'function' ? scoreBoard(tmpState, 'self') : 0;
    const delta = baseScore - newScore;

    // delta grande -> wincon; delta pequeño -> redundante
    let role = 'glue';
    if (delta >= 2000) role = 'wincon';
    else if (delta <= 200) role = 'redundante';

    roles.set(mon, { role, impact: delta });
  }

  return roles;
}

function derivePlanType(m) {
  const { offCoverage, defSafety, speedControl, toolsScore, redundancyPen } = m;

  if (offCoverage >= 75 && speedControl >= 60 && defSafety < 55) {
    return 'agresivo';
  }
  if (defSafety >= 75 && offCoverage < 65) {
    return 'defensivo';
  }
  if (speedControl >= 70 && toolsScore >= 60) {
    return 'tempo';
  }
  if (redundancyPen >= 30 && defSafety < 60) {
    return 'riesgoso';
  }
  return 'balanceado';
}

function getTeamWeakTypes(selfMons) {
  const weaknessCount = new Map();
  for (const mon of selfMons) {
    const types = mon.types || [];
    for (const atk in TYPE_CHART) {
      if (effectiveness(atk, types) >= 2) {
        weaknessCount.set(atk, (weaknessCount.get(atk) || 0) + 1);
      }
    }
  }
  return Array.from(weaknessCount.entries())
    .sort((a,b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type]) => TYPE_META[type]?.name || type);
}

function getTeamStrongVsEnemy(selfMons, enemyMons) {
  const strongTargets = [];
  for (const enemy of enemyMons) {
    for (const selfMon of selfMons) {
      const best = bestAttack(selfMon, enemy);
      if (best.mult >= 2 || best.ohko) {
        strongTargets.push(enemy.displayName);
        break;
      }
    }
  }
  return [...new Set(strongTargets)].slice(0, 2);
}

function derivePlanText(planType, metrics, selfMons, enemyMons) {
  const weakTypes = getTeamWeakTypes(selfMons);
  const strongTargets = getTeamStrongVsEnemy(selfMons, enemyMons);

  const strongStr = strongTargets.length
    ? `Presionas especialmente bien a ${strongTargets.join(' y ')}.`
    : `Tienes opciones razonables contra la mayoría de amenazas rivales.`;

  const weakStr = weakTypes.length
    ? `Cuidado con ataques de tipo ${weakTypes.join(' y ')}.`
    : `No compartes debilidades graves entre tus cuatro Pokémon.`;

  let toolsList = [];
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.fakeOut)) toolsList.push('Fake Out');
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.redir)) toolsList.push('Redirección');
  if (hasMoveInTeam(selfMons, ['Tailwind', 'Viento Afín'])) toolsList.push('Tailwind');
  if (hasMoveInTeam(selfMons, ['Trick Room', 'Espacio Raro'])) toolsList.push('Trick Room');
  if (hasMoveInTeam(selfMons, TOOL_GROUPS.pivot)) toolsList.push('Pivot');
  const toolsStr = toolsList.length ? `[${toolsList.join('], [')}]` : 'Sin utilidad destacada';

  switch (planType) {
    case 'agresivo':
      return {
        planTitle: 'Plan: Abrir pegando fuerte.',
        planDescription: `${strongStr} Tu defensa es más frágil, así que busca trades ventajosos en los primeros turnos.`,
        keyLine: 'Clave: No regales turnos; fuerza intercambios donde ganes el tempo.',
        toolsStr
      };
    case 'defensivo':
      return {
        planTitle: 'Plan: Absorber y castigar.',
        planDescription: `${weakStr} Juega alrededor de las amenazas clave y aprovecha tus resistencias para entrar y salir.`,
        keyLine: 'Clave: Prioriza Protect y cambios seguros antes de exponerte a OHKOs.',
        toolsStr
      };
    case 'tempo':
      return {
        planTitle: 'Plan: Controlar el tempo de la partida.',
        planDescription: `Tu combinación tiene buen acceso a control de velocidad. Establece Tailwind o Trick Room y luego presiona con tus breakers.`,
        keyLine: 'Clave: Usa el primer turno para fijar el ritmo (TW/TR) en lugar de buscar daño bruto.',
        toolsStr
      };
    case 'riesgoso':
      return {
        planTitle: 'Plan: Presión alta con riesgo elevado.',
        planDescription: `${strongStr} Sin embargo, ${weakStr.toLowerCase()}`,
        keyLine: 'Clave: Evita situaciones donde el rival pueda explotar tus debilidades compartidas.',
        toolsStr
      };
    default:
      return {
        planTitle: 'Plan: Presión equilibrada desde el turno 1.',
        planDescription: `${strongStr} ${weakStr}`,
        keyLine: 'Clave: Alterna turnos agresivos con turnos de protección y reposicionamiento.',
        toolsStr
      };
  }
}

function evaluateCombo(indices) {
  const selfMons = indices.map(i => state.self[i]).filter(Boolean);
  const enemyMons = state.enemy.filter(Boolean);
  if (selfMons.length < 4 || !enemyMons.length) {
    return {
      indices,
      score: 0,
      planType: 'desconocido',
      planTitle: 'Datos insuficientes',
      planDescription: 'Añade 4 Pokémon propios y al menos 1 rival.',
      keyLine: '',
      toolsStr: ''
    };
  }

  // Inferencia de la Mejor Respuesta Rival (Micro-Simulación)
  const enemyThreats = enemyMons.map(enemy => ({
    enemy,
    threat: scoreEnemyThreatVsCombo(enemy, selfMons).score
  })).sort((a, b) => b.threat - a.threat);
  
  const expectedEnemyTeam = enemyThreats.slice(0, 4).map(e => e.enemy);
  if (!expectedEnemyTeam.length) expectedEnemyTeam.push(...enemyMons); // Fallback

  // Pre-seleccionamos nuestros leads contra el equipo previsto
  const comboTemp = { indices };
  chooseLeadsForCombo(comboTemp, expectedEnemyTeam);
  const selfLeads = comboTemp.leads.map(i => state.self[i]).filter(Boolean);
  const selfBacks = comboTemp.orderedIdx.slice(2).map(i => state.self[i]).filter(Boolean);

  // Inferimos probables leads rivales (los 2 más amenazantes) y backs
  const enemyLeads = expectedEnemyTeam.slice(0, 2);
  const enemyBacks = expectedEnemyTeam.slice(2, 4);

  // Clón del campo para la simulación de este combo
  const simField = { ...state.field };

  // Función interna rápida para aplicar climas/terrenos de entrada
  const applyEntryHazards = (mon) => {
      if (!mon) return;
      const ability = (mon.set?.ability || mon.ability || '').toLowerCase().replace(/\\s/g, '');
      if (ability === 'drought') simField.weather = 'sun';
      if (ability === 'drizzle') simField.weather = 'rain';
      if (ability === 'sandstream') simField.weather = 'sandstorm';
      if (ability === 'snowwarning') simField.weather = 'snow';
      if (ability === 'psychicsurge') simField.terrain = 'psychic';
      if (ability === 'grassysurge') simField.terrain = 'grassy';
      if (ability === 'electricsurge') simField.terrain = 'electric';
      if (ability === 'mistysurge') simField.terrain = 'misty';
  };

  // Aplicar a los 4 Pokémon en el campo
  applyEntryHazards(selfLeads[0]);
  applyEntryHazards(selfLeads[1]);
  applyEntryHazards(enemyLeads[0]);
  applyEntryHazards(enemyLeads[1]);

  // Flags para estrategias
  const selfHasTailwind = hasMoveInTeam(selfMons, ['Tailwind', 'Viento Afín']);
  const enemyHasTailwind = hasMoveInTeam(expectedEnemyTeam, ['Tailwind', 'Viento Afín']);
  const selfHasTR = hasMoveInTeam(selfMons, ['Trick Room', 'Espacio Raro']);
  const enemyHasTR = hasMoveInTeam(expectedEnemyTeam, ['Trick Room', 'Espacio Raro']);
  const enemyHasFakeOut = hasMoveInTeam(expectedEnemyTeam, ['Fake Out', 'Sorpresa']);
  const selfHasProtect = hasMoveInTeam(selfMons, ['Protect', 'Protección']);
  const selfHasCloak = selfMons.some(m => m.set?.item === 'Covert Cloak' || m.set?.item === 'Capa Furtiva');
  const enemyHasWeather = expectedEnemyTeam.some(m => m.set?.ability && ['Drizzle', 'Drought', 'Sand Stream', 'Snow Warning', 'Llovizna', 'Sequía', 'Chorro Arena', 'Nevada'].includes(m.set.ability));

  const SPREAD_MOVES = new Set(['earthquake', 'terremoto', 'dazzling gleam', 'brillo mágico', 'make it rain', 'fiebre dorada', 'rock slide', 'avalancha', 'water spout', 'salpicar', 'eruption', 'estallido', 'heat wave', 'onda ígnea', 'hyper voice', 'vozarrón', 'blizzard', 'ventisca', 'muddy water', 'agua lodosa', 'discharge', 'chispazo', 'icy wind', 'viento hielo', 'snarl', 'alarido', 'electroweb', 'red viscosa']);
  const PRIORITY_MOVES = new Set(['extreme speed', 'velocidad extrema', 'aqua jet', 'acua jet', 'fake out', 'sorpresa', 'mach punch', 'ultrapuño', 'bullet punch', 'puño bala', 'sucker punch', 'golpe bajo', 'ice shard', 'canto helado', 'shadow sneak', 'sombra vil', 'vacuum wave', 'onda vacío', 'quick attack', 'ataque rápido', 'first impression', 'escaramuza']);
  const SETUP_MOVES = new Set(['swords dance', 'danza espada', 'nasty plot', 'maquinación', 'dragon dance', 'danza dragón', 'quiver dance', 'danza aleteo', 'calm mind', 'paz mental', 'tailwind', 'viento afín', 'trick room', 'espacio raro']);

  // 1. Calcular Puntuación Neta Diferencial (Net Matchup Score)
  let allyThreat = 0;
  let enemyThreat = 0;
  let criticalRiskText = null;
  let isDeadTurn1 = false;
  let spreadWarning = null;
  let defaultStrategyParts = [];
  const t1SimCache = { field: simField, attacks: {} };

  selfLeads.forEach(sLead => {
    let sLeadSpeed = Number(calculateSpeed(sLead, 'self', simField));
    if (selfHasTailwind) sLeadSpeed *= 2;

    enemyLeads.forEach(eLead => {
      let eLeadSpeed = Number(calculateSpeed(eLead, 'enemy', simField));
      if (enemyHasTailwind) eLeadSpeed *= 2;

      // Buscar si el *otro* enemigo tiene redirección y lo va a usar
      const otherELead = enemyLeads.find(m => m !== eLead);
      let otherELeadRedirects = false;
      let otherELeadCand = null;
      if (otherELead) {
          const otherAtkOnAlly = bestAttack(otherELead, sLead, simField);
          otherELeadRedirects = ['followme', 'ragepowder'].includes(String(otherAtkOnAlly.move).toLowerCase().replace(/[^a-z]/g, ''));
      }

      // Daño/Amenaza de nuestros 4 vs sus 4 (Leads)
      let atkOnEnemy = bestAttack(sLead, eLead, simField);
      t1SimCache.attacks[`self_${sLead.name}_vs_enemy_${eLead.name}`] = atkOnEnemy;

      // Si el OTRO rival usa redirección, nuestros ataques single-target DEBEN ir al redirector, reduciendo el score si no lo matamos.
      if (otherELeadRedirects && !SPREAD_MOVES.has(String(atkOnEnemy.move).toLowerCase())) {
          const cand = getMoveCandidates(sLead).find(m => m.move === atkOnEnemy.move) || atkOnEnemy;
          const redirDmg = estimateMoveDamage(sLead, otherELead, cand, simField);
          // Reemplazamos el daño y reducimos el multiplicador al golpear al objetivo incorrecto
          atkOnEnemy = { ...atkOnEnemy, damage: redirDmg.damage, mult: 0.5, ohko: redirDmg.damage >= calcMonHP(otherELead) };
      }

      if (atkOnEnemy.mult >= 2) allyThreat += 15;
      else if (atkOnEnemy.mult >= 1) allyThreat += 5;
      if (atkOnEnemy.ohko) allyThreat += 10;

      const isAllyPriority = atkOnEnemy.move && PRIORITY_MOVES.has(String(atkOnEnemy.move).toLowerCase());
      const isAllySpread = atkOnEnemy.move && SPREAD_MOVES.has(String(atkOnEnemy.move).toLowerCase());

      if (isAllySpread && atkOnEnemy.ohko && !spreadWarning) {
         spreadWarning = `El KO de ${sLead.displayName || sLead.name} depende de daño en área (${atkOnEnemy.move}), que se reduce un 25% en Dobles.`;
      }
      
      if (atkOnEnemy.mult >= 2) {
         defaultStrategyParts.push(`Nuestro ${formatName(sLead.displayName || sLead.name)} frena a su ${formatName(eLead.displayName || eLead.name)} con daño x${atkOnEnemy.mult}.`);
      }

      // Daño/Amenaza de sus 4 vs nuestros 4 (Leads)
      const atkOnAlly = bestAttack(eLead, sLead, simField);

      if (atkOnAlly.mult >= 2) enemyThreat += 15;
      else if (atkOnAlly.mult >= 1) enemyThreat += 5;
      if (atkOnAlly.ohko) enemyThreat += 10;
      
      // 1. APLICAR FASE DE ENTRADA AL SIMFIELD ANTES DE NADA
      const simFieldLocal = { ...state.field };
      const applyHazards = (mon) => {
          if (!mon) return;
          const ab = (mon.set?.ability || mon.ability || mon.baseSpecies?.ability || '').toLowerCase().replace(/[^a-z]/g, '');
          if (ab === 'drought' || mon.name.toLowerCase().includes('charizardmegay')) simFieldLocal.weather = 'sun';
          if (ab === 'drizzle' || mon.name.toLowerCase().includes('pelipper')) simFieldLocal.weather = 'rain';
          if (ab === 'psychicsurge') simFieldLocal.terrain = 'psychic';
      };
      const sLead2 = selfLeads.find(m => m !== sLead);
      const eLead2 = enemyLeads.find(m => m !== eLead);
      applyHazards(sLead); applyHazards(sLead2);
      applyHazards(eLead); applyHazards(eLead2);

      // 2. CALCULAR VELOCIDAD USANDO EL SIMFIELD YA CON CLIMA
      let sLeadSpeedNum = Number(calculateSpeed(sLead, 'self', simFieldLocal)) || 0;
      let eLeadSpeedNum = Number(calculateSpeed(eLead, 'enemy', simFieldLocal)) || 0;
      if (selfHasTailwind) sLeadSpeedNum *= 2;
      if (enemyHasTailwind) eLeadSpeedNum *= 2;

      // 3. OBTENER PRIORIDAD ESTRICTA (Hardcodeada para evitar fallos de arrays externos)
      const getPrio = (moveObj) => {
          if (!moveObj || !moveObj.move) return 0;
          const m = moveObj.move.toLowerCase().replace(/[^a-z]/g, '');
          if (['fakeout', 'firstimpression'].includes(m)) return 3;
          if (['extremespeed'].includes(m)) return 2;
          if (['suckerpunch', 'aquajet', 'machpunch', 'bulletpunch', 'iceshard', 'shadowsneak', 'grassyglide'].includes(m)) return 1;
          if (['trickroom'].includes(m)) return -7;
          return 0;
      };

      const sPriority = getPrio(atkOnEnemy);
      const ePriority = getPrio(atkOnAlly);

      // 4. DECIDIR QUIÉN ATACA PRIMERO
      let enemyIsFaster = false;
      if (ePriority > sPriority) {
          enemyIsFaster = true;
      } else if (sPriority > ePriority) {
          enemyIsFaster = false;
      } else {
          enemyIsFaster = eLeadSpeedNum > sLeadSpeedNum;
      }

      // Logear la decisión del motor para debuguear desincronizaciones
      smartLog(
          `prio-${sLead.name}-${eLead.name}`,
          `⚖️ [PRIORITY CHECK] Aliado: ${sLead.name} (Vel:${sLeadSpeedNum}, Prio:${sPriority}) vs Rival: ${eLead.name} (Vel:${eLeadSpeedNum}, Prio:${ePriority}) => Ataca Primero: ${enemyIsFaster ? 'RIVAL' : 'ALIADO'}`
      );

      // INTELIGENCIA TÁCTICA: PROTECT Y FAKE OUT
      const sLeadMoves = (sLead.set?.moves || []).map(m => m.toLowerCase().replace(/[^a-z]/g, ''));
      const hasProtect = sLeadMoves.includes('protect') || sLeadMoves.includes('proteccion');
      const hasFakeOut = sLeadMoves.includes('fakeout') || sLeadMoves.includes('sorpresa');

      if (enemyIsFaster && atkOnAlly.ohko) {
          if (hasProtect) {
              allyThreat += 15;
              defaultStrategyParts.push(`El rival amenaza a ${sLead.displayName || sLead.name}, pero tenemos Protección para ganar la posición.`);
              atkOnAlly.ohko = false;
          } else if (hasFakeOut) {
              allyThreat += 20;
              defaultStrategyParts.push(`Usa Sorpresa con ${sLead.displayName || sLead.name} para neutralizar a la amenaza rival el Turno 1.`);
              atkOnAlly.ohko = false;
          } else {
              isDeadTurn1 = true;
              enemyThreat += 50; // Penalización masiva
              if (!criticalRiskText) {
                  criticalRiskText = `Riesgo Crítico: ${formatName(eLead.displayName || eLead.name)} supera en velocidad y elimina a ${formatName(sLead.displayName || sLead.name)}.`;
              }
          }
      }
    });
  });

  // 2. Sumar resistencia defensiva de Backs vs atacantes rivales
  let backDefenseScore = 0;
  selfBacks.forEach(sBack => {
    expectedEnemyTeam.forEach(eAtk => {
      const eAtkMove = bestAttack(eAtk, sBack);
      if (eAtkMove.mult < 1) backDefenseScore += 10; // resiste bien
      else if (eAtkMove.mult === 1) backDefenseScore += 2; // neutral
      else backDefenseScore -= 5; // débil
    });
  });

  // 3. Sinergia de Roles en Dobles
  let synergyScore = 0;
  let synergyText = null;

  if (selfLeads.length === 2) {
    const [lead1, lead2] = selfLeads;
    const hasFakeOut1 = (lead1.set?.moves || []).some(m => String(m).toLowerCase() === 'fake out' || String(m).toLowerCase() === 'sorpresa');
    const hasFakeOut2 = (lead2.set?.moves || []).some(m => String(m).toLowerCase() === 'fake out' || String(m).toLowerCase() === 'sorpresa');
    const hasSetup1 = (lead1.set?.moves || []).some(m => SETUP_MOVES.has(String(m).toLowerCase())) || (lead1.baseStats?.attack >= 120 || lead1.baseStats?.['special-attack'] >= 120);
    const hasSetup2 = (lead2.set?.moves || []).some(m => SETUP_MOVES.has(String(m).toLowerCase())) || (lead2.baseStats?.attack >= 120 || lead2.baseStats?.['special-attack'] >= 120);

    if ((hasFakeOut1 && hasSetup2) || (hasFakeOut2 && hasSetup1)) {
       synergyScore += 20;
       const foUser = hasFakeOut1 ? lead1 : lead2;
       const setupUser = hasFakeOut1 ? lead2 : lead1;
       synergyText = `Usa Sorpresa con ${foUser.displayName || foUser.name} para asegurar el ataque/setup de ${setupUser.displayName || setupUser.name}.`;
    }

    const redirMoves = ['follow me', 'señuelo', 'rage powder', 'polvo ira'];
    const hasRedir1 = (lead1.set?.moves || []).some(m => redirMoves.includes(String(m).toLowerCase()));
    const hasRedir2 = (lead2.set?.moves || []).some(m => redirMoves.includes(String(m).toLowerCase()));
    
    if (hasRedir1 || hasRedir2) {
       const redirUser = hasRedir1 ? lead1 : lead2;
       const protectedUser = hasRedir1 ? lead2 : lead1;
       const isProtectedWeak = enemyLeads.some(eLead => bestAttack(eLead, protectedUser).mult >= 2);
       if (isProtectedWeak) {
          synergyScore += 25;
          if (!synergyText) synergyText = `Redirige ataques con ${redirUser.displayName || redirUser.name} para proteger la debilidad de ${protectedUser.displayName || protectedUser.name}.`;
       }
    }
  }

  const selfHasIntimidate = selfMons.some(m => m.set?.ability && (String(m.set.ability).toLowerCase() === 'intimidate' || String(m.set.ability).toLowerCase() === 'intimidación'));
  const enemyHasPhysical = expectedEnemyTeam.some(m => (m.baseStats?.attack || 0) > 90);
  if (selfHasIntimidate && enemyHasPhysical) {
     synergyScore += 15;
     if (!synergyText) synergyText = synergyText ? synergyText + ' Usa Intimidación para debilitar a sus atacantes físicos.' : `Usa Intimidación para ciclar y debilitar a los atacantes físicos rivales.`;
  }

  // Pivot check
  let pivotText = null;
  if (!isDeadTurn1) {
      const scaryEnemy = enemyLeads.find(eLead => selfLeads.some(sLead => bestAttack(eLead, sLead).mult >= 2));
      if (scaryEnemy) {
          const safeBack = selfBacks.find(sBack => bestAttack(scaryEnemy, sBack).mult < 1);
          if (safeBack) {
              pivotText = `Riesgo de ${scaryEnemy.displayName || scaryEnemy.name}, pero tenemos a ${safeBack.displayName || safeBack.name} en reserva para pivotar.`;
          }
      }
  }

  // Net Matchup Score
  let rawScore = 30 + (allyThreat - enemyThreat) + backDefenseScore + synergyScore;
  
  if (isDeadTurn1) {
    rawScore = -100; // Asegurar que NUNCA tenga score positivo ni entre al Top 3
  }

  // 4. Planes Tácticos Contextuales (Lectura de Movimientos)
  let planType = 'balanceado';
  let planTitle = 'Plan: Presión equilibrada desde el turno 1.';
  let planDescription = 'Juega alternando turnos agresivos y de reposicionamiento según el matchup.';
  let planStrategy = [];

  if (criticalRiskText) {
    planStrategy.push(criticalRiskText);
  } else {
    // Si no hay OHKOs rápidos, busca ventajas de campo y sinergias
    if (synergyText) planStrategy.push(synergyText);
    else if (pivotText) planStrategy.push(pivotText);
    else if (defaultStrategyParts.length > 0) {
      // Eliminar duplicados
      const uniqueParts = [...new Set(defaultStrategyParts)];
      planStrategy.push(uniqueParts.slice(0, 2).join(' Mientras '));
    }
    
    if (spreadWarning) planStrategy.push(spreadWarning);

    if (selfHasTailwind && !enemyHasTailwind) {
      planType = 'tempo';
      planTitle = 'Control de Velocidad (Viento Afín) + Presión Ofensiva';
      planDescription = 'Aprovecha tu ventaja de Tailwind para golpear primero y superar sus amenazas.';
      rawScore += 10;
    }
    
    if (enemyHasFakeOut) {
      if (selfHasProtect || selfHasCloak) {
        planStrategy.push('Protección Turno 1 para evitar Sorpresa.');
        rawScore += 5;
      } else {
        planStrategy.push('Cuidado con Sorpresa (Fake Out) rival.');
        rawScore -= 5;
      }
    }

    if (selfHasTR && enemyHasTR) {
      planType = 'trickroom_war';
      planTitle = 'Guerra de Espacio Raro (Matchup de Velocidad Lenta)';
      planDescription = 'Ambos equipos tienen Espacio Raro. Intenta denegar su activación o usarla a tu favor.';
      rawScore += 15; 
    } else if (selfHasTR && !enemyHasTR) {
      planType = 'trickroom';
      planTitle = 'Control de Velocidad (Espacio Raro)';
      planDescription = 'Usa Espacio Raro para revertir su ventaja de velocidad.';
      rawScore += 10;
    }

    if (enemyHasWeather && simField.weather) planStrategy.push(`Clima rival detectado: ${weatherNames[simField.weather] || simField.weather}.`);
    else if (enemyHasWeather) planStrategy.push('Clima rival detectado.');
  }

  const strategyText = planStrategy.join(' ');

  // A diferencia de antes, permitimos scores negativos para que el sort los hunda
  const finalScore = isDeadTurn1 ? -100 : Math.round(rawScore);

  if (DEBUG_MODE) {
    const allyNames = selfLeads.map(m => m.displayName || m.name).join('+');
    const enemyNames = expectedEnemyTeam.map(m => m.displayName || m.name).slice(0,2).join('+');
    console.log(`[EVAL] Aliados: ${allyNames} | VS Previsto: ${enemyNames} | Puntuación Real: ${finalScore} | Estrategia: ${strategyText || 'Matchup neutral'}`);
  }

  const combo = {
    indices,
    mons: selfMons,
    score: finalScore,
    planType,
    planTitle,
    planDescription,
    keyLine: strategyText,
    toolsStr: '',
    planIcon: 'scale',
    leads: comboTemp.leads,
    leadScore: comboTemp.leadScore,
    orderedIdx: comboTemp.orderedIdx,
    predictedEnemyLeads: enemyLeads,
    predictedEnemyBack: enemyBacks
  };

  return combo;
}

function scoreLeadPairForCombo(monA, monB, enemyTeam) {
  let score = scorePokemonForQuickPick(monA, enemyTeam) + scorePokemonForQuickPick(monB, enemyTeam);
  const flagsA = getPokemonUtilityFlags(monA);
  const flagsB = getPokemonUtilityFlags(monB);
  if ((flagsA.fakeOut && flagsB.tailwind) || (flagsB.fakeOut && flagsA.tailwind)) score += 20;
  if ((flagsA.fakeOut && flagsB.trickRoom) || (flagsB.fakeOut && flagsA.trickRoom)) score += 20;
  if ((flagsA.redirection && !flagsB.redirection) || (flagsB.redirection && !flagsA.redirection)) score += 15;
  if (flagsA.intimidate || flagsB.intimidate) score += 10;
  if (flagsA.weather || flagsB.weather) score += 5;
  if (flagsA.fakeOut && flagsB.fakeOut) score -= 15;
  if (flagsA.tailwind && flagsB.tailwind) score -= 15;
  return score;
}

function chooseLeadsForCombo(combo, enemyTeam) {
  const indices = combo.indices;
  let bestPair = [indices[0], indices[1]];
  let bestScore = -Infinity;
  const chosenMons = indices.map(i => state.self[i]);

  for (let i = 0; i < indices.length; i++) {
    for (let j = i+1; j < indices.length; j++) {
      const pair = [indices[i], indices[j]];
      const s = scoreLeadPairForCombo(chosenMons[i], chosenMons[j], enemyTeam);
      if (s > bestScore) {
        bestScore = s;
        bestPair = pair;
      }
    }
  }
  combo.leads = bestPair;
  combo.leadScore = bestScore;
  combo.orderedIdx = [...bestPair, ...indices.filter(idx => !bestPair.includes(idx))];
}

function evaluateAllCombos() {
  flowLog('evaluateAllCombos: Inicio');
  const enemyTeam = state.enemy.filter(Boolean);
  if (state.self.filter(Boolean).length < 4 || !enemyTeam.length) {
    state.combos = [];
    return;
  }

  // --- RENDIMIENTO: PRE-CÁLCULO y CACHÉ O(1) ---
  window.comboSpeedCache = {};
  window.comboBestAttackCache = {};
  
  const allMons = [...state.self.filter(Boolean), ...enemyTeam];
  // Simulamos campo limpio para la evaluación base de combos
  const backupField = { weather: state.field.weather, terrain: state.field.terrain };
  state.field.weather = null;
  state.field.terrain = null;

  for (const mon of allMons) {
      window.comboSpeedCache[mon.name] = calculateSpeed(mon, state.self.includes(mon) ? 'self' : 'enemy');
      // Pre-llenamos el caché de daño (bestAttack) evaluando cada cruce 1 vez
      for (const target of allMons) {
          if (mon === target) continue;
          bestAttack(mon, target);
      }
  }

  const combosIndices = getSelfCombos();
  flowLog('evaluateAllCombos: Evaluando combinaciones', { totalCombos: combosIndices.length });
  const evaluated = combosIndices.map(indices => evaluateCombo(indices)).filter(Boolean);
  state.combos = evaluated.sort((a, b) => b.score - a.score);

  // Restauramos estado y limpiamos caché temporal
  state.field.weather = backupField.weather;
  state.field.terrain = backupField.terrain;
  
  window.comboSpeedCache = null;
  window.comboBestAttackCache = null;
  flowLog('evaluateAllCombos: Fin', { combosCalculados: state.combos.length });
}

function getTopThreatSummaries() {
  const enemy = state.enemy.filter(Boolean);
  if (!enemy.length) return [];

  const items = enemy.map(mon => ({ mon, threat: scoreThreat(mon) }));
  const reds = items.filter(i => i.threat.level === 'red');
  const ambers = items.filter(i => i.threat.level === 'amber');

  return [
    ...reds.slice(0, 2),
    ...ambers.slice(0, 1),
  ];
}

function lockBestFour(preview) {
  const team = state.self;
  const best = preview.bestFour || [];
  if (!team || best.length < 4) return;

  const indices = [];
  for (let i = 0; i < team.length; i++) {
    if (!team[i]) continue;
    if (best.some(m => m.name === team[i].name) && !indices.includes(i)) {
      indices.push(i);
    }
  }
  if (indices.length < 4) return;

  state.chosenFour = indices.slice(0, 4);
  
  if (preview.leadPair && preview.leadPair.length === 2) {
    const leadIndices = preview.leadPair.map(m => team.findIndex(tm => tm && tm.name === m.name));
    if (!leadIndices.includes(-1)) {
      state.leads.self = leadIndices;
      state.turn1Custom = false;
    }
  }
  
  const comboEnemyScores = state.enemy.map((enemyMon, idx) => {
    if (!enemyMon) return null;
    return { idx, cScore: scoreEnemyThreatVsCombo(enemyMon, best).score };
  }).filter(Boolean).sort((a, b) => b.cScore - a.cScore);

  if (comboEnemyScores.length > 0) {
    const topFour = comboEnemyScores.slice(0, 4);
    state.chosenEnemyFour = topFour.map(item => item.idx);
    state.leads.enemy = topFour.slice(0, 2).map(item => item.idx);
  }
  
  recalculateActiveField();
  renderAll();
}

function applyQuickCombo(comboIndices) {
  state.chosenFour = comboIndices;

  let combo = null;
  if (state.combos) {
    combo = state.combos.find(c => [...c.indices].sort().join(',') === [...comboIndices].sort().join(','));
    if (combo && combo.leads) {
      state.leads.self = [...combo.leads];
      state.turn1Custom = false;
    }
  }

  if (combo && combo.predictedEnemyLeads && combo.predictedEnemyBack) {
    // Extraer los índices reales de state.enemy usando los mons precalculados
    const expectedEnemyTeamIndices = [...combo.predictedEnemyLeads, ...combo.predictedEnemyBack]
      .map(mon => state.enemy.indexOf(mon))
      .filter(idx => idx !== -1);
    
    // Rellenar con otros enemigos si no alcanzan 4
    if (expectedEnemyTeamIndices.length < 4) {
       state.enemy.forEach((mon, idx) => {
         if (mon && !expectedEnemyTeamIndices.includes(idx)) {
           expectedEnemyTeamIndices.push(idx);
         }
       });
    }

    if (expectedEnemyTeamIndices.length >= 4) {
      state.chosenEnemyFour = expectedEnemyTeamIndices.slice(0, 4);
      state.leads.enemy = expectedEnemyTeamIndices.slice(0, 2);
    }
  } else {
    // Fallback: Recalcular si por alguna razón no está el combo guardado
    const selfMons = comboIndices.map(i => state.self[i]).filter(Boolean);
    const comboEnemyScores = state.enemy.map((enemyMon, idx) => {
      if (!enemyMon) return null;
      return { idx, cScore: scoreEnemyThreatVsCombo(enemyMon, selfMons).score };
    }).filter(Boolean).sort((a, b) => b.cScore - a.cScore);

    if (comboEnemyScores.length > 0) {
      const topFour = comboEnemyScores.slice(0, 4);
      state.chosenEnemyFour = topFour.map(item => item.idx);
      state.leads.enemy = topFour.slice(0, 2).map(item => item.idx);
    }
  }

  recalculateActiveField();
  renderAll();
}

function renderQuickCombos() {
  window.currentDamageCache = {};
  const selfTeam  = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);
  const section = document.getElementById('quickCombosList');
  if (!section) return;

  if (selfTeam.length < 6 || enemyTeam.length < 6) {
    section.innerHTML = `
      <div class="empty">
        Completa ambos equipos para ver las combinaciones recomendadas.
      </div>`;
    return;
  }

  const combos = buildQuickCombos();
  if (!combos.length) {
    section.innerHTML = '<div class="empty">Añade 4 Pokémon y un rival para ver combinaciones recomendadas.</div>';
    return;
  }

  const enemyPlan = inferStrategies(enemyTeam);
  const enemyStratText = enemyPlan.length > 0 ? enemyPlan[0].title : 'Ofensiva directa';

  const isActiveCombo = (comboArr) => {
    if (state.activeComboKey && state.activeComboKey === comboArr.join(',')) return true;
    if (!state.chosenFour || state.chosenFour.length !== 4) return false;
    const sortedA = [...comboArr].sort();
    const sortedB = [...state.chosenFour].sort();
    return sortedA.every((val, index) => val === sortedB[index]);
  };

  section.innerHTML = combos.map((combo, idx) => {
    const mons = combo.orderedIdx.map(i => state.self[i]).filter(Boolean);
    const allyLeads = mons.slice(0, 2);
    const allyBack = mons.slice(2, 4);
    const active = isActiveCombo(combo.orderedIdx);

    // Leer directamente la predicción guardada en el combo
    const predictedEnemyLeads = (combo.predictedEnemyLeads || []).map(mon => ({ mon }));
    const predictedEnemyBack = (combo.predictedEnemyBack || []).map(mon => ({ mon }));

    let ourPlan = combo.planDescription || "Presionar desde el primer turno.";
    if (combo.antiStratNotes && combo.antiStratNotes.length > 0) {
        ourPlan += ` <strong class="color-blue" style="display:block; margin-top:4px;"><i data-lucide="check-circle" style="width:12px;height:12px;"></i> Adaptación clave: ${combo.antiStratNotes.join(' · ')}</strong>`;
    }

    const topThreat = predictedEnemyLeads[0]?.mon;
    let enemyRisk = combo.keyLine && combo.keyLine.includes('Riesgo Crítico') 
        ? `<span style="color: #ff4d4d; font-weight: bold;">${combo.keyLine}</span>`
        : topThreat 
            ? `Estrategia <strong>${enemyStratText}</strong>. Buscarán tomar la iniciativa o anularte mediante <strong>${topThreat.displayName}</strong>.` 
            : 'Amenaza desconocida';

    const hasEnemyTR = enemyPlan.some(s => s.type === "Trick Room");
    const ourTRAbusers = mons.filter(m => {
      const bSpe = m.baseStats?.speed || 100;
      const bAtk = m.baseStats?.attack || 0;
      const bSpa = m.baseStats?.["special-attack"] || 0;
      return bSpe <= 60 && (bAtk >= 90 || bSpa >= 90);
    });

    if (hasEnemyTR && ourTRAbusers.length > 0 && !(combo.keyLine && combo.keyLine.includes('Riesgo Crítico'))) {
      enemyRisk = `El rival puede usar <strong>Trick Room</strong>, lo cual beneficia a nuestro <strong>${ourTRAbusers[0].displayName}</strong>.`;
      ourPlan += ` <span class="text-green" style="display:block; margin-top:4px;"><i data-lucide="check-square" style="width:12px;height:12px;"></i> Sinergia de campo: aprovechar el Trick Room rival con ${ourTRAbusers[0].displayName}.</span>`;
    }

    return `
      <div class="match-setter-card ${active ? 'active' : ''}" data-combo="${combo.orderedIdx.join(',')}">
        <div class="match-header">
          <div class="match-badge">SIMULACIÓN #${idx + 1}${active ? ' - ACTIVA' : ''}</div>
          <div class="match-score">Ventaja: <span class="${combo.score >= 80 ? 'text-green' : (combo.score < 0 ? 'text-red' : 'text-gold')}">${combo.score > 0 ? '+' : ''}${combo.score}</span></div>
        </div>

        <div class="clash-main-grid">
          <div class="clash-side ally">
            <div class="side-label">TU EQUIPO</div>
            <div class="pokemon-quad">
              <div class="quad-row leads">
                <div class="slot">${allyLeads[0] ? `<img src="${allyLeads[0].sprite}">` : ''}<span class="tag">LEAD</span></div>
                <div class="slot">${allyLeads[1] ? `<img src="${allyLeads[1].sprite}">` : ''}<span class="tag">LEAD</span></div>
              </div>
              <div class="quad-row back">
                <div class="slot">${allyBack[0] ? `<img src="${allyBack[0].sprite}">` : ''}<span class="tag">BACK</span></div>
                <div class="slot">${allyBack[1] ? `<img src="${allyBack[1].sprite}">` : ''}<span class="tag">BACK</span></div>
              </div>
            </div>
          </div>

          <div class="vs-center">VS</div>

          <div class="clash-side enemy">
            <div class="side-label">RIVAL (PREDICCIÓN)</div>
            <div class="pokemon-quad">
              <div class="quad-row leads">
                <div class="slot">${predictedEnemyLeads[0]?.mon ? `<img src="${predictedEnemyLeads[0].mon.sprite}">` : ''}<span class="tag">LEAD</span></div>
                <div class="slot">${predictedEnemyLeads[1]?.mon ? `<img src="${predictedEnemyLeads[1].mon.sprite}">` : ''}<span class="tag">LEAD</span></div>
              </div>
              <div class="quad-row back">
                <div class="slot">${predictedEnemyBack[0]?.mon ? `<img src="${predictedEnemyBack[0].mon.sprite}">` : ''}<span class="tag">BACK</span></div>
                <div class="slot">${predictedEnemyBack[1]?.mon ? `<img src="${predictedEnemyBack[1].mon.sprite}">` : ''}<span class="tag">BACK</span></div>
              </div>
            </div>
          </div>
        </div>

        <div class="tactical-briefing">
          <div class="plan-box">
            <i data-lucide="target"></i>
            <p><strong>Nuestra Estrategia:</strong> ${ourPlan}</p>
          </div>
          <div class="risk-box">
            <i data-lucide="zap"></i>
            <p><strong>Riesgo Rival:</strong> ${enemyRisk}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Agregar event listeners a las cards
  const cards = section.querySelectorAll('.match-setter-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const comboRaw = card.getAttribute('data-combo');
      if (comboRaw) {
        const comboIndices = comboRaw.split(',').map(Number);
        applyQuickCombo(comboIndices);
      }
    });
  });

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    if (typeof section !== "undefined" && section) {
        lucide.createIcons({ root: section });
    } else {
        lucide.createIcons();
    }
  }
}

function renderQuickLayer() {
  if (state.uiMode !== 'quick') return;
  const rows = getRows();
  const preview = computeQuickPreview(rows);
  renderQuickPreview(preview);
  renderQuickCombos();
}

// --- PREVIEW UI ---
function computeQuickPreview(rows) {
  const enemyTeam = state.enemy.filter(Boolean);
  if (!state.combos || !state.combos.length || !enemyTeam.length) {
    return { enemyPlan: [], bestFour: [], leadPair: [], noBring: [], mvp: null };
  }
  
  let activeCombo = state.combos[0];
  if (state.chosenFour && state.chosenFour.length === 4) {
    const found = state.combos.find(c => c.indices.sort().join(',') === [...state.chosenFour].sort().join(','));
    if (found) activeCombo = found;
  }
  
  const bestFour = activeCombo.mons;
  const leadPair = activeCombo.leads ? activeCombo.leads.map(i => state.self[i]) : [];
  const noBring = state.self.filter(m => m && !bestFour.includes(m));
  const enemyPlan = inferStrategies(enemyTeam);

  let mvp = null;
  let maxScore = -1;
  for (const m of bestFour) {
      const score = calculateMvpScore(m, state.self.filter(Boolean), enemyTeam);
      if (score > maxScore) { maxScore = score; mvp = m; }
  }

  return { enemyPlan, bestFour, leadPair, noBring, mvp };
}

// --- Actualización de UI para MVP ---
function renderMvpBanner(mvp) {
  const quickPreviewPanel = document.getElementById("quickPreviewPanel");
  let mvpBanner = document.getElementById("mvpBanner");

  if (!mvp) {
    if (mvpBanner) mvpBanner.remove();
    return;
  }

  if (!mvpBanner) {
    mvpBanner = document.createElement("div");
    mvpBanner.id = "mvpBanner";
    mvpBanner.className = "mvp-directive";

    // Inyectar justo después del header del panel
    const sectionHead = quickPreviewPanel.querySelector(".premium-header");
    if (sectionHead) {
      sectionHead.insertAdjacentElement("afterend", mvpBanner);
    } else {
      quickPreviewPanel.prepend(mvpBanner);
    }
  }

  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);
  let text = `<span>Mantén a tu</span> <img src="${mvp.sprite}" alt="${mvp.displayName}" style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"> <strong>${mvp.displayName}</strong> <span>vivo a toda costa.</span>`;

  if (typeof classifyTeamRoles === 'function') {
    const roles = classifyTeamRoles(selfTeam, enemyTeam);
    const mvpRole = roles.get(mvp);

    if (mvpRole) {
      const hp = mvp.battle?.hpPct ?? 100;
      if (mvpRole.role === 'wincon') {
         if (hp <= 40 && state.uiMode === 'live') {
             text = `<span>¡CUIDADO!</span> <img src="${mvp.sprite}" alt="${mvp.displayName}" style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"> <strong>${mvp.displayName}</strong> <span>(Wincon) está bajo de HP. Protégelo a toda costa.</span>`;
         } else {
             text = `<span>Asegura el wincon:</span> <img src="${mvp.sprite}" alt="${mvp.displayName}" style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"> <strong>${mvp.displayName}</strong> <span>es tu mejor baza.</span>`;
         }
      } else if (mvpRole.role === 'redundante') {
         text = `<span>Pivote disponible:</span> <img src="${mvp.sprite}" alt="${mvp.displayName}" style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));"> <strong>${mvp.displayName}</strong> <span>puede usarse para desgaste o pivotar sin comprometer la victoria.</span>`;
      }
    }
  }

  mvpBanner.innerHTML = `
    <div class="mvp-directive-icon">
      <i data-lucide="crosshair" style="width: 24px; height: 24px;"></i>
    </div>
    <div class="mvp-directive-content">
      <div class="mvp-directive-title">Directiva Principal</div>
      <div class="mvp-directive-text">
        ${text}
      </div>
    </div>
  `;
  updateIcons();
}
function renderWeaknessSummary() {
  // Future
}

function renderPreviewSprite(mon) {
  return `
    <div style="position: relative; display: inline-block; width: 100%; height: 100%;">
      <img src="${mon.sprite}" alt="${mon.name || ''}" style="width: 100%; height: 100%; object-fit: contain;">
      
      ${mon.tacticalReason === 'weather' ? `
        <div style="position:absolute; top:-4px; right:-4px; background:var(--blue); border-radius:50%; width:16px; height:16px; display:grid; place-items:center; border: 2px solid #181820;" title="Respuesta clave al Clima/Terreno rival">
          <i data-lucide="cloud-lightning" style="width:10px; height:10px; color:#fff;"></i>
        </div>
      ` : ''}

      ${mon.tacticalReason === 'speed' ? `
        <div style="position:absolute; top:-4px; right:-4px; background:var(--purple); border-radius:50%; width:16px; height:16px; display:grid; place-items:center; border: 2px solid #181820;" title="Respuesta clave al Control de Velocidad rival">
          <i data-lucide="timer" style="width:10px; height:10px; color:#fff;"></i>
        </div>
      ` : ''}
    </div>
  `;
}

// --- HLEPERS PARA COPY TÁCTICO QUICK PREVIEW ---

function getRoleLabel(mon) {
  if (!mon) return "Flexible";
  const moves = (mon.set?.moves || []).map(m => String(m).toLowerCase());
  if (moves.includes("tailwind") || moves.includes("trick room") || moves.includes("viento afín") || moves.includes("espacio raro")) return "Control de velocidad";
  if (moves.includes("fake out") || moves.includes("sorpresa")) return "Soporte de tempo";
  if (moves.includes("follow me") || moves.includes("rage powder") || moves.includes("señuelo")) return "Redirección";
  const rawAtk = getBaseStatRaw(mon, "attack");
  const rawSpa = getBaseStatRaw(mon, "special-attack");
  if (rawAtk > 100 || rawSpa > 100) return "Breaker";
  return "Pivot defensivo";
}

function getLeadSinergyText(leads) {
  if (leads.length < 2) return "Apertura estándar.";
  const f1 = getPokemonUtilityFlags(leads[0]);
  const f2 = getPokemonUtilityFlags(leads[1]);
  if ((f1.fakeOut && f2.tailwind) || (f2.fakeOut && f1.tailwind)) return "Sorpresa + Viento Afín para control inicial.";
  if ((f1.fakeOut && f2.trickRoom) || (f2.fakeOut && f1.trickRoom)) return "Sorpresa + Espacio Raro para invertir la velocidad.";
  if (f1.redirection || f2.redirection) return "Redirección + setup o ataque protegido.";
  if (f1.intimidate || f2.intimidate) return "Intimidación + presión segura.";
  if (f1.fakeOut && f2.fakeOut) return "Doble Sorpresa para frenar el momentum rival.";
  return "Pareja flexible de presión equilibrada.";
}

function getLeadPressureText(leads, enemyTeam) {
  const targets = [];
  for (const e of enemyTeam) {
    for (const l of leads) {
      if (bestAttack(l, e).mult >= 2) {
        targets.push(e.displayName);
        break;
      }
    }
  }
  if (!targets.length) return "Daño neutro y posicionamiento general.";
  if (targets.length > 1) {
    const last = targets.pop();
    return `Presiona a ${targets.join(', ')} y ${last}.`;
  }
  return `Presiona a ${targets[0]}.`;
}

function getLeadAvoidText(leads, enemyTeam) {
  const threats = [];
  for (const e of enemyTeam) {
    for (const l of leads) {
      if (bestAttack(e, l).mult >= 2) {
        threats.push(e.displayName);
        break;
      }
    }
  }
  if (!threats.length) return "Matchup sólido contra la mayoría de aperturas.";
  if (threats.length > 1) {
    const last = threats.pop();
    return `Evita quedar expuesto ante ${threats.join(', ')} o ${last}.`;
  }
  return `Evita quedar expuesto ante ${threats[0]}.`;
}

function getBenchEntryText(mon, enemyTeam) {
  if (state.uiMode === 'live') {
    // Bench como entrada reactiva según estado actual
    const currentState = state;
    let bestUse = 'Entra para estabilizar el daño o pivotar.';

    const enemies = enemyTeam.filter(Boolean);
    const targets = [];
    for (const e of enemies) {
      const res = bestAttack(mon, e);
      if (res.mult >= 2 && res.maxPct >= 50) targets.push(e.displayName);
    }

    if (targets.length > 1) {
      const last = targets.pop();
      bestUse = `Entra para presionar fuerte a ${targets.join(', ')} y ${last}.`;
    } else if (targets.length === 1) {
      bestUse = `Entra para presionar fuerte a ${targets[0]}.`;
    }

    const boardDelta = (() => {
      if (typeof simulateTurn !== 'function' || typeof scoreBoard !== 'function') return 0;

      const simIn = structuredClone(currentState);
      const activeIdx = currentState.activeSelfSlots[0];
      const benchIdx = currentState.self.findIndex(m => m && m.name === mon.name);
      if (activeIdx === undefined || benchIdx === -1) return 0;

      const action = { kind: 'switch', side: 'self', userIndex: activeIdx, switchInIndex: benchIdx };
      const { nextState } = simulateTurn(currentState, [action], []);
      
      return scoreBoard(nextState, 'self') - scoreBoard(currentState, 'self');
    })();

    if (boardDelta > 0) {
      bestUse += ' Mejora tu posición global en el tablero.';
    }

    return bestUse;
  }

  // lógica original
  const targets = [];
  for (const e of enemyTeam) {
    if (bestAttack(mon, e).mult >= 2) targets.push(e.displayName);
  }
  if (targets.length > 1) {
    const last = targets.pop();
    return `Entra si necesitas presionar a ${targets.join(', ')} y ${last}.`;
  } else if (targets.length === 1) {
    return `Entra si necesitas presionar a ${targets[0]}.`;
  }
  return `Entra para estabilizar el daño o pivotar.`;
}

function getBenchAvoidText(mon, enemyTeam) {
  if (state.uiMode === 'live') {
    const enemies = enemyTeam.filter(Boolean);
    let worst = 0;
    let worstName = null;

    for (const e of enemies) {
      const res = bestAttack(e, mon);
      const pct = res.maxPct || res.damage || 0;
      if (pct > worst) {
        worst = pct;
        worstName = e.displayName;
      }
    }

    if (!worstName) return 'Cuidado al exponerlo sin necesidad.';
    if (worst >= 100) return `No lo expongas si ${worstName} está activo: riesgo de OHKO.`;
    if (worst >= 60) return `Evita sacarlo frente a ${worstName}: recibe demasiada presión.`;

    return `Úsalo con prudencia cuando ${worstName} esté en campo.`;
  }

  // lógica original
  const threats = [];
  for (const e of enemyTeam) {
    if (bestAttack(e, mon).mult >= 2) threats.push(e.displayName);
  }
  if (threats.length > 1) {
    const last = threats.pop();
    return `No lo expongas si ${threats.join(', ')} o ${last} están activos.`;
  } else if (threats.length === 1) {
    return `No lo expongas si ${threats[0]} está activo.`;
  }
  return `Cuidado con recibir demasiado daño de desgaste.`;
}

function getNoBringReason(mon, enemyTeam) {
  const punishers = [];
  for (const e of enemyTeam) {
     if (bestAttack(e, mon).mult >= 2) punishers.push(e.displayName);
  }
  if (punishers.length > 1) {
     const last = punishers.pop();
     return `Demasiado castigado por ${punishers.join(', ')} y ${last}.`;
  } else if (punishers.length === 1) {
     return `Demasiado castigado por ${punishers[0]}.`;
  }
  
  const speed = calculateSpeed(mon, "self");
  if (speed < 100 && !mon.set?.moves?.includes("Trick Room")) return "Pierde tempo de salida contra este equipo.";
  
  return "No aporta presión real ni utilidad clave en este matchup.";
}

function getPlanExplanation(title) {
  const t = title.toLowerCase();
  if (t.includes('viento')) return "Buscará ganar tempo desde el turno 1.";
  if (t.includes('trick room')) return "Intentará invertir la velocidad para sus atacantes.";
  if (t.includes('lluvia')) return "Sus atacantes suben mucho bajo lluvia.";
  if (t.includes('sol')) return "Daño masivo de fuego y velocidad por habilidad.";
  if (t.includes('arena')) return "Daño residual y potenciación de stats.";
  if (t.includes('pivot')) return "Buscará reposicionar sin ceder presión.";
  if (t.includes('soporte')) return "Protegerá a sus atacantes principales.";
  if (t.includes('disrup')) return "Intentará anular tus condiciones de victoria.";
  return "Composición sólida que se adapta al matchup.";
}

function renderQuickPreview(preview) {
  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);
  const panel = document.getElementById("quickPreviewPanel");

  if (selfTeam.length === 0 || enemyTeam.length === 0) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";
  renderMvpBanner(preview.mvp); // Renderizar el banner MVP

  const planList = document.getElementById("planRivalList");
  if (preview.enemyPlan.length) {
    planList.innerHTML = preview.enemyPlan
      .map(
        (item) => `
          <div class="qp-plan-item">
            <div class="qp-plan-item-header">
              <span class="qp-plan-icon">${item.icon}</span>
              <span class="qp-plan-title">${item.title}</span>
            </div>
            <div class="qp-plan-desc">${getPlanExplanation(item.title)}</div>
          </div>
        `,
      )
      .join("");
  } else {
    planList.innerHTML =
      '<div class="muted-small">Sin plan claro detectado.</div>';
  }

  const topThreats = getTopThreatSummaries();
  const threatChipsHtml = topThreats.map(({mon, threat}) => `
    <div class="tag-pill tag-pill--danger" style="margin-bottom: 4px;" data-scout="${mon.name}">
      <img src="${mon.sprite}" class="sprite-micro" alt="${mon.displayName}">
      <span>${mon.displayName}: ${threat.reasons[0] || 'Amenaza clave en T1'}</span>
    </div>
  `).join('');
  const planRivalCard = document.getElementById("planRivalCard");
  if (planRivalCard) {
    let threatRow = document.getElementById("quickThreatRow");
    if (!threatRow) {
      threatRow = document.createElement("div");
      threatRow.id = "quickThreatRow";
      threatRow.className = "quick-threat-row";
      threatRow.style.marginTop = "8px";
      planRivalCard.appendChild(threatRow);
    }
    threatRow.innerHTML = threatChipsHtml || '<span class="muted-small">Sin amenazas rojas claras.</span>';
  }

  const leadIds = new Set(preview.leadPair.map(m => m.name));
  const backline = preview.bestFour.filter(m => !leadIds.has(m.name));

  const synergyText = getLeadSinergyText(preview.leadPair);
  const pressureText = getLeadPressureText(preview.leadPair, enemyTeam);
  const avoidText = getLeadAvoidText(preview.leadPair, enemyTeam);

  const bestFourCard = document.getElementById("bestFourCard");
  
  // Tablero de Despliegue (Leads + Reserva integrados)
  bestFourCard.className = "deployment-zone";

  const getPlanIcon = (type) => {
    if (type === 'agresivo') return { icon: 'swords', color: 'var(--red)', label: 'Agresivo' };
    if (type === 'defensivo') return { icon: 'shield', color: 'var(--blue)', label: 'Defensivo' };
    if (type === 'tempo') return { icon: 'timer', color: 'var(--purple)', label: 'Tempo' };
    if (type === 'balanceado') return { icon: 'scale', color: 'var(--gold)', label: 'Balanceado' };
    return { icon: 'check', color: 'var(--blue)', label: 'Autorizado' };
  };
  const planInfo = preview.activeCombo ? getPlanIcon(preview.activeCombo.planType) : { icon: 'check', color: 'var(--blue)', label: 'Autorizado' };

  const headerHtml = `
      <div class="deployment-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <h3 style="margin: 0; font: 900 0.9rem/1 'Cabinet Grotesk', sans-serif; color: #fff;">Escuadrón Seleccionado</h3>
          ${state.turn1Custom ? '<span class="tiny-chip" style="background: var(--bg); color: var(--gold); border: 1px solid var(--gold); font-size:0.65rem;">Leads Custom</span>' : ''}
        </div>
        <span class="tiny-chip" style="color: ${planInfo.color}; border-color: ${planInfo.color}55; background: rgba(255,255,255,0.05); font-weight:800;"><i data-lucide="${planInfo.icon}" style="width:12px;height:12px;margin-right:4px;"></i> ${planInfo.label}</span>
      </div>`;

  if (preview.leadPair.length === 0 && backline.length === 0) {
    bestFourCard.innerHTML = headerHtml + `
      <div class="empty" style="margin-top: 12px;">Faltan Pokémon en el equipo</div>
    `;
  } else {
    bestFourCard.innerHTML = headerHtml + `
      <div class="qp-section">
        <h4 class="qp-section-title">Leads Recomendados</h4>
        <div class="qp-leads-row">
          ${preview.leadPair.map((m, mIdx) => `
            <div class="qp-lead-sprite" title="${m.displayName}">
              <img src="${m.sprite}">
              <span class="qp-lead-name">${m.displayName}</span>
            </div>
          `).join('<i data-lucide="plus" class="qp-lead-plus"></i>')}
        </div>
        <div class="qp-tactics-box">
          <div class="qp-tactic-row"><strong class="color-blue">Objetivo:</strong> <span>${synergyText}</span></div>
          <div class="qp-tactic-row"><strong class="color-green">Qué presiona:</strong> <span>${pressureText}</span></div>
          <div class="qp-tactic-row"><strong class="color-red">Qué evitar:</strong> <span>${avoidText}</span></div>
        </div>
      </div>

      <div class="qp-section">
        <h4 class="qp-section-title">Banquillo Situacional</h4>
        <p class="qp-section-desc">No son leads; guárdalos para cuando el rival muestre su plan o necesites cubrir amenazas concretas.</p>
        <div class="qp-bench-list">
          ${backline.map((m, mIdx) => `
            <div class="qp-bench-item">
              <img src="${m.sprite}" class="qp-bench-sprite">
              <div class="qp-bench-info">
                <div class="qp-bench-head">
                  <strong>${m.displayName}</strong>
                  <span class="qp-role-badge">${getRoleLabel(m)}</span>
                </div>
                <div class="qp-bench-tactic"><i data-lucide="check-circle" class="color-green"></i> ${getBenchEntryText(m, enemyTeam)}</div>
                <div class="qp-bench-tactic"><i data-lucide="x-circle" class="color-red"></i> ${getBenchAvoidText(m, enemyTeam)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <button class="btn gold full sticky-cta" id="lockBestFourBtn" style="margin-top: 12px;">
        Bloquear estos 4
      </button>
    `;
  }

  const noBringCard = document.getElementById("noBringCard");
  
  // Zona de Peligro (Bans)
  noBringCard.className = "hazard-zone";
  noBringCard.innerHTML = `
    <div class="deployment-header" style="border-bottom-color: rgba(255,59,48,0.2);">
      <h3 style="margin: 0; font: 900 0.9rem/1 'Cabinet Grotesk', sans-serif; color: #ffc8c4;">Evitar salvo lectura muy concreta</h3>
    </div>
    
    <div class="qp-nobring-list" style="margin-top: 12px;">
      ${preview.noBring.length > 0 ? preview.noBring.map(m => `
        <div class="qp-nobring-item">
          <div class="qp-nobring-sprite-box">
            <img src="${m.sprite}">
            <div class="qp-nobring-overlay"><i data-lucide="ban"></i></div>
          </div>
          <div class="qp-nobring-info">
            <strong>${m.displayName}</strong>
            <span>${getNoBringReason(m, enemyTeam)}</span>
          </div>
        </div>
      `).join('') : '<div class="muted-small">Todos los agentes autorizados.</div>'}
    </div>
  `;
  
  updateIcons();
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    if (typeof section !== "undefined" && section) {
        lucide.createIcons({ root: section });
    } else {
        lucide.createIcons();
    }
  }
}

function renderSpeedTiers() {
  const speedTierList = document.getElementById("speedTierList");
  const allMons = [
    ...state.self
      .map((m) => (m ? { mon: m, side: "self" } : null))
      .filter(Boolean),
    ...state.enemy
      .map((m) => (m ? { mon: m, side: "enemy" } : null))
      .filter(Boolean),
  ];

  if (!allMons.length) {
    speedTierList.innerHTML = `<div class="empty">Añade Pokémon para ver el orden de velocidad.</div>`;
    return;
  }

  const tiers = allMons
    .map((item) => {
      const spe = calculateSpeed(item.mon, item.side);
      return { ...item, spe };
    })
    .sort((a, b) => b.spe - a.spe);

  const blocks = [];
  for (let i = 0; i < tiers.length; ) {
    let j = i;
    while (j + 1 < tiers.length && tiers[j + 1].spe === tiers[i].spe) j++;
    blocks.push(tiers.slice(i, j + 1));
    i = j + 1;
  }

  let html = `<div class="velocity-track">`;
  
  blocks.forEach((group, index) => {
    if (group.length > 1) {
      html += `
        <div class="velocity-tie-column">
          <div class="velocity-tie-badge"><i data-lucide="zap" style="width: 10px; height: 10px;"></i> Tie</div>
          ${group.map(item => `
            <div class="velocity-node" title="${item.mon.displayName}">
              <div class="velocity-avatar velocity-avatar--${item.side}">
                <img src="${item.mon.sprite}" alt="${item.mon.displayName}">
              </div>
              <div class="velocity-stat" style="${item.spe < 0 ? 'color: var(--purple);' : ''}">${Math.abs(item.spe)}</div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      const item = group[0];
      html += `
        <div class="velocity-node" title="${item.mon.displayName}">
          <div class="velocity-avatar velocity-avatar--${item.side}">
            <img src="${item.mon.sprite}" alt="${item.mon.displayName}">
          </div>
          <div class="velocity-stat" style="${item.spe < 0 ? 'color: var(--purple);' : ''}">${Math.abs(item.spe)}</div>
        </div>
      `;
    }
    
    if (index < blocks.length - 1) {
      html += `<div class="velocity-connector"><i data-lucide="chevron-right"></i></div>`;
    }
  });

  html += `</div>`;
  speedTierList.innerHTML = html;

  document.getElementById("toggleTailwindSelfBtn").className =
    `btn small ${state.field.tailwindSelf ? "blue" : "ghost"}`;
  document.getElementById("toggleTailwindEnemyBtn").className =
    `btn small ${state.field.tailwindEnemy ? "red" : "ghost"}`;
  document.getElementById("toggleTrickRoomBtn").className =
    `btn small ${state.field.trickRoom ? "gold" : "ghost"}`;

  updateIcons();
}

function renderDefensiveAlerts() {
  const alertList = document.getElementById("defensiveAlertFloat");
  if (!alertList) return;
  const mons = state.self.filter(Boolean);
  if (mons.length < 3) {
    alertList.innerHTML = "";
    return;
  }

  const alerts = [];
  const types = Object.keys(TYPE_CHART);
  for (const t of types) {
    let weak = 0,
      resist = 0,
      immune = 0;
    for (const mon of mons) {
      let mult = effectiveness(t, mon.types);
      const ab = mon.set?.ability || "";

      if (
        t === "ground" &&
        (ab === "Levitate" || mon.set?.item === "Air Balloon")
      )
        mult = 0;
      if (
        t === "water" &&
        ["Water Absorb", "Storm Drain", "Dry Skin"].includes(ab)
      )
        mult = 0;
      if (t === "fire" && ["Flash Fire", "Well-Baked Body"].includes(ab))
        mult = 0;
      if (
        t === "electric" &&
        ["Volt Absorb", "Lightning Rod", "Motor Drive"].includes(ab)
      )
        mult = 0;
      if (t === "grass" && ["Sap Sipper"].includes(ab)) mult = 0;

      if (mult > 1) weak++;
      else if (mult === 0) immune++;
      else if (mult < 1) resist++;
    }

    const score = resist + immune - weak;
    if (score <= -2) {
      alerts.push({ type: t, name: TYPE_META[t].name, score });
    } else if (score >= 2) {
      alerts.push({ type: t, name: TYPE_META[t].name, score });
    }
  }

  if (!alerts.length) {
    alertList.innerHTML = "";
    return;
  }

  alertList.innerHTML = alerts
    .sort((a, b) => a.score - b.score)
    .map(
      (a) => {
        const isWeak = a.score < 0;
        const iconUrl = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/${a.type.toLowerCase()}.svg`;
        const typeColor = TYPE_META[a.type]?.color || '#fff';
        const iconContrast = getContrastColor(typeColor);
        const bgCol = isWeak ? 'rgba(255, 59, 48, 0.2)' : 'rgba(48, 209, 88, 0.2)';
        const borderCol = isWeak ? 'rgba(255, 59, 48, 0.4)' : 'rgba(48, 209, 88, 0.4)';
        const textCol = isWeak ? '#ffc8c4' : '#d4ffe3';
        const sign = a.score > 0 ? '+' : '';

        return `
        <div class="tiny-chip" style="background: ${bgCol}; border-color: ${borderCol}; color: ${textCol}; font-size: 0.75rem; padding: 4px 8px; gap: 8px;">
          <div class="type-icon-circle" style="position: static; background-color: ${typeColor}; width: 18px; height: 18px; box-shadow: none;">
            <div class="type-svg-mask" style="mask-image: url('${iconUrl}'); -webkit-mask-image: url('${iconUrl}'); background-color: ${iconContrast}; width: 10px; height: 10px;"></div>
          </div>
          <strong style="font-family: var(--poke-stat-font);">${sign}${a.score}</strong>
        </div>
      `;
    })
    .join("");
}

function isPhysicalAttacker(mon) {
  if (!mon) return false;
  const moves = mon.set?.moves || [];
  const hasPhysical = moves.some(
    (m) => state.moveTypeCache[m]?.damageClass === "physical",
  );
  if (hasPhysical) return true;
  const atk = mon.baseStats?.attack || 0;
  const spa = mon.baseStats?.['special-attack'] || 0;
  return atk > spa;
}

function pruneInvalidTurn1Slots() {
  for (const side of ["self", "enemy"]) {
    state.leads[side] = state.leads[side].filter((i) => state[side][i]);
  }
}

function ensureTurn1LeadDefaults() {
  const selfFilled = [0, 1, 2, 3, 4, 5].filter((i) => state.self[i]);
  const enemyFilled = [0, 1, 2, 3, 4, 5].filter((i) => state.enemy[i]);

  if (state.leads.self.length === 0 && selfFilled.length >= 2) {
    const rows = getRows();
    const preview = computeQuickPreview(rows);
    const optimalNames = preview.leadPair.map(m => m.name);
    const optimalIndices = selfFilled.filter(i => optimalNames.includes(state.self[i].name)).slice(0, 2);
    if (optimalIndices.length === 2) {
      state.leads.self = optimalIndices;
    } else {
      state.leads.self = selfFilled.slice(0, 2);
    }
  } else if (state.leads.self.length === 0 && selfFilled.length > 0) {
    state.leads.self = [...selfFilled];
  }

  if (state.leads.enemy.length === 0 && enemyFilled.length >= 2) {
    const sortedEnemyIndices = [...enemyFilled].sort((a, b) => {
      const rankA = state.enemy[a].metaRank || 999;
      const rankB = state.enemy[b].metaRank || 999;
      return rankA - rankB;
    });
    state.leads.enemy = sortedEnemyIndices.slice(0, 2);
  } else if (state.leads.enemy.length === 0 && enemyFilled.length > 0) {
    state.leads.enemy = [...enemyFilled];
  }
}

function getTurn1ResolvedLeadIndices(side) {
  const team = state[side];
  const picked = state.leads[side].filter((i) => team[i]);
  const filled = [0, 1, 2, 3, 4, 5].filter((i) => team[i]);
  const out = [...picked];
  for (const i of filled) {
    if (out.length >= 2) break;
    if (!out.includes(i)) out.push(i);
  }
  return out.slice(0, 2);
}

function renderTurn1PickRows() {
  const selfRow = document.getElementById("t1SelfPickRow");
  const enemyRow = document.getElementById("t1EnemyPickRow");
  if (!selfRow || !enemyRow) return;

  const rows = getRows();
  const preview = computeQuickPreview(rows);
  const optimalNames = preview.leadPair.map(m => m.name);
  const isQuick = state.uiMode === 'quick';

  const build = (side) => {
    const team = state[side];
    const picks = state.leads[side];
    return [0, 1, 2, 3, 4, 5]
      .map((i) => {
        const mon = team[i];
        const on = picks.includes(i);
        const cls = ["t1-slot"];
        let isDimmed = false;
        
        if (!mon) cls.push("t1-slot--empty");
        if (mon && on)
          cls.push(side === "self" ? "t1-slot--on-self" : "t1-slot--on-enemy");
          
        if (isQuick && side === "self" && state.chosenFour && state.chosenFour.length > 0) {
          if (!state.chosenFour.includes(i)) {
            cls.push("matchup-slot--dimmed");
            isDimmed = true;
          }
        }

        if (isQuick && side === "enemy" && state.chosenEnemyFour && state.chosenEnemyFour.length > 0) {
          if (!state.chosenEnemyFour.includes(i)) {
            cls.push("matchup-slot--dimmed");
            isDimmed = true;
          }
        }
        
        const isOptimal = side === "self" && mon && optimalNames.includes(mon.name);
        const badge = isOptimal ? `<div class="optimal-badge"><i data-lucide="star"></i> ÓPTIMO</div>` : '';
        
        const inner = mon
          ? `<img src="${mon.sprite}" alt="" loading="lazy">${badge}`
          : '<span class="t1-slot-ph">—</span>';
        const dis = (mon && !isDimmed) ? "" : " disabled";
        return `<button type="button" class="${cls.join(" ")}" data-t1-slot data-side="${side}" data-idx="${i}" ${mon && side === "enemy" ? `data-scout="${mon.name}"` : ""}${dis}>${inner}</button>`;
      })
      .join("");
  };
  selfRow.innerHTML = build("self");
  enemyRow.innerHTML = build("enemy");
  
  // NUEVA LÓGICA: Añadir clase de bloqueo visual si hay 2 seleccionados
  selfRow.classList.toggle('t1-roster--locked', state.leads.self.length >= 2);
  enemyRow.classList.toggle('t1-roster--locked', state.leads.enemy.length >= 2);
}

function renderTurn1Simulator() {
  flowLog('renderTurn1Simulator: Inicio');
  const panel = document.getElementById("turn1SimulatorPanel");
  const list = document.getElementById("t1InsightsList");
  const emptyState = document.getElementById("t1EmptyState");
  const pickZone = document.getElementById("turn1PickZone");
  
  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);

  if (selfTeam.length < 2 || enemyTeam.length < 2) {
    flowLog('renderTurn1Simulator: Faltan mons, abortando y ocultando panel');
    panel.style.display = "none";
    return;
  }
  
  // En modo rápido, si no hay combinación de 4 elegida, mostramos estado vacío.
  if (state.uiMode === 'quick' && (!state.chosenFour || state.chosenFour.length < 4)) {
    panel.style.display = "block";
    emptyState.style.display = "block";
    pickZone.style.display = "none";
    list.innerHTML = "";
    flowLog('renderTurn1Simulator: Esperando bloqueo (lockBestFourBtn) en UI Rápida');
    return;
  }

  panel.style.display = "block";
  emptyState.style.display = "none";
  pickZone.style.display = "grid";

  pruneInvalidTurn1Slots();
  ensureTurn1LeadDefaults();
  renderTurn1PickRows();

 const sIdx = getTurn1ResolvedLeadIndices("self");
  const eIdx = getTurn1ResolvedLeadIndices("enemy");
  const s1 = state.self[sIdx[0]];
  const s2 = state.self[sIdx[1]];
  const e1 = state.enemy[eIdx[0]];
  const e2 = state.enemy[eIdx[1]];

  // 1. PRIMERO: CREAR EL CAMPO Y APLICAR CLIMAS/TERRENOS
  const simFieldLocal = { ...state.field };
  const applyHazards = (mon) => {
    if (!mon) return;
    const ab = (mon.set?.ability || mon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
    
    if (ab === 'drought' || mon.name.toLowerCase().includes('charizardmegay')) simFieldLocal.weather = 'sun';
    if (ab === 'drizzle' || mon.name.toLowerCase().includes('pelipper')) simFieldLocal.weather = 'rain';
    if (ab === 'sandstream') simFieldLocal.weather = 'sandstorm';
    if (ab === 'snowwarning') simFieldLocal.weather = 'snow';
    if (ab === 'psychicsurge') simFieldLocal.terrain = 'psychic';
    if (ab === 'grassysurge') simFieldLocal.terrain = 'grassy';
    if (ab === 'electricsurge') simFieldLocal.terrain = 'electric';
    if (ab === 'mistysurge') simFieldLocal.terrain = 'misty';
  };
  
  [s1, s2, e1, e2].forEach(applyHazards); // El campo ya tiene Sol

  // 2. SEGUNDO: CALCULAR VELOCIDADES PASANDO EL CAMPO ACTUALIZADO
  const leads = [
    { mon: s1, side: "self", spe: calculateSpeed(s1, "self", simFieldLocal), realIdx: sIdx[0] },
    { mon: s2, side: "self", spe: calculateSpeed(s2, "self", simFieldLocal), realIdx: sIdx[1] },
    { mon: e1, side: "enemy", spe: calculateSpeed(e1, "enemy", simFieldLocal), realIdx: eIdx[0] },
    { mon: e2, side: "enemy", spe: calculateSpeed(e2, "enemy", simFieldLocal), realIdx: eIdx[1] },
  ]
    .filter((x) => x.mon)
    .sort((a, b) => b.spe - a.spe);

  let weathers = [];
  let terrains = [];

  // === RENDER GLOBAL STATE BANNER ===
  const globalStateBanner = document.getElementById("t1GlobalFieldState");
  if (globalStateBanner) {
    const reversedLeads = [...leads].reverse();
    for (const lead of reversedLeads) {
      const ability = (lead.mon.set?.ability || lead.mon.ability || '').toLowerCase().replace(/\\s/g, '');
      const name = lead.mon.displayName || lead.mon.name;
      if (ability === 'drought') weathers.push({ type: 'sun', text: `${weatherNames['sun']} (vía ${formatName(name)})`, icon: 'sun' });
      if (ability === 'drizzle') weathers.push({ type: 'rain', text: `${weatherNames['rain']} (vía ${formatName(name)})`, icon: 'cloud-rain' });
      if (ability === 'sandstream') weathers.push({ type: 'sand', text: `${weatherNames['sandstorm']} (vía ${formatName(name)})`, icon: 'wind' });
      if (ability === 'snowwarning') weathers.push({ type: 'snow', text: `${weatherNames['snow']} (vía ${formatName(name)})`, icon: 'snowflake' });
      if (ability === 'psychicsurge') terrains.push({ type: 'psychic', text: `Campo Psíquico (vía ${formatName(name)})`, icon: 'orbit' });
      if (ability === 'grassysurge') terrains.push({ type: 'grassy', text: `Campo de Hierba (vía ${formatName(name)})`, icon: 'leaf' });
      if (ability === 'electricsurge') terrains.push({ type: 'electric', text: `Campo Eléctrico (vía ${formatName(name)})`, icon: 'zap' });
      if (ability === 'mistysurge') terrains.push({ type: 'misty', text: `Campo de Niebla (vía ${formatName(name)})`, icon: 'sparkles' });
    }
    const activeWeather = weathers.length > 0 ? weathers[0] : null;
    const activeTerrain = terrains.length > 0 ? terrains[0] : null;
    if (!activeWeather && !activeTerrain) {
      globalStateBanner.style.display = 'none';
    } else {
      globalStateBanner.style.display = 'flex';
      let html = '';
      if (activeWeather) html += `<div class="global-state-item weather-${activeWeather.type}"><i data-lucide="${activeWeather.icon}"></i> <span>${activeWeather.text}</span></div>`;
      if (activeTerrain) html += `<div class="global-state-item terrain-${activeTerrain.type}"><i data-lucide="${activeTerrain.icon}"></i> <span>${activeTerrain.text}</span></div>`;
      globalStateBanner.innerHTML = html;
      if (typeof lucide !== "undefined" && lucide.createIcons) lucide.createIcons({ root: globalStateBanner });
    }
  }

  // === RENDER LEAD BADGES (TIMELINE, STATS, ABILITY GLOW) ===
  /* document.querySelectorAll('.t1-slot-timeline-badge').forEach(e => e.remove());
  document.querySelectorAll('.t1-slot-stat-badge').forEach(e => e.remove());
  document.querySelectorAll('.t1-slot.t1-slot-ability-glow').forEach(e => e.classList.remove('t1-slot-ability-glow'));

  const simFieldLocal = { ...state.field };
  const applyHazards = (mon) => {
    if (!mon) return;
    const ab = (mon.set?.ability || mon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
    // Soporte nativo para la Mega si Smogon no pasa la habilidad "Drought" explícita
    if (ab === 'drought' || mon.name.toLowerCase() === 'charizard-mega-y' || mon.name.toLowerCase() === 'charizardmegay') {
        simField.weather = 'sun';
    }
  };
  leads.forEach(l => applyHazards(l.mon)); */

// === RENDER LEAD BADGES (TIMELINE, STATS, ABILITY GLOW) ===
  document.querySelectorAll('.t1-slot-timeline-badge').forEach(e => e.remove());
  document.querySelectorAll('.t1-slot-stat-badge').forEach(e => e.remove());
  document.querySelectorAll('.t1-slot.t1-slot-ability-glow').forEach(e => e.classList.remove('t1-slot-ability-glow'));

  let selfLeads = leads.filter(x => x.side === "self");
  let enemyLeads = leads.filter(x => x.side === "enemy");

  // Helper robusto de prioridad
  const getPriority = (moveName) => {
      if (!moveName) return 0;
      const id = moveName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['fakeout', 'firstimpression'].includes(id)) return 3;
      if (['extremespeed'].includes(id)) return 2;
      if (['suckerpunch', 'aquajet', 'machpunch', 'bulletpunch', 'iceshard', 'shadowsneak', 'grassyglide'].includes(id)) return 1;
      if (['trickroom'].includes(id)) return -7;
      return 0;
  };

  let turnOrderLeads = leads.map(l => {
      let maxPrio = 0;
      const targets = l.side === 'self' ? enemyLeads : selfLeads;
      targets.forEach(t => {
          const atk = bestAttack(l.mon, t.mon, simFieldLocal);
          const currentPrio = getPriority(atk.move);
          if (currentPrio > maxPrio) maxPrio = currentPrio;
      });
      return { ...l, maxPrio, finalScore: (maxPrio * 10000) + l.spe };
  }).sort((a, b) => b.finalScore - a.finalScore);
  
  turnOrderLeads.forEach((l, idx) => l.turnRank = idx + 1);

  let selfIntimidate = leads.some(l => l.side === 'self' && (l.mon.set?.ability || l.mon.ability || '').toLowerCase().includes('intimidate'));
  let enemyIntimidate = leads.some(l => l.side === 'enemy' && (l.mon.set?.ability || l.mon.ability || '').toLowerCase().includes('intimidate'));
  
  leads.forEach((l, index) => {
    const slotEl = document.querySelector(`.t1-slot[data-side="${l.side}"][data-idx="${l.realIdx}"]`);
    if (!slotEl) return;
    
    const hasPriority = l.mon.set?.moves?.some(m => PRIORITY_MOVES.has(m));
    const prioIcon = hasPriority ? '<i data-lucide="zap" style="width: 10px; height: 10px; color: var(--gold); margin-right: 2px;"></i>' : '';
    const orderBadge = document.createElement('div');
    orderBadge.className = 't1-slot-timeline-badge';
    orderBadge.innerHTML = `${prioIcon}${index + 1}<span>️⃣</span>`;
    slotEl.appendChild(orderBadge);
    
    const ability = (l.mon.set?.ability || l.mon.ability || '').toLowerCase().replace(/\\s/g, '');
    const isIntimidated = (l.side === 'self' && enemyIntimidate) || (l.side === 'enemy' && selfIntimidate);
    const blocksIntimidate = ['clearbody', 'innerfocus', 'hypercutter', 'defiant', 'competitive', 'guarddog', 'contrary'].includes(ability);
    
    if (isIntimidated && !blocksIntimidate) {
      const statBadge = document.createElement('div');
      statBadge.className = 't1-slot-stat-badge';
      statBadge.innerHTML = '-1 Atk';
      slotEl.appendChild(statBadge);
    }
    
    const weather = state.field.weather || (weathers.length > 0 ? weathers[0].type : null);
    const isActiveAbility = 
      (['intimidate', 'drought', 'drizzle', 'sandstream', 'snowwarning', 'psychicsurge', 'grassysurge', 'electricsurge', 'mistysurge'].includes(ability)) ||
      (weather === 'sun' && ability === 'chlorophyll') ||
      (weather === 'rain' && ability === 'swiftswim') ||
      (weather === 'sand' && ability === 'sandrush') ||
      (weather === 'snow' && ability === 'slushrush');
      
    if (isActiveAbility) {
      slotEl.classList.add('t1-slot-ability-glow');
    }
  });

  const insights = [];
  const micro = (mon) =>
    `<img src="${mon.sprite}" class="sprite-micro" title="${mon.displayName}">`;

    // --- ZONAS 1 a 4: RENDERIZADO DE ALTA EFICIENCIA ---

  // Ocultar paneles antiguos
  const mPanel = document.getElementById("momentumPanel");
  if (mPanel) mPanel.style.display = "none";

  // ZONA 1: Timeline de Velocidad
  let timelineHtml = `
    <div class="zone-timeline ${state.field.trickRoom ? 'trick-room-active' : ''}">
      <div class="timeline-track">
        ${turnOrderLeads.map(l => {
          const isPrio = l.maxPrio > 0;
          const ability = (l.mon.set?.ability || l.mon.ability || '').toLowerCase().replace(/\s/g, '');
          const weather = state.field.weather || (weathers.length > 0 ? weathers[0].type : null);
          const hasSpeedModAbility = (weather === 'sun' && ability === 'chlorophyll') ||
            (weather === 'rain' && ability === 'swiftswim') ||
            (weather === 'sand' && ability === 'sandrush') ||
            (weather === 'snow' && ability === 'slushrush');
          const hasScarf = (l.mon.set?.item || '').toLowerCase().includes('scarf');

          return `
            <div class="timeline-node ${isPrio ? 'priority-lane' : ''}">
              <div class="timeline-avatar-container">
                <img src="${l.mon.sprite}" class="timeline-avatar">
                ${hasScarf ? '<div class="speed-badge item-badge">x1.5</div>' : ''}
                ${hasSpeedModAbility ? '<div class="speed-badge ability-badge"><i data-lucide="sun"></i></div>' : ''}
                ${isPrio ? '<div class="speed-badge priority-badge"><i data-lucide="zap"></i></div>' : ''}
              </div>
              <div class="speed-info">
                <span class="speed-effective">${Math.abs(l.spe)}</span>
                <span class="speed-base">(${l.mon.baseStats?.spe || '?'})</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  
  // Helpers ZONA 2 (Mobile-First)
  const renderMobileCombatantCard = (mon, side, isDouble) => {
    const typesHtml = (mon.types || []).map(t => `<span class="type-chip ${t.toLowerCase()}">${t}</span>`).join('');
    const ability = mon.set?.ability || mon.ability || 'Desconocida';
    const item = mon.set?.item || 'Sin objeto';

    const abilityId = ability.toLowerCase().replace(/\s/g, '');
    const isActiveAbility =
      (['intimidate', 'drought', 'drizzle', 'sandstream', 'snowwarning', 'psychicsurge', 'grassysurge', 'electricsurge', 'mistysurge'].includes(abilityId));

    return `
      <div class="mobile-combatant-card card-${side === 'self' ? 'ally' : 'enemy'}">
        ${isDouble ? '<div class="double-target-warning" style="top: -6px; right: -6px; left: auto; transform: none; font-size: 9px; padding: 2px 6px;">⚠️ FOCO</div>' : ''}
        <div class="combatant-header" style="flex-direction: row; gap: 8px;">
          <img src="${mon.sprite}" style="width: 40px; height: 40px; object-fit: cover; background: rgba(255,255,255,0.05); border-radius: 6px;">
          <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; overflow: hidden;">
            <div class="combatant-name" style="font-size: 14px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${formatName(mon.displayName || mon.name)}</div>
            <div class="combatant-types" style="font-size: 10px;">${typesHtml}</div>
          </div>
        </div>
        <div class="combatant-footer" style="display: flex; flex-direction: row; gap: 4px;">
          <div class="badge-item" title="${formatName(item)}" style="flex: 1;"><i data-lucide="package"></i> <span class="truncate">${formatName(item)}</span></div>
          <div class="badge-ability ${isActiveAbility ? 'glow-active' : ''}" title="${formatName(ability)}" style="flex: 1;"><i data-lucide="zap"></i> <span class="truncate">${formatName(ability)}</span></div>
        </div>
      </div>
    `;
  };

  let crossfireRowsHtml = '';
  let targetThreatsCount = {};
  let tacticalFeedHtml = '';

  for (const sObj of selfLeads) {
    for (const eObj of enemyLeads) {
      const s = sObj.mon;
      const e = eObj.mon;
      const speS = Math.abs(sObj.spe);
      const speE = Math.abs(eObj.spe);

      const atkS = bestAttack(s, e, simFieldLocal);
      const atkE = bestAttack(e, s, simFieldLocal);

      const sPriority = getPriority(atkS.move);
      const ePriority = getPriority(atkE.move);

      let sFaster = false;
      if (sPriority > ePriority) sFaster = true; 
      else if (ePriority > sPriority) sFaster = false; 
      else sFaster = speS >= speE; 

      const isOhkoS = atkS.ohko || atkS.ohkoProb > 50;
      const isThreatS = atkS.mult >= 2 || isOhkoS;
      
      const isOhkoE = atkE.ohko || atkE.ohkoProb > 50;
      const isThreatE = atkE.mult >= 2 || isOhkoE;

      // ZONA 3: Radar de Fuego Cruzado (Mobile-First)
      if (isThreatS) {
        const moveName = formatName(getTranslation(atkS.move, "move") || atkS.move);
        targetThreatsCount[e.name] = (targetThreatsCount[e.name] || 0) + 1;
        
        const resPill = isOhkoS ? `<span style="background: rgba(231, 76, 60, 0.2); color: var(--red, #e74c3c); padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">OHKO</span>` : `<span style="background: rgba(243, 156, 18, 0.2); color: var(--orange, #f39c12); padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">x${atkS.mult}</span>`;
        const moveColor = isOhkoS ? 'var(--red, #e74c3c)' : 'var(--orange, #f39c12)';
        
        crossfireRowsHtml += `
          <div class="crossfire-row">
            <div style="display: flex; align-items: center; gap: 8px;">
               <img src="${s.sprite}" style="width: 24px; height: 24px;">
               <div style="display: flex; flex-direction: column;">
                 <span style="font-size: 10px; opacity: 0.7;">Tú atacas</span>
                 <span style="font-size: 12px; font-weight: bold; color: ${moveColor};">${moveName}</span>
               </div>
            </div>
            <i data-lucide="arrow-right" style="width: 14px; height: 14px; opacity: 0.5;"></i>
            <div style="display: flex; align-items: center; gap: 8px;">
               ${resPill}
               <img src="${e.sprite}" style="width: 24px; height: 24px;">
            </div>
          </div>
        `;
        
        // ZONA 4: Feed Táctico (Opportunity)
        if (sFaster) {
          tacticalFeedHtml += `
            <article class="tactical-feed-card type-opportunity">
              <div class="tf-header">
                 <i data-lucide="crosshair"></i>
                 <span>${formatName(s.displayName || s.name)} elimina a ${formatName(e.displayName || e.name)}</span>
              </div>
              <div class="math-terminal">
                <div>> Ataque: <span class="term-accent">${moveName}</span></div>
                <div>> Modificadores: ${atkS.tags && atkS.tags.length > 0 ? atkS.tags.join(' · ') : 'Ninguno'}</div>
                <div class="terminal-highlight">> Rango: ${atkS.minPct}% - ${atkS.maxPct}% (x${atkS.mult})</div>
                ${isOhkoS ? '<div class="terminal-highlight term-ohko">> Resultado: OHKO Garantizado/Probable</div>' : ''}
              </div>
            </article>
          `;
        }
      }
      
      if (isThreatE) {
        const moveName = formatName(getTranslation(atkE.move, "move") || atkE.move);
        targetThreatsCount[s.name] = (targetThreatsCount[s.name] || 0) + 1;
        
        const resPill = isOhkoE ? `<span style="background: rgba(231, 76, 60, 0.2); color: var(--red, #e74c3c); padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">OHKO</span>` : `<span style="background: rgba(243, 156, 18, 0.2); color: var(--orange, #f39c12); padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">x${atkE.mult}</span>`;
        const moveColor = isOhkoE ? 'var(--red, #e74c3c)' : 'var(--orange, #f39c12)';
        
        crossfireRowsHtml += `
          <div class="crossfire-row">
            <div style="display: flex; align-items: center; gap: 8px;">
               <img src="${e.sprite}" style="width: 24px; height: 24px;">
               <div style="display: flex; flex-direction: column;">
                 <span style="font-size: 10px; opacity: 0.7;">Rival ataca</span>
                 <span style="font-size: 12px; font-weight: bold; color: ${moveColor};">${moveName}</span>
               </div>
            </div>
            <i data-lucide="arrow-right" style="width: 14px; height: 14px; opacity: 0.5;"></i>
            <div style="display: flex; align-items: center; gap: 8px;">
               ${resPill}
               <img src="${s.sprite}" style="width: 24px; height: 24px;">
            </div>
          </div>
        `;
        
        // ZONA 4: Feed Táctico (Critical)
        if (!sFaster) {
           tacticalFeedHtml += `
            <article class="tactical-feed-card type-critical">
              <div class="tf-header">
                 <i data-lucide="alert-triangle"></i>
                 <span>${formatName(e.displayName || e.name)} elimina a ${formatName(s.displayName || s.name)}</span>
              </div>
              <div class="math-terminal">
                <div>> Ataque: <span class="term-accent">${moveName}</span></div>
                <div>> Modificadores: ${atkE.tags && atkE.tags.length > 0 ? atkE.tags.join(' · ') : 'Ninguno'}</div>
                <div class="terminal-highlight">> Rango: ${atkE.minPct}% - ${atkE.maxPct}% (x${atkE.mult})</div>
                ${isOhkoE ? '<div class="terminal-highlight term-ohko">> Resultado: OHKO Garantizado/Probable</div>' : ''}
              </div>
            </article>
          `;
        }
      }
    }
  }

  // ZONA 2 & 3: Roster Grid + Radar (Mobile-First)
  let rosterGridHtml = `
    <div class="mobile-roster-grid">
      ${selfLeads.map(l => {
         const isDouble = targetThreatsCount[l.mon.name] >= 2;
         return renderMobileCombatantCard(l.mon, 'self', isDouble);
      }).join('')}
      ${enemyLeads.map(l => {
         const isDouble = targetThreatsCount[l.mon.name] >= 2;
         return renderMobileCombatantCard(l.mon, 'enemy', isDouble);
      }).join('')}
    </div>
  `;

  let crossfireSectionHtml = crossfireRowsHtml ? `
    <div style="margin-top: 24px; margin-bottom: 24px;">
      <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
        <i data-lucide="radar" style="width: 16px; height: 16px; color: var(--red, #e74c3c);"></i> Vectores de Amenaza
      </div>
      <div class="crossfire-list">
        ${crossfireRowsHtml}
      </div>
    </div>
  ` : '';

  // Render Final
  list.innerHTML = `
    <div class="tactical-zones-container">
      ${timelineHtml}
      ${rosterGridHtml}
      ${crossfireSectionHtml}
      <div class="tactical-feed" style="margin-top: 16px;">
        ${tacticalFeedHtml}
      </div>
    </div>
  `;

  if (typeof lucide !== "undefined" && lucide.createIcons) {

    lucide.createIcons({ root: document.getElementById("turn1SimulatorPanel") });
  }
  flowLog('renderTurn1Simulator: Fin - PROYECCIÓN DE CHOQUE LISTA');
}


function updateIcons() {
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
}

// --- MAIN RENDER ---
let isBatchUpdating = false;
let renderTimer = null;
let lastSelfLength = -1;
let lastEnemyLength = -1;

function renderAll(force = false) {
  flowLog('renderAll: Solicitud de renderizado recibida', { force, isBatchUpdating, renderTimerActive: !!renderTimer });
  if (isBatchUpdating) return;
  if (renderTimer) cancelAnimationFrame(renderTimer);

  renderTimer = requestAnimationFrame(() => {
    flowLog('renderAll: requestAnimationFrame ejecutando _doRender');
    _doRender(force);
  });
}

function _doRender(force = false) {
  flowLog('_doRender: Inicio', { force, uiMode: state.uiMode });
  renderUiMode();
  renderDock("self");
  renderDock("enemy");

  const isQuick = state.uiMode === 'quick';
  const isExpert = state.uiMode === 'expert';
  const isLive = state.uiMode === 'live';

  const currentSelfLength = state.self.filter(Boolean).length;
  const currentEnemyLength = state.enemy.filter(Boolean).length;
  const lengthsChanged = currentSelfLength !== lastSelfLength || currentEnemyLength !== lastEnemyLength;

  if (isQuick || force) {
    if (lengthsChanged || force || state.needsReevaluation) {
      flowLog('_doRender: Cambios estructurales detectados, disparando evaluateAllCombos', { lastSelfLength, currentSelfLength });
      evaluateAllCombos();
      lastSelfLength = currentSelfLength;
      lastEnemyLength = currentEnemyLength;
      state.needsReevaluation = false;
    }
    renderTurn1Simulator();
    renderQuickLayer();
  }
  if (isExpert || force) {
    const rows = getRows();
    renderMatrix(rows);
    renderThreats();
    renderOpportunities(rows);
    renderStrategies();
    if (typeof renderWeaknessSummary === 'function') renderWeaknessSummary();
    renderSpeedTiers();
    renderDefensiveAlerts();
  }
  
  if (isLive || force) {
    const rows = getRows();
    renderMatrix(rows);
    if (typeof renderLiveStatePanel === 'function') renderLiveStatePanel();
    if (typeof renderLiveRecommendations === 'function') renderLiveRecommendations();
  }

  renderActiveMatchupStrip();
  renderLiveBattleToolbar();
  flowLog('_doRender: Fin');

  const strip = document.getElementById("activeMatchupStrip");
  const toolbar = document.getElementById("liveBattleToolbar");
  if (isBattleFocusActive()) {
    if (strip) strip.style.display = "flex";
    if (toolbar) toolbar.style.display = "flex";
  } else {
    if (strip) strip.style.display = "none";
    if (toolbar) toolbar.style.display = "none";
  }

  updateIcons();
}

document
  .getElementById("toggleTailwindSelfBtn")
  .addEventListener("click", () => {
    state.field.tailwindSelf = !state.field.tailwindSelf;
    renderSpeedTiers();
  });

document
  .getElementById("toggleTailwindEnemyBtn")
  .addEventListener("click", () => {
    state.field.tailwindEnemy = !state.field.tailwindEnemy;
    renderSpeedTiers();
  });

document.getElementById("toggleTrickRoomBtn").addEventListener("click", () => {
  state.field.trickRoom = !state.field.trickRoom;
  renderSpeedTiers();
});

function triggerMatrixFlash() {
  const tbl = document.querySelector('.matrix-grid table');
  if (tbl) {
    tbl.classList.remove('matrix-flash');
    void tbl.offsetWidth; // Force reflow
    tbl.classList.add('matrix-flash');
  }
}

const matrixModeToggleGroup = document.getElementById("matrixModeToggleGroup");
if (matrixModeToggleGroup) {
  matrixModeToggleGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (btn && btn.dataset.mode) {
      state.matrixMode = btn.dataset.mode;
      triggerMatrixFlash();
      renderAll();
    }
  });
}

const matrixDetailToggleGroup = document.getElementById("matrixDetailToggleGroup");
if (matrixDetailToggleGroup) {
  matrixDetailToggleGroup.addEventListener("click", (e) => {
    const btn = e.target.closest(".segmented-btn");
    if (btn && btn.dataset.detail) {
      setMatrixDetailMode(btn.dataset.detail);
    }
  });
}

const matrixHelpToggleBtn = document.getElementById("matrixHelpToggleBtn");
if (matrixHelpToggleBtn) {
  matrixHelpToggleBtn.addEventListener("click", () => {
    toggleMatrixHelp();
  });
}

const matrixFieldControls = document.getElementById("matrixFieldControls");
if (matrixFieldControls) {
  matrixFieldControls.addEventListener("click", (e) => {
    const w = e.target.closest("[data-weather]");
    if (w && w.dataset.weather) {
      const v = w.dataset.weather;
      state.field.weather = state.field.weather === v ? null : v;
      triggerMatrixFlash();
      renderAll();
      return;
    }
    const t = e.target.closest("[data-terrain]");
    if (t && t.dataset.terrain) {
      const v = t.dataset.terrain;
      state.field.terrain = state.field.terrain === v ? null : v;
      triggerMatrixFlash();
      renderAll();
      return;
    }
  });
}

document.getElementById("turn1PickZone").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-t1-slot]");
  if (!btn || btn.disabled) return;
  const side = btn.dataset.side;
  const idx = Number(btn.dataset.idx);
  if (!state[side][idx]) return;
  
  if (side === "self") state.turn1Custom = true;
  
  const arr = state.leads[side];
  const pos = arr.indexOf(idx);
  if (pos >= 0) arr.splice(pos, 1);
  else if (arr.length < 2) arr.push(idx);
  else {
    arr.shift();
    arr.push(idx);
  }
  recalculateActiveField();
  renderAll();
});

selfSlots.addEventListener("click", async (e) => {
  const remove = e.target.closest('[data-action="remove"]');
  if (remove) {
    const idx = Number(remove.dataset.index);
    state.self[idx] = null;
    resetQuickCombosLock();
    renderAll();
    return;
  }

  const pick = e.target.closest('[data-action="pick"]');
  if (!pick) return;

  const idx = Number(pick.dataset.index);
  if (state.self[idx]) {
    openSetEditor(idx);
  } else {
    openModal("self", idx);
  }
});

enemySlots.addEventListener("click", async (e) => {
  const remove = e.target.closest('[data-action="remove"]');
  if (remove) {
    const idx = Number(remove.dataset.index);
    state.enemy[idx] = null;
    resetQuickCombosLock();
    renderAll();
    return;
  }
  const pick = e.target.closest('[data-action="pick"]');
  if (pick) openModal("enemy", Number(pick.dataset.index));
});

resultList.addEventListener("click", async (e) => {
  const btn = e.target.closest('[data-action="pick-result"]');
  if (!btn) return;

  const side = state.modal.side;
  const currentIndex = state.modal.index;

  await pickPokemonIntoSlot(side, currentIndex, btn.dataset.name);

  const nextIndex = state[side].findIndex((mon) => !mon);
  if (nextIndex !== -1) {
    state.modal.index = nextIndex;
    modalTitle.textContent =
      side === "self"
        ? `Tu equipo · Slot ${nextIndex + 1}`
        : `Rival · Slot ${nextIndex + 1}`;
    searchInput.value = "";
    renderPokedex("");
    setTimeout(() => searchInput.focus(), 20);
  } else {
    closeModal();
  }
});

searchInput.addEventListener("input", (e) => {
  renderPokedex(e.target.value);
});

document.getElementById("closeModalBtn").addEventListener("click", closeModal);
pickerModal.addEventListener("click", (e) => {
  if (e.target === pickerModal) closeModal();
});

document.getElementById("loadDemoBtn").addEventListener("click", async () => {
  await fillTeamWithSpecies("self", DEMO_SELF);
  await fillTeamWithSpecies("enemy", DEMO_ENEMY);
});

document.getElementById("swapBtn").addEventListener("click", swapTeams);
document.getElementById("clearBtn").addEventListener("click", clearAll);
document
  .querySelector('.team-config-btn[data-team="self"]')
  .addEventListener("click", () => renderTeamConfigDrawer("self"));
document
  .querySelector('.team-config-btn[data-team="enemy"]')
  .addEventListener("click", () => renderTeamConfigDrawer("enemy"));

ratingSelect.value = state.rating;
ratingSelect.addEventListener("change", async (e) => {
  state.rating = e.target.value;
  localStorage.setItem(RATING_STORAGE_KEY, String(state.rating));
  alert('La carga por rating ha sido simplificada. La app usa el data-bundle.json cargado.');
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

state.setEditor = { index: null };
state.setChoice = { kind: "", moveIndex: null, options: [], query: "" };

const setEditorModal = document.getElementById("setEditorModal");
const setEditorBody = document.getElementById("setEditorBody");
const setEditorTitle = document.getElementById("setEditorTitle");
const setEditorSubtitle = document.getElementById("setEditorSubtitle");

const setChoiceModal = document.getElementById("setChoiceModal");
const setChoiceTitle = document.getElementById("setChoiceTitle");
const setChoiceSubtitle = document.getElementById("setChoiceSubtitle");
const setChoiceSearch = document.getElementById("setChoiceSearch");
const setChoiceList = document.getElementById("setChoiceList");

function ensureEditableSet(mon) {
  if (!mon.set || typeof mon.set !== "object") mon.set = {};
  if (!Array.isArray(mon.set.moves)) mon.set.moves = [];
  while (mon.set.moves.length < 4) mon.set.moves.push("");
  if (!mon.set.raw || typeof mon.set.raw !== "object") mon.set.raw = {};
  return mon.set;
}

function uniqValues(arr = []) {
  return [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))];
}

function getEditorMon() {
  const idx = state.setEditor.index;
  if (idx == null) return null;
  return state.self[idx] || null;
}

function getQuickOptions(mon, kind) {
  const set = ensureEditableSet(mon);
  const raw = set.raw || {};
  const entry =
    (typeof getMetaRecord === "function"
      ? getMetaRecord(mon.name)?.entry
      : null) || {};

  if (kind === "ability") {
    return uniqValues([
      ...(raw.abilities || []).map((x) => x.key),
      ...Object.keys(entry.Abilities || {}),
      set.ability || "",
    ]).slice(0, 10);
  }

  if (kind === "item") {
    return uniqValues([
      ...(raw.items || []).map((x) => x.key),
      ...Object.keys(entry.Items || {}),
      set.item || "",
    ]).slice(0, 12);
  }

  if (kind === "move") {
    return uniqValues([
      ...(raw.moves || []).map((x) => x.key),
      ...Object.keys(entry.Moves || {}),
      ...(set.moves || []),
    ]).slice(0, 18);
  }

  if (kind === "nature") {
    const editorNatureChoices = [
      "Jolly", "Adamant", "Timid", "Modest", "Bold", "Impish", "Careful", "Calm", 
      "Brave", "Relaxed", "Quiet", "Sassy", "Naive", "Hasty", "Lonely", "Naughty", 
      "Rash", "Mild", "Gentle", "Lax", "Hardy", "Docile", "Serious", "Bashful", "Quirky"
    ];
    return uniqValues([
      raw.nature || "",
      entry.nature || "",
      set.nature || "",
      ...editorNatureChoices
    ]);
  }

  return [];
}

function getTopSpreads(mon) {
  if (!mon) return [];
  const record = getMetaRecord(mon.name);
  const entry = record?.entry || {};
  const rawSpreads = entry.Spreads || entry["Spreads"] || {};
  const rawCount = entry["Raw count"] || 1;
  
  const top = topEntries(rawSpreads, 3);
  return top.map(sp => {
    const spread = parseSpread(sp.key);
    const pctVal = sp.value > 1 ? (sp.value / rawCount) : sp.value;
    const pct = (pctVal * 100).toFixed(0);
    
    const evStr = Object.entries(spread.evs).filter(([k,v]) => v > 0).map(([k,v]) => `${v} ${k.toUpperCase()}`).join(' / ') || "Sin EVs";
    const label = `${spread.nature || 'Neutral'} | ${evStr} (${pct}%)`;
    
    return { nature: spread.nature || '', evs: spread.evs, label };
  });
}

function guessSpreadRole(evs) {
  const hp = Number(evs.hp) || 0;
  const atk = Number(evs.atk) || 0;
  const def = Number(evs.def) || 0;
  const spa = Number(evs.spa) || 0;
  const spd = Number(evs.spd) || 0;
  const spe = Number(evs.spe) || 0;

  if (spe >= 200 && (atk >= 200 || spa >= 200)) return "Ofensivo Rápido";
  if (hp >= 200 && (def >= 150 || spd >= 150)) return "Bulky Pivot / Muro";
  if (hp >= 200 && (atk >= 150 || spa >= 150)) return "Bulky Ofensivo";
  if (def >= 200 || spd >= 200) return "Defensivo";
  return "Mixto / Específico";
}

function getMegaForm(baseSpecies, itemSlug) {
  if (!itemSlug || !itemSlug.includes('ite')) return null;
  
  const cleanBase = normalizeText(baseSpecies);
  let possibleMegaId = cleanBase + 'mega';
  
  // Casos especiales (Charizard X/Y, Mewtwo X/Y)
  if (itemSlug.endsWith('itex')) possibleMegaId = cleanBase + 'megax';
  if (itemSlug.endsWith('itey')) possibleMegaId = cleanBase + 'megay';
  
  const megaData = window.GameDB?.pokedex?.[possibleMegaId];
  // Solo devolver si el objeto coincide con el nombre del Pokémon (evita que Pikachu con Venusaurita brille)
  if (megaData && itemSlug.startsWith(cleanBase)) {
    return megaData;
  }
  return null;
}

function renderSetEditor() {
  const mon = getEditorMon();
  if (!mon) {
    setEditorBody.innerHTML = `<div class="empty">No hay Pokémon seleccionado.</div>`;
    return;
  }

  const set = ensureEditableSet(mon);
  const abilityOptions = getQuickOptions(mon, "ability");
  const itemOptions = getQuickOptions(mon, "item");
  const moveOptions = getQuickOptions(mon, "move");
  const spreadOptions = getTopSpreads(mon);

  const abiSlug = normalizeText(set.ability);
  const itemSlug = normalizeText(set.item);
  const abilityDesc = window.GameDB?.abilities?.[abiSlug]?.desc || "Sin descripción disponible.";
  const itemDesc = window.GameDB?.items?.[itemSlug]?.desc || "Sin descripción disponible.";
  const typesHtml = (mon.types || []).map(t => 
    `<span class="type-pill" style="background-color: var(--${t.toLowerCase()});">${t}</span>`
  ).join('');

  const megaForm = getMegaForm(mon.name, itemSlug);
  const megaHtml = megaForm 
    ? `<div class="mega-badge">✨ Permite Megaevolucionar a ${megaForm.displayName}</div>` 
    : '';
  const megaClass = megaForm ? 'mega-active' : '';

  setEditorTitle.textContent = `Editar set · ${mon.displayName}`;
  setEditorSubtitle.textContent =
    "Despliega para cambiar o usa las sugerencias rápidas.";

  const typeChips = (mon.types || []).map(typeChip).join("");
  const summaryLines = serializeSetSummary(set);

  const editorNatureChoices = [
    "Jolly",
    "Adamant",
    "Timid",
    "Modest",
    "Bold",
    "Impish",
    "Careful",
    "Calm",
    "Brave",
    "Relaxed",
    "Quiet",
    "Sassy",
    "Naive",
    "Hasty",
    "Lonely",
    "Naughty",
    "Rash",
    "Mild",
    "Gentle",
    "Lax",
    "Hardy",
    "Docile",
    "Serious",
    "Bashful",
    "Quirky",
  ];
  const curNature = set.nature || "";
  const natureList =
    curNature && !editorNatureChoices.includes(curNature)
      ? [curNature, ...editorNatureChoices]
      : editorNatureChoices;

  const evs =
    set.evs && typeof set.evs === "object"
      ? set.evs
      : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const evStatMeta = [
    { key: "hp", label: "HP" },
    { key: "atk", label: "Atk" },
    { key: "def", label: "Def" },
    { key: "spa", label: "SpA" },
    { key: "spd", label: "SpD" },
    { key: "spe", label: "Spe" },
  ];
  const evInputStyle =
    "box-sizing:border-box;margin-top:4px;background:#15233a;border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:8px;padding:6px;width:100%;font:inherit;";

  setEditorBody.innerHTML = `
        <section class="editor-hero">
          <div class="sprite-box">
            ${mon.name.includes("-mega") ? '<div class="mega-icon" style="width:18px;height:18px;top:4px;left:4px;"></div>' : ""}
            <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
          </div>

          <div style="min-width:0">
            <div class="editor-name">${mon.displayName}</div>
            <div class="editor-sub">${summaryLines.join(" · ") || "Set personalizable desde aquí"}</div>
            <div style="margin-top: 4px; margin-bottom: 12px;">${typesHtml}</div>
          </div>
        </section>

        <section class="editor-grid-2">
          <article class="editor-section">
            <button type="button" class="trait-card" data-action="edit-ability" style="text-align: left;">
              <div class="trait-label">Habilidad</div>
              <div class="trait-header">
                <i data-lucide="star" style="width:14px;height:14px;color:var(--gold);"></i> 
                ${getTranslation(set.ability, 'ability') || 'Toca para asignar'}
              </div>
              <div class="flavor-text">${abilityDesc}</div>
            </button>

            <div class="editor-pill-list" style="flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; margin-top: 8px;">
              ${abilityOptions
                .slice(0, 4)
                .map(
                  (value) => `
                <button class="editor-pill ${value === set.ability ? "active" : ""}" style="white-space: nowrap; flex-shrink: 0;" data-action="quick-ability" data-value="${value}">
                  ${getTranslation(value, "ability")}
                </button>
              `,
                )
                .join("")}
            </div>
          </article>

          <article class="editor-section">
            <button type="button" class="trait-card ${megaClass}" data-action="edit-item" ${mon.name.includes("-mega") ? "disabled" : ""} style="text-align: left;">
              <div class="trait-label">Objeto Equipado</div>
              <div class="trait-header">
                <i data-lucide="package" style="width:14px;height:14px;color:var(--blue);"></i> 
                ${getTranslation(set.item, 'item') || 'Toca para asignar'}
              </div>
              <div class="flavor-text">${itemDesc}</div>
              ${megaHtml}
            </button>

            <div class="editor-pill-list" style="flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; margin-top: 8px;">
              ${itemOptions
                .slice(0, 4)
                .map(
                  (value) => `
                <button class="editor-pill ${value === set.item ? "active" : ""}" style="white-space: nowrap; flex-shrink: 0;" data-action="quick-item" data-value="${value}" ${mon.name.includes("-mega") ? "disabled" : ""}>
                  ${getTranslation(value, "item")}
                </button>
              `,
                )
                .join("")}
            </div>
          </article>
        </section>

        <article class="editor-section">
          <div class="editor-section-head">
            <div>
              <strong>Naturaleza y EVs</strong>
            </div>
          </div>

          <button type="button" class="edit-trigger-btn" data-action="edit-nature">
            <span class="${set.nature ? 'val' : 'placeholder'}">${set.nature || 'Toca para asignar Naturaleza'}</span>
            <i data-lucide="chevron-right" style="width:16px;color:var(--muted);"></i>
          </button>

          <div class="editor-pill-list" style="margin-top: 8px; margin-bottom: 12px; flex-wrap: wrap;">
            ${spreadOptions.map(sp => `
              <button type="button" class="editor-pill" data-action="quick-spread" data-nature="${sp.nature}" data-evs='${JSON.stringify(sp.evs)}'>
                ${sp.label}
              </button>
            `).join('')}
          </div>

          <div class="ev-compact-grid" style="margin-top: 8px;">
            ${evStatMeta
              .map(
                ({ key, label }) => `
              <div class="ev-input-wrapper">
                <span>${label}</span>
                <input type="number" min="0" max="252" step="1" data-action="inline-ev" data-stat="${key}" value="${Number(evs[key]) || 0}">
              </div>
            `,
              )
              .join("")}
          </div>
        </article>

        <article class="editor-section">
          <div class="editor-section-head">
            <div>
              <strong>Movimientos</strong>
            </div>
          </div>

          <div class="moves-2x2-grid">
            ${(set.moves || [])
              .slice(0, 4)
              .map(
                (move, idx) => {
                  const slug = normalizeText(move);
                  const moveData = window.GameDB?.moves?.[slug];
                  const powerStr = moveData?.power ? `${moveData.power} BP` : '-- BP';
                  const typeColor = moveData ? `var(--${moveData.type})` : 'var(--muted)';
                  
                  let catIcon = '';
                  if (moveData?.damageClass === 'physical') catIcon = '<i data-lucide="swords" style="width:12px;height:12px;"></i>';
                  else if (moveData?.damageClass === 'special') catIcon = '<i data-lucide="orbit" style="width:12px;height:12px;"></i>';
                  else if (moveData?.damageClass === 'status') catIcon = '<i data-lucide="shield" style="width:12px;height:12px;"></i>';

                  const tooltip = moveData?.desc || 'Seleccionar movimiento';
                  const moveName = getTranslation(move, 'move') || '+ Añadir ataque';

                  return `
              <button type="button" class="move-slot-btn ${move ? '' : 'empty'}" style="--move-color: ${typeColor};" title="${escapeHtml(tooltip)}" data-action="edit-move" data-index="${idx}">
                <div class="move-slot-header">
                  <span class="val">${moveName}</span>
                  ${move ? `<span class="move-category-icon">${catIcon}</span>` : ''}
                </div>
                ${move ? `
                <div class="move-slot-stats">
                  <span>${powerStr}</span>
                </div>
                <div class="move-btn-clear" data-action="clear-move" data-index="${idx}"><i data-lucide="x" style="width:14px;height:14px;"></i></div>
                ` : ''}
              </button>
            `;
                }
              )
              .join("")}
          </div>
        </article>
      `;

  updateIcons();
}

function openSetEditor(index) {
  const mon = state.self[index];
  if (!mon) return;
  state.setEditor.index = index;
  ensureEditableSet(mon);
  renderSetEditor();
  setEditorModal.classList.add("open");
}

function closeSetEditor() {
  setEditorModal.classList.remove("open");
  state.setEditor.index = null;
}

function getChoiceStateLabel(kind, moveIndex = null) {
  if (kind === "ability")
    return {
      title: "Elegir habilidad",
      subtitle:
        "Selecciona una habilidad sugerida o escribe una personalizada.",
    };
  if (kind === "item")
    return {
      title: "Elegir objeto",
      subtitle: "Selecciona un objeto sugerido o escribe uno personalizado.",
    };
  if (kind === "nature")
    return {
      title: "Elegir naturaleza",
      subtitle: "Selecciona una naturaleza de la lista.",
    };
  return {
    title: `Elegir movimiento ${Number(moveIndex) + 1}`,
    subtitle: "Selecciona un movimiento sugerido o escribe uno personalizado.",
  };
}

function openSetChoice(kind, moveIndex = null) {
  const mon = getEditorMon();
  if (!mon) return;

  const options = getQuickOptions(mon, kind);
  state.setChoice = { kind, moveIndex, options, query: "" };

  const label = getChoiceStateLabel(kind, moveIndex);
  setChoiceTitle.textContent = label.title;
  setChoiceSubtitle.textContent = label.subtitle;
  setChoiceSearch.value = "";
  renderSetChoiceList();
  setChoiceModal.classList.add("open");
  setTimeout(() => setChoiceSearch.focus(), 30);
}

function closeSetChoice() {
  setChoiceModal.classList.remove("open");
  state.setChoice = { kind: "", moveIndex: null, options: [], query: "" };
}

function renderSetChoiceList() {
  const mon = getEditorMon();
  if (!mon) {
    setChoiceList.innerHTML = `<div class="empty">No hay Pokémon activo.</div>`;
    return;
  }

  const set = ensureEditableSet(mon);
  const q = normalizeText(setChoiceSearch.value || "");
  const kind = state.setChoice.kind;
  
  let options = [...(state.setChoice.options || [])];

  // Si hay un texto de búsqueda, expandimos la búsqueda a la base de datos global (GameDB)
  if (q && window.GameDB) {
    const dbMap = kind === 'move' ? window.GameDB.moves :
                  kind === 'ability' ? window.GameDB.abilities :
                  kind === 'item' ? window.GameDB.items : null;

    if (dbMap) {
      const extraMatches = [];
      for (const slug of Object.keys(dbMap)) {
        const translated = getTranslation(slug, kind);
        if (slug.includes(q) || normalizeText(translated).includes(q)) {
          extraMatches.push(slug);
        }
        // Límite de 50 resultados para mantener un rendimiento óptimo
        if (extraMatches.length >= 50) break;
      }
      options = uniqValues([...options, ...extraMatches]);
    }
  }

  const finalOptions = options
    .filter(Boolean)
    .filter((value) => {
      if (!q) return true;
      const translated = getTranslation(value, kind);
      return (
        normalizeText(value).includes(q) ||
        normalizeText(translated).includes(q)
      );
    });

  if (!finalOptions.length) {
    setChoiceList.innerHTML = `<div class="empty">Sin coincidencias. Puedes usar el texto escrito arriba.</div>`;
    return;
  }

  const currentValue =
    kind === "ability"
      ? set.ability || ""
      : kind === "item"
        ? set.item || ""
        : set.moves[state.setChoice.moveIndex] || "";

  setChoiceList.innerHTML = finalOptions
    .map((value) => {
      let translated = getTranslation(value, kind);
      
      // Fallback para capitalizar slugs directos si no hay traducción (ej: "closecombat" -> "Closecombat")
      if (translated === value && !value.includes(" ")) {
         translated = formatName(value);
      }
      
      const slug = normalizeText(value);

      const moveData = window.GameDB?.moves?.[slug];
      const abilityData = window.GameDB?.abilities?.[slug];
      const itemData = window.GameDB?.items?.[slug];

      let typeHtml = '';
      let desc = '';
      let styleAccent = '';
      let catIcon = '';
      let metricsHtml = '';
      let tooltipText = '';

      if (moveData) {
        typeHtml = `<span class="type-pill" style="background-color: var(--${moveData.type});">${moveData.type}</span>`;
        desc = moveData.desc || '';
        styleAccent = `border-left: 4px solid var(--${moveData.type});`;

        if (moveData.damageClass === 'physical') {
          catIcon = '<i data-lucide="swords" style="width:14px;height:14px; margin-left:4px; color:var(--muted);"></i>';
        } else if (moveData.damageClass === 'special') {
          catIcon = '<i data-lucide="orbit" style="width:14px;height:14px; margin-left:4px; color:var(--muted);"></i>';
        } else if (moveData.damageClass === 'status') {
          catIcon = '<i data-lucide="shield" style="width:14px;height:14px; margin-left:4px; color:var(--muted);"></i>';
        }

        const bp = moveData.power ? `${moveData.power} BP` : '-- BP';
        const acc = moveData.accuracy ? `${moveData.accuracy} Acc` : '-- Acc';
        let extraInfo = [bp, acc];
        if (moveData.hits > 1) extraInfo.push(`${moveData.hits} Golpes`);
        if (moveData.isSpread) extraInfo.push(`Área`);

        metricsHtml = `<div class="move-slot-stats" style="margin-top: 2px; margin-bottom: 4px;"><span>${extraInfo.join(' | ')}</span></div>`;
        
        const typeName = TYPE_META[moveData.type]?.name || moveData.type;
        const className = moveData.damageClass === 'physical' ? 'Físico' : moveData.damageClass === 'special' ? 'Especial' : 'Estado';
        tooltipText = `${typeName} | ${className}\n\n${desc}`;
      } else if (abilityData) {
        desc = abilityData.desc || '';
        tooltipText = desc;
      } else if (itemData) {
        desc = itemData.desc || '';
        tooltipText = desc;
      }

      const isCurrent = normalizeText(value) === normalizeText(currentValue);
      const currentBadge = isCurrent ? '<span class="tiny-chip" style="background: var(--blue); color: #fff; padding: 2px 4px; font-size: 0.55rem; border: none; margin-left: 6px;">Actual</span>' : '';

      return `
          <button class="choice-item ${isCurrent ? "active" : ""}" data-action="apply-choice" data-value="${value}" style="${styleAccent}" title="${escapeHtml(tooltipText)}">
            <div class="choice-item-header">
              <span class="choice-item-name" style="display:flex; align-items:center;">${translated} ${catIcon} ${currentBadge}</span>
              ${typeHtml}
            </div>
            ${metricsHtml}
            ${desc ? `<div class="flavor-text" style="text-align: left;">${desc}</div>` : ''}
          </button>
        `;
    })
    .join("");

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons({ root: setChoiceList });
  }
}

function applySetChoice(value) {
  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);
  const clean = String(value || "").trim();

  if (state.setChoice.kind === "ability") {
    set.ability = clean;
  } else if (state.setChoice.kind === "item") {
    const normalizedItem = normalizeText(clean);
    if (MEGA_STONES[normalizedItem]) {
      const hasOtherMega = state.self.some(
        (m, i) => m && i !== state.setEditor.index && m.name.includes("-mega"),
      );
      if (hasOtherMega) {
        alert(
          "Mega Clause: Ya tienes un Pokémon Megaevolucionado en el equipo.",
        );
        return;
      }
    }
    set.item = clean;
    if (
      MEGA_STONES[normalizedItem] &&
      mon.name !== MEGA_STONES[normalizedItem]
    ) {
      // Trigger species change
      const newSpecies = MEGA_STONES[normalizedItem];
      pickPokemonIntoSlot("self", state.setEditor.index, newSpecies).then(
        () => {
          const newMon = getEditorMon();
          if (newMon && newMon.set) {
            newMon.set.item = clean;
          }
          openSetEditor(state.setEditor.index);
        },
      );
      closeSetChoice();
      return; // early return since pickPokemonIntoSlot rebuilds the set
    }
  } else if (state.setChoice.kind === "move") {
    const idx = Number(state.setChoice.moveIndex);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = clean;
  }

  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
  closeSetChoice();
}

function clearSetChoiceValue() {
  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);

  if (state.setChoice.kind === "ability") {
    set.ability = "";
  } else if (state.setChoice.kind === "item") {
    set.item = "";
  } else if (state.setChoice.kind === "move") {
    const idx = Number(state.setChoice.moveIndex);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = "";
  }

  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
  closeSetChoice();
}

function resetCurrentSetToMeta() {
  const idx = state.setEditor.index;
  const mon = getEditorMon();
  if (idx == null || !mon) return;

  if (typeof buildDefaultSetForSpecies === "function") {
        mon.set = buildDefaultSetForSpecies(mon.name, "self", idx, mon.types);
  } else {
    mon.set = {
      ability: "",
      item: "",
      nature: "",
      evs: null,
      moves: ["", "", "", ""],
      raw: {},
    };
  }

  ensureEditableSet(mon);
  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
}

function changeCurrentPokemonFromEditor() {
  const idx = state.setEditor.index;
  if (idx == null) return;
  closeSetEditor();
  openModal("self", idx);
}

setEditorBody.addEventListener("change", (e) => {
  const input = e.target.closest('input[data-action="inline-ev"]');
  if (input) {
    const mon = getEditorMon();
    if (!mon) return;
    const set = ensureEditableSet(mon);
    if (!set.evs) set.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    let v = Number(input.value);
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(0, Math.min(252, Math.round(v)));
    set.evs[input.dataset.stat] = v;
    input.value = String(v);
    if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
    return;
  }

  const select = e.target.closest("select[data-action]");
  if (!select) return;

  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);
  const val = select.value;

  if (select.dataset.action === "inline-ability") {
    set.ability = val;
  } else if (select.dataset.action === "inline-item") {
    set.item = val;
    const normalizedItem = normalizeText(val);
    if (
      MEGA_STONES[normalizedItem] &&
      mon.name !== MEGA_STONES[normalizedItem]
    ) {
      const newSpecies = MEGA_STONES[normalizedItem];
      pickPokemonIntoSlot("self", state.setEditor.index, newSpecies).then(
        () => {
          const newMon = getEditorMon();
          if (newMon && newMon.set) newMon.set.item = val;
          openSetEditor(state.setEditor.index);
        },
      );
      return;
    }
  } else if (select.dataset.action === "inline-move") {
    const idx = Number(select.dataset.index);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = val;
  } else if (select.dataset.action === "inline-nature") {
    set.nature = val;
  }

  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
});

setEditorBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);

  if (btn.dataset.action === "edit-ability") openSetChoice("ability");
  if (btn.dataset.action === "edit-item") {
    if (mon.name.includes("-mega")) {
      alert("Los Pokémon Megaevolucionados no pueden cambiar de objeto.");
      return;
    }
    openSetChoice("item");
  }
  if (btn.dataset.action === "edit-nature") openSetChoice("nature");
  if (btn.dataset.action === "edit-move")
    openSetChoice("move", Number(btn.dataset.index));

  if (btn.dataset.action === "quick-ability") {
    set.ability = btn.dataset.value || "";
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }

  if (btn.dataset.action === "quick-item") {
    set.item = btn.dataset.value || "";
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }

  if (btn.dataset.action === "quick-spread") {
    const nature = btn.dataset.nature || "";
    const evs = JSON.parse(btn.dataset.evs || "{}");
    set.nature = nature;
    set.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs };
    if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }

  if (btn.dataset.action === "quick-move-any") {
    const firstEmpty = (set.moves || []).findIndex(
      (x) => !String(x || "").trim(),
    );
    openSetChoice("move", firstEmpty >= 0 ? firstEmpty : 0);
    setChoiceSearch.value = btn.dataset.value || "";
    renderSetChoiceList();
  }

  if (btn.dataset.action === "clear-move") {
    const idx = Number(btn.dataset.index);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = "";
    if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }
});

setChoiceSearch.addEventListener("input", renderSetChoiceList);

setChoiceList.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="apply-choice"]');
  if (!btn) return;
  applySetChoice(btn.dataset.value || "");
});

document
  .getElementById("closeSetEditorBtn")
  .addEventListener("click", closeSetEditor);
document.getElementById("doneSetBtn").addEventListener("click", closeSetEditor);
document
  .getElementById("resetSetBtn")
  .addEventListener("click", resetCurrentSetToMeta);
document
  .getElementById("changePokemonBtn")
  .addEventListener("click", changeCurrentPokemonFromEditor);

document
  .getElementById("closeSetChoiceBtn")
  .addEventListener("click", closeSetChoice);
document
  .getElementById("confirmSetChoiceBtn")
  .addEventListener("click", closeSetChoice);
document
  .getElementById("clearSetChoiceBtn")
  .addEventListener("click", clearSetChoiceValue);
document
  .getElementById("applyCustomChoiceBtn")
  .addEventListener("click", () => {
    const value = String(setChoiceSearch.value || "").trim();
    if (!value) return;
    applySetChoice(value);
  });

setEditorModal.addEventListener("click", (e) => {
  if (e.target === setEditorModal) closeSetEditor();
});

setChoiceModal.addEventListener("click", (e) => {
  if (e.target === setChoiceModal) closeSetChoice();
});

document.getElementById("bestFourCard").addEventListener("click", () => {
  // Feature: Click to highlight/expand best four (Future enhancement)
});

async function hydrateSavedState() {
  // Centralizado en el Drawer, ya no se renderiza en la inicialización
}

async function warmupLocalizationCaches() {
  // Future translation or cache warmups
}

const UIMODE_KEY = 'offensive-matrix-ui-mode';

function loadUiMode() {
  try {
    const saved = localStorage.getItem(UIMODE_KEY);
    if (saved === 'quick' || saved === 'expert' || saved === 'live') state.uiMode = saved;
  } catch {}
}

function setUiMode(mode) {
  state.uiMode = mode;
  try { localStorage.setItem(UIMODE_KEY, mode); } catch {}
  
  // Sincronizar las selecciones de leads (Quick) con slots activos (Expert)
  if (mode === 'expert' || mode === 'live') {
    if (state.leads.self.length > 0) state.activeSelfSlots = [...state.leads.self];
    if (state.leads.enemy.length > 0) state.activeEnemySlots = [...state.leads.enemy];
  } else {
    if (state.activeSelfSlots.length > 0) state.leads.self = [...state.activeSelfSlots];
    if (state.activeEnemySlots.length > 0) state.leads.enemy = [...state.activeEnemySlots];
  }
  
  recalculateActiveField();
  renderAll();
}

function renderUiMode() {
  const isQuick = state.uiMode === 'quick';
  const isLive = state.uiMode === 'live';

  // Toggle visual en el segmented
  document
    .querySelectorAll('#uiModeToggle .segmented-btn')
    .forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === state.uiMode);
    });

  // Secciones "Rápidas"
  const quickPreviewPanel = document.getElementById('quickPreviewPanel');
  const turn1Panel       = document.getElementById('turn1SimulatorPanel');
  const quickCombosSection = document.getElementById('quickCombosSection');
  
  if (quickPreviewPanel) quickPreviewPanel.style.display = isQuick ? 'block' : 'none';
  if (turn1Panel)        turn1Panel.style.display        = isQuick ? 'block' : 'none';
  if (quickCombosSection) quickCombosSection.style.display = isQuick ? 'block' : 'none';

  // Secciones "Expertas"
  const matrixSection = document.getElementById('matrixSectionTitle')?.closest('section');
  const insightGrid   = document.querySelector('.insight-grid');
  const dockAlerts    = document.getElementById('defensiveAlertFloat');

  if (matrixSection) matrixSection.style.display = (isQuick || isLive) ? 'none' : 'block';
  if (insightGrid)   insightGrid.style.display   = (isQuick || isLive) ? 'none' : 'grid';
  if (dockAlerts)    dockAlerts.style.display    = (isQuick || isLive) ? 'none' : 'flex';
}

const uiModeToggle = document.getElementById('uiModeToggle');
if (uiModeToggle) {
  uiModeToggle.addEventListener('click', e => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn) return;
    setUiMode(btn.dataset.mode);
  });
}

window.GameDB = null;

async function initApp() {
  flowLog('initApp: Iniciando aplicación');
  loadUiMode();
  loadMatrixPreferences();
  
  try {
    const res = await fetch('./data/data-bundle.json');
    window.GameDB = await res.json();
    
    if (DEBUG_MODE) {
      console.groupCollapsed(`📦 [DATABASE STARTUP] Inspección de data-bundle.json`);
      console.log(`🔹 Pokémon Activos: ${Object.keys(window.GameDB?.pokedex || {}).length}`);
      console.log(`🔹 Movimientos Cargados: ${Object.keys(window.GameDB?.moves || {}).length} (⚠️ Revisa si están los multi-palabra como 'flareblitz')`);
      console.log(`🔹 Traducciones Listas: ${Object.keys(window.GameDB?.translations || {}).length}`);
      console.groupEnd();
    }
  } catch (e) {
    console.error("No se pudo cargar data-bundle.json", e);
    return;
  }
  
  Object.assign(i18nCache, window.GameDB.translations || {});
  
  state.smogonRaw = window.GameDB.smogon;
  buildMetaIndex(state.smogonRaw);
  
  ensurePokedex();
  await rehydrateCurrentTeamsSets();
  renderAll();
  toggleMatrixHelp(state.matrixHelpOpen);
  flowLog('initApp: Aplicación inicializada con éxito');
}

initApp();

const damageTooltipContainer = document.createElement("div");
damageTooltipContainer.id = "damageTooltip";
document.body.appendChild(damageTooltipContainer);

matrixContainer.addEventListener("click", (e) => {
  const cell = e.target.closest('.clickable-cell[data-tooltip]');
  if (!cell) return;
  const data = JSON.parse(decodeURIComponent(cell.dataset.tooltip));

  const moveTypeStr = data.moveType || data.type || 'normal';
  const typeIcon = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/${moveTypeStr.toLowerCase()}.svg`;
  const typeColor = TYPE_META[moveTypeStr]?.color || '#fff';
  const iconContrast = getContrastColor(typeColor);

  /* damageTooltipContainer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <div class="type-icon-circle" style="position: static; background-color: ${typeColor}; width: 20px; height: 20px; box-shadow: none;">
            <div class="type-svg-mask" style="mask-image: url('${typeIcon}'); -webkit-mask-image: url('${typeIcon}'); background-color: ${iconContrast}; width: 12px; height: 12px;"></div>
        </div>
        <strong style="font-size: 0.85rem; color: #fff;">${data.move} vs ${data.defender}</strong>
    </div>
    <div style="font-size: 0.75rem; color: var(--muted); margin-bottom: 2px;">Daño: <strong style="color: white;">${data.minPct}% - ${data.maxPct}%</strong></div>
    <div style="font-size: 0.75rem; color: var(--muted);">Probabilidad de OHKO: <strong style="color: ${data.ohkoProb > 0 ? 'var(--red)' : 'white'};">${data.ohkoProb}%</strong></div>
  `; */

 /*  damageTooltipContainer.style.left = `\${e.clientX + 15}px\`;
  damageTooltipContainer.style.top = `\${e.clientY + 15}px\`;
  damageTooltipContainer.classList.add('show'); */

  const rect = damageTooltipContainer.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
      damageTooltipContainer.style.left = '${e.clientX - rect.width - 15}px';
  }
  if (rect.bottom > window.innerHeight) {
      damageTooltipContainer.style.top = '${e.clientY - rect.height - 15}px';
  }

  clearTimeout(damageTooltipContainer.timeout);
  damageTooltipContainer.timeout = setTimeout(() => {
    damageTooltipContainer.classList.remove('show');
  }, 3000);
});

const scoutTooltipContainer = document.createElement("div");
scoutTooltipContainer.id = "scoutTooltip";
document.body.appendChild(scoutTooltipContainer);

function showScoutTooltip(slug, e) {
  if (!slug) return;
  const record = getMetaRecord(slug);
  if (!record || !record.entry) return;

  const formatNameSafe = (str, cat) => {
    const clean = normalizeText(str);
    return getTranslation(clean, cat) || formatName(clean);
  };

  const items = topEntries(record.entry.Items || {}, 3);
  const moves = topEntries(record.entry.Moves || {}, 5);

  if (!items.length && !moves.length) return;

  let html = `<div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${record.slug === 'aegislash-blade' ? '10026' : record.entry.id || 0}.png" onerror="this.style.display='none'" style="width:24px; height:24px;">
    <strong style="color: var(--gold); font-size: 0.9rem;">Scout: ${record.displayName}</strong>
  </div>`;

  if (items.length) {
    html += `<div class="scout-section-title"><i data-lucide="package" style="width:12px;height:12px;"></i> Objetos probables</div>`;
    items.forEach(i => {
      const pct = (i.value * 100).toFixed(1);
      html += `
        <div class="scout-bar-row">
          <div class="scout-bar-label">${formatNameSafe(i.key, 'item')}</div>
          <div class="scout-bar-track"><div class="scout-bar-fill" style="width: ${pct}%; background: var(--purple);"></div></div>
          <div class="scout-bar-pct">${pct}%</div>
        </div>
      `;
    });
  }

  if (moves.length) {
    html += `<div class="scout-section-title"><i data-lucide="crosshair" style="width:12px;height:12px;"></i> Ataques probables</div>`;
    moves.forEach(m => {
      const pct = (m.value * 100).toFixed(1);
      html += `
        <div class="scout-bar-row">
          <div class="scout-bar-label">${formatNameSafe(m.key, 'move')}</div>
          <div class="scout-bar-track"><div class="scout-bar-fill" style="width: ${pct}%; background: var(--blue);"></div></div>
          <div class="scout-bar-pct">${pct}%</div>
        </div>
      `;
    });
  }

  scoutTooltipContainer.innerHTML = html;
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons({ root: scoutTooltipContainer });
  }
  
  scoutTooltipContainer.classList.add('show');
  
  requestAnimationFrame(() => {
    const bounds = scoutTooltipContainer.getBoundingClientRect();
    let left = e.clientX + 15;
    let top = e.clientY + 15;
    if (left + bounds.width > window.innerWidth) left = e.clientX - bounds.width - 15;
    if (top + bounds.height > window.innerHeight) top = e.clientY - bounds.height - 15;
    
    scoutTooltipContainer.style.left = `${Math.max(10, left)}px`;
    scoutTooltipContainer.style.top = `${Math.max(10, top)}px`;
  });
  
  clearTimeout(scoutTooltipContainer.timeout);
  scoutTooltipContainer.timeout = setTimeout(() => {
    scoutTooltipContainer.classList.remove('show');
  }, 4000);
}

document.addEventListener("pointerenter", (e) => {
  if (e.pointerType !== 'mouse') return;
  if (!e.target || typeof e.target.closest !== 'function') return;
  const target = e.target.closest('[data-scout]');
  if (!target) return;
  showScoutTooltip(target.dataset.scout, e);
}, true);

document.addEventListener("pointerleave", (e) => {
  if (e.pointerType !== 'mouse') return;
  if (!e.target || typeof e.target.closest !== 'function') return;
  const target = e.target.closest('[data-scout]');
  if (target) scoutTooltipContainer.classList.remove('show');
}, true);

document.addEventListener("click", () => {
  if (scoutTooltipContainer) scoutTooltipContainer.classList.remove('show');
}, true);

// --- Team Config Drawer ---
function renderTeamConfigDrawer(teamType) {
  let modalContainer = document.getElementById("teamConfigModal");
  if (!modalContainer) {
    modalContainer = document.createElement("div");
    modalContainer.id = "teamConfigModal";
    document.body.appendChild(modalContainer);
  }

  const title = teamType === 'self' ? 'Configuración de Tu Equipo' : 'Configuración del Rival';
  const icon = teamType === 'self' ? 'shield-half' : 'swords';
  const savedTeams = getSavedTeams();

  let quickActionsHtml = '';
  if (teamType === 'self') {
    quickActionsHtml += `
      <div class="save-bar" style="margin-bottom: 12px;">
        <input id="drawerSaveName" class="save-input" placeholder="Nombre del equipo" />
        <button class="btn green" onclick="handleDrawerAction('save', 'self')">Guardar Equipo</button>
      </div>
    `;
  }
  quickActionsHtml += `
    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
      <button class="btn blue" style="flex: 1;" onclick="handleDrawerAction('import', '${teamType}')"><i data-lucide="clipboard-paste"></i> Importar Paste</button>
      <button class="btn red" style="flex: 1;" onclick="handleDrawerAction('clear', '${teamType}')"><i data-lucide="trash-2"></i> Limpiar Slots</button>
    </div>
  `;

  const savedTeamsHtml = savedTeams.length ? savedTeams.map(team => `
    <div class="drawer-team-card">
      <div class="drawer-team-info">
        <div class="drawer-team-title">${team.name}</div>
        <div class="drawer-team-desc">${team.mons.length} slots · corte ${team.rating || state.rating}</div>
        <div class="drawer-team-sprites">
          ${team.mons.map(m => `<div class="drawer-team-sprite"><img src="${m.sprite}"></div>`).join('')}
        </div>
      </div>
      <div class="drawer-team-actions">
        <button class="btn small blue" onclick="handleDrawerAction('load-saved', '${teamType}', '${team.id}')">Cargar</button>
        ${teamType === 'self' ? `<button class="btn small red" onclick="handleDrawerAction('delete-saved', '${teamType}', '${team.id}')">Borrar</button>` : ''}
      </div>
    </div>
  `).join('') : '<div class="empty">No hay equipos guardados en tus cajas.</div>';

  const presetsHtml = META_PRESETS.map((preset, idx) => `
    <div class="drawer-team-card">
      <div class="drawer-team-info">
        <div class="drawer-team-title">${preset.name}</div>
        <div class="drawer-team-desc">${preset.desc}</div>
        <div class="drawer-team-sprites">
          ${preset.mons.map(slug => {
            const cached = state.cache.get(normalizeText(slug));
            const spriteUrl = cached ? cached.sprite : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${slug}.png`;
            return `<div class="drawer-team-sprite"><img src="${spriteUrl}" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'"></div>`;
          }).join('')}
        </div>
      </div>
      <div class="drawer-team-actions">
        <button class="btn small blue" onclick="handleDrawerAction('load-preset', '${teamType}', ${idx})">Cargar</button>
      </div>
    </div>
  `).join('');

  modalContainer.innerHTML = `
    <div class="premium-drawer-overlay" id="drawerOverlay" onclick="closeTeamDrawer(event)">
      <div class="premium-drawer" onclick="event.stopPropagation()">
        <div class="drawer-handle"></div>

        <div class="drawer-header">
          <div class="drawer-title">
            <i data-lucide="${icon}"></i>
            <span>${title}</span>
          </div>
          <button class="icon-btn" onclick="closeTeamDrawer()" style="background: rgba(255,255,255,0.05); border-radius: 50%; padding: 6px; border: none; cursor: pointer; color: #fff; display: grid; place-items: center;"><i data-lucide="x" style="width: 16px; height: 16px;"></i></button>
        </div>

        ${quickActionsHtml}

        <div class="drawer-tabs">
          <button class="drawer-tab active" onclick="switchDrawerTab('saved')">Mis Cajas</button>
          <button class="drawer-tab" onclick="switchDrawerTab('presets')">Top Meta</button>
        </div>

        <div class="drawer-tab-content active" id="tab-saved">
          <div class="drawer-scroll-list">
            ${savedTeamsHtml}
          </div>
        </div>

        <div class="drawer-tab-content" id="tab-presets">
          <div class="drawer-scroll-list">
            ${presetsHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    if (typeof section !== "undefined" && section) {
        lucide.createIcons({ root: section });
    } else {
        lucide.createIcons();
    }
  }

  const overlay = document.getElementById("drawerOverlay");
  void overlay.offsetWidth;
  overlay.classList.add("open");
}

window.closeTeamDrawer = function(e) {
  if (e && e.target !== e.currentTarget) return;
  const overlay = document.getElementById("drawerOverlay");
  if (overlay) {
    overlay.classList.remove("open");
  }
};

window.switchDrawerTab = function(tabId) {
  document.querySelectorAll('.drawer-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.drawer-tab-content').forEach(content => content.classList.remove('active'));
  
  if (tabId === 'saved') {
    document.querySelectorAll('.drawer-tab')[0].classList.add('active');
    document.getElementById('tab-saved').classList.add('active');
  } else {
    document.querySelectorAll('.drawer-tab')[1].classList.add('active');
    document.getElementById('tab-presets').classList.add('active');
  }
};

window.handleDrawerAction = async function(action, teamType, payload) {
  if (action === 'save') {
    const input = document.getElementById("drawerSaveName");
    saveCurrentTeam(input ? input.value : "");
    renderTeamConfigDrawer(teamType);
  } else if (action === 'import') {
    alert("En desarrollo: Importación de Poképaste");
  } else if (action === 'clear') {
    state[teamType] = Array(6).fill(null);
    state.leads[teamType] = [];
    if (teamType === "self") state.activeSelfSlots = [0, 1];
    if (teamType === "enemy") state.activeEnemySlots = [0, 1];
    renderAll();
    closeTeamDrawer();
  } else if (action === 'load-saved') {
    await loadSavedTeam(payload, teamType);
    closeTeamDrawer();
  } else if (action === 'delete-saved') {
    deleteSavedTeam(payload);
    renderTeamConfigDrawer(teamType);
  } else if (action === 'load-preset') {
    const preset = META_PRESETS[payload];
    await fillTeamWithSpecies(teamType, preset.mons);
    closeTeamDrawer();
  }
};

document.addEventListener('click', e => {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const btnLock = e.target.closest('#lockBestFourBtn');
  if (btnLock) {
    const preview = computeQuickPreview(getRows());
    lockBestFour(preview);
    return;
  }

  const comboCard = e.target.closest('.combo-card');
  if (comboCard) {
    const idxs = comboCard.dataset.combo.split(',').map(x => Number(x));
    applyQuickCombo(idxs);
    return;
  }
});
// --- LIVE BATTLE CENTER EXPERT MODE ---

function isBattleFocusActive() {
  return (state.uiMode === "expert" && state.battleFocus === "active") || state.uiMode === "live";
}

function getFilledIndices(side) {
  return state[side].map((m, i) => m ? i : null).filter(i => i !== null);
}

function normalizeActiveSlots(side) {
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  const filled = getFilledIndices(side);
  if (filled.length === 0) {
    state[activeKey] = [];
    return;
  }
  let current = state[activeKey].filter(idx => filled.includes(idx));
  for (const idx of filled) {
    if (current.length >= 2) break;
    if (!current.includes(idx)) current.push(idx);
  }
  state[activeKey] = current;
}

function getFocusedIndices(side) {
  if (!isBattleFocusActive()) return getFilledIndices(side);
  normalizeActiveSlots(side);
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  return state[activeKey];
}

function getFocusedTeam(side) {
  const indices = getFocusedIndices(side);
  return indices.map(i => state[side][i]).filter(Boolean);
}

function setBattleFocus(focus) {
  state.battleFocus = focus;
  const strip = document.getElementById("activeMatchupStrip");
  const toolbar = document.getElementById("liveBattleToolbar");
  if (strip) strip.style.display = focus === "active" ? "flex" : "none";
  if (toolbar) toolbar.style.display = focus === "active" ? "flex" : "none";
  renderAll();
}

function setActiveBattleSlot(side, activePosition, newTeamIndex) {
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  const current = [...state[activeKey]];
  
  if (current.includes(newTeamIndex)) {
    const otherPos = current.indexOf(newTeamIndex);
    current[otherPos] = current[activePosition];
  }
  current[activePosition] = newTeamIndex;
  state[activeKey] = current;
  closeBattleSheet();
  recalculateActiveField();
  renderAll();
}

function getTacticalCellClass(cell) {
  if (cell.ohko || cell.ohkoProb >= 50) return "ko-probable";
  if (cell.mult >= 2) return "pressure-high";
  if (cell.mult >= 1) return "pressure-medium";
  if (cell.mult === 0 || cell.mult <= 0.25) return "bad-entry";
  if (cell.mult <= 0.5) return "safe-switch";
  return "";
}

const _originalMatrixCellClass = matrixCellClass;
matrixCellClass = function(cell) {
  if (isBattleFocusActive()) {
    const tac = getTacticalCellClass(cell);
    return tac ? "cell--" + tac : _originalMatrixCellClass(cell);
  }
  return _originalMatrixCellClass(cell);
};

function renderActiveMatchupStrip() {
  if (!isBattleFocusActive()) return;
  normalizeActiveSlots("self");
  normalizeActiveSlots("enemy");
  
  const renderSlotBtn = (side, pos, idx) => {
    const mon = idx !== undefined && idx !== null ? state[side][idx] : null;
    const btn = document.getElementById(`active${side === "self" ? "Self" : "Enemy"}Slot${pos === 0 ? "A" : "B"}`);
    if (!btn) return;
    if (mon) {
      btn.innerHTML = `<img src="${mon.sprite}" alt="${mon.displayName}">`;
      btn.className = `active-slot-btn active-slot-btn--${side}`;
      btn.onclick = () => openBattleSheet({ side, activePosition: pos, isSelector: true });
    } else {
      btn.innerHTML = `<i data-lucide="plus" style="color:var(--muted);width:20px;height:20px;"></i>`;
      btn.className = `active-slot-btn empty`;
    }
        btn.onclick = () => openBattleSheet({ side, activePosition: pos, isSelector: true });
  };

  renderSlotBtn("self", 0, state.activeSelfSlots[0]);
  renderSlotBtn("self", 1, state.activeSelfSlots[1]);
  renderSlotBtn("enemy", 0, state.activeEnemySlots[0]);
  renderSlotBtn("enemy", 1, state.activeEnemySlots[1]);
  updateIcons();
}

function renderLiveBattleToolbar() {
  if (!isBattleFocusActive()) return;
  const selfMons = getFocusedTeam("self");
  const enemyMons = getFocusedTeam("enemy");
  
  let threats = 0;
  let kills = 0;
  let safes = 0;
  
  for (const e of enemyMons) {
    let threatensMe = false;
    let safeSwitchForMe = true;
    for (const s of selfMons) {
      const eAtk = bestAttack(e, s);
      if (eAtk.mult >= 2 || eAtk.ohko) threatensMe = true;
      if (eAtk.mult >= 1) safeSwitchForMe = false;
      
      const sAtk = bestAttack(s, e);
      if (sAtk.ohko || sAtk.ohkoProb >= 80) kills++;
    }
    if (threatensMe) threats++;
    if (safeSwitchForMe) safes++;
  }
  
  const elThreats = document.getElementById("battleUrgencyThreats");
  const elKills = document.getElementById("battleUrgencyKills");
  const elSafes = document.getElementById("battleUrgencySafeSwitches");
  
  if (elThreats) elThreats.innerHTML = `<i data-lucide="alert-circle" style="width:12px;height:12px;"></i> ${threats} Amenazas`;
  if (elKills) elKills.innerHTML = `<i data-lucide="crosshair" style="width:12px;height:12px;"></i> ${kills} KOs`;
  if (elSafes) elSafes.innerHTML = `<i data-lucide="shield-check" style="width:12px;height:12px;"></i> ${safes} Seguros`;
}

function openBattleSheet(payload) {
  state.battleSheet = { open: true, ...payload };
  renderBattleSheet();
  document.getElementById("battleSheetOverlay").style.display = "block";
  document.getElementById("battleSheet").classList.add("open");
}

function closeBattleSheet() {
  state.battleSheet.open = false;
  document.getElementById("battleSheetOverlay").style.display = "none";
  document.getElementById("battleSheet").classList.remove("open");
  
  state.selectedMatrixCell = null;
  document.querySelectorAll(".cell--selected").forEach(el => el.classList.remove("cell--selected"));
  document.querySelectorAll(".matrix-row-selected").forEach(el => el.classList.remove("matrix-row-selected"));
  document.querySelectorAll(".matrix-col-selected").forEach(el => el.classList.remove("matrix-col-selected"));
}

function getTacticalReasons(data) {
   const reasons = [];
   if (data.blocked) reasons.push("Prioridad anulada por campo o inmunidad.");
   if (data.rawMult === 0 && !data.blocked) reasons.push("Inmunidad total por tipos o habilidad.");
   if (data.rawMult > 1) reasons.push(`Golpe muy eficaz (x${data.rawMult}).`);
   if (data.rawMult < 1 && data.rawMult > 0) reasons.push(`Golpe poco eficaz (x${data.rawMult}).`);
   if (data.wMul > 1) reasons.push("Daño potenciado por el clima activo.");
   if (data.wMul < 1) reasons.push("Daño reducido por el clima activo.");
   if (data.terrMul > 1) reasons.push("Daño potenciado por el terreno activo.");
   if (data.terrMul < 1) reasons.push("Daño reducido por el terreno activo.");
   if (data.maxPct < 35 && !data.blocked && data.mult > 0) reasons.push("El daño base estimado es muy bajo.");
   if (data.ohkoProb > 0) reasons.push(`Alta amenaza de KO directo (${data.ohkoProb}%).`);
   if (!reasons.length) reasons.push("Cruce neutral. Sin modificadores especiales.");
   return reasons;
}

function getTacticalMeaning(data) {
  const mult = data.mult ?? data.rawMult ?? 1;
  const attacker = data.attacker;
  const moves = attacker?.set?.moves ?? [];
  
  const hasFakeOut = moves.some(m => String(m).toLowerCase().includes('fake out') || String(m).toLowerCase().includes('sorpresa'));
  const hasProtect = moves.some(m => ['protect','detect','protección','detección'].includes(String(m).toLowerCase()));
  
  if (mult === 0 || data.blocked) return 'Inmune o bloqueado. Considera cambiar de objetivo o usar un ataque neutro.';
  if (mult >= 4 || (data.ohkoProb >= 80)) return '¡KO casi garantizado! Presiona sin dudar este turno.';
  if (mult >= 2) return 'Ventaja clara. Entra o ataca con confianza.';
  if (mult <= 0.5) return 'Desventaja. Considera cambio seguro o usar soporte.';
  if (hasFakeOut) return 'Fake Out disponible. Paraliza primero, luego decide.';
  if (hasProtect) return 'Protect disponible. Scouting o stall si hay duda.';
  return 'Cruce neutral. Evalúa velocidad y prioridad antes de comprometerte.';
}

function getActiveEnemyLeads(targetEnemyName) {
    const activeIndices = getTurn1ResolvedLeadIndices("enemy");
    let enemies = activeIndices.map(i => state.enemy[i]).filter(Boolean);
    
    const hasEnemy = enemies.some(e => e.name === targetEnemyName);
    if (!hasEnemy) {
        const specificEnemy = state.enemy.find(e => e && e.name === targetEnemyName);
        if (specificEnemy) {
            enemies = [specificEnemy, enemies.length > 0 ? enemies[0] : null].filter(Boolean);
        }
    }
    return enemies;
}

function classifyReserve(candidate, activeEnemies) {
    let worstPct = 0;
    let worstMult = 0;
    let ohkoRisk = false;

    for (const enemy of activeEnemies) {
        if (!enemy) continue;
        const atk = bestAttack(enemy, candidate); 
        if (atk.maxPct > worstPct) worstPct = atk.maxPct;
        if (atk.mult > worstMult) worstMult = atk.mult;
        if (atk.ohkoProb > 0) ohkoRisk = true;
    }

    let category = "unsafe";
    let reason = "Recibe demasiado daño al entrar.";

    if (!ohkoRisk && worstPct <= 35 && worstMult <= 0.5) {
        category = "safe";
        reason = "Absorbe bien la presión de los rivales en mesa.";
    } else if (!ohkoRisk && worstPct <= 55 && worstMult <= 1) {
        category = "pivot";
        reason = "Aguanta el golpe para facilitar un reposicionamiento.";
    } else if (ohkoRisk) {
        category = "unsafe";
        reason = "Se expone a un OHKO directo si entra ahora.";
    } else {
        category = "unsafe";
        reason = "Desventaja letal. El daño recibido no compensa.";
    }

    return { candidate, category, reason, worstPct, worstMult };
}

function getSuggestedReserves(data) {
    const selfTeam = state.self.filter(Boolean);
    if (!selfTeam.length) return [];

    const activeSelfIndices = getTurn1ResolvedLeadIndices("self");
    const activeSelfNames = activeSelfIndices.map(i => state.self[i]?.name).filter(Boolean);
    
    const currentSelfName = data.offensive ? data.attacker : data.defender;
    if (!activeSelfNames.includes(currentSelfName)) activeSelfNames.push(currentSelfName);

    const bench = selfTeam.filter(m => !activeSelfNames.includes(m.name));
    if (!bench.length) return [];

    const targetEnemyName = data.offensive ? data.defender : data.attacker;
    const activeEnemies = getActiveEnemyLeads(targetEnemyName);

    const evaluated = bench.map(cand => classifyReserve(cand, activeEnemies));
    
    evaluated.sort((a, b) => {
       const catScore = { "safe": 1, "pivot": 2, "unsafe": 3 };
       if (catScore[a.category] !== catScore[b.category]) return catScore[a.category] - catScore[b.category];
       return a.worstPct - b.worstPct;
    });

    return evaluated.slice(0, 3);
}

function renderBattleSheet() {
  const body = document.getElementById("battleSheetBody");
  const title = document.getElementById("battleSheetTitle");
  const { side, activePosition, isSelector, cell } = state.battleSheet;

  if (isSelector) {
    title.textContent = "Elegir Activo";
    const team = state[side];
    const filledIndices = getFilledIndices(side);
    const currentActive = side === "self" ? state.activeSelfSlots : state.activeEnemySlots;
    
    body.innerHTML = `
      <div class="sheet-tactical-label">Reservas Disponibles</div>
      <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:8px;">
        ${filledIndices.map(idx => {
          const mon = team[idx];
          const isAct = currentActive.includes(idx);
          return `
            <div class="sheet-squad-btn ${isAct ? "active" : ""}" onclick="setActiveBattleSlot('${side}', ${activePosition}, ${idx})" style="position:relative;">
              ${isAct ? `<span style="position:absolute; top:-4px; right:-4px; background:var(--blue); color:#fff; border-radius:50%; width:16px; height:16px; font-size:10px; display:grid; place-items:center;"><i data-lucide="check" style="width:10px;height:10px;"></i></span>` : ""}
              <img src="${mon.sprite}" alt="${mon.displayName}">
            </div>
          `;
        }).join("")}
      </div>
    `;
    updateIcons();
    return;
  }

  if (cell) {
    title.textContent = "Lectura Táctica";
    const data = JSON.parse(decodeURIComponent(cell.dataset.tooltip));
    const attackerObj = data.attacker || {};
    const defenderObj = data.defender || {};
    
    const attackerName = attackerObj.displayName ?? attackerObj.name ?? data.attackerName ?? 'Atacante';
    const defenderName = defenderObj.displayName ?? defenderObj.name ?? data.defenderName ?? 'Defensor';
    const attackerSprite = attackerObj.sprite ?? '';
    const defenderSprite = defenderObj.sprite ?? '';
    
    const attackerTypes = attackerObj.types?.map(t => typeChip(t)).join('') ?? '';
    const defenderTypes = defenderObj.types?.map(t => typeChip(t)).join('') ?? '';
    
    const moveName = data.moveName ?? data.move ?? 'Desconocido';
    const moveType = data.moveType ?? data.type ?? 'normal';
    const minPct = data.minPct ?? 0;
    const maxPct = data.maxPct ?? 0;
    const mult = data.mult ?? data.rawMult ?? null;
    const multStr = mult !== null ? fmtMult(mult) : '';
    
    const reserves = getSuggestedReserves(data);
    const reasons = getTacticalReasons(data);
    const meaning = getTacticalMeaning(data);

    body.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          ${attackerSprite ? `<img src="${attackerSprite}" class="sprite-sm" alt="${attackerName}" style="width:40px;height:40px;object-fit:contain;border-radius:50%;background:rgba(0,0,0,0.3);">` : ''}
          <div>
            <div style="font-size:1.1rem; font-weight:900;">${attackerName}</div>
            <div style="display:flex; gap:4px; margin-top:4px;">${attackerTypes}</div>
          </div>
        </div>
        <i data-lucide="arrow-right" style="color:var(--muted); font-size:1.2rem;"></i>
        <div style="display:flex; align-items:center; gap:8px;">
          ${defenderSprite ? `<img src="${defenderSprite}" class="sprite-sm" alt="${defenderName}" style="width:40px;height:40px;object-fit:contain;border-radius:50%;background:rgba(0,0,0,0.3);">` : ''}
          <div>
            <div style="font-size:1.1rem; font-weight:900;">${defenderName}</div>
            <div style="display:flex; gap:4px; margin-top:4px;">${defenderTypes}</div>
          </div>
        </div>
      </div>
      
      <div class="sheet-tactical-block" style="margin-top: 16px;">
         <div class="sheet-tactical-label">Mejor Opción Estimada</div>
         <div class="sheet-tactical-val" style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
           ${typeDot(moveType)} <span style="font-size:1rem; font-weight:700;">${moveName}</span>
         </div>
         <div style="display:flex; gap:12px; font-size:0.8rem; color:var(--muted);">
            <span>Daño: <strong style="color:#fff;">${minPct}% - ${maxPct}% ${multStr ? `(${multStr})` : ''}</strong></span>
            ${data.ohkoProb > 0 ? `<span>Riesgo OHKO: <strong style="color:var(--red);">${data.ohkoProb}%</strong></span>` : ''}
         </div>
      </div>

      <div class="sheet-tactical-block">
         <div class="sheet-tactical-label">Por qué pasa</div>
         <ul class="sheet-reasons-list">
            ${reasons.map(r => `<li><i data-lucide="info"></i> ${r}</li>`).join('')}
         </ul>
      </div>

      <div class="sheet-tactical-block">
         <div class="sheet-tactical-label">Qué significa en mesa</div>
         <div class="sheet-tactical-meaning">${meaning}</div>
      </div>

      <div class="sheet-tactical-block">
         <div class="sheet-tactical-label">Banca Sugerida (Evaluada vs Rival Activo)</div>
         ${reserves.length > 0 ? `
           <div class="sheet-reserves-list">
             ${reserves.map(r => `
               <div class="sheet-reserve-item ${r.category === 'unsafe' ? 'sheet-reserve-item--unsafe' : ''}">
                 <img src="${r.candidate.sprite}" alt="${r.candidate.displayName}">
                 <div class="sheet-reserve-info">
                   <strong>${r.candidate.displayName} <span class="tag-pill ${r.category === 'safe' ? 'tag-pill--success' : r.category === 'pivot' ? 'tag-pill--warning' : 'tag-pill--danger'}">${r.category === 'safe' ? 'Seguro' : r.category === 'pivot' ? 'Pivot' : 'Riesgo'}</span></strong>
                   <span>${r.reason}</span>
                 </div>
               </div>
             `).join('')}
           </div>
         ` : `<div class="muted-small">No tienes banca segura o disponible.</div>`}
      </div>

      ${data.debug ? `
      <div class="sheet-tactical-block" style="border: 1px dashed var(--gold); padding: 8px; background: rgba(255,215,0,0.05); margin-top:12px; border-radius:8px;">
         <div class="sheet-tactical-label" style="color: var(--gold);"><i data-lucide="bug" style="width:14px;height:14px;"></i> Debug Data</div>
         <ul class="sheet-reasons-list" style="font-family: monospace; font-size: 0.75rem; color: var(--gold); margin-top:4px;">
            <li>rawMult: ${data.debug.rawMult}</li>
            <li>wMul: ${data.debug.wMul}</li>
            <li>terrMul: ${data.debug.terrMul}</li>
            ${(data.debug.registryExplain || []).map(r => `<li>${r}</li>`).join('')}
         </ul>
      </div>
      ` : ''}
    `;
    updateIcons();
    return;
  }
}

const focusToggle = document.getElementById("matrixFocusToggle");
if (focusToggle) {
  focusToggle.addEventListener("click", e => {
    const btn = e.target.closest(".segmented-btn");
    if (!btn) return;
    document.querySelectorAll("#matrixFocusToggle .segmented-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    setBattleFocus(btn.dataset.focus);
  });
}

document.getElementById("closeBattleSheetBtn")?.addEventListener("click", closeBattleSheet);
document.getElementById("battleSheetOverlay")?.addEventListener("click", closeBattleSheet);

document.addEventListener("click", e => {
  if (!isBattleFocusActive()) return;
  if (!e.target || typeof e.target.closest !== 'function') return;
  const cell = e.target.closest(".clickable-cell[data-tooltip]");
  if (!cell) return;

  e.preventDefault();
  e.stopPropagation();

  if (state.selectedMatrixCell === cell) {
    openBattleSheet({ cell });
  } else {
    document.querySelectorAll(".cell--selected").forEach(el => el.classList.remove("cell--selected"));
    document.querySelectorAll(".matrix-row-selected").forEach(el => el.classList.remove("matrix-row-selected"));
    document.querySelectorAll(".matrix-col-selected").forEach(el => el.classList.remove("matrix-col-selected"));

    cell.classList.add("cell--selected");
    const td = cell.closest("td");
    const tr = cell.closest("tr");
    if (tr) tr.classList.add("matrix-row-selected");
    if (td) {
      const colIndex = Array.from(tr.children).indexOf(td);
      const table = cell.closest("table");
      if (table) {
        table.querySelectorAll("tr").forEach(r => {
           if (r.children[colIndex]) r.children[colIndex].classList.add("matrix-col-selected");
        });
      }
    }
    state.selectedMatrixCell = cell;
  }
});

/**
 * @typedef {Object} Action
 * @property {'move'|'switch'} kind
 * @property {'self'|'enemy'} side
 * @property {number} userIndex  índice en state[side]
 * @property {string} [moveName]
 * @property {('ally'|'foes'|'self'|number)} [target]  slot objetivo
 * @property {number} [switchInIndex] índice de bench al que se hace switch
 */

function getCandidateActions(state, side) {
  const team = state[side];
  const enemyTeam = state[side === 'self' ? 'enemy' : 'self'];
  const activeSlots = side === 'self' ? state.activeSelfSlots : state.activeEnemySlots;

  const actions = [];

  for (const userIndex of activeSlots) {
    const mon = team[userIndex];
    if (!mon) continue;

    const moves = mon.set?.moves || [];
    // 1) Mejor ataque ofensivo al target más amenazante
    let bestOffense = null;
    let bestOffenseTarget = null;
    for (let i = 0; i < enemyTeam.length; i++) {
      const enemy = enemyTeam[i];
      if (!enemy) continue;
      const best = bestAttack(mon, enemy);
      if (!bestOffense || best.damage > bestOffense.damage) {
        bestOffense = best;
        bestOffenseTarget = i;
      }
    }
    if (bestOffense && bestOffenseTarget !== null) {
      actions.push({
        kind: 'move',
        side,
        userIndex,
        moveName: bestOffense.move,
        target: bestOffenseTarget,
      });
    }

    // 2) Movimiento de soporte “estrella”
    const supportPriority = ['Trick Room', 'Tailwind', 'Follow Me', 'Rage Powder', 'Protect', 'Detect', 'Fake Out'];
    const supportPick = supportPriority.find((name) => moves.includes(name));
    if (supportPick) {
      actions.push({
        kind: 'move',
        side,
        userIndex,
        moveName: supportPick,
        target: 'foes',
      });
    }

    // 3) Mejor cambio defensivo (bench más seguro)
    const benchIndices = team
      .map((m, idx) => (m && !activeSlots.includes(idx) ? idx : null))
      .filter((x) => x !== null);

    if (benchIndices.length) {
      let bestBench = null;
      let bestBenchScore = -Infinity;
      for (const benchIdx of benchIndices) {
        const candidate = team[benchIdx];
        let worstThreat = 0;
        for (const enemy of enemyTeam) {
          if (!enemy) continue;
          const atk = bestAttack(enemy, candidate);
          worstThreat = Math.max(worstThreat, atk.maxPct || atk.damage || 0);
        }
        const score = -worstThreat; // queremos minimizar daño
        if (score > bestBenchScore) {
          bestBenchScore = score;
          bestBench = benchIdx;
        }
      }
      if (bestBench !== null) {
        actions.push({
          kind: 'switch',
          side,
          userIndex,
          switchInIndex: bestBench,
        });
      }
    }
  }

  return actions;
}

function simulateTurn(state, actionsSelf, actionsEnemy) {
  // Clonar estado para no mutar directamente si quieres analizar "what-if"
  const nextState = structuredClone(state);

  const all = [...actionsSelf, ...actionsEnemy];

  // Asignar prioridad base y velocidad para ordenar
  const withOrder = all.map((a) => {
    const team = nextState[a.side];
    const mon = team[a.userIndex];
    if (!mon) {
      return { action: a, orderKey: -Infinity };
    }

    let prio = 0;
    if (a.kind === 'move' && a.moveName) {
      if (PRIORITY_MOVES.has(a.moveName)) prio = 1;
      // Podrías extender a otras prioridades (Fake Out, Quick Guard, etc.)
    }
    const sideKey = a.side;
    const spe = calculateSpeed(mon, sideKey); // ya usa TR y registry

    // Mayor prioridad primero, luego más velocidad (o TR con signo)
    const orderKey = prio * 10000 + spe;

    return { action: a, orderKey };
  });

  withOrder.sort((a, b) => b.orderKey - a.orderKey);

  const log = [];

  // Helpers para aplicar daño
  const applyDamage = (side, index, dmg) => {
    const team = nextState[side];
    const mon = team[index];
    if (!mon) return;
    ensureBattleState(mon);
    const baseHP = calcMonHP(mon);
    const currentHP = Math.max(1, Math.floor((baseHP * (mon.battle.hpPct ?? 100)) / 100));
    const newHP = Math.max(0, currentHP - dmg);
    mon.battle.hpPct = Math.max(0, Math.floor((newHP / baseHP) * 100));
    if (mon.battle.hpPct <= 0) {
      mon.fainted = true;
    }
  };

  for (const { action } of withOrder) {
    const team = nextState[action.side];
    const enemySide = action.side === 'self' ? 'enemy' : 'self';
    const enemyTeam = nextState[enemySide];

    const mon = team[action.userIndex];
    if (!mon || mon.fainted) continue;

    if (action.kind === 'switch') {
      const inMon = team[action.switchInIndex];
      if (!inMon || inMon.fainted) continue;

      // swap en el slot
      const tmp = team[action.userIndex];
      team[action.userIndex] = inMon;
      team[action.switchInIndex] = tmp;

      ensureBattleState(team[action.userIndex]);
      applySwitchInEffects(team[action.userIndex], action.side); // ya actualiza campo
      log.push({
        type: 'switch',
        side: action.side,
        outIndex: action.switchInIndex,
        inIndex: action.userIndex,
      });
      continue;
    }

    if (action.kind === 'move' && action.moveName) {
      ensureMoveRegistry(action.moveName); // de Fase 3, para efectos de campo
      ensureAbilityRegistry(mon.set?.ability);
      ensureItemRegistry(mon.set?.item);

      const moveName = action.moveName;
      let targets = [];

      if (typeof action.target === 'number') {
        targets = [{ side: enemySide, index: action.target }];
      } else if (action.target === 'foes') {
        targets = enemyTeam
          .map((em, idx) => (em && !em.fainted ? { side: enemySide, index: idx } : null))
          .filter(Boolean);
      } else if (action.target === 'ally') {
        const allySlots = action.side === 'self' ? nextState.activeSelfSlots : nextState.activeEnemySlots;
        targets = allySlots
          .map((idx) => (idx !== action.userIndex && team[idx] ? { side: action.side, index: idx } : null))
          .filter(Boolean);
      }

      for (const t of targets) {
        const atkMon = mon;
        const defMon = nextState[t.side][t.index];
        if (!defMon || defMon.fainted) continue;

        const info = state.moveTypeCache[moveName] || {};
        const moveCandidate = {
          move: moveName,
          type: info.type || 'normal',
          power: info.power || 0,
          damageClass: info.damageClass || 'physical',
          hits: info.hits || GUARANTEED_MULTI_HITS[moveName] || 1,
          isSpread: info.isSpread || SPREAD_MOVES.has(moveName) || false
        };

        const { damage, blocked } = estimateMoveDamage(atkMon, defMon, moveCandidate, nextState.field);

        if (!blocked && damage > 0) {
          applyDamage(t.side, t.index, damage);
          log.push({
            type: 'hit',
            side: action.side,
            fromIndex: action.userIndex,
            toSide: t.side,
            toIndex: t.index,
            move: moveName,
            damage,
          });
        }
      }

      // Aplicar efectos secundarios de campo tras resolución
      if (typeof applyMoveResolutionEffects === 'function') {
        applyMoveResolutionEffects(mon, { name: moveName });
      }

      continue;
    }
  }

  // Final de turno: decrementar duraciones
  if (typeof tickField === 'function') {
    tickField(nextState);
  }

  return { nextState, log };
}

function scoreBoard(state, side) {
  const self = state[side];
  const enemy = state[side === 'self' ? 'enemy' : 'self'];

  let selfScore = 0;
  let enemyScore = 0;

  for (const mon of self) {
    if (!mon) continue;
    ensureBattleState(mon);
    const baseHP = calcMonHP(mon);
    const hpWeight = (mon.battle.hpPct ?? 100) / 100;
    selfScore += baseHP * hpWeight;
  }

  for (const mon of enemy) {
    if (!mon) continue;
    ensureBattleState(mon);
    const baseHP = calcMonHP(mon);
    const hpWeight = (mon.battle.hpPct ?? 100) / 100;
    enemyScore += baseHP * hpWeight;
  }

  // Lógica simple de amenaza actual
  let threatPenalty = 0;
  if (state.matrixMode === 'defensive') {
    // Si matrixMode no es accesible directo sin getRows, se podría calcular un aproximado
    for (const enemyMon of enemy) {
      if (!enemyMon) continue;
      for (const selfMon of self) {
        if (!selfMon) continue;
        const atk = bestAttack(enemyMon, selfMon);
        if (atk.mult >= 2 && (atk.maxPct || 0) >= 50) threatPenalty += 50;
      }
    }
  }

  // Bonus si TR activo y tienes abusers vivos
  let tempoBonus = 0;
  if (state.field && state.field.trickRoom) {
    const slowAbusers = self.filter((m) => m && calculateSpeed(m, side) < 0);
    tempoBonus += slowAbusers.length * 500;
  }

  return selfScore - enemyScore - threatPenalty + tempoBonus;
}

function suggestBestAction(state, side) {
  const actionsSelf = getCandidateActions(state, side);
  const actionsEnemy = getCandidateActions(state, side === 'self' ? 'enemy' : 'self');

  if (!actionsSelf.length) return [];

  const evaluatedActions = [];

  for (const aSelf of actionsSelf) {
    // Supón que el rival elige una de sus acciones; usa un criterio simple
    let worstOutcome = Infinity;

    for (const aEnemy of actionsEnemy.length ? actionsEnemy : [{ kind: 'none' }]) {
      const { nextState } = simulateTurn(state, [aSelf], aEnemy.kind === 'none' ? [] : [aEnemy]);
      const score = scoreBoard(nextState, side);
      // Queremos ser conservadores: peor caso
      if (score < worstOutcome) worstOutcome = score;
    }

    evaluatedActions.push({ action: aSelf, score: worstOutcome });
  }

  evaluatedActions.sort((a, b) => b.score - a.score);
  return evaluatedActions.slice(0, 3);
}

function renderLiveRecommendations() {
  if (state.uiMode !== 'live') return;

  const suggestion = suggestBestAction(state, 'self');
  const mount = document.getElementById('liveRecommendations');
  if (!mount) return;

  if (!suggestion || !suggestion.action) {
    mount.innerHTML = '<div class="muted-small">Sin recomendación clara.</div>';
    return;
  }

  const a = suggestion.action;
  const team = state.self;
  const mon = team[a.userIndex];
  
  if (!mon) return;

  let text = '';

  if (a.kind === 'move' && a.moveName === 'Protect') {
    // Busca partner con Trick Room
    const allyIdx = state.activeSelfSlots.find((i) => i !== a.userIndex);
    const ally = state.self[allyIdx];
    const hasTR = ally?.set?.moves?.includes('Trick Room');
    if (hasTR) {
      text = `Turno actual: proteger a ${mon.displayName} mientras ${ally.displayName} activa Trick Room. Al siguiente turno tendrás prioridad de velocidad con tus sweepers lentos.`;
    } else {
      text = `Proteger a ${mon.displayName} este turno reduce el riesgo de perderlo ante la presión rival.`;
    }
  } else if (a.kind === 'move') {
    text = `Recomendación: atacar con ${mon.displayName} usando ${a.moveName}.`;
  } else if (a.kind === 'switch') {
    const inMon = state.self[a.switchInIndex];
    text = `Recomendación: cambiar a ${mon.displayName} por ${inMon ? inMon.displayName : 'otro'} para mejorar el cruce defensivo.`;
  }

  mount.innerHTML = `<p>${text}</p>`;
}

function renderLiveStatePanel() {
  const panel = document.getElementById('liveStatePanel');
  const selfMount = document.getElementById('liveStateSelfSlots');
  const enemyMount = document.getElementById('liveStateEnemySlots');
  const fieldMount = document.getElementById('liveFieldControls');

  if (!panel || !selfMount || !enemyMount || !fieldMount) return;

  const isLive = state.uiMode === 'live';
  panel.style.display = isLive ? 'block' : 'none';
  if (!isLive) return;

  const renderMonControls = (mon, side, idx) => {
    if (!mon) {
      return `
        <div class="live-slot-card live-slot-card--empty">
          <div class="live-slot-title">Slot ${idx + 1}</div>
          <div class="muted-small">Vacío</div>
        </div>
      `;
    }

    ensureBattleState(mon);

    const b = mon.battle;
    const hp = b.hpPct ?? 100;
    const stages = b.stages || {};
    const status = b.status || '';

    const stageSelect = (statKey, label) => {
      const val = stages[statKey] ?? 0;
      const options = [];
      for (let s = -6; s <= 6; s++) {
        options.push(
          `<option value="${s}" ${s === val ? 'selected' : ''}>${s > 0 ? '+' + s : s}</option>`
        );
      }
      return `
        <label class="live-stat-stage">
          <span>${label}</span>
          <select
            data-live="stage"
            data-side="${side}"
            data-index="${idx}"
            data-stat="${statKey}"
          >
            ${options.join('')}
          </select>
        </label>
      `;
    };

    return `
      <div class="live-slot-card">
        <div class="live-slot-title">
          <img src="${mon.sprite}" alt="${mon.displayName}" class="sprite-micro" />
          <span>${mon.displayName}</span>
        </div>

        <label class="live-hp-control">
          <span>HP %</span>
          <input
            type="number"
            min="1"
            max="100"
            value="${hp}"
            data-live="hp"
            data-side="${side}"
            data-index="${idx}"
          />
        </label>

        <div class="live-stages-row">
          ${stageSelect('atk', 'Atk')}
          ${stageSelect('def', 'Def')}
          ${stageSelect('spa', 'SpA')}
          ${stageSelect('spd', 'SpD')}
          ${stageSelect('spe', 'Spe')}
        </div>

        <label class="live-status-control">
          <span>Estado</span>
          <select
            data-live="status"
            data-side="${side}"
            data-index="${idx}"
          >
            <option value="" ${status === '' ? 'selected' : ''}>Ninguno</option>
            <option value="brn" ${status === 'brn' ? 'selected' : ''}>Quemado</option>
            <option value="par" ${status === 'par' ? 'selected' : ''}>Parálisis</option>
            <option value="slp" ${status === 'slp' ? 'selected' : ''}>Sueño</option>
            <option value="psn" ${status === 'psn' ? 'selected' : ''}>Veneno</option>
            <option value="tox" ${status === 'tox' ? 'selected' : ''}>Tóxico</option>
            <option value="frz" ${status === 'frz' ? 'selected' : ''}>Congelado</option>
          </select>
        </label>
      </div>
    `;
  };

  selfMount.innerHTML = state.self
    .map((mon, idx) => renderMonControls(mon, 'self', idx))
    .join('');

  enemyMount.innerHTML = state.enemy
    .map((mon, idx) => renderMonControls(mon, 'enemy', idx))
    .join('');

  const f = state.field;

  fieldMount.innerHTML = `
    <div class="live-field-row">
      <label>
        <span>Clima</span>
        <select data-live="field-weather">
          <option value="" ${!f.weather ? 'selected' : ''}>Ninguno</option>
          <option value="sun" ${f.weather === 'sun' ? 'selected' : ''}>Sol</option>
          <option value="rain" ${f.weather === 'rain' ? 'selected' : ''}>Lluvia</option>
          <option value="sand" ${f.weather === 'sand' ? 'selected' : ''}>Arena</option>
          <option value="snow" ${f.weather === 'snow' ? 'selected' : ''}>Nieve</option>
        </select>
      </label>
      <label>
        <span>Turnos clima</span>
        <input type="number" min="0" max="8"
          value="${f.weatherTurns || 0}"
          data-live="field-weatherTurns"
        />
      </label>
    </div>

    <div class="live-field-row">
      <label>
        <span>Terreno</span>
        <select data-live="field-terrain">
          <option value="" ${!f.terrain ? 'selected' : ''}>Ninguno</option>
          <option value="electric" ${f.terrain === 'electric' ? 'selected' : ''}>Eléctrico</option>
          <option value="grassy" ${f.terrain === 'grassy' ? 'selected' : ''}>Hierba</option>
          <option value="psychic" ${f.terrain === 'psychic' ? 'selected' : ''}>Psíquico</option>
          <option value="misty" ${f.terrain === 'misty' ? 'selected' : ''}>Niebla</option>
        </select>
      </label>
      <label>
        <span>Turnos terreno</span>
        <input type="number" min="0" max="8"
          value="${f.terrainTurns || 0}"
          data-live="field-terrainTurns"
        />
      </label>
    </div>

    <div class="live-field-row">
      <label>
        <input type="checkbox" data-live="field-trickRoom" ${f.trickRoom ? 'checked' : ''} />
        Trick Room (${f.trickRoomTurns || 0} turnos)
      </label>
    </div>

    <div class="live-field-row">
      <label>
        <input type="checkbox" data-live="field-tailwindSelf" ${f.tailwindSelf ? 'checked' : ''} />
        Tailwind (self) (${f.tailwindSelfTurns || 0})
      </label>
      <label>
        <input type="checkbox" data-live="field-tailwindEnemy" ${f.tailwindEnemy ? 'checked' : ''} />
        Tailwind (enemy) (${f.tailwindEnemyTurns || 0})
      </label>
    </div>
  `;

  attachLiveStateListeners();
}

function attachLiveStateListeners() {
  const root = document.getElementById('liveStatePanel');
  if (!root) return;

  const updateLive = () => {
    window.currentDamageCache = {};
    if (typeof renderLiveStatePanel === 'function') renderLiveStatePanel();
    if (typeof renderLiveRecommendations === 'function') renderLiveRecommendations();
    const rows = getRows();
    renderMatrix(rows);
    renderLiveBattleToolbar();
    updateIcons();
  };

  root.querySelectorAll('[data-live]').forEach((el) => {
    const kind = el.getAttribute('data-live');

    if (kind === 'hp') {
      el.onchange = (e) => {
        const side = el.dataset.side;
        const idx = Number(el.dataset.index);
        const mon = state[side][idx];
        if (!mon) return;
        ensureBattleState(mon);
        const v = Math.max(1, Math.min(100, Number(e.target.value) || 1));
        mon.battle.hpPct = v;
        updateLive();
      };
    }

    if (kind === 'stage') {
      el.onchange = (e) => {
        const side = el.dataset.side;
        const idx = Number(el.dataset.index);
        const statKey = el.dataset.stat;
        const mon = state[side][idx];
        if (!mon) return;
        ensureBattleState(mon);
        const v = Math.max(-6, Math.min(6, Number(e.target.value) || 0));
        mon.battle.stages[statKey] = v;
        updateLive();
      };
    }

    if (kind === 'status') {
      el.onchange = (e) => {
        const side = el.dataset.side;
        const idx = Number(el.dataset.index);
        const mon = state[side][idx];
        if (!mon) return;
        ensureBattleState(mon);
        mon.battle.status = e.target.value || null;
        updateLive();
      };
    }

    if (kind.startsWith('field-')) {
      el.onchange = (e) => {
        const key = kind.replace('field-', '');
        const f = state.field;

        if (key === 'weather' || key === 'terrain') {
          f[key] = e.target.value || null;
        } else if (key === 'trickRoom') {
          f.trickRoom = e.target.checked;
          if (f.trickRoom && f.trickRoomTurns === 0) f.trickRoomTurns = 5;
          if (!f.trickRoom) f.trickRoomTurns = 0;
        } else if (key === 'tailwindSelf' || key === 'tailwindEnemy') {
          f[key] = e.target.checked;
          const turnsKey = key + 'Turns';
          if (f[key] && f[turnsKey] === 0) f[turnsKey] = 4;
          if (!f[key]) f[turnsKey] = 0;
        } else if (key === 'weatherTurns' || key === 'terrainTurns') {
          f[key] = Math.max(0, Math.min(8, Number(e.target.value) || 0));
        }

        updateLive();
      };
    }
  });
}
