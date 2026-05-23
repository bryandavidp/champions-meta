import {
  SPREAD_MOVES,
  MOVE_PRIORITY_LEVELS,
  WEATHER_LABELS,
  TERRAIN_LABELS,
  TYPE_META,
} from '../core/constants.js';
import { formatName, normalizeText } from '../utils/text.js';
import { bestAttack, estimateMoveDamage } from '../battle/damage.js';
import { calculateSpeed } from '../battle/speed.js';
import { calcMonHP } from '../battle/stats.js';
import { fetchMoveInfo } from '../battle/moves.js';
import {
  createBattleSnapshot,
  snapshotToLegacySimulationState,
} from '../battle/snapshot.js';
import { buildSnapshotCacheKey } from '../battle/cache-keys.js';
import { eventsToExplainEvents } from '../battle/explain.js';
import {
  tickField,
  applySwitchInEffects,
  applyMoveResolutionEffects,
} from '../battle/effects.js';
import {
  ensureAbilityRegistry,
  ensureItemRegistry,
  ensureMoveRegistry,
  ensureStatusRegistry,
} from '../battle/registry.js';
import { buildTacticalSummary } from './tactical-findings-adapter.js';
const engineState = {
  self: [],
  enemy: [],
  field: {},
  activeSelfSlots: [0, 1],
  activeEnemySlots: [0, 1],
  leads: { self: [0, 1], enemy: [0, 1] },
  turn1Battle: { active: true, turn: 1, log: [], lastActionId: 0, actedThisTurn: {}, lastResolvedOrder: null, pendingSwitch: null },
  turnPlanMeta: {},
};

const PROTECT_MOVES = new Set([
  'protect', 'proteccion', 'detect', 'deteccion', 'spikyshield', 'barreraespinosa',
  'kingsshield', 'escudoreal', 'banefulbunker', 'bunker', 'obstruct', 'obstruccion',
  'silktrap',
]);

const REDIRECTION_MOVES = new Set(['followme', 'senuelo', 'seuelo', 'ragepowder', 'polvoira']);
const GUARD_MOVES = new Set(['wideguard', 'vastaguardia', 'quickguard', 'anticipo']);
const PRIORITY_CONTROL_MOVES = new Set(['fakeout', 'sorpresa']);
const PIVOT_MOVES = new Set([
  'uturn', 'idayvuelta', 'voltswitch', 'voltiocambio', 'flipturn', 'partingshot', 'ultimapalabra',
]);
const SPEED_CONTROL_MOVES = new Set([
  'tailwind', 'vientoafin', 'trickroom', 'espacioraro', 'icywind', 'vientohielo',
  'electroweb', 'redviscosa', 'thunderwave', 'ondatrueno', 'bulldoze',
]);
const SETUP_MOVES = new Set([
  'swordsdance', 'danzaespadas', 'nastyplot', 'maquinacion', 'calmmind', 'pazmental',
  'dragondance', 'danzadragon', 'bulkup', 'corpulencia', 'quiverdance', 'danzaaleteo',
  'tailwind', 'vientoafin', 'trickroom', 'espacioraro',
]);
const SCREEN_MOVES = new Set(['reflect', 'reflejo', 'lightscreen', 'pantallaluz', 'auroraveil', 'veloaurora']);
const FIELD_SETTER_MOVES = new Set([
  'sunnyday', 'diasoleado', 'raindance', 'danzalluvia', 'sandstorm', 'tormentadearena',
  'snowscape', 'nevadaperpetua', 'hail', 'granizo', 'electricterrain', 'campoelectrico',
  'psychicterrain', 'campopsiquico', 'grassyterrain', 'campohierba', 'mistyterrain', 'camponiebla',
]);
const STATUS_TARGET_MOVES = new Set([
  'taunt', 'mofa', 'encore', 'otravez', 'willowisp', 'fuegofatuo', 'thunderwave',
  'ondatrueno', 'spore', 'espora', 'sleeppowder', 'somnifero', 'toxic', 'toxico',
  'poisonpowder', 'venenopolvo',
]);
const HELPING_HAND_MOVES = new Set(['helpinghand', 'refuerzo']);
const SELF_TARGET_SETUP = new Set([
  'swordsdance', 'danzaespadas', 'nastyplot', 'maquinacion', 'calmmind', 'pazmental',
  'dragondance', 'danzadragon', 'bulkup', 'corpulencia', 'quiverdance', 'danzaaleteo',
  'agility', 'agilidad',
]);

const MOVE_STATUS_APPS = {
  willowisp: 'brn',
  fuegofatuo: 'brn',
  thunderwave: 'par',
  ondatrueno: 'par',
  spore: 'slp',
  espora: 'slp',
  sleeppowder: 'slp',
  somnifero: 'slp',
  toxic: 'tox',
  toxico: 'tox',
  poisonpowder: 'psn',
  venenopolvo: 'psn',
};

const STAGE_DELTAS = {
  icywind: { spe: -1, spread: true },
  vientohielo: { spe: -1, spread: true },
  electroweb: { spe: -1, spread: true },
  redviscosa: { spe: -1, spread: true },
  bulldoze: { spe: -1, spread: true },
  partingshot: { atk: -1, spa: -1, target: true },
  ultimapalabra: { atk: -1, spa: -1, target: true },
  snarl: { spa: -1, spread: true },
  alarido: { spa: -1, spread: true },
  breakingswipe: { atk: -1, spread: true },
  dracoflechas: { atk: -1, spread: true },
  swordsdance: { atk: 2, self: true },
  danzaespada: { atk: 2, self: true },
  danzaespadas: { atk: 2, self: true },
  nastyplot: { spa: 2, self: true },
  maquinacion: { spa: 2, self: true },
  calmmind: { spa: 1, spd: 1, self: true },
  pazmental: { spa: 1, spd: 1, self: true },
  dragondance: { atk: 1, spe: 1, self: true },
  danzadragon: { atk: 1, spe: 1, self: true },
  bulkup: { atk: 1, def: 1, self: true },
  corpulencia: { atk: 1, def: 1, self: true },
  quiverdance: { spa: 1, spd: 1, spe: 1, self: true },
  danzaaleteo: { spa: 1, spd: 1, spe: 1, self: true },
  agility: { spe: 2, self: true },
  agilidad: { spe: 2, self: true },
};

const SUPPORT_MOVE_LABELS = {
  protect: 'Proteccion',
  proteccion: 'Proteccion',
  detect: 'Detect',
  tailwind: 'Viento Afin',
  vientoafin: 'Viento Afin',
  trickroom: 'Trick Room',
  espacioraro: 'Trick Room',
  fakeout: 'Fake Out',
  sorpresa: 'Sorpresa',
  followme: 'Follow Me',
  senuelo: 'Seguelo',
  seuelo: 'Seguelo',
  ragepowder: 'Rage Powder',
  polvoira: 'Polvo Ira',
  wideguard: 'Wide Guard',
  vastaguardia: 'Wide Guard',
  quickguard: 'Quick Guard',
  anticipo: 'Quick Guard',
  helpinghand: 'Helping Hand',
  refuerzo: 'Helping Hand',
};

function slug(value) {
  return normalizeText(value || '');
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function sum(values) {
  return values.reduce((acc, value) => acc + value, 0);
}

function comboKey(indices) {
  return (indices || []).slice().sort((a, b) => a - b).join(',');
}

function getDisplayName(mon) {
  return mon?.displayName || mon?.name || 'Slot';
}

function deepClone(value) {
  return value == null ? value : structuredClone(value);
}

function resetEngineCaches() {
  window.currentDamageCache = {};
  window.comboBestAttackCache = {};
  window.comboSpeedCache = {};
}

function ensureBattle(mon, side) {
  if (!mon) return;
  mon.battle = mon.battle || {};
  mon.battle.side = side;
  if (!Number.isFinite(mon.battle.hpPct)) mon.battle.hpPct = 100;
  if (!mon.battle.status) mon.battle.status = 'none';
  if (!mon.battle.stages) mon.battle.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  if (typeof mon.battle.taunted !== 'boolean') mon.battle.taunted = false;
  if (!Number.isFinite(mon.battle.tauntTurns)) mon.battle.tauntTurns = 0;
  if (typeof mon.battle.flinched !== 'boolean') mon.battle.flinched = false;
  if (typeof mon.battle.protected !== 'boolean') mon.battle.protected = false;
  if (typeof mon.battle.enteredThisTurn !== 'boolean') mon.battle.enteredThisTurn = false;
  if (typeof mon.battle.helpingHand !== 'boolean') mon.battle.helpingHand = false;
  if (!Number.isFinite(mon.battle.encoreTurns)) mon.battle.encoreTurns = 0;
  if (!mon.battle.encoredMove) mon.battle.encoredMove = null;
  mon.fainted = !!mon.fainted || (mon.battle.hpPct ?? 100) <= 0;
}

function buildFreshMon(mon, side, slotRole = 'back') {
  const next = deepClone(mon);
  ensureBattle(next, side);
  next.battle.hpPct = Number.isFinite(mon?.battle?.hpPct) ? mon.battle.hpPct : 100;
  next.battle.status = mon?.battle?.status || 'none';
  next.battle.stages = deepClone(mon?.battle?.stages) || { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  next.battle.taunted = !!mon?.battle?.taunted;
  next.battle.tauntTurns = Number(mon?.battle?.tauntTurns || 0);
  next.battle.encoredMove = mon?.battle?.encoredMove || null;
  next.battle.encoreTurns = Number(mon?.battle?.encoreTurns || 0);
  next.battle.protected = false;
  next.battle.protectedBy = null;
  next.battle.flinched = false;
  next.battle.flinchedBy = null;
  next.battle.helpingHand = false;
  next.battle.enteredThisTurn = slotRole === 'back';
  next.battle.turnPlanRole = slotRole;
  next.fainted = !!mon?.fainted || next.battle.hpPct <= 0;
  return next;
}

function clearVolatiles(mon) {
  if (!mon?.battle) return;
  mon.battle.flinched = false;
  mon.battle.flinchedBy = null;
  mon.battle.protected = false;
  mon.battle.protectedBy = null;
  mon.battle.helpingHand = false;
  mon.battle.enteredThisTurn = false;
}

function advanceMonTurnState(mon) {
  if (!mon?.battle) return;
  clearVolatiles(mon);
  if (mon.battle.tauntTurns > 0) {
    mon.battle.tauntTurns -= 1;
    if (mon.battle.tauntTurns <= 0) {
      mon.battle.taunted = false;
      mon.battle.tauntTurns = 0;
    }
  }
  if (mon.battle.encoreTurns > 0) {
    mon.battle.encoreTurns -= 1;
    if (mon.battle.encoreTurns <= 0) {
      mon.battle.encoredMove = null;
      mon.battle.encoreTurns = 0;
    }
  }
}

function getDynamicPriority(moveName, mon = null) {
  if (!moveName) return 0;
  const moveId = slug(moveName);
  const info = fetchMoveInfo(moveName) || {};
  let prio = 0;
  if (['helpinghand', 'refuerzo'].includes(moveId)) prio = 5;
  else if (PROTECT_MOVES.has(moveId)) prio = 4;
  else if (['wideguard', 'vastaguardia', 'quickguard', 'anticipo'].includes(moveId)) prio = 3;
  else if (['fakeout', 'sorpresa', 'firstimpression', 'escaramuza'].includes(moveId)) prio = 3;
  else if (['extremespeed', 'velocidadextrema', 'feint', 'amago', 'followme', 'senuelo', 'seuelo', 'ragepowder', 'polvoira'].includes(moveId)) prio = 2;
  else if (['suckerpunch', 'golpebajo', 'aquajet', 'acuajet', 'machpunch', 'bulletpunch', 'punobala', 'iceshard', 'cantohelado', 'shadowsneak', 'sombravil', 'grassyglide', 'fitimpulso'].includes(moveId)) prio = 1;
  else if (['trickroom', 'espacioraro'].includes(moveId)) prio = -7;
  else prio = (Number.isFinite(info.priority) ? info.priority : 0) || MOVE_PRIORITY_LEVELS[String(moveName).toLowerCase()] || MOVE_PRIORITY_LEVELS[moveId] || 0;

  const ability = slug(mon?.set?.ability || mon?.ability || '');
  if (['prankster', 'bromista'].includes(ability) && info.damageClass === 'status' && prio >= 0) {
    prio += 1;
  }
  return prio;
}

function isSpreadMove(moveName, info = null) {
  const moveId = slug(moveName);
  const moveInfo = info || fetchMoveInfo(moveName) || {};
  return !!(moveInfo?.isSpread || Array.from(SPREAD_MOVES || []).some((move) => slug(move) === moveId));
}

function isProtectMove(moveName) {
  return PROTECT_MOVES.has(slug(moveName));
}

function isStatusMove(moveName) {
  const info = fetchMoveInfo(moveName) || {};
  return info.damageClass === 'status' || (!info.power && info.damageClass !== 'physical' && info.damageClass !== 'special');
}

function moveTypeName(moveType) {
  return TYPE_META[moveType]?.name || formatName(moveType || 'normal');
}

function describeField(field) {
  const bits = [];
  if (field?.weather) bits.push(WEATHER_LABELS[field.weather] || formatName(field.weather));
  if (field?.terrain) bits.push(TERRAIN_LABELS[field.terrain] || formatName(field.terrain));
  if (field?.trickRoom) bits.push('Trick Room');
  if (field?.tailwindSelf) bits.push('Tailwind propio');
  if (field?.tailwindEnemy) bits.push('Tailwind rival');
  return bits.length ? bits.join(' · ') : 'Campo neutro';
}

function materializeSharedSnapshot() {
  return {
    self: deepClone(engineState.self),
    enemy: deepClone(engineState.enemy),
    field: deepClone(engineState.field),
    activeSelfSlots: [...(engineState.activeSelfSlots || [0, 1])],
    activeEnemySlots: [...(engineState.activeEnemySlots || [0, 1])],
    turn: Number(engineState.turn1Battle?.turn || 1),
    meta: deepClone(engineState.turnPlanMeta || {}),
  };
}

function loadSharedSnapshot(snapshot) {
  engineState.self = deepClone(snapshot.self || []);
  engineState.enemy = deepClone(snapshot.enemy || []);
  engineState.field = deepClone(snapshot.field || {});
  engineState.activeSelfSlots = [...(snapshot.activeSelfSlots || [0, 1])];
  engineState.activeEnemySlots = [...(snapshot.activeEnemySlots || [0, 1])];
  engineState.leads = { self: [...engineState.activeSelfSlots], enemy: [...engineState.activeEnemySlots] };
  engineState.turn1Battle = {
    active: true,
    turn: Number(snapshot.turn || 1),
    log: [],
    lastActionId: 0,
    actedThisTurn: {},
    lastResolvedOrder: null,
    pendingSwitch: null,
  };
  engineState.turnPlanMeta = deepClone(snapshot.meta || {});
  engineState.self.forEach((mon) => ensureBattle(mon, 'self'));
  engineState.enemy.forEach((mon) => ensureBattle(mon, 'enemy'));
}

function getActiveMons(side) {
  const slots = side === 'self' ? engineState.activeSelfSlots : engineState.activeEnemySlots;
  return slots
    .map((idx) => ({ idx, mon: engineState[side]?.[idx] }))
    .filter(({ mon }) => !!mon);
}

function getBenchIndices(side) {
  const actives = new Set(side === 'self' ? engineState.activeSelfSlots : engineState.activeEnemySlots);
  return engineState[side]
    .map((mon, idx) => ({ mon, idx }))
    .filter(({ mon, idx }) => mon && !actives.has(idx) && !(mon.fainted || (mon.battle?.hpPct ?? 100) <= 0))
    .map(({ idx }) => idx);
}

function buildEmptyField(baseField = {}) {
  return {
    weather: null,
    weatherTurns: 0,
    terrain: null,
    terrainTurns: 0,
    trickRoom: false,
    trickRoomTurns: 0,
    tailwindSelf: false,
    tailwindSelfTurns: 0,
    tailwindEnemy: false,
    tailwindEnemyTurns: 0,
    reflectSelf: false,
    reflectSelfTurns: 0,
    lightScreenSelf: false,
    lightScreenSelfTurns: 0,
    auroraVeilSelf: false,
    auroraVeilSelfTurns: 0,
    reflectEnemy: false,
    reflectEnemyTurns: 0,
    lightScreenEnemy: false,
    lightScreenEnemyTurns: 0,
    auroraVeilEnemy: false,
    auroraVeilEnemyTurns: 0,
    hazards: {
      self: { rocks: false, spikes: 0, tspikes: 0, web: false },
      enemy: { rocks: false, spikes: 0, tspikes: 0, web: false },
    },
    quickGuardSelf: false,
    wideGuardSelf: false,
    redirectionSelf: null,
    quickGuardEnemy: false,
    wideGuardEnemy: false,
    redirectionEnemy: null,
    ...deepClone(baseField || {}),
  };
}

function buildSnapshotFromBring(plan, enemyPlan, baseField) {
  const selfMons = plan.mons.map((mon, index) => buildFreshMon(mon, 'self', index < 2 ? 'lead' : 'back'));
  const enemyMons = enemyPlan.mons.map((mon, index) => buildFreshMon(mon, 'enemy', index < 2 ? 'lead' : 'back'));
  const snapshot = {
    self: selfMons,
    enemy: enemyMons,
    field: buildEmptyField(baseField),
    activeSelfSlots: [0, 1],
    activeEnemySlots: [0, 1],
    turn: 1,
    meta: {
      selfBringIndices: plan.indices,
      enemyBringIndices: enemyPlan.indices,
      selfLabels: deepClone(plan.backLabels || {}),
      enemyLabels: deepClone(enemyPlan.backLabels || {}),
    },
  };

  loadSharedSnapshot(snapshot);
  const entrants = [
    ...getActiveMons('self').map(({ idx, mon }) => ({ side: 'self', idx, mon, spe: calculateSpeed(mon, 'self', engineState.field) })),
    ...getActiveMons('enemy').map(({ idx, mon }) => ({ side: 'enemy', idx, mon, spe: calculateSpeed(mon, 'enemy', engineState.field) })),
  ].sort((a, b) => b.spe - a.spe);

  entrants.forEach((entry) => applySwitchInEffects(entry.mon, entry.side, engineState));
  return materializeSharedSnapshot();
}

function allFourCombos(team) {
  const out = [];
  for (let a = 0; a < team.length; a += 1) {
    for (let b = a + 1; b < team.length; b += 1) {
      for (let c = b + 1; c < team.length; c += 1) {
        for (let d = c + 1; d < team.length; d += 1) {
          out.push([a, b, c, d]);
        }
      }
    }
  }
  return out;
}

function identifyMoveTags(mon) {
  const moveIds = new Set((mon?.set?.moves || []).map((move) => slug(move)));
  return {
    fakeOut: ['fakeout', 'sorpresa'].some((move) => moveIds.has(move)),
    tailwind: ['tailwind', 'vientoafin'].some((move) => moveIds.has(move)),
    trickRoom: ['trickroom', 'espacioraro'].some((move) => moveIds.has(move)),
    protect: Array.from(PROTECT_MOVES).some((move) => moveIds.has(move)),
    redirection: Array.from(REDIRECTION_MOVES).some((move) => moveIds.has(move)),
    pivot: Array.from(PIVOT_MOVES).some((move) => moveIds.has(move)),
    wideGuard: ['wideguard', 'vastaguardia'].some((move) => moveIds.has(move)),
    quickGuard: ['quickguard', 'anticipo'].some((move) => moveIds.has(move)),
    setup: Array.from(SETUP_MOVES).some((move) => moveIds.has(move)),
    priority: (mon?.set?.moves || []).some((move) => getDynamicPriority(move, mon) > 0),
    weatherSetter: ['drought', 'drizzle', 'sandstream', 'snowwarning'].includes(slug(mon?.set?.ability || mon?.ability || '')),
  };
}

function leadPairSynergy(monA, monB) {
  const tagsA = identifyMoveTags(monA);
  const tagsB = identifyMoveTags(monB);
  let score = 0;
  const notes = [];
  if ((tagsA.fakeOut && tagsB.tailwind) || (tagsB.fakeOut && tagsA.tailwind)) {
    score += 24;
    notes.push('Fake Out + Tailwind');
  }
  if ((tagsA.fakeOut && tagsB.trickRoom) || (tagsB.fakeOut && tagsA.trickRoom)) {
    score += 22;
    notes.push('Fake Out + Trick Room');
  }
  if ((tagsA.redirection && tagsB.setup) || (tagsB.redirection && tagsA.setup)) {
    score += 18;
    notes.push('Redirección + setup');
  }
  if ((tagsA.redirection && !tagsB.redirection) || (tagsB.redirection && !tagsA.redirection)) {
    score += 10;
  }
  if (tagsA.quickGuard || tagsB.quickGuard) score += 5;
  if (tagsA.wideGuard || tagsB.wideGuard) score += 5;
  if (tagsA.protect && tagsB.protect) score -= 4;
  if (tagsA.tailwind && tagsB.tailwind) score -= 6;
  return { score, notes };
}

function chooseLeadPair(mons, enemyMons, side = 'self') {
  let best = null;
  for (let i = 0; i < mons.length; i += 1) {
    for (let j = i + 1; j < mons.length; j += 1) {
      const pair = [mons[i], mons[j]];
      const pairIndices = [i, j];
      const threat = sum(
        enemyMons.map((enemy) => {
          const a = bestAttack(pair[0], enemy, engineState.field);
          const b = bestAttack(pair[1], enemy, engineState.field);
          const best = Math.max(a.maxPct || 0, b.maxPct || 0);
          return best >= 100 ? 22 : best >= 60 ? 14 : best >= 30 ? 6 : 0;
        }),
      );
      const safety = sum(
        pair.map((mon) => {
          const worst = enemyMons.reduce((max, enemy) => {
            const atk = bestAttack(enemy, mon, engineState.field);
            return Math.max(max, atk.maxPct || 0);
          }, 0);
          return worst >= 100 ? -18 : worst >= 70 ? -10 : worst >= 40 ? -4 : 5;
        }),
      );
      const speed = pair.reduce((acc, mon) => acc + Math.abs(calculateSpeed(mon, side, engineState.field)), 0) * 0.05;
      const synergy = leadPairSynergy(pair[0], pair[1]);
      const score = threat + safety + speed + synergy.score;
      if (!best || score > best.score) {
        best = { indices: pairIndices, mons: pair, score, notes: synergy.notes };
      }
    }
  }
  return best || {
    indices: [0, 1],
    mons: mons.slice(0, 2),
    score: 0,
    notes: [],
  };
}

function classifyBackline(mons, enemyMons, side = 'self') {
  if (mons.length < 2) {
    return {
      ordered: mons,
      labels: {},
    };
  }
  const scored = mons.map((mon, idx) => {
    const safety = enemyMons.reduce((acc, enemy) => {
      const atk = bestAttack(enemy, mon, engineState.field);
      return acc + (atk.maxPct || 0);
    }, 0);
    const closer = enemyMons.reduce((acc, enemy) => {
      const atk = bestAttack(mon, enemy, engineState.field);
      return acc + (atk.maxPct || 0) + ((atk.ohko || atk.minPct >= 100) ? 25 : 0);
    }, 0);
    const speed = Math.abs(calculateSpeed(mon, side, engineState.field));
    return { mon, idx, safety, closer, speed };
  });
  scored.sort((a, b) => (a.safety - b.safety) || (b.closer - a.closer) || (a.idx - b.idx));
  const pivot = scored[0];
  const closer = [...scored].sort((a, b) => (b.closer - a.closer) || (b.speed - a.speed))[0];
  const ordered = scored
    .sort((a, b) => {
      if (a.mon === pivot.mon) return -1;
      if (b.mon === pivot.mon) return 1;
      if (a.mon === closer.mon) return 1;
      if (b.mon === closer.mon) return -1;
      return a.idx - b.idx;
    })
    .map((entry) => entry.mon);
  return {
    ordered,
    labels: {
      [ordered[0]?.name]: 'safe-pivot',
      [ordered[1]?.name]: ordered[1]?.name === ordered[0]?.name ? 'backline' : 'closer',
    },
  };
}

function normalizeComboEntries(team, combos, preferredIndices = []) {
  const output = [];
  const seen = new Set();
  const teamList = (team || []).filter(Boolean);

  const pushCombo = (indices, meta = {}) => {
    const key = comboKey(indices);
    if (!key || seen.has(key)) return;
    const mons = indices.map((idx) => team[idx]).filter(Boolean);
    if (mons.length < 4) return;
    const leadIndices = (meta.leads || []).filter((idx) => indices.includes(idx));
    const orderedIndices = (meta.orderedIdx || []).filter((idx) => indices.includes(idx));
    const ordered = orderedIndices.length === 4
      ? orderedIndices
      : [
          ...leadIndices,
          ...indices.filter((idx) => !leadIndices.includes(idx)),
        ];
    output.push({
      indices: [...indices],
      orderedIdx: ordered,
      leads: leadIndices.length >= 2 ? leadIndices.slice(0, 2) : ordered.slice(0, 2),
      score: Number(meta.score || 0),
      planType: meta.planType || 'balanceado',
    });
    seen.add(key);
  };

  if (preferredIndices.length >= 4) pushCombo(preferredIndices.slice(0, 4), { leads: preferredIndices.slice(0, 2) });
  (combos || []).forEach((combo) => pushCombo(combo.indices || combo.orderedIdx || [], combo));

  if (!output.length && teamList.length >= 4) {
    allFourCombos(team).slice(0, 6).forEach((indices) => pushCombo(indices, {}));
  }

  return output.slice(0, 6);
}

function scoreEnemyBring(candidateMons, ownMons) {
  const offense = sum(
    ownMons.map((ally) => {
      const best = candidateMons.reduce((max, enemy) => {
        const atk = bestAttack(enemy, ally, engineState.field);
        return Math.max(max, atk.maxPct || 0);
      }, 0);
      return best >= 100 ? 24 : best >= 70 ? 16 : best >= 40 ? 8 : 2;
    }),
  );

  const safety = sum(
    candidateMons.map((enemy) => {
      const worst = ownMons.reduce((max, ally) => {
        const atk = bestAttack(ally, enemy, engineState.field);
        return Math.max(max, atk.maxPct || 0);
      }, 0);
      return worst >= 100 ? -20 : worst >= 70 ? -12 : worst >= 40 ? -5 : 4;
    }),
  );

  const tools = candidateMons.reduce((acc, mon) => {
    const tags = identifyMoveTags(mon);
    if (tags.fakeOut) acc += 8;
    if (tags.tailwind) acc += 8;
    if (tags.trickRoom) acc += 8;
    if (tags.redirection) acc += 7;
    if (tags.pivot) acc += 5;
    if (tags.weatherSetter) acc += 5;
    return acc;
  }, 0);

  return offense + safety + tools;
}

function buildForcedEnemyPrediction(enemyTeam, ownPlan, forcedIndices = []) {
  const unique = [];
  (forcedIndices || []).forEach((idx) => {
    const value = Number(idx);
    if (Number.isFinite(value) && enemyTeam[value] && !unique.includes(value)) unique.push(value);
  });
  if (unique.length < 4) return null;

  const finalIndices = unique.slice(0, 4);
  const mons = finalIndices.map((idx) => enemyTeam[idx]).filter(Boolean);
  if (mons.length < 4) return null;

  const synergy = leadPairSynergy(mons[0], mons[1]);
  return {
    indices: [...finalIndices],
    mons,
    leads: finalIndices.slice(0, 2),
    backs: finalIndices.slice(2),
    orderedIdx: [...finalIndices],
    backLabels: {
      [mons[2]?.name]: 'safe-pivot',
      [mons[3]?.name]: 'closer',
    },
    score: scoreEnemyBring(mons, ownPlan.mons) + synergy.score + 1000,
    notes: synergy.notes,
    forced: true,
  };
}
function buildEnemyPredictions(enemyTeam, ownPlan, maxCombos = 3, forcedEnemyIndices = []) {
  const forced = buildForcedEnemyPrediction(enemyTeam, ownPlan, forcedEnemyIndices);
  const combos = allFourCombos(enemyTeam);
  const scored = combos.map((indices) => {
    const mons = indices.map((idx) => enemyTeam[idx]).filter(Boolean);
    const leadPick = chooseLeadPair(mons, ownPlan.mons, 'enemy');
    const ordered = [
      mons[leadPick.indices[0]],
      mons[leadPick.indices[1]],
      ...mons.filter((_, idx) => !leadPick.indices.includes(idx)),
    ];
    const backs = classifyBackline(ordered.slice(2), ownPlan.mons, 'enemy');
    const finalMons = [ordered[0], ordered[1], ...backs.ordered];
    const finalIndices = finalMons.map((mon) => enemyTeam.indexOf(mon)).filter((idx) => idx >= 0);
    return {
      indices,
      mons: finalMons,
      leads: finalIndices.slice(0, 2),
      backs: finalIndices.slice(2),
      orderedIdx: finalIndices,
      backLabels: backs.labels,
      score: scoreEnemyBring(finalMons, ownPlan.mons) + leadPick.score,
      notes: leadPick.notes,
    };
  });
  scored.sort((a, b) => b.score - a.score);
  if (!forced) return scored.slice(0, Math.max(1, maxCombos));
  const forcedKey = comboKey(forced.indices);
  return [
    forced,
    ...scored.filter((entry) => comboKey(entry.indices) !== forcedKey),
  ].slice(0, Math.max(1, maxCombos));
}

function warmMoveCache(mons) {
  (mons || []).forEach((mon) => {
    (mon?.set?.moves || []).forEach((move) => {
      fetchMoveInfo(move);
      ensureMoveRegistry(move);
    });
    ensureAbilityRegistry(mon?.set?.ability || mon?.ability || '');
    ensureItemRegistry(mon?.set?.item || mon?.item || '');
    ensureStatusRegistry(mon?.battle?.status || '');
  });
}

function getActionBlockReason(mon, moveName = null) {
  if (!mon) return 'sin usuario';
  if (mon.fainted || (mon.battle?.hpPct ?? 100) <= 0) return 'esta debilitado';
  if (mon.battle?.enteredThisTurn) return 'acaba de entrar';
  if (mon.battle?.flinched) return 'retrocede';
  if (mon.battle?.status === 'slp') return 'esta dormido';
  if (mon.battle?.status === 'frz') return 'esta congelado';
  if (moveName && mon.battle?.taunted && isStatusMove(moveName)) return 'Mofa lo bloquea';
  if (moveName && mon.battle?.encoredMove && mon.battle.encoreTurns > 0 && slug(mon.battle.encoredMove) !== slug(moveName)) {
    return `Encore le fuerza ${formatName(mon.battle.encoredMove)}`;
  }
  return null;
}

function getMoveCandidate(moveName) {
  const info = fetchMoveInfo(moveName) || {};
  return {
    move: moveName,
    type: info.type || 'normal',
    power: info.power || 0,
    damageClass: info.damageClass || 'status',
    hits: info.hits || 1,
    isSpread: isSpreadMove(moveName, info),
    priority: 0,
  };
}

function resolveRedirectTarget(targetSide, intendedIndex) {
  const redirectFlag = targetSide === 'self' ? engineState.field.redirectionSelf : engineState.field.redirectionEnemy;
  if (redirectFlag == null) return intendedIndex;
  if (Number.isFinite(Number(redirectFlag))) return Number(redirectFlag);
  const active = targetSide === 'self' ? engineState.activeSelfSlots : engineState.activeEnemySlots;
  const named = active.find((idx) => {
    const mon = engineState[targetSide]?.[idx];
    return mon && [mon.name, mon.displayName].includes(redirectFlag);
  });
  return Number.isFinite(named) ? named : intendedIndex;
}

function projectDamagePreview(attacker, defender, moveName, targetMode = null) {
  const candidate = getMoveCandidate(moveName);
  candidate.priority = getDynamicPriority(moveName, attacker);
  if (targetMode === 'spread-foes') candidate.isSpread = true;
  const result = estimateMoveDamage(attacker, defender, candidate, engineState.field);
  const baseHP = calcMonHP(defender);
  const currentPct = defender.battle?.hpPct ?? 100;
  const currentHP = Math.max(1, Math.floor((baseHP * currentPct) / 100));
  const minDamage = result.minDamage || result.damage || 0;
  const maxDamage = result.maxDamage || result.damage || 0;
  const maxPct = Math.min(100, Math.floor(((result.maxDamage || result.damage || 0) / currentHP) * 100));
  const minPct = Math.min(100, Math.floor(((result.minDamage || result.damage || 0) / currentHP) * 100));
  const hpAfterMax = Math.max(0, Math.floor(((Math.max(0, currentHP - maxDamage)) / baseHP) * 100));
  const hpAfterMin = Math.max(0, Math.floor(((Math.max(0, currentHP - minDamage)) / baseHP) * 100));
  return {
    ...result,
    minPct,
    maxPct,
    targetName: getDisplayName(defender),
    targetSprite: defender?.sprite || '',
    targetHpBefore: Math.round(currentPct),
    targetHpAfterMin: hpAfterMin,
    targetHpAfterMax: hpAfterMax,
    ko: !result.blocked && maxPct >= 100,
    likelyKo: !result.blocked && minPct >= 100,
  };
}

function previewDamageLabel(previews = []) {
  const usable = previews.filter(Boolean);
  if (!usable.length) return '';
  if (usable.some((preview) => preview.likelyKo)) return 'KO seguro';
  if (usable.some((preview) => preview.ko)) return 'KO posible';
  const minPct = Math.min(...usable.map((preview) => Number(preview.minPct || 0)));
  const maxPct = Math.max(...usable.map((preview) => Number(preview.maxPct || 0)));
  if (!Number.isFinite(minPct) || !Number.isFinite(maxPct)) return '';
  return `${minPct}-${maxPct}%${usable.length > 1 ? ` x${usable.length}` : ''}`;
}

function previewEffectivenessLabel(previews = []) {
  const usable = previews.filter((preview) => Number.isFinite(Number(preview?.mult)));
  if (!usable.length) return '';
  const highest = Math.max(...usable.map((preview) => Number(preview.mult || 1)));
  if (highest === 0) return 'Inmune';
  if (highest >= 4) return 'x4 eficaz';
  if (highest >= 2) return 'x2 eficaz';
  if (highest <= 0.25) return 'x0.25 resiste';
  if (highest < 1) return 'x0.5 resiste';
  return 'x1 neutro';
}

function previewOutcomeKind(action, previews = []) {
  const effectClass = action?.effectClass || '';
  const usable = previews.filter(Boolean);
  if (action?.kind === 'switch') return 'switch';
  if (action?.canFailReason || usable.some((preview) => preview.blocked)) return 'blocked';
  if (usable.some((preview) => preview.likelyKo)) return 'ko-secure';
  if (usable.some((preview) => preview.ko)) return 'ko-possible';
  if (action?.isSpread || action?.targetMode === 'spread-foes') return 'spread';
  if (effectClass.includes('protect') || effectClass.includes('guard')) return 'protect';
  if (effectClass.includes('speed') || effectClass === 'tempo') return 'tempo';
  if (effectClass.includes('pivot') || effectClass === 'switch') return 'pivot';
  if (effectClass.includes('setup') || effectClass.includes('field')) return 'setup';
  if (effectClass.includes('redirection') || effectClass.includes('helping')) return 'support';
  if (usable.length) return 'damage';
  return effectClass || 'support';
}

function previewDamageSeverity(previews = []) {
  const usable = previews.filter((preview) => Number.isFinite(Number(preview?.maxPct)));
  if (!usable.length) return 'none';
  const maxPct = Math.max(...usable.map((preview) => Number(preview.maxPct || 0)));
  if (usable.some((preview) => preview.likelyKo)) return 'ko';
  if (usable.some((preview) => preview.ko) || maxPct >= 85) return 'critical';
  if (maxPct >= 55) return 'heavy';
  if (maxPct >= 30) return 'medium';
  return 'chip';
}

function buildEffectTags(action, previews = []) {
  return [
    action?.dynamicPriority ? `${action.dynamicPriority > 0 ? '+' : ''}${action.dynamicPriority} prio` : null,
    action?.isSpread || action?.targetMode === 'spread-foes' ? `Area x${Math.max(2, previews.length || 2)}` : null,
    previewDamageLabel(previews),
    previewEffectivenessLabel(previews),
    action?.canFailReason || null,
  ].filter(Boolean);
}

function getActionTargets(action, previews = []) {
  if (action?.kind === 'switch') {
    const switchMon = action.switchMon || engineState[action.side]?.[action.switchInIndex];
    return [{
      name: getDisplayName(switchMon),
      sprite: switchMon?.sprite || '',
      side: action.side,
      role: switchMon?.battle?.turnPlanRole || 'back',
    }];
  }

  if (previews.length) {
    return previews.map((preview) => ({
      name: preview.targetName || 'Objetivo',
      sprite: preview.targetSprite || '',
      side: action?.targetSide || (action?.side === 'self' ? 'enemy' : 'self'),
      role: 'target',
      hpBefore: preview.targetHpBefore,
      hpAfterMin: preview.targetHpAfterMin,
      hpAfterMax: preview.targetHpAfterMax,
    }));
  }

  if (action?.targetMode === 'spread-foes') {
    const foeSide = action.side === 'self' ? 'enemy' : 'self';
    return getActiveMons(foeSide).map(({ idx, mon }) => ({
      name: getDisplayName(mon),
      sprite: mon?.sprite || '',
      side: foeSide,
      role: mon?.battle?.turnPlanRole || (idx < 2 ? 'lead' : 'back'),
    }));
  }

  if (Number.isFinite(action?.targetIndex)) {
    const side = action.targetSide || (action.side === 'self' ? 'enemy' : 'self');
    const mon = engineState[side]?.[action.targetIndex];
    return [{
      name: getDisplayName(mon),
      sprite: mon?.sprite || '',
      side,
      role: mon?.battle?.turnPlanRole || (action.targetIndex < 2 ? 'lead' : 'back'),
    }];
  }

  if (action?.targetMode === 'self') {
    const mon = engineState[action.side]?.[action.userIndex];
    return [{ name: getDisplayName(mon), sprite: mon?.sprite || '', side: action.side, role: 'self' }];
  }

  return [{ name: 'Campo', sprite: '', side: 'field', role: 'field' }];
}

function actionMoveType(action) {
  if (!action?.moveName && !action?.move) return '';
  const info = fetchMoveInfo(action.moveName || action.move) || {};
  return String(info.type || '').toLowerCase();
}

function getThreatContext(side) {
  const ownSide = side;
  const foeSide = side === 'self' ? 'enemy' : 'self';
  const ownActives = getActiveMons(ownSide);
  const foeActives = getActiveMons(foeSide);
  return ownActives.map(({ idx, mon }) => {
    const incoming = foeActives
      .map(({ idx: foeIdx, mon: foe }) => {
        const atk = bestAttack(foe, mon, engineState.field);
        return { foeIdx, foe, atk };
      })
      .sort((a, b) => (b.atk.maxPct || 0) - (a.atk.maxPct || 0));
    return {
      idx,
      mon,
      incoming,
      lethal: incoming.some((entry) => entry.atk.ohko || (entry.atk.maxPct || 0) >= (mon.battle?.hpPct ?? 100)),
      doublePressure: incoming.filter((entry) => (entry.atk.maxPct || 0) >= 30).length >= 2,
    };
  });
}

function actionSignature(action) {
  return [
    action.kind,
    action.userIndex,
    slug(action.move || action.moveName || ''),
    action.targetMode || '',
    action.targetSide || '',
    Number.isFinite(action.targetIndex) ? action.targetIndex : '',
    Number.isFinite(action.switchInIndex) ? action.switchInIndex : '',
  ].join('|');
}

function buildCandidateActionsForMon(side, userIndex, limit = 6) {
  const mon = engineState[side]?.[userIndex];
  if (!mon) return [];
  const opponentSide = side === 'self' ? 'enemy' : 'self';
  const foes = getActiveMons(opponentSide);
  const allies = getActiveMons(side).filter((entry) => entry.idx !== userIndex);
  const threatContext = getThreatContext(side).find((entry) => entry.idx === userIndex);
  const moveActions = [];

  (mon.set?.moves || []).filter(Boolean).forEach((moveName) => {
    const info = fetchMoveInfo(moveName) || {};
    const moveId = slug(moveName);
    const prio = getDynamicPriority(moveName, mon);
    const blockReason = getActionBlockReason(mon, moveName);
    const isSupport = info.damageClass === 'status';
    const base = {
      kind: 'move',
      move: moveName,
      moveName,
      userIndex,
      side,
      actorName: getDisplayName(mon),
      actorMon: mon,
      dynamicPriority: prio,
      effectClass: 'damage',
      isSpread: false,
      isPivot: PIVOT_MOVES.has(moveId),
      isGuard: GUARD_MOVES.has(moveId),
      isRedirection: REDIRECTION_MOVES.has(moveId),
      requiresReplacement: PIVOT_MOVES.has(moveId),
      canFailReason: blockReason,
      score: 0,
      why: '',
    };

    if (isProtectMove(moveName)) {
      moveActions.push({
        ...base,
        targetSide: side,
        targetIndex: userIndex,
        targetMode: 'self',
        effectClass: 'protect',
        score: threatContext?.lethal ? 74 : threatContext?.doublePressure ? 56 : 34,
        why: threatContext?.lethal ? 'Protege un slot amenazado' : 'Compra un turno',
      });
      return;
    }

    if (REDIRECTION_MOVES.has(moveId)) {
      const allyThreatened = getThreatContext(side).some((entry) => entry.idx !== userIndex && entry.lethal);
      moveActions.push({
        ...base,
        targetSide: side,
        targetIndex: userIndex,
        targetMode: 'self',
        effectClass: 'redirection',
        score: allyThreatened ? 66 : 42,
        why: allyThreatened ? 'Redirige el foco sobre el aliado clave' : 'Compra espacio de setup',
      });
      return;
    }

    if (GUARD_MOVES.has(moveId)) {
      const spreadThreat = foes.some(({ mon: foe }) => (foe.set?.moves || []).some((foeMove) => isSpreadMove(foeMove)));
      const priorityThreat = foes.some(({ mon: foe }) => (foe.set?.moves || []).some((foeMove) => getDynamicPriority(foeMove, foe) > 0));
      moveActions.push({
        ...base,
        targetSide: side,
        targetIndex: userIndex,
        targetMode: 'self',
        effectClass: moveId.includes('wide') || moveId.includes('vasta') ? 'wide-guard' : 'quick-guard',
        score: spreadThreat || priorityThreat ? 58 : 30,
        why: moveId.includes('wide') || moveId.includes('vasta')
          ? 'Niega daño en área'
          : 'Niega prioridad rival',
      });
      return;
    }

    if (HELPING_HAND_MOVES.has(moveId) && allies.length) {
      allies.forEach(({ idx, mon: ally }) => {
        moveActions.push({
          ...base,
          targetSide: side,
          targetIndex: idx,
          targetMode: 'ally',
          effectClass: 'helping-hand',
          score: 48,
          why: `Potencia a ${getDisplayName(ally)}`,
        });
      });
      return;
    }

    if (SCREEN_MOVES.has(moveId) || FIELD_SETTER_MOVES.has(moveId) || ['tailwind', 'vientoafin', 'trickroom', 'espacioraro'].includes(moveId)) {
      const fasterFoe = foes.some(({ mon: foe }) => Math.abs(calculateSpeed(foe, opponentSide, engineState.field)) > Math.abs(calculateSpeed(mon, side, engineState.field)));
      moveActions.push({
        ...base,
        targetSide: side,
        targetIndex: userIndex,
        targetMode: 'self',
        effectClass: SPEED_CONTROL_MOVES.has(moveId) ? 'speed-control' : 'field-control',
        score: ['tailwind', 'vientoafin', 'trickroom', 'espacioraro'].includes(moveId)
          ? (fasterFoe ? 68 : 40)
          : 38,
        why: ['tailwind', 'vientoafin'].includes(moveId)
          ? 'Cambia el orden del turno'
          : ['trickroom', 'espacioraro'].includes(moveId)
            ? 'Invierte el orden de velocidad'
            : 'Refuerza el campo',
      });
      return;
    }

    if (SELF_TARGET_SETUP.has(moveId)) {
      moveActions.push({
        ...base,
        targetSide: side,
        targetIndex: userIndex,
        targetMode: 'self',
        effectClass: 'setup',
        score: threatContext?.lethal ? 18 : 46,
        why: 'Convierte al usuario en wincon',
      });
      return;
    }

    if (STATUS_TARGET_MOVES.has(moveId) || PRIORITY_CONTROL_MOVES.has(moveId)) {
      foes.forEach(({ idx, mon: foe }) => {
        const foeTags = identifyMoveTags(foe);
        const pranksterBlocked = ['prankster', 'bromista'].includes(slug(mon?.set?.ability || mon?.ability || ''))
          && isStatusMove(moveName)
          && getDynamicPriority(moveName, mon) > (MOVE_PRIORITY_LEVELS[moveId] || 0)
          && (foe.types || []).map((type) => String(type).toLowerCase()).includes('dark');
        let score = PRIORITY_CONTROL_MOVES.has(moveId) ? 66 : 44;
        if (foeTags.tailwind || foeTags.trickRoom || foeTags.redirection) score += 12;
        if (foeTags.setup) score += 8;
        moveActions.push({
          ...base,
          targetSide: opponentSide,
          targetIndex: idx,
          targetMode: 'single-target',
          effectClass: PRIORITY_CONTROL_MOVES.has(moveId) ? 'tempo' : moveId,
          score: pranksterBlocked ? 8 : score,
          canFailReason: pranksterBlocked ? 'Siniestro bloquea Bromista' : blockReason,
          why: PRIORITY_CONTROL_MOVES.has(moveId)
            ? `Corta el tempo de ${getDisplayName(foe)}`
            : `Molesta a ${getDisplayName(foe)}`,
        });
      });
      return;
    }

    if (info.damageClass !== 'status' || info.power > 0 || isSpreadMove(moveName, info)) {
      if (isSpreadMove(moveName, info)) {
        const previews = foes.map(({ mon: foe }) => projectDamagePreview(mon, foe, moveName, 'spread-foes'));
        const totalPct = sum(previews.map((preview) => preview.maxPct || 0));
        const koCount = previews.filter((preview) => preview.ko).length;
        moveActions.push({
          ...base,
          targetSide: opponentSide,
          targetMode: 'spread-foes',
          effectClass: SPEED_CONTROL_MOVES.has(moveId) ? 'spread-control' : 'spread-damage',
          isSpread: true,
          score: totalPct * 0.4 + koCount * 24 + (SPEED_CONTROL_MOVES.has(moveId) ? 16 : 0),
          why: SPEED_CONTROL_MOVES.has(moveId)
            ? 'Golpea a ambos mientras controla velocidad'
            : 'Presiona los dos slots rivales',
          previews,
        });
      } else {
        foes.forEach(({ idx, mon: foe }) => {
          const preview = projectDamagePreview(mon, foe, moveName, 'single-target');
          const mult = bestAttack(mon, foe, engineState.field).mult || 1;
          moveActions.push({
            ...base,
            targetSide: opponentSide,
            targetIndex: idx,
            targetMode: 'single-target',
            effectClass: PIVOT_MOVES.has(moveId) ? 'pivot-damage' : 'damage',
            score: (preview.maxPct || 0) * 0.52 + ((preview.ko || preview.likelyKo) ? 30 : 0) + (mult >= 2 ? 8 : 0) + (PIVOT_MOVES.has(moveId) ? 8 : 0),
            why: preview.ko
              ? `Puede tumbar a ${getDisplayName(foe)}`
              : `Presiona a ${getDisplayName(foe)}`,
            previews: [preview],
          });
        });
      }
    }
  });

  const switchOptions = getBenchIndices(side).map((benchIdx) => {
    const benchMon = engineState[side][benchIdx];
    const worst = getActiveMons(side === 'self' ? 'enemy' : 'self').reduce((max, { mon: foe }) => {
      const atk = bestAttack(foe, benchMon, engineState.field);
      return Math.max(max, atk.maxPct || 0);
    }, 0);
    const offense = getActiveMons(side === 'self' ? 'enemy' : 'self').reduce((max, { mon: foe }) => {
      const atk = bestAttack(benchMon, foe, engineState.field);
      return Math.max(max, atk.maxPct || 0);
    }, 0);
    return {
      kind: 'switch',
      side,
      userIndex,
      actorMon: mon,
      actorName: getDisplayName(mon),
      switchInIndex: benchIdx,
      switchMon: benchMon,
      dynamicPriority: 6,
      effectClass: 'switch',
      score: clamp(46 - worst * 0.35 + offense * 0.18, 12, 58),
      why: worst >= 80
        ? `Rescata a ${getDisplayName(mon)}`
        : `Reposiciona hacia ${getDisplayName(benchMon)}`,
    };
  }).sort((a, b) => b.score - a.score).slice(0, 1);

  const allActions = [...moveActions, ...switchOptions]
    .sort((a, b) => b.score - a.score || b.dynamicPriority - a.dynamicPriority)
    .filter((action, index, arr) => arr.findIndex((entry) => actionSignature(entry) === actionSignature(action)) === index)
    .slice(0, limit);

  return allActions;
}

function pairActionSignature(pair) {
  return pair.actions
    .map((action) => actionSignature(action))
    .sort()
    .join('||');
}

function scorePairSynergy(pair, side) {
  const [first, second] = pair.actions;
  if (!first || !second) return pair.score;
  let bonus = 0;
  if (first.effectClass === 'tempo' && ['setup', 'speed-control', 'field-control'].includes(second.effectClass)) bonus += 16;
  if (second.effectClass === 'tempo' && ['setup', 'speed-control', 'field-control'].includes(first.effectClass)) bonus += 16;
  if (first.effectClass === 'redirection' && ['setup', 'damage', 'pivot-damage', 'speed-control'].includes(second.effectClass)) bonus += 14;
  if (second.effectClass === 'redirection' && ['setup', 'damage', 'pivot-damage', 'speed-control'].includes(first.effectClass)) bonus += 14;
  if (first.effectClass === 'protect' && ['setup', 'field-control'].includes(second.effectClass)) bonus += 10;
  if (second.effectClass === 'protect' && ['setup', 'field-control'].includes(first.effectClass)) bonus += 10;
  if (first.targetSide && second.targetSide && first.targetSide !== side && second.targetSide !== side && first.targetIndex === second.targetIndex && Number.isFinite(first.targetIndex)) {
    bonus += 12;
  }
  pair.score += bonus;
  return pair.score;
}

function buildPairActions(side, limit = 8, actionCapPerMon = 5) {
  const actives = getActiveMons(side).filter(({ mon }) => !(mon.fainted || (mon.battle?.hpPct ?? 100) <= 0));
  if (!actives.length) return [];
  const perMon = actives.map(({ idx }) => buildCandidateActionsForMon(side, idx, actionCapPerMon));
  if (perMon.length === 1) {
    return perMon[0].map((action) => ({
      side,
      actions: [action],
      score: action.score,
      signature: actionSignature(action),
    })).slice(0, limit);
  }

  const pairs = [];
  perMon[0].forEach((first) => {
    perMon[1].forEach((second) => {
      if (first.kind === 'switch' && second.kind === 'switch' && first.switchInIndex === second.switchInIndex) return;
      const pair = {
        side,
        actions: [first, second],
        score: first.score + second.score,
      };
      scorePairSynergy(pair, side);
      pairs.push(pair);
    });
  });

  return pairs
    .sort((a, b) => b.score - a.score)
    .filter((pair, index, arr) => arr.findIndex((entry) => pairActionSignature(entry) === pairActionSignature(pair)) === index)
    .slice(0, limit)
    .map((pair) => ({
      ...pair,
      signature: pairActionSignature(pair),
    }));
}

function applyStageDelta(mon, delta = {}) {
  if (!mon?.battle?.stages) return;
  Object.entries(delta).forEach(([stat, value]) => {
    mon.battle.stages[stat] = clamp((mon.battle.stages[stat] || 0) + Number(value || 0), -6, 6);
  });
}

function applySelfSupportEffect(action) {
  const mon = engineState[action.side]?.[action.userIndex];
  if (!mon) return null;
  const moveId = slug(action.moveName || action.move);
  const sideKey = action.side;
  const ownField = engineState.field;

  if (isProtectMove(moveId)) {
    mon.battle.protected = true;
    mon.battle.protectedBy = SUPPORT_MOVE_LABELS[moveId] || formatName(action.moveName || action.move);
    return `${getDisplayName(mon)} queda protegido`;
  }

  if (['tailwind', 'vientoafin'].includes(moveId)) {
    if (sideKey === 'self') {
      ownField.tailwindSelf = true;
      ownField.tailwindSelfTurns = 4;
    } else {
      ownField.tailwindEnemy = true;
      ownField.tailwindEnemyTurns = 4;
    }
    return `${getDisplayName(mon)} activa Viento Afin`;
  }

  if (['trickroom', 'espacioraro'].includes(moveId)) {
    ownField.trickRoom = !ownField.trickRoom;
    ownField.trickRoomTurns = ownField.trickRoom ? 5 : 0;
    return `${getDisplayName(mon)} ${ownField.trickRoom ? 'activa' : 'desactiva'} Trick Room`;
  }

  if (SCREEN_MOVES.has(moveId)) {
    const suffix = sideKey === 'self' ? 'Self' : 'Enemy';
    if (['reflect', 'reflejo'].includes(moveId)) {
      ownField[`reflect${suffix}`] = true;
      ownField[`reflect${suffix}Turns`] = 5;
      return `${getDisplayName(mon)} levanta Reflejo`;
    }
    if (['lightscreen', 'pantallaluz'].includes(moveId)) {
      ownField[`lightScreen${suffix}`] = true;
      ownField[`lightScreen${suffix}Turns`] = 5;
      return `${getDisplayName(mon)} levanta Pantalla Luz`;
    }
    if (['auroraveil', 'veloaurora'].includes(moveId)) {
      ownField[`auroraVeil${suffix}`] = true;
      ownField[`auroraVeil${suffix}Turns`] = 5;
      return `${getDisplayName(mon)} levanta Velo Aurora`;
    }
  }

  if (['wideguard', 'vastaguardia'].includes(moveId)) {
    if (sideKey === 'self') ownField.wideGuardSelf = true;
    else ownField.wideGuardEnemy = true;
    return `${getDisplayName(mon)} activa Wide Guard`;
  }

  if (['quickguard', 'anticipo'].includes(moveId)) {
    if (sideKey === 'self') ownField.quickGuardSelf = true;
    else ownField.quickGuardEnemy = true;
    return `${getDisplayName(mon)} activa Quick Guard`;
  }

  if (REDIRECTION_MOVES.has(moveId)) {
    if (sideKey === 'self') ownField.redirectionSelf = action.userIndex;
    else ownField.redirectionEnemy = action.userIndex;
    return `${getDisplayName(mon)} redirige ataques`;
  }

  if (HELPING_HAND_MOVES.has(moveId) && Number.isFinite(action.targetIndex)) {
    const ally = engineState[action.side]?.[action.targetIndex];
    if (ally?.battle) ally.battle.helpingHand = true;
    return `${getDisplayName(mon)} potencia a ${getDisplayName(ally)}`;
  }

  if (SELF_TARGET_SETUP.has(moveId)) {
    applyStageDelta(mon, STAGE_DELTAS[moveId] || {});
    return `${getDisplayName(mon)} se potencia`;
  }

  return null;
}

function targetEntriesForAction(action) {
  if (action.kind !== 'move') return [];
  if (action.targetMode === 'self') {
    return [{ side: action.side, idx: action.userIndex, mon: engineState[action.side]?.[action.userIndex] }];
  }
  if (action.targetMode === 'ally' && Number.isFinite(action.targetIndex)) {
    return [{ side: action.side, idx: action.targetIndex, mon: engineState[action.side]?.[action.targetIndex] }];
  }
  if (action.targetMode === 'spread-foes') {
    const foeSide = action.side === 'self' ? 'enemy' : 'self';
    return getActiveMons(foeSide)
      .filter(({ mon }) => !(mon.fainted || (mon.battle?.hpPct ?? 100) <= 0))
      .map(({ idx, mon }) => ({ side: foeSide, idx, mon }));
  }
  if (Number.isFinite(action.targetIndex)) {
    const foeSide = action.targetSide || (action.side === 'self' ? 'enemy' : 'self');
    const targetIdx = action.targetMode === 'single-target' ? resolveRedirectTarget(foeSide, action.targetIndex) : action.targetIndex;
    return [{ side: foeSide, idx: targetIdx, mon: engineState[foeSide]?.[targetIdx] }];
  }
  return [];
}

function applyMoveSideEffects(attacker, defender, moveName, side) {
  const moveId = slug(moveName);
  if (!defender) return null;
  ensureBattle(defender, side);

  if (MOVE_STATUS_APPS[moveId] && (!defender.battle.status || defender.battle.status === 'none')) {
    defender.battle.status = MOVE_STATUS_APPS[moveId];
    return `${getDisplayName(defender)} queda ${formatName(MOVE_STATUS_APPS[moveId])}`;
  }

  if (moveId === 'taunt' || moveId === 'mofa') {
    defender.battle.taunted = true;
    defender.battle.tauntTurns = 3;
    return `${getDisplayName(defender)} queda bajo Mofa`;
  }

  if (moveId === 'encore' || moveId === 'otravez') {
    const forcedMove = defender.battle.lastMove || defender.set?.moves?.[0] || null;
    defender.battle.encoredMove = forcedMove;
    defender.battle.encoreTurns = forcedMove ? 3 : 0;
    return forcedMove ? `${getDisplayName(defender)} queda forzado a ${formatName(forcedMove)}` : `${getDisplayName(defender)} recibe Encore`;
  }

  if (moveId === 'fakeout' || moveId === 'sorpresa') {
    defender.battle.flinched = true;
    defender.battle.flinchedBy = getDisplayName(attacker);
    return `${getDisplayName(defender)} retrocede`;
  }

  if (STAGE_DELTAS[moveId]?.target || STAGE_DELTAS[moveId]?.spread) {
    applyStageDelta(defender, STAGE_DELTAS[moveId]);
    return `${getDisplayName(defender)} pierde ritmo`;
  }

  return null;
}

function computeHpPctAfterDamage(defender, damage) {
  const baseHP = calcMonHP(defender);
  const currentPct = defender.battle?.hpPct ?? 100;
  const currentHP = Math.max(1, Math.floor((baseHP * currentPct) / 100));
  const rawNewHP = Math.max(0, currentHP - (damage || 0));
  return Math.max(0, Math.floor((rawNewHP / baseHP) * 100));
}

function maybeHoldAtOne(defender, nextPct) {
  const currentPct = defender.battle?.hpPct ?? 100;
  if (currentPct < 99 || nextPct > 0) return nextPct;
  const itemId = slug(defender.set?.item || defender.item || '');
  const abilityId = slug(defender.set?.ability || defender.ability || '');
  if (['focussash', 'bandafocus'].includes(itemId)) return 1;
  if (['sturdy', 'robustez'].includes(abilityId)) return 1;
  return nextPct;
}

function performSwitch(side, fromIndex, switchInIndex) {
  const team = engineState[side];
  const nextMon = team[switchInIndex];
  const current = team[fromIndex];
  if (!nextMon || nextMon.fainted || (nextMon.battle?.hpPct ?? 100) <= 0) return null;
  team[fromIndex] = nextMon;
  team[switchInIndex] = current;
  ensureBattle(team[fromIndex], side);
  team[fromIndex].battle.enteredThisTurn = true;
  if (side === 'self') {
    engineState.activeSelfSlots = engineState.activeSelfSlots.map((idx) => (idx === fromIndex ? fromIndex : idx));
  } else {
    engineState.activeEnemySlots = engineState.activeEnemySlots.map((idx) => (idx === fromIndex ? fromIndex : idx));
  }
  applySwitchInEffects(team[fromIndex], side, engineState);
  return { inMon: team[fromIndex], outMon: current };
}

function resolveSingleAction(action, events) {
  const actor = engineState[action.side]?.[action.userIndex];
  if (!actor) return;
  ensureBattle(actor, action.side);
  const blockReason = action.kind === 'move' ? getActionBlockReason(actor, action.moveName || action.move) : (actor.fainted ? 'debilitado' : null);
  if (blockReason) {
    events.push({
      kind: 'blocked',
      side: action.side,
      actor: getDisplayName(actor),
      move: action.moveName || action.move || 'Cambio',
      reason: blockReason,
    });
    return;
  }

  if (action.kind === 'switch') {
    const switched = performSwitch(action.side, action.userIndex, action.switchInIndex);
    if (switched) {
      events.push({
        kind: 'switch',
        side: action.side,
        actor: getDisplayName(actor),
        into: getDisplayName(switched.inMon),
      });
    }
    return;
  }

  const moveName = action.moveName || action.move;
  ensureMoveRegistry(moveName);
  ensureAbilityRegistry(actor.set?.ability);
  ensureItemRegistry(actor.set?.item);
  actor.battle.lastMove = moveName;

  const selfEffectText = applySelfSupportEffect(action);
  if (selfEffectText) {
    events.push({
      kind: 'support',
      side: action.side,
      actor: getDisplayName(actor),
      move: moveName,
      text: selfEffectText,
    });
  }

  const targets = targetEntriesForAction(action);
  if (!targets.length) {
    applyMoveResolutionEffects(actor, { name: moveName, move: moveName }, { silent: true, state: engineState });
    return;
  }

  const moveCandidate = getMoveCandidate(moveName);
  moveCandidate.priority = getDynamicPriority(moveName, actor);
  if (action.targetMode === 'spread-foes') moveCandidate.isSpread = true;
  const attackerAbility = slug(actor.set?.ability || actor.ability || '');

  targets.forEach((target) => {
    const defender = target.mon;
    if (!defender) return;
    ensureBattle(defender, target.side);
    if (defender.fainted || (defender.battle?.hpPct ?? 100) <= 0) return;

    const defenderIsDark = (defender.types || []).map((type) => String(type).toLowerCase()).includes('dark');
    const pranksterBoosted = ['prankster', 'bromista'].includes(attackerAbility)
      && isStatusMove(moveName)
      && getDynamicPriority(moveName, actor) > (MOVE_PRIORITY_LEVELS[slug(moveName)] || 0);
    if (pranksterBoosted && target.side !== action.side && defenderIsDark) {
      events.push({
        kind: 'blocked',
        side: action.side,
        actor: getDisplayName(actor),
        move: moveName,
        target: getDisplayName(defender),
        reason: 'Siniestro bloquea Bromista',
      });
      return;
    }

    const result = estimateMoveDamage(actor, defender, moveCandidate, engineState.field);
    if (!result.blocked && (result.damage || 0) > 0) {
      let nextPct = computeHpPctAfterDamage(defender, result.damage);
      nextPct = maybeHoldAtOne(defender, nextPct);
      const delta = Math.max(0, (defender.battle.hpPct ?? 100) - nextPct);
      defender.battle.hpPct = nextPct;
      defender.fainted = nextPct <= 0;
      events.push({
        kind: 'hit',
        side: action.side,
        actor: getDisplayName(actor),
        move: moveName,
        target: getDisplayName(defender),
        damagePct: delta,
        hpPct: nextPct,
        isKo: defender.fainted,
        isSpread: !!moveCandidate.isSpread,
      });
    } else if (result.blocked) {
      events.push({
        kind: 'blocked',
        side: action.side,
        actor: getDisplayName(actor),
        move: moveName,
        target: getDisplayName(defender),
        reason: formatName(result.immunityData?.name || 'proteccion o inmunidad'),
      });
    }

    if (!result.blocked && !defender.fainted) {
      const sideEffect = applyMoveSideEffects(actor, defender, moveName, target.side);
      if (sideEffect) {
        events.push({
          kind: 'effect',
          side: action.side,
          actor: getDisplayName(actor),
          move: moveName,
          target: getDisplayName(defender),
          text: sideEffect,
        });
      }
    }
  });

  applyMoveResolutionEffects(actor, { name: moveName, move: moveName }, { silent: true, state: engineState });

  if (PIVOT_MOVES.has(slug(moveName)) && getBenchIndices(action.side).length) {
    const benchIdx = getBenchIndices(action.side)[0];
    const switched = performSwitch(action.side, action.userIndex, benchIdx);
    if (switched) {
      events.push({
        kind: 'pivot',
        side: action.side,
        actor: getDisplayName(actor),
        into: getDisplayName(switched.inMon),
      });
    }
  }
}

function actionOrder(pairSelf, pairEnemy) {
  const all = [...(pairSelf?.actions || []), ...(pairEnemy?.actions || [])];
  const ordered = all.map((action) => {
    const mon = engineState[action.side]?.[action.userIndex];
    return {
      action,
      prio: action.kind === 'move' ? getDynamicPriority(action.moveName || action.move, mon) : 6,
      spe: mon ? calculateSpeed(mon, action.side, engineState.field) : -999,
    };
  }).sort((a, b) => {
    if (b.prio !== a.prio) return b.prio - a.prio;
    if (b.spe !== a.spe) return b.spe - a.spe;
    return a.action.userIndex - b.action.userIndex;
  });
  return ordered;
}

function simulatePairTurn(snapshot, pairSelf, pairEnemy) {
  loadSharedSnapshot(snapshot);
  resetEngineCaches();
  warmMoveCache([...engineState.self, ...engineState.enemy]);

  const order = actionOrder(pairSelf, pairEnemy);
  const tie = order.length > 1 && order[0].prio === order[1].prio && order[0].spe === order[1].spe;
  const events = [];

  order.forEach(({ action }) => resolveSingleAction(action, events));

  tickField(engineState);
  engineState.self.forEach(advanceMonTurnState);
  engineState.enemy.forEach(advanceMonTurnState);

  const nextSnapshot = materializeSharedSnapshot();
  nextSnapshot.turn = Number(snapshot.turn || 1) + 1;
  const explainEvents = eventsToExplainEvents(events, { source: 'turn-plans-engine' });
  return {
    snapshot: nextSnapshot,
    events,
    explainEvents,
    tie,
    order: order.map(({ action, prio, spe }) => ({
      side: action.side,
      userIndex: action.userIndex,
      actor: getDisplayName(engineState[action.side]?.[action.userIndex]),
      move: action.moveName || action.move || 'Cambio',
      prio,
      spe,
    })),
  };
}

function scoreStages(mon) {
  const stages = mon?.battle?.stages || {};
  return (stages.atk || 0) * 2 + (stages.spa || 0) * 2 + (stages.spe || 0) * 2 + (stages.def || 0) + (stages.spd || 0);
}

function teamHpScore(team) {
  return sum(
    (team || []).filter(Boolean).map((mon) => {
      ensureBattle(mon, mon?.battle?.side || 'self');
      return (mon.battle.hpPct ?? 100) * (mon.fainted ? 0 : 1);
    }),
  );
}

function sideKoCount(team) {
  return (team || []).filter(Boolean).reduce((acc, mon) => acc + ((mon.fainted || (mon.battle?.hpPct ?? 100) <= 0) ? 1 : 0), 0);
}

function sideActionReady(side) {
  return getActiveMons(side).reduce((acc, { mon }) => acc + (getActionBlockReason(mon) ? 0 : 1), 0);
}

function fieldControlScore(snapshot, side) {
  const own = side === 'self';
  let score = 0;
  if ((own && snapshot.field.tailwindSelf) || (!own && snapshot.field.tailwindEnemy)) score += 18;
  if (snapshot.field.trickRoom) {
    const ownSpeed = getActiveMons(side).reduce((acc, entry) => acc + Math.abs(calculateSpeed(entry.mon, side, snapshot.field)), 0);
    const foeSide = side === 'self' ? 'enemy' : 'self';
    const foeSpeed = getActiveMons(foeSide).reduce((acc, entry) => acc + Math.abs(calculateSpeed(entry.mon, foeSide, snapshot.field)), 0);
    score += ownSpeed < foeSpeed ? 14 : -8;
  }
  return score;
}

function evaluateBoard(snapshot, side) {
  loadSharedSnapshot(snapshot);
  const foeSide = side === 'self' ? 'enemy' : 'self';
  const ownHp = teamHpScore(engineState[side]);
  const foeHp = teamHpScore(engineState[foeSide]);
  const ownKo = sideKoCount(engineState[side]);
  const foeKo = sideKoCount(engineState[foeSide]);
  const ownActionReady = sideActionReady(side);
  const foeActionReady = sideActionReady(foeSide);
  const stageEdge = sum((engineState[side] || []).filter(Boolean).map(scoreStages)) - sum((engineState[foeSide] || []).filter(Boolean).map(scoreStages));
  const benchHealth = getBenchIndices(side).reduce((acc, idx) => acc + (engineState[side][idx]?.battle?.hpPct ?? 0), 0) - getBenchIndices(foeSide).reduce((acc, idx) => acc + (engineState[foeSide][idx]?.battle?.hpPct ?? 0), 0);
  return (
    (ownHp - foeHp) * 0.35
    + (foeKo - ownKo) * 58
    + (ownActionReady - foeActionReady) * 18
    + fieldControlScore(snapshot, side)
    + stageEdge * 3
    + benchHealth * 0.06
  );
}

function softmaxWeights(items) {
  if (!items.length) return [];
  const maxScore = Math.max(...items.map((item) => item.score));
  const raw = items.map((item) => Math.exp((item.score - maxScore) / 18));
  const total = sum(raw) || 1;
  return items.map((item, index) => ({
    ...item,
    weight: raw[index] / total,
  }));
}

function chooseBestTurnTwoLine(snapshot, side, options) {
  loadSharedSnapshot(snapshot);
  const ownPairs = buildPairActions(side, Math.max(4, Math.min(options.beamWidth || 6, 8)), options.actionCapPerMon || 5);
  const foeSide = side === 'self' ? 'enemy' : 'self';
  const enemyPairs = softmaxWeights(
    buildPairActions(foeSide, Math.max(3, Math.min((options.beamWidth || 6) - 1, 6)), options.actionCapPerMon || 5),
  );

  if (!ownPairs.length) {
    return {
      line: null,
      score: evaluateBoard(snapshot, side),
      enemyLikely: enemyPairs[0] || null,
    };
  }

  let best = null;
  ownPairs.forEach((ownPair) => {
    let expected = 0;
    let worst = Infinity;
    enemyPairs.forEach((enemyPair) => {
      const result = simulatePairTurn(snapshot, side === 'self' ? ownPair : enemyPair, side === 'self' ? enemyPair : ownPair);
      const score = evaluateBoard(result.snapshot, side) - (result.tie ? 8 : 0);
      expected += score * (enemyPair.weight || 0);
      worst = Math.min(worst, score);
    });
    const finalScore = expected * 0.82 + worst * 0.18;
    if (!best || finalScore > best.score) {
      best = {
        line: ownPair,
        score: finalScore,
        expected,
        worst,
        enemyLikely: enemyPairs[0] || null,
      };
    }
  });

  return best || {
    line: ownPairs[0],
    score: evaluateBoard(snapshot, side),
    enemyLikely: enemyPairs[0] || null,
  };
}

function summarizePair(pair) {
  if (!pair) return [];
  return (pair.actions || []).map((action) => {
    const previews = action.previews || [];
    const targets = getActionTargets(action, previews);
    const primaryTarget = targets[0] || {};
    const damageRangeLabel = previewDamageLabel(previews);
    const effectivenessLabel = previewEffectivenessLabel(previews);
    return {
      actor: action.actorName || getDisplayName(action.actorMon),
      actorSprite: action.actorMon?.sprite || '',
      actorSide: action.side || '',
      move: action.moveName || action.move || (action.kind === 'switch' ? 'Cambio' : 'Accion'),
      effectClass: action.effectClass,
      type: action.kind === 'switch' ? '' : actionMoveType(action),
      isSpread: !!action.isSpread || action.targetMode === 'spread-foes',
      damageRangeLabel,
      effectivenessLabel,
      riskNote: action.canFailReason || '',
      target: action.targetMode === 'spread-foes'
        ? 'Ambos rivales'
        : primaryTarget.name || 'Campo',
      targetSprite: primaryTarget.sprite || '',
      targetSide: primaryTarget.side || action.targetSide || '',
      targetRole: primaryTarget.role || '',
      targetSprites: targets.map((target) => target.sprite).filter(Boolean),
      targetHpBefore: primaryTarget.hpBefore,
      targetHpAfter: Number.isFinite(primaryTarget.hpAfterMax) ? primaryTarget.hpAfterMax : undefined,
      targetHpAfterMin: primaryTarget.hpAfterMin,
      targetHpAfterMax: primaryTarget.hpAfterMax,
      targets,
      outcomeKind: previewOutcomeKind(action, previews),
      damageSeverity: previewDamageSeverity(previews),
      effectTags: buildEffectTags(action, previews),
      priority: action.dynamicPriority,
      why: action.why,
    };
  });
}

function buildPlanNarrative(mainPair, enemyLikelyResult, enemyWorstResult, plan, enemyPlan) {
  const selfActions = summarizePair(mainPair);
  const enemyLikely = summarizePair(enemyLikelyResult?.pair);
  const enemyWorst = summarizePair(enemyWorstResult?.pair);
  const why = [];
  const breakers = [];
  const selfLabel = selfActions.map((item) => `${item.actor}: ${formatName(item.move)}`).join(' + ');
  if (selfLabel) why.push(`La línea abre con ${selfLabel}.`);
  if (enemyLikely.length) {
    why.push(`La respuesta rival más probable es ${enemyLikely.map((item) => `${item.actor}: ${formatName(item.move)}`).join(' + ')}.`);
  }
  if (enemyWorst.length && enemyWorstResult?.pair?.signature !== enemyLikelyResult?.pair?.signature) {
    breakers.push(`El castigo máximo aparece si responden con ${enemyWorst.map((item) => `${item.actor}: ${formatName(item.move)}`).join(' + ')}.`);
  }
  if (enemyPlan.notes?.length) breakers.push(`Su bring más probable gira alrededor de ${enemyPlan.notes.join(' / ')}.`);
  if (plan.backLabels && Object.values(plan.backLabels).includes('safe-pivot')) {
    const pivotMon = Object.keys(plan.backLabels).find((key) => plan.backLabels[key] === 'safe-pivot');
    if (pivotMon) why.push(`${formatName(pivotMon)} queda reservado como pivot seguro.`);
  }
  return { why, breakers };
}

function formatSnapshotState(snapshot) {
  return {
    self: snapshot.self.slice(0, 4).map((mon, idx) => ({
      name: getDisplayName(mon),
      sprite: mon?.sprite || '',
      hpPct: mon?.battle?.hpPct ?? 0,
      status: mon?.battle?.status || 'none',
      fainted: !!mon?.fainted,
      isActive: snapshot.activeSelfSlots.includes(idx),
      role: snapshot.meta?.selfLabels?.[mon?.name] || (idx < 2 ? 'lead' : 'back'),
      stages: deepClone(mon?.battle?.stages) || { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    })),
    enemy: snapshot.enemy.slice(0, 4).map((mon, idx) => ({
      name: getDisplayName(mon),
      sprite: mon?.sprite || '',
      hpPct: mon?.battle?.hpPct ?? 0,
      status: mon?.battle?.status || 'none',
      fainted: !!mon?.fainted,
      isActive: snapshot.activeEnemySlots.includes(idx),
      role: snapshot.meta?.enemyLabels?.[mon?.name] || (idx < 2 ? 'lead' : 'back'),
      stages: deepClone(mon?.battle?.stages) || { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    })),
    field: describeField(snapshot.field),
  };
}

function confidenceFromPlan(rootScore, continuationScore, enemyLikelyResult, enemyWorstResult, extraPenalty = 0) {
  let confidence = 0.56;
  const gap = Math.max(0, rootScore - (enemyWorstResult?.score ?? rootScore));
  confidence += Math.min(0.14, gap / 180);
  confidence += Math.min(0.08, Math.max(0, continuationScore) / 520);
  if (enemyLikelyResult?.tie) confidence -= 0.08;
  if (enemyWorstResult?.tie) confidence -= 0.05;
  confidence -= extraPenalty;
  return Number(clamp(confidence, 0.34, 0.9).toFixed(2));
}

function actionHeadlinePart(action) {
  if (!action) return null;
  const target = action.target || 'Campo';
  if (action.outcomeKind === 'ko-secure') return `KO ${target}`;
  if (action.outcomeKind === 'ko-possible') return `KO posible ${target}`;
  if (action.outcomeKind === 'blocked') return `Bloqueo ${target}`;
  if (action.outcomeKind === 'protect') return `Protege ${action.actor}`;
  if (action.outcomeKind === 'tempo') return `Tempo ${action.actor}`;
  if (action.outcomeKind === 'pivot' || action.effectClass === 'switch') return `Pivot ${action.actor}`;
  if (action.outcomeKind === 'spread') return `Area rival`;
  if (action.effectClass === 'setup') return `Setup ${action.actor}`;
  if (action.effectClass === 'redirection') return `Redireccion`;
  if (action.effectClass === 'speed-control') return `Control velocidad`;
  return `Presion ${target}`;
}

function buildPlanHeadline(actions = []) {
  const parts = actions.map(actionHeadlinePart).filter(Boolean).slice(0, 2);
  return parts.length ? parts.join(' + ') : 'Linea estable de apertura';
}

function buildPreviewBadges(actions = [], confidence = 0, fieldSummary = '') {
  const badges = [];
  if (fieldSummary && fieldSummary !== 'Campo neutro') badges.push({ kind: 'field', label: fieldSummary });
  actions.forEach((action) => {
    if (action.outcomeKind === 'ko-secure') badges.push({ kind: 'ko', label: `KO ${action.target}` });
    else if (action.outcomeKind === 'ko-possible') badges.push({ kind: 'ko-possible', label: `KO? ${action.target}` });
    else if (action.isSpread) badges.push({ kind: 'spread', label: 'Area x2' });
    else if (action.priority) badges.push({ kind: 'priority', label: `${action.priority > 0 ? '+' : ''}${action.priority} prio` });
    else if (action.effectClass === 'speed-control') badges.push({ kind: 'tempo', label: 'Speed control' });
  });
  if (confidence >= 0.72) badges.push({ kind: 'safe', label: 'Alta confianza' });
  return badges.slice(0, 5);
}

function planRiskLevel(confidence, breakers = [], worstResult = null) {
  if (confidence < 0.48 || breakers.length >= 3) return 'high';
  if (worstResult?.score < 0 || confidence < 0.58 || breakers.length) return 'medium';
  return 'low';
}

function flattenSnapshotSide(snapshot, side) {
  return (snapshot?.[side] || []).slice(0, 4).map((mon, idx) => ({
    side,
    idx,
    name: getDisplayName(mon),
    sprite: mon?.sprite || '',
    hpPct: Math.max(0, Math.round(mon?.battle?.hpPct ?? 0)),
    fainted: !!mon?.fainted || (mon?.battle?.hpPct ?? 0) <= 0,
  }));
}

function buildBoardDeltaSummary(before, after) {
  if (!before || !after) return [];
  const beforeMons = [...flattenSnapshotSide(before, 'self'), ...flattenSnapshotSide(before, 'enemy')];
  const afterMons = [...flattenSnapshotSide(after, 'self'), ...flattenSnapshotSide(after, 'enemy')];
  return afterMons.map((next) => {
    const prev = beforeMons.find((item) => item.side === next.side && item.idx === next.idx);
    if (!prev) return null;
    const delta = next.hpPct - prev.hpPct;
    const kind = next.fainted && !prev.fainted ? 'ko' : delta < 0 ? 'damage' : delta > 0 ? 'heal' : 'stable';
    return {
      side: next.side,
      name: next.name,
      sprite: next.sprite,
      beforeHp: prev.hpPct,
      afterHp: next.hpPct,
      delta,
      kind,
      fainted: next.fainted,
    };
  })
    .filter((item) => item && (item.kind !== 'stable' || item.fainted))
    .sort((a, b) => {
      const rank = { ko: 3, damage: 2, heal: 1, stable: 0 };
      return (rank[b.kind] || 0) - (rank[a.kind] || 0) || Math.abs(b.delta) - Math.abs(a.delta);
    })
    .slice(0, 5);
}

function buildPlanTacticalSummary(opening) {
  try {
    const snapshot = createBattleSnapshot({
      selfTeam: opening.self || [],
      enemyTeam: opening.enemy || [],
      field: opening.field || {},
      activeSelfSlots: opening.activeSelfSlots || [0, 1],
      activeEnemySlots: opening.activeEnemySlots || [0, 1],
      turn: opening.turn || 1,
      phase: 'turn-plan',
      source: 'turn-plans-engine',
    });
    return buildTacticalSummary(snapshot, {
      highlightLimit: 5,
      minThreatSeverity: 'medium',
      includeActionEvidence: false,
      includeGraph: false,
    });
  } catch (error) {
    return {
      highlights: [],
      threatRows: [],
      summary: {
        unsupported: ['turn-plan-tactical-summary-failed'],
        error: error?.message || String(error),
      },
    };
  }
}

function buildPlanForCombo(plan, enemyPredictions, options = {}) {
  const mainEnemy = enemyPredictions[0];
  const opening = buildSnapshotFromBring(plan, mainEnemy, options.field || {});
  loadSharedSnapshot(opening);
  resetEngineCaches();
  warmMoveCache([...engineState.self, ...engineState.enemy]);

  const selfPairs = buildPairActions('self', options.beamWidth || 6, options.actionCapPerMon || 5);
  const enemyPairsWeighted = softmaxWeights(
    buildPairActions('enemy', Math.max(4, Math.min((options.beamWidth || 6) + 1, 8)), options.actionCapPerMon || 5),
  );

  let bestRoot = null;
  selfPairs.forEach((selfPair) => {
    let expected = 0;
    let worst = null;
    let likely = null;

    enemyPairsWeighted.forEach((enemyPair, index) => {
      const result = simulatePairTurn(opening, selfPair, enemyPair);
      const turnTwo = chooseBestTurnTwoLine(result.snapshot, 'self', options);
      const totalScore = evaluateBoard(result.snapshot, 'self') * 0.38 + turnTwo.score * 0.62 - (result.tie ? 8 : 0);
      const scored = {
        pair: enemyPair,
        result,
        score: totalScore,
        continuation: turnTwo,
        weight: enemyPair.weight || 0,
        tie: result.tie,
      };
      expected += totalScore * scored.weight;
      if (!worst || totalScore < worst.score) worst = scored;
      if (index === 0) likely = scored;
    });

    const robustnessPenalty = enemyPredictions.slice(1).reduce((acc, altEnemy) => {
      const altOpening = buildSnapshotFromBring(plan, altEnemy, options.field || {});
      const firstEnemyPair = softmaxWeights(buildPairActions('enemy', 3, options.actionCapPerMon || 5))[0];
      if (!firstEnemyPair) return acc;
      const altResult = simulatePairTurn(altOpening, selfPair, firstEnemyPair);
      const altScore = evaluateBoard(altResult.snapshot, 'self');
      return acc + Math.max(0, 40 - altScore) * 0.08;
    }, 0);

    const finalScore = expected - robustnessPenalty + (worst ? worst.score * 0.1 : 0);
    if (!bestRoot || finalScore > bestRoot.score) {
      bestRoot = {
        pair: selfPair,
        score: finalScore,
        expected,
        worst,
        likely,
        robustnessPenalty,
      };
    }
  });

  if (!bestRoot) return null;

  const likelyContinuation = bestRoot.likely?.continuation || null;
  const narrative = buildPlanNarrative(bestRoot.pair, bestRoot.likely, bestRoot.worst, plan, mainEnemy);
  const openingScore = evaluateBoard(opening, 'self');
  const confidence = confidenceFromPlan(openingScore, likelyContinuation?.score || bestRoot.score, bestRoot.likely, bestRoot.worst, bestRoot.robustnessPenalty * 0.004);
  const leadNotes = leadPairSynergy(plan.mons[0], plan.mons[1]).notes;
  const enemyLeadNotes = leadPairSynergy(mainEnemy.mons[0], mainEnemy.mons[1]).notes;
  const mainActions = summarizePair(bestRoot.pair);
  const likelyActions = bestRoot.likely ? summarizePair(bestRoot.likely.pair) : [];
  const worstActions = bestRoot.worst ? summarizePair(bestRoot.worst.pair) : [];
  const fieldSummary = describeField(opening.field);
  const likelySnapshot = bestRoot.likely?.result?.snapshot || opening;
  const deltaSummary = buildBoardDeltaSummary(opening, likelySnapshot);
  const breakers = narrative.breakers;
  const tacticalSummary = buildPlanTacticalSummary(opening);
  const tacticalFindings = (tacticalSummary.highlights || []).slice(0, 4);

  return {
    id: `plan-${comboKey(plan.indices)}-vs-${comboKey(mainEnemy.indices)}`,
    headline: buildPlanHeadline(mainActions),
    tacticalSignature: buildPlanHeadline(mainActions),
    riskLevel: planRiskLevel(confidence, breakers, bestRoot.worst),
    enemyOverrideActive: !!mainEnemy.forced,
    deltaSummary,
    previewBadges: buildPreviewBadges(mainActions, confidence, fieldSummary),
    tacticalFindings,
    unsupportedMechanics: tacticalSummary.summary?.unsupported || [],
    confidenceNotes: tacticalFindings.map((finding) => ({
      family: finding.family,
      level: finding.confidence?.level || 'medium',
      value: finding.confidence?.value ?? null,
      label: finding.label || finding.message || finding.family,
    })),
    selfBringIndices: [...(plan.orderedIdx || plan.indices || [])],
    selfLeadIndices: [...(plan.leadIndices || (plan.orderedIdx || plan.indices || []).slice(0, 2))],
    selfBackIndices: [...(plan.backIndices || (plan.orderedIdx || plan.indices || []).slice(2, 4))],
    enemyBringIndices: [...(mainEnemy.orderedIdx || mainEnemy.indices || [])],
    enemyLeadIndices: [...(mainEnemy.leads || (mainEnemy.orderedIdx || mainEnemy.indices || []).slice(0, 2))],
    enemyBackIndices: [...(mainEnemy.backs || (mainEnemy.orderedIdx || mainEnemy.indices || []).slice(2, 4))],
    bring: plan.mons.map((mon) => ({
      name: getDisplayName(mon),
      sprite: mon?.sprite || '',
      role: plan.backLabels?.[mon?.name] || (plan.mons.indexOf(mon) < 2 ? 'lead' : 'back'),
    })),
    leads: plan.mons.slice(0, 2).map((mon) => ({ name: getDisplayName(mon), sprite: mon?.sprite || '' })),
    backs: plan.mons.slice(2).map((mon) => ({
      name: getDisplayName(mon),
      sprite: mon?.sprite || '',
      role: plan.backLabels?.[mon?.name] || 'back',
    })),
    predictedEnemyBring: mainEnemy.mons.map((mon) => ({
      name: getDisplayName(mon),
      sprite: mon?.sprite || '',
      role: mainEnemy.backLabels?.[mon?.name] || (mainEnemy.mons.indexOf(mon) < 2 ? 'lead' : 'back'),
    })),
    predictedEnemyLeads: mainEnemy.mons.slice(0, 2).map((mon) => ({ name: getDisplayName(mon), sprite: mon?.sprite || '' })),
    mainLine: {
      turn: 1,
      actions: mainActions,
      boardDelta: deltaSummary,
      snapshot: formatSnapshotState(likelySnapshot),
      order: deepClone(bestRoot.likely?.result?.order || []),
      explainEvents: deepClone(bestRoot.likely?.result?.explainEvents || []),
      score: Math.round(bestRoot.score),
    },
    enemyLikelyResponse: bestRoot.likely
      ? {
          actions: likelyActions,
          events: deepClone(bestRoot.likely.result.events || []),
          explainEvents: deepClone(bestRoot.likely.result.explainEvents || []),
          score: Math.round(bestRoot.likely.score),
          snapshot: formatSnapshotState(bestRoot.likely.result.snapshot),
        }
      : null,
    contingencies: [
      bestRoot.worst && bestRoot.worst.pair?.signature !== bestRoot.likely?.pair?.signature
        ? {
            label: 'Castigo máximo',
            actions: worstActions,
            events: deepClone(bestRoot.worst.result.events || []),
            explainEvents: deepClone(bestRoot.worst.result.explainEvents || []),
            snapshot: formatSnapshotState(bestRoot.worst.result.snapshot),
            score: Math.round(bestRoot.worst.score),
          }
        : null,
      likelyContinuation?.line
        ? {
            label: 'Turno 2 recomendado',
            actions: summarizePair(likelyContinuation.line),
            snapshot: bestRoot.likely?.result?.snapshot ? formatSnapshotState(bestRoot.likely.result.snapshot) : null,
            score: Math.round(likelyContinuation.score),
          }
        : null,
    ].filter(Boolean),
    score: Math.round(bestRoot.score),
    confidence,
    why: [
      ...narrative.why,
      leadNotes.length ? `Tus leads amenazan con ${leadNotes.join(' / ')}.` : null,
      enemyLeadNotes.length ? `El rival más probable abre con ${enemyLeadNotes.join(' / ')}.` : null,
    ].filter(Boolean),
    breakers,
    fieldSummary,
    explainEvents: deepClone(bestRoot.likely?.result?.explainEvents || []),
    debug: {
      rootPairs: selfPairs.length,
      enemyPairs: enemyPairsWeighted.length,
      predictedEnemyBrings: enemyPredictions.map((entry) => comboKey(entry.indices)),
      openingScore,
      robustnessPenalty: Number(bestRoot.robustnessPenalty.toFixed(2)),
    },
  };
}

function summarizeTopInputTeams(input) {
  return {
    selfCount: (input.selfTeam || []).filter(Boolean).length,
    enemyCount: (input.enemyTeam || []).filter(Boolean).length,
    mode: input.mode || 'quick',
  };
}

export function buildTurnPlansSnapshot(input = {}, options = {}) {
  const battleSnapshot = input.battleSnapshot || createBattleSnapshot({
    selfTeam: input.selfTeam || [],
    enemyTeam: input.enemyTeam || [],
    field: input.field || {},
    activeSelfSlots: input.activeSelfSlots || [0, 1],
    activeEnemySlots: input.activeEnemySlots || [0, 1],
    turn: input.turn || 1,
    phase: input.mode === 'quick' ? 'preview' : 'analysis',
    source: 'turn-plans-engine-adapter',
  });
  const snapshotKey = input.snapshotKey || buildSnapshotCacheKey(battleSnapshot);
  const legacyState = snapshotToLegacySimulationState(battleSnapshot);
  const planningInput = {
    ...input,
    selfTeam: legacyState.self,
    enemyTeam: legacyState.enemy,
    field: legacyState.field,
    activeSelfSlots: legacyState.activeSelfSlots,
    activeEnemySlots: legacyState.activeEnemySlots,
  };
  const info = summarizeTopInputTeams(planningInput);
  if (info.selfCount < 4 || info.enemyCount < 4) {
    return {
      plans: [],
      debug: { reason: 'not-enough-pokemon', info, snapshotKey },
    };
  }

  const selfTeam = deepClone(planningInput.selfTeam || []);
  const enemyTeam = deepClone(planningInput.enemyTeam || []);
  const preferredIndices = (planningInput.preferredOwnCombo || []).slice(0, 4);
  const normalizedCombos = normalizeComboEntries(selfTeam, planningInput.ownCombos || [], preferredIndices);

  const plans = [];
  const ownLimit = Math.max(1, planningInput.topOwnCombos || 3);
  const enemyLimit = Math.max(1, planningInput.topEnemyCombos || 3);

  warmMoveCache([...selfTeam, ...enemyTeam]);

  normalizedCombos.slice(0, ownLimit).forEach((combo) => {
    const mons = combo.orderedIdx.map((idx) => selfTeam[idx]).filter(Boolean);
    const leadMons = combo.leads.map((idx) => selfTeam[idx]).filter(Boolean);
    const ordered = leadMons.length === 2
      ? [...leadMons, ...mons.filter((mon) => !leadMons.includes(mon))]
      : mons;
    const backs = classifyBackline(ordered.slice(2), enemyTeam, 'self');
    const finalMons = [ordered[0], ordered[1], ...backs.ordered];
    const finalIndices = finalMons.map((mon) => selfTeam.indexOf(mon)).filter((idx) => idx >= 0);
    const ownPlan = {
      indices: combo.indices,
      orderedIdx: finalIndices,
      leadIndices: finalIndices.slice(0, 2),
      backIndices: finalIndices.slice(2),
      mons: finalMons,
      backLabels: backs.labels,
      score: combo.score,
      planType: combo.planType,
    };
    const enemyPredictions = buildEnemyPredictions(enemyTeam, ownPlan, enemyLimit, planningInput.forcedEnemyIndices || []);
    const plan = buildPlanForCombo(ownPlan, enemyPredictions, planningInput);
    if (plan) {
      plans.push(plan);
      if (typeof options.onProgress === 'function') {
        options.onProgress({
          plans: deepClone(plans),
          debug: {
            combo: comboKey(combo.indices),
            computed: plans.length,
            total: Math.min(normalizedCombos.length, ownLimit),
            snapshotKey,
          },
        });
      }
    }
  });

  plans.sort((a, b) => (b.score - a.score) || (b.confidence - a.confidence));

  return {
    plans: plans.slice(0, planningInput.displayLimit || ownLimit),
    debug: {
      info,
      comboKeys: normalizedCombos.map((combo) => comboKey(combo.indices)),
      snapshotKey,
      snapshotVersion: battleSnapshot.version,
      rulesVersion: battleSnapshot.rulesVersion,
      dataVersion: battleSnapshot.dataVersion,
      generatedAt: Date.now(),
    },
  };
}
