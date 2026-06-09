import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { CompetitionProvider } from './context/CompetitionContext';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';

/* global __APP_VERSION__ */

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
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const res = await fetch(`/version.txt?t=${Date.now()}`);
        if (res.ok) {
          const serverVersion = (await res.text()).trim();
          const localVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
          if (serverVersion && localVersion && serverVersion !== localVersion) {
            console.log(`[PWA Update] New version detected: Server=${serverVersion}, Local=${localVersion}. Reloading...`);
            const lastReload = localStorage.getItem('last_version_reload');
            if (lastReload !== serverVersion) {
              localStorage.setItem('last_version_reload', serverVersion);
              window.location.reload(true);
            }
          }
        }
      } catch (e) {
        console.error("Failed to check version updates", e);
      }
    };
    checkUpdate();
    window.addEventListener('focus', checkUpdate);
    return () => window.removeEventListener('focus', checkUpdate);
  }, []);

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
