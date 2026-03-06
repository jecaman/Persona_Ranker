export type BatchResult = {
  id: string;
  score: number;
  reasoning: string;
  is_relevant: boolean;
};

// Parsea el texto que devuelve Claude y lo convierte en un array tipado
// Claude a veces envuelve el JSON en ```json ... ``` — lo limpiamos
export function parseRankingResponse(text: string): BatchResult[] {
  // Eliminar bloques de código markdown si Claude los añade
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  const parsed = JSON.parse(clean);

  if (!Array.isArray(parsed)) {
    throw new Error("La respuesta no es un array JSON");
  }

  // Validar que cada item tiene los campos requeridos
  return parsed.map((item, index) => {
    if (typeof item.id !== "string") throw new Error(`Item ${index}: falta id`);
    if (typeof item.score !== "number") throw new Error(`Item ${index}: score no es número`);
    if (typeof item.reasoning !== "string") throw new Error(`Item ${index}: falta reasoning`);
    if (typeof item.is_relevant !== "boolean") throw new Error(`Item ${index}: is_relevant no es boolean`);

    return {
      id: item.id,
      score: Math.min(100, Math.max(0, item.score)), // clamp entre 0 y 100
      reasoning: item.reasoning,
      is_relevant: item.is_relevant,
    };
  });
}
