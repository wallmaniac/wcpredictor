import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { database } from '../config/firebase';
import { ref, onValue, get, set, remove } from 'firebase/database';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import { ALL_MATCHES, calculatePoints, formatMatchTime, resolveKnockoutMatches } from '../utils/matchData';
import { PL_2526_MATCHES, calculatePLPoints, formatPLMatchTime } from '../utils/plMatchData';
import { recalculateAllPoints, syncLiveScores } from '../services/liveScoreService';

// External helper to satisfy React Compiler purity check regarding Date.now()
async function saveAdminPredictionLeaderboardExternal(database, fbPath, uid, mn, s1, s2, qualifier) {
  const data = {
    score1: parseInt(s1, 10),
    score2: parseInt(s2, 10),
    timestamp: Date.now(),
    editedByAdmin: true
  };
  if (qualifier) {
    data.qualifier = qualifier;
  }
  await set(ref(database, `${fbPath}/users/${uid}/predictions/${mn}`), data);
}

// Static start dates to prevent recreating Date objects on every render pass
const WC_START_DATE = new Date('2026-06-11T19:00:00Z');
const PL_START_DATE = new Date('2025-08-16T00:00:00Z');
export default function Leaderboard() {
  const { t, tt, ts, lang } = useLanguage();
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
  const [stats, setStats] = useState({ scorers: [], assists: [], cleanSheets: [] });
  const [globalResults, setGlobalResults] = useState({});
  const [showSimulated, setShowSimulated] = useState(false);
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
  const [selectedLiveMatchNumber, setSelectedLiveMatchNumber] = useState(null);

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
  const matchesRaw = isWC ? ALL_MATCHES : PL_2526_MATCHES;
  const matches = useMemo(() => {
    if (!isWC) return matchesRaw;
    return resolveKnockoutMatches(matchesRaw, matchResults);
  }, [matchesRaw, matchResults, isWC]);
  const calcPts = isWC ? calculatePoints : calculatePLPoints;

  const defaultMatchNumber = useMemo(() => {
    // 1. Find live match
    const live = matches.filter(m => {
      const actual = matchResults[`match_${m.matchNumber}`];
      const kickoff = new Date(`${m.date}T${m.utc}:00Z`).getTime();
      const started = now >= kickoff;
      return actual?.status === 'live' || (started && (now - kickoff < 130 * 60 * 1000));
    });
    if (live.length > 0) return live[0].matchNumber;

    // 2. Find next upcoming match
    const upcoming = matches.filter(m => {
      const actual = matchResults[`match_${m.matchNumber}`];
      const isFinished = actual?.status === 'finished';
      const kickoff = new Date(`${m.date}T${m.utc}:00Z`).getTime();
      return !isFinished && kickoff > now;
    });
    if (upcoming.length > 0) {
      upcoming.sort((a, b) => {
        const kickoffA = new Date(`${a.date}T${a.utc}:00Z`).getTime();
        const kickoffB = new Date(`${b.date}T${b.utc}:00Z`).getTime();
        return kickoffA - kickoffB;
      });
      return upcoming[0].matchNumber;
    }

    // 3. Fallback: last finished match
    const finished = matches.filter(m => matchResults[`match_${m.matchNumber}`]?.status === 'finished');
    if (finished.length > 0) {
      finished.sort((a, b) => {
        const kickoffA = new Date(`${a.date}T${a.utc}:00Z`).getTime();
        const kickoffB = new Date(`${b.date}T${b.utc}:00Z`).getTime();
        return kickoffB - kickoffA; // newest first
      });
      return finished[0].matchNumber;
    }

    return matches[0]?.matchNumber || 1;
  }, [matches, matchResults, now]);

  const currentLiveMatchNumber = selectedLiveMatchNumber !== null ? selectedLiveMatchNumber : defaultMatchNumber;
  const selectedMatch = useMemo(() => {
    return matches.find(m => m.matchNumber === currentLiveMatchNumber) || matches[0];
  }, [matches, currentLiveMatchNumber]);

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
        globalPicks: u.globalPicks || {},
        globalPicksLocked: u.globalPicksLocked === true,
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
            globalPicks: c.globalPicks || {},
            globalPicksLocked: c.globalPicksLocked === true,
          } : u;
        }));
      });
    }
    const u2 = onValue(ref(database, 'wc2026/leagues'), s => setLeagues(s.exists() ? s.val() : {}));
    const u5 = onValue(ref(database, `${fbPath}/match_results`), s => setMatchResults(s.exists() ? s.val() : {}));
    const uStats = onValue(ref(database, `${fbPath}/statistics`), s => setStats(s.exists() ? s.val() : { scorers: [], assists: [], cleanSheets: [] }));
    const uGlobResults = onValue(ref(database, `${fbPath}/metadata/globalResults`), s => setGlobalResults(s.exists() ? s.val() : {}));
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
    return () => { u1(); u1b(); u2(); u3(); u4(); u4b(); u5(); uStats(); uGlobResults(); window.removeEventListener('select-league', h); };
  }, [fbPath, isWC, currentUser]);

  const filtered = useMemo(() => {
    const visibleUsers = users.filter(u => !u.hidden || u.uid === currentUser?.uid);
    
    let mapped = visibleUsers;
    if (showSimulated && isWC) {
      // Calculate clean sheets in real-time
      const teamCleanSheets = {};
      const matchesList = isWC ? ALL_MATCHES : PL_2526_MATCHES;
      Object.entries(matchResults).forEach(([mId, res]) => {
        if (res && res.isPlayed && res.status === 'finished') {
          const mNum = parseInt(mId.replace('match_', ''), 10);
          const matchObj = matchesList.find(m => m.matchNumber === mNum);
          if (matchObj) {
            const s1 = res.score1;
            const s2 = res.score2;
            if (s2 === 0) {
              teamCleanSheets[matchObj.team1] = (teamCleanSheets[matchObj.team1] || 0) + 1;
            }
            if (s1 === 0) {
              teamCleanSheets[matchObj.team2] = (teamCleanSheets[matchObj.team2] || 0) + 1;
            }
          }
        }
      });

      const getWinners = (list) => {
        const arr = Array.isArray(list) ? list : Object.values(list || {});
        const valid = arr.filter(p => p && p.name && (p.count || 0) > 0);
        if (valid.length === 0) return [];
        const max = Math.max(...valid.map(p => p.count));
        return valid.filter(p => p.count === max).map(p => p.name);
      };

      const getGKWinners = (list) => {
        const arr = Array.isArray(list) ? list : Object.values(list || {});
        // Update clean sheets count dynamically based on teamCleanSheets
        const updated = arr.map(p => ({
          ...p,
          count: p ? (teamCleanSheets[p.team] || 0) : 0
        }));
        const valid = updated.filter(p => p && p.name && (p.count || 0) > 0);
        if (valid.length === 0) return [];
        const max = Math.max(...valid.map(p => p.count));
        return valid.filter(p => p.count === max).map(p => p.name);
      };

      const scorerWinners = getWinners(stats.scorers);
      const assistWinners = getWinners(stats.assists);
      const gkWinners = getGKWinners(stats.cleanSheets);

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

      const simplify = (str) => {
        if (!str) return '';
        return str.toString().toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]/g, "").trim();
      };

      const isMatch = (pick, actual) => {
        if (!pick || !actual) return false;
        const p = simplify(pick);
        const a = simplify(actual);
        if (p === a) return true;
        
        // 1. Levenshtein edit distance
        const dist = levenshteinDistance(p, a);
        const minLen = Math.min(p.length, a.length);
        const threshold = minLen < 5 ? 1 : minLen < 8 ? 2 : 3;
        if (dist <= threshold) return true;
        
        // 2. Word-by-word comparison
        const getWords = (name) => {
          return name.toString().toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .split(/[^a-z0-9]/)
            .filter(w => w.length > 0);
        };
        
        const wordsA = getWords(pick);
        const wordsB = getWords(actual);
        
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

      mapped = visibleUsers.map(u => {
        let simGP = 0;
        const gp = u.globalPicks || {};
        const isGPListLocked = u.globalPicksLocked === true || isAfterStart;
        if (isGPListLocked) {
          if (globalResults.champion && isMatch(gp.champion, globalResults.champion)) simGP += 10;
          if (globalResults.secondPlace && isMatch(gp.secondPlace, globalResults.secondPlace)) simGP += 5;
          if (globalResults.thirdPlace && isMatch(gp.thirdPlace, globalResults.thirdPlace)) simGP += 5;
          if (scorerWinners.length > 0 && gp.topScorer && scorerWinners.some(w => isMatch(gp.topScorer, w))) simGP += 5;
          const assistPick = gp.topHighlight || gp.topAssist;
          if (assistWinners.length > 0 && assistPick && assistWinners.some(w => isMatch(assistPick, w))) simGP += 5;
          if (gkWinners.length > 0 && gp.topGoalkeeper && gkWinners.some(w => isMatch(gp.topGoalkeeper, w))) simGP += 5;
        }
        return {
          ...u,
          simulatedPoints: u.matchPoints + simGP,
          simulatedGlobalPoints: simGP
        };
      });
    }

    const sorted = [...mapped].sort((a, b) => {
      const ptsA = showSimulated && isWC ? a.simulatedPoints : a.points;
      const ptsB = showSimulated && isWC ? b.simulatedPoints : b.points;
      if (ptsB !== ptsA) return ptsB - ptsA;
      return b.exact - a.exact;
    });

    if (selectedLeague !== 'all') {
      const league = leagues[selectedLeague];
      if (league?.members) return sorted.filter(u => Object.keys(league.members).includes(u.uid));
    }
    return sorted;
  }, [users, currentUser?.uid, selectedLeague, leagues, showSimulated, stats, globalResults, isWC, isAfterStart, matchResults]);

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

  const handleAdminEditPred = async (uid, mn, s1, s2, qualifier) => {
    if (!isAdmin) return;

    const s1Empty = s1 === '' || s1 === null || s1 === undefined;
    const s2Empty = s2 === '' || s2 === null || s2 === undefined;

    // If both are empty, delete
    if (s1Empty && s2Empty) {
      try {
        await remove(ref(database, `${fbPath}/users/${uid}/predictions/${mn}`));
        await recalculateAllPoints(competition.id);
        setViewingPreds(p => {
          const updated = { ...p };
          delete updated[mn];
          return updated;
        });
      } catch (err) {
        console.error(err);
      }
      return;
    }

    // If only one is empty, update local state only
    if (s1Empty || s2Empty) {
      setViewingPreds(p => ({
        ...p,
        [mn]: {
          ...(p[mn] || {}),
          score1: s1Empty ? '' : parseInt(s1, 10),
          score2: s2Empty ? '' : parseInt(s2, 10),
        }
      }));
      return;
    }

    const finalQualifier = qualifier !== undefined ? qualifier : (viewingPreds[mn]?.qualifier || null);

    // Both are filled, save
    try {
      await saveAdminPredictionLeaderboardExternal(database, fbPath, uid, mn, s1, s2, finalQualifier);
      await recalculateAllPoints(competition.id);
      setViewingPreds(p => ({ ...p, [mn]: { score1: parseInt(s1, 10), score2: parseInt(s2, 10), qualifier: finalQualifier, editedByAdmin: true } }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdminEditQualifier = async (uid, mn, qualifier) => {
    if (!isAdmin) return;
    const pred = viewingPreds[mn];
    if (!pred || pred.score1 === undefined || pred.score2 === undefined || pred.score1 === '' || pred.score2 === '') return;

    try {
      await saveAdminPredictionLeaderboardExternal(database, fbPath, uid, mn, pred.score1, pred.score2, qualifier);
      await recalculateAllPoints(competition.id);
      setViewingPreds(p => ({
        ...p,
        [mn]: {
          ...p[mn],
          qualifier,
          editedByAdmin: true
        }
      }));
    } catch (err) {
      console.error(err);
    }
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
    if (activeTab === 'analytics' || activeTab === 'live_predictions') {
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
      const resolvedMatchObj = matches.find(x => x.matchNumber === m.matchNumber);
      const team1Resolved = resolvedMatchObj?.team1 || m.team1;
      const team2Resolved = resolvedMatchObj?.team2 || m.team2;

      const exactUsers = [];
      Object.entries(allUserPreds).forEach(([uid, uData]) => {
        const pred = uData.predictions?.[m.matchNumber];
        if (pred && pred.score1 === actual.score1 && pred.score2 === actual.score2) {
          const userName = users.find(u => u.uid === uid)?.name || uData.displayName || 'Unknown';
          
          let missedQualifier = false;
          let predictedQualifier = null;
          let actualQualifierResolved = null;
          
          const isDraw = pred.score1 === pred.score2;
          const isKnockout = m.stage !== 'Group Stage';
          
          if (isKnockout && isDraw) {
            const actualWinner = actual.winner || actual.penaltyWinner;
            let actualWinnerResolved = actualWinner;
            if (actualWinner === 'team1' || actualWinner === m.team1) {
              actualWinnerResolved = team1Resolved;
            } else if (actualWinner === 'team2' || actualWinner === m.team2) {
              actualWinnerResolved = team2Resolved;
            } else if (actualWinner) {
              if (actualWinner === m.team1) actualWinnerResolved = team1Resolved;
              else if (actualWinner === m.team2) actualWinnerResolved = team2Resolved;
            }
            
            if (actual.penaltyWinner) {
              if (actual.penaltyWinner === m.team1) actualWinnerResolved = team1Resolved;
              else if (actual.penaltyWinner === m.team2) actualWinnerResolved = team2Resolved;
            }
            
            predictedQualifier = pred.qualifier;
            let predictedQualifierResolved = predictedQualifier;
            if (predictedQualifier === m.team1) predictedQualifierResolved = team1Resolved;
            else if (predictedQualifier === m.team2) predictedQualifierResolved = team2Resolved;
            
            if (actualWinnerResolved && (!predictedQualifierResolved || predictedQualifierResolved !== actualWinnerResolved)) {
              missedQualifier = true;
            }
            actualQualifierResolved = actualWinnerResolved;
            predictedQualifier = predictedQualifierResolved;
          }

          exactUsers.push({
            name: userName,
            isKnockoutDraw: isKnockout && isDraw,
            missedQualifier,
            predictedQualifier,
            actualQualifier: actualQualifierResolved
          });
        }
      });
      return exactUsers.length > 0 ? { match: resolvedMatchObj || m, actual, exactUsers } : null;
    }).filter(Boolean);
  }, [allUserPreds, finishedMatches, matchResults, users, matches]);

  const liveOrNextMatchesData = useMemo(() => {
    // 1. Find all live matches (kickoff has passed, and started less than 130 minutes ago)
    const live = matches.filter(m => {
      const actual = matchResults[`match_${m.matchNumber}`];
      const kickoff = new Date(`${m.date}T${m.utc}:00Z`).getTime();
      const started = now >= kickoff;
      return actual?.status === 'live' || (started && (now - kickoff < 130 * 60 * 1000));
    });

    if (live.length > 0) {
      return { type: 'live', matches: live };
    }

    // 2. If no live matches, find next match(es) to be played
    const upcoming = matches.filter(m => {
      const actual = matchResults[`match_${m.matchNumber}`];
      const isFinished = actual?.status === 'finished';
      const kickoff = new Date(`${m.date}T${m.utc}:00Z`).getTime();
      return !isFinished && kickoff > now;
    });

    if (upcoming.length === 0) {
      return { type: 'none', matches: [] };
    }

    // Sort upcoming ascending by kickoff time
    upcoming.sort((a, b) => {
      const kickoffA = new Date(`${a.date}T${a.utc}:00Z`).getTime();
      const kickoffB = new Date(`${b.date}T${b.utc}:00Z`).getTime();
      return kickoffA - kickoffB;
    });

    const nextKickoff = new Date(`${upcoming[0].date}T${upcoming[0].utc}:00Z`).getTime();
    const next = upcoming.filter(m => {
      const kickoff = new Date(`${m.date}T${m.utc}:00Z`).getTime();
      return kickoff === nextKickoff;
    });

    return { type: 'next', matches: next };
  }, [matches, matchResults, now]);

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
    const pts = isFinished ? calcPts(pred, actual, m) : 0;
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
              <input type="number" min="0" value={pred?.score1 ?? ''} className="input-glass score-input"
                key={`s1_${viewingUser.uid}_${m.matchNumber}`}
                style={{ width: '40px', padding: '4px', textAlign: 'center', fontSize: '0.85rem' }}
                onChange={e => {
                  const val = e.target.value;
                  setViewingPreds(p => ({
                    ...p,
                    [m.matchNumber]: {
                      ...(p[m.matchNumber] || {}),
                      score1: val === '' ? '' : parseInt(val, 10)
                    }
                  }));
                }}
                onBlur={e => handleAdminEditPred(viewingUser.uid, m.matchNumber, e.target.value, pred?.score2 ?? '')}
                id={`adm_${viewingUser.uid}_${m.matchNumber}_s1`} />
              <span style={{ color: 'var(--text-muted)' }}>-</span>
              <input type="number" min="0" value={pred?.score2 ?? ''} className="input-glass score-input"
                key={`s2_${viewingUser.uid}_${m.matchNumber}`}
                style={{ width: '40px', padding: '4px', textAlign: 'center', fontSize: '0.85rem' }}
                onChange={e => {
                  const val = e.target.value;
                  setViewingPreds(p => ({
                    ...p,
                    [m.matchNumber]: {
                      ...(p[m.matchNumber] || {}),
                      score2: val === '' ? '' : parseInt(val, 10)
                    }
                  }));
                }}
                onBlur={e => handleAdminEditPred(viewingUser.uid, m.matchNumber, pred?.score1 ?? '', e.target.value)}
                id={`adm_${viewingUser.uid}_${m.matchNumber}_s2`} />
              {isWC && m.stage !== 'Group Stage' && pred && pred.score1 !== undefined && pred.score1 === pred.score2 && pred.score1 !== '' && (
                <select
                  className="input-glass"
                  value={pred.qualifier || ''}
                  onChange={e => handleAdminEditQualifier(viewingUser.uid, m.matchNumber, e.target.value || null)}
                  style={{ 
                    fontSize: '0.72rem', 
                    padding: '2px 4px', 
                    marginLeft: '4px', 
                    height: '24px', 
                    color: pred.qualifier ? 'var(--primary)' : '#FFB800',
                    border: `1px solid ${pred.qualifier ? 'rgba(0,255,136,0.3)' : 'rgba(255,184,0,0.3)'}`,
                    borderRadius: '4px',
                    cursor: 'pointer',
                    maxWidth: '100px'
                  }}
                >
                  <option value="">{lang === 'hr' ? 'Prolaz?' : 'Progress?'}</option>
                  <option value={m.team1}>{tt(m.team1)}</option>
                  <option value={m.team2}>{tt(m.team2)}</option>
                </select>
              )}
              {pred && (pred.score1 !== undefined && pred.score2 !== undefined && pred.score1 !== '' && pred.score2 !== '') && (
                <button onClick={async () => {
                  const confirmMsg = lang === 'hr' ? `⚠️ Izbrisati predviđanje za utakmicu #${m.matchNumber}?` : `⚠️ Delete prediction for match #${m.matchNumber}?`;
                  if (window.confirm(confirmMsg)) {
                    await handleAdminEditPred(viewingUser.uid, m.matchNumber, '', '');
                  }
                }} style={{
                  background: 'transparent', border: 'none', color: '#ff5555', cursor: 'pointer',
                  fontSize: '0.9rem', padding: '0 4px', display: 'flex', alignItems: 'center'
                }} title={t('delete') || 'Delete'}>🗑️</button>
              )}
            </>
          ) : (
            <span style={{
              fontWeight: 'bold', fontSize: '1rem', padding: '2px 8px', borderRadius: '6px',
              color: isExact ? '#00ff88' : isCorrect ? '#FFB800' : isFinished ? '#ff5555' : 'var(--primary)',
              background: isExact ? 'rgba(0,255,136,0.12)' : isCorrect ? 'rgba(255,184,0,0.08)' : isFinished ? 'rgba(255,50,50,0.06)' : 'transparent',
            }}>
              {isExact && '✅ '}{isCorrect && '☑️ '}{isFinished && !isExact && !isCorrect && '❌ '}
              {pred?.score1} - {pred?.score2}
              {m.stage !== 'Group Stage' && pred?.score1 === pred?.score2 && pred?.qualifier && (
                <span style={{ fontSize: '0.8rem', opacity: 0.8, marginLeft: '4px', fontStyle: 'italic', color: '#FFB800' }}>
                  ({isWC ? tt(pred.qualifier) : pred.qualifier})
                </span>
              )}
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isWC && (
            <button 
              onClick={() => setShowSimulated(p => !p)} 
              className={showSimulated ? "btn-primary" : "btn-outline"}
              style={{
                padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px',
                background: showSimulated ? 'rgba(168,85,247,0.2)' : 'none',
                color: showSimulated ? '#c084fc' : '#a855f7',
                border: showSimulated ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(168,85,247,0.25)',
                fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                boxShadow: showSimulated ? '0 0 10px rgba(168,85,247,0.2)' : 'none'
              }}
            >
              🔮 {showSimulated 
                ? (lang === 'hr' ? 'Stvarna tablica' : 'Real Table') 
                : (lang === 'hr' ? 'Simuliraj globalne' : 'Simulate Global')}
            </button>
          )}
          {myLeagues.length > 0 && (
            <select className="input-glass" value={selectedLeague} onChange={e => setSelectedLeague(e.target.value)} style={{ width: 'auto', padding: '5px 10px', fontSize: '0.85rem' }}>
              {myLeagues.map(([id, l]) => <option key={id} value={id}>🏟️ {l.name}</option>)}
              <option value="all">🌍 {t('allLeagues')}</option>
            </select>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', width: '100%' }}>
        <button 
          onClick={() => setActiveTab('standings')} 
          className={activeTab === 'standings' ? 'phase-tab active' : 'phase-tab'}
          style={{ flex: 1, minWidth: 0, whiteSpace: 'normal', padding: '6px 4px', fontSize: '0.75rem', textAlign: 'center', lineHeight: '1.2' }}
        >
          📊 {t('standings')}
        </button>
        <button 
          onClick={() => setActiveTab('analytics')} 
          className={activeTab === 'analytics' ? 'phase-tab active' : 'phase-tab'}
          style={{ flex: 1, minWidth: 0, whiteSpace: 'normal', padding: '6px 4px', fontSize: '0.75rem', textAlign: 'center', lineHeight: '1.2' }}
        >
          🎯 {t('analytics')}
        </button>
        <button 
          onClick={() => setActiveTab('live_predictions')} 
          className={activeTab === 'live_predictions' ? 'phase-tab active' : 'phase-tab'}
          style={{ flex: 1, minWidth: 0, whiteSpace: 'normal', padding: '6px 4px', fontSize: '0.75rem', textAlign: 'center', lineHeight: '1.2' }}
        >
          🔴 {t('livePredictions')}
        </button>
      </div>

      {activeTab === 'standings' && (<>
        {showSimulated && isWC && (
          <div style={{ 
            background: 'rgba(168,85,247,0.1)', 
            border: '1px solid rgba(168,85,247,0.3)', 
            padding: '10px 14px', 
            borderRadius: '8px', 
            marginBottom: '12px', 
            fontSize: '0.82rem', 
            color: '#d8b4fe',
            lineHeight: 1.4
          }}>
            🔮 <b>{lang === 'hr' ? 'Simulirana tablica aktivna:' : 'Simulated Leaderboard Active:'}</b>{' '}
            {lang === 'hr'
              ? 'Bodovi iz globalnih prognoza su privremeno dodijeljeni na temelju trenutnih vodećih igrača na tablici statistike.'
              : 'Global prediction points are temporarily awarded based on the current Player Stats leaders.'}
          </div>
        )}
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
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem', color: showSimulated && isWC ? '#c084fc' : 'var(--primary)' }}>
                      {showSimulated && isWC ? u.simulatedPoints : u.points}
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#00ff88', fontWeight: 600 }}>{u.exact}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', color: '#FFB800', fontWeight: 600 }}>{u.correct || 0}</td>
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.82rem', fontWeight: 600, color: (showSimulated && isWC ? u.simulatedGlobalPoints : u.globalPickPoints) > 0 ? (showSimulated ? '#c084fc' : '#a855f7') : 'var(--text-muted)', borderRadius: '0 8px 8px 0' }}>
                      {(showSimulated && isWC ? u.simulatedGlobalPoints : u.globalPickPoints) > 0 ? `+${showSimulated && isWC ? u.simulatedGlobalPoints : u.globalPickPoints}` : '—'}
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
                      {exactUsers.map((u, j) => {
                        if (u.isKnockoutDraw) {
                          if (u.missedQualifier) {
                            const predictedTeam = u.predictedQualifier ? tt(u.predictedQualifier) : (lang === 'hr' ? 'bez prolaza' : 'no progress pick');
                            const label = lang === 'hr' ? `prolaz: ${predictedTeam} ❌` : `progress: ${predictedTeam} ❌`;
                            return (
                              <span key={j} style={{ 
                                background: 'rgba(255,184,0,0.1)', 
                                color: '#FFB800', 
                                padding: '2px 8px', 
                                borderRadius: '10px', 
                                fontSize: '0.72rem', 
                                fontWeight: 600,
                                border: '1px solid rgba(255,184,0,0.25)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                ✅ {u.name} <span style={{ opacity: 0.8, fontSize: '0.65rem', fontWeight: 'normal' }}>({label})</span>
                              </span>
                            );
                          } else {
                            const predictedTeam = u.predictedQualifier ? tt(u.predictedQualifier) : '';
                            const label = lang === 'hr' ? `prolaz: ${predictedTeam}` : `progress: ${predictedTeam}`;
                            return (
                              <span key={j} style={{ 
                                background: 'rgba(0,255,136,0.15)', 
                                color: '#00ff88', 
                                padding: '2px 8px', 
                                borderRadius: '10px', 
                                fontSize: '0.72rem', 
                                fontWeight: 600,
                                border: '1px solid rgba(0,255,136,0.4)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                ✅✅ {u.name} <span style={{ opacity: 0.85, fontSize: '0.65rem', fontWeight: 'normal', color: '#00ff88' }}>({label})</span>
                              </span>
                            );
                          }
                        }
                        return (
                          <span key={j} style={{ background: 'rgba(0,255,136,0.1)', color: '#00ff88', padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600 }}>✅ {u.name}</span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Live Predictions Tab */}
      {activeTab === 'live_predictions' && (() => {
        if (Object.keys(allUserPreds).length === 0) {
          return (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
              ⏳ {t('loading') || 'Loading...'}
            </div>
          );
        }

        if (!selectedMatch) {
          return (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
              {lang === 'hr' ? 'Nema dostupnih utakmica.' : 'No matches available.'}
            </div>
          );
        }

        const actual = matchResults[`match_${selectedMatch.matchNumber}`];
        const kickoff = new Date(`${selectedMatch.date}T${selectedMatch.utc}:00Z`).getTime();
        const started = now >= kickoff;
        const isLive = actual?.status === 'live' || (started && !actual) || (started && actual?.status === 'live');
        const isFinished = actual?.status === 'finished';
        const fmt = fmtTime(selectedMatch.date, selectedMatch.utc, userTZ, locale);

        // Group matches for select dropdown grouping (optgroup)
        const groupedMatches = [];
        const seenStages = new Set();
        matches.forEach(m => {
          const stageName = isWC ? ts(m.stage) : `${t('matchday') || 'Matchday'} ${m.matchday}`;
          if (!seenStages.has(stageName)) {
            seenStages.add(stageName);
            groupedMatches.push({
              stageName,
              matches: matches.filter(x => (isWC ? ts(x.stage) : `${t('matchday') || 'Matchday'} ${x.matchday}`) === stageName)
            });
          }
        });

        const showPointsCol = started || isFinished;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Match selector dropdown */}
            <div style={{ marginBottom: '4px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {lang === 'hr' ? 'Odaberi utakmicu za prognoze:' : 'Select match for predictions:'}
              </label>
              <div style={{ position: 'relative' }}>
                <select 
                  className="input-glass" 
                  value={currentLiveMatchNumber} 
                  onChange={e => setSelectedLiveMatchNumber(Number(e.target.value))}
                  style={{ 
                    width: '100%', 
                    fontSize: '0.9rem', 
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: '1px solid var(--glass-border)',
                    boxShadow: 'var(--shadow-glass)',
                  }}
                >
                  {groupedMatches.map(group => (
                    <optgroup key={group.stageName} label={group.stageName}>
                      {group.matches.map(m => {
                        const mActual = matchResults[`match_${m.matchNumber}`];
                        const mLive = mActual?.status === 'live' || (now >= new Date(`${m.date}T${m.utc}:00Z`).getTime() && mActual?.status !== 'finished');
                        const mFinished = mActual?.status === 'finished';
                        
                        let statusIndicator = '';
                        if (mLive) statusIndicator = '🔴 ';
                        else if (mFinished) statusIndicator = '✅ ';
                        
                        const t1 = isWC ? tt(m.team1) : m.team1;
                        const t2 = isWC ? tt(m.team2) : m.team2;
                        const scoreStr = mFinished && mActual ? ` (${mActual.score1} - ${mActual.score2})` : '';

                        return (
                          <option key={m.matchNumber} value={m.matchNumber} style={{ color: '#fff', fontWeight: 'normal' }}>
                            {statusIndicator}#{m.matchNumber} • {t1} vs {t2}{scoreStr}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Match Card */}
            <div className="glass-card" style={{ padding: '16px', border: isLive ? '1px solid rgba(255,184,0,0.3)' : (isFinished ? '1px solid rgba(0,255,136,0.2)' : '1px solid var(--glass-border)') }}>
              {/* Match Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>#{selectedMatch.matchNumber} • {fmt.fullDate}</span>
                  <h4 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
                    {isWC ? tt(selectedMatch.team1) : selectedMatch.team1} vs {isWC ? tt(selectedMatch.team2) : selectedMatch.team2}
                  </h4>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isLive && (
                    <>
                      <span style={{ background: 'rgba(255,50,50,0.15)', color: '#ff5555', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid rgba(255,50,50,0.3)' }}>
                        🔴 LIVE {actual?.liveMinute ? `(${actual.liveMinute})` : ''}
                      </span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#FFB800' }}>
                        {actual?.score1 ?? 0} - {actual?.score2 ?? 0}
                      </span>
                    </>
                  )}
                  {isFinished && (
                    <>
                      <span style={{ background: 'rgba(0,255,136,0.15)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid rgba(0,255,136,0.3)' }}>
                        ✅ {lang === 'hr' ? 'ZAVRŠENO' : 'FINISHED'}
                      </span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--primary)' }}>
                        {actual?.score1 ?? 0} - {actual?.score2 ?? 0}
                      </span>
                    </>
                  )}
                  {!isLive && !isFinished && (
                    <span style={{ background: 'rgba(0,180,255,0.15)', color: '#00B4FF', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid rgba(0,180,255,0.3)' }}>
                      ⏳ {lang === 'hr' ? 'SLJEDEĆA' : 'UPCOMING'}
                    </span>
                  )}
                </div>
              </div>

              {/* Predictions List */}
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', minWidth: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('player')}</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px' }}>{t('prediction') || 'Prediction'}</th>
                      {showPointsCol && <th style={{ textAlign: 'center', padding: '6px 8px' }}>{lang === 'hr' ? 'Bodovi' : 'Points'}</th>}
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>{lang === 'hr' ? 'Status' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(u => {
                      const isSelf = u.uid === currentUser?.uid;
                      const pred = allUserPreds[u.uid]?.predictions?.[selectedMatch.matchNumber];
                      const targetLocks = allUserPreds[u.uid]?.[isWC ? 'lockedMatches' : 'lockedDays'] || {};
                      const isTargetLocked = isWC ? !!targetLocks[selectedMatch.matchNumber] : !!targetLocks[fmt.dateKey];
                      const myLocks = isWC ? myLockedMatches : myLockedDays;
                      const isMyLocked = isWC ? !!myLocks[selectedMatch.matchNumber] : !!myLocks[fmt.dateKey];

                      const canSee = isAdmin || isSelf || started || isLive || isFinished || (isTargetLocked && isMyLocked);
                      const hasPredicted = pred !== undefined && pred !== null;

                      let predText = '—';
                      let statusText = lang === 'hr' ? 'Nije zaključano' : 'Not locked';
                      let statusColor = 'var(--text-muted)';
                      let livePts = 0;

                      if (isFinished) {
                        statusText = lang === 'hr' ? 'Završeno' : 'Finished';
                        statusColor = 'var(--text-muted)';
                      } else if (isTargetLocked || isLive) {
                        statusText = lang === 'hr' ? 'Zaključano' : 'Locked';
                        statusColor = '#00ff88';
                      }

                      if (!hasPredicted) {
                        predText = lang === 'hr' ? 'Bez prognoze' : 'No prediction';
                        statusText = lang === 'hr' ? 'Nije prognozirano' : 'Not predicted';
                        statusColor = 'rgba(255,50,50,0.5)';
                      } else if (canSee) {
                        let qText = '';
                        if (selectedMatch.stage !== 'Group Stage' && pred.score1 === pred.score2 && pred.qualifier) {
                          qText = ` (${isWC ? tt(pred.qualifier) : pred.qualifier})`;
                        }
                        predText = `${pred.score1} - ${pred.score2}${qText}`;
                        if ((isLive || isFinished) && actual) {
                          livePts = calcPts(pred, actual, selectedMatch);
                        }
                      } else {
                        predText = '🔒';
                        if (!isMyLocked) {
                          statusText = lang === 'hr' ? 'Zaključajte za prikaz' : 'Lock yours to view';
                          statusColor = '#FFB800';
                        }
                      }

                      return (
                        <tr key={u.uid} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                          <td style={{ padding: '8px', fontWeight: 600 }}>
                            {u.flag} {u.name} {isSelf && <span style={{ color: 'var(--primary)', fontSize: '0.7rem' }}>({lang === 'hr' ? 'Vi' : 'You'})</span>}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '0.9rem', color: canSee && hasPredicted ? 'var(--primary)' : 'var(--text-muted)' }}>
                            {predText}
                          </td>
                          {showPointsCol && (
                            <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>
                              {hasPredicted && canSee && livePts > 0 ? (
                                <span style={{ color: livePts === 3 ? '#00ff88' : '#FFB800', background: livePts === 3 ? 'rgba(0,255,136,0.1)' : 'rgba(255,184,0,0.08)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                                  +{livePts} {t('pts')}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>0 {t('pts')}</span>
                              )}
                            </td>
                          )}
                          <td style={{ padding: '8px', textAlign: 'right', color: statusColor, fontSize: '0.75rem', fontWeight: 600 }}>
                            {statusText}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

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
                  if (!isAdmin && Object.keys(viewingPreds).length === 0) {
                    return <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>{t('noPredictionsYet')}</div>;
                  }
                  const predictedMatches = isAdmin 
                    ? matches 
                    : matches.filter(m => viewingPreds[m.matchNumber]);
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
