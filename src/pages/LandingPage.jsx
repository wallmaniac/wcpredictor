import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function LandingPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="page-wrapper container animate-fade-in">
      <div style={{ textAlign: 'center', marginTop: '4vh' }}>
        <h1 className="landing-title">
          {t('landingTitle')} <span className="text-gradient-primary">{t('landingHighlight')}</span>
        </h1>
        <p className="landing-subtitle">
          {t('landingSubtitle')}
        </p>
        <div className="glass-panel landing-rules-panel">
          <h2 style={{ marginBottom: '20px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px', textAlign: 'center' }}>
            <span className="text-gradient">{t('rulesGlance')}</span>
          </h2>
          <div className="rules-grid">
            <div>
              <h3 className="text-gradient-primary" style={{ marginBottom: '12px' }}>⚽ {t('matchPoints')}</h3>
              <ul style={{ listStyle: 'none', color: 'var(--text-muted)', lineHeight: '2' }}>
                <li>✅ {t('exactScore')}: <b style={{ color: '#fff' }}>3 {t('pts')}</b></li>
                <li>✅ {t('correctResult')}: <b style={{ color: '#fff' }}>1 {t('pts')}</b></li>
                <li>❌ {t('wrongResult')}: <b style={{ color: '#fff' }}>0 {t('pts')}</b></li>
              </ul>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '10px' }}>{t('knockoutNote')}</p>
            </div>
            <div>
              <h3 className="text-gradient-primary" style={{ marginBottom: '12px' }}>🌍 {t('globalPredictions')}</h3>
              <ul style={{ listStyle: 'none', color: 'var(--text-muted)', lineHeight: '2' }}>
                <li>🏆 {t('champion')}: <b style={{ color: '#fff' }}>10 {t('pts')}</b></li>
                <li>🥈 {t('secondPlace')}: <b style={{ color: '#fff' }}>5 {t('pts')}</b></li>
                <li>🥉 {t('thirdPlace')}: <b style={{ color: '#fff' }}>5 {t('pts')}</b></li>
                <li>👟 {t('topScorer')}: <b style={{ color: '#fff' }}>5 {t('pts')}</b></li>
                <li>🎯 {t('topAssist')}: <b style={{ color: '#fff' }}>5 {t('pts')}</b></li>
                <li>🧤 {t('topGoalkeeper')}: <b style={{ color: '#fff' }}>5 {t('pts')}</b></li>
              </ul>
            </div>
          </div>
          <div style={{ marginTop: '25px', textAlign: 'center' }}>
            {currentUser ? (
              <button className="btn-primary landing-cta" onClick={() => navigate('/dashboard')}>🎮 {t('goToDashboard')}</button>
            ) : (
              <button className="btn-primary landing-cta" onClick={() => navigate('/login')}>🔑 {t('signInStart')}</button>
            )}
          </div>
        </div>
        <div className="features-grid">
          {[['⚽', t('matches104'), t('fullCoverage')],['📊', t('liveStandings'), t('realtimeGroups')],['🔄', t('autoSync'), t('scoresUpdate')],['🏆', t('bonusPts'), t('fromGlobalPicks')]].map(([icon, title, desc], i) => (
            <div key={i} className="glass-card feature-card">
              <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>{icon}</div>
              <div style={{ fontWeight: 'bold', fontSize: '0.85rem', marginBottom: '4px' }}>{title}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
