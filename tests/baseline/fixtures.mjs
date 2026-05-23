const ZERO_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export const CASE_STATUS = {
  correct: 'comportamiento correcto actual',
  provisional: 'comportamiento provisional heredado',
  gap: 'known-gap aceptado temporalmente',
};

export const SPECIES = {
  whimsicott: { name: 'whimsicott', displayName: 'Whimsicott', types: ['grass', 'fairy'], baseStats: { hp: 60, atk: 67, def: 85, spa: 77, spd: 75, spe: 116, speed: 116 } },
  farigiraf: { name: 'farigiraf', displayName: 'Farigiraf', types: ['normal', 'psychic'], baseStats: { hp: 120, atk: 90, def: 70, spa: 110, spd: 70, spe: 60, speed: 60 } },
  torkoal: { name: 'torkoal', displayName: 'Torkoal', types: ['fire'], baseStats: { hp: 70, atk: 85, def: 140, spa: 85, spd: 70, spe: 20, speed: 20 } },
  excadrill: { name: 'excadrill', displayName: 'Excadrill', types: ['ground', 'steel'], baseStats: { hp: 110, atk: 135, def: 60, spa: 50, spd: 65, spe: 88, speed: 88 } },
  tyranitar: { name: 'tyranitar', displayName: 'Tyranitar', types: ['rock', 'dark'], baseStats: { hp: 100, atk: 134, def: 110, spa: 95, spd: 100, spe: 61, speed: 61 } },
  dragonite: { name: 'dragonite', displayName: 'Dragonite', types: ['dragon', 'flying'], baseStats: { hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 80, speed: 80 } },
  indeedee: { name: 'indeedee-f', displayName: 'Indeedee-F', types: ['psychic', 'normal'], baseStats: { hp: 70, atk: 55, def: 65, spa: 95, spd: 105, spe: 85, speed: 85 } },
  bruxish: { name: 'bruxish', displayName: 'Bruxish', types: ['water', 'psychic'], baseStats: { hp: 68, atk: 105, def: 70, spa: 70, spd: 70, spe: 92, speed: 92 } },
  tsareena: { name: 'tsareena', displayName: 'Tsareena', types: ['grass'], baseStats: { hp: 72, atk: 120, def: 98, spa: 50, spd: 98, spe: 72, speed: 72 } },
  hatterene: { name: 'hatterene', displayName: 'Hatterene', types: ['psychic', 'fairy'], baseStats: { hp: 57, atk: 90, def: 95, spa: 136, spd: 103, spe: 29, speed: 29 } },
  charizard: { name: 'charizard-mega-y', displayName: 'Charizard', types: ['fire', 'flying'], baseStats: { hp: 78, atk: 104, def: 78, spa: 159, spd: 115, spe: 100, speed: 100 } },
  arcanine: { name: 'arcaninehisui', displayName: 'Arcanine', types: ['fire', 'rock'], baseStats: { hp: 95, atk: 115, def: 80, spa: 95, spd: 80, spe: 90, speed: 90 } },
  kingambit: { name: 'kingambit', displayName: 'Kingambit', types: ['dark', 'steel'], baseStats: { hp: 100, atk: 135, def: 120, spa: 60, spd: 85, spe: 50, speed: 50 } },
  milotic: { name: 'milotic', displayName: 'Milotic', types: ['water'], baseStats: { hp: 95, atk: 60, def: 79, spa: 100, spd: 125, spe: 81, speed: 81 } },
  arcanineKanto: { name: 'arcanine', displayName: 'Arcanine-K', types: ['fire'], baseStats: { hp: 90, atk: 110, def: 80, spa: 100, spd: 80, spe: 95, speed: 95 } },
  metagross: { name: 'metagross', displayName: 'Metagross', types: ['steel', 'psychic'], baseStats: { hp: 80, atk: 135, def: 130, spa: 95, spd: 90, spe: 70, speed: 70 } },
  rotomWash: { name: 'rotom-wash', displayName: 'Rotom-W', types: ['electric', 'water'], baseStats: { hp: 50, atk: 65, def: 107, spa: 105, spd: 107, spe: 86, speed: 86 } },
  gastrodon: { name: 'gastrodon', displayName: 'Gastrodon', types: ['water', 'ground'], baseStats: { hp: 111, atk: 83, def: 68, spa: 92, spd: 82, spe: 39, speed: 39 } },
  raichu: { name: 'raichu', displayName: 'Raichu', types: ['electric'], baseStats: { hp: 60, atk: 90, def: 55, spa: 90, spd: 80, spe: 110, speed: 110 } },
  azumarill: { name: 'azumarill', displayName: 'Azumarill', types: ['water', 'fairy'], baseStats: { hp: 100, atk: 50, def: 80, spa: 60, spd: 80, spe: 50, speed: 50 } },
  amoonguss: { name: 'amoonguss', displayName: 'Amoonguss', types: ['grass', 'poison'], baseStats: { hp: 114, atk: 85, def: 70, spa: 85, spd: 80, spe: 30, speed: 30 } },
  clefairy: { name: 'clefairy', displayName: 'Clefairy', types: ['fairy'], baseStats: { hp: 70, atk: 45, def: 48, spa: 60, spd: 65, spe: 35, speed: 35 } },
};

export function makeMon(speciesKey, options = {}) {
  const species = SPECIES[speciesKey] || SPECIES.whimsicott;
  const mon = structuredClone(species);
  mon.sprite = options.sprite || '';
  mon.side = options.side || 'self';
  mon.set = {
    ability: options.ability || '',
    item: options.item || '',
    moves: options.moves || [],
    nature: options.nature || 'Serious',
    evs: { ...ZERO_EVS, ...(options.evs || {}) },
    evScale: 'full',
  };
  mon.ability = mon.set.ability;
  mon.item = mon.set.item;
  mon.battle = {
    side: mon.side,
    hpPct: Number.isFinite(options.hpPct) ? options.hpPct : 100,
    status: options.status || 'none',
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...(options.stages || {}) },
    protected: !!options.protected,
    protectedBy: options.protectedBy || null,
    itemConsumed: !!options.itemConsumed,
  };
  mon.fainted = mon.battle.hpPct <= 0;
  return mon;
}

export function cloneField(overrides = {}) {
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
    ...overrides,
  };
}
