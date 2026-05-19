# Rediseño UI/UX Del Árbol De Planes Predictivos

## Resumen
Rediseñar el panel existente `turnBranchesPanel` para que cada plan sea entendible **sin expandirlo** y accionable desde la propia card. La card colapsada debe mostrar: qué 4 Pokémon llevar, cuáles son los 2 leads, cuáles quedan detrás, rival previsto, plan de turno 1, score/confianza, riesgo principal y botón `Usar plan`.

La sección seguirá viviendo dentro del árbol actual. No se crea una vista nueva. El detalle expandido se mantiene para análisis profundo: respuesta rival, turno 2, snapshots, “por qué gana” y “qué lo rompe”.

## Cambios Clave
- Convertir cada plan en una card tipo “battle command sheet” inspirada en Scarlet/Violet:
  - cabecera compacta con `Plan principal`, clima/campo, score, confianza y badge de riesgo
  - fila visual `Tu equipo` con 4 sprites grandes: leads resaltados delante, backline detrás
  - fila `Rival previsto` con 4 sprites más compactos
  - preview de turno 1 con dos comandos exactos en chips: Pokémon, movimiento, objetivo, prioridad, tipo, eficacia y daño estimado si existe
  - CTA visible en card cerrada: `Usar plan`
  - botón/chevron separado para expandir detalles
- Cambiar el patrón actual:
  - ahora la card principal está expandida siempre
  - después del rediseño, todas las cards deben poder verse como resumen colapsado; el detalle se abre solo al expandir
  - el contenido pesado (`Turno 1`, respuesta rival, snapshots, contingencias, meta) irá dentro de un bloque `.turn-plan-details`
- Añadir iconografía consistente:
  - `swords` o `target` para daño
  - `shield` para protect/guard
  - `wind` para speed control/Tailwind
  - `refresh-cw` para pivot/switch
  - `zap` para prioridad
  - `alert-triangle` para castigo/riesgo
  - `check-circle` para plan seleccionado
  - `chevron-down` para expandir
- Colores por intención:
  - daño/presión: rojo coral
  - control de velocidad/tempo: cian
  - protección/seguridad: verde
  - setup/sinergia: violeta
  - pivot/cambio: amarillo
  - riesgo/castigo rival: naranja
  - seleccionado: borde brillante azul/cian y fondo ligeramente elevado
- El botón `Usar plan` debe aplicar directamente:
  - `state.chosenFour`
  - `state.leads.self`
  - `state.chosenEnemyFour`
  - `state.leads.enemy`
  - `state.turn1Custom = false`
  - `recalculateActiveField()`
  - `renderAll()`
- Tras usar un plan:
  - la card queda marcada como `Seleccionado`
  - el CTA cambia a `Activo`
  - el simulador de turno 1 debe arrancar con esos leads y backline
  - no debe expandirse automáticamente salvo que ya estuviera abierta

## Cambios De Datos E Interfaces
- Ampliar el modelo devuelto por `buildTurnPlansSnapshot()` para evitar selección frágil por nombre:
  - `selfBringIndices`
  - `selfLeadIndices`
  - `selfBackIndices`
  - `enemyBringIndices`
  - `enemyLeadIndices`
  - `enemyBackIndices`
- Ampliar cada acción resumida con metadatos visuales mínimos:
  - `move`
  - `actor`
  - `target`
  - `priority`
  - `effectClass`
  - `type`
  - `damageRangeLabel`
  - `effectivenessLabel`
  - `isSpread`
  - `riskNote`
- Añadir un helper de UI en `render/analysis.js`:
  - `applyTurnPlan(planId)` o equivalente
  - buscará el plan actual cacheado por id
  - aplicará índices propios y rivales
  - expondrá el handler en `window` solo si el proyecto mantiene handlers inline; si no, usar delegación de eventos sobre `turnBranchesContent`
- Mantener compatibilidad:
  - `buildTurnBranches()` seguirá existiendo como adaptador temporal
  - no se cambia Quick Mode fuera de aplicar el plan seleccionado
  - si un plan aún no trae índices, fallback por nombre solo como emergencia

## Estructura Visual Exacta
- Header de sección:
  - título: `Top 3 planes de partida`
  - subtítulo más corto: `Elige bring, leads y línea inicial antes del simulador.`
  - estado: `Calculando`, `3 planes`, o `Actualizado`
- Card colapsada:
  - zona superior:
    - etiqueta `Plan principal` / `Plan 2`
    - título táctico: clima/campo o intención principal
    - score + confianza
    - badge `Seguro`, `Agresivo`, `Tempo`, `Riesgo alto`
  - zona central:
    - `Tu equipo`: 4 Pokémon siempre visibles
    - leads con badge `LEAD`
    - reservas con badge `BACK`, `PIVOT`, `CIERRE`
    - `Rival`: 4 sprites compactos debajo o a la derecha según ancho
  - zona inferior:
    - dos chips de movimientos de turno 1
    - cada chip: sprite/mon, icono de intención, movimiento, flecha, objetivo, tipo, eficacia/daño
    - CTA `Usar plan`
    - chevron `Detalles`
- Card expandida:
  - `Respuesta rival probable`
  - `Turno 2 recomendado`
  - `Qué lo rompe`
  - snapshots compactos
  - explicación táctica en chips, no párrafos largos
- Responsive:
  - en `<760px`, card en columna
  - en `<479px`, solo sprites + nombres abreviados, CTA full width, sin scroll horizontal
  - ninguna fila debe depender de `width: max-content`

## Implementación
- En `analysis/turn-plans-engine.js`:
  - incluir índices propios/rivales y roles normalizados en cada plan
  - enriquecer `summarizePair()` con tipo, eficacia y rango de daño cuando el dato exista
- En `render/analysis.js`:
  - separar renderer en `renderPlanSummary()` y `renderPlanDetails()`
  - convertir todas las cards en `<details>` con summary rico
  - mover el contenido actual de `renderPlanBody()` al bloque expandible
  - añadir CTA `Usar plan` dentro del summary sin que dispare el expand accidentalmente
  - añadir handler delegado para `.turn-plan-use-btn`
- En `styles.css`:
  - reemplazar el layout actual de mini cards por una composición más densa
  - añadir clases para estados: `.is-selected`, `.is-risk-high`, `.is-tempo`, `.is-safe`, `.is-aggressive`
  - añadir clases de acción: `.is-damage`, `.is-speed-control`, `.is-protect`, `.is-pivot`, `.is-setup`
  - compactar altura inicial de cada plan para que se vean 2-3 cards en desktop sin hacer scroll excesivo

## Pruebas Y Aceptación
- Con 6v6 cargado en Quick:
  - deben aparecer 3 cards navegables sin quedarse en loading
  - cada card cerrada debe mostrar tus 4 Pokémon y los 4 rivales previstos
  - el usuario debe poder identificar leads propios sin expandir
  - el usuario debe ver los 2 movimientos iniciales sin expandir
- Al pulsar `Usar plan`:
  - se actualizan `chosenFour`, `leads.self`, `chosenEnemyFour`, `leads.enemy`
  - el simulador de turno 1 usa esos Pokémon
  - la card queda visualmente seleccionada
- Al expandir:
  - se mantiene toda la información profunda actual
  - respuesta rival, turno 2 y castigos siguen visibles
- Responsive:
  - verificar `<479px`, `760px`, desktop
  - no debe haber overflow horizontal
  - CTA y chevron no deben solaparse
- Verificación técnica:
  - bundle de `render/analysis.js`
  - bundle de `analysis/turn-plans-engine.js`
  - `git diff --check`
  - prueba manual en `http://127.0.0.1:4173/index.html`

## Supuestos
- `Usar plan` selecciona tanto nuestro bring/leads como el rival previsto por el plan.
- La card colapsada prioriza decisión rápida; el análisis completo queda expandible.
- El diseño toma inspiración visual de Scarlet/Violet, pero mantiene el lenguaje actual de la app y sus tokens CSS.
