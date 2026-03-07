"use client";

import { useEffect, useState } from "react";
import { LeadsTable } from "@/components/leads-table";
import { createBrowserClient } from "@/lib/supabase";
import type { Lead } from "@/lib/types";

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isRanking, setIsRanking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      setMessage(`✓ ${data.ranked} leads ranked. ${data.failed_batches > 0 ? `${data.failed_batches} batches failed.` : ""}`);
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
          <div className="flex gap-2">
            {/* Input de archivo oculto — el label actúa como botón */}
            <label className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium
                              hover:bg-gray-200 cursor-pointer transition-colors text-sm">
              Upload CSV
              <input type="file" accept=".csv" className="hidden" onChange={uploadCsv} />
            </label>

            <button
              onClick={() => runRanking(false)}
              disabled={isRanking}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors"
            >
              {isRanking ? "Ranking…" : "Run Ranking"}
            </button>

            <button
              onClick={() => runRanking(true)}
              disabled={isRanking}
              className="px-5 py-2 bg-orange-500 text-white rounded-lg font-medium
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
