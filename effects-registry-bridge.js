(function (global) {
  'use strict';

  const registryState = {
    loaded: false,
    loading: null,
    sourceUrl: null,
    raw: null,
    abilities: new Map(),
    items: new Map(),
    moves: new Map(),
    statuses: new Map()
  };

  const PATCH_CACHE_KEY = 'effects-registry-patch-cache-v1';

  function loadPatchCache() {
    try {
      const raw = localStorage.getItem(PATCH_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') {
        return { abilities: {}, items: {}, moves: {}, statuses: {} };
      }
      return {
        abilities: parsed.abilities || {},
        items: parsed.items || {},
        moves: parsed.moves || {},
        statuses: parsed.statuses || {},
      };
    } catch {
      return { abilities: {}, items: {}, moves: {}, statuses: {} };
    }
  }

  let patchCache = loadPatchCache();

  function savePatchCache() {
    try {
      localStorage.setItem(PATCH_CACHE_KEY, JSON.stringify(patchCache));
    } catch (_) {}
  }

  function fallbackNormalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\./g, '')
      .replace(/♀/g, ' female ')
      .replace(/♂/g, ' male ')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  function slugify(name, kind) {
    if (!name) return '';
    if (typeof global.normalizeText === 'function') {
      try {
        return global.normalizeText(name);
      } catch (_) {}
    }
    if (typeof global.getPapiSlug === 'function') {
      try {
        return global.getPapiSlug(name, kind || 'move');
      } catch (_) {}
    }
    return fallbackNormalize(name);
  }

  function getMap(kind) {
    if (kind === 'ability') return registryState.abilities;
    if (kind === 'item') return registryState.items;
    if (kind === 'move') return registryState.moves;
    if (kind === 'status') return registryState.statuses;
    throw new Error('Unknown registry kind: ' + kind);
  }

  function indexRegistry(raw) {
    registryState.raw = raw;
    registryState.abilities = new Map(Object.entries(raw?.registries?.abilities || {}));
    registryState.items = new Map(Object.entries(raw?.registries?.items || {}));
    registryState.moves = new Map(Object.entries(raw?.registries?.moves || {}));
    registryState.statuses = new Map(Object.entries(raw?.registries?.statuses || {}));

    // Aplicar patches dinámicos desde localStorage
    Object.entries(patchCache.abilities).forEach(([slug, entry]) => {
      registryState.abilities.set(slug, entry);
    });
    Object.entries(patchCache.items).forEach(([slug, entry]) => {
      registryState.items.set(slug, entry);
    });
    Object.entries(patchCache.moves).forEach(([slug, entry]) => {
      registryState.moves.set(slug, entry);
    });
    Object.entries(patchCache.statuses).forEach(([slug, entry]) => {
      registryState.statuses.set(slug, entry);
    });

    registryState.loaded = true;
    return registryState;
  }

  function upsertEntry(kind, slug, patch) {
    ensureLoaded();
    const map = getMap(kind);
    const existing = map.get(slug) || { slug };
    const merged = Object.assign({}, existing, patch);

    map.set(slug, merged);

    // Actualizar cache en memoria y persistir
    const bucket =
      kind === 'ability'
        ? patchCache.abilities
        : kind === 'item'
        ? patchCache.items
        : kind === 'status'
        ? patchCache.statuses
        : patchCache.moves;

    bucket[slug] = merged;
    savePatchCache();

    return merged;
  }

  function upsertAbilityEntry(slug, patch) {
    return upsertEntry('ability', slug, patch);
  }
  function upsertItemEntry(slug, patch) {
    return upsertEntry('item', slug, patch);
  }
  function upsertMoveEntry(slug, patch) {
    return upsertEntry('move', slug, patch);
  }
  function upsertStatusEntry(slug, patch) {
    return upsertEntry('status', slug, patch);
  }

  async function loadEffectRegistry(url = './effects-master.seed.json', options = {}) {
    if (registryState.loaded && registryState.sourceUrl === url && !options.force) return registryState;
    if (registryState.loading && registryState.sourceUrl === url && !options.force) return registryState.loading;

    registryState.sourceUrl = url;
    registryState.loading = (options.fetchImpl || fetch)(url, { cache: options.cache || 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('No se pudo cargar el registro de efectos: ' + url);
        return res.json();
      })
      .then(indexRegistry)
      .finally(() => {
        registryState.loading = null;
      });

    return registryState.loading;
  }

  function ensureLoaded() {
    if (!registryState.loaded) {
      throw new Error('Effect registry not loaded. Call loadEffectRegistry() first.');
    }
  }

  function getRegistryEntry(kind, nameOrSlug) {
    ensureLoaded();
    const slug = slugify(nameOrSlug, kind);
    return getMap(kind).get(slug) || null;
  }

  function getAbilityEntry(nameOrSlug) {
    return getRegistryEntry('ability', nameOrSlug);
  }

  function getItemEntry(nameOrSlug) {
    return getRegistryEntry('item', nameOrSlug);
  }

  function getMoveEntry(nameOrSlug) {
    return getRegistryEntry('move', nameOrSlug);
  }

  function getStatusEntry(nameOrSlug) {
    return getRegistryEntry('status', nameOrSlug);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : value == null ? [] : [value];
  }

  function shallowClone(obj) {
    return obj ? JSON.parse(JSON.stringify(obj)) : obj;
  }

  function getMonAbility(mon) {
    return mon?.battle?.ability || mon?.set?.ability || mon?.ability || null;
  }

  function getMonItem(mon) {
    return mon?.battle?.item || mon?.set?.item || mon?.item || null;
  }

  function getMonTypes(mon) {
    return mon?.battle?.types || mon?.types || [];
  }

  function getMoveType(move, fallback) {
    return move?.type || move?.battle?.type || fallback || null;
  }

  function getMoveName(move) {
    return move?.name || move?.move || move?.slug || null;
  }

  function getMoveDamageClass(move) {
    return move?.damageClass || move?.damage_class || move?.battle?.damage_class || null;
  }

  function isPriorityMove(move) {
    return Number(move?.priority ?? move?.battle?.priority ?? 0) > 0;
  }

  function isStatusMove(move) {
    return getMoveDamageClass(move) === 'status';
  }

  function sideKeyFromMon(mon) {
    return mon?.side || mon?.battle?.side || null;
  }

  function sideConditions(field, side) {
    if (!field || !side) return {};
    if (field.sides && field.sides[side]) return field.sides[side];
    return {
      tailwind: side === 'self' ? !!field.tailwindSelf : !!field.tailwindEnemy,
      reflect: side === 'self' ? !!field.reflectSelf : !!field.reflectEnemy,
      lightScreen: side === 'self' ? !!field.lightScreenSelf : !!field.lightScreenEnemy,
      auroraVeil: side === 'self' ? !!field.auroraVeilSelf : !!field.auroraVeilEnemy,
      quickGuard: side === 'self' ? !!field.quickGuardSelf : !!field.quickGuardEnemy,
      wideGuard: side === 'self' ? !!field.wideGuardSelf : !!field.wideGuardEnemy,
      redirection: side === 'self' ? field.redirectionSelf : field.redirectionEnemy
    };
  }

  function defaultContext(input = {}) {
    return {
      attacker: input.attacker || null,
      defender: input.defender || null,
      holder: input.holder || null,
      move: input.move || null,
      field: input.field || {},
      state: input.state || {},
      flags: Object.assign({}, input.flags || {}),
      side: input.side || null,
      defendingSide: input.defendingSide || null,
      alliesFainted: Number(input.alliesFainted || 0),
      firstTurnActive: !!input.firstTurnActive,
      hpFull: !!input.hpFull,
      effectiveness: Number.isFinite(input.effectiveness) ? input.effectiveness : null,
      source: input.source || null,
      target: input.target || null,
      trigger: input.trigger || null
    };
  }

  function collectEntries(mon, move) {
    const entries = [];
    const ability = getMonAbility(mon);
    const item = getMonItem(mon);
    const status = mon?.battle?.status;
    if (ability) {
      const abilityEntry = getAbilityEntry(ability);
      if (abilityEntry) entries.push({ kind: 'ability', owner: mon, entry: abilityEntry });
    }
    if (item) {
      const itemEntry = getItemEntry(item);
      if (itemEntry) entries.push({ kind: 'item', owner: mon, entry: itemEntry });
    }
    if (move) {
      const moveEntry = getMoveEntry(getMoveName(move));
      if (moveEntry) entries.push({ kind: 'move', owner: mon, entry: moveEntry });
    }
    if (status) {
      const statusEntry = getStatusEntry(status);
      if (statusEntry) entries.push({ kind: 'status', owner: mon, entry: statusEntry });
    }
    return entries;
  }

  function matchSimpleCondition(condition, context, owner, effect) {
    if (!condition || typeof condition !== 'object') return true;
    const move = context.move || {};
    const field = context.field || {};
    const holder = context.holder || owner || null;

    if (condition.weather && field.weather !== condition.weather) return false;
    if (condition.terrain && field.terrain !== condition.terrain) return false;
    if (condition.hp_full === true && !context.hpFull) return false;
    if (condition.hp_lte != null) {
      const hpPct = holder?.battle?.hpPct ?? holder?.hpPct ?? 100;
      if (!(hpPct / 100 <= Number(condition.hp_lte))) return false;
    }
    if (condition.effectiveness_gt != null) {
      if (!(Number(context.effectiveness || 1) > Number(condition.effectiveness_gt))) return false;
    }
    if (condition.move && slugify(getMoveName(move), 'move') !== slugify(condition.move, 'move')) return false;
    if (condition.move_type && slugify(getMoveType(move), 'move') !== slugify(condition.move_type, 'move')) return false;
    if (condition.item && slugify(getMonItem(holder), 'item') !== slugify(condition.item, 'item')) return false;
    if (condition.flag) {
      const flags = context.flags || {};
      if (!flags[condition.flag]) return false;
    }
    if (condition.move_damage_class) {
      const list = asArray(condition.move_damage_class);
      if (!list.includes(getMoveDamageClass(move))) return false;
    }
    if (condition.first_turn_active === true && !context.firstTurnActive) return false;
    if (condition.unless) {
      const blockedBy = asArray(condition.unless).map((x) => slugify(x));
      const activeFlags = Object.keys(context.flags || {}).filter((k) => context.flags[k]).map((x) => slugify(x));
      if (blockedBy.some((x) => activeFlags.includes(x))) return false;
    }
    return true;
  }

  function normalizeAppliedEffect(owner, sourceKind, effect) {
    return {
      sourceKind,
      sourceSlug: effect?.sourceSlug || null,
      ownerSlug: slugify(owner?.name || owner?.displayName || '', 'pokemon'),
      ownerName: owner?.displayName || owner?.name || null,
      kind: effect.kind,
      payload: shallowClone(effect),
      summary: effect.summary || null
    };
  }

  function evaluateEffects(entries, trigger, contextInput = {}) {
    const context = defaultContext(Object.assign({}, contextInput, { trigger }));
    const result = {
      trigger,
      applied: [],
      reasons: [],
      modifiers: {
        speed: 1,
        attack: 1,
        specialAttack: 1,
        specialDefense: 1,
        damage: 1,
        damageTaken: 1,
        moveTypeBoosts: [],
        moveTypeTakenMods: [],
        statFieldMods: []
      },
      flags: {
        grantsImmunity: false,
        blocksPriority: false,
        blocksStatusMoves: false,
        blocksSecondary: false,
        blocksStatDrops: false,
        choiceLocked: false,
        forbidsStatusMoves: false,
        ignoreWeatherDamage: false,
        ignoreEntryHazards: false,
        surviveAtOne: false
      },
      events: [],
      notes: []
    };

    for (const source of entries) {
      const entry = source.entry;
      const owner = source.owner;
      const entryTriggers = asArray(entry?.triggers || []);
      if (!entryTriggers.includes(trigger)) continue;

      for (const rawEffect of asArray(entry?.effects || [])) {
        const effect = Object.assign({ sourceSlug: entry.slug }, rawEffect || {});
        if (!matchSimpleCondition(effect.when, context, owner, effect)) continue;

        const applied = normalizeAppliedEffect(owner, source.kind, effect);
        result.applied.push(applied);
        result.reasons.push(entry.name || entry.slug);

        switch (effect.kind) {
          case 'speed_multiplier':
            result.modifiers.speed *= Number(effect.value || 1);
            break;
          case 'attack_multiplier':
          case 'stat_multiplier':
            if (effect.stat === 'atk' || effect.kind === 'attack_multiplier') result.modifiers.attack *= Number(effect.value || 1);
            if (effect.stat === 'spa') result.modifiers.specialAttack *= Number(effect.value || 1);
            if (effect.stat === 'spd') result.modifiers.specialDefense *= Number(effect.value || 1);
            break;
          case 'special_attack_multiplier':
            result.modifiers.specialAttack *= Number(effect.value || 1);
            break;
          case 'special_defense_multiplier':
            result.modifiers.specialDefense *= Number(effect.value || 1);
            break;
          case 'final_damage_multiplier':
            result.modifiers.damage *= Number(effect.value || 1);
            break;
          case 'move_type_multiplier':
            if (slugify(getMoveType(context.move), 'move') === slugify(effect.move_type, 'move')) {
              result.modifiers.damage *= Number(effect.value || 1);
              result.modifiers.moveTypeBoosts.push({ type: effect.move_type, value: effect.value, source: entry.slug });
            }
            break;
          case 'move_type_multiplier_taken':
            if (slugify(getMoveType(context.move), 'move') === slugify(effect.move_type, 'move')) {
              result.modifiers.damageTaken *= Number(effect.value || 1);
              result.modifiers.moveTypeTakenMods.push({ type: effect.move_type, value: effect.value, source: entry.slug });
            }
            break;
          case 'stat_field_multiplier':
            result.modifiers.statFieldMods.push({ stat: effect.stat, target: effect.target, value: effect.value, source: entry.slug });
            break;
          case 'grant_immunity':
            if (!effect.move_type || slugify(getMoveType(context.move), 'move') === slugify(effect.move_type, 'move')) {
              result.flags.grantsImmunity = true;
            }
            break;
          case 'block_priority':
            if (isPriorityMove(context.move)) result.flags.blocksPriority = true;
            break;
          case 'block_status_moves':
            if (isStatusMove(context.move)) result.flags.blocksStatusMoves = true;
            break;
          case 'block_secondary_effects':
            result.flags.blocksSecondary = true;
            break;
          case 'block_stat_drop':
            result.flags.blocksStatDrops = true;
            break;
          case 'choice_lock':
            result.flags.choiceLocked = true;
            break;
          case 'forbid_status_moves':
            result.flags.forbidsStatusMoves = true;
            break;
          case 'ignore_weather_damage':
            result.flags.ignoreWeatherDamage = true;
            break;
          case 'ignore_entry_hazards':
            result.flags.ignoreEntryHazards = true;
            break;
          case 'survive_at_1hp':
            result.flags.surviveAtOne = true;
            break;
          case 'set_weather':
          case 'set_terrain':
          case 'set_side_condition':
          case 'toggle_room':
          case 'set_flag':
          case 'self_switch_after_resolution':
          case 'set_redirection':
          case 'set_status':
          case 'modify_stat_stage':
          case 'heal_fraction':
          case 'damage_fraction':
          case 'recoil_fraction':
          case 'restore_negative_stages_once':
          case 'force_form':
          case 'form_change':
          case 'protect_side_from_spread':
          case 'protect_side_from_priority':
          case 'self_protect':
            result.events.push(applied);
            break;
          default:
            result.notes.push('Unhandled effect kind: ' + effect.kind + ' from ' + entry.slug);
            break;
        }
      }
    }

    return result;
  }

  function resolveSpeedModifiers(mon, contextInput = {}) {
    const entries = collectEntries(mon, null);
    return evaluateEffects(entries, 'on_speed_calc', Object.assign({}, contextInput, { holder: mon }));
  }

  function resolveSwitchIn(mon, contextInput = {}) {
    const entries = collectEntries(mon, null);
    return evaluateEffects(entries, 'on_switch_in', Object.assign({}, contextInput, { holder: mon }));
  }

  function resolveTryHit(defender, move, contextInput = {}) {
    const entries = collectEntries(defender, null);
    const merged = evaluateEffects(entries, 'on_try_hit', Object.assign({}, contextInput, { holder: defender, move }));
    const secondary = evaluateEffects(entries, 'on_secondary_effect_attempt', Object.assign({}, contextInput, { holder: defender, move }));
    merged.applied.push(...secondary.applied);
    merged.reasons.push(...secondary.reasons);
    merged.events.push(...secondary.events);
    merged.notes.push(...secondary.notes);
    merged.flags.blocksSecondary = merged.flags.blocksSecondary || secondary.flags.blocksSecondary;
    return merged;
  }

  function resolveDamageModifiers(attacker, defender, move, contextInput = {}) {
    const atkEntries = collectEntries(attacker, move);
    const defEntries = collectEntries(defender, null);
    const attackerResult = evaluateEffects(atkEntries, 'on_damage_calc', Object.assign({}, contextInput, {
      holder: attacker,
      attacker,
      defender,
      move
    }));
    const defenderTaken = evaluateEffects(defEntries, 'on_damage_calc_taken', Object.assign({}, contextInput, {
      holder: defender,
      attacker,
      defender,
      move
    }));
    const tryHit = evaluateEffects(defEntries, 'on_try_hit', Object.assign({}, contextInput, {
      holder: defender,
      attacker,
      defender,
      move
    }));

    return {
      attacker: attackerResult,
      defender: defenderTaken,
      prevention: tryHit,
      final: {
        damageMultiplier: attackerResult.modifiers.damage * defenderTaken.modifiers.damageTaken,
        attackMultiplier: attackerResult.modifiers.attack,
        specialAttackMultiplier: attackerResult.modifiers.specialAttack,
        specialDefenseMultiplier: defenderTaken.modifiers.specialDefense,
        immune: !!tryHit.flags.grantsImmunity,
        blockedByPriority: !!tryHit.flags.blocksPriority,
        blockedByStatus: !!tryHit.flags.blocksStatusMoves,
        blockedBySecondaryShield: !!tryHit.flags.blocksSecondary
      },
      reasons: [
        ...attackerResult.reasons,
        ...defenderTaken.reasons,
        ...tryHit.reasons
      ]
    };
  }

  function resolveMoveResolution(mon, move, contextInput = {}) {
    const entries = collectEntries(mon, move);
    return evaluateEffects(entries, 'on_move_resolution', Object.assign({}, contextInput, { holder: mon, move }));
  }

  function resolveAfterHit(mon, move, contextInput = {}) {
    const entries = collectEntries(mon, move);
    return evaluateEffects(entries, 'on_after_hit', Object.assign({}, contextInput, { holder: mon, move }));
  }

  function buildExplainLines(result) {
    const lines = [];
    if (result.final?.immune) lines.push('El objetivo gana inmunidad total al movimiento.');
    if (result.final?.blockedByPriority) lines.push('La prioridad queda bloqueada por un efecto defensivo.');
    if (result.final?.blockedByStatus) lines.push('El movimiento de estado queda bloqueado por una habilidad defensiva.');
    if (result.final?.damageMultiplier && result.final.damageMultiplier !== 1) {
      lines.push('Multiplicador final de daño por registro: x' + Number(result.final.damageMultiplier).toFixed(2));
    }
    if (result.final?.attackMultiplier && result.final.attackMultiplier !== 1) {
      lines.push('Ataque ofensivo ajustado por registro: x' + Number(result.final.attackMultiplier).toFixed(2));
    }
    if (result.final?.specialAttackMultiplier && result.final.specialAttackMultiplier !== 1) {
      lines.push('Ataque especial ajustado por registro: x' + Number(result.final.specialAttackMultiplier).toFixed(2));
    }
    if (result.final?.specialDefenseMultiplier && result.final.specialDefenseMultiplier !== 1) {
      lines.push('Defensa especial del objetivo ajustada por registro: x' + Number(result.final.specialDefenseMultiplier).toFixed(2));
    }
    return lines;
  }

  function createCurrentFieldSnapshot(state) {
    const field = state?.field || {};
    return {
      weather: field.weather || null,
      terrain: field.terrain || null,
      trickRoom: !!field.trickRoom,
      sides: {
        self: sideConditions(field, 'self'),
        enemy: sideConditions(field, 'enemy')
      }
    };
  }

  function patchExamples() {
    return {
      calculateSpeed: [
        'const reg = EffectsRegistryBridge.resolveSpeedModifiers(mon, { field: createCurrentFieldSnapshot(state), side });',
        'modifier *= reg.modifiers.speed;'
      ],
      estimateMoveDamage: [
        'const reg = EffectsRegistryBridge.resolveDamageModifiers(attacker, defender, cand, { field });',
        'if (reg.final.immune || reg.final.blockedByPriority || reg.final.blockedByStatus) return { damage: 0, blocked: true, registry: reg };',
        'raw *= reg.final.damageMultiplier;'
      ],
      switchIn: [
        'const reg = EffectsRegistryBridge.resolveSwitchIn(mon, { field: createCurrentFieldSnapshot(state) });',
        'consume reg.events for weather / terrain / stat drops on entry;'
      ]
    };
  }

  global.EffectsRegistryBridge = {
    state: registryState,
    loadEffectRegistry,
    createCurrentFieldSnapshot,
    getRegistryEntry,
    getAbilityEntry,
    getItemEntry,
    getMoveEntry,
    collectEntries,
    evaluateEffects,
    resolveSpeedModifiers,
    resolveSwitchIn,
    resolveTryHit,
    resolveDamageModifiers,
    resolveMoveResolution,
    resolveAfterHit,
    buildExplainLines,
    patchExamples,
    upsertAbilityEntry,
    upsertItemEntry,
    upsertMoveEntry,
    upsertStatusEntry,
    getStatusEntry
  };
})(window);