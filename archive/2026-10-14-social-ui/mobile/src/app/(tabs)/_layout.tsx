import { Feather } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import type { ColorValue } from 'react-native';
import { Loading } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const { session } = useAuth();
  const t = useTheme();
  if (session === undefined) return <Loading label="Restoring your session" />;
  // UX guard only — every request is still authorized by RLS on the server.
  if (!session) return <Redirect href="/login" />;

  const icon = (name: React.ComponentProps<typeof Feather>['name']) =>
    function TabIcon({ color }: { color: ColorValue }) {
      return <Feather name={name} size={24} color={color} />;
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.text,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarAccessibilityLabel: 'Home', tabBarIcon: icon('home') }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarAccessibilityLabel: 'Explore',
          tabBarIcon: icon('compass'),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarAccessibilityLabel: 'Create',
          tabBarIcon: icon('plus-square'),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          title: 'Reels',
          tabBarAccessibilityLabel: 'Reels',
          tabBarIcon: icon('film'),
          tabBarStyle: { backgroundColor: '#000', borderTopColor: '#111' },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile',
          tabBarIcon: icon('user'),
        }}
      />
    </Tabs>
  );
}
