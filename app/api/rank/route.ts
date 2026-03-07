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

// Precios de Claude 3 Haiku ($ por millón de tokens)
const PRICE_INPUT_PER_M  = 0.25;
const PRICE_OUTPUT_PER_M = 1.25;

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

  // Si se pasa ?force=true, reseteamos todos los leads para re-rankear desde cero
  // Equivalente SQL: UPDATE leads SET ranked_at = NULL, score = NULL, rank = NULL, ...
  const force = request.nextUrl.searchParams.get("force") === "true";
  if (force) {
    const { error: resetError } = await supabase
      .from("leads")
      .update({ ranked_at: null, score: null, rank: null, reasoning: null, is_relevant: null })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // condición siempre true para afectar todas las filas
    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 });
    }
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

  // Procesamos todos los batches en paralelo con Promise.all
  // Equivalente a lanzar todas las llamadas a la vez en vez de esperar una por una
  // Reduce el tiempo total de ~70s (secuencial) a ~5-7s (paralelo)
  const batchErrors: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      try {
        const leadsForPrompt = buildLeadsForPrompt(batch);
        const response = await anthropic.messages.create({
          model,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: "user", content: buildUserMessage(leadsForPrompt) }],
        });

        const text = response.content[0].type === "text" ? response.content[0].text : "";
        return { results: parseRankingResponse(text), usage: response.usage, error: null };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Batch fallido:`, err);
        return { results: [], usage: null, error: msg };
      }
    })
  );

  for (const batch of batchResults) {
    if (batch.error) {
      batchErrors.push(batch.error);
      failedBatches++;
    } else {
      allResults.push(...batch.results);
      totalInputTokens  += batch.usage!.input_tokens;
      totalOutputTokens += batch.usage!.output_tokens;
    }
  }

  if (allResults.length === 0) {
    return NextResponse.json({ error: "Todos los batches fallaron", details: batchErrors }, { status: 500 });
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
  type RankedResult = { id: string; score: number; reasoning: string; is_relevant: boolean; rank: number; global_rank: number; ranked_at: string };
  const resultsWithRank: RankedResult[] = [];

  // Rank por empresa: ROW_NUMBER() OVER (PARTITION BY account_name ORDER BY score DESC)
  Array.from(byCompany.values()).forEach((companyResults) => {
    companyResults.sort((a, b) => b.score - a.score);
    companyResults.forEach((result, index) => {
      resultsWithRank.push({
        ...result,
        rank: index + 1,
        global_rank: 0, // placeholder, se calcula abajo
        ranked_at: new Date().toISOString(),
      });
    });
  });

  // Rank global: ROW_NUMBER() OVER (ORDER BY score DESC) — sin agrupar por empresa
  resultsWithRank.sort((a, b) => b.score - a.score);
  resultsWithRank.forEach((result, index) => {
    result.global_rank = index + 1;
  });

  // 5. Guardar los resultados en Supabase
  // upsert actualiza si el id ya existe, inserta si no — como un MERGE en SQL
  const { error: upsertError } = await supabase
    .from("leads")
    .upsert(resultsWithRank, { onConflict: "id" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const estimatedCostUsd =
    (totalInputTokens / 1_000_000) * PRICE_INPUT_PER_M +
    (totalOutputTokens / 1_000_000) * PRICE_OUTPUT_PER_M;

  return NextResponse.json({
    ranked: allResults.length,
    failed_batches: failedBatches,
    total_leads: leads.length,
    usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      estimated_cost_usd: Math.round(estimatedCostUsd * 10000) / 10000, // 4 decimales
    },
  });
}
