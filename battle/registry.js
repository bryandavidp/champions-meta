import { state } from '../core/state.js';
import { getRegistryBridge } from '../core/runtime.js';
import { normalizeText } from '../utils/text.js';
import { fetchMoveInfo } from './moves.js';

export function ensureAbilityRegistry(abilityName) {
  if (!getRegistryBridge() || !abilityName) return;
  const slug = normalizeText(abilityName);
  if (getRegistryBridge().getAbilityEntry(slug)) return;

  let entry = null;

  switch (slug) {
    case 'intimidate':
      entry = {
        slug,
        name: 'Intimidate',
        triggers: ['on_switch_in'],
        effects: [
          {
            kind: 'modify_stat_stage',
            target: 'foe',
            stat: 'atk',
            value: -1,
          },
        ],
      };
      break;

    case 'swiftswim':
      entry = {
        slug,
        name: 'Swift Swim',
        triggers: ['on_speed_calc'],
        effects: [
          {
            kind: 'speed_multiplier',
            value: 2,
            when: { weather: 'rain' },
          },
        ],
      };
      break;

    case 'chlorophyll':
      entry = {
        slug,
        name: 'Chlorophyll',
        triggers: ['on_speed_calc'],
        effects: [
          {
            kind: 'speed_multiplier',
            value: 2,
            when: { weather: 'sun' },
          },
        ],
      };
      break;

    case 'sandrush':
      entry = {
        slug,
        name: 'Sand Rush',
        triggers: ['on_speed_calc'],
        effects: [
          {
            kind: 'speed_multiplier',
            value: 2,
            when: { weather: 'sand' },
          },
        ],
      };
      break;

    case 'friendguard':
      entry = {
        slug,
        name: 'Friend Guard',
        triggers: ['on_damage_calc_taken'],
        effects: [
          {
            kind: 'final_damage_multiplier',
            value: 0.75,
            target: 'ally',
          },
        ],
      };
      break;

    case 'goodasgold':
      entry = {
        slug,
        name: 'Good as Gold',
        triggers: ['on_try_status'],
        effects: [
          {
            kind: 'grant_immunity',
            move_damage_class: 'status',
          },
        ],
      };
      break;

    case 'armortail':
      entry = {
        slug,
        name: 'Armor Tail',
        triggers: ['on_try_hit'],
        effects: [
          {
            kind: 'block_priority',
          },
        ],
      };
      break;

    case 'waterabsorb':
      entry = {
        slug,
        name: 'Water Absorb',
        triggers: ['on_damage_calc_taken'],
        effects: [
          {
            kind: 'grant_immunity',
            move_type: 'water',
          },
          {
            kind: 'heal_fraction',
            value: 0.25,
            when: { move_type: 'water' },
          },
        ],
      };
      break;

    case 'drought':
      entry = {
        slug,
        name: 'Drought',
        triggers: ['on_switch_in'],
        effects: [
          {
            kind: 'set_weather',
            value: 'sun',
            turns: 5,
          },
        ],
      };
      break;

    case 'drizzle':
      entry = {
        slug,
        name: 'Drizzle',
        triggers: ['on_switch_in'],
        effects: [
          {
            kind: 'set_weather',
            value: 'rain',
            turns: 5,
          },
        ],
      };
      break;

    case 'sandstream':
      entry = {
        slug,
        name: 'Sand Stream',
        triggers: ['on_switch_in'],
        effects: [
          {
            kind: 'set_weather',
            value: 'sand',
            turns: 5,
          },
        ],
      };
      break;

    case 'snowwarning':
      entry = {
        slug,
        name: 'Snow Warning',
        triggers: ['on_switch_in'],
        effects: [
          {
            kind: 'set_weather',
            value: 'snow',
            turns: 5,
          },
        ],
      };
      break;

    // Añade aquí otras habilidades clave (lightning-rod, storm-drain, ruins...)
    default:
      break;
  }

  if (entry) {
    getRegistryBridge().upsertAbilityEntry(slug, entry);
  }
}

export function ensureItemRegistry(itemName) {
  if (!getRegistryBridge() || !itemName) return;
  const slug = normalizeText(itemName);
  if (getRegistryBridge().getItemEntry(slug)) return;

  let entry = null;

  switch (slug) {
    case 'lifeorb':
      entry = {
        slug,
        name: 'Life Orb',
        triggers: ['on_damage_calc', 'on_after_hit'],
        effects: [
          {
            kind: 'final_damage_multiplier',
            value: 1.3,
          },
          {
            kind: 'recoil_fraction',
            value: 0.1,
            target: 'self',
          },
        ],
      };
      break;

    case 'choiceband':
      entry = {
        slug,
        name: 'Choice Band',
        triggers: ['on_damage_calc', 'on_move_selected'],
        effects: [
          {
            kind: 'stat_multiplier',
            stat: 'atk',
            value: 1.5,
          },
          {
            kind: 'choice_lock',
          },
        ],
      };
      break;

    case 'choicespecs':
      entry = {
        slug,
        name: 'Choice Specs',
        triggers: ['on_damage_calc', 'on_move_selected'],
        effects: [
          {
            kind: 'stat_multiplier',
            stat: 'spa',
            value: 1.5,
          },
          {
            kind: 'choice_lock',
          },
        ],
      };
      break;

    case 'assaultvest':
      entry = {
        slug,
        name: 'Assault Vest',
        triggers: ['on_defense_calc'],
        effects: [
          {
            kind: 'special_defense_multiplier',
            value: 1.5,
          },
          {
            kind: 'forbid_status_moves',
          },
        ],
      };
      break;

    case 'clearamulet':
      entry = {
        slug,
        name: 'Clear Amulet',
        triggers: ['on_stat_drop_attempt'],
        effects: [
          {
            kind: 'block_stat_drop',
          },
        ],
      };
      break;

    case 'covertcloak':
      entry = {
        slug,
        name: 'Covert Cloak',
        triggers: ['on_secondary_effect_attempt'],
        effects: [
          {
            kind: 'block_secondary_effects',
          },
        ],
      };
      break;

    case 'focussash':
      entry = {
        slug,
        name: 'Focus Sash',
        triggers: ['on_lethal_hit'],
        effects: [
          {
            kind: 'survive_at_1hp',
          },
        ],
      };
      break;

    // Berries mitigadoras, Weakness Policy, etc. se pueden añadir aquí
    default:
      break;
  }

  if (entry) {
    getRegistryBridge().upsertItemEntry(slug, entry);
  }
}

export function ensureMoveRegistry(moveName) {
  if (!getRegistryBridge() || !moveName) return;
  const slug = normalizeText(moveName);
  if (getRegistryBridge().getMoveEntry(slug)) return;

  let entry = null;

  switch (slug) {
    case 'trickroom':
      entry = {
        slug,
        name: 'Trick Room',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'toggle_room',
            room: 'trickRoom',
            value: true,
            turns: 5,
          },
        ],
      };
      break;

    case 'tailwind':
      entry = {
        slug,
        name: 'Tailwind',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'self',
            condition: 'tailwind',
            turns: 4,
          },
        ],
      };
      break;

    case 'reflect':
      entry = {
        slug,
        name: 'Reflect',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'self',
            condition: 'reflect',
            turns: 5,
          },
        ],
      };
      break;

    case 'lightscreen':
      entry = {
        slug,
        name: 'Light Screen',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'self',
            condition: 'light_screen',
            turns: 5,
          },
        ],
      };
      break;

    case 'auroraveil':
      entry = {
        slug,
        name: 'Aurora Veil',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'self',
            condition: 'aurora_veil',
            turns: 5,
          },
        ],
      };
      break;

    case 'wideguard':
      entry = {
        slug,
        name: 'Wide Guard',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'protect_side_from_spread',
            side: 'self',
          },
        ],
      };
      break;

    case 'quickguard':
      entry = {
        slug,
        name: 'Quick Guard',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'protect_side_from_priority',
            side: 'self',
          },
        ],
      };
      break;

    case 'followme':
    case 'ragepowder':
      entry = {
        slug,
        name: moveName,
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_redirection',
            side: 'self',
            value: true,
          },
        ],
      };
      break;

    case 'stealthrock':
      entry = {
        slug,
        name: 'Stealth Rock',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'enemy',
            condition: 'stealth_rock',
          },
        ],
      };
      break;

    case 'spikes':
      entry = {
        slug,
        name: 'Spikes',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'enemy',
            condition: 'spikes',
          },
        ],
      };
      break;

    case 'toxicspikes':
      entry = {
        slug,
        name: 'Toxic Spikes',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'enemy',
            condition: 'toxic_spikes',
          },
        ],
      };
      break;

    case 'stickyweb':
      entry = {
        slug,
        name: 'Sticky Web',
        triggers: ['on_move_resolution'],
        effects: [
          {
            kind: 'set_side_condition',
            side: 'enemy',
            condition: 'sticky_web',
          },
        ],
      };
      break;

    // Protect se gestiona más por flags y hooks on_try_hit/on_move_resolution
    default:
      break;
  }

  if (entry) {
    getRegistryBridge().upsertMoveEntry(slug, entry);
  }
}

export function ensureStatusRegistry(statusName) {
  if (!getRegistryBridge() || !statusName) return;
  const slug = normalizeText(statusName);
  if (getRegistryBridge().getStatusEntry?.(slug)) return;

  let entry = null;

  if (slug === 'brn') {
    entry = {
      slug,
      name: 'Burn',
      triggers: ['on_damage_calc'],
      effects: [
        {
          kind: 'attack_multiplier',
          value: 0.5,
          unless: ['guts']
        }
      ],
    };
  }

  if (entry && getRegistryBridge().upsertStatusEntry) {
    getRegistryBridge().upsertStatusEntry(slug, entry);
  }
}

export function warmupRegistries() {
  const mons = [...state.self, ...state.enemy].filter(Boolean);
  mons.forEach(mon => {
    const set = mon.set || {};
    if (set.ability) ensureAbilityRegistry(set.ability);
    if (set.item) ensureItemRegistry(set.item);
    (set.moves || []).filter(Boolean).forEach(m => {
      ensureMoveRegistry(m);
      fetchMoveInfo(m);
    });
    if (mon.battle?.status) ensureStatusRegistry(mon.battle.status);
  });
}
