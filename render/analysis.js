// render/analysis.js
// Responsabilidad: Paneles de análisis visual debajo de la matriz (Threats, Opportunities, Strategies, Speed Tiers, Defensive Alerts)

import { state } from '../core/state.js';
import { ANALYSIS, SPEED_ORDER, TURN_BRANCHES } from '../core/dom.js';
import { getFocusedTeam } from '../app-core.js';
import { updateIcons } from '../render/app.js';
import { getEffectivenessBadgeHtml } from '../matrix/render.js';
import { TYPE_META, TYPE_CHART } from '../core/constants.js';
import { getTranslation } from '../utils/text.js';
import { scoreThreat, inferStrategies } from '../analysis/threats.js';
import { buildTurnBranches } from '../analysis/turn-branches.js';
import { evaluateKoConditions, renderKoConditionChips } from '../analysis/ko-conditions.js';
import { buildSpeedOrder } from '../analysis/speed-order.js';
import { calculateSpeed } from '../battle/speed.js';
import { getNatureSpeModifier } from '../battle/stats.js';
import { getContrastColor, effectiveness } from '../utils/types.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFilledTurnIndices(side) {
  return state[side].map((mon, index) => (mon ? index : null)).filter((index) => index !== null);
}

function getQuickTurnIndices(side) {
  const team = state[side];
  const filled = getFilledTurnIndices(side);
  const picked = (state.leads?.[side] || []).filter((index) => team[index]);
  const out = [...picked];

  if (side === 'self' && state.chosenFour?.length) {
    for (const index of state.chosenFour) {
      if (out.length >= 2) break;
      if (team[index] && !out.includes(index)) out.push(index);
    }
  }

  for (const index of filled) {
    if (out.length >= 2) break;
    if (!out.includes(index)) out.push(index);
  }
  return out.slice(0, 2);
}

function getBranchActiveMons(side) {
  if (state.uiMode === 'quick') {
    return getQuickTurnIndices(side).map((index) => state[side][index]).filter(Boolean);
  }

  if (state.uiMode === 'live' || (state.uiMode === 'expert' && state.battleFocus === 'active')) {
    const focused = getFocusedTeam(side).slice(0, 2);
    if (focused.length) return focused;
  }

  return getFilledTurnIndices(side).slice(0, 2).map((index) => state[side][index]).filter(Boolean);
}

function renderBranchAction(action, side) {
  if (!action) return '';
  const actor = escapeHtml(action.actor);
  const move = escapeHtml(getTranslation(action.move, 'move') || action.move);
  const target = escapeHtml(action.target);
  const ko = action.damage?.ko || action.damage?.ohkoProb >= 50;
  const damage = action.damage
    ? `<span class="turn-action-damage ${ko ? 'is-ko' : ''}">${action.damage.minPct}-${action.damage.maxPct}%</span>`
    : '';

  return `
    <div class="turn-branch-action turn-branch-action--${side}">
      <span class="turn-action-actor">${actor}</span>
      <span class="turn-action-move">${move}</span>
      <span class="turn-action-target">${target}</span>
      ${damage}
    </div>
  `;
}

function renderBranchCard(branch, index) {
  const isMain = index === 0;
  const styleClass = String(branch.style || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]/gi, '');
  const selfActions = branch.actions.self.length
    ? branch.actions.self.map((action) => renderBranchAction(action, 'self')).join('')
    : '<div class="muted-small">Sin accion propia clara.</div>';
  const enemyActions = branch.actions.enemy.length
    ? branch.actions.enemy.map((action) => renderBranchAction(action, 'enemy')).join('')
    : '<div class="muted-small">Respuesta rival difusa.</div>';
  const conditions = branch.conditions.length
    ? branch.conditions.map((item) => `<span class="turn-branch-chip">${escapeHtml(item)}</span>`).join('')
    : '<span class="turn-branch-chip">Sin condicion fuerte</span>';
  const invalidators = branch.invalidators.length
    ? branch.invalidators.map((item) => `<span class="turn-branch-chip turn-branch-chip--warn">${escapeHtml(item)}</span>`).join('')
    : '<span class="turn-branch-chip">No detectados</span>';

  const body = `
    <div class="turn-branch-card-head">
      <div>
        <div class="turn-branch-label">${escapeHtml(branch.label)}</div>
        <div class="turn-branch-outcome">${escapeHtml(branch.outcome)}</div>
      </div>
      <div class="turn-branch-score">
        <strong>${branch.score}</strong>
        <span>${Math.round((branch.confidence || 0) * 100)}%</span>
      </div>
    </div>
    <div class="turn-branch-actions">
      <div>
        <div class="turn-branch-side-label">Tus acciones</div>
        ${selfActions}
      </div>
      <div>
        <div class="turn-branch-side-label">Respuesta rival</div>
        ${enemyActions}
      </div>
    </div>
    <div class="turn-branch-meta">
      <div class="turn-branch-side-label">Condiciones</div>
      <div class="turn-branch-chip-row">${conditions}</div>
      <div class="turn-branch-side-label">Puede fallar si</div>
      <div class="turn-branch-chip-row">${invalidators}</div>
    </div>
  `;

  if (isMain) {
    return `
      <article class="turn-branch-card turn-branch-card--main turn-branch-card--${styleClass}">
        <div class="turn-branch-main-kicker">Tu mejor linea</div>
        ${body}
      </article>
    `;
  }

  return `
    <details class="turn-branch-card turn-branch-card--${styleClass}" ${state.uiMode === 'live' ? 'open' : ''}>
      <summary>
        <span>${escapeHtml(branch.label)}</span>
        <span class="turn-branch-summary-score">${branch.score}</span>
      </summary>
      ${body}
    </details>
  `;
}

export function renderTurnBranches() {
  const panel = TURN_BRANCHES.panel;
  const content = TURN_BRANCHES.content;
  if (!panel || !content) return;

  const isSupportedMode = ['quick', 'live', 'expert'].includes(state.uiMode);
  panel.style.display = isSupportedMode ? 'block' : 'none';
  if (!isSupportedMode) return;

  const selfActive = getBranchActiveMons('self');
  const enemyActive = getBranchActiveMons('enemy');
  const branches = buildTurnBranches({
    selfActive,
    enemyActive,
    field: state.field,
    maxBranches: 5,
  });

  const isExpert = state.uiMode === 'expert';
  const title = state.uiMode === 'quick'
    ? 'Arbol de turno'
    : state.uiMode === 'live'
      ? 'Linea de turno en vivo'
      : 'Arbol de turno probable';
  const subtitle = state.uiMode === 'quick'
    ? 'Ramas heuristicas sobre tus leads y los leads rivales.'
    : state.uiMode === 'live'
      ? 'Lectura de acciones probables sobre los activos actuales.'
      : 'Panel opcional basado en los slots enfocados.';

  if (!branches.length) {
    content.innerHTML = `
      <div class="turn-branch-empty">
        <strong>${title}</strong>
        <span>Añade al menos un slot por lado para generar ramas probables.</span>
      </div>
    `;
    return;
  }

  const cards = branches.map(renderBranchCard).join('');
  content.innerHTML = `
    <details class="turn-branches-shell" ${isExpert ? '' : 'open'}>
      <summary class="turn-branches-shell-summary">
        <span>
          <strong>${title}</strong>
          <small>${subtitle}</small>
        </span>
        <span class="tiny-chip">${branches.length} ramas</span>
      </summary>
      <div class="turn-branches-list">
        ${cards}
      </div>
    </details>
  `;

  updateIcons();
}

function renderSpeedOrderEntry(entry, firstMoverId) {
  const isFirst = entry.id === firstMoverId;
  const sideLabel = entry.side === 'self' ? 'Tu lado' : 'Rival';
  const modifiers = entry.modifiers.length
    ? entry.modifiers.slice(0, 3).map((item) => `<span class="speed-order-chip">${escapeHtml(item.label)}</span>`).join('')
    : '<span class="speed-order-chip">sin boost</span>';
  const ties = entry.tieCandidates.length
    ? `<span class="speed-order-chip speed-order-chip--tie">Tie con ${entry.tieCandidates.map((item) => escapeHtml(item.name)).join(', ')}</span>`
    : '';
  const priority = entry.priorityWindows
    .filter((item) => item.priority !== 0)
    .slice(0, 2)
    .map((item) => `<span class="speed-order-chip speed-order-chip--prio">${escapeHtml(item.move)} ${item.priority > 0 ? '+' : ''}${item.priority}</span>`)
    .join('');
  const blocked = entry.blockedPriorityReason
    ? `<span class="speed-order-chip speed-order-chip--blocked">${escapeHtml(entry.blockedPriorityReason)}</span>`
    : '';

  return `
    <article class="speed-order-card ${entry.side === 'self' ? 'speed-order-card--self' : 'speed-order-card--enemy'} ${isFirst ? 'is-first' : ''}">
      <div class="speed-order-rank">${entry.rank}</div>
      <img src="${entry.sprite}" alt="${escapeHtml(entry.name)}" class="speed-order-sprite">
      <div class="speed-order-main">
        <div class="speed-order-name-row">
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${sideLabel}</span>
        </div>
        <div class="speed-order-cause">${escapeHtml(entry.cause)}</div>
        <div class="speed-order-chip-row">
          ${priority}
          ${blocked}
          ${modifiers}
          ${ties}
        </div>
      </div>
      <div class="speed-order-values">
        <strong>${Math.abs(entry.effectiveSpeed)}</strong>
        <span>raw ${entry.rawSpeed}</span>
      </div>
    </article>
  `;
}

export function renderSpeedOrderPanel() {
  const panel = SPEED_ORDER.panel;
  const content = SPEED_ORDER.content;
  if (!panel || !content) return;

  const isSupportedMode = ['quick', 'live', 'expert'].includes(state.uiMode);
  panel.style.display = isSupportedMode ? 'block' : 'none';
  if (!isSupportedMode) return;

  const selfActive = getBranchActiveMons('self');
  const enemyActive = getBranchActiveMons('enemy');
  const model = buildSpeedOrder({
    selfActive,
    enemyActive,
    field: state.field,
  });

  if (!model.entries.length) {
    content.innerHTML = `
      <div class="speed-order-empty">
        <strong>Orden del turno</strong>
        <span>Añade activos en ambos lados para calcular quien mueve antes.</span>
      </div>
    `;
    return;
  }

  const firstMoverId = model.firstMover?.id || null;
  const fieldChips = [
    model.field.trickRoom ? 'Trick Room' : null,
    model.field.weather ? `Clima: ${model.field.weather}` : null,
    model.field.terrain ? `Terreno: ${model.field.terrain}` : null,
    model.field.tailwindSelf ? 'Tu Tailwind' : null,
    model.field.tailwindEnemy ? 'Tailwind rival' : null,
  ].filter(Boolean);

  content.innerHTML = `
    <details class="speed-order-sheet" open>
      <summary class="speed-order-summary">
        <span>
          <strong>Orden del turno</strong>
          <small>Quien mueve antes y por que.</small>
        </span>
        <span class="tiny-chip">${model.entries.length} slots</span>
      </summary>
      <div class="speed-order-field-row">
        ${fieldChips.length ? fieldChips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('') : '<span>Campo neutral</span>'}
      </div>
      <div class="speed-order-list">
        ${model.entries.map((entry) => renderSpeedOrderEntry(entry, firstMoverId)).join('')}
      </div>
    </details>
  `;
}

export function renderThreats() {
  const enemy = getFocusedTeam('enemy');

  if (!enemy.length) {
    ANALYSIS.threatList.innerHTML = `<div class="empty">Añade un rival para activar el semáforo.</div>`;
    return;
  }

  const items = enemy
    .map((mon) => {
      const threat = scoreThreat(mon, getFocusedTeam('self'));
      return { mon, threat };
    })
    .sort((a, b) => b.threat.score - a.threat.score);

  const reds = items.filter(i => i.threat.level === 'red');
  const ambers = items.filter(i => i.threat.level === 'amber');
  const greens = items.filter(i => i.threat.level === 'green');

  let html = '';

  if (reds.length > 0) {
    html += reds.map(({ mon, threat }) => `
      <div class="threat-hero-card" data-scout="${mon.name}">
        <div class="threat-hero-sprite">
          <img src="${mon.sprite}" alt="${mon.displayName}">
        </div>
        <div>
          <div style="font-weight: 900; font-size: 1.15rem; color: #fff;">${mon.displayName}</div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
            ${threat.reasons.map(r => `<span class="tag-pill tag-pill--danger">${r}</span>`).join("")}
            ${threat.isSupportThreat ? `<span class="tag-pill tag-pill--info"><i data-lucide="shield-alert"></i> Peligro de Soporte</span>` : ""}
          </div>
          ${threat.bestAnswers.length ? `
            <div class="threat-kill-chain">
              <span style="color: var(--muted); font-size: 0.7rem; font-weight: 800; text-transform: uppercase;">Respuestas</span>
              <i data-lucide="arrow-right" style="color: var(--red); width: 14px; height: 14px;"></i>
              ${threat.bestAnswers.map(ans => `<img src="${ans.sprite}" class="sprite-micro" title="${ans.displayName}" style="width: 28px; height: 28px;">`).join("")}
            </div>
          ` : ""}
        </div>
      </div>
    `).join("");
  }

  if (ambers.length > 0) {
    html += `<div class="threat-amber-grid">`;
    html += ambers.map(({ mon, threat }) => `
      <div class="threat-compact-card" data-scout="${mon.name}">
        <img src="${mon.sprite}" style="width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" alt="${mon.displayName}">
        <div style="font-weight: 900; font-size: 0.85rem; color: #fff;">${mon.displayName}</div>
        ${threat.reasons.length ? `<div style="color: var(--orange); font-size: 0.65rem; line-height: 1.2;">${threat.reasons[0]}</div>` : ""}
        ${threat.isSupportThreat ? `<div style="color: var(--blue); font-size: 0.65rem; font-weight: bold; line-height: 1.2;">Soporte Clave</div>` : ""}
      </div>
    `).join("");
    html += `</div>`;
  }

  if (greens.length > 0) {
    html += `<div class="threat-walled-zone">`;
    html += greens.map(({ mon }) => `
      <div class="threat-walled-sprite" title="${mon.displayName}" data-scout="${mon.name}">
        <img src="${mon.sprite}" alt="${mon.displayName}">
        <div class="threat-walled-check"><i data-lucide="shield-check"></i></div>
      </div>
    `).join("");
    html += `</div>`;
  }

  ANALYSIS.threatList.innerHTML = html;

  updateIcons();
}

/**
 * Depende directamente del resultado `rows` generado por `getRows()` en matrix.
 * @param {Array} rows - Array de objetos devuelto por getRows()
 */
export function renderOpportunities(rows) {
  if (state.matrixMode === "defensive") {
    ANALYSIS.opportunityList.innerHTML = `<div class="muted-small">Las oportunidades ofensivas solo aplican en vista ofensiva.</div>`;
    return;
  }

  // Extraer todas las interacciones fuertes (mult >= 2)
  const allStrongHits = rows
    .flatMap((r) => r.cells)
    .filter((x) => x.mult >= 2)
    .sort((a, b) => b.mult - a.mult);

  if (!allStrongHits.length) {
    ANALYSIS.opportunityList.innerHTML = `<div class="empty">No hay ventanas de presión clara todavía.</div>`;
    return;
  }

  // Agrupar por Defensor (El Pokémon rival vulnerable)
  const targets = {};
  allStrongHits.forEach(hit => {
    const defName = hit.defender.name;
    if (!targets[defName]) {
      targets[defName] = {
        defender: hit.defender,
        highestMult: hit.mult,
        ohkoRisk: hit.ohko || hit.ohkoProb >= 100,
        executioners: []
      };
    }
    // Añadir ejecutores (máximo 2 por target para no saturar la tarjeta)
    if (targets[defName].executioners.length < 2) {
      targets[defName].executioners.push(hit);
    }
    // Actualizar riesgo si alguien le hace OHKO
    if (hit.ohko || hit.ohkoProb >= 100) targets[defName].ohkoRisk = true;
  });

  // Convertir a array, ordenar por riesgo (OHKO primero, luego multiplicador) y tomar top 4
  const topTargets = Object.values(targets)
    .sort((a, b) => (b.ohkoRisk === a.ohkoRisk ? b.highestMult - a.highestMult : b.ohkoRisk ? 1 : -1))
    .slice(0, 4);

  ANALYSIS.opportunityList.className = "target-lock-board";

  ANALYSIS.opportunityList.innerHTML = topTargets.map(target => {
    const isHot = target.ohkoRisk || target.highestMult >= 4;
    const badgeText = target.ohkoRisk ? "💀 Riesgo OHKO" : `Peligro x${target.highestMult}`;
    const badgeClass = isHot ? "target-lethality-badge target-lethality-badge--hot" : "target-lethality-badge";

    return `
      <div class="target-bounty-card">
        <div class="${badgeClass}">${badgeText}</div>
        
        <div class="target-crosshair" title="${target.defender.displayName}">
          <img src="${target.defender.sprite}" alt="${target.defender.displayName}" loading="lazy">
        </div>

        <div class="target-executioners">
          ${target.executioners.map(hit => {
             const typeMeta = TYPE_META[hit.type] || { color: '#8aa2c6' };
             const koChipsHtml = renderKoConditionChips(evaluateKoConditions(hit.attacker, hit.defender, hit, {
               attackerSide: 'self',
               defenderSide: 'enemy',
               field: state.field,
               maxVisible: 3,
             }), { compact: true });
             return `
               <div class="target-execution-row">
                 <img src="${hit.attacker.sprite}" class="sprite-micro" title="${hit.attacker.displayName}">
                 <div style="display:grid; gap:4px; min-width:0;">
                   <div style="display:flex; align-items:center; gap:4px; min-width:0;">
                     <span class="target-move-name">${getTranslation(hit.move, "move") || hit.type}</span>
                     <div class="type-icon-circle" style="position: static; width:14px; height:14px; background-color: ${typeMeta.color};"></div>
                     ${getEffectivenessBadgeHtml(hit.mult)}
                   </div>
                   ${koChipsHtml}
                 </div>
               </div>
             `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  updateIcons();
}

export function renderStrategies() {
  const enemy = state.enemy.filter(Boolean);
  const strategies = inferStrategies(enemy);

  if (!strategies.length) {
    ANALYSIS.strategyList.innerHTML = `<div class="empty">Sin datos para inferir estrategias.</div>`;
    return;
  }

  ANALYSIS.strategyList.style.display = "grid";
  ANALYSIS.strategyList.style.gridTemplateColumns = "repeat(auto-fit, minmax(140px, 1fr))";
  ANALYSIS.strategyList.style.gap = "8px";

  ANALYSIS.strategyList.innerHTML = strategies
    .map(
      (item) => `
        <div class="strategy-row">
          <div style="font-size: 1.6rem; color: var(--blue); margin-bottom: 4px; display: grid; place-items: center;">${item.icon}</div>
          <div class="row-title" style="font-size: 0.85rem;">${item.title}</div>
          <div style="display:flex; flex-wrap:wrap; justify-content:center; gap:2px; margin-top:6px;">
            ${(item.triggers || []).map(t => `<img src="${t.sprite}" class="sprite-micro" title="${t.displayName}" alt="${t.displayName}">`).join('')}
          </div>
        </div>
      `,
    )
    .join("");

  updateIcons();
}

export function renderSpeedTiers() {
  const speedTierList = ANALYSIS.speedTierList;
  const allMons = [
    ...state.self.map((m) => (m ? { mon: m, side: "self" } : null)).filter(Boolean),
    ...state.enemy.map((m) => (m ? { mon: m, side: "enemy" } : null)).filter(Boolean),
  ];

  if (!allMons.length) {
    speedTierList.innerHTML = `<div class="empty">Añade Pokémon para ver el orden de velocidad.</div>`;
    return;
  }

  const PRIO_SET = new Set(['fakeout', 'sorpresa', 'firstimpression', 'extremespeed', 'velocidadextrema', 'suckerpunch', 'golpebajo', 'aquajet', 'acuajet', 'machpunch', 'ultrapuño', 'bulletpunch', 'puñobala', 'iceshard', 'cantohelado', 'shadowsneak', 'sombravil', 'grassyglide', 'fitimpulso']);

  const tiers = allMons.map((item) => {
    // 1. Calculamos la velocidad efectiva actual
    const spe = calculateSpeed(item.mon, item.side);
    
    // 2. Calculamos la velocidad NETA (Nivel 50 sin modificadores)
    const baseSpe = item.mon.baseStats?.speed || 100;
    const evsSpe = item.mon.set?.evs?.spe || 0;
    const nature = item.mon.set?.nature || "";
    let rawSpe = Math.floor(((2 * baseSpe + 31 + Math.floor(evsSpe / 4)) * 50) / 100) + 5;
    rawSpe = Math.floor(rawSpe * getNatureSpeModifier(nature));

    // 3. Evaluamos condiciones especiales
    const hasPriority = (item.mon.set?.moves || []).some(m => PRIO_SET.has(String(m).toLowerCase().replace(/[^a-z0-9]/g, '')));
    const ability = (item.mon.set?.ability || '').toLowerCase().replace(/[^a-z]/g, '');
    const obj = (item.mon.set?.item || '').toLowerCase().replace(/[^a-z]/g, '');
    
    let modReason = null;
    let ringColor = null;

    if (Math.abs(spe) !== rawSpe) {
        if (['sandrush', 'impetuarena'].includes(ability)) { modReason = 'Ímpetu Arena'; ringColor = '#B6A136'; }
        else if (['chlorophyll', 'clorofila'].includes(ability)) { modReason = 'Clorofila'; ringColor = '#7AC74C'; }
        else if (['swiftswim', 'nadorapido'].includes(ability)) { modReason = 'Nado Rápido'; ringColor = '#6390F0'; }
        else if (['slushrush', 'quitanieves'].includes(ability)) { modReason = 'Quitanieves'; ringColor = '#96D9D6'; }
        else if (obj === 'choicescarf' || obj === 'pañueloeleccion') { modReason = 'Pañuelo'; ringColor = '#A98FF3'; }
        else if ((item.side === 'self' && state.field.tailwindSelf) || (item.side === 'enemy' && state.field.tailwindEnemy)) { modReason = 'Viento Afín'; ringColor = '#96D9D6'; }
    }

    // Prioridad sobrescribe el texto, pero mantiene el anillo del clima si existe
    if (hasPriority) {
        modReason = 'Prioridad';
        if (!ringColor) ringColor = 'var(--gold, #ffd700)';
    }

    return { ...item, spe, rawSpe, hasPriority, modReason, ringColor };
  }).sort((a, b) => b.spe - a.spe);

  // Agrupamos para calcular los empates (Ties)
  const blocks = [];
  for (let i = 0; i < tiers.length; ) {
    let j = i;
    while (j + 1 < tiers.length && tiers[j + 1].spe === tiers[i].spe && tiers[j + 1].hasPriority === tiers[i].hasPriority) j++;
    blocks.push(tiers.slice(i, j + 1));
    i = j + 1;
  }

  // Generamos el HTML del Timeline
  let html = `<div class="tactical-timeline-track">`;
  
  blocks.forEach((group) => {
    if (group.length > 1) {
      html += `
        <div class="timeline-tie-box">
          <div class="timeline-tie-label"><i data-lucide="zap"></i> Tie</div>
          ${group.map(item => {
            let ringStyle = item.ringColor ? `box-shadow: 0 0 0 3px #1a1a24, 0 0 0 5px ${item.ringColor};` : '';
            let labelHtml = item.modReason ? `<div class="timeline-mod-label ${item.hasPriority ? 'priority' : 'buff'}">${item.hasPriority ? '<i data-lucide="zap"></i>' : ''} ${item.modReason}</div>` : '';
            return `
              <div class="timeline-node" title="${item.mon.displayName}">
                ${labelHtml}
                <div class="timeline-avatar" style="${ringStyle}">
                  <img src="${item.mon.sprite}" alt="${item.mon.displayName}">
                  <div class="timeline-side-badge ${item.side}"></div>
                </div>
                <div class="timeline-stats">
                  <div class="stat-eff" style="${item.spe < 0 ? 'color: var(--purple);' : ''}">${Math.abs(item.spe)}</div>
                  <div class="stat-base">Base ${item.rawSpe}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      const item = group[0];
      let ringStyle = item.ringColor ? `box-shadow: 0 0 0 3px #1a1a24, 0 0 0 5px ${item.ringColor};` : '';
      let labelHtml = item.modReason ? `<div class="timeline-mod-label ${item.hasPriority ? 'priority' : 'buff'}">${item.hasPriority ? '<i data-lucide="zap"></i>' : ''} ${item.modReason}</div>` : '';
      html += `
        <div class="timeline-node" title="${item.mon.displayName}">
          ${labelHtml}
          <div class="timeline-avatar" style="${ringStyle}">
            <img src="${item.mon.sprite}" alt="${item.mon.displayName}">
            <div class="timeline-side-badge ${item.side}"></div>
          </div>
          <div class="timeline-stats">
            <div class="stat-eff" style="${item.spe < 0 ? 'color: var(--purple);' : ''}">${Math.abs(item.spe)}</div>
            <div class="stat-base">Base ${item.rawSpe}</div>
          </div>
        </div>
      `;
    }
  });

  html += `</div>`;
  speedTierList.innerHTML = html;

  // Toggle buttons (estos se mantienen resolviendo dinamicamente pues dependen de estado, pero son fijos)
  const toggleTailwindSelfBtn = document.getElementById("toggleTailwindSelfBtn");
  if(toggleTailwindSelfBtn) toggleTailwindSelfBtn.className = `btn small ${state.field.tailwindSelf ? "blue" : "ghost"}`;
  
  const toggleTailwindEnemyBtn = document.getElementById("toggleTailwindEnemyBtn");
  if(toggleTailwindEnemyBtn) toggleTailwindEnemyBtn.className = `btn small ${state.field.tailwindEnemy ? "red" : "ghost"}`;
  
  const toggleTrickRoomBtn = document.getElementById("toggleTrickRoomBtn");
  if(toggleTrickRoomBtn) toggleTrickRoomBtn.className = `btn small ${state.field.trickRoom ? "gold" : "ghost"}`;

  renderSpeedOrderPanel();
  updateIcons();
}

export function renderDefensiveAlerts() {
  const alertList = ANALYSIS.defensiveAlertFloat;
  if (!alertList) return;
  const mons = state.self.filter(Boolean);
  if (mons.length < 3) {
    alertList.innerHTML = "";
    return;
  }

  const alerts = [];
  const types = Object.keys(TYPE_CHART);
  for (const t of types) {
    let weak = 0,
      resist = 0,
      immune = 0;
    for (const mon of mons) {
      let mult = effectiveness(t, mon.types);
      const ab = mon.set?.ability || "";

      if (
        t === "ground" &&
        (ab === "Levitate" || mon.set?.item === "Air Balloon")
      )
        mult = 0;
      if (
        t === "water" &&
        ["Water Absorb", "Storm Drain", "Dry Skin"].includes(ab)
      )
        mult = 0;
      if (t === "fire" && ["Flash Fire", "Well-Baked Body"].includes(ab))
        mult = 0;
      if (
        t === "electric" &&
        ["Volt Absorb", "Lightning Rod", "Motor Drive"].includes(ab)
      )
        mult = 0;
      if (t === "grass" && ["Sap Sipper"].includes(ab)) mult = 0;

      if (mult > 1) weak++;
      else if (mult === 0) immune++;
      else if (mult < 1) resist++;
    }

    const score = resist + immune - weak;
    if (score <= -2) {
      alerts.push({ type: t, name: TYPE_META[t].name, score });
    } else if (score >= 2) {
      alerts.push({ type: t, name: TYPE_META[t].name, score });
    }
  }

  if (!alerts.length) {
    alertList.innerHTML = "";
    return;
  }

  alertList.innerHTML = alerts
    .sort((a, b) => a.score - b.score)
    .map(
      (a) => {
        const isWeak = a.score < 0;
        const iconUrl = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/${a.type.toLowerCase()}.svg`;
        const typeColor = TYPE_META[a.type]?.color || '#fff';
        const iconContrast = getContrastColor(typeColor);
        const bgCol = isWeak ? 'rgba(255, 59, 48, 0.2)' : 'rgba(48, 209, 88, 0.2)';
        const borderCol = isWeak ? 'rgba(255, 59, 48, 0.4)' : 'rgba(48, 209, 88, 0.4)';
        const textCol = isWeak ? '#ffc8c4' : '#d4ffe3';
        const sign = a.score > 0 ? '+' : '';

        return `
        <div class="tiny-chip" style="background: ${bgCol}; border-color: ${borderCol}; color: ${textCol}; font-size: 0.75rem; padding: 4px 8px; gap: 8px;">
          <div class="type-icon-circle" style="position: static; background-color: ${typeColor}; width: 18px; height: 18px; box-shadow: none;">
            <div class="type-svg-mask" style="mask-image: url('${iconUrl}'); -webkit-mask-image: url('${iconUrl}'); background-color: ${iconContrast}; width: 10px; height: 10px;"></div>
          </div>
          <strong style="font-family: var(--poke-stat-font);">${sign}${a.score}</strong>
        </div>
      `;
    })
    .join("");
}
