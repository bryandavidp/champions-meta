import { CUSTOM_TERMS } from '../core/constants.js';
import { state } from '../core/state.js';
import { formatName, normalizeText } from '../utils/text.js';
import { buildDefaultSetForSpecies } from './sets.js';
import { getMetaRecord } from './meta.js';
import { getGameDB } from '../core/runtime.js';
import { getCanonicalSpecies, resolveCanonicalId, toLegacySpeciesInfo } from './canonical/dex.js';

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

function findCanonicalSpecies(name, key = normalizeText(name)) {
  const resolvedId =
    resolveCanonicalId('species', name) ||
    resolveCanonicalId('species', key) ||
    key;
  return getCanonicalSpecies(resolvedId) || getCanonicalSpecies(name) || getCanonicalSpecies(key) || null;
}

function attachCanonicalSpecies(mon, species) {
  if (!mon || !species) return mon;
  mon.canonicalId = species.id;
  mon.canonical = species;
  mon.abilities = species.abilities || mon.abilities || {};
  mon.abilityIds = species.abilityIds || mon.abilityIds || {};
  mon.baseSpecies = species.baseSpecies || mon.baseSpecies || mon.displayName;
  mon.forme = species.forme || mon.forme || null;
  mon.formKind = species.formKind || mon.formKind || null;
  mon.requiredItem = species.requiredItem || mon.requiredItem || null;
  mon.requiredAbility = species.requiredAbility || mon.requiredAbility || null;
  mon.battleOnly = species.battleOnly || mon.battleOnly || null;
  return mon;
}

export async function fetchPokemon(name) {
  const key = normalizeText(name);
  const canonicalSpecies = findCanonicalSpecies(name, key);
  if (CUSTOM_TERMS.has(key)) {
    // Fallback para Pokémon custom del formato sin API
    const customMon = {
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
    attachCanonicalSpecies(customMon, canonicalSpecies);
    return customMon;
  }
  if (state.cache.has(key)) {
    const cloned = structuredClone(state.cache.get(key));
      cloned.set = buildDefaultSetForSpecies(key, "self", -1);
      attachCanonicalSpecies(cloned, canonicalSpecies);
      ensureBattleState(cloned);
    return cloned;
  }
  
  if (!getGameDB()) return null;
  
  const dbData = getGameDB().pokedex[key] || (canonicalSpecies ? getGameDB().pokedex[canonicalSpecies.id] : null);
  if (!dbData) {
    if (canonicalSpecies) {
      const fallback = toLegacySpeciesInfo(canonicalSpecies);
      fallback.name = canonicalSpecies.id;
      fallback.metaRank = null;
      fallback.usage = 0;
      attachCanonicalSpecies(fallback, canonicalSpecies);
      fallback.set = buildDefaultSetForSpecies(fallback.name, "self", -1, fallback.types);
      ensureBattleState(fallback);
      return fallback;
    }
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

  const resolvedKey = canonicalSpecies?.id || key;
  const record = getMetaRecord(key) || getMetaRecord(resolvedKey);

  const mon = {
    id: dbData.id,
    name: dbData.name || resolvedKey,
    displayName: dbData.displayName,
    sprite: dbData.sprite,
    types: dbData.types,
    baseStats: dbData.baseStats,
    metaRank: record?.rank || null,
    usage: record?.usage || 0,
  };
  attachCanonicalSpecies(mon, canonicalSpecies);

  state.cache.set(key, structuredClone(mon));

  mon.set = buildDefaultSetForSpecies(key, "self", -1, mon.types);
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
