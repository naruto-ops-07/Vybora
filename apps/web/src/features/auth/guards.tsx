import { Navigate, Outlet, useLocation } from 'react-router';
import { PageSpinner } from '@/components/ui/Spinner';
import { useAuth } from './AuthProvider';

/**
 * UX-only route guard. Security is enforced by RLS and server functions; a
 * user who bypasses this guard still cannot read or write protected data.
 */
export function RequireAuth() {
  const { session } = useAuth();
  const location = useLocation();
  if (session === undefined) return <PageSpinner label="Restoring your session" />;
  if (!session)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  return <Outlet />;
}

export function RedirectIfAuthed() {
  const { session } = useAuth();
  if (session === undefined) return <PageSpinner />;
  if (session) return <Navigate to="/messages" replace />;
  return <Outlet />;
}
