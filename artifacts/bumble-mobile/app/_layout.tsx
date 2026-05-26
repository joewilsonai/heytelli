import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getApiBaseUrl } from "@/lib/api-base";
import {
  type AuthSession,
  getAuthToken,
  loadAuthSession,
  loginBetaUser,
} from "@/lib/auth-session";
import { useColors } from "@/hooks/useColors";

// API base URL — Expo bundles run outside the web proxy and need an absolute URL.
// Hard-fail fast in dev if missing so the broken state is visible (vs. silent
// relative-URL fetches that fail with confusing errors).
const apiBaseUrl = getApiBaseUrl();
if (!apiBaseUrl) {
  console.error(
    "EXPO_PUBLIC_API_BASE_URL or EXPO_PUBLIC_DOMAIN is not set. API requests will fail. " +
      "This env var should be injected by the workflow script.",
  );
} else {
  setBaseUrl(apiBaseUrl);
}
setAuthTokenGetter(getAuthToken);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function RootLayoutNav() {
  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
        headerStyle: { backgroundColor: "#FBF8F2" },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="match/[id]"
        options={{ title: "", headerTransparent: true }}
      />
      <Stack.Screen
        name="add"
        options={{
          title: "Add connection",
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="add/shared"
        options={{
          title: "Import screenshots",
          presentation: "modal",
        }}
      />
      <Stack.Screen name="chat/index" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: "Chat" }} />
      <Stack.Screen name="trust" options={{ title: "Trust Center" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
    </Stack>
  );
}

function BetaSignInScreen({
  onSignedIn,
}: {
  onSignedIn: (session: AuthSession) => void;
}) {
  const c = useColors();
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const session = await loginBetaUser({
        email,
        inviteCode,
        displayName: displayName.trim() || undefined,
      });
      onSignedIn(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Try again.";
      Alert.alert("Couldn't sign in", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.background,
        padding: 24,
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: c.foreground,
          fontFamily: "Inter_700Bold",
          fontSize: 32,
          lineHeight: 38,
          marginBottom: 8,
        }}
      >
        HeyTelli beta
      </Text>
      <Text
        style={{
          color: c.mutedForeground,
          fontFamily: "Inter_400Regular",
          fontSize: 15,
          lineHeight: 22,
          marginBottom: 28,
        }}
      >
        Private access for early testers.
      </Text>
      <View style={{ gap: 12 }}>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="First name"
          placeholderTextColor={c.mutedForeground}
          autoCapitalize="words"
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
            color: c.foreground,
            backgroundColor: c.card,
            fontFamily: "Inter_400Regular",
            fontSize: 16,
          }}
        />
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={c.mutedForeground}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
            color: c.foreground,
            backgroundColor: c.card,
            fontFamily: "Inter_400Regular",
            fontSize: 16,
          }}
        />
        <TextInput
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="Invite code"
          placeholderTextColor={c.mutedForeground}
          autoCapitalize="none"
          secureTextEntry
          style={{
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 14,
            color: c.foreground,
            backgroundColor: c.card,
            fontFamily: "Inter_400Regular",
            fontSize: 16,
          }}
        />
        <Pressable
          onPress={submit}
          disabled={submitting || !email.trim() || !inviteCode.trim()}
          style={({ pressed }) => ({
            height: 52,
            borderRadius: 18,
            backgroundColor:
              submitting || !email.trim() || !inviteCode.trim()
                ? c.muted
                : c.primary,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 8,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          {submitting ? (
            <ActivityIndicator color={c.primaryForeground} />
          ) : (
            <Text
              style={{
                color: c.primaryForeground,
                fontFamily: "Inter_700Bold",
                fontSize: 16,
              }}
            >
              Sign in
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadAuthSession()
      .then((stored) => {
        if (mounted) setSession(stored);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!session) {
    return (
      <BetaSignInScreen
        onSignedIn={(nextSession) => {
          queryClient.clear();
          setSession(nextSession);
        }}
      />
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <KeyboardProvider>
              <StatusBar style="auto" />
              <AuthGate>
                <RootLayoutNav />
              </AuthGate>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
