"use client";

// useEffect: ejecuta código cuando el componente aparece en pantalla
// useState: variables que, al cambiar, actualizan la pantalla automáticamente
import { useEffect, useState } from "react";
import { LeadsTable } from "@/components/leads-table";
import type { Lead } from "@/lib/types";

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isRanking, setIsRanking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Carga los leads al montar el componente (equivalente a una query inicial)
  // El array vacío [] al final significa "ejecutar solo una vez al cargar"
  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data);
  }

  async function runRanking() {
    setIsRanking(true);
    setMessage(null);

    const res = await fetch("/api/rank", { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setMessage(`Error: ${data.error}`);
    } else {
      setMessage(`✓ ${data.ranked} leads ranked. ${data.failed_batches > 0 ? `${data.failed_batches} batches failed.` : ""}`);
      // Recarga la tabla con los resultados frescos
      await fetchLeads();
    }

    setIsRanking(false);
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
          <button
            onClick={runRanking}
            disabled={isRanking}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium
                       hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {isRanking ? "Ranking…" : "Run Ranking"}
          </button>

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
