import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Router as WouterRouter, Switch } from "wouter";
import type { AuthSession } from "@workspace/api-client-react";
import {
  configureApiClient,
  loadStoredApiBaseUrl,
  loadStoredSession,
  storeApiBaseUrl,
  storeSession,
} from "@/lib/auth";
import {
  applyColorTheme,
  loadStoredColorTheme,
  storeColorTheme,
  type WebColorThemePreference,
} from "@/lib/color-theme";
import { SessionContext } from "@/lib/session-context";
import AppShell from "@/components/AppShell";
import SignIn from "@/pages/SignIn";
import Dashboard from "@/pages/Dashboard";
import AddMatch from "@/pages/AddMatch";
import MatchDetail from "@/pages/MatchDetail";
import ChatPage from "@/pages/Chat";
import Settings from "@/pages/Settings";
import ImprovementControlRoom from "@/pages/ImprovementControlRoom";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppRoutes() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/add" component={AddMatch} />
        <Route path="/matches/:id" component={MatchDetail} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/improvements" component={ImprovementControlRoom} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [apiBaseUrl, setApiBaseUrlState] = useState<string | null>(() => loadStoredApiBaseUrl());
  const [colorTheme, setColorThemeState] = useState<WebColorThemePreference>(() =>
    loadStoredColorTheme(),
  );

  useEffect(() => {
    configureApiClient(session, apiBaseUrl);
  }, [session, apiBaseUrl]);

  useEffect(() => {
    applyColorTheme(colorTheme);
  }, [colorTheme]);

  const contextValue = useMemo(
    () => ({
      session,
      apiBaseUrl,
      colorTheme,
      signIn(nextSession: AuthSession) {
        storeSession(undefined, nextSession);
        setSession(nextSession);
        configureApiClient(nextSession, apiBaseUrl);
      },
      signOut() {
        storeSession(undefined, null);
        queryClient.clear();
        setSession(null);
      },
      setApiBaseUrl(value: string | null) {
        const normalized = storeApiBaseUrl(undefined, value);
        setApiBaseUrlState(normalized);
        configureApiClient(session, normalized);
      },
      setColorTheme(value: WebColorThemePreference) {
        storeColorTheme(undefined, value);
        setColorThemeState(value);
        applyColorTheme(value);
      },
    }),
    [apiBaseUrl, colorTheme, session],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SessionContext.Provider value={contextValue}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {session ? <AppRoutes /> : <SignIn />}
        </WouterRouter>
      </SessionContext.Provider>
    </QueryClientProvider>
  );
}

export default App;
