// Esto le dice a Next.js que esta ruta se ejecuta en Node.js (no en Edge)
// Necesitamos Node.js para poder leer archivos del sistema con fs
export const runtime = "nodejs";

// maxDuration define el timeout del serverless function en Vercel (en segundos)
// El proceso de ranking de ~200 leads tarda ~30-60s en total
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import Anthropic from "@anthropic-ai/sdk";

import { createServerClient } from "@/lib/supabase";
import { chunk } from "@/lib/ranking/batcher";
import { buildLeadsForPrompt, buildSystemPrompt, buildUserMessage } from "@/lib/ranking/prompt";
import { parseRankingResponse } from "@/lib/ranking/parser";
import type { Lead } from "@/lib/types";

const BATCH_SIZE = 15;

// NextRequest nos permite leer los query params de la URL
// Ej: POST /api/rank?limit=10 → solo rankea 10 leads (útil para pruebas)
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

  // Leemos el parámetro ?limit=N de la URL si existe
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : null;

  // 1. Leer la persona spec del archivo
  let personaSpec: string;
  try {
    personaSpec = readFileSync(join(process.cwd(), "data/persona_spec.md"), "utf-8");
  } catch {
    return NextResponse.json({ error: "No se encontró data/persona_spec.md" }, { status: 500 });
  }

  // 2. Obtener los leads sin rankear de Supabase
  // .is("ranked_at", null) es equivalente a WHERE ranked_at IS NULL en SQL
  let query = supabase.from("leads").select("*").is("ranked_at", null);

  // Si se pasó ?limit=N, solo procesamos esa cantidad (para pruebas baratas)
  if (limit) query = query.limit(limit);

  const { data: leads, error: fetchError } = await query;

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ message: "Todos los leads ya están rankeados", ranked: 0 });
  }

  // 3. Dividir en batches y llamar a Claude por cada uno
  const batches = chunk(leads as Lead[], BATCH_SIZE);
  const allResults: { id: string; score: number; reasoning: string; is_relevant: boolean }[] = [];
  let failedBatches = 0;

  const systemPrompt = buildSystemPrompt(personaSpec);

  for (const batch of batches) {
    try {
      const leadsForPrompt = buildLeadsForPrompt(batch);
      const response = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: buildUserMessage(leadsForPrompt) }],
      });

      // response.content[0] es el primer bloque de texto de la respuesta
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const results = parseRankingResponse(text);
      allResults.push(...results);
    } catch (err) {
      console.error(`Batch fallido:`, err);
      failedBatches++;
      // Continuamos con el siguiente batch aunque este haya fallado
    }
  }

  if (allResults.length === 0) {
    return NextResponse.json({ error: "Todos los batches fallaron" }, { status: 500 });
  }

  // 4. Calcular el rank POR EMPRESA
  // El challenge pide "surface the best relevant contacts for each company"
  // Equivalente SQL: ROW_NUMBER() OVER (PARTITION BY account_name ORDER BY score DESC)

  // Construimos un mapa id → account_name para poder agrupar
  const companyById = new Map(
    (leads as Lead[]).map((l) => [l.id, l.account_name ?? "Unknown"])
  );

  // Agrupamos los resultados por empresa
  const byCompany = new Map<string, typeof allResults>();
  for (const result of allResults) {
    const company = companyById.get(result.id) ?? "Unknown";
    if (!byCompany.has(company)) byCompany.set(company, []);
    byCompany.get(company)!.push(result);
  }

  // Dentro de cada empresa, ordenamos por score y asignamos rank 1, 2, 3...
  // Array.from convierte el iterador del Map en un array normal
  type RankedResult = { id: string; score: number; reasoning: string; is_relevant: boolean; rank: number; ranked_at: string };
  const resultsWithRank: RankedResult[] = [];

  Array.from(byCompany.values()).forEach((companyResults) => {
    companyResults.sort((a, b) => b.score - a.score);
    companyResults.forEach((result, index) => {
      resultsWithRank.push({
        ...result,
        rank: index + 1,
        ranked_at: new Date().toISOString(),
      });
    });
  });

  // 5. Guardar los resultados en Supabase
  // upsert actualiza si el id ya existe, inserta si no — como un MERGE en SQL
  const { error: upsertError } = await supabase
    .from("leads")
    .upsert(resultsWithRank, { onConflict: "id" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ranked: allResults.length,
    failed_batches: failedBatches,
    total_leads: leads.length,
  });
}
