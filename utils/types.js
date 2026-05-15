import { TYPE_META, TYPE_CHART } from '../core/constants.js';

export function hexToRgba(hex, alpha = 0.25) {
  if (!hex) return `rgba(255,255,255,${alpha})`;
  let c = hex.replace("#", "");
  if (c.length === 3)
    c = c
      .split("")
      .map((x) => x + x)
      .join("");
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getContrastColor(hexcolor) {
  if (!hexcolor) return 'white';
  let hex = hexcolor.replace('#', '');
  if (hex.length === 3) {
      hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  }
  const r = parseInt(hex.substr(0,2), 16);
  const g = parseInt(hex.substr(2,2), 16);
  const b = parseInt(hex.substr(4,2), 16);
  const yiq = ((r*299)+(g*587)+(b*114))/1000;
  return (yiq >= 128) ? 'black' : 'white';
}

export function typeDot(type) {
  const meta = TYPE_META[type] || { color: "#8aa2c6", name: type };
  const iconUrl = `https://raw.githubusercontent.com/duiker101/pokemon-type-svg-icons/master/icons/${type.toLowerCase()}.svg`;
  const iconColor = getContrastColor(meta.color);
  return `<div class="type-icon-circle" style="background-color: ${meta.color};" title="Tipo: ${meta.name}">
            <div class="type-svg-mask" style="mask-image: url('${iconUrl}'); -webkit-mask-image: url('${iconUrl}'); background-color: ${iconColor};"></div>
          </div>`;
}

export function typeChip(type) {
  const meta = TYPE_META[type] || { name: type, color: "#8aa2c6", icon: "•" };
  return `<span class="type-chip-mini" style="background:${hexToRgba(meta.color, 0.18)};border-color:${hexToRgba(meta.color, 0.36)}">${meta.icon} ${meta.name}</span>`;
}

export function effectiveness(attackType, defendTypes = []) {
  return defendTypes.reduce((acc, t) => {
    const key = String(t).toLowerCase();
    const table = TYPE_CHART[String(attackType).toLowerCase()] || {};
    return acc * (table[key] ?? 1);
  }, 1);
}

export function fmtMult(mult) {
  if (mult === 0) return "×0";
  if (mult === 0.25) return "×.25";
  if (mult === 0.5) return "×.5";
  if (mult === 1) return "×1";
  if (mult === 2) return "×2";
  if (mult === 4) return "×4";
  // FIX: Formateo seguro para modificadores de clima/terreno
  return `×${Number(mult.toFixed(2))}`;
}

export function effClass(mult) {
  if (mult === 4) return "eff-4";
  if (mult === 2) return "eff-2";
  if (mult === 1) return "eff-1";
  if (mult === 0.5) return "eff-05";
  if (mult === 0.25) return "eff-025";
  if (mult === 0) return "eff-0";
  return "eff-1";
}

export function topEntries(obj = {}, limit = 4) {
  return Object.entries(obj || {})
    .filter(([, v]) => typeof v === "number" && isFinite(v))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

export function topKey(obj = {}, fallback = "") {
  return topEntries(obj, 1)[0]?.key || fallback;
}