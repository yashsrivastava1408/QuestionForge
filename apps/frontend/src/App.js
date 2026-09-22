import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import GeneratePage from './pages/GeneratePage';
import QuestionsPage from './pages/QuestionsPage';
import ReviewPage from './pages/ReviewPage';
import PapersPage from './pages/PapersPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminPage from './pages/AdminPage';
import './index.css';
function PrivateRoute({ children }) {
    const { token } = useAuth();
    return token ? <>{children}</> : <Navigate to="/login" replace/>;
}
export default function App() {
    return (<AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />}/>
        <Route path="/" element={<PrivateRoute>
              <Layout />
            </PrivateRoute>}>
          <Route index element={<DashboardPage />}/>
          <Route path="generate" element={<GeneratePage />}/>
          <Route path="questions" element={<QuestionsPage />}/>
          <Route path="review" element={<ReviewPage />}/>
          <Route path="papers" element={<PapersPage />}/>
          <Route path="analytics" element={<AnalyticsPage />}/>
          <Route path="admin" element={<AdminPage />}/>
        </Route>
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </AuthProvider>);
}
//# sourceMappingURL=App.js.map