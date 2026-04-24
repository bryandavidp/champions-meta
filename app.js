// --- 1. MATRIZ DE TIPOS (TYPE CHART 18x18) ---
// Multiplicador de daño ofensivo: TYPE_CHART[tipo_ataque][tipo_defensor]
const TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
};

// --- 2. MOCK META Y CACHÉ ---
const metaMock = {
    "flutter-mane": { tera: "fairy", ability: "protosynthesis", item: "booster energy" },
    "incineroar": { tera: "grass", ability: "intimidate", item: "sitrus berry" },
    "urshifu-rapid-strike": { tera: "water", ability: "unseen fist", item: "mystic water" },
    "ogerpon-hearthflame": { tera: "fire", ability: "mold breaker", item: "hearthflame mask" },
    "rillaboom": { tera: "fire", ability: "grassy surge", item: "assault vest" },
    "tornadus": { tera: "dark", ability: "prankster", item: "covert cloak" }
};

const apiCache = new Map();
let myTeam = [];
let enemyTeam = [];

// --- 3. PARSER DE SHOWDOWN ---
function parseShowdown(text) {
    const blocks = text.trim().split(/\n\s*\n/);
    const team = [];
    blocks.forEach(block => {
        if (!block) return;
        const lines = block.split('\n');
        let nameRaw = lines[0].split('@')[0].trim();
        const species = nameRaw.replace(/\s*\(.*?\)/, '').trim().toLowerCase().replace(" ", "-");
        
        let speedStat = 50, teraType = "stellar", hasTailwind = false;
        
        lines.forEach(line => {
            if (line.includes('EVs:')) {
                const match = line.match(/(\d+)\s+Spe/i);
                if (match) speedStat = calculateLevel50Speed(100, parseInt(match[1])); 
            }
            if (line.includes('Tera Type:')) teraType = line.split(':')[1].trim().toLowerCase();
            if (line.toLowerCase().includes('- tailwind')) hasTailwind = true;
        });

        team.push({ name: species, teraType, hasTailwind, isMyTeam: true, isTeraMode: false });
    });
    return team.slice(0, 6);
}

function calculateLevel50Speed(baseSpeed, evs = 0) {
    return Math.floor(((2 * baseSpeed + 31 + Math.floor(evs / 4)) * 50) / 100) + 5;
}

// --- 4. FETCH API ---
async function fetchPokemonData(name) {
    const cleanName = name.toLowerCase().replace(" ", "-");
    if (apiCache.has(cleanName)) return apiCache.get(cleanName);
    
    try {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${cleanName}`);
        if (!response.ok) return null;
        const data = await response.json();
        const result = {
            name: data.name,
            sprite: data.sprites.front_default,
            types: data.types.map(t => t.type.name),
            speedBase: data.stats.find(s => s.stat.name === 'speed').base_stat
        };
        apiCache.set(cleanName, result);
        return result;
    } catch (e) {
        return null;
    }
}

// --- 5. LÓGICA DE MATEMÁTICAS Y SCORING ---
function getMultiplier(attackType, defenderTypes) {
    let mult = 1;
    defenderTypes.forEach(defType => {
        if (TYPE_CHART[attackType] && TYPE_CHART[attackType][defType] !== undefined) {
            mult *= TYPE_CHART[attackType][defType];
        }
    });
    return mult;
}

// Calcula la ventaja de 'miMon' contra 'enemyMon'
function getMatchupScore(myMon, enemyMon) {
    let score = 0;
    const myCurrentTypes = myMon.isTeraMode ? [myMon.teraType] : myMon.types;
    // Asumimos que el rival NO está Terastalizado a menos que expandamos la UI
    const enemyCurrentTypes = enemyMon.types; 

    // Score Ofensivo (Mis STABs contra su combinación de tipos)
    let maxOffense = 0;
    myCurrentTypes.forEach(myType => {
        let mult = getMultiplier(myType, enemyCurrentTypes);
        if (mult >= 2) maxOffense = 1; // Súper Efectivo suma
    });
    score += maxOffense;

    // Score Defensivo (Sus STABs contra mi combinación de tipos actual)
    let minDefense = 0;
    enemyCurrentTypes.forEach(enemyType => {
        let mult = getMultiplier(enemyType, myCurrentTypes);
        if (mult >= 2) minDefense = -1; // Débil resta
        else if (mult <= 0.5 && minDefense === 0) minDefense = 0.5; // Resistencia pura ayuda un poco
    });
    score += minDefense;

    return score;
}

// --- 6. EVENTOS DE UI ---
document.getElementById('btn-import').addEventListener('click', async () => {
    const paste = document.getElementById('input-pokepaste').value;
    if (!paste) return;
    
    document.getElementById('btn-import').innerText = "Parseando...";
    const parsed = parseShowdown(paste);
    myTeam = [];
    
    for (let p of parsed) {
        const apiData = await fetchPokemonData(p.name);
        if (apiData) {
            myTeam.push({ ...p, ...apiData, actualSpeed: calculateLevel50Speed(apiData.speedBase, 252) });
        }
    }
    
    document.getElementById('section-my-team').classList.add('hidden');
    document.getElementById('section-enemy-team').classList.remove('hidden');
});

const enemyInputs = document.querySelectorAll('.enemy-search');
enemyInputs.forEach(input => {
    input.addEventListener('change', async (e) => {
        const name = e.target.value.trim().toLowerCase();
        if(!name) return;
        const index = e.target.getAttribute('data-index');
        
        const apiData = await fetchPokemonData(name);
        if(apiData) {
            e.target.style.borderColor = "var(--success)";
            const meta = metaMock[apiData.name] || {};
            enemyTeam[index] = { 
                ...apiData, 
                isMyTeam: false,
                actualSpeed: calculateLevel50Speed(apiData.speedBase, 252),
                tera: meta.tera || "stellar"
            };
            document.getElementById('btn-analyze').disabled = false;
        } else {
            e.target.style.borderColor = "var(--danger)";
        }
    });
});

document.getElementById('btn-analyze').addEventListener('click', () => {
    document.getElementById('section-enemy-team').classList.add('hidden');
    document.getElementById('section-dashboard').classList.remove('hidden');
    renderSpeedTiers();
    calculateLeadsAndThreats();
    renderMatrix();
});

// Pestañas
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.getAttribute('data-target')).classList.add('active');
    });
});

// Speed Tiers
function renderSpeedTiers() {
    const list = document.getElementById('speed-tier-list');
    list.innerHTML = '';
    const myTailwind = document.getElementById('toggle-tailwind-me').checked;
    const enemyTailwind = document.getElementById('toggle-tailwind-enemy').checked;

    let allMons = [];
    myTeam.forEach(m => allMons.push({ ...m, currentSpeed: m.actualSpeed * (myTailwind ? 2 : 1) }));
    enemyTeam.filter(Boolean).forEach(m => allMons.push({ ...m, currentSpeed: m.actualSpeed * (enemyTailwind ? 2 : 1) }));
    allMons.sort((a, b) => b.currentSpeed - a.currentSpeed);
    
    allMons.forEach(mon => {
        const li = document.createElement('li');
        li.className = 'speed-item';
        li.innerHTML = `<div class="speed-number">${Math.floor(mon.currentSpeed)}</div>
                        <div class="speed-name ${mon.isMyTeam ? '' : 'enemy'}">
                            <img src="${mon.sprite}" class="sprite-icon"> <span style="text-transform: capitalize;">${mon.name}</span>
                        </div>`;
        list.appendChild(li);
    });
}
document.getElementById('toggle-tailwind-me').addEventListener('change', renderSpeedTiers);
document.getElementById('toggle-tailwind-enemy').addEventListener('change', renderSpeedTiers);

// --- 7. INTELIGENCIA DE DASHBOARD (MATRIZ Y LEADS) ---
function calculateLeadsAndThreats() {
    const validEnemies = enemyTeam.filter(Boolean);
    if(validEnemies.length === 0) return;

    // Calcular amenaza principal (El enemigo que mejor Score Defensivo/Ofensivo tiene contra todo tu equipo)
    let biggestThreat = null;
    let worstGlobalScore = 999; 

    validEnemies.forEach(enemy => {
        let scoreVsMyTeam = 0;
        myTeam.forEach(me => scoreVsMyTeam += getMatchupScore(me, enemy));
        if (scoreVsMyTeam < worstGlobalScore) {
            worstGlobalScore = scoreVsMyTeam;
            biggestThreat = enemy;
        }
    });

    if(biggestThreat) {
        document.getElementById('threat-text').innerHTML = `
            <strong>${biggestThreat.name.toUpperCase()}</strong><br>
            <span style="font-size:0.85rem; color:var(--text-muted)">Tiene un matchup muy dominante por STAB. Vigila sus coberturas.</span>
        `;
    }

    // Lead Sugerido (Tus dos Pokémon más rápidos que no tengan puntuación negativa vs la core rival)
    const sortedMyTeam = [...myTeam].sort((a,b) => b.actualSpeed - a.actualSpeed);
    if(sortedMyTeam.length >= 2) {
        document.getElementById('optimal-lead-text').innerHTML = `
            <strong>${sortedMyTeam[0].name.toUpperCase()} + ${sortedMyTeam[1].name.toUpperCase()}</strong><br>
            <span style="font-size:0.85rem; color:var(--text-muted)">Garantizan velocidad. Asegúrate de que no comparten debilidad a ${biggestThreat ? biggestThreat.name : 'la core rival'}.</span>
        `;
    }
}

function renderMatrix() {
    const matrix = document.getElementById('matchup-grid');
    matrix.innerHTML = '';
    const validEnemies = enemyTeam.filter(Boolean);

    myTeam.forEach((me, index) => {
        // Calcular Score Neto de este Pokémon contra todo el equipo rival
        let totalScore = 0;
        validEnemies.forEach(enemy => {
            totalScore += getMatchupScore(me, enemy);
        });

        // Limitar visualmente entre -3 y +3 para claridad
        let displayScore = Math.max(-3, Math.min(3, Math.floor(totalScore)));
        let scoreClass = displayScore > 0 ? 'score-good' : (displayScore < 0 ? 'score-bad' : 'score-neutral');
        let scoreText = displayScore > 0 ? `+${displayScore}` : displayScore;

        const row = document.createElement('div');
        row.className = 'matchup-row';
        row.innerHTML = `
            <img src="${me.sprite}" class="sprite-icon">
            <div class="matchup-score ${scoreClass}">${scoreText}</div>
            <div style="flex:1;">
                <strong style="text-transform: capitalize;">${me.name}</strong>
                <div style="font-size: 0.75rem; color: var(--text-muted)">
                    Tipos: ${me.isTeraMode ? `<span style="color:var(--primary)">Tera ${me.teraType}</span>` : me.types.join('/')}
                </div>
            </div>
            <button class="tera-btn ${me.isTeraMode ? 'tera-active' : ''}" data-index="${index}">
                ${me.isTeraMode ? 'Tera ON' : 'Tera Sim'}
            </button>
        `;
        matrix.appendChild(row);
    });

    // Eventos de Botón Tera Sim (Recalcula la matriz en tiempo real)
    document.querySelectorAll('.tera-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.target.getAttribute('data-index');
            myTeam[index].isTeraMode = !myTeam[index].isTeraMode;
            renderMatrix(); // Re-render de la vista al cambiar el estado
            calculateLeadsAndThreats(); // Recalcula si de repente tu peor amenaza cambia
        });
    });
}

document.getElementById('btn-reset').addEventListener('click', () => location.reload());
