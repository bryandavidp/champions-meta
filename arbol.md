# Plan Maestro: Árbol de Turno Predictivo Antes del Simulador

## Resumen
- Reconvertir el actual `Árbol de turno` de una lista heurística corta a un **planificador predictivo de 3 capas**: bring, leads/back y líneas de juego de turno 1-2.
- Mantener el panel actual; no se crea un producto nuevo. El bloque existente pasa a mostrar **3 planes reales de partida** para tus 3 mejores brings.
- Cada plan debe decir de forma explícita: **qué 4 llevar**, **con qué 2 salir**, **qué 2 dejar detrás**, **qué dos movimientos pulsar en turno 1**, **qué continuación jugar en turno 2** y **por qué esa línea gana o se cae**.
- Horizonte de producto fijado: **2 turnos**. Modelo rival fijado: **meta-likely**, no “oráculo perfecto”.

## Cambios clave de implementación
### 1. Motor del árbol
- Sustituir el papel actual de `analysis/turn-branches.js` por un orquestador de cuatro subsistemas:
  - **Bring planner**: parte de los top 3 propios ya calculados por Quick Mode y genera 2-3 brings plausibles del rival por matchup, no un único rival “promedio”.
  - **Lead/back planner**: evalúa las 6 parejas de leads de cada bring propio y etiqueta la backline como `safe pivot` y `closer/wincon`; si ambas reservas son equivalentes, se conserva el orden actual.
  - **Action generator**: genera acciones legales de los 2 activos, incluyendo daño, spread, protect, setup, redirection, guard, pivot, status/control y switch.
  - **2-turn search**: expectimax + beam search con poda fuerte, firmas de deduplicación y ramas de contingencia cortas.
- La búsqueda debe enumerar **parejas de acciones**, no acciones aisladas. El nodo base de producto es siempre “qué hacen mis dos activos este turno”.
- El árbol debe evaluar miles de combinaciones, pero no de forma ciega: primero expande todas las parejas legales del opening 4v4 y luego poda por equivalencia táctica, dominancia y baja probabilidad.
- El ancla de la refactorización debe quedar en `analysis/turn-branches.js` como orquestador, `render/analysis.js` como renderer del árbol y `app-core.js` como wiring/cachés/lifecycle.

### 2. Estado y resolución compartida
- El planner debe reutilizar el mismo núcleo de verdad del simulador vivo para no duplicar reglas ni producir recomendaciones que luego el live mode contradiga.
- El estado de búsqueda debe incluir: activos, banca, HP%, estado, boosts/debuffs, item consumido, sash/sturdy, clima, terreno, Trick Room, Tailwind, pantallas, guard/redirection, turn locks, pending switch y orden de resolución ya fijado.
- El árbol no puede depender solo de `bestAttack()` ni de moves dañinos. Debe consumir una capa de metadatos de acción más rica para soporte y control.
- Añadir un contrato interno de `CandidateAction` con: `move`, `targetMode`, `target`, `dynamicPriority`, `effectClass`, `isSpread`, `isPivot`, `isGuard`, `isRedirection`, `selfDelta`, `foeDelta`, `fieldDelta`, `requiresReplacement`, `canFailReason`.
- Añadir un contrato interno de `BoardSnapshot` con: activos, banca, HP%, estados, boosts, control de campo, slots KO, quién puede actuar y plan de switch pendiente.

### 3. Cobertura mecánica mínima obligatoria
- El árbol debe resolver correctamente, como mínimo:
  - prioridad base y prioridad dinámica por habilidad, tipo, campo o condición
  - `Prankster/Bromista`, `Psychic Terrain`, `Quick Guard`, `Armor Tail`, `Dazzling`, `Queenly Majesty`
  - `Tailwind`, `Trick Room`, weather, terrain, screens y veil
  - `Fake Out`/retroceso, `Taunt`, `Encore`, `Protect/Detect`, `Wide Guard`, redirection
  - spread moves con penalización de dobles
  - inmunidades por tipo, habilidad y objeto
  - `Intimidate`, `Defiant`, `Competitive`, boosts propios y drops rivales
  - pivot moves con switch forzado y sin permitir una segunda acción ilegal ese turno
  - KO, forced switch, `Focus Sash` y `Sturdy` solo si procede
  - residuales y cierres de turno cuando ya existan en el motor
- Si una mecánica aún no está modelada con verdad suficiente, la rama debe salir con `confianza reducida`; no se debe fingir precisión.

### 4. Política de búsqueda y scoring
- Por Pokémon, conservar hasta 5-6 acciones tácticamente distintas: mejor daño single target, mejor spread, control principal, protect, pivot, support/setup y cambio seguro.
- Deduplicar acciones equivalentes por firma táctica: mismo efecto real sobre board, mismo rango de KO, mismo cambio de campo o misma protección.
- Política rival `meta-likely`:
  - ponderar KO probables, líneas de control de velocidad, protección ante KO, setup seguro, redirección, pivot y coherencia con set/rol
  - cuando la mejor jugada rival y la más probable diverjan, mostrar ambas: `respuesta rival más probable` y `castigo máximo`
- Scoring del estado:
  - `KOs`, HP neto, action economy, control de velocidad, control de campo, presión de doble foco, seguridad del backline, valor del pivot y supervivencia de la wincon
  - penalización por depender de speed ties, accuracy, protect chains, sash rival, inmunidades no resueltas o ramas bloqueadas
- Los speed ties no deben explotar el árbol entero salvo que cambien un KO o un setup crítico; en ese caso se muestran como rama `50/50`.
- Ejecutar el cálculo en **Web Worker** para no bloquear la UI. Presupuesto objetivo: **150–250 ms** por recomputación interactiva, con render progresivo de línea principal antes de completar contingencias.

## Rediseño visual dentro del panel actual
- Mantener `turnBranchesPanel`, pero convertirlo en un **panel de planes de partida**:
  - cabecera con `Top 3 planes`
  - cada plan con `Leads`, `Backline`, `Turno 1`, `Si responden X`, `Turno 2`, `Por qué gana`, `Qué lo rompe`
- Estructura visual de cada plan:
  - root card con tus 4 y los 4 previstos del rival
  - nodo principal de turno 1 con los **2 movimientos exactos**
  - 1-2 respuestas rivales probables
  - continuación de turno 2 por respuesta
  - mini snapshot del board tras cada nodo
- Lenguaje visual inspirado en Scarlet/Violet:
  - chips grandes de comando, badges de prioridad, escudos para protect/guard, ribbons de `Tailwind/TR`, sellos `KO`, `Tie`, `safe pivot`, `closer`
  - color por intención táctica: presión, tempo, control, rescate, cierre
  - una sola frase táctica por nodo, sin bloques densos
- Móvil:
  - layout vertical por pasos
  - sin overflow horizontal
  - nodos contraíbles y snapshots compactos

## Interfaces públicas y compatibilidad
- Reemplazar `buildTurnBranches()` por `buildTurnPlans()` y dejar un adaptador temporal para no romper el render mientras se migra.
- `buildTurnPlans(input)` debe aceptar:
  - `selfTeam`, `enemyTeam`, `field`
  - `topOwnCombos=3`, `topEnemyCombos=3`
  - `horizon=2`
  - `enemyModel='meta-likely'`
  - `beamWidth`, `actionCapPerMon`, `displayLimit`
- `buildTurnPlans()` debe devolver:
  - `plans[]` con `bring`, `leads`, `backs`, `predictedEnemyBring`, `predictedEnemyLeads`, `mainLine`, `enemyLikelyResponse`, `contingencies`, `score`, `confidence`, `why`, `breakers`, `fieldSummary`
  - `debug` opcional con ramas exploradas, ramas podadas y razones de descarte
- `render/analysis.js` debe consumir solo ese contrato y dejar de depender de heurísticas embebidas por card.

## Plan de pruebas
- Casos mecánicos obligatorios:
  - `Whimsicott + Bromista + Viento Afín`, incluida inmunidad Dark a status con prioridad por Bromista
  - `Fake Out + setup`
  - `Quick Guard`, `Wide Guard`, `Follow Me/Rage Powder`
  - `Trick Room + sweeper lento`
  - `Sand Rush + Tailwind` sin duplicación indebida
  - `Focus Sash` solo al 100%
  - spread moves a ambos objetivos con daño correcto
  - pivot moves con switch forzado y continuidad legal del turno
  - KO y forced switch bloqueando ramas imposibles
- Casos de producto:
  - para un matchup 6v6 completo, el panel devuelve exactamente 3 planes accionables
  - cada plan dice con qué 2 salir, qué 2 dejar atrás y qué pulsar en turno 1
  - cada plan incluye continuación explícita de turno 2 y una explicación de victoria/fracaso
  - el panel no hace overflow en `<479px`
- Rendimiento:
  - recomputación tras cambio de set/equipo/campo sin congelar la UI
  - cache hit al volver a una preview ya analizada
  - degradación elegante si el cálculo excede presupuesto: primero línea principal, luego ramas secundarias

## Supuestos y referencias
- Supuestos cerrados:
  - no se crea una sección nueva; todo vive dentro del árbol actual
  - el árbol previo no sustituye al simulador live; lo prepara
  - horizonte principal: **2 turnos**
  - modelo rival: **meta-likely**
  - cálculo local, sin backend
- Referencias usadas para fijar el plan:
  - VGC dobles 4v4 oficial: [Pokemon.com rules](https://play.pokemon.com/en-us/resources/documents/play-pokemon-vg-rules-formats/)
  - Motor de referencia y orden de acciones: [Pokémon Showdown GitHub](https://github.com/smogon/pokemon-showdown), [Battle simulation overview](https://deepwiki.com/smogon/pokemon-showdown/3-game-data) y [battle.ts](https://github.com/smogon/pokemon-showdown/blob/master/sim/battle.ts)
  - Prioridad y excepciones: [Bulbapedia Priority](https://m.bulbapedia.bulbagarden.net/wiki/Priority) y [Bulbapedia Prankster](https://m.bulbapedia.bulbagarden.net/wiki/Prankster_%28Ability%29)
  - Inspiración visual de combate moderno: [Pokémon Scarlet/Violet screenshots](https://press.pokemon.com/en/Pokemon-Scarlet-and-Pokemon-Violet/Focus/Pokemon-Scarlet-and-Pokemon-Violet-Screenshots) y [Pokémon battle basics](https://www.pokemon.com/uk/pokemon-news/learn-pokemon-battle-basics-from-a-former-pokemon-vgc-world-champ)
