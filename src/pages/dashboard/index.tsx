import { useSearchParams } from "react-router-dom";
import { LayoutDashboard, Workflow } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ManagerialDashboard } from "./gerencial";
import { OperationalDashboard } from "./operacional";

/**
 * Dashboard único com duas abas: Visão Gerencial e Visão Operacional.
 * A aba ativa fica na URL (?tab=operacional), então o link é compartilhável
 * e a rota antiga /dashboard/operacional continua funcionando (redireciona).
 */
export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "operacional" ? "operacional" : "gerencial";

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params);
          if (v === "gerencial") next.delete("tab");
          else next.set("tab", v);
          setParams(next, { replace: true });
        }}
      >
        <TabsList className="h-auto w-fit p-1">
          <TabsTrigger value="gerencial" className="gap-2 px-4 py-2">
            <LayoutDashboard className="h-4 w-4" /> Visão Gerencial
          </TabsTrigger>
          <TabsTrigger value="operacional" className="gap-2 px-4 py-2">
            <Workflow className="h-4 w-4" /> Visão Operacional
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gerencial" className="mt-4">
          <ManagerialDashboard />
        </TabsContent>
        <TabsContent value="operacional" className="mt-4">
          <OperationalDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
