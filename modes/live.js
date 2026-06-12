// =========================================================================
// modes/live.js — Implementación del modo Live / Battle Center.
// Extraída de app-core.js (inversión del reexport): app-core importa de aquí
// lo que necesita y reexporta getFocusedTeam para los consumidores legados.
// =========================================================================

import { DEBUG_MODE } from '../utils/debug.js';
import { getRows, getEffectivenessBadgeHtml, renderMatrix } from '../matrix/render.js';
import { renderAll, updateIcons } from '../render/app.js';
import * as quickMode from './quick.js';
import { getTranslation, formatName } from '../utils/text.js';
import { typeDot, typeChip, fmtMult } from '../utils/types.js';
import { calcMonHP } from '../battle/stats.js';
import { state } from '../core/state.js';
import { LIVE } from '../core/dom.js';
import { ensureBattleState } from '../data/pokemon.js';
import { ensureAbilityRegistry, ensureItemRegistry, ensureMoveRegistry } from '../battle/registry.js';
import { calculateSpeed } from '../battle/speed.js';
import { estimateMoveDamage, bestAttack } from '../battle/damage.js';
import { evaluateKoConditions, renderKoConditionChips } from '../analysis/ko-conditions.js';
import { tickField, recalculateActiveField, applySwitchInEffects, applyMoveResolutionEffects } from '../battle/effects.js';
import { isCanonicalSpreadMove } from '../data/canonical/dex.js';
import { SPREAD_MOVES, GUARANTEED_MULTI_HITS } from '../core/constants.js';
import {
  cloneSimulationState,
  getPriority,
  getTurn1ResolvedLeadIndices,
  advanceMonTurnState,
  applyManualMoveSideEffects,
  getActionBlockReason,
  isProtectMove,
} from '../app-core.js';

export function isBattleFocusActive() {
  return (state.uiMode === "expert" && state.battleFocus === "active") || state.uiMode === "live";
}

export function getFilledIndices(side) {
  return state[side].map((m, i) => m ? i : null).filter(i => i !== null);
}

export function normalizeActiveSlots(side) {
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  const filled = getFilledIndices(side);
  if (filled.length === 0) {
    state[activeKey] = [];
    return;
  }
  let current = state[activeKey].filter(idx => filled.includes(idx));
  for (const idx of filled) {
    if (current.length >= 2) break;
    if (!current.includes(idx)) current.push(idx);
  }
  state[activeKey] = current;
}

export function getFocusedIndices(side) {
  if (!isBattleFocusActive()) return getFilledIndices(side);
  normalizeActiveSlots(side);
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  return state[activeKey];
}

export function getFocusedTeam(side) {
  const indices = getFocusedIndices(side);
  return indices.map(i => state[side][i]).filter(Boolean);
}

export function setBattleFocus(focus) {
  state.battleFocus = focus;
  if (LIVE.matchupStrip) LIVE.matchupStrip.style.display = focus === "active" ? "flex" : "none";
  if (LIVE.battleToolbar) LIVE.battleToolbar.style.display = focus === "active" ? "flex" : "none";
  renderAll();
}

export function setActiveBattleSlot(side, activePosition, newTeamIndex) {
  const activeKey = side === "self" ? "activeSelfSlots" : "activeEnemySlots";
  const current = [...state[activeKey]];
  
  if (current.includes(newTeamIndex)) {
    const otherPos = current.indexOf(newTeamIndex);
    current[otherPos] = current[activePosition];
  }
  current[activePosition] = newTeamIndex;
  state[activeKey] = current;
  closeBattleSheet();
  recalculateActiveField();
  renderAll();
}

function getTacticalCellClass(cell) {
  if (cell.ohko || cell.ohkoProb >= 50) return "ko-probable";
  if (cell.mult >= 2) return "pressure-high";
  if (cell.mult >= 1) return "pressure-medium";
  if (cell.mult === 0 || cell.mult <= 0.25) return "bad-entry";
  if (cell.mult <= 0.5) return "safe-switch";
  return "";
}

window.matrixCellClassOverride = function(cell) {
  if (typeof isBattleFocusActive === 'function' && isBattleFocusActive()) {
    const tac = getTacticalCellClass(cell);
    if (tac) return "cell--" + tac;
  }
  return null;
};

export function renderActiveMatchupStrip() {
  if (!isBattleFocusActive()) return;
  normalizeActiveSlots("self");
  normalizeActiveSlots("enemy");
  
  const renderSlotBtn = (side, pos, idx) => {
    const mon = idx !== undefined && idx !== null ? state[side][idx] : null;
    const btn = side === "self"
      ? (pos === 0 ? LIVE.selfSlotA : LIVE.selfSlotB)
      : (pos === 0 ? LIVE.enemySlotA : LIVE.enemySlotB);
    if (!btn) return;
    if (mon) {
      btn.innerHTML = `<img src="${mon.sprite}" alt="${mon.displayName}">`;
      btn.className = `active-slot-btn active-slot-btn--${side}`;
      btn.onclick = () => openBattleSheet({ side, activePosition: pos, isSelector: true });
    } else {
      btn.innerHTML = `<i data-lucide="plus" style="color:var(--muted);width:20px;height:20px;"></i>`;
      btn.className = `active-slot-btn empty`;
    }
        btn.onclick = () => openBattleSheet({ side, activePosition: pos, isSelector: true });
  };

  renderSlotBtn("self", 0, state.activeSelfSlots[0]);
  renderSlotBtn("self", 1, state.activeSelfSlots[1]);
  renderSlotBtn("enemy", 0, state.activeEnemySlots[0]);
  renderSlotBtn("enemy", 1, state.activeEnemySlots[1]);
  updateIcons();
}

export function renderLiveBattleToolbar() {
  if (!isBattleFocusActive()) return;
  const selfMons = getFocusedTeam("self");
  const enemyMons = getFocusedTeam("enemy");
  
  let threats = 0;
  let kills = 0;
  let safes = 0;
  
  for (const e of enemyMons) {
    let threatensMe = false;
    let safeSwitchForMe = true;
    for (const s of selfMons) {
      const eAtk = bestAttack(e, s);
      if (eAtk.mult >= 2 || eAtk.ohko) threatensMe = true;
      if (eAtk.mult >= 1) safeSwitchForMe = false;
      
      const sAtk = bestAttack(s, e);
      if (sAtk.ohko || sAtk.ohkoProb >= 80) kills++;
    }
    if (threatensMe) threats++;
    if (safeSwitchForMe) safes++;
  }
  
  if (LIVE.urgencyThreats) LIVE.urgencyThreats.innerHTML = `<i data-lucide="alert-circle" style="width:12px;height:12px;"></i> ${threats} Amenazas`;
  if (LIVE.urgencyKills) LIVE.urgencyKills.innerHTML = `<i data-lucide="crosshair" style="width:12px;height:12px;"></i> ${kills} KOs`;
  if (LIVE.urgencySafeSwitches) LIVE.urgencySafeSwitches.innerHTML = `<i data-lucide="shield-check" style="width:12px;height:12px;"></i> ${safes} Seguros`;
}

export function openBattleSheet(payload) {
  state.battleSheet = { open: true, ...payload };
  renderBattleSheet();
  if (LIVE.sheetOverlay) LIVE.sheetOverlay.style.display = "block";
  if (LIVE.sheetModal) LIVE.sheetModal.classList.add("open");
}

export function closeBattleSheet() {
  state.battleSheet.open = false;
  if (LIVE.sheetOverlay) LIVE.sheetOverlay.style.display = "none";
  if (LIVE.sheetModal) LIVE.sheetModal.classList.remove("open");
  
  state.selectedMatrixCell = null;
  document.querySelectorAll(".cell--selected").forEach(el => el.classList.remove("cell--selected"));
  document.querySelectorAll(".matrix-row-selected").forEach(el => el.classList.remove("matrix-row-selected"));
  document.querySelectorAll(".matrix-col-selected").forEach(el => el.classList.remove("matrix-col-selected"));
}

export function getTacticalReasons(data) {
   const reasons = [];
   if (data.blocked) reasons.push("Prioridad anulada por campo o inmunidad.");
   if (data.rawMult === 0 && !data.blocked) reasons.push("Inmunidad total por tipos o habilidad.");
   if (data.rawMult > 1) reasons.push(`Golpe muy eficaz (x${data.rawMult}).`);
   if (data.rawMult < 1 && data.rawMult > 0) reasons.push(`Golpe poco eficaz (x${data.rawMult}).`);
   if (data.wMul > 1) reasons.push("Daño potenciado por el clima activo.");
   if (data.wMul < 1) reasons.push("Daño reducido por el clima activo.");
   if (data.terrMul > 1) reasons.push("Daño potenciado por el terreno activo.");
   if (data.terrMul < 1) reasons.push("Daño reducido por el terreno activo.");
   if (data.maxPct < 35 && !data.blocked && data.mult > 0) reasons.push("El daño base estimado es muy bajo.");
   if (data.ohkoProb > 0) reasons.push(`Alta amenaza de KO directo (${data.ohkoProb}%).`);
   if (!reasons.length) reasons.push("Cruce neutral. Sin modificadores especiales.");
   return reasons;
}

export function getTacticalMeaning(data) {
  const mult = data.mult ?? data.rawMult ?? 1;
  const attacker = data.attacker;
  const moves = attacker?.set?.moves ?? [];
  
  const hasFakeOut = moves.some(m => String(m).toLowerCase().includes('fake out') || String(m).toLowerCase().includes('sorpresa'));
  const hasProtect = moves.some(m => ['protect','detect','protección','detección'].includes(String(m).toLowerCase()));
  
  if (mult === 0 || data.blocked) return 'Inmune o bloqueado. Considera cambiar de objetivo o usar un ataque neutro.';
  if (mult >= 4 || (data.ohkoProb >= 80)) return '¡KO casi garantizado! Presiona sin dudar este turno.';
  if (mult >= 2) return 'Ventaja clara. Entra o ataca con confianza.';
  if (mult <= 0.5) return 'Desventaja. Considera cambio seguro o usar soporte.';
  if (hasFakeOut) return 'Fake Out disponible. Paraliza primero, luego decide.';
  if (hasProtect) return 'Protect disponible. Scouting o stall si hay duda.';
  return 'Cruce neutral. Evalúa velocidad y prioridad antes de comprometerte.';
}

function getActiveEnemyLeads(targetEnemyName) {
    const activeIndices = quickMode.getTurn1ResolvedLeadIndices("enemy");
    let enemies = activeIndices.map(i => state.enemy[i]).filter(Boolean);
    
    const hasEnemy = enemies.some(e => e.name === targetEnemyName);
    if (!hasEnemy) {
        const specificEnemy = state.enemy.find(e => e && e.name === targetEnemyName);
        if (specificEnemy) {
            enemies = [specificEnemy, enemies.length > 0 ? enemies[0] : null].filter(Boolean);
        }
    }
    return enemies;
}

function classifyReserve(candidate, activeEnemies) {
    let worstPct = 0;
    let worstMult = 0;
    let ohkoRisk = false;

    for (const enemy of activeEnemies) {
        if (!enemy) continue;
        const atk = bestAttack(enemy, candidate); 
        if (atk.maxPct > worstPct) worstPct = atk.maxPct;
        if (atk.mult > worstMult) worstMult = atk.mult;
        if (atk.ohkoProb > 0) ohkoRisk = true;
    }

    let category = "unsafe";
    let reason = "Recibe demasiado daño al entrar.";

    if (!ohkoRisk && worstPct <= 35 && worstMult <= 0.5) {
        category = "safe";
        reason = "Absorbe bien la presión de los rivales en mesa.";
    } else if (!ohkoRisk && worstPct <= 55 && worstMult <= 1) {
        category = "pivot";
        reason = "Aguanta el golpe para facilitar un reposicionamiento.";
    } else if (ohkoRisk) {
        category = "unsafe";
        reason = "Se expone a un OHKO directo si entra ahora.";
    } else {
        category = "unsafe";
        reason = "Desventaja letal. El daño recibido no compensa.";
    }

    return { candidate, category, reason, worstPct, worstMult };
}

export function getSuggestedReserves(data) {
    const selfTeam = state.self.filter(Boolean);
    if (!selfTeam.length) return [];

    const activeSelfIndices = quickMode.getTurn1ResolvedLeadIndices("self");
    const activeSelfNames = activeSelfIndices.map(i => state.self[i]?.name).filter(Boolean);
    
    const currentSelfName = data.offensive ? data.attacker : data.defender;
    if (!activeSelfNames.includes(currentSelfName)) activeSelfNames.push(currentSelfName);

    const bench = selfTeam.filter(m => !activeSelfNames.includes(m.name));
    if (!bench.length) return [];

    const targetEnemyName = data.offensive ? data.defender : data.attacker;
    const activeEnemies = getActiveEnemyLeads(targetEnemyName);

    const evaluated = bench.map(cand => classifyReserve(cand, activeEnemies));
    
    evaluated.sort((a, b) => {
       const catScore = { "safe": 1, "pivot": 2, "unsafe": 3 };
       if (catScore[a.category] !== catScore[b.category]) return catScore[a.category] - catScore[b.category];
       return a.worstPct - b.worstPct;
    });

    return evaluated.slice(0, 3);
}

export function renderBattleSheet() {
  const body = LIVE.sheetBody;
  const title = LIVE.sheetTitle;
  const { side, activePosition, isSelector, cell } = state.battleSheet;

  if (isSelector) {
    title.textContent = "Elegir Activo";
    const team = state[side];
    const filledIndices = getFilledIndices(side);
    const currentActive = side === "self" ? state.activeSelfSlots : state.activeEnemySlots;
    
    body.innerHTML = `
      <div class="sheet-tactical-label">Reservas Disponibles</div>
      <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:8px;">
        ${filledIndices.map(idx => {
          const mon = team[idx];
          const isAct = currentActive.includes(idx);
          return `
            <div class="sheet-squad-btn ${isAct ? "active" : ""}" onclick="setActiveBattleSlot('${side}', ${activePosition}, ${idx})" style="position:relative;">
              ${isAct ? `<span style="position:absolute; top:-4px; right:-4px; background:var(--blue); color:#fff; border-radius:50%; width:16px; height:16px; font-size:10px; display:grid; place-items:center;"><i data-lucide="check" style="width:10px;height:10px;"></i></span>` : ""}
              <img src="${mon.sprite}" alt="${mon.displayName}">
            </div>
          `;
        }).join("")}
      </div>
    `;
    updateIcons();
    return;
  }

  if (cell) {
    title.textContent = "Lectura Táctica";
    const data = JSON.parse(decodeURIComponent(cell.dataset.tooltip));
    const attackerObj = data.attacker || {};
    const defenderObj = data.defender || {};
    
    const attackerName = attackerObj.displayName ?? attackerObj.name ?? data.attackerName ?? 'Atacante';
    const defenderName = defenderObj.displayName ?? defenderObj.name ?? data.defenderName ?? 'Defensor';
    const attackerSprite = attackerObj.sprite ?? '';
    const defenderSprite = defenderObj.sprite ?? '';
    
    const attackerTypes = attackerObj.types?.map(t => typeChip(t)).join('') ?? '';
    const defenderTypes = defenderObj.types?.map(t => typeChip(t)).join('') ?? '';
    
    const moveName = data.moveName ?? data.move ?? 'Desconocido';
    const moveType = data.moveType ?? data.type ?? 'normal';
    const minPct = data.minPct ?? 0;
    const maxPct = data.maxPct ?? 0;
    const mult = data.mult ?? data.rawMult ?? null;
    const multStr = mult !== null ? fmtMult(mult) : '';
    
    const reserves = getSuggestedReserves(data);
    const reasons = getTacticalReasons(data);
    const meaning = getTacticalMeaning(data);
    const effBadgeHtml = getEffectivenessBadgeHtml(mult !== null ? mult : 1);
    const sheetKoConditions = data.koConditions?.length
      ? { tags: data.koConditions, visible: data.koConditions.slice(0, 3), hiddenCount: Math.max(0, data.koConditions.length - 3) }
      : evaluateKoConditions(attackerObj, defenderObj, {
          ...data,
          move: moveName,
          type: moveType,
          minPct,
          maxPct,
          ohkoProb: data.ohkoProb || 0,
        }, {
          field: state.field,
          attackerSide: data.offensive ? 'self' : 'enemy',
          defenderSide: data.offensive ? 'enemy' : 'self',
          maxVisible: 3,
        });
    const sheetKoChipsHtml = renderKoConditionChips(sheetKoConditions);

    body.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:8px;">
          ${attackerSprite ? `<img src="${attackerSprite}" class="sprite-sm" alt="${attackerName}" style="width:40px;height:40px;object-fit:contain;border-radius:50%;background:rgba(0,0,0,0.3);">` : ''}
          <div>
            <div style="font-size:1.1rem; font-weight:900;">${attackerName}</div>
            <div style="display:flex; gap:4px; margin-top:4px;">${attackerTypes}</div>
          </div>
        </div>
        <i data-lucide="arrow-right" style="color:var(--muted); font-size:1.2rem;"></i>
        <div style="display:flex; align-items:center; gap:8px;">
          ${defenderSprite ? `<img src="${defenderSprite}" class="sprite-sm" alt="${defenderName}" style="width:40px;height:40px;object-fit:contain;border-radius:50%;background:rgba(0,0,0,0.3);">` : ''}
          <div>
            <div style="font-size:1.1rem; font-weight:900;">${defenderName}</div>
            <div style="display:flex; gap:4px; margin-top:4px;">${defenderTypes}</div>
          </div>
        </div>
      </div>
      
      <div class="sheet-tactical-block" style="margin-top: 16px;">
         <div class="sheet-tactical-label">Mejor Opción Estimada</div>
         <div class="sheet-tactical-val" style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
           ${typeDot(moveType)} <span style="font-size:1rem; font-weight:700;">${moveName}</span>
         </div>
         ${sheetKoChipsHtml}
         <div style="display:flex; align-items:center; gap:12px; font-size:0.8rem; color:var(--muted);">
            <span>Daño: <strong style="color:#fff;">${minPct}% - ${maxPct}%</strong></span>
            ${effBadgeHtml}
            ${data.ohkoProb > 0 ? `<span>Riesgo OHKO: <strong style="color:var(--red);">${data.ohkoProb}%</strong></span>` : ''}
         </div>
      </div>

      <div class="sheet-tactical-block">
         <div class="sheet-tactical-label">Por qué pasa</div>
         <ul class="sheet-reasons-list">
            ${reasons.map(r => `<li><i data-lucide="info"></i> ${r}</li>`).join('')}
         </ul>
      </div>

      <div class="sheet-tactical-block">
         <div class="sheet-tactical-label">Qué significa en mesa</div>
         <div class="sheet-tactical-meaning">${meaning}</div>
      </div>

      <div class="sheet-tactical-block">
         <div class="sheet-tactical-label">Banca Sugerida (Evaluada vs Rival Activo)</div>
         ${reserves.length > 0 ? `
           <div class="sheet-reserves-list">
             ${reserves.map(r => `
               <div class="sheet-reserve-item ${r.category === 'unsafe' ? 'sheet-reserve-item--unsafe' : ''}">
                 <img src="${r.candidate.sprite}" alt="${r.candidate.displayName}">
                 <div class="sheet-reserve-info">
                   <strong>${r.candidate.displayName} <span class="tag-pill ${r.category === 'safe' ? 'tag-pill--success' : r.category === 'pivot' ? 'tag-pill--warning' : 'tag-pill--danger'}">${r.category === 'safe' ? 'Seguro' : r.category === 'pivot' ? 'Pivot' : 'Riesgo'}</span></strong>
                   <span>${r.reason}</span>
                 </div>
               </div>
             `).join('')}
           </div>
         ` : `<div class="muted-small">No tienes banca segura o disponible.</div>`}
      </div>

      ${data.debug ? `
      <div class="sheet-tactical-block" style="border: 1px dashed var(--gold); padding: 8px; background: rgba(255,215,0,0.05); margin-top:12px; border-radius:8px;">
         <div class="sheet-tactical-label" style="color: var(--gold);"><i data-lucide="bug" style="width:14px;height:14px;"></i> Debug Data</div>
         <ul class="sheet-reasons-list" style="font-family: monospace; font-size: 0.75rem; color: var(--gold); margin-top:4px;">
            <li>rawMult: ${data.debug.rawMult}</li>
            <li>wMul: ${data.debug.wMul}</li>
            <li>terrMul: ${data.debug.terrMul}</li>
            ${(data.debug.registryExplain || []).map(r => `<li>${r}</li>`).join('')}
         </ul>
      </div>
      ` : ''}
    `;
    updateIcons();
    return;
  }
}


/**
 * @typedef {Object} Action
 * @property {'move'|'switch'} kind
 * @property {'self'|'enemy'} side
 * @property {number} userIndex  índice en state[side]
 * @property {string} [moveName]
 * @property {('ally'|'foes'|'self'|number)} [target]  slot objetivo
 * @property {number} [switchInIndex] índice de bench al que se hace switch
 */


// =========================================================================
// 7. LIVE MATCH SIMULATOR (VGC MODE)
// =========================================================================

export function getCandidateActions(state, side) {
  if (DEBUG_MODE) console.groupCollapsed('🧠 [AI_THINKING] Generando acciones para', side);
  const team = state[side];
  const enemyTeam = state[side === 'self' ? 'enemy' : 'self'];
  const activeSlots = side === 'self' ? state.activeSelfSlots : state.activeEnemySlots;

  const actions = [];

  for (const userIndex of activeSlots) {
    const mon = team[userIndex];
    if (!mon) continue;

    const moves = mon.set?.moves || [];
    // 1) Mejor ataque ofensivo al target más amenazante
    let bestOffense = null;
    let bestOffenseTarget = null;
    for (let i = 0; i < enemyTeam.length; i++) {
      const enemy = enemyTeam[i];
      if (!enemy) continue;
      const best = bestAttack(mon, enemy);
      if (!bestOffense || best.damage > bestOffense.damage) {
        bestOffense = best;
        bestOffenseTarget = i;
      }
    }
    if (bestOffense && bestOffenseTarget !== null) {
      actions.push({
        kind: 'move',
        side,
        userIndex,
        moveName: bestOffense.move,
        target: bestOffenseTarget,
      });
    }

    // 2) Movimiento de soporte “estrella”
    const supportPriority = ['Trick Room', 'Tailwind', 'Follow Me', 'Rage Powder', 'Protect', 'Detect', 'Fake Out'];
    const supportPick = supportPriority.find((name) => moves.includes(name));
    if (supportPick) {
      actions.push({
        kind: 'move',
        side,
        userIndex,
        moveName: supportPick,
        target: 'foes',
      });
    }

    // 3) Mejor cambio defensivo (bench más seguro)
    const benchIndices = team
      .map((m, idx) => (m && !activeSlots.includes(idx) ? idx : null))
      .filter((x) => x !== null);

    if (benchIndices.length) {
      let bestBench = null;
      let bestBenchScore = -Infinity;
      for (const benchIdx of benchIndices) {
        const candidate = team[benchIdx];
        let worstThreat = 0;
        for (const enemy of enemyTeam) {
          if (!enemy) continue;
          const atk = bestAttack(enemy, candidate);
          worstThreat = Math.max(worstThreat, atk.maxPct || atk.damage || 0);
        }
        const score = -worstThreat; // queremos minimizar daño
        if (score > bestBenchScore) {
          bestBenchScore = score;
          bestBench = benchIdx;
        }
      }
      if (bestBench !== null) {
        actions.push({
          kind: 'switch',
          side,
          userIndex,
          switchInIndex: bestBench,
        });
      }
    }
  }

  if (DEBUG_MODE) {
      console.table(actions.map(a => ({
          Tipo: a.kind, 
          Usuario: state[side][a.userIndex]?.name, 
          Movimiento_o_Cambio: a.moveName || state[side][a.switchInIndex]?.name,
          Target: a.target
      })));
      console.groupEnd();
  }

  return actions;
}

export function simulateTurn(state, actionsSelf, actionsEnemy) {
  if (DEBUG_MODE) console.groupCollapsed('🎬 [SIM_TURN] Resolviendo turno');
  // Clonar estado para no mutar directamente si quieres analizar "what-if"
  const nextState = cloneSimulationState(state);

  const all = [...actionsSelf, ...actionsEnemy];

  // Asignar prioridad base y velocidad para ordenar
  const withOrder = all.map((a) => {
    const team = nextState[a.side];
    const mon = team[a.userIndex];
    if (!mon) {
      return { action: a, prio: -Infinity, spe: -Infinity };
    }

    let prio = 0;
    if (a.kind === 'move' && a.moveName) {
      prio = getPriority(a.moveName, mon);
    }
    const sideKey = a.side;
    const spe = calculateSpeed(mon, sideKey); // ya usa TR y registry

    return { action: a, prio, spe };
  });

  withOrder.sort((a, b) => {
    if (b.prio !== a.prio) return b.prio - a.prio;
    return b.spe - a.spe;
  });

  if (DEBUG_MODE) {
      console.log('⚡ [ACTION_SORT] Orden de resolución:');
      withOrder.forEach((item, i) => {
          const monName = nextState[item.action.side][item.action.userIndex]?.name;
          console.log(`  ${i+1}. ${monName} | Acción: ${item.action.kind} | Prio: ${item.prio} | Spe: ${item.spe}`);
      });
  }

  const log = [];

  // Helpers para aplicar daño
  const applyDamage = (side, index, dmg) => {
    const team = nextState[side];
    const mon = team[index];
    if (!mon) return;
    ensureBattleState(mon);
    const baseHP = calcMonHP(mon);
    const currentHP = Math.max(1, Math.floor((baseHP * (mon.battle.hpPct ?? 100)) / 100));
    const newHP = Math.max(0, currentHP - dmg);
    mon.battle.hpPct = Math.max(0, Math.floor((newHP / baseHP) * 100));
    if (mon.battle.hpPct <= 0) {
      mon.fainted = true;
      if (DEBUG_MODE) console.log(`💀 [SIM_FAINT] ${mon.name} ha caído debilitado.`);
    }
  };

  for (const { action } of withOrder) {
    const team = nextState[action.side];
    const enemySide = action.side === 'self' ? 'enemy' : 'self';
    const enemyTeam = nextState[enemySide];

    const mon = team[action.userIndex];
    if (!mon || mon.fainted) continue;

    if (action.kind === 'switch') {
      const inMon = team[action.switchInIndex];
      if (!inMon || inMon.fainted) continue;

      // swap en el slot
      const tmp = team[action.userIndex];
      team[action.userIndex] = inMon;
      team[action.switchInIndex] = tmp;

      ensureBattleState(team[action.userIndex]);
      applySwitchInEffects(team[action.userIndex], action.side); // ya actualiza campo
      if (DEBUG_MODE) console.log(`🔄 [SIM_SWITCH] ${team[action.switchInIndex].name} sale, entra ${inMon.name} (Lado: ${action.side})`);
      log.push({
        type: 'switch',
        side: action.side,
        outIndex: action.switchInIndex,
        inIndex: action.userIndex,
      });
      continue;
    }

    if (action.kind === 'move' && action.moveName) {
      ensureMoveRegistry(action.moveName); // de Fase 3, para efectos de campo
      ensureAbilityRegistry(mon.set?.ability);
      ensureItemRegistry(mon.set?.item);

      const moveName = action.moveName;
      const actionBlockReason = getActionBlockReason(mon, moveName);
      if (actionBlockReason) {
        log.push({
          type: 'blocked',
          side: action.side,
          fromIndex: action.userIndex,
          move: moveName,
          reason: actionBlockReason,
        });
        continue;
      }
      if (isProtectMove(moveName)) {
        ensureBattleState(mon);
        mon.battle.protected = true;
        mon.battle.protectedBy = formatName(getTranslation(moveName, 'move') || moveName);
        log.push({
          type: 'protect',
          side: action.side,
          fromIndex: action.userIndex,
          move: moveName,
        });
      }
      let targets = [];

      if (typeof action.target === 'number') {
        targets = [{ side: enemySide, index: action.target }];
      } else if (action.target === 'foes') {
        targets = enemyTeam
          .map((em, idx) => (em && !em.fainted ? { side: enemySide, index: idx } : null))
          .filter(Boolean);
      } else if (action.target === 'ally') {
        const allySlots = action.side === 'self' ? nextState.activeSelfSlots : nextState.activeEnemySlots;
        targets = allySlots
          .map((idx) => (idx !== action.userIndex && team[idx] ? { side: action.side, index: idx } : null))
          .filter(Boolean);
      }

      for (const t of targets) {
        const atkMon = mon;
        const defMon = nextState[t.side][t.index];
        if (!defMon || defMon.fainted) continue;

        const info = state.moveTypeCache[moveName] || {};
        const moveCandidate = {
          move: moveName,
          type: info.type || 'normal',
          power: info.power || 0,
          damageClass: info.damageClass || 'physical',
          hits: info.hits || GUARANTEED_MULTI_HITS[moveName] || 1,
          isSpread: info.isSpread || isCanonicalSpreadMove(moveName) || SPREAD_MOVES.has(moveName) || false,
          priority: getPriority(moveName, atkMon)
        };

        const { damage, blocked } = estimateMoveDamage(atkMon, defMon, moveCandidate, nextState.field);

        if (!blocked && damage > 0) {
          applyDamage(t.side, t.index, damage);
          if (DEBUG_MODE) {
              console.log(`💥 [SIM_HIT] ${atkMon.name} usa ${moveName} contra ${defMon.name} -> Daño: ${damage} HP | HP restante: ${nextState[t.side][t.index].battle.hpPct}%`);
          }
          log.push({
            type: 'hit',
            side: action.side,
            fromIndex: action.userIndex,
            toSide: t.side,
            toIndex: t.index,
            move: moveName,
            damage,
          });
        } else if (blocked) {
          log.push({
            type: 'blocked',
            side: action.side,
            fromIndex: action.userIndex,
            toSide: t.side,
            toIndex: t.index,
            move: moveName,
          });
        }
        if (!blocked && !defMon.fainted) {
          const sideEffectText = applyManualMoveSideEffects(atkMon, defMon, moveName, t.side);
          if (sideEffectText) {
            log.push({
              type: 'sideEffect',
              side: action.side,
              fromIndex: action.userIndex,
              toSide: t.side,
              toIndex: t.index,
              move: moveName,
              text: sideEffectText,
            });
          }
        }
      }

      // Aplicar efectos secundarios de campo tras resolución
      if (typeof applyMoveResolutionEffects === 'function') {
        applyMoveResolutionEffects(mon, { name: moveName });
      }

      continue;
    }
  }

  // Final de turno: decrementar duraciones
  if (typeof tickField === 'function') {
    tickField(nextState);
  }
  nextState.self.forEach(advanceMonTurnState);
  nextState.enemy.forEach(advanceMonTurnState);

  if (DEBUG_MODE) console.groupEnd();
  return { nextState, log };
}

export function scoreBoard(state, side) {
  const self = state[side];
  const enemy = state[side === 'self' ? 'enemy' : 'self'];

  let selfScore = 0;
  let enemyScore = 0;

  for (const mon of self) {
    if (!mon) continue;
    ensureBattleState(mon);
    const baseHP = calcMonHP(mon);
    const hpWeight = (mon.battle.hpPct ?? 100) / 100;
    selfScore += baseHP * hpWeight;
  }

  for (const mon of enemy) {
    if (!mon) continue;
    ensureBattleState(mon);
    const baseHP = calcMonHP(mon);
    const hpWeight = (mon.battle.hpPct ?? 100) / 100;
    enemyScore += baseHP * hpWeight;
  }

  // Lógica simple de amenaza actual
  let threatPenalty = 0;
  if (state.matrixMode === 'defensive') {
    // Si matrixMode no es accesible directo sin getRows, se podría calcular un aproximado
    for (const enemyMon of enemy) {
      if (!enemyMon) continue;
      for (const selfMon of self) {
        if (!selfMon) continue;
        const atk = bestAttack(enemyMon, selfMon);
        if (atk.mult >= 2 && (atk.maxPct || 0) >= 50) threatPenalty += 50;
      }
    }
  }

  // Bonus si TR activo y tienes abusers vivos
  let tempoBonus = 0;
  if (state.field && state.field.trickRoom) {
    const slowAbusers = self.filter((m) => m && calculateSpeed(m, side) < 0);
    tempoBonus += slowAbusers.length * 500;
  }

  return selfScore - enemyScore - threatPenalty + tempoBonus;
}

export function suggestBestAction(state, side) {
  const actionsSelf = getCandidateActions(state, side);
  const actionsEnemy = getCandidateActions(state, side === 'self' ? 'enemy' : 'self');

  if (!actionsSelf.length) return [];

  const evaluatedActions = [];
  
  if (DEBUG_MODE) console.groupCollapsed('⚖️ [AI_THINKING] Evaluando escenarios (Minimax) para', side);

  for (const aSelf of actionsSelf) {
    // Supón que el rival elige una de sus acciones; usa un criterio simple
    let worstOutcome = Infinity;

    for (const aEnemy of actionsEnemy.length ? actionsEnemy : [{ kind: 'none' }]) {
      const { nextState } = simulateTurn(state, [aSelf], aEnemy.kind === 'none' ? [] : [aEnemy]);
      const score = scoreBoard(nextState, side);
      // Queremos ser conservadores: peor caso
      if (score < worstOutcome) worstOutcome = score;
    }

    if (DEBUG_MODE) console.log(`Evaluando acción: ${aSelf.moveName || 'Switch a ' + aSelf.switchInIndex} -> Peor escenario (Score): ${worstOutcome}`);
    evaluatedActions.push({ action: aSelf, score: worstOutcome });
  }

  evaluatedActions.sort((a, b) => b.score - a.score);
  const top3 = evaluatedActions.slice(0, 3);
  
  if (DEBUG_MODE) {
      console.log('🏆 Top 3 decisiones:', top3.map(e => `${e.action.moveName || 'Switch ' + e.action.switchInIndex} (${e.score})`));
      console.groupEnd();
  }
  
  return top3;
}

export function renderLiveRecommendations() {
  if (state.uiMode !== 'live') return;

  const suggestion = suggestBestAction(state, 'self');
  const mount = LIVE.recommendations;
  if (!mount) return;

  if (!suggestion || !suggestion.action) {
    mount.innerHTML = '<div class="muted-small">Sin recomendación clara.</div>';
    return;
  }

  const a = suggestion.action;
  const team = state.self;
  const mon = team[a.userIndex];
  
  if (!mon) return;

  let text = '';

  if (a.kind === 'move' && a.moveName === 'Protect') {
    // Busca partner con Trick Room
    const allyIdx = state.activeSelfSlots.find((i) => i !== a.userIndex);
    const ally = state.self[allyIdx];
    const hasTR = ally?.set?.moves?.includes('Trick Room');
    if (hasTR) {
      text = `Turno actual: proteger a ${mon.displayName} mientras ${ally.displayName} activa Trick Room. Al siguiente turno tendrás prioridad de velocidad con tus sweepers lentos.`;
    } else {
      text = `Proteger a ${mon.displayName} este turno reduce el riesgo de perderlo ante la presión rival.`;
    }
  } else if (a.kind === 'move') {
    text = `Recomendación: atacar con ${mon.displayName} usando ${a.moveName}.`;
  } else if (a.kind === 'switch') {
    const inMon = state.self[a.switchInIndex];
    text = `Recomendación: cambiar a ${mon.displayName} por ${inMon ? inMon.displayName : 'otro'} para mejorar el cruce defensivo.`;
  }

  mount.innerHTML = `<p>${text}</p>`;
}

export function renderLiveStatePanel() {
  const panel = LIVE.statePanel;
  const selfMount = LIVE.stateSelfSlots;
  const enemyMount = LIVE.stateEnemySlots;
  const fieldMount = LIVE.fieldControls;

  if (!panel || !selfMount || !enemyMount || !fieldMount) return;

  const isLive = state.uiMode === 'live';
  panel.style.display = isLive ? 'block' : 'none';
  if (!isLive) return;

  const renderMonControls = (mon, side, idx) => {
    if (!mon) {
      return `
        <div class="live-slot-card live-slot-card--empty">
          <div class="live-slot-title">Slot ${idx + 1}</div>
          <div class="muted-small">Vacío</div>
        </div>
      `;
    }

    ensureBattleState(mon);

    const b = mon.battle;
    const hp = b.hpPct ?? 100;
    const stages = b.stages || {};
    const status = b.status || '';

    const stageSelect = (statKey, label) => {
      const val = stages[statKey] ?? 0;
      const options = [];
      for (let s = -6; s <= 6; s++) {
        options.push(
          `<option value="${s}" ${s === val ? 'selected' : ''}>${s > 0 ? '+' + s : s}</option>`
        );
      }
      return `
        <label class="live-stat-stage">
          <span>${label}</span>
          <select
            data-live="stage"
            data-side="${side}"
            data-index="${idx}"
            data-stat="${statKey}"
          >
            ${options.join('')}
          </select>
        </label>
      `;
    };

    return `
      <div class="live-slot-card">
        <div class="live-slot-title">
          <img src="${mon.sprite}" alt="${mon.displayName}" class="sprite-micro" />
          <span>${mon.displayName}</span>
        </div>

        <label class="live-hp-control">
          <span>HP %</span>
          <input
            type="number"
            min="1"
            max="100"
            value="${hp}"
            data-live="hp"
            data-side="${side}"
            data-index="${idx}"
          />
        </label>

        <div class="live-stages-row">
          ${stageSelect('atk', 'Atk')}
          ${stageSelect('def', 'Def')}
          ${stageSelect('spa', 'SpA')}
          ${stageSelect('spd', 'SpD')}
          ${stageSelect('spe', 'Spe')}
        </div>

        <label class="live-status-control">
          <span>Estado</span>
          <select
            data-live="status"
            data-side="${side}"
            data-index="${idx}"
          >
            <option value="" ${status === '' ? 'selected' : ''}>Ninguno</option>
            <option value="brn" ${status === 'brn' ? 'selected' : ''}>Quemado</option>
            <option value="par" ${status === 'par' ? 'selected' : ''}>Parálisis</option>
            <option value="slp" ${status === 'slp' ? 'selected' : ''}>Sueño</option>
            <option value="psn" ${status === 'psn' ? 'selected' : ''}>Veneno</option>
            <option value="tox" ${status === 'tox' ? 'selected' : ''}>Tóxico</option>
            <option value="frz" ${status === 'frz' ? 'selected' : ''}>Congelado</option>
          </select>
        </label>
      </div>
    `;
  };

  selfMount.innerHTML = state.self
    .map((mon, idx) => renderMonControls(mon, 'self', idx))
    .join('');

  enemyMount.innerHTML = state.enemy
    .map((mon, idx) => renderMonControls(mon, 'enemy', idx))
    .join('');

  const f = state.field;

  fieldMount.innerHTML = `
    <div class="live-field-row">
      <label>
        <span>Clima</span>
        <select data-live="field-weather">
          <option value="" ${!f.weather ? 'selected' : ''}>Ninguno</option>
          <option value="sun" ${f.weather === 'sun' ? 'selected' : ''}>Sol</option>
          <option value="rain" ${f.weather === 'rain' ? 'selected' : ''}>Lluvia</option>
          <option value="sand" ${f.weather === 'sand' ? 'selected' : ''}>Arena</option>
          <option value="snow" ${f.weather === 'snow' ? 'selected' : ''}>Nieve</option>
        </select>
      </label>
      <label>
        <span>Turnos clima</span>
        <input type="number" min="0" max="8"
          value="${f.weatherTurns || 0}"
          data-live="field-weatherTurns"
        />
      </label>
    </div>

    <div class="live-field-row">
      <label>
        <span>Terreno</span>
        <select data-live="field-terrain">
          <option value="" ${!f.terrain ? 'selected' : ''}>Ninguno</option>
          <option value="electric" ${f.terrain === 'electric' ? 'selected' : ''}>Eléctrico</option>
          <option value="grassy" ${f.terrain === 'grassy' ? 'selected' : ''}>Hierba</option>
          <option value="psychic" ${f.terrain === 'psychic' ? 'selected' : ''}>Psíquico</option>
          <option value="misty" ${f.terrain === 'misty' ? 'selected' : ''}>Niebla</option>
        </select>
      </label>
      <label>
        <span>Turnos terreno</span>
        <input type="number" min="0" max="8"
          value="${f.terrainTurns || 0}"
          data-live="field-terrainTurns"
        />
      </label>
    </div>

    <div class="live-field-row">
      <label>
        <input type="checkbox" data-live="field-trickRoom" ${f.trickRoom ? 'checked' : ''} />
        Trick Room (${f.trickRoomTurns || 0} turnos)
      </label>
    </div>

    <div class="live-field-row">
      <label>
        <input type="checkbox" data-live="field-tailwindSelf" ${f.tailwindSelf ? 'checked' : ''} />
        Tailwind (self) (${f.tailwindSelfTurns || 0})
      </label>
      <label>
        <input type="checkbox" data-live="field-tailwindEnemy" ${f.tailwindEnemy ? 'checked' : ''} />
        Tailwind (enemy) (${f.tailwindEnemyTurns || 0})
      </label>
    </div>
  `;

  attachLiveStateListeners();
}

export function attachLiveStateListeners() {
  const root = LIVE.statePanel;
  if (!root) return;

  const updateLive = () => {
    window.currentDamageCache = {};
    if (typeof renderLiveStatePanel === 'function') renderLiveStatePanel();
    if (typeof renderLiveRecommendations === 'function') renderLiveRecommendations();
    const rows = getRows();
    renderMatrix(rows);
    renderLiveBattleToolbar();
    updateIcons();
  };

  root.querySelectorAll('[data-live]').forEach((el) => {
    const kind = el.getAttribute('data-live');

    if (kind === 'hp') {
      el.onchange = (e) => {
        const side = el.dataset.side;
        const idx = Number(el.dataset.index);
        const mon = state[side][idx];
        if (!mon) return;
        ensureBattleState(mon);
        const v = Math.max(1, Math.min(100, Number(e.target.value) || 1));
        mon.battle.hpPct = v;
        updateLive();
      };
    }

    if (kind === 'stage') {
      el.onchange = (e) => {
        const side = el.dataset.side;
        const idx = Number(el.dataset.index);
        const statKey = el.dataset.stat;
        const mon = state[side][idx];
        if (!mon) return;
        ensureBattleState(mon);
        const v = Math.max(-6, Math.min(6, Number(e.target.value) || 0));
        mon.battle.stages[statKey] = v;
        updateLive();
      };
    }

    if (kind === 'status') {
      el.onchange = (e) => {
        const side = el.dataset.side;
        const idx = Number(el.dataset.index);
        const mon = state[side][idx];
        if (!mon) return;
        ensureBattleState(mon);
        mon.battle.status = e.target.value || null;
        updateLive();
      };
    }

    if (kind.startsWith('field-')) {
      el.onchange = (e) => {
        const key = kind.replace('field-', '');
        const f = state.field;

        if (key === 'weather' || key === 'terrain') {
          f[key] = e.target.value || null;
        } else if (key === 'trickRoom') {
          f.trickRoom = e.target.checked;
          if (f.trickRoom && f.trickRoomTurns === 0) f.trickRoomTurns = 5;
          if (!f.trickRoom) f.trickRoomTurns = 0;
        } else if (key === 'tailwindSelf' || key === 'tailwindEnemy') {
          f[key] = e.target.checked;
          const turnsKey = key + 'Turns';
          if (f[key] && f[turnsKey] === 0) f[turnsKey] = 4;
          if (!f[key]) f[turnsKey] = 0;
        } else if (key === 'weatherTurns' || key === 'terrainTurns') {
          f[key] = Math.max(0, Math.min(8, Number(e.target.value) || 0));
        }

        updateLive();
      };
    }
  });
}

// --- EXPOSE GLOBALS FOR UI EVENTS ---
window.setActiveBattleSlot = setActiveBattleSlot;

// Expose state globally for debug and HTML onclick handlers
window.state = state;

