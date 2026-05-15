import { state } from '../core/state.js';
import { bestAttack } from '../battle/damage.js';
import { topEntries } from '../utils/types.js';

export function scoreThreat(enemyMon, selfTeam) {
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

  return { score, level, reasons: reasons.slice(0, 3), bestAnswers, maxEnemyPressure, isSupportThreat };
}

export function inferStrategies(team) {
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
