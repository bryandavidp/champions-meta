const STORAGE_KEY = "offensive-matrix-saved-teams-v4";
const CACHE_KEY_PREFIX = "smogon-chaos-cache-2026-04-";
const MOVE_CACHE_KEY = "pokeapi-move-cache-v1";
const I18N_CACHE_KEY = "pokeapi-i18n-cache-es-v2";
const RATING_STORAGE_KEY = "smogon-champions-rating";
const SMOGON_MONTH = "2026-04";
const SMOGON_BASE = "./data/";
const SMOGON_FILES = {
  0: "gen9championsou-0.json",
  1500: "gen9championsou-1500.json",
  1630: "gen9championsou-1630.json",
  1760: "gen9championsou-1760.json",
};
const RATING_ORDER = ["1760", "1630", "1500", "0"];

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
  "incineroar",
  "garchomp",
  "kingambit",
  "sinistcha",
  "rotom-wash",
  "sneasler",
];
const DEMO_ENEMY = [
  "charizard-mega-y",
  "whimsicott",
  "farigiraf",
  "heatran",
  "landorus-therian",
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

const state = {
  self: Array(6).fill(null),
  enemy: Array(6).fill(null),
  modal: { side: "self", index: 0 },
  pokedex: [],
  cache: new Map(),
  loadingList: false,
  moveTypeCache: loadMoveCache(),
  smogonRaw: null,
  metaIndex: new Map(),
  metaRanked: [],
  rating: localStorage.getItem(RATING_STORAGE_KEY) || "1760",
  loadingMeta: false,
  field: {
    tailwindSelf: false,
    tailwindEnemy: false,
    trickRoom: false,
    weather: null,
    terrain: null,
  },
  matrixMode: "offensive",
  leads: { self: [], enemy: [] },
};

const selfSlots = document.getElementById("selfSlots");
const enemySlots = document.getElementById("enemySlots");
const matrixContainer = document.getElementById("matrixContainer");
const matrixPlaceholder = document.getElementById("matrixPlaceholder");
const matrixStatus = document.getElementById("matrixStatus");
const threatList = document.getElementById("threatList");
const opportunityList = document.getElementById("opportunityList");
const strategyList = document.getElementById("strategyList");
const savedTeamsList = document.getElementById("savedTeamsList");
const pickerModal = document.getElementById("pickerModal");
const searchInput = document.getElementById("searchInput");
const resultList = document.getElementById("resultList");
const searchHint = document.getElementById("searchHint");
const modalTitle = document.getElementById("modalTitle");
const ratingSelect = document.getElementById("ratingSelect");
const matrixSourceChip = document.getElementById("matrixSourceChip");
const metricMeta = document.getElementById("metricMeta");
const metaStatusText = document.getElementById("metaStatusText");

function loadMoveCache() {
  try {
    const raw = localStorage.getItem(MOVE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMoveCache() {
  try {
    localStorage.setItem(MOVE_CACHE_KEY, JSON.stringify(state.moveTypeCache));
  } catch {}
}

const i18nCache = loadI18nCache();

function loadI18nCache() {
  try {
    return JSON.parse(localStorage.getItem(I18N_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveI18nCache() {
  try {
    localStorage.setItem(I18N_CACHE_KEY, JSON.stringify(i18nCache));
  } catch {}
}

function t(englishName, category) {
  if (!englishName) return "";
  const clean = getPapiSlug(englishName, category);
  const cacheKey = `${category}:${clean}`;
  if (i18nCache[cacheKey]) return i18nCache[cacheKey];
  return englishName;
}

const PAPI_MAP = {
  dazzlinggleam: "dazzling-gleam",
  drainingkiss: "draining-kiss",
  psychicnoise: "psychic-noise",
  healingwish: "healing-wish",
  magicbounce: "magic-bounce",
  gigadrain: "giga-drain",
  uturn: "u-turn",
  voltswitch: "volt-switch",
  willowisp: "will-o-wisp",
  thunderwave: "thunder-wave",
  earthpower: "earth-power",
  stealthrock: "stealth-rock",
  toxicspikes: "toxic-spikes",
  stickyweb: "sticky-web",
  bravebird: "brave-bird",
  closecombat: "close-combat",
  flareblitz: "flare-blitz",
  leafblade: "leaf-blade",
  rockslide: "rock-slide",
  swordsdance: "swords-dance",
  nastyplot: "nasty-plot",
  dragondance: "dragon-dance",
  quiverdance: "quiver-dance",
  calmmind: "calm-mind",
  bulkup: "bulk-up",
  ironhead: "iron-head",
  playrough: "play-rough",
  icebeam: "ice-beam",
  hydropump: "hydro-pump",
  fireblast: "fire-blast",
  focusblast: "focus-blast",
  shadowball: "shadow-ball",
  energyball: "energy-ball",
  sludgebomb: "sludge-bomb",
  dracometeor: "draco-meteor",
  extremespeed: "extreme-speed",
  suckerpunch: "sucker-punch",
  aquajet: "aqua-jet",
  fakeout: "fake-out",
  helpinghand: "helping-hand",
  wideguard: "wide-guard",
  quickguard: "quick-guard",
  partingshot: "parting-shot",
  freezedry: "freeze-dry",
  knockoff: "knock-off",
  darkestlariat: "darkest-lariat",
  throatchop: "throat-chop",
  drainpunch: "drain-punch",
  bulletpunch: "bullet-punch",
  machpunch: "mach-punch",
  heatwave: "heat-wave",
  trickroom: "trick-room",
  auroraveil: "aurora-veil",
  shadowsneak: "shadow-sneak",
  darkpulse: "dark-pulse",
  flashcannon: "flash-cannon",
  dragonpulse: "dragon-pulse",
  heavyslam: "heavy-slam",
  bodypress: "body-press",
  terablast: "tera-blast",
  surgingstrikes: "surging-strikes",
  ivycudgel: "ivy-cudgel",
  wickedblow: "wicked-blow",
};

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

function getPapiSlug(name, category = "move") {
  let n = normalizeText(name);
  if (PAPI_MAP[n]) return PAPI_MAP[n];
  if (category === "item") {
    if (n === "choicescarf") return "choice-scarf";
    if (n === "choicespecs") return "choice-specs";
    if (n === "choiceband") return "choice-band";
    if (n === "heavydutyboots") return "heavy-duty-boots";
    if (n === "focussash") return "focus-sash";
    if (n === "lifeorb") return "life-orb";
    if (n === "assaultvest") return "assault-vest";
    if (n === "rockyhelmet") return "rocky-helmet";
    if (n === "clearamulet") return "clear-amulet";
    if (n === "covertcloak") return "covert-cloak";
    if (n === "sitrusberry") return "sitrus-berry";
    if (n === "boosterenergy") return "booster-energy";
    if (n === "safetygoggles") return "safety-goggles";
    if (n === "dragonfang") return "dragon-fang";
    if (n === "expertbelt") return "expert-belt";
    if (n === "blackglasses") return "black-glasses";
    if (n === "loadeddice") return "loaded-dice";
  }
  if (category === "ability") {
    if (n === "speedboost") return "speed-boost";
    if (n === "waterabsorb") return "water-absorb";
    if (n === "voltabsorb") return "volt-absorb";
    if (n === "flashfire") return "flash-fire";
    if (n === "sandstream") return "sand-stream";
    if (n === "snowwarning") return "snow-warning";
    if (n === "quarkdrive") return "quark-drive";
    if (n === "hadronengine") return "hadron-engine";
    if (n === "orichalcumpulse") return "orichalcum-pulse";
    if (n === "swordofruin") return "sword-of-ruin";
    if (n === "beadsofruin") return "beads-of-ruin";
    if (n === "vesselofruin") return "vessel-of-ruin";
    if (n === "tabletsofruin") return "tablets-of-ruin";
    if (n === "wellbakedbody") return "well-baked-body";
    if (n === "purifyingsalt") return "purifying-salt";
    if (n === "goodasgold") return "good-as-gold";
    if (n === "stancechange") return "stance-change";
    if (n === "hugepower") return "huge-power";
    if (n === "purepower") return "pure-power";
    if (n === "magicguard") return "magic-guard";
    if (n === "swiftswim") return "swift-swim";
    if (n === "sandrush") return "sand-rush";
    if (n === "slushrush") return "slush-rush";
    if (n === "innerfocus") return "inner-focus";
    if (n === "clearbody") return "clear-body";
  }
  return n;
}

async function fetchTranslation(englishName, category) {
  if (!englishName) return;
  const clean = getPapiSlug(englishName, category);
  if (CUSTOM_TERMS.has(clean)) return;
  const cacheKey = `${category}:${clean}`;
  if (i18nCache[cacheKey] || i18nCache[cacheKey] === null) return;

  try {
    let url = "";
    if (category === "move") url = `https://pokeapi.co/api/v2/move/${clean}`;
    else if (category === "ability")
      url = `https://pokeapi.co/api/v2/ability/${clean}`;
    else if (category === "item")
      url = `https://pokeapi.co/api/v2/item/${clean}`;
    else return;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Not found");
    const data = await res.json();
    const esName = data.names?.find((n) => n.language.name === "es")?.name;
    if (esName) {
      i18nCache[cacheKey] = esName;
      saveI18nCache();
    } else {
      i18nCache[cacheKey] = null;
    }
  } catch {
    i18nCache[cacheKey] = null;
  }
}

function normalizeText(str = "") {
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'".:,%]/g, "")
    .replace(/♀/g, " female ")
    .replace(/♂/g, " male ")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function formatName(name = "") {
  return String(name)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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

function calculateSpeed(mon, side) {
  if (!mon) return 0;
  const baseSpe =
    mon.raw?.stats?.find((s) => s.stat.name === "speed")?.base_stat || 100;
  const evsSpe = mon.set?.evs?.spe || 0;
  const nature = mon.set?.nature || "";

  // Level 50 stat calculation
  let spe =
    Math.floor(((2 * baseSpe + 31 + Math.floor(evsSpe / 4)) * 50) / 100) + 5;

  if (["Timid", "Hasty", "Jolly", "Naive"].includes(nature)) {
    spe = Math.floor(spe * 1.1);
  } else if (["Brave", "Relaxed", "Quiet", "Sassy"].includes(nature)) {
    spe = Math.floor(spe * 0.9);
  }

  // Modifier logic
  let modifier = 1;
  const field = state.field;
  if (side === "self" && field.tailwindSelf) modifier *= 2;
  if (side === "enemy" && field.tailwindEnemy) modifier *= 2;
  // Other modifiers like Choice Scarf can go here

  const ab = mon.set?.ability || "";
  if (field.weather === "rain" && ab === "Swift Swim") modifier *= 2;
  if (field.weather === "sun" && ab === "Chlorophyll") modifier *= 2;
  if (field.weather === "sand" && ab === "Sand Rush") modifier *= 2;

  let finalSpe = Math.floor(spe * modifier);
  return field.trickRoom ? -finalSpe : finalSpe;
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
  return mon?.raw?.stats?.find((s) => s.stat.name === apiName)?.base_stat || 0;
}

function calcMonHP(mon) {
  const b = getBaseStatRaw(mon, "hp");
  const ev = mon.set?.evs?.hp || 0;
  return Math.floor(((2 * b + 31 + Math.floor(ev / 4)) * 50) / 100) + 60;
}

function calcOtherStatLv50(base, ev, natureMultiplier) {
  const inner =
    Math.floor(((2 * base + 31 + Math.floor((ev || 0) / 4)) * 50) / 100) + 5;
  return Math.floor(inner * natureMultiplier);
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

function estimateMoveDamage(attacker, defender, cand, field) {
  const power = cand.power || 0;
  const info = state.moveTypeCache[cand.move];
  const dmgClass = cand.damageClass || info?.damageClass || "physical";
  if (power <= 0 || dmgClass === "status") return { damage: 0, blocked: false };

  if (field.terrain === "psychic" && PRIORITY_MOVES.has(cand.move)) {
    return { damage: 0, blocked: true, wMul: 1, terrMul: 1 }; // FIX: Retornar modificadores
  }

  const natA = attacker.set?.nature || "";
  const natD = defender.set?.nature || "";
  const evA = attacker.set?.evs || {};
  const evD = defender.set?.evs || {};

  let atkS;
  let defS;
  if (dmgClass === "physical") {
    atkS = calcOtherStatLv50(
      getBaseStatRaw(attacker, "attack"),
      evA.atk,
      natureMod(natA, "atk"),
    );
    defS = calcOtherStatLv50(
      getBaseStatRaw(defender, "defense"),
      evD.def,
      natureMod(natD, "def"),
    );
  } else {
    atkS = calcOtherStatLv50(
      getBaseStatRaw(attacker, "special-attack"),
      evA.spa,
      natureMod(natA, "spa"),
    );
    defS = calcOtherStatLv50(
      getBaseStatRaw(defender, "special-defense"),
      evD.spd,
      natureMod(natD, "spd"),
    );
  }

  const eff = effectiveness(cand.type, defender.types || []);
  let wMul = 1;
  const w = field.weather;
  if (w === "sun") {
    if (cand.type === "fire") wMul *= 1.5;
    if (cand.type === "water") wMul *= 0.5;
  } else if (w === "rain") {
    if (cand.type === "water") wMul *= 1.5;
    if (cand.type === "fire") wMul *= 0.5;
  }

  let terrMul = 1;
  if (field.terrain === "electric" && cand.type === "electric") terrMul *= 1.3;
  if (field.terrain === "grassy" && cand.move === "Earthquake") terrMul *= 0.5;

  const stab = (attacker.types || []).includes(cand.type) ? 1.5 : 1;
  const defSafe = Math.max(1, defS);
  const raw =
    ((22 * power * atkS) / defSafe / 50 + 2) * stab * eff * wMul * terrMul;
  return { damage: Math.floor(raw), blocked: false, wMul, terrMul }; // FIX: Retornar wMul y terrMul
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

async function loadSmogonMeta(rating = state.rating) {
  state.loadingMeta = true;
  metricMeta.textContent = "Cargando";
  metaStatusText.textContent = `Champions OU ${SMOGON_MONTH}`;
  if (matrixSourceChip) matrixSourceChip.textContent = `Local ${SMOGON_MONTH} · corte ${rating}`;

  const file = SMOGON_FILES[rating] || SMOGON_FILES["1760"];
  const url = `${SMOGON_BASE}${file}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`No se pudo cargar ${file}`);

    const json = await res.json();

    state.smogonRaw = json;
    buildMetaIndex(json);
    state.rating = rating;
    localStorage.setItem(RATING_STORAGE_KEY, rating);

    metricMeta.textContent = `${state.metaRanked.length}`;
    metaStatusText.textContent = `Champions OU ${SMOGON_MONTH} · ${file}`;
    if (matrixSourceChip) matrixSourceChip.textContent = `Local ${SMOGON_MONTH} · corte ${rating}`;
    searchHint.textContent = `${state.metaRanked.length} Pokémon meta disponibles`;

    await rehydrateCurrentTeamsSets();
    ensurePokedex();
    renderAll();
    preloadTopMeta(); // Lanza precarga en segundo plano
  } catch (err) {
    console.error(err);
    metricMeta.textContent = "Error";
    metaStatusText.textContent = `Falta ${file}`;
    searchHint.textContent = `No se pudo cargar ${file}. Revisa que exista en ./data/`;
    renderAll();
  } finally {
    state.loadingMeta = false;
  }
}

async function preloadTopMeta() {
  // Evita colapsar la conexión, carga solo los top 50
  const topMons = state.metaRanked.slice(0, 50);
  for (const record of topMons) {
    const key = normalizeText(record.slug);
    const inIDB = await getFromIDB(key);
    if (!inIDB && !state.cache.has(key)) {
      // fetch silencioso sin await para no bloquear
      fetchPokemon(key).catch(() => {});
      await new Promise((r) => setTimeout(r, 100)); // throttle entre requests
    }
  }
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

function getMetaRecord(speciesId) {
  return state.metaIndex.get(normalizeText(speciesId)) || null;
}

function chooseBestItem(itemEntries, side, ignoreIndex = -1, speciesId = "") {
  // Force mega stone if species is a mega
  const entryPair = Object.entries(MEGA_STONES).find(
    ([, megaId]) => megaId === speciesId,
  );
  if (entryPair) {
    return entryPair[0]
      .replace("-", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()); // Format the mega stone name
  }

  const usedItems = new Set(
    state[side]
      .map((mon, idx) => (idx === ignoreIndex ? null : mon?.set?.item))
      .filter(Boolean),
  );
  const sorted = topEntries(itemEntries, 8).map((x) => x.key);
  const free = sorted.find((item) => !usedItems.has(item));
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

  const abilities = topEntries(entry.Abilities || {}, 3);
  const items = topEntries(entry.Items || {}, 6);
  const moves = topEntries(entry.Moves || {}, 8)
    .map((x) => x.key)
    .filter(Boolean)
    .filter((move) => !String(move).toLowerCase().includes("nothing"))
    .slice(0, 4);

  const spreads = topEntries(entry.Spreads || entry["Spreads"] || {}, 3);
  const spread = parseSpread(spreads[0]?.key || "");
  const teammates = topEntries(entry.Teammates || {}, 6).map((x) =>
    slugFromSmogonName(x.key),
  );

  return {
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
      moves: topEntries(entry.Moves || {}, 8),
      teammates: topEntries(entry.Teammates || {}, 6),
    },
  };
}

const IDB_STORE_NAME = "pokemon-cache";
const idbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open("smogon-champions-db", 1);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
      db.createObjectStore(IDB_STORE_NAME, { keyPath: "name" });
    }
  };
});

async function getFromIDB(key) {
  try {
    const db = await idbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const store = tx.objectStore(IDB_STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function saveToIDB(data) {
  try {
    const db = await idbPromise;
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    const store = tx.objectStore(IDB_STORE_NAME);
    store.put(data);
  } catch {}
}

async function fetchPokemon(name) {
  const key = normalizeText(name);
  if (CUSTOM_TERMS.has(key)) {
    // Fallback para Pokémon custom del formato sin API
    return {
      name: key,
      displayName: formatName(name),
      sprite:
        "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png",
      types: ["normal"],
      set: buildDefaultSetForSpecies(key),
    };
  }
  if (state.cache.has(key)) {
    const cloned = structuredClone(state.cache.get(key));
    cloned.set = buildDefaultSetForSpecies(key);
    return cloned;
  }

  let mon = await getFromIDB(key);

  if (!mon) {
    const apiSlug = pokeapiPokemonSlug(key);
    const url = `https://pokeapi.co/api/v2/pokemon/${apiSlug}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No encontrado: ${name}`);
    const data = await res.json();

    const record = getMetaRecord(key);

    let spriteUrl = homeSpriteFromPokemon(data);
    if (record && record.rank <= 20) {
      try {
        const bRes = await fetch(spriteUrl);
        const blob = await bRes.blob();
        spriteUrl = await new Promise((r) => {
          const reader = new FileReader();
          reader.onloadend = () => r(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch {}
    }

    mon = {
      id: data.id,
      name: key,
      displayName: record?.displayName || formatName(data.name),
      sprite: spriteUrl,
      types: data.types
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((x) => x.type.name),
      metaRank: record?.rank || null,
      usage: record?.usage || 0,
      raw: data,
    };
    await saveToIDB(mon);
  }

  state.cache.set(key, structuredClone(mon));

  mon.set = buildDefaultSetForSpecies(key);
  scheduleMoveWarmup();
  return structuredClone(mon);
}

async function fetchMoveInfo(moveName) {
  if (!moveName) return null;
  const cached = state.moveTypeCache[moveName];
  if (cached) return cached;

  const slug = getPapiSlug(moveName, "move");
  if (CUSTOM_TERMS.has(slug)) {
    const info = { type: "normal", damageClass: "status", power: 0 };
    state.moveTypeCache[moveName] = info;
    return info;
  }
  const fallbackType = MOVE_TYPE_FALLBACK[moveName];
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/move/${slug}`);
    if (!res.ok) throw new Error("Move not found");
    const data = await res.json();
    const info = {
      type: data?.type?.name || fallbackType || null,
      damageClass: data?.damage_class?.name || "status",
      power: data?.power || 0,
    };
    state.moveTypeCache[moveName] = info;
    saveMoveCache();
    return info;
  } catch {
    const info = {
      type: fallbackType || null,
      damageClass: SUPPORT_MOVES.has(moveName) ? "status" : "physical",
      power: 0,
    };
    state.moveTypeCache[moveName] = info;
    saveMoveCache();
    return info;
  }
}

let moveWarmupToken = 0;
function scheduleMoveWarmup() {
  const token = ++moveWarmupToken;
  setTimeout(async () => {
    if (token !== moveWarmupToken) return;
    const mons = [...state.self, ...state.enemy].filter(Boolean);
    const moveNames = [
      ...new Set(mons.flatMap((mon) => mon?.set?.moves || []).filter(Boolean)),
    ];
    const abilityNames = [
      ...new Set(mons.map((mon) => mon?.set?.ability).filter(Boolean)),
    ];
    const itemNames = [
      ...new Set(mons.map((mon) => mon?.set?.item).filter(Boolean)),
    ];

    // Process Move Types first (important for Matrix)
    await Promise.all(moveNames.map((m) => fetchMoveInfo(m)));
    if (token !== moveWarmupToken) return;
    renderAll();

    // Process translations in batches of 5 to avoid 429 Rate Limit
    const translationTasks = [];
    moveNames.forEach((m) =>
      translationTasks.push(() => fetchTranslation(m, "move")),
    );
    abilityNames.forEach((a) =>
      translationTasks.push(() => fetchTranslation(a, "ability")),
    );
    itemNames.forEach((i) =>
      translationTasks.push(() => fetchTranslation(i, "item")),
    );

    for (let i = 0; i < translationTasks.length; i += 5) {
      if (token !== moveWarmupToken) return;
      await Promise.all(translationTasks.slice(i, i + 5).map((fn) => fn()));

      if (token !== moveWarmupToken) return;
      renderAll();

      if (state.setEditor.index !== null) {
        renderSetEditor();
        if (state.setChoice.kind) renderSetChoiceList();
      }
      await new Promise((r) => setTimeout(r, 100)); // delay between batches
    }
  }, 50);
}

async function rehydrateCurrentTeamsSets() {
  for (const side of ["self", "enemy"]) {
    for (let i = 0; i < state[side].length; i++) {
      const mon = state[side][i];
      if (!mon) continue;
      mon.set = buildDefaultSetForSpecies(mon.name, side, i);
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
      };
    })
    .filter(Boolean);

  if (resolved.length) return resolved;

  const fallbackMoves = moves
    .map((move) => {
      const type = MOVE_TYPE_FALLBACK[move];
      if (!type || SUPPORT_MOVES.has(move)) return null;
      return { move, type, power: 0, damageClass: "physical" };
    })
    .filter(Boolean);

  if (fallbackMoves.length) return fallbackMoves;

  return (mon?.types || []).map((type) => ({
    move: TYPE_META[type]?.name || type,
    type,
    power: 0,
    damageClass: "special",
  }));
}

function bestAttack(attacker, defender) {
  const field = state.field;
  const candidates = getMoveCandidates(attacker);
  if (!candidates.length) {
    return {
      type: "normal",
      mult: 1,
      move: "",
      power: 0,
      damage: 0,
      ohko: false,
    };
  }

  const defHP = calcMonHP(defender);
  const scored = candidates.map((c) => {
    // FIX: Extraer modificadores de clima/terreno para ajustar el multiplicador visual
    const {
      damage,
      blocked,
      wMul = 1,
      terrMul = 1,
    } = estimateMoveDamage(attacker, defender, c, field);
    let mult = effectiveness(c.type, defender?.types || []);
    if (blocked) {
      mult = 0;
    } else {
      mult = mult * wMul * terrMul;
    }
    
    const maxDamage = damage;
    const minDamage = Math.floor(damage * 0.85);
    const maxPct = Math.min(100, Math.floor((maxDamage / defHP) * 100));
    const minPct = Math.min(100, Math.floor((minDamage / defHP) * 100));
    
    let ohkoProb = 0;
    if (maxDamage >= defHP) {
        if (minDamage >= defHP) ohkoProb = 100;
        else ohkoProb = Math.floor(((maxDamage - defHP) / (maxDamage - minDamage)) * 100);
    }
    const ohko = ohkoProb > 0;

    return {
      type: c.type,
      mult,
      move: c.move || TYPE_META[c.type]?.name || c.type,
      power: c.power || 0,
      damage: maxDamage,
      minPct, maxPct, ohkoProb,
      ohko,
    };
  });

  scored.sort((a, b) => {
    if (b.damage !== a.damage) return b.damage - a.damage;
    if (b.mult !== a.mult) return b.mult - a.mult;
    return (b.power || 0) - (a.power || 0);
  });

  return scored[0];
}

function getRows() {
  const self = state.self.filter(Boolean);
  const enemy = state.enemy.filter(Boolean);
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

      return `
          <button class="mini-slot" data-action="pick" data-side="${side}" data-index="${idx}" aria-label="${mon.displayName}">
            ${mon.name.includes("-mega") ? '<div class="mega-icon"></div>' : ""}
            <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
            ${side === "self" ? `<span class="slot-edit-badge">SET</span>` : ""}
            <span class="slot-remove" data-action="remove" data-side="${side}" data-index="${idx}"><i data-lucide="x" style="width:12px;height:12px;"></i></span>
          </button>
        `;
    })
    .join("");
}

function updateMatrixFieldUI() {
  const modeBtns = document.querySelectorAll("#matrixModeToggleGroup .segmented-btn");
  modeBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === state.matrixMode);
  });

  const title = document.getElementById("matrixSectionTitle");
  const sub = document.getElementById("matrixSectionSub");
  const legend = document.getElementById("matrixLegendChip");
  if (title)
    title.textContent =
      state.matrixMode === "defensive" ? "Matriz defensiva" : "Matriz ofensiva";
  if (sub) {
    sub.textContent =
      state.matrixMode === "defensive"
        ? "Daño entrante a tu equipo por rival. Verde = resistido (≤×0.5), rojo = muy eficaz (≥×2)."
        : "Daño aprox. a Lv.50 con EVs/naturaleza, clima y terreno. 💀 = OHKO estimado.";
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

  if (!rows.length) {
    matrixPlaceholder.classList.remove("hidden");
    matrixContainer.classList.add("hidden");
    matrixStatus.textContent = "0 cruces";
    const mc = document.getElementById("metricCross");
    if (mc) mc.textContent = "0";
    const ms = document.getElementById("metricStrong");
    if (ms) ms.textContent = "0";
    const mp = document.getElementById("metricPeak");
    if (mp) mp.textContent = "×0";
    const ma = document.getElementById("metricAvg");
    if (ma) ma.textContent = "0.00";
    return;
  }

  const self = state.self.filter(Boolean);
  const enemy = state.enemy.filter(Boolean);
  const offensive = state.matrixMode !== "defensive";
  const colMons = offensive ? enemy : self;
  const cornerIcon = offensive ? "swords" : "shield";

  const flat = rows.flatMap((r) => r.cells);
  const cross = flat.length;
  const strong = flat.filter((x) => x.mult >= 2).length;
  const peak = Math.max(...flat.map((x) => x.mult));
  const avg = flat.reduce((acc, x) => acc + x.mult, 0) / flat.length;

  document.getElementById("metricCross").textContent = cross;
  document.getElementById("metricStrong").textContent = strong;
  document.getElementById("metricPeak").textContent = fmtMult(peak);
  document.getElementById("metricAvg").textContent = avg.toFixed(2);
  matrixStatus.textContent = `${cross} cruces · ${strong} fuertes`;

  const colTag = offensive ? "RIVAL" : "TÚ";
  const colColor = offensive ? "var(--red)" : "var(--blue)";
  const rowTag = offensive ? "TÚ" : "RIVAL";
  const rowColor = offensive ? "var(--blue)" : "var(--red)";

  const theadBorder = offensive ? "rgba(255, 59, 48, 0.4)" : "rgba(50, 173, 230, 0.4)";
  const tbodyBorder = offensive ? "rgba(50, 173, 230, 0.4)" : "rgba(255, 59, 48, 0.4)";

  const thead = `
        <thead>
          <tr>
            <th class="corner" style="background: linear-gradient(to bottom right, transparent 49%, var(--line) 50%, transparent 51%); position: sticky; top: 0; left: 0; z-index: 3;">
              <span style="position: absolute; top: 4px; right: 4px; font-size: 0.55rem; font-weight: 900; color: ${colColor};">${colTag}</span>
              <span style="position: absolute; bottom: 4px; left: 4px; font-size: 0.55rem; font-weight: 900; color: ${rowColor};">${rowTag}</span>
            </th>
            ${colMons
              .map(
                (mon) => `
              <th style="border-bottom: 2px solid ${theadBorder};">
                <div class="head-mon" title="${mon.displayName}">
                  <div class="sprite">
                    <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
                  </div>
                </div>
              </th>
            `,
              )
              .join("")}
          </tr>
        </thead>
      `;

  const tbody = `
        <tbody>
          ${rows
            .map(
              (row) => `
            <tr>
              <th style="border-right: 2px solid ${tbodyBorder};">
                <div class="row-mon" title="${row.attacker.displayName}">
                  <div class="sprite">
                    <img src="${row.attacker.sprite}" alt="${row.attacker.displayName}" loading="lazy">
                  </div>
                </div>
              </th>

              ${row.cells
                .map((cell) => {
                  const dmgHint =
                    typeof cell.damage === "number" ? ` · ~${cell.damage}` : "";
                  const title = `${row.attacker.displayName} → ${cell.defender.displayName} · ${t(cell.move, "move")} · ${fmtMult(cell.mult)}${dmgHint}`;

                  if (offensive) {
                    let content = "";
                    let cellClasses = ["cell"];

                    if (cell.ohko || cell.ohkoProb >= 100) {
                      cellClasses.push("cell--ohko", "clickable-cell");
                      content = `
                        <i data-lucide="crosshair" class="lethality-icon"></i>
                        ${typeDot(cell.type)}
                      `;
                    } else if (cell.mult === 0) {
                      cellClasses.push("cell--immune");
                      content = `<i data-lucide="shield-off" style="width:20px;height:20px;color:#4a4a4a;"></i>`;
                    } else if (cell.mult < 1) {
                      cellClasses.push("cell--resist");
                      content = `<i data-lucide="chevrons-down" style="width:20px;height:20px;color:#a0c4ff;"></i>`;
                    } else if (cell.mult >= 2) {
                      cellClasses.push("cell--se-no-ohko", effClass(cell.mult), "clickable-cell");
                      content = `
                        <div class="mult">${fmtMult(cell.mult)}</div>
                        ${typeDot(cell.type)}
                      `;
                    } else {
                      cellClasses.push(effClass(cell.mult));
                      content = '';
                    }

                    const tooltipAttr = (cell.mult >= 2 || cell.ohko) ? `data-tooltip="${encodeURIComponent(JSON.stringify({
                        attacker: row.attacker.displayName, defender: cell.defender.displayName, 
                        move: t(cell.move, "move"), type: cell.type, 
                        minPct: cell.minPct, maxPct: cell.maxPct, ohkoProb: cell.ohkoProb
                    }))}"` : "";

                    return `<td><div class="${cellClasses.join(" ")}" title="${title}" ${tooltipAttr}>${content}</div></td>`;
                  }

                  // Defensive mode
                  const vClass = matrixCellClass(cell);
                  const isDanger = cell.mult >= 2 || cell.ohko;
                  const cClasses = ["cell", vClass];
                  if (isDanger) cClasses.push("clickable-cell");
                  
                  const tooltipAttrDef = isDanger ? `data-tooltip="${encodeURIComponent(JSON.stringify({
                        attacker: row.attacker.displayName, defender: cell.defender.displayName, 
                        move: t(cell.move, "move"), type: cell.type, 
                        minPct: cell.minPct, maxPct: cell.maxPct, ohkoProb: cell.ohkoProb
                    }))}"` : "";
                  
                  let defContent = "";
                  if (cell.mult === 0) defContent = `<i data-lucide="shield-off" style="width:20px;height:20px;color:#4a4a4a;"></i>`;
                  else if (cell.mult < 1) defContent = `<i data-lucide="chevrons-down" style="width:20px;height:20px;color:#a0c4ff;"></i>`;
                  else if (cell.mult !== 1) defContent = `<div class="mult">${fmtMult(cell.mult)}</div>${typeDot(cell.type)}`;

                  return `
                    <td>
                      <div class="${cClasses.join(" ")}" title="${title}" ${tooltipAttrDef}>
                        ${defContent}
                      </div>
                    </td>`;
                })
                .join("")}
            </tr>
          `,
            )
            .join("")}
        </tbody>
      `;

  matrixContainer.innerHTML = `<table>${thead}${tbody}</table>`;
  matrixPlaceholder.classList.add("hidden");
  matrixContainer.classList.remove("hidden");
  updateIcons();
}

function scoreThreat(enemyMon) {
  const selfTeam = state.self.filter(Boolean);
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

  return { score, level, reasons: reasons.slice(0, 3), bestAnswers, maxEnemyPressure };
}

function renderThreats() {
  const enemy = state.enemy.filter(Boolean);

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

  threatList.innerHTML = items
    .map(({ mon, threat }) => {
      const ptype = mon.types[0] || "normal";
      const tcol = TYPE_META[ptype]?.color || "#8aa2c6";
      const bgLayers = `linear-gradient(135deg, ${hexToRgba(tcol, 0.1)} 0%, transparent 55%), linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.04))`;
      const spreadLines = serializeSetSummary(mon.set || {}).filter(
        (line) => line.startsWith("Nat:") || /^\d/.test(String(line).trim()),
      );

      const cleanSpreads = spreadLines.join(" · ").replace(/Nat:\s*/g, "");
      let pressurePill = "";
      if (threat.maxEnemyPressure >= 4) {
        pressurePill = `<span class="tag-pill tag-pill--danger"><i data-lucide="zap"></i> Presión ${fmtMult(threat.maxEnemyPressure)}</span>`;
      } else if (threat.maxEnemyPressure >= 2) {
        pressurePill = `<span class="tag-pill tag-pill--warning"><i data-lucide="zap"></i> Presión ${fmtMult(threat.maxEnemyPressure)}</span>`;
      } else {
        pressurePill = `<span class="tag-pill tag-pill--info"><i data-lucide="zap"></i> Presión ${fmtMult(threat.maxEnemyPressure)}</span>`;
      }

      return `
        <div class="enemy-row threat-card" style="background:${bgLayers}; border-color:${hexToRgba(tcol, 0.2)};">
          <div class="threat-portrait">
            <img src="${mon.sprite}" alt="" loading="lazy">
          </div>

          <div class="threat-body">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 8px; flex-wrap: wrap;">
              <div class="row-title">${mon.displayName}</div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${pressurePill}
                ${cleanSpreads ? `<span style="color:var(--muted); font-size:0.6rem; display:inline-flex; align-items:center; gap:4px;"><i data-lucide="activity" style="width:12px;height:12px;"></i> ${cleanSpreads}</span>` : ""}
              </div>
            </div>
            ${threat.reasons.length ? `<div class="row-sub threat-reasons" style="margin-top: 4px;">${threat.reasons.join(" · ")}</div>` : ""}
            <div class="set-stack threat-set-stack" style="gap: 4px;">
              ${mon.set?.ability ? `<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.65rem; color:var(--muted); background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;"><i data-lucide="dna" style="width:12px;height:12px;"></i> ${t(mon.set.ability, "ability")}</span>` : ""}
              ${mon.set?.item ? `<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.65rem; color:var(--muted); background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;"><i data-lucide="package" style="width:12px;height:12px;"></i> ${t(mon.set.item, "item")}</span>` : ""}
              ${(mon.set?.moves || []).slice(0, 2).map((move) => `<span style="display:inline-flex; align-items:center; gap:4px; font-size:0.65rem; color:var(--muted); background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;"><i data-lucide="swords" style="width:12px;height:12px;"></i> ${t(move, "move")}</span>`).join("")}
            </div>
            ${threat.bestAnswers.length ? `<div class="formula-row" style="margin-top: 6px;"><span style="color: var(--muted);"><i data-lucide="shield-check" style="width:14px;height:14px;vertical-align:middle;"></i> Respuestas:</span> ${threat.bestAnswers.map(ans => `<img src="${ans.sprite}" class="sprite-micro" title="${ans.displayName}" alt="${ans.displayName}">`).join("")}</div>` : ""}
          </div>

          <span class="status-chip status-${threat.level}">
            ${threat.level === "red" ? "Alto" : threat.level === "amber" ? "Medio" : "Bajo"}
          </span>
        </div>`;
    })
    .join("");

  updateIcons();
}

function renderOpportunities(rows) {
  if (state.matrixMode === "defensive") {
    opportunityList.innerHTML = `<div class="muted-small">Las oportunidades ofensivas solo aplican en vista ofensiva.</div>`;
    return;
  }

  const top = rows
    .flatMap((r) => r.cells)
    .filter((x) => x.mult >= 2)
    .sort((a, b) => b.mult - a.mult)
    .slice(0, 6);

  if (!top.length) {
    opportunityList.innerHTML = `<div class="empty">No hay ventanas de presión clara todavía.</div>`;
    return;
  }

  opportunityList.innerHTML = top
    .map((item) => {
      const hot = item.mult >= 4;
      const typeMeta = TYPE_META[item.type] || { color: '#8aa2c6', icon: '•' };
      const typePill = `<span style="background:${hexToRgba(typeMeta.color, 0.18)}; border:1px solid ${hexToRgba(typeMeta.color, 0.36)}; color:#fff; font-size:0.65rem; padding:2px 6px; border-radius:6px; display:inline-flex; align-items:center; gap:4px; font-weight: 700;">${typeMeta.icon} ${t(item.move, "move") || "—"}</span>`;
      return `
        <div class="chance-row chance-row--compact" style="justify-content: space-between; padding: 6px 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="sprite-sm"><img src="${item.attacker.sprite}" alt="" loading="lazy"></div>
            ${typePill}
            <i data-lucide="arrow-right" class="formula-arrow" style="width: 14px; height: 14px; margin: 0 4px;"></i>
            <div class="sprite-sm"><img src="${item.defender.sprite}" alt="" loading="lazy"></div>
          </div>
          <span class="mult-chip ${hot ? "mult-chip--hot" : ""}" style="font-size: 0.75rem;">${fmtMult(item.mult)}</span>
        </div>`;
    })
    .join("");

  updateIcons();
}

function inferStrategies(team) {
  const mons = team.filter(Boolean);
  if (!mons.length) return [];

  const names = new Set(mons.map((m) => m.name));
  const abilities = new Set(mons.map((m) => m?.set?.ability).filter(Boolean));
  const items = new Set(mons.map((m) => m?.set?.item).filter(Boolean));
  const moves = new Set(mons.flatMap((m) => m?.set?.moves || []));
  const strategies = [];

  const hasAnyName = (arr) => arr.some((x) => names.has(x));
  const hasAnyMove = (arr) => arr.some((x) => moves.has(x));
  const hasAnyAbility = (arr) => arr.some((x) => abilities.has(x));

  const getTriggers = (moveList, nameList, abilityList) => {
    return mons.filter(m => {
      const mvs = m?.set?.moves || [];
      const ab = m?.set?.ability;
      if (moveList && mvs.some(x => moveList.includes(x))) return true;
      if (nameList && nameList.includes(m.name)) return true;
      if (abilityList && abilityList.includes(ab)) return true;
      return false;
    });
  };

  if (
    hasAnyMove(["Trick Room"]) ||
    (hasAnyName([
      "farigiraf",
      "indeedee-female",
      "indeedee-male",
      "bronzong",
    ]) &&
      hasAnyName(["heatran", "kingambit", "iron-hands", "azumarill"]))
  ) {
    strategies.push({
      icon: '<i data-lucide="orbit"></i>',
      title: "Trick Room",
      triggers: getTriggers(["Trick Room"], ["farigiraf", "indeedee-female", "indeedee-male", "bronzong", "heatran", "kingambit", "iron-hands", "azumarill"])
    });
  }

  if (
    hasAnyMove(["Tailwind", "Icy Wind"]) ||
    hasAnyName([
      "whimsicott",
      "tornadus-incarnate",
      "tornadus-therian",
      "pelipper",
      "talonflame",
    ])
  ) {
    strategies.push({
      icon: '<i data-lucide="wind"></i>',
      title: "Viento Afín",
      triggers: getTriggers(["Tailwind", "Icy Wind"], ["whimsicott", "tornadus-incarnate", "tornadus-therian", "pelipper", "talonflame"])
    });
  }

  if (
    hasAnyAbility(["Drizzle"]) ||
    hasAnyName(["pelipper", "politoed"]) ||
    (hasAnyName(["basculegion", "archaludon"]) &&
      hasAnyName(["pelipper", "politoed"]))
  ) {
    strategies.push({
      icon: '<i data-lucide="cloud-rain"></i>',
      title: "Lluvia",
      triggers: getTriggers(null, ["pelipper", "politoed", "basculegion", "archaludon"], ["Drizzle"])
    });
  }

  if (
    hasAnyAbility(["Drought"]) ||
    hasAnyName(["charizard-mega-y", "torkoal"]) ||
    hasAnyName(["venusaur", "lilligant"])
  ) {
    strategies.push({
      icon: '<i data-lucide="sun"></i>',
      title: "Sol",
      triggers: getTriggers(null, ["charizard-mega-y", "torkoal", "venusaur", "lilligant"], ["Drought"])
    });
  }

  if (
    hasAnyAbility(["Sand Stream"]) ||
    (hasAnyName(["tyranitar", "tyranitar-mega"]) &&
      hasAnyName(["excadrill", "garchomp"]))
  ) {
    strategies.push({
      icon: '<i data-lucide="mountain"></i>',
      title: "Arena",
      triggers: getTriggers(null, ["tyranitar", "tyranitar-mega", "excadrill", "garchomp"], ["Sand Stream"])
    });
  }

  if (
    hasAnyMove(["Fake Out", "Parting Shot", "Volt Switch", "U-turn"]) ||
    hasAnyAbility(["Intimidate"]) ||
    hasAnyName(["incineroar", "landorus-therian", "iron-hands"])
  ) {
    strategies.push({
      icon: '<i data-lucide="refresh-cw"></i>',
      title: "Pivot",
      triggers: getTriggers(["Fake Out", "Parting Shot", "Volt Switch", "U-turn"], ["incineroar", "landorus-therian", "iron-hands"], ["Intimidate"])
    });
  }

  if (hasAnyMove(["Follow Me", "Rage Powder", "Helping Hand", "Wide Guard"])) {
    strategies.push({
      icon: '<i data-lucide="shield"></i>',
      title: "Soporte",
      triggers: getTriggers(["Follow Me", "Rage Powder", "Helping Hand", "Wide Guard"])
    });
  }

  if (hasAnyMove(["Perish Song", "Disable"])) {
    strategies.push({
      icon: '<i data-lucide="music"></i>',
      title: "Disrupción",
      triggers: getTriggers(["Perish Song", "Disable"])
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
      triggers: paired ? mons.filter(m => m.name === paired) : mons.slice(0, 3)
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

function renderSavedTeams() {
  const teams = getSavedTeams();

  if (!teams.length) {
    savedTeamsList.innerHTML = `<div class="empty">Todavía no has guardado ningún equipo.</div>`;
    return;
  }

  savedTeamsList.innerHTML = teams
    .map(
      (team) => `
        <div class="saved-row" style="margin-top:8px">
          <div style="min-width:0">
            <div class="row-title">${team.name}</div>
            <div class="row-sub">${team.mons.length} slots guardados · corte ${team.rating || state.rating}</div>
            <div class="saved-preview">
              ${team.mons
                .map(
                  (mon) => `
                <div class="sprite-sm" title="${mon.displayName}">
                  <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
                </div>
              `,
                )
                .join("")}
            </div>
          </div>

          <div class="saved-actions">
            <button class="btn small" data-action="load-saved" data-id="${team.id}">Cargar</button>
            <button class="btn small red" data-action="delete-saved" data-id="${team.id}">Borrar</button>
          </div>
        </div>
      `,
    )
    .join("");
}

function saveCurrentTeam() {
  const nameInput = document.getElementById("saveName");
  const name = nameInput.value.trim();
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
  nameInput.value = "";
  renderSavedTeams();
}

async function loadSavedTeam(id) {
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

  state.self = mons.slice(0, 6);
  while (state.self.length < 6) state.self.push(null);
  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  renderAll();
}

function deleteSavedTeam(id) {
  const teams = getSavedTeams().filter((t) => t.id !== id);
  setSavedTeams(teams);
  renderSavedTeams();
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
    state[side][index] = mon;
    scheduleMoveWarmup();
    renderAll();
  } catch (err) {
    alert(`No se pudo cargar ${name}`);
  }
}

function clearAll() {
  state.self = Array(6).fill(null);
  state.enemy = Array(6).fill(null);
  renderAll();
}

function swapTeams() {
  const temp = state.self;
  state.self = state.enemy;
  state.enemy = temp;
  renderAll();
}

async function fillTeamWithSpecies(side, speciesList) {
  const mons = [];
  for (let i = 0; i < Math.min(speciesList.length, 6); i++) {
    try {
      const mon = await fetchPokemon(speciesList[i]);
      mon.set = buildDefaultSetForSpecies(mon.name, side, i);
      mons.push(mon);
    } catch {}
  }
  state[side] = mons;
  while (state[side].length < 6) state[side].push(null);
  scheduleMoveWarmup();
  renderAll();
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

// --- NORMALIZATION ---
function normalizeBattleData(data) {
  return data;
}
function normalizeLegacySavedTeams(teams) {
  return teams;
}
function getMoveKey(move) {
  return normalizeText(move);
}
function getItemKey(item) {
  return normalizeText(item);
}
function getAbilityKey(ability) {
  return normalizeText(ability);
}

// --- META INFERENCE ---
function inferPokemonRole(mon) {
  return "general";
}
function inferEnemyArchetypeScores(team) {
  return {};
}

// --- SCORING ---
function scorePokemonForMatchup(mon, enemyTeam) {
  return scorePokemonForQuickPick(mon, enemyTeam);
}
function scoreBringFour(selfTeam, enemyTeam) {
  return [];
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

// --- PREVIEW UI ---
function computeQuickPreview(rows) {
  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);

  if (!selfTeam.length || !enemyTeam.length) {
    return { enemyPlan: [], bestFour: [], leadPair: [], noBring: [] };
  }

  const scoredSelf = selfTeam
    .map((mon) => ({
      mon,
      score: scorePokemonForQuickPick(mon, enemyTeam), // Puntuación existente para quick pick
      mvpScore: calculateMvpScore(mon, selfTeam, enemyTeam), // Nueva puntuación MVP
    }))
    .sort((a, b) => b.score - a.score);

  const bestFour = scoredSelf.slice(0, 4).map((x) => x.mon);
  const noBring = scoredSelf.slice(4).map((x) => x.mon);

  let bestLeadScore = -Infinity;
  let leadPair = [];

  if (bestFour.length >= 2) {
    for (let i = 0; i < bestFour.length; i++) {
      for (let j = i + 1; j < bestFour.length; j++) {
        const score = scoreLeadPairQuick(bestFour[i], bestFour[j], enemyTeam);
        if (score > bestLeadScore) {
          bestLeadScore = score;
          leadPair = [bestFour[i], bestFour[j]];
        }
      }
    }
  } else {
    leadPair = bestFour.slice(0, 2);
  }

  // --- Detección de MVP ---
  let mvp = null;
  for (const scoredMon of scoredSelf) {
    if (scoredMon.mvpScore >= 20) {
      mvp = scoredMon.mon;
      break; // Encontramos el primer MVP, asumimos que solo uno es necesario para el banner
    }
  }

  return {
    mvp, // Pasamos el MVP a la función de renderizado
    enemyPlan: inferStrategies(enemyTeam), // Estrategias existentes
    bestFour,
    leadPair,
    noBring,
  };
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
    mvpBanner.className = "tiny-chip";
    // FIX: Ajuste de flex y white-space para prevenir overflow
    mvpBanner.style =
      "background: linear-gradient(135deg, rgba(50, 173, 230, 0.25), rgba(50, 173, 230, 0.08)); border-color: rgba(50, 173, 230, 0.45); color: #d4f0ff; margin-bottom: 12px; display: inline-flex; align-items: center; white-space: normal; line-height: 1.4; padding: 8px 12px; text-align: left;";

    // FIX: Inyección segura en el DOM sin sobrescribir elementos adyacentes
    const sectionHead = quickPreviewPanel.querySelector(".section-head");
    if (sectionHead) {
      sectionHead.insertAdjacentElement("afterend", mvpBanner);
    } else {
      quickPreviewPanel.prepend(mvpBanner);
    }
  }
  mvpBanner.innerHTML = `💡 Win Condition: Mantén a tu <img src="${mvp.sprite}" alt="${mvp.displayName}" style="width:20px;height:20px;vertical-align:middle;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5)); margin: 0 4px;"> <strong>${mvp.displayName}</strong> vivo, el rival no tiene respuestas eficaces.`;
}

function renderWeaknessSummary() {
  // Future
}

function renderQuickPreview(preview) {
  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);
  const panel = document.getElementById("quickPreviewPanel");

  if (selfTeam.length < 4 || enemyTeam.length === 0) {
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
          <div class="tiny-chip" style="background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.1); padding: 4px 8px;" title="${item.text}">
            <span style="font-size:0.9rem; display:flex; align-items:center;">${item.icon}</span>
            <span style="font-size:0.7rem; font-weight:800">${item.title}</span>
          </div>
        `,
      )
      .join("");
  } else {
    planList.innerHTML =
      '<div class="muted-small">Sin plan claro detectado.</div>';
  }

  const leadIds = new Set(preview.leadPair.map(m => m.name));
  const backline = preview.bestFour.filter(m => !leadIds.has(m.name));

  const bestFourCard = document.getElementById("bestFourCard");
  bestFourCard.innerHTML = `
    <div class="insight-head">
      <h3>Tus 4 Elegidos</h3>
      <span class="tiny-chip status-blue">Pick</span>
    </div>
    <div class="preview-squad">
      <div class="preview-lead-row">
        ${preview.leadPair.length === 2 ? `
          <div class="preview-lead-sprite" title="${preview.leadPair[0].displayName}"><img src="${preview.leadPair[0].sprite}"></div>
          <div class="preview-plus"><i data-lucide="plus"></i></div>
          <div class="preview-lead-sprite" title="${preview.leadPair[1].displayName}"><img src="${preview.leadPair[1].sprite}"></div>
        ` : preview.leadPair.map(m => `<div class="preview-lead-sprite" title="${m.displayName}"><img src="${m.sprite}"></div>`).join("")}
      </div>
      <div class="preview-bench-row">
        ${backline.map(m => `<div class="preview-bench-sprite" title="${m.displayName}"><img src="${m.sprite}"></div>`).join('')}
      </div>
    </div>
  `;

  const noBringCard = document.getElementById("noBringCard");
  noBringCard.innerHTML = `
    <div class="insight-head">
      <h3>Banquillo Crítico</h3>
      <span class="tiny-chip status-red">Evitar</span>
    </div>
    <div style="display:flex; gap:8px; justify-content:center; padding: 12px 0;">
      ${preview.noBring.length > 0 ? preview.noBring.map(m => `
        <div class="preview-banned-sprite" title="${m.displayName}">
          <img src="${m.sprite}">
          <div class="preview-ban-mark"><i data-lucide="ban"></i></div>
        </div>
      `).join('') : '<div class="muted-small">No hay bans claros.</div>'}
    </div>
  `;
  
  updateIcons();
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

  const speedRowHtml = (item) => `
        <div class="speed-tier-row">
          <div class="speed-team-flag speed-team-flag--${item.side === "self" ? "self" : "enemy"}" title="${item.side === "self" ? "Tu equipo" : "Rival"}"></div>
          <div class="sprite-sm speed-tier-sprite">
            <img src="${item.mon.sprite}" alt="" loading="lazy">
          </div>
          <div style="min-width:0; flex:1; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <div class="row-title">${item.mon.displayName}</div>
            <div class="poke-stat-num" style="font-size:1rem; color:${item.spe < 0 ? "var(--purple)" : "#fff"};">${Math.abs(item.spe)}</div>
          </div>
        </div>`;

  const blocks = [];
  for (let i = 0; i < tiers.length; ) {
    let j = i;
    while (j + 1 < tiers.length && tiers[j + 1].spe === tiers[i].spe) j++;
    blocks.push(tiers.slice(i, j + 1));
    i = j + 1;
  }

  speedTierList.innerHTML = blocks
    .map((group) => {
      if (group.length > 1) {
        return `<div class="speed-tie-group">
            <div class="speed-tie-badge" title="Misma velocidad efectiva: orden al azar"><span aria-hidden="true">⚠️</span> Speed tie</div>
            ${group.map(speedRowHtml).join("")}
          </div>`;
      }
      return speedRowHtml(group[0]);
    })
    .join("");

  document.getElementById("toggleTailwindSelfBtn").className =
    `btn small ${state.field.tailwindSelf ? "blue" : "ghost"}`;
  document.getElementById("toggleTailwindEnemyBtn").className =
    `btn small ${state.field.tailwindEnemy ? "red" : "ghost"}`;
  document.getElementById("toggleTrickRoomBtn").className =
    `btn small ${state.field.trickRoom ? "gold" : "ghost"}`;
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
  const atk =
    mon.raw?.stats?.find((s) => s.stat.name === "attack")?.base_stat || 0;
  const spa =
    mon.raw?.stats?.find((s) => s.stat.name === "special-attack")?.base_stat ||
    0;
  return atk > spa;
}

function pruneInvalidTurn1Slots() {
  for (const side of ["self", "enemy"]) {
    state.leads[side] = state.leads[side].filter((i) => state[side][i]);
  }
}

function ensureTurn1LeadDefaults() {
  for (const side of ["self", "enemy"]) {
    const filled = [0, 1, 2, 3, 4, 5].filter((i) => state[side][i]);
    if (filled.length < 2) {
      state.leads[side] = [...filled];
      continue;
    }
    if (state.leads[side].length === 0) {
      state.leads[side] = filled.slice(0, 2);
    }
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
  const build = (side) => {
    const team = state[side];
    const picks = state.leads[side];
    return [0, 1, 2, 3, 4, 5]
      .map((i) => {
        const mon = team[i];
        const on = picks.includes(i);
        const cls = ["t1-slot"];
        if (!mon) cls.push("t1-slot--empty");
        if (mon && on)
          cls.push(side === "self" ? "t1-slot--on-self" : "t1-slot--on-enemy");
        const inner = mon
          ? `<img src="${mon.sprite}" alt="" loading="lazy">`
          : '<span class="t1-slot-ph">—</span>';
        const dis = mon ? "" : " disabled";
        return `<button type="button" class="${cls.join(" ")}" data-t1-slot data-side="${side}" data-idx="${i}"${dis}>${inner}</button>`;
      })
      .join("");
  };
  selfRow.innerHTML = build("self");
  enemyRow.innerHTML = build("enemy");
}

function renderTurn1Simulator() {
  const panel = document.getElementById("turn1SimulatorPanel");
  const list = document.getElementById("t1InsightsList");
  const selfTeam = state.self.filter(Boolean);
  const enemyTeam = state.enemy.filter(Boolean);

  if (selfTeam.length < 2 || enemyTeam.length < 2) {
    panel.style.display = "none";
    return;
  }
  panel.style.display = "block";

  pruneInvalidTurn1Slots();
  ensureTurn1LeadDefaults();
  renderTurn1PickRows();

  const sIdx = getTurn1ResolvedLeadIndices("self");
  const eIdx = getTurn1ResolvedLeadIndices("enemy");
  const s1 = state.self[sIdx[0]];
  const s2 = state.self[sIdx[1]];
  const e1 = state.enemy[eIdx[0]];
  const e2 = state.enemy[eIdx[1]];

  const leads = [
    { mon: s1, side: "self", spe: calculateSpeed(s1, "self") },
    { mon: s2, side: "self", spe: calculateSpeed(s2, "self") },
    { mon: e1, side: "enemy", spe: calculateSpeed(e1, "enemy") },
    { mon: e2, side: "enemy", spe: calculateSpeed(e2, "enemy") },
  ]
    .filter((x) => x.mon)
    .sort((a, b) => b.spe - a.spe);

  const insights = [];
  const micro = (mon) =>
    `<img src="${mon.sprite}" class="sprite-micro" title="${mon.displayName}">`;

  // 1. Sistema de Detección Inmune a Formatos (Smogon / Traducciones PokeAPI)
  const safeNorm = (str) =>
    String(str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const safeNormArray = (arr) => (arr || []).map(safeNorm);

  const FAKE_OUT = new Set(["fakeout", "sorpresa"]);
  const REDIRECTION = new Set(["followme", "ragepowder", "seuelo", "polvoira"]);
  const TAUNT = new Set(["taunt", "mofa"]);
  const TAILWIND = new Set(["tailwind", "vientoafin", "vientoafn"]);

  const WEATHER_SETTERS = {
    drizzle: { text: "Lluvia", icon: "cloud-rain" },
    llovizna: { text: "Lluvia", icon: "cloud-rain" },
    drought: { text: "Sol", icon: "sun" },
    sequia: { text: "Sol", icon: "sun" },
    sequía: { text: "Sol", icon: "sun" },
    sandstream: { text: "Arena", icon: "wind" },
    chorroarena: { text: "Arena", icon: "wind" },
    snowwarning: { text: "Nieve", icon: "snowflake" },
    nevada: { text: "Nieve", icon: "snowflake" },
  };

  const TERRAIN_SETTERS = {
    psychicsurge: { text: "Terreno Psíquico", icon: "orbit" },
    psicogenesis: { text: "Terreno Psíquico", icon: "orbit" },
    grassysurge: { text: "Campo de Hierba", icon: "leaf" },
    herbogenesis: { text: "Campo de Hierba", icon: "leaf" },
    electricsurge: { text: "Campo Eléctrico", icon: "zap" },
    electrogenesis: { text: "Campo Eléctrico", icon: "zap" },
    mistysurge: { text: "Campo de Niebla", icon: "sparkles" },
    neblogenesis: { text: "Campo de Niebla", icon: "sparkles" },
    hadagenesis: { text: "Campo de Niebla", icon: "sparkles" },
  };

  const INTIMIDATE = new Set(["intimidate", "intimidacion"]);
  const INTIMIDATE_IMMUNE = new Set([
    "clearbody",
    "cuerpopuro",
    "innerfocus",
    "focointerno",
    "guarddog",
    "perroguardian",
    "oblivious",
    "despiste",
    "owntempo",
    "ritmopropio",
    "scrappy",
    "intrepido",
  ]);
  const INTIMIDATE_PUNISH = new Set([
    "defiant",
    "competitivo",
    "competitive",
    "tenacidad",
    "contrary",
    "respondon",
    "respondón",
  ]);
  const ANTI_PRIORITY = new Set([
    "armortail",
    "colaarmadura",
    "dazzling",
    "cuerpovivido",
    "queenlymajesty",
    "regiamajestad",
  ]);

  // Procesamiento previo por Lead
  const fakeOutUsers = leads.filter((x) =>
    safeNormArray(x.mon.set?.moves).some((m) => FAKE_OUT.has(m)),
  );
  const redirectionUsers = leads.filter((x) =>
    safeNormArray(x.mon.set?.moves).some((m) => REDIRECTION.has(m)),
  );
  const weatherSetters = leads.filter(
    (x) => WEATHER_SETTERS[safeNorm(x.mon.set?.ability)],
  );
  const terrainSetters = leads.filter(
    (x) => TERRAIN_SETTERS[safeNorm(x.mon.set?.ability)],
  );
  const intimidators = leads.filter((x) =>
    INTIMIDATE.has(safeNorm(x.mon.set?.ability)),
  );
  const tailwindUsers = leads.filter((x) =>
    safeNormArray(x.mon.set?.moves).some((m) => TAILWIND.has(m)),
  );
  const tauntUsers = leads.filter((x) =>
    safeNormArray(x.mon.set?.moves).some((m) => TAUNT.has(m)),
  );
  const antiPriorityUsers = leads.filter((x) =>
    ANTI_PRIORITY.has(safeNorm(x.mon.set?.ability)),
  );

  // Anti-Priority general insight
  antiPriorityUsers.forEach((ap) => {
    insights.push(
      `<span class="tag-pill tag-pill--info"><i data-lucide="shield"></i> Bloqueo</span> ${micro(ap.mon)} anula prioridad (ej. Sorpresa).`,
    );
  });

  // 4. Lógica Avanzada: Prioridad Fake Out vs Redirección
  const effectiveFakeOuts = fakeOutUsers.filter(
    (fo) => !antiPriorityUsers.some((ap) => ap.side !== fo.side),
  );

  if (effectiveFakeOuts.length > 0) {
    if (effectiveFakeOuts.length === 1) {
      insights.push(
        `<span class="tag-pill tag-pill--warning"><i data-lucide="hand"></i> Prioridad +3</span> ${micro(effectiveFakeOuts[0].mon)} amenaza con Sorpresa.`,
      );
    } else {
      insights.push(
        `<span class="tag-pill tag-pill--warning"><i data-lucide="hand"></i> Prioridad +3</span> ${micro(effectiveFakeOuts[0].mon)} es el Sorpresa más rápido.`,
      );
    }

    if (redirectionUsers.length > 0) {
      insights.push(
        `<span class="tag-pill tag-pill--info"><i data-lucide="info"></i> Prioridad</span> Sorpresa impactará antes que la redirección.`,
      );
    }
  } else if (fakeOutUsers.length > 0) {
    insights.push(
      `<span class="tag-pill tag-pill--danger"><i data-lucide="ban"></i> Bloqueo</span> Sorpresa de ${fakeOutUsers.map((fo) => micro(fo.mon)).join("")} inútil ante inmunidad.`,
    );
  }

  // 3. Lógica Avanzada: Inmunidades y Castigos a Intimidación
  intimidators.forEach((intim) => {
    const opponents = leads.filter(
      (x) => x.side !== intim.side && isPhysicalAttacker(x.mon),
    );
    const affected = [];
    const punished = [];

    opponents.forEach((opp) => {
      const ab = safeNorm(opp.mon.set?.ability);
      if (INTIMIDATE_PUNISH.has(ab)) punished.push(opp);
      else if (!INTIMIDATE_IMMUNE.has(ab)) affected.push(opp);
    });

    if (punished.length > 0) {
      punished.forEach((p) => {
        insights.push(
          `<span class="tag-pill tag-pill--danger"><i data-lucide="alert-triangle"></i> Peligro</span> ${micro(intim.mon)} <i data-lucide="arrow-right" class="formula-arrow"></i> <i data-lucide="trending-up" style="color: var(--green);"></i> +2 Atk <i data-lucide="arrow-right" class="formula-arrow"></i> ${micro(p.mon)}`,
        );
      });
    }

    if (affected.length > 0) {
      insights.push(
        `<span class="tag-pill tag-pill--info"><i data-lucide="eye"></i> Intimidación</span> ${micro(intim.mon)} <i data-lucide="arrow-right" class="formula-arrow"></i> <i data-lucide="trending-down" style="color: var(--red);"></i> Atk <i data-lucide="arrow-right" class="formula-arrow"></i> ${affected.map((t) => micro(t.mon)).join(" ")}`,
      );
    } else if (punished.length === 0) {
      insights.push(
        `<span class="tag-pill tag-pill--info"><i data-lucide="eye"></i> Intimidación</span> ${micro(intim.mon)} <i data-lucide="arrow-right" class="formula-arrow"></i> <i data-lucide="help-circle"></i> Sin objetivos físicos.`,
      );
    }
  });

  // 2. Lógica Avanzada: Guerras de Clima y Terreno
  if (weatherSetters.length > 0) {
    const fastestW = weatherSetters[0];
    const slowestW = weatherSetters[weatherSetters.length - 1];
    if (weatherSetters.length === 1) {
      const wData = WEATHER_SETTERS[safeNorm(fastestW.mon.set?.ability)];
      insights.push(
        `<span class="tag-pill tag-pill--success"><i data-lucide="${wData.icon}"></i> Clima</span> ${micro(fastestW.mon)} establece ${wData.text}.`,
      );
    } else {
      const wDataSlow = WEATHER_SETTERS[safeNorm(slowestW.mon.set?.ability)];
      insights.push(
        `<span class="tag-pill tag-pill--success"><i data-lucide="${wDataSlow.icon}"></i> Clima</span> ${micro(slowestW.mon)} gana a ${micro(fastestW.mon)} por ser más lento.`,
      );
    }
  }

  if (terrainSetters.length > 0) {
    const fastestT = terrainSetters[0];
    const slowestT = terrainSetters[terrainSetters.length - 1];
    if (terrainSetters.length === 1) {
      const tData = TERRAIN_SETTERS[safeNorm(fastestT.mon.set?.ability)];
      insights.push(
        `<span class="tag-pill tag-pill--success"><i data-lucide="${tData.icon}"></i> Terreno</span> ${micro(fastestT.mon)} establece ${tData.text}.`,
      );
    } else {
      const tDataSlow = TERRAIN_SETTERS[safeNorm(slowestT.mon.set?.ability)];
      insights.push(
        `<span class="tag-pill tag-pill--success"><i data-lucide="${tDataSlow.icon}"></i> Terreno</span> ${micro(slowestT.mon)} gana a ${micro(fastestT.mon)} por ser más lento.`,
      );
    }
  }

  // Otras Utilidades (Tailwind y Taunt)
  tailwindUsers.forEach((tw) => {
    insights.push(
      `<span class="tag-pill tag-pill--info"><i data-lucide="wind"></i> Viento Afín</span> ${micro(tw.mon)} amenaza control de velocidad.`,
    );
  });

  redirectionUsers.forEach((red) => {
    insights.push(
      `<span class="tag-pill tag-pill--info"><i data-lucide="shield"></i> Redirección</span> ${micro(red.mon)} atraerá los ataques.`,
    );
  });

  tauntUsers.forEach((taunt) => {
    insights.push(
      `<span class="tag-pill tag-pill--warning"><i data-lucide="ban"></i> Mofa</span> ${micro(taunt.mon)} amenaza movimientos de estado.`,
    );
  });

  // 8. Double Target
  const selfLeads = leads.filter((x) => x.side === "self").map((x) => x.mon);
  const enemyLeads = leads.filter((x) => x.side === "enemy").map((x) => x.mon);

  if (selfLeads.length === 2 && enemyLeads.length === 2) {
    selfLeads.forEach((myMon) => {
      if (
        bestAttack(enemyLeads[0], myMon).mult >= 2 &&
        bestAttack(enemyLeads[1], myMon).mult >= 2
      ) {
        insights.push(
          `<span class="tag-pill tag-pill--danger"><i data-lucide="crosshair"></i> Double Target</span> ${micro(enemyLeads[0])} + ${micro(enemyLeads[1])} <i data-lucide="arrow-right" class="formula-arrow"></i> <i data-lucide="swords"></i> Presión <i data-lucide="arrow-right" class="formula-arrow"></i> ${micro(myMon)}`,
        );
      }
    });
    enemyLeads.forEach((enemyMon) => {
      if (
        bestAttack(selfLeads[0], enemyMon).mult >= 2 &&
        bestAttack(selfLeads[1], enemyMon).mult >= 2
      ) {
        insights.push(
          `<span class="tag-pill tag-pill--success"><i data-lucide="crosshair"></i> Foco</span> ${micro(selfLeads[0])} + ${micro(selfLeads[1])} <i data-lucide="arrow-right" class="formula-arrow"></i> <i data-lucide="swords"></i> Presión <i data-lucide="arrow-right" class="formula-arrow"></i> ${micro(enemyMon)}`,
        );
      }
    });
  }

  // UI: Línea de tiempo
  const timelineHtml = `
    <div style="display: flex; gap: 8px; justify-content: center; align-items: center; margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 12px; overflow-x: auto;">
      ${leads
        .map(
          (lead, idx) => `
        <div class="sprite-sm" style="border: 1px solid ${lead.side === "self" ? "var(--blue)" : "var(--red)"}; flex-shrink: 0;" title="${lead.mon.displayName} - Spe: ${Math.abs(lead.spe)}">
          <img src="${lead.mon.sprite}" alt="${lead.mon.displayName}" loading="lazy">
        </div>
        ${idx < leads.length - 1 ? `<i data-lucide="arrow-right" class="formula-arrow" style="flex-shrink: 0;"></i>` : ""}
      `,
        )
        .join("")}
    </div>
  `;

  if (!insights.length) {
    list.innerHTML =
      timelineHtml +
      `<div class="muted-small">No se detectaron interacciones críticas de Turno 1.</div>`;
  } else {
    list.innerHTML =
      timelineHtml +
      insights
        .map(
          (htmlStr) => `
          <div style="padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,0.02); margin-bottom: 6px;">
            <div class="formula-row">${htmlStr}</div>
          </div>
        `,
        )
        .join("");
  }
  updateIcons();
}

function updateIcons() {
  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
}

// --- MAIN RENDER ---
function renderAll() {
  renderDock("self");
  renderDock("enemy");
  const rows = getRows();
  renderMatrix(rows);
  renderThreats();
  renderOpportunities(rows);
  renderStrategies();
  renderSavedTeams();

  const preview = computeQuickPreview(rows);
  renderQuickPreview(preview);
  renderWeaknessSummary();
  renderSpeedTiers();
  renderDefensiveAlerts();
  renderTurn1Simulator();
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
  const arr = state.leads[side];
  const pos = arr.indexOf(idx);
  if (pos >= 0) arr.splice(pos, 1);
  else if (arr.length < 2) arr.push(idx);
  else {
    arr.shift();
    arr.push(idx);
  }
  renderTurn1Simulator();
});

selfSlots.addEventListener("click", async (e) => {
  const remove = e.target.closest('[data-action="remove"]');
  if (remove) {
    const idx = Number(remove.dataset.index);
    state.self[idx] = null;
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
  .getElementById("saveTeamBtn")
  .addEventListener("click", saveCurrentTeam);
document
  .getElementById("fillMetaLeftBtn")
  .addEventListener("click", () => fillMetaPreset("self"));
document
  .getElementById("fillMetaRightBtn")
  .addEventListener("click", () => fillMetaPreset("enemy"));

savedTeamsList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "load-saved") loadSavedTeam(btn.dataset.id);
  if (btn.dataset.action === "delete-saved") deleteSavedTeam(btn.dataset.id);
});

ratingSelect.value = state.rating;
ratingSelect.addEventListener("change", async (e) => {
  await loadSmogonMeta(e.target.value);
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
            <div class="editor-chip-row">
              ${typeChips}
            </div>
          </div>
        </section>

        <section class="editor-grid-2">
          <article class="editor-section">
            <div class="editor-section-head">
              <div>
                <strong>Habilidad</strong>
              </div>
            </div>

            <button type="button" class="edit-trigger-btn" data-action="edit-ability">
              <span class="${set.ability ? 'val' : 'placeholder'}">${t(set.ability, 'ability') || 'Toca para asignar Habilidad'}</span>
              <i data-lucide="chevron-right" style="width:16px;color:var(--muted);"></i>
            </button>

            <div class="editor-pill-list" style="flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none;">
              ${abilityOptions
                .slice(0, 4)
                .map(
                  (value) => `
                <button class="editor-pill ${value === set.ability ? "active" : ""}" style="white-space: nowrap; flex-shrink: 0;" data-action="quick-ability" data-value="${value}">
                  ${t(value, "ability")}
                </button>
              `,
                )
                .join("")}
            </div>
          </article>

          <article class="editor-section">
            <div class="editor-section-head">
              <div>
                <strong>Objeto</strong>
              </div>
            </div>

            <button type="button" class="edit-trigger-btn" data-action="edit-item" ${mon.name.includes("-mega") ? "disabled" : ""}>
              <span class="${set.item ? 'val' : 'placeholder'}">${t(set.item, 'item') || 'Toca para asignar Objeto'}</span>
              <i data-lucide="chevron-right" style="width:16px;color:var(--muted);"></i>
            </button>

            <div class="editor-pill-list" style="flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none;">
              ${itemOptions
                .slice(0, 4)
                .map(
                  (value) => `
                <button class="editor-pill ${value === set.item ? "active" : ""}" style="white-space: nowrap; flex-shrink: 0;" data-action="quick-item" data-value="${value}" ${mon.name.includes("-mega") ? "disabled" : ""}>
                  ${t(value, "item")}
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
                (move, idx) => `
              <button type="button" class="move-btn ${move ? '' : 'empty'}" data-action="edit-move" data-index="${idx}">
                <span class="val">${t(move, 'move') || '+ Añadir ataque'}</span>
                ${move ? `<div class="move-btn-clear" data-action="clear-move" data-index="${idx}"><i data-lucide="x" style="width:14px;height:14px;"></i></div>` : ''}
              </button>
            `,
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
  const options = (state.setChoice.options || [])
    .filter(Boolean)
    .filter((value) => {
      if (!q) return true;
      const translated = t(value, state.setChoice.kind);
      return (
        normalizeText(value).includes(q) ||
        normalizeText(translated).includes(q)
      );
    });

  if (!options.length) {
    setChoiceList.innerHTML = `<div class="empty">Sin coincidencias. Puedes usar el texto escrito arriba.</div>`;
    return;
  }

  const currentValue =
    state.setChoice.kind === "ability"
      ? set.ability || ""
      : state.setChoice.kind === "item"
        ? set.item || ""
        : set.moves[state.setChoice.moveIndex] || "";

  setChoiceList.innerHTML = options
    .map((value) => {
      const translated = t(value, state.setChoice.kind);
      return `
          <button class="choice-item ${value === currentValue ? "active" : ""}" data-action="apply-choice" data-value="${value}">
            <strong>${translated}</strong>
            <span>${value === currentValue ? "Valor actual" : "Tocar para aplicar"} ${translated !== value ? `(${value})` : ""}</span>
          </button>
        `;
    })
    .join("");
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
    mon.set = buildDefaultSetForSpecies(mon.name, "self", idx);
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
  renderSavedTeams();
}

async function warmupLocalizationCaches() {
  // Future translation or cache warmups
}

async function initApp() {
  await loadSmogonMeta(state.rating);
  await hydrateSavedState();
  await warmupLocalizationCaches();
  renderAll();
}

initApp();

const damageTooltipContainer = document.createElement("div");
damageTooltipContainer.id = "damageTooltip";
document.body.appendChild(damageTooltipContainer);

matrixContainer.addEventListener("click", (e) => {
  const cell = e.target.closest('.clickable-cell[data-tooltip]');
  if (!cell) return;
  const data = JSON.parse(decodeURIComponent(cell.dataset.tooltip));

  const typeIcon = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/${data.type.toLowerCase()}.svg`;
  const typeColor = TYPE_META[data.type]?.color || '#fff';
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
