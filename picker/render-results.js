import { TYPE_META } from '../core/constants.js';
import { state } from '../core/state.js';
import { escapeHtml, normalizeText } from '../utils/text.js';
import { fallbackSprite } from './search-index.js';
import { getRecentEntries } from './recent-picks.js';

function formatUsage(value) {
  const usage = Number(value || 0);
  if (usage >= 1000000) return `${(usage / 1000000).toFixed(1)}M`;
  if (usage >= 1000) return `${Math.round(usage / 1000)}k`;
  return String(usage);
}

function highlightMatch(label, query) {
  const safe = escapeHtml(label);
  const q = normalizeText(query);
  if (!q || q.length < 2) return safe;
  const plain = String(label || '');
  const lower = plain.toLowerCase();
  const rawQuery = String(query || '').trim().toLowerCase();
  const idx = rawQuery ? lower.indexOf(rawQuery) : -1;
  if (idx === -1) return safe;
  return `${escapeHtml(plain.slice(0, idx))}<mark>${escapeHtml(plain.slice(idx, idx + rawQuery.length))}</mark>${escapeHtml(plain.slice(idx + rawQuery.length))}`;
}

function renderTypeChips(types = []) {
  return types.slice(0, 2).map((type) => {
    const meta = TYPE_META[type] || { short: type.slice(0, 2), color: '#8aa2c6' };
    return `<span class="result-type-chip" style="--type-color:${meta.color};">${escapeHtml(meta.short || type)}</span>`;
  }).join('');
}

function renderFormBadge(mon) {
  if (mon.tags?.isMega) return '<span class="result-tag-chip">Mega</span>';
  if (mon.tags?.isHisui) return '<span class="result-tag-chip">Hisui</span>';
  if (mon.tags?.isGalar) return '<span class="result-tag-chip">Galar</span>';
  if (mon.tags?.isAlola) return '<span class="result-tag-chip">Alola</span>';
  if (mon.tags?.isPaldea) return '<span class="result-tag-chip">Paldea</span>';
  return '';
}

function renderQuickGroups(index) {
  const groups = [
    { id: 'recent', title: 'Recientes', entries: getRecentEntries(index, 8) },
    { id: 'top', title: 'Top Meta', entries: index.slice().sort((a, b) => (a.rank || 9999) - (b.rank || 9999)).slice(0, 12) },
    { id: 'mega', title: 'Megas', entries: index.filter((entry) => entry.tags?.isMega).slice(0, 12) },
    { id: 'tr', title: 'TR', entries: index.filter((entry) => entry.roleTokens.includes('trickroom')).slice(0, 12) },
    { id: 'tw', title: 'Tailwind', entries: index.filter((entry) => entry.roleTokens.includes('tailwind')).slice(0, 12) },
    { id: 'fakeout', title: 'Fake Out', entries: index.filter((entry) => entry.roleTokens.includes('fakeout')).slice(0, 12) },
    { id: 'redirect', title: 'Redirección', entries: index.filter((entry) => entry.roleTokens.includes('redirect')).slice(0, 12) },
    { id: 'weather', title: 'Clima', entries: index.filter((entry) => ['sun', 'rain', 'sand', 'snow'].some((role) => entry.roleTokens.includes(role))).slice(0, 12) },
  ].filter((group) => group.entries.length);

  if (!groups.length) return '';
  const isOpen = state.pickerSearch?.quickFiltersOpen !== false;

  return `
    <div class="picker-quick-groups ${isOpen ? 'is-open' : 'is-collapsed'}">
      <button
        class="picker-quick-toggle"
        type="button"
        data-action="toggle-picker-filters"
        aria-expanded="${isOpen ? 'true' : 'false'}"
      >
        <span>Filtros rápidos</span>
        <span class="picker-quick-toggle-meta">${groups.length} grupos · ${isOpen ? 'Ocultar' : 'Mostrar'}</span>
      </button>
      <div class="picker-quick-groups-body">
        ${groups.map((group) => `
          <div class="picker-quick-group">
            <div class="picker-quick-title">${escapeHtml(group.title)}</div>
            <div class="picker-quick-row">
              ${group.entries.map((entry) => `
                <button class="picker-quick-chip" data-action="pick-result" data-name="${escapeHtml(entry.name)}" type="button">
                  ${escapeHtml(entry.displayNamePretty)}
                </button>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderPokemonResults(payload, query = '') {
  const results = payload.results || [];
  const parsed = payload.parsed || { hasQuery: !!query };
  const index = state.pickerSearch?.index || [];

  if (!results.length) {
    return `<div class="loader">No hay resultados.</div>`;
  }

  const quickGroups = !parsed.hasQuery ? renderQuickGroups(index) : '';
  const cards = results.map((row, idx) => {
    const mon = row.entry;
    const active = idx === state.pickerSearch.highlightedIndex;
    const reasons = row.reasons?.length
      ? `<span class="result-reason">${row.reasons.slice(0, 2).map(escapeHtml).join(' + ')}</span>`
      : '';

    return `
      <button
        class="result ${active ? 'active' : ''}"
        data-action="pick-result"
        data-name="${escapeHtml(mon.name)}"
        data-index="${idx}"
        type="button"
      >
        <div class="result-sprite">
          <img src="${escapeHtml(mon.sprite || fallbackSprite())}" alt="${escapeHtml(mon.displayNamePretty)}" loading="lazy">
        </div>
        <div class="result-main">
          <div class="result-name">${highlightMatch(mon.displayNamePretty, query)}</div>
          <div class="result-sub">${renderFormBadge(mon)}${renderTypeChips(mon.types)}</div>
          <div class="result-meta">#${mon.rank || '-'} · ${formatUsage(mon.usage)} ${reasons}</div>
        </div>
      </button>
    `;
  }).join('');

  return `${quickGroups}<div class="picker-result-grid">${cards}</div>`;
}
