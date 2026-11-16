import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AuthContext, type AuthValue } from "./authContext";
import { clearSession, getSession, saveSession, type Session } from "./session";
import type { Account } from "./types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => getSession());

  const signIn = useCallback((next: Session) => {
    saveSession(next);
    setSession(next);
  }, []);

  const updateUser = useCallback((user: Account) => {
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, user };
      saveSession(next);
      return next;
    });
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user: session?.user ?? null, token: session?.token ?? null, signIn, updateUser, signOut }),
    [session, signIn, updateUser, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
