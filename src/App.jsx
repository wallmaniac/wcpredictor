import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { CompetitionProvider } from './context/CompetitionContext';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

const ProtectedRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return <div className="page-wrapper container" style={{textAlign: 'center', marginTop: '100px'}}>Loading...</div>;
  if (!currentUser) return <Navigate to="/" replace />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (currentUser) return <Navigate to="/dashboard" replace />;
  return children;
};

export default function App() {
  return (
    <LanguageProvider>
      <CompetitionProvider>
        <AuthProvider>
          <BrowserRouter>
            <div className="app-container">
              <Navbar />
              <Routes>
                <Route path="/" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              </Routes>
            </div>
          </BrowserRouter>
        </AuthProvider>
      </CompetitionProvider>
    </LanguageProvider>
  );
}
