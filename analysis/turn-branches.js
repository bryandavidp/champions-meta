import { MOVE_PRIORITY_LEVELS, SPREAD_MOVES } from '../core/constants.js';
import { state } from '../core/state.js';
import { bestAttack } from '../battle/damage.js';
import { calculateSpeed } from '../battle/speed.js';

const MOVE_GROUPS = {
  protect: ['protect', 'proteccion', 'detect', 'deteccion'],
  fakeOut: ['fakeout', 'sorpresa'],
  redirection: ['followme', 'ragepowder', 'senuelo', 'polvoira'],
  speedControl: ['tailwind', 'vientoafin', 'trickroom', 'espacioraro', 'icywind', 'vientohielo', 'electroweb'],
  priority: [
    'fakeout',
    'sorpresa',
    'extremespeed',
    'velocidadextrema',
    'aquajet',
    'suckerpunch',
    'golpebajo',
    'bulletpunch',
    'machpunch',
    'iceshard',
    'shadowsneak',
    'grassyglide',
    'firstimpression',
  ],
};

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function movePriority(moveName) {
  const raw = String(moveName || '').toLowerCase();
  return MOVE_PRIORITY_LEVELS[raw] || MOVE_PRIORITY_LEVELS[slug(moveName)] || 0;
}

function hasMove(mon, group) {
  const wanted = new Set(group);
  return (mon?.set?.moves || []).some((move) => wanted.has(slug(move)));
}

function findMove(mon, group) {
  const wanted = new Set(group);
  return (mon?.set?.moves || []).find((move) => wanted.has(slug(move))) || null;
}

function displayName(mon) {
  return mon?.displayName || mon?.name || 'Slot';
}

function makeSideEntries(mons, side, field) {
  return (mons || [])
    .filter(Boolean)
    .slice(0, 2)
    .map((mon, slot) => ({
      mon,
      side,
      slot,
      speed: calculateSpeed(mon, side, field),
    }));
}

function itemSlug(mon) {
  return slug(mon?.set?.item || mon?.item || '');
}

function hasFocusSash(mon) {
  return ['focussash', 'bandafocus'].includes(itemSlug(mon));
}

function hasPriority(mon) {
  return (mon?.set?.moves || []).some((move) => movePriority(move) > 0 || MOVE_GROUPS.priority.includes(slug(move)));
}

function hasSpreadMove(moveName) {
  const moveId = slug(moveName);
  return Array.from(SPREAD_MOVES || []).some((move) => slug(move) === moveId);
}

function scoreAttack(atk) {
  if (!atk || atk.blocked || atk.mult === 0) return 0;
  let score = 8;
  score += Math.min(34, (atk.maxPct || 0) * 0.34);
  if ((atk.minPct || 0) >= 100) score += 30;
  else if (atk.ohko || (atk.ohkoProb || 0) > 0) score += 12 + Math.min(18, (atk.ohkoProb || 0) * 0.18);
  if ((atk.mult || 1) >= 2) score += 8;
  if ((atk.mult || 1) >= 4) score += 8;
  if (hasSpreadMove(atk.move)) score += 4;
  return score;
}

function buildAttackAction(attacker, defender, atk) {
  return {
    kind: 'move',
    actor: displayName(attacker.mon),
    move: atk?.move || 'Ataque',
    target: displayName(defender.mon),
    priority: movePriority(atk?.move),
    speed: Math.abs(attacker.speed || 0),
    damage: {
      minPct: atk?.minPct || 0,
      maxPct: atk?.maxPct || 0,
      ohkoProb: atk?.ohkoProb || 0,
      ko: !!(atk?.ohko || (atk?.minPct || 0) >= 100),
    },
    tags: [
      hasSpreadMove(atk?.move) ? 'spread' : null,
      atk?.blocked ? 'blocked' : null,
      (atk?.ohko || (atk?.ohkoProb || 0) >= 50) ? 'ko' : null,
    ].filter(Boolean),
  };
}

function buildSupportAction(user, move, target = 'campo') {
  return {
    kind: 'move',
    actor: displayName(user.mon),
    move,
    target,
    priority: movePriority(move),
    speed: Math.abs(user.speed || 0),
    damage: null,
    tags: ['support'],
  };
}

function emptyAction(user) {
  return {
    kind: 'wait',
    actor: displayName(user?.mon),
    move: 'Reposicionar',
    target: 'mesa',
    priority: 0,
    speed: Math.abs(user?.speed || 0),
    damage: null,
    tags: ['fallback'],
  };
}

function bestAttackInto(attacker, defenders, field) {
  let best = null;
  for (const defender of defenders) {
    const atk = bestAttack(attacker.mon, defender.mon, field);
    const score = scoreAttack(atk);
    if (!best || score > best.score) {
      best = { attacker, defender, atk, score };
    }
  }
  return best;
}

function bestIncomingTarget(attackers, defenders, field) {
  let best = null;
  for (const defender of defenders) {
    const hits = attackers
      .map((attacker) => {
        const atk = bestAttack(attacker.mon, defender.mon, field);
        return { attacker, defender, atk, score: scoreAttack(atk) };
      })
      .sort((a, b) => b.score - a.score);
    const total = hits.slice(0, 2).reduce((sum, hit) => sum + hit.score, 0);
    if (!best || total > best.total) best = { defender, hits, total };
  }
  return best;
}

function orderSummary(selfEntries, enemyEntries) {
  const ordered = [...selfEntries, ...enemyEntries].sort((a, b) => b.speed - a.speed);
  return ordered.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function inferOutcome(netScore, details = {}) {
  if (details.enemyKo && details.selfKo) return 'trade 1x1';
  if (details.enemyKo && netScore >= 58) return 'ganas board';
  if (details.forceProtect) return 'forzas Protect';
  if (details.selfKo && netScore < 45) return 'KO probable en contra';
  if (netScore < 42) return 'pierdes tempo';
  if (netScore < 56) return 'trade 1x1';
  return 'ganas board';
}

function addCommonConditions(branch, context) {
  const fastest = context.speedOrder[0];
  if (fastest) {
    branch.conditions.push(`Primer movimiento probable: ${displayName(fastest.mon)} (${fastest.side === 'self' ? 'tu lado' : 'rival'})`);
  }
  if (context.field?.trickRoom) branch.conditions.push('Trick Room activo: el orden de velocidad esta invertido');
  if (context.field?.weather) branch.conditions.push(`Clima activo: ${context.field.weather}`);
  if (context.field?.terrain) branch.conditions.push(`Terreno activo: ${context.field.terrain}`);
  return branch;
}

function branchConfidence(branch, context) {
  let confidence = 0.48;
  confidence += Math.min(0.12, context.selfEntries.length * 0.04 + context.enemyEntries.length * 0.04);
  if (branch.conditions.length >= 2) confidence += 0.08;
  if (branch.actions.self.some((a) => a.damage?.ko) || branch.actions.enemy.some((a) => a.damage?.ko)) confidence += 0.08;
  if (branch.invalidators.length) confidence -= Math.min(0.12, branch.invalidators.length * 0.04);
  return Number(clamp(confidence, 0.35, 0.86).toFixed(2));
}

function uniqueBranches(branches, maxBranches) {
  const seen = new Set();
  const out = [];
  for (const branch of branches) {
    const sig = [
      branch.style,
      ...branch.actions.self.map((a) => `${a.actor}:${a.move}:${a.target}`),
      ...branch.actions.enemy.map((a) => `${a.actor}:${a.move}:${a.target}`),
    ].join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(branch);
    if (out.length >= maxBranches) break;
  }
  return out;
}

function finalizeBranch(branch, context) {
  const finalBranch = addCommonConditions(branch, context);
  finalBranch.score = Math.round(clamp(finalBranch.score, 0, 100));
  finalBranch.conditions = [...new Set(finalBranch.conditions.filter(Boolean))].slice(0, 5);
  finalBranch.invalidators = [...new Set(finalBranch.invalidators.filter(Boolean))].slice(0, 5);
  finalBranch.confidence = branchConfidence(finalBranch, context);
  return finalBranch;
}

function buildAggressiveBranch(context) {
  const target = bestIncomingTarget(context.selfEntries, context.enemyEntries, context.field);
  if (!target) return null;

  const selfHits = target.hits.slice(0, 2);
  const enemyResponses = context.enemyEntries
    .map((enemy) => bestAttackInto(enemy, context.selfEntries, context.field))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const enemyKo = selfHits.some((hit) => hit.atk.ohko || (hit.atk.minPct || 0) >= 100);
  const selfKo = enemyResponses.some((hit) => hit.atk.ohko || (hit.atk.minPct || 0) >= 100);
  const doublePressure = selfHits.length >= 2 && selfHits.reduce((sum, hit) => sum + (hit.atk.maxPct || 0), 0) >= 100;
  const score = 58 + selfHits.reduce((sum, hit) => sum + hit.score, 0) * 0.22 - enemyResponses.reduce((sum, hit) => sum + hit.score, 0) * 0.12;

  return finalizeBranch({
    id: 'branch-aggressive-main',
    score,
    label: 'Linea principal recomendada',
    style: 'agresiva',
    actions: {
      self: selfHits.map((hit) => buildAttackAction(hit.attacker, hit.defender, hit.atk)),
      enemy: enemyResponses.map((hit) => buildAttackAction(hit.attacker, hit.defender, hit.atk)),
    },
    outcome: inferOutcome(score, { enemyKo, selfKo, forceProtect: doublePressure }),
    conditions: [
      doublePressure ? `Doble target sobre ${displayName(target.defender.mon)}` : null,
      enemyKo ? 'KO directo o roll favorable sobre el objetivo' : null,
      hasFocusSash(target.defender.mon) ? 'El rival puede aguantar con Focus Sash' : null,
    ],
    invalidators: [
      hasMove(target.defender.mon, MOVE_GROUPS.protect) ? `Protect de ${displayName(target.defender.mon)}` : null,
      context.enemyEntries.some((entry) => hasMove(entry.mon, MOVE_GROUPS.redirection)) ? 'Redireccion rival cambia el objetivo' : null,
      hasFocusSash(target.defender.mon) ? 'Focus Sash convierte el KO en trade de tempo' : null,
    ],
    confidence: 0,
  }, context);
}

function buildSafeBranch(context) {
  const threatened = bestIncomingTarget(context.enemyEntries, context.selfEntries, context.field);
  if (!threatened) return null;
  const protectUser = threatened.defender;
  const protectMove = findMove(protectUser.mon, MOVE_GROUPS.protect);
  const partner = context.selfEntries.find((entry) => entry !== protectUser) || context.selfEntries[0];
  const partnerHit = partner ? bestAttackInto(partner, context.enemyEntries, context.field) : null;
  const fallbackHits = context.selfEntries
    .map((ally) => bestAttackInto(ally, context.enemyEntries, context.field))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  const enemyResponses = context.enemyEntries
    .map((enemy) => bestAttackInto(enemy, context.selfEntries, context.field))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const selfActions = [];
  if (protectMove) selfActions.push(buildSupportAction(protectUser, protectMove, displayName(protectUser.mon)));
  if (protectMove && partnerHit && partnerHit.attacker !== protectUser) {
    selfActions.push(buildAttackAction(partnerHit.attacker, partnerHit.defender, partnerHit.atk));
  } else if (!protectMove) {
    for (const hit of fallbackHits) {
      if (selfActions.some((action) => action.actor === displayName(hit.attacker.mon))) continue;
      selfActions.push(buildAttackAction(hit.attacker, hit.defender, hit.atk));
      if (selfActions.length >= 2) break;
    }
  }

  const score = 54 + (protectMove ? 16 : 2) + (partnerHit?.score || 0) * 0.16 - threatened.total * 0.08;
  return finalizeBranch({
    id: 'branch-safe-best',
    score,
    label: 'Mejor linea conservadora',
    style: 'segura',
    actions: {
      self: selfActions.slice(0, 2),
      enemy: enemyResponses.map((hit) => buildAttackAction(hit.attacker, hit.defender, hit.atk)),
    },
    outcome: inferOutcome(score, { forceProtect: !!protectMove }),
    conditions: [
      protectMove ? `${displayName(protectUser.mon)} absorbe la presion con Protect` : 'Sin Protect claro: conserva tempo atacando con el slot menos expuesto',
      partnerHit ? `${displayName(partnerHit.attacker.mon)} mantiene presion ofensiva` : null,
    ],
    invalidators: [
      !protectMove ? 'No hay Protect/Detect en el slot amenazado' : null,
      context.enemyEntries.some((entry) => hasMove(entry.mon, MOVE_GROUPS.speedControl)) ? 'Setup rival de velocidad puede cambiar el siguiente turno' : null,
    ],
    confidence: 0,
  }, context);
}

function buildTechnicalBranch(context) {
  const supportUser = context.selfEntries.find((entry) =>
    findMove(entry.mon, MOVE_GROUPS.fakeOut) ||
    findMove(entry.mon, MOVE_GROUPS.speedControl) ||
    findMove(entry.mon, MOVE_GROUPS.redirection)
  );
  if (!supportUser) return null;

  const supportMove =
    findMove(supportUser.mon, MOVE_GROUPS.fakeOut) ||
    findMove(supportUser.mon, MOVE_GROUPS.speedControl) ||
    findMove(supportUser.mon, MOVE_GROUPS.redirection);
  const partner = context.selfEntries.find((entry) => entry !== supportUser) || supportUser;
  const partnerHit = bestAttackInto(partner, context.enemyEntries, context.field);
  const enemyResponses = context.enemyEntries
    .map((enemy) => bestAttackInto(enemy, context.selfEntries, context.field))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  const supportSlug = slug(supportMove);
  const speedSetup = ['tailwind', 'vientoafin', 'trickroom', 'espacioraro'].includes(supportSlug);
  const score = 57 + (speedSetup ? 12 : 8) + (partnerHit?.score || 0) * 0.14 - enemyResponses.reduce((sum, hit) => sum + hit.score, 0) * 0.08;

  return finalizeBranch({
    id: 'branch-technical-tempo',
    score,
    label: 'Linea dependiente de tecnica',
    style: 't\u00e9cnica',
    actions: {
      self: [
        buildSupportAction(supportUser, supportMove, supportSlug === 'fakeout' || supportSlug === 'sorpresa' ? 'rival mas rapido' : 'campo'),
        partnerHit ? buildAttackAction(partnerHit.attacker, partnerHit.defender, partnerHit.atk) : emptyAction(partner),
      ].filter(Boolean),
      enemy: enemyResponses.map((hit) => buildAttackAction(hit.attacker, hit.defender, hit.atk)),
    },
    outcome: speedSetup ? 'ganas board' : inferOutcome(score, { forceProtect: supportSlug === 'fakeout' || supportSlug === 'sorpresa' }),
    conditions: [
      `${displayName(supportUser.mon)} usa ${supportMove} para alterar el turno`,
      speedSetup ? 'La recompensa real llega tambien en el turno siguiente' : null,
    ],
    invalidators: [
      (supportSlug === 'fakeout' || supportSlug === 'sorpresa') && context.field?.terrain === 'psychic' ? 'Campo Psiquico bloquea prioridad en grounded targets' : null,
      context.enemyEntries.some((entry) => hasMove(entry.mon, MOVE_GROUPS.protect)) ? 'Protect rival puede esquivar el turno tecnico' : null,
    ],
    confidence: 0,
  }, context);
}

function buildPunishBranch(context) {
  const punishTarget = bestIncomingTarget(context.enemyEntries, context.selfEntries, context.field);
  if (!punishTarget) return null;

  const enemyHits = punishTarget.hits.slice(0, 2);
  const selfResponses = context.selfEntries
    .map((ally) => bestAttackInto(ally, context.enemyEntries, context.field))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const selfKo = enemyHits.some((hit) => hit.atk.ohko || (hit.atk.minPct || 0) >= 100);
  const score = 38 - enemyHits.reduce((sum, hit) => sum + hit.score, 0) * 0.1 + selfResponses.reduce((sum, hit) => sum + hit.score, 0) * 0.06;

  return finalizeBranch({
    id: 'branch-enemy-punish',
    score,
    label: 'Mejor castigo rival',
    style: 'castigo',
    actions: {
      self: selfResponses.map((hit) => buildAttackAction(hit.attacker, hit.defender, hit.atk)),
      enemy: enemyHits.map((hit) => buildAttackAction(hit.attacker, hit.defender, hit.atk)),
    },
    outcome: inferOutcome(score, { selfKo }),
    conditions: [
      `El rival concentra presion en ${displayName(punishTarget.defender.mon)}`,
      selfKo ? 'Hay KO probable si no proteges o rediriges' : 'El castigo principal es perder tempo/HP',
    ],
    invalidators: [
      hasMove(punishTarget.defender.mon, MOVE_GROUPS.protect) ? `Protect de ${displayName(punishTarget.defender.mon)} neutraliza parte del castigo` : null,
      context.selfEntries.some((entry) => hasMove(entry.mon, MOVE_GROUPS.redirection)) ? 'Tu redireccion puede forzar otro objetivo' : null,
    ],
    confidence: 0,
  }, context);
}

function buildTradeBranch(context) {
  const selfHits = context.selfEntries
    .map((ally) => bestAttackInto(ally, context.enemyEntries, context.field))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  const enemyHits = context.enemyEntries
    .map((enemy) => bestAttackInto(enemy, context.selfEntries, context.field))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);
  if (!selfHits.length || !enemyHits.length) return null;

  const selfPressure = selfHits.reduce((sum, hit) => sum + hit.score, 0);
  const enemyPressure = enemyHits.reduce((sum, hit) => sum + hit.score, 0);
  const score = 50 + (selfPressure - enemyPressure) * 0.12;

  return finalizeBranch({
    id: 'branch-trade-neutral',
    score,
    label: 'Linea neutral de trade',
    style: 'trade',
    actions: {
      self: selfHits.map((hit) => buildAttackAction(hit.attacker, hit.defender, hit.atk)),
      enemy: enemyHits.map((hit) => buildAttackAction(hit.attacker, hit.defender, hit.atk)),
    },
    outcome: inferOutcome(score, {
      enemyKo: selfHits.some((hit) => hit.atk.ohko || (hit.atk.minPct || 0) >= 100),
      selfKo: enemyHits.some((hit) => hit.atk.ohko || (hit.atk.minPct || 0) >= 100),
    }),
    conditions: ['Ambos lados priorizan su mejor dano inmediato'],
    invalidators: [
      context.selfEntries.some((entry) => hasMove(entry.mon, MOVE_GROUPS.protect)) ? 'Protect propio permite convertir el trade en turno seguro' : null,
      context.enemyEntries.some((entry) => hasMove(entry.mon, MOVE_GROUPS.protect)) ? 'Protect rival reduce el valor del trade' : null,
    ],
    confidence: 0,
  }, context);
}

export function buildTurnBranches(input = {}) {
  const field = input.field || state.field || {};
  const selfEntries = makeSideEntries(input.selfActive || [], 'self', field);
  const enemyEntries = makeSideEntries(input.enemyActive || [], 'enemy', field);
  const maxBranches = clamp(input.maxBranches || 5, 3, 5);

  if (!selfEntries.length || !enemyEntries.length) return [];

  const context = {
    field,
    selfEntries,
    enemyEntries,
    speedOrder: orderSummary(selfEntries, enemyEntries),
  };

  const branches = [
    buildAggressiveBranch(context),
    buildSafeBranch(context),
    buildTechnicalBranch(context),
    buildPunishBranch(context),
    buildTradeBranch(context),
  ].filter(Boolean);

  return uniqueBranches(branches, maxBranches);
}
