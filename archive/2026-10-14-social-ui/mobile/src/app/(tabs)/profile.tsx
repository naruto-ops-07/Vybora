import { SafeAreaView } from 'react-native-safe-area-context';
import { Loading } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { useTheme } from '@/lib/theme';

export default function MyProfile() {
  const { profile } = useAuth();
  const t = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.surface }}>
      {profile ? <ProfileScreen username={profile.username} isTab /> : <Loading />}
    </SafeAreaView>
  );
}
