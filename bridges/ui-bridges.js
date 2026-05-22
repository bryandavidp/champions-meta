import { state } from '../core/state.js';
import { clearComboSpeedCache, clearDamageCache } from '../core/runtime.js';
import { warmupRegistries } from '../battle/registry.js';
import { recalculateActiveField } from '../battle/effects.js';

// Bridge mínimo para refrescos UI que no pueden importar app/render directamente sin crear ciclos.
let renderAllCallback = () => {};
let renderSetEditorCallback = () => {};
let renderSetChoiceListCallback = () => {};
let setBatchUpdatingCallback = () => {};

export function configureUiBridges(callbacks = {}) {
  if (typeof callbacks.renderAll === 'function') {
    renderAllCallback = callbacks.renderAll;
  }
  if (typeof callbacks.renderSetEditor === 'function') {
    renderSetEditorCallback = callbacks.renderSetEditor;
  }
  if (typeof callbacks.renderSetChoiceList === 'function') {
    renderSetChoiceListCallback = callbacks.renderSetChoiceList;
  }
  if (typeof callbacks.setBatchUpdating === 'function') {
    setBatchUpdatingCallback = callbacks.setBatchUpdating;
  }
}

export function requestUiRender() {
  renderAllCallback();
}

export function setBatchUpdatingBridge(value) {
  setBatchUpdatingCallback(value);
}

export function scheduleMoveWarmup(options = {}) {
  const shouldRender = options.render !== false;
  clearDamageCache();
  clearComboSpeedCache();
  warmupRegistries();
  recalculateActiveField();
  if (shouldRender) renderAllCallback();
  if (shouldRender && state.setEditor.index !== null) {
    renderSetEditorCallback();
    if (state.setChoice.kind) renderSetChoiceListCallback();
  }
}
