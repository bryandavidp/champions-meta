# Performance Contract Checks

Fase 8 congela contratos de fluidez sin medir microbenchmarks fragiles.

Ejecutar:

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\performance\run-performance-checks.ps1
```

Cobertura:

- `turn-branches` expone estado observable de worker/cache/cancelacion.
- `product-runtime` protege computos derivados con cache LRU, stale result y guard movil.
- `product-adapters` memoiza quick, threat y turn1 por snapshot y contexto.
- `matrix/core` memoiza filas ofensivas y defensivas por snapshot, modo y versiones.
- Los caches separan contextos distintos y devuelven payloads deterministas.

Para navegador existe `npm run test:ui-smoke`. Si `http://127.0.0.1:4173/index.html` no esta levantado o no hay Chrome disponible, el smoke se salta salvo que se ejecute con `UI_SMOKE_STRICT=1`.
