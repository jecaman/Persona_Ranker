"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import type { Lead } from "@/lib/types";

const col = createColumnHelper<Lead>();

const columns = [
  col.accessor("global_rank", {
    header: "Global Rank",
    cell: (info) => info.getValue() ?? "—",
  }),
  col.accessor("rank", {
    header: "Co. Rank",
    cell: (info) => info.getValue() ?? "—",
  }),
  col.accessor((row) => `${row.lead_first_name ?? ""} ${row.lead_last_name ?? ""}`.trim(), {
    id: "name",
    header: "Name",
  }),
  col.accessor("lead_job_title", {
    header: "Title",
    cell: (info) => info.getValue() ?? "—",
  }),
  col.accessor("account_name", {
    header: "Company",
    cell: (info) => info.getValue() ?? "—",
  }),
  col.accessor("account_employee_range", {
    header: "Size",
    cell: (info) => info.getValue() ?? "—",
  }),
  col.accessor("score", {
    header: "Score",
    cell: (info) => {
      const score = info.getValue();
      if (score === null) return <span className="text-gray-400">—</span>;
      const color =
        score >= 80 ? "text-green-600" :
        score >= 50 ? "text-yellow-600" :
        score >= 30 ? "text-orange-500" :
        "text-red-500";
      return <span className={`font-semibold ${color}`}>{score}</span>;
    },
  }),
  col.accessor("is_relevant", {
    header: "Relevant",
    cell: (info) => {
      const val = info.getValue();
      if (val === null) return <span className="text-gray-400">—</span>;
      return val
        ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Yes</span>
        : <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-medium">No</span>;
    },
  }),
  col.accessor("reasoning", {
    header: "Reasoning",
    enableSorting: false,
    cell: (info) => (
      <span className="text-sm text-gray-600">{info.getValue() ?? "—"}</span>
    ),
  }),
];

// Sort por defecto: empresa A→Z, luego rank 1→N dentro de cada empresa
// Es equivalente a ORDER BY account_name ASC, rank ASC en SQL
const DEFAULT_SORT: SortingState = [
  { id: "account_name", desc: false },
  { id: "rank", desc: false },
];

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORT);

  // isGrouped es true cuando el sort activo es el default (agrupado por empresa)
  // Lo usamos para mostrar los separadores visuales entre empresas
  const isGrouped =
    sorting.length === 2 &&
    sorting[0].id === "account_name" &&
    sorting[1].id === "rank";

  const table = useReactTable({
    data: leads,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div>
      {/* Botón para restaurar el agrupado por empresa */}
      {!isGrouped && (
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setSorting(DEFAULT_SORT)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                       text-gray-600 bg-white border border-gray-300 rounded-md
                       hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Group by company
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b border-gray-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap"
                  >
                    {header.column.getCanSort() ? (
                      <button
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 hover:text-gray-900"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span className="text-gray-400">
                          {{ asc: "↑", desc: "↓" }[header.column.getIsSorted() as string] ?? "↕"}
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              // Detectamos si esta fila es la primera de un nuevo grupo de empresa
              // Comparando la empresa de esta fila con la fila anterior
              const prevCompany = rows[rowIndex - 1]?.original.account_name;
              const thisCompany = row.original.account_name;
              const isFirstInGroup = isGrouped && rowIndex > 0 && prevCompany !== thisCompany;

              return (
                <tr
                  key={row.id}
                  className={`hover:bg-gray-50 ${
                    isFirstInGroup ? "border-t-2 border-gray-300" : "border-t border-gray-100"
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>

        {leads.length === 0 && (
          <p className="text-center py-12 text-gray-400">No leads loaded yet.</p>
        )}
      </div>
    </div>
  );
}
