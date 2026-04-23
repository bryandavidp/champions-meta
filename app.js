/**
 * Phase 6 - Endurecimiento, Rendimiento y Accesibilidad.
 */

// 1. Utilidades y Diccionarios
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => { clearTimeout(timeoutId); timeoutId = setTimeout(() => func(...args), delay); };
};

const typeMapES = { normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psiq', bug: 'Bicho', rock: 'Roca', ghost: 'Fantsm', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' };
const lightTypes = ['electric', 'ice', 'normal', 'flying', 'steel', 'fairy', 'bug', 'grass']; // Tipos que necesitan texto oscuro para accesibilidad

const tM = { normal: {rock:0.5, ghost:0, steel:0.5}, fire: {fire:0.5, water:0.5, grass:2, ice:2, bug:2, rock:0.5, dragon:0.5, steel:2}, water: {water:0.5, grass:0.5, fire:2, ground:2, rock:2, dragon:0.5}, electric: {electric:0.5, grass:0.5, water:2, flying:2, dragon:0.5, ground:0}, grass: {fire:0.5, water:2, grass:0.5, poison:0.5, ground:2, flying:0.5, bug:0.5, rock:2, dragon:0.5, steel:0.5}, ice: {fire:0.5, water:0.5, grass:2, ice:0.5, ground:2, flying:2, dragon:2, steel:0.5}, fighting: {normal:2, ice:2, poison:0.5, flying:0.5, psychic:0.5, bug:0.5, rock:2, ghost:0, dark:2, steel:2, fairy:0.5}, poison: {grass:2, poison:0.5, ground:0.5, rock:0.5, ghost:0.5, steel:0, fairy:2}, ground: {fire:2, water:1, electric:2, grass:0.5, poison:2, flying:0, bug:0.5, rock:2, steel:2}, flying: {electric:0.5, grass:2, fighting:2, bug:2, rock:0.5, steel:0.5}, psychic: {fighting:2, poison:2, psychic:0.5, dark:0, steel:0.5}, bug: {fire:0.5, grass:2, fighting:0.5, poison:0.5, flying:0.5, psychic:2, ghost:0.5, dark:2, steel:0.5, fairy:0.5}, rock: {fire:2, ice:2, fighting:0.5, ground:0.5, flying:2, bug:2, steel:0.5}, ghost: {normal:0, psychic:2, ghost:2, dark:0.5}, dragon: {dragon:2, steel:0.5, fairy:0}, dark: {fighting:0.5, psychic:2, ghost:2, dark:0.5, fairy:0.5}, steel: {fire:0.5, water:0.5, electric:0.5, ice:2, rock:2, fairy:2, steel:0.5}, fairy: {fire:0.5, fighting:2, poison:0.5, dragon:2, dark:2, steel:0.5} };
const getMult = (atk, def) => tM[atk] && tM[atk][def] !== undefined ? tM[atk][def] : 1;
const getDualMult = (atk, typesArr) => typesArr.reduce((acc, t) => acc * getMult(atk, t.apiName), 1);

// 2. Estado Global
let pokemonMasterList = [];
const state = { myTeam: Array(6).fill({ state: 'empty' }), rivalTeam: Array(6).fill({ state: 'empty' }) };

document.addEventListener('DOMContentLoaded', async () => {
  initEvents(); loadFromStorage(); updateUI();
  try { pokemonMasterList = (await (await fetch('https://pokeapi.co/api/v2/pokemon?limit=1000')).json()).results; } catch(e) {}
});

// 3. API y Almacenamiento
async function fetchPokemonDetails(name, teamType, index) {
  state[teamType][index] = { state: 'loading' }; updateUI();
  try {
    const data = await (await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`)).json();
    const types = data.types.map(t => ({ apiName: t.type.name, name: typeMapES[t.type.name] || t.type.name, cssClass: `type-${t.type.name} ${lightTypes.includes(t.type.name) ? 'text-dark-mode' : ''}` }));
    state[teamType][index] = { state: 'filled', name: data.name.charAt(0).toUpperCase() + data.name.slice(1), types, availableMoves: data.moves.map(m=>m.move.name), sprite: data.sprites.front_default || data.sprites.other['official-artwork'].front_default, moves: [] };
    saveToStorage(); updateUI();
  } catch(e) { state[teamType][index] = { state: 'empty' }; updateUI(); }
}

async function fetchMoveDetails(moveApiName, index) {
  state.myTeam[index].moveSearchState = false; updateUI();
  try {
    const data = await (await fetch(`https://pokeapi.co/api/v2/move/${moveApiName}`)).json();
    const esName = data.names.find(n => n.language.name === 'es')?.name || data.name;
    const isDamage = data.damage_class.name === 'physical' || data.damage_class.name === 'special';
    state.myTeam[index].moves.push({ name: esName, type: data.type.name, cssClass: `type-${data.type.name} ${lightTypes.includes(data.type.name) ? 'text-dark-mode' : ''}`, isDamage });
    saveToStorage(); updateUI();
  } catch(e) {}
}

function saveToStorage() {
  localStorage.setItem('pokeTactics_v6', JSON.stringify(state));
  const el = document.getElementById('save-status');
  el.textContent = "Guardado ✔";
  setTimeout(() => el.textContent = "", 2000);
}
function loadFromStorage() { const saved = localStorage.getItem('pokeTactics_v6'); if (saved) try { const p = JSON.parse(saved); state.myTeam = p.myTeam; state.rivalTeam = p.rivalTeam; } catch(e) {} }

// 4. Renderizado Modular
function renderSlot(slot, index, team) {
  if (slot.state === 'empty') return `<div class="pkmn-card empty" role="button" tabindex="0" onclick="openSearch('${team}', ${index})"><span class="text-muted">+ Añadir Slot ${index+1}</span></div>`;
  if (slot.state === 'loading') return `<div class="pkmn-card loading"><div class="spinner"></div></div>`;
  
  if (slot.state === 'search') return `<div class="pkmn-card search-state">
    <div class="card-header"><span class="slot-num">Slot ${index+1}</span><button class="btn-remove" aria-label="Cancelar" onclick="cancelSearch('${team}', ${index})">✕</button></div>
    <input type="text" class="search-input" id="inp-${team}-${index}" placeholder="Buscar Pokémon..." autocomplete="off">
    <div class="search-dropdown" id="dd-${team}-${index}"></div></div>`;

  const typesHtml = slot.types.map(t => `<span class="type-badge ${t.cssClass}">${t.name}</span>`).join('');
  let movesHtml = '';
  
  if (team === 'myTeam') {
    const moveList = slot.moves.map((m, mIdx) => `<div class="chip-move"><span class="type-badge ${m.cssClass}" style="font-size:0.5rem; padding:0.1rem 0.2rem;">${typeMapES[m.type].substring(0,3)}</span> ${m.name} <button class="btn-remove-move" onclick="removeMove(${index}, ${mIdx})">✕</button></div>`).join('');
    let moveInput = slot.moves.length < 4 ? (slot.moveSearchState ? `<div style="position:relative; width:100%; margin-top:0.25rem;"><input type="text" class="search-input" id="inp-mov-${index}" placeholder="Ej: protect..." autocomplete="off"><div class="search-dropdown" id="dd-mov-${index}"></div></div>` : `<button class="add-move-btn" onclick="openMoveSearch(${index})">+ Añadir Mov.</button>`) : '';
    movesHtml = `<div class="moves-chips">${moveList} ${moveInput}</div>`;
  }

  return `<div class="pkmn-card filled">
    <div class="card-header"><span class="slot-num">Slot ${index+1}</span><button class="btn-remove" aria-label="Eliminar" onclick="clearSlot('${team}', ${index})">✕</button></div>
    <div class="card-body"><div class="sprite-area"><img src="${slot.sprite}" alt="${slot.name}" loading="lazy"></div>
    <div class="info-area"><div class="pkmn-name">${slot.name}</div><div class="types-row">${typesHtml}</div></div></div>${movesHtml}
  </div>`;
}

function updateUI() {
  document.getElementById('my-team-grid').innerHTML = state.myTeam.map((s, i) => renderSlot(s, i, 'myTeam')).join('');
  document.getElementById('rival-team-grid').innerHTML = state.rivalTeam.map((s, i) => renderSlot(s, i, 'rivalTeam')).join('');
  
  const myCount = state.myTeam.filter(s => s.state === 'filled').length;
  const rivCount = state.rivalTeam.filter(s => s.state === 'filled').length;
  document.getElementById('my-team-count').textContent = `${myCount}/6`;
  document.getElementById('rival-team-count').textContent = `${rivCount}/6`;
  
  if (myCount >= 2 && rivCount >= 2) { document.getElementById('tactical-board').style.display = 'block'; calculateTactics(); } 
  else { document.getElementById('tactical-board').style.display = 'none'; }
  
  attachSearchEvents(); // Re-bind dynamic input events
}

// 5. Lógica de Interfaz y Eventos Dinámicos
window.openSearch = (t, i) => { state[t][i] = { state: 'search' }; updateUI(); setTimeout(() => document.getElementById(`inp-${t}-${i}`).focus(), 10); };
window.cancelSearch = (t, i) => { state[t][i] = { state: 'empty' }; updateUI(); };
window.openMoveSearch = (i) => { state.myTeam[i].moveSearchState = true; updateUI(); setTimeout(() => document.getElementById(`inp-mov-${i}`).focus(), 10); };
window.removeMove = (p, m) => { state.myTeam[p].moves.splice(m, 1); saveToStorage(); updateUI(); };
window.clearSlot = (t, i) => { state[t][i] = { state: 'empty' }; saveToStorage(); updateUI(); };

// Debounced Handlers
const handlePkmnSearch = debounce((query, t, i) => {
  const dd = document.getElementById(`dd-${t}-${i}`);
  if (query.length < 2) { dd.innerHTML = ''; return; }
  dd.innerHTML = pokemonMasterList.filter(p => p.name.includes(query)).slice(0, 5).map(p => `<div class="search-item" onclick="fetchPokemonDetails('${p.name}', '${t}', ${i})">${p.name}</div>`).join('');
}, 200);

const handleMoveSearch = debounce((query, i) => {
  const dd = document.getElementById(`dd-mov-${i}`);
  if (query.length < 2) { dd.innerHTML = ''; return; }
  dd.innerHTML = state.myTeam[i].availableMoves.filter(m => m.includes(query)).slice(0, 5).map(m => `<div class="search-item" onclick="fetchMoveDetails('${m}', ${i})">${m}</div>`).join('');
}, 200);

function attachSearchEvents() {
  state.myTeam.forEach((s, i) => {
    if (s.state === 'search') document.getElementById(`inp-myTeam-${i}`).addEventListener('input', e => handlePkmnSearch(e.target.value.toLowerCase().trim(), 'myTeam', i));
    if (s.moveSearchState) document.getElementById(`inp-mov-${i}`).addEventListener('input', e => handleMoveSearch(e.target.value.toLowerCase().trim(), i));
  });
  state.rivalTeam.forEach((s, i) => {
    if (s.state === 'search') document.getElementById(`inp-rivalTeam-${i}`).addEventListener('input', e => handlePkmnSearch(e.target.value.toLowerCase().trim(), 'rivalTeam', i));
  });
}

// 6. Lógica Táctica
function calculateTactics() {
  const allies = state.myTeam.filter(s => s.state === 'filled');
  const rivals = state.rivalTeam.filter(s => s.state === 'filled');
  
  allies.forEach(ally => {
    let tHit = 0, wA = 0, imm = 0;
    rivals.forEach(riv => {
      let mOff = 0; ally.moves.filter(m => m.isDamage).forEach(m => mOff = Math.max(mOff, getDualMult(m.type, riv.types)));
      if (mOff >= 2) tHit++;
      let mThr = 0; riv.types.forEach(rt => { let dm = getDualMult(rt.apiName, ally.types); mThr = Math.max(mThr, dm); if (dm === 0) imm++; });
      if (mThr >= 2) wA++;
    });
    ally.ts = tHit - wA + (imm * 0.5); ally.tr = { tHit, wA };
  });

  const sorted = [...allies].sort((a, b) => b.ts - a.ts);
  const top4 = sorted.slice(0, 4);
  const weakPicks = sorted.filter(a => a.ts < 0);
  
  const tScores = rivals.map(riv => {
    let hits = 0; allies.forEach(ally => { if (riv.types.some(rt => getDualMult(rt.apiName, ally.types) >= 2)) hits++; });
    return { ...riv, hits };
  }).sort((a, b) => b.hits - a.hits);
  const mainThr = tScores[0];

  // Inyección Segura (Previniendo full render reset para UX)
  document.getElementById('main-threat-container').innerHTML = mainThr && mainThr.hits >= 2 
    ? `<span style="font-weight:600; color:var(--text-red)">⚠ Amenaza Principal: ${mainThr.name}</span><span style="font-size:0.8rem">Gana STAB Súper Eficaz contra ${mainThr.hits} aliados.</span>` 
    : `<span style="font-weight:600; color:var(--text-green)">✓ Emparejamiento Defensivo Estable</span><span style="font-size:0.8rem">El rival no tiene barridos claros.</span>`;

  if (top4.length >= 2) document.getElementById('best-lead-content').innerHTML = `<div class="lead-pair"><div class="lead-sprite"><img src="${top4[0].sprite}"></div><span style="font-weight:bold">+</span><div class="lead-sprite"><img src="${top4[1].sprite}"></div></div><div class="reason-text">Ventaja neta matemática de +${top4[0].ts + top4[1].ts}.</div><div class="reason-text">Presión eficaz sobre ${top4[0].tr.tHit + top4[1].tr.tHit} rivales.</div>`;
  
  if (top4.length >= 3) document.getElementById('alt-lead-content').innerHTML = `<div class="lead-pair"><div class="lead-sprite"><img src="${top4[2].sprite}"></div><span style="font-weight:bold">+</span><div class="lead-sprite"><img src="${top4[top4.length===4?3:0].sprite}"></div></div><div class="reason-text">Excelente rotación secundaria por cobertura.</div>`;

  document.getElementById('top-four-content').innerHTML = `<div class="mini-sprite-list">${top4.map(p => `<div class="mini-sprite-item"><img src="${p.sprite}"><span class="score-badge score-pos">+${p.ts}</span></div>`).join('')}</div>`;
  
  document.getElementById('weak-picks-content').innerHTML = weakPicks.length > 0 ? `<div class="mini-sprite-list">${weakPicks.map(p => `<div class="mini-sprite-item"><img src="${p.sprite}"><span class="score-badge score-neg">${p.ts}</span></div>`).join('')}</div><div class="reason-text negative" style="margin-top:0.5rem">Pasivos defensivos en este combate.</div>` : `<div class="reason-text">Todos tus picks tienen ventaja o son neutros.</div>`;
}

function initEvents() {
  document.getElementById('theme-toggle').addEventListener('click', () => document.body.classList.toggle('light-theme'));
  document.getElementById('global-clear').addEventListener('click', () => { if(confirm('¿Limpiar mesa?')) { state.myTeam = Array(6).fill({ state: 'empty' }); state.rivalTeam = Array(6).fill({ state: 'empty' }); saveToStorage(); updateUI(); }});
}
