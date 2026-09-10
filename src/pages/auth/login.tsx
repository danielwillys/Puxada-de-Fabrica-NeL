import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/context/auth-context";
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

export function LoginPage() {
  const { signIn, profile, initialized } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initialized && profile) {
    return <Navigate to={params.get("next") || "/dashboard"} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      setError("Não foi possível entrar. Verifique o e-mail e a senha.");
    } else {
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
            {error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Entrar
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Ainda não tem acesso?{" "}
              <a
                href="/signup"
                className="font-medium text-primary hover:underline"
              >
                Criar conta
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
