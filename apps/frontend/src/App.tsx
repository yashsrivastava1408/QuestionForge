import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import LandingPage from './pages/LandingPage';

// Console pages are loaded on demand, so the landing and login screens do not
// download the charting library and every admin screen up front.
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const GeneratePage = lazy(() => import('./pages/GeneratePage'));
const QuestionsPage = lazy(() => import('./pages/QuestionsPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const PapersPage = lazy(() => import('./pages/PapersPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
import './index.css';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Suspense fallback={<div className="page-body"><div className="skeleton" style={{ height: 160, borderRadius: 14 }} /></div>}>
                <Layout />
              </Suspense>
            </PrivateRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="generate" element={<GeneratePage />} />
          <Route path="questions" element={<QuestionsPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="papers" element={<PapersPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
