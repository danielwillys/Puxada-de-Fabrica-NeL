import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { LoginPage } from "@/pages/auth/login";
import { FactoryPullDashboard } from "@/pages/dashboard/factory-pull";
import { OrdersPage } from "@/pages/orders";
import { OrderDetail } from "@/pages/orders/detail";
import { ImportPage } from "@/pages/import";
import { OperatorsPage } from "@/pages/operators";
import { PerformancePage } from "@/pages/performance";
import { ShiftsPage } from "@/pages/shifts";
import { SchedulesPage } from "@/pages/schedules";
import { UsersPage } from "@/pages/users";
import { RolesPage } from "@/pages/roles";
import { SettingsPage } from "@/pages/settings";
import { AuditPage } from "@/pages/audit";
import { RouteError } from "@/pages/route-error";
import NotFound from "./pages/NotFound";

export const routers = [
  {
    path: "/login",
    name: "login",
    element: <LoginPage />,
    errorElement: <RouteError />,
  },
  {
    path: "/signup",
    name: "signup",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: "dashboard",
        name: "dashboard",
        element: <FactoryPullDashboard />,
      },
      {
        path: "ordens",
        name: "ordens",
        element: <OrdersPage />,
      },
      {
        path: "ordens/:orderNumber",
        name: "ordem",
        element: <OrderDetail />,
      },
      {
        path: "importacao",
        name: "importacao",
        element: <ImportPage />,
      },
      {
        path: "performance",
        name: "performance",
        element: <PerformancePage />,
      },
      {
        path: "operadores",
        name: "operadores",
        element: <OperatorsPage />,
      },
      {
        path: "turnos",
        name: "turnos",
        element: <ShiftsPage />,
      },
      {
        path: "escalas",
        name: "escalas",
        element: <SchedulesPage />,
      },
      {
        path: "usuarios",
        name: "usuarios",
        element: <UsersPage />,
      },
      {
        path: "perfis",
        name: "perfis",
        element: <RolesPage />,
      },
      {
        path: "configuracoes",
        name: "configuracoes",
        element: <SettingsPage />,
      },
      {
        path: "auditoria",
        name: "auditoria",
        element: <AuditPage />,
      },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
