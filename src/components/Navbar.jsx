import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage, LanguageSwitcher } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import { auth } from '../config/firebase';
import { signOut } from 'firebase/auth';

export default function Navbar() {
  const { currentUser, isAdmin, userProfile } = useAuth();
  const { t, lang } = useLanguage();
  const { competition, switchCompetition, COMPETITIONS } = useCompetition();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setMobileMenuOpen(false); }, 0);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const switchTab = (tabId) => {
    if (window.__setDashboardTab) {
      window.__setDashboardTab(tabId);
    }
    if (location.pathname !== '/dashboard') {
      navigate('/dashboard');
    }
    setMobileMenuOpen(false);
  };

  // Display name for the user in the navbar
  const userName = userProfile?.displayName || currentUser?.email?.split('@')[0] || 'User';

  return (
    <>
      <nav className="top-nav">
        {/* Brand + Competition Switcher */}
        <div className="nav-brand-group" ref={dropRef}>
          <Link to={currentUser ? '/dashboard' : '/'} className="nav-brand-link">
            <span className="nav-brand-icon">{competition.icon}</span>
          </Link>
          {currentUser ? (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setDropdownOpen(!dropdownOpen)}
                className="comp-switcher-btn">
                {lang === 'hr' ? competition.nameHR : competition.shortName}
                <span className="comp-arrow" style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
              </button>
              {dropdownOpen && (
                <div className="comp-dropdown">
                  {Object.values(COMPETITIONS).map(comp => (
                    <button key={comp.id} onClick={() => { switchCompetition(comp.id); setDropdownOpen(false); }}
                      className={comp.id === competition.id ? 'comp-dropdown-item active' : 'comp-dropdown-item'}>
                      <span style={{ fontSize: '1.1rem' }}>{comp.icon}</span>
                      <div>
                        <div>{lang === 'hr' ? comp.nameHR : comp.name}</div>
                        {comp.id === competition.id && <div style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>● {t('active')}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="nav-brand">Football PredictorZ</span>
          )}
        </div>

        {/* Desktop Nav Links */}
        <div className="nav-links nav-desktop">
          <LanguageSwitcher />
          {currentUser ? (
            <>
              <Link to="/dashboard" className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}>{t('dashboard')}</Link>
              <button onClick={() => switchTab('profile')} className="nav-user-btn" title={t('myProfile')}>
                👤 {userName}
              </button>
              <button onClick={() => switchTab('rules')} className="btn-outline nav-logout-btn" style={{ fontSize: '0.82rem' }}>📖 {t('rulesTab')}</button>
              <button onClick={() => signOut(auth)} className="btn-outline nav-logout-btn">{t('logout')}</button>
            </>
          ) : (
            <>
              <button onClick={() => window.dispatchEvent(new Event('show-rules'))} className="btn-outline nav-logout-btn" style={{ fontSize: '0.82rem' }}>📖 {t('rulesTab')}</button>
              <Link to="/login" className="btn-primary nav-login-btn">{t('loginSignup')}</Link>
            </>
          )}
        </div>

        {/* Mobile: lang + hamburger */}
        <div className="nav-mobile-right">
          <LanguageSwitcher />
          <button className="hamburger-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu">
            <span className={mobileMenuOpen ? 'hamburger open' : 'hamburger'}>
              <span></span><span></span><span></span>
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Slide Menu */}
      {mobileMenuOpen && (
        <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)}>
          <div className="mobile-menu" onClick={e => e.stopPropagation()}>
            {currentUser ? (
              <>
                {/* User identity — tap to open profile */}
                <button className="mobile-menu-link" onClick={() => switchTab('profile')}
                  style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.95rem' }}>
                  👤 {userName}
                </button>
                <div className="mobile-menu-divider" />
                <div className="mobile-menu-section-label">📋 {t('navigation')}</div>
                <button className="mobile-menu-link" onClick={() => switchTab('leagues')}>🏟️ {t('leagues')}</button>
                <button className="mobile-menu-link" onClick={() => switchTab('global')}>🌍 {t('myGlobalPicks')}</button>
                <button className="mobile-menu-link" onClick={() => switchTab('rules')}>📖 {t('rulesTab')}</button>
                {isAdmin && (
                  <button className="mobile-menu-link" onClick={() => switchTab('admin')}
                    style={{ color: 'var(--primary)' }}>🔧 {t('adminPanel')}</button>
                )}
                <div className="mobile-menu-divider" />
                <button onClick={() => { signOut(auth); setMobileMenuOpen(false); }}
                  className="mobile-menu-link mobile-menu-logout">
                  🚪 {t('logout')}
                </button>
              </>
            ) : (
              <>
                <Link to="/" className="mobile-menu-link" onClick={() => setMobileMenuOpen(false)}
                  style={{ color: 'var(--primary)' }}>🔑 {t('loginSignup')}</Link>
                <button className="mobile-menu-link" onClick={() => { window.dispatchEvent(new Event('show-rules')); setMobileMenuOpen(false); }}>📖 {t('rulesTab')}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
