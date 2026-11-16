import { createContext } from "react";
import type { Session } from "./session";
import type { Account } from "./types";

export interface AuthValue {
  user: Account | null;
  token: string | null;
  // Store the token and user from a login or email verification
  signIn: (session: Session) => void;
  // Replace the stored user after a profile change
  updateUser: (user: Account) => void;
  signOut: () => void;
}

export const AuthContext = createContext<AuthValue | null>(null);
