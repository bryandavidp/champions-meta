export const MODULE_READY = true;

export const STORAGE_KEY = "offensive-matrix-saved-teams-v4";
export const CACHE_KEY_PREFIX = "smogon-chaos-cache-2026-04-";
export const RATING_STORAGE_KEY = "smogon-champions-rating";
export const SMOGON_MONTH = "2026-04";
export const SMOGON_BASE = "./data/";

export const SMOGON_FILES = {
  0: "gen9championsou-0.json",
  1500: "gen9championsou-1500.json",
  1630: "gen9championsou-1630.json",
  1760: "gen9championsou-1760.json",
};
export const RATING_ORDER = ["1760", "1630", "1500", "0"];

export const MATRIX_DETAIL_MODE_KEY = "offensive-matrix-detail-v1";
export const MATRIX_HELP_SEEN_KEY = "offensive-matrix-help-seen-v1";

export const TEST_TEAMS = [
  {
    name: "Sol Agresivo",
    desc: "Test: Multiplicadores dinámicos de velocidad y OHKO.",
    mons: [
      { name: "charizard-mega-y", set: { ability: "Drought", item: "Charizardite Y", moves: ["Heat Wave", "Protect", "", ""] } },
      { name: "venusaur", set: { ability: "Chlorophyll", item: "Focus Sash", moves: ["Sleep Powder", "Sludge Bomb", "", ""] } },
      { name: "tornadus", set: { ability: "Prankster", item: "Mental Herb", moves: ["Tailwind", "", "", ""] } },
      { name: "entei", set: { ability: "Inner Focus", item: "Choice Band", moves: ["Extreme Speed", "", "", ""] } },
      { name: "gastrodon", set: { ability: "Storm Drain", item: "Leftovers", moves: ["Earth Power", "", "", ""] } },
      { name: "flutter-mane", set: { ability: "Protosynthesis", item: "Booster Energy", moves: ["Dazzling Gleam", "", "", ""] } }
    ]
  },
  {
    name: "Tormenta Impermeable",
    desc: "Test: Inmunidades elementales cruzadas.",
    mons: [
      { name: "pelipper", set: { ability: "Drizzle", item: "Focus Sash", moves: ["Hurricane", "Protect", "", ""] } },
      { name: "kingdra", set: { ability: "Swift Swim", item: "Choice Specs", moves: ["Muddy Water", "Draco Meteor", "", ""] } },
      { name: "raichu", set: { ability: "Lightning Rod", item: "Assault Vest", moves: ["Fake Out", "Volt Switch", "", ""] } },
      { name: "ludicolo", set: { ability: "Swift Swim", item: "Life Orb", moves: ["Fake Out", "Hydro Pump", "", ""] } },
      { name: "amoonguss", set: { ability: "Regenerator", item: "Rocky Helmet", moves: ["Rage Powder", "Spore", "", ""] } },
      { name: "swampert-mega", set: { ability: "Swift Swim", item: "Swampertite", moves: ["Earthquake", "", "", ""] } }
    ]
  },
  {
    name: "Espacio Raro y Terrenos",
    desc: "Test: Inversión de timeline y bloqueo de prioridades.",
    mons: [
      { name: "indeedee-f", set: { ability: "Psychic Surge", item: "Psychic Seed", moves: ["Follow Me", "", "", ""] } },
      { name: "armarouge", set: { ability: "Flash Fire", item: "Life Orb", moves: ["Expanding Force", "Trick Room", "", ""] } },
      { name: "farigiraf", set: { ability: "Armor Tail", item: "Leftovers", moves: ["Hyper Voice", "Trick Room", "", ""] } },
      { name: "torkoal", set: { ability: "Drought", item: "Charcoal", moves: ["Eruption", "", "", ""] } },
      { name: "ursaluna", set: { ability: "Guts", item: "Flame Orb", moves: ["Facade", "Earthquake", "", ""] } },
      { name: "mawile-mega", set: { ability: "Intimidate", item: "Mawilite", moves: ["Play Rough", "Sucker Punch", "", ""] } }
    ]
  },
  {
    name: "Ciclo de Intimidación",
    desc: "Test: Buffs encadenados (Defiant) + Acero/Arena.",
    mons: [
      { name: "tyranitar", set: { ability: "Sand Stream", item: "Choice Scarf", moves: ["Rock Slide", "", "", ""] } },
      { name: "excadrill", set: { ability: "Sand Rush", item: "Focus Sash", moves: ["High Horsepower", "Iron Head", "", ""] } },
      { name: "incineroar", set: { ability: "Intimidate", item: "Sitrus Berry", moves: ["Fake Out", "Parting Shot", "", ""] } },
      { name: "kingambit", set: { ability: "Defiant", item: "Black Glasses", moves: ["Sucker Punch", "Kowtow Cleave", "", ""] } },
      { name: "rotom-wash", set: { ability: "Levitate", item: "Sitrus Berry", moves: ["Hydro Pump", "", "", ""] } },
      { name: "salamence-mega", set: { ability: "Intimidate", item: "Salamencite", moves: ["Hyper Voice", "", "", ""] } }
    ]
  },
  {
    name: "Los Rompemoldes",
    desc: "Test: Anular inmunidades y atravesar habilidades.",
    mons: [
      { name: "excadrill", set: { ability: "Mold Breaker", item: "Life Orb", moves: ["Earthquake", "Protect", "", ""] } },
      { name: "ogerpon-hearthflame", set: { ability: "Mold Breaker", item: "Hearthflame Mask", moves: ["Ivy Cudgel", "Spiky Shield", "", ""] } },
      { name: "heatran", set: { ability: "Flash Fire", item: "Air Balloon", moves: ["Heat Wave", "", "", ""] } },
      { name: "togekiss", set: { ability: "Serene Grace", item: "Sitrus Berry", moves: ["Air Slash", "Follow Me", "", ""] } },
      { name: "kangaskhan-mega", set: { ability: "Scrappy", item: "Kangaskhanite", moves: ["Fake Out", "Double-Edge", "", ""] } },
      { name: "gholdengo", set: { ability: "Good as Gold", item: "Choice Specs", moves: ["Make It Rain", "", "", ""] } }
    ]
  },
  {
    name: "Invisibles y Escudos",
    desc: "Test: Daño a través de Protect y reducciones.",
    mons: [
      { name: "ninetales-alola", set: { ability: "Snow Warning", item: "Light Clay", moves: ["Aurora Veil", "Blizzard", "", ""] } },
      { name: "urshifu-rapid-strike", set: { ability: "Unseen Fist", item: "Choice Scarf", moves: ["Surging Strikes", "", "", ""] } },
      { name: "cetitan", set: { ability: "Slush Rush", item: "Sitrus Berry", moves: ["Ice Spinner", "", "", ""] } },
      { name: "venusaur-mega", set: { ability: "Thick Fat", item: "Venusaurite", moves: ["Leech Seed", "", "", ""] } },
      { name: "landorus-therian", set: { ability: "Intimidate", item: "Assault Vest", moves: ["U-turn", "Earthquake", "", ""] } },
      { name: "ogerpon-wellspring", set: { ability: "Water Absorb", item: "Wellspring Mask", moves: ["Ivy Cudgel", "", "", ""] } }
    ]
  },
  {
    name: "Control de Pista",
    desc: "Test: Consumibles automáticos de Terreno y daño puro.",
    mons: [
      { name: "rillaboom", set: { ability: "Grassy Surge", item: "Miracle Seed", moves: ["Grassy Glide", "Fake Out", "", ""] } },
      { name: "tapu-koko", set: { ability: "Electric Surge", item: "Life Orb", moves: ["Thunderbolt", "", "", ""] } },
      { name: "sneasler", set: { ability: "Unburden", item: "Electric Seed", moves: ["Close Combat", "Dire Claw", "", ""] } },
      { name: "dragonite", set: { ability: "Multiscale", item: "Sharp Beak", moves: ["Extreme Speed", "", "", ""] } },
      { name: "gyarados", set: { ability: "Intimidate", item: "Sitrus Berry", moves: ["Waterfall", "", "", ""] } },
      { name: "metagross-mega", set: { ability: "Tough Claws", item: "Metagrossite", moves: ["Meteor Mash", "", "", ""] } }
    ]
  }
];

export const META_PRESETS = [
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
  },
  {
    name: "Meta Test 1: Sun + Unburden",
    desc: "Meta sun hyper‑offense: Drought + Chlorophyll + Tailwind + Unburden y cierre con Supreme Overlord.",
    mons: ["charizard", "venusaur", "whimsicott", "sneasler", "rotom-wash", "kingambit"]
  },
  {
    name: "Meta Test 2: Arena + Last Respects",
    desc: "Sand balance con Excadrill + Garchomp y Basculegion para probar daño de clima, Earthquake spread, Last Respects y redirección de Sinistcha.",
    mons: ["tyranitar", "excadrill", "garchomp", "sinistcha", "basculegion", "rotom-wash"]
  },
  {
    name: "Meta Test 3: Trick Room Psychic Terrain",
    desc: "Core Farigiraf + Hatterene + Armarouge + Torkoal para probar Armor Tail, Psychic Terrain, Expanding Force y TR mirrors.",
    mons: ["farigiraf", "hatterene", "armarouge", "torkoal", "kingambit", "amoonguss"]
  },
  {
    name: "Meta Test 4: Ciclo Intimidate & Defiant",
    desc: "Triple Intimidate (Incineroar, Gyarados, Arcanine) contra Kingambit + Sneasler para testear boosts de Defiant, Fake Out, Parting Shot y control de velocidad.",
    mons: ["incineroar", "gyarados", "arcanine", "kingambit", "sneasler", "rotom-wash"]
  },
  {
    name: "Meta Test 5: Dual Speed (Tailwind + TR)",
    desc: "Equipo híbrido con Tailwind de Whimsicott y Trick Room de Farigiraf/Sinistcha, más sweepers Garchomp/Basculegion e Incineroar de glue.",
    mons: ["whimsicott", "farigiraf", "garchomp", "basculegion", "incineroar", "sinistcha"]
  },
  {
    name: "Meta Test 6: Pivot & Status Control",
    desc: "Core Rotom‑W + Incineroar + Whimsicott para pivot (Volt Switch/Parting Shot) y status (Thunder Wave, Stun Spore, Taunt), con Garchomp, Sinistcha y Kingambit de presión.",
    mons: ["rotom-wash", "incineroar", "whimsicott", "garchomp", "sinistcha", "kingambit"]
  },
  {
    name: "Meta Test 7: Prioridad & Endgame Closers",
    desc: "Test de prioridades fuertes (Extreme Speed, Aqua Jet, Sucker Punch) y cierres de partida con Supreme Overlord + Last Respects escalado.",
    mons: ["basculegion", "kingambit", "arcanine", "sneasler", "rotom-wash", "whimsicott"]
  },
  {
    name: "Meta Test 8: Guerras de Clima & Inmunidades",
    desc: "Sun vs Sand con Rotom‑W y Garchomp para probar cambios de clima, inmunidades a Tierra/Eléctrico, Armor Tail vs prioridades y escalado de Last Respects.",
    mons: ["tyranitar", "charizard", "rotom-wash", "garchomp", "farigiraf", "basculegion"]
  }
];

export const TACTICAL_ROLES = {
  weatherSetters: ['drizzle', 'drought', 'sand stream', 'snow warning', 'llovizna', 'sequía', 'chorro arena', 'nevada'],
  terrainSetters: ['grassy surge', 'psychic surge', 'electric surge', 'misty surge', 'herbogénesis', 'psicogénesis', 'electrogénesis', 'nebulogénesis'],
  speedControl: ['trick room', 'espacio raro', 'tailwind', 'viento afín']
};

export const TYPE_META = {
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

export const TYPE_CHART = {
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

export const SMOGON_SPECIES_OVERRIDES = {
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

export const SUPPORT_MOVES = new Set([
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

export const MOVE_TYPE_FALLBACK = {
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

export const DEMO_SELF = [
  "arcanine-hisui",
  "azumarill",
  "kingambit",
  "farigiraf",
  "tyranitar",
  "excadrill-mega",
];
export const DEMO_ENEMY = [
  "charizard-mega-y",
  "whimsicott",
  "farigiraf",
  "venusaur",
  "aegislash",
  "azumarill",
];

export const MEGA_STONES = {
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


export const CUSTOM_TERMS = new Set([
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

export const weatherNames = { 'sun': 'Sol', 'rain': 'Lluvia', 'sandstorm': 'Tormenta Arena', 'snow': 'Nieve', 'none': 'Despejado' };

export const POKEAPI_SPECIES_SLUG = {
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

export const NATURE_PAIR = {
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

export const MOVE_PRIORITY_LEVELS = {
  'helping hand': 5, 'refuerzo': 5,
  'protect': 4, 'protección': 4, 'detect': 4, 'detección': 4,
  'fake out': 3, 'sorpresa': 3,
  'wide guard': 3, 'vasta guardia': 3,
  'quick guard': 3, 'anticipo': 3,
  'extreme speed': 2, 'velocidad extrema': 2,
  'ally switch': 2, 'cambio banda': 2,
  'follow me': 2, 'señuelo': 2,
  'rage powder': 2, 'polvo ira': 2,
  'feint': 2, 'amago': 2,
  'aqua jet': 1, 'acua jet': 1,
  'sucker punch': 1, 'golpe bajo': 1,
  'bullet punch': 1, 'puño bala': 1,
  'mach punch': 1, 'ultrapuño': 1,
  'ice shard': 1, 'canto helado': 1,
  'shadow sneak': 1, 'sombra vil': 1,
  'jet punch': 1, 'puño jet': 1,
  'quick attack': 1, 'ataque rápido': 1,
  'vacuum wave': 1, 'onda vacío': 1,
  'first impression': 2, 'escaramuza': 2,
  'upper hand': 3, 'mano superior': 3,
  'accelerock': 1, 'roca veloz': 1,
  'water shuriken': 1, 'shuriken de agua': 1,
  'trick room': -7, 'espacio raro': -7,
  'roar': -6, 'rugido': -6,
  'whirlwind': -6, 'remolino': -6
};

// Movimientos típicos de spread en dobles
const normalizeMoveKey = (name) =>
  String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const SPREAD_MOVE_NAMES = [
  'Rock Slide',
  'Avalancha',
  'Heat Wave',
  'Onda Ignea',
  'Earthquake',
  'Terremoto',
  'Bulldoze',
  'Terratemblor',
  'Snarl',
  'Alarido',
  'Dazzling Gleam',
  'Brillo Magico',
  'Make It Rain',
  'Fiebre Dorada',
  'Bleakwind Storm',
  'Icy Wind',
  'Viento Hielo',
  'Electroweb',
  'Red Viscosa',
  'Muddy Water',
  'Agua Lodosa',
  'Discharge',
  'Chispazo',
  'Blizzard',
  'Ventisca',
  'Hyper Voice',
  'Vozarron',
  'Water Spout',
  'Salpicar',
  'Eruption',
  'Estallido',
  'Hurricane',
];

export const SPREAD_MOVES = new Set(
  SPREAD_MOVE_NAMES.flatMap((move) => {
    const raw = String(move);
    return [raw, raw.toLowerCase(), normalizeMoveKey(raw)];
  })
);

// Multi-hits garantizados (aprox. corto plazo)
export const GUARANTEED_MULTI_HITS = {
  'Surging Strikes': 3,
  'Triple Axel': 3, // ojo, técnicamente puede fallar hits posteriores
  'Dual Chop': 2,
  'Population Bomb': 10, // placeholder, a ajustar cuando uses PokeAPI
};

export const WEATHER_LABELS = {
  sun: 'Sol',
  rain: 'Lluvia',
  sand: 'Arena',
  snow: 'Nieve'
};

export const TERRAIN_LABELS = {
  electric: 'Campo eléctrico',
  grassy: 'Campo de hierba',
  psychic: 'Campo psíquico',
  misty: 'Campo de niebla'
};

export const TOOL_GROUPS = {
  fakeOut:   ['Fake Out', 'Sorpresa'],
  redir:     ['Follow Me', 'Rage Powder', 'Señuelo', 'Polvo Ira'],
  pivot:     ['Parting Shot', 'U-turn', 'Volt Switch', 'Flip Turn', 'Ida y Vuelta', 'Voltiocambio'],
  protections: ['Wide Guard', 'Quick Guard', 'Vasta Guardia', 'Anticipo'],
  statusCtrl: ['Taunt', 'Haze', 'Mofa', 'Niebla'],
};

export const UIMODE_KEY = 'offensive-matrix-ui-mode';
