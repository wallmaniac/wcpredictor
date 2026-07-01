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
  const [sub, setSub] = useState('players');
  const [visited, setVisited] = useState({ players: true });

  useEffect(() => {
    if (sub) {
      setVisited(prev => prev[sub] ? prev : { ...prev, [sub]: true });
    }
  }, [sub]);

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
      {visited.standings && (
        <div style={{ display: sub === 'standings' ? 'block' : 'none' }}>
          {isWC ? <GroupTables /> : <PLLeagueTable />}
        </div>
      )}
      {visited.players && (
        <div style={{ display: sub === 'players' ? 'block' : 'none' }}>
          <PlayerStats />
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('matches');
  const [visitedTabs, setVisitedTabs] = useState({ matches: true });

  useEffect(() => {
    if (activeTab) {
      setVisitedTabs(prev => prev[activeTab] ? prev : { ...prev, [activeTab]: true });
    }
  }, [activeTab]);

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
          <div className="glass-panel content-panel" style={{ position: 'relative' }}>
            {visitedTabs.matches && (
              <div style={{ display: activeTab === 'matches' ? 'block' : 'none' }}>
                <h2 className="content-title">{t('matchPredictions')}</h2>
                <MatchList />
              </div>
            )}
            {visitedTabs.leaderboard && (
              <div style={{ display: activeTab === 'leaderboard' ? 'block' : 'none' }}>
                <Leaderboard />
              </div>
            )}
            {visitedTabs.stats && (
              <div style={{ display: activeTab === 'stats' ? 'block' : 'none' }}>
                <StatsTab />
              </div>
            )}
            {visitedTabs.global && (
              <div style={{ display: activeTab === 'global' ? 'block' : 'none' }}>
                <GlobalPicks />
              </div>
            )}
            {visitedTabs.leagues && (
              <div style={{ display: activeTab === 'leagues' ? 'block' : 'none' }}>
                <UserLeagues />
              </div>
            )}
            {visitedTabs.profile && (
              <div style={{ display: activeTab === 'profile' ? 'block' : 'none' }}>
                <UserProfile />
              </div>
            )}
            {visitedTabs.rules && (
              <div style={{ display: activeTab === 'rules' ? 'block' : 'none' }}>
                <Rules />
              </div>
            )}
            {isAdmin && visitedTabs.admin && (
              <div style={{ display: activeTab === 'admin' ? 'block' : 'none' }}>
                <AdminPanel />
              </div>
            )}
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
