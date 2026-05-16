// render/analysis.js
// Responsabilidad: Paneles de análisis visual debajo de la matriz (Threats, Opportunities, Strategies, Speed Tiers, Defensive Alerts)

import { state } from '../core/state.js';
import { ANALYSIS } from '../core/dom.js';
import { getFocusedTeam } from '../app-core.js';
import { updateIcons } from '../render/app.js';
import { getEffectivenessBadgeHtml } from '../matrix/render.js';
import { TYPE_META, TYPE_CHART } from '../core/constants.js';
import { getTranslation } from '../utils/text.js';
import { scoreThreat, inferStrategies } from '../analysis/threats.js';
import { calculateSpeed } from '../battle/speed.js';
import { getNatureSpeModifier } from '../battle/stats.js';
import { getContrastColor, effectiveness } from '../utils/types.js';

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
             return `
               <div class="target-execution-row">
                 <img src="${hit.attacker.sprite}" class="sprite-micro" title="${hit.attacker.displayName}">
                 <div style="display:flex; align-items:center; gap:4px;">
                   <span class="target-move-name">${getTranslation(hit.move, "move") || hit.type}</span>
                   <div class="type-icon-circle" style="position: static; width:14px; height:14px; background-color: ${typeMeta.color};"></div>
                   ${getEffectivenessBadgeHtml(hit.mult)}
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
