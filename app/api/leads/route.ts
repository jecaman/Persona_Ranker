// Fuerza que esta ruta se ejecute en el servidor bajo demanda
// Sin esto, Next.js intenta pre-renderizarla en el build (sin env vars disponibles)
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  const supabase = createServerClient();

  // Traemos todos los leads ordenados por rank ascendente
  // Los que aún no tienen rank (null) van al final con nullsLast
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("rank", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
