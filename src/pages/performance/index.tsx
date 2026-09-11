import { BarChart3, Gauge, UserRound } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilters } from "@/context/filters-context";
import { ShiftPerformanceView } from "./shift-view";
import { OperatorPerformanceView } from "./operator-view";
import { ProductivityView } from "./productivity-view";

export function PerformancePage() {
  const { filters, debounced, setFilters } = useFilters();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Performance da Operação</h1>
        <p className="text-sm text-muted-foreground">
          Análise por turno, por operador e produtividade do depósito
        </p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} showShiftFilters />

      <Tabs defaultValue="shift">
        <TabsList className="flex w-full flex-wrap justify-start sm:w-auto">
          <TabsTrigger value="shift" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Por turno
          </TabsTrigger>
          <TabsTrigger value="operator" className="gap-1.5">
            <UserRound className="h-4 w-4" />
            Por operador
          </TabsTrigger>
          <TabsTrigger value="productivity" className="gap-1.5">
            <Gauge className="h-4 w-4" />
            Produtividade
          </TabsTrigger>
        </TabsList>

        <TabsContent value="shift">
          <ShiftPerformanceView filters={debounced} />
        </TabsContent>
        <TabsContent value="operator">
          <OperatorPerformanceView filters={debounced} />
        </TabsContent>
        <TabsContent value="productivity">
          <ProductivityView filters={debounced} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
