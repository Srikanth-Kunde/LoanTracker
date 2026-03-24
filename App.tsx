import React, { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { SettingsProvider } from './context/SettingsContext';
import { MemberProvider } from './context/MemberContext';
import { FinancialProvider } from './context/FinancialContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuditLogProvider } from './context/AuditLogContext';
import { LoginScreen } from './components/LoginScreen';
import Layout from './components/Layout';
import LoadingSpinner from './components/LoadingSpinner';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy load pages for performance (Code Splitting)
const SpecialLoans = lazy(() => import('./pages/SpecialLoans'));
const AuditReport = lazy(() => import('./pages/AuditReport'));
const AuditLogHistory = lazy(() => import('./pages/AuditLogHistory'));
const SettingsPage = lazy(() => import('./pages/Settings.tsx'));
const Members = lazy(() => import('./pages/Members'));
const ImportData = lazy(() => import('./pages/ImportData.tsx'));


// Wrapper component to handle login state
const AppRoutes: React.FC = () => {
  const { isAuthenticated, role } = useAuth();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <HashRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<SpecialLoans />} />
            <Route path="special-loans" element={<SpecialLoans />} />
            <Route path="members" element={<Members />} />
            <Route path="audit" element={<AuditReport />} />
            <Route path="audit-log" element={role === 'ADMIN' ? <AuditLogHistory /> : <Navigate to="/" replace />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="import" element={<ImportData />} />

          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <MemberProvider>
          <FinancialProvider>
              <AuthProvider>
                <AuditLogProvider>
                  <AppRoutes />
                </AuditLogProvider>
              </AuthProvider>
          </FinancialProvider>
        </MemberProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
};

export default App;
