import { state } from '../core/state.js';
import { getRegistryBridge } from '../core/runtime.js';
import { effectiveness } from '../utils/types.js';
import { DEBUG_MODE } from '../utils/debug.js';
import { calculateSpeed } from './speed.js';

// Dependency Injection to avoid circular dependencies with UI logic
let _getActiveIndicesFallback = null;
export function setEffectsActiveIndicesCallback(cb) { _getActiveIndicesFallback = cb; }


export function tickField(state) {
  const f = state.field;
  if (!f) return;

  const dec = (keyFlag, keyTurns) => {
    if (f[keyTurns] > 0) {
      f[keyTurns] -= 1;
      if (f[keyTurns] <= 0) {
        f[keyFlag] = false;
        f[keyTurns] = 0;
      }
    }
  };

  // Clima y terreno (si quieres que duren X turnos en vez de infinito)
  dec('weather', 'weatherTurns'); // opcional: si weatherTurns llega a 0, puedes setear weather = null
  dec('terrain', 'terrainTurns'); // idem

  // Trick Room
  if (f.trickRoomTurns > 0) {
    f.trickRoomTurns -= 1;
    if (f.trickRoomTurns <= 0) {
      f.trickRoom = false;
      f.trickRoomTurns = 0;
    }
  }

  // Tailwind
  dec('tailwindSelf', 'tailwindSelfTurns');
  dec('tailwindEnemy', 'tailwindEnemyTurns');

  // Pantallas / velos
  dec('reflectSelf', 'reflectSelfTurns');
  dec('lightScreenSelf', 'lightScreenSelfTurns');
  dec('auroraVeilSelf', 'auroraVeilSelfTurns');

  dec('reflectEnemy', 'reflectEnemyTurns');
  dec('lightScreenEnemy', 'lightScreenEnemyTurns');
  dec('auroraVeilEnemy', 'auroraVeilEnemyTurns');

  // Flags de turno: quick/wide guard y redirección se limpian cada turno
  f.quickGuardSelf = false;
  f.wideGuardSelf = false;
  f.redirectionSelf = null;

  f.quickGuardEnemy = false;
  f.wideGuardEnemy = false;
  f.redirectionEnemy = null;
}

export function recalculateActiveField() {
  // Limpiamos los estados autogenerados
  state.field.weather = null;
  state.field.weatherTurns = 0;
  state.field.terrain = null;
  state.field.terrainTurns = 0;

  // Limpiamos los stages de los Pokémon para no acumular reducciones
  state.self.forEach(m => {
    if (m && m.battle) m.battle.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  });
  state.enemy.forEach(m => {
    if (m && m.battle) m.battle.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  });

  const actives = [];
  
  const sIdx = _getActiveIndicesFallback ? _getActiveIndicesFallback("self") : state.activeSelfSlots;
  const eIdx = _getActiveIndicesFallback ? _getActiveIndicesFallback("enemy") : state.activeEnemySlots;

  sIdx.forEach(i => {
     const m = state.self[i];
     if (m) actives.push({ mon: m, side: 'self', spe: calculateSpeed(m, 'self') });
  });
  eIdx.forEach(i => {
     const m = state.enemy[i];
     if (m) actives.push({ mon: m, side: 'enemy', spe: calculateSpeed(m, 'enemy') });
  });

  // Orden de resolución: de MÁS a MENOS rápido.
  // El más lento aplica su clima de último, por lo que es el que prevalece.
  actives.sort((a, b) => b.spe - a.spe);

  for (const cand of actives) {
    applySwitchInEffects(cand.mon, cand.side);
  }
}

export function applySwitchInEffects(mon, explicitSide) {
  if (!mon || !getRegistryBridge()) return;

  const fieldSnapshot =
    getRegistryBridge().createCurrentFieldSnapshot(state);

  const entry = getRegistryBridge().resolveSwitchIn(mon, {
    holder: mon,
    field: fieldSnapshot,
  });

  if (!entry || !Array.isArray(entry.events)) return;

  const side = explicitSide || mon.side || mon.battle?.side || 'self';
  const oppSide = side === 'self' ? 'enemy' : 'self';

  for (const ev of entry.events) {
    const payload = ev.payload || {};

    if (ev.kind === 'set_weather') {
      state.field.weather = payload.weather || payload.value || null;
      state.field.weatherTurns = payload.turns || 5;
    }

    if (ev.kind === 'set_terrain') {
      state.field.terrain = payload.terrain || payload.value || null;
      state.field.terrainTurns = payload.turns || 5;
    }

    if (ev.kind === 'toggle_room') {
      if (payload.room === 'trickRoom') {
        const next = !state.field.trickRoom;
        state.field.trickRoom = next;
        state.field.trickRoomTurns = next ? payload.turns || 5 : 0;
      }
    }

      if (ev.kind === 'modify_stat_stage') {
        const targetSide = (payload.target === 'foe' || payload.target === 'foes' || payload.target === 'foes_adjacent') ? oppSide : side;
        const stat = payload.stat;
        const value = payload.value || payload.delta || 0;
        
        const activeTargetIndices = targetSide === 'self' 
          ? (_getActiveIndicesFallback ? _getActiveIndicesFallback("self") : state.activeSelfSlots)
          : (_getActiveIndicesFallback ? _getActiveIndicesFallback("enemy") : state.activeEnemySlots);

        activeTargetIndices.forEach(idx => {
          const targetMon = state[targetSide][idx];
          if (!targetMon || !targetMon.battle) return;

          const abilityId = (targetMon.set?.ability || targetMon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
          let finalValue = value;

          if (value < 0 && targetSide === oppSide) {
             if (['defiant', 'competitive', 'competitivo', 'tenacidad'].includes(abilityId)) {
                 if (stat === 'atk') {
                     finalValue = 1; // Intimidación (-1) + Tenacidad (+2) = +1 Atk
                 } else {
                     targetMon.battle.stages['atk'] = Math.max(-6, Math.min(6, (targetMon.battle.stages['atk'] || 0) + 2));
                 }
             } else if (['clearbody', 'innerfocus', 'hypercutter', 'guarddog', 'focointerno', 'cuerpopuro'].includes(abilityId)) {
                 finalValue = 0; // Inmunidad a bajadas
             }
          }

          targetMon.battle.stages[stat] = Math.max(-6, Math.min(6, (targetMon.battle.stages[stat] || 0) + finalValue));
        });
      }

    if (ev.kind === 'set_side_condition') {
      const targetSide = payload.side || side; // por defecto, lado del owner
      const isSelf = targetSide === 'self';
      const f = state.field;

      switch (payload.condition || payload.value) {
        case 'reflect':
          if (isSelf) {
            f.reflectSelf = true;
            f.reflectSelfTurns = payload.turns || 5;
          } else {
            f.reflectEnemy = true;
            f.reflectEnemyTurns = payload.turns || 5;
          }
          break;
        case 'light_screen':
          if (isSelf) {
            f.lightScreenSelf = true;
            f.lightScreenSelfTurns = payload.turns || 5;
          } else {
            f.lightScreenEnemy = true;
            f.lightScreenEnemyTurns = payload.turns || 5;
          }
          break;
        case 'aurora_veil':
          if (isSelf) {
            f.auroraVeilSelf = true;
            f.auroraVeilSelfTurns = payload.turns || 5;
          } else {
            f.auroraVeilEnemy = true;
            f.auroraVeilEnemyTurns = payload.turns || 5;
          }
          break;
        case 'tailwind':
          if (isSelf) {
            f.tailwindSelf = true;
            f.tailwindSelfTurns = payload.turns || 4;
          } else {
            f.tailwindEnemy = true;
            f.tailwindEnemyTurns = payload.turns || 4;
          }
          break;
        case 'stealth_rock':
          state.field.hazards[targetSide].rocks = true;
          break;
        case 'spikes':
          state.field.hazards[targetSide].spikes = Math.min(
            3,
            (state.field.hazards[targetSide].spikes || 0) + 1
          );
          break;
        case 'toxic_spikes':
          state.field.hazards[targetSide].tspikes = Math.min(
            2,
            (state.field.hazards[targetSide].tspikes || 0) + 1
          );
          break;
        case 'sticky_web':
          state.field.hazards[targetSide].web = true;
          break;
        default:
          break;
      }
    }
  }

  applyHazardsOnSwitchIn(mon, side);
}

export function applyHazardsOnSwitchIn(mon, explicitSide) {
  if (!mon || !mon.battle) return;
  const side = explicitSide || mon.side || mon.battle.side || 'self';
  const hazards = state.field.hazards[side];
  if (!hazards) return;

  const types = (mon.types || []).map(t => String(t).toLowerCase());
  const abilityId = (mon.set?.ability || mon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
  const itemId = (mon.set?.item || mon.item || '').toLowerCase().replace(/[^a-z]/g, '');

  const isFlying = types.includes('flying');
  const hasLevitate = abilityId === 'levitate' || abilityId === 'levitacion';
  const hasBalloon = itemId === 'airballoon' || itemId === 'globohelio';
  
  const isGrounded = !isFlying && !hasLevitate && !hasBalloon;

  if (mon.battle.hpPct === undefined) mon.battle.hpPct = 100;
  if (!mon.battle.stages) mon.battle.stages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

  // Stealth Rock
  if (hazards.rocks) {
    const rockEff = effectiveness('rock', mon.types);
    const damagePct = 12.5 * rockEff;
    mon.battle.hpPct = Math.max(0, mon.battle.hpPct - Math.floor(damagePct));
  }

  // Spikes
  if (isGrounded && hazards.spikes > 0) {
    let damagePct = 12.5; // 1 capa
    if (hazards.spikes === 2) damagePct = 16.6; // 2 capas
    if (hazards.spikes >= 3) damagePct = 25; // 3 capas
    mon.battle.hpPct = Math.max(0, mon.battle.hpPct - Math.floor(damagePct));
  }

  // Sticky Web
  if (isGrounded && hazards.web) {
    mon.battle.stages.spe = Math.max(-6, (mon.battle.stages.spe || 0) - 1);
  }

  // Toxic Spikes
  if (isGrounded && hazards.tspikes > 0) {
    const isPoison = types.includes('poison');
    const isSteel = types.includes('steel');
    
    if (isPoison) {
      hazards.tspikes = 0; // Absorbe las Toxic Spikes
    } else if (!isSteel && (!mon.battle.status || mon.battle.status === 'none' || mon.battle.status === '')) {
      mon.battle.status = hazards.tspikes >= 2 ? 'tox' : 'psn';
    }
  }
}

export function applyMoveResolutionEffects(attacker, move, options = {}) {
  if (!attacker || !move || !getRegistryBridge()) return;

  const fieldSnapshot =
    getRegistryBridge().createCurrentFieldSnapshot(state);

  const entry = getRegistryBridge().resolveMoveResolution(attacker, move, {
    holder: attacker,
    move,
    field: fieldSnapshot,
  });

  if (!entry || !Array.isArray(entry.events)) return;

  if (!options.silent && typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE && entry && entry.reasons && entry.reasons.length > 0) {
     console.groupCollapsed(`🎬 [MOVE RESOLUTION] ${attacker.displayName || attacker.name} usó ${move.name || move.move || move} y generó efectos`);
     console.log(`Efectos causados por: ${entry.reasons.join(', ')}`);
     if (entry.events && entry.events.length > 0) {
         entry.events.forEach(ev => console.log(`  ↳ Evento disparado: ${ev.kind}`, ev.payload || ''));
     }
     console.groupEnd();
  }

  const side = attacker.side || attacker.battle?.side || 'self';

  for (const ev of entry.events) {
    const payload = ev.payload || {};
    const f = state.field;

    if (ev.kind === 'set_weather') {
      f.weather = payload.weather || payload.value || null;
      f.weatherTurns = payload.turns || 5;
    }

    if (ev.kind === 'set_terrain') {
      f.terrain = payload.terrain || payload.value || null;
      f.terrainTurns = payload.turns || 5;
    }

    if (ev.kind === 'toggle_room' && payload.room === 'trickRoom') {
      const next = !f.trickRoom;
      f.trickRoom = next;
      f.trickRoomTurns = next ? payload.turns || 5 : 0;
    }

    if (ev.kind === 'set_side_condition') {
      const targetSide = payload.side || side;
      const isSelf = targetSide === 'self';

      switch (payload.condition || payload.value) {
        case 'reflect':
          if (isSelf) {
            f.reflectSelf = true;
            f.reflectSelfTurns = payload.turns || 5;
          } else {
            f.reflectEnemy = true;
            f.reflectEnemyTurns = payload.turns || 5;
          }
          break;
        case 'light_screen':
          if (isSelf) {
            f.lightScreenSelf = true;
            f.lightScreenSelfTurns = payload.turns || 5;
          } else {
            f.lightScreenEnemy = true;
            f.lightScreenEnemyTurns = payload.turns || 5;
          }
          break;
        case 'aurora_veil':
          if (isSelf) {
            f.auroraVeilSelf = true;
            f.auroraVeilSelfTurns = payload.turns || 5;
          } else {
            f.auroraVeilEnemy = true;
            f.auroraVeilEnemyTurns = payload.turns || 5;
          }
          break;
        case 'tailwind':
          if (isSelf) {
            f.tailwindSelf = true;
            f.tailwindSelfTurns = payload.turns || 4;
          } else {
            f.tailwindEnemy = true;
            f.tailwindEnemyTurns = payload.turns || 4;
          }
          break;
        case 'stealth_rock':
          f.hazards[targetSide].rocks = true;
          break;
        case 'spikes':
          f.hazards[targetSide].spikes = Math.min(
            3,
            (f.hazards[targetSide].spikes || 0) + 1
          );
          break;
        case 'toxic_spikes':
          f.hazards[targetSide].tspikes = Math.min(
            2,
            (f.hazards[targetSide].tspikes || 0) + 1
          );
          break;
        case 'sticky_web':
          f.hazards[targetSide].web = true;
          break;
        default:
          break;
      }
    }

    if (ev.kind === 'protect_side_from_spread') {
      const targetSide = payload.side || side;
      if (targetSide === 'self') {
        f.wideGuardSelf = true;
      } else {
        f.wideGuardEnemy = true;
      }
    }

    if (ev.kind === 'protect_side_from_priority') {
      const targetSide = payload.side || side;
      if (targetSide === 'self') {
        f.quickGuardSelf = true;
      } else {
        f.quickGuardEnemy = true;
      }
    }

    if (ev.kind === 'set_redirection') {
      const targetSide = payload.side || side;
      const value = payload.value || attacker.name || attacker.displayName || true;
      if (targetSide === 'self') {
        f.redirectionSelf = value;
      } else {
        f.redirectionEnemy = value;
      }
    }
  }
}
