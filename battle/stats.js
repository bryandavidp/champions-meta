import { NATURE_PAIR } from '../core/constants.js';

export function parseSpread(spreadKey = "") {
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

export function getNatureSpeModifier(nature) {
  if (["Timid", "Hasty", "Jolly", "Naive"].includes(nature)) return 1.1;
  if (["Brave", "Relaxed", "Quiet", "Sassy"].includes(nature)) return 0.9;
  return 1;
}

export function natureMod(nature, stat) {
  const p = NATURE_PAIR[nature];
  if (!p) return 1;
  if (p[0] === stat) return 1.1;
  if (p[1] === stat) return 0.9;
  return 1;
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
  const b = getBaseStatRaw(mon, "hp");
  const ev = mon.set?.evs?.hp || 0;
  return Math.floor(((2 * b + 31 + Math.floor(ev / 4)) * 50) / 100) + 60;
}

export function stageMultiplier(stage) {
  // Fórmula estándar de Showdown
  if (!Number.isFinite(stage) || stage === 0) return 1;
  if (stage > 0) {
    return (2 + stage) / 2;
  }
  // stage < 0
  return 2 / (2 - stage);
}

export function calcOtherStatLv50(base, ev, natureMultiplier, stage = 0) {
  const evSafe = Number(ev || 0);
  const inner =
    Math.floor(((2 * base + 31 + Math.floor(evSafe / 4)) * 50) / 100) + 5;

  const staged = inner * stageMultiplier(stage);
  return Math.floor(staged * natureMultiplier);
}

export function calculateEffectiveStats(attacker, defender, dmgClass) {
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
