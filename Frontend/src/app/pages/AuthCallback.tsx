import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import api from '../../lib/axios';
import { useAuth, roleSlot } from '../../store/AuthContext';
import type { User } from '../../types/api';

function readHashTokens(): { accessToken: string | null; refreshToken: string | null } {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  return {
    accessToken: params.get('accessToken'),
    refreshToken: params.get('refreshToken'),
  };
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [message, setMessage] = useState('Completing Google sign-in...');

  useEffect(() => {
    async function completeSignIn() {
      // Prefer hash (new); fall back to query for in-flight redirects
      const fromHash = readHashTokens();
      const fromQuery = new URLSearchParams(window.location.search);
      const accessToken = fromHash.accessToken || fromQuery.get('accessToken');
      const refreshToken = fromHash.refreshToken || fromQuery.get('refreshToken');

      // Strip tokens from the address bar immediately
      window.history.replaceState(null, '', '/auth/callback');

      if (!accessToken || !refreshToken) {
        navigate('/login?error=google_auth_failed', { replace: true });
        return;
      }

      try {
        const { data } = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const user = data.data as User;
        const slot = roleSlot(user.role);

        sessionStorage.setItem('lms_tab_slot', slot);
        localStorage.setItem(`lms_refresh_token_${slot}`, refreshToken);
        setAuth(user, accessToken, refreshToken);
        navigate('/dashboard', { replace: true });
      } catch {
        setMessage('Google sign-in failed. Redirecting to login...');
        navigate('/login?error=google_auth_failed', { replace: true });
      }
    }

    void completeSignIn();
  }, [navigate, setAuth]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
      <p>{message}</p>
    </div>
  );
}
