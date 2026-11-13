// Application auth state. The session lives in an HttpOnly cookie; this context
// only holds the resolved user + the server's permission matrix. UI gates use
// can(module, action) so client and server never disagree.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Action, Meta, Module, Permissions, User } from "@/lib/types";

type Status = "loading" | "authed" | "anon";

interface AuthValue {
  status: Status;
  user: User | null;
  permissions: Permissions | null;
  meta: Meta | null;
  can: (module: Module, action: Action) => boolean;
  login: (username: string, password: string) => Promise<Permissions | null>;
  logout: () => Promise<void>;
  refresh: () => Promise<Permissions | null>;
}

const AuthContext = createContext<AuthValue | null>(null);

const EMPTY_META: Meta = {
  payment_methods: [], income_types: [], expense_categories: [], stock_tx_types: [],
  ledger_entry_types: [], salary_kinds: [], followup_statuses: [],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  const loadSession = useCallback(async (): Promise<Permissions | null> => {
    try {
      const me = await api.me();
      setUser(me.user);
      setPermissions(me.permissions);
      setStatus("authed");
      try {
        setMeta(await api.meta());
      } catch {
        setMeta(EMPTY_META);
      }
      return me.permissions;
    } catch {
      setUser(null);
      setPermissions(null);
      setStatus("anon");
      return null;
    }
  }, []);

  useEffect(() => {
    void loadSession();
    const onUnauthorized = () => {
      setUser(null);
      setPermissions(null);
      setStatus("anon");
    };
    window.addEventListener("app:unauthorized", onUnauthorized);
    return () => window.removeEventListener("app:unauthorized", onUnauthorized);
  }, [loadSession]);

  const login = useCallback(async (username: string, password: string): Promise<Permissions | null> => {
    await api.login(username, password);
    return await loadSession();
  }, [loadSession]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setPermissions(null);
      setStatus("anon");
      window.location.hash = "/";
    }
  }, []);

  const can = useCallback(
    (module: Module, action: Action) => Boolean(permissions?.[module]?.includes(action)),
    [permissions],
  );

  const value = useMemo<AuthValue>(
    () => ({ status, user, permissions, meta, can, login, logout, refresh: loadSession }),
    [status, user, permissions, meta, can, login, logout, loadSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}