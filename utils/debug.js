import { getLoggedMessages, clearLoggedMessages, clearDamageCache } from '../core/runtime.js';

export let DEBUG_MODE = true;
export let FLOW_DEBUG = true;
let renderAllCallback = () => {};
let getRowsCallback = () => [];
let cloneSimulationStateCallback = (value) => value;
let getStateCallback = () => null;

export function smartLog(key, message) {
    if (!DEBUG_MODE) return;
    const loggedMessages = getLoggedMessages();
    if (!loggedMessages.has(key)) {
        console.log(message);
        loggedMessages.add(key);
    }
}

export function flowLog(msg, data) {
    if (!DEBUG_MODE || !FLOW_DEBUG) return;
    console.log(`[FLOW] ${msg}`, data !== undefined ? data : '');
}

export function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

export function resetSmartLog() {
    clearLoggedMessages();
    clearDamageCache();
}

export function setDebugMode(force) {
    DEBUG_MODE = typeof force === 'boolean' ? force : !DEBUG_MODE;
    return DEBUG_MODE;
}

export function configureDebugActions(callbacks = {}) {
    if (typeof callbacks.renderAll === 'function') {
        renderAllCallback = callbacks.renderAll;
    }
    if (typeof callbacks.getRows === 'function') {
        getRowsCallback = callbacks.getRows;
    }
    if (typeof callbacks.cloneSimulationState === 'function') {
        cloneSimulationStateCallback = callbacks.cloneSimulationState;
    }
    if (typeof callbacks.getState === 'function') {
        getStateCallback = callbacks.getState;
    }
}

export function toggleDebug(force) {
    setDebugMode(force);
    renderAllCallback();
}

export function runDebugScenarios() {
    const scenarios = [];

    scenarios.push({
        name: 'Intimidate + Friend Guard + Reflect',
        setup: () => {
            const currentState = getStateCallback();
            return cloneSimulationStateCallback(currentState);
        },
    });

    for (const sc of scenarios) {
        sc.setup();
        const rows = getRowsCallback();
        console.log('[SCENARIO]', sc.name, rows);
    }
}
