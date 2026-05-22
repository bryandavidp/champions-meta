import { state } from '../core/state.js';
import { getComboSpeedCache, getRegistryBridge } from '../core/runtime.js';
import { getNatureSpeModifier, getResolvedEvs, stageMultiplier } from './stats.js';
import { smartLog } from '../utils/debug.js';

export function getSpeedModifier(field, side, ability, item) {
  let modifier = 1;
  if ((side === "self" && field.tailwindSelf) || (side === "enemy" && field.tailwindEnemy)) {
    modifier *= 2;
  }
  if (field.weather === "rain" && ability === "Swift Swim") modifier *= 2;
  if (field.weather === "sun" && ability === "Chlorophyll") modifier *= 2;
  if (field.weather === "sand" && ability === "Sand Rush") modifier *= 2;
  if (field.weather === "snow" && ability === "Slush Rush") modifier *= 2;
  if (field.weather === "hail" && ability === "Slush Rush") modifier *= 2;
  if (item === "Choice Scarf") modifier *= 1.5;
  if (item === "Iron Ball") modifier *= 0.5;
  return modifier;
}

function hasRegistrySpeedFrom(registryResult, sourceKind) {
  return !!registryResult?.applied?.some(
    (entry) => entry.kind === 'speed_multiplier' && entry.sourceKind === sourceKind,
  );
}

export function calculateSpeed(mon, side, currentField = state.field) {
  if (!mon) return 0;

  const resolvedEvs = getResolvedEvs(mon);
  const baseSpe = mon.baseStats?.speed || 100;
  const nature = mon.set?.nature || "";
  const ability = (mon.set?.ability || mon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
  const item = (mon.set?.item || mon.item || '').toLowerCase().replace(/[^a-z]/g, '');

  const weatherKey = currentField?.weather || 'none';
  const trKey = currentField?.trickRoom ? 'tr' : 'notr';
  const tailwindKey =
    (side === "self" && currentField?.tailwindSelf) ||
    (side === "enemy" && currentField?.tailwindEnemy)
      ? 'tw'
      : 'notw';
  const speStageKey = mon.battle?.stages?.spe || 0;
  const statusKey = mon.battle?.status || 'none';

  const cacheKey = [
    mon.name,
    side,
    `base${baseSpe}`,
    `ev${resolvedEvs.spe}`,
    `nat${nature || 'neutral'}`,
    `abi${ability || 'none'}`,
    `item${item || 'none'}`,
    weatherKey,
    trKey,
    tailwindKey,
    `spe${speStageKey}`,
    statusKey,
  ].join('|');

  if (getComboSpeedCache()[cacheKey] !== undefined) {
    return getComboSpeedCache()[cacheKey];
  }

  let spe = Math.floor(((2 * baseSpe + 31 + Math.floor(resolvedEvs.spe / 4)) * 50) / 100) + 5;
  spe = Math.floor(spe * getNatureSpeModifier(nature));
  spe = Math.floor(spe * stageMultiplier(speStageKey));

  let mod = 1;
  if ((side === "self" && currentField.tailwindSelf) || (side === "enemy" && currentField.tailwindEnemy)) {
    mod *= 2;
  }

  const weatherStr = (currentField?.weather ?? state.field?.weather ?? '').toLowerCase();
  let trigger = '';

  let registrySpeed = null;
  if (getRegistryBridge()) {
    registrySpeed = getRegistryBridge().resolveSpeedModifiers(mon, {
      side,
      holder: mon,
      field: currentField,
    });
  }

  if (!hasRegistrySpeedFrom(registrySpeed, 'ability')) {
    if (weatherStr.includes('sun') && ability.includes('chlorophyll')) {
      mod *= 2;
      trigger = 'Clorofila';
    }
    if (weatherStr.includes('rain') && ability.includes('swiftswim')) {
      mod *= 2;
      trigger = 'Nado Rapido';
    }
    if (weatherStr.includes('sand') && ability.includes('sandrush')) {
      mod *= 2;
      trigger = 'Impetu Arena';
    }
    if ((weatherStr.includes('snow') || weatherStr.includes('hail')) && ability.includes('slushrush')) {
      mod *= 2;
      trigger = 'Quitanieves';
    }
  }

  if (!hasRegistrySpeedFrom(registrySpeed, 'item')) {
    if (item === 'choicescarf') {
      mod *= 1.5;
      trigger = 'Panuelo Eleccion';
    }
    if (item === 'ironball') {
      mod *= 0.5;
      trigger = 'Bola Ferrea';
    }
  }

  if (statusKey === 'par') {
    mod *= 0.5;
    trigger = trigger ? `${trigger} + Paralisis` : 'Paralisis';
  }

  if (registrySpeed) mod *= registrySpeed.modifiers.speed;

  const finalSpe = Math.floor(spe * mod);

  smartLog(
    `spd-${cacheKey}`,
    `[SPEED] ${mon.displayName || mon.name} | Base: ${baseSpe} | Mod: x${mod} ${trigger ? `(${trigger})` : ''} | FINAL: ${finalSpe}`,
  );

  const result = currentField.trickRoom ? -finalSpe : finalSpe;
  getComboSpeedCache()[cacheKey] = result;
  return result;
}
