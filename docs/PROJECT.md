# Persona Ranker — Guía del proyecto

## Qué hace esta app

Toma un CSV de ~200 leads de ventas, los evalúa contra una descripción de cliente ideal usando IA (Claude), y muestra los resultados en una tabla ordenable. Cada lead recibe una puntuación (0–100), un ranking dentro de su empresa, y una explicación del por qué.

---

## Flujo de datos

```
leads.csv
    ↓
scripts/seed.ts          ← carga los leads en la base de datos (solo una vez)
    ↓
Supabase (tabla leads)   ← fuente de verdad
    ↑            ↓
page.tsx      /api/rank  ← la IA lee los leads, los puntúa, y escribe los resultados
    ↓
Tabla en el browser      ← el usuario ve los leads rankeados
```

---

## Estructura de carpetas

```
app/                     → Código de la aplicación web (Next.js)
  page.tsx               → Página principal: botones + tabla
  layout.tsx             → Envoltorio HTML de toda la app (fuente, título...)
  globals.css            → Estilos globales (Tailwind)
  api/
    rank/route.ts        → Endpoint que orquesta el ranking con IA
    ingest/route.ts      → Endpoint que recibe un CSV y reemplaza los leads

components/
  leads-table.tsx        → Tabla interactiva con TanStack Table

lib/                     → Lógica compartida (no es UI, no es API)
  supabase.ts            → Dos clientes de base de datos (ver más abajo)
  types.ts               → Tipos TypeScript: Lead, RankingResult
  ranking/
    prompt.ts            → Construye el prompt que se manda a Claude
    parser.ts            → Parsea el JSON que devuelve Claude
    batcher.ts           → Divide un array en grupos de N elementos

scripts/
  seed.ts                → Script de una sola vez: carga leads.csv en Supabase

data/
  leads.csv              → Los ~200 leads a rankear
  eval_set.csv           → 50 leads con ranking manual (referencia)
  persona_spec.md        → Descripción del cliente ideal (se inyecta en el prompt)

supabase/
  schema.sql             → SQL para crear la tabla leads en Supabase

docs/
  ARCHITECTURE.md        → Decisiones técnicas detalladas
  PROJECT.md             → Este archivo
```

---

## Archivos clave explicados

### `app/page.tsx` — La página principal

Es un componente React con tres responsabilidades:
- Al cargar, **fetchea** todos los leads de Supabase y los guarda en estado
- Renderiza la **tabla** con esos leads
- Contiene los tres **botones** de acción:
  - **Upload CSV**: sube un nuevo CSV → llama a `/api/ingest`
  - **Run Ranking**: rankea los leads que aún no tienen puntuación → llama a `/api/rank`
  - **Re-rank All**: resetea todo y re-rankea desde cero → llama a `/api/rank?force=true`

### `app/api/rank/route.ts` — El motor del ranking

Es un endpoint `POST`. Cuando se llama:
1. Lee `data/persona_spec.md` del disco
2. Obtiene de Supabase los leads sin `ranked_at` (o todos si `?force=true`)
3. Los divide en grupos de 15 (batches)
4. Por cada grupo → llama a Claude → parsea la respuesta JSON
5. Calcula el rank por empresa (el lead con mayor score en su empresa es rank 1)
6. Guarda `score`, `rank`, `reasoning`, `is_relevant`, `ranked_at` en Supabase

Si un batch falla, se loguea el error y se continúa con el siguiente.

### `app/api/ingest/route.ts` — Carga de un CSV nuevo

Es un endpoint `POST` que recibe un archivo CSV desde el formulario del browser.
1. Valida que el CSV tiene las columnas correctas
2. Borra todos los leads existentes en Supabase
3. Inserta los del nuevo CSV (sin puntuación — listos para rankear)

### `lib/supabase.ts` — Dos clientes de base de datos

Hay dos clientes porque tienen distintos permisos:
- **`createServerClient()`** — usa la `SERVICE_ROLE_KEY`. Tiene permisos completos (leer, escribir, borrar). Solo se usa en los endpoints del servidor (`/api/rank`, `/api/ingest`). Esta clave **nunca** llega al browser.
- **`createBrowserClient()`** — usa la `ANON_KEY`. Solo tiene permisos de lectura. Se usa en `page.tsx` para fetchear los leads directamente desde el browser.

### `lib/ranking/prompt.ts` — El prompt de Claude

Tiene tres funciones:
- `buildSystemPrompt(personaSpec)` → construye el system prompt con las instrucciones y la persona spec inyectada
- `buildLeadsForPrompt(leads)` → extrae solo los campos relevantes de cada lead para ahorrar tokens (`name`, `title`, `company`, `company_size`, `industry`)
- `buildUserMessage(leads)` → formatea los leads como JSON para el mensaje del usuario

### `lib/ranking/parser.ts` — Parseo de la respuesta

Claude devuelve un array JSON. Este módulo lo limpia (por si añade bloques de código markdown) y valida que cada item tiene los campos requeridos: `id`, `score`, `reasoning`, `is_relevant`.

### `lib/ranking/batcher.ts` — Dividir en grupos

Una función `chunk(array, size)`. Por ejemplo, 200 leads ÷ 15 = 14 llamadas a la API en lugar de 200.

### `data/persona_spec.md` — La fuente de verdad del ranking

Define qué tipo de cliente ideal estamos buscando: títulos objetivo por tamaño de empresa, exclusiones duras, exclusiones blandas y señales de cualificación. Se inyecta literalmente en el system prompt de Claude. Para cambiar los criterios de ranking, solo hay que editar este archivo.

### `scripts/seed.ts` — Carga inicial de datos

Script de Node que se ejecuta una sola vez desde la terminal:
```bash
npx tsx scripts/seed.ts
```
Lee `leads.csv`, mapea las columnas al schema de Supabase, e inserta todas las filas. A partir de ahí, se puede usar el botón "Upload CSV" de la UI para actualizaciones futuras.

---

## Variables de entorno (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL       → URL del proyecto en Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY  → Clave pública (solo lectura) — llega al browser
SUPABASE_SERVICE_ROLE_KEY      → Clave privada (acceso total) — solo en servidor
ANTHROPIC_API_KEY              → Clave de la API de Claude
ANTHROPIC_MODEL                → Modelo a usar (ej: claude-haiku-4-5-20251001)
```

Las variables con prefijo `NEXT_PUBLIC_` son visibles en el browser. Las demás son solo del servidor.

---

## Schema de la base de datos

Tabla `leads` en Supabase (Postgres):

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid | Clave primaria, generada automáticamente |
| `account_name` | text | Nombre de la empresa |
| `lead_first_name` | text | Nombre del contacto |
| `lead_last_name` | text | Apellido del contacto |
| `lead_job_title` | text | Cargo |
| `account_domain` | text | Dominio web de la empresa |
| `account_employee_range` | text | Tamaño de la empresa |
| `account_industry` | text | Sector |
| `score` | integer | Puntuación 0–100 (null si no rankeado) |
| `rank` | integer | Posición dentro de su empresa (null si no rankeado) |
| `reasoning` | text | Explicación de la puntuación |
| `is_relevant` | boolean | true si score ≥ 30 |
| `ranked_at` | timestamptz | Cuándo se rankeó (null = pendiente) |

---

## Cómo correrlo localmente

```bash
# 1. Instalar dependencias
npm install

# 2. Crear .env.local con las variables de entorno

# 3. Cargar los leads en Supabase (solo la primera vez)
npx tsx scripts/seed.ts

# 4. Arrancar el servidor
npm run dev

# 5. Abrir http://localhost:3000 y pulsar "Run Ranking"
```
