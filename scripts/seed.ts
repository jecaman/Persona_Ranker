// Script de ingesta: lee leads.csv y lo carga en Supabase
// Ejecutar con: npx tsx scripts/seed.ts

// dotenv carga el archivo .env.local para que las API keys estén disponibles
// Next.js hace esto automáticamente, pero los scripts de Node necesitan hacerlo manualmente
import { config } from "dotenv";
config({ path: ".env.local" });

import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { join } from "path";
import { createServerClient } from "../lib/supabase";

// Lee el archivo CSV como texto plano
const csvText = readFileSync(join(process.cwd(), "data/leads.csv"), "utf-8");

// parse() convierte el texto CSV en un array de objetos JavaScript
// { columns: true } usa la primera fila como nombres de clave
// { skip_empty_lines: true } ignora líneas vacías al final del archivo
const rows = parse(csvText, { columns: true, skip_empty_lines: true });

// Limpia los valores: convierte strings vacíos en null
// Así en la base de datos queda NULL en lugar de ""
function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

const leads = rows.map((row: Record<string, string>) => ({
  account_name:           emptyToNull(row.account_name),
  lead_first_name:        emptyToNull(row.lead_first_name),
  lead_last_name:         emptyToNull(row.lead_last_name),
  lead_job_title:         emptyToNull(row.lead_job_title),
  account_domain:         emptyToNull(row.account_domain),
  account_employee_range: emptyToNull(row.account_employee_range),
  account_industry:       emptyToNull(row.account_industry),
}));

async function seed() {
  const supabase = createServerClient();

  console.log(`Insertando ${leads.length} leads...`);

  // insert() es equivalente a un INSERT en SQL
  // Si algo falla, Supabase devuelve el error en { error }
  const { error } = await supabase.from("leads").insert(leads);

  if (error) {
    console.error("Error al insertar:", error.message);
    process.exit(1);
  }

  console.log(`✓ ${leads.length} leads insertados correctamente`);
}

seed();
