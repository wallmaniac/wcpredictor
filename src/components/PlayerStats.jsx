import { useState, useEffect } from 'react';
import { database } from '../config/firebase';
import { ref, onValue, set } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import { syncPlayerStats } from '../services/liveScoreService';

// Default PL 2025-26 stats (through MD36, May 2026)
const PL_DEFAULT_STATS = {
  scorers: [
    { name: "Erling Haaland", team: "Manchester City", count: 26 },
    { name: "Igor Thiago", team: "Brentford", count: 22 },
    { name: "Antoine Semenyo", team: "Bournemouth", count: 16 },
    { name: "Joao Pedro", team: "Chelsea", count: 15 },
    { name: "Viktor Gyökeres", team: "Arsenal", count: 14 },
    { name: "Ollie Watkins", team: "Aston Villa", count: 13 },
    { name: "Alexander Isak", team: "Newcastle United", count: 12 },
    { name: "Bryan Mbeumo", team: "Brentford", count: 12 },
    { name: "Mohamed Salah", team: "Liverpool", count: 11 },
    { name: "Dominic Solanke", team: "Tottenham Hotspur", count: 10 },
  ],
  assists: [
    { name: "Bruno Fernandes", team: "Manchester United", count: 19 },
    { name: "Rayan Cherki", team: "Manchester City", count: 12 },
    { name: "Jarrod Bowen", team: "West Ham United", count: 10 },
    { name: "Bukayo Saka", team: "Arsenal", count: 10 },
    { name: "Kevin De Bruyne", team: "Manchester City", count: 9 },
    { name: "Mohamed Salah", team: "Liverpool", count: 9 },
    { name: "Phil Foden", team: "Manchester City", count: 8 },
    { name: "Martin Ødegaard", team: "Arsenal", count: 8 },
  ],
  cleanSheets: [
    { name: "David Raya", team: "Arsenal", count: 18 },
    { name: "Gianluigi Donnarumma", team: "Manchester City", count: 14 },
    { name: "Djordje Petrovic", team: "Bournemouth", count: 11 },
    { name: "Dean Henderson", team: "Crystal Palace", count: 11 },
    { name: "Jordan Pickford", team: "Everton", count: 11 },
    { name: "André Onana", team: "Manchester United", count: 10 },
    { name: "Mark Flekken", team: "Brentford", count: 9 },
  ],
};

export default function PlayerStats() {
  const { isAdmin } = useAuth();
  const { t, tt } = useLanguage();
  const { competition } = useCompetition();
  const [stats, setStats] = useState({ scorers: [], assists: [], cleanSheets: [] });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const fbPath = competition.firebasePath;
  const isWC = competition.id === 'wc2026';

  useEffect(() => {
    const statsRef = ref(database, `${fbPath}/statistics`);
    const unsubscribe = onValue(statsRef, (snapshot) => {
      const toArray = (val) => {
        if (!val) return [];
        return Array.isArray(val) ? val : Object.values(val);
      };

      if (snapshot.exists()) {
        const data = snapshot.val();
        const scorers = toArray(data.scorers);
        const assists = toArray(data.assists);
        const cleanSheets = toArray(data.cleanSheets);
        const hasScorers = scorers.length > 0;
        
        if (!isWC && !hasScorers) {
          setStats(PL_DEFAULT_STATS);
        } else {
          setStats({
            scorers,
            assists,
            cleanSheets: (!isWC && cleanSheets.length === 0) ? PL_DEFAULT_STATS.cleanSheets : cleanSheets
          });
        }
        if (data.lastSynced) setLastSync(new Date(data.lastSynced));
        else setLastSync(null);
      } else {
        // No synced stats yet — show default for PL, empty for WC
        if (!isWC) {
          setStats(PL_DEFAULT_STATS);
        } else {
          setStats({ scorers: [], assists: [], cleanSheets: [] });
        }
        setLastSync(null);
      }
    });
    return () => unsubscribe();
  }, [fbPath, isWC]);

  /**
   * Sync stats from live API
   * Fetches top scorers and saves to Firebase.
   * The API returns goals + assists so we split them into separate lists.
   */
  const handleSyncStats = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncPlayerStats(competition.id);
      if (result.success) {
        setSyncResult({ ok: true, msg: result.message });
      } else {
        setSyncResult({ ok: false, msg: result.error || 'Failed to sync stats' });
      }
    } catch (e) {
      console.error(e);
      setSyncResult({ ok: false, msg: e.message });
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Clear stale/fake stats for WC2026 (admin only)
   */
  const handleClearStats = async () => {
    try {
      await set(ref(database, `${fbPath}/statistics`), null);
      setSyncResult({ ok: true, msg: 'Stats cleared.' });
    } catch (e) {
      setSyncResult({ ok: false, msg: e.message });
    }
  };

  const hasData = stats.scorers.length > 0 || stats.assists.length > 0 || stats.cleanSheets.length > 0;

  const renderTable = (title, data, unit, emoji) => {
    const toArray = (val) => {
      if (!val) return [];
      return Array.isArray(val) ? val : Object.values(val);
    };
    const validData = toArray(data).filter(player => player && player.name);
    return (
      <div className="glass-card" style={{ padding: '18px' }}>
        <h4 style={{ marginBottom: '12px', color: 'var(--primary)', fontSize: '0.95rem' }}>{emoji} {title}</h4>
        {validData.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            {isWC
              ? t('wcNotStartedStats')
              : t('noDataAvailable')}
          </p>
        ) : (
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ paddingBottom: '8px' }}>{t('player')}</th>
                <th style={{ paddingBottom: '8px', textAlign: 'right' }}>{unit}</th>
              </tr>
            </thead>
            <tbody>
              {validData.map((player, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '7px 0', fontWeight: idx < 3 ? 'bold' : 'normal' }}>
                    <span style={{ color: idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? '#cd7f32' : 'var(--text-muted)', marginRight: '8px', fontSize: '0.8rem' }}>{idx + 1}</span>
                    {player.name} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({tt(player.team) || player.team})</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: idx === 0 ? 'var(--primary)' : '#fff' }}>{player.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h3>{isWC ? `📊 ${t('wcPlayerStatsTitle')}` : `⚽ ${t('plPlayerStatsTitle')}`}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
            {!hasData && isWC
              ? `⏳ ${t('wcTournamentStartsYet')}`
              : lastSync
                ? `${t('lastSynced')}: ${lastSync.toLocaleString()}`
                : isWC ? t('liveDataFromApi') : t('plStatsThroughMD')}
          </p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={handleSyncStats} className="btn-outline" disabled={syncing}
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
              {syncing ? `⏳ ${t('pleaseWait')}` : `🔄 ${t('fetchStats')}`}
            </button>
            {isWC && hasData && (
              <button onClick={handleClearStats} className="btn-outline"
                style={{ padding: '6px 14px', fontSize: '0.8rem', borderColor: '#ff5555', color: '#ff5555' }}>
                🗑️ {t('clear')}
              </button>
            )}
          </div>
        )}
      </div>

      {syncResult && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem',
          background: syncResult.ok ? 'rgba(0,255,136,0.1)' : 'rgba(255,50,50,0.1)',
          color: syncResult.ok ? 'var(--primary)' : '#ff5555',
          border: `1px solid ${syncResult.ok ? 'rgba(0,255,136,0.2)' : 'rgba(255,50,50,0.2)'}`,
        }}>
          {syncResult.msg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px' }}>
        {renderTable(t('topScorer') || "Top Scorers", stats.scorers, t('goals') || "Goals", "👟")}
        {renderTable(t('topAssist') || "Top Assists", stats.assists, t('assists') || "Assists", "🎯")}
        {renderTable(t('topGoalkeeper') || "Top Goalkeeper", stats.cleanSheets, t('cleanSheets') || "Clean Sheets", "🧤")}
      </div>
    </div>
  );
}
