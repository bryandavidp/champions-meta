Estás trabajando en `champions-meta`.

Usa como fuente principal de contexto el archivo `PROJECT_DOCUMENTATION.md`, que describe la arquitectura actual tras la Fase 3 de refactorización. No asumas la arquitectura antigua salvo cuando el propio código o la documentación indiquen compatibilidad residual.

OBJETIVO
Ayudar a modificar, depurar y ampliar la app sin romper su arquitectura actual, priorizando cambios mínimos, seguros y coherentes con los módulos existentes.

REGLAS DE TRABAJO
- Antes de editar, localiza el módulo correcto y confirma su responsabilidad.
- No metas lógica nueva en `app.js`; debe seguir siendo bootstrap mínimo.
- `app-core.js` sigue siendo un host grande y delicado: tócalo solo si la lógica real aún vive allí o si un módulo frontera reexporta desde ahí.
- No mezcles lógica de negocio con render si existe un módulo de dominio adecuado.
- No metas listeners globales fuera de `events/bindings.js`.
- No disperses búsquedas DOM si el nodo ya pertenece a `core/dom.js`.
- No crees dependencias circulares; si aparece un ciclo, usa el patrón existente o un bridge mínimo bien justificado.
- No conviertas un módulo de render en un módulo de mutación de estado salvo que ya tenga esa responsabilidad.
- Mantén intacto el comportamiento visual y el flujo actual salvo que se pida explícitamente cambiarlo.
- Si detectas código provisional, placeholder o reexport temporal, documéntalo antes de mover nada.

MAPA RÁPIDO
- `app.js`: entrypoint mínimo.
- `app-core.js`: lógica residual/shared todavía importante.
- `core/`: estado, constantes, runtime, refs DOM.
- `render/`: render global y paneles visuales.
- `events/`: wiring global y delegación pesada.
- `data/`: meta, pokédex lógica, sets, bundle.
- `battle/`: daño, velocidad, efectos, movimientos, registries.
- `analysis/`: lógica analítica pura.
- `matrix/`: matrix táctica y render asociado.
- `picker/`: selección de Pokémon.
- `editor/`: set editor.
- `teams/`: acciones y persistencia de equipos.
- `modes/`: quick/live como fronteras funcionales.
- `bridges/`: puentes temporales contra ciclos.

FLUJO DE DECISIÓN
Cuando recibas una tarea:
1. Resume en 1-3 líneas qué pide.
2. Identifica qué módulo(s) deberían tocarse.
3. Explica riesgos, dependencias e impacto.
4. Propón el cambio más pequeño posible.
5. Ejecuta solo ese cambio.
6. Indica validaciones manuales concretas.

SI LA TAREA ES DE ESTE TIPO, EMPIEZA AQUÍ
- Render global, paneles, visibilidad por modo UI -> `render/app.js`
- Docks, slots, team drawer -> `render/dock.js`
- Matrix, detalle, help, filas/celdas -> `matrix/render.js`
- Threats/opportunities/strategies/speed/alerts -> `render/analysis.js` + `analysis/threats.js`
- Picker/Pokédex/modal de selección -> `picker/modal.js`
- Editor de sets -> `editor/set-editor.js`
- Guardado/carga/fill de equipos -> `teams/storage.js` y `teams/actions.js`
- Quick mode -> `modes/quick.js` y, si hace falta, implementación real en `app-core.js`
- Live mode -> `modes/live.js` y, si hace falta, implementación real en `app-core.js`
- Eventos globales/tooltips/delegación -> `events/bindings.js`
- Estado global -> `core/state.js`
- DOM compartido -> `core/dom.js`
- Bridges de rerender/warmup/batching -> `bridges/ui-bridges.js`

REGLAS DE ESTADO
- `state.self` y `state.enemy` deben seguir siendo arrays de 6 slots.
- Los slots vacíos son `null`.
- Todo mon operativo debe conservar `battle`.
- No rompas `uiMode`, `field`, `leads`, `chosenFour`, `activeSelfSlots`, `activeEnemySlots`, `battleSheet`, `setEditor`, `setChoice`.
- Respeta flags dinámicos existentes como `needsReevaluation` si el flujo actual depende de ellos.

REGLAS DE UI
- Si un nodo DOM es estable y compartido, usa `core/dom.js`.
- Si es efímero, tooltip runtime o modal generado dinámicamente, resuélvelo localmente.
- No muevas tooltips runtime a `core/dom.js`.
- No introduzcas cambios visuales incidentales al refactorizar.

REGLAS DE SEGURIDAD
- No hagas reemplazos masivos por regex sin revisar contexto.
- No “muevas” funciones si antes no verificas imports, exports y consumidores.
- Si un archivo está sensible o muy acoplado, prioriza wrappers mínimos antes que reescrituras grandes.
- Si una extracción queda a medio hacer, estabiliza primero imports/export/arranque antes de continuar.
- Si una tarea requiere tocar varios módulos, separa el trabajo por fases pequeñas.

FORMATO DE RESPUESTA
Quiero que respondas siempre así:
1. Qué vas a tocar.
2. Por qué ese es el lugar correcto.
3. Riesgos o dependencias.
4. Cambio propuesto.
5. Código o edición.
6. Checklist manual de prueba.

ESTILO
- Sé técnico, directo y conservador.
- Prioriza mantener la app funcionando sobre “dejarla bonita”.
- Si hay ambigüedad entre documentación y código, manda el código actual, pero señala la divergencia.
- Si detectas deuda técnica o un puente temporal, no lo “arregles” sin pedirlo; primero documenta y estabiliza.

REGLA FINAL
Haz siempre el cambio mínimo correcto. No expandas el alcance de la tarea. No improvises arquitectura nueva si ya existe una estructura válida en el proyecto.
