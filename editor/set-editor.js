// editor/set-editor.js
// Responsabilidad: Toda la lógica y UI del modal de edición de Sets (moves, EVs, items, abilities)

import { state } from '../core/state.js';
import { SET_EDITOR, PICKER } from '../core/dom.js';
import { getTranslation, normalizeText, formatName, escapeHtml } from '../utils/text.js';
import { serializeSetSummary, getMetaRecord } from '../data/meta.js';
import { buildDefaultSetForSpecies } from '../data/sets.js';
import { getResolvedEvs, looksCompactEvSpread, parseSpread } from '../battle/stats.js';
import { topEntries, typeChip } from '../utils/types.js';
import { MEGA_STONES, TYPE_META } from '../core/constants.js';
import { renderAll, updateIcons } from '../render/app.js';
import { pickPokemonIntoSlot, openModal } from '../picker/modal.js';

import { scheduleMoveWarmup } from '../bridges/ui-bridges.js';

// Removed duplicate state initialization













// =========================================================================
// 5. SET EDITOR & MODALS
// =========================================================================

export function ensureEditableSet(mon) {
  if (!mon.set || typeof mon.set !== "object") mon.set = {};
  if (!Array.isArray(mon.set.moves)) mon.set.moves = [];
  while (mon.set.moves.length < 4) mon.set.moves.push("");
  if (!mon.set.raw || typeof mon.set.raw !== "object") mon.set.raw = {};
  if (
    mon.source === "smogon-chaos" &&
    mon.set._evScale !== "full" &&
    looksCompactEvSpread(mon.set.evs || {})
  ) {
    mon.set.evs = getResolvedEvs(mon);
    mon.set._evScale = "full";
  }
  return mon.set;
}

export function uniqValues(arr = []) {
  return [...new Set(arr.map((x) => String(x || "").trim()).filter(Boolean))];
}

export function getEditorMon() {
  const idx = state.setEditor.index;
  if (idx == null) return null;
  return state.self[idx] || null;
}

export function getQuickOptions(mon, kind) {
  const set = ensureEditableSet(mon);
  const raw = set.raw || {};
  const entry =
    (typeof getMetaRecord === "function"
      ? getMetaRecord(mon.name)?.entry
      : null) || {};

  if (kind === "ability") {
    return uniqValues([
      ...(raw.abilities || []).map((x) => x.key),
      ...Object.keys(entry.Abilities || {}),
      set.ability || "",
    ]).slice(0, 10);
  }

  if (kind === "item") {
    return uniqValues([
      ...(raw.items || []).map((x) => x.key),
      ...Object.keys(entry.Items || {}),
      set.item || "",
    ]).slice(0, 12);
  }

  if (kind === "move") {
    return uniqValues([
      ...(raw.moves || []).map((x) => x.key),
      ...Object.keys(entry.Moves || {}),
      ...(set.moves || []),
    ]).slice(0, 18);
  }

  if (kind === "nature") {
    const editorNatureChoices = [
      "Jolly", "Adamant", "Timid", "Modest", "Bold", "Impish", "Careful", "Calm", 
      "Brave", "Relaxed", "Quiet", "Sassy", "Naive", "Hasty", "Lonely", "Naughty", 
      "Rash", "Mild", "Gentle", "Lax", "Hardy", "Docile", "Serious", "Bashful", "Quirky"
    ];
    return uniqValues([
      raw.nature || "",
      entry.nature || "",
      set.nature || "",
      ...editorNatureChoices
    ]);
  }

  return [];
}

export function getTopSpreads(mon) {
  if (!mon) return [];
  const record = getMetaRecord(mon.name);
  const entry = record?.entry || {};
  const rawSpreads = entry.Spreads || entry["Spreads"] || {};
  const rawCount = entry["Raw count"] || 1;
  
  const top = topEntries(rawSpreads, 3);
  return top.map(sp => {
    const spread = parseSpread(sp.key);
    const pctVal = sp.value > 1 ? (sp.value / rawCount) : sp.value;
    const pct = (pctVal * 100).toFixed(0);
    
    const evStr = Object.entries(spread.evs).filter(([k,v]) => v > 0).map(([k,v]) => `${v} ${k.toUpperCase()}`).join(' / ') || "Sin EVs";
    const label = `${spread.nature || 'Neutral'} | ${evStr} (${pct}%)`;
    
    return { nature: spread.nature || '', evs: spread.evs, label };
  });
}

export function guessSpreadRole(evs) {
  const hp = Number(evs.hp) || 0;
  const atk = Number(evs.atk) || 0;
  const def = Number(evs.def) || 0;
  const spa = Number(evs.spa) || 0;
  const spd = Number(evs.spd) || 0;
  const spe = Number(evs.spe) || 0;

  if (spe >= 200 && (atk >= 200 || spa >= 200)) return "Ofensivo Rápido";
  if (hp >= 200 && (def >= 150 || spd >= 150)) return "Bulky Pivot / Muro";
  if (hp >= 200 && (atk >= 150 || spa >= 150)) return "Bulky Ofensivo";
  if (def >= 200 || spd >= 200) return "Defensivo";
  return "Mixto / Específico";
}

export function getMegaForm(baseSpecies, itemSlug) {
  if (!itemSlug || !itemSlug.includes('ite')) return null;
  
  const cleanBase = normalizeText(baseSpecies);
  let possibleMegaId = cleanBase + 'mega';
  
  // Casos especiales (Charizard X/Y, Mewtwo X/Y)
  if (itemSlug.endsWith('itex')) possibleMegaId = cleanBase + 'megax';
  if (itemSlug.endsWith('itey')) possibleMegaId = cleanBase + 'megay';
  
  const megaData = window.GameDB?.pokedex?.[possibleMegaId];
  // Solo devolver si el objeto coincide con el nombre del Pokémon (evita que Pikachu con Venusaurita brille)
  if (megaData && itemSlug.startsWith(cleanBase)) {
    return megaData;
  }
  return null;
}

export function renderSetEditor() {
  const mon = getEditorMon();
  if (!mon) {
    setEditorBody.innerHTML = `<div class="empty">No hay Pokémon seleccionado.</div>`;
    return;
  }

  const set = ensureEditableSet(mon);
  const abilityOptions = getQuickOptions(mon, "ability");
  const itemOptions = getQuickOptions(mon, "item");
  const moveOptions = getQuickOptions(mon, "move");
  const spreadOptions = getTopSpreads(mon);

  const abiSlug = normalizeText(set.ability);
  const itemSlug = normalizeText(set.item);
  const abilityDesc = window.GameDB?.abilities?.[abiSlug]?.desc || "Sin descripción disponible.";
  const itemDesc = window.GameDB?.items?.[itemSlug]?.desc || "Sin descripción disponible.";
  const typesHtml = (mon.types || []).map(t => 
    `<span class="type-pill" style="background-color: var(--${t.toLowerCase()});">${t}</span>`
  ).join('');

  const megaForm = getMegaForm(mon.name, itemSlug);
  const megaHtml = megaForm 
    ? `<div class="mega-badge">✨ Permite Megaevolucionar a ${megaForm.displayName}</div>` 
    : '';
  const megaClass = megaForm ? 'mega-active' : '';

  setEditorTitle.textContent = `Editar set · ${mon.displayName}`;
  setEditorSubtitle.textContent =
    "Despliega para cambiar o usa las sugerencias rápidas.";

  const typeChips = (mon.types || []).map(typeChip).join("");
  const summaryLines = serializeSetSummary(set);

  const editorNatureChoices = [
    "Jolly",
    "Adamant",
    "Timid",
    "Modest",
    "Bold",
    "Impish",
    "Careful",
    "Calm",
    "Brave",
    "Relaxed",
    "Quiet",
    "Sassy",
    "Naive",
    "Hasty",
    "Lonely",
    "Naughty",
    "Rash",
    "Mild",
    "Gentle",
    "Lax",
    "Hardy",
    "Docile",
    "Serious",
    "Bashful",
    "Quirky",
  ];
  const curNature = set.nature || "";
  const natureList =
    curNature && !editorNatureChoices.includes(curNature)
      ? [curNature, ...editorNatureChoices]
      : editorNatureChoices;

  const evs =
    set.evs && typeof set.evs === "object"
      ? set.evs
      : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const evStatMeta = [
    { key: "hp", label: "HP" },
    { key: "atk", label: "Atk" },
    { key: "def", label: "Def" },
    { key: "spa", label: "SpA" },
    { key: "spd", label: "SpD" },
    { key: "spe", label: "Spe" },
  ];
  const evInputStyle =
    "box-sizing:border-box;margin-top:4px;background:#15233a;border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:8px;padding:6px;width:100%;font:inherit;";

  setEditorBody.innerHTML = `
        <section class="editor-hero">
          <div class="sprite-box">
            ${mon.name.includes("-mega") ? '<div class="mega-icon" style="width:18px;height:18px;top:4px;left:4px;"></div>' : ""}
            <img src="${mon.sprite}" alt="${mon.displayName}" loading="lazy">
          </div>

          <div style="min-width:0">
            <div class="editor-name">${mon.displayName}</div>
            <div class="editor-sub">${summaryLines.join(" · ") || "Set personalizable desde aquí"}</div>
            <div style="margin-top: 4px; margin-bottom: 12px;">${typesHtml}</div>
          </div>
        </section>

        <section class="editor-grid-2">
          <article class="editor-section">
            <button type="button" class="trait-card" data-action="edit-ability" style="text-align: left;">
              <div class="trait-label">Habilidad</div>
              <div class="trait-header">
                <i data-lucide="star" style="width:14px;height:14px;color:var(--gold);"></i> 
                ${getTranslation(set.ability, 'ability') || 'Toca para asignar'}
              </div>
              <div class="flavor-text">${abilityDesc}</div>
            </button>

            <div class="editor-pill-list" style="flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; margin-top: 8px;">
              ${abilityOptions
                .slice(0, 4)
                .map(
                  (value) => `
                <button class="editor-pill ${value === set.ability ? "active" : ""}" style="white-space: nowrap; flex-shrink: 0;" data-action="quick-ability" data-value="${value}">
                  ${getTranslation(value, "ability")}
                </button>
              `,
                )
                .join("")}
            </div>
          </article>

          <article class="editor-section">
            <button type="button" class="trait-card ${megaClass}" data-action="edit-item" ${mon.name.includes("-mega") ? "disabled" : ""} style="text-align: left;">
              <div class="trait-label">Objeto Equipado</div>
              <div class="trait-header">
                <i data-lucide="package" style="width:14px;height:14px;color:var(--blue);"></i> 
                ${getTranslation(set.item, 'item') || 'Toca para asignar'}
              </div>
              <div class="flavor-text">${itemDesc}</div>
              ${megaHtml}
            </button>

            <div class="editor-pill-list" style="flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; margin-top: 8px;">
              ${itemOptions
                .slice(0, 4)
                .map(
                  (value) => `
                <button class="editor-pill ${value === set.item ? "active" : ""}" style="white-space: nowrap; flex-shrink: 0;" data-action="quick-item" data-value="${value}" ${mon.name.includes("-mega") ? "disabled" : ""}>
                  ${getTranslation(value, "item")}
                </button>
              `,
                )
                .join("")}
            </div>
          </article>
        </section>

        <article class="editor-section">
          <div class="editor-section-head">
            <div>
              <strong>Naturaleza y EVs</strong>
            </div>
          </div>

          <button type="button" class="edit-trigger-btn" data-action="edit-nature">
            <span class="${set.nature ? 'val' : 'placeholder'}">${set.nature || 'Toca para asignar Naturaleza'}</span>
            <i data-lucide="chevron-right" style="width:16px;color:var(--muted);"></i>
          </button>

          <div class="editor-pill-list" style="margin-top: 8px; margin-bottom: 12px; flex-wrap: wrap;">
            ${spreadOptions.map(sp => `
              <button type="button" class="editor-pill" data-action="quick-spread" data-nature="${sp.nature}" data-evs='${JSON.stringify(sp.evs)}'>
                ${sp.label}
              </button>
            `).join('')}
          </div>

          <div class="ev-compact-grid" style="margin-top: 8px;">
            ${evStatMeta
              .map(
                ({ key, label }) => `
              <div class="ev-input-wrapper">
                <span>${label}</span>
                <input type="number" min="0" max="252" step="1" data-action="inline-ev" data-stat="${key}" value="${Number(evs[key]) || 0}">
              </div>
            `,
              )
              .join("")}
          </div>
          ${(() => {
            const total = evStatMeta.reduce((acc, { key }) => acc + (Number(evs[key]) || 0), 0);
            const over = total > 508;
            return `<div class="ev-total ${over ? 'is-over' : ''}">
              EVs ${total}/508${over ? ' · supera el máximo legal' : ''}
            </div>`;
          })()}
        </article>

        <article class="editor-section">
          <div class="editor-section-head">
            <div>
              <strong>Movimientos</strong>
            </div>
          </div>

          <div class="moves-2x2-grid">
            ${(set.moves || [])
              .slice(0, 4)
              .map(
                (move, idx) => {
                  const slug = normalizeText(move);
                  const moveData = window.GameDB?.moves?.[slug];
                  const powerStr = moveData?.power ? `${moveData.power} BP` : '-- BP';
                  const typeColor = moveData ? `var(--${moveData.type})` : 'var(--muted)';
                  
                  let catIcon = '';
                  if (moveData?.damageClass === 'physical') catIcon = '<i data-lucide="swords" style="width:12px;height:12px;"></i>';
                  else if (moveData?.damageClass === 'special') catIcon = '<i data-lucide="orbit" style="width:12px;height:12px;"></i>';
                  else if (moveData?.damageClass === 'status') catIcon = '<i data-lucide="shield" style="width:12px;height:12px;"></i>';

                  const tooltip = moveData?.desc || 'Seleccionar movimiento';
                  const moveName = getTranslation(move, 'move') || '+ Añadir ataque';

                  return `
              <button type="button" class="move-slot-btn ${move ? '' : 'empty'}" style="--move-color: ${typeColor};" title="${escapeHtml(tooltip)}" data-action="edit-move" data-index="${idx}">
                <div class="move-slot-header">
                  <span class="val">${moveName}</span>
                  ${move ? `<span class="move-category-icon">${catIcon}</span>` : ''}
                </div>
                ${move ? `
                <div class="move-slot-stats">
                  <span>${powerStr}</span>
                </div>
                <div class="move-btn-clear" data-action="clear-move" data-index="${idx}"><i data-lucide="x" style="width:14px;height:14px;"></i></div>
                ` : ''}
              </button>
            `;
                }
              )
              .join("")}
          </div>
        </article>
      `;

  updateIcons();
}

export function openSetEditor(index) {
  const mon = state.self[index];
  if (!mon) return;
  state.setEditor.index = index;
  ensureEditableSet(mon);
  renderSetEditor();
  SET_EDITOR.modal.classList.add("open");
}

export function closeSetEditor() {
  SET_EDITOR.modal.classList.remove("open");
  state.setEditor.index = null;
}

export function getChoiceStateLabel(kind, moveIndex = null) {
  if (kind === "ability")
    return {
      title: "Elegir habilidad",
      subtitle:
        "Selecciona una habilidad sugerida o escribe una personalizada.",
    };
  if (kind === "item")
    return {
      title: "Elegir objeto",
      subtitle: "Selecciona un objeto sugerido o escribe uno personalizado.",
    };
  if (kind === "nature")
    return {
      title: "Elegir naturaleza",
      subtitle: "Selecciona una naturaleza de la lista.",
    };
  return {
    title: `Elegir movimiento ${Number(moveIndex) + 1}`,
    subtitle: "Selecciona un movimiento sugerido o escribe uno personalizado.",
  };
}

export function openSetChoice(kind, moveIndex = null) {
  const mon = getEditorMon();
  if (!mon) return;

  const options = getQuickOptions(mon, kind);
  state.setChoice = { kind, moveIndex, options, query: "" };

  const label = getChoiceStateLabel(kind, moveIndex);
  setChoiceTitle.textContent = label.title;
  setChoiceSubtitle.textContent = label.subtitle;
  SET_EDITOR.choiceSearch.value = "";
  renderSetChoiceList();
  SET_EDITOR.choiceModal.classList.add("open");
  setTimeout(() => SET_EDITOR.choiceSearch.focus(), 30);
}

export function closeSetChoice() {
  SET_EDITOR.choiceModal.classList.remove("open");
  state.setChoice = { kind: "", moveIndex: null, options: [], query: "" };
}

export function renderSetChoiceList() {
  const mon = getEditorMon();
  if (!mon) {
    setChoiceList.innerHTML = `<div class="empty">No hay Pokémon activo.</div>`;
    return;
  }

  const set = ensureEditableSet(mon);
  const q = normalizeText(SET_EDITOR.choiceSearch.value || "");
  const kind = state.setChoice.kind;
  
  let options = [...(state.setChoice.options || [])];

  // Si hay un texto de búsqueda, expandimos la búsqueda a la base de datos global (GameDB)
  if (q && window.GameDB) {
    const dbMap = kind === 'move' ? window.GameDB.moves :
                  kind === 'ability' ? window.GameDB.abilities :
                  kind === 'item' ? window.GameDB.items : null;

    if (dbMap) {
      const extraMatches = [];
      for (const slug of Object.keys(dbMap)) {
        const translated = getTranslation(slug, kind);
        if (slug.includes(q) || normalizeText(translated).includes(q)) {
          extraMatches.push(slug);
        }
        // Límite de 50 resultados para mantener un rendimiento óptimo
        if (extraMatches.length >= 50) break;
      }
      options = uniqValues([...options, ...extraMatches]);
    }
  }

  const finalOptions = options
    .filter(Boolean)
    .filter((value) => {
      if (!q) return true;
      const translated = getTranslation(value, kind);
      return (
        normalizeText(value).includes(q) ||
        normalizeText(translated).includes(q)
      );
    });

  if (!finalOptions.length) {
    setChoiceList.innerHTML = `<div class="empty">Sin coincidencias. Puedes usar el texto escrito arriba.</div>`;
    return;
  }

  const currentValue =
    kind === "ability"
      ? set.ability || ""
      : kind === "item"
        ? set.item || ""
        : set.moves[state.setChoice.moveIndex] || "";

  setChoiceList.innerHTML = finalOptions
    .map((value) => {
      let translated = getTranslation(value, kind);
      
      // Fallback para capitalizar slugs directos si no hay traducción (ej: "closecombat" -> "Closecombat")
      if (translated === value && !value.includes(" ")) {
         translated = formatName(value);
      }
      
      const slug = normalizeText(value);

      const moveData = window.GameDB?.moves?.[slug];
      const abilityData = window.GameDB?.abilities?.[slug];
      const itemData = window.GameDB?.items?.[slug];

      let typeHtml = '';
      let desc = '';
      let styleAccent = '';
      let catIcon = '';
      let metricsHtml = '';
      let tooltipText = '';

      if (moveData) {
        typeHtml = `<span class="type-pill" style="background-color: var(--${moveData.type});">${moveData.type}</span>`;
        desc = moveData.desc || '';
        styleAccent = `border-left: 4px solid var(--${moveData.type});`;

        if (moveData.damageClass === 'physical') {
          catIcon = '<i data-lucide="swords" style="width:14px;height:14px; margin-left:4px; color:var(--muted);"></i>';
        } else if (moveData.damageClass === 'special') {
          catIcon = '<i data-lucide="orbit" style="width:14px;height:14px; margin-left:4px; color:var(--muted);"></i>';
        } else if (moveData.damageClass === 'status') {
          catIcon = '<i data-lucide="shield" style="width:14px;height:14px; margin-left:4px; color:var(--muted);"></i>';
        }

        const bp = moveData.power ? `${moveData.power} BP` : '-- BP';
        const acc = moveData.accuracy ? `${moveData.accuracy} Acc` : '-- Acc';
        let extraInfo = [bp, acc];
        if (moveData.hits > 1) extraInfo.push(`${moveData.hits} Golpes`);
        if (moveData.isSpread) extraInfo.push(`Área`);

        metricsHtml = `<div class="move-slot-stats" style="margin-top: 2px; margin-bottom: 4px;"><span>${extraInfo.join(' | ')}</span></div>`;
        
        const typeName = TYPE_META[moveData.type]?.name || moveData.type;
        const className = moveData.damageClass === 'physical' ? 'Físico' : moveData.damageClass === 'special' ? 'Especial' : 'Estado';
        tooltipText = `${typeName} | ${className}\n\n${desc}`;
      } else if (abilityData) {
        desc = abilityData.desc || '';
        tooltipText = desc;
      } else if (itemData) {
        desc = itemData.desc || '';
        tooltipText = desc;
      }

      const isCurrent = normalizeText(value) === normalizeText(currentValue);
      const currentBadge = isCurrent ? '<span class="tiny-chip" style="background: var(--blue); color: #fff; padding: 2px 4px; font-size: 0.55rem; border: none; margin-left: 6px;">Actual</span>' : '';

      return `
          <button class="choice-item ${isCurrent ? "active" : ""}" data-action="apply-choice" data-value="${value}" style="${styleAccent}" title="${escapeHtml(tooltipText)}">
            <div class="choice-item-header">
              <span class="choice-item-name" style="display:flex; align-items:center;">${translated} ${catIcon} ${currentBadge}</span>
              ${typeHtml}
            </div>
            ${metricsHtml}
            ${desc ? `<div class="flavor-text" style="text-align: left;">${desc}</div>` : ''}
          </button>
        `;
    })
    .join("");

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons({ root: setChoiceList });
  }
}

export function applySetChoice(value) {
  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);
  const clean = String(value || "").trim();

  if (state.setChoice.kind === "ability") {
    set.ability = clean;
  } else if (state.setChoice.kind === "item") {
    const normalizedItem = normalizeText(clean);
    if (MEGA_STONES[normalizedItem]) {
      const hasOtherMega = state.self.some(
        (m, i) => m && i !== state.setEditor.index && m.name.includes("-mega"),
      );
      if (hasOtherMega) {
        alert(
          "Mega Clause: Ya tienes un Pokémon Megaevolucionado en el equipo.",
        );
        return;
      }
    }
    set.item = clean;
    if (
      MEGA_STONES[normalizedItem] &&
      mon.name !== MEGA_STONES[normalizedItem]
    ) {
      // Trigger species change
      const newSpecies = MEGA_STONES[normalizedItem];
      pickPokemonIntoSlot("self", state.setEditor.index, newSpecies).then(
        () => {
          const newMon = getEditorMon();
          if (newMon && newMon.set) {
            newMon.set.item = clean;
          }
          openSetEditor(state.setEditor.index);
        },
      );
      closeSetChoice();
      return; // early return since pickPokemonIntoSlot rebuilds the set
    }
  } else if (state.setChoice.kind === "move") {
    const idx = Number(state.setChoice.moveIndex);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = clean;
  }

  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
  closeSetChoice();
}

export function clearSetChoiceValue() {
  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);

  if (state.setChoice.kind === "ability") {
    set.ability = "";
  } else if (state.setChoice.kind === "item") {
    set.item = "";
  } else if (state.setChoice.kind === "move") {
    const idx = Number(state.setChoice.moveIndex);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = "";
  }

  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
  closeSetChoice();
}

export function resetCurrentSetToMeta() {
  const idx = state.setEditor.index;
  const mon = getEditorMon();
  if (idx == null || !mon) return;

  if (typeof buildDefaultSetForSpecies === "function") {
        mon.set = buildDefaultSetForSpecies(mon.name, "self", idx, mon.types);
  } else {
    mon.set = {
      ability: "",
      item: "",
      nature: "",
      evs: null,
      moves: ["", "", "", ""],
      raw: {},
    };
  }

  ensureEditableSet(mon);
  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
}

export function changeCurrentPokemonFromEditor() {
  const idx = state.setEditor.index;
  if (idx == null) return;
  closeSetEditor();
  openModal("self", idx);
}

SET_EDITOR.body.addEventListener("change", (e) => {
  const input = e.target.closest('input[data-action="inline-ev"]');
  if (input) {
    const mon = getEditorMon();
    if (!mon) return;
    const set = ensureEditableSet(mon);
    if (!set.evs) set.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    let v = Number(input.value);
    if (!Number.isFinite(v)) v = 0;
    v = Math.max(0, Math.min(252, Math.round(v)));
    set.evs[input.dataset.stat] = v;
    set._evScale = "full";
    input.value = String(v);
    if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
    return;
  }

  const select = e.target.closest("select[data-action]");
  if (!select) return;

  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);
  const val = select.value;

  if (select.dataset.action === "inline-ability") {
    set.ability = val;
  } else if (select.dataset.action === "inline-item") {
    set.item = val;
    const normalizedItem = normalizeText(val);
    if (
      MEGA_STONES[normalizedItem] &&
      mon.name !== MEGA_STONES[normalizedItem]
    ) {
      const newSpecies = MEGA_STONES[normalizedItem];
      pickPokemonIntoSlot("self", state.setEditor.index, newSpecies).then(
        () => {
          const newMon = getEditorMon();
          if (newMon && newMon.set) newMon.set.item = val;
          openSetEditor(state.setEditor.index);
        },
      );
      return;
    }
  } else if (select.dataset.action === "inline-move") {
    const idx = Number(select.dataset.index);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = val;
  } else if (select.dataset.action === "inline-nature") {
    set.nature = val;
  }

  if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
  if (typeof renderAll === "function") renderAll();
  renderSetEditor();
});

SET_EDITOR.body.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const mon = getEditorMon();
  if (!mon) return;
  const set = ensureEditableSet(mon);

  if (btn.dataset.action === "edit-ability") openSetChoice("ability");
  if (btn.dataset.action === "edit-item") {
    if (mon.name.includes("-mega")) {
      alert("Los Pokémon Megaevolucionados no pueden cambiar de objeto.");
      return;
    }
    openSetChoice("item");
  }
  if (btn.dataset.action === "edit-nature") openSetChoice("nature");
  if (btn.dataset.action === "edit-move")
    openSetChoice("move", Number(btn.dataset.index));

  if (btn.dataset.action === "quick-ability") {
    set.ability = btn.dataset.value || "";
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }

  if (btn.dataset.action === "quick-item") {
    set.item = btn.dataset.value || "";
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }

  if (btn.dataset.action === "quick-spread") {
    const nature = btn.dataset.nature || "";
    const evs = JSON.parse(btn.dataset.evs || "{}");
    set.nature = nature;
    set.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...evs };
    set._evScale = "full";
    if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }

  if (btn.dataset.action === "quick-move-any") {
    const firstEmpty = (set.moves || []).findIndex(
      (x) => !String(x || "").trim(),
    );
    openSetChoice("move", firstEmpty >= 0 ? firstEmpty : 0);
    SET_EDITOR.choiceSearch.value = btn.dataset.value || "";
    renderSetChoiceList();
  }

  if (btn.dataset.action === "clear-move") {
    const idx = Number(btn.dataset.index);
    while (set.moves.length < 4) set.moves.push("");
    set.moves[idx] = "";
    if (typeof scheduleMoveWarmup === "function") scheduleMoveWarmup();
    if (typeof renderAll === "function") renderAll();
    renderSetEditor();
  }
});

SET_EDITOR.choiceSearch.addEventListener("input", renderSetChoiceList);

SET_EDITOR.choiceList.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="apply-choice"]');
  if (!btn) return;
  applySetChoice(btn.dataset.value || "");
});

document
  .getElementById("closeSetEditorBtn")
  .addEventListener("click", closeSetEditor);
document.getElementById("doneSetBtn").addEventListener("click", closeSetEditor);
document
  .getElementById("resetSetBtn")
  .addEventListener("click", resetCurrentSetToMeta);
document
  .getElementById("changePokemonBtn")
  .addEventListener("click", changeCurrentPokemonFromEditor);

document
  .getElementById("closeSetChoiceBtn")
  .addEventListener("click", closeSetChoice);
document
  .getElementById("confirmSetChoiceBtn")
  .addEventListener("click", closeSetChoice);
document
  .getElementById("clearSetChoiceBtn")
  .addEventListener("click", clearSetChoiceValue);
document
  .getElementById("applyCustomChoiceBtn")
  .addEventListener("click", () => {
    const value = String(SET_EDITOR.choiceSearch.value || "").trim();
    if (!value) return;
    applySetChoice(value);
  });

SET_EDITOR.modal.addEventListener("click", (e) => {
  if (e.target === SET_EDITOR.modal) closeSetEditor();
});

SET_EDITOR.choiceModal.addEventListener("click", (e) => {
  if (e.target === SET_EDITOR.choiceModal) closeSetChoice();
});

