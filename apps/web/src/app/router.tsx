import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, type RouteObject } from 'react-router';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from '@/features/auth/AuthProvider';
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/guards';
import { RouteError } from '@/routes/RouteError';

// Route-level code splitting. The encryption engine is only loaded inside the workspace.
const Landing = lazy(() => import('@/routes/Landing'));
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
const ChatPane = lazy(() => import('@/features/connect/ChatPane'));
const SettingsIndex = lazy(() =>
  import('@/features/settings/SettingsNav').then((m) => ({ default: m.SettingsIndex })),
);
const ProfileSettings = lazy(() => import('@/features/settings/EditProfilePage'));
const AccessibilitySettings = lazy(() => import('@/features/a11y/AccessibilityPage'));
const PrivacySettings = lazy(() => import('@/features/connect/PrivacyPage'));
const AccountSettings = lazy(() => import('@/features/settings/AccountSettingsPage'));
const LegacyInbox = lazy(() => import('@/features/messages/InboxPage'));
const LegacyConversation = lazy(() => import('@/features/messages/ConversationPage'));

function Lazy() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Outlet />
    </Suspense>
  );
}

function RootIndex() {
  const { session } = useAuth();
  if (session === undefined) return <PageSpinner />;
  return session ? <Navigate to="/messages" replace /> : <Landing />;
}

export const routes: RouteObject[] = [
  {
    element: <Lazy />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <RootIndex /> },
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
            element: <Workspace />,
            children: [
              { path: 'messages', element: <MessagesWelcome /> },
              { path: 'messages/privacy', element: <Navigate to="/settings/privacy" replace /> },
              { path: 'messages/legacy', element: <LegacyInbox /> },
              { path: 'messages/legacy/:conversationId', element: <LegacyConversation /> },
              { path: 'messages/:conversationId', element: <ChatPane /> },
              {
                path: 'settings',
                children: [
                  { index: true, element: <SettingsIndex /> },
                  { path: 'profile', element: <ProfileSettings /> },
                  { path: 'privacy', element: <PrivacySettings /> },
                  { path: 'accessibility', element: <AccessibilitySettings /> },
                  { path: 'account', element: <AccountSettings /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
