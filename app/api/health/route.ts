export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

// Endpoint de diagnóstico temporal — solo muestra si las variables están definidas
// No expone los valores, solo true/false
export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: !!process.env.ANTHROPIC_MODEL,
  });
}
