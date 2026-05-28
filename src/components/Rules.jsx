import { useLanguage } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import ReactMarkdown from 'react-markdown';

const sectionStyle = { padding: '22px', marginBottom: '16px' };
const stepStyle = () => ({
  display: 'flex', gap: '14px', padding: '14px 0',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
});
const numStyle = {
  minWidth: '32px', height: '32px', borderRadius: '50%',
  background: 'rgba(0,255,136,0.12)', color: 'var(--primary)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 'bold', fontSize: '0.9rem', flexShrink: 0,
};

function Step({ num, title, children }) {
  return (
    <div style={stepStyle(num)}>
      <div style={numStyle}>{num}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.92rem' }}>{title}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', lineHeight: 1.6 }}><ReactMarkdown>{children}</ReactMarkdown></div>
      </div>
    </div>
  );
}

export default function Rules() {
  const { t } = useLanguage();
  const { competition } = useCompetition();
  const isWC = competition.id === 'wc2026';

  const globalRows = isWC ? [
    ['🏆', t('champion'), '10 pts'],
    ['🥈', t('secondPlace'), '5 pts'],
    ['🥉', t('thirdPlace'), '5 pts'],
    ['👟', t('topScorer'), '5 pts'],
    ['🎯', t('topAssist'), '5 pts'],
    ['🧤', t('topGoalkeeper'), '5 pts']
  ] : [
    ['🏆', t('leagueChampion'), '10 pts'],
    ['🥈', t('secondPlacePL'), '5 pts'],
    ['🥉', t('thirdPlacePL'), '5 pts'],
    ['👟', t('goldenBoot'), '5 pts'],
    ['🎯', t('mostAssists'), '5 pts'],
    ['🧤', t('goldenGlove'), '5 pts']
  ];

  return (
    <div style={{ maxWidth: '820px' }}>
      <h2 style={{ marginBottom: '25px' }}><span className="text-gradient-primary">{t('rulesGuideTitle')}</span></h2>

      {/* GETTING STARTED */}
      <div className="glass-card" style={sectionStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '14px' }}>{t('gettingStarted')}</h3>
        <Step num={1} title={t('createAccountTitle')}>{t('createAccountDesc')}</Step>
        <Step num={2} title={t('setupProfileTitle')}>{t('setupProfileDesc')}</Step>
        <Step num={3} title={t('chooseCompTitle')}>{t('chooseCompDesc')}</Step>
      </div>

      {/* LEAGUES */}
      <div className="glass-card" style={sectionStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '14px' }}>{t('leaguesTitle')}</h3>
        <Step num={1} title={t('createLeagueTitle')}>{t('createLeagueDesc')}</Step>
        <Step num={2} title={t('joinLeagueTitle')}>{t('joinLeagueDesc')}</Step>
        <Step num={3} title={t('manageLeagueTitle')}>{t('manageLeagueDesc')}</Step>
        <Step num={4} title={t('entryFeesTitle')}>{t('entryFeesDesc')}</Step>
      </div>

      {/* MATCH PREDICTIONS */}
      <div className="glass-card" style={sectionStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '14px' }}>{t('matchPicksTitle')}</h3>
        <Step num={1} title={t('enterPicksTitle')}>{t('enterPicksDesc')}</Step>
        <Step num={2} title={t('savePicksTitle')}>{t('savePicksDesc')}</Step>
        <Step num={3} title={t('lockPicksTitle')}>{t('lockPicksDesc')}</Step>
        <Step num={4} title={t('viewOthersTitle')}>{t('viewOthersDesc')}</Step>
        <div style={{ color: '#FFB800', fontSize: '0.82rem', marginTop: '10px', padding: '8px 12px', background: 'rgba(255,184,0,0.08)', borderRadius: '6px' }}>
          <ReactMarkdown>{t('lockWarning')}</ReactMarkdown>
        </div>
      </div>

      {/* SCORING SYSTEM */}
      <div className="glass-card" style={sectionStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '14px' }}>🎯 {t('scoringSystem')}</h3>
        <p style={{ color: 'var(--text-muted)', marginBottom: '14px', lineHeight: '1.6' }}>{t('scoringDesc')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          {[[3,'var(--primary)',t('exactScore'),t('exactScoreExample'),'0,255,136'],[1,'#FFB800',t('correctResult'),t('correctResultExample'),'255,184,0'],[0,'#FF5555',t('wrongResult'),t('wrongResultExample'),'255,85,85']].map(([pts,color,label,example,rgb],i) => (
            <div key={i} style={{ background: `rgba(${rgb},0.1)`, padding: '14px', borderRadius: '10px', textAlign: 'center', border: `1px solid rgba(${rgb},0.2)` }}>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color }}>{pts}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{label}</div>
              <div style={{ color: '#666', fontSize: '0.72rem', marginTop: '4px' }}>{example}</div>
            </div>
          ))}
        </div>
      </div>

      {/* GLOBAL PREDICTIONS */}
      <div className="glass-card" style={sectionStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '14px' }}>{t('globalPicksTitle')}</h3>
        <Step num={1} title={t('makePicksTitle')}>{t('makePicksDesc')}</Step>
        <Step num={2} title={t('lockGlobalTitle')}>{t('lockGlobalDesc')}</Step>
        <Step num={3} title={t('globalScoringTitle')}>{t('globalScoringDesc')}</Step>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '6px' }}><tbody>
          {globalRows.map(([icon,label,pts],i) => (
            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '8px 0', fontSize: '1.1rem', width: '34px' }}>{icon}</td>
              <td style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>{label}</td>
              <td style={{ padding: '8px 0', fontWeight: 'bold', color: 'var(--primary)', textAlign: 'right', fontSize: '0.88rem' }}>{pts}</td>
            </tr>
          ))}
        </tbody></table>
      </div>

      {/* LEADERBOARD */}
      <div className="glass-card" style={sectionStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '14px' }}>{t('leaderboardTitle')}</h3>
        <Step num={1} title={t('checkRankingsTitle')}>{t('checkRankingsDesc')}</Step>
        <Step num={2} title={t('leagueVsGlobalTitle')}>{t('leagueVsGlobalDesc')}</Step>
        <Step num={3} title={t('tiebreakers')}>{t('tiebreakersDesc')}</Step>
      </div>

      {/* ADDITIONAL FEATURES */}
      <div className="glass-card" style={sectionStyle}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '14px' }}>{t('otherFeaturesTitle')}</h3>
        <Step num="📈" title={t('tableStandingsTitle')}>{t('tableTabDesc')}</Step>
        <Step num="⚽" title={t('playerStats')}>{t('playerStatsDesc')}</Step>
        <Step num="🕐" title={t('timezone')}>{t('timezoneDesc')}</Step>
      </div>

      {/* PRO TIPS */}
      <div className="glass-card" style={{ ...sectionStyle, background: 'rgba(144,76,255,0.05)', border: '1px solid rgba(144,76,255,0.15)' }}>
        <h3 style={{ color: 'var(--secondary)', marginBottom: '14px' }}>💡 {t('proTips')}</h3>
        <ul style={{ color: 'var(--text-muted)', listStyle: 'none', lineHeight: '2.2', fontSize: '0.88rem' }}>
          <li>• {t('tip1')}</li>
          <li>• {t('tip2')}</li>
          <li>• {t('tip3')}</li>
          <li>• {t('tip4')}</li>
          <li>• {t('tip5')}</li>
        </ul>
      </div>
    </div>
  );
}
