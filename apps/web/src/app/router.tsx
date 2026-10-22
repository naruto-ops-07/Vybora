import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { AppLockGate } from '@/features/applock/AppLockGate';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/guards';
import { RouteError } from '@/routes/RouteError';
import { PUBLIC_PAGES } from '@/site/meta';
import { LAZY_PAGES } from '@/site/routes';
import { SiteLayout } from '@/site/SiteLayout';

// Route-level code splitting. The encryption engine is only loaded inside the workspace.
const Login = lazy(() => import('@/routes/auth/Login'));
const Signup = lazy(() => import('@/routes/auth/Signup'));
const ForgotPassword = lazy(() => import('@/routes/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/routes/auth/ResetPassword'));
const AuthCallback = lazy(() => import('@/routes/auth/AuthCallback'));
const NotFound = lazy(() => import('@/routes/NotFound'));
const Workspace = lazy(() => import('@/features/connect/Workspace'));
const MessagesWelcome = lazy(() =>
  import('@/features/connect/Workspace').then((m) => ({ default: m.MessagesWelcome })),
);
const FriendsWelcome = lazy(() => import('@/features/friends/FriendsWelcome'));
const ChatPane = lazy(() => import('@/features/connect/ChatPane'));
const SettingsIndex = lazy(() =>
  import('@/features/settings/SettingsNav').then((m) => ({ default: m.SettingsIndex })),
);
const ProfileSettings = lazy(() => import('@/features/settings/EditProfilePage'));
const AccessibilitySettings = lazy(() => import('@/features/a11y/AccessibilityPage'));
const PrivacySettings = lazy(() => import('@/features/connect/PrivacyPage'));
const AccountSettings = lazy(() => import('@/features/settings/AccountSettingsPage'));
const AppearanceSettings = lazy(() => import('@/features/settings/AppearancePage'));
const LegacyInbox = lazy(() => import('@/features/messages/InboxPage'));
const LegacyConversation = lazy(() => import('@/features/messages/ConversationPage'));

function Lazy() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Outlet />
    </Suspense>
  );
}

const Home = LAZY_PAGES['/']!;

/** Signed in: your chats. Otherwise (and while the session is read) the homepage. */
function RootIndex() {
  const { session } = useAuth();
  if (session) return <Navigate to="/messages" replace />;
  return (
    <SiteLayout>
      <Home />
    </SiteLayout>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Lazy />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <RootIndex /> },
      // The public pages, also reachable from inside the app (the same chunks).
      {
        element: <SiteLayout />,
        children: PUBLIC_PAGES.filter((p) => p.path !== '/').map((p) => {
          const Page = LAZY_PAGES[p.path]!;
          return { path: p.path.slice(1), element: <Page /> };
        }),
      },
      { path: 'auth/callback', element: <AuthCallback /> },
      { path: 'reset-password', element: <ResetPassword /> },
      {
        element: <RedirectIfAuthed />,
        children: [
          { path: 'login', element: <Login /> },
          { path: 'signup', element: <Signup /> },
          { path: 'forgot-password', element: <ForgotPassword /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            // This device's app lock covers everything signed in.
            element: <AppLockGate />,
            children: [
              {
                element: <Workspace />,
                children: [
                  { path: 'messages', element: <MessagesWelcome /> },
                  {
                    path: 'messages/privacy',
                    element: <Navigate to="/settings/privacy" replace />,
                  },
                  { path: 'messages/legacy', element: <LegacyInbox /> },
                  { path: 'messages/legacy/:conversationId', element: <LegacyConversation /> },
                  { path: 'messages/:conversationId', element: <ChatPane /> },
                  { path: 'friends', element: <FriendsWelcome /> },
                  {
                    path: 'settings',
                    children: [
                      { index: true, element: <SettingsIndex /> },
                      { path: 'profile', element: <ProfileSettings /> },
                      { path: 'appearance', element: <AppearanceSettings /> },
                      { path: 'privacy', element: <PrivacySettings /> },
                      { path: 'accessibility', element: <AccessibilitySettings /> },
                      { path: 'account', element: <AccountSettings /> },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      // Dev-only design gallery. Vite replaces import.meta.env.DEV with `false` in
      // production builds, so this branch and the gallery chunk are dropped entirely.
      ...(import.meta.env.DEV
        ? [
            {
              path: '__gallery',
              lazy: async () => ({ Component: (await import('@/dev/gallery/Gallery')).default }),
            },
            {
              path: '__gallery/email-code',
              lazy: async () => ({
                Component: (await import('@/dev/gallery/EmailCodePreview')).default,
              }),
            },
          ]
        : []),
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
