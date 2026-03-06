// Divide un array en grupos de un tamaño dado
// Ejemplo: chunk([1,2,3,4,5], 2) → [[1,2], [3,4], [5]]
export function chunk<T>(array: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}
