import {
  CanonicalDex,
  canonicalizeStatus,
  canonicalizeTerrain,
  canonicalizeWeather,
  getCanonicalAbility,
  getCanonicalItem,
  getCanonicalMove,
  getCanonicalSpecies,
  resolveCanonicalId,
  toCanonicalId,
} from '../data/canonical/dex.js';
import { createConfidence } from './explain.js';

export const BATTLE_SNAPSHOT_VERSION = 'battle-snapshot-v1';
export const BATTLE_RULES_VERSION = 'battle-rules-infra-v1';
export const CANDIDATE_ACTION_VERSION = 'candidate-action-v1';
export const DATA_VERSION = `canonical-dex:${CanonicalDex.metadata?.version || 'unknown'}:${CanonicalDex.metadata?.sourcePriority?.[0] || 'unknown'}`;

const DEFAULT_FIELD = Object.freeze({
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
  quickGuardSelf: false,
  wideGuardSelf: false,
  quickGuardEnemy: false,
  wideGuardEnemy: false,
  redirectionSelf: null,
  redirectionEnemy: null,
  hazards: {
    self: { rocks: false, spikes: 0, tspikes: 0, web: false },
    enemy: { rocks: false, spikes: 0, tspikes: 0, web: false },
  },
});

function clonePlain(value) {
  if (value == null) return value;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function sortedPlain(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortedPlain);
  const out = {};
  Object.keys(value).sort().forEach((key) => {
    const item = value[key];
    if (item !== undefined && typeof item !== 'function') out[key] = sortedPlain(item);
  });
  return out;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(sortedPlain(value));
}

function clampStage(value) {
  const numeric = Number(value || 0);
  return Math.max(-6, Math.min(6, Number.isFinite(numeric) ? numeric : 0));
}

function normalizeStages(stages = {}) {
  return {
    atk: clampStage(stages.atk),
    def: clampStage(stages.def),
    spa: clampStage(stages.spa),
    spd: clampStage(stages.spd),
    spe: clampStage(stages.spe),
  };
}

function normalizeEvs(evs = {}) {
  return {
    hp: Number(evs.hp || 0),
    atk: Number(evs.atk ?? evs.attack ?? 0),
    def: Number(evs.def ?? evs.defense ?? 0),
    spa: Number(evs.spa ?? evs['special-attack'] ?? 0),
    spd: Number(evs.spd ?? evs['special-defense'] ?? 0),
    spe: Number(evs.spe ?? evs.speed ?? 0),
  };
}

function normalizeIvs(ivs = {}) {
  return {
    hp: Number(ivs.hp ?? 31),
    atk: Number(ivs.atk ?? ivs.attack ?? 31),
    def: Number(ivs.def ?? ivs.defense ?? 31),
    spa: Number(ivs.spa ?? ivs['special-attack'] ?? 31),
    spd: Number(ivs.spd ?? ivs['special-defense'] ?? 31),
    spe: Number(ivs.spe ?? ivs.speed ?? 31),
  };
}

function normalizeBaseStats(mon = {}, species = null) {
  const stats = mon.baseStats || {};
  const speciesStats = species?.baseStats || {};
  return {
    hp: Number(stats.hp ?? speciesStats.hp ?? 80),
    atk: Number(stats.atk ?? stats.attack ?? speciesStats.atk ?? 80),
    def: Number(stats.def ?? stats.defense ?? speciesStats.def ?? 80),
    spa: Number(stats.spa ?? stats['special-attack'] ?? speciesStats.spa ?? 80),
    spd: Number(stats.spd ?? stats['special-defense'] ?? speciesStats.spd ?? 80),
    spe: Number(stats.spe ?? stats.speed ?? speciesStats.spe ?? 80),
  };
}

function normalizeMove(move) {
  const id = resolveCanonicalId('moves', move) || toCanonicalId(move);
  const entry = getCanonicalMove(id);
  return {
    id,
    name: String(move || ''),
    displayName: entry?.displayName || entry?.name || String(move || ''),
    type: entry?.type || null,
    category: entry?.category || null,
    priority: Number.isFinite(entry?.priority) ? entry.priority : 0,
    targetMode: entry?.targetMode || entry?.target || 'normal',
    flags: entry?.flags || {},
  };
}

function normalizeSet(mon = {}) {
  const set = mon.set || {};
  const abilityName = set.ability || mon.ability || '';
  const itemName = set.item || mon.item || '';
  const abilityId = resolveCanonicalId('abilities', abilityName) || toCanonicalId(abilityName);
  const itemId = resolveCanonicalId('items', itemName) || toCanonicalId(itemName);
  return {
    level: Number(set.level || mon.level || 50),
    nature: set.nature || '',
    ability: getCanonicalAbility(abilityId)?.displayName || abilityName || '',
    abilityId,
    item: getCanonicalItem(itemId)?.displayName || itemName || '',
    itemId,
    teraType: set.teraType ? String(set.teraType).toLowerCase() : null,
    evs: normalizeEvs(set.evs || {}),
    ivs: normalizeIvs(set.ivs || {}),
    moves: (set.moves || []).filter(Boolean).map(normalizeMove),
    source: set.source || mon.setSource || null,
  };
}

function normalizeVolatiles(battle = {}) {
  return {
    protected: !!battle.protected,
    protectedBy: battle.protectedBy || null,
    flinched: !!battle.flinched,
    flinchedBy: battle.flinchedBy || null,
    taunted: !!battle.taunted,
    tauntTurns: Number(battle.tauntTurns || 0),
    encoredMove: battle.encoredMove || null,
    encoreTurns: Number(battle.encoreTurns || 0),
    choiceLocked: battle.choiceLocked || null,
    helpingHand: !!battle.helpingHand,
    enteredThisTurn: !!battle.enteredThisTurn,
    lastMove: battle.lastMove || null,
  };
}

export function pokemonToBattleState(mon, {
  side,
  index,
  active = false,
  role = active ? 'active' : 'back',
} = {}) {
  if (!mon) return null;
  const speciesId = mon.canonicalId || resolveCanonicalId('species', mon.name || mon.displayName) || toCanonicalId(mon.name || mon.displayName);
  const species = getCanonicalSpecies(speciesId);
  const battle = mon.battle || {};
  const hpPct = Math.max(0, Math.min(100, Number.isFinite(battle.hpPct) ? battle.hpPct : 100));
  return {
    schema: 'PokemonBattleState',
    side,
    index,
    slotKey: `${side}:${index}`,
    active: !!active,
    role,
    speciesId,
    baseSpeciesId: species?.baseSpeciesId || speciesId,
    activeForm: battle.activeForm || species?.forme || species?.form || speciesId,
    displayName: mon.displayName || species?.displayName || species?.name || mon.name || speciesId,
    sprite: mon.sprite || '',
    dexSprite: species?.sprite || '',
    types: (mon.types || species?.types || []).map((type) => String(type).toLowerCase()),
    weightKg: Number(mon.weightKg ?? mon.weightkg ?? species?.weightkg ?? species?.weightKg ?? species?.weight ?? 0) || null,
    baseStats: normalizeBaseStats(mon, species),
    set: normalizeSet(mon),
    hpPct,
    fainted: !!mon.fainted || hpPct <= 0,
    status: canonicalizeStatus(battle.status || null),
    stages: normalizeStages(battle.stages || {}),
    volatiles: normalizeVolatiles(battle),
    itemState: {
      consumed: !!battle.itemConsumed,
      sashIntact: battle.sashIntact ?? (resolveCanonicalId('items', mon.set?.item || mon.item) === 'focussash'),
    },
    abilityState: {
      suppressed: !!battle.abilitySuppressed,
    },
    flags: {
      grounded: battle.grounded ?? null,
      pendingSwitch: battle.pendingSwitch || null,
    },
    sourceRef: {
      appName: mon.name || null,
      appDisplayName: mon.displayName || null,
      canonicalId: speciesId,
    },
  };
}

function sideConditionsFromField(field = {}, side = 'self') {
  const suffix = side === 'self' ? 'Self' : 'Enemy';
  return {
    tailwind: !!field[`tailwind${suffix}`],
    tailwindTurns: Number(field[`tailwind${suffix}Turns`] || 0),
    reflect: !!field[`reflect${suffix}`],
    reflectTurns: Number(field[`reflect${suffix}Turns`] || 0),
    lightScreen: !!field[`lightScreen${suffix}`],
    lightScreenTurns: Number(field[`lightScreen${suffix}Turns`] || 0),
    auroraVeil: !!field[`auroraVeil${suffix}`],
    auroraVeilTurns: Number(field[`auroraVeil${suffix}Turns`] || 0),
    quickGuard: !!field[`quickGuard${suffix}`],
    wideGuard: !!field[`wideGuard${suffix}`],
    redirection: field[`redirection${suffix}`] || null,
    hazards: clonePlain(field.hazards?.[side] || DEFAULT_FIELD.hazards[side]),
  };
}

export function createSideState(side, team = [], {
  activeSlots = side === 'self' ? [0, 1] : [0, 1],
  field = {},
  roles = {},
} = {}) {
  const activeSet = new Set((activeSlots || []).map(Number));
  const slots = (team || []).slice(0, 6).map((mon, index) => ({
    schema: 'SlotState',
    side,
    index,
    slotKey: `${side}:${index}`,
    active: activeSet.has(index),
    empty: !mon,
    pokemon: mon ? pokemonToBattleState(mon, {
      side,
      index,
      active: activeSet.has(index),
      role: roles?.[mon.name] || roles?.[index] || (activeSet.has(index) ? 'lead' : 'back'),
    }) : null,
    pendingSwitch: null,
  }));
  return {
    schema: 'SideState',
    side,
    activeSlots: [...activeSet].sort((a, b) => a - b),
    sideConditions: sideConditionsFromField(field, side),
    slots,
  };
}

export function normalizeFieldState(field = {}) {
  const f = { ...clonePlain(DEFAULT_FIELD), ...clonePlain(field || {}) };
  f.hazards = {
    self: { ...DEFAULT_FIELD.hazards.self, ...(field?.hazards?.self || {}) },
    enemy: { ...DEFAULT_FIELD.hazards.enemy, ...(field?.hazards?.enemy || {}) },
  };
  return {
    schema: 'FieldState',
    weather: canonicalizeWeather(f.weather),
    weatherTurns: Number(f.weatherTurns || 0),
    terrain: canonicalizeTerrain(f.terrain),
    terrainTurns: Number(f.terrainTurns || 0),
    trickRoom: !!f.trickRoom,
    trickRoomTurns: Number(f.trickRoomTurns || 0),
    globalConditions: clonePlain(f.globalConditions || {}),
    raw: {
      quickGuardSelf: !!f.quickGuardSelf,
      wideGuardSelf: !!f.wideGuardSelf,
      quickGuardEnemy: !!f.quickGuardEnemy,
      wideGuardEnemy: !!f.wideGuardEnemy,
      redirectionSelf: f.redirectionSelf || null,
      redirectionEnemy: f.redirectionEnemy || null,
    },
    legacy: f,
  };
}

export function createBattleSnapshot({
  selfTeam = [],
  enemyTeam = [],
  field = {},
  activeSelfSlots = [0, 1],
  activeEnemySlots = [0, 1],
  turn = 1,
  phase = 'preview',
  format = 'vgc-doubles',
  source = 'adapter',
  meta = {},
  explainEvents = [],
  unsupportedMechanics = [],
  confidence = 1,
} = {}) {
  const fieldState = normalizeFieldState(field);
  const snapshot = {
    schema: 'BattleSnapshot',
    version: BATTLE_SNAPSHOT_VERSION,
    rulesVersion: BATTLE_RULES_VERSION,
    dataVersion: DATA_VERSION,
    format,
    turn: Number(turn || 1),
    phase,
    field: fieldState,
    sides: {
      self: createSideState('self', selfTeam, {
        activeSlots: activeSelfSlots,
        field: fieldState.legacy,
        roles: meta.selfLabels || {},
      }),
      enemy: createSideState('enemy', enemyTeam, {
        activeSlots: activeEnemySlots,
        field: fieldState.legacy,
        roles: meta.enemyLabels || {},
      }),
    },
    meta: {
      source,
      appRefs: clonePlain(meta.appRefs || {}),
      planner: clonePlain(meta.planner || {}),
      labels: {
        self: clonePlain(meta.selfLabels || {}),
        enemy: clonePlain(meta.enemyLabels || {}),
      },
      confidence: createConfidence(typeof confidence === 'number' ? { value: confidence } : confidence),
      unsupportedMechanics: [...new Set((unsupportedMechanics || []).filter(Boolean).map(String))],
      explainEvents: clonePlain(explainEvents || []),
    },
  };
  return deepFreeze(sortedPlain(snapshot));
}

export function createBattleSnapshotFromAppState(appState = {}, options = {}) {
  return createBattleSnapshot({
    selfTeam: options.selfTeam || appState.self || [],
    enemyTeam: options.enemyTeam || appState.enemy || [],
    field: options.field || appState.field || {},
    activeSelfSlots: options.activeSelfSlots || appState.activeSelfSlots || appState.leads?.self || [0, 1],
    activeEnemySlots: options.activeEnemySlots || appState.activeEnemySlots || appState.leads?.enemy || [0, 1],
    turn: options.turn || appState.turn1Battle?.turn || 1,
    phase: options.phase || (appState.turn1Battle?.active ? 'live' : 'preview'),
    source: options.source || 'app-state-adapter',
    meta: options.meta || {},
    confidence: options.confidence ?? 1,
  });
}

export function serializeBattleSnapshot(snapshot) {
  return stableStringify(snapshot);
}

export function hydrateBattleSnapshot(serializedOrSnapshot) {
  const parsed = typeof serializedOrSnapshot === 'string'
    ? JSON.parse(serializedOrSnapshot)
    : clonePlain(serializedOrSnapshot);
  return deepFreeze(sortedPlain(parsed));
}

export function cloneBattleSnapshot(snapshot) {
  return hydrateBattleSnapshot(serializeBattleSnapshot(snapshot));
}

function legacyFieldFromSnapshot(snapshot) {
  const legacy = clonePlain(snapshot.field?.legacy || {});
  const self = snapshot.sides?.self?.sideConditions || {};
  const enemy = snapshot.sides?.enemy?.sideConditions || {};
  return {
    ...legacy,
    weather: snapshot.field?.weather || null,
    weatherTurns: snapshot.field?.weatherTurns || 0,
    terrain: snapshot.field?.terrain || null,
    terrainTurns: snapshot.field?.terrainTurns || 0,
    trickRoom: !!snapshot.field?.trickRoom,
    trickRoomTurns: snapshot.field?.trickRoomTurns || 0,
    tailwindSelf: !!self.tailwind,
    tailwindSelfTurns: self.tailwindTurns || 0,
    tailwindEnemy: !!enemy.tailwind,
    tailwindEnemyTurns: enemy.tailwindTurns || 0,
    reflectSelf: !!self.reflect,
    reflectSelfTurns: self.reflectTurns || 0,
    reflectEnemy: !!enemy.reflect,
    reflectEnemyTurns: enemy.reflectTurns || 0,
    lightScreenSelf: !!self.lightScreen,
    lightScreenSelfTurns: self.lightScreenTurns || 0,
    lightScreenEnemy: !!enemy.lightScreen,
    lightScreenEnemyTurns: enemy.lightScreenTurns || 0,
    auroraVeilSelf: !!self.auroraVeil,
    auroraVeilSelfTurns: self.auroraVeilTurns || 0,
    auroraVeilEnemy: !!enemy.auroraVeil,
    auroraVeilEnemyTurns: enemy.auroraVeilTurns || 0,
    quickGuardSelf: !!self.quickGuard,
    wideGuardSelf: !!self.wideGuard,
    quickGuardEnemy: !!enemy.quickGuard,
    wideGuardEnemy: !!enemy.wideGuard,
    redirectionSelf: self.redirection || null,
    redirectionEnemy: enemy.redirection || null,
    hazards: {
      self: clonePlain(self.hazards || DEFAULT_FIELD.hazards.self),
      enemy: clonePlain(enemy.hazards || DEFAULT_FIELD.hazards.enemy),
    },
  };
}

function legacyMonFromPokemonState(pokemon) {
  if (!pokemon) return null;
  const species = getCanonicalSpecies(pokemon.speciesId);
  const setMoves = (pokemon.set?.moves || []).map((move) => move.name || move.id).filter(Boolean);
  const mon = {
    id: species?.num || 0,
    name: pokemon.sourceRef?.appName || pokemon.speciesId,
    displayName: pokemon.displayName,
    sprite: pokemon.sprite,
    activeForm: pokemon.activeForm || pokemon.speciesId,
    weightKg: pokemon.weightKg || species?.weightkg || species?.weightKg || null,
    types: [...(pokemon.types || [])],
    baseStats: {
      hp: pokemon.baseStats.hp,
      attack: pokemon.baseStats.atk,
      defense: pokemon.baseStats.def,
      'special-attack': pokemon.baseStats.spa,
      'special-defense': pokemon.baseStats.spd,
      speed: pokemon.baseStats.spe,
      atk: pokemon.baseStats.atk,
      def: pokemon.baseStats.def,
      spa: pokemon.baseStats.spa,
      spd: pokemon.baseStats.spd,
      spe: pokemon.baseStats.spe,
    },
    set: {
      level: pokemon.set?.level || 50,
      ability: pokemon.set?.ability || '',
      item: pokemon.set?.item || '',
      nature: pokemon.set?.nature || '',
      evs: clonePlain(pokemon.set?.evs || {}),
      ivs: clonePlain(pokemon.set?.ivs || {}),
      moves: setMoves,
      teraType: pokemon.set?.teraType || null,
    },
    battle: {
      side: pokemon.side,
      hpPct: pokemon.hpPct,
      status: pokemon.status || 'none',
      stages: clonePlain(pokemon.stages || {}),
      sashIntact: pokemon.itemState?.sashIntact ?? false,
      itemConsumed: pokemon.itemState?.consumed ?? false,
      abilitySuppressed: pokemon.abilityState?.suppressed ?? false,
      ...(clonePlain(pokemon.volatiles || {})),
    },
    fainted: !!pokemon.fainted,
    canonicalId: pokemon.speciesId,
    canonical: species || null,
  };
  return mon;
}

function legacyTeamFromSide(sideState) {
  return (sideState?.slots || []).map((slot) => legacyMonFromPokemonState(slot.pokemon));
}

export function snapshotToLegacySimulationState(snapshot) {
  const hydrated = hydrateBattleSnapshot(snapshot);
  return {
    self: legacyTeamFromSide(hydrated.sides?.self),
    enemy: legacyTeamFromSide(hydrated.sides?.enemy),
    field: legacyFieldFromSnapshot(hydrated),
    activeSelfSlots: [...(hydrated.sides?.self?.activeSlots || [0, 1])],
    activeEnemySlots: [...(hydrated.sides?.enemy?.activeSlots || [0, 1])],
    leads: {
      self: [...(hydrated.sides?.self?.activeSlots || [0, 1])],
      enemy: [...(hydrated.sides?.enemy?.activeSlots || [0, 1])],
    },
    turn: hydrated.turn || 1,
    meta: clonePlain(hydrated.meta || {}),
  };
}

export function createCandidateAction({
  id = null,
  side = 'self',
  userSlot = 0,
  kind = 'move',
  move = null,
  targetSide = null,
  targetSlot = null,
  targetMode = null,
  priority = 0,
  effectClass = 'damage',
  flags = {},
  confidence = 1,
  unsupported = [],
  data = {},
} = {}) {
  const moveId = move ? resolveCanonicalId('moves', move) || toCanonicalId(move) : null;
  const moveEntry = moveId ? getCanonicalMove(moveId) : null;
  return {
    schema: CANDIDATE_ACTION_VERSION,
    id: id || `${side}:${userSlot}:${kind}:${moveId || targetSlot || 'none'}`,
    side,
    userSlot,
    kind,
    moveId,
    moveName: moveEntry?.displayName || moveEntry?.name || move || null,
    targetSide,
    targetSlot,
    targetMode: targetMode || moveEntry?.targetMode || moveEntry?.target || null,
    dynamicPriority: Number.isFinite(priority) ? priority : (moveEntry?.priority || 0),
    effectClass,
    flags: { ...(moveEntry?.flags || {}), ...(flags || {}) },
    confidence: createConfidence(typeof confidence === 'number' ? { value: confidence } : confidence),
    unsupported: [...new Set((unsupported || []).filter(Boolean).map(String))],
    data: clonePlain(data || {}),
  };
}
