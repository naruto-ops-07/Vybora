// Must run before anything touches crypto (Connect E2EE).
import '@/lib/connect/polyfills';
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isRetryable } from '@vybora/core';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { ConnectProvider } from '@/features/connect/ConnectProvider';
import { A11yProvider } from '@/lib/a11y';
import { envOk, envProblems } from '@/lib/env';
import { registerForPush } from '@/lib/push';
import { font, useTheme } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

// Refetch stale queries when the app returns to the foreground.
AppState.addEventListener('change', (state) => {
  focusManager.setFocused(state === 'active');
});

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_SEGMENTS = new Set(['(auth)', 'auth']);

function Navigator({ fontsReady }: { fontsReady: boolean }) {
  const { session, userId } = useAuth();
  const segments = useSegments();
  const t = useTheme();

  useEffect(() => {
    if (session !== undefined && fontsReady) void SplashScreen.hideAsync();
  }, [session, fontsReady]);

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
          headerStyle: { backgroundColor: t.surface },
          headerTitleStyle: { fontFamily: font.semibold, fontSize: 17 },
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
  // Bundled fonts; on failure the system font is used (text stays readable).
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });
  const fontsReady = fontsLoaded || !!fontError;
  if (!fontsReady) return null; // splash screen stays up

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <A11yProvider>
        <SafeAreaProvider>
          {envOk ? (
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <ConnectProvider>
                  <Navigator fontsReady={fontsReady} />
                </ConnectProvider>
              </AuthProvider>
            </QueryClientProvider>
          ) : (
            <SetupRequired />
          )}
        </SafeAreaProvider>
      </A11yProvider>
    </GestureHandlerRootView>
  );
}
