// render/dock.js
// Responsabilidad: Renderizado de los slots de equipo (self/enemy), Team Config Drawer y wrappers de carga de equipo

import { state } from '../core/state.js';
import { DOCK } from '../core/dom.js';
import { isSpeciesLegal } from '../rules/index.js';

function slotWarning(mon) {
  if (!mon) return null;
  const legality = isSpeciesLegal(mon, state.rules?.regulationId);
  if (legality.verified && !legality.legal) return `Fuera de las reglas: ${legality.reason}`;
  if (mon.set?._generic) return 'Sin datos meta: set genérico, revisa movimientos y objeto';
  return null;
}

export function renderDock(side) {
  const arr = state[side];
  const mount = side === "self" ? DOCK.selfSlots : DOCK.enemySlots;

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

      const warning = slotWarning(mon);

      return `
          <button class="mini-slot ${warning ? 'has-warning' : ''}" data-action="pick" data-side="${side}" data-index="${idx}" aria-label="${mon.displayName}" ${side === "enemy" ? `data-scout="${mon.name}"` : ""}>
            ${chosenBadge}
            ${warning ? `<span class="slot-warning-badge" title="${warning}">!</span>` : ''}
            ${mon.name.includes("-mega") ? '<div class="mega-icon"></div>' : ""}
            <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
            ${side === "self" ? `<span class="slot-edit-dot" title="Set configurado"></span>` : ""}
            <span class="slot-remove" data-action="remove" data-side="${side}" data-index="${idx}"><i data-lucide="x" style="width:12px;height:12px;"></i></span>
          </button>
        `;
    })
    .join("");
}



// --- Imports for Drawer ---
import { getSavedTeams, saveCurrentTeam } from '../teams/storage.js';
import { META_PRESETS } from '../core/constants.js';
import { normalizeText } from '../utils/text.js';

// --- Team Config Drawer ---
export function renderTeamConfigDrawer(teamType) {
  let modalContainer = document.getElementById("teamConfigModal");
  if (!modalContainer) {
    modalContainer = document.createElement("div");
    modalContainer.id = "teamConfigModal";
    document.body.appendChild(modalContainer);
  }

  const title = teamType === 'self' ? 'Configuración de Tu Equipo' : 'Configuración del Rival';
  const icon = teamType === 'self' ? 'shield-half' : 'swords';
  const savedTeams = getSavedTeams();

  let quickActionsHtml = '';
  if (teamType === 'self') {
    quickActionsHtml += `
      <div class="save-bar" style="margin-bottom: 12px;">
        <input id="drawerSaveName" class="save-input" placeholder="Nombre del equipo" />
        <button class="btn green" onclick="handleDrawerAction('save', 'self')">Guardar Equipo</button>
      </div>
    `;
  }
  quickActionsHtml += `
    <div style="display: flex; gap: 8px; margin-bottom: 16px;">
      <button class="btn blue" style="flex: 1;" onclick="handleDrawerAction('import', '${teamType}')"><i data-lucide="clipboard-paste"></i> Importar Paste</button>
      <button class="btn red" style="flex: 1;" onclick="handleDrawerAction('clear', '${teamType}')"><i data-lucide="trash-2"></i> Limpiar Slots</button>
    </div>
  `;

  const savedTeamsHtml = savedTeams.length ? savedTeams.map(team => `
    <div class="drawer-team-card">
      <div class="drawer-team-info">
        <div class="drawer-team-title">${team.name}</div>
        <div class="drawer-team-desc">${team.mons.length} slots · corte ${team.rating || state.rating}</div>
        <div class="drawer-team-sprites">
          ${team.mons.map(m => `<div class="drawer-team-sprite"><img src="${m.sprite}"></div>`).join('')}
        </div>
      </div>
      <div class="drawer-team-actions">
        <button class="btn small blue" onclick="handleDrawerAction('load-saved', '${teamType}', '${team.id}')">Cargar</button>
        ${teamType === 'self' ? `<button class="btn small red" onclick="handleDrawerAction('delete-saved', '${teamType}', '${team.id}')">Borrar</button>` : ''}
      </div>
    </div>
  `).join('') : '<div class="empty">No hay equipos guardados en tus cajas.</div>';

  const presetsHtml = META_PRESETS.map((preset, idx) => `
    <div class="drawer-team-card">
      <div class="drawer-team-info">
        <div class="drawer-team-title">${preset.name}</div>
        <div class="drawer-team-desc">${preset.desc}</div>
        <div class="drawer-team-sprites">
          ${preset.mons.map(slug => {
            const cached = state.cache.get(normalizeText(slug));
            const spriteUrl = cached ? cached.sprite : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${slug}.png`;
            return `<div class="drawer-team-sprite"><img src="${spriteUrl}" onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png'"></div>`;
          }).join('')}
        </div>
      </div>
      <div class="drawer-team-actions">
        <button class="btn small blue" onclick="handleDrawerAction('load-preset', '${teamType}', ${idx})">Cargar</button>
      </div>
    </div>
  `).join('');

  modalContainer.innerHTML = `
    <div class="premium-drawer-overlay" id="drawerOverlay" onclick="closeTeamDrawer(event)">
      <div class="premium-drawer" onclick="event.stopPropagation()">
        <div class="drawer-handle"></div>

        <div class="drawer-header">
          <div class="drawer-title">
            <i data-lucide="${icon}"></i>
            <span>${title}</span>
          </div>
          <button class="icon-btn" onclick="closeTeamDrawer()" style="background: rgba(255,255,255,0.05); border-radius: 50%; padding: 6px; border: none; cursor: pointer; color: #fff; display: grid; place-items: center;"><i data-lucide="x" style="width: 16px; height: 16px;"></i></button>
        </div>

        ${quickActionsHtml}

        <div class="drawer-tabs">
          <button class="drawer-tab active" onclick="switchDrawerTab('saved')">Mis Cajas</button>
          <button class="drawer-tab" onclick="switchDrawerTab('presets')">Top Meta</button>
        </div>

        <div class="drawer-tab-content active" id="tab-saved">
          <div class="drawer-scroll-list">
            ${savedTeamsHtml}
          </div>
        </div>

        <div class="drawer-tab-content" id="tab-presets">
          <div class="drawer-scroll-list">
            ${presetsHtml}
          </div>
        </div>
      </div>
    </div>
  `;

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    if (typeof section !== "undefined" && section) {
        lucide.createIcons({ root: section });
    } else {
        lucide.createIcons();
    }
  }

  const overlay = document.getElementById("drawerOverlay");
  void overlay.offsetWidth;
  overlay.classList.add("open");
}

export function closeTeamDrawer(e) {
  if (e && e.target !== e.currentTarget) return;
  const overlay = document.getElementById("drawerOverlay");
  if (overlay) {
    overlay.classList.remove("open");
  }
};

export function switchDrawerTab(tabId) {
  document.querySelectorAll('.drawer-tab').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.drawer-tab-content').forEach(content => content.classList.remove('active'));
  
  if (tabId === 'saved') {
    document.querySelectorAll('.drawer-tab')[0].classList.add('active');
    document.getElementById('tab-saved').classList.add('active');
  } else {
    document.querySelectorAll('.drawer-tab')[1].classList.add('active');
    document.getElementById('tab-presets').classList.add('active');
  }
};


window.closeTeamDrawer = closeTeamDrawer;
window.switchDrawerTab = switchDrawerTab;
