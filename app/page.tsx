"use client";

import { useEffect, useState } from "react";
import { LeadsTable } from "@/components/leads-table";
import { createBrowserClient } from "@/lib/supabase";
import type { Lead } from "@/lib/types";

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isRanking, setIsRanking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [topN, setTopN] = useState(3);

  useEffect(() => {
    fetchLeads();
  }, []);

  // Fetch directo desde el navegador usando la anon key (pública)
  // No necesitamos pasar por un API route para leer datos
  async function fetchLeads() {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("leads")
      .select("*")
      .order("rank", { ascending: true, nullsFirst: false });
    setLeads(data ?? []);
  }

  async function runRanking(force = false) {
    setIsRanking(true);
    setMessage(null);

    const url = force ? "/api/rank?force=true" : "/api/rank";
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setMessage(`Error: ${data.error}`);
    } else {
      const { ranked, failed_batches, usage } = data;
      const stats = usage
        ? ` · ${(usage.input_tokens + usage.output_tokens).toLocaleString()} tokens · ~$${usage.estimated_cost_usd}`
        : "";
      const warn = failed_batches > 0 ? ` · ${failed_batches} batches failed` : "";
      setMessage(`✓ ${ranked} leads ranked${stats}${warn}`);
      await fetchLeads();
    }

    setIsRanking(false);
  }

  async function uploadCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setMessage(null);

    // FormData es el equivalente en JS de enviar un <form> con enctype="multipart/form-data"
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/ingest", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setMessage(`Error: ${data.error}`);
    } else {
      setMessage(`✓ ${data.inserted} leads cargados. Pulsa "Run Ranking" para rankearlos.`);
      await fetchLeads();
    }

    // Resetear el input para que se pueda subir el mismo archivo de nuevo si hace falta
    e.target.value = "";
  }

  function exportCsv() {
    // Tomamos los top N por empresa: leads con rank <= topN y is_relevant = true
    const filtered = leads
      .filter((l) => l.rank !== null && l.rank <= topN && l.is_relevant)
      .sort((a, b) =>
        (a.account_name ?? "").localeCompare(b.account_name ?? "") ||
        (a.rank ?? 0) - (b.rank ?? 0)
      );

    const headers = ["global_rank", "rank", "score", "first_name", "last_name", "title", "company", "industry", "size"];
    const rows = filtered.map((l) => [
      l.global_rank,
      l.rank,
      l.score,
      l.lead_first_name ?? "",
      l.lead_last_name ?? "",
      `"${(l.lead_job_title ?? "").replace(/"/g, '""')}"`,
      `"${(l.account_name ?? "").replace(/"/g, '""')}"`,
      `"${(l.account_industry ?? "").replace(/"/g, '""')}"`,
      l.account_employee_range ?? "",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    // Creamos un fichero en memoria y lanzamos la descarga — equivalente a escribir un fichero en disco
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `top${topN}_leads.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rankedCount = leads.filter((l) => l.ranked_at !== null).length;

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Persona Ranker</h1>
          <p className="text-gray-500 mt-1">
            {leads.length} leads loaded
            {rankedCount > 0 && ` · ${rankedCount} ranked`}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2 items-center">
            {/* Input de archivo oculto — el label actúa como botón */}
            <label className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium
                              hover:bg-gray-200 cursor-pointer transition-colors text-sm">
              Upload CSV
              <input type="file" accept=".csv" className="hidden" onChange={uploadCsv} />
            </label>

            {/* Export: input numérico + botón */}
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">Top</span>
              <input
                type="number"
                min={1}
                max={20}
                value={topN}
                onChange={(e) => setTopN(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 px-2 py-2 text-sm border border-gray-300 rounded-lg text-center"
              />
              <button
                onClick={exportCsv}
                disabled={rankedCount === 0}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm
                           hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export CSV
              </button>
            </div>

            <button
              onClick={() => runRanking(false)}
              disabled={isRanking}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
            >
              {isRanking ? "Ranking…" : "Run Ranking"}
            </button>

            <button
              onClick={() => runRanking(true)}
              disabled={isRanking}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium
                         hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
            >
              {isRanking ? "Ranking…" : "Re-rank All"}
            </button>
          </div>

          {message && (
            <p className={`text-sm ${message.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
              {message}
            </p>
          )}
        </div>
      </div>

      {/* Tabla */}
      <LeadsTable leads={leads} />
    </main>
  );
}
