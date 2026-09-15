import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortState } from "@/lib/sort";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de coluna com ordenação crescente/decrescente. Clique alterna
 * a direção; o estado fica no pai, que ordena as linhas com `sortRows`.
 */
export function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  numeric,
  className,
}: {
  label: string;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none whitespace-nowrap",
        numeric && "text-right",
        className,
      )}
      onClick={() => onSort(sortKey)}
      aria-sort={
        active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <span className={cn("inline-flex items-center gap-1", numeric && "justify-end")}>
        {label}
        {active ? (
          sort!.dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </TableHead>
  );
}
