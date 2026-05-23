# CanonicalDex

`CanonicalDex` es la capa de datos mecánicos introducida en Fase 1.

## Procedencia

Prioridad de fuentes:

1. `@pkmn/dex` / Pokémon Showdown-compatible data para mecánicas de combate.
2. `data-bundle.json` para Smogon usage/default sets, traducciones, sprites y flavor visual.
3. Overrides heredados de `data-bundle.json` solo para formato custom o datos no presentes en Showdown.

PokeAPI no se usa como autoridad mecánica.

## Archivos

- `generated.js`: snapshot generado build-time con species, moves, abilities, items, aliases y enums.
- `normalization.js`: IDs canónicos y normalización de weather, terrain, status, target modes y flags.
- `dex.js`: API de lookup y adapters legacy para que el motor actual pueda convivir con el nuevo dex.

## Shape resumido

- `species[id]`: formas, base species, tipos, base stats Showdown, abilities por slot, hidden ability, required item/ability, flags de mega/regional/battle-only y sprite visual.
- `moves[id]`: tipo, categoria, potencia, accuracy, prioridad, target/targetMode, flags mecanicos, multihit, spread/ally hit, drain/recoil/heal, status, boosts, side conditions, weather/terrain/pseudoWeather, callbacks declarativos y tags.
- `abilities[id]`: nombre, descripcion, hooks expuestos por la fuente y tags mecanicos inferidos.
- `items[id]`: nombre, descripcion, reglas de forma, hooks expuestos por la fuente y tags mecanicos inferidos.
- `aliases`: species, moves, abilities, items, weather, terrain, statuses y target modes en clave canonica unica.

## Regeneración

```powershell
node tools/build-canonical-dex.mjs
```

El script descarga temporalmente `@pkmn/dex` en un directorio temporal mediante `npm`, genera el snapshot y no modifica `node_modules` del proyecto.

## Verificacion

```powershell
.\tests\canonical\run-canonical-checks.ps1
```

Estos checks validan cobertura minima, aliases en castellano, formas, spread moves, prioridades, flags, callbacks declarativos y adapters legacy.
