/**
 * Phase 1 Mock Data & UI Logic - Refined Style
 */

const mockTeam = [
  {
    state: 'filled',
    name: 'Froslass',
    types: [
      { name: 'HIE', class: 'type-ice' },
      { name: 'FAN', class: 'type-ghost' }
    ],
    item: 'Banda Focus',
    nature: 'Miedosa',
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/478.png',
    moves: ['Viento Hielo', 'Bola Sombra', 'Fuego Fatuo', 'Protección']
  },
  {
    state: 'filled',
    name: 'Diggersby',
    types: [
      { name: 'NOR', class: 'type-normal' },
      { name: 'TIE', class: 'type-ground' }
    ],
    item: 'Cinta Elección',
    nature: 'Firme',
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/660.png',
    moves: ['Terremoto', 'Golpe Cuerpo', 'Ataque Rápido', 'Protección']
  },
  {
    state: 'filled',
    name: 'Samurott',
    types: [
      { name: 'AGU', class: 'type-water' }
    ],
    item: 'Agua Mística',
    nature: 'Firme',
    sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/503.png',
    moves: ['Danza Espada', 'Hidroariete', 'Espada Santa', 'Protección']
  },
  { state: 'empty' }
];

function renderCard(slot, index) {
  if (slot.state === 'empty') {
    return `
      <div class="pkmn-card empty">
        <div class="empty-icon">+</div>
        <div class="empty-text">Añadir Pokémon</div>
      </div>
    `;
  }

  const typesHtml = slot.types.map(t => `<span class="type-badge ${t.class}">${t.name}</span>`).join('');
  const movesHtml = slot.moves.map(m => `<li>${m}</li>`).join('');

  return `
    <div class="pkmn-card">
      <div class="card-header">
        <span class="slot-number">${index + 1}</span>
        <button class="remove-btn">×</button>
      </div>
      <div class="sprite-area">
        <img src="${slot.sprite}" alt="${slot.name}">
      </div>
      <div class="pkmn-name">${slot.name}</div>
      <div class="pkmn-types">${typesHtml}</div>
      <div class="pkmn-item">${slot.item}</div>
      <div class="pkmn-nature">${slot.nature}</div>
      <ul class="pkmn-moves">
        ${movesHtml}
      </ul>
    </div>
  `;
}

function initApp() {
  const container = document.getElementById('team-builder');
  let html = '';
  
  // Renderizamos los 3 mocks llenos y 1 vacío (para móvil 2x2, o escritorio 4 columnas)
  mockTeam.forEach((slot, index) => {
    html += renderCard(slot, index);
  });
  
  container.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', initApp);
