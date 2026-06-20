import { SPREAD_MOVES, DAMAGE_THRESHOLDS } from '../core/constants.js';
import { state } from '../core/state.js';
import { calculateSpeed } from '../battle/speed.js';
import { bestAttack } from '../battle/damage.js';
import { fetchMoveInfo } from '../battle/moves.js';
import { resolveMovePriority } from '../battle/formulas.js';

const PROTECT_MOVES = new Set(['protect', 'proteccion', 'detect', 'deteccion', 'spikyshield', 'barreraespinosa', 'kingsshield', 'escudoreal']);
const SASH_ITEMS = new Set(['focussash', 'bandafocus']);
const STURDY_ABILITIES = new Set(['sturdy', 'robustez']);

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function movePriority(moveName, mon = null, field = null) {
  return resolveMovePriority(moveName, mon, field);
}

function hasProtect(mon) {
  return (mon?.set?.moves || []).some((move) => PROTECT_MOVES.has(slug(move)));
}

function hasSash(mon) {
  return SASH_ITEMS.has(slug(mon?.set?.item || mon?.item || ''));
}

function hasSturdy(mon) {
  return STURDY_ABILITIES.has(slug(mon?.set?.ability || mon?.ability || ''));
}

function isSpreadMove(atk) {
  const moveId = slug(atk?.move);
  const info = fetchMoveInfo(atk?.move) || {};
  return !!atk?.isSpread || !!info.isSpread || Array.from(SPREAD_MOVES || []).some((move) => slug(move) === moveId);
}

function addUnique(tags, tag) {
  if (!tag || tags.some((item) => item.id === tag.id)) return;
  tags.push(tag);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getHpPct(defender) {
  const hpPct = Number(defender?.battle?.hpPct);
  return Number.isFinite(hpPct) ? Math.max(1, Math.min(100, hpPct)) : 100;
}

function getSpeed(entry, side, field) {
  if (Number.isFinite(entry?.speed)) return entry.speed;
  if (!entry?.mon) return 0;
  return calculateSpeed(entry.mon, side, field);
}

function movesBefore(attacker, defender, atk, context) {
  const field = context.field || state.field || {};
  const attackerSide = context.attackerSide || 'self';
  const defenderSide = context.defenderSide || (attackerSide === 'self' ? 'enemy' : 'self');
  const attackerEntry = context.attackerEntry || { mon: attacker, side: attackerSide };
  const defenderEntry = context.defenderEntry || { mon: defender, side: defenderSide };
  const ownPrio = Number.isFinite(context.attackerPriority) ? context.attackerPriority : movePriority(atk?.move, attacker, field);
  const enemyPrio = Number.isFinite(context.defenderPriority) ? context.defenderPriority : 0;
  if (ownPrio !== enemyPrio) return ownPrio > enemyPrio;
  const ownSpeed = getSpeed(attackerEntry, attackerSide, field);
  const enemySpeed = getSpeed(defenderEntry, defenderSide, field);
  return ownSpeed >= enemySpeed;
}

function defenderCanKoBack(attacker, defender, context) {
  if (!attacker || !defender) return false;
  try {
    const back = context.defenderBestAttack || bestAttack(defender, attacker, context.field || state.field);
    return !!(back?.ohko || back?.ohkoProb >= 50 || back?.minPct >= 100 || back?.maxPct >= 100);
  } catch {
    return false;
  }
}

function baseKoTags(atk, defender, context) {
  const tags = [];
  const minPct = Number(atk?.minPct || 0);
  const maxPct = Number(atk?.maxPct || 0);
  const ohkoProb = Number(atk?.ohkoProb || 0);
  const lethalClean = minPct >= 100 || ohkoProb >= 100;
  const lethalRoll = maxPct >= 100 || ohkoProb > 0 || atk?.ohko;
  const hpPct = getHpPct(defender);
  const chipNeeded = Math.max(0, 100 - maxPct);

  if (atk?.blocked || atk?.mult === 0) {
    addUnique(tags, { id: 'ko-blocked', label: 'KO no fiable', tone: 'red', type: 'invalidator' });
    return tags;
  }

  if (lethalClean) {
    addUnique(tags, { id: 'ohko-clean', label: 'OHKO limpio', tone: 'green', type: 'result' });
  } else if (lethalRoll) {
    addUnique(tags, {
      id: ohkoProb >= DAMAGE_THRESHOLDS.koRollOhko ? 'roll-high' : 'ko-unreliable',
      label: ohkoProb >= DAMAGE_THRESHOLDS.koRollOhko ? 'depende de roll alto' : 'KO no fiable',
      tone: ohkoProb >= DAMAGE_THRESHOLDS.koRollOhko ? 'amber' : 'red',
      type: 'prereq',
    });
  } else if (maxPct >= DAMAGE_THRESHOLDS.requiresChipMaxPct) {
    addUnique(tags, {
      id: 'requires-chip',
      label: chipNeeded > 0 ? `requiere chip ${Math.ceil(chipNeeded)}%` : 'requiere chip',
      tone: 'amber',
      type: 'prereq',
    });
  }

  if (hpPct < 100 && maxPct >= 100 && !lethalClean) {
    addUnique(tags, { id: 'ko-after-chip', label: 'KO tras chip', tone: 'amber', type: 'prereq' });
  }

  return tags;
}

export function evaluateKoConditions(attacker, defender, atk, options = {}) {
  const context = {
    field: options.field || state.field || {},
    attackerSide: options.attackerSide || options.side || 'self',
    defenderSide: options.defenderSide || (options.attackerSide === 'enemy' ? 'self' : 'enemy'),
    attackerEntry: options.attackerEntry,
    defenderEntry: options.defenderEntry,
    attackerPriority: options.attackerPriority,
    defenderPriority: options.defenderPriority,
    defenderBestAttack: options.defenderBestAttack,
  };

  const tags = baseKoTags(atk, defender, context);
  const minPct = Number(atk?.minPct || 0);
  const maxPct = Number(atk?.maxPct || 0);
  const lethal = minPct >= 100 || maxPct >= 100 || Number(atk?.ohkoProb || 0) > 0 || !!atk?.ohko;
  const protect = hasProtect(defender);
  const currentHpPct = Math.max(0, Math.min(100, Number(defender?.battle?.hpPct ?? 100)));
  const fullHp = currentHpPct >= 99;
  const sash = fullHp && hasSash(defender);
  const sturdy = fullHp && hasSturdy(defender);
  const spread = isSpreadMove(atk);
  const weatherBoost = Number(atk?.wMul || 1) > 1 && !!context.field?.weather;
  const before = movesBefore(attacker, defender, atk, context);
  const canKoBack = defenderCanKoBack(attacker, defender, context);

  if (weatherBoost && lethal) {
    addUnique(tags, { id: 'requires-weather', label: 'OHKO con clima', tone: 'amber', type: 'prereq' });
  }

  if (spread && lethal) {
    addUnique(tags, { id: 'spread-low-roll', label: 'spread roll bajo', tone: 'amber', type: 'prereq' });
  }

  if ((sash || sturdy) && lethal) {
    addUnique(tags, {
      id: sash ? 'breaks-sash' : 'breaks-sturdy',
      label: sash ? 'rompe sash primero' : 'rompe sturdy primero',
      tone: 'amber',
      type: 'invalidator',
    });
  }

  if (protect && (lethal || maxPct >= DAMAGE_THRESHOLDS.requiresChipMaxPct)) {
    addUnique(tags, { id: 'loses-to-protect', label: 'no mata si Protect', tone: 'red', type: 'invalidator' });
  }

  if (lethal && canKoBack && !before) {
    addUnique(tags, { id: 'must-move-first', label: 'solo si mueve antes', tone: 'red', type: 'prereq' });
  } else if (lethal && canKoBack && before) {
    addUnique(tags, { id: 'moves-first', label: 'mueve antes', tone: 'green', type: 'support' });
  }

  if (!tags.length && maxPct > 0) {
    addUnique(tags, { id: 'no-ko-pressure', label: maxPct >= DAMAGE_THRESHOLDS.pressureMaxPct ? 'presion sin KO' : 'chip bajo', tone: maxPct >= DAMAGE_THRESHOLDS.pressureMaxPct ? 'amber' : 'red', type: 'result' });
  }

  const visible = tags.slice(0, options.maxVisible || 3);
  return {
    tags,
    visible,
    hiddenCount: Math.max(0, tags.length - visible.length),
    primary: tags[0] || null,
    reliable: tags.some((tag) => tag.id === 'ohko-clean') && !tags.some((tag) => tag.tone === 'red'),
  };
}

export function renderKoConditionChips(koInfo, options = {}) {
  const info = Array.isArray(koInfo) ? { visible: koInfo, hiddenCount: 0 } : (koInfo || {});
  const visible = info.visible || info.tags || [];
  const allTags = info.tags || visible;
  const hiddenCount = Number(info.hiddenCount || 0);
  if (!visible.length && !hiddenCount) return '';

  const chips = visible.map((tag) => (
    `<span class="ko-condition-chip ko-condition-chip--${tag.tone || 'amber'}">${escapeHtml(tag.label)}</span>`
  )).join('');
  const hiddenTitle = allTags.slice(visible.length).map((tag) => tag.label).join(' · ');
  const more = hiddenCount > 0
    ? `<span class="ko-condition-chip ko-condition-chip--more" role="button" tabindex="0" title="${escapeHtml(hiddenTitle)}">+${hiddenCount}</span>`
    : '';
  const extraClass = options.compact ? ' ko-condition-row--compact' : '';
  return `<div class="ko-condition-row${extraClass}">${chips}${more}</div>`;
}
