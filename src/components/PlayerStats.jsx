import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { database } from '../config/firebase';
import { ref, onValue, set } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import { syncPlayerStats } from '../services/liveScoreService';
import { ALL_MATCHES, TEAMS } from '../utils/matchData';
import { PL_2526_MATCHES, PL_LEAGUE_TABLE_TEAMS } from '../utils/plMatchData';

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



const TEAM_CODES = {
  "Canada": "CAN", "Mexico": "MEX", "USA": "USA", "United States": "USA",
  "Argentina": "ARG", "Ecuador": "ECU", "Uruguay": "URU", "Japan": "JPN",
  "Colombia": "COL", "South Korea": "KOR", "Brazil": "BRA", "Nigeria": "NGA",
  "France": "FRA", "Saudi Arabia": "KSA", "Spain": "ESP", "Egypt": "EGY",
  "Germany": "GER", "Cameroon": "CMR", "England": "ENG", "Iran": "IRN",
  "Portugal": "POR", "Costa Rica": "CRC", "Belgium": "BEL", "Uzbekistan": "UZB",
  "Netherlands": "NED", "Honduras": "HON", "Italy": "ITA", "Panama": "PAN",
  "Iraq": "IRQ", "Jamaica": "JAM", "Poland": "POL", "Chile": "CHI",
  "Denmark": "DEN", "Tunisia": "TUN", "Switzerland": "SUI", "Ghana": "GHA",
  "New Zealand": "NZL", "Ukraine": "UKR", "Algeria": "ALG", "Turkey": "TUR",
  "Mali": "MLI", "Sweden": "SWE", "Peru": "PER", "Qatar": "QAT",
  "Morocco": "MAR", "Australia": "AUS", "Haiti": "HAI", "Scotland": "SCO",
  "Paraguay": "PAR", "South Africa": "RSA", "Cape Verde": "CPV", "Senegal": "SEN",
  "Austria": "AUT", "Jordan": "JOR", "DR Congo": "COD", "Bosnia and Herzegovina": "BIH",
  "Czech Republic": "CZE", "Ivory Coast": "CIV", "Curaçao": "CUW", "Croatia": "CRO"
};

const getTeamAbbreviation = (name) => {
  if (!name) return '';
  const code = TEAM_CODES[name];
  if (code) return code;
  return name.substring(0, 3).toUpperCase();
};

const levenshteinDistance = (a, b) => {
  const tmp = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp.push([i]);
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
};

const simplifyName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "") // remove spaces and special chars
    .trim();
};

const isPlayerMatch = (nameA, nameB) => {
  const sA = simplifyName(nameA);
  const sB = simplifyName(nameB);
  if (!sA || !sB) return false;
  
  if (sA === sB) return true;
  
  const dist = levenshteinDistance(sA, sB);
  const minLen = Math.min(sA.length, sB.length);
  const threshold = minLen < 5 ? 1 : minLen < 8 ? 2 : 3;
  if (dist <= threshold) return true;

  const getWords = (name) => {
    return name.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]/)
      .filter(w => w.length > 0);
  };
  
  const wordsA = getWords(nameA);
  const wordsB = getWords(nameB);
  
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  
  const isWordMatch = (w1, w2) => {
    if (w1 === w2) return true;
    if (w1.length === 1 && w2.startsWith(w1)) return true;
    if (w2.length === 1 && w1.startsWith(w2)) return true;
    if (w1.length >= 3 && w2.length >= 3) {
      if (w1.includes(w2) || w2.includes(w1)) return true;
      if (levenshteinDistance(w1, w2) <= 1) return true;
    }
    return false;
  };
  
  if (wordsA.length >= 2 && wordsB.length >= 2) {
    const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
    const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;
    return shorter.every(sw => longer.some(lw => isWordMatch(sw, lw)));
  } else {
    const sw = wordsA.length === 1 ? wordsA[0] : wordsB[0];
    const longerList = wordsA.length === 1 ? wordsB : wordsA;
    return longerList.some(lw => isWordMatch(sw, lw));
  }
};

export default function PlayerStats() {
  const { isAdmin } = useAuth();
  const { t, tt, lang } = useLanguage();
  const { competition } = useCompetition();
  
  const [stats, setStats] = useState({ scorers: [], assists: [], cleanSheets: [] });
  const [localStats, setLocalStats] = useState({ scorers: [], assists: [], cleanSheets: [] });
  const [users, setUsers] = useState({});
  const [matchResults, setMatchResults] = useState({});
  const [isAfterStart, setIsAfterStart] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  const [newPlayerName, setNewPlayerName] = useState({ scorers: '', assists: '', cleanSheets: '' });
  const [newPlayerTeam, setNewPlayerTeam] = useState({ scorers: '', assists: '', cleanSheets: '' });
  const [newPlayerCount, setNewPlayerCount] = useState({ scorers: '', assists: '', cleanSheets: '' });
  
  const [selectedPlayerForModal, setSelectedPlayerForModal] = useState(null); // { name, category, title }
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [activeCategory, setActiveCategory] = useState('scorers');
  const swipeElementRef = useRef(null);
  const cleanupSwipeRef = useRef(null);
  const swipeContainerRef = useCallback((node) => {
    // 1. Cleanup previous node if exists
    if (cleanupSwipeRef.current) {
      try { cleanupSwipeRef.current(); } catch (err) { console.error(err); }
      cleanupSwipeRef.current = null;
    }
    
    // 2. Update node pointer
    swipeElementRef.current = node;
    
    // 3. Attach listeners to the new node
    if (!node || isAdmin) return;

    let startX = 0;
    let startY = 0;

    const handleStart = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const handleMove = (e) => {
      if (!startX || !startY) return;
      if (!e.touches || e.touches.length === 0) return;
      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = startX - currentX;
      const diffY = startY - currentY;

      // If horizontal movement is dominant, prevent browser scrolling behavior
      if (Math.abs(diffX) > Math.abs(diffY)) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    const handleEnd = (e) => {
      if (!startX) return;
      
      const touch = (e.changedTouches && e.changedTouches.length > 0)
        ? e.changedTouches[0]
        : (e.touches && e.touches.length > 0)
          ? e.touches[0]
          : null;
      if (!touch) return;

      const endX = touch.clientX;
      const endY = touch.clientY;
      const diffX = startX - endX;
      const diffY = startY - endY;
      const minSwipeDistance = 50;

      // Check if it is a clean horizontal swipe
      if (Math.abs(diffX) > minSwipeDistance && Math.abs(diffX) > Math.abs(diffY)) {
        const categories = ['scorers', 'assists', 'cleanSheets'];
        const currentIndex = categories.indexOf(activeCategory);

        if (diffX > minSwipeDistance) {
          // Swipe Left (drag right-to-left) -> next
          const nextIndex = (currentIndex + 1) % categories.length;
          setActiveCategory(categories[nextIndex]);
        } else {
          // Swipe Right (drag left-to-right) -> prev
          const prevIndex = (currentIndex - 1 + categories.length) % categories.length;
          setActiveCategory(categories[prevIndex]);
        }
      }
      startX = 0;
      startY = 0;
    };

    node.addEventListener('touchstart', handleStart, { passive: true });
    node.addEventListener('touchmove', handleMove, { passive: false });
    node.addEventListener('touchend', handleEnd, { passive: true });

    cleanupSwipeRef.current = () => {
      node.removeEventListener('touchstart', handleStart);
      node.removeEventListener('touchmove', handleMove);
      node.removeEventListener('touchend', handleEnd);
    };
  }, [activeCategory, isAdmin]);

  const fbPath = competition.firebasePath;
  const isWC = competition.id === 'wc2026';

  // Load stats from Firebase
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
        
        const newStats = {
          scorers,
          assists,
          cleanSheets: (!isWC && cleanSheets.length === 0) ? PL_DEFAULT_STATS.cleanSheets : cleanSheets
        };
        setStats(newStats);
        if (data.lastSynced) setLastSync(new Date(data.lastSynced));
        else setLastSync(null);
      } else {
        const newStats = !isWC ? PL_DEFAULT_STATS : { scorers: [], assists: [], cleanSheets: [] };
        setStats(newStats);
        setLastSync(null);
      }
    });
    return () => unsubscribe();
  }, [fbPath, isWC]);

  // Load match results to dynamically calculate clean sheets
  useEffect(() => {
    const resultsRef = ref(database, `${fbPath}/match_results`);
    const unsubscribe = onValue(resultsRef, (snapshot) => {
      if (snapshot.exists()) {
        setMatchResults(snapshot.val());
      } else {
        setMatchResults({});
      }
    });
    return () => unsubscribe();
  }, [fbPath]);

  // Calculate clean sheets by team in real-time
  const teamCleanSheets = useMemo(() => {
    const counts = {};
    const matchesList = isWC ? ALL_MATCHES : PL_2526_MATCHES;
    Object.entries(matchResults).forEach(([mId, res]) => {
      if (res && res.isPlayed && res.status === 'finished') {
        const mNum = parseInt(mId.replace('match_', ''), 10);
        const matchObj = matchesList.find(m => m.matchNumber === mNum);
        if (matchObj) {
          const s1 = res.score1;
          const s2 = res.score2;
          if (s2 === 0) {
            counts[matchObj.team1] = (counts[matchObj.team1] || 0) + 1;
          }
          if (s1 === 0) {
            counts[matchObj.team2] = (counts[matchObj.team2] || 0) + 1;
          }
        }
      }
    });
    return counts;
  }, [matchResults, isWC]);

  const cleanSheetsWithLiveCounts = useMemo(() => {
    return (localStats.cleanSheets || []).map(player => ({
      ...player,
      count: (player.manualCount !== undefined && player.manualCount !== null && player.cleanSheetsAtAdjustment !== undefined && player.cleanSheetsAtAdjustment !== null)
        ? player.manualCount + ((teamCleanSheets[player.team] || 0) - player.cleanSheetsAtAdjustment)
        : (teamCleanSheets[player.team] || 0)
    }));
  }, [localStats.cleanSheets, teamCleanSheets]);

  // Sync database state to local edits state only when no unsaved changes are present
  useEffect(() => {
    if (!hasChanges) {
      setLocalStats(stats);
    }
  }, [stats, hasChanges]);

  // Load users to check their global picks
  useEffect(() => {
    const usersRef = ref(database, `${fbPath}/users`);
    const unsubscribe = onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        setUsers(snapshot.val());
      } else {
        setUsers({});
      }
    });
    return () => unsubscribe();
  }, [fbPath]);

  // Calculate start status of tournament
  useEffect(() => {
    const start = isWC ? new Date('2026-06-11T20:00:00Z') : new Date('2025-08-16T11:30:00Z');
    setIsAfterStart(Date.now() >= start.getTime());
  }, [isWC]);

  // Find all users who predicted this player
  const usersWhoPicked = useMemo(() => {
    if (!selectedPlayerForModal) return [];
    const { name, category } = selectedPlayerForModal;
    const gpKeyMap = {
      scorers: 'topScorer',
      assists: 'topAssist',
      cleanSheets: 'topGoalkeeper'
    };
    const gpKey = gpKeyMap[category];
    
    return Object.entries(users).filter(([uid, u]) => {
      const picks = u.globalPicks || {};
      const pick = gpKey === 'topAssist' ? (picks.topAssist || picks.topHighlight) : picks[gpKey];
      const isLocked = u.globalPicksLocked === true || isAfterStart;
      return isLocked && pick && isPlayerMatch(pick, name);
    }).map(([uid, u]) => ({
      name: u.displayName || u.email || 'Unknown',
      email: u.email || '',
      flag: u.flag || '🌍',
      country: u.country || ''
    }));
  }, [selectedPlayerForModal, users, isAfterStart]);

  // Admin handlers
  const handleUpdatePlayer = (category, index, field, value) => {
    setLocalStats(prev => {
      const list = [...prev[category]];
      list[index] = { ...list[index], [field]: field === 'count' ? parseInt(value, 10) || 0 : value };
      return { ...prev, [category]: list };
    });
    setHasChanges(true);
  };

  const handleDeletePlayer = (category, index) => {
    setLocalStats(prev => {
      const list = prev[category].filter((_, i) => i !== index);
      return { ...prev, [category]: list };
    });
    setHasChanges(true);
  };

  const handleAddPlayer = (category, name, team, count) => {
    setLocalStats(prev => {
      const list = [...prev[category], { name, team, count: parseInt(count, 10) || 0 }];
      return { ...prev, [category]: list };
    });
    setHasChanges(true);
  };

  const handleSaveStats = async () => {
    try {
      const sortedScorers = [...localStats.scorers].sort((a, b) => b.count - a.count);
      const sortedAssists = [...localStats.assists].sort((a, b) => b.count - a.count);
      
      const sortedCleanSheets = [...localStats.cleanSheets].map(player => {
        const dbPlayer = stats.cleanSheets.find(p => p.name === player.name);
        const currentTeamCS = teamCleanSheets[player.team] || 0;
        
        let manualCount = player.manualCount !== undefined ? player.manualCount : null;
        let cleanSheetsAtAdjustment = player.cleanSheetsAtAdjustment !== undefined ? player.cleanSheetsAtAdjustment : null;
        
        if (dbPlayer) {
          const currentDisplay = (dbPlayer.manualCount !== undefined && dbPlayer.manualCount !== null && dbPlayer.cleanSheetsAtAdjustment !== undefined && dbPlayer.cleanSheetsAtAdjustment !== null)
            ? dbPlayer.manualCount + (currentTeamCS - dbPlayer.cleanSheetsAtAdjustment)
            : currentTeamCS;
          
          if (player.count !== currentDisplay) {
            manualCount = player.count;
            cleanSheetsAtAdjustment = currentTeamCS;
          } else {
            manualCount = dbPlayer.manualCount !== undefined ? dbPlayer.manualCount : null;
            cleanSheetsAtAdjustment = dbPlayer.cleanSheetsAtAdjustment !== undefined ? dbPlayer.cleanSheetsAtAdjustment : null;
          }
        } else {
          if (player.count !== currentTeamCS) {
            manualCount = player.count;
            cleanSheetsAtAdjustment = currentTeamCS;
          }
        }
        
        const finalCount = (manualCount !== null && cleanSheetsAtAdjustment !== null)
          ? manualCount + (currentTeamCS - cleanSheetsAtAdjustment)
          : currentTeamCS;
          
        return {
          name: player.name,
          team: player.team,
          manualCount,
          cleanSheetsAtAdjustment,
          count: finalCount
        };
      }).sort((a, b) => b.count - a.count);

      await set(ref(database, `${fbPath}/statistics`), {
        scorers: sortedScorers,
        assists: sortedAssists,
        cleanSheets: sortedCleanSheets,
        lastSynced: Date.now()
      });
      setHasChanges(false);
      setSyncResult({ ok: true, msg: lang === 'hr' ? 'Statistike su uspješno spremljene i sortirane!' : 'Statistics successfully saved and sorted!' });
      setTimeout(() => setSyncResult(null), 5000);
    } catch (e) {
      setSyncResult({ ok: false, msg: e.message });
    }
  };

  const handleUndoEdits = () => {
    setLocalStats(stats);
    setHasChanges(false);
    setSyncResult({ ok: true, msg: lang === 'hr' ? 'Promjene poništene.' : 'Changes undone.' });
    setTimeout(() => setSyncResult(null), 3000);
  };

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

  const handleClearStats = async () => {
    try {
      await set(ref(database, `${fbPath}/statistics`), null);
      setSyncResult({ ok: true, msg: 'Stats cleared.' });
    } catch (e) {
      setSyncResult({ ok: false, msg: e.message });
    }
  };


  const renderTable = (title, categoryKey, unit, emoji) => {
    const list = (categoryKey === 'cleanSheets' && !hasChanges) ? cleanSheetsWithLiveCounts : (localStats[categoryKey] || []);
    const getDisplayCount = (player) => {
      if (categoryKey === 'cleanSheets') {
        return (player.manualCount !== undefined && player.manualCount !== null && player.cleanSheetsAtAdjustment !== undefined && player.cleanSheetsAtAdjustment !== null)
          ? player.manualCount + ((teamCleanSheets[player.team] || 0) - player.cleanSheetsAtAdjustment)
          : (teamCleanSheets[player.team] || 0);
      }
      return player.count;
    };

    return (
      <div 
        ref={swipeContainerRef}
        className="glass-card" 
        style={{ 
          padding: '20px', 
          display: 'flex', 
          flexDirection: 'column', 
          height: '100%',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--shadow-glass)',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '12px',
          touchAction: 'pan-y'
        }}
      >
        {list.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, padding: '10px 0' }}>
            {isWC ? t('wcNotStartedStats') : t('noDataAvailable')}
          </p>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse', 
              fontSize: '0.82rem',
              tableLayout: 'fixed' 
            }}>
              <colgroup>
                <col style={{ width: isAdmin ? '46%' : '60%' }} />
                <col style={{ width: isAdmin ? '18%' : '20%' }} />
                <col style={{ width: isAdmin ? '20%' : '20%' }} />
                {isAdmin && <col style={{ width: '16%' }} />}
              </colgroup>
              <thead>
                <tr style={{ 
                  color: 'var(--text-muted)', 
                  borderBottom: '1px solid rgba(255,255,255,0.1)', 
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <th style={{ paddingBottom: '10px', fontWeight: 600 }}>{t('player')}</th>
                  <th style={{ paddingBottom: '10px', fontWeight: 600 }}>{t('team') || 'Team'}</th>
                  <th style={{ paddingBottom: '10px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>{unit}</th>
                  {isAdmin && <th style={{ paddingBottom: '10px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {list.map((player, idx) => {
                  const displayCount = getDisplayCount(player);
                  const maxCount = list[0] ? getDisplayCount(list[0]) : 0;
                  const isFirstPlace = displayCount === maxCount && maxCount > 0;
                  const rankColor = isFirstPlace ? '#FFD700' : 'var(--text-muted)';
                  const leftBorder = isFirstPlace 
                    ? '3px solid #FFD700' 
                    : '3px solid transparent';
                  const rankDisplay = isFirstPlace ? 1 : idx + 1;
                  
                  return (
                    <tr key={idx} style={{ 
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                      
                      {/* PLAYER NAME */}
                      <td style={{ 
                        padding: '10px 4px', 
                        verticalAlign: 'middle',
                        borderLeft: leftBorder,
                        paddingLeft: isFirstPlace ? '8px' : '4px',
                        overflow: 'hidden'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', overflow: 'hidden' }}>
                          <span style={{ 
                            color: rankColor, 
                            fontWeight: 'bold', 
                            fontSize: '0.85rem',
                            minWidth: '24px',
                            display: 'inline-block'
                          }}>
                            {rankDisplay}
                          </span>
                          
                          {isAdmin ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }}>
                              <input type="text" className="input-glass" value={player.name || ''}
                                onChange={e => handleUpdatePlayer(categoryKey, idx, 'name', e.target.value)}
                                style={{ 
                                  padding: '5px 8px', 
                                  fontSize: '0.8rem', 
                                  width: '100%', 
                                  borderRadius: '6px',
                                  border: '1px solid rgba(255,255,255,0.1)'
                                }} />
                              <button 
                                onClick={() => setSelectedPlayerForModal({ name: player.name, category: categoryKey, title })}
                                style={{ 
                                  background: 'rgba(168,85,247,0.1)', 
                                  border: '1px solid rgba(168,85,247,0.2)', 
                                  cursor: 'pointer', 
                                  fontSize: '0.8rem', 
                                  padding: '5px', 
                                  borderRadius: '6px',
                                  display: 'flex', 
                                  alignItems: 'center',
                                  color: '#c084fc',
                                  transition: 'all 0.2s',
                                  flexShrink: 0
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.2)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; }}
                                title={lang === 'hr' ? 'Pogledaj tko je odabrao' : 'See who picked'}
                              >
                                👥
                              </button>
                            </div>
                          ) : (
                            <span 
                              onClick={() => setSelectedPlayerForModal({ name: player.name, category: categoryKey, title })}
                              style={{ 
                                cursor: 'pointer', 
                                textDecoration: 'underline dotted', 
                                textDecorationColor: 'var(--primary)',
                                fontWeight: isFirstPlace ? 600 : 400,
                                color: isFirstPlace ? '#fff' : 'var(--text-main)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'inline-block',
                                maxWidth: '100%'
                              }}
                              title={lang === 'hr' ? 'Klikni za pregled tko je odabrao ovog igrača' : 'Click to see who picked this player'}
                            >
                              {player.name}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* TEAM NAME */}
                      <td style={{ padding: '10px 4px', verticalAlign: 'middle', overflow: 'hidden' }}>
                        {isAdmin ? (
                          <select className="input-glass" value={player.team || ''}
                            onChange={e => handleUpdatePlayer(categoryKey, idx, 'team', e.target.value)}
                            style={{ 
                              padding: '5px 8px', 
                              fontSize: '0.78rem', 
                              width: '100%', 
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.1)',
                              color: 'var(--text-muted)'
                            }}>
                            <option value="">{lang === 'hr' ? 'Tim' : 'Team'}</option>
                            {(isWC ? TEAMS : PL_LEAGUE_TABLE_TEAMS).map(tName => (
                              <option key={tName} value={tName}>{getTeamAbbreviation(tName)}</option>
                            ))}
                          </select>
                        ) : (
                          <span 
                            title={tt(player.team) || player.team} 
                            style={{ 
                              color: 'var(--text-muted)', 
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              cursor: 'help'
                            }}
                          >
                            {getTeamAbbreviation(player.team)}
                          </span>
                        )}
                      </td>

                      {/* STATS COUNT */}
                      <td style={{ 
                        padding: '5px 4px', 
                        verticalAlign: 'middle', 
                        textAlign: isAdmin ? 'left' : 'center',
                        paddingLeft: isAdmin ? '8px' : '4px',
                        fontWeight: 'bold', 
                        fontSize: '0.9rem',
                        color: isFirstPlace ? '#FFD700' : '#fff' 
                      }}>
                        {isAdmin ? (
                          <div style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            background: 'rgba(255,255,255,0.04)', 
                            border: '1px solid rgba(255,255,255,0.12)', 
                            borderRadius: '6px',
                            overflow: 'hidden',
                            height: '28px',
                            boxSizing: 'border-box'
                          }}>
                            {/* Decrement Button */}
                            <button 
                              onClick={() => handleUpdatePlayer(categoryKey, idx, 'count', Math.max(0, (player.count || 0) - 1))}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ff5555',
                                fontSize: '0.75rem',
                                width: '22px',
                                height: '100%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                userSelect: 'none',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,50,50,0.15)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                            >
                              ▼
                            </button>
                            {/* Text Input */}
                            <input 
                              type="text" 
                              inputMode="numeric"
                              value={player.count ?? 0}
                              onChange={e => {
                                const val = parseInt(e.target.value, 10);
                                handleUpdatePlayer(categoryKey, idx, 'count', isNaN(val) ? 0 : val);
                              }}
                              style={{ 
                                background: 'rgba(0,0,0,0.2)',
                                borderTop: 'none',
                                borderBottom: 'none',
                                borderLeft: '1px solid rgba(255,255,255,0.08)',
                                borderRight: '1px solid rgba(255,255,255,0.08)',
                                color: isFirstPlace ? '#FFD700' : '#fff',
                                fontSize: '0.82rem', 
                                width: '26px', 
                                height: '100%',
                                textAlign: 'center', 
                                fontWeight: 'bold',
                                outline: 'none',
                                padding: '0',
                                margin: '0'
                              }} 
                            />
                            {/* Increment Button */}
                            <button 
                              onClick={() => handleUpdatePlayer(categoryKey, idx, 'count', (player.count || 0) + 1)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--primary)',
                                fontSize: '0.75rem',
                                width: '22px',
                                height: '100%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                userSelect: 'none',
                                transition: 'background 0.2s'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,136,0.15)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                            >
                              ▲
                            </button>
                          </div>
                        ) : (
                          displayCount
                        )}
                      </td>

                      {/* ACTIONS (DELETE) */}
                      {isAdmin && (
                        <td style={{ padding: '10px 4px', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: '2px' }}>
                            <button onClick={() => handleDeletePlayer(categoryKey, idx)} style={{
                              background: 'none', 
                              border: 'none', 
                              color: '#ff5555', 
                              cursor: 'pointer', 
                              fontSize: '0.65rem',
                              padding: '2px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: 0.8,
                              transition: 'opacity 0.2s'
                            }} 
                            onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = 0.8; }}
                            title={lang === 'hr' ? 'Obriši igrača' : 'Delete player'}>
                              ❌
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ADMIN ADD PLAYER CARD */}
        {isAdmin && (
          <div style={{ 
            marginTop: '20px', 
            paddingTop: '16px', 
            borderTop: '1px dashed rgba(255,255,255,0.1)' 
          }}>
            <h5 style={{ 
              color: 'var(--primary)', 
              marginBottom: '10px', 
              fontSize: '0.78rem', 
              textTransform: 'uppercase', 
              fontWeight: 700,
              letterSpacing: '0.5px'
            }}>
              ➕ {lang === 'hr' ? 'Dodaj novog igrača' : 'Add New Player'}
            </h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input type="text" className="input-glass" placeholder={lang === 'hr' ? 'Ime igrača' : 'Player Name'}
                value={newPlayerName[categoryKey] || ''}
                onChange={e => setNewPlayerName(p => ({ ...p, [categoryKey]: e.target.value }))}
                style={{ padding: '8px 12px', fontSize: '0.8rem', borderRadius: '8px' }} />
              
              <select className="input-glass"
                value={newPlayerTeam[categoryKey] || ''}
                onChange={e => setNewPlayerTeam(p => ({ ...p, [categoryKey]: e.target.value }))}
                style={{ padding: '8px 12px', fontSize: '0.8rem', borderRadius: '8px' }}>
                <option value="">-- {lang === 'hr' ? 'Odaberi tim' : 'Select Team'} --</option>
                {(isWC ? TEAMS : PL_LEAGUE_TABLE_TEAMS).map(tName => (
                  <option key={tName} value={tName}>{tt(tName) || tName}</option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="number" className="input-glass" placeholder={unit} min="0"
                  value={newPlayerCount[categoryKey] || ''}
                  onChange={e => setNewPlayerCount(p => ({ ...p, [categoryKey]: e.target.value }))}
                  style={{ padding: '8px 12px', fontSize: '0.8rem', flex: 1, borderRadius: '8px' }} />
                <button onClick={() => {
                  const name = newPlayerName[categoryKey]?.trim();
                  const team = newPlayerTeam[categoryKey]?.trim();
                  const rawCount = newPlayerCount[categoryKey];
                  const count = (rawCount === undefined || rawCount === '') ? (teamCleanSheets[team] || 0) : parseInt(rawCount, 10);
                  if (!name || !team) return;
                  handleAddPlayer(categoryKey, name, team, count);
                  setNewPlayerName(p => ({ ...p, [categoryKey]: '' }));
                  setNewPlayerTeam(p => ({ ...p, [categoryKey]: '' }));
                  setNewPlayerCount(p => ({ ...p, [categoryKey]: '' }));
                }} className="btn-primary" style={{ 
                  padding: '8px 16px', 
                  fontSize: '0.8rem', 
                  whiteSpace: 'nowrap', 
                  borderRadius: '8px',
                  fontWeight: 'bold'
                }}>
                  {lang === 'hr' ? 'Dodaj igrača' : 'Add Player'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const hasData = localStats.scorers.length > 0 || localStats.assists.length > 0 || localStats.cleanSheets.length > 0;

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
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {isAdmin && (
            <>
              <button onClick={handleSaveStats} className="btn-primary"
                style={{ padding: '6px 16px', fontSize: '0.8rem', background: '#00ff88', color: '#000', fontWeight: 'bold' }}>
                💾 {lang === 'hr' ? 'Spremi i sortiraj' : 'Save & Sort'}
              </button>
              {hasChanges && (
                <button onClick={handleUndoEdits} className="btn-outline"
                  style={{ padding: '6px 14px', fontSize: '0.8rem', borderColor: '#ff9900', color: '#ff9900' }}>
                  ↩️ {lang === 'hr' ? 'Poništi' : 'Undo'}
                </button>
              )}
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
            </>
          )}
        </div>
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

      {/* Category selector dropdown */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '420px' }}>
          <select 
            value={activeCategory} 
            onChange={e => setActiveCategory(e.target.value)}
            className="input-glass"
            style={{ 
              padding: '12px 40px 12px 16px', 
              fontSize: '0.86rem', 
              width: '100%', 
              borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: '600',
              appearance: 'none',
              WebkitAppearance: 'none',
              boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
              outline: 'none',
              transition: 'all 0.2s',
              textAlign: 'center'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 255, 136, 0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)'; }}
          >
            <option value="scorers" style={{ background: '#18181b', color: '#fff' }}>
              👟 {lang === 'hr' ? 'Najbolji strijelac (Zlatna kopačka)' : 'Top Goalscorer (Golden Boot)'}
            </option>
            <option value="assists" style={{ background: '#18181b', color: '#fff' }}>
              🎯 {lang === 'hr' ? 'Najbolji asistent' : 'Top Assist Provider'}
            </option>
            <option value="cleanSheets" style={{ background: '#18181b', color: '#fff' }}>
              🧤 {lang === 'hr' ? 'Najbolji vratar (Najviše utakmica bez primljenog gola)' : 'Best Goalkeeper (Most clean sheets)'}
            </option>
          </select>
          <div style={{
            position: 'absolute',
            right: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--primary)',
            pointerEvents: 'none',
            fontSize: '0.8rem',
            userSelect: 'none'
          }}>
            ▼
          </div>
        </div>
      </div>

      {/* Swipe & Click Indicator Card */}
      <div style={{
        maxWidth: '680px',
        margin: '0 auto 16px auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '10px 14px',
        borderRadius: '10px',
        fontSize: '0.74rem',
        color: 'var(--text-muted)',
        textAlign: 'center',
        lineHeight: '1.4',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', color: 'rgba(255, 255, 255, 0.7)' }}>
          <span>👈</span>
          <span>{lang === 'hr' ? 'Prevucite tablicu lijevo/desno za promjenu kategorija' : 'Swipe table left/right to change categories'}</span>
          <span>👉</span>
        </div>
        <div style={{ color: 'rgba(255, 255, 255, 0.45)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>👆</span>
          <span>{lang === 'hr' ? 'Pritisnite na ime igrača da vidite tko ga je odabrao' : 'Tap on a player name to see who predicted them'}</span>
        </div>
      </div>

      {/* Main stats layout */}
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        {activeCategory === 'scorers' && renderTable(t('topScorer') || "Top Goalscorer", "scorers", t('goals') || "Goals", "👟")}
        {activeCategory === 'assists' && renderTable(t('topAssist') || "Top Assist Provider", "assists", t('assists') || "Assists", "🎯")}
        {activeCategory === 'cleanSheets' && renderTable(
          lang === 'hr' ? "Najbolji vratar (Najviše utakmica bez primljenog gola)" : "Best Goalkeeper (Most clean sheets)", 
          "cleanSheets", 
          t('cleanSheets') || "Clean Sheets", 
          "🧤"
        )}
      </div>

      {/* Predictions Picker Modal */}
      {selectedPlayerForModal && createPortal(
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 10000, padding: '20px'
        }} onClick={() => setSelectedPlayerForModal(null)}>
          <div className="glass-card" style={{
            width: '100%', maxWidth: '440px', padding: '24px', position: 'relative',
            maxHeight: '80vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.15)',
            background: '#1c1c1f',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.7)'
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedPlayerForModal(null)} style={{
              position: 'absolute', top: '16px', right: '16px', background: 'none',
              border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem'
            }}>✕</button>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '1.05rem', fontWeight: 700 }}>
              👥 {lang === 'hr' ? 'Tko je odabrao igrača' : 'Users who picked'} <span style={{ color: '#fff' }}>{selectedPlayerForModal.name}</span>
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginBottom: '16px', lineHeight: 1.4 }}>
              {lang === 'hr' 
                ? `Korisnici koji su prognozirali ovog igrača u kategoriji: ${selectedPlayerForModal.title}`
                : `List of users who picked this player for: ${selectedPlayerForModal.title}`}
            </p>
            {usersWhoPicked.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.82rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                🫙 {lang === 'hr' ? 'Nema korisnika koji su odabrali ovog igrača (ili prognoze još nisu zaključane).' : 'No users picked this player (or predictions are not locked yet).'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {usersWhoPicked.map((u, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--glass-border)', borderRadius: '8px', fontSize: '0.85rem'
                  }}>
                    <span style={{ fontSize: '1.25rem' }}>{u.flag}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{u.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.country}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
