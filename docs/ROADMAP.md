# Roadmap — Persona Ranker MVP

## Objetivo

Construir un sistema que ingeste un CSV de ~200 leads de ventas, los rankee contra una persona ideal usando IA, y muestre los resultados en una tabla interactiva.

---

## Tareas

### 1. Inicializar proyecto Next.js

Scaffoldear la app con TypeScript (App Router) e instalar todas las dependencias necesarias.

**Dependencias:**
- `@supabase/supabase-js` — cliente de base de datos
- `@anthropic-ai/sdk` — llamadas a la IA
- `shadcn/ui` — componentes UI
- `@tanstack/react-table` — tabla interactiva
- `csv-parse` — parseo de archivos CSV

**Variables de entorno** (`.env.local`):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
```

---

### 2. Configurar schema en Supabase

Crear la tabla `leads` con los campos del CSV más las columnas de resultado del ranking.

**Schema:**
```sql
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  title text,
  company text,
  linkedin_url text,
  email text,
  -- columnas de ranking (null hasta que se rankee)
  score numeric,
  rank integer,
  reasoning text,
  is_relevant boolean,
  ranked_at timestamptz
);
```

Crear cliente tipado en `lib/supabase.ts` (server con service role key, client con anon key).

---

### 3. Script de ingesta de leads

Script en `scripts/seed.ts` que parsea `leads.csv` y hace upsert en Supabase.

```bash
npx tsx scripts/seed.ts
```

Tambien añadir `persona_spec.md` al repo con la definicion de la persona ideal y criterios de descalificacion.

---

### 4. API Route — `POST /api/rank`

Endpoint que orquesta todo el proceso de ranking con IA.

**Flujo:**
1. Leer leads sin rankear de Supabase
2. Leer `persona_spec.md`
3. Agrupar leads en batches (10–20 por llamada)
4. Por cada batch: llamar a Claude con prompt estructurado → recibir JSON
5. Escribir resultados (`score`, `rank`, `reasoning`, `is_relevant`) de vuelta a Supabase

---

### 5. Frontend — Trigger + Tabla de resultados

Pagina principal (`app/page.tsx`) con dos elementos:

- **Boton "Run Ranking"**: llama a `POST /api/rank`, muestra estado de carga
- **Tabla TanStack**: muestra todos los leads con columnas sortables por `rank` y `score`

Columnas de la tabla: nombre, titulo, empresa, LinkedIn, score, rank, relevante, razonamiento.

---

### 6. README + Deploy en Vercel

Actualizar `README.md` con instrucciones para correr localmente, overview de arquitectura, decisiones clave y tradeoffs.

Deploy en Vercel: conectar repo, añadir variables de entorno, verificar URL en vivo.

---

## Orden de ejecucion

```
1 → 2 → 3 → 4 → 5 → 6
```

Las tareas 1–3 son de setup e infraestructura. La tarea 4 es el nucleo de negocio. La tarea 5 es la interfaz. La tarea 6 cierra la entrega.
