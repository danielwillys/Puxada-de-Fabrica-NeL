import { useState } from "react";
import { HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface InfoItem {
  term: string;
  definition: string;
}

/**
 * Botão "?" que abre um pop-up de ajuda ao lado do título de um card.
 * Explica cada métrica do card; fecha ao clicar fora.
 */
export function InfoPopover({
  title = "Entenda as métricas",
  items,
  className,
}: {
  title?: string;
  items: InfoItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Ajuda"
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-80 max-w-[90vw] p-4 text-sm"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{title}</p>
          {items.map((it) => (
            <div key={it.term} className="flex flex-col gap-0.5">
              <p className="text-xs font-medium text-primary">{it.term}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {it.definition}
              </p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
