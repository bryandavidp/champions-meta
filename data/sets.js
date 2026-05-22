import { MEGA_STONES } from '../core/constants.js';
import { state } from '../core/state.js';
import { formatName, normalizeText, slugFromSmogonName } from '../utils/text.js';
import { topEntries } from '../utils/types.js';
import { parseSpread } from '../battle/stats.js';
import { getMetaRecord } from './meta.js';
import { ensureBattleState } from './pokemon.js';

export function chooseBestItem(itemEntries, side, ignoreIndex = -1, speciesId = "") {
  // Force mega stone if species is a mega
  const entryPair = Object.entries(MEGA_STONES).find(
    ([, megaId]) => megaId === speciesId,
  );
  if (entryPair) {
    return formatName(entryPair[0]);
  }

  const usedItems = new Set(
    state[side]
      .map((mon, idx) => (idx === ignoreIndex ? null : mon?.set?.item))
      .filter(Boolean)
      .map(i => normalizeText(i))
  );
  const sorted = topEntries(itemEntries, 8).map((x) => formatName(normalizeText(x.key)));
  const free = sorted.find((item) => !usedItems.has(normalizeText(item)));
  return free || sorted[0] || "";
}

export function buildDefaultSetForSpecies(speciesId, side = "self", slotIndex = -1) {
  const record = getMetaRecord(speciesId);
  const entry = record?.entry || null;

  if (!entry) {
    return {
      source: "fallback",
      rating: state.rating,
      ability: "",
      item: chooseBestItem({}, side, slotIndex, speciesId),
      nature: "",
      evs: null,
      moves: [],
      teammates: [],
    };
  }

  const formatSmogonStr = (str, cat) => formatName(normalizeText(str));

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
