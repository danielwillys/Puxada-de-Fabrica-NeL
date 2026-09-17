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
import type { ColumnOption, SortState } from "@/lib/sort";
import { cn } from "@/lib/utils";

/**
 * Cabeçalho de coluna com ordenação (crescente/decrescente) e filtro por texto
 * opcional. O estado da ordenação fica no pai; o filtro também (`filterValue` +
 * `onFilterChange`), aplicado via `applyColumnFilters`. O popover de filtro
 * mostra o campo de digitação e a lista de valores distintos da coluna.
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
  filterOptions,
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
  /** Valores distintos da coluna para listar no filtro. */
  filterOptions?: ColumnOption[];
}) {
  const active = sort?.key === sortKey;
  const [open, setOpen] = useState(false);
  const hasFilter = Boolean(filterValue);
  const options = filterOptions ?? [];

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
            <PopoverContent align="start" className="w-64 p-2">
              <Input
                autoFocus
                value={filterValue ?? ""}
                onChange={(e) => onFilterChange(e.target.value)}
                placeholder={`Filtrar ${label}...`}
                className="h-8"
              />
              {options.length > 0 ? (
                <div className="mt-2 max-h-48 overflow-auto rounded-md border">
                  {options.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      className={cn(
                        "block w-full truncate px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
                        filterValue === o.value &&
                          "bg-accent font-medium text-foreground",
                      )}
                      onClick={() => onFilterChange(o.value)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : null}
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
