import { MEGA_STONES } from '../core/constants.js';
import { state } from '../core/state.js';
import { formatName, normalizeText, slugFromSmogonName } from '../utils/text.js';
import { topEntries } from '../utils/types.js';
import { parseSpread } from '../battle/stats.js';
import { getMetaRecord } from './meta.js';
import { ensureBattleState } from './pokemon.js';
import { getCanonicalAbility, getCanonicalItem, getCanonicalMove, getCanonicalSpecies } from './canonical/dex.js';

function canonicalItemName(value) {
  const canonical = getCanonicalItem(value);
  return canonical?.name || formatName(normalizeText(value));
}

export function chooseBestItem(itemEntries, side, ignoreIndex = -1, speciesId = "") {
  // Force mega stone if species is a mega
  const entryPair = Object.entries(MEGA_STONES).find(
    ([, megaId]) => megaId === speciesId,
  );
  if (entryPair) {
    return canonicalItemName(entryPair[0]);
  }

  const usedItems = new Set(
    state[side]
      .map((mon, idx) => (idx === ignoreIndex ? null : mon?.set?.item))
      .filter(Boolean)
      .map(i => normalizeText(i))
  );
  const sorted = topEntries(itemEntries, 8).map((x) => canonicalItemName(x.key));
  const free = sorted.find((item) => !usedItems.has(normalizeText(item)));
  return free || sorted[0] || "";
}

// Item Clause sobre un equipo recién construido: chooseBestItem deduplica
// contra state[side], pero fillTeamWithSpecies construye los 6 sets ANTES de
// asignarlos al estado, así que veía el equipo anterior. Este post-paso
// reasigna a cada duplicado su siguiente objeto más usado que quede libre.
export function resolveTeamItems(mons) {
  const used = new Set();
  for (const mon of mons) {
    if (!mon?.set) continue;
    const current = normalizeText(mon.set.item || '');
    if (!current) continue;
    if (!used.has(current)) {
      used.add(current);
      continue;
    }
    const candidates = (mon.set.raw?.items || []).map((x) => x.key).filter(Boolean);
    const free = candidates.find((item) => !used.has(normalizeText(item)));
    mon.set.item = free || '';
    mon.set._itemAutoResolved = true;
    if (free) used.add(normalizeText(free));
  }
  return mons;
}

export function buildDefaultSetForSpecies(speciesId, side = "self", slotIndex = -1) {
  const record = getMetaRecord(speciesId);
  const entry = record?.entry || null;

  if (!entry) {
    // Sin datos meta: set genérico marcado para que la UI lo señale (⚠).
    // No se inventan movimientos (no hay learnset en el dex generado).
    const species = getCanonicalSpecies(speciesId);
    return {
      source: "fallback",
      _generic: true,
      rating: state.rating,
      ability: species?.abilities?.['0'] || "",
      item: chooseBestItem({}, side, slotIndex, speciesId),
      nature: "",
      evs: null,
      moves: [],
      teammates: [],
    };
  }

  // Nombres canónicos para display ("Colbur Berry", "Thick Fat") en lugar del
  // slug capitalizado del usage de Smogon ("Colburberry", "Thickfat").
  const formatSmogonStr = (str, cat) => {
    const canonical = cat === 'move' ? getCanonicalMove(str)
      : cat === 'ability' ? getCanonicalAbility(str)
      : cat === 'item' ? getCanonicalItem(str)
      : null;
    return canonical?.name || formatName(normalizeText(str));
  };

  const abilities = topEntries(entry.Abilities || {}, 3).map(x => ({...x, key: formatSmogonStr(x.key, 'ability')}));
  const items = topEntries(entry.Items || {}, 6).map(x => ({...x, key: formatSmogonStr(x.key, 'item')}));
  const moves = topEntries(entry.Moves || {}, 8)
    .map((x) => formatSmogonStr(x.key, "move"))
    .filter(Boolean)
    .filter((move) => !normalizeText(move).includes("nothing"))
    .slice(0, 4);

  const spreads = topEntries(entry.Spreads || entry["Spreads"] || {}, 3);
  const spread = parseSpread(spreads[0]?.key || "");
  const teammates = topEntries(entry.Teammates || {}, 6).map((x) =>
    slugFromSmogonName(x.key),
  );

  const mon = {
    source: "smogon-chaos",
    rating: state.rating,
    ability: abilities[0]?.key || "",
    item: chooseBestItem(entry.Items || {}, side, slotIndex, speciesId),
    nature: spread.nature || "",
    evs: spread.evs || null,
    _evScale: spread.evScale || "full",
    moves,
    teammates,
    raw: {
      abilities,
      items,
      spreads,
      moves: topEntries(entry.Moves || {}, 8).map(x => ({...x, key: formatSmogonStr(x.key, 'move')})),
      teammates: topEntries(entry.Teammates || {}, 6),
    },
  };

  ensureBattleState(mon);
  return mon;
}
