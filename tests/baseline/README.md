# Battle Baseline Harness

Esta carpeta congela el comportamiento actual del motor antes de iniciar las fases de refactor del sistema de batalla.

## Comandos

```bash
npm run test:baseline
npm run test:baseline:update
```

También se puede ejecutar sin depender de `package.json`:

```powershell
.\tests\baseline\run-baseline.ps1
.\tests\baseline\run-baseline.ps1 -Update
```

`test:baseline` compara la salida actual contra `snapshots/current-baseline.json`.
`test:baseline:update` regenera el snapshot cuando un cambio de comportamiento es intencional.

## Criterio De Lectura

Cada caso incluye una etiqueta:

- `comportamiento correcto actual`: el comportamiento se considera correcto y debe preservarse salvo mejora deliberada.
- `comportamiento provisional heredado`: comportamiento útil, pero todavía ligado a heurísticas o cobertura parcial.
- `known-gap aceptado temporalmente`: comportamiento congelado como deuda visible; fases futuras deben corregirlo con actualización explícita del snapshot.

## Cobertura Inicial

- Stats, velocidad efectiva, Tailwind, Sand Rush, Trick Room.
- Prioridad, Psychic Terrain, Armor Tail/Dazzling/Queenly Majesty/Quick Guard.
- Daño, Weather Ball, spread, absorciones/inmunidades por tipo/habilidad/objeto.
- Focus Sash a HP completo y caso con chip.
- Move resolution para Tailwind, screens, guards y redirection.
- Intimidate y reacciones anti-Intimidate como gap congelado.
- Variable power moves como gap congelado.
- Items actuales: Life Orb, Assault Vest, Air Balloon y gaps de berries/seeds/choice lifecycle.
- Contratos de producto por proxy: quick findings, matrix best-attack, Top 3 plans y outcome de turno 1.
- Mutaciones globales/caches/recalculate active field.

## Restricción

Esta suite no intenta corregir el motor. Su objetivo es que cualquier cambio futuro muestre exactamente qué comportamiento cambió.
