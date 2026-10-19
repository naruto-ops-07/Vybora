// Must run before anything touches crypto (Connect E2EE).
import '@/lib/connect/polyfills';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isRetryable } from '@vybora/core';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { ConnectProvider } from '@/features/connect/ConnectProvider';
import { A11yProvider, useA11y } from '@/lib/a11y';
import { AppearanceProvider, useAppearance } from '@/lib/appearance';
import { envOk, envProblems } from '@/lib/env';
import { registerForPush } from '@/lib/push';
import { useTheme } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

// Refetch stale queries when the app returns to the foreground.
AppState.addEventListener('change', (state) => {
  focusManager.setFocused(state === 'active');
});

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_SEGMENTS = new Set(['(auth)', 'auth']);

function Navigator() {
  const { session, userId } = useAuth();
  const segments = useSegments();
  const t = useTheme();

  useEffect(() => {
    if (session !== undefined) void SplashScreen.hideAsync();
  }, [session]);

  // UX guard only — every request is still authorized by RLS on the server.
  useEffect(() => {
    if (session === undefined) return;
    const isPublic = PUBLIC_SEGMENTS.has(segments[0] ?? '');
    if (!session && !isPublic) router.replace('/login');
  }, [session, segments]);

  // Push registration is guarded for Expo Go inside lib/push.ts.
  useEffect(() => {
    if (userId) void registerForPush().catch(() => undefined);
  }, [userId]);

  return (
    <ThemeProvider value={t.dark ? DarkTheme : DefaultTheme}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: t.text,
          headerStyle: { backgroundColor: t.panel.startsWith('#') ? t.panel : t.surface },
          headerTitleStyle: { fontFamily: t.fonts.display, fontSize: 17 },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="messages/index" options={{ headerShown: false }} />
        <Stack.Screen name="messages/[id]" options={{ title: '' }} />
        <Stack.Screen name="messages/new" options={{ title: 'New chat', presentation: 'modal' }} />
        <Stack.Screen name="messages/details/[id]" options={{ title: 'Chat info' }} />
        <Stack.Screen name="messages/verify/[userId]" options={{ title: 'Safety number' }} />
        <Stack.Screen name="messages/friends" options={{ title: 'Friends' }} />
        <Stack.Screen name="messages/privacy" options={{ title: 'Privacy & security' }} />
        <Stack.Screen name="messages/accessibility" options={{ title: 'Accessibility' }} />
        <Stack.Screen name="messages/appearance" options={{ title: 'Appearance' }} />
        <Stack.Screen name="messages/legacy/[id]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

function SetupRequired() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <ScrollView contentContainerStyle={{ padding: 32, paddingTop: 96, gap: 12 }}>
      <Text variant="title">Configuration required</Text>
      <Text variant="muted">
        Copy apps/mobile/.env.example to apps/mobile/.env and set your Supabase project values, then
        restart Expo.
      </Text>
      <View style={{ gap: 6, marginTop: 12 }}>
        {envProblems.map((problem) => (
          <Text key={problem} variant="mono" style={{ color: '#B42318' }}>
            {problem}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

/**
 * Holds the splash screen until the stored appearance, its look's fonts and the
 * accessibility settings are loaded, so the first paint is already the right look,
 * mode, face and contrast.
 */
function AppearanceGate({ children }: { children: ReactNode }) {
  const { ready } = useAppearance();
  const a11y = useA11y();
  if (!ready || !a11y.ready) return null; // splash screen stays up
  return children;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (attempt, error) => attempt < 2 && isRetryable(error),
          },
          mutations: { retry: false },
        },
      }),
  );
  // Only the active look's fonts (plus mono) load at startup; on failure the system
  // font is used and text stays readable.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <A11yProvider>
        <AppearanceProvider>
          <AppearanceGate>
            <SafeAreaProvider>
              {envOk ? (
                <QueryClientProvider client={queryClient}>
                  <AuthProvider>
                    <ConnectProvider>
                      <Navigator />
                    </ConnectProvider>
                  </AuthProvider>
                </QueryClientProvider>
              ) : (
                <SetupRequired />
              )}
            </SafeAreaProvider>
          </AppearanceGate>
        </AppearanceProvider>
      </A11yProvider>
    </GestureHandlerRootView>
  );
}
