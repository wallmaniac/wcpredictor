import { useState, useEffect } from 'react';
import { database } from '../config/firebase';
import { ref, onValue } from 'firebase/database';
import { GROUP_TEAMS, ALL_MATCHES } from '../utils/matchData';
import { useLanguage } from '../context/LanguageContext';

export default function GroupTables() {
  const { t, tt } = useLanguage();
  const [liveMatches, setLiveMatches] = useState({});

  useEffect(() => {
    const liveRef = ref(database, 'wc2026/match_results');
    const unsubscribe = onValue(liveRef, (snapshot) => {
      if (snapshot.exists()) {
        setLiveMatches(snapshot.val());
      } else {
        setLiveMatches({});
      }
    });
    return () => unsubscribe();
  }, []);

  const getStandings = (groupName) => {
    const teams = GROUP_TEAMS[groupName];
    const standings = teams.map(team => ({
      name: team, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0
    }));

    // Find all matches for this group
    const groupMatches = ALL_MATCHES.filter(m => m.group === groupName && m.stage === 'Group Stage');
    
    groupMatches.forEach(match => {
      const dbMatch = (liveMatches || {})[`match_${match.matchNumber}`];
      if (dbMatch && dbMatch.status === 'finished') {
        const team1 = standings.find(t => t.name === match.team1);
        const team2 = standings.find(t => t.name === match.team2);
        
        if (team1 && team2) {
          const s1 = parseInt(dbMatch.score1, 10);
          const s2 = parseInt(dbMatch.score2, 10);
          if (!isNaN(s1) && !isNaN(s2)) {
            team1.played++; team2.played++;
            team1.gf += s1; team1.ga += s2;
            team2.gf += s2; team2.ga += s1;
            
            if (s1 > s2) {
              team1.won++; team2.lost++; team1.pts += 3;
            } else if (s1 < s2) {
              team2.won++; team1.lost++; team2.pts += 3;
            } else {
              team1.drawn++; team2.drawn++; team1.pts += 1; team2.pts += 1;
            }
          }
        }
      }
    });

    standings.forEach(t => t.gd = t.gf - t.ga);
    
    // Sort by PTS, then GD, then GF
    return standings.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
      {Object.keys(GROUP_TEAMS).map(groupName => {
        const table = getStandings(groupName);
        return (
          <div key={groupName} className="glass-card" style={{ padding: '15px' }}>
            <h3 style={{ marginBottom: '10px', color: 'var(--primary)' }}>{t('group')} {groupName}</h3>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--glass-border)' }}>
                  <th style={{ paddingBottom: '8px' }}>{t('team')}</th>
                  <th style={{ paddingBottom: '8px' }}>{t('played')}</th>
                  <th style={{ paddingBottom: '8px' }}>{t('goalDiff')}</th>
                  <th style={{ paddingBottom: '8px' }}>{t('points')}</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row, idx) => (
                  <tr key={row.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '8px 0', fontWeight: idx < 2 ? 'bold' : 'normal' }}>
                      <span style={{ color: 'var(--text-muted)', marginRight: '8px', fontSize: '0.8rem' }}>{idx + 1}</span>
                      {tt(row.name)}
                    </td>
                    <td>{row.played}</td>
                    <td>{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                    <td style={{ fontWeight: 'bold' }}>{row.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
