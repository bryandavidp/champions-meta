import { GUARANTEED_MULTI_HITS, TYPE_META, SPREAD_MOVES, MOVE_PRIORITY_LEVELS } from '../core/constants.js';
import { state } from '../core/state.js';
import { getDamageCache, getComboBestAttackCache, getRegistryBridge } from '../core/runtime.js';
import { effectiveness } from '../utils/types.js';
import { calcMonHP, calculateEffectiveStats } from './stats.js';
import { getMoveCandidates } from './moves.js';
import { smartLog } from '../utils/debug.js';

export function getWeatherAndTerrainMultipliers(field, candType, candMove) {
  let wMul = 1;
  const w = field.weather;
  if (w === "sun") {
    if (candType === "fire") wMul *= 1.5;
    if (candType === "water") wMul *= 0.5;
  } else if (w === "rain") {
    if (candType === "water") wMul *= 1.5;
    if (candType === "fire") wMul *= 0.5;
  }

  let terrMul = 1;
  if (field.terrain === "electric" && candType === "electric") terrMul *= 1.3;
  if (field.terrain === "grassy" && candMove === "Earthquake") terrMul *= 0.5;

  return { wMul, terrMul };
}

export function applyRegistryDamageModifiers(attacker, defender, cand, fieldSnapshot, eff, dmgClass, stats) {
  let registry = null;
  let registryDamageMul = 1;
  let blockedByRegistry = false;
  let { atkS, defS } = stats;

  if (!getRegistryBridge()) {
    return { registry, registryDamageMul, blockedByRegistry, atkS, defS };
  }

  try {
    registry = getRegistryBridge().resolveDamageModifiers(
      attacker, defender, cand, { field: fieldSnapshot, effectiveness: eff }
    );

    if (registry?.final) {
      if (Number.isFinite(registry.final.damageMultiplier)) registryDamageMul *= registry.final.damageMultiplier;
      if (Number.isFinite(registry.final.attackMultiplier) && dmgClass === 'physical') atkS = Math.floor(atkS * registry.final.attackMultiplier);
      if (Number.isFinite(registry.final.specialAttackMultiplier) && dmgClass === 'special') atkS = Math.floor(atkS * registry.final.specialAttackMultiplier);
      if (Number.isFinite(registry.final.specialDefenseMultiplier) && dmgClass === 'special') defS = Math.max(1, Math.floor(defS * registry.final.specialDefenseMultiplier));

      const prev = registry.prevention?.final || {};
      if (prev.immune || prev.blockedByPriority || prev.blockedByStatus || prev.blockedBySecondaryShield) {
        blockedByRegistry = true;
      }
    }
  } catch (e) {
    console.warn('[DEBUG] resolveDamageModifiers error', e);
  }

  return { registry, registryDamageMul, blockedByRegistry, atkS, defS };
}

export function calculateDamageRolls(baseTotal) {
  const rolls = [];
  for (let i = 0; i < 16; i++) {
    rolls.push(Math.floor(baseTotal * (0.85 + (i / 15) * 0.15)));
  }
  return { maxDamage: Math.max(...rolls), minDamage: Math.min(...rolls), critDamage: Math.floor(baseTotal * 1.5) };
}

export function estimateMoveDamage(attacker, defender, cand, field) {
  if (!attacker || !defender || !cand) return { damage: 0, minDamage: 0, maxDamage: 0 };

  const moveNameStr = typeof cand === 'string' ? cand : (cand.move || cand.name || 'unknown');
  const atkStage = attacker.battle?.stages?.atk || 0;
  const spaStage = attacker.battle?.stages?.spa || 0;
  const defStage = defender.battle?.stages?.def || 0;
  const spdStage = defender.battle?.stages?.spd || 0;
  const cacheKey = `${attacker.name}(${atkStage},${spaStage})-${defender.name}(${defStage},${spdStage})-${moveNameStr}-${field?.weather || 'none'}-${field?.terrain || 'none'}`;

  // SHORT-CIRCUIT: Salir inmediatamente, cero logs, cero lag
  if (getDamageCache()[cacheKey]) {
      return getDamageCache()[cacheKey];
  }

  let basePower = cand.power || 0;
  const info = state.moveTypeCache[cand.move];
  const dmgClass = cand.damageClass || info?.damageClass || "physical";
  if (basePower <= 0 || dmgClass === "status") {
      const res = { damage: 0, minDamage: 0, maxDamage: 0, blocked: false };
      getDamageCache()[cacheKey] = res;
      return res;
  }

  const moveName = cand.move || '';
  const isSpread = !!cand.isSpread || SPREAD_MOVES.has(moveName.toLowerCase());
  const hits = cand.hits || GUARANTEED_MULTI_HITS[moveName] || 1;

  let moveType = cand.type;

  // Lógica de Weather Ball protegida
  const moveId = moveName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const isGuaranteedCrit = ['surgingstrikes', 'wickedblow', 'flowertrick', 'frostbreath', 'stormthrow'].includes(moveId);
  if (moveId === 'weatherball' && field.weather) {
      basePower = 100;
      if (field.weather === 'sun') moveType = 'fire';
      else if (field.weather === 'rain') moveType = 'water';
      else if (field.weather === 'sand' || field.weather === 'sandstorm') moveType = 'rock';
      else if (field.weather === 'snow' || field.weather === 'hail') moveType = 'ice';
  }

  const eff = effectiveness(moveType, defender.types || []);
  let { wMul, terrMul } = getWeatherAndTerrainMultipliers(field, moveType, moveName);

  // Modificadores de clima reales
  if (field.weather === 'sun') {
      if (moveType.toLowerCase() === 'fire') wMul = 1.5;
      else if (moveType.toLowerCase() === 'water') wMul = 0.5;
  } else if (field.weather === 'rain') {
      if (moveType.toLowerCase() === 'water') wMul = 1.5;
      else if (moveType.toLowerCase() === 'fire') wMul = 0.5;
  }

  let { atkS: atkStat, defS: defStat } = calculateEffectiveStats(attacker, defender, dmgClass);

  // Habilidades ofensivas (Huge Power) sanitizadas
  const attackerAbility = (attacker.set?.ability || attacker.ability || '').toLowerCase().replace(/\s/g, '');
  if ((attackerAbility === 'hugepower' || attackerAbility === 'purepower') && dmgClass === 'physical') {
      atkStat *= 2; 
  }

  // Objetos defensivos sanitizados
  const defenderItem = (defender.set?.item || '').toLowerCase().replace(/\s/g, '');
  if (defenderItem === 'eviolite' || (defenderItem === 'assaultvest' && dmgClass === 'special')) {
      defStat *= 1.5;
  }

  const fieldSnapshot = getRegistryBridge()
    ? getRegistryBridge().createCurrentFieldSnapshot(state)
    : field;

  const regResult = applyRegistryDamageModifiers(attacker, defender, { ...cand, type: moveType, power: basePower }, fieldSnapshot, eff, dmgClass, { atkS: atkStat, defS: defStat });
  atkStat = regResult.atkS;
  defStat = regResult.defS;

  const stab = (attacker.types || []).some(t => t.toLowerCase() === moveType.toLowerCase()) ? 1.5 : 1;
  const defSafe = Math.max(1, defStat);

  // --- INICIO DE INTERCEPTACIÓN DE INMUNIDADES ---
  const defAbility = (defender.set?.ability || defender.ability || '').toLowerCase().replace(/[^a-z]/g, '');
  const defAbilityName = defender.set?.ability || defender.ability || 'Habilidad';
  const defItem = (defender.set?.item || defender.item || '').toLowerCase().replace(/[^a-z]/g, '');
  const defItemName = defender.set?.item || defender.item || 'Objeto';
  const defTypes = (defender.types || []).map(t => t.toLowerCase());

  let immunityData = null;

  // 1. Inmunidades a Tierra (Levitación, Globo Helio, y seguro nativo para Voladores)
  if (moveType === 'ground') {
      if (defItem !== 'ironball' && defItem !== 'bolaferrea') {
          if (defAbility === 'levitate' || defAbility === 'levitacion') immunityData = { type: 'ability', name: defAbilityName };
          else if (defItem === 'airballoon' || defItem === 'globohelio') immunityData = { type: 'item', name: defItemName };
          else if (defTypes.includes('flying')) immunityData = { type: 'type', name: 'Tipo Volador' };
      }
  }

  // 2. Inmunidades Elementales por Habilidad Clásicas
  else if (moveType === 'water' && ['waterabsorb', 'absorbeagua', 'stormdrain', 'colector', 'dryskin', 'pielseca'].includes(defAbility)) immunityData = { type: 'ability', name: defAbilityName };
  else if (moveType === 'fire' && ['flashfire', 'absorbefuego', 'wellbakedbody', 'cuerpohorneado'].includes(defAbility)) immunityData = { type: 'ability', name: defAbilityName };
  else if (moveType === 'electric' && ['voltabsorb', 'absorbeelec', 'motordrive', 'electromotor', 'lightningrod', 'pararrayos'].includes(defAbility)) immunityData = { type: 'ability', name: defAbilityName };
  else if (moveType === 'grass' && ['sapsipper', 'herbivoro'].includes(defAbility)) immunityData = { type: 'ability', name: defAbilityName };
  else if (moveType === 'ground' && ['eartheater', 'geofagia'].includes(defAbility)) immunityData = { type: 'ability', name: defAbilityName };

  // 3. Inmunidad a Polvos/Esporas (Grass types y Overcoat)
  else if (['spore', 'espora', 'sleeppowder', 'somnifero', 'ragepowder', 'polvoira'].includes(moveName.toLowerCase().replace(/[^a-z]/g, ''))) {
      if (['overcoat', 'funda'].includes(defAbility)) immunityData = { type: 'ability', name: defAbilityName };
      else if (defItem === 'safetygoggles' || defItem === 'gafasprotectoras') immunityData = { type: 'item', name: defItemName };
      else if (defTypes.includes('grass')) immunityData = { type: 'type', name: 'Tipo Planta' };
  }
  // --- FIN DE INTERCEPTACIÓN ---

  const blocked = (field.terrain === 'psychic' && (MOVE_PRIORITY_LEVELS[String(moveName).toLowerCase()] || 0) > 0) || regResult.blockedByRegistry || immunityData !== null;

  if (blocked) {
    if (!immunityData && field.terrain === 'psychic' && (MOVE_PRIORITY_LEVELS[String(moveName).toLowerCase()] || 0) > 0) {
        immunityData = { type: 'field', name: 'Campo Psíquico' };
    }
    const res = { damage: 0, minDamage: 0, maxDamage: 0, blocked: true, wMul, terrMul, registry: regResult.registry, immunityData };
    getDamageCache()[cacheKey] = res;
    return res;
  }

  let basePerHit = (((((22 * basePower * atkStat) / defSafe) / 50) + 2) * stab * eff * wMul * terrMul * regResult.registryDamageMul);
  if (isSpread) basePerHit *= 0.75;
  if (isGuaranteedCrit) basePerHit *= 1.5;

  // Habilidad defensiva: Fur Coat
  const defenderAbility = (defender.set?.ability || '').toLowerCase().replace(/\s/g, '');
  if (defenderAbility === 'furcoat' && dmgClass === 'physical') {
      basePerHit *= 0.5;
  }

  const { maxDamage, minDamage, critDamage } = calculateDamageRolls(basePerHit * hits);

  // NUEVO LOG INTELIGENTE (Justo antes de guardar en caché y hacer return)
  const tags = [];
  if (wMul > 1 && field.weather === 'sun') tags.push("🔥 Sol x1.5");
  if (wMul > 1 && (field.weather === 'rain' || field.weather === 'rainstorm')) tags.push("💧 Lluvia x1.5");
  if (wMul < 1 && field.weather === 'sun') tags.push("🔥 Sol x0.5");
  if (wMul < 1 && (field.weather === 'rain' || field.weather === 'rainstorm')) tags.push("💧 Lluvia x0.5");
  if (stab > 1) tags.push("⚔️ STAB");
  if (isSpread) tags.push("📉 Spread x0.75");
  if (atkStage < 0) tags.push("🛡️ Intimidado x0.66");

  smartLog(
      `dmg-${cacheKey}`, 
      `💥 [DAMAGE] ${attacker.name} [Atk: ${atkStat} (Stage:${atkStage})] usa ${moveNameStr} vs ${defender.name} [Def: ${defStat} (Stage:${defStage})] | BP: ${basePower} | Modificadores: Clima(${wMul || 1}), Spread(${isSpread ? '0.75' : '1'}) | Rango: ${minDamage} - ${maxDamage}`
  );

  const finalResult = {
    damage: maxDamage,
    minDamage,
    maxDamage,
    critDamage,
    blocked: false,
    wMul,
    terrMul,
    registry: regResult.registry,
    tags
  };

  // 3. GUARDAR EN LA CACHÉ ANTES DE SALIR
  getDamageCache()[cacheKey] = finalResult;
  return finalResult;
}

export function bestAttack(attacker, defender, field = state.field) {
  if (getComboBestAttackCache()) {
      const atkStage = attacker.battle?.stages?.atk || 0;
      const defStage = defender.battle?.stages?.def || 0;
      const cacheKey = `${attacker.name}(${atkStage})-${defender.name}(${defStage})-${field.weather}-${field.terrain}`;
      if (getComboBestAttackCache()[cacheKey]) return getComboBestAttackCache()[cacheKey];
  }

  const candidates = getMoveCandidates(attacker);
  if (!candidates.length) {
    console.warn(`[DEBUG] bestAttack: No candidates for attacker ${attacker?.name} vs ${defender?.name}`);
    return {
      type: "normal",
      mult: 1,
      rawMult: 1,
      wMul: 1,
      terrMul: 1,
      blocked: false,
      move: "",
      power: 0,
      damage: 0,
      minPct: 0,
      maxPct: 0,
      ohkoProb: 0,
      ohko: false,
    };
  }

  const baseHP = calcMonHP(defender);
  const hpPct = defender.battle?.hpPct ?? 100;
  const defHP = Math.max(1, Math.floor((baseHP * hpPct) / 100));
  const scored = candidates.map((c) => {
    const cacheKey = `${attacker.name}-${defender.name}-${c.move}-${field.weather}-${field.terrain}`;
    let damageObj;
    if (getDamageCache()[cacheKey]) {
        damageObj = getDamageCache()[cacheKey];
    } else {
        damageObj = estimateMoveDamage(attacker, defender, c, field);
        getDamageCache()[cacheKey] = damageObj;
    }
    
    const {
      damage,
      minDamage: minRoll,
      maxDamage: maxRoll,
      blocked,
      wMul = 1,
      terrMul = 1,
      registry = null,
      immunityData = null
    } = damageObj;
    
    const rawMult = effectiveness(c.type, defender?.types || []);
    const mult = blocked ? 0 : rawMult * wMul * terrMul;
    
    const maxDamage = Number.isFinite(maxRoll) ? maxRoll : damage;
    const minDamage = Number.isFinite(minRoll) ? minRoll : Math.floor(maxDamage * 0.85);
    const maxPct = Math.min(100, Math.floor((maxDamage / defHP) * 100));
    const minPct = Math.min(100, Math.floor((minDamage / defHP) * 100));
    
    let ohkoProb = 0;
    if (maxDamage >= defHP) {
        if (minDamage >= defHP) ohkoProb = 100;
        else ohkoProb = Math.floor(((maxDamage - defHP) / Math.max(1, maxDamage - minDamage)) * 100);
    }
    const ohko = ohkoProb > 0;

    return {
      type: c.type,
      mult,
      rawMult,
      wMul,
      terrMul,
      blocked,
      move: c.move || TYPE_META[c.type]?.name || c.type,
      power: c.power || 0,
      damage: maxDamage,
      minPct, maxPct, ohkoProb,
      ohko,
      registry,
      immunityData,
      registryReasons: registry ? registry.reasons : [],
      registryExplain: (getRegistryBridge() && registry) ? getRegistryBridge().buildExplainLines(registry) : [],
      tags: damageObj.tags || []
    };
  });

  scored.sort((a, b) => {
    if (b.damage !== a.damage) return b.damage - a.damage;
    if (b.mult !== a.mult) return b.mult - a.mult;
    return (b.power || 0) - (a.power || 0);
  });

  if (getComboBestAttackCache()) {
      const atkStage = attacker.battle?.stages?.atk || 0;
      const defStage = defender.battle?.stages?.def || 0;
      const cacheKey = `${attacker.name}(${atkStage})-${defender.name}(${defStage})-${field.weather}-${field.terrain}`;
      getComboBestAttackCache()[cacheKey] = scored[0];
  }

  return scored[0];
}
