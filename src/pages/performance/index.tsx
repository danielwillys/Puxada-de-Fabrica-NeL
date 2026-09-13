import { BarChart3, Gauge, UserRound } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import { InfoPopover } from "@/components/info-popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFilters } from "@/context/filters-context";
import { ShiftPerformanceView } from "./shift-view";
import { OperatorPerformanceView } from "./operator-view";
import { ProductivityView } from "./productivity-view";

export function PerformancePage() {
  const { filters, debounced, setFilters } = useFilters();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Performance da Operação</h1>
          <p className="text-sm text-muted-foreground">
            Análise por turno, por operador e produtividade do depósito
          </p>
        </div>
        <InfoPopover
          title="Entenda as métricas"
          items={[
            {
              term: "Paletes puxados / armazenados",
              definition:
                "Contagem de tarefas MON: 1020 = puxada (autor) e 1012 = armazenagem (confirmado por). O sistema vincula o operador sempre que o nome casa, então os totais batem com o relatório real.",
            },
            {
              term: "Tempo médio",
              definition:
                "Média do tempo entre puxada e armazenagem de cada palete, pareados por lote (FIFO). Só existe para quem tem pares puxada→armazenagem.",
            },
            {
              term: "P90",
              definition:
                "Percentil 90 do tempo puxada→armazenagem: em quanto tempo 90% dos paletes foram armazenados. É a medida de 'o pior dos 90%' — menos sensível a picos do que a média.",
            },
            {
              term: "% SLA",
              definition:
                "Percentual de paletes armazenados dentro do tempo alvo (configurável em Configurações, hoje 30 min). Mede o nível de serviço: quanto maior, mais rápido o depósito armazenou.",
            },
            {
              term: "Sem turno (não classificado)",
              definition:
                "Tarefas que existem no período mas não caem na janela de horário de nenhum turno alocado. Elas são contadas nos totais para não haver divergência com a planilha.",
            },
          ]}
        />
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
