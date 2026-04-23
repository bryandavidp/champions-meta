/**
 * Phase 1 Mock Data & UI Logic
 * Simula el renderizado de la UI táctica sin conectarse a la PokeAPI.
 */

// 1. Datos Mockeados
const mockMyTeam = [
  {
    state: 'filled',
    name: 'Umbreon',
    types: [{ name: 'Siniestro', class: 'type-dark' }],
    ability: 'Sincronía',
    stats: 'H:95 / A:65 / S:65',
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/197.png',
    moves: ['Juego Sucio', 'Alarido', 'Luz Lunar', 'Protección']
  },
  {
    state: 'filled',
    name: 'Arcanine',
    types: [{ name: 'Fuego', class: 'type-fire' }],
    ability: 'Intimidación',
    stats: 'H:90 / A:110 / S:95',
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/59.png',
    moves: ['Envite Ígneo', 'Velocidad Extrema', 'Fuego Fatuo', 'Protección']
  },
  {
    state: 'filled',
    name: 'Scizor',
    types: [{ name: 'Bicho', class: 'type-grass' }, { name: 'Acero', class: 'type-steel' }],
    ability: 'Experto',
    stats: 'H:70 / A:130 / S:65',
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/212.png',
    moves: ['Puño Bala', 'Ida y Vuelta', 'Danza Espada', 'Protección']
  },
  { state: 'empty' },
  { state: 'loading' },
  { state: 'error', errorMsg: 'Pokémon no encontrado' }
];

// 2. Funciones de Renderizado
function renderTeamSlot(slot, isAlly) {
  if (slot.state === 'empty') {
    return `
      <div class="slot-empty">
        <span style="margin: 0 0.5rem 0 0.5rem; color: var(--text-muted);">🔍</span>
        <input type="text" class="slot-input" placeholder="Buscar Pokémon...">
      </div>
    `;
  }
  
  if (slot.state === 'loading') {
    return `<div class="slot-card slot-loading">Cargando datos...</div>`;
  }

  if (slot.state === 'error') {
    return `
      <div class="slot-card slot-error">
        <div class="slot-main">
          <div class="sprite-container" style="background: transparent;">⚠️</div>
          <div class="slot-info">${slot.errorMsg}</div>
        </div>
      </div>
    `;
  }

  // State: Filled
  const typesHtml = slot.types.map(t => `<span class="type-badge ${t.class}">${t.name}</span>`).join('');
  
  // Solo los aliados muestran movimientos en esta fase
  const movesHtml = isAlly && slot.moves ? `
    <button class="accordion-toggle" onclick="toggleMoves(this)">Ver set ▼</button>
    <div class="moves-accordion">
      <div class="move-list">
        ${slot.moves.map(m => `<span class="move-item">${m}</span>`).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="slot-card">
      <div class="slot-main">
        <div class="sprite-container">
          <img src="${slot.sprite}" alt="${slot.name}">
        </div>
        <div class="slot-info">
          <div class="slot-name">${slot.name}</div>
          <div class="slot-types">${typesHtml}</div>
          <div class="slot-ability">${slot.ability}</div>
        </div>
        <div class="slot-stats">
          <span>${slot.stats}</span>
        </div>
      </div>
      ${movesHtml}
    </div>
  `;
}

function initMockUI() {
  // Render Mi Equipo
  const myTeamGrid = document.getElementById('my-team-grid');
  myTeamGrid.innerHTML = mockMyTeam.map(slot => renderTeamSlot(slot, true)).join('');

  // Render Equipo Rival (usamos el mismo mock pero simulando un rival rápido)
  const rivalTeamGrid = document.getElementById('rival-team-grid');
  const mockRival = [...mockMyTeam].reverse(); // Invertimos para que parezca diferente
  rivalTeamGrid.innerHTML = mockRival.map(slot => renderTeamSlot(slot, false)).join('');

  // Render Details Tab (Mock Content)
  document.getElementById('details-ally').innerHTML = `
    <div class="slot-card" style="padding: 1rem;">
      <h4 style="margin-bottom: 0.5rem; color: var(--accent-primary);">Análisis Ally</h4>
      <p style="font-size: 0.85rem; color: var(--text-secondary);">Tu equipo tiene buena cobertura defensiva, pero dependes mucho de la intimidación de Arcanine.</p>
    </div>
  `;
}

// 3. Interacciones UI
window.toggleMoves = function(btn) {
  const accordion = btn.nextElementSibling;
  accordion.classList.toggle('open');
  btn.textContent = accordion.classList.contains('open') ? 'Ocultar set ▲' : 'Ver set ▼';
};

document.querySelectorAll('.segment-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Tab active state
    document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    
    // Content active state
    const targetId = e.target.getAttribute('data-target');
    document.querySelectorAll('.details-content').forEach(c => c.classList.remove('active'));
    document.getElementById(targetId).classList.add('active');
  });
});

// Inicializar la app
document.addEventListener('DOMContentLoaded', initMockUI);
