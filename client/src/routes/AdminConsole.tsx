import { Navigate } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import { Spinner } from '@librechat/client';
import { useAuthContext } from '~/hooks';
import AdminConsoleView from '~/components/Admin/AdminConsoleView';

export default function AdminConsole() {
  const { isAuthenticated, user } = useAuthContext();

  // Show loading spinner while authentication is in progress
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center" aria-live="polite" role="status">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  // Wait for user data to load after authentication
  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center" aria-live="polite" role="status">
        <Spinner className="text-text-primary" />
      </div>
    );
  }

  // Check admin role
  if (user.role !== SystemRoles.ADMIN) {
    return <Navigate to="/" replace />;
  }

  return <AdminConsoleView />;
}
