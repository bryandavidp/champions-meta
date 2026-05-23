// matrix/explainer.js
// Capa de explicabilidad de matriz basada en trace/confidence del engine.

export const MATRIX_EXPLAINER_VERSION = 'matrix-explainer-v2';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function traceLabel(entry = {}) {
  if (entry.phase === 'blocked') return `Bloqueo: ${entry.reason || 'regla activa'}`;
  if (entry.phase === 'basePower') return `Potencia ${entry.basePower || 0} (${entry.type || 'normal'})`;
  if (entry.phase === 'stats') return `${entry.category || 'damage'}: ${entry.attackStat || '?'} vs ${entry.defenseStat || '?'}`;
  if (entry.phase === 'modifiers') {
    const bits = [];
    if (entry.stab && entry.stab !== 1) bits.push('STAB');
    if (entry.typeEffectiveness !== 1) bits.push(`x${entry.typeEffectiveness}`);
    if (entry.weather !== 1) bits.push('clima');
    if (entry.terrain !== 1) bits.push('terreno');
    if (entry.screen !== 1) bits.push('pantallas');
    if (entry.friendGuard !== 1) bits.push('Friend Guard');
    return bits.length ? `Modificadores: ${bits.join(', ')}` : 'Sin modificadores criticos';
  }
  if (entry.phase === 'rolls') return `Rango ${entry.minPct || 0}-${entry.maxPct || 0}%`;
  if (entry.phase === 'nonDamage') return 'Movimiento sin dano directo';
  return entry.label || entry.reason || entry.phase || 'Trace';
}

export function buildMatrixCellExplanation(cell = {}, offensive = true) {
  const confidence = cell.confidence || { value: 0.5, level: 'medium' };
  const trace = (cell.trace || []).slice(0, 5).map(traceLabel);
  const warnings = [
    ...(cell.unsupportedMechanics || []).map((item) => `No modelado al 100%: ${item}`),
    confidence.level === 'low' ? 'Confianza baja: faltan datos o la mecanica esta parcialmente soportada.' : null,
    cell.targetRedirected ? 'El objetivo puede cambiar por redireccion.' : null,
  ].filter(Boolean);
  return {
    schema: 'matrix-cell-explanation-v1',
    source: MATRIX_EXPLAINER_VERSION,
    title: offensive ? 'Lectura ofensiva' : 'Lectura defensiva',
    headline: cell.blocked
      ? (cell.blockReason || 'Accion bloqueada')
      : `${cell.move || 'Movimiento'}: ${cell.minPct || 0}-${cell.maxPct || 0}%`,
    trace,
    warnings,
    confidence,
  };
}

export function renderMatrixExplainer(rows, offensive) {
  const titleEl = document.getElementById('matrixExplainerTitle');
  const textEl = document.getElementById('matrixExplainerText');
  const badgesEl = document.getElementById('matrixExplainerBadges');
  const footEl = document.getElementById('matrixExplainerFoot');
  if (!titleEl || !textEl || !badgesEl || !footEl) return;

  const flat = (rows || []).flatMap((row) => row.cells || []);
  const lowConfidence = flat.filter((cell) => cell.confidence?.level === 'low').length;
  const blocked = flat.filter((cell) => cell.blocked || cell.mult === 0).length;
  const priority = flat.filter((cell) => (cell.priority || 0) > 0).length;
  const fieldModified = flat.filter((cell) => cell.weatherMul !== 1 || cell.terrainMul !== 1).length;

  titleEl.textContent = 'Como leer esta matriz';
  textEl.textContent = offensive
    ? 'Cada celda usa el engine nuevo: accion legal, target, dano, bloqueos, campo y confianza.'
    : 'Cada celda muestra cuanto castigo real recibes al pivotar, con inmunidades y bloqueos trazables.';
  badgesEl.innerHTML = `
    <span class="matrix-state-badge matrix-state-badge--ko">KO probable</span>
    <span class="matrix-state-badge matrix-state-badge--pressure">Presion</span>
    <span class="matrix-state-badge matrix-state-badge--blocked">Bloqueo ${escapeHtml(blocked)}</span>
    <span class="matrix-state-badge">Prioridad ${escapeHtml(priority)}</span>
    <span class="matrix-state-badge">Campo ${escapeHtml(fieldModified)}</span>
    ${lowConfidence ? `<span class="matrix-state-badge matrix-state-badge--respect">Baja confianza ${escapeHtml(lowConfidence)}</span>` : ''}
  `;
  footEl.textContent = 'Objetivo: misma mecanica, mismo por que y misma confianza en matriz, planes y simulador.';
}

export function toggleMatrixHelp(forceOpen, state, panel, btn) {
  if (!state) return;
  state.matrixHelpOpen = forceOpen !== undefined ? forceOpen : !state.matrixHelpOpen;
  if (panel && btn) {
    panel.classList.toggle('is-open', state.matrixHelpOpen);
    btn.setAttribute('aria-expanded', state.matrixHelpOpen ? 'true' : 'false');
  }
}
