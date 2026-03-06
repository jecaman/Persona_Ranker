# Architecture — Persona Ranker

## Vision general

```
[CSV] → [seed script] → [Supabase: leads]
                              ↓
                    [POST /api/rank] ↔ [Claude AI]
                              ↓
                         [Frontend tabla]
```

La base de datos es la fuente de verdad compartida. Cada etapa es independiente.

---

## Estructura de carpetas

```
app/
  page.tsx                 # Trigger + tabla de resultados
  api/rank/route.ts        # Orquestacion del ranking
lib/
  supabase.ts              # Clientes server y browser
  ranking/
    prompt.ts              # Construccion del prompt
    parser.ts              # Parseo del JSON de respuesta
    batcher.ts             # Agrupacion de leads en batches
components/
  leads-table.tsx          # Tabla TanStack
scripts/
  seed.ts                  # Ingesta del CSV a Supabase
data/
  leads.csv
  persona_spec.md
types/index.ts
```

---

## Decisiones clave

**Ingesta por script, no endpoint** — el challenge no requiere frontend para esto. La logica de parseo vive en una funcion reutilizable que un futuro endpoint podria llamar.

**Batches de ~15 leads por llamada** — 200 leads / 15 = ~14 llamadas en lugar de 200.

Beneficios:
- Aislamiento de fallos: si un batch falla, los otros 13 siguen adelante
- Evita límites de contexto y output (200 leads en una sola llamada podría truncar la respuesta JSON)
- El modelo razona mejor con menos items por contexto — menos riesgo de que pierda coherencia al final del array

Tradeoff de coste: el persona spec (~2,000 tokens) se repite en cada batch. Con 14 batches son ~28,000 tokens extra (~$0.02 con Haiku, ~$0.08 con Sonnet). Representa ~35-38% del coste total. La alternativa — una sola llamada con los 200 leads — ahorraría ese coste pero a riesgo de respuestas truncadas o de menor calidad.

**`is_relevant` separado de `rank`** — `rank` es ordinal (quien es mejor dentro de los disponibles), `is_relevant` es un gate binario (si vale la pena contactarlo en absoluto). Un lead puede ser #1 en su empresa y aun asi irrelevante.

**Salida JSON estructurada** — el modelo devuelve `{ id, score, reasoning, is_relevant }`. El `rank` lo calculamos nosotros, no Claude — es más fiable que pedirle al modelo que asigne posiciones consistentes entre batches.

**Rank por empresa, no global** — el challenge pide explícitamente "surface the best relevant contacts for each company" y "N relevant leads per company". El `rank` es `ROW_NUMBER() OVER (PARTITION BY account_name ORDER BY score DESC)`. El `score` sigue siendo global (0-100) y permite comparar calidad entre empresas, pero el `rank` indica la posición dentro de su empresa.

**Ordenación por defecto de la tabla: empresa + rank** — la tabla arranca con `ORDER BY account_name ASC, rank ASC` para que los leads aparezcan agrupados visualmente por empresa con separadores entre grupos. Cuando el usuario hace click en otra columna, el agrupado se rompe intencionalmente (es el comportamiento esperado — quiere ver una vista diferente). Un botón "Reset" restaura el sort por defecto. Los separadores visuales solo se renderizan cuando el sort activo es exactamente el default, evitando separadores en posiciones sin sentido.

**`persona_spec.md` en el repo** — se inyecta completo en el system prompt. Editable sin tocar codigo, versionable con git.

**Sin pre-filtro de hard exclusions** — las exclusiones en esta spec son contextuales (ej: CEO es target ideal en startups pero hard exclusion en Enterprise). Pre-filtrar en código requeriría parsear la spec para extraer reglas, lo cual rompe la escalabilidad a otras specs. Claude maneja el contexto naturalmente. El prompt guía a Claude con pasos explícitos: (1) check hard exclusions, (2) score por título × tamaño empresa, (3) penalizar soft exclusions, (4) ajustar por señales.

**Dos clientes Supabase** — server (service role key) para escrituras en API routes, browser (anon key) para lecturas en el frontend. El service role key nunca llega al cliente.

---

## Flujo de ranking

```
Click "Run Ranking"
  → SELECT leads WHERE ranked_at IS NULL
  → Leer persona_spec.md
  → Por cada batch de 15:
      → Claude API → JSON de resultados
      → UPDATE leads (score, rank, reasoning, is_relevant, ranked_at)
  → Refetch y actualizar tabla
```

---

## Tradeoffs

- Sin streaming: el boton muestra spinner hasta que termina todo el proceso
- Ranking global, no por empresa (simplifica el prompt y la tabla)
- Sin autenticacion (es una app de uso interno/demo)

---

## Notas de implementacion

**Next.js 14 en lugar de 15** — Node 18.20.8 instalado en el entorno. Next.js 15 requiere Node >= 20.9.0. Se usa Next.js 14.2.x que es compatible con Node >= 18.17.

**`next.config.mjs` en lugar de `.ts`** — Next.js 14 no soporta `next.config.ts`. Se usa `.mjs` con JSDoc para mantener tipos.

**Scaffolding manual** — `create-next-app` rechaza el directorio `Persona_Ranker` por las mayusculas en el nombre. El proyecto se scaffoldeó manualmente con `package.json` usando el nombre normalizado `persona-ranker`.

**Variables de entorno en scripts Node** — `tsx` no carga `.env.local` automáticamente (eso lo hace Next.js). Los scripts usan `dotenv` con `config({ path: ".env.local" })` al inicio. Las variables deben leerse dentro de las funciones (no en el nivel superior del módulo) para que dotenv haya tenido tiempo de inyectarlas antes de que se usen — los `import` se ejecutan antes que cualquier código del archivo.

**`data/` en el bundle de Vercel** — Next.js sólo incluye en el bundle los archivos que detecta estáticamente. Para que `fs.readFileSync("data/persona_spec.md")` funcione en producción, se añade `outputFileTracingIncludes` en `next.config.mjs`.

**`runtime = "nodejs"` en el endpoint** — necesario para poder usar `fs` (el sistema de archivos). El runtime por defecto en Next.js App Router es Edge, que no tiene acceso a `fs`.

**Campos enviados a Claude** — sólo se envían los campos relevantes para la evaluación (`name`, `title`, `company`, `company_size`, `industry`). El `account_domain` se omite para ahorrar tokens.
