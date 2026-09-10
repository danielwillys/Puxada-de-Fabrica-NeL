import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RouteError() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-lg font-semibold">Ocorreu um erro inesperado.</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Algo deu errado ao carregar esta página. Recarregue ou volte ao início.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <Button onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" />
          Recarregar
        </Button>
        <Link to="/dashboard" className="text-sm font-medium text-primary hover:underline">
          Ir para o Dashboard
        </Link>
      </div>
    </div>
  );
}
