# NeoGlassRojo · Belentani Wheel — entrega

**Antes:** rueda funcional en la raíz de un repositorio de 27.699 archivos ajenos, con su CI compitiendo contra el de OmniRoute y sin camino a `main`.
**Después:** la misma rueda, aislada en `apps/neoglass-wheel/`, enriquecida con el lenguaje visual NeoGlass y verde en `main` recién clonado, sin tocar un archivo de OmniRoute.

## 1. Cambios

| Archivo                                  | Qué                                            | Por qué                                                                                       |
| ---------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Todo `apps/neoglass-wheel/`              | El proyecto pasa de la raíz a un subdirectorio | `main` tiene 27.699 archivos; en la raíz, cada `git mv` pisaba rutas ajenas (`src/`, `docs/`) |
| `src/styles/neoglass-tokens.css`         | Paleta `--ng-*`                                | Coherencia de marca con el resto del ecosistema                                               |
| `src/styles/neoglass-core.css`           | Halo de puntero, reflejo, onda, pulso          | Profundidad óptica que la UI plana no tenía                                                   |
| `src/ui/neoglass.ts`                     | Motor de esas microinteracciones               | Reimplementado, no copiado: el original es AGPLv3                                             |
| `tests/neoglass.test.ts`                 | 11 casos                                       | Cobertura del módulo nuevo, incluido `prefers-reduced-motion`                                 |
| `scripts/check-shaders.mjs`              | Marca el binario como ejecutable               | En un clon limpio llega en 0644 y el chequeo fallaba con EACCES                               |
| `.github/workflows/neoglass-wheel-*.yml` | CI y Pages propios, con `paths`                | El CI raíz habría intentado compilar la rueda con el toolchain de OmniRoute                   |

## 2. Métricas

| Métrica             | Antes    | Después                              |
| ------------------- | -------- | ------------------------------------ |
| Tests               | 115      | **126** (+11)                        |
| Cobertura de líneas | 97,86 %  | **96,36 %**                          |
| JS gzip             | 11,80 kB | **12,42 kB** (+0,62)                 |
| CSS gzip            | 4,81 kB  | **5,40 kB** (+0,59)                  |
| Total gzip          | 19,4 kB  | **20,6 kB** de 120 kB de presupuesto |
| Verificación        | verde    | **verde**                            |

Accesibilidad verificada por test: contraste 24/24 ≥ 4,5:1, foco con `outline` propio, teclado completo, `aria-live` para el resultado y `prefers-reduced-motion` que anula toda la animación.

La cobertura baja 1,5 puntos porque el módulo nuevo entra con 88,4 %: su rama sin DOM no se puede ejercitar en Node. El peso sube 1,2 kB por las capas ópticas, con 99,4 kB de margen.

## 3. Fuentes

| Fuente                    | Versión           |
| ------------------------- | ----------------- |
| Vite                      | 7.3.8             |
| TypeScript                | 5.9.3             |
| Vitest                    | 5.1.1             |
| ESLint                    | 10.15.0           |
| glslang (Khronos)         | 11.7.0            |
| NeoGlass de BELENTANI//OS | Drive, 2026-09-16 |

## 4. Lo que no se encontró

No existe versión previa completa. Drive guarda piezas sueltas de septiembre, el «WHEEL» de los resultados es un artefacto de 82–105 B, y Vercel solo tiene un proyecto vacío. Supabase no pudo auditarse. No se ha inventado nada para rellenar el hueco.

## 5. Riesgos

1. **Licencia.** OmniRoute es MIT de `diegosouzapw`; el material de origen es AGPLv3. Solo se reprodujeron valores de diseño, nunca código. Frontera en `docs/PROCEDENCIA.md`.
2. **`main` sin ancestro común:** el merge es de linajes no relacionados. Deja los 27.699 archivos de OmniRoute intactos y añade la app; no borra nada.
3. **Supabase sin auditar:** el pooler agotó el tiempo; si existe una tabla de la rueda, no se ha visto.
4. **Pages:** es un destino por repositorio; activarlo podría sustituir el sitio de OmniRoute. Queda en disparo manual.
