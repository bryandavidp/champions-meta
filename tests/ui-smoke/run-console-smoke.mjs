import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// Humo de consola: carga la app real en Chrome, captura console.error/warn,
// excepciones y promesas rechazadas, y ejercita la capa de regulaciones
// (selector M-A/M-B, badge de legalidad del picker, validateCurrentTeam).
const BASE_URL = process.env.UI_SMOKE_URL || 'http://127.0.0.1:4173/index.html';
const STRICT = process.env.UI_SMOKE_STRICT === '1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.setTimeout(2500, () => req.destroy(new Error('timeout')));
  });
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = http.request({ hostname: parsed.hostname, port: parsed.port || 80, path: parsed.pathname, method: 'HEAD', timeout: 2000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function failOrSkip(message) {
  if (STRICT) throw new Error(message);
  console.log(`Console smoke skipped: ${message}`);
  process.exit(0);
}

if (!(await checkUrl(BASE_URL))) failOrSkip(`${BASE_URL} is not reachable.`);
const chromePath = findChrome();
if (!chromePath) failOrSkip('Chrome/Chromium executable not found. Set CHROME_PATH.');

const port = 9700 + Math.floor(Math.random() * 200);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'champions-console-smoke-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  'about:blank',
], { stdio: 'ignore' });

async function waitForEndpoint() {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try { return await requestJson(`http://127.0.0.1:${port}/json/version`); } catch { await sleep(100); }
  }
  throw new Error('Chrome CDP endpoint did not start');
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = [];
  }

  connect() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result || {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 5000);
      this.ws.onopen = () => { clearTimeout(timer); resolve(); };
      this.ws.onerror = () => { clearTimeout(timer); reject(new Error('CDP websocket error')); };
    });
  }

  onEvent(listener) {
    this.listeners.push(listener);
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      this.pending.set(id, {
        resolve(value) { clearTimeout(timer); resolve(value); },
        reject(error) { clearTimeout(timer); reject(error); },
      });
    });
  }

  close() {
    try { this.ws?.close(); } catch {}
  }
}

const failures = [];
const consoleProblems = [];
let client = null;

// Ruido conocido que no es un fallo de la app (extensiones, favicon, CDN sin red...).
const IGNORED_CONSOLE = [
  /favicon/i,
  /net::ERR_/i,
  /Failed to load resource/i,
  /lucide/i,
  /fonts?\./i,
];

function isIgnored(text) {
  return IGNORED_CONSOLE.some((pattern) => pattern.test(text));
}

try {
  const version = await waitForEndpoint();
  client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();

  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });

  client.onEvent((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
      const text = (message.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ');
      if (!isIgnored(text)) consoleProblems.push(`console.${message.params.type}: ${text.slice(0, 300)}`);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails;
      const text = detail?.exception?.description || detail?.text || 'excepción';
      if (!isIgnored(text)) consoleProblems.push(`exception: ${text.slice(0, 300)}`);
    }
  });

  await client.send('Runtime.enable', {}, sessionId);
  await client.send('Page.enable', {}, sessionId);
  await client.send('Page.navigate', { url: `${BASE_URL}?console-smoke=1` }, sessionId);

  const evaluate = async (expression, timeoutMs = 10000) => {
    const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: timeoutMs }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluate failed');
    return result.result?.value;
  };
  const waitFor = async (expression, timeoutMs = 12000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (await evaluate(expression, 3000)) return true;
      await sleep(150);
    }
    throw new Error(`Timeout esperando: ${expression}`);
  };

  await waitFor('document.readyState === "complete"', 15000);
  await waitFor('!!window.state && !!window.ChampionsRules', 15000);

  // 1. Carga la demo y deja que renderice.
  await evaluate('document.getElementById("loadDemoBtn")?.click(); true;');
  await sleep(2200);

  // 2. Selector de regulación presente y sincronizado con el estado.
  const regUi = await evaluate(`(() => {
    const select = document.getElementById('regulationSelect');
    return select ? { value: select.value, stateValue: window.state.rules?.regulationId } : null;
  })()`);
  if (!regUi) failures.push('no existe #regulationSelect en la cabecera');
  else if (regUi.value !== regUi.stateValue) failures.push(`selector (${regUi.value}) desincronizado de state.rules (${regUi.stateValue})`);

  // 3. Cambiar de regulación dispara persistencia y re-render sin errores.
  const switched = await evaluate(`(() => {
    const select = document.getElementById('regulationSelect');
    if (!select) return null;
    const target = select.value === 'M-A' ? 'M-B' : 'M-A';
    select.value = target;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { target, stateValue: window.state.rules?.regulationId, stored: localStorage.getItem('champions-regulation-v1') };
  })()`);
  await sleep(1200);
  if (switched && (switched.stateValue !== switched.target || switched.stored !== switched.target)) {
    failures.push(`cambio de regulación no persistió: ${JSON.stringify(switched)}`);
  }

  // 4. Picker: una especie del meta fuera del roster muestra el badge de ilegal
  // (Urshifu está en el dataset de uso pero no en la lista oficial M-A/M-B).
  await evaluate(`window.openModal && window.openModal('self', 5); true;`);
  await sleep(400);
  await evaluate(`(() => {
    const input = document.getElementById('searchInput');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, 'urshifu');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(900);
  const pickerReport = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-action="pick-result"]')];
    const illegal = document.querySelectorAll('.result-tag-chip.illegal').length;
    return { results: cards.length, illegalBadges: illegal };
  })()`);
  if (!pickerReport || pickerReport.results === 0) {
    failures.push('el picker no devolvió resultados para "urshifu"');
  } else if (pickerReport.illegalBadges === 0) {
    failures.push('Urshifu (fuera de roster) no muestra el badge de ilegal');
  }
  await evaluate('document.getElementById("closeModalBtn")?.click(); true;');
  await sleep(300);

  // 5. validateCurrentTeam funciona sobre el equipo demo.
  const validation = await evaluate('window.ChampionsRules.validateCurrentTeam()');
  if (!validation || typeof validation.legal !== 'boolean') {
    failures.push('validateCurrentTeam() no devuelve un resultado válido');
  }

  await client.send('Target.closeTarget', { targetId });
} catch (error) {
  failures.push(error.message);
} finally {
  client?.close();
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

if (consoleProblems.length) {
  console.error('Errores/avisos de consola del navegador:');
  for (const problem of [...new Set(consoleProblems)].slice(0, 20)) console.error(`- ${problem}`);
}
if (failures.length) {
  console.error('Console smoke checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
if (consoleProblems.length) {
  console.error('Console smoke: la app funciona pero hay ruido de consola (ver arriba).');
  process.exit(1);
}
console.log('Console smoke checks passed (sin errores de consola).');
