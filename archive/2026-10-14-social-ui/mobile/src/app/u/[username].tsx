import { Stack, useLocalSearchParams } from 'expo-router';
import { ProfileScreen } from '@/features/profile/ProfileScreen';

export default function UserProfile() {
  const { username = '' } = useLocalSearchParams<{ username: string }>();
  return (
    <>
      <Stack.Screen options={{ title: username }} />
      <ProfileScreen username={username} />
    </>
  );
}
