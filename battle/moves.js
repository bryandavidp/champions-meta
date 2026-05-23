import { SUPPORT_MOVES, MOVE_TYPE_FALLBACK, CUSTOM_TERMS, TYPE_META } from '../core/constants.js';
import { normalizeText, formatName } from '../utils/text.js';
import { state } from '../core/state.js';
import { getGameDB } from '../core/runtime.js';
import { getCanonicalMove, toLegacyMoveInfo } from '../data/canonical/dex.js';

export function isSupportMove(moveName) {
  const n = normalizeText(moveName);
  for (const sm of SUPPORT_MOVES) {
    if (normalizeText(sm) === n) return true;
  }
  return false;
}

export function fetchMoveInfo(moveName) {
  if (!moveName) return null;

  const cached = state.moveTypeCache[moveName];
  if (cached) return cached;

  const slug = normalizeText(moveName);

  if (CUSTOM_TERMS.has(slug)) {
    const info = {
      type: 'normal',
      damageClass: 'status',
      power: 0,
      hits: 1,
      isSpread: false,
      makesContact: false,
      isSound: false,
      isPunch: false,
      isBite: false,
      isBullet: false,
    };
    state.moveTypeCache[moveName] = info;
    return info;
  }

  const canonical = getCanonicalMove(moveName);
  if (canonical) {
    const info = toLegacyMoveInfo(canonical);
    state.moveTypeCache[moveName] = info;
    state.moveTypeCache[canonical.id] = info;
    return info;
  }

  let fallbackType = MOVE_TYPE_FALLBACK[moveName];
  if (!fallbackType) fallbackType = MOVE_TYPE_FALLBACK[formatName(slug)] || null;
  const info = getGameDB()?.moves?.[slug] || getGameDB()?.moves?.[moveName.toLowerCase()];
  
  if (info) {
    state.moveTypeCache[moveName] = info;
    return info;
  }

  const fallbackInfo = {
    type: fallbackType || 'normal',
    damageClass: isSupportMove(moveName) ? 'status' : 'physical',
    power: 0,
    hits: 1,
    isSpread: false,
    makesContact: false,
    isSound: false,
    isPunch: false,
    isBite: false,
    isBullet: false,
  };
  state.moveTypeCache[moveName] = fallbackInfo;
  return fallbackInfo;
}

export function getMoveCandidates(mon) {
  const moves = mon?.set?.moves || [];
  const resolved = moves
    .map((move) => {
      const info = state.moveTypeCache[move];
      if (!info?.type) return null;
      if (info?.damageClass === "status") return null;
      return {
        move,
        type: info.type,
        power: info.power || 0,
        damageClass: info.damageClass || "physical",
        hits: info.hits || 1,
        isSpread: info.isSpread || false,
        priority: Number.isFinite(info.priority) ? info.priority : 0,
        target: info.target || info.targetMode || 'normal',
        flags: info.flags || {},
        canonicalId: info.id || normalizeText(move),
      };
    })
    .filter(Boolean);

  if (resolved.length) return resolved;

  const fallbackMoves = moves
    .map((move) => {
      let type = MOVE_TYPE_FALLBACK[move];
      if (!type) {
         const slug = normalizeText(move);
         type = MOVE_TYPE_FALLBACK[formatName(slug)];
      }
      if (!type || isSupportMove(move)) return null;
      return { move, type, power: 0, damageClass: "physical", hits: 1, isSpread: false, priority: 0, target: 'normal', flags: {}, canonicalId: normalizeText(move) };
    })
    .filter(Boolean);

  if (fallbackMoves.length) return fallbackMoves;

  return (mon?.types || []).map((type) => ({
    move: TYPE_META[type]?.name || type,
    type,
    power: 0,
    damageClass: "special",
    hits: 1,
    isSpread: false,
    priority: 0,
    target: 'normal',
    flags: {},
    canonicalId: type,
  }));
}
