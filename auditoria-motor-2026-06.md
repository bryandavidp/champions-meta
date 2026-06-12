# Auditoría y plan de unificación del motor — champions-meta

## Contexto

PWA vanilla JS (ESM nativo, sin bundler) de análisis competitivo de Pokémon Champions. Una refactorización a medias dejó tres capas de lógica solapadas: el monolito `app-core.js` (6.076 líneas, sigue siendo el hub real), el motor modular `battle/` (damage/speed/stats/effects) y el motor alternativo `battle/action-core.js`. El usuario pide auditoría completa y un plan para unificar el motor y alinearlo con las reglas reales del competitivo de Pokémon Champions.

**Decisiones del usuario:** módulo de regulaciones seleccionable (M-A y M-B como datos, preparado para futuras); solo Dobles VGC por ahora; conservar usage Smogon como sugerencias filtradas por legalidad.

## Reglas reales del competitivo (verificadas 2026-06-12)

- Juego lanzado 8-abr-2026. **Reg. M-A** (8 abr–17 jun, vigente hoy): ~186 especies (HOME-transferibles), 59 Megas; Mega Lucario Z y Mega Garchomp Z restringidos; mecánica activa = Mega Evolución (Omni Ring: 1 mecánica/batalla; Tera existe en el juego pero no en este formato). **Reg. M-B** (17 jun–2 sep): añade especies y Mega Raichu X/Y.
- Ranked Dobles: equipo 4–6, eligen 4; auto-nivel 50; Team Preview 90 s, 10 min/jugador, 60 s/turno; Item Clause y Species Clause. (Singles existe: 3–6 pick 3 — fuera de alcance por decisión.)
- Fuentes: victoryroad.pro/champions-regulations, serebii.net (Reg M-A/M-B), game8, gamerant.

## Resumen de la auditoría

### Duplicidades del motor (verificadas)
1. **Daño**: `battle/damage.js:60 calculateDamageRolls` (sin clamp `Math.max(1,)`) vs `battle/action-core.js:677 calculateRolls` (con clamp). Fórmula base Gen 9 correcta en ambos.
2. **Velocidad**: `battle/speed.js:27` (completa) vs `action-core.js:376 effectiveSpeed` vs `analysis/speed-order.js:36 rawSpeed` — esta última SIN stages/clima/item → **orden de velocidad incorrecto con Tailwind/Trick Room**.
3. **Stats**: `battle/stats.js:165` (sin Protosynthesis/Quark Drive) vs `action-core.js:525 statValue` (con booster) → daño infraestimado con Proto.
4. **Prioridad**: 4 implementaciones. `app-core.js:74 getPriority` hardcodea slugs ES/EN con bugs reales: **First Impression=+3 (real +2), Grassy Glide +1 incondicional (real: solo en Grassy Terrain), Prankster `prio>=0` deja Prankster+Trick Room en -7 (real -6)**; el dex canónico (`getCanonicalMovePriority`) relegado a fallback. Las otras: `analysis/speed-order.js:30`, `analysis/ko-conditions.js:19`, `battle/action-core.js:358 resolvePriority` (la más correcta).
5. **HP**: `battle/stats.js:140 calcMonHP` (nivel 50 hardcoded) vs `action-core.js:513 maxHp`.
6. **Clima/terreno**: `damage.js:9` sin Sand boost SpD-roca ni Misty vs `action-core.js:639-660` (terrain completo).
7. **`getRows()` duplicada**: `matrix/core.js:305` (basada en action-core, cubierta por tests) vs `matrix/render.js:30` (la que usa la UI).
8. Único punto sano: efectividad de tipos centralizada (`utils/types.js:45` + TYPE_CHART `core/constants.js:192`, 18 tipos correctos).

### Bugs y gaps
- `recalculateActiveField()` (`battle/effects.js:62-75`) **borra los stages** (bug legacy congelado en baseline).
- Eruption/Water Spout no escalan con HP; críticos no expuestos en `estimateMoveDamage`; Fake Out ignora Inner Focus/Covert Cloak; timing Intimidate↔Defiant/Competitive sin verificar; Choice lock sin ciclo de vida.
- `effects-master.seed.json`: kinds inventados `major_status_immunity_subset` y `override_priority_weather` (el resto de 92 entradas valida contra Gen 9 real).
- Aliases rotos en `data/canonical/generated.js`: `butterfree→butterfreegmax`, `venusaur→venusaurmega` (bug del generador `tools/build-canonical-dex.mjs`).
- `battle/speed.js:130` devuelve velocidad **negativa** bajo Trick Room — convención que los consumidores explotan; preservar al migrar.

### Arquitectura/incoherencias
- `modes/quick.js` y `modes/live.js` son solo reexports de `app-core.js` (aliases, no fronteras).
- Listeners repartidos entre `events/bindings.js` e inline en `app-core.js`; globals `window.openSetEditor/openModal/setUiMode`.
- `effects-registry-bridge.js` script clásico cargado antes de los ESM (punto de fallo silencioso).
- Placeholders: `picker/pokedex.js` (vacío), gran parte de `matrix/explainer.js`.
- localStorage `offensive-matrix-saved-teams-v4` sin migración ni validación de schema.

### Desalineación con el juego real
- La app modela un formato Smogon inventado `gen9championsou` por rating Elo (1760/1630/1500/0, snapshot 2026-04), no las regulaciones oficiales.
- No aplica roster legal M-A/M-B, ni restricción de Megas, ni Item/Species Clause; las Megas exclusivas de Champions (Lucario Z, Garchomp Z, Raichu X/Y) no existen en `@pkmn/dex@0.10.9`.
- Sí modela bien: dobles bring-4, nivel 50, clima/terreno/prioridad.

### Falsos positivos descartados durante la auditoría
- Los `data/gen9championsou-*.json` NO están vacíos (5–15 MB verificados).
- `matrix/core.js` no es código muerto: lo usan `tests/product-adapters` y `tests/performance`; lo muerto es su ausencia en la UI.

---

## Plan de implementación

### Decisión central
**Las matemáticas se extraen a un módulo nuevo `battle/formulas.js` (puro, sin estado).** `battle/action-core.js` (el motor más correcto) y los adaptadores de UI `battle/damage.js`/`speed.js`/`stats.js` delegan en él **manteniendo sus firmas públicas** → cero cambios en consumidores en la primera fase. No se migra la UI a snapshots (frontera ya documentada en `battle/ENGINE_STATE.md`).

Fuente única por dominio (se conserva la versión correcta, se borran las demás):
| Dominio | Función única en `formulas.js` | Origen | Se elimina/delega |
|---|---|---|---|
| Rolls de daño | `damageRolls()` con clamp ≥1 | `action-core.js:677` | cuerpo de `damage.js:60` |
| Velocidad | `effectiveSpeedRaw(mon, field)` (stages+clima+item+booster+par+tailwind) | fusión `speed.js:27` + booster de `action-core.js:376` | `speed-order.js:36 rawSpeed`, `action-core.js effectiveSpeed` |
| Stats | `effectiveStat()` con Proto/Quark | `action-core.js:525` | cuerpo de `stats.js:165` |
| Prioridad | `resolveMovePriority(move, user, ctx)` — **dex canónico primero**, luego Prankster/Gale Wings/Triage; Grassy Glide condicional | `action-core.js:358` + dex promovido | `app-core.js:74`, `speed-order.js:30`, `ko-conditions.js:19` |
| HP | `maxHpAt(level=50, …)` | `action-core.js:513` | cuerpo de `stats.js:140` |
| Clima/terreno | con Sand SpD-roca x1.5, Misty x0.5 dragón, Grassy genérico | `action-core.js:639-660` | cuerpo de `damage.js:9` |
| Orden de acción | `compareActionOrder(a,b,{trickRoom})` (separa prioridad de inversión TR → corrige Prankster+TR de raíz) | `action-core.js:408-414` | — |

`speed.js:calculateSpeed` conserva temporalmente el signo negativo bajo TR (deprecated documentado) para no romper consumidores.

### Fase 0 — Red de seguridad
1. Ejecutar las 9 suites (`node tests/<suite>/run-*.mjs`) y archivar resultado.
2. Añadir a `tests/baseline/fixtures.mjs` casos que capturen los bugs actuales como `known-gap` (First Impression, Grassy Glide, Prankster+TR, speed-order sin stages, rolls sin clamp, stages borrados); regenerar snapshot. La Fase 1 los voltea a `correct` de forma auditable.

### Fase 1 — Motor único (`battle/formulas.js`)
1. Crear `battle/formulas.js` (inputs duck-typed app-state o snapshot, normalizados con `data/canonical/normalization.js`).
2. Convertir `battle/damage.js`, `speed.js`, `stats.js` en adaptadores finos (mismas firmas; el registry bridge se aplica en el adaptador, `formulas.js` queda puro y testeable en Node).
3. `action-core.js` delega en `formulas.js` (borra sus privadas duplicadas, conserva wrappers de snapshot).
4. Migrar prioridad: borrar `getPriority` en `app-core.js:74-92` (≈24 call sites → import), y los `movePriority` de `analysis/speed-order.js` y `analysis/ko-conditions.js`; `speed-order.js` pasa a usar `calculateSpeed` (corrige Tailwind/TR/stages).
5. Actualizar baseline (gaps→correct, justificación en `tests/baseline/README.md`); bump de caché en `sw.js`.

### Fase 2 — Matriz única + bugs de simulación
1. `matrix/render.js:30` importa `getRows` de `matrix/core.js:305`; borrar la duplicada; validación visual Quick/Live.
2. Bugs: `recalculateActiveField` deja de borrar stages (`battle/effects.js:62-75`, Intimidate como delta idempotente); `dynamicBasePower()` en formulas (Eruption/Water Spout 150·hp%, Hex, Acrobatics, Knock Off) consumido por ambos pipelines; exponer rango de crítico en `estimateMoveDamage`/explainer/KO-conditions; Fake Out chequea Inner Focus/Covert Cloak; reacción Intimidate→Defiant/Competitive/anulación (Clear Body, Inner Focus…); Choice lock persistido en `volatiles.choiceLockedMove` (filtra acciones legales, se limpia al switch).

### Fase 3 — Capa de reglas `rules/`
```
rules/
  index.js          # getActiveRegulation(date), getRegulation(id), validateTeam(team, reg, mode)
  regulations.js    # M-A, M-B: {id, from, to, roster, megas, restricted:['lucariomegaz','garchompmegaz'], mechanic:'mega', omniRing, clauses}
  clauses.js        # speciesClause, itemClause → {legal, violations[]}
  formats.js        # doubles {bring:4..6, pick:4}, level 50, timers (singles definido pero no cableado)
  rosters/          # regulation-m-a.js (~186 ids canónicos), regulation-m-b.js (delta)
```
- Tool nuevo `tools/build-regulation-roster.mjs` que valida en build que cada id del roster existe en el dex generado.
- Megas exclusivas de Champions: sección `championsOverrides` en `data/data-bundle.json` (stats manuales, `source:'manual-champions'` + `confidence`), fusionada por `tools/build-canonical-dex.mjs` al regenerar.
- Integración UI: `core/state.js` añade `state.rules = {regulationId, mode:'doubles'}` (arranque: regulación activa por fecha, selector para la siguiente); `picker/modal.js` filtro/badge de legalidad (no ocultar por defecto); `editor/set-editor.js` Megas legales y máx. 1 restringida; `teams/actions.js` valida clauses al cargar (marca violaciones, no bloquea); pick-4 parametrizado desde `rules/formats.js`. Frontera con `battle/rule-registry.js` (mecánica de combate) documentada en `battle/ENGINE_STATE.md`.

### Fase 4 — Datos
1. Usage Smogon degradado a *prior de popularidad* (UI: "uso estimado"); la legalidad la dicta `rules/`; `gen9nationaldexdoubles-0.json` como prior alternativo para dobles.
2. Arreglar el generador de aliases en `tools/build-canonical-dex.mjs` (base→base, nunca base→mega/gmax) y **regenerar** `generated.js`; test de regresión en `tests/canonical/`.
3. Sanear `effects-master.seed.json`: sustituir `major_status_immunity_subset` por composición con `grant_immunity`; verificar/eliminar `override_priority_weather`; añadir al bridge validación de arranque que loguee kinds desconocidos.

### Fase 5 — Limpieza y storage
1. Invertir la dirección de reexport: implementación real de Quick→`modes/quick.js` y Live→`modes/live.js`; `app-core.js` queda como bootstrap+wiring (por bloques, ui-smoke entre commits; cuidado con el orden de init de `window.*` y `setEffectsActiveIndicesCallback` en `app-core.js:72`).
2. Consolidar listeners inline en `events/bindings.js`; eliminar globals `window.openSetEditor/openModal/setUiMode` (delegación de eventos).
3. Borrar placeholders muertos (`picker/pokedex.js`, exports sin consumidor de `matrix/explainer.js`).
4. Migración de storage: `teams/storage.js` lee v4, valida shape, normaliza ids con el dex (repara equipos con aliases rotos), escribe `…-v5` `{version:5, regulationId, teams}` conservando v4 como backup; clauses validadas al cargar sin destruir datos.
5. `sw.js`: bump + precache de `rules/`; actualizar `documentation.md` y `battle/ENGINE_STATE.md` al cierre de cada fase.

### Fase 6 — Tests de regulación y endurecimiento
- Nuevos: `tests/formulas/` (paridad de prioridades vs dex canónico para los movimientos de prioridad del roster, rolls con clamp, HP nivel 50 conocidos, velocidad con stages+Tailwind+Scarf+Proto) y `tests/rules/` (regulación activa por fecha 12-jun→M-A / 18-jun→M-B, roster legal, máx 1 restringida, Item/Species Clause, pick 4, Megas manuales presentes).
- Ampliar `tests/competitive-rules/` (Intimidate↔Defiant, Fake Out vs Inner Focus/Covert Cloak, Choice lifecycle, Prankster+TR) y `tests/ui-smoke/` (selector de regulación, validación de equipo).
- Gate por fase: todas las suites en verde; ningún cambio de snapshot sin etiqueta correct/provisional/gap documentada.

### Riesgos principales
| Riesgo | Mitigación |
|---|---|
| Consumidores dependen del signo negativo de velocidad bajo TR | El adaptador conserva firma/signo; normalización en fase dedicada posterior |
| Caches globales (`core/runtime.js`) sirviendo valores pre-refactor | Versionar cache keys con `FORMULAS_VERSION`/`RULES_VERSION` (patrón de `battle/cache-keys.js`); limpiar al cambiar regulación |
| Stats manuales de Megas de Champions incorrectos | `source:'manual-champions'`+`confidence`; test que falla si una Mega del roster carece de stats; revisión humana |
| Extraer modos de `app-core.js` rompe orden de init | Dejarlo para la Fase 5, por bloques, con reexports temporales y ui-smoke |
| PWA sirve código viejo | Bump de `sw.js` en cada fase que toque rutas |
| M-B entra el 17-jun | `rules/` nace con M-A y M-B; el roster M-B puede aterrizar en segunda pasada sin tocar el motor |

## Verificación
1. Por fase: `node tests/baseline/run-baseline.mjs` + las 8 suites restantes (`action-core`, `canonical`, `competitive-rules`, `performance`, `product-adapters`, `snapshot`, `synergy`) en verde.
2. `node tests/ui-smoke/run-ui-smoke.mjs` con servidor estático local (requiere Chrome) tras fases que tocan UI (2, 3, 5).
3. Comprobación manual: abrir la app servida estáticamente, validar Quick (combos/Turn 1), Expert (matriz) y Live, selector de regulación M-A/M-B, badge de ilegalidad en picker, validación de clauses al cargar equipo guardado v4 (migración a v5).
4. Casos de humo del motor: orden de velocidad con Tailwind y Trick Room en speed tiers; Prankster+Trick Room = -6; First Impression actúa después de Fake Out; Eruption al 50% HP ≈ mitad de daño.
