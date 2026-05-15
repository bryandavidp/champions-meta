import { getLoggedMessages, clearLoggedMessages, clearDamageCache } from '../core/runtime.js';

export let DEBUG_MODE = true;
export let FLOW_DEBUG = true;

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