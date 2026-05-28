import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import MatchList from '../components/MatchList';
import Leaderboard from '../components/Leaderboard';
import AdminPanel from '../components/AdminPanel';
import GroupTables from '../components/GroupTables';
import GlobalPicks from '../components/GlobalPicks';
import PlayerStats from '../components/PlayerStats';
import Rules from '../components/Rules';
import PLLeagueTable from '../components/PLLeagueTable';
import UserProfile from '../components/UserProfile';
import UserLeagues from '../components/UserLeagues';

function StatsTab() {
  const { competition } = useCompetition();
  const { t } = useLanguage();
  const isWC = competition.id === 'wc2026';
  const [sub, setSub] = useState('standings');

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setSub('standings')} className={sub === 'standings' ? 'phase-tab active' : 'phase-tab'}>
          📊 {isWC ? t('groupStandings') : t('leagueTable')}
        </button>
        <button onClick={() => setSub('players')} className={sub === 'players' ? 'phase-tab active' : 'phase-tab'}>
          📈 {t('playerStats')}
        </button>
      </div>
      {sub === 'standings' && (isWC ? <GroupTables /> : <PLLeagueTable />)}
      {sub === 'players' && <PlayerStats />}
    </div>
  );
}

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('matches');

  // Bottom bar: 5 tabs (merged stats, added global picks)
  const bottomTabs = [
    { id: 'matches', label: t('matchesTab'), icon: '⚽' },
    { id: 'leaderboard', label: t('leaderboardTab'), icon: '🏆' },
    { id: 'stats', label: t('stats') || 'Stats', icon: '📊' },
    { id: 'global', label: t('globalPicks') || 'Global', icon: '🌍' },
    { id: 'leagues', label: t('leagues'), icon: '🏟️' },
  ];

  // Sidebar shows all tabs
  const allTabs = [
    ...bottomTabs,
    ...(isAdmin ? [{ id: 'admin', label: t('adminPanel'), icon: '🔧' }] : []),
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'matches': return <><h2 className="content-title">{t('matchPredictions')}</h2><MatchList /></>;
      case 'leaderboard': return <Leaderboard />;
      case 'stats': return <StatsTab />;
      case 'global': return <GlobalPicks />;
      case 'leagues': return <UserLeagues />;
      case 'profile': return <UserProfile />;
      case 'rules': return <Rules />;
      case 'admin': return isAdmin ? <AdminPanel /> : null;
      default: return null;
    }
  };

  useEffect(() => {
    window.__setDashboardTab = setActiveTab;
    return () => {
      delete window.__setDashboardTab;
    };
  }, [setActiveTab]);

  return (
    <>
      <div className="page-wrapper container animate-fade-in">
        <div className="dashboard-grid">
          <div className="glass-panel sidebar-panel">
            <h3 className="sidebar-title">{t('menu')}</h3>
            <ul className="sidebar-menu">
              {allTabs.map(tab => (
                <li key={tab.id}>
                  <button onClick={() => setActiveTab(tab.id)}
                    className={`sidebar-btn ${activeTab === tab.id ? 'active' : ''}`}>
                    {tab.icon} {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-panel content-panel">
            {renderContent()}
          </div>
        </div>
      </div>

      <nav className="mobile-bottom-nav">
        {bottomTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? 'bottom-nav-item active' : 'bottom-nav-item'}>
            <span className="bottom-nav-icon">{tab.icon}</span>
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
