import { effectiveness } from '../utils/types.js';
import {
  canonicalizeTargetMode,
  getCanonicalMove,
  resolveCanonicalId,
  toCanonicalId,
} from '../data/canonical/dex.js';
import { natureMod, stageMultiplier } from './stats.js';
import {
  baseStatAt,
  damageRolls,
  dynamicBasePower,
  maxHpAt,
  terrainDamageMultiplier,
  weatherDamageMultiplier,
  weatherDefenseMultiplier,
} from './formulas.js';
import {
  cloneBattleSnapshot,
  createCandidateAction,
  hydrateBattleSnapshot,
} from './snapshot.js';
import { createExplainEvent, eventsToExplainEvents } from './explain.js';
import {
  ANTI_STAT_DROP_ABILITIES,
  FIELD_TERRAIN_MOVES,
  FIELD_WEATHER_MOVES,
  FAKE_OUT_MOVES,
  HELPING_HAND_MOVES,
  PIVOT_MOVES,
  POWDER_MOVES,
  PRANKSTER_ABILITIES,
  PRIORITY_DENIAL_ABILITIES,
  PROTECT_MOVES,
  QUICK_GUARD_MOVES,
  REDIRECTION_MOVES,
  SCREEN_MOVES,
  SUCKER_PUNCH_MOVES,
  TAILWIND_MOVES,
  TRICK_ROOM_MOVES,
  WIDE_GUARD_MOVES,
  blocksFlinch,
  blocksStatDrop,
  getChoiceDamageModifier,
  getChoiceSpeedModifier,
  getHealBerry,
  getResistBerryType,
  getStatusCureBerry,
  getSwitchInTerrain,
  getSwitchInWeather,
  getTerrainSeed,
  hasChoiceLockItem,
  isProtoQuarkAbility,
  isProtoQuarkFieldActive,
  isWeatherSpeedAbility,
} from './rule-registry.js';

export const ACTION_CORE_VERSION = 'action-core-v1';
export const DAMAGE_PIPELINE_VERSION = 'damage-pipeline-v1';

const SIDE_KEYS = ['self', 'enemy'];
const WEIGHT_FALLBACK_KG = {
  amoonguss: 10.5,
  arcanine: 155,
  arcaninehisui: 168,
  azumarill: 28.5,
  charizard: 90.5,
  dragonite: 210,
  excadrill: 40.4,
  farigiraf: 160,
  hatterene: 5.1,
  indeedee: 28,
  kingambit: 120,
  milotic: 162,
  raichu: 30,
  rotomwash: 0.3,
  torkoal: 80.4,
  tyranitar: 202,
  whimsicott: 6.6,
};

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function slug(value) {
  return toCanonicalId(value || '');
}

function sideKey(side) {
  return SIDE_KEYS.includes(side) ? side : 'self';
}

function otherSide(side) {
  return sideKey(side) === 'self' ? 'enemy' : 'self';
}

function sideSuffix(side) {
  return sideKey(side) === 'self' ? 'Self' : 'Enemy';
}

function getSide(snapshot, side) {
  return snapshot?.sides?.[sideKey(side)] || null;
}

function getSlot(snapshot, side, slotIndex) {
  return getSide(snapshot, side)?.slots?.[Number(slotIndex)] || null;
}

function getPokemon(snapshot, side, slotIndex) {
  return getSlot(snapshot, side, slotIndex)?.pokemon || null;
}

function isAlive(pokemon) {
  return !!pokemon && !pokemon.fainted && (pokemon.hpPct ?? 0) > 0;
}

function activeSlots(snapshot, side) {
  const sideState = getSide(snapshot, side);
  return (sideState?.activeSlots || [])
    .map(Number)
    .filter((slotIndex) => isAlive(getPokemon(snapshot, side, slotIndex)));
}

function activePokemonRefs(snapshot, side) {
  return activeSlots(snapshot, side).map((slotIndex) => ({
    side: sideKey(side),
    slot: slotIndex,
    slotIndex,
    pokemon: getPokemon(snapshot, side, slotIndex),
  }));
}

function benchedPokemonRefs(snapshot, side) {
  const active = new Set(getSide(snapshot, side)?.activeSlots || []);
  return (getSide(snapshot, side)?.slots || [])
    .filter((slot) => !slot.empty && !active.has(slot.index) && isAlive(slot.pokemon))
    .map((slot) => ({
      side: sideKey(side),
      slot: slot.index,
      slotIndex: slot.index,
      pokemon: slot.pokemon,
    }));
}

function displayName(pokemon) {
  return pokemon?.displayName || pokemon?.speciesId || 'Pokemon';
}

function abilityId(pokemon) {
  if (pokemon?.abilityState?.suppressed) return '';
  return pokemon?.set?.abilityId || slug(pokemon?.set?.ability || '');
}

function itemId(pokemon) {
  return pokemon?.itemState?.consumed ? '' : (pokemon?.set?.itemId || slug(pokemon?.set?.item || ''));
}

function consumeItem(pokemon, events, reason = 'consumed') {
  if (!pokemon) return;
  const item = itemId(pokemon);
  if (!item) return;
  pokemon.itemState = pokemon.itemState || {};
  pokemon.itemState.consumed = true;
  events?.push?.({
    kind: 'item',
    side: pokemon.side,
    actor: displayName(pokemon),
    item,
    reason,
  });
}

function adjustStage(pokemon, stat, delta, events, reason = 'stage-change') {
  if (!pokemon || !stat || !Number.isFinite(Number(delta))) return;
  pokemon.stages = pokemon.stages || {};
  const before = Number(pokemon.stages[stat] || 0);
  const after = Math.max(-6, Math.min(6, before + Number(delta)));
  pokemon.stages[stat] = after;
  if (after !== before) {
    events?.push?.({
      kind: 'stage',
      side: pokemon.side,
      actor: displayName(pokemon),
      stat,
      delta: after - before,
      stage: after,
      reason,
    });
  }
}

function activeBoosterStat(pokemon) {
  return pokemon?.volatiles?.boosterStat || null;
}

function moveEntry(actionOrMove) {
  const moveId = typeof actionOrMove === 'string'
    ? resolveCanonicalId('moves', actionOrMove) || slug(actionOrMove)
    : actionOrMove?.moveId || resolveCanonicalId('moves', actionOrMove?.moveName) || slug(actionOrMove?.moveName || '');
  return moveId ? getCanonicalMove(moveId) : null;
}

function normalizeMoveTarget(move) {
  return canonicalizeTargetMode(move?.targetMode || move?.target || 'normal');
}

function isStatusMove(move) {
  return (move?.category || move?.damageClass) === 'status' || (move?.basePower || 0) <= 0 && move?.category === 'status';
}

function actionMove(action) {
  return moveEntry(action) || {
    id: action?.moveId || slug(action?.moveName || ''),
    name: action?.moveName || action?.moveId || '',
    displayName: action?.moveName || action?.moveId || '',
    type: 'normal',
    category: 'status',
    basePower: 0,
    priority: 0,
    targetMode: action?.targetMode || 'normal',
    flags: {},
  };
}

function targetModeToEffectClass(move, kind = 'move') {
  const id = slug(move?.id || move?.name || '');
  if (kind === 'switch') return 'switch';
  if (PROTECT_MOVES.has(id)) return 'protect';
  if (QUICK_GUARD_MOVES.has(id)) return 'quick-guard';
  if (WIDE_GUARD_MOVES.has(id)) return 'wide-guard';
  if (REDIRECTION_MOVES.has(id)) return 'redirection';
  if (HELPING_HAND_MOVES.has(id)) return 'helping-hand';
  if (TAILWIND_MOVES.has(id) || TRICK_ROOM_MOVES.has(id)) return 'speed-control';
  if (SCREEN_MOVES.has(id) || FIELD_WEATHER_MOVES.has(id) || FIELD_TERRAIN_MOVES.has(id)) return 'field-control';
  if (PIVOT_MOVES.has(id)) return 'pivot-damage';
  if ((move?.basePower || 0) > 0) return move?.isSpread ? 'spread-damage' : 'damage';
  return 'support';
}

function canMoveTargetAlly(move) {
  const mode = normalizeMoveTarget(move);
  return mode === 'adjacentAlly' || mode === 'adjacentAllyOrSelf';
}

function targetChoicesForMove(snapshot, side, userSlot, move) {
  const mode = normalizeMoveTarget(move);
  const foe = otherSide(side);
  const ownActives = activeSlots(snapshot, side);
  const foeActives = activeSlots(snapshot, foe);
  const choices = [];

  if (mode === 'self') return [{ targetSide: side, targetSlot: userSlot, targetMode: mode }];
  if (mode === 'adjacentAlly') {
    return ownActives
      .filter((slot) => slot !== userSlot)
      .map((slot) => ({ targetSide: side, targetSlot: slot, targetMode: mode }));
  }
  if (mode === 'adjacentAllyOrSelf') {
    return ownActives.map((slot) => ({ targetSide: side, targetSlot: slot, targetMode: mode }));
  }
  if (mode === 'allySide') return [{ targetSide: side, targetSlot: null, targetMode: mode }];
  if (mode === 'foeSide') return [{ targetSide: foe, targetSlot: null, targetMode: mode }];
  if (mode === 'field') return [{ targetSide: null, targetSlot: null, targetMode: mode }];
  if (mode === 'allAdjacent' || mode === 'allAdjacentFoes' || mode === 'all' || mode === 'scripted') {
    return [{ targetSide: mode === 'allAdjacent' || mode === 'allAdjacentFoes' ? foe : null, targetSlot: null, targetMode: mode }];
  }
  if (mode === 'randomNormal') {
    return foeActives.map((slot) => ({ targetSide: foe, targetSlot: slot, targetMode: mode }));
  }

  foeActives.forEach((slot) => choices.push({ targetSide: foe, targetSlot: slot, targetMode: 'normal' }));
  return choices;
}

function canUseMove(pokemon, move, snapshot) {
  if (!isAlive(pokemon)) return 'debilitado';
  const moveId = slug(move?.id || move?.name || '');
  const volatile = pokemon.volatiles || {};
  if (volatile.flinched) return 'retroceso';
  if (volatile.taunted && isStatusMove(move)) return 'mofa';
  if (volatile.encoredMove && volatile.encoreTurns > 0 && slug(volatile.encoredMove) !== moveId) return `encore:${volatile.encoredMove}`;
  if (volatile.choiceLocked && slug(volatile.choiceLocked) !== moveId) return `choice-lock:${volatile.choiceLocked}`;
  if (itemId(pokemon) === 'assaultvest' && isStatusMove(move)) return 'chaleco asalto';
  if (FAKE_OUT_MOVES.has(moveId) && snapshot.turn > 1 && !volatile.enteredThisTurn) return 'fake out fuera de turno';
  return null;
}

export function generateLegalActions(snapshot, side = 'self', slotIndex = 0, options = {}) {
  const sideName = sideKey(side);
  const slot = getSlot(snapshot, sideName, slotIndex);
  const pokemon = slot?.pokemon;
  if (!slot || !slot.active || !isAlive(pokemon)) return [];

  const actions = [];
  for (const setMove of pokemon.set?.moves || []) {
    const move = getCanonicalMove(setMove.id || setMove.name) || setMove;
    const failReason = canUseMove(pokemon, move, snapshot);
    for (const choice of targetChoicesForMove(snapshot, sideName, slotIndex, move)) {
      const priority = resolvePriority({
        side: sideName,
        userSlot: slotIndex,
        kind: 'move',
        moveId: move.id,
        moveName: setMove.name || move.displayName || move.name,
      }, snapshot);
      actions.push(createCandidateAction({
        id: `${sideName}:${slotIndex}:move:${move.id}:${choice.targetSide ?? 'field'}:${choice.targetSlot ?? choice.targetMode}`,
        side: sideName,
        userSlot: slotIndex,
        kind: 'move',
        move: move.id,
        targetSide: choice.targetSide,
        targetSlot: choice.targetSlot,
        targetMode: choice.targetMode,
        priority,
        effectClass: targetModeToEffectClass(move),
        flags: {
          legal: !failReason,
          isSpread: !!move.isSpread || ['allAdjacent', 'allAdjacentFoes', 'all'].includes(choice.targetMode),
          isPivot: PIVOT_MOVES.has(move.id),
          isGuard: QUICK_GUARD_MOVES.has(move.id) || WIDE_GUARD_MOVES.has(move.id),
          isRedirection: REDIRECTION_MOVES.has(move.id),
        },
        data: {
          moveType: move.type || null,
          category: move.category || null,
          basePower: move.basePower || 0,
          canFailReason: failReason,
        },
      }));
    }
  }

  if (options.includeSwitches !== false) {
    for (const bench of benchedPokemonRefs(snapshot, sideName)) {
      actions.push(createCandidateAction({
        id: `${sideName}:${slotIndex}:switch:${bench.slot}`,
        side: sideName,
        userSlot: slotIndex,
        kind: 'switch',
        targetSide: sideName,
        targetSlot: bench.slot,
        targetMode: 'switch',
        priority: 6,
        effectClass: 'switch',
        flags: { legal: true },
        data: { switchInSlot: bench.slot, switchInName: displayName(bench.pokemon) },
      }));
    }
  }

  return actions;
}

export function isGrounded(pokemon, snapshot = null) {
  if (!pokemon) return false;
  if (pokemon.flags?.grounded !== null && pokemon.flags?.grounded !== undefined) return !!pokemon.flags.grounded;
  if (snapshot?.field?.globalConditions?.gravity) return true;
  if (itemId(pokemon) === 'ironball') return true;
  if ((pokemon.types || []).includes('flying')) return false;
  if (abilityId(pokemon) === 'levitate') return false;
  if (itemId(pokemon) === 'airballoon') return false;
  return true;
}

export function resolvePriority(action, snapshot) {
  if (!action) return 0;
  if (action.kind === 'switch') return 6;
  const user = getPokemon(snapshot, action.side, action.userSlot);
  const move = actionMove(action);
  let priority = Number.isFinite(move?.priority) ? move.priority : 0;
  const moveId = slug(move?.id || action.moveId || action.moveName || '');
  if (PRANKSTER_ABILITIES.has(abilityId(user)) && isStatusMove(move)) priority += 1;
  if (abilityId(user) === 'galewings' && move?.type === 'flying' && (user?.hpPct ?? 0) >= 100) priority += 1;
  if (abilityId(user) === 'triage' && (move?.flags?.heal || move?.heal || move?.drain)) priority += 3;
  if (SuckerPunchCondition(action, snapshot)) priority = Math.max(priority, 1);
  return priority;
}

function SuckerPunchCondition(action) {
  return SUCKER_PUNCH_MOVES.has(slug(action?.moveId || action?.moveName || ''));
}

function effectiveSpeed(pokemon, side, snapshot) {
  if (!pokemon) return 0;
  const ev = pokemon.set?.evs || {};
  const iv = pokemon.set?.ivs || {};
  const base = pokemon.baseStats?.spe || pokemon.baseStats?.speed || 80;
  let speed = Math.floor(((2 * base + (iv.spe ?? 31) + Math.floor((ev.spe || 0) / 4)) * (pokemon.set?.level || 50)) / 100) + 5;
  speed = Math.floor(speed * natureMod(pokemon.set?.nature || '', 'spe'));
  speed = Math.floor(speed * stageMultiplier(pokemon.stages?.spe || 0));
  const ability = abilityId(pokemon);
  const item = itemId(pokemon);
  const weather = snapshot.field?.weather;
  const sideConditions = getSide(snapshot, side)?.sideConditions || {};
  if (sideConditions.tailwind) speed *= 2;
  if (isWeatherSpeedAbility(ability, weather)) speed *= 2;
  speed *= getChoiceSpeedModifier(item);
  if (activeBoosterStat(pokemon) === 'spe') speed *= 1.5;
  if (item === 'ironball') speed *= 0.5;
  if (pokemon.status === 'par') speed *= 0.5;
  return Math.floor(speed);
}

export function resolveActionOrder(snapshot, actions = []) {
  const decorated = (actions || []).filter(Boolean).map((action, inputIndex) => {
    const user = getPokemon(snapshot, action.side, action.userSlot);
    return {
      action,
      inputIndex,
      priority: resolvePriority(action, snapshot),
      speed: effectiveSpeed(user, action.side, snapshot),
      actor: displayName(user),
    };
  });
  decorated.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.speed !== b.speed) {
      return snapshot.field?.trickRoom ? a.speed - b.speed : b.speed - a.speed;
    }
    return a.inputIndex - b.inputIndex;
  });
  return decorated.map((entry, index, arr) => ({
    ...entry,
    order: index + 1,
    speedTie: arr.some((other, otherIndex) => otherIndex !== index && other.priority === entry.priority && other.speed === entry.speed),
  }));
}

function sideHasPriorityDenial(snapshot, side) {
  return activePokemonRefs(snapshot, side).some(({ pokemon }) => PRIORITY_DENIAL_ABILITIES.has(abilityId(pokemon)));
}

function redirectionSlot(snapshot, targetSide) {
  const side = getSide(snapshot, targetSide);
  const value = side?.sideConditions?.redirection;
  if (value == null) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && isAlive(getPokemon(snapshot, targetSide, numeric))) return numeric;
  const named = activePokemonRefs(snapshot, targetSide).find(({ pokemon }) => {
    const names = [pokemon.speciesId, pokemon.displayName, pokemon.sourceRef?.appName].map(slug);
    return names.includes(slug(value));
  });
  return named?.slot ?? null;
}

function shouldRedirect(action, snapshot, targetSide) {
  const move = actionMove(action);
  const mode = canonicalizeTargetMode(action.targetMode || move.targetMode || move.target || 'normal');
  if (mode !== 'normal' && mode !== 'randomNormal') return false;
  if (targetSide === action.side) return false;
  if (['stalwart', 'propellertail'].includes(abilityId(getPokemon(snapshot, action.side, action.userSlot)))) return false;
  return redirectionSlot(snapshot, targetSide) != null;
}

export function resolveTargets(action, snapshot) {
  if (!action || action.kind !== 'move') return [];
  const side = sideKey(action.side);
  const foe = otherSide(side);
  const move = actionMove(action);
  const mode = canonicalizeTargetMode(action.targetMode || move.targetMode || move.target || 'normal');
  const refs = [];
  const pushRef = (targetSide, targetSlot, redirected = false) => {
    const pokemon = getPokemon(snapshot, targetSide, targetSlot);
    refs.push({
      side: targetSide,
      slot: targetSlot,
      slotIndex: targetSlot,
      pokemon,
      redirected,
    });
  };

  if (mode === 'self') pushRef(side, action.userSlot, false);
  else if (mode === 'adjacentAlly') {
    if (Number.isFinite(Number(action.targetSlot))) pushRef(side, Number(action.targetSlot), false);
  } else if (mode === 'adjacentAllyOrSelf') {
    pushRef(side, Number.isFinite(Number(action.targetSlot)) ? Number(action.targetSlot) : action.userSlot, false);
  } else if (mode === 'allAdjacentFoes') {
    activeSlots(snapshot, foe).forEach((slot) => pushRef(foe, slot, false));
  } else if (mode === 'allAdjacent') {
    activeSlots(snapshot, foe).forEach((slot) => pushRef(foe, slot, false));
    activeSlots(snapshot, side).filter((slot) => slot !== action.userSlot).forEach((slot) => pushRef(side, slot, false));
  } else if (mode === 'all') {
    activeSlots(snapshot, foe).forEach((slot) => pushRef(foe, slot, false));
    activeSlots(snapshot, side).forEach((slot) => pushRef(side, slot, false));
  } else if (mode === 'allySide' || mode === 'foeSide' || mode === 'field' || mode === 'scripted') {
    return [];
  } else {
    const targetSide = action.targetSide || foe;
    const redirectedSlot = shouldRedirect(action, snapshot, targetSide) ? redirectionSlot(snapshot, targetSide) : null;
    pushRef(targetSide, redirectedSlot ?? Number(action.targetSlot), redirectedSlot != null);
  }

  return refs.filter((ref) => Number.isFinite(ref.slot));
}

function isPriorityBlocked(action, targetRef, snapshot) {
  const move = actionMove(action);
  const priority = resolvePriority(action, snapshot);
  if (priority <= 0 || targetRef.side === action.side) return null;
  if (snapshot.field?.terrain === 'psychic' && isGrounded(targetRef.pokemon, snapshot)) return 'Campo Psiquico';
  if (getSide(snapshot, targetRef.side)?.sideConditions?.quickGuard) return 'Quick Guard';
  if (sideHasPriorityDenial(snapshot, targetRef.side)) return 'bloqueo de prioridad';
  if (PRANKSTER_ABILITIES.has(abilityId(getPokemon(snapshot, action.side, action.userSlot))) && isStatusMove(move)) {
    if ((targetRef.pokemon?.types || []).includes('dark')) return 'Siniestro bloquea Bromista';
  }
  return null;
}

function getTargetBlock(action, targetRef, snapshot) {
  if (!isAlive(targetRef?.pokemon)) return 'objetivo no disponible';
  const move = actionMove(action);
  const priorityBlock = isPriorityBlocked(action, targetRef, snapshot);
  if (priorityBlock) return priorityBlock;
  if (targetRef.side !== action.side && targetRef.pokemon?.volatiles?.protected && !move.bypassProtect) return targetRef.pokemon.volatiles.protectedBy || 'Proteccion';
  if (getSide(snapshot, targetRef.side)?.sideConditions?.wideGuard && (move.isSpread || ['allAdjacent', 'allAdjacentFoes', 'all'].includes(action.targetMode))) return 'Wide Guard';
  return null;
}

function maxHp(pokemon) {
  return maxHpAt({
    base: pokemon?.baseStats?.hp || 80,
    ev: pokemon?.set?.evs?.hp || 0,
    iv: pokemon?.set?.ivs?.hp ?? 31,
    level: pokemon?.set?.level || 50,
  });
}

function currentHp(pokemon) {
  return Math.max(0, Math.floor(maxHp(pokemon) * ((pokemon?.hpPct ?? 100) / 100)));
}

function statValue(pokemon, stat) {
  const stage = pokemon?.stages?.[stat] || 0;
  const inner = baseStatAt({
    base: pokemon?.baseStats?.[stat] || 80,
    ev: pokemon?.set?.evs?.[stat] || 0,
    iv: pokemon?.set?.ivs?.[stat] ?? 31,
    level: pokemon?.set?.level || 50,
  });
  let value = Math.max(1, Math.floor(Math.floor(inner * natureMod(pokemon?.set?.nature || '', stat)) * stageMultiplier(stage)));
  if (activeBoosterStat(pokemon) === stat) value = Math.floor(value * (stat === 'spe' ? 1.5 : 1.3));
  return value;
}

function pokemonWeight(pokemon) {
  return Number(
    pokemon?.weightKg
    ?? pokemon?.weightkg
    ?? pokemon?.weight
    ?? WEIGHT_FALLBACK_KG[slug(pokemon?.speciesId || pokemon?.displayName)]
    ?? 80,
  );
}

function weightBasePower(weightKg) {
  if (weightKg >= 200) return 120;
  if (weightKg >= 100) return 100;
  if (weightKg >= 50) return 80;
  if (weightKg >= 25) return 60;
  if (weightKg >= 10) return 40;
  return 20;
}

function heavySlamBasePower(attacker, defender) {
  const ratio = pokemonWeight(attacker) / Math.max(0.1, pokemonWeight(defender));
  if (ratio >= 5) return 120;
  if (ratio >= 4) return 100;
  if (ratio >= 3) return 80;
  if (ratio >= 2) return 60;
  return 40;
}

function electroBallBasePower(attacker, defender, snapshot) {
  const ratio = effectiveSpeed(attacker, attacker?.side || 'self', snapshot) / Math.max(1, effectiveSpeed(defender, defender?.side || otherSide(attacker?.side || 'self'), snapshot));
  if (ratio >= 4) return 150;
  if (ratio >= 3) return 120;
  if (ratio >= 2) return 80;
  if (ratio >= 1) return 60;
  return 40;
}

function positiveBoostCount(pokemon) {
  return Object.values(pokemon?.stages || {}).reduce((acc, value) => acc + Math.max(0, Number(value || 0)), 0);
}

function resolveMoveTypeAndPower(move, attacker, defender, snapshot) {
  let type = move.type || 'normal';
  let basePower = move.basePower || move.power || 0;
  const moveId = slug(move.id || move.name);
  if (moveId === 'weatherball' && snapshot.field?.weather) {
    basePower = 100;
    if (snapshot.field.weather === 'sun') type = 'fire';
    else if (snapshot.field.weather === 'rain') type = 'water';
    else if (snapshot.field.weather === 'sand') type = 'rock';
    else if (snapshot.field.weather === 'snow' || snapshot.field.weather === 'hail') type = 'ice';
  }
  basePower = dynamicBasePower(moveId, basePower, {
    attackerHpPct: attacker?.hpPct,
    attackerHasItem: !!itemId(attacker),
    attackerHasStatus: !!attacker?.status,
    defenderHasStatus: !!defender?.status,
    attackerPositiveBoosts: positiveBoostCount(attacker),
    timesHit: attacker?.volatiles?.rageFistHits,
    faintedAllies: snapshot?.meta?.faintedAllies?.[attacker?.side] ?? attacker?.volatiles?.faintedAllies,
  });
  if (moveId === 'gyroball') basePower = Math.min(150, Math.max(1, Math.floor((25 * effectiveSpeed(defender, defender?.side || otherSide(attacker?.side || 'self'), snapshot)) / Math.max(1, effectiveSpeed(attacker, attacker?.side || 'self', snapshot))) + 1));
  if (moveId === 'electroball') basePower = electroBallBasePower(attacker, defender, snapshot);
  if (moveId === 'lowkick' || moveId === 'grassknot') basePower = weightBasePower(pokemonWeight(defender));
  if (moveId === 'heavyslam' || moveId === 'heatcrash') basePower = heavySlamBasePower(attacker, defender);
  return { type, basePower };
}

function abilityImmunity(moveType, move, defender) {
  const ability = abilityId(defender);
  if (moveType === 'water' && ['waterabsorb', 'stormdrain', 'dryskin'].includes(ability)) return defender.set?.ability || ability;
  if (moveType === 'fire' && ['flashfire', 'wellbakedbody'].includes(ability)) return defender.set?.ability || ability;
  if (moveType === 'electric' && ['voltabsorb', 'motordrive', 'lightningrod'].includes(ability)) return defender.set?.ability || ability;
  if (moveType === 'grass' && ability === 'sapsipper') return defender.set?.ability || ability;
  if (moveType === 'ground' && ability === 'eartheater') return defender.set?.ability || ability;
  if ((move?.flags?.powder || POWDER_MOVES.has(slug(move.id || move.name))) && (ability === 'overcoat' || (defender.types || []).includes('grass'))) return defender.set?.ability || 'Tipo Planta';
  return null;
}

function itemImmunity(moveType, move, defender) {
  const item = itemId(defender);
  if (moveType === 'ground' && item === 'airballoon') return defender.set?.item || item;
  if ((move?.flags?.powder || POWDER_MOVES.has(slug(move.id || move.name))) && item === 'safetygoggles') return defender.set?.item || item;
  return null;
}

function typeImmunity(moveType, move, defender, snapshot) {
  if (move?.ignoreImmunity) return null;
  if (moveType === 'ground' && !isGrounded(defender, snapshot)) return 'no esta en tierra';
  const mult = effectiveness(moveType, defender?.types || []);
  return mult === 0 ? 'inmunidad de tipo' : null;
}

function weatherModifier(type, snapshot) {
  return weatherDamageMultiplier(type, snapshot.field?.weather);
}

function terrainModifier(type, move, attacker, defender, snapshot) {
  return terrainDamageMultiplier(type, move.id || move.name, {
    terrain: snapshot.field?.terrain,
    attackerGrounded: isGrounded(attacker, snapshot),
    defenderGrounded: isGrounded(defender, snapshot),
  });
}

function screenModifier(category, targetSide, snapshot) {
  const side = getSide(snapshot, targetSide)?.sideConditions || {};
  if (side.auroraVeil) return 2 / 3;
  if (category === 'physical' && side.reflect) return 2 / 3;
  if (category === 'special' && side.lightScreen) return 2 / 3;
  return 1;
}

function allyAbilityModifier(targetSide, snapshot) {
  return activePokemonRefs(snapshot, targetSide)
    .some(({ pokemon }) => abilityId(pokemon) === 'friendguard')
    ? 0.75
    : 1;
}

function calculateRolls(baseDamage) {
  return damageRolls(baseDamage).rolls;
}

export function runDamagePipeline(snapshot, action, targetRef, options = {}) {
  const attacker = getPokemon(snapshot, action.side, action.userSlot);
  const defender = targetRef?.pokemon;
  const move = actionMove(action);
  const explainEvents = [];
  const trace = [];
  const pushTrace = (phase, data) => {
    const entry = { phase, ...data };
    trace.push(entry);
    explainEvents.push(createExplainEvent({
      code: `damage.${phase}`,
      severity: phase === 'blocked' ? 'warn' : 'info',
      layer: 'engine',
      side: action.side,
      actor: displayName(attacker),
      target: displayName(defender),
      sourceId: move.id,
      targetId: defender?.speciesId || null,
      message: data.reason || data.label || `${phase}: ${move.displayName || move.name}`,
      data,
    }));
  };

  const targetBlock = getTargetBlock(action, targetRef, snapshot);
  if (targetBlock) {
    pushTrace('blocked', { reason: targetBlock });
    return { blocked: true, blockReason: targetBlock, damage: 0, minDamage: 0, maxDamage: 0, rolls: [], trace, explainEvents };
  }

  if (!attacker || !defender || isStatusMove(move) || (move.basePower || 0) <= 0) {
    pushTrace('nonDamage', { label: 'movimiento sin dano directo' });
    return { blocked: false, damage: 0, minDamage: 0, maxDamage: 0, rolls: [], trace, explainEvents };
  }

  const { type, basePower } = resolveMoveTypeAndPower(move, attacker, defender, snapshot);
  pushTrace('basePower', { type, basePower });
  if (basePower <= 0) return { blocked: false, damage: 0, minDamage: 0, maxDamage: 0, rolls: [], trace, explainEvents };

  const immunity = abilityImmunity(type, move, defender) || itemImmunity(type, move, defender) || typeImmunity(type, move, defender, snapshot);
  if (immunity) {
    pushTrace('blocked', { reason: immunity, type });
    return { blocked: true, blockReason: immunity, damage: 0, minDamage: 0, maxDamage: 0, rolls: [], trace, explainEvents };
  }

  const category = move.category || 'physical';
  let attackStat = category === 'physical' ? statValue(attacker, 'atk') : statValue(attacker, 'spa');
  let defenseStat = category === 'physical' ? statValue(defender, 'def') : statValue(defender, 'spd');
  if (move.usesTargetAttack) attackStat = statValue(defender, 'atk');
  if (move.usesDefenseStat) defenseStat = statValue(defender, 'def');
  if (abilityId(attacker) === 'hugepower' || abilityId(attacker) === 'purepower') {
    if (category === 'physical') attackStat *= 2;
  }
  if (itemId(defender) === 'assaultvest' && category === 'special') defenseStat = Math.floor(defenseStat * 1.5);
  defenseStat = Math.floor(defenseStat * weatherDefenseMultiplier(category, snapshot.field?.weather, defender.types));
  pushTrace('stats', { category, attackStat, defenseStat });

  const level = attacker.set?.level || 50;
  const raw = Math.floor(Math.floor(Math.floor(((2 * level) / 5 + 2) * basePower * attackStat / Math.max(1, defenseStat)) / 50) + 2);
  const stab = (attacker.types || []).includes(type) ? 1.5 : 1;
  const typeEffectiveness = effectiveness(type, defender.types || []);
  const spread = (move.isSpread || ['allAdjacent', 'allAdjacentFoes', 'all'].includes(action.targetMode)) ? (move.spreadModifier || 0.75) : 1;
  const weather = weatherModifier(type, snapshot);
  const terrain = terrainModifier(type, move, attacker, defender, snapshot);
  const screen = screenModifier(category, targetRef.side, snapshot);
  const friendGuard = allyAbilityModifier(targetRef.side, snapshot);
  const helpingHand = attacker.volatiles?.helpingHand ? 1.5 : 1;
  const burn = category === 'physical' && attacker.status === 'brn' && abilityId(attacker) !== 'guts' ? 0.5 : 1;
  const attackerItem = itemId(attacker);
  const item = (attackerItem === 'lifeorb' ? 1.3 : 1) * getChoiceDamageModifier(attackerItem, category);
  const resistBerryType = getResistBerryType(itemId(defender));
  const resistBerry = resistBerryType && resistBerryType === type && typeEffectiveness > 1 ? 0.5 : 1;
  const finalModifier = stab * typeEffectiveness * spread * weather * terrain * screen * friendGuard * helpingHand * burn * item * resistBerry;
  pushTrace('modifiers', { stab, typeEffectiveness, spread, weather, terrain, screen, friendGuard, helpingHand, burn, item, resistBerry, finalModifier });

  const rolls = calculateRolls(raw * finalModifier);
  const minDamage = Math.min(...rolls);
  const maxDamage = Math.max(...rolls);
  const hp = currentHp(defender);
  const defenderMaxHp = maxHp(defender);
  const survival = resolveSurvival(defender, maxDamage, hp);
  pushTrace('rolls', {
    minDamage,
    maxDamage,
    minPct: Math.floor((minDamage / Math.max(1, hp)) * 100),
    maxPct: Math.floor((maxDamage / Math.max(1, hp)) * 100),
    survival,
  });

  return {
    blocked: false,
    damage: options.roll === 'min' ? minDamage : maxDamage,
    minDamage,
    maxDamage,
    rolls,
    type,
    category,
    basePower,
    typeEffectiveness,
    consumedDefensiveItem: resistBerry < 1 ? itemId(defender) : null,
    minPct: Math.min(100, Math.floor((minDamage / Math.max(1, hp)) * 100)),
    maxPct: Math.min(100, Math.floor((maxDamage / Math.max(1, hp)) * 100)),
    hpAfterMax: survival?.survives ? Math.floor((1 / defenderMaxHp) * 100) || 1 : Math.max(0, Math.floor(((hp - maxDamage) / defenderMaxHp) * 100)),
    survival,
    trace,
    explainEvents,
  };
}

function resolveSurvival(defender, damage, hp) {
  if (damage < hp || hp <= 0) return null;
  const fullHp = (defender?.hpPct ?? 100) >= 100;
  if (!fullHp) return null;
  const item = itemId(defender);
  const ability = abilityId(defender);
  if (item === 'focussash') return { survives: true, source: 'Focus Sash' };
  if (ability === 'sturdy') return { survives: true, source: 'Sturdy' };
  return null;
}

function applyHealingBerry(pokemon, events) {
  const berry = getHealBerry(itemId(pokemon));
  if (!berry || !isAlive(pokemon)) return false;
  const hp = currentHp(pokemon);
  const max = maxHp(pokemon);
  if (hp / Math.max(1, max) > berry.threshold) return false;
  const heal = berry.healFlat || Math.floor(max * berry.healFraction);
  const healedHp = Math.min(max, hp + heal);
  pokemon.hpPct = Math.max(1, Math.floor((healedHp / max) * 100));
  consumeItem(pokemon, events, 'healing-berry');
  events?.push?.({
    kind: 'heal',
    side: pokemon.side,
    actor: displayName(pokemon),
    hpPct: pokemon.hpPct,
    reason: 'berry',
  });
  return true;
}

function applyLifeOrbRecoil(pokemon, events) {
  if (!isAlive(pokemon)) return;
  const hp = currentHp(pokemon);
  const max = maxHp(pokemon);
  const recoil = Math.max(1, Math.floor(max / 10));
  const nextHp = Math.max(0, hp - recoil);
  pokemon.hpPct = Math.max(0, Math.floor((nextHp / max) * 100));
  pokemon.fainted = pokemon.hpPct <= 0;
  events?.push?.({
    kind: 'recoil',
    side: pokemon.side,
    actor: displayName(pokemon),
    hpPct: pokemon.hpPct,
    reason: 'Life Orb',
  });
}

export function estimateActionOutcome(snapshot, action, options = {}) {
  const targets = resolveTargets(action, snapshot);
  if (action.kind === 'switch') {
    return { action, targets: [], results: [], totalDamage: 0, explainEvents: [] };
  }
  const results = targets.map((target) => runDamagePipeline(snapshot, action, target, options));
  return {
    action,
    targets,
    results,
    totalDamage: results.reduce((acc, result) => acc + (result.damage || 0), 0),
    explainEvents: results.flatMap((result) => result.explainEvents || []),
  };
}

function makeMutableSnapshot(snapshot) {
  return clonePlain(cloneBattleSnapshot(snapshot));
}

function setSideCondition(snapshot, side, key, value) {
  const sideState = getSide(snapshot, side);
  if (!sideState) return;
  sideState.sideConditions[key] = value;
}

function setLegacyField(snapshot, key, value) {
  snapshot.field.legacy = snapshot.field.legacy || {};
  snapshot.field.legacy[key] = value;
}

function applySupport(action, snapshot, events) {
  const actor = getPokemon(snapshot, action.side, action.userSlot);
  const move = actionMove(action);
  const moveId = slug(move.id || move.name);
  const suffix = sideSuffix(action.side);
  if (PROTECT_MOVES.has(moveId)) {
    actor.volatiles.protected = true;
    actor.volatiles.protectedBy = move.displayName || move.name || 'Protect';
    events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, text: 'se protege' });
    return true;
  }
  if (QUICK_GUARD_MOVES.has(moveId)) {
    setSideCondition(snapshot, action.side, 'quickGuard', true);
    setLegacyField(snapshot, `quickGuard${suffix}`, true);
    events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, text: 'activa Quick Guard' });
    return true;
  }
  if (WIDE_GUARD_MOVES.has(moveId)) {
    setSideCondition(snapshot, action.side, 'wideGuard', true);
    setLegacyField(snapshot, `wideGuard${suffix}`, true);
    events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, text: 'activa Wide Guard' });
    return true;
  }
  if (REDIRECTION_MOVES.has(moveId)) {
    setSideCondition(snapshot, action.side, 'redirection', action.userSlot);
    setLegacyField(snapshot, `redirection${suffix}`, action.userSlot);
    events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, text: 'redirige ataques' });
    return true;
  }
  if (HELPING_HAND_MOVES.has(moveId)) {
    const target = Number.isFinite(Number(action.targetSlot)) ? getPokemon(snapshot, action.side, Number(action.targetSlot)) : null;
    if (target && target !== actor) {
      target.volatiles.helpingHand = true;
      events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, target: displayName(target), text: 'potencia al aliado' });
    }
    return true;
  }
  if (TAILWIND_MOVES.has(moveId)) {
    setSideCondition(snapshot, action.side, 'tailwind', true);
    setSideCondition(snapshot, action.side, 'tailwindTurns', 4);
    setLegacyField(snapshot, `tailwind${suffix}`, true);
    setLegacyField(snapshot, `tailwind${suffix}Turns`, 4);
    events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, text: 'activa Tailwind' });
    return true;
  }
  if (TRICK_ROOM_MOVES.has(moveId)) {
    snapshot.field.trickRoom = !snapshot.field.trickRoom;
    snapshot.field.trickRoomTurns = snapshot.field.trickRoom ? 5 : 0;
    setLegacyField(snapshot, 'trickRoom', snapshot.field.trickRoom);
    setLegacyField(snapshot, 'trickRoomTurns', snapshot.field.trickRoomTurns);
    events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, text: 'altera Trick Room' });
    return true;
  }
  if (SCREEN_MOVES.has(moveId)) {
    const screenKey = moveId === 'reflect' ? 'reflect' : moveId === 'lightscreen' ? 'lightScreen' : 'auroraVeil';
    setSideCondition(snapshot, action.side, screenKey, true);
    setSideCondition(snapshot, action.side, `${screenKey}Turns`, 5);
    setLegacyField(snapshot, `${screenKey}${suffix}`, true);
    setLegacyField(snapshot, `${screenKey}${suffix}Turns`, 5);
    events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, text: 'levanta pantalla' });
    return true;
  }
  if (FIELD_WEATHER_MOVES.has(moveId)) {
    snapshot.field.weather = FIELD_WEATHER_MOVES.get(moveId);
    snapshot.field.weatherTurns = 5;
    setLegacyField(snapshot, 'weather', snapshot.field.weather);
    setLegacyField(snapshot, 'weatherTurns', 5);
    events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, text: 'cambia el clima' });
    return true;
  }
  if (FIELD_TERRAIN_MOVES.has(moveId)) {
    snapshot.field.terrain = FIELD_TERRAIN_MOVES.get(moveId);
    snapshot.field.terrainTurns = 5;
    setLegacyField(snapshot, 'terrain', snapshot.field.terrain);
    setLegacyField(snapshot, 'terrainTurns', 5);
    events.push({ kind: 'support', actor: displayName(actor), side: action.side, move: move.displayName || move.name, text: 'cambia el terreno' });
    return true;
  }
  return false;
}

function applySideEffects(action, targetRef, snapshot, events) {
  const attacker = getPokemon(snapshot, action.side, action.userSlot);
  const defender = targetRef?.pokemon;
  const move = actionMove(action);
  const moveId = slug(move.id || move.name);
  if (!isAlive(defender)) return;
  if (FAKE_OUT_MOVES.has(moveId)) {
    if (blocksFlinch(abilityId(defender), itemId(defender))) {
      events.push({ kind: 'blocked', side: action.side, actor: displayName(attacker), target: displayName(defender), move: move.displayName || move.name, reason: 'bloqueo de retroceso' });
    } else {
      defender.volatiles.flinched = true;
      defender.volatiles.flinchedBy = displayName(attacker);
      events.push({ kind: 'effect', side: action.side, actor: displayName(attacker), target: displayName(defender), move: move.displayName || move.name, text: 'retrocede' });
    }
  }
  if (move.status && !defender.status) {
    const cureBerry = getStatusCureBerry(itemId(defender), move.status);
    if (cureBerry) {
      consumeItem(defender, events, `cure:${move.status}`);
      events.push({ kind: 'blocked', side: action.side, actor: displayName(attacker), target: displayName(defender), move: move.displayName || move.name, reason: 'baya cura estado' });
    } else {
      defender.status = move.status;
      events.push({ kind: 'effect', side: action.side, actor: displayName(attacker), target: displayName(defender), move: move.displayName || move.name, text: `estado ${move.status}` });
    }
  }
  if (move.boosts && targetRef.side !== action.side) {
    defender.stages = defender.stages || {};
    Object.entries(move.boosts).forEach(([stat, delta]) => {
      defender.stages[stat] = Math.max(-6, Math.min(6, (defender.stages[stat] || 0) + Number(delta || 0)));
    });
  }
}

function applyDamageResult(snapshot, action, targetRef, result, events) {
  const attacker = getPokemon(snapshot, action.side, action.userSlot);
  const defender = targetRef?.pokemon;
  const move = actionMove(action);
  if (!defender) return;
  if (result.blocked) {
    events.push({
      kind: 'blocked',
      side: action.side,
      actor: displayName(attacker),
      move: move.displayName || move.name,
      target: displayName(defender),
      reason: result.blockReason,
    });
    return;
  }
  if ((result.damage || 0) <= 0) return;
  const hp = currentHp(defender);
  const nextHp = result.survival?.survives && result.damage >= hp ? 1 : Math.max(0, hp - result.damage);
  defender.hpPct = Math.max(0, Math.floor((nextHp / maxHp(defender)) * 100));
  if (result.survival?.survives && defender.hpPct <= 0) defender.hpPct = 1;
  defender.fainted = defender.hpPct <= 0;
  if (result.survival?.survives) {
    if (result.survival.source === 'Focus Sash') consumeItem(defender, events, 'survival');
  }
  if (result.consumedDefensiveItem) consumeItem(defender, events, `resist:${result.type}`);
  if (!result.blocked && result.damage > 0 && itemId(defender) === 'airballoon') consumeItem(defender, events, 'air-balloon-pop');
  if (!defender.fainted) applyHealingBerry(defender, events);
  events.push({
    kind: 'hit',
    side: action.side,
    actor: displayName(attacker),
    move: move.displayName || move.name,
    target: displayName(defender),
    damagePct: Math.max(0, Math.round((result.damage / maxHp(defender)) * 100)),
    hpPct: defender.hpPct,
    isKo: defender.fainted,
    isSpread: !!move.isSpread || ['allAdjacent', 'allAdjacentFoes', 'all'].includes(action.targetMode),
    survival: result.survival || null,
  });
  applySideEffects(action, targetRef, snapshot, events);
}

function highestBoostableStat(pokemon, snapshot) {
  const stats = ['atk', 'def', 'spa', 'spd', 'spe'].map((stat) => ({
    stat,
    value: stat === 'spe' ? effectiveSpeed(pokemon, pokemon?.side || 'self', snapshot) : statValue(pokemon, stat),
  }));
  stats.sort((a, b) => b.value - a.value || ['atk', 'def', 'spa', 'spd', 'spe'].indexOf(a.stat) - ['atk', 'def', 'spa', 'spd', 'spe'].indexOf(b.stat));
  return stats[0]?.stat || 'atk';
}

function applyTerrainSeeds(snapshot, events) {
  for (const side of SIDE_KEYS) {
    for (const { pokemon } of activePokemonRefs(snapshot, side)) {
      const seed = getTerrainSeed(itemId(pokemon), snapshot.field?.terrain);
      if (!seed || !isGrounded(pokemon, snapshot)) continue;
      adjustStage(pokemon, seed.stat, seed.delta, events, `seed:${snapshot.field.terrain}`);
      consumeItem(pokemon, events, `seed:${snapshot.field.terrain}`);
    }
  }
}

function applyBoosterEnergy(snapshot, pokemon, events) {
  if (!isProtoQuarkAbility(abilityId(pokemon))) return;
  if (pokemon.volatiles?.boosterStat) return;
  const fieldActive = isProtoQuarkFieldActive(abilityId(pokemon), snapshot.field || {});
  if (!fieldActive && itemId(pokemon) !== 'boosterenergy') return;
  const stat = highestBoostableStat(pokemon, snapshot);
  pokemon.volatiles.boosterStat = stat;
  pokemon.volatiles.boosterSource = fieldActive ? 'field' : 'boosterenergy';
  if (!fieldActive) consumeItem(pokemon, events, 'booster-energy');
  events.push({
    kind: 'activation',
    side: pokemon.side,
    actor: displayName(pokemon),
    ability: pokemon.set?.ability || abilityId(pokemon),
    stat,
    reason: fieldActive ? 'field-proto-quark' : 'booster-energy',
  });
}

function applyIntimidate(snapshot, sourceRef, events) {
  const source = sourceRef?.pokemon;
  if (abilityId(source) !== 'intimidate') return;
  const foeSide = otherSide(sourceRef.side);
  for (const { pokemon: target } of activePokemonRefs(snapshot, foeSide)) {
    if (!isAlive(target)) continue;
    const ability = abilityId(target);
    const item = itemId(target);
    if (ability === 'guarddog') {
      adjustStage(target, 'atk', 1, events, 'Guard Dog');
      events.push({ kind: 'blocked', side: sourceRef.side, actor: displayName(source), target: displayName(target), reason: 'Guard Dog' });
      continue;
    }
    if (blocksStatDrop(ability, item)) {
      events.push({ kind: 'blocked', side: sourceRef.side, actor: displayName(source), target: displayName(target), reason: item === 'clearamulet' ? 'Clear Amulet' : target.set?.ability || ability });
      continue;
    }
    adjustStage(target, 'atk', -1, events, 'Intimidate');
    if (ANTI_STAT_DROP_ABILITIES.has(ability)) {
      if (ability === 'defiant') adjustStage(target, 'atk', 2, events, 'Defiant');
      if (ability === 'competitive') adjustStage(target, 'spa', 2, events, 'Competitive');
    }
  }
}

function applySwitchInReactionsToMutable(snapshot, entries, events) {
  const switchIns = (entries && entries.length ? entries : [
    ...activePokemonRefs(snapshot, 'self'),
    ...activePokemonRefs(snapshot, 'enemy'),
  ]).filter((entry) => isAlive(entry.pokemon));

  for (const entry of switchIns) {
    const weather = getSwitchInWeather(abilityId(entry.pokemon));
    if (weather && snapshot.field.weather !== weather) {
      snapshot.field.weather = weather;
      snapshot.field.weatherTurns = 5;
      setLegacyField(snapshot, 'weather', weather);
      setLegacyField(snapshot, 'weatherTurns', 5);
      events.push({ kind: 'field', side: entry.side, actor: displayName(entry.pokemon), ability: entry.pokemon.set?.ability || abilityId(entry.pokemon), weather });
    }
    const terrain = getSwitchInTerrain(abilityId(entry.pokemon));
    if (terrain && snapshot.field.terrain !== terrain) {
      snapshot.field.terrain = terrain;
      snapshot.field.terrainTurns = 5;
      setLegacyField(snapshot, 'terrain', terrain);
      setLegacyField(snapshot, 'terrainTurns', 5);
      events.push({ kind: 'field', side: entry.side, actor: displayName(entry.pokemon), ability: entry.pokemon.set?.ability || abilityId(entry.pokemon), terrain });
    }
  }

  applyTerrainSeeds(snapshot, events);

  for (const entry of switchIns) applyBoosterEnergy(snapshot, entry.pokemon, events);
  for (const entry of switchIns) applyIntimidate(snapshot, entry, events);
}

export function applySwitchInReactions(snapshot, entries = null) {
  const working = makeMutableSnapshot(snapshot);
  const events = [];
  applySwitchInReactionsToMutable(working, entries, events);
  return {
    snapshot: hydrateBattleSnapshot(working),
    events,
    explainEvents: eventsToExplainEvents(events, { source: ACTION_CORE_VERSION }),
  };
}

function performSwitch(snapshot, action, events) {
  const side = sideKey(action.side);
  const sideState = getSide(snapshot, side);
  const from = Number(action.userSlot);
  const to = Number(action.targetSlot ?? action.data?.switchInSlot);
  const outSlot = sideState?.slots?.[from];
  const inSlot = sideState?.slots?.[to];
  if (!outSlot || !inSlot || !isAlive(inSlot.pokemon)) return false;
  sideState.activeSlots = sideState.activeSlots.map((slot) => (slot === from ? to : slot)).sort((a, b) => a - b);
  outSlot.active = false;
  inSlot.active = true;
  inSlot.pokemon.active = true;
  inSlot.pokemon.volatiles.enteredThisTurn = true;
  outSlot.pokemon.active = false;
  events.push({ kind: 'switch', side, actor: displayName(outSlot.pokemon), into: displayName(inSlot.pokemon) });
  applySwitchInReactionsToMutable(snapshot, [{ side, slot: to, slotIndex: to, pokemon: inSlot.pokemon }], events);
  return true;
}

function resetOneTurnGuards(snapshot) {
  for (const side of SIDE_KEYS) {
    const sideState = getSide(snapshot, side);
    if (!sideState) continue;
    sideState.sideConditions.quickGuard = false;
    sideState.sideConditions.wideGuard = false;
    sideState.sideConditions.redirection = null;
    activePokemonRefs(snapshot, side).forEach(({ pokemon }) => {
      pokemon.volatiles.protected = false;
      pokemon.volatiles.protectedBy = null;
      pokemon.volatiles.flinched = false;
      pokemon.volatiles.helpingHand = false;
      pokemon.volatiles.enteredThisTurn = false;
    });
  }
}

export function simulateTurn(snapshot, actions = [], options = {}) {
  const working = makeMutableSnapshot(snapshot);
  const ordered = resolveActionOrder(working, actions);
  const events = [];
  const explainEvents = [];

  for (const entry of ordered) {
    const action = entry.action;
    const actor = getPokemon(working, action.side, action.userSlot);
    const move = actionMove(action);
    if (!isAlive(actor)) {
      events.push({ kind: 'blocked', side: action.side, actor: displayName(actor), move: move.displayName || move.name || 'accion', reason: 'debilitado' });
      continue;
    }
    if (actor.volatiles?.flinched && action.kind === 'move') {
      events.push({ kind: 'blocked', side: action.side, actor: displayName(actor), move: move.displayName || move.name, reason: 'retroceso' });
      continue;
    }
    if (action.kind === 'switch') {
      performSwitch(working, action, events);
      continue;
    }
    const failReason = canUseMove(actor, move, working);
    if (failReason) {
      events.push({ kind: 'blocked', side: action.side, actor: displayName(actor), move: move.displayName || move.name, reason: failReason });
      continue;
    }
    actor.volatiles.lastMove = move.displayName || move.name || action.moveName;
    if (applySupport(action, working, events) && (move.basePower || 0) <= 0) continue;
    const targets = resolveTargets(action, working);
    if (!targets.length) continue;
    let dealtDamage = false;
    for (const target of targets) {
      const result = runDamagePipeline(working, action, target, options);
      explainEvents.push(...(result.explainEvents || []));
      if (!result.blocked && (result.damage || 0) > 0) dealtDamage = true;
      applyDamageResult(working, action, target, result, events);
    }
    if (dealtDamage && itemId(actor) === 'lifeorb') applyLifeOrbRecoil(actor, events);
    if (hasChoiceLockItem(itemId(actor)) && !actor.volatiles.choiceLocked) {
      actor.volatiles.choiceLocked = move.id || action.moveId || action.moveName;
      events.push({ kind: 'lock', side: action.side, actor: displayName(actor), move: move.displayName || move.name, reason: 'choice-lock' });
    }
  }

  working.turn = Number(working.turn || 1) + 1;
  resetOneTurnGuards(working);
  const finalSnapshot = hydrateBattleSnapshot(working);
  return {
    snapshot: finalSnapshot,
    events,
    explainEvents: [...eventsToExplainEvents(events, { source: ACTION_CORE_VERSION }), ...explainEvents],
    order: ordered.map(({ action, priority, speed, actor, order, speedTie }) => ({
      side: action.side,
      userSlot: action.userSlot,
      actor,
      move: action.kind === 'switch' ? 'Switch' : (action.moveName || actionMove(action).displayName || action.moveId),
      priority,
      speed,
      order,
      speedTie,
    })),
  };
}
