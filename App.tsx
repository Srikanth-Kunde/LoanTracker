import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
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
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Reports = lazy(() => import('./pages/Reports'));
const SpecialLoans = lazy(() => import('./pages/SpecialLoans'));
const AuditReport = lazy(() => import('./pages/AuditReport'));

// Wrapper component to handle login state
const AppRoutes: React.FC = () => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <HashRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="special-loans" element={<SpecialLoans />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit" element={<AuditReport />} />
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