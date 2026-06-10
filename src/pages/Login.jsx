import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth, database } from '../config/firebase';
import { ref, set } from 'firebase/database';
import { useLanguage } from '../context/LanguageContext';
import Rules from '../components/Rules';

const COUNTRIES = [
  { name: "Bosnia and Herzegovina", tz: "Europe/Sarajevo", flag: "🇧🇦" },
  { name: "Croatia", tz: "Europe/Zagreb", flag: "🇭🇷" },
  { name: "Serbia", tz: "Europe/Belgrade", flag: "🇷🇸" },
  { name: "Germany", tz: "Europe/Berlin", flag: "🇩🇪" },
  { name: "Austria", tz: "Europe/Vienna", flag: "🇦🇹" },
  { name: "Switzerland", tz: "Europe/Zurich", flag: "🇨🇭" },
  { name: "United Kingdom", tz: "Europe/London", flag: "🇬🇧" },
  { name: "France", tz: "Europe/Paris", flag: "🇫🇷" },
  { name: "Spain", tz: "Europe/Madrid", flag: "🇪🇸" },
  { name: "Italy", tz: "Europe/Rome", flag: "🇮🇹" },
  { name: "Netherlands", tz: "Europe/Amsterdam", flag: "🇳🇱" },
  { name: "Belgium", tz: "Europe/Brussels", flag: "🇧🇪" },
  { name: "Portugal", tz: "Europe/Lisbon", flag: "🇵🇹" },
  { name: "Sweden", tz: "Europe/Stockholm", flag: "🇸🇪" },
  { name: "Norway", tz: "Europe/Oslo", flag: "🇳🇴" },
  { name: "Denmark", tz: "Europe/Copenhagen", flag: "🇩🇰" },
  { name: "Poland", tz: "Europe/Warsaw", flag: "🇵🇱" },
  { name: "Czech Republic", tz: "Europe/Prague", flag: "🇨🇿" },
  { name: "Turkey", tz: "Europe/Istanbul", flag: "🇹🇷" },
  { name: "Greece", tz: "Europe/Athens", flag: "🇬🇷" },
  { name: "Romania", tz: "Europe/Bucharest", flag: "🇷🇴" },
  { name: "Hungary", tz: "Europe/Budapest", flag: "🇭🇺" },
  { name: "Slovenia", tz: "Europe/Ljubljana", flag: "🇸🇮" },
  { name: "Montenegro", tz: "Europe/Podgorica", flag: "🇲🇪" },
  { name: "North Macedonia", tz: "Europe/Skopje", flag: "🇲🇰" },
  { name: "United States", tz: "America/New_York", flag: "🇺🇸" },
  { name: "Canada", tz: "America/Toronto", flag: "🇨🇦" },
  { name: "Mexico", tz: "America/Mexico_City", flag: "🇲🇽" },
  { name: "Brazil", tz: "America/Sao_Paulo", flag: "🇧🇷" },
  { name: "Argentina", tz: "America/Argentina/Buenos_Aires", flag: "🇦🇷" },
  { name: "Colombia", tz: "America/Bogota", flag: "🇨🇴" },
  { name: "Japan", tz: "Asia/Tokyo", flag: "🇯🇵" },
  { name: "South Korea", tz: "Asia/Seoul", flag: "🇰🇷" },
  { name: "Australia", tz: "Australia/Sydney", flag: "🇦🇺" },
  { name: "Saudi Arabia", tz: "Asia/Riyadh", flag: "🇸🇦" },
  { name: "Egypt", tz: "Africa/Cairo", flag: "🇪🇬" },
  { name: "Morocco", tz: "Africa/Casablanca", flag: "🇲🇦" },
  { name: "Nigeria", tz: "Africa/Lagos", flag: "🇳🇬" },
  { name: "South Africa", tz: "Africa/Johannesburg", flag: "🇿🇦" },
  { name: "Iraq", tz: "Asia/Baghdad", flag: "🇮🇶" },
  { name: "Iran", tz: "Asia/Tehran", flag: "🇮🇷" },
  { name: "Qatar", tz: "Asia/Qatar", flag: "🇶🇦" },
  { name: "Other", tz: Intl.DateTimeFormat().resolvedOptions().timeZone, flag: "🌍" },
];

export default function Login() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [country, setCountry] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    const handler = () => setShowRules(true);
    window.addEventListener('show-rules', handler);
    return () => window.removeEventListener('show-rules', handler);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        let loginEmail = email;
        if (email === 'admin' && password === 'admin1') loginEmail = 'admin@wc2026.com';
        await signInWithEmailAndPassword(auth, loginEmail, password);
        navigate('/dashboard');
      } else if (mode === 'reset') {
        if (!email.trim()) {
          setError(t('invalidEmail') || 'Please enter a valid email.');
          setLoading(false);
          return;
        }
        await sendPasswordResetEmail(auth, email.trim());
        setMode('login');
        setError('✅ ' + (t('resetEmailSent') || 'Password reset email sent! Check your inbox.'));
      } else {
        if (!displayName.trim()) { setError(t('enterName')); setLoading(false); return; }
        if (!country) { setError(t('selectCountryErr')); setLoading(false); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const selectedCountry = COUNTRIES.find(c => c.name === country);
        await set(ref(database, `wc2026/users/${cred.user.uid}`), {
          email: email,
          displayName: displayName.trim(),
          country: country,
          timezone: selectedCountry?.tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
          flag: selectedCountry?.flag || '🌍',
          totalPoints: 0,
          exactScores: 0,
          createdAt: Date.now()
        });
        navigate('/dashboard');
      }
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') setError(t('alreadyRegistered'));
      else if (err.code === 'auth/weak-password') setError(t('weakPassword'));
      else if (err.code === 'auth/invalid-email') setError(t('invalidEmail'));
      else if (err.code === 'auth/user-not-found') setError(t('userNotFound') || 'User not found.');
      else setError(err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      {/* Messi background */}
      <div className="login-bg-image" />
      <div className="login-bg-overlay" />

      <div className="login-content">
        <div className="login-hero">
          <h1 className="login-title">
            <span className="text-gradient-primary">Football PredictorZ</span>
          </h1>
          <p className="login-subtitle">Predict. Compete. Win.</p>
        </div>

        {/* Minimalist World Cup trophy image */}
        <img src="/trophy-transparent.png?v=4" alt="World Cup Trophy" className="login-trophy-img" />

        <div className="glass-panel login-card">
          {/* Tab switcher */}
          {mode !== 'reset' ? (
            <div className="login-tabs">
              <button onClick={() => setMode('login')}
                className={`login-tab ${mode === 'login' ? 'active' : ''}`}>{t('signIn')}</button>
              <button onClick={() => setMode('register')}
                className={`login-tab ${mode === 'register' ? 'active' : ''}`}>{t('register')}</button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '10px 0', borderBottom: '1px solid var(--glass-border)', color: 'var(--primary)', fontWeight: 'bold' }}>
              🔑 {t('resetPassword') || 'Reset Password'}
            </div>
          )}

          {error && (
            <div className={error.startsWith('✅') ? "login-success" : "login-error"} style={error.startsWith('✅') ? { background: 'rgba(0,255,136,0.1)', color: 'var(--primary)', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', textAlign: 'center' } : undefined}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="login-form">
            {mode === 'register' && (
              <div className="login-field">
                <label>{t('displayName')}</label>
                <input type="text" className="input-glass" value={displayName}
                  onChange={e => setDisplayName(e.target.value)} placeholder="Your name" required />
              </div>
            )}

            <div className="login-field">
              <label>{mode === 'login' ? t('emailOrUsername') : t('email')}</label>
              <input type={mode === 'login' ? 'text' : 'email'} className="input-glass"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder={mode === 'login' ? 'admin' : 'your@email.com'} required />
            </div>

            {mode !== 'reset' && (
              <div className="login-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label>{t('password')}</label>
                  {mode === 'login' && (
                    <button type="button" onClick={() => { setMode('reset'); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}>
                      {t('forgotPassword') || 'Forgot password?'}
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input-glass"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required={mode !== 'reset'}
                    style={{ width: '100%', paddingRight: '40px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0.7,
                    }}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div className="login-field">
                <label>🌍 {t('selectCountry')}</label>
                <select className="input-glass" value={country}
                  onChange={e => setCountry(e.target.value)} required>
                  <option value="">-- {t('selectCountry')} --</option>
                  {COUNTRIES.map(c => (
                    <option key={c.name} value={c.name}>{c.flag} {c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button type="submit" className="btn-primary login-submit" disabled={loading} style={{ marginTop: '10px' }}>
              {loading ? `⏳ ${t('pleaseWait')}` : mode === 'login' ? `🔑 ${t('signIn')}` : mode === 'reset' ? `✉️ ${t('sendResetEmail') || 'Send Reset Email'}` : `🎮 ${t('createAccount')}`}
            </button>

            {mode === 'reset' && (
              <button type="button" onClick={() => { setMode('login'); setError(''); }} className="btn-outline" style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }}>
                ⬅️ {t('backToSignIn') || 'Back to Sign In'}
              </button>
            )}
          </form>
        </div>

        <div className="login-footer">
          Developed by Z
        </div>
      </div>

      {/* Rules Modal — solid dark background */}
      {showRules && (
        <div className="rules-modal-overlay" onClick={() => setShowRules(false)}>
          <div className="rules-modal-panel" onClick={e => e.stopPropagation()}>
            <button className="rules-modal-close" onClick={() => setShowRules(false)}>✕</button>
            <Rules />
          </div>
        </div>
      )}
    </div>
  );
}
