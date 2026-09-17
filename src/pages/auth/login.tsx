import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useSecuritySettings } from "@/lib/security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ATTEMPTS_KEY = "converge.login.attempts";
const LOCK_KEY = "converge.login.lockuntil";

export function LoginPage() {
  const { signIn, profile, initialized } = useAuth();
  const security = useSecuritySettings();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(() =>
    Number(localStorage.getItem(ATTEMPTS_KEY) ?? "0"),
  );
  const [lockUntil, setLockUntil] = useState(() =>
    Number(localStorage.getItem(LOCK_KEY) ?? "0"),
  );

  useEffect(() => {
    localStorage.setItem(ATTEMPTS_KEY, String(attempts));
  }, [attempts]);
  useEffect(() => {
    localStorage.setItem(LOCK_KEY, String(lockUntil));
  }, [lockUntil]);

  const maxAttempts = security.data?.maxAttempts ?? 0;
  const lockMinutes = security.data?.lockMinutes ?? 0;
  const locked = lockUntil > Date.now();
  const lockSecondsLeft = locked ? Math.ceil((lockUntil - Date.now()) / 1000) : 0;

  if (initialized && profile) {
    return <Navigate to={params.get("next") || "/dashboard"} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setLoading(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      if (maxAttempts > 0) {
        const next = attempts + 1;
        if (next >= maxAttempts) {
          const until =
            Date.now() + (lockMinutes > 0 ? lockMinutes : 5) * 60_000;
          setLockUntil(until);
          setAttempts(0);
          setError("Muitas tentativas. Acesso temporariamente bloqueado.");
          return;
        }
        setAttempts(next);
      }
      setError("Não foi possível entrar. Verifique o e-mail e a senha.");
    } else {
      setAttempts(0);
      setLockUntil(0);
      navigate(params.get("next") || "/dashboard", { replace: true });
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-primary/15 via-background to-primary/10 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img
            src="/logo.png"
            alt="Puxada de Fábrica N&L"
            className="mb-1 h-14 w-14 rounded-xl object-cover"
          />
          <CardTitle className="text-xl">Puxada de Fábrica N&L</CardTitle>
          <CardDescription>
            Puxada de Fábrica · Armazenagem · Rastreabilidade
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.com.br"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {locked ? (
              <p className="text-sm text-danger">
                Acesso temporariamente bloqueado por excesso de tentativas. Tente
                novamente em {lockSecondsLeft} s.
              </p>
            ) : error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading || locked}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Entrar
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Acesso liberado pela administração do sistema.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
