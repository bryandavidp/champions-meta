import { state } from '../core/state.js';
import { DEMO_ENEMY, DEMO_SELF, META_PRESETS, RATING_STORAGE_KEY, REGULATION_STORAGE_KEY, TYPE_META } from '../core/constants.js';
import { LIVE, UI_MODES } from '../core/dom.js';
import { renderAll, setUiMode, updateIcons } from '../render/app.js';
import { renderSpeedTiers } from '../render/analysis.js';
import { triggerMatrixFlash, setMatrixDetailMode, toggleMatrixHelp, getRows } from '../matrix/render.js';
import { openModal, closeModal } from '../picker/modal.js';
import { openSetEditor } from '../editor/set-editor.js';
import { renderTeamConfigDrawer, closeTeamDrawer } from '../render/dock.js';
import { saveCurrentTeam, deleteSavedTeam } from '../teams/storage.js';
import { fillTeamWithSpecies, loadSavedTeam } from '../teams/actions.js';
import * as quickMode from '../modes/quick.js';
import {
  isBattleFocusActive,
  openBattleSheet,
  closeBattleSheet,
  setBattleFocus,
} from '../modes/live.js';
import { getMetaRecord } from '../data/meta.js';
import { normalizeText, getTranslation, formatName } from '../utils/text.js';
import { getContrastColor, topEntries } from '../utils/types.js';
import { toggleDebug, runDebugScenarios } from '../utils/debug.js';

let bindingsReady = false;
let damageTooltipContainer = null;
let scoutTooltipContainer = null;
let infoTooltipContainer = null;

function ensureRuntimeTooltipNodes() {
  if (!damageTooltipContainer) {
    damageTooltipContainer = document.getElementById('damageTooltip') || document.createElement('div');
    damageTooltipContainer.id = 'damageTooltip';
    if (!damageTooltipContainer.parentNode) document.body.appendChild(damageTooltipContainer);
  }

  if (!scoutTooltipContainer) {
    scoutTooltipContainer = document.getElementById('scoutTooltip') || document.createElement('div');
    scoutTooltipContainer.id = 'scoutTooltip';
    if (!scoutTooltipContainer.parentNode) document.body.appendChild(scoutTooltipContainer);
  }

  if (!infoTooltipContainer) {
    infoTooltipContainer = document.getElementById('infoTooltip') || document.createElement('div');
    infoTooltipContainer.id = 'infoTooltip';
    Object.assign(infoTooltipContainer.style, {
      position: 'fixed',
      zIndex: '9999',
      background: 'rgba(18, 22, 33, 0.95)',
      border: '1px solid rgba(255, 255, 255, 0.15)',
      padding: '14px',
      borderRadius: '16px',
      boxShadow: '0 12px 36px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      pointerEvents: 'none',
      opacity: '0',
      transform: 'translateY(8px)',
      transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      maxWidth: '260px',
      textAlign: 'left',
      color: '#fff',
    });
    if (!infoTooltipContainer.parentNode) document.body.appendChild(infoTooltipContainer);
  }
}

function hideInfoTooltip() {
  if (!infoTooltipContainer) return;
  infoTooltipContainer.style.opacity = '0';
  infoTooltipContainer.style.transform = 'translateY(8px)';
}

function hideScoutTooltip() {
  if (scoutTooltipContainer) scoutTooltipContainer.classList.remove('show');
}

function clearSelectedMatrixCells() {
  document.querySelectorAll('.cell--selected').forEach((el) => el.classList.remove('cell--selected'));
  document.querySelectorAll('.matrix-row-selected').forEach((el) => el.classList.remove('matrix-row-selected'));
  document.querySelectorAll('.matrix-col-selected').forEach((el) => el.classList.remove('matrix-col-selected'));
}

function openFirstEmptySlot() {
  const selfEmpty = state.self.findIndex((mon) => !mon);
  if (selfEmpty !== -1) {
    openModal('self', selfEmpty);
    return;
  }
  const enemyEmpty = state.enemy.findIndex((mon) => !mon);
  if (enemyEmpty !== -1) {
    openModal('enemy', enemyEmpty);
    return;
  }
  document.getElementById('turnBranchesPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clickRecommendedTurnPlan(planId) {
  const buttons = Array.from(document.querySelectorAll('.turn-plan-use-btn'));
  const target = buttons.find((button) => button.dataset.planId === planId) || buttons.find((button) => !button.disabled);
  if (target) {
    target.click();
    return;
  }
  document.getElementById('turnBranchesPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function isQuickLegacyVisible() {
  const preview = document.getElementById('quickPreviewPanel');
  const combos = document.getElementById('quickCombosSection');
  return [preview, combos].some((node) => node && window.getComputedStyle(node).display !== 'none');
}

function handleHomeAction(node) {
  const action = node?.dataset?.homeAction;
  if (!action) return false;

  if (action === 'pick-empty' || action === 'edit-slot') {
    const side = node.dataset.side;
    const index = Number(node.dataset.index);
    if (!['self', 'enemy'].includes(side) || !Number.isFinite(index)) return true;
    if (side === 'self' && state.self[index]) openSetEditor(index);
    else openModal(side, index);
    return true;
  }

  if (action === 'complete-teams') {
    openFirstEmptySlot();
    return true;
  }

  if (action === 'use-recommended-plan') {
    clickRecommendedTurnPlan(node.dataset.planId || '');
    return true;
  }

  if (action === 'scroll-plans') {
    (() => { const p = document.getElementById('turnBranchesPanel'); if (p) { p.open = true; p.scrollIntoView({ behavior: 'smooth', block: 'start' }); } })();
    return true;
  }

  if (action === 'open-simulator') {
    document.getElementById('turn1SimulatorPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  if (action === 'open-matrix') {
    setUiMode('expert');
    requestAnimationFrame(() => {
      UI_MODES.matrixSectionTitle?.closest('section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return true;
  }

  if (action === 'open-threats') {
    setUiMode('expert');
    requestAnimationFrame(() => {
      document.getElementById('threatList')?.closest('.insight-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return true;
  }

  if (action === 'open-speed-detail') {
    setUiMode('expert');
    requestAnimationFrame(() => {
      document.getElementById('speedOrderPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return true;
  }

  return false;
}

function showScoutTooltip(slug, e) {
  if (!slug) return;
  const record = getMetaRecord(slug);
  if (!record || !record.entry) return;

  const formatNameSafe = (str, cat) => {
    const clean = normalizeText(str);
    return getTranslation(clean, cat) || formatName(clean);
  };

  const items = topEntries(record.entry.Items || {}, 3);
  const moves = topEntries(record.entry.Moves || {}, 5);

  if (!items.length && !moves.length) return;

  let html = `<div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 6px; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
    <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${record.slug === 'aegislash-blade' ? '10026' : record.entry.id || 0}.png" onerror="this.style.display='none'" style="width:24px; height:24px;">
    <strong style="color: var(--gold); font-size: 0.9rem;">Scout: ${record.displayName}</strong>
  </div>`;

  if (items.length) {
    html += `<div class="scout-section-title"><i data-lucide="package" style="width:12px;height:12px;"></i> Objetos probables</div>`;
    items.forEach((item) => {
      const pct = (item.value * 100).toFixed(1);
      html += `
        <div class="scout-bar-row">
          <div class="scout-bar-label">${formatNameSafe(item.key, 'item')}</div>
          <div class="scout-bar-track"><div class="scout-bar-fill" style="width: ${pct}%; background: var(--purple);"></div></div>
          <div class="scout-bar-pct">${pct}%</div>
        </div>
      `;
    });
  }

  if (moves.length) {
    html += `<div class="scout-section-title"><i data-lucide="crosshair" style="width:12px;height:12px;"></i> Ataques probables</div>`;
    moves.forEach((move) => {
      const pct = (move.value * 100).toFixed(1);
      html += `
        <div class="scout-bar-row">
          <div class="scout-bar-label">${formatNameSafe(move.key, 'move')}</div>
          <div class="scout-bar-track"><div class="scout-bar-fill" style="width: ${pct}%; background: var(--blue);"></div></div>
          <div class="scout-bar-pct">${pct}%</div>
        </div>
      `;
    });
  }

  scoutTooltipContainer.innerHTML = html;
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons({ root: scoutTooltipContainer });
  }

  scoutTooltipContainer.classList.add('show');

  requestAnimationFrame(() => {
    const bounds = scoutTooltipContainer.getBoundingClientRect();
    let left = e.clientX + 15;
    let top = e.clientY + 15;
    if (left + bounds.width > window.innerWidth) left = e.clientX - bounds.width - 15;
    if (top + bounds.height > window.innerHeight) top = e.clientY - bounds.height - 15;

    scoutTooltipContainer.style.left = `${Math.max(10, left)}px`;
    scoutTooltipContainer.style.top = `${Math.max(10, top)}px`;
  });

  clearTimeout(scoutTooltipContainer.timeout);
  scoutTooltipContainer.timeout = setTimeout(() => {
    scoutTooltipContainer.classList.remove('show');
  }, 4000);
}

function showInfoTooltip(e, kind, slug) {
  if (e) e.stopPropagation();
  if (!slug || slug === 'sinobjeto' || slug === 'desconocida') return;

  let data = null;
  let title = '';
  let icon = '';
  let color = '';

  if (kind === 'item' && window.GameDB?.items?.[slug]) {
    data = window.GameDB.items[slug];
    title = typeof getTranslation === 'function' ? getTranslation(data.name || slug, 'item') : formatName(slug);
    icon = 'package';
    color = 'var(--blue)';
  } else if (kind === 'ability' && window.GameDB?.abilities?.[slug]) {
    data = window.GameDB.abilities[slug];
    title = typeof getTranslation === 'function' ? getTranslation(data.name || slug, 'ability') : formatName(slug);
    icon = 'zap';
    color = 'var(--gold)';
  } else if (kind === 'move' && window.GameDB?.moves?.[slug]) {
    data = window.GameDB.moves[slug];
    title = typeof getTranslation === 'function' ? getTranslation(data.name || slug, 'move') : formatName(slug);
    icon = 'swords';
    color = 'var(--red)';
  }

  if (!data) {
    title = formatName(slug);
    data = { desc: 'No hay descripción detallada disponible en este momento.' };
    icon = kind === 'item' ? 'package' : 'zap';
    color = kind === 'item' ? 'var(--blue)' : 'var(--gold)';
  }

  const desc = data.desc || 'No hay descripción detallada disponible en este momento.';

  infoTooltipContainer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-bottom: 8px;">
      <i data-lucide="${icon}" style="color: ${color}; width: 16px; height: 16px;"></i>
      <strong style="color: #fff; font-size: 0.9rem; font-family: 'Cabinet Grotesk', sans-serif;">${title}</strong>
    </div>
    <div style="font-size: 0.75rem; color: var(--muted); line-height: 1.45;">
      ${desc}
    </div>
  `;

  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons({ root: infoTooltipContainer });
  }

  infoTooltipContainer.style.opacity = '1';
  infoTooltipContainer.style.transform = 'translateY(0)';

  let clientX = e ? e.clientX : window.innerWidth / 2;
  let clientY = e ? e.clientY : window.innerHeight / 2;
  if (e && e.currentTarget) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!clientX) clientX = rect.left + rect.width / 2;
    if (!clientY) clientY = rect.top;
  }

  requestAnimationFrame(() => {
    const bounds = infoTooltipContainer.getBoundingClientRect();
    let left = clientX - (bounds.width / 2);
    let top = clientY - bounds.height - 15;

    if (top < 10) top = clientY + 25;
    if (left + bounds.width > window.innerWidth - 10) left = window.innerWidth - bounds.width - 10;
    if (left < 10) left = 10;

    infoTooltipContainer.style.left = `${left}px`;
    infoTooltipContainer.style.top = `${top}px`;
  });

  clearTimeout(infoTooltipContainer.timeout);
  infoTooltipContainer.timeout = setTimeout(() => {
    infoTooltipContainer.style.opacity = '0';
    infoTooltipContainer.style.transform = 'translateY(8px)';
  }, 10000);
}

export function initEventBindings(callbacks = {}) {
  if (bindingsReady) return;
  bindingsReady = true;

  const {
    clearAll,
    swapTeams,
  } = callbacks;

  ensureRuntimeTooltipNodes();

  const selfSlots = document.getElementById('selfSlots');
  const enemySlots = document.getElementById('enemySlots');
  const matrixContainer = document.getElementById('matrixContainer');
  const ratingSelect = document.getElementById('ratingSelect');
  const regulationSelect = document.getElementById('regulationSelect');
  const matrixModeToggleGroup = document.getElementById('matrixModeToggleGroup');
  const matrixDetailToggleGroup = document.getElementById('matrixDetailToggleGroup');
  const matrixHelpToggleBtn = document.getElementById('matrixHelpToggleBtn');
  const matrixFieldControls = document.getElementById('matrixFieldControls');
  const uiModeToggle = document.getElementById('uiModeToggle');
  const turn1PickZone = document.getElementById('turn1PickZone');
  const loadDemoBtn = document.getElementById('loadDemoBtn');
  const swapBtn = document.getElementById('swapBtn');
  const clearBtn = document.getElementById('clearBtn');
  const toggleTailwindSelfBtn = document.getElementById('toggleTailwindSelfBtn');
  const toggleTailwindEnemyBtn = document.getElementById('toggleTailwindEnemyBtn');
  const toggleTrickRoomBtn = document.getElementById('toggleTrickRoomBtn');
  const selfTeamConfigBtn = document.querySelector('.team-config-btn[data-team="self"]');
  const enemyTeamConfigBtn = document.querySelector('.team-config-btn[data-team="enemy"]');

  window.showInfoTooltip = showInfoTooltip;
  window.handleDrawerAction = async function handleDrawerAction(action, teamType, payload) {
    if (action === 'save') {
      const input = document.getElementById('drawerSaveName');
      saveCurrentTeam(input ? input.value : '');
      renderTeamConfigDrawer(teamType);
    } else if (action === 'import') {
      alert('En desarrollo: Importación de Poképaste');
    } else if (action === 'clear') {
      state[teamType] = Array(6).fill(null);
      state.leads[teamType] = [];
      if (teamType === 'self') state.activeSelfSlots = [0, 1];
      if (teamType === 'enemy') state.activeEnemySlots = [0, 1];
      renderAll();
      closeTeamDrawer();
    } else if (action === 'load-saved') {
      await loadSavedTeam(payload, teamType);
      closeTeamDrawer();
    } else if (action === 'delete-saved') {
      deleteSavedTeam(payload);
      renderTeamConfigDrawer(teamType);
    } else if (action === 'load-preset') {
      const preset = META_PRESETS[payload];
      if (preset) {
        await fillTeamWithSpecies(teamType, preset.mons);
      }
      closeTeamDrawer();
    }
  };

  window.toggleDebug = toggleDebug;
  window.runDebugScenarios = runDebugScenarios;

  if (toggleTailwindSelfBtn) {
    toggleTailwindSelfBtn.addEventListener('click', () => {
      state.field.tailwindSelf = !state.field.tailwindSelf;
      renderSpeedTiers();
    });
  }

  if (toggleTailwindEnemyBtn) {
    toggleTailwindEnemyBtn.addEventListener('click', () => {
      state.field.tailwindEnemy = !state.field.tailwindEnemy;
      renderSpeedTiers();
    });
  }

  if (toggleTrickRoomBtn) {
    toggleTrickRoomBtn.addEventListener('click', () => {
      state.field.trickRoom = !state.field.trickRoom;
      renderSpeedTiers();
    });
  }

  if (matrixModeToggleGroup) {
    matrixModeToggleGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (btn && btn.dataset.mode) {
        state.matrixMode = btn.dataset.mode;
        triggerMatrixFlash();
        renderAll();
      }
    });
  }

  if (matrixDetailToggleGroup) {
    matrixDetailToggleGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (btn && btn.dataset.detail) {
        setMatrixDetailMode(btn.dataset.detail);
      }
    });
  }

  if (matrixHelpToggleBtn) {
    matrixHelpToggleBtn.addEventListener('click', () => {
      toggleMatrixHelp();
    });
  }

  if (matrixFieldControls) {
    matrixFieldControls.addEventListener('click', (e) => {
      const weatherBtn = e.target.closest('[data-weather]');
      if (weatherBtn && weatherBtn.dataset.weather) {
        const value = weatherBtn.dataset.weather;
        state.field.weather = state.field.weather === value ? null : value;
        triggerMatrixFlash();
        renderAll();
        return;
      }

      const terrainBtn = e.target.closest('[data-terrain]');
      if (terrainBtn && terrainBtn.dataset.terrain) {
        const value = terrainBtn.dataset.terrain;
        state.field.terrain = state.field.terrain === value ? null : value;
        triggerMatrixFlash();
        renderAll();
      }
    });
  }

  if (turn1PickZone) {
    turn1PickZone.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-t1-slot]');
      if (!btn || btn.disabled) return;
      const side = btn.dataset.side;
      const idx = Number(btn.dataset.idx);
      quickMode.toggleTurn1LeadSlot(side, idx);
    });
  }

  if (selfSlots) {
    selfSlots.addEventListener('click', async (e) => {
      const remove = e.target.closest('[data-action="remove"]');
      if (remove) {
        const idx = Number(remove.dataset.index);
        state.self[idx] = null;
        quickMode.resetQuickCombosLock();
        renderAll();
        return;
      }

      const pick = e.target.closest('[data-action="pick"]');
      if (!pick) return;

      const idx = Number(pick.dataset.index);
      if (state.self[idx]) {
        openSetEditor(idx);
      } else {
        openModal('self', idx);
      }
    });
  }

  if (enemySlots) {
    enemySlots.addEventListener('click', async (e) => {
      const remove = e.target.closest('[data-action="remove"]');
      if (remove) {
        const idx = Number(remove.dataset.index);
        state.enemy[idx] = null;
        quickMode.resetQuickCombosLock();
        renderAll();
        return;
      }

      const pick = e.target.closest('[data-action="pick"]');
      if (pick) openModal('enemy', Number(pick.dataset.index));
    });
  }

  if (loadDemoBtn) {
    loadDemoBtn.addEventListener('click', async () => {
      await fillTeamWithSpecies('self', DEMO_SELF);
      await fillTeamWithSpecies('enemy', DEMO_ENEMY);
    });
  }

  if (swapBtn && typeof swapTeams === 'function') {
    swapBtn.addEventListener('click', swapTeams);
  }

  if (clearBtn && typeof clearAll === 'function') {
    clearBtn.addEventListener('click', clearAll);
  }

  if (selfTeamConfigBtn) {
    selfTeamConfigBtn.addEventListener('click', () => renderTeamConfigDrawer('self'));
  }

  if (enemyTeamConfigBtn) {
    enemyTeamConfigBtn.addEventListener('click', () => renderTeamConfigDrawer('enemy'));
  }

  // Los <details> renderizan su contenido oculto; al abrirlos hay que
  // re-crear los iconos lucide que quedaron sin pintar.
  ['homeMorePanel', 'turnBranchesPanel'].forEach((paneId) => {
    const pane = document.getElementById(paneId);
    if (pane) pane.addEventListener('toggle', () => { if (pane.open) updateIcons(); });
  });

  const settingsToggleBtn = document.getElementById('settingsToggleBtn');
  const settingsPopover = document.getElementById('settingsPopover');
  if (settingsToggleBtn && settingsPopover) {
    const closeSettings = () => {
      settingsPopover.hidden = true;
      settingsToggleBtn.setAttribute('aria-expanded', 'false');
    };
    settingsToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = settingsPopover.hidden;
      settingsPopover.hidden = !open;
      settingsToggleBtn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => {
      if (settingsPopover.hidden) return;
      if (!settingsPopover.contains(e.target) && e.target !== settingsToggleBtn) closeSettings();
    });
    settingsPopover.addEventListener('click', (e) => e.stopPropagation());
  }

  if (regulationSelect) {
    regulationSelect.value = state.rules?.regulationId || 'M-B';
    regulationSelect.addEventListener('change', (e) => {
      state.rules = { ...(state.rules || { format: 'doubles' }), regulationId: e.target.value };
      localStorage.setItem(REGULATION_STORAGE_KEY, e.target.value);
      renderAll();
    });
  }

  if (ratingSelect) {
    ratingSelect.value = state.rating;
    ratingSelect.addEventListener('change', async (e) => {
      state.rating = e.target.value;
      localStorage.setItem(RATING_STORAGE_KEY, String(state.rating));
      alert('La carga por rating ha sido simplificada. La app usa el data-bundle.json cargado.');
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  if (uiModeToggle) {
    uiModeToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn || !btn.dataset.mode) return;
      setUiMode(btn.dataset.mode);
    });
  }

  if (matrixContainer) {
    matrixContainer.addEventListener('click', (e) => {
      const cell = e.target.closest('.clickable-cell[data-tooltip]');
      if (!cell) return;
      const data = JSON.parse(decodeURIComponent(cell.dataset.tooltip));

      const moveTypeStr = data.moveType || data.type || 'normal';
      const typeIcon = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/${moveTypeStr.toLowerCase()}.svg`;
      const typeColor = TYPE_META[moveTypeStr]?.color || '#fff';
      const iconContrast = getContrastColor(typeColor);

      /* damageTooltipContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <div class="type-icon-circle" style="position: static; background-color: ${typeColor}; width: 20px; height: 20px; box-shadow: none;">
                <div class="type-svg-mask" style="mask-image: url('${typeIcon}'); -webkit-mask-image: url('${typeIcon}'); background-color: ${iconContrast}; width: 12px; height: 12px;"></div>
            </div>
            <strong style="font-size: 0.85rem; color: #fff;">${data.move} vs ${data.defender}</strong>
        </div>
        <div style="font-size: 0.75rem; color: var(--muted); margin-bottom: 2px;">Daño: <strong style="color: white;">${data.minPct}% - ${data.maxPct}%</strong></div>
        <div style="font-size: 0.75rem; color: var(--muted);">Probabilidad de OHKO: <strong style="color: ${data.ohkoProb > 0 ? 'var(--red)' : 'white'};">${data.ohkoProb}%</strong></div>
      `; */

      /*  damageTooltipContainer.style.left = `\${e.clientX + 15}px\`;
        damageTooltipContainer.style.top = `\${e.clientY + 15}px\`;
        damageTooltipContainer.classList.add('show'); */

      const rect = damageTooltipContainer.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        damageTooltipContainer.style.left = '${e.clientX - rect.width - 15}px';
      }
      if (rect.bottom > window.innerHeight) {
        damageTooltipContainer.style.top = '${e.clientY - rect.height - 15}px';
      }

      clearTimeout(damageTooltipContainer.timeout);
      damageTooltipContainer.timeout = setTimeout(() => {
        damageTooltipContainer.classList.remove('show');
      }, 3000);
    });
  }

  document.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!e.target || typeof e.target.closest !== 'function') return;
    const target = e.target.closest('[data-scout]');
    if (!target) return;
    showScoutTooltip(target.dataset.scout, e);
  }, true);

  document.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!e.target || typeof e.target.closest !== 'function') return;
    const target = e.target.closest('[data-scout]');
    if (target) scoutTooltipContainer.classList.remove('show');
  }, true);

  document.addEventListener('click', () => {
    hideScoutTooltip();
  }, true);

  document.addEventListener('click', () => {
    hideInfoTooltip();
  }, true);

  window.addEventListener('scroll', () => {
    if (infoTooltipContainer && infoTooltipContainer.style.opacity === '1') {
      hideInfoTooltip();
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (e.target && typeof e.target.closest === 'function' && quickMode.handleTurn1SimulatorClick?.(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (!e.target || typeof e.target.closest !== 'function') return;
    const homeAction = e.target.closest('[data-home-action]');
    if (homeAction && handleHomeAction(homeAction)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const quickLegacyVisible = isQuickLegacyVisible();
    const btnLock = quickLegacyVisible ? e.target.closest('#lockBestFourBtn') : null;
    if (btnLock) {
      const preview = quickMode.computeQuickPreview(getRows());
      quickMode.lockBestFour(preview);
      return;
    }

    const comboCard = quickLegacyVisible ? e.target.closest('.combo-card') : null;
    if (comboCard) {
      const idxs = comboCard.dataset.combo.split(',').map((value) => Number(value));
      quickMode.applyQuickCombo(idxs);
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target && typeof e.target.closest === 'function' && quickMode.handleTurn1SimulatorChange?.(e.target)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  if (LIVE.focusToggle) {
    LIVE.focusToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.segmented-btn');
      if (!btn) return;
      document.querySelectorAll('#matrixFocusToggle .segmented-btn').forEach((node) => node.classList.remove('active'));
      btn.classList.add('active');
      setBattleFocus(btn.dataset.focus);
    });
  }

  LIVE.closeSheetBtn?.addEventListener('click', closeBattleSheet);
  LIVE.sheetOverlay?.addEventListener('click', closeBattleSheet);

  document.addEventListener('click', (e) => {
    if (!isBattleFocusActive()) return;
    if (!e.target || typeof e.target.closest !== 'function') return;
    const cell = e.target.closest('.clickable-cell[data-tooltip]');
    if (!cell) return;

    e.preventDefault();
    e.stopPropagation();

    // Single-click: resalta fila/columna para contexto y abre la ficha de
    // batalla en el acto (antes hacían falta dos clics: seleccionar + abrir).
    clearSelectedMatrixCells();
    cell.classList.add('cell--selected');
    const td = cell.closest('td');
    const tr = cell.closest('tr');
    if (tr) tr.classList.add('matrix-row-selected');
    if (td) {
      const colIndex = Array.from(tr.children).indexOf(td);
      const table = cell.closest('table');
      if (table) {
        table.querySelectorAll('tr').forEach((row) => {
          if (row.children[colIndex]) row.children[colIndex].classList.add('matrix-col-selected');
        });
      }
    }
    state.selectedMatrixCell = cell;
    openBattleSheet({ cell });
  });
}
