import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModuleHarness } from './esm-loader.mjs';
import { CASE_STATUS, cloneField, makeMon } from './fixtures.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');
const snapshotPath = path.join(__dirname, 'snapshots/current-baseline.json');
const update = process.argv.includes('--update');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = stable(value[key]);
        return acc;
      }, {});
  }
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(4)) : value;
  return value;
}

function compactDamage(result) {
  return stable({
    damage: result?.damage ?? 0,
    minDamage: result?.minDamage ?? 0,
    maxDamage: result?.maxDamage ?? 0,
    blocked: !!result?.blocked,
    wMul: result?.wMul ?? 1,
    terrMul: result?.terrMul ?? 1,
    immunityData: result?.immunityData || null,
    registryExplain: result?.registry ? result.registry.reasons || [] : [],
    tags: result?.tags || [],
  });
}

function compactAttack(result) {
  return stable({
    move: result?.move || '',
    type: result?.type || '',
    mult: result?.mult ?? 0,
    rawMult: result?.rawMult ?? 0,
    blocked: !!result?.blocked,
    minPct: result?.minPct ?? 0,
    maxPct: result?.maxPct ?? 0,
    ohkoProb: result?.ohkoProb ?? 0,
    ohko: !!result?.ohko,
    immunityData: result?.immunityData || null,
    tags: result?.tags || [],
  });
}

function compactKo(info) {
  return stable({
    reliable: !!info?.reliable,
    primary: info?.primary || null,
    tags: (info?.tags || []).map((tag) => ({
      id: tag.id,
      label: tag.label,
      tone: tag.tone,
      type: tag.type,
    })),
  });
}

function compactSpeedOrder(order) {
  return stable({
    firstMover: order.firstMover ? {
      name: order.firstMover.name,
      side: order.firstMover.side,
      effectiveSpeed: order.firstMover.effectiveSpeed,
      maxPriority: order.firstMover.maxPriority,
      cause: order.firstMover.cause,
    } : null,
    entries: (order.entries || []).map((entry) => ({
      rank: entry.rank,
      side: entry.side,
      name: entry.name,
      rawSpeed: entry.rawSpeed,
      effectiveSpeed: entry.effectiveSpeed,
      maxPriority: entry.maxPriority,
      blockedPriorityReason: entry.blockedPriorityReason,
      cause: entry.cause,
      priorityWindows: entry.priorityWindows,
      modifiers: entry.modifiers,
    })),
    ties: order.ties || [],
  });
}

function compactPlans(model) {
  return stable({
    planCount: model?.plans?.length || 0,
    debug: {
      branchesExplored: model?.debug?.branchesExplored ?? model?.debug?.explored ?? null,
      pruned: model?.debug?.pruned ?? null,
      fallbackReason: model?.debug?.fallbackReason || null,
    },
    plans: (model?.plans || []).slice(0, 3).map((plan) => ({
      id: plan.id,
      headline: plan.headline,
      score: plan.score,
      confidence: plan.confidence,
      selfBring: plan.bring,
      selfLeadIndices: plan.selfLeadIndices,
      selfBackIndices: plan.selfBackIndices,
      enemyBring: plan.predictedEnemyBring,
      enemyLeadIndices: plan.enemyLeadIndices,
      mainLine: (plan.mainLine?.actions || []).map((action) => ({
        actor: action.actor,
        move: action.move,
        target: action.target,
        priority: action.priority,
        effectClass: action.effectClass,
        damageRangeLabel: action.damageRangeLabel,
        outcomeKind: action.outcomeKind,
      })),
      why: plan.why,
      breakers: plan.breakers,
    })),
  });
}

async function main() {
  const harness = await createModuleHarness(rootDir);
  await harness.loadGameDB();
  await harness.loadEffectsRegistry();

  const { state, createInitialState } = await harness.importModule('core/state.js');
  const { setDebugMode } = await harness.importModule('utils/debug.js');
  const { fetchMoveInfo } = await harness.importModule('battle/moves.js');
  const { calculateSpeed } = await harness.importModule('battle/speed.js');
  const { estimateMoveDamage, bestAttack } = await harness.importModule('battle/damage.js');
  const { applyMoveResolutionEffects, applySwitchInEffects, recalculateActiveField } = await harness.importModule('battle/effects.js');
  const { evaluateKoConditions } = await harness.importModule('analysis/ko-conditions.js');
  const { buildSpeedOrder } = await harness.importModule('analysis/speed-order.js');
  const { scoreThreat, inferStrategies } = await harness.importModule('analysis/threats.js');
  await harness.importModule('battle/snapshot.js');
  const { buildTurnPlansSnapshot } = await harness.importModule('analysis/turn-plans-engine.js');
  setDebugMode(false);

  function resetState(field = {}) {
    const fresh = createInitialState();
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh);
    state.field = cloneField(field);
    state.moveTypeCache = {};
    harness.context.currentDamageCache = {};
    harness.context.comboBestAttackCache = {};
    harness.context.comboSpeedCache = {};
    harness.context.loggedMessages = new Set();
  }

  function hydrateMoves(...mons) {
    mons.flatMap((mon) => mon?.set?.moves || []).filter(Boolean).forEach((move) => fetchMoveInfo(move));
  }

  function moveCandidate(move) {
    const info = fetchMoveInfo(move) || {};
    return {
      move,
      type: info.type || 'normal',
      damageClass: info.damageClass || 'physical',
      power: info.power || 0,
      hits: info.hits || 1,
      isSpread: !!info.isSpread,
      priority: undefined,
    };
  }

  const cases = [];

  function addCase(id, status, run, note = '') {
    cases.push({ id, status, note, run });
  }

  addCase('architecture.mutation-points', CASE_STATUS.provisional, () => ({
    globalCaches: ['currentDamageCache', 'comboBestAttackCache', 'comboSpeedCache', 'loggedMessages'],
    appStateMutationRoots: ['state.field', 'state.self', 'state.enemy', 'state.turn1Battle', 'state.turnPlanEnemyOverride'],
    knownGlobalBridge: !!harness.context.EffectsRegistryBridge,
  }), 'Inventario ejecutable de caches y mutaciones globales que la Fase 0 congela.');

  addCase('speed.whimsicott-tailwind-resolution', CASE_STATUS.correct, () => {
    resetState();
    const whim = makeMon('whimsicott', { ability: 'Prankster', moves: ['Tailwind', 'Moonblast'], nature: 'Timid', evs: { spe: 252 }, side: 'self' });
    hydrateMoves(whim);
    const before = calculateSpeed(whim, 'self', state.field);
    applyMoveResolutionEffects(whim, { move: 'Tailwind', name: 'Tailwind' }, { silent: true });
    const after = calculateSpeed(whim, 'self', state.field);
    return { before, after, field: state.field };
  });

  addCase('speed.sand-rush-plus-tailwind', CASE_STATUS.correct, () => {
    resetState({ weather: 'sand', tailwindSelf: true, tailwindSelfTurns: 4 });
    const excadrill = makeMon('excadrill', { ability: 'Sand Rush', item: 'Focus Sash', moves: ['Earthquake', 'Iron Head'], nature: 'Jolly', evs: { spe: 252 }, side: 'self' });
    hydrateMoves(excadrill);
    return {
      speed: calculateSpeed(excadrill, 'self', state.field),
      speedOrder: compactSpeedOrder(buildSpeedOrder({ selfActive: [excadrill], enemyActive: [], field: state.field })),
    };
  });

  addCase('speed.trick-room-slow-sweeper-order', CASE_STATUS.correct, () => {
    resetState({ trickRoom: true, trickRoomTurns: 5 });
    const torkoal = makeMon('torkoal', { ability: 'Drought', moves: ['Eruption'], nature: 'Quiet', evs: { spa: 252 }, side: 'self' });
    const whimsicott = makeMon('whimsicott', { ability: 'Prankster', moves: ['Moonblast'], nature: 'Timid', evs: { spe: 252 }, side: 'enemy' });
    hydrateMoves(torkoal, whimsicott);
    return compactSpeedOrder(buildSpeedOrder({ selfActive: [torkoal], enemyActive: [whimsicott], field: state.field }));
  });

  addCase('priority.psychic-terrain-blocks-extremespeed', CASE_STATUS.correct, () => {
    resetState({ terrain: 'psychic', terrainTurns: 5 });
    const dragonite = makeMon('dragonite', { ability: 'Multiscale', moves: ['Extreme Speed'], side: 'self' });
    const indeedee = makeMon('indeedee', { ability: 'Psychic Surge', moves: ['Follow Me'], side: 'enemy' });
    hydrateMoves(dragonite, indeedee);
    return compactDamage(estimateMoveDamage(dragonite, indeedee, { ...moveCandidate('Extreme Speed'), priority: 2 }, state.field));
  });

  addCase('priority.ability-and-guard-blockers', CASE_STATUS.provisional, () => {
    resetState();
    const attacker = makeMon('azumarill', { ability: 'Huge Power', moves: ['Aqua Jet'], side: 'self' });
    const armorTail = makeMon('farigiraf', { ability: 'Armor Tail', moves: ['Hyper Voice'], side: 'enemy' });
    const dazzling = makeMon('bruxish', { ability: 'Dazzling', moves: ['Psychic Fangs'], side: 'enemy' });
    const queenly = makeMon('tsareena', { ability: 'Queenly Majesty', moves: ['Power Whip'], side: 'enemy' });
    hydrateMoves(attacker, armorTail, dazzling, queenly);
    const quickGuardField = cloneField({ quickGuardEnemy: true });
    return {
      armorTail: compactDamage(estimateMoveDamage(attacker, armorTail, { ...moveCandidate('Aqua Jet'), priority: 1 }, state.field)),
      dazzling: compactDamage(estimateMoveDamage(attacker, dazzling, { ...moveCandidate('Aqua Jet'), priority: 1 }, state.field)),
      queenlyMajesty: compactDamage(estimateMoveDamage(attacker, queenly, { ...moveCandidate('Aqua Jet'), priority: 1 }, state.field)),
      quickGuard: compactDamage(estimateMoveDamage(attacker, armorTail, { ...moveCandidate('Aqua Jet'), priority: 1 }, quickGuardField)),
    };
  }, 'Congela que algunos bloqueos dependen de registry/parches y otros son cobertura incompleta.');

  addCase('fakeout.inner-focus-and-covert-cloak', CASE_STATUS.correct, () => {
    resetState();
    const attacker = makeMon('raichu', { ability: 'Lightning Rod', moves: ['Fake Out'], side: 'self' });
    const innerFocus = makeMon('dragonite', { ability: 'Inner Focus', moves: ['Extreme Speed'], side: 'enemy' });
    const cloak = makeMon('dragonite', { ability: 'Multiscale', item: 'Covert Cloak', moves: ['Extreme Speed'], side: 'enemy' });
    hydrateMoves(attacker, innerFocus, cloak);
    return {
      innerFocusDamage: compactDamage(estimateMoveDamage(attacker, innerFocus, { ...moveCandidate('Fake Out'), priority: 3 }, state.field)),
      covertCloakDamage: compactDamage(estimateMoveDamage(attacker, cloak, { ...moveCandidate('Fake Out'), priority: 3 }, state.field)),
    };
  }, 'El daño de Fake Out se mantiene; el flinch ya se bloquea con Inner Focus/Shield Dust/Covert Cloak en ambos pipelines (blocksFlinch).');

  addCase('survival.focus-sash-full-vs-chip', CASE_STATUS.correct, () => {
    resetState();
    const attacker = makeMon('arcanine', { ability: 'Rock Head', moves: ['Head Smash'], side: 'self' });
    const fullSash = makeMon('whimsicott', { ability: 'Prankster', item: 'Focus Sash', moves: ['Tailwind'], hpPct: 100, side: 'enemy' });
    const chippedSash = makeMon('whimsicott', { ability: 'Prankster', item: 'Focus Sash', moves: ['Tailwind'], hpPct: 9, side: 'enemy' });
    const lethal = { move: 'Head Smash', type: 'rock', mult: 2, minPct: 100, maxPct: 100, ohkoProb: 100, ohko: true, blocked: false };
    return {
      fullHp: compactKo(evaluateKoConditions(attacker, fullSash, lethal, { field: state.field })),
      chipped: compactKo(evaluateKoConditions(attacker, chippedSash, lethal, { field: state.field })),
    };
  });

  addCase('damage.weather-ball-by-weather', CASE_STATUS.correct, () => {
    const attacker = makeMon('charizard', { ability: 'Drought', moves: ['Weather Ball'], evs: { spa: 252 }, side: 'self' });
    const target = makeMon('tyranitar', { ability: 'Sand Stream', moves: ['Rock Slide'], side: 'enemy' });
    hydrateMoves(attacker, target);
    return Object.fromEntries(['sun', 'rain', 'sand', 'snow', null].map((weather) => {
      resetState({ weather });
      return [weather || 'none', compactDamage(estimateMoveDamage(attacker, target, moveCandidate('Weather Ball'), state.field))];
    }));
  });

  addCase('damage.spread-and-absorption-cores', CASE_STATUS.provisional, () => {
    resetState();
    const excadrill = makeMon('excadrill', { ability: 'Sand Rush', moves: ['Earthquake'], side: 'self' });
    const rotom = makeMon('rotomWash', { ability: 'Levitate', moves: ['Hydro Pump'], side: 'self' });
    const raichu = makeMon('raichu', { ability: 'Lightning Rod', moves: ['Discharge'], side: 'enemy' });
    const gastrodon = makeMon('gastrodon', { ability: 'Storm Drain', moves: ['Surf'], side: 'enemy' });
    const tyranitar = makeMon('tyranitar', { ability: 'Sand Stream', moves: ['Rock Slide'], side: 'enemy' });
    hydrateMoves(excadrill, rotom, raichu, gastrodon, tyranitar);
    return {
      earthquakeIntoRotomAlly: compactDamage(estimateMoveDamage(excadrill, rotom, moveCandidate('Earthquake'), state.field)),
      earthquakeIntoTyranitarFoe: compactDamage(estimateMoveDamage(excadrill, tyranitar, moveCandidate('Earthquake'), state.field)),
      dischargeIntoLightningRod: compactDamage(estimateMoveDamage(rotom, raichu, moveCandidate('Discharge'), state.field)),
      surfIntoStormDrain: compactDamage(estimateMoveDamage(rotom, gastrodon, moveCandidate('Surf'), state.field)),
    };
  });

  addCase('switchin.intimidate-reactions', CASE_STATUS.gap, () => {
    resetState();
    const intimidate = makeMon('arcanineKanto', { ability: 'Intimidate', moves: ['Flare Blitz'], side: 'self' });
    const defiant = makeMon('kingambit', { ability: 'Defiant', moves: ['Kowtow Cleave'], side: 'enemy' });
    const competitive = makeMon('milotic', { ability: 'Competitive', moves: ['Surf'], side: 'enemy' });
    const clearBody = makeMon('metagross', { ability: 'Clear Body', moves: ['Meteor Mash'], side: 'enemy' });
    state.self = [intimidate, null, null, null, null, null];
    state.enemy = [defiant, competitive, clearBody, null, null, null];
    state.activeSelfSlots = [0];
    state.activeEnemySlots = [0, 1, 2];
    applySwitchInEffects(intimidate, 'self');
    return {
      defiantStages: defiant.battle.stages,
      competitiveStages: competitive.battle.stages,
      clearBodyStages: clearBody.battle.stages,
    };
  }, 'Congela el comportamiento actual; la Fase 3/4 deberá corregir timing y reacciones de stat drops.');

  addCase('field.move-resolution-screens-redirection-guards', CASE_STATUS.provisional, () => {
    resetState();
    const clefairy = makeMon('clefairy', { ability: 'Friend Guard', moves: ['Follow Me', 'Helping Hand', 'Protect'], side: 'self' });
    const ninetales = makeMon('whimsicott', { ability: 'Prankster', moves: ['Light Screen', 'Reflect', 'Quick Guard'], side: 'self' });
    hydrateMoves(clefairy, ninetales);
    applyMoveResolutionEffects(clefairy, { move: 'Follow Me', name: 'Follow Me' }, { silent: true });
    applyMoveResolutionEffects(ninetales, { move: 'Light Screen', name: 'Light Screen' }, { silent: true });
    applyMoveResolutionEffects(ninetales, { move: 'Reflect', name: 'Reflect' }, { silent: true });
    applyMoveResolutionEffects(ninetales, { move: 'Quick Guard', name: 'Quick Guard' }, { silent: true });
    return { field: state.field };
  });

  addCase('damage.variable-power-known-gaps', CASE_STATUS.gap, () => {
    resetState({ weather: 'sun' });
    const torkoalFull = makeMon('torkoal', { ability: 'Drought', moves: ['Eruption'], hpPct: 100, evs: { spa: 252 }, side: 'self' });
    const torkoalLow = makeMon('torkoal', { ability: 'Drought', moves: ['Eruption'], hpPct: 25, evs: { spa: 252 }, side: 'self' });
    const target = makeMon('kingambit', { ability: 'Defiant', moves: ['Sucker Punch'], side: 'enemy' });
    hydrateMoves(torkoalFull, torkoalLow, target);
    return {
      eruptionFullHp: compactDamage(estimateMoveDamage(torkoalFull, target, moveCandidate('Eruption'), state.field)),
      eruptionLowHp: compactDamage(estimateMoveDamage(torkoalLow, target, moveCandidate('Eruption'), state.field)),
    };
  }, 'Eruption se congela como gap: el motor actual no escala potencia por HP.');

  addCase('items.current-modifiers-and-known-gaps', CASE_STATUS.provisional, () => {
    resetState();
    const lifeOrbCharizard = makeMon('charizard', { ability: 'Drought', item: 'Life Orb', moves: ['Heat Wave'], evs: { spa: 252 }, side: 'self' });
    const assaultVestTyranitar = makeMon('tyranitar', { ability: 'Sand Stream', item: 'Assault Vest', moves: ['Rock Slide'], side: 'enemy' });
    const balloonHeatranLike = makeMon('metagross', { ability: 'Clear Body', item: 'Air Balloon', moves: ['Meteor Mash'], side: 'enemy' });
    const excadrill = makeMon('excadrill', { ability: 'Sand Rush', moves: ['Earthquake'], side: 'self' });
    hydrateMoves(lifeOrbCharizard, assaultVestTyranitar, balloonHeatranLike, excadrill);
    return {
      lifeOrbIntoAssaultVest: compactDamage(estimateMoveDamage(lifeOrbCharizard, assaultVestTyranitar, moveCandidate('Heat Wave'), state.field)),
      airBalloonGroundImmunity: compactDamage(estimateMoveDamage(excadrill, balloonHeatranLike, moveCandidate('Earthquake'), state.field)),
      unsupportedStillTracked: ['berries', 'seeds', 'choice lock lifecycle'],
    };
  });

  addCase('quick.findings-threats-and-strategies', CASE_STATUS.provisional, () => {
    resetState({ weather: 'sun' });
    const selfTeam = [
      makeMon('arcanine', { ability: 'Rock Head', moves: ['Head Smash'], side: 'self' }),
      makeMon('azumarill', { ability: 'Huge Power', moves: ['Aqua Jet', 'Play Rough'], side: 'self' }),
      makeMon('farigiraf', { ability: 'Armor Tail', moves: ['Trick Room', 'Hyper Voice'], side: 'self' }),
    ];
    const enemyTeam = [
      makeMon('whimsicott', { ability: 'Prankster', moves: ['Tailwind', 'Moonblast'], side: 'enemy' }),
      makeMon('charizard', { ability: 'Drought', moves: ['Weather Ball', 'Solar Beam'], side: 'enemy' }),
      makeMon('torkoal', { ability: 'Drought', moves: ['Eruption'], side: 'enemy' }),
    ];
    hydrateMoves(...selfTeam, ...enemyTeam);
    return {
      enemyStrategies: inferStrategies(enemyTeam),
      topThreats: enemyTeam.map((mon) => ({ name: mon.displayName, threat: scoreThreat(mon, selfTeam) })),
    };
  });

  addCase('matrix.best-attack-contract', CASE_STATUS.provisional, () => {
    resetState({ weather: 'sun' });
    const attackers = [
      makeMon('arcanine', { ability: 'Rock Head', moves: ['Head Smash', 'Flare Blitz'], side: 'self' }),
      makeMon('azumarill', { ability: 'Huge Power', moves: ['Aqua Jet', 'Play Rough'], side: 'self' }),
    ];
    const defenders = [
      makeMon('charizard', { ability: 'Drought', moves: ['Weather Ball'], side: 'enemy' }),
      makeMon('tyranitar', { ability: 'Sand Stream', moves: ['Rock Slide'], side: 'enemy' }),
    ];
    hydrateMoves(...attackers, ...defenders);
    return attackers.map((attacker) => ({
      attacker: attacker.displayName,
      cells: defenders.map((defender) => ({
        defender: defender.displayName,
        best: compactAttack(bestAttack(attacker, defender, state.field)),
      })),
    }));
  });

  addCase('plans.top-three-contract', CASE_STATUS.provisional, () => {
    resetState({ weather: 'sand' });
    const selfTeam = [
      makeMon('excadrill', { ability: 'Sand Rush', item: 'Focus Sash', moves: ['High Horsepower', 'Iron Head', 'Protect'], side: 'self', nature: 'Jolly', evs: { atk: 252, spe: 252 } }),
      makeMon('tyranitar', { ability: 'Sand Stream', moves: ['Rock Slide', 'Crunch', 'Protect'], side: 'self' }),
      makeMon('arcanine', { ability: 'Rock Head', moves: ['Head Smash', 'Flare Blitz'], side: 'self' }),
      makeMon('azumarill', { ability: 'Huge Power', moves: ['Aqua Jet', 'Play Rough'], side: 'self' }),
    ];
    const enemyTeam = [
      makeMon('charizard', { ability: 'Drought', moves: ['Weather Ball', 'Solar Beam', 'Protect'], side: 'enemy' }),
      makeMon('whimsicott', { ability: 'Prankster', moves: ['Tailwind', 'Moonblast'], side: 'enemy' }),
      makeMon('farigiraf', { ability: 'Armor Tail', moves: ['Trick Room', 'Hyper Voice'], side: 'enemy' }),
      makeMon('kingambit', { ability: 'Defiant', moves: ['Sucker Punch', 'Iron Head'], side: 'enemy' }),
    ];
    hydrateMoves(...selfTeam, ...enemyTeam);
    const ownCombos = [{ indices: [0, 1, 2, 3], orderedIdx: [0, 1, 2, 3], leads: [0, 1], score: 100, planType: 'arena' }];
    const model = buildTurnPlansSnapshot({
      mode: 'quick',
      selfTeam,
      enemyTeam,
      field: state.field,
      ownCombos,
      topOwnCombos: 1,
      topEnemyCombos: 3,
      horizon: 2,
      enemyModel: 'meta-likely',
      beamWidth: 4,
      actionCapPerMon: 4,
      displayLimit: 3,
    });
    return compactPlans(model);
  });

  addCase('turn1.product-outcome-proxy', CASE_STATUS.provisional, () => {
    resetState({ weather: 'sand' });
    const excadrill = makeMon('excadrill', { ability: 'Sand Rush', moves: ['High Horsepower', 'Iron Head', 'Protect'], nature: 'Jolly', evs: { atk: 252, spe: 252 }, side: 'self' });
    const tyranitar = makeMon('tyranitar', { ability: 'Sand Stream', moves: ['Rock Slide', 'Protect'], side: 'self' });
    const charizard = makeMon('charizard', { ability: 'Drought', moves: ['Weather Ball', 'Solar Beam'], side: 'enemy' });
    const whimsicott = makeMon('whimsicott', { ability: 'Prankster', moves: ['Tailwind', 'Moonblast'], side: 'enemy' });
    hydrateMoves(excadrill, tyranitar, charizard, whimsicott);
    return {
      order: compactSpeedOrder(buildSpeedOrder({ selfActive: [excadrill, tyranitar], enemyActive: [charizard, whimsicott], field: state.field })),
      excadrillIntoCharizard: compactAttack(bestAttack(excadrill, charizard, state.field)),
      charizardIntoExcadrill: compactAttack(bestAttack(charizard, excadrill, state.field)),
    };
  }, 'Proxy estable del contrato del simulador de turno 1 sin importar app-core/DOM.');

  addCase('effects.recalculate-active-field-mutation-baseline', CASE_STATUS.gap, () => {
    resetState();
    const ttar = makeMon('tyranitar', { ability: 'Sand Stream', moves: ['Rock Slide'], side: 'self', stages: { atk: 2 } });
    const zard = makeMon('charizard', { ability: 'Drought', moves: ['Weather Ball'], side: 'enemy' });
    state.self = [ttar, null, null, null, null, null];
    state.enemy = [zard, null, null, null, null, null];
    state.activeSelfSlots = [0];
    state.activeEnemySlots = [0];
    recalculateActiveField();
    return {
      weather: state.field.weather,
      tyranitarStagesAfterRecalc: ttar.battle.stages,
      charizardStagesAfterRecalc: zard.battle.stages,
    };
  }, 'Congela la mutación heredada: recalcular activos borra stages.');

  const snapshot = {
    meta: {
      name: 'champions-meta battle baseline',
      generatedBy: 'tests/baseline/run-baseline.mjs',
      purpose: 'Congelar comportamiento actual antes de Fase 1+',
      statusLegend: CASE_STATUS,
    },
    cases: [],
  };

  for (const testCase of cases) {
    try {
      snapshot.cases.push(stable({
        id: testCase.id,
        status: testCase.status,
        note: testCase.note,
        output: testCase.run(),
      }));
    } catch (error) {
      snapshot.cases.push(stable({
        id: testCase.id,
        status: testCase.status,
        note: testCase.note,
        error: {
          message: error?.message || String(error),
          stack: String(error?.stack || '').split('\n').slice(0, 6),
        },
      }));
    }
  }

  const next = `${JSON.stringify(stable(snapshot), null, 2)}\n`;

  if (update) {
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, next, 'utf8');
    console.log(`Baseline snapshot actualizado: ${path.relative(rootDir, snapshotPath)}`);
    return;
  }

  let current = '';
  try {
    current = await readFile(snapshotPath, 'utf8');
  } catch {
    console.error('No existe snapshot baseline. Ejecuta: npm run test:baseline:update');
    process.exit(1);
  }

  if (current !== next) {
    console.error('Baseline snapshot cambió. Revisa el diff y, si el cambio es intencional, ejecuta: npm run test:baseline:update');
    process.exit(1);
  }

  console.log(`Baseline OK: ${snapshot.cases.length} casos congelados.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
