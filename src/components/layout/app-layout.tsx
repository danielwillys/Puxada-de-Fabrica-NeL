import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  CalendarDays,
  ClipboardList,
  Clock,
  FileUp,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserRoundCog,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { ROLE_LABEL } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Permissão necessária para exibir o item (quando não admin). */
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard" },
  { to: "/ordens", label: "Ordens de Produção", icon: ClipboardList, permission: "orders" },
  { to: "/performance", label: "Performance", icon: Gauge, permission: "performance" },
  { to: "/importacao", label: "Importação de Dados", icon: FileUp, permission: "import" },
  { to: "/operadores", label: "Operadores", icon: Users, permission: "operators" },
  { to: "/turnos", label: "Turnos", icon: Clock, permission: "shifts" },
  { to: "/escalas", label: "Escalas", icon: CalendarDays, permission: "schedules" },
  { to: "/usuarios", label: "Usuários", icon: UserRoundCog, permission: "users" },
  { to: "/perfis", label: "Perfis e Permissões", icon: UsersRound, permission: "roles" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, permission: "settings" },
  { to: "/auditoria", label: "Auditoria", icon: ShieldCheck, permission: "audit" },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, permissions } = useAuth();
  const isAdmin = profile?.role === "admin";
  const items = NAV_ITEMS.filter(
    (i) => isAdmin || permissions.includes("*") || (i.permission && permissions.includes(i.permission)),
  );
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-primary"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img
        src="/logo.png"
        alt="Puxada de Fábrica N&L"
        className="h-9 w-9 rounded-lg object-cover"
      />
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-wide text-sidebar-foreground">
          Puxada de Fábrica N&L
        </p>
        <p className="text-[11px] text-sidebar-foreground/60">
          Operação & Rastreabilidade
        </p>
      </div>
    </div>
  );
}

function SidebarFooter() {
  const { profile, signOut } = useAuth();
  return (
    <div className="border-t border-sidebar-border pt-3">
      <div className="flex items-center justify-between gap-2 px-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-sidebar-foreground">
            {profile?.name || profile?.email}
          </p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            {ROLE_LABEL(profile?.role ?? "operator")}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          onClick={() => signOut()}
          title="Sair"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { profile, initialized } = useAuth();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!initialized) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!profile) {
    // Not signed in: bounce to login, preserving the intended destination.
    const next = encodeURIComponent(location.pathname + location.search);
    window.location.href = `/login?next=${next}`;
    return null;
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col gap-6 bg-sidebar p-4 lg:flex">
        <Brand />
        <div className="flex-1">
          <NavList />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-4 text-sidebar-foreground">
          <SheetTitle className="text-sidebar-foreground">
            <Brand />
          </SheetTitle>
          <div className="mt-6 flex flex-col gap-1">
            <NavList onNavigate={() => setMobileOpen(false)} />
          </div>
          <div className="mt-6">
            <SidebarFooter />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-muted-foreground">
              Operação em tempo real
            </Badge>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {profile?.name || profile?.email}
            </span>
            <Badge variant={profile?.role === "admin" ? "info" : "secondary"}>
              {ROLE_LABEL(profile?.role ?? "operator")}
            </Badge>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
