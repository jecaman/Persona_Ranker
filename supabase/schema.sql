-- Tabla principal de leads
-- Las columnas del CSV se cargan tal cual (snake_case)
-- Las columnas de ranking empiezan como NULL y se rellenan cuando se ejecuta /api/rank

create table if not exists leads (
  id                    uuid primary key default gen_random_uuid(),

  -- datos del CSV
  account_name          text,
  lead_first_name       text,
  lead_last_name        text,
  lead_job_title        text,
  account_domain        text,
  account_employee_range text,
  account_industry      text,

  -- resultados del ranking (NULL hasta que se rankea)
  score                 numeric,       -- 0 a 100
  rank                  integer,       -- posición global
  reasoning             text,          -- explicación del modelo
  is_relevant           boolean,       -- ¿vale la pena contactar?
  ranked_at             timestamptz,   -- cuándo se rankeó

  created_at            timestamptz default now()
);
