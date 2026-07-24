import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider } from './store/AuthContext';
import { PermissionsProvider } from './store/PermissionsContext';
import { queryClient } from './lib/queryClient';
import App from './app/App';
import './styles/index.css';

// Only load React Query Devtools in development — excluded from production bundle
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({
        default: m.ReactQueryDevtools,
      }))
    )
  : null;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <PermissionsProvider>
            <App />
            <Toaster
              position="top-right"
              closeButton={false}
              duration={3400}
              visibleToasts={3}
              offset={16}
              gap={8}
              toastOptions={{
                unstyled: true,
                classNames: {
                  toast: 'lms-toast',
                  title: 'lms-toast-title',
                  description: 'lms-toast-desc',
                  success: 'lms-toast-success',
                  error: 'lms-toast-error',
                  info: 'lms-toast-info',
                  warning: 'lms-toast-warning',
                  icon: 'lms-toast-icon',
                },
              }}
            />
          </PermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  </StrictMode>,
);
