# Battle Engine State Boundary

Fase 2 introduce una frontera explicita entre estado de aplicacion y estado de motor.
Fase 3 anade el primer nucleo puro de acciones y dano sobre esa frontera.
Fase 5 anade una capa de lectura tactica basada en evidencia del motor.
Unificacion 2026-06: `battle/formulas.js` es la FUENTE UNICA de las matematicas
(rolls, stats/HP, clima/terreno, potencia dinamica, prioridad canonica con
habilidades). `battle/damage.js`, `battle/speed.js`, `battle/stats.js`,
`battle/action-core.js` y `app-core.getPriority` delegan en el manteniendo sus
firmas. Las reglas de FORMATO (regulaciones M-A/M-B, cláusulas, roster) viven
en `rules/`; las de mecanica de combate siguen en el motor.

## App state

`core/state.js` sigue siendo el estado de UI/producto: equipos editables, modal, cache visual, modo activo, picks, live controls y preferencias. Puede mutar por interaccion del usuario.

## Engine state

El motor nuevo debe recibir `BattleSnapshot` y devolver resultados serializables. No debe leer `core/state.js` como fuente de verdad para calculos internos.

Contratos base:

- `BattleSnapshot`: estado completo de combate, determinista y serializable.
- `SideState`: lado self/enemy, slots activos y condiciones de lado.
- `SlotState`: posicion del equipo y su `PokemonBattleState`.
- `PokemonBattleState`: especie canonica, set, HP, status, stages, volatiles y flags vivos.
- `FieldState`: clima, terreno, Trick Room, screens, guards, redirection y hazards normalizados.
- `CandidateAction`: contrato preliminar de accion legal para fases posteriores.
- `ExplainEvent`: traza estructurada para explicar decisiones, bloqueos, dano, KOs y efectos.

## Action core

`battle/action-core.js` es la nueva autoridad para el pipeline tactico puro:

- `generateLegalActions(snapshot, side, slot)`: enumera movimientos, targets y cambios legales desde el snapshot.
- `resolvePriority(action, snapshot)`: calcula prioridad dinamica de switch, prioridad base, Prankster, Gale Wings y Triage.
- `resolveActionOrder(snapshot, actions)`: ordena acciones por prioridad, Trick Room y velocidad efectiva.
- `resolveTargets(action, snapshot)`: resuelve target modes de dobles, spread, aliados, campo y redirection.
- `estimateActionOutcome(snapshot, action)`: estima resultado de una accion sin mutar el snapshot.
- `simulateTurn(snapshot, actions)`: aplica un turno minimo viable y devuelve nuevo snapshot + `ExplainEvent`.
- `runDamagePipeline(snapshot, action, target)`: pipeline trazable de target block, base power, stats, modificadores, rolls y survival.

Este core no lee ni escribe `core/state.js`. Las reglas que aun son incompletas deben marcarse en fases posteriores con confidence/unsupported en vez de esconderse como heuristicas.

## Adapters legacy

Mientras el motor completo no este migrado, `snapshotToLegacySimulationState()` convierte snapshots al shape actual de la app para que planner, quick mode y simulador puedan convivir con el pipeline nuevo.

## Synergy engine

`analysis/synergy-engine.js` consume `BattleSnapshot`, `CandidateAction`, `estimateActionOutcome()` y trazas de reglas para producir contratos tacticos reutilizables:

- `buildSynergyReport(snapshot)`: devuelve findings, grafo de amenaza y evidencia compacta de acciones.
- `detectTacticalFindings(snapshot)`: lista de `TacticalFinding` ordenada por severidad y confianza.
- `buildThreatGraph(snapshot)`: nodos de Pokemon/campo/acciones y edges de `enables`, `targets`, `protects`, `blocks` o `punished-by`.
- `TacticalFinding`: familia, scope, sujetos, evidencia, mensaje, respuesta recomendada y confianza.

La capa no renderiza UI y no lee `core/state.js`; esta preparada para que Fase 6 alimente Quick Mode, matrix, threat analysis, turn1 simulator y top plans con evidencia estructurada en vez de strings sueltos.

## Cache keys

Las caches nuevas deben usar keys versionadas con:

- snapshot key
- `rulesVersion`
- `dataVersion`
- contexto de accion o planner

Las caches globales heredadas siguen existiendo temporalmente, pero sus claves criticas de dano se han ampliado con firma de mon, campo y estado vivo para reducir cruces peligrosos.
