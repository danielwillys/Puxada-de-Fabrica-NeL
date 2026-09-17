import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TableHead } from "@/components/ui/table";
import type { SortState } from "@/lib/sort";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de coluna com ordenação (crescente/decrescente) e filtro por texto
 * opcional. O estado da ordenação fica no pai; o filtro também (`filterValue` +
 * `onFilterChange`), aplicado via `applyColumnFilters`.
 */
export function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  numeric,
  className,
  filterValue,
  onFilterChange,
}: {
  label: string;
  sortKey: string;
  sort: SortState | null;
  onSort: (key: string) => void;
  numeric?: boolean;
  className?: string;
  /** Valor atual do filtro da coluna ("" = sem filtro). */
  filterValue?: string;
  /** Quando presente, habilita o botão de filtro no cabeçalho. */
  onFilterChange?: (value: string) => void;
}) {
  const active = sort?.key === sortKey;
  const [open, setOpen] = useState(false);
  const hasFilter = Boolean(filterValue);

  return (
    <TableHead
      className={cn(
        "whitespace-nowrap",
        numeric && "text-right",
        className,
      )}
      aria-sort={
        active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <span className={cn("inline-flex items-center gap-1", numeric && "justify-end")}>
        <span
          className={cn("inline-flex items-center gap-1", !numeric && "cursor-pointer select-none")}
          onClick={() => onSort(sortKey)}
          title="Ordenar"
        >
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
        {onFilterChange ? (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded hover:bg-accent",
                  hasFilter ? "text-primary" : "text-muted-foreground",
                )}
                onClick={(e) => e.stopPropagation()}
                title={`Filtrar por ${label}`}
              >
                <Filter className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              <Input
                autoFocus
                value={filterValue ?? ""}
                onChange={(e) => onFilterChange(e.target.value)}
                placeholder={`Filtrar ${label}...`}
                className="h-8"
              />
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-7 w-full justify-center text-muted-foreground"
                onClick={() => onFilterChange("")}
              >
                Limpar filtro
              </Button>
            </PopoverContent>
          </Popover>
        ) : null}
      </span>
    </TableHead>
  );
}
