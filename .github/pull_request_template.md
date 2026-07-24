## Checklist del desarrollador

Antes de marcar este PR como listo para review, confirmá cada ítem:

- [ ] Este PR cierra un issue existente: **Closes #`<issue>`**
- [ ] Mi código compila sin errores (`pnpm run tsc`)
- [ ] Ejecuté los tests y pasan (`pnpm run test`)
- [ ] ESLint no reporta errores (`pnpm run lint`)
- [ ] No introduje `console.debug`, `console.log` innecesario, ni `debugger`
- [ ] No commiteé archivos `.env` (usar `.env.example` como referencia)
- [ ] Si agregué un tool/cron/servicio nuevo, lo registré en `modelRegistry.ts` o los archivos correspondientes
- [ ] Si modifiqué la BD (`schema.prisma`), creé la migración (`pnpm run prisma migrate dev`)
- [ ] Hice rebase con `main` antes de abrir este PR (`git pull origin main --rebase`)

## Issue relacionado

Closes #`<issue>`

## Resumen de cambios

<!-- Describí qué hace este PR en 2-3 líneas. -->

## Cómo probar

<!-- Pasos para verificar que los cambios funcionan. -->
