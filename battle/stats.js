import {
  baseStatAt,
  maxHpAt,
  natureMultiplier,
  stageMultiplier as formulaStageMultiplier,
} from './formulas.js';

const EV_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

function clampEv(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.max(0, Math.min(252, Math.round(num)));
}

export function looksCompactEvSpread(evs = {}) {
  const values = EV_KEYS
    .map((key) => clampEv(evs?.[key]))
    .filter((value) => value > 0);

  if (!values.length) return false;
  const maxValue = Math.max(...values);
  if (maxValue > 32) return false;

  return values.some((value) => value >= 16) || values.length >= 2;
}

export function expandCompactEvValue(value) {
  const num = clampEv(value);
  if (num <= 0) return 0;
  if (num >= 32) return 252;
  return Math.max(0, Math.min(252, num * 8 - 4));
}

export function expandCompactEvSpread(evs = {}) {
  return {
    hp: expandCompactEvValue(evs.hp),
    atk: expandCompactEvValue(evs.atk),
    def: expandCompactEvValue(evs.def),
    spa: expandCompactEvValue(evs.spa),
    spd: expandCompactEvValue(evs.spd),
    spe: expandCompactEvValue(evs.spe),
  };
}

export function getResolvedEvs(source) {
  const set =
    source?.set && typeof source.set === "object"
      ? source.set
      : source && typeof source === "object" && source.evs
        ? source
        : null;

  const rawEvs =
    set?.evs && typeof set.evs === "object"
      ? set.evs
      : source && !source.set && typeof source === "object"
        ? source
        : {};

  const safeEvs = {
    hp: clampEv(rawEvs.hp),
    atk: clampEv(rawEvs.atk),
    def: clampEv(rawEvs.def),
    spa: clampEv(rawEvs.spa),
    spd: clampEv(rawEvs.spd),
    spe: clampEv(rawEvs.spe),
  };

  const explicitScale = set?._evScale || set?.evScale || source?._evScale || source?.evScale || null;
  const metaDefaultSource =
    source?.source === "smogon-chaos" ||
    set?.source === "smogon-chaos" ||
    Array.isArray(set?.raw?.spreads) ||
    Array.isArray(source?.raw?.spreads);

  if (explicitScale === "compact") {
    return expandCompactEvSpread(safeEvs);
  }
  if (explicitScale === "full") {
    return safeEvs;
  }
  if (metaDefaultSource && looksCompactEvSpread(safeEvs)) {
    return expandCompactEvSpread(safeEvs);
  }
  return safeEvs;
}

export function parseSpread(spreadKey = "") {
  const [naturePart, evPart = ""] = String(spreadKey).split(":");
  const values = evPart.split("/").map((x) => Number(x || 0));
  const rawEvs = {
    hp: values[0] || 0,
    atk: values[1] || 0,
    def: values[2] || 0,
    spa: values[3] || 0,
    spd: values[4] || 0,
    spe: values[5] || 0,
  };
  const compact = looksCompactEvSpread(rawEvs);
  return {
    nature: naturePart || null,
    evs: compact ? expandCompactEvSpread(rawEvs) : getResolvedEvs(rawEvs),
    evScale: "full",
    rawCompactEvs: compact ? rawEvs : null,
  };
}

export function getNatureSpeModifier(nature) {
  if (["Timid", "Hasty", "Jolly", "Naive"].includes(nature)) return 1.1;
  if (["Brave", "Relaxed", "Quiet", "Sassy"].includes(nature)) return 0.9;
  return 1;
}

export function natureMod(nature, stat) {
  return natureMultiplier(nature, stat);
}

export function getBaseStatRaw(mon, apiName) {
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

export function calcMonHP(mon) {
  return maxHpAt({ base: getBaseStatRaw(mon, "hp"), ev: getResolvedEvs(mon).hp });
}

export function stageMultiplier(stage) {
  return formulaStageMultiplier(stage);
}

export function calcOtherStatLv50(base, ev, natureMultiplier, stage = 0) {
  const inner = baseStatAt({ base, ev: Number(ev || 0) });
  const staged = inner * formulaStageMultiplier(stage);
  return Math.floor(staged * natureMultiplier);
}

export function calculateEffectiveStats(attacker, defender, dmgClass) {
  const natA = attacker.set?.nature || "";
  const natD = defender.set?.nature || "";
  const evA = getResolvedEvs(attacker);
  const evD = getResolvedEvs(defender);
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
