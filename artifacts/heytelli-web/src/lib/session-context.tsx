import { createContext, useContext } from "react";
import type { AuthSession } from "@workspace/api-client-react";

export interface SessionContextValue {
  session: AuthSession | null;
  apiBaseUrl: string | null;
  signIn: (session: AuthSession) => void;
  signOut: () => void;
  setApiBaseUrl: (value: string | null) => void;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside SessionContext.Provider");
  }
  return value;
}
