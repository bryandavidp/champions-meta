import {
  getCanonicalMove,
  toCanonicalId,
} from '../data/canonical/dex.js';
import { createConfidence } from '../battle/explain.js';
import {
  estimateActionOutcome,
  generateLegalActions,
  isGrounded,
  resolvePriority,
  resolveTargets,
} from '../battle/action-core.js';
import {
  ANTI_STAT_DROP_ABILITIES,
  FIELD_TERRAIN_MOVES,
  FIELD_WEATHER_MOVES,
  FAKE_OUT_MOVES,
  HELPING_HAND_MOVES,
  PRIORITY_DENIAL_ABILITIES,
  PROTECT_MOVES,
  QUICK_GUARD_MOVES,
  REDIRECTION_MOVES,
  SCREEN_MOVES,
  STAT_DROP_BLOCK_ABILITIES,
  STAT_DROP_BLOCK_ITEMS,
  TAILWIND_MOVES,
  TRICK_ROOM_MOVES,
  WIDE_GUARD_MOVES,
  getSwitchInTerrain,
  getSwitchInWeather,
  isProtoQuarkFieldActive,
  isWeatherSpeedAbility,
} from '../battle/rule-registry.js';

export const SYNERGY_ENGINE_VERSION = 'synergy-engine-v1';
export const TACTICAL_FINDING_VERSION = 'tactical-finding-v1';
export const THREAT_GRAPH_VERSION = 'threat-graph-v1';

export const SYNERGY_FAMILIES = Object.freeze({
  SPEED_CONTROL: 'speed-control',
  WEATHER_CORE: 'weather-core',
  TERRAIN_CORE: 'terrain-core',
  FAKE_OUT_SETUP: 'fakeout-setup',
  REDIRECTION_SETUP: 'redirection-setup',
  SPREAD_ABUSE: 'spread-abuse',
  IMMUNITY_CORE: 'immunity-core',
  ANTI_INTIMIDATE: 'anti-intimidate',
  PRIORITY_GAMES: 'priority-games',
  PRIORITY_DENIAL: 'priority-denial',
  SETUP_SUPPORT: 'setup-support',
  DEFENSIVE_LAYERING: 'defensive-layering',
  TRAP_PERISH_LOCK: 'trap-perish-lock',
  ALLY_PROTECTED_NUKE: 'ally-protected-nuke',
  STATUS_PRESSURE: 'status-pressure',
  VARIABLE_POWER_WINCON: 'variable-power-wincon',
  LATE_GAME_CLEANER: 'late-game-cleaner',
  PARTNER_ENABLED_ENGINE: 'partner-enabled-engine',
  INDIVIDUAL_THREAT: 'individual-threat',
  PAIR_THREAT: 'pair-threat',
  GLOBAL_ENGINE: 'global-engine',
  WIN_CONDITION: 'win-condition',
});

const SIDES = ['self', 'enemy'];
const HIGH_DAMAGE_PCT = 60;
const CHIP_DAMAGE_PCT = 30;

const VARIABLE_POWER_MOVES = new Set([
  'eruption',
  'waterspout',
  'flail',
  'reversal',
  'gyroball',
  'electroball',
  'lowkick',
  'grassknot',
  'heavyslam',
  'heatcrash',
  'storedpower',
  'powertrip',
  'ragefist',
  'lastrespects',
  'hex',
  'acrobatics',
]);

const TRAP_LOCK_MOVES = new Set([
  'perishsong',
  'meanlook',
  'block',
  'spiderweb',
  'encore',
  'disable',
  'taunt',
]);

const TRAP_LOCK_ABILITIES = new Set(['shadowtag', 'arenatrap', 'magnetpull']);
const SETUP_FALLBACK_MOVES = new Set([
  'swordsdance',
  'nastyplot',
  'calmmind',
  'dragondance',
  'quiverdance',
  'bellydrum',
  'bulkup',
  'coil',
  'shellsmash',
]);
const WEATHER_ABUSE_MOVES = new Set([
  'weatherball',
  'solarbeam',
  'solarblade',
  'thunder',
  'hurricane',
  'hydropump',
  'eruption',
  'blizzard',
]);

const STATUS_PRESSURE_MOVES = new Set([
  'spore',
  'sleeppowder',
  'thunderwave',
  'willowisp',
  'toxic',
  'taunt',
  'encore',
  'disable',
  'yawn',
  'memento',
]);

function slug(value) {
  return toCanonicalId(value || '');
}

function sideKey(side) {
  return side === 'enemy' ? 'enemy' : 'self';
}

function otherSide(side) {
  return sideKey(side) === 'self' ? 'enemy' : 'self';
}

function sideState(snapshot, side) {
  return snapshot?.sides?.[sideKey(side)] || null;
}

function slotState(snapshot, side, slotIndex) {
  return sideState(snapshot, side)?.slots?.[Number(slotIndex)] || null;
}

function pokemonAt(snapshot, side, slotIndex) {
  return slotState(snapshot, side, slotIndex)?.pokemon || null;
}

function isAlive(pokemon) {
  return !!pokemon && !pokemon.fainted && (pokemon.hpPct ?? 0) > 0;
}

function activeRefs(snapshot, side) {
  const currentSide = sideState(snapshot, side);
  return (currentSide?.activeSlots || [])
    .map(Number)
    .filter((slot) => isAlive(pokemonAt(snapshot, side, slot)))
    .map((slot) => ({
      side: sideKey(side),
      slot,
      slotIndex: slot,
      pokemon: pokemonAt(snapshot, side, slot),
    }));
}

function displayName(pokemon) {
  return pokemon?.displayName || pokemon?.set?.species || pokemon?.speciesId || 'Pokemon';
}

function abilityId(pokemon) {
  if (pokemon?.abilityState?.suppressed) return '';
  return pokemon?.set?.abilityId || slug(pokemon?.set?.ability || pokemon?.ability || '');
}

function itemId(pokemon) {
  if (pokemon?.itemState?.consumed) return '';
  return pokemon?.set?.itemId || slug(pokemon?.set?.item || pokemon?.item || '');
}

function moveId(actionOrMove) {
  return slug(actionOrMove?.moveId || actionOrMove?.id || actionOrMove?.moveName || actionOrMove?.name || '');
}

function moveEntry(actionOrMove) {
  const id = moveId(actionOrMove);
  return id ? getCanonicalMove(id) : null;
}

function actionLabel(action) {
  return action?.moveName || moveEntry(action)?.displayName || moveEntry(action)?.name || action?.moveId || action?.kind || 'accion';
}

function pokemonNodeId(ref) {
  return `pokemon:${ref.side}:${ref.slot}`;
}

function actionNodeId(entry) {
  return `action:${entry.action.id}`;
}

function fieldNodeId(kind, value) {
  return `field:${kind}:${value || 'none'}`;
}

function makeSubject(type, data) {
  return {
    type,
    side: data.side ?? null,
    slot: data.slot ?? null,
    id: data.id ?? null,
    label: data.label || data.id || type,
  };
}

function pokemonSubject(ref) {
  return makeSubject('pokemon', {
    side: ref.side,
    slot: ref.slot,
    id: ref.pokemon?.speciesId || slug(displayName(ref.pokemon)),
    label: displayName(ref.pokemon),
  });
}

function actionSubject(entry) {
  return makeSubject('action', {
    side: entry.side,
    slot: entry.slot,
    id: entry.action.moveId || entry.action.id,
    label: actionLabel(entry.action),
  });
}

function fieldSubject(kind, value) {
  return makeSubject('field', {
    id: fieldNodeId(kind, value),
    label: value ? `${kind}:${value}` : kind,
  });
}

function makeEvidence(type, data = {}) {
  return {
    type,
    source: SYNERGY_ENGINE_VERSION,
    ...data,
  };
}

function severityRank(severity) {
  return {
    critical: 4,
    high: 3,
    medium: 2,
    watch: 1,
    info: 0,
  }[severity] ?? 0;
}

function scopeForFamily(family) {
  if ([
    SYNERGY_FAMILIES.WEATHER_CORE,
    SYNERGY_FAMILIES.TERRAIN_CORE,
    SYNERGY_FAMILIES.PRIORITY_DENIAL,
    SYNERGY_FAMILIES.DEFENSIVE_LAYERING,
  ].includes(family)) return 'global';
  if ([
    SYNERGY_FAMILIES.LATE_GAME_CLEANER,
    SYNERGY_FAMILIES.VARIABLE_POWER_WINCON,
    SYNERGY_FAMILIES.WIN_CONDITION,
  ].includes(family)) return 'wincon';
  if ([
    SYNERGY_FAMILIES.INDIVIDUAL_THREAT,
    SYNERGY_FAMILIES.STATUS_PRESSURE,
    SYNERGY_FAMILIES.PRIORITY_GAMES,
  ].includes(family)) return 'individual';
  return 'pair';
}

function defaultResponse(family, side) {
  const foeLabel = side === 'enemy' ? 'rival' : 'propio';
  const responses = {
    [SYNERGY_FAMILIES.SPEED_CONTROL]: `Disputa el tempo ${foeLabel}: Taunt, Fake Out, KO al setter o cambia a un pivot que sobreviva al nuevo orden.`,
    [SYNERGY_FAMILIES.WEATHER_CORE]: `Rompe el clima, elimina al abuser o fuerza Protect antes de que el core convierta el turno en ventaja de velocidad/dano.`,
    [SYNERGY_FAMILIES.TERRAIN_CORE]: `Cambia terreno, usa objetivos no grounded o evita depender de prioridad si el terreno la bloquea.`,
    [SYNERGY_FAMILIES.FAKE_OUT_SETUP]: `Protege el objetivo clave, bloquea Fake Out o presiona al setter antes de que gane el turno gratis.`,
    [SYNERGY_FAMILIES.REDIRECTION_SETUP]: `Usa spread, Taunt, Safety Goggles o elimina al redirector antes de apuntar al wincon.`,
    [SYNERGY_FAMILIES.SPREAD_ABUSE]: `Considera Wide Guard, Protect escalonado, inmunidades del compañero y reposicionamiento.`,
    [SYNERGY_FAMILIES.IMMUNITY_CORE]: `No castigues al aliado inmune: apunta al habilitador o usa ataques single target que no activen absorciones.`,
    [SYNERGY_FAMILIES.ANTI_INTIMIDATE]: `Evita regalar boosts con Intimidate; prioriza dano directo, Taunt o drops no bloqueados.`,
    [SYNERGY_FAMILIES.PRIORITY_GAMES]: `Revisa Psychic Terrain, Armor Tail, Quick Guard y targets grounded antes de confiar en prioridad.`,
    [SYNERGY_FAMILIES.PRIORITY_DENIAL]: `No bases el turno en prioridad al lado bloqueado; juega daño normal, spread o cambia campo.`,
    [SYNERGY_FAMILIES.SETUP_SUPPORT]: `Ataca al habilitador o fuerza al sweeper a proteger antes de que reciba apoyo.`,
    [SYNERGY_FAMILIES.DEFENSIVE_LAYERING]: `Rompe pantallas/guards con spread alternativo, Taunt o turnos de posicionamiento.`,
    [SYNERGY_FAMILIES.TRAP_PERISH_LOCK]: `Conserva cambios libres, presiona al trapper y no dejes encerrada la win condition.`,
    [SYNERGY_FAMILIES.ALLY_PROTECTED_NUKE]: `Ataca con spread, castiga al usuario de Protect/redirect o reposiciona la resistencia principal.`,
    [SYNERGY_FAMILIES.STATUS_PRESSURE]: `Usa Taunt, Misty Terrain, Grass type, Safety Goggles o un switch inmune al estado relevante.`,
    [SYNERGY_FAMILIES.VARIABLE_POWER_WINCON]: `Reduce HP, corta boosts o cambia el orden de velocidad para bajar la potencia variable.`,
    [SYNERGY_FAMILIES.LATE_GAME_CLEANER]: `Conserva checks de velocidad, prioridad bloqueante o Intimidate si no activa anti-drop.`,
    [SYNERGY_FAMILIES.PARTNER_ENABLED_ENGINE]: `Rompe el eslabon habilitador: campo, support o target protegido.`,
  };
  return responses[family] || 'Revisa la evidencia y prioriza el eslabon que habilita la amenaza.';
}

export function createTacticalFinding({
  id = null,
  family,
  side = null,
  severity = 'info',
  scope = null,
  subjects = [],
  evidence = [],
  userMessage = '',
  recommendedResponse = null,
  confidence = 0.75,
  tags = [],
} = {}) {
  const cleanFamily = family || SYNERGY_FAMILIES.GLOBAL_ENGINE;
  const cleanSubjects = (subjects || []).filter(Boolean);
  const subjectKey = cleanSubjects.map((subject) => `${subject.type}:${subject.side ?? ''}:${subject.slot ?? ''}:${subject.id ?? ''}`).join('|');
  const cleanId = id || `${cleanFamily}:${side || 'any'}:${subjectKey || userMessage}`;
  return {
    schema: TACTICAL_FINDING_VERSION,
    id: cleanId,
    family: cleanFamily,
    severity,
    scope: scope || scopeForFamily(cleanFamily),
    side,
    subjects: cleanSubjects,
    evidence: (evidence || []).filter(Boolean),
    userMessage,
    recommendedResponse: recommendedResponse || defaultResponse(cleanFamily, side),
    confidence: createConfidence(typeof confidence === 'number' ? { value: confidence } : confidence),
    tags: [...new Set((tags || []).filter(Boolean).map(String))],
  };
}

function createGraph(snapshot) {
  const graph = {
    schema: THREAT_GRAPH_VERSION,
    version: SYNERGY_ENGINE_VERSION,
    nodes: [],
    edges: [],
  };
  const nodeIds = new Set();
  const edgeIds = new Set();
  const addNode = (node) => {
    if (!node?.id || nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    graph.nodes.push(node);
  };
  const addEdge = (edge) => {
    const id = edge.id || `${edge.from}->${edge.to}:${edge.type}:${edge.family || ''}`;
    if (!edge.from || !edge.to || edgeIds.has(id)) return;
    edgeIds.add(id);
    graph.edges.push({ id, ...edge });
  };

  for (const side of SIDES) {
    for (const ref of activeRefs(snapshot, side)) {
      addNode({
        id: pokemonNodeId(ref),
        type: 'pokemon',
        side,
        slot: ref.slot,
        label: displayName(ref.pokemon),
        hpPct: ref.pokemon?.hpPct ?? 100,
        ability: abilityId(ref.pokemon) || null,
        item: itemId(ref.pokemon) || null,
      });
    }
  }

  if (snapshot?.field?.weather) {
    addNode({
      id: fieldNodeId('weather', snapshot.field.weather),
      type: 'field',
      kind: 'weather',
      label: `Weather: ${snapshot.field.weather}`,
    });
  }
  if (snapshot?.field?.terrain) {
    addNode({
      id: fieldNodeId('terrain', snapshot.field.terrain),
      type: 'field',
      kind: 'terrain',
      label: `Terrain: ${snapshot.field.terrain}`,
    });
  }
  if (snapshot?.field?.trickRoom) {
    addNode({
      id: fieldNodeId('room', 'trickroom'),
      type: 'field',
      kind: 'room',
      label: 'Trick Room',
    });
  }

  return { graph, addNode, addEdge };
}

function outcomeSummary(action, outcome) {
  const results = outcome?.results || [];
  const targets = outcome?.targets || [];
  const hitResults = results.filter((result) => !result.blocked && (result.maxDamage || 0) > 0);
  const blockedResults = results.filter((result) => result.blocked);
  const maxPct = results.reduce((max, result) => Math.max(max, result.maxPct || 0), 0);
  const koCount = results.filter((result) => (result.maxPct || 0) >= 100 || result.survival?.survives).length;
  const hardKoCount = results.filter((result) => (result.maxPct || 0) >= 100 && !result.survival?.survives).length;
  return {
    targetCount: targets.length,
    hitCount: hitResults.length,
    blockedCount: blockedResults.length,
    blockedReasons: [...new Set(blockedResults.map((result) => result.blockReason).filter(Boolean))],
    maxPct,
    minPct: results.reduce((max, result) => Math.max(max, result.minPct || 0), 0),
    koCount,
    hardKoCount,
    isSpread: !!action?.flags?.isSpread || ['allAdjacent', 'allAdjacentFoes', 'all'].includes(action?.targetMode),
    resultTypes: [...new Set(results.map((result) => result.type).filter(Boolean))],
  };
}

function hasPositiveBoost(boosts) {
  return Object.values(boosts || {}).some((value) => Number(value) > 0);
}

function isSetupAction(action, move) {
  const id = moveId(action);
  if (SETUP_FALLBACK_MOVES.has(id)) return true;
  if (hasPositiveBoost(move?.selfBoosts)) return true;
  if (hasPositiveBoost(move?.boosts) && ['self', 'adjacentAllyOrSelf'].includes(action.targetMode)) return true;
  return false;
}

function isStatusPressureAction(action, move) {
  const id = moveId(action);
  if (STATUS_PRESSURE_MOVES.has(id)) return true;
  if (move?.status || move?.volatileStatus) return action.targetSide && action.targetSide !== action.side;
  if (move?.flags?.powder && action.targetSide && action.targetSide !== action.side) return true;
  return false;
}

function weatherAbuseReason(action, move, actor, snapshot) {
  const id = moveId(action);
  const weather = snapshot?.field?.weather;
  if (!weather) return null;
  if (isWeatherSpeedAbility(abilityId(actor), weather)) return `ability:${abilityId(actor)}:${weather}`;
  if (WEATHER_ABUSE_MOVES.has(id)) return `move:${id}:${weather}`;
  if (move?.callbacks?.basePower || move?.callbacks?.type || move?.callbacks?.accuracy) return `callback:${id}:${weather}`;
  return null;
}

function terrainAbuseReason(action, move, actor, snapshot) {
  const terrain = snapshot?.field?.terrain;
  if (!terrain) return null;
  const item = itemId(actor);
  if (terrain === 'psychic' && (action.dynamicPriority || 0) > 0) return 'terrain-priority-denial-risk';
  if (item === `${terrain}seed`) return `seed:${item}`;
  if (move?.type === terrain || (terrain === 'psychic' && move?.type === 'psychic')) return `boosted-type:${terrain}`;
  if (isProtoQuarkFieldActive(abilityId(actor), snapshot.field || {})) return `proto-quark:${abilityId(actor)}`;
  return null;
}

function deriveActionTags(snapshot, ref, action, outcome) {
  const tags = new Set();
  const move = moveEntry(action);
  const id = moveId(action);
  const summary = outcomeSummary(action, outcome);
  const priority = resolvePriority(action, snapshot);

  tags.add(action.kind || 'move');
  if (action.effectClass) tags.add(action.effectClass);
  if (priority > 0) tags.add('priority');
  if (summary.isSpread) tags.add('spread');
  if (summary.maxPct >= HIGH_DAMAGE_PCT) tags.add('high-damage');
  if (summary.maxPct >= CHIP_DAMAGE_PCT) tags.add('chip-pressure');
  if (summary.hardKoCount > 0) tags.add('ko-pressure');
  if (summary.koCount > 0) tags.add('ko-range');
  if (summary.blockedCount > 0) tags.add('blocked-target');
  if (summary.hitCount >= 2) tags.add('multi-target-damage');
  if (action.flags?.isGuard || QUICK_GUARD_MOVES.has(id) || WIDE_GUARD_MOVES.has(id)) tags.add('guard');
  if (action.flags?.isRedirection || REDIRECTION_MOVES.has(id)) tags.add('redirection');
  if (PROTECT_MOVES.has(id)) tags.add('protect');
  if (FAKE_OUT_MOVES.has(id)) tags.add('fake-out');
  if (HELPING_HAND_MOVES.has(id)) tags.add('helping-hand');
  if (TAILWIND_MOVES.has(id) || TRICK_ROOM_MOVES.has(id)) tags.add('speed-control');
  if (FIELD_WEATHER_MOVES.has(id)) tags.add('weather-setter');
  if (FIELD_TERRAIN_MOVES.has(id)) tags.add('terrain-setter');
  if (SCREEN_MOVES.has(id)) tags.add('screen');
  if (VARIABLE_POWER_MOVES.has(id) || move?.callbacks?.basePower) tags.add('variable-power');
  if (isSetupAction(action, move)) tags.add('setup');
  if (isStatusPressureAction(action, move)) tags.add('status-pressure');
  if (TRAP_LOCK_MOVES.has(id)) tags.add('trap-lock');
  const weatherReason = weatherAbuseReason(action, move, ref.pokemon, snapshot);
  if (weatherReason) tags.add('weather-abuser');
  const terrainReason = terrainAbuseReason(action, move, ref.pokemon, snapshot);
  if (terrainReason) tags.add('terrain-abuser');

  return {
    tags: [...tags],
    summary,
    priority,
    move,
    weatherReason,
    terrainReason,
  };
}

function buildActionCatalog(snapshot, graphTools, options = {}) {
  const includeSwitches = options.includeSwitches ?? false;
  const catalog = { self: [], enemy: [] };
  for (const side of SIDES) {
    for (const ref of activeRefs(snapshot, side)) {
      const actions = generateLegalActions(snapshot, side, ref.slot, { includeSwitches });
      for (const action of actions) {
        if (action.flags?.legal === false && !options.includeIllegal) continue;
        const outcome = estimateActionOutcome(snapshot, action);
        const targets = resolveTargets(action, snapshot);
        const derived = deriveActionTags(snapshot, ref, action, outcome);
        const entry = {
          id: action.id,
          side,
          slot: ref.slot,
          actor: ref.pokemon,
          actorRef: ref,
          action,
          move: derived.move,
          moveId: moveId(action),
          effectClass: action.effectClass,
          tags: derived.tags,
          priority: derived.priority,
          summary: derived.summary,
          outcome,
          targets,
          weatherReason: derived.weatherReason,
          terrainReason: derived.terrainReason,
        };
        catalog[side].push(entry);

        if (graphTools) {
          const actionNode = {
            id: actionNodeId(entry),
            type: 'action',
            side,
            slot: ref.slot,
            label: actionLabel(action),
            family: action.effectClass,
            priority: derived.priority,
            tags: derived.tags,
          };
          graphTools.addNode(actionNode);
          graphTools.addEdge({
            from: pokemonNodeId(ref),
            to: actionNode.id,
            type: 'can-use',
            family: action.effectClass,
            confidence: action.confidence?.value ?? 0.8,
          });
          for (const target of targets) {
            const targetId = pokemonNodeId(target);
            if (target.pokemon) {
              graphTools.addNode({
                id: targetId,
                type: 'pokemon',
                side: target.side,
                slot: target.slot,
                label: displayName(target.pokemon),
                hpPct: target.pokemon.hpPct ?? 100,
                ability: abilityId(target.pokemon) || null,
                item: itemId(target.pokemon) || null,
              });
              graphTools.addEdge({
                from: actionNode.id,
                to: targetId,
                type: side === target.side ? 'supports' : 'targets',
                family: derived.tags.includes('spread') ? SYNERGY_FAMILIES.SPREAD_ABUSE : action.effectClass,
                confidence: 0.8,
              });
            }
          }
        }
      }
    }
  }
  return catalog;
}

function bestBy(entries, predicate, sort = null) {
  const list = entries.filter(predicate);
  if (sort) list.sort(sort);
  return list[0] || null;
}

function sortByDamage(a, b) {
  return (b.summary.maxPct || 0) - (a.summary.maxPct || 0);
}

function hasTag(entry, tag) {
  return entry?.tags?.includes(tag);
}

function evidenceForEntry(entry, type = 'action') {
  return makeEvidence(type, {
    actionId: entry.action.id,
    moveId: entry.moveId,
    actor: displayName(entry.actor),
    side: entry.side,
    slot: entry.slot,
    tags: entry.tags,
    outcome: {
      maxPct: entry.summary.maxPct,
      koCount: entry.summary.koCount,
      hardKoCount: entry.summary.hardKoCount,
      hitCount: entry.summary.hitCount,
      blockedReasons: entry.summary.blockedReasons,
    },
  });
}

function addUniqueFinding(findings, finding) {
  if (!finding) return;
  if (findings.some((entry) => entry.id === finding.id)) return;
  findings.push(finding);
}

function activeWeatherSources(snapshot, side, catalog) {
  const sources = [];
  for (const ref of activeRefs(snapshot, side)) {
    const weather = getSwitchInWeather(abilityId(ref.pokemon));
    if (weather) sources.push({ kind: 'ability', ref, weather, id: abilityId(ref.pokemon) });
  }
  for (const entry of catalog[side].filter((item) => hasTag(item, 'weather-setter'))) {
    sources.push({ kind: 'action', entry, weather: FIELD_WEATHER_MOVES.get(entry.moveId), id: entry.moveId });
  }
  if (snapshot.field?.weather) sources.push({ kind: 'field', weather: snapshot.field.weather, id: snapshot.field.weather });
  return sources;
}

function activeTerrainSources(snapshot, side, catalog) {
  const sources = [];
  for (const ref of activeRefs(snapshot, side)) {
    const terrain = getSwitchInTerrain(abilityId(ref.pokemon));
    if (terrain) sources.push({ kind: 'ability', ref, terrain, id: abilityId(ref.pokemon) });
  }
  for (const entry of catalog[side].filter((item) => hasTag(item, 'terrain-setter'))) {
    sources.push({ kind: 'action', entry, terrain: FIELD_TERRAIN_MOVES.get(entry.moveId), id: entry.moveId });
  }
  if (snapshot.field?.terrain) sources.push({ kind: 'field', terrain: snapshot.field.terrain, id: snapshot.field.terrain });
  return sources;
}

function sourceSubject(source, kind) {
  if (source.ref) return pokemonSubject(source.ref);
  if (source.entry) return actionSubject(source.entry);
  return fieldSubject(kind, source[kind]);
}

function detectSpeedControl(snapshot, catalog, findings, graphTools) {
  for (const side of SIDES) {
    const speedActions = catalog[side].filter((entry) => hasTag(entry, 'speed-control'));
    const abusers = catalog[side].filter((entry) => entry.summary.maxPct >= HIGH_DAMAGE_PCT || hasTag(entry, 'ko-range') || hasTag(entry, 'variable-power'));
    for (const control of speedActions) {
      const partner = bestBy(
        abusers,
        (entry) => entry.slot !== control.slot,
        sortByDamage,
      );
      const subjects = [pokemonSubject(control.actorRef), actionSubject(control)];
      if (partner) subjects.push(pokemonSubject(partner.actorRef), actionSubject(partner));
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.SPEED_CONTROL,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects,
        evidence: [
          evidenceForEntry(control, 'speed-control-action'),
          partner ? evidenceForEntry(partner, 'enabled-pressure') : null,
        ].filter(Boolean),
        userMessage: partner
          ? `${displayName(control.actor)} puede activar ${actionLabel(control.action)} y habilitar a ${displayName(partner.actor)} para presionar el turno.`
          : `${displayName(control.actor)} tiene control de velocidad disponible con ${actionLabel(control.action)}.`,
        confidence: partner ? 0.88 : 0.78,
        tags: ['tempo', 'field-order'],
      }));
      if (partner && graphTools) {
        graphTools.addEdge({
          from: actionNodeId(control),
          to: pokemonNodeId(partner.actorRef),
          type: 'enables',
          family: SYNERGY_FAMILIES.SPEED_CONTROL,
          confidence: 0.88,
        });
      }
    }

    const sideConditions = sideState(snapshot, side)?.sideConditions || {};
    if (sideConditions.tailwind || snapshot.field?.trickRoom) {
      addUniqueFinding(findings, createTacticalFinding({
        id: `${SYNERGY_FAMILIES.SPEED_CONTROL}:${side}:active-field`,
        family: SYNERGY_FAMILIES.SPEED_CONTROL,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [
          sideConditions.tailwind ? fieldSubject('tailwind', side) : null,
          snapshot.field?.trickRoom ? fieldSubject('room', 'trickroom') : null,
        ].filter(Boolean),
        evidence: [makeEvidence('active-field-speed-control', {
          tailwind: !!sideConditions.tailwind,
          trickRoom: !!snapshot.field?.trickRoom,
        })],
        userMessage: `${side === 'enemy' ? 'El rival' : 'Tu lado'} ya tiene una condicion activa que cambia el orden de turno.`,
        confidence: 0.9,
        tags: ['tempo', 'active-field'],
      }));
    }
  }
}

function detectWeatherCores(snapshot, catalog, findings, graphTools) {
  for (const side of SIDES) {
    const sources = activeWeatherSources(snapshot, side, catalog);
    const abusers = catalog[side].filter((entry) => hasTag(entry, 'weather-abuser') || isWeatherSpeedAbility(abilityId(entry.actor), snapshot.field?.weather));
    for (const source of sources) {
      const abuser = bestBy(
        abusers,
        (entry) => (source.entry ? entry.slot !== source.entry.slot : true) && (source.ref ? entry.slot !== source.ref.slot : true),
        sortByDamage,
      );
      if (!abuser) continue;
      const subjects = [sourceSubject(source, 'weather'), pokemonSubject(abuser.actorRef), actionSubject(abuser)];
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.WEATHER_CORE,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects,
        evidence: [
          makeEvidence('weather-source', { kind: source.kind, id: source.id, weather: source.weather }),
          evidenceForEntry(abuser, 'weather-abuser'),
        ],
        userMessage: `${source.weather || snapshot.field?.weather} habilita a ${displayName(abuser.actor)} con ${actionLabel(abuser.action)}.`,
        confidence: source.kind === 'field' ? 0.82 : 0.87,
        tags: ['weather', source.weather || snapshot.field?.weather],
      }));
      if (graphTools) {
        const sourceNode = source.entry ? actionNodeId(source.entry) : source.ref ? pokemonNodeId(source.ref) : fieldNodeId('weather', source.weather);
        graphTools.addEdge({
          from: sourceNode,
          to: pokemonNodeId(abuser.actorRef),
          type: 'enables',
          family: SYNERGY_FAMILIES.WEATHER_CORE,
          confidence: 0.86,
        });
      }
    }
  }
}

function detectTerrainCores(snapshot, catalog, findings, graphTools) {
  for (const side of SIDES) {
    const sources = activeTerrainSources(snapshot, side, catalog);
    const abusers = catalog[side].filter((entry) => hasTag(entry, 'terrain-abuser'));
    const priorityDeny = snapshot.field?.terrain === 'psychic'
      ? catalog[otherSide(side)].filter((entry) => entry.priority > 0)
      : [];
    for (const source of sources) {
      const abuser = bestBy(abusers, (entry) => true, sortByDamage);
      if (!abuser && !priorityDeny.length) continue;
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.TERRAIN_CORE,
        side,
        severity: source.terrain === 'psychic' && priorityDeny.length ? 'high' : 'medium',
        subjects: [
          sourceSubject(source, 'terrain'),
          abuser ? pokemonSubject(abuser.actorRef) : null,
          abuser ? actionSubject(abuser) : null,
        ].filter(Boolean),
        evidence: [
          makeEvidence('terrain-source', { kind: source.kind, id: source.id, terrain: source.terrain }),
          abuser ? evidenceForEntry(abuser, 'terrain-abuser') : null,
          priorityDeny.length ? makeEvidence('priority-denial-context', {
            terrain: source.terrain,
            affectedActions: priorityDeny.map((entry) => entry.moveId),
          }) : null,
        ].filter(Boolean),
        userMessage: source.terrain === 'psychic' && priorityDeny.length
          ? `Psychic Terrain cambia el juego de prioridad y puede invalidar clicks rapidos contra grounded targets.`
          : `${source.terrain} genera valor tactico para ${abuser ? displayName(abuser.actor) : 'el lado activo'}.`,
        confidence: 0.84,
        tags: ['terrain', source.terrain],
      }));
      if (abuser && graphTools) {
        const sourceNode = source.entry ? actionNodeId(source.entry) : source.ref ? pokemonNodeId(source.ref) : fieldNodeId('terrain', source.terrain);
        graphTools.addEdge({
          from: sourceNode,
          to: pokemonNodeId(abuser.actorRef),
          type: 'enables',
          family: SYNERGY_FAMILIES.TERRAIN_CORE,
          confidence: 0.84,
        });
      }
    }
  }
}

function detectPairSupportPatterns(catalog, findings, graphTools) {
  for (const side of SIDES) {
    const fakeOuts = catalog[side].filter((entry) => hasTag(entry, 'fake-out'));
    const redirections = catalog[side].filter((entry) => hasTag(entry, 'redirection'));
    const helpingHands = catalog[side].filter((entry) => hasTag(entry, 'helping-hand'));
    const guards = catalog[side].filter((entry) => hasTag(entry, 'protect') || hasTag(entry, 'guard') || hasTag(entry, 'screen'));
    const setupOrControl = catalog[side].filter((entry) => hasTag(entry, 'setup') || hasTag(entry, 'speed-control') || hasTag(entry, 'field-control'));
    const nukes = catalog[side].filter((entry) => entry.summary.maxPct >= HIGH_DAMAGE_PCT || hasTag(entry, 'ko-range') || hasTag(entry, 'spread'));

    for (const support of fakeOuts) {
      const partner = bestBy(setupOrControl, (entry) => entry.slot !== support.slot, sortByDamage);
      if (!partner) continue;
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.FAKE_OUT_SETUP,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [pokemonSubject(support.actorRef), actionSubject(support), pokemonSubject(partner.actorRef), actionSubject(partner)],
        evidence: [evidenceForEntry(support, 'fake-out'), evidenceForEntry(partner, 'partner-setup')],
        userMessage: `${displayName(support.actor)} puede comprar un turno con Fake Out para que ${displayName(partner.actor)} juegue ${actionLabel(partner.action)}.`,
        confidence: 0.88,
        tags: ['tempo', 'free-turn'],
      }));
      graphTools?.addEdge({
        from: actionNodeId(support),
        to: actionNodeId(partner),
        type: 'enables',
        family: SYNERGY_FAMILIES.FAKE_OUT_SETUP,
        confidence: 0.88,
      });
    }

    for (const redirect of redirections) {
      const partner = bestBy([...setupOrControl, ...nukes], (entry) => entry.slot !== redirect.slot, sortByDamage);
      if (!partner) continue;
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.REDIRECTION_SETUP,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [pokemonSubject(redirect.actorRef), actionSubject(redirect), pokemonSubject(partner.actorRef), actionSubject(partner)],
        evidence: [evidenceForEntry(redirect, 'redirection'), evidenceForEntry(partner, 'protected-partner')],
        userMessage: `${displayName(redirect.actor)} puede absorber targets y dejar actuar a ${displayName(partner.actor)}.`,
        confidence: 0.87,
        tags: ['redirection', 'positioning'],
      }));
      graphTools?.addEdge({
        from: actionNodeId(redirect),
        to: pokemonNodeId(partner.actorRef),
        type: 'protects',
        family: SYNERGY_FAMILIES.REDIRECTION_SETUP,
        confidence: 0.87,
      });
    }

    for (const support of helpingHands) {
      const partner = bestBy(nukes, (entry) => entry.slot !== support.slot, sortByDamage);
      if (!partner) continue;
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.SETUP_SUPPORT,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [pokemonSubject(support.actorRef), actionSubject(support), pokemonSubject(partner.actorRef), actionSubject(partner)],
        evidence: [evidenceForEntry(support, 'helping-hand'), evidenceForEntry(partner, 'boosted-pressure')],
        userMessage: `${displayName(support.actor)} puede potenciar a ${displayName(partner.actor)} y convertir ${actionLabel(partner.action)} en rango decisivo.`,
        confidence: 0.82,
        tags: ['support', 'damage-boost'],
      }));
    }

    for (const guard of guards) {
      const partner = bestBy(nukes, (entry) => entry.slot !== guard.slot, sortByDamage);
      if (!partner) continue;
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.ALLY_PROTECTED_NUKE,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [pokemonSubject(guard.actorRef), actionSubject(guard), pokemonSubject(partner.actorRef), actionSubject(partner)],
        evidence: [evidenceForEntry(guard, 'protection-layer'), evidenceForEntry(partner, 'nuke')],
        userMessage: `${displayName(guard.actor)} aporta seguridad mientras ${displayName(partner.actor)} amenaza con ${actionLabel(partner.action)}.`,
        confidence: 0.78,
        tags: ['protection', 'nuke'],
      }));
    }
  }
}

function detectSpreadAndImmunity(snapshot, catalog, findings, graphTools) {
  for (const side of SIDES) {
    const spreads = catalog[side].filter((entry) => hasTag(entry, 'spread'));
    for (const spread of spreads) {
      if (spread.summary.hitCount >= 2) {
        addUniqueFinding(findings, createTacticalFinding({
          family: SYNERGY_FAMILIES.SPREAD_ABUSE,
          side,
          severity: side === 'enemy' ? 'high' : 'medium',
          subjects: [pokemonSubject(spread.actorRef), actionSubject(spread)],
          evidence: [evidenceForEntry(spread, 'spread-damage')],
          userMessage: `${displayName(spread.actor)} amenaza a multiples objetivos con ${actionLabel(spread.action)}.`,
          confidence: 0.9,
          tags: ['spread', 'area-pressure'],
        }));
      }

      const allyBlocks = (spread.outcome?.results || [])
        .map((result, index) => ({ result, target: spread.outcome.targets[index] }))
        .filter(({ result, target }) => target?.side === side && result.blocked);
      if (allyBlocks.length) {
        addUniqueFinding(findings, createTacticalFinding({
          family: SYNERGY_FAMILIES.IMMUNITY_CORE,
          side,
          severity: 'medium',
          subjects: [
            pokemonSubject(spread.actorRef),
            actionSubject(spread),
            ...allyBlocks.map(({ target }) => pokemonSubject(target)),
          ],
          evidence: [
            evidenceForEntry(spread, 'ally-immunity-spread'),
            ...allyBlocks.map(({ result, target }) => makeEvidence('blocked-ally-target', {
              target: displayName(target.pokemon),
              reason: result.blockReason,
              moveId: spread.moveId,
            })),
          ],
          userMessage: `${actionLabel(spread.action)} puede presionar area sin castigar a su aliado por ${allyBlocks.map(({ result }) => result.blockReason).join(', ')}.`,
          confidence: 0.92,
          tags: ['immunity', 'spread'],
        }));
        for (const { target } of allyBlocks) {
          graphTools?.addEdge({
            from: actionNodeId(spread),
            to: pokemonNodeId(target),
            type: 'does-not-hit',
            family: SYNERGY_FAMILIES.IMMUNITY_CORE,
            confidence: 0.92,
          });
        }
      }
    }
  }
}

function detectPriority(snapshot, catalog, findings, graphTools) {
  for (const side of SIDES) {
    const priorityActions = catalog[side].filter((entry) => entry.priority > 0);
    if (priorityActions.length) {
      const best = [...priorityActions].sort((a, b) => b.priority - a.priority || (b.summary.maxPct || 0) - (a.summary.maxPct || 0))[0];
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.PRIORITY_GAMES,
        side,
        severity: side === 'enemy' ? 'medium' : 'info',
        subjects: [pokemonSubject(best.actorRef), actionSubject(best)],
        evidence: priorityActions.slice(0, 4).map((entry) => evidenceForEntry(entry, 'priority-action')),
        userMessage: `${displayName(best.actor)} tiene prioridad activa con ${actionLabel(best.action)}.`,
        confidence: 0.83,
        tags: ['priority'],
      }));
    }

    const blockers = activeRefs(snapshot, side).filter(({ pokemon }) => PRIORITY_DENIAL_ABILITIES.has(abilityId(pokemon)));
    const quickGuard = catalog[side].filter((entry) => QUICK_GUARD_MOVES.has(entry.moveId));
    const psychicTerrain = snapshot.field?.terrain === 'psychic';
    if (blockers.length || quickGuard.length || psychicTerrain) {
      addUniqueFinding(findings, createTacticalFinding({
        id: `${SYNERGY_FAMILIES.PRIORITY_DENIAL}:${side}:${blockers.map(({ slot }) => slot).join('-')}:${quickGuard.map((entry) => entry.slot).join('-')}:${psychicTerrain}`,
        family: SYNERGY_FAMILIES.PRIORITY_DENIAL,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [
          ...blockers.map(pokemonSubject),
          ...quickGuard.map(actionSubject),
          psychicTerrain ? fieldSubject('terrain', 'psychic') : null,
        ].filter(Boolean),
        evidence: [
          ...blockers.map((ref) => makeEvidence('priority-denial-ability', {
            actor: displayName(ref.pokemon),
            abilityId: abilityId(ref.pokemon),
          })),
          ...quickGuard.map((entry) => evidenceForEntry(entry, 'quick-guard')),
          psychicTerrain ? makeEvidence('priority-denial-field', { terrain: 'psychic' }) : null,
        ].filter(Boolean),
        userMessage: `${side === 'enemy' ? 'El rival' : 'Tu lado'} puede bloquear prioridad mediante habilidad, campo o Quick Guard.`,
        confidence: 0.88,
        tags: ['priority-denial', psychicTerrain ? 'psychic-terrain' : null].filter(Boolean),
      }));
      for (const blocker of blockers) {
        graphTools?.addEdge({
          from: pokemonNodeId(blocker),
          to: fieldNodeId('priority-denial', side),
          type: 'blocks',
          family: SYNERGY_FAMILIES.PRIORITY_DENIAL,
          confidence: 0.9,
        });
      }
    }
  }
}

function detectAntiIntimidate(snapshot, findings, graphTools) {
  for (const side of SIDES) {
    const foe = otherSide(side);
    const intimidators = activeRefs(snapshot, foe).filter(({ pokemon }) => abilityId(pokemon) === 'intimidate');
    if (!intimidators.length) continue;
    const answers = activeRefs(snapshot, side).filter(({ pokemon }) => (
      ANTI_STAT_DROP_ABILITIES.has(abilityId(pokemon))
      || STAT_DROP_BLOCK_ABILITIES.has(abilityId(pokemon))
      || STAT_DROP_BLOCK_ITEMS.has(itemId(pokemon))
    ));
    for (const answer of answers) {
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.ANTI_INTIMIDATE,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [pokemonSubject(answer), ...intimidators.map(pokemonSubject)],
        evidence: [
          makeEvidence('anti-intimidate', {
            actor: displayName(answer.pokemon),
            abilityId: abilityId(answer.pokemon),
            itemId: itemId(answer.pokemon),
            intimidators: intimidators.map(({ pokemon }) => displayName(pokemon)),
          }),
        ],
        userMessage: `${displayName(answer.pokemon)} castiga o bloquea Intimidate; no conviene regalarle ese trigger.`,
        confidence: 0.9,
        tags: ['switch-in', 'stat-drop'],
      }));
      for (const intimidator of intimidators) {
        graphTools?.addEdge({
          from: pokemonNodeId(intimidator),
          to: pokemonNodeId(answer),
          type: 'punished-by',
          family: SYNERGY_FAMILIES.ANTI_INTIMIDATE,
          confidence: 0.9,
        });
      }
    }
  }
}

function detectDefensiveLayering(snapshot, catalog, findings) {
  for (const side of SIDES) {
    const layers = [];
    const sideConditions = sideState(snapshot, side)?.sideConditions || {};
    if (sideConditions.reflect) layers.push(makeEvidence('active-screen', { screen: 'reflect' }));
    if (sideConditions.lightScreen) layers.push(makeEvidence('active-screen', { screen: 'light-screen' }));
    if (sideConditions.auroraVeil) layers.push(makeEvidence('active-screen', { screen: 'aurora-veil' }));
    for (const ref of activeRefs(snapshot, side)) {
      if (abilityId(ref.pokemon) === 'friendguard') layers.push(makeEvidence('defensive-ability', { actor: displayName(ref.pokemon), abilityId: 'friendguard' }));
      if (/berry$/.test(itemId(ref.pokemon))) layers.push(makeEvidence('defensive-item', { actor: displayName(ref.pokemon), itemId: itemId(ref.pokemon) }));
    }
    const layerActions = catalog[side].filter((entry) => hasTag(entry, 'screen') || hasTag(entry, 'guard') || hasTag(entry, 'protect'));
    layers.push(...layerActions.slice(0, 4).map((entry) => evidenceForEntry(entry, 'defensive-action')));
    if (layers.length < 2) continue;
    addUniqueFinding(findings, createTacticalFinding({
      id: `${SYNERGY_FAMILIES.DEFENSIVE_LAYERING}:${side}`,
      family: SYNERGY_FAMILIES.DEFENSIVE_LAYERING,
      side,
      severity: side === 'enemy' ? 'medium' : 'info',
      subjects: activeRefs(snapshot, side).map(pokemonSubject),
      evidence: layers,
      userMessage: `${side === 'enemy' ? 'El rival' : 'Tu lado'} tiene varias capas defensivas disponibles o activas.`,
      confidence: layers.length >= 3 ? 0.86 : 0.74,
      tags: ['defense', 'survivability'],
    }));
  }
}

function detectStatusTrapVariableCleaner(snapshot, catalog, findings) {
  for (const side of SIDES) {
    const status = catalog[side].filter((entry) => hasTag(entry, 'status-pressure'));
    for (const entry of status.slice(0, 3)) {
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.STATUS_PRESSURE,
        side,
        severity: side === 'enemy' ? 'medium' : 'info',
        subjects: [pokemonSubject(entry.actorRef), actionSubject(entry)],
        evidence: [evidenceForEntry(entry, 'status-pressure')],
        userMessage: `${displayName(entry.actor)} puede alterar el turno con ${actionLabel(entry.action)}.`,
        confidence: 0.82,
        tags: ['status', 'control'],
      }));
    }

    const trapActions = catalog[side].filter((entry) => hasTag(entry, 'trap-lock'));
    const trapAbilities = activeRefs(snapshot, side).filter(({ pokemon }) => TRAP_LOCK_ABILITIES.has(abilityId(pokemon)));
    if (trapActions.length || trapAbilities.length) {
      addUniqueFinding(findings, createTacticalFinding({
        id: `${SYNERGY_FAMILIES.TRAP_PERISH_LOCK}:${side}`,
        family: SYNERGY_FAMILIES.TRAP_PERISH_LOCK,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [...trapActions.map(actionSubject), ...trapAbilities.map(pokemonSubject)],
        evidence: [
          ...trapActions.map((entry) => evidenceForEntry(entry, 'trap-lock-action')),
          ...trapAbilities.map((ref) => makeEvidence('trap-lock-ability', { actor: displayName(ref.pokemon), abilityId: abilityId(ref.pokemon) })),
        ],
        userMessage: `${side === 'enemy' ? 'El rival' : 'Tu lado'} tiene herramientas para encerrar o bloquear decisiones.`,
        confidence: 0.76,
        tags: ['trap', 'lock'],
      }));
    }

    const variable = catalog[side].filter((entry) => hasTag(entry, 'variable-power'));
    for (const entry of variable.slice(0, 3)) {
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.VARIABLE_POWER_WINCON,
        side,
        severity: entry.summary.maxPct >= HIGH_DAMAGE_PCT ? 'high' : 'medium',
        subjects: [pokemonSubject(entry.actorRef), actionSubject(entry)],
        evidence: [evidenceForEntry(entry, 'variable-power')],
        userMessage: `${actionLabel(entry.action)} escala por estado de combate y puede cambiar de rango durante la partida.`,
        confidence: 0.84,
        tags: ['scaling', 'wincon'],
      }));
    }

    const cleaners = catalog[side]
      .filter((entry) => (entry.priority > 0 || entry.summary.hardKoCount > 0) && entry.summary.maxPct >= HIGH_DAMAGE_PCT)
      .sort((a, b) => b.priority - a.priority || (b.summary.maxPct || 0) - (a.summary.maxPct || 0));
    if (cleaners.length) {
      const best = cleaners[0];
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.LATE_GAME_CLEANER,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [pokemonSubject(best.actorRef), actionSubject(best)],
        evidence: [evidenceForEntry(best, 'cleaner-pressure')],
        userMessage: `${displayName(best.actor)} puede limpiar KOs con ${actionLabel(best.action)} si el rival queda en rango.`,
        confidence: 0.78,
        tags: ['cleaner', best.priority > 0 ? 'priority' : 'damage'],
      }));
    }
  }
}

function detectPartnerEnabledEngines(catalog, findings, graphTools) {
  for (const side of SIDES) {
    const enablers = catalog[side].filter((entry) => (
      hasTag(entry, 'speed-control')
      || hasTag(entry, 'weather-setter')
      || hasTag(entry, 'terrain-setter')
      || hasTag(entry, 'redirection')
      || hasTag(entry, 'helping-hand')
      || hasTag(entry, 'guard')
      || hasTag(entry, 'screen')
    ));
    const payoffs = catalog[side].filter((entry) => (
      hasTag(entry, 'high-damage')
      || hasTag(entry, 'ko-range')
      || hasTag(entry, 'spread')
      || hasTag(entry, 'variable-power')
    ));
    for (const enabler of enablers) {
      const payoff = bestBy(payoffs, (entry) => entry.slot !== enabler.slot, sortByDamage);
      if (!payoff) continue;
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.PARTNER_ENABLED_ENGINE,
        side,
        severity: side === 'enemy' ? 'high' : 'medium',
        subjects: [pokemonSubject(enabler.actorRef), actionSubject(enabler), pokemonSubject(payoff.actorRef), actionSubject(payoff)],
        evidence: [evidenceForEntry(enabler, 'partner-enabler'), evidenceForEntry(payoff, 'partner-payoff')],
        userMessage: `${displayName(enabler.actor)} habilita una linea donde ${displayName(payoff.actor)} gana valor inmediato.`,
        confidence: 0.8,
        tags: ['partner-engine'],
      }));
      graphTools?.addEdge({
        from: actionNodeId(enabler),
        to: actionNodeId(payoff),
        type: 'enables',
        family: SYNERGY_FAMILIES.PARTNER_ENABLED_ENGINE,
        confidence: 0.8,
      });
    }
  }
}

function detectIndividualThreats(catalog, findings) {
  for (const side of SIDES) {
    const threats = catalog[side]
      .filter((entry) => entry.summary.maxPct >= HIGH_DAMAGE_PCT || entry.summary.hardKoCount > 0)
      .sort(sortByDamage);
    const byActor = new Set();
    for (const entry of threats) {
      const actorKey = `${side}:${entry.slot}`;
      if (byActor.has(actorKey)) continue;
      byActor.add(actorKey);
      addUniqueFinding(findings, createTacticalFinding({
        family: SYNERGY_FAMILIES.INDIVIDUAL_THREAT,
        side,
        severity: side === 'enemy' ? (entry.summary.hardKoCount > 0 ? 'critical' : 'high') : 'medium',
        subjects: [pokemonSubject(entry.actorRef), actionSubject(entry)],
        evidence: [evidenceForEntry(entry, 'individual-pressure')],
        userMessage: `${displayName(entry.actor)} tiene presion directa con ${actionLabel(entry.action)}.`,
        confidence: 0.84,
        tags: ['damage', entry.summary.hardKoCount > 0 ? 'ko' : 'range'],
      }));
    }
  }
}

export function detectTacticalFindings(snapshot, options = {}) {
  const graphTools = createGraph(snapshot);
  const catalog = buildActionCatalog(snapshot, graphTools, options);
  const findings = [];

  detectSpeedControl(snapshot, catalog, findings, graphTools);
  detectWeatherCores(snapshot, catalog, findings, graphTools);
  detectTerrainCores(snapshot, catalog, findings, graphTools);
  detectPairSupportPatterns(catalog, findings, graphTools);
  detectSpreadAndImmunity(snapshot, catalog, findings, graphTools);
  detectPriority(snapshot, catalog, findings, graphTools);
  detectAntiIntimidate(snapshot, findings, graphTools);
  detectDefensiveLayering(snapshot, catalog, findings);
  detectStatusTrapVariableCleaner(snapshot, catalog, findings);
  detectPartnerEnabledEngines(catalog, findings, graphTools);
  detectIndividualThreats(catalog, findings);

  findings.sort((a, b) => {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    if (severityDelta) return severityDelta;
    return (b.confidence?.value || 0) - (a.confidence?.value || 0);
  });

  return findings.slice(0, options.limit || 48);
}

export function buildThreatGraph(snapshot, options = {}) {
  const graphTools = createGraph(snapshot);
  const catalog = buildActionCatalog(snapshot, graphTools, options);
  const findings = [];

  detectSpeedControl(snapshot, catalog, findings, graphTools);
  detectWeatherCores(snapshot, catalog, findings, graphTools);
  detectTerrainCores(snapshot, catalog, findings, graphTools);
  detectPairSupportPatterns(catalog, findings, graphTools);
  detectSpreadAndImmunity(snapshot, catalog, findings, graphTools);
  detectPriority(snapshot, catalog, findings, graphTools);
  detectAntiIntimidate(snapshot, findings, graphTools);
  detectPartnerEnabledEngines(catalog, findings, graphTools);
  detectIndividualThreats(catalog, findings);

  graphTools.graph.findings = findings
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, options.limit || 48)
    .map((finding) => finding.id);
  return graphTools.graph;
}

export function buildSynergyReport(snapshot, options = {}) {
  const graphTools = createGraph(snapshot);
  const catalog = buildActionCatalog(snapshot, graphTools, options);
  const findings = [];

  detectSpeedControl(snapshot, catalog, findings, graphTools);
  detectWeatherCores(snapshot, catalog, findings, graphTools);
  detectTerrainCores(snapshot, catalog, findings, graphTools);
  detectPairSupportPatterns(catalog, findings, graphTools);
  detectSpreadAndImmunity(snapshot, catalog, findings, graphTools);
  detectPriority(snapshot, catalog, findings, graphTools);
  detectAntiIntimidate(snapshot, findings, graphTools);
  detectDefensiveLayering(snapshot, catalog, findings);
  detectStatusTrapVariableCleaner(snapshot, catalog, findings);
  detectPartnerEnabledEngines(catalog, findings, graphTools);
  detectIndividualThreats(catalog, findings);

  findings.sort((a, b) => {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    if (severityDelta) return severityDelta;
    return (b.confidence?.value || 0) - (a.confidence?.value || 0);
  });

  const limitedFindings = findings.slice(0, options.limit || 48);
  graphTools.graph.findings = limitedFindings.map((finding) => finding.id);

  const familyCounts = limitedFindings.reduce((acc, finding) => {
    acc[finding.family] = (acc[finding.family] || 0) + 1;
    return acc;
  }, {});

  return {
    schema: 'synergy-report-v1',
    version: SYNERGY_ENGINE_VERSION,
    snapshotKey: snapshot?.key || snapshot?.id || null,
    findings: limitedFindings,
    graph: graphTools.graph,
    actionEvidence: {
      self: catalog.self.map(compactActionEvidence),
      enemy: catalog.enemy.map(compactActionEvidence),
    },
    summary: {
      findingCount: limitedFindings.length,
      familyCounts,
      topSeverity: limitedFindings[0]?.severity || null,
      unsupported: collectUnsupported(limitedFindings),
    },
  };
}

function compactActionEvidence(entry) {
  return {
    id: entry.id,
    side: entry.side,
    slot: entry.slot,
    actor: displayName(entry.actor),
    moveId: entry.moveId,
    moveName: actionLabel(entry.action),
    effectClass: entry.effectClass,
    priority: entry.priority,
    tags: entry.tags,
    outcome: entry.summary,
    targets: entry.targets.map((target) => ({
      side: target.side,
      slot: target.slot,
      label: displayName(target.pokemon),
      redirected: !!target.redirected,
      grounded: isGrounded(target.pokemon, null),
    })),
  };
}

function collectUnsupported(findings) {
  return [...new Set(findings.flatMap((finding) => finding.confidence?.unsupported || []))];
}

export default {
  SYNERGY_ENGINE_VERSION,
  SYNERGY_FAMILIES,
  buildSynergyReport,
  buildThreatGraph,
  createTacticalFinding,
  detectTacticalFindings,
};
