import { CUSTOM_TERMS } from '../core/constants.js';
import { state } from '../core/state.js';
import { formatName, normalizeText } from '../utils/text.js';
import { buildDefaultSetForSpecies } from './sets.js';
import { getMetaRecord } from './meta.js';
import { getGameDB } from '../core/runtime.js';

export let onPokemonFetched = () => {};
export function setOnPokemonFetched(cb) { onPokemonFetched = cb; }

export function homeSpriteFromPokemon(data) {
  return (
    data?.sprites?.other?.home?.front_default ||
    data?.sprites?.other?.["official-artwork"]?.front_default ||
    data?.sprites?.front_default ||
    ""
  );
}

export async function fetchPokemon(name) {
  const key = normalizeText(name);
  if (CUSTOM_TERMS.has(key)) {
    // Fallback para Pokémon custom del formato sin API
    return {
      name: key,
      displayName: formatName(name),
      sprite: "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png",
      types: ["normal"],
      baseStats: {
        "hp": 100, "attack": 100, "defense": 100,
        "special-attack": 100, "special-defense": 100, "speed": 100
      },
        set: buildDefaultSetForSpecies(key, "self", -1, ["normal"]),
    };
  }
  if (state.cache.has(key)) {
    const cloned = structuredClone(state.cache.get(key));
      cloned.set = buildDefaultSetForSpecies(key, "self", -1);
      ensureBattleState(cloned);
    return cloned;
  }
  
  if (!getGameDB()) return null;
  
  const dbData = getGameDB().pokedex[key];
  if (!dbData) {
    console.warn(`[DEBUG] Pokémon no encontrado o ignorado por Smogon: ${name}`);
    const fallback = {
      id: 0, 
      name: key, 
      displayName: name, 
      sprite: '',
      types: ['normal'],
      baseStats: { hp: 100, attack: 100, defense: 100, "special-attack": 100, "special-defense": 100, speed: 100 },
      metaRank: null, 
      usage: 0
    };
    fallback.set = buildDefaultSetForSpecies(key, "self", -1);
    ensureBattleState(fallback);
    return fallback;
  }

  const record = getMetaRecord(key);

  const mon = {
    id: dbData.id,
    name: key,
    displayName: dbData.displayName,
    sprite: dbData.sprite,
    types: dbData.types,
    baseStats: dbData.baseStats,
    metaRank: record?.rank || null,
    usage: record?.usage || 0,
  };

  state.cache.set(key, structuredClone(mon));

  mon.set = buildDefaultSetForSpecies(key, "self", -1);
  ensureBattleState(mon);
  onPokemonFetched();
  return structuredClone(mon);
}

export function ensureBattleState(mon) {
  if (!mon) return mon;
  if (!mon.battle) {
    mon.battle = {
      // HP en porcentaje relativo al máximo calculado por calcMonHP
      hpPct: 100,
      // Stages de stats, al estilo Showdown (-6..+6)
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      // Estado principal: 'brn', 'par', 'slp', 'psn', 'tox', 'frz', etc.
      status: null,
      // Nombre del movimiento bloqueado por Choice
      choiceLocked: null,
      // Flag de si el Sash sigue intacto
      sashIntact: mon.set?.item === 'Focus Sash',
      // Contadores especiales (ej. Rage Fist, Anger Shell, etc.)
      boostStacks: {
        rageFist: 0,
      },
    };
  }
  return mon;
}
