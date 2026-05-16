# PROJECT_DOCUMENTATION.md
## Documentación técnica maestra de `champions-meta`

### 1. Título y propósito

**Nombre del proyecto**

`champions-meta` es una aplicación web táctica orientada a análisis de equipos, selección de Pokémon, comparación ofensiva/defensiva, simulación rápida de bring (`Quick mode`) y simulación operativa de combate en curso (`Live mode`) sobre datos meta integrados y una capa propia de evaluación táctica.

**Qué resuelve la app**

La app permite construir dos equipos (`self` y `enemy`), asignar sets probables o editados manualmente, consultar análisis tácticos, renderizar una matriz de matchup, preparar una selección de cuatro para combate y simular decisiones activas de un combate live con estado de campo y slots activos.

**Para qué sirve este documento**

Este documento actúa como fuente de verdad técnica del estado actual del proyecto tras completar la **Fase 3** de refactorización estructural. Su objetivo es permitir mantenimiento seguro, desarrollo incremental y refactorización futura sin reintroducir el antiguo acoplamiento monolítico.

**A quién va dirigido**

- Desarrolladores humanos que necesiten mantener, ampliar o depurar la aplicación.
- Agentes de IA integrados en IDE que necesiten contexto operativo fiable para tocar el código sin romper la arquitectura actual.

---

### 2. Resumen ejecutivo

La arquitectura actual ya no usa `app.js` como monolito. El entrypoint público es ahora un bootstrap mínimo:

```js
import { bootstrapApp } from './app-core.js';

bootstrapApp();
```

La aplicación se organiza hoy alrededor de estos bloques:

| Bloque | Papel |
|---|---|
| `app.js` | Entry point mínimo del navegador |
| `app-core.js` | Módulo interno grande que aún conserva lógica compartida y residual de Quick/Live |
| `core/` | Estado global, constantes, refs DOM y runtime compartido |
| `render/` | Orquestación global de render y paneles UI |
| `events/` | Registro de listeners globales y delegación pesada del DOM |
| `modes/` | Fronteras lógicas de Quick y Live |
| `teams/` | Persistencia y acciones de equipos |
| `picker/`, `editor/` | UI modular de selección y edición |
| `battle/`, `analysis/`, `matrix/`, `data/` | Lógica de cálculo, datos, análisis y matriz |

**Estado de la refactorización**

La Fase 3 está **cerrada a nivel estructural de bootstrap, render global y wiring principal**. Aun así, el proyecto mantiene un punto delicado: `app-core.js` sigue siendo grande y concentra mucha lógica que ya tiene frontera modular pública en `modes/quick.js`, `modes/live.js`, `render/app.js` y otros módulos.

**Qué papel conserva todavía `app.js`**

`app.js` ya no contiene lógica funcional. Solo arranca la app. En el estado actual, el verdadero “centro interno” del proyecto es `app-core.js`.

---

### 3. Visión funcional de la app

Desde producto, la aplicación permite lo siguiente:

- Construir el equipo propio (`self`) y el rival (`enemy`) en slots de 6.
- Elegir Pokémon desde una Pokédex/meta list integrada.
- Editar sets, moves, abilities, item, nature y spreads desde un editor modal.
- Consultar una matriz ofensiva/defensiva de matchups.
- Obtener paneles de análisis táctico:
  - amenazas
  - oportunidades ofensivas
  - estrategias inferidas
  - speed tiers
  - alertas defensivas
- Alternar entre tres modos de UI:
  - `Quick`
  - `Expert`
  - `Live`
- En `Quick mode`:
  - evaluar combinaciones de 4
  - renderizar preview de bring
  - bloquear los mejores 4
  - revisar MVP/banner
  - simular `Turn 1`
- En `Live mode`:
  - fijar slots activos
  - simular estado de campo
  - consultar recomendaciones de acción
  - abrir battle sheet contextual
- Guardar y cargar equipos en `localStorage`.

**Entradas principales**

- Slots de equipo y Pokémon seleccionados.
- Rating objetivo.
- Estado del campo: clima, terreno, Trick Room, Tailwind, hazards, screens.
- Sets meta o sets editados.
- Selección de leads y selección de cuatro.
- Activos live.

**Salidas renderizadas**

- Docks laterales de equipos.
- Matriz táctica.
- Paneles de análisis.
- Preview de Quick.
- Simulador Turn 1.
- Strip de matchups activos.
- Toolbar de Live.
- Battle sheet contextual.
- Tooltips de scout e información.

**Flujos funcionales clave**

- Construcción del equipo.
- Apertura del picker y asignación de Pokémon.
- Edición de sets desde el modal.
- Cálculo de matrix y análisis.
- Cambio de modo UI.
- Flujo `Quick`: preview, combos, lock, turn 1.
- Flujo `Live`: foco activo, sheet, recomendaciones, estado de campo.
- Persistencia local de equipos.

---

### 4. Evolución arquitectónica

**Antes de la refactorización**

El proyecto partía de un `app.js` monolítico que mezclaba:

- bootstrap
- estado
- render
- lógica de equipos
- picker
- set editor
- quick mode
- live mode
- listeners globales
- tooltips y wiring DOM
- simulación táctica

**Problemas del monolito original**

- Alto riesgo al tocar cualquier parte.
- Imports imposibles o innecesarios.
- Funciones de render y lógica de negocio mezcladas.
- Estado global mutado desde demasiados sitios.
- Eventos globales acoplados a lógica de dominio.
- Refactorizaciones parciales muy frágiles.

**Qué se ha conseguido con la Fase 3**

- `app.js` pasó a ser bootstrap mínimo.
- El render global vive en `render/app.js`.
- Los listeners globales viven en `events/bindings.js`.
- Las acciones de equipos viven en `teams/actions.js`.
- Persistencia local de equipos vive en `teams/storage.js`.
- Quick y Live tienen frontera modular propia en `modes/`.
- Las refs DOM compartidas se centralizan en `core/dom.js`.
- Existe un bridge mínimo explícito en `bridges/ui-bridges.js` para evitar ciclos.

**Qué sigue siendo delicado o provisional**

- `app-core.js` sigue siendo muy grande y mantiene mucha lógica real.
- `modes/quick.js` y `modes/live.js` ya son frontera pública, pero hoy reexportan gran parte de la implementación desde `app-core.js`.
- `matrix/core.js`, `matrix/explainer.js` y `picker/pokedex.js` existen como placeholders y no son la implementación activa.
- Existen globals intencionales en `window` por compatibilidad del runtime UI.
- Hay puentes explícitos para evitar dependencias circulares.

**Puentes temporales y acoplamientos actuales**

- `bridges/ui-bridges.js` coordina `renderAll`, warmup, rerender del editor y batching sin importar directamente desde módulos que crearían ciclos.
- `app-core.js` sigue siendo host de lógica compartida aún no movida físicamente.
- `render/analysis.js` y `matrix/render.js` todavía leen helpers desde `app-core.js`.

---

### 5. Estructura del repositorio

#### Árbol relevante

```text
champions-meta/
  app.js
  app-core.js
  index.html
  styles.css
  manifest.json
  sw.js
  effects-registry-bridge.js
  effects-master.seed.json

  core/
    constants.js
    dom.js
    runtime.js
    state.js

  utils/
    debug.js
    text.js
    types.js

  data/
    data-bundle.json
    meta.js
    pokemon.js
    sets.js
    gen9championsou-0.json
    gen9championsou-1500.json
    gen9championsou-1630.json
    gen9championsou-1760.json
    gen9nationaldex-0.json
    gen9nationaldexdoubles-0.json
    download.py

  battle/
    damage.js
    effects.js
    moves.js
    registry.js
    speed.js
    stats.js

  analysis/
    threats.js

  matrix/
    core.js
    explainer.js
    render.js

  render/
    app.js
    analysis.js
    dock.js

  picker/
    modal.js
    pokedex.js

  editor/
    set-editor.js

  teams/
    actions.js
    storage.js

  modes/
    quick.js
    live.js

  events/
    bindings.js

  bridges/
    ui-bridges.js
```

#### Carpeta por carpeta

| Carpeta | Responsabilidad | Qué no debería ir ahí | Relación con otros bloques |
|---|---|---|---|
| `core/` | Estado, constantes, refs DOM, runtime compartido | Render, listeners, lógica de producto | Base transversal de toda la app |
| `utils/` | Utilidades puras o cuasi puras | Mutaciones de estado global o render pesado | Consumido por casi todos los dominios |
| `data/` | Acceso a datos, meta index, fetch y sets por defecto | Render o eventos | Alimenta `picker`, `teams`, `battle`, `analysis` |
| `battle/` | Heurísticas de daño, velocidad, efectos y registro | HTML, DOM, listeners | Consumido por matrix, live, analysis, quick |
| `analysis/` | Lógica analítica de amenazas y estrategias | Render de UI grande | Consumido por `render/analysis.js` |
| `matrix/` | Cálculo y render de la matrix | Persistencia, picker, editor | Nodo central entre battle, render y analysis |
| `render/` | Coordinación de render y paneles visuales | Mutaciones de dominio complejas | Orquesta la UI principal |
| `picker/` | Modal de selección y Pokédex | Render global o battle engine | Entrada de construcción de equipos |
| `editor/` | Modal del set editor | Render global, listeners globales | Modifica sets y rerenderiza |
| `teams/` | Acciones y almacenamiento local de equipos | Lógica de matrix o paneles | Se integra con UI vía bridge |
| `modes/` | Frontera funcional de Quick y Live | Bootstrap o persistencia | Consumido por render y events |
| `events/` | Listeners globales, delegación pesada, tooltips runtime | Lógica de negocio pura | Cablea la interacción global |
| `bridges/` | Puentes mínimos contra ciclos | Lógica de negocio nueva permanente | Solo para compatibilidad estructural |

#### Artefactos auxiliares y no-runtime

En la raíz existen scripts como `extract_*.js`, `fix_*.js`, `script*.js` y similares. No forman parte del runtime normal de la app y no deben tomarse como módulos funcionales del producto. Son artefactos de soporte/refactorización.

---

### 6. Mapa de módulos y responsabilidades

| Módulo / archivo | Responsabilidad principal | Tipo de lógica | Dependencias relevantes | Riesgo de cambio | Observaciones |
|---|---|---|---|---|---|
| `app.js` | Bootstrap público mínimo | Arranque | `app-core.js` | Bajo | No añadir lógica aquí |
| `app-core.js` | Host interno grande de bootstrap, Quick, Live y helpers compartidos | Orquestación y compatibilidad | Prácticamente toda la app | Alto | Sigue siendo el mayor foco técnico |
| `core/state.js` | Estado global inicial | Estado | `localStorage` | Alto | Cualquier cambio afecta a toda la app |
| `core/dom.js` | Refs DOM centralizadas por dominio | UI infra | `document` | Medio | No meter tooltips efímeros aquí |
| `core/runtime.js` | Caches y bridges en `window` | Runtime | `window` | Medio | Compatibilidad deliberada |
| `core/constants.js` | Configuración, tablas y presets | Datos/config | Ninguna fuerte | Medio | Archivo grande |
| `utils/debug.js` | Logging, modo debug y acciones debug | Utilidad/runtime | `core/runtime`, callbacks configurados | Medio | Usa inyección de callbacks |
| `utils/text.js` | Normalización, traducción y mapeos de nombres | Utilidad | `core/constants`, `core/runtime` | Medio | Clave para slugs y display names |
| `utils/types.js` | Utilidades de tipos, ranking y color | Utilidad | `core/constants` | Bajo | Muy reutilizado |
| `data/meta.js` | Índices meta/fallback y resolución de registros | Datos | `state`, `utils/text`, constants | Alto | Central en lookup de especies |
| `data/pokemon.js` | Fetch lógico de Pokémon desde `GameDB` y battle state base | Datos/runtime | `state`, `data/sets`, `core/runtime` | Alto | Punto de entrada de mons |
| `data/sets.js` | Construcción de set por defecto desde meta | Datos/síntesis | `data/meta`, `battle` helpers | Alto | Afecta todo el flujo |
| `battle/damage.js` | Estimación de daño y mejor ataque | Simulación | `moves`, `stats`, `runtime`, registry | Alto | Heurístico, no simulador completo |
| `battle/effects.js` | Estado de campo, switch-in y efectos | Simulación/estado | `registry`, `speed`, callback de activos | Alto | Muy delicado |
| `battle/moves.js` | Candidatos de movimientos y metadatos | Datos/simulación | `GameDB`, constants | Medio | Importante para damage/live |
| `battle/registry.js` | Registro parcial de abilities/items/moves/status | Integración/simulación | `EffectsRegistryBridge` | Alto | Implementación parcial deliberada |
| `battle/speed.js` | Cálculo de velocidad efectiva | Simulación | `state.field`, `registry`, runtime cache | Medio | Trick Room se modela en el signo |
| `battle/stats.js` | Parsing de spreads y stats efectivos | Simulación | Datos base y naturalezas | Medio | Dependencia transversal |
| `analysis/threats.js` | Score de amenazas y estrategias inferidas | Análisis | `battle`, `constants` | Medio | Sin DOM |
| `matrix/render.js` | Implementación activa de matrix, ayuda y preferencias | Render/cálculo | `battle`, `render/app`, `app-core` | Alto | Concentra lógica que debería seguir dividiéndose |
| `matrix/core.js` | Placeholder | N/A | N/A | Bajo | No es la implementación activa |
| `matrix/explainer.js` | Placeholder | N/A | N/A | Bajo | No es la implementación activa |
| `render/app.js` | Coordinador global de render y modo UI | Render/orquestación | `state`, `dock`, `matrix`, `analysis`, `modes`, `battle/effects` | Alto | Corazón visible del render |
| `render/analysis.js` | Paneles analíticos debajo de matrix | Render | `analysis`, `matrix`, `battle`, `app-core` | Medio/alto | Consume equipos enfocados |
| `render/dock.js` | Slots de equipo y Team Config Drawer | Render/UI | `state`, `teams/storage`, presets | Medio | Mezcla dock y drawer |
| `picker/modal.js` | Modal de selección, Pokédex y pick a slot | UI/interacción | `state`, `data`, `render`, bridge | Alto | Tiene listeners locales propios |
| `picker/pokedex.js` | Placeholder | N/A | N/A | Bajo | No es la implementación activa |
| `editor/set-editor.js` | Editor completo de sets y submodal de choice | UI/interacción | `state`, `data`, `render`, bridge, picker | Alto | Módulo grande y sensible |
| `teams/storage.js` | Guardado local de equipos | Persistencia | `state`, `localStorage` | Bajo/medio | Actualmente guarda el equipo `self` |
| `teams/actions.js` | Carga de equipos y fills masivos | Acciones/estado | `state`, `data`, bridge | Medio/alto | Mutación fuerte de `state` |
| `modes/quick.js` | Frontera pública de Quick mode | Modo UI | `app-core`, `state`, runtime, `battle/effects` | Alto | Aún reexporta implementación real |
| `modes/live.js` | Frontera pública de Live mode | Modo UI | `app-core` | Alto | Aún reexporta implementación real |
| `events/bindings.js` | Listeners globales y tooltips runtime | Eventos/UI | render, picker, editor, teams, modes | Alto | No meter negocio nuevo aquí |
| `bridges/ui-bridges.js` | Puente mínimo para refresh UI y warmup | Bridge | `battle/effects`, callbacks configurados | Medio | Temporal pero intencional |
| `effects-registry-bridge.js` | Bridge externo de registries/effect entries | Runtime externo | `localStorage`, `fetch` | Medio | Se carga antes del módulo principal |
| `sw.js` | Service worker y caché | Shell/PWA | Cache API, red | Bajo | No afecta la lógica táctica |
| `manifest.json` | Metadata PWA | Shell/PWA | Navegador | Bajo | Periférico |

---

### 7. Flujo de inicialización de la app

#### Secuencia real de arranque

1. `index.html` carga `effects-registry-bridge.js` como script clásico.
2. En `DOMContentLoaded`, `index.html` intenta cargar `./effects-master.seed.json` en `window.EffectsRegistryBridge`.
3. `index.html` carga `app.js` como `<script type="module" defer>`.
4. `app.js` importa `bootstrapApp()` desde `app-core.js` y lo ejecuta.
5. `bootstrapApp()`:
   - protege contra doble bootstrap con `bootstrapped`
   - configura `bridges/ui-bridges.js`
   - configura `utils/debug.js`
   - registra listeners globales en `events/bindings.js`
   - llama a `initApp()`
6. `initApp()`:
   - restaura `uiMode` desde `localStorage`
   - carga preferencias de matrix
   - hace `fetch('./data/data-bundle.json')`
   - asigna `window.GameDB`
   - rellena `i18nCache`
   - asigna `state.smogonRaw`
   - construye `metaIndex` con `buildMetaIndex()`
   - prepara `state.pokedex` con `ensurePokedex()`
   - rehidrata sets actuales con `rehydrateCurrentTeamsSets()`
   - llama a `renderAll()`
   - abre/cierra ayuda de matrix según preferencia persistida
7. A partir de ahí, la interacción global ya está viva.

#### Pseudoflujo

```text
index.html
  -> carga EffectsRegistryBridge
  -> carga app.js (ESM)
    -> app.js
      -> bootstrapApp() en app-core.js
        -> configureUiBridges(...)
        -> configureDebugActions(...)
        -> initEventBindings(...)
        -> initApp()
          -> loadUiMode()
          -> loadMatrixPreferences()
          -> fetch data-bundle.json
          -> window.GameDB = bundle
          -> buildMetaIndex(...)
          -> ensurePokedex()
          -> rehydrateCurrentTeamsSets()
          -> renderAll()
          -> toggleMatrixHelp(...)
```

#### Papel actual de `initApp`

`initApp()` sigue siendo el arranque funcional real de la aplicación. Ya no vive en `app.js`, pero todavía vive dentro de `app-core.js`. Su papel es correcto para la estructura actual, aunque a futuro podría repartirse más.

#### Observación importante sobre módulos ESM

El runtime del navegador usa ESM porque `index.html` carga `app.js` como `type="module"`. El `package.json` declara `"type": "commonjs"`, pero eso **no gobierna** el comportamiento del navegador en esta app. Es una fuente común de confusión para herramientas, no un error del runtime web actual.

---

### 8. Flujo de render

#### Quién coordina el render global

El coordinador global es `render/app.js`.

#### Qué hace `renderAll()`

`renderAll(force = false)`:

- evita renderizar si `isBatchUpdating` está activo
- agrupa render mediante `requestAnimationFrame`
- delega el trabajo real en `_doRender(force)`

Esto reduce renders inmediatos encadenados y mantiene un batching visual básico.

#### Qué hace `_doRender()`

`_doRender(force = false)` ejecuta, en orden:

1. `renderUiMode()`
2. `renderDock('self')`
3. `renderDock('enemy')`
4. Si el modo es `quick` o se fuerza:
   - decide si reevaluar combos por cambio estructural o `state.needsReevaluation`
   - `evaluateAllCombos()`
   - `renderTurn1Simulator()`
   - `renderQuickLayer()`
5. Si el modo es `expert` o se fuerza:
   - `getRows()`
   - `renderMatrix(rows)`
   - `renderThreats()`
   - `renderOpportunities(rows)`
   - `renderStrategies()`
   - `renderWeaknessSummary()`
   - `renderSpeedTiers()`
   - `renderDefensiveAlerts()`
6. Si el modo es `live` o se fuerza:
   - `getRows()`
   - `renderMatrix(rows)`
   - `renderLiveStatePanel()`
   - `renderLiveRecommendations()`
7. Siempre:
   - `renderActiveMatchupStrip()`
   - `renderLiveBattleToolbar()`
8. Si el foco de batalla está activo:
   - fuerza visibilidad de strip y toolbar live

#### Cómo se decide la visibilidad según el modo UI

`renderUiMode()`:

- activa el botón correspondiente en `#uiModeToggle`
- muestra/oculta paneles de Quick:
  - `quickPreviewPanel`
  - `turn1SimulatorPanel`
  - `quickCombosSection`
- muestra/oculta paneles de Expert:
  - sección matrix
  - `insightGrid`
  - `defensiveAlertFloat`
- Live reutiliza la matrix y paneles live, pero no muestra Quick.

#### Relación entre render principal y submódulos

| Área | Módulo principal |
|---|---|
| Coordinación global | `render/app.js` |
| Docks y drawer | `render/dock.js` |
| Matrix activa | `matrix/render.js` |
| Análisis experto | `render/analysis.js` |
| Quick | `modes/quick.js` -> implementación real en gran parte en `app-core.js` |
| Live | `modes/live.js` -> implementación real en gran parte en `app-core.js` |
| Picker | `picker/modal.js` |
| Set editor | `editor/set-editor.js` |

#### Batching, flags y render en momentos delicados

Los mecanismos actuales observables son:

- `isBatchUpdating` en `render/app.js`
- `setBatchUpdating(val)` en `render/app.js`
- `setBatchUpdatingBridge(value)` en `bridges/ui-bridges.js`
- `renderTimer` con `requestAnimationFrame`
- `lastSelfLength` y `lastEnemyLength` para invalidar combos
- `state.needsReevaluation`, usado como flag dinámico de reevaluación
- invalidación de caches Quick en `modes/quick.js`

`state.needsReevaluation` no forma parte del estado inicial declarado en `core/state.js`; se usa como flag dinámico de runtime. Esto debe tenerse en cuenta antes de limpiar estado o serializarlo.

---

### 9. Estado global y contratos de datos

#### Dónde vive el estado global

El estado global vive en `core/state.js` y se exporta como singleton `state`.

#### Forma de alto nivel

```js
state = {
  self: [mon|null x6],
  enemy: [mon|null x6],
  modal: { side, index },
  pokedex: [],
  cache: Map(),
  loadingList: false,
  moveTypeCache: {},
  smogonRaw: null,
  metaIndex: Map(),
  fallbackIndex: Map(),
  metaRanked: [],
  rating: "1760",
  loadingMeta: false,

  field: {
    weather, weatherTurns,
    terrain, terrainTurns,
    trickRoom, trickRoomTurns,
    tailwindSelf, tailwindSelfTurns,
    tailwindEnemy, tailwindEnemyTurns,
    reflectSelf, reflectSelfTurns,
    lightScreenSelf, lightScreenSelfTurns,
    auroraVeilSelf, auroraVeilSelfTurns,
    reflectEnemy, reflectEnemyTurns,
    lightScreenEnemy, lightScreenEnemyTurns,
    auroraVeilEnemy, auroraVeilEnemyTurns,
    hazards: {
      self: { rocks, spikes, tspikes, web },
      enemy: { rocks, spikes, tspikes, web }
    },
    quickGuardSelf, wideGuardSelf, redirectionSelf,
    quickGuardEnemy, wideGuardEnemy, redirectionEnemy
  },

  matrixMode: "offensive" | "defensive",
  matrixDetailMode: "detailed" | ...,
  matrixHelpOpen: boolean,

  leads: { self: [], enemy: [] },
  uiMode: "quick" | "expert" | "live",
  chosenFour: [],
  chosenEnemyFour: [],
  battleFocus: "active" | ...,
  activeSelfSlots: [idx, idx],
  activeEnemySlots: [idx, idx],
  selectedMatrixCell: HTMLElement|null,
  turn1Custom: boolean,
  battleSheet: { open, side, slotKey, cell },

  setEditor: { index: number|null },
  setChoice: { kind, moveIndex, options, query }
}
```

#### Estructura esperada de un Pokémon en estado

Un `mon` típico en `state.self[i]` o `state.enemy[i]` contiene al menos:

```js
{
  id,
  name,
  displayName,
  sprite,
  types: [],
  baseStats: {
    hp,
    attack,
    defense,
    "special-attack",
    "special-defense",
    speed
  },
  metaRank,
  usage,
  set: {
    source,
    rating,
    ability,
    item,
    nature,
    evs,
    moves: ["", "", "", ""],
    teammates,
    raw
  },
  battle: {
    hpPct: 100,
    stages: { atk, def, spa, spd, spe },
    status: null,
    choiceLocked: null,
    sashIntact: boolean,
    boostStacks: { rageFist: 0 }
  }
}
```

#### Qué partes del estado usa cada módulo

| Módulo | Estado principal que lee o muta |
|---|---|
| `render/app.js` | `uiMode`, equipos, `needsReevaluation`, activos, leads |
| `render/analysis.js` | equipos enfocados, `matrixMode`, `field` |
| `matrix/render.js` | equipos, `field`, `matrixMode`, `matrixDetailMode`, `matrixHelpOpen` |
| `picker/modal.js` | `modal`, `self`, `enemy`, `leads`, `pokedex` |
| `editor/set-editor.js` | `setEditor`, `setChoice`, `self` |
| `teams/actions.js` | `self`, `enemy`, `leads`, activos |
| `modes/quick.js` | `chosenFour`, `chosenEnemyFour`, `leads`, `turn1Custom` |
| `modes/live.js` / `app-core.js` | `battleFocus`, `activeSelfSlots`, `activeEnemySlots`, `battleSheet`, `field` |
| `battle/effects.js` | `field`, equipos, activos |
| `data/meta.js` | `metaIndex`, `fallbackIndex`, `metaRanked` |
| `data/pokemon.js` | `cache` |

#### Qué módulos mutan estado

Mutan estado de forma directa o principal:

- `app-core.js`
- `teams/actions.js`
- `picker/modal.js`
- `editor/set-editor.js`
- `events/bindings.js`
- `battle/effects.js`
- `render/app.js` vía `setUiMode()`
- `modes/quick.js`

Leen principalmente y renderizan:

- `render/analysis.js`
- `render/dock.js`
- parte de `matrix/render.js`
- `analysis/threats.js`
- `utils/*`

#### Invariantes importantes de estado

- `state.self` y `state.enemy` deben mantenerse como arrays de longitud 6.
- Los slots vacíos se representan con `null`.
- Todo mon operativo debe tener `battle` inicializado mediante `ensureBattleState(mon)`.
- `state.activeSelfSlots` y `state.activeEnemySlots` deben contener índices válidos o vaciarse si no hay mons.
- `state.leads` y `state.active*Slots` se sincronizan parcialmente al cambiar `uiMode`.
- `state.cache` guarda clones de Pokémon base, no debe contener referencias mutadas vivas del equipo.
- `state.metaIndex` y `state.fallbackIndex` son `Map`, no objetos planos.
- Flags dinámicos como `state.needsReevaluation` pueden aparecer fuera del estado inicial estático.

---

### 10. DOM y referencias UI

#### Papel de `core/dom.js`

`core/dom.js` es el repositorio centralizado de nodos DOM estáticos compartidos. Su objetivo es evitar búsquedas dispersas y repetidas.

Agrupa refs por dominio:

- `DOCK`
- `UI_MODES`
- `MATRIX`
- `ANALYSIS`
- `QUICK`
- `PICKER`
- `SET_EDITOR`
- `LIVE`

Usa `getEl(id)` con cache local.

#### Qué centraliza

Ejemplos reales:

| Grupo | Refs |
|---|---|
| `DOCK` | `selfSlots`, `enemySlots` |
| `UI_MODES` | `uiModeToggle`, título sección matrix, insight grid, float defensivo |
| `MATRIX` | container, placeholder, toggles, controles de campo |
| `ANALYSIS` | listas de threat/opportunity/strategy/speed |
| `QUICK` | preview, combos, mvp, rows T1, panel de momentum |
| `PICKER` | modal, input, lista, título |
| `SET_EDITOR` | modal, body, title, submodal de choice |
| `LIVE` | focus toggle, strip, toolbar, sheet, state panel, field controls, recommendations |

#### Qué refs se resuelven localmente y por qué

No todo debe ir a `core/dom.js`.

Se resuelven localmente cuando:

- son tooltips efímeros creados en runtime
- pertenecen a un modal generado dinámicamente
- son nodos temporales cuya vida está ligada a un único módulo

Ejemplos:

- `damageTooltipContainer`, `scoutTooltipContainer`, `infoTooltipContainer` en `events/bindings.js`
- `teamConfigModal` y `drawerOverlay` en `render/dock.js`

#### Reglas prácticas para futuros módulos UI

- Si el nodo es estable, compartido y existe desde `index.html`, debe vivir en `core/dom.js`.
- Si el nodo nace dinámicamente y solo lo usa un módulo, debe resolverse localmente en ese módulo.
- No centralizar tooltips runtime o overlays efímeros en `core/dom.js`.
- No volver a introducir `document.getElementById(...)` dispersos en módulos ya cubiertos por `core/dom.js` salvo excepción justificada.

---

### 11. Módulos por dominio

## Core

**Misión**

Definir el esqueleto global del runtime: estado, constantes, refs DOM y caches auxiliares.

**Archivos clave**

- `core/state.js`
- `core/dom.js`
- `core/runtime.js`
- `core/constants.js`

**Responsabilidades principales**

- `state.js`: singleton del estado global.
- `dom.js`: refs DOM cacheadas y agrupadas.
- `runtime.js`: acceso centralizado a caches en `window`, `GameDB` y `EffectsRegistryBridge`.
- `constants.js`: configuración, claves de storage, chart de tipos, presets, fallback maps, moves support, etc.

**Riesgos**

- Cambiar claves de estado rompe render, eventos y simulación.
- Cambiar nombres de refs DOM rompe módulos consumidores.
- Cambiar constants puede alterar evaluaciones tácticas o persistencia.

---

## Utils

**Misión**

Encapsular utilidades reutilizables y minimizar repetición transversal.

**Archivos clave**

- `utils/debug.js`
- `utils/text.js`
- `utils/types.js`

**Responsabilidades principales**

- `debug.js`: logging controlado, modo debug, callbacks de acciones debug.
- `text.js`: normalización, traducciones, slugs y escape HTML.
- `types.js`: tablas visuales y helpers de ranking/efectividad.

**Notas**

- `normalizeText()` y los slugs son críticos para todo lookup de especies/moves/items/abilities.
- `compactName()` y algunos strings presentan mojibake en la fuente; es un detalle de codificación, no de arquitectura.

---

## Datos / meta / pokédex / sets

**Misión**

Resolver la base de conocimiento de la app.

**Archivos clave**

- `data/data-bundle.json`
- `data/meta.js`
- `data/pokemon.js`
- `data/sets.js`

**Responsabilidades principales**

- cargar y usar `GameDB`
- construir índices meta
- resolver species records
- sintetizar sets por defecto
- crear instancias de Pokémon para los equipos

**Comportamiento importante**

- La app ya no descarga datasets por rating en runtime; usa `data-bundle.json` cargado al arranque.
- `ratingSelect` se conserva, pero actualmente su cambio solo actualiza `state.rating` y muestra un aviso.
- `fetchPokemon()` no llama a PokeAPI de forma directa en este flujo principal; lee desde `window.GameDB.pokedex`.
- Existen términos custom y fallback si una especie no está en la base.

**Pendientes de validación**

- La carpeta `data/` contiene JSONs individuales de Smogon que hoy parecen más bien insumo o respaldo, no el camino principal del runtime.
- `download.py` no forma parte del flujo de app visible.

---

## Battle engine

**Misión**

Aplicar heurísticas tácticas y de combate para matrix, análisis, quick y live.

**Archivos clave**

- `battle/damage.js`
- `battle/effects.js`
- `battle/moves.js`
- `battle/registry.js`
- `battle/speed.js`
- `battle/stats.js`

**Responsabilidades principales**

- estimar daño y OHKO risk
- elegir mejor ataque
- calcular velocidad efectiva
- aplicar efectos de switch-in y resolución de move
- mantener clima, terreno, pantallas, hazards y flags
- registrar abilities/items/moves/status relevantes en el bridge de efectos

**Límites del motor**

No es un simulador completo de Showdown. Es un motor heurístico/táctico para recomendaciones y visualización.

**Invariante crítico**

`battle/effects.js` depende de `setEffectsActiveIndicesCallback(...)` para conocer qué slots están activos según Quick o Live. Ese callback se inyecta desde `app-core.js`. No romper esta inyección.

---

## Matrix

**Misión**

Generar la matriz táctica ofensiva/defensiva y sus explicaciones.

**Archivos clave**

- `matrix/render.js`
- `matrix/core.js`
- `matrix/explainer.js`

**Estado actual real**

La implementación viva de matrix está en `matrix/render.js`.

`matrix/core.js` y `matrix/explainer.js` existen como placeholders y hoy no son el núcleo operativo.

**Responsabilidades activas de `matrix/render.js`**

- `getRows()`
- clasificación visual de celdas
- preferencia de detalle
- ayuda de matrix
- render de tabla
- markup de tooltips
- animación/flash
- UI de campo en matrix

**Riesgos**

- Es un módulo sobrecargado.
- Tiene dependencias hacia `app-core.js` y `render/app.js`.
- Es un candidato claro a futura subdivisión real.

**Pendiente de validación**

En el archivo aparece lógica auxiliar que parece heredada del monolito. Conviene revisar cualquier helper no consumido antes de tocarlo de forma agresiva.

---

## Analysis

**Misión**

Convertir la información táctica en paneles humanos de decisión.

**Archivos clave**

- `analysis/threats.js`
- `render/analysis.js`

**Separación real**

- `analysis/threats.js` contiene la lógica analítica pura.
- `render/analysis.js` la convierte en UI renderizada.

**Paneles actuales**

- Threats
- Opportunities
- Strategies
- Speed tiers
- Defensive alerts

**Dependencias**

- usa `getFocusedTeam()` para respetar foco de batalla
- usa `matrix/render.js` para badges/contexto
- usa `battle/speed.js`, `battle/stats.js` y `analysis/threats.js`

---

## Render

**Misión**

Coordinar qué se ve y cuándo se ve.

**Archivos clave**

- `render/app.js`
- `render/dock.js`
- `render/analysis.js`

**Responsabilidades**

- `render/app.js`: render global, batching, modo UI.
- `render/dock.js`: slots de equipo y Team Config Drawer.
- `render/analysis.js`: paneles expertos.

**Observación importante**

`render/dock.js` tiene responsabilidad mixta. No solo renderiza slots; también genera y gestiona el drawer de configuración de equipos. Es aceptable hoy, pero es un punto a vigilar si el drawer crece.

---

## Picker

**Misión**

Permitir seleccionar y asignar Pokémon a slots.

**Archivo activo**

- `picker/modal.js`

**Responsabilidades**

- construir `state.pokedex` desde `metaRanked`
- renderizar la lista filtrable
- abrir/cerrar el modal
- resolver selección de Pokémon
- validar Species Clause y Mega Clause para `self`

**Notas**

- Tiene listeners locales propios, lo cual es correcto porque su UI es local al modal.
- `picker/pokedex.js` no es la implementación activa actual.

---

## Set editor

**Misión**

Editar el set de un Pokémon del equipo propio.

**Archivo activo**

- `editor/set-editor.js`

**Responsabilidades**

- asegurar shape editable del set
- sugerencias rápidas de ability/item/move/nature/spreads
- modal principal
- submodal de elección rápida
- aplicación de cambios
- reset al set meta
- cambio de Pokémon desde editor

**Riesgos**

- Es un módulo grande y sensible.
- Mezcla render, decisiones de opciones rápidas y mutación del set.
- Cualquier cambio debe validarse manualmente en varias rutas del editor.

---

## Teams

**Misión**

Persistencia local y acciones masivas de composición de equipos.

**Archivos**

- `teams/storage.js`
- `teams/actions.js`

**Responsabilidades**

- `storage.js`:
  - leer/escribir equipos guardados
  - guardar equipo actual `self`
  - borrar equipos guardados
- `actions.js`:
  - cargar saved team
  - cargar test team
  - rellenar equipo desde species list

**Notas**

- `saveCurrentTeam()` solo guarda el equipo propio.
- `teams/actions.js` usa el bridge UI para warmup y rerender sin importar directamente módulos que generarían ciclos.

---

## Quick mode

**Misión**

Preparación rápida de bring y simulación de Turn 1.

**Frontera pública**

- `modes/quick.js`

**Implementación real actual**

- gran parte en `app-core.js`

**Funciones expuestas o asociadas**

- `buildQuickCombos`
- `evaluateAllCombos`
- `renderQuickCombos`
- `renderQuickLayer`
- `renderQuickPreview`
- `renderMvpBanner`
- `renderTurn1Simulator`
- `renderTurn1PickRows`
- `lockBestFour`
- `applyQuickCombo`
- `computeQuickPreview`
- `getTurn1ResolvedLeadIndices`
- `resetQuickCombosLock`
- `toggleTurn1LeadSlot`

**Notas críticas**

- `resetQuickCombosLock()` limpia selección, flags y caches Quick.
- `toggleTurn1LeadSlot()` recalcule campo y fuerza render.
- Quick es sensible a `state.leads`, `chosenFour`, `chosenEnemyFour`, `turn1Custom` y caches de daño/velocidad.

---

## Live mode

**Misión**

Simular el centro de batalla activo y sugerir decisiones.

**Frontera pública**

- `modes/live.js`

**Implementación real actual**

- gran parte en `app-core.js`

**Funciones expuestas**

- `isBattleFocusActive`
- `getFilledIndices`
- `normalizeActiveSlots`
- `getFocusedIndices`
- `getFocusedTeam`
- `setBattleFocus`
- `setActiveBattleSlot`
- `openBattleSheet`
- `closeBattleSheet`
- `renderActiveMatchupStrip`
- `renderLiveBattleToolbar`
- `renderBattleSheet`
- `getCandidateActions`
- `simulateTurn`
- `scoreBoard`
- `suggestBestAction`
- `renderLiveRecommendations`
- `renderLiveStatePanel`
- `attachLiveStateListeners`
- `getTacticalReasons`
- `getTacticalMeaning`

**Notas críticas**

- Live depende de `activeSelfSlots`, `activeEnemySlots`, `battleFocus`, `battleSheet` y `field`.
- `window.setActiveBattleSlot` se mantiene expuesto por compatibilidad de UI inline.
- El battle sheet se abre en el segundo click sobre la misma celda táctica cuando el foco activo está encendido.

---

## Events / bindings

**Misión**

Registrar todos los listeners globales y la delegación pesada del DOM.

**Archivo**

- `events/bindings.js`

**Qué contiene**

- `initEventBindings(callbacks)`
- tooltips runtime
- `handleDrawerAction`
- bindings de toggles, buttons, click delegation, tooltips y live sheet

**Regla arquitectónica**

Este módulo debe cablear eventos, no alojar negocio nuevo salvo el estrictamente necesario para la interacción global.

**Listeners globales actualmente movidos**

- toggles de Tailwind/Trick Room
- toggles de matrix mode y detail
- ayuda de matrix
- controles de weather/terrain
- picks de Turn 1
- clicks delegados de docks
- botones `Load demo`, `Swap`, `Clear`
- botones del drawer de equipos
- `ratingSelect`
- `Escape`
- `uiModeToggle`
- tooltips de matrix/scout/info
- click delegado de Quick combos y `lockBestFour`
- foco y cierre del battle sheet Live
- selección táctica de celdas en modo Live

---

## Bridges temporales

**Archivo**

- `bridges/ui-bridges.js`

**Misión**

Evitar dependencias circulares entre módulos UI y orquestación.

**Responsabilidades**

- configuración de callbacks
- `requestUiRender()`
- `setBatchUpdatingBridge(value)`
- `scheduleMoveWarmup()`

**Por qué existe**

Hay acciones de equipos, picker y editor que necesitan:

- calentar registries
- recalcular campo
- rerenderizar
- refrescar editor/modal si están abiertos

Sin este bridge, varios módulos tendrían que importar directamente `render/app.js` y `editor/set-editor.js`, reintroduciendo acoplamientos circulares.

---

### 12. Flujo de interacción del usuario

#### Abrir app

1. Carga `GameDB`.
2. Se construye índice meta.
3. Se prepara Pokédex.
4. Se rehidratan sets existentes si los hubiera.
5. Se ejecuta `renderAll()`.
6. Los eventos globales ya están enlazados.

#### Elegir Pokémon

1. El usuario pulsa un slot vacío en `self` o `enemy`.
2. `events/bindings.js` abre `picker/modal.js`.
3. `picker/modal.js` renderiza la lista meta.
4. El usuario busca o elige un resultado.
5. `pickPokemonIntoSlot()` hace:
   - validaciones de formato para `self`
   - `fetchPokemon()`
   - `buildDefaultSetForSpecies()`
   - `ensureBattleState()`
   - escritura en `state`
   - limpieza parcial de leads si procede
   - `scheduleMoveWarmup()`
   - `renderAll()`

#### Editar set

1. El usuario pulsa un slot ocupado del equipo propio.
2. `events/bindings.js` abre `openSetEditor(idx)`.
3. `editor/set-editor.js`:
   - resuelve `getEditorMon()`
   - asegura `ensureEditableSet()`
   - genera opciones rápidas
   - renderiza el modal
4. Al cambiar item/ability/moves/spread:
   - se muta el set
   - se puede disparar `scheduleMoveWarmup()`
   - se re-renderiza la UI afectada

#### Ver análisis

1. El render global ejecuta `getRows()`.
2. `render/analysis.js` consume equipos enfocados.
3. Se calculan threats, opportunities, strategies y speed tiers.
4. Se actualizan iconos con `lucide.createIcons()`.

#### Cambiar modo UI

1. Click en `#uiModeToggle`.
2. `events/bindings.js` llama `setUiMode(mode)`.
3. `render/app.js`:
   - actualiza `state.uiMode`
   - persiste en `localStorage`
   - sincroniza `leads` y `active*Slots`
   - recalcula campo
   - `renderAll()`

#### Usar matrix

1. `render/app.js` llama `getRows()`.
2. `matrix/render.js` construye filas y celdas.
3. `renderMatrix(rows)` dibuja la tabla.
4. En modo Live y foco activo, un click en celda puede:
   - seleccionar visualmente la fila/columna
   - abrir battle sheet en segundo click sobre la misma celda

#### Usar Quick mode

1. `uiMode = quick`
2. `_doRender()`:
   - reevaluación de combos si cambió la estructura
   - render de preview
   - render de combos
   - render de Turn 1 simulator
3. El usuario puede:
   - bloquear los mejores cuatro
   - hacer click en una combo
   - marcar leads de Turn 1
4. Quick limpia caches específicas cuando corresponde.

#### Usar Live mode

1. `uiMode = live`
2. `_doRender()`:
   - renderiza matrix
   - renderiza `liveStatePanel`
   - renderiza recomendaciones
   - mantiene visible strip/toolbar live
3. El usuario puede:
   - cambiar el foco de batalla
   - seleccionar activos
   - abrir el battle sheet
   - editar el estado del campo
   - pedir recomendaciones tácticas implícitas

#### Guardar o cargar equipo

1. El usuario abre el Team Config Drawer.
2. `render/dock.js` lo genera dinámicamente.
3. `handleDrawerAction()` en `events/bindings.js` procesa acciones:
   - guardar
   - cargar guardado
   - borrar guardado
   - cargar preset meta
   - limpiar slots

---

### 13. Dependencias y acoplamientos

#### Dependencias limpias

Son relativamente limpias y naturales:

- `render/app.js` -> `render/dock.js`, `render/analysis.js`, `matrix/render.js`, `modes/*`
- `teams/actions.js` -> `data/*` + bridge UI
- `picker/modal.js` -> `data/*` + bridge/render
- `analysis/threats.js` -> `battle/*`
- `utils/*` y `core/*` como base transversal

#### Dependencias frágiles

Las más delicadas hoy son:

- `app-core.js` como host residual de demasiadas responsabilidades
- `matrix/render.js` como implementación viva de varias capas aún no separadas
- `render/analysis.js` y `matrix/render.js` importando helpers desde `app-core.js`
- `modes/quick.js` y `modes/live.js` reexportando lógica desde `app-core.js`
- globals temporales en `window`

#### Ciclos evitados mediante puentes o callbacks

- `battle/effects.js` evita ciclo con UI mediante `setEffectsActiveIndicesCallback()`
- `bridges/ui-bridges.js` evita ciclos entre:
  - `teams/actions.js`
  - `picker/modal.js`
  - `editor/set-editor.js`
  - `render/app.js`
- `utils/debug.js` evita acoplarse duro al render mediante `configureDebugActions(...)`

#### Módulos delicados al tocarlos

- `app-core.js`
- `render/app.js`
- `matrix/render.js`
- `editor/set-editor.js`
- `battle/effects.js`
- `events/bindings.js`

#### Orden recomendado para refactorizar en el futuro

1. Mover implementación real de `modes/quick.js` fuera de `app-core.js`.
2. Mover implementación real de `modes/live.js` fuera de `app-core.js`.
3. Dividir `matrix/render.js` en `matrix/core.js` y `matrix/explainer.js` reales.
4. Reducir dependencias de `render/analysis.js` y `matrix/render.js` respecto a `app-core.js`.
5. Revisar globals `window.*` y encapsular solo los imprescindibles.

---

### 14. Guía de mantenimiento para desarrolladores

#### Dónde tocar según el tipo de cambio

| Tipo de cambio | Lugar natural |
|---|---|
| Nuevo panel o visibilidad global | `render/app.js` o `render/*` |
| Nuevo cálculo de daño o velocidad | `battle/*` |
| Nuevo dato meta o resolución de species | `data/*` |
| Nuevo tooltip o interacción global | `events/bindings.js` |
| Cambios del picker | `picker/modal.js` |
| Cambios del set editor | `editor/set-editor.js` |
| Persistencia de equipos | `teams/storage.js` |
| Acción masiva sobre equipos | `teams/actions.js` |
| Quick mode | `modes/quick.js` y, mientras siga así, `app-core.js` |
| Live mode | `modes/live.js` y, mientras siga así, `app-core.js` |

#### Cómo añadir una feature sin ensuciar la arquitectura

- Añadir lógica de dominio en el módulo más cercano al problema.
- Exponer una función clara desde ese módulo.
- Hacer que `render/app.js` solo coordine visibilidad y llamadas de render.
- Usar `core/dom.js` para nodos estáticos compartidos.
- Usar un bridge o callback explícito si aparece un ciclo real, no antes.

#### Cómo evitar romper render/UI

- No llamar `renderAll()` desde demasiados lugares si el cambio puede agruparse.
- Respetar `isBatchUpdating` si se hace una carga masiva.
- No duplicar toggles o selectores ya centralizados.
- No cambiar IDs del DOM sin revisar `core/dom.js` y `events/bindings.js`.

#### Cómo validar cambios

- Arranque sin errores de consola.
- Cambio correcto entre `Quick`, `Expert` y `Live`.
- Picker funcional.
- Set editor funcional.
- Matrix y analysis coherentes.
- Quick y Live sin regresiones.
- Tooltips e iconos correctos.
- Guardado/carga correcto.

#### Cómo depurar

- Revisar `DEBUG_MODE` y `FLOW_DEBUG` en `utils/debug.js`.
- Usar `smartLog()` y `flowLog()` en vez de `console.log()` indiscriminado.
- Mirar `window.state` para inspección rápida del runtime.
- Tener presente que varias caches viven en `window` vía `core/runtime.js`.

#### Patrones a seguir

- Módulos con responsabilidad clara.
- Callbacks configurables cuando hay riesgo de ciclo.
- Render coordinado y no disperso.
- Estado único en `core/state.js`.

#### Patrones a evitar

- Añadir lógica nueva a `app.js`.
- Duplicar lógica Quick/Live entre `modes/*` y `app-core.js`.
- Buscar nodos del DOM por todo el proyecto si ya existen en `core/dom.js`.
- Meter HTML inline complejo en módulos de simulación o datos.
- Crear nuevos globals `window.*` salvo necesidad real de compatibilidad.

---

### 15. Guía para el agente de IA del IDE

#### Cómo orientarse en el proyecto

Empieza siempre por estas piezas:

1. `app.js`
2. `app-core.js`
3. `render/app.js`
4. `core/state.js`
5. `core/dom.js`
6. `events/bindings.js`

Esto permite entender:

- cómo arranca la app
- dónde vive el estado
- quién coordina el render
- quién registra los eventos

#### Por dónde empezar según la tarea

| Tarea | Archivos a inspeccionar primero |
|---|---|
| Error de arranque | `app.js`, `app-core.js`, `index.html` |
| Error de render global | `render/app.js`, `core/state.js` |
| Error de Quick | `modes/quick.js`, `app-core.js`, `render/app.js` |
| Error de Live | `modes/live.js`, `app-core.js`, `render/app.js`, `battle/effects.js` |
| Error de picker | `picker/modal.js`, `data/pokemon.js`, `data/sets.js` |
| Error de set editor | `editor/set-editor.js`, `bridges/ui-bridges.js` |
| Error de equipos guardados | `teams/storage.js`, `teams/actions.js`, `render/dock.js` |
| Error de matrix | `matrix/render.js`, `battle/*`, `render/analysis.js` |
| Error de tooltips o wiring | `events/bindings.js` |

#### Qué no asumir

- No asumir que `app-core.js` ya está totalmente dividido por dominio. No lo está.
- No asumir que `matrix/core.js` y `matrix/explainer.js` son la implementación activa. No lo son.
- No asumir que `modes/quick.js` y `modes/live.js` contienen toda la implementación física. Hoy son fronteras públicas, no la sede completa de la lógica.
- No asumir que `package.json` define el modo de módulos del navegador. Lo define `index.html` con `type="module"`.
- No asumir que todo el estado está declarado de forma estática en `createInitialState()`. Hay flags dinámicos.

#### Cómo distinguir lógica pura de render

Lógica más pura o de negocio:

- `analysis/threats.js`
- gran parte de `battle/*`
- partes de `data/*`
- utilidades en `utils/*`

Render / UI:

- `render/*`
- `picker/modal.js`
- `editor/set-editor.js`
- partes de `matrix/render.js`
- `events/bindings.js`

Mixto o frontera delicada:

- `app-core.js`
- `modes/*`

#### Cómo decidir dónde colocar código nuevo

- Si calcula datos o transforma estado de dominio, no debe ir en `render/*`.
- Si solo cambia visibilidad o HTML, no debe ir en `battle/*` o `data/*`.
- Si es un listener global, va a `events/bindings.js`.
- Si es una acción reusable de equipos, va a `teams/actions.js`.
- Si es una ref DOM estable y compartida, va a `core/dom.js`.
- Si aún no existe un hogar claro y moverlo causaría ciclos, usa un callback explícito o amplía un bridge mínimo.

#### Cuándo crear módulo nuevo y cuándo extender uno existente

Crea módulo nuevo si:

- la responsabilidad es claramente separable
- el archivo actual ya mezcla demasiados conceptos
- el cambio creará una frontera estable de dominio

Extiende módulo existente si:

- la nueva función pertenece claramente al dominio del archivo
- la alternativa sería introducir fragmentación artificial
- la función comparte estado y dependencias con el módulo actual

#### Cómo hacer cambios sin romper imports ni flujo de render

- No mover funciones desde `app-core.js` sin revisar todos sus consumidores.
- Si extraes, actualiza imports en todos los módulos antes de dar la extracción por cerrada.
- Si el módulo extraído necesita `renderAll`, decide entre:
  - import explícito
  - callback inyectado
  - bridge mínimo
- Después de cualquier cambio de frontera, validar:
  - sintaxis ESM
  - imports obsoletos
  - ausencia de bloques huérfanos
  - arranque y cambio de modo UI

#### Checklist antes de editar un archivo sensible

Antes de tocar `app-core.js`, `render/app.js`, `matrix/render.js`, `events/bindings.js` o `battle/effects.js`, revisar:

- qué imports entran
- qué exports salen
- qué partes mutan `state`
- qué partes llaman `renderAll()`
- si el módulo participa en Quick o Live
- si hay globals `window.*` asociados
- si el cambio puede crear ciclo con `render/app.js` o `app-core.js`

---

### 16. Invariantes y reglas del proyecto

- `app.js` debe seguir siendo bootstrap mínimo.
- No reintroducir lógica funcional en `app.js`.
- `app-core.js` puede seguir existiendo como host residual, pero no debe volver a crecer sin criterio.
- No duplicar estado fuera de `core/state.js`.
- No duplicar funciones entre `app-core.js` y `modes/*` o `render/*`.
- No mezclar render con lógica de negocio si existe un módulo de dominio natural.
- No crear dependencias circulares; usar callback o bridge mínimo si hace falta.
- No usar búsquedas DOM dispersas si el nodo ya pertenece a `core/dom.js`.
- No centralizar tooltips efímeros en `core/dom.js`.
- No tocar Quick o Live sin revisar `render/app.js` y `battle/effects.js`.
- No romper la sincronización entre `leads` y `active*Slots` al cambiar de modo.
- Todo mon insertado en equipos debe pasar por `ensureBattleState()`.
- El cálculo del campo activo depende del callback de índices activos inyectado en `battle/effects.js`.
- `renderAll()` es el punto normal de refresco global; evitar renders directos dispersos.
- Mantener `state.self` y `state.enemy` con longitud 6 y slots vacíos a `null`.
- Respetar las fronteras públicas actuales:
  - `render/app.js` para render global
  - `events/bindings.js` para listeners globales
  - `teams/actions.js` para acciones de equipos
  - `modes/*` para Quick y Live
- No asumir que placeholders como `matrix/core.js` o `picker/pokedex.js` están activos.

---

### 17. Deuda técnica y siguientes pasos

#### Deuda técnica actual

- `app-core.js` sigue siendo demasiado grande.
- `modes/quick.js` y `modes/live.js` son frontera pública, pero no sede física completa de la lógica.
- `matrix/render.js` concentra más responsabilidad de la deseable.
- Existen globals `window.*` por compatibilidad.
- `render/dock.js` mezcla dock y drawer.
- Algunas partes del código presentan problemas de codificación de caracteres en literales y comentarios.
- Hay placeholders (`matrix/core.js`, `matrix/explainer.js`, `picker/pokedex.js`) que pueden inducir a error a nuevos mantenedores.

#### Refactorizaciones futuras con sentido

- Mover implementación Quick real desde `app-core.js` a `modes/quick.js`.
- Mover implementación Live real desde `app-core.js` a `modes/live.js`.
- Dividir `matrix/render.js` en:
  - cálculo/core
  - explainer/help
  - render puro
- Reducir imports desde `app-core.js` en `render/analysis.js` y `matrix/render.js`.
- Revisar si `renderWeaknessSummary()` debe vivir en un módulo de analysis/render específico.
- Revisar si `clearAll()` y `swapTeams()` pueden salir de `app-core.js` sin ciclos.
- Auditar si algunos `window.*` pueden encapsularse mejor.

#### Riesgos al seguir iterando

- Extraer funciones sin revisar consumidores rompe imports y arranque.
- Mover lógica live/quick sin respetar la coordinación de `render/app.js` puede romper la UI.
- Cambiar `state` o `field` sin revisar `battle/effects.js` puede producir resultados tácticos inconsistentes.
- Tocar `matrix/render.js` sin pruebas manuales amplias puede romper la lectura táctica completa.

---

### 18. Checklist de validación manual

#### Arranque general

- La app carga sin errores de consola.
- `data-bundle.json` carga correctamente.
- `window.GameDB` existe.
- Los iconos lucide se pintan.

#### Cambio de modo UI

- Se puede alternar entre `Quick`, `Expert` y `Live`.
- La visibilidad de paneles cambia correctamente.
- El modo persiste tras refresco.

#### Picker

- Abrir picker en slots `self` y `enemy`.
- Buscar Pokémon.
- Elegir resultado.
- Validar Species Clause y Mega Clause en `self`.
- Ver que el slot se actualiza y la Pokédex sigue operativa.

#### Set editor

- Abrir editor desde un slot propio ocupado.
- Cambiar item, ability, moves, nature, EVs.
- Abrir y cerrar submodal de choice.
- Resetear a meta.
- Cambiar Pokémon desde el editor.

#### Matrix

- Se renderiza matrix con equipos completos.
- Cambiar `offensive/defensive`.
- Cambiar detail mode.
- Abrir/cerrar ayuda.
- Cambiar weather/terrain y comprobar refresco.

#### Analysis

- Threats se muestran con scout cards.
- Opportunities cambian con la matrix.
- Strategies se infieren.
- Speed tiers reflejan Tailwind y Trick Room.
- Defensive alerts se actualizan.

#### Quick mode

- Aparecen preview, combos y Turn 1 panel.
- Se generan combos con equipos completos.
- `Lock best four` funciona.
- Click en combo card aplica combo.
- Selección manual de leads T1 reacciona.
- Refresco posterior mantiene coherencia.

#### Live mode

- Aparecen strip y toolbar.
- Se puede cambiar foco activo.
- Se puede seleccionar activos.
- Battle sheet abre y cierra.
- `liveStatePanel` se refresca.
- Recomendaciones cambian con el estado de campo.

#### Guardado y carga

- Guardar equipo propio.
- Verlo en drawer.
- Cargar equipo guardado.
- Borrarlo.
- Cargar preset meta.
- `Load demo`, `Swap`, `Clear` siguen funcionando.

#### Tooltips e iconos

- Scout tooltip aparece en elementos `data-scout`.
- Info tooltip aparece para item/ability/move cuando corresponda.
- Los iconos siguen visibles tras renders.

#### Errores de consola y regresiones visuales

- Sin `SyntaxError`.
- Sin imports rotos.
- Sin celdas o paneles vacíos inesperados.
- Sin pérdida de interacción por listeners no enlazados.

---

### 19. Glosario técnico

| Término | Significado en este proyecto |
|---|---|
| `render global` | Coordinación principal de la UI desde `render/app.js` |
| `matrix` | Tabla táctica de matchup ofensivo/defensivo entre equipos |
| `Quick mode` | Modo de preparación de bring, selección de cuatro y Turn 1 |
| `Live mode` | Modo de simulación de combate activo y recomendaciones en tiempo real |
| `dock` | Banda de slots de equipo `self` y `enemy` |
| `battle state` | Estado operativo de cada mon en combate: HP, stages, status, etc. |
| `field` | Estado del campo global: clima, terreno, pantallas, Tailwind, hazards, etc. |
| `meta index` | Índice principal de especies basado en la data meta cargada |
| `fallback index` | Índice auxiliar para resolver especies fuera del índice principal |
| `focused team` | Subconjunto del equipo relevante según foco activo de Live |
| `leads` | Índices elegidos como leads, usados especialmente en Quick |
| `active slots` | Índices activos actuales del combate Live/Expert con foco |
| `battle sheet` | Panel contextual detallado de una interacción táctica seleccionada |
| `bridge` | Módulo mínimo para pasar callbacks o refresh sin crear ciclos |
| `EffectsRegistryBridge` | Runtime externo que indexa y resuelve efectos registrados de abilities/items/moves/status |

---

### 20. Anexo útil

## Mapa de imports orientativo

```text
app.js
  -> app-core.js

app-core.js
  -> core/*
  -> utils/*
  -> data/*
  -> battle/*
  -> matrix/render.js
  -> render/app.js
  -> render/analysis.js
  -> picker/modal.js
  -> editor/set-editor.js
  -> events/bindings.js
  -> bridges/ui-bridges.js
  -> modes/*

render/app.js
  -> core/state.js
  -> core/dom.js
  -> render/dock.js
  -> matrix/render.js
  -> render/analysis.js
  -> modes/quick.js
  -> modes/live.js
  -> app-core.js (renderWeaknessSummary)
  -> battle/effects.js

events/bindings.js
  -> render/app.js
  -> render/analysis.js
  -> render/dock.js
  -> matrix/render.js
  -> picker/modal.js
  -> editor/set-editor.js
  -> teams/storage.js
  -> teams/actions.js
  -> modes/quick.js
  -> modes/live.js
```

## Ejemplos de tareas comunes y dónde implementarlas

| Tarea | Módulo recomendado |
|---|---|
| Añadir nuevo badge de análisis | `render/analysis.js` y quizá `analysis/threats.js` |
| Añadir nuevo side condition del campo | `battle/effects.js` y quizá `battle/registry.js` |
| Añadir nuevo preset de equipo | `core/constants.js` |
| Añadir un nuevo selector visual permanente | `index.html` + `core/dom.js` + `events/bindings.js` |
| Mejorar scoring Quick | `modes/quick.js` y hoy probablemente `app-core.js` |
| Mejorar simulación Live | `modes/live.js` y hoy probablemente `app-core.js` |
| Añadir persistencia de una preferencia UI | `core/constants.js`, `render/app.js` o `matrix/render.js` según el caso |

## Checklist de refactor seguro

- Confirmar quién exporta hoy la función que se quiere mover.
- Buscar todos sus consumidores reales.
- Verificar si toca `state`, `renderAll()`, `window.*` o `core/dom.js`.
- Determinar si el destino introduce ciclo.
- Si hay ciclo, usar callback explícito o bridge mínimo.
- Mover la implementación.
- Corregir imports.
- Validar sintaxis ESM.
- Validar arranque.
- Validar Quick, Expert y Live.
- Revisar consola del navegador.

## Estado arquitectónico final de la Fase 3

La Fase 3 estructural puede considerarse cerrada en estos términos:

- `app.js` ya es bootstrap mínimo.
- El render global ya no vive en el entrypoint.
- Los listeners globales ya no viven en el entrypoint.
- Quick y Live tienen frontera modular pública.
- Teams, picker, editor y render tienen módulos naturales separados.
- El siguiente nivel de trabajo ya no es “sacar cosas de `app.js`”, sino seguir **descomponiendo `app-core.js` y algunos módulos sobredimensionados** sin alterar el comportamiento actual.

---

## Resumen operativo final

Si un desarrollador o un agente de IA necesita tocar el proyecto con seguridad, la regla práctica es esta:

1. Entender primero `render/app.js`, `events/bindings.js`, `core/state.js` y `core/dom.js`.
2. Tratar `app-core.js` como módulo interno grande pero todavía crítico.
3. No confundir fronteras públicas (`modes/*`) con sede física total de la lógica.
4. No asumir que todos los archivos bajo `matrix/` o `picker/` están activos.
5. Hacer cambios en el módulo natural del dominio y no en el bootstrap.
6. Validar siempre el flujo completo de UI después de tocar Quick, Live, matrix o eventos globales.

Este documento debe usarse como contexto principal antes de emprender nuevas refactorizaciones o cambios de comportamiento sobre la app.