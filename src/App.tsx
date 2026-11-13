import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { useRoute } from "@/lib/router";
import { GENERIC_PAGES, firstAccessibleRoute } from "@/lib/resources";
import { AppShell } from "@/components/AppShell";
import { Loading } from "@/components/states";
import { Toaster } from "@/components/ui/sonner";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { ResourcePage } from "@/pages/ResourcePage";
import { Pnl } from "@/pages/Pnl";
import { Reconciliation } from "@/pages/Reconciliation";
import { SalaryLiabilities } from "@/pages/SalaryLiabilities";
import { Users } from "@/pages/Users";
import { Audit } from "@/pages/Audit";
import { NotFound } from "@/pages/NotFound";

function Page({ path }: { path: string }) {
  const { permissions } = useAuth();
  const resolved = path === "/" ? firstAccessibleRoute(permissions) : path;
  const key = resolved.replace(/^\//, "");
  if (resolved === "/dashboard") return <Dashboard />;
  if (GENERIC_PAGES.includes(key)) return <ResourcePage resource={key} />;
  switch (resolved) {
    case "/pnl": return <Pnl />;
    case "/reconciliation": return <Reconciliation />;
    case "/salary-liabilities": return <SalaryLiabilities />;
    case "/users": return <Users />;
    case "/audit": return <Audit />;
    default: return <NotFound />;
  }
}

function Router() {
  const { status } = useAuth();
  const path = useRoute();

  useEffect(() => { window.scrollTo(0, 0); }, [path]);

  if (status === "loading") {
    return <div className="flex min-h-dvh items-center justify-center"><Loading label="Starting ConnecTEL…" /></div>;
  }
  if (status === "anon") return <Login />;
  return <AppShell><Page path={path} /></AppShell>;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
      <Toaster richColors position="top-right" closeButton />
    </AuthProvider>
  );
}