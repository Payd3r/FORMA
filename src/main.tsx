import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from './app/components/layout/AppShell';
import { ToastProvider } from './app/components/ui/Toast';
import HomeRoute from './app/routes/home';
const WorkoutRoute = lazy(() => import('./app/routes/workout'));
const ProgressRoute = lazy(() => import('./app/routes/progress'));
const HistoryRoute = lazy(() => import('./app/routes/history'));
const SettingsRoute = lazy(() => import('./app/routes/settings'));
const PlansRoute = lazy(() => import('./app/routes/plans'));
import { initTheme } from './app/lib/theme';
import { registerPWA } from './app/lib/pwa';
import './styles/index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

initTheme();
registerPWA();

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <AppShell>
              <Suspense fallback={<div className="loading-state" role="status">Apro il tuo diario…</div>}>
              <Routes>
                <Route path="/" element={<HomeRoute />} />
                <Route path="/workout" element={<WorkoutRoute />} />
                <Route path="/workout/:sessionId" element={<WorkoutRoute />} />
                <Route path="/progress" element={<ProgressRoute />} />
                <Route path="/history" element={<HistoryRoute />} />
                <Route path="/settings" element={<SettingsRoute />} />
                <Route path="/plans" element={<PlansRoute />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              </Suspense>
            </AppShell>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

renderApp();
