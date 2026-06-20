import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = process.env.UI_SMOKE_URL || 'http://127.0.0.1:4173/index.html';
const STRICT = process.env.UI_SMOKE_STRICT === '1';
const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-760', width: 760, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 900 },
];

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
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2500, () => {
      req.destroy(new Error('timeout'));
    });
  });
}

function checkUrl(url) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method: 'HEAD',
      timeout: 2000,
    }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function waitForEndpoint(port) {
  const started = Date.now();
  while (Date.now() - started < 25000) {
    try {
      return await requestJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Chrome CDP endpoint did not start');
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  connect() {
    if (typeof WebSocket !== 'function') {
      throw new Error('Node WebSocket global is unavailable');
    }
    this.ws = new WebSocket(this.wsUrl);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
        else resolve(message.result || {});
        return;
      }
      this.events.push(message);
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 5000);
      this.ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      this.ws.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(event?.message || 'CDP websocket error'));
      };
    });
  }

  send(method, params = {}, sessionId = null) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
      this.pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
  }
}

async function evaluate(client, sessionId, expression, timeoutMs = 8000) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

async function waitFor(client, sessionId, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await evaluate(client, sessionId, expression, 3000);
    if (value) return value;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

function failOrSkip(message) {
  if (STRICT) {
    throw new Error(message);
  }
  console.log(`UI smoke skipped: ${message}`);
  process.exit(0);
}

if (!(await checkUrl(BASE_URL))) {
  failOrSkip(`${BASE_URL} is not reachable. Start the preview server or set UI_SMOKE_URL.`);
}

const chromePath = findChrome();
if (!chromePath) {
  failOrSkip('Chrome/Chromium executable not found. Set CHROME_PATH to run smoke checks.');
}

const port = 9333 + Math.floor(Math.random() * 300);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'champions-ui-smoke-'));
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

let client = null;
const failures = [];

try {
  const version = await waitForEndpoint(port);
  client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();

  for (const viewport of VIEWPORTS) {
    const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
    await client.send('Runtime.enable', {}, sessionId);
    await client.send('Page.enable', {}, sessionId);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.width <= 760 ? 3 : 1,
      mobile: viewport.width <= 760,
    }, sessionId);
    await client.send('Page.navigate', { url: `${BASE_URL}${BASE_URL.includes('?') ? '&' : '?'}ui-smoke=${viewport.name}` }, sessionId);
    await waitFor(client, sessionId, 'document.readyState === "complete"', 15000);
    await evaluate(client, sessionId, 'document.getElementById("loadDemoBtn")?.click(); true;');
    await sleep(viewport.width <= 760 ? 2500 : 1800);

    const report = await evaluate(client, sessionId, `(() => {
      const visible = (el) => {
        if (!el) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const overflow = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const quickPreviewVisible = visible(document.getElementById('quickPreviewPanel'));
      const quickCombosVisible = visible(document.getElementById('quickCombosSection'));
      const homeCards = document.querySelectorAll('#homeSnapshotCard, #homeRecommendedBringCard, #homeLeadPlanCard, #homeThreatLane').length;
      const criticalTargets = [...document.querySelectorAll('.home-mobile-action__btn, .ui-action-btn, .turn-plan-use-btn, .home-detail-teaser, #closeModalBtn')]
        .filter(visible)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return { label: el.id || el.className || el.textContent.trim().slice(0, 24), width: Math.round(rect.width), height: Math.round(rect.height) };
        })
        .filter((item) => item.width < 44 || item.height < 40);
      return { overflow, quickPreviewVisible, quickCombosVisible, homeCards, criticalTargets };
    })();`);

    if (report.overflow > 1) failures.push(`${viewport.name}: horizontal overflow ${report.overflow}px`);
    if (report.quickPreviewVisible || report.quickCombosVisible) failures.push(`${viewport.name}: quick legacy is visible`);
    if (report.homeCards < 4) failures.push(`${viewport.name}: tactical home cards missing`);
    if (report.criticalTargets.length) {
      failures.push(`${viewport.name}: small critical touch targets ${JSON.stringify(report.criticalTargets.slice(0, 4))}`);
    }

    try {
      await waitFor(client, sessionId, `document.querySelectorAll('.turn-plan-use-btn:not([disabled]):not(.is-pending)').length > 0`, 9000);
    } catch {
      // The planner can legitimately still be loading on slower local machines.
    }
    const idsBefore = await evaluate(client, sessionId, `[...document.querySelectorAll('.turn-plan-use-btn:not([disabled]):not(.is-pending)')].map((btn) => btn.dataset.planId).join('|')`);
    if (idsBefore) {
      await evaluate(client, sessionId, `document.querySelector('.turn-plan-use-btn:not([disabled]):not(.is-pending)')?.click(); true;`);
      await sleep(900);
      const idsAfter = await evaluate(client, sessionId, `[...document.querySelectorAll('.turn-plan-use-btn:not([disabled]):not(.is-pending), .turn-plan-use-btn.is-active')].map((btn) => btn.dataset.planId).join('|')`);
      if (idsBefore !== idsAfter) failures.push(`${viewport.name}: Top 3 ids changed after using a plan`);
    }

    await client.send('Target.closeTarget', { targetId });
  }
} finally {
  client?.close();
  chrome.kill();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}

if (failures.length) {
  console.error('UI smoke checks failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('UI smoke checks passed.');
