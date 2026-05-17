// matrix/render.js
// Responsabilidad: Renderizado DOM de la matriz principal (DOM manipulation, buildMatrixCellMarkup, renderMatrix)
// Temporalmente incluye las responsabilidades de core.js y explainer.js

import { state } from '../core/state.js';
import { MATRIX } from '../core/dom.js';
import { getFocusedTeam } from '../app-core.js';
import { updateIcons, renderAll } from '../render/app.js';
import { 
  typeChip, fmtMult, effClass, typeDot, 
  effectiveness, getContrastColor
} from '../utils/types.js';
import { TYPE_META, RATING_STORAGE_KEY, MATRIX_DETAIL_MODE_KEY, MATRIX_HELP_SEEN_KEY } from '../core/constants.js';
import { escapeHtml, getTranslation, localizeMoveName } from '../utils/text.js';
import { DEBUG_MODE } from '../utils/debug.js';
import { calculateEffectiveStats } from '../battle/stats.js';
import { estimateMoveDamage, bestAttack } from '../battle/damage.js';
import { evaluateKoConditions, renderKoConditionChips } from '../analysis/ko-conditions.js';

export function getRows() {
  const self = getFocusedTeam('self');
  const enemy = getFocusedTeam('enemy');
  if (!self.length || !enemy.length) return [];

  if (state.matrixMode === "defensive") {
    return enemy.map((attacker) => ({
      attacker,
      cells: self.map((defender) => {
        const best = bestAttack(attacker, defender);
        return {
          attacker,
          defender,
          type: best.type,
          mult: best.mult,
          rawMult: best.rawMult,
          wMul: best.wMul,
          terrMul: best.terrMul,
          blocked: best.blocked,
          move: best.move,
          damage: best.damage,
          minPct: best.minPct,
          maxPct: best.maxPct,
          ohkoProb: best.ohkoProb,
          ohko: best.ohko,
        };
      }),
    }));
  }

  return self.map((attacker) => ({
    attacker,
    cells: enemy.map((defender) => {
      const best = bestAttack(attacker, defender);
      return {
        attacker,
        defender,
        type: best.type,
        mult: best.mult,
        rawMult: best.rawMult,
        wMul: best.wMul,
        terrMul: best.terrMul,
        blocked: best.blocked,
        move: best.move,
        damage: best.damage,
        minPct: best.minPct,
        maxPct: best.maxPct,
        ohkoProb: best.ohkoProb,
        ohko: best.ohko,
      };
    }),
  }));
}

export function matrixCellClass(cell) {
  if (typeof window !== "undefined" && window.matrixCellClassOverride) {
    const override = window.matrixCellClassOverride(cell);
    if (override) return override;
  }
  if (state.matrixMode === "defensive") {
    if (cell.mult <= 0.5) return "eff-def-safe";
    if (cell.mult >= 2) return "eff-def-danger";
    return "eff-def-neutral";
  }
  return effClass(cell.mult);
}

function renderDock(side) {
  const arr = state[side];
  const mount = side === "self" ? selfSlots : enemySlots;

  mount.innerHTML = arr
    .map((mon, idx) => {
      if (!mon) {
        return `
            <button class="mini-slot empty" data-action="pick" data-side="${side}" data-index="${idx}" aria-label="Añadir slot ${idx + 1}">
              <span class="plus">+</span>
            </button>
          `;
      }

      const chosenIndex = side === "self" && state.uiMode === 'quick' && state.chosenFour ? state.chosenFour.indexOf(idx) : -1;
      const chosenBadge = chosenIndex !== -1
        ? `<div class="chosen-badge">${chosenIndex + 1}</div>`
        : '';

      return `
          <button class="mini-slot" data-action="pick" data-side="${side}" data-index="${idx}" aria-label="${mon.displayName}" ${side === "enemy" ? `data-scout="${mon.name}"` : ""}>
            ${chosenBadge}
            ${mon.name.includes("-mega") ? '<div class="mega-icon"></div>' : ""}
            <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
            ${side === "self" ? `<span class="slot-edit-dot" title="Set configurado"></span>` : ""}
            <span class="slot-remove" data-action="remove" data-side="${side}" data-index="${idx}"><i data-lucide="x" style="width:12px;height:12px;"></i></span>
          </button>
        `;
    })
    .join("");
}

export function formatCellPct(cell) {
  if (cell.blocked || cell.mult === 0) return '0%';
  const min = Number.isFinite(cell.minPct) ? cell.minPct : 0;
  const max = Number.isFinite(cell.maxPct) ? cell.maxPct : 0;
  if (!min && !max) return '0%';
  if (min === max) return `${max}%`;
  return `${min}-${max}%`;
}

export function getEffectivenessBadgeHtml(mult) {
  if (mult >= 4) return `<span class="tag-pill tag-pill--danger" style="font-size: 0.6rem; padding: 2px 4px;">x${mult} Súper Eficaz</span>`;
  if (mult >= 2) return `<span class="tag-pill tag-pill--warning" style="font-size: 0.6rem; padding: 2px 4px;">x${mult} Eficaz</span>`;
  if (mult === 0) return `<span class="tag-pill" style="font-size: 0.6rem; padding: 2px 4px; background: #666; color: #fff; border-color: #999;">Inmune</span>`;
  if (mult <= 0.25) return `<span class="tag-pill tag-pill--info" style="font-size: 0.6rem; padding: 2px 4px;">x${mult} Muy poco eficaz</span>`;
  if (mult <= 0.5) return `<span class="tag-pill tag-pill--info" style="font-size: 0.6rem; padding: 2px 4px;">x${mult} Poco eficaz</span>`;
  return `<span class="tag-pill" style="font-size: 0.6rem; padding: 2px 4px; background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.3);">x1 Neutro</span>`;
}

export function describeWeatherEffect(cell) {
  if (!cell.weather || !cell.weatherMul || cell.weatherMul === 1) return '';
  return `${WEATHER_LABELS[cell.weather] || cell.weather} ${cell.weatherMul > 1 ? 'potencia' : 'reduce'}`;
}

export function describeTerrainEffect(cell) {
  if (cell.blocked && cell.terrain === 'psychic') return 'Psíquico anula prioridad';
  if (!cell.terrain || !cell.terrainMul || cell.terrainMul === 1) return '';
  return `${TERRAIN_LABELS[cell.terrain] || cell.terrain} ${cell.terrainMul > 1 ? 'potencia' : 'reduce'}`;
}

export function classifyMatrixCell(cell, offensive = true) {
  const maxPct = Number(cell.maxPct || 0);
  const minPct = Number(cell.minPct || 0);

  if (offensive) {
    if (cell.blocked) return { tone: 'blocked', label: 'Bloqueado', shortLabel: 'Bloqueado' };
    if (cell.mult === 0) return { tone: 'immune', label: 'Inmune', shortLabel: 'Inmune' };
    if (cell.ohkoProb >= 75 || (maxPct >= 100 && minPct >= 85)) {
      return { tone: 'ko', label: 'KO probable', shortLabel: 'KO' };
    }
    if (cell.mult >= 2 && maxPct >= 50) {
      return { tone: 'pressure', label: 'Presión alta', shortLabel: 'Presión' };
    }
    if (cell.mult > 1 || maxPct >= 25) {
      return { tone: 'chip', label: 'Chip útil', shortLabel: 'Chip' };
    }
    if (cell.mult < 1 || maxPct < 25) {
      return { tone: 'wall', label: 'Muro', shortLabel: 'Muro' };
    }
    return { tone: 'neutral', label: 'Neutral', shortLabel: 'Neutral' };
  }

  if (cell.mult === 0) return { tone: 'safe', label: 'Inmune', shortLabel: 'Inmune' };
  if (cell.mult < 1 && maxPct < 35) return { tone: 'safe', label: 'Cambio seguro', shortLabel: 'Seguro' };
  if (cell.ohkoProb >= 50 || maxPct >= 90 || cell.mult >= 4) {
    return { tone: 'danger', label: 'Peligro real', shortLabel: 'Peligro' };
  }
  if (cell.mult >= 2 || maxPct >= 50) {
    return { tone: 'respect', label: 'Respetar', shortLabel: 'Respeto' };
  }
  return { tone: 'neutral', label: 'Neutral', shortLabel: 'Neutral' };
}

export function buildMatrixContextTags(cell, offensive, compact = false) {
  const tags = [];

  const weatherTag = describeWeatherEffect(cell);
  const terrainTag = describeTerrainEffect(cell);

  if (cell.blocked) {
    tags.push({ tone: 'blocked', label: terrainTag || 'Bloqueado por campo' });
  } else {
    if (weatherTag) {
      tags.push({
        tone: cell.weatherMul > 1 ? 'boost' : 'nerf',
        label: weatherTag
      });
    }

    if (terrainTag) {
      tags.push({
        tone: cell.terrainMul > 1 ? 'boost' : 'nerf',
        label: terrainTag
      });
    }

    if (cell.ohkoProb > 0 && cell.ohkoProb < 100) {
      tags.push({ tone: 'danger', label: `OHKO ${cell.ohkoProb}%` });
    }

    if (offensive && cell.mult >= 2 && cell.maxPct < 50) {
      tags.push({ tone: 'info', label: 'Buen tipo, daño medio' });
    }

    if (offensive && cell.mult < 1 && cell.maxPct < 25) {
      tags.push({ tone: 'blocked', label: 'No merece click' });
    }
  }

  return tags.slice(0, compact ? 1 : 3);
}

export function getTacticalPhrase(cell, offensive) {
  if (offensive) {
    if (cell.blocked) return "Bloqueado por estado del campo";
    if (cell.mult === 0) return "Totalmente inmune al daño";
    if (cell.ohkoProb >= 75 || (cell.maxPct >= 100 && cell.minPct >= 85)) return "Amenaza KO si entra limpio";
    if (cell.mult >= 2 && cell.maxPct >= 50) return "Buena presión, fuerza respuesta";
    if (cell.mult > 1 || cell.maxPct >= 25) return "Buen chip, no fuerza cambio";
    if (cell.mult < 1 || cell.maxPct < 25) return "Resiste bien, no compensa pulsar";
    return "Daño aceptable sin ventaja clara";
  } else {
    if (cell.mult === 0) return "Inmune a su mejor ataque";
    if (cell.mult < 1 && cell.maxPct < 35) return "Entrada segura, resiste bien";
    if (cell.ohkoProb >= 50 || cell.maxPct >= 90 || cell.mult >= 4) return "Te castiga si pivotas aquí";
    if (cell.mult >= 2 || cell.maxPct >= 50) return "Amenaza fuerte, cuidado al entrar";
    return "Intercambio de daño parejo";
  }
}

export function renderMatrixExplainer(rows, offensive) {
  const titleEl = document.getElementById('matrixExplainerTitle');
  const textEl = document.getElementById('matrixExplainerText');
  const badgesEl = document.getElementById('matrixExplainerBadges');
  const footEl = document.getElementById('matrixExplainerFoot');

  if (!titleEl || !textEl || !badgesEl || !footEl) return;

  if (offensive) {
    titleEl.textContent = 'Cómo leer esta matriz';
    textEl.textContent = 'Cada celda resume si conviene presionar, cuánto daño estimas y qué campo altera la lectura.';
    badgesEl.innerHTML = `
      <span class="matrix-state-badge matrix-state-badge--ko">KO probable</span>
      <span class="matrix-state-badge matrix-state-badge--pressure">Presión alta</span>
      <span class="matrix-state-badge matrix-state-badge--chip">Chip útil</span>
      <span class="matrix-state-badge">Neutral</span>
      <span class="matrix-state-badge matrix-state-badge--wall">Muro</span>
      <span class="matrix-state-badge matrix-state-badge--blocked">Inmune / bloqueado</span>
    `;
    footEl.textContent = 'Objetivo: detectar KOs, presión útil y muros reales de un vistazo.';
  } else {
    titleEl.textContent = 'Cómo leer esta matriz';
    textEl.textContent = 'Cada celda resume si puedes entrar seguro, qué amenaza recibes y qué campo empeora el cruce.';
    badgesEl.innerHTML = `
      <span class="matrix-state-badge matrix-state-badge--danger">Peligro real</span>
      <span class="matrix-state-badge matrix-state-badge--respect">Respetar</span>
      <span class="matrix-state-badge">Neutral</span>
      <span class="matrix-state-badge matrix-state-badge--safe">Cambio seguro</span>
      <span class="matrix-state-badge matrix-state-badge--blocked">Inmune</span>
    `;
    footEl.textContent = 'Objetivo: detectar entradas seguras, amenazas inmediatas e inmunidades antes de pivotar.';
  }
}

export function loadMatrixPreferences() {
  try {
    const detailMode = localStorage.getItem(MATRIX_DETAIL_MODE_KEY);
    if (detailMode === 'compact' || detailMode === 'detailed') {
      state.matrixDetailMode = detailMode;
    } else {
      state.matrixDetailMode = 'detailed';
    }
    
    const helpSeen = localStorage.getItem(MATRIX_HELP_SEEN_KEY);
    if (!helpSeen) {
      state.matrixHelpOpen = true;
      localStorage.setItem(MATRIX_HELP_SEEN_KEY, "true");
    }
  } catch(e) {
    console.error(e);
  }
}

export function setMatrixDetailMode(mode) {
  state.matrixDetailMode = mode;
  try { localStorage.setItem(MATRIX_DETAIL_MODE_KEY, mode); } catch(e){console.error(e);}
  triggerMatrixFlash();
  renderAll();
}

export function toggleMatrixHelp(forceOpen) {
  state.matrixHelpOpen = forceOpen !== undefined ? forceOpen : !state.matrixHelpOpen;
  const panel = document.getElementById('matrixHelpPanel');
  const btn = MATRIX.helpToggleBtn;
  if (panel && btn) {
    panel.classList.toggle('is-open', state.matrixHelpOpen);
    btn.setAttribute('aria-expanded', state.matrixHelpOpen ? 'true' : 'false');
  }
}

export function sanitizeCell(cell) {
  const move = typeof cell.move === 'string' ? cell.move.trim() : '';

  const minPct = Number(cell.minPct);
  const maxPct = Number(cell.maxPct);
  const hasValidDamage = Number.isFinite(minPct) && Number.isFinite(maxPct);

  if (!move || !hasValidDamage) {
    console.warn(`[DEBUG] sanitizeCell: Cell flagged with dataIssue. Attacker: ${cell.attacker?.name}, Move: "${move}", hasValidDamage: ${hasValidDamage}`, cell);
    return { ...cell, move: null, minPct: null, maxPct: null, dataIssue: true };
  }

  return cell;
}

export function buildMatrixCellMarkup(rowAttacker, rawCell, offensive, compact = false) {
  const cell = sanitizeCell(rawCell);
  const isCompact = compact;
  const verdict = classifyMatrixCell(cell, offensive);
  const moveLabel = cell.dataIssue ? 'Datos incompletos' : (localizeMoveName(cell.move) || 'Sin presión real');
  const rangeLabel = cell.dataIssue ? 'N/A' : formatCellPct(cell);
  
  const multLabel = cell.blocked ? 'inmune' : `x${fmtMult(cell.mult).replace('×', '')}`;
  
  let metaLine;
  if (cell.blocked) {
    metaLine = `0% · ${multLabel}`;
  } else {
    metaLine = cell.dataIssue ? `Sin daño · ${multLabel}` : `${rangeLabel} · ${multLabel}`;
  }
  
  const phrase = getTacticalPhrase(cell, offensive);

  const tags = buildMatrixContextTags(cell, offensive, isCompact);
  const koConditions = evaluateKoConditions(rowAttacker, cell.defender, cell, {
    attackerSide: offensive ? 'self' : 'enemy',
    defenderSide: offensive ? 'enemy' : 'self',
    field: state.field,
    maxVisible: 3,
  });
  const koChipsHtml = renderKoConditionChips(koConditions, { compact: isCompact });
  const payloadObject = {
    attacker: rowAttacker,
    defender: cell.defender,
    moveName: cell.move,
    moveType: cell.type || 'normal',
    mult: cell.mult ?? cell.rawMult ?? 1,
    rawMult: cell.rawMult ?? 1,
    wMul: cell.wMul ?? 1,
    terrMul: cell.terrMul ?? 1,
    damage: cell.damage ?? 0,
    minPct: cell.minPct,
    maxPct: cell.maxPct,
    ohkoProb: Number(cell.ohkoProb || 0),
    verdict: verdict.label,
    blocked: !!cell.blocked,
    offensive: offensive,
    tags: tags.map((tag) => tag.label),
    koConditions: koConditions.tags,
    label: phrase,
    shortNote: metaLine,
    dataIssue: cell.dataIssue,
    debug: DEBUG_MODE
      ? {
          registryExplain: cell.registryExplain || [],
          rawMult: cell.rawMult,
          wMul: cell.wMul,
          terrMul: cell.terrMul,
        }
      : null,
  };

  if (cell.dataIssue) {
    console.warn(`[DEBUG] buildMatrixCellMarkup: dataIssue detected for ${rowAttacker?.name} vs ${cell.defender?.name}`, payloadObject);
  }

  const tooltipData = encodeURIComponent(JSON.stringify(payloadObject));

  const classes = [
    'cell',
    'matrix-cell-card',
    `matrix-cell-card--${verdict.tone}`,
    'clickable-cell'
  ];

  const stateLabel = isCompact ? verdict.shortLabel : verdict.label;
  const tagsHtml = tags.map(tag => `
        <span class="matrix-context-chip matrix-context-chip--${tag.tone}">
          ${escapeHtml(tag.label)}
        </span>
      `).join('');
  const chipsHtml = tags.length
    ? `<div class="matrix-cell-context">${tagsHtml}</div>`
    : '';

  if (isCompact) {
    return `
      <div class="${classes.join(' ')}" data-tooltip="${tooltipData}" title="Toca para lectura táctica">
        <div class="cell__top">
          <div class="cell__top-state">${escapeHtml(stateLabel)}</div>
          ${cell.type ? typeChip(cell.type) : ''}
        </div>
        <div class="cell__move ${cell.move ? '' : 'matrix-cell-move--muted'}">
          ${escapeHtml(moveLabel)}
        </div>
        ${koChipsHtml}
        <div class="cell__range">
          ${escapeHtml(metaLine)}
        </div>
        ${chipsHtml}
      </div>
    `;
  } else {
    return `
      <div class="${classes.join(' ')}" data-tooltip="${tooltipData}" title="Toca para lectura táctica">
        <div class="cell__top-state">${escapeHtml(stateLabel)}</div>
        <div class="cell__move-box">
          ${cell.type ? typeChip(cell.type) : ''}
          <span class="cell__move ${cell.move ? '' : 'matrix-cell-move--muted'}">${escapeHtml(moveLabel)}</span>
        </div>
        <div class="cell__dmg-box">
          <span class="cell__dmg-range">${rangeLabel}</span>
          <span class="cell__dmg-mult">${multLabel}</span>
        </div>
        ${koChipsHtml}
        <div class="cell__note">${escapeHtml(phrase)}</div>
      </div>
    `;
  }
}

export function updateMatrixFieldUI() {
  const modeBtns = document.querySelectorAll("#matrixModeToggleGroup .segmented-btn");
  modeBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === state.matrixMode);
  });

  const detailBtns = document.querySelectorAll("#matrixDetailToggleGroup .segmented-btn");
  detailBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.detail === state.matrixDetailMode);
  });

  const title = document.getElementById("matrixSectionTitle");
  const sub = document.getElementById("matrixSectionSub");
  const legend = document.getElementById("matrixLegendChip");
  if (title)
    title.textContent =
      state.matrixMode === "defensive" ? "Matriz defensiva" : "Matriz ofensiva";
  if (sub) {
    if (state.matrixMode === "offensive") {
      sub.textContent = state.matrixDetailMode === "compact"
        ? "Cruces rápidos para detectar KO, presión útil y muros."
        : "Detalle de daño estimado, tipo y presión por cruce.";
    } else {
      sub.textContent = state.matrixDetailMode === "compact"
        ? "Qué amenazas te rompen y qué cruces aguantas."
        : "Daño entrante estimado con clima, terreno y sets actuales.";
    }
  }
  if (legend) {
    legend.textContent =
      state.matrixMode === "defensive"
        ? "Verde ≤×0.5 · Rojo ≥×2"
        : "×4 / ×2 · 💀 OHKO";
  }

  document.querySelectorAll("#matrixFieldControls [data-weather]").forEach((el) => {
    el.classList.toggle("on", state.field.weather === el.dataset.weather);
  });
  document.querySelectorAll("#matrixFieldControls [data-terrain]").forEach((el) => {
    el.classList.toggle("on", state.field.terrain === el.dataset.terrain);
  });
}

export function renderMatrix(rows) {
  updateMatrixFieldUI();

  const offensive = state.matrixMode !== 'defensive';
  renderMatrixExplainer(rows, offensive);

  if (!rows.length) {
    MATRIX.placeholder.classList.remove('hidden');
    MATRIX.container.classList.add('hidden');
    MATRIX.container.classList.remove('matrix-grid--compact');
    MATRIX.status.textContent = '0 cruces';
    const mc = document.getElementById('metricCross');
    const ms = document.getElementById('metricStrong');
    const mp = document.getElementById('metricPeak');
    const ma = document.getElementById('metricAvg');
    if (mc) mc.textContent = '0';
    if (ms) ms.textContent = '0';
    if (mp) mp.textContent = '0';
    if (ma) ma.textContent = '0.00';
    return;
  }

  const self = getFocusedTeam('self');
  const enemy = getFocusedTeam('enemy');
  const colMons = offensive ? enemy : self;
  const flat = rows.flatMap((row) => row.cells);
  const cross = flat.length;
  const isCompact = state.matrixDetailMode === 'compact';

  let ohkos = 0;
  let pressure = 0;
  let walls = 0;

  flat.forEach((cell) => {
    if (cell.ohko || cell.ohkoProb >= 50) {
      ohkos++;
    } else if (cell.mult >= 2) {
      pressure++;
    }
    if (cell.mult <= 0.5 || cell.blocked) {
      walls++;
    }
  });

  const elOhko = document.getElementById('metricOhkoCount');
  const elPressure = document.getElementById('metricPressureCount');
  const elWall = document.getElementById('metricWallCount');
  
  if (elOhko) elOhko.innerHTML = `<strong>${ohkos}</strong> OHKOs`;
  if (elPressure) elPressure.innerHTML = `<strong>${pressure}</strong> Presión x2+`;
  if (elWall) elWall.innerHTML = `<strong>${walls}</strong> Muros/Inmunes`;

  MATRIX.status.textContent = `${cross} cruces`;

  MATRIX.container.classList.remove('matrix-grid--compact', 'matrix-grid--detailed');
  MATRIX.container.classList.add(`matrix-grid--${state.matrixDetailMode}`);

  const colTag = offensive ? 'RIVAL' : 'TÚ';
  const colColor = offensive ? 'var(--red)' : 'var(--blue)';
  const rowTag = offensive ? 'TÚ' : 'RIVAL';
  const rowColor = offensive ? 'var(--blue)' : 'var(--red)';
  const theadBorder = offensive ? 'rgba(255, 59, 48, 0.4)' : 'rgba(50, 173, 230, 0.4)';
  const tbodyBorder = offensive ? 'rgba(50, 173, 230, 0.4)' : 'rgba(255, 59, 48, 0.4)';

  const thead = `
    <thead>
      <tr>
        <th class="corner" style="background:linear-gradient(to bottom right, transparent 49%, var(--line) 50%, transparent 51%); position:sticky; top:0; left:0; z-index:3;">
          <span style="position:absolute; top:4px; right:4px; font-size:0.55rem; font-weight:900; color:${colColor};">${colTag}</span>
          <span style="position:absolute; bottom:4px; left:4px; font-size:0.55rem; font-weight:900; color:${rowColor};">${rowTag}</span>
        </th>
        ${colMons.map((mon) => `
          <th style="border-bottom:2px solid ${theadBorder}">
            <div class="head-mon" title="${escapeHtml(mon.displayName)}">
              <div class="sprite">
                <img src="${mon.sprite}" alt="${escapeHtml(mon.displayName)}" loading="lazy">
              </div>
            </div>
          </th>
        `).join('')}
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${rows.map((row) => `
        <tr>
          <th style="border-right:2px solid ${tbodyBorder}">
            <div class="row-mon" title="${escapeHtml(row.attacker.displayName)}">
              <div class="sprite">
                <img src="${row.attacker.sprite}" alt="${escapeHtml(row.attacker.displayName)}" loading="lazy">
              </div>
            </div>
          </th>

          ${row.cells.map((cell) => `
            <td>
              ${buildMatrixCellMarkup(row.attacker, cell, offensive, isCompact)}
            </td>
          `).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;

  MATRIX.container.innerHTML = `<table>${thead}${tbody}</table>`;
  MATRIX.placeholder.classList.add('hidden');
  MATRIX.container.classList.remove('hidden');
  updateIcons();
}










export function triggerMatrixFlash() {
  const tbl = document.querySelector('.matrix-grid table');
  if (tbl) {
    tbl.classList.remove('matrix-flash');
    void tbl.offsetWidth; // Force reflow
    tbl.classList.add('matrix-flash');
  }
}
