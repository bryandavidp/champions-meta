import {
  BATTLE_RULES_VERSION,
  BATTLE_SNAPSHOT_VERSION,
  DATA_VERSION,
  serializeBattleSnapshot,
  stableStringify,
} from './snapshot.js';

export const ENGINE_CACHE_KEY_VERSION = 'engine-cache-key-v1';

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildVersionedCacheKey({
  scope = 'engine',
  snapshot = null,
  snapshotKey = null,
  rulesVersion = BATTLE_RULES_VERSION,
  dataVersion = DATA_VERSION,
  context = {},
} = {}) {
  const resolvedSnapshotKey = snapshotKey || (snapshot ? hashString(serializeBattleSnapshot(snapshot)) : 'no-snapshot');
  const payload = {
    version: ENGINE_CACHE_KEY_VERSION,
    scope,
    snapshotVersion: BATTLE_SNAPSHOT_VERSION,
    rulesVersion,
    dataVersion,
    snapshotKey: resolvedSnapshotKey,
    context,
  };
  return `${ENGINE_CACHE_KEY_VERSION}:${hashString(stableStringify(payload))}`;
}

export function buildSnapshotCacheKey(snapshot, context = {}) {
  return buildVersionedCacheKey({ scope: 'snapshot', snapshot, context });
}

export function buildActionCacheKey(snapshot, actionContext = {}) {
  return buildVersionedCacheKey({
    scope: 'action',
    snapshot,
    context: actionContext,
  });
}
