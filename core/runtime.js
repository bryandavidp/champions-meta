// core/runtime.js

// Safe accessors for global caches and bridges, keeping window as the backing store for compatibility.

export function getDamageCache() {
  window.currentDamageCache = window.currentDamageCache || {};
  return window.currentDamageCache;
}

export function clearDamageCache() {
  window.currentDamageCache = {};
}

export function getComboBestAttackCache() {
  window.comboBestAttackCache = window.comboBestAttackCache || {};
  return window.comboBestAttackCache;
}

export function clearComboBestAttackCache() {
  window.comboBestAttackCache = {};
}

export function getComboSpeedCache() {
  window.comboSpeedCache = window.comboSpeedCache || {};
  return window.comboSpeedCache;
}

export function clearComboSpeedCache() {
  window.comboSpeedCache = {};
}

export function getLoggedMessages() {
  window.loggedMessages = window.loggedMessages || new Set();
  return window.loggedMessages;
}

export function clearLoggedMessages() {
  if (window.loggedMessages) {
    window.loggedMessages.clear();
  }
}

export function getGameDB() {
  return window.GameDB || null;
}

export function getRegistryBridge() {
  return window.EffectsRegistryBridge || null;
}
