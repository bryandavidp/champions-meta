import { toCanonicalId } from '../data/canonical/dex.js';

export const RULE_REGISTRY_VERSION = 'rule-registry-v1';

export function ruleId(value) {
  return toCanonicalId(value || '');
}

export const PRIORITY_DENIAL_ABILITIES = new Set(['armortail', 'dazzling', 'queenlymajesty']);
export const PRANKSTER_ABILITIES = new Set(['prankster']);
export const REDIRECTION_MOVES = new Set(['followme', 'ragepowder', 'spotlight']);
export const PROTECT_MOVES = new Set(['protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'silktrap', 'burningbulwark']);
export const QUICK_GUARD_MOVES = new Set(['quickguard']);
export const WIDE_GUARD_MOVES = new Set(['wideguard']);
export const TAILWIND_MOVES = new Set(['tailwind']);
export const TRICK_ROOM_MOVES = new Set(['trickroom']);
export const HELPING_HAND_MOVES = new Set(['helpinghand']);
export const SCREEN_MOVES = new Set(['reflect', 'lightscreen', 'auroraveil']);
export const PIVOT_MOVES = new Set(['uturn', 'voltswitch', 'flipturn', 'partingshot', 'batonpass', 'shedtail', 'chillyreception']);
export const FAKE_OUT_MOVES = new Set(['fakeout']);
export const SUCKER_PUNCH_MOVES = new Set(['suckerpunch']);
export const POWDER_MOVES = new Set(['spore', 'sleeppowder', 'ragepowder', 'stunspore', 'poisonpowder', 'powder']);

export const FIELD_WEATHER_MOVES = new Map([
  ['sunnyday', 'sun'],
  ['raindance', 'rain'],
  ['sandstorm', 'sand'],
  ['snowscape', 'snow'],
]);

export const FIELD_TERRAIN_MOVES = new Map([
  ['electricterrain', 'electric'],
  ['grassyterrain', 'grassy'],
  ['mistyterrain', 'misty'],
  ['psychicterrain', 'psychic'],
]);

export const SWITCH_IN_WEATHER_ABILITIES = new Map([
  ['drought', 'sun'],
  ['drizzle', 'rain'],
  ['sandstream', 'sand'],
  ['snowwarning', 'snow'],
]);

export const SWITCH_IN_TERRAIN_ABILITIES = new Map([
  ['electricsurge', 'electric'],
  ['grassysurge', 'grassy'],
  ['mistysurge', 'misty'],
  ['psychicsurge', 'psychic'],
]);

export const SPEED_WEATHER_ABILITIES = {
  rain: new Set(['swiftswim']),
  sun: new Set(['chlorophyll']),
  sand: new Set(['sandrush']),
  snow: new Set(['slushrush']),
  hail: new Set(['slushrush']),
};

export const CHOICE_ITEMS = new Set(['choiceband', 'choicespecs', 'choicescarf']);
export const FLINCH_BLOCK_ABILITIES = new Set(['innerfocus', 'shielddust']);
export const FLINCH_BLOCK_ITEMS = new Set(['covertcloak']);
export const STAT_DROP_BLOCK_ABILITIES = new Set(['clearbody', 'whitesmoke', 'fullmetalbody', 'hypercutter', 'innerfocus', 'guarddog']);
export const STAT_DROP_BLOCK_ITEMS = new Set(['clearamulet']);
export const ANTI_STAT_DROP_ABILITIES = new Set(['defiant', 'competitive', 'guarddog']);

export const TERRAIN_SEEDS = new Map([
  ['electricseed', { terrain: 'electric', stat: 'def', delta: 1 }],
  ['grassyseed', { terrain: 'grassy', stat: 'def', delta: 1 }],
  ['mistyseed', { terrain: 'misty', stat: 'spd', delta: 1 }],
  ['psychicseed', { terrain: 'psychic', stat: 'spd', delta: 1 }],
]);

export const RESIST_BERRIES = new Map([
  ['occaberry', 'fire'],
  ['passhoberry', 'water'],
  ['wacanberry', 'electric'],
  ['rindoberry', 'grass'],
  ['yacheberry', 'ice'],
  ['chopleberry', 'fighting'],
  ['kebiaberry', 'poison'],
  ['shucaberry', 'ground'],
  ['cobaberry', 'flying'],
  ['payapaberry', 'psychic'],
  ['tangaberry', 'bug'],
  ['chartiberry', 'rock'],
  ['kasibberry', 'ghost'],
  ['habanberry', 'dragon'],
  ['colburberry', 'dark'],
  ['babiriberry', 'steel'],
  ['roseliberry', 'fairy'],
  ['chilanberry', 'normal'],
]);

export const HEAL_BERRIES = new Map([
  ['sitrusberry', { threshold: 0.5, healFraction: 0.25 }],
  ['oranberry', { threshold: 0.5, healFlat: 10 }],
  ['aguavberry', { threshold: 0.25, healFraction: 1 / 3 }],
  ['figyberry', { threshold: 0.25, healFraction: 1 / 3 }],
  ['iapapaberry', { threshold: 0.25, healFraction: 1 / 3 }],
  ['magoberry', { threshold: 0.25, healFraction: 1 / 3 }],
  ['wikiberry', { threshold: 0.25, healFraction: 1 / 3 }],
]);

export const STATUS_CURE_BERRIES = new Map([
  ['lumberry', 'any'],
  ['cheriberry', 'par'],
  ['chestoberry', 'slp'],
  ['pechaberry', 'psn'],
  ['rawstberry', 'brn'],
  ['aspearberry', 'frz'],
  ['persimberry', 'confusion'],
]);

export function hasChoiceLockItem(itemId) {
  return CHOICE_ITEMS.has(ruleId(itemId));
}

export function getChoiceDamageModifier(itemId, category) {
  const id = ruleId(itemId);
  if (id === 'choiceband' && category === 'physical') return 1.5;
  if (id === 'choicespecs' && category === 'special') return 1.5;
  return 1;
}

export function getChoiceSpeedModifier(itemId) {
  return ruleId(itemId) === 'choicescarf' ? 1.5 : 1;
}

export function blocksFlinch(abilityId, itemId) {
  return FLINCH_BLOCK_ABILITIES.has(ruleId(abilityId)) || FLINCH_BLOCK_ITEMS.has(ruleId(itemId));
}

export function blocksStatDrop(abilityId, itemId) {
  return STAT_DROP_BLOCK_ABILITIES.has(ruleId(abilityId)) || STAT_DROP_BLOCK_ITEMS.has(ruleId(itemId));
}

export function getResistBerryType(itemId) {
  return RESIST_BERRIES.get(ruleId(itemId)) || null;
}

export function getHealBerry(itemId) {
  return HEAL_BERRIES.get(ruleId(itemId)) || null;
}

export function getStatusCureBerry(itemId, status) {
  const berry = STATUS_CURE_BERRIES.get(ruleId(itemId));
  if (!berry) return null;
  if (berry === 'any' || berry === status) return berry;
  return null;
}

export function getTerrainSeed(itemId, terrain) {
  const seed = TERRAIN_SEEDS.get(ruleId(itemId));
  if (!seed || seed.terrain !== terrain) return null;
  return seed;
}

export function getSwitchInWeather(abilityId) {
  return SWITCH_IN_WEATHER_ABILITIES.get(ruleId(abilityId)) || null;
}

export function getSwitchInTerrain(abilityId) {
  return SWITCH_IN_TERRAIN_ABILITIES.get(ruleId(abilityId)) || null;
}

export function isWeatherSpeedAbility(abilityId, weather) {
  return !!SPEED_WEATHER_ABILITIES[weather]?.has(ruleId(abilityId));
}

export function isProtoQuarkAbility(abilityId) {
  const id = ruleId(abilityId);
  return id === 'protosynthesis' || id === 'quarkdrive';
}

export function isProtoQuarkFieldActive(abilityId, field = {}) {
  const id = ruleId(abilityId);
  if (id === 'protosynthesis') return field.weather === 'sun';
  if (id === 'quarkdrive') return field.terrain === 'electric';
  return false;
}
