// Fuerza que esta ruta se ejecute en el servidor bajo demanda
// Sin esto, Next.js intenta pre-renderizarla en el build (sin env vars disponibles)
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("rank", { ascending: true, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    // Captura errores inesperados (ej: variables de entorno mal configuradas)
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
