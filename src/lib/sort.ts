/** Comparação genérica para ordenação de tabelas (números, datas e textos). */
export function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const sa = String(a);
  const sb = String(b);
  return sa.localeCompare(sb, "pt-BR", { numeric: true, sensitivity: "base" });
}

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

export function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  sort: SortState | null,
): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const cmp = compareValues(a[key], b[key]);
    return dir === "asc" ? cmp : -cmp;
  });
}

/** Filtra as linhas por coluna (texto parcial, insensível a maiúsculas). */
export function applyColumnFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: Record<string, string>,
): T[] {
  const entries = Object.entries(filters).filter(
    ([, v]) => v && v.trim() !== "",
  );
  if (entries.length === 0) return rows;
  return rows.filter((row) =>
    entries.every(([key, value]) =>
      String(row[key] ?? "")
        .toLowerCase()
        .includes(value.trim().toLowerCase()),
    ),
  );
}
