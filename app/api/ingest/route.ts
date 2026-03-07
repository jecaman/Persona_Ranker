export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { createServerClient } from "@/lib/supabase";

function emptyToNull(value: string): string | null {
  return value.trim() === "" ? null : value.trim();
}

export async function POST(request: NextRequest) {
  // FormData es como un <form> HTML — permite recibir archivos
  // request.formData() lee el cuerpo de la request como multipart/form-data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }

  // Leemos el contenido del archivo como texto
  const csvText = await file.text();

  let rows: Record<string, string>[];
  try {
    rows = parse(csvText, { columns: true, skip_empty_lines: true });
  } catch {
    return NextResponse.json({ error: "El archivo no es un CSV válido" }, { status: 400 });
  }

  // Validar que el CSV tiene las columnas esperadas
  const required = ["account_name", "lead_first_name", "lead_last_name", "lead_job_title", "account_domain", "account_employee_range", "account_industry"];
  const firstRow = rows[0] ?? {};
  const missing = required.filter((col) => !(col in firstRow));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Columnas faltantes: ${missing.join(", ")}` }, { status: 400 });
  }

  const leads = rows.map((row) => ({
    account_name:           emptyToNull(row.account_name),
    lead_first_name:        emptyToNull(row.lead_first_name),
    lead_last_name:         emptyToNull(row.lead_last_name),
    lead_job_title:         emptyToNull(row.lead_job_title),
    account_domain:         emptyToNull(row.account_domain),
    account_employee_range: emptyToNull(row.account_employee_range),
    account_industry:       emptyToNull(row.account_industry),
  }));

  const supabase = createServerClient();

  // DELETE + INSERT = "insert overwrite"
  // Primero borramos todos los leads existentes...
  const { error: deleteError } = await supabase
    .from("leads")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // condición siempre true

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // ...luego insertamos los del nuevo CSV
  const { error: insertError } = await supabase.from("leads").insert(leads);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: leads.length });
}
