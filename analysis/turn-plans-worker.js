self.window = self;

if (typeof self.localStorage === 'undefined') {
  const memoryStorage = new Map();
  self.localStorage = {
    getItem(key) {
      return memoryStorage.has(String(key)) ? memoryStorage.get(String(key)) : null;
    },
    setItem(key, value) {
      memoryStorage.set(String(key), String(value));
    },
    removeItem(key) {
      memoryStorage.delete(String(key));
    },
    clear() {
      memoryStorage.clear();
    },
  };
}

if (typeof self.requestAnimationFrame !== 'function') {
  self.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 16);
}

if (typeof self.cancelAnimationFrame !== 'function') {
  self.cancelAnimationFrame = (id) => clearTimeout(id);
}

let plannerModulePromise = null;

async function ensurePlannerModule() {
  if (plannerModulePromise) return plannerModulePromise;

  plannerModulePromise = (async () => {
    if (!self.EffectsRegistryBridge) {
      if (typeof importScripts === 'function') {
        try {
          importScripts('../effects-registry-bridge.js');
        } catch {}
      }

      if (!self.EffectsRegistryBridge) {
        await import('../effects-registry-bridge.js');
      }
    }

    const [{ state }, plannerModule] = await Promise.all([
      import('../core/state.js'),
      import('./turn-plans-engine.js'),
    ]);

    if (!self.GameDB) {
      const res = await fetch('../data/data-bundle.json', { cache: 'force-cache' });
      self.GameDB = await res.json();
    }

    if (self.EffectsRegistryBridge && typeof self.EffectsRegistryBridge.loadEffectRegistry === 'function') {
      await self.EffectsRegistryBridge.loadEffectRegistry('../effects-master.seed.json');
    }

    state.moveTypeCache = state.moveTypeCache || {};
    state.turnPlanMeta = state.turnPlanMeta || {};

    return plannerModule;
  })();

  return plannerModulePromise;
}

self.onmessage = async (event) => {
  const message = event?.data || {};
  if (message.type !== 'compute-turn-plans') return;

  try {
    const plannerModule = await ensurePlannerModule();
    const requestId = message.requestId;
    const payload = message.payload || {};

    const result = plannerModule.buildTurnPlansSnapshot(payload, {
      onProgress(progress) {
        self.postMessage({
          type: 'turn-plans-progress',
          requestId,
          progress,
        });
      },
    });

    self.postMessage({
      type: 'turn-plans-result',
      requestId,
      result,
    });
  } catch (error) {
    self.postMessage({
      type: 'turn-plans-error',
      requestId: message.requestId,
      error: error?.message || 'worker-error',
    });
  }
};
