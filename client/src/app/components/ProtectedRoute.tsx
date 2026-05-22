import { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../store/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
