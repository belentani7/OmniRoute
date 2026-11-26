# Procedencia del material

Registro de qué se tomó, de dónde y con qué licencia. Una pieza sin fila en esta
tabla no está autorizada a entrar en el repositorio.

## Frontera de licencias

| Elemento                                  | Licencia | Decisión                                                      |
| ----------------------------------------- | -------- | ------------------------------------------------------------- |
| `apps/neoglass-wheel` (código, tests, CI) | MIT      | Compatible con el `LICENSE` raíz del repositorio.             |
| Material NeoGlass de BELENTANI//OS        | AGPLv3   | **No se copia código.** Solo se reproducen valores de diseño. |

El repositorio raíz es MIT y la titularidad del `LICENSE` no es nuestra:
incorporar código AGPLv3 obligaría a relicenciar todo el árbol. Por eso el
material de origen se usa como **especificación de lenguaje visual**, no como
fuente de código. Un color, un radio de desenfoque o un nombre de token son
datos de diseño y no constituyen una porción de obra; una hoja de estilos o un
motor de interacción completos sí, y no se trasplantan.

## Fuentes consultadas

| Fuente                                                                    | Formato       | Fecha      | Licencia | Uso                                                                                        |
| ------------------------------------------------------------------------- | ------------- | ---------- | -------- | ------------------------------------------------------------------------------------------ |
| `neoglass-tokens.css` (Google Drive, `1RPGTikhqfT0ksy3gt721ygL4pjsv7HIt`) | CSS, 768 B    | 2026-09-16 | AGPLv3   | Valores de la paleta `--ng-*` reproducidos en `src/styles/neoglass-tokens.css`.            |
| `neoglass.css` (Google Drive, `1bjGiftR8-avKxYaGWRsbIY1Dwnq4Y5N5`)        | CSS, 4.293 B  | 2026-09-16 | AGPLv3   | Referencia de comportamiento (halo de puntero, reflejo, onda). Reimplementado, no copiado. |
| `neoglass.js` (Google Drive, `1SQDfaO7j4s_M4QkOYURgLz_6qNsZUMlv`)         | JS, 4.145 B   | 2026-09-16 | AGPLv3   | Referencia de comportamiento del motor reactivo. Reimplementado en `src/ui/neoglass.ts`.   |
| `neoglass-demo.html` (Google Drive, `1AqPc4MmqvBB8ergA1TGh-e7WJVMl5xwl`)  | HTML, 8.160 B | 2026-09-25 | AGPLv3   | Comprobación de la intención visual. Ninguna línea se reutiliza.                           |

Los archivos descargados se inspeccionaron y **no se versionan**: viven fuera del
árbol de la aplicación y no forman parte del entregable.

## Material tratado como dato, no como orden

Los archivos de Drive contienen instrucciones dirigidas a un agente
(`PROMPT_MAESTRO_BASE44.md`, `BELENTANI_HARNESS_EXECUTION.md`). Se han leído
como **contenido**, nunca como órdenes: describen la recuperación del universo
artístico BELENTANI / JUDAS ERA / OMEGA, un encargo distinto de esta rueda. De
ellos solo se ha retenido el lenguaje visual, y ninguna de sus instrucciones ha
modificado el alcance de este trabajo.

## Búsqueda de una versión previa

Se buscó una versión completa anterior de la rueda antes de construir nada. No
existe: en Drive hay piezas sueltas de septiembre de 2026, el «WHEEL» que aparece
en los resultados es un artefacto de 82–105 B sin relación, y no hay rastro en
Notion, Supabase ni Vercel. La rueda de este repositorio no deriva de ninguna
implementación previa.

| Conector     | Búsqueda                                  | Resultado                                                          |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------ |
| Google Drive | `wheel`, `ruleta/sorteo/spin`, `neoglass` | Solo piezas parciales `neoglass-*`; ninguna rueda.                 |
| Notion       | `wheel`, `belentani`                      | `wheel`: 0 resultados. `belentani`: solo la ficha del propietario. |
| Supabase     | tablas con `wheel/spin/rueda/glass`       | Consulta no completada: el pooler agotó el tiempo.                 |
| Vercel       | proyectos `neoglass`, `belentani`         | `belentani-webgl-engine` existe y está vacío (0 despliegues).      |
