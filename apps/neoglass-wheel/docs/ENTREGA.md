# NeoGlassRojo · Belentani Wheel — entrega

## 1. Veredicto

**Antes:** una rueda funcional pero en la raíz de un repositorio de 27.699 archivos ajenos, con su CI compitiendo contra el de OmniRoute y sin camino limpio a `main`.
**Después:** la misma rueda, aislada en `apps/neoglass-wheel/`, enriquecida con el lenguaje visual NeoGlass, verificada de punta a punta y publicada en `main` sin tocar un solo archivo de OmniRoute.

## 2. Cambios

| Archivo                                  | Qué                                            | Por qué                                                                                       |
| ---------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Todo `apps/neoglass-wheel/`              | El proyecto pasa de la raíz a un subdirectorio | `main` tiene 27.699 archivos; en la raíz, cada `git mv` pisaba rutas ajenas (`src/`, `docs/`) |
| `src/styles/neoglass-tokens.css`         | Paleta `--ng-*`                                | Coherencia de marca con el resto del ecosistema                                               |
| `src/styles/neoglass-core.css`           | Halo de puntero, reflejo, onda, pulso          | Profundidad óptica que la UI plana no tenía                                                   |
| `src/ui/neoglass.ts`                     | Motor de esas microinteracciones               | Reimplementado, no copiado: el original es AGPLv3                                             |
| `tests/neoglass.test.ts`                 | 11 casos                                       | Cobertura del módulo nuevo, incluido `prefers-reduced-motion`                                 |
| `scripts/check-shaders.mjs`              | Marca el binario como ejecutable               | En un clon limpio llega en 0644 y el chequeo fallaba con EACCES                               |
| `.github/workflows/neoglass-wheel-*.yml` | CI y Pages propios, con `paths`                | El CI raíz habría intentado compilar la rueda con el toolchain de OmniRoute                   |

## 3. Métricas

| Métrica             | Antes    | Después                              |
| ------------------- | -------- | ------------------------------------ |
| Tests               | 115      | **126** (+11)                        |
| Cobertura de líneas | 97,86 %  | **96,36 %**                          |
| JS gzip             | 11,80 kB | **12,42 kB** (+0,62)                 |
| CSS gzip            | 4,81 kB  | **5,40 kB** (+0,59)                  |
| Total gzip          | 19,4 kB  | **20,6 kB** de 120 kB de presupuesto |
| Verificación        | verde    | **verde**                            |

La cobertura baja 1,5 puntos porque el módulo nuevo entra con 88,4 %: su rama sin DOM es la que no se puede ejercitar en Node. El peso sube 1,2 kB por las capas ópticas, con 99,4 kB de margen intacto.

## 4. Cómo verificarlo

```bash
cd apps/neoglass-wheel
npm ci
npm run verify   # formato → tipos → lint → HTML → GLSL → cobertura → build → presupuesto
npm run dev      # http://localhost:5173
```

La verificación es una sola orden y no perdona: cualquier paso en rojo detiene el resto. No se declara nada como verificado sin haberlo ejecutado; las cifras de la tabla anterior salen de esa misma ejecución.

## 5. Accesibilidad y rendimiento

| Comprobación             | Resultado                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Contraste del texto      | 24/24 colores ≥ 4,5:1                                                               |
| Foco visible             | `outline` propio, sobrevive al alto contraste                                       |
| `prefers-reduced-motion` | anula reflejo, onda y pulso                                                         |
| Navegación por teclado   | Espacio gira; las flechas recorren las opciones y actualizan el resultado sin girar |
| Anuncio del resultado    | región `aria-live`, sin depender del canvas                                         |
| Sin WebGL2               | fallback a Canvas 2D con las mismas etiquetas                                       |
| Presupuesto              | 20,6 kB de 120 kB gzip                                                              |

## 6. Fuentes

| Fuente                    | Versión           |
| ------------------------- | ----------------- |
| Vite                      | 7.3.8             |
| TypeScript                | 5.9.3             |
| Vitest                    | 5.1.1             |
| ESLint                    | 10.15.0           |
| glslang (Khronos)         | 11.7.0            |
| NeoGlass de BELENTANI//OS | Drive, 2026-09-16 |

## 7. Lo que no se encontró

No existe una versión previa completa de la rueda. Drive guarda piezas sueltas
de septiembre, el «WHEEL» de los resultados es un artefacto de 82–105 B, y
Notion y Vercel no aportan nada: el proyecto vacío se llama
`belentani-webgl-engine`. Supabase no pudo auditarse. No se ha inventado nada
para rellenar ese hueco.

## 8. Riesgos

1. **Licencia.** OmniRoute es MIT de `diegosouzapw`; el material de origen es AGPLv3. Solo se reprodujeron valores de diseño, nunca código. La frontera está en `docs/PROCEDENCIA.md`.
2. **`main` no comparte historia** con la rama del proyecto: el merge es de linajes no relacionados y deja 27.699 archivos intactos de OmniRoute más la app.
3. **Supabase sin auditar.** La consulta de tablas agotó el tiempo del pooler; si existe una tabla de la rueda, no se ha visto.
4. **Pages.** Es un destino por repositorio: activarlo podría sustituir el sitio de OmniRoute. Queda en disparo manual.
