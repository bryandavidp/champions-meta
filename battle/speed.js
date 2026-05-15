import { state } from '../core/state.js';
import { getComboSpeedCache, getRegistryBridge } from '../core/runtime.js';
import { getNatureSpeModifier } from './stats.js';
import { smartLog } from '../utils/debug.js';

export function getSpeedModifier(field, side, ability, item) {
  let modifier = 1;
  if ((side === "self" && field.tailwindSelf) || (side === "enemy" && field.tailwindEnemy)) {
    modifier *= 2;
  }
  if (field.weather === "rain" && ability === "Swift Swim") modifier *= 2;
  if (field.weather === "sun" && ability === "Chlorophyll") modifier *= 2;
  if (field.weather === "sand" && ability === "Sand Rush") modifier *= 2;
  if (item === "Choice Scarf") modifier *= 1.5;
  if (item === "Iron Ball") modifier *= 0.5;
  return modifier;
}

export function calculateSpeed(mon, side, currentField = state.field) {
  if (!mon) return 0;

  // 1. Crear una clave de caché robusta basada en las condiciones
  const weatherKey = currentField?.weather || 'none';
  const trKey = currentField?.trickRoom ? 'tr' : 'notr';
  const tailwindKey = (side === "self" && currentField?.tailwindSelf) || (side === "enemy" && currentField?.tailwindEnemy) ? 'tw' : 'notw';
  
  const cacheKey = `${mon.name}-${weatherKey}-${trKey}-${tailwindKey}`;

  
  if (getComboSpeedCache()[cacheKey] !== undefined) {
      return getComboSpeedCache()[cacheKey];
  }

  const baseSpe = mon.baseStats?.speed || 100;
  const evsSpe = mon.set?.evs?.spe || 0;
  const nature = mon.set?.nature || "";

  // Level 50 stat calculation
  let spe = Math.floor(((2 * baseSpe + 31 + Math.floor(evsSpe / 4)) * 50) / 100) + 5;
  spe = Math.floor(spe * getNatureSpeModifier(nature));

  let mod = 1;

  if ((side === "self" && currentField.tailwindSelf) || (side === "enemy" && currentField.tailwindEnemy)) {
    mod *= 2;
  }

  const ability = (mon.set?.ability || mon.ability || '').toLowerCase().replace(/[^a-z]/g, '');
  const item = (mon.set?.item || mon.item || '').toLowerCase().replace(/[^a-z]/g, '');
  const weatherStr = (currentField?.weather ?? state.field?.weather ?? '').toLowerCase();

  let trigger = '';

  if (weatherStr.includes('sun') && ability.includes('chlorophyll')) { mod *= 2; trigger = '☀️ Clorofila'; }
  if (weatherStr.includes('rain') && ability.includes('swiftswim')) { mod *= 2; trigger = '🌧️ Nado Rápido'; }
  if (weatherStr.includes('sand') && ability.includes('sandrush')) { mod *= 2; trigger = '🏜️ Ímpetu Arena'; }
  if (weatherStr.includes('snow') && ability.includes('slushrush')) { mod *= 2; trigger = '❄️ Quitanieves'; }
  if (weatherStr.includes('hail') && ability.includes('slushrush')) { mod *= 2; trigger = '❄️ Quitanieves'; }

  if (item === 'choicescarf') { mod *= 1.5; trigger = '🧣 Pañuelo Elección'; }
  if (item === 'ironball') { mod *= 0.5; trigger = '🪨 Bola Férrea'; }

  if (getRegistryBridge()) {
    const regSpeed = getRegistryBridge().resolveSpeedModifiers(mon, {
      side,
      holder: mon,
      field: currentField
    });
    mod *= regSpeed.modifiers.speed;
  }

  const finalSpe = Math.floor(spe * mod);

  smartLog(
      `spd-${cacheKey}`,
      `🏎️ [SPEED] ${mon.displayName || mon.name} | Base: ${baseSpe} | Mod: x${mod} ${trigger ? '('+trigger+')' : ''} | FINAL: ${finalSpe}`
  );

  const result = currentField.trickRoom ? -finalSpe : finalSpe;
  
  // 2. Guardar en caché antes de salir
  getComboSpeedCache()[cacheKey] = result;
  return result;
}
