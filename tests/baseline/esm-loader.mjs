import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

function createDocumentStub() {
  const nullElement = {
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    dataset: {},
    children: [],
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false,
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild(child) { return child; },
    setAttribute() {},
    getAttribute() { return null; },
    closest() { return null; },
  };

  return {
    body: nullElement,
    documentElement: nullElement,
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { ...nullElement }; },
    addEventListener() {},
    removeEventListener() {},
  };
}

export async function createModuleHarness(rootDir) {
  const moduleCache = new Map();
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    structuredClone,
    URL,
    URLSearchParams,
    Blob,
    localStorage: createStorage(),
    document: createDocumentStub(),
    navigator: { userAgent: 'baseline-node' },
    location: { href: pathToFileURL(path.join(rootDir, 'index.html')).href },
    requestAnimationFrame(callback) {
      return setTimeout(() => callback(Date.now()), 0);
    },
    cancelAnimationFrame(id) {
      clearTimeout(id);
    },
    matchMedia() {
      return { matches: false, addEventListener() {}, removeEventListener() {} };
    },
    lucide: { createIcons() {} },
  };

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  sandbox.__baselineFetch = async function baselineFetch(url) {
    const cleanUrl = String(url || '').replace(/^\.\//, '').replace(/\\/g, '/');
    const filePath = path.resolve(rootDir, cleanUrl);
    return {
      ok: fs.existsSync(filePath),
      async json() {
        return JSON.parse(await readFile(filePath, 'utf8'));
      },
      async text() {
        return readFile(filePath, 'utf8');
      },
    };
  };

  const context = vm.createContext(sandbox);

  async function loadScript(relativePath) {
    const filename = path.resolve(rootDir, relativePath);
    const code = await readFile(filename, 'utf8');
    const script = new vm.Script(code, { filename });
    script.runInContext(context);
  }

  function resolveModule(specifier, parentIdentifier = rootDir) {
    if (!specifier.startsWith('.')) {
      throw new Error(`Unsupported non-relative import in baseline harness: ${specifier}`);
    }
    const parentDir = fs.existsSync(parentIdentifier) && fs.statSync(parentIdentifier).isDirectory()
      ? parentIdentifier
      : path.dirname(parentIdentifier);
    return path.resolve(parentDir, specifier);
  }

  // Crea (y cachea) el módulo sin enlazarlo: el link de TODO el grafo lo hace
  // una única llamada a mod.link() en la raíz (importModule). Encadenar
  // mod.link() por módulo dentro del resolver provoca
  // ERR_VM_MODULE_LINK_FAILURE intermitentes con grafos en diamante.
  function loadModule(filename) {
    const normalized = path.normalize(filename);
    if (moduleCache.has(normalized)) return moduleCache.get(normalized);

    const modulePromise = (async () => {
      const code = await readFile(normalized, 'utf8');
      return new vm.SourceTextModule(code, {
        context,
        identifier: normalized,
        initializeImportMeta(meta) {
          meta.url = pathToFileURL(normalized).href;
        },
      });
    })();
    moduleCache.set(normalized, modulePromise);
    return modulePromise;
  }

  async function importModule(relativePath) {
    const filename = path.resolve(rootDir, relativePath);
    const mod = await loadModule(filename);
    if (mod.status === 'unlinked') {
      await mod.link((specifier, referencingModule) =>
        loadModule(resolveModule(specifier, referencingModule.identifier)));
    }
    if (mod.status !== 'evaluated') {
      await mod.evaluate();
    }
    return mod.namespace;
  }

  async function loadGameDB() {
    const db = JSON.parse(await readFile(path.join(rootDir, 'data/data-bundle.json'), 'utf8'));
    context.GameDB = db;
    context.window.GameDB = db;
    return db;
  }

  async function loadEffectsRegistry() {
    await loadScript('effects-registry-bridge.js');
    await context.EffectsRegistryBridge.loadEffectRegistry('./effects-master.seed.json', {
      force: true,
      fetchImpl: context.__baselineFetch,
    });
    return context.EffectsRegistryBridge;
  }

  return {
    context,
    importModule,
    loadGameDB,
    loadEffectsRegistry,
  };
}
