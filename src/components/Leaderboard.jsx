import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { database } from '../config/firebase';
import { ref, onValue, get, set } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import { ALL_MATCHES, calculatePoints, formatMatchTime } from '../utils/matchData';
import { PL_2526_MATCHES, calculatePLPoints, formatPLMatchTime } from '../utils/plMatchData';
import { recalculateAllPoints, syncLiveScores } from '../services/liveScoreService';

// External helper to satisfy React Compiler purity check regarding Date.now()
async function saveAdminPredictionLeaderboardExternal(database, fbPath, uid, mn, s1, s2) {
  await set(ref(database, `${fbPath}/users/${uid}/predictions/${mn}`), {
    score1: parseInt(s1, 10),
    score2: parseInt(s2, 10),
    timestamp: Date.now(),
    editedByAdmin: true
  });
}

// Static start dates to prevent recreating Date objects on every render pass
const WC_START_DATE = new Date('2026-06-11T19:00:00Z');
const PL_START_DATE = new Date('2025-08-16T00:00:00Z');
export default function Leaderboard() {
  const { t, tt, lang } = useLanguage();
  const { currentUser, isAdmin } = useAuth();
  const { competition } = useCompetition();
  const [userTZ, setUserTZ] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [users, setUsers] = useState([]);
  const [leagues, setLeagues] = useState({});
  const [selectedLeague, setSelectedLeagueRaw] = useState(() => {
    try { return localStorage.getItem(`leaderboard_league_${competition.id}`) || 'all'; } catch { return 'all'; }
  });
  const setSelectedLeague = (val) => {
    setSelectedLeagueRaw(val);
    try { localStorage.setItem(`leaderboard_league_${competition.id}`, val); } catch {}
  };
  const [myLockedDays, setMyLockedDays] = useState({});
  const [myLockedMatches, setMyLockedMatches] = useState({});
  const [myGlobalPicksLocked, setMyGlobalPicksLocked] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);
  const [viewingPreds, setViewingPreds] = useState({});
  const [loadingPreds, setLoadingPreds] = useState(false);
  const [viewingUserLocks, setViewingUserLocks] = useState({});
  const [viewingGlobalPicks, setViewingGlobalPicks] = useState(null);
  const [viewingGlobalPickResults, setViewingGlobalPickResults] = useState(null);
  const [matchResults, setMatchResults] = useState({});
  const [expanded, setExpanded] = useState(false); // horizontal expand
  const [activeTab, setActiveTab] = useState('standings');
  const [allUserPreds, setAllUserPreds] = useState({});
  const [allUserGlobals, setAllUserGlobals] = useState({}); // {uid: {picks, locked}}
  const [isAfterStart, setIsAfterStart] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState(null);
  const [modalTab, setModalTab] = useState('matches'); // 'matches' or 'global'
  const modalScrollContainerRef = useRef(null);

  useEffect(() => {
    if (viewingUser && !loadingPreds && modalTab === 'matches') {
      const timer = setTimeout(() => {
        if (modalScrollContainerRef.current) {
          const todayRow = modalScrollContainerRef.current.querySelector('.pred-row-today');
          if (todayRow) {
            todayRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [viewingUser, loadingPreds, modalTab]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const fbPath = competition.firebasePath;
  const isWC = competition.id === 'wc2026';
  const matches = isWC ? ALL_MATCHES : PL_2526_MATCHES;
  const calcPts = isWC ? calculatePoints : calculatePLPoints;

  useEffect(() => {
    const u1 = onValue(ref(database, 'wc2026/users'), snap => {
      if (!snap.exists()) { setUsers([]); return; }
      const d = snap.val();
      setUsers(Object.entries(d).map(([uid, u]) => ({
        uid, name: u.displayName || u.email || 'Unknown', flag: u.flag || '🌍',
        country: u.country || '', points: isWC ? (u.totalPoints || 0) : 0,
        exact: isWC ? (u.exactScores || 0) : 0, correct: isWC ? (u.correctResults || 0) : 0,
        matchPoints: isWC ? (u.matchPoints || 0) : 0,
        globalPickPoints: isWC ? (u.globalPickPoints || 0) : 0,
        hidden: u.hidden === true,
      })));
    });
    let u1b = () => {};
    if (!isWC) {
      u1b = onValue(ref(database, `${fbPath}/users`), snap => {
        if (!snap.exists()) return;
        const cu = snap.val();
        setUsers(p => p.map(u => {
          const c = cu[u.uid];
          return c ? {
            ...u,
            points: c.totalPoints || 0,
            exact: c.exactScores || 0,
            correct: c.correctResults || 0,
            matchPoints: c.matchPoints || 0,
            globalPickPoints: c.globalPickPoints || 0,
          } : u;
        }));
      });
    }
    const u2 = onValue(ref(database, 'wc2026/leagues'), s => setLeagues(s.exists() ? s.val() : {}));
    const u5 = onValue(ref(database, `${fbPath}/match_results`), s => setMatchResults(s.exists() ? s.val() : {}));
    let u3 = () => {};
    let u4 = () => {};
    let u4b = () => {};
    if (currentUser) {
      u3 = onValue(ref(database, `${fbPath}/users/${currentUser.uid}/lockedDays`), s => setMyLockedDays(s.exists() ? s.val() : {}));
      u4 = onValue(ref(database, `${fbPath}/users/${currentUser.uid}/lockedMatches`), s => setMyLockedMatches(s.exists() ? s.val() : {}));
      u4b = onValue(ref(database, `${fbPath}/users/${currentUser.uid}/globalPicksLocked`), s => setMyGlobalPicksLocked(s.exists() ? s.val() === true : false));
      get(ref(database, `wc2026/users/${currentUser.uid}/timezone`)).then(s => { if (s.exists()) setUserTZ(s.val()); });
    }
    const h = (e) => setSelectedLeague(e.detail);
    window.addEventListener('select-league', h);
    return () => { u1(); u1b(); u2(); u3(); u4(); u4b(); u5(); window.removeEventListener('select-league', h); };
  }, [fbPath, isWC, currentUser]);

  const filtered = useMemo(() => {
    const visibleUsers = users.filter(u => !u.hidden || u.uid === currentUser?.uid);
    const sorted = [...visibleUsers].sort((a, b) => b.points !== a.points ? b.points - a.points : b.exact - a.exact);
    if (selectedLeague !== 'all') {
      const league = leagues[selectedLeague];
      if (league?.members) return sorted.filter(u => Object.keys(league.members).includes(u.uid));
    }
    return sorted;
  }, [users, currentUser?.uid, selectedLeague, leagues]);

  const myLeagues = Object.entries(leagues).filter(([, l]) => l.members?.[currentUser?.uid] || isAdmin).sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
  const hasAnyLock = isWC ? Object.keys(myLockedMatches).length > 0 : Object.keys(myLockedDays).length > 0;

  // Auto-default league: if user is in 1 league and no saved preference, select it
  useEffect(() => {
    if (myLeagues.length === 0) return;
    const saved = localStorage.getItem(`leaderboard_league_${competition.id}`);
    if (!saved || saved === 'all') {
      // If user has exactly 1 league, auto-select it
      if (myLeagues.length === 1) {
        setSelectedLeague(myLeagues[0][0]);
      }
    } else if (saved !== 'all' && !leagues[saved]) {
      // Saved league no longer exists, fall back to first league
      setSelectedLeague(myLeagues.length === 1 ? myLeagues[0][0] : 'all');
    }
  }, [myLeagues.length, Object.keys(leagues).join(',')]);

  const startDate = competition.id === 'wc2026' ? WC_START_DATE : PL_START_DATE;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAfterStart(Date.now() >= startDate.getTime());
    }, 0);
    return () => clearTimeout(timer);
  }, [startDate]);

  const handleViewPredictions = async (uid, name) => {
    setLoadingPreds(true); setViewingUser({ uid, name }); setModalTab('matches');
    try {
      const pSnap = await get(ref(database, `${fbPath}/users/${uid}/predictions`));
      setViewingPreds(pSnap.exists() ? pSnap.val() : {});
      const lockPath = isWC ? 'lockedMatches' : 'lockedDays';
      const lSnap = await get(ref(database, `${fbPath}/users/${uid}/${lockPath}`));
      setViewingUserLocks(lSnap.exists() ? lSnap.val() : {});
      const gL = await get(ref(database, `${fbPath}/users/${uid}/globalPicksLocked`));
      const gP = await get(ref(database, `${fbPath}/users/${uid}/globalPicks`));
      const viewingUserLocked = (gL.exists() && gL.val() === true) || (isAfterStart && gL.val() !== false);
      const myGlobalLocked = myGlobalPicksLocked || isAfterStart || isAdmin || uid === currentUser?.uid;

      if (viewingUserLocked) {
        if (myGlobalLocked) {
          if (gP.exists()) {
            setViewingGlobalPicks(gP.val());
          } else {
            setViewingGlobalPicks({ _noPicksSubmitted: true });
          }
        } else {
          setViewingGlobalPicks({ _needsMyLock: true });
        }
      } else {
        if (uid === currentUser?.uid || isAdmin) {
          if (gP.exists()) {
            setViewingGlobalPicks(gP.val());
          } else {
            setViewingGlobalPicks({ _noPicksSubmitted: true });
          }
        } else {
          setViewingGlobalPicks({ _notLockedByTarget: true });
        }
      }
      // Fetch global pick results (correct/incorrect/points)
      const gR = await get(ref(database, `${fbPath}/users/${uid}/globalPickResults`));
      setViewingGlobalPickResults(gR.exists() ? gR.val() : null);
    } catch (e) { console.error(e); setViewingPreds({}); setViewingUserLocks({}); setViewingGlobalPicks(null); setViewingGlobalPickResults(null); }
    setLoadingPreds(false);
  };

  const handleAdminEditPred = async (uid, mn, s1, s2) => {
    if (!isAdmin || s1 === '' || s2 === '') return;
    await saveAdminPredictionLeaderboardExternal(database, fbPath, uid, mn, s1, s2);
    setViewingPreds(p => ({ ...p, [mn]: { score1: parseInt(s1, 10), score2: parseInt(s2, 10) } }));
  };

  const closeModal = () => { setViewingUser(null); setViewingPreds({}); setViewingUserLocks({}); setViewingGlobalPicks(null); setViewingGlobalPickResults(null); setModalTab('matches'); };

  const finishedMatches = matches
    .filter(m => matchResults[`match_${m.matchNumber}`]?.status === 'finished')
    .sort((a, b) => {
      const dateTimeA = `${a.date}T${a.utc || '00:00'}`;
      const dateTimeB = `${b.date}T${b.utc || '00:00'}`;
      if (dateTimeA !== dateTimeB) return dateTimeB.localeCompare(dateTimeA);
      return b.matchNumber - a.matchNumber;
    });
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: userTZ });
  const locale = lang === 'hr' ? 'hr-HR' : 'en-US';
  const fmtTime = isWC ? formatMatchTime : formatPLMatchTime;

  // Load analytics data
  useEffect(() => {
    if (activeTab === 'analytics') {
      const fetchAnalytics = async () => {
        const snap = await get(ref(database, `${fbPath}/users`));
        if (snap.exists()) {
          const data = snap.val();
          setAllUserPreds(data);
          // Extract global picks
          const globals = {};
          Object.entries(data).forEach(([uid, u]) => {
            const showGlobals = (u.globalPicksLocked === true) || (isAfterStart && u.globalPicksLocked !== false);
            if (showGlobals && u.globalPicks) globals[uid] = u.globalPicks;
          });
          setAllUserGlobals(globals);
        }
      };
      fetchAnalytics();
    }
  }, [activeTab, fbPath, isAfterStart]);

  const analyticsData = useMemo(() => {
    if (Object.keys(allUserPreds).length === 0) return [];
    return finishedMatches.map(m => {
      const actual = matchResults[`match_${m.matchNumber}`];
      if (!actual) return null;
      const exactUsers = [];
      Object.entries(allUserPreds).forEach(([uid, uData]) => {
        const pred = uData.predictions?.[m.matchNumber];
        if (pred && pred.score1 === actual.score1 && pred.score2 === actual.score2) {
          exactUsers.push(users.find(u => u.uid === uid)?.name || uData.displayName || 'Unknown');
        }
      });
      return exactUsers.length > 0 ? { match: m, actual, exactUsers } : null;
    }).filter(Boolean);
  }, [allUserPreds, finishedMatches, matchResults, users]);

  // Global pick label helper
  const globalPickLabel = (key) => {
    if (isWC) return t(key) || key;
    const map = {
      champion: t('leagueChampion'),
      secondPlace: t('secondPlacePL'),
      thirdPlace: t('thirdPlacePL'),
      topScorer: t('goldenBoot'),
      topAssist: t('mostAssists'),
      topGoalkeeper: t('goldenGlove'),
    };
    return map[key] || t(key) || key;
  };

  const globalPickPoints = { champion: 10, secondPlace: 5, thirdPlace: 5, topScorer: 5, topAssist: 5, topGoalkeeper: 5 };

  // Prediction row in modal
  const renderPredRow = (m) => {
    const pred = viewingPreds[m.matchNumber];
    const actual = matchResults[`match_${m.matchNumber}`];
    const isFinished = actual?.status === 'finished';
    const pts = isFinished ? calcPts(pred, actual) : 0;
    const isExact = pts === 3, isCorrect = pts === 1;
    const fmt = fmtTime(m.date, m.utc, userTZ, locale);
    const isToday = fmt.dateKey === todayKey;

    let rowBg = 'rgba(255,255,255,0.03)';
    let rowBorder = '1px solid var(--glass-border)';
    
    if (isFinished) {
      if (isExact) {
        rowBg = 'rgba(0, 255, 136, 0.08)';
        rowBorder = '1px solid rgba(0, 255, 136, 0.35)';
      } else if (isCorrect) {
        rowBg = 'rgba(255, 184, 0, 0.04)';
        rowBorder = '1px solid rgba(255, 184, 0, 0.15)';
      } else {
        rowBg = 'rgba(255, 50, 50, 0.02)';
        rowBorder = '1px solid rgba(255, 85, 85, 0.15)';
      }
    } else if (isToday) {
      rowBg = 'rgba(255, 184, 0, 0.06)';
      rowBorder = '1px solid rgba(255, 184, 0, 0.2)';
    }

    return (
      <div key={m.matchNumber} id={`pred-row-${m.matchNumber}`} className={isToday ? "pred-row-today" : ""} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderRadius: '8px', fontSize: '0.85rem', flexWrap: 'wrap', gap: '8px',
        background: rowBg,
        border: rowBorder,
        opacity: isFinished ? 0.95 : 1,
      }}>
        <div style={{ flex: 1, minWidth: '120px' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>#{m.matchNumber} </span>
          <span style={{ fontWeight: 600 }}>{tt(m.team1)}</span>
          <span style={{ color: 'var(--text-muted)' }}> vs </span>
          <span style={{ fontWeight: 600 }}>{tt(m.team2)}</span>
          {isToday && !isFinished && <span style={{ marginLeft: '6px', fontSize: '0.6rem', color: '#FFB800', fontWeight: 600 }}>📅 {t('today')}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isAdmin ? (
            <>
              <input type="number" min="0" defaultValue={pred?.score1 ?? ''} className="input-glass score-input"
                style={{ width: '40px', padding: '4px', textAlign: 'center', fontSize: '0.85rem' }}
                onBlur={e => handleAdminEditPred(viewingUser.uid, m.matchNumber, e.target.value, document.getElementById(`adm_${viewingUser.uid}_${m.matchNumber}_s2`)?.value)}
                id={`adm_${viewingUser.uid}_${m.matchNumber}_s1`} />
              <span style={{ color: 'var(--text-muted)' }}>-</span>
              <input type="number" min="0" defaultValue={pred?.score2 ?? ''} className="input-glass score-input"
                style={{ width: '40px', padding: '4px', textAlign: 'center', fontSize: '0.85rem' }}
                onBlur={e => handleAdminEditPred(viewingUser.uid, m.matchNumber, document.getElementById(`adm_${viewingUser.uid}_${m.matchNumber}_s1`)?.value, e.target.value)}
                id={`adm_${viewingUser.uid}_${m.matchNumber}_s2`} />
            </>
          ) : (
            <span style={{
              fontWeight: 'bold', fontSize: '1rem', padding: '2px 8px', borderRadius: '6px',
              color: isExact ? '#00ff88' : isCorrect ? '#FFB800' : isFinished ? '#ff5555' : 'var(--primary)',
              background: isExact ? 'rgba(0,255,136,0.12)' : isCorrect ? 'rgba(255,184,0,0.08)' : isFinished ? 'rgba(255,50,50,0.06)' : 'transparent',
            }}>
              {isExact && '✅ '}{isCorrect && '☑️ '}{isFinished && !isExact && !isCorrect && '❌ '}
              {pred?.score1} - {pred?.score2}
            </span>
          )}
          {isFinished && (
            <span style={{
              fontSize: '0.75rem', fontWeight: 'bold', padding: '3px 8px', borderRadius: '4px',
              color: isExact ? '#00ff88' : isCorrect ? '#FFB800' : '#ff5555',
              background: isExact ? 'rgba(0, 255, 136, 0.15)' : isCorrect ? 'rgba(255, 184, 0, 0.12)' : 'rgba(255, 50, 50, 0.1)',
              border: `1px solid ${isExact ? 'rgba(0, 255, 136, 0.3)' : isCorrect ? 'rgba(255, 184, 0, 0.2)' : 'rgba(255, 50, 50, 0.2)'}`
            }}>
              +{pts} {t('pts')}
            </span>
          )}
          {isFinished && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>({actual.score1}-{actual.score2})</span>}
        </div>
      </div>
    );
  };

  // Render global picks section in modal with correct/incorrect status
  const renderGlobalPicksSection = () => {
    if (!viewingGlobalPicks) return null;

    if (viewingGlobalPicks._notLockedByTarget) {
      return (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '14px', marginBottom: '10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          ⏳ {t('targetNotLockedGlobal')}
        </div>
      );
    }

    if (viewingGlobalPicks._needsMyLock) {
      return (
        <div style={{ background: 'rgba(255,184,0,0.03)', border: '1px solid rgba(255,184,0,0.15)', borderRadius: '8px', padding: '14px', marginBottom: '10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          🔒 {t('lockGlobalPicksToView')}
        </div>
      );
    }

    if (viewingGlobalPicks._noPicksSubmitted) {
      return (
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '14px', marginBottom: '10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          🌍 {t('noGlobalPicksSet')}
        </div>
      );
    }

    const keys = ['champion', 'secondPlace', 'thirdPlace', 'topScorer', 'topAssist', 'topGoalkeeper'];
    let totalGlobalPts = 0;
    let correctCount = 0;

    return (
      <div style={{ background: 'rgba(144,76,255,0.05)', border: '1px solid rgba(144,76,255,0.2)', borderRadius: '8px', padding: '14px', marginBottom: '10px' }}>
        <h4 style={{ color: 'var(--secondary)', marginBottom: '10px', fontSize: '0.9rem' }}>🌍 {t('globalPredictions')}</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {keys.map(k => {
            const pick = viewingGlobalPicks[k];
            const result = viewingGlobalPickResults?.[k];
            const hasResult = !!result;
            const isCorrectPick = result?.correct;
            const ptsAwarded = result?.points || 0;
            const maxPts = globalPickPoints[k];
            if (isCorrectPick) { totalGlobalPts += ptsAwarded; correctCount++; }
            
            const displayValue = pick ? (['champion', 'secondPlace', 'thirdPlace'].includes(k) ? tt(pick) : pick) : '—';
            const actualValue = result?.actual ? (['champion', 'secondPlace', 'thirdPlace'].includes(k) ? tt(result.actual) : result.actual) : null;

            return (
              <div key={k} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px',
                padding: '8px 12px', borderRadius: '6px',
                background: hasResult ? (isCorrectPick ? 'rgba(0,255,136,0.06)' : 'rgba(255,50,50,0.04)') : 'rgba(255,255,255,0.02)',
                border: `1px solid ${hasResult ? (isCorrectPick ? 'rgba(0,255,136,0.25)' : 'rgba(255,50,50,0.15)') : 'rgba(255,255,255,0.05)'}`,
              }}>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>
                    {globalPickLabel(k)} ({maxPts} {t('pts')})
                  </div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                    {hasResult && (isCorrectPick ? '✅ ' : '❌ ')}
                    {displayValue}
                  </div>
                  {hasResult && actualValue && !isCorrectPick && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {t('result') || 'Result'}: <strong style={{ color: '#00ff88' }}>{actualValue}</strong>
                    </div>
                  )}
                </div>
                <div>
                  {hasResult && (
                    <span style={{
                      fontSize: '0.78rem', fontWeight: 'bold', padding: '3px 8px', borderRadius: '4px',
                      color: isCorrectPick ? '#00ff88' : '#ff5555',
                      background: isCorrectPick ? 'rgba(0,255,136,0.15)' : 'rgba(255,50,50,0.08)',
                    }}>
                      {isCorrectPick ? `+${ptsAwarded}` : '+0'}
                    </span>
                  )}
                  {!hasResult && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>⏳</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {viewingGlobalPickResults && Object.keys(viewingGlobalPickResults).length > 0 && (
          <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(144,76,255,0.08)', textAlign: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--secondary)' }}>
              🌍 {t('globalPredictions')}: +{totalGlobalPts} {t('pts')} ({correctCount}/6)
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="glass-card" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '8px' }}>
        <h3>🏆 {t('leaderboard')}</h3>
        {myLeagues.length > 0 && (
          <select className="input-glass" value={selectedLeague} onChange={e => setSelectedLeague(e.target.value)} style={{ width: 'auto', padding: '5px 10px', fontSize: '0.85rem' }}>
            {myLeagues.map(([id, l]) => <option key={id} value={id}>🏟️ {l.name}</option>)}
            <option value="all">🌍 {t('allLeagues')}</option>
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        <button onClick={() => setActiveTab('standings')} className={activeTab === 'standings' ? 'phase-tab active' : 'phase-tab'}>📊 {t('standings')}</button>
        <button onClick={() => setActiveTab('analytics')} className={activeTab === 'analytics' ? 'phase-tab active' : 'phase-tab'}>🎯 {t('analytics')}</button>
      </div>

      {activeTab === 'standings' && (<>
        {!isAdmin && !hasAnyLock && (
          <div style={{ padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)', fontSize: '0.78rem', color: '#FFB800' }}>
            🔓 {isWC ? t('lockMatchHint') : t('lockDayHint')}
          </div>
        )}

        {/* Hint */}
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '10px', textAlign: 'center' }}>
          💡 {t('clickPlayerRow') || 'Click on any player to view their predictions'}
        </div>

        {/* Admin: Recalculate + Sync */}
        {isAdmin && (
          <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={async () => {
              setRecalculating(true); setRecalcMsg(null);
              try {
                await recalculateAllPoints(competition.id);
                setRecalcMsg({ ok: true, msg: '✅ Points recalculated!' });
                setTimeout(() => setRecalcMsg(null), 5000);
              } catch (e) { setRecalcMsg({ ok: false, msg: e.message }); }
              setRecalculating(false);
            }} className="btn-outline" disabled={recalculating}
              style={{ padding: '5px 12px', fontSize: '0.75rem' }}>
              {recalculating ? '⏳ ...' : '🔄 Recalculate Points'}
            </button>
            <button onClick={async () => {
              setRecalculating(true); setRecalcMsg(null);
              try {
                const r = await syncLiveScores(competition.id);
                setRecalcMsg({ ok: r.success, msg: r.success ? r.message : r.error });
                setTimeout(() => setRecalcMsg(null), 8000);
              } catch (e) { setRecalcMsg({ ok: false, msg: e.message }); }
              setRecalculating(false);
            }} className="btn-outline" disabled={recalculating}
              style={{ padding: '5px 12px', fontSize: '0.75rem' }}>
              {recalculating ? '⏳ ...' : '📡 Sync Scores & Recalculate'}
            </button>
            {recalcMsg && (
              <span style={{ fontSize: '0.72rem', color: recalcMsg.ok ? '#00ff88' : '#ff5555' }}>
                {recalcMsg.msg}
              </span>
            )}
          </div>
        )}

        {/* Scrollable table */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', whiteSpace: 'nowrap' }}>#</th>
                <th style={{ textAlign: 'left', padding: '4px 8px', whiteSpace: 'nowrap' }}>{t('player')}</th>
                <th style={{ textAlign: 'center', padding: '4px 8px', whiteSpace: 'nowrap' }}>{t('pts').toUpperCase()}</th>
                <th style={{ textAlign: 'center', padding: '4px 8px', whiteSpace: 'nowrap' }} title={t('exact') || 'Exact scores'}>🎯</th>
                <th style={{ textAlign: 'center', padding: '4px 8px', whiteSpace: 'nowrap' }} title={t('correct') || 'Correct results'}>☑️</th>
                <th style={{ textAlign: 'center', padding: '4px 8px', whiteSpace: 'nowrap' }} title={t('globalPredictions') || 'Global picks bonus'}>🌍</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const isSelf = u.uid === currentUser?.uid;
                const bgColor = i === 0 ? 'rgba(255,215,0,0.08)' : i === 1 ? 'rgba(192,192,192,0.08)' : i === 2 ? 'rgba(205,127,50,0.08)' : 'rgba(255,255,255,0.02)';
                const borderColor = i < 3 ? `rgba(${i===0?'255,215,0':i===1?'192,192,192':'205,127,50'},0.2)` : 'transparent';
                // Everyone can click to view — but non-league members see limited info
                const clickable = true;
                return (
                  <tr key={u.uid} onClick={() => handleViewPredictions(u.uid, u.name)}
                    style={{ background: bgColor, borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = bgColor; }}>
                    <td style={{ padding: '10px 8px', fontWeight: 'bold', fontSize: '1rem', color: i===0?'gold':i===1?'silver':i===2?'#cd7f32':'var(--text-muted)', borderLeft: `3px solid ${borderColor}`, borderRadius: '8px 0 0 8px' }}>
                      #{i+1}
                    </td>
                    <td style={{ padding: '10px 8px', fontWeight: 'bold', fontSize: '0.88rem' }}>
                      {u.flag} {u.name}
                      {u.hidden && isAdmin && <span style={{ marginLeft: '6px', fontSize: '0.78rem', color: '#ff5555' }} title="Hidden from other users">👻</span>}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--primary)' }}>
                      {u.points}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#00ff88', fontWeight: 600 }}>{u.exact}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#FFB800', fontWeight: 600 }}>{u.correct || 0}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: u.globalPickPoints > 0 ? '#a855f7' : 'var(--text-muted)', borderRadius: '0 8px 8px 0' }}>
                      {u.globalPickPoints > 0 ? `+${u.globalPickPoints}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>)}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div>
          <h4 style={{ color: 'var(--primary)', marginBottom: '12px' }}>🎯 {t('exactScorePredictions')}</h4>
          {analyticsData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>{t('noExactScoresYet')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {analyticsData.map(({ match: m, actual, exactUsers }) => {
                const fmt = fmtTime(m.date, m.utc, userTZ, locale);
                return (
                  <div key={m.matchNumber} className="glass-card" style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                      <div style={{ fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>#{m.matchNumber} </span>
                        <b>{tt(m.team1)}</b> vs <b>{tt(m.team2)}</b>
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)' }}>{actual.score1} - {actual.score2}</div>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>📅 {fmt.fullDate}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {exactUsers.map((name, j) => (
                        <span key={j} style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600 }}>✅ {name}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* View predictions modal */}
      {viewingUser && createPortal(
        <div className="rules-modal-overlay" onClick={closeModal}>
          <div className="rules-modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>
            <button className="rules-modal-close" onClick={closeModal}>✕</button>
            <h3 style={{ marginBottom: '4px' }}>👤 {viewingUser.name}{t('usersPredictions')}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '16px' }}>
              {isAdmin && <span style={{ color: '#FFB800' }}>{t('adminModeEdit')}</span>}
            </p>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
              <button 
                onClick={() => setModalTab('matches')} 
                className={modalTab === 'matches' ? 'phase-tab active' : 'phase-tab'}
                style={{ fontSize: '0.85rem', padding: '6px 12px' }}
              >
                ⚽ {lang === 'hr' ? 'Utakmice' : 'Matches'}
              </button>
              <button 
                onClick={() => setModalTab('global')} 
                className={modalTab === 'global' ? 'phase-tab active' : 'phase-tab'}
                style={{ fontSize: '0.85rem', padding: '6px 12px' }}
              >
                🌍 {lang === 'hr' ? 'Globalna predviđanja' : 'Global Predictions'}
              </button>
            </div>
            {loadingPreds ? <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>⏳ {t('loading')}</div>
            : (
              <div ref={modalScrollContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '65vh', overflowY: 'auto' }}>
                {/* Global picks with correct/incorrect breakdown */}
                {modalTab === 'global' && renderGlobalPicksSection()}

                {/* Match predictions */}
                {modalTab === 'matches' && (() => {
                  if (Object.keys(viewingPreds).length === 0) {
                    return <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>{t('noPredictionsYet')}</div>;
                  }
                  const predictedMatches = matches.filter(m => viewingPreds[m.matchNumber]);
                  const visiblePreds = predictedMatches.filter(m => {
                    if (isAdmin) return true;
                    if (viewingUser.uid === currentUser?.uid) return true;

                    // Finished matches are always visible
                    const isFinished = matchResults[`match_${m.matchNumber}`]?.status === 'finished';
                    if (isFinished) return true;

                    // Started matches are always visible
                    const started = now >= new Date(`${m.date}T${m.utc}:00Z`).getTime();
                    if (started) return true;

                    // Unfinished matches require locks from both players
                    if (isWC) {
                      return !!viewingUserLocks[m.matchNumber] && !!myLockedMatches[m.matchNumber];
                    }
                    const fmt = formatPLMatchTime(m.date, m.utc, userTZ, locale);
                    return !!viewingUserLocks[fmt.dateKey] && !!myLockedDays[fmt.dateKey];
                  });

                  if (visiblePreds.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        🔒 {t('predictionsLocked') || 'Match predictions are locked or not yet visible.'}
                      </div>
                    );
                  }
                  // Sort descending (newest match on top)
                  const sortedVisiblePreds = [...visiblePreds].sort((a, b) => {
                    const dateTimeA = `${a.date}T${a.utc || '00:00'}`;
                    const dateTimeB = `${b.date}T${b.utc || '00:00'}`;
                    if (dateTimeA !== dateTimeB) return dateTimeB.localeCompare(dateTimeA);
                    return b.matchNumber - a.matchNumber;
                  });

                  const hiddenCount = predictedMatches.length - visiblePreds.length;

                  return (
                    <>
                      {hiddenCount > 0 && (
                        <div style={{
                          padding: '8px 12px', borderRadius: '6px', fontSize: '0.78rem', textAlign: 'center',
                          background: 'rgba(255,184,0,0.03)', border: '1px solid rgba(255,184,0,0.12)',
                          color: '#FFB800', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                        }}>
                          🔒 {lang === 'hr' ? `Neka buduća predviđanja (${hiddenCount}) su skrivena jer nisu zaključana.` : `${hiddenCount} future prediction(s) are hidden because they are not locked.`}
                        </div>
                      )}
                      {sortedVisiblePreds.map(m => renderPredRow(m))}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        </div>, document.body)}
    </div>
  );
}
