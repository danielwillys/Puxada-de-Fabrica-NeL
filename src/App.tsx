import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/context/auth-context";
import { FiltersProvider } from "@/context/filters-context";
import { usePalette } from "@/hooks/use-palette";
import { routers } from "./router";

const queryClient = new QueryClient();

function PaletteApplier() {
  usePalette();
  return null;
}

const App = () => {
  const router = createBrowserRouter(routers);
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <PaletteApplier />
        <FiltersProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <RouterProvider router={router} />
          </TooltipProvider>
        </FiltersProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
};

export default App;
