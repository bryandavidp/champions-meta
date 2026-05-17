import { MOVE_PRIORITY_LEVELS } from '../core/constants.js';
import { state } from '../core/state.js';
import { calculateSpeed } from '../battle/speed.js';
import { getNatureSpeModifier } from '../battle/stats.js';

const WEATHER_SPEED_ABILITIES = {
  sun: new Set(['chlorophyll', 'clorofila']),
  rain: new Set(['swiftswim', 'nadorapido']),
  sand: new Set(['sandrush', 'impetuarena']),
  sandstorm: new Set(['sandrush', 'impetuarena']),
  snow: new Set(['slushrush', 'quitanieves']),
  hail: new Set(['slushrush', 'quitanieves']),
};

const PRIORITY_BLOCKERS = new Set(['armortail', 'dazzling', 'queenlymajesty']);

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function displayName(mon) {
  return mon?.displayName || mon?.name || 'Slot';
}

function movePriority(moveName) {
  const raw = String(moveName || '').toLowerCase();
  return MOVE_PRIORITY_LEVELS[raw] || MOVE_PRIORITY_LEVELS[slug(moveName)] || 0;
}

function rawSpeed(mon) {
  const baseSpe = mon?.baseStats?.speed || 100;
  const evsSpe = mon?.set?.evs?.spe || 0;
  const nature = mon?.set?.nature || '';
  let speed = Math.floor(((2 * baseSpe + 31 + Math.floor(evsSpe / 4)) * 50) / 100) + 5;
  return Math.floor(speed * getNatureSpeModifier(nature));
}

function getStatus(mon) {
  return slug(mon?.battle?.status || '');
}

function getAbility(mon) {
  return slug(mon?.set?.ability || mon?.ability || '');
}

function getItem(mon) {
  return slug(mon?.set?.item || mon?.item || '');
}

function hasTailwind(field, side) {
  return (side === 'self' && field?.tailwindSelf) || (side === 'enemy' && field?.tailwindEnemy);
}

function hasWeatherSpeedAbility(mon, field) {
  const weather = slug(field?.weather || '');
  const ability = getAbility(mon);
  return !!(WEATHER_SPEED_ABILITIES[weather] && WEATHER_SPEED_ABILITIES[weather].has(ability));
}

function weatherAbilityLabel(mon, field) {
  const ability = getAbility(mon);
  if (['chlorophyll', 'clorofila'].includes(ability)) return 'Clorofila';
  if (['swiftswim', 'nadorapido'].includes(ability)) return 'Nado Rapido';
  if (['sandrush', 'impetuarena'].includes(ability)) return 'Impetu Arena';
  if (['slushrush', 'quitanieves'].includes(ability)) return 'Quitanieves';
  return field?.weather ? 'Habilidad clima' : null;
}

function priorityBlockedReason(entry, opponents, field) {
  const hasPositivePriority = entry.priorityWindows.some((item) => item.priority > 0);
  if (!hasPositivePriority) return null;
  if (field?.terrain === 'psychic') return 'Campo Psiquico bloquea prioridad';
  const blocker = opponents.find((opp) => PRIORITY_BLOCKERS.has(getAbility(opp.mon)));
  if (blocker) return `${displayName(blocker.mon)} bloquea prioridad`;
  if ((entry.side === 'self' && field?.quickGuardEnemy) || (entry.side === 'enemy' && field?.quickGuardSelf)) {
    return 'Quick Guard rival';
  }
  return null;
}

function buildPriorityWindows(mon) {
  const moves = mon?.set?.moves || [];
  const windows = moves
    .filter(Boolean)
    .map((move) => ({
      move,
      priority: movePriority(move),
    }))
    .filter((item) => item.priority !== 0)
    .sort((a, b) => b.priority - a.priority);

  if (!windows.length) {
    windows.push({ move: 'Ataque normal', priority: 0 });
  }
  return windows;
}

function applyExtraSpeedModifiers(baseEffective, mon, side, field) {
  let effectiveAbs = Math.abs(baseEffective);
  const modifiers = [];
  const raw = rawSpeed(mon);
  const ability = getAbility(mon);
  const item = getItem(mon);
  const status = getStatus(mon);

  if (hasTailwind(field, side)) {
    modifiers.push({ id: 'tailwind', label: 'Tailwind', type: 'field', multiplier: 2 });
  }
  if (field?.trickRoom) {
    modifiers.push({ id: 'trick-room', label: 'Trick Room invierte', type: 'field', multiplier: -1 });
  }
  if (hasWeatherSpeedAbility(mon, field)) {
    modifiers.push({ id: 'weather-speed', label: weatherAbilityLabel(mon, field), type: 'ability', multiplier: 2 });
  }
  if (item === 'choicescarf' || item === 'panueloleccion') {
    modifiers.push({ id: 'scarf', label: 'Choice Scarf', type: 'item', multiplier: 1.5 });
  }
  if (item === 'boosterenergy' || item === 'energizador') {
    modifiers.push({ id: 'booster', label: 'Booster posible', type: 'item', multiplier: null });
  }
  if (ability === 'unburden' || ability === 'liviano') {
    const consumed = mon?.battle?.itemConsumed || (!item && mon?.battle);
    modifiers.push({ id: 'unburden', label: consumed ? 'Unburden activo' : 'Unburden posible', type: 'ability', multiplier: consumed ? 2 : null });
    if (consumed) effectiveAbs = Math.max(effectiveAbs, raw * 2);
  }
  if (status === 'par' || status === 'paralysis' || status === 'paralisis') {
    modifiers.push({ id: 'paralysis', label: 'Paralisis', type: 'status', multiplier: 0.5 });
    effectiveAbs = Math.floor(effectiveAbs * 0.5);
  }

  const effectiveSpeed = field?.trickRoom ? -effectiveAbs : effectiveAbs;
  return { effectiveSpeed, effectiveAbs, modifiers };
}

function createEntry(input, field) {
  const baseEffective = calculateSpeed(input.mon, input.side, field);
  const extra = applyExtraSpeedModifiers(baseEffective, input.mon, input.side, field);
  const priorityWindows = buildPriorityWindows(input.mon);
  const maxPriority = Math.max(...priorityWindows.map((item) => item.priority));

  return {
    id: `${input.side}-${input.index ?? input.slot ?? displayName(input.mon)}`,
    side: input.side,
    slot: input.slot ?? input.index ?? 0,
    index: input.index ?? input.slot ?? null,
    mon: input.mon,
    name: displayName(input.mon),
    sprite: input.mon?.sprite || '',
    rawSpeed: rawSpeed(input.mon),
    effectiveSpeed: extra.effectiveSpeed,
    effectiveAbsSpeed: extra.effectiveAbs,
    modifiers: extra.modifiers,
    priorityWindows,
    maxPriority,
    blockedPriorityReason: null,
    tieCandidates: [],
    orderScore: maxPriority * 10000 + extra.effectiveSpeed,
    cause: null,
  };
}

function mainCause(entry, field) {
  if (entry.blockedPriorityReason) return entry.blockedPriorityReason;
  const positive = entry.priorityWindows.find((item) => item.priority > 0);
  if (positive) return `${positive.move} +${positive.priority}`;
  const firstModifier = entry.modifiers.find((item) => item.id !== 'trick-room');
  if (firstModifier) return firstModifier.label;
  if (field?.trickRoom) return 'Trick Room';
  return 'Speed efectiva';
}

function annotateTies(entries) {
  for (const entry of entries) {
    entry.tieCandidates = entries
      .filter((other) => other !== entry && other.maxPriority === entry.maxPriority && other.effectiveSpeed === entry.effectiveSpeed)
      .map((other) => ({
        id: other.id,
        side: other.side,
        name: other.name,
      }));
  }
}

export function buildSpeedOrder(input = {}) {
  const field = input.field || state.field || {};
  const self = (input.selfActive || []).filter(Boolean).slice(0, 2).map((mon, index) => ({ mon, side: 'self', slot: index, index }));
  const enemy = (input.enemyActive || []).filter(Boolean).slice(0, 2).map((mon, index) => ({ mon, side: 'enemy', slot: index, index }));
  const entries = [...self, ...enemy].map((item) => createEntry(item, field));

  for (const entry of entries) {
    const opponents = entries.filter((other) => other.side !== entry.side);
    entry.blockedPriorityReason = priorityBlockedReason(entry, opponents, field);
    if (entry.blockedPriorityReason) {
      entry.orderScore = entry.effectiveSpeed;
    }
  }

  entries.sort((a, b) => {
    if (b.maxPriority !== a.maxPriority && !a.blockedPriorityReason && !b.blockedPriorityReason) return b.maxPriority - a.maxPriority;
    if (b.orderScore !== a.orderScore) return b.orderScore - a.orderScore;
    return a.name.localeCompare(b.name);
  });

  annotateTies(entries);
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
    entry.cause = mainCause(entry, field);
  });

  return {
    field: {
      trickRoom: !!field.trickRoom,
      weather: field.weather || null,
      terrain: field.terrain || null,
      tailwindSelf: !!field.tailwindSelf,
      tailwindEnemy: !!field.tailwindEnemy,
    },
    entries,
    firstMover: entries[0] || null,
    ties: entries.filter((entry) => entry.tieCandidates.length > 0),
  };
}
