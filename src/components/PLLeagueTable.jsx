import { useState, useEffect } from 'react';
import { database } from '../config/firebase';
import { ref, onValue } from 'firebase/database';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useCompetition } from '../context/CompetitionContext';
import { syncStandings } from '../services/liveScoreService';

/**
 * PL 2025-26 League Table.
 * Primary: reads from Firebase (synced via "Sync Table" in Admin Panel).
 * Fallback: hardcoded base standings + overlay of MD37-38 results.
 */
export default function PLLeagueTable() {
  const { t, tt } = useLanguage();
  const { isAdmin } = useAuth();
  const { competition } = useCompetition();
  const [apiStandings, setApiStandings] = useState(null); // from API sync
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  useEffect(() => {
    const unsub = onValue(ref(database, 'pl2526/standings'), s => {
      if (s.exists()) {
        const data = s.val();
        // syncStandings saves as { table: [...], lastSynced: ... }
        const raw = data ? (data.table || data) : null;
        const arr = Array.isArray(raw) ? raw : (raw ? Object.values(raw) : []);
        setApiStandings(arr);
      } else {
        setApiStandings(null);
      }
    });
    return () => unsub();
  }, []);

  // Use API standings if available
  const standings = apiStandings
    ? [...apiStandings]
        .filter(row => row && typeof row === 'object' && row.team)
        .sort((a, b) => (a.position || 99) - (b.position || 99))
    : [];

  // Zone colors
  const getZoneColor = (idx) => {
    if (idx < 4) return 'var(--primary)';      // UCL
    if (idx === 4) return '#FF8800';            // UEL
    if (idx === 5) return '#FFD700';            // UECL
    if (idx >= 17) return '#FF5555';            // Relegation
    return 'var(--text-muted)';
  };

  if (standings.length === 0) {
    return (
      <div>
        <h3 style={{ marginBottom: '8px', color: 'var(--primary)' }}>⚽ {t('plTableTitle')}</h3>
        <div className="glass-card" style={{ padding: '30px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>📊 {t('noPlStandings')}</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '6px' }}>{t('plStandingsAdminHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginBottom: '8px', color: 'var(--primary)' }}>⚽ {t('plTableTitle')}</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '15px' }}>
        {t('plTableDesc')}
      </p>

      {/* Admin sync button */}
      {isAdmin && (
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={async () => {
            setSyncing(true); setSyncMsg(null);
            try {
              const r = await syncStandings(competition.id);
              setSyncMsg({ ok: r.success, msg: r.success ? r.message || '✅ Standings synced!' : r.error });
            } catch (e) { setSyncMsg({ ok: false, msg: e.message }); }
            setSyncing(false);
          }} className="btn-outline" disabled={syncing}
            style={{ padding: '5px 12px', fontSize: '0.75rem' }}>
            {syncing ? '⏳ Syncing...' : '🔄 Sync Standings from API'}
          </button>
          {syncMsg && (
            <span style={{ fontSize: '0.72rem', color: syncMsg.ok ? '#00ff88' : '#ff5555' }}>
              {syncMsg.msg}
            </span>
          )}
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '500px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--glass-border)', color: 'var(--text-muted)' }}>
              <th style={{ textAlign: 'left', padding: '10px 6px', width: '28px' }}>#</th>
              <th style={{ textAlign: 'left', padding: '10px 6px', minWidth: '130px' }}>{t('team')}</th>
              <th style={{ textAlign: 'center', padding: '10px 4px', width: '35px' }}>{t('played')}</th>
              <th style={{ textAlign: 'center', padding: '10px 4px', width: '30px' }}>W</th>
              <th style={{ textAlign: 'center', padding: '10px 4px', width: '30px' }}>D</th>
              <th style={{ textAlign: 'center', padding: '10px 4px', width: '30px' }}>L</th>
              <th style={{ textAlign: 'center', padding: '10px 4px', width: '30px' }}>GF</th>
              <th style={{ textAlign: 'center', padding: '10px 4px', width: '30px' }}>GA</th>
              <th style={{ textAlign: 'center', padding: '10px 4px', width: '35px' }}>{t('goalDiff')}</th>
              <th style={{ textAlign: 'center', padding: '10px 4px', width: '40px' }}>{t('points')}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, idx) => {
              const gd = (row.gf || 0) - (row.ga || 0);
              return (
                <tr key={row.team || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx < 4 ? 'rgba(0,255,136,0.03)' : idx >= 17 ? 'rgba(255,50,50,0.03)' : 'transparent' }}>
                  <td style={{ padding: '10px 6px', color: getZoneColor(idx), fontWeight: 'bold', borderLeft: `3px solid ${getZoneColor(idx)}` }}>{row.position || idx + 1}</td>
                  <td style={{ padding: '10px 6px', fontWeight: idx < 4 || idx >= 17 ? 'bold' : 'normal', whiteSpace: 'nowrap', minWidth: '130px' }}>{tt(row.team) || row.team}</td>
                  <td style={{ textAlign: 'center', padding: '10px 4px' }}>{row.played || 0}</td>
                  <td style={{ textAlign: 'center', padding: '10px 4px' }}>{row.won || 0}</td>
                  <td style={{ textAlign: 'center', padding: '10px 4px' }}>{row.drawn || 0}</td>
                  <td style={{ textAlign: 'center', padding: '10px 4px' }}>{row.lost || 0}</td>
                  <td style={{ textAlign: 'center', padding: '10px 4px' }}>{row.gf || 0}</td>
                  <td style={{ textAlign: 'center', padding: '10px 4px' }}>{row.ga || 0}</td>
                  <td style={{ textAlign: 'center', padding: '10px 4px', fontWeight: '600' }}>{gd > 0 ? `+${gd}` : gd}</td>
                  <td style={{ textAlign: 'center', padding: '10px 4px', fontWeight: 'bold', color: 'var(--primary)', fontSize: '1rem' }}>{row.points || row.pts || 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '15px', marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span><span style={{ color: 'var(--primary)' }}>●</span> {t('championsLeague')}</span>
        <span><span style={{ color: '#FF8800' }}>●</span> {t('europaLeague')}</span>
        <span><span style={{ color: '#FFD700' }}>●</span> {t('conferenceLeague')}</span>
        <span><span style={{ color: '#FF5555' }}>●</span> {t('relegation')}</span>
      </div>
    </div>
  );
}
