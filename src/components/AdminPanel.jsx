import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import { database } from '../config/firebase';
import { ref, get, set, update, remove, onValue, push } from 'firebase/database';
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../config/firebase';
import { ALL_MATCHES, calculatePoints, formatMatchTime, resolveKnockoutMatches } from '../utils/matchData';
import { PL_2526_MATCHES, calculatePLPoints, formatPLMatchTime } from '../utils/plMatchData';
import { translateTeam, translateStage } from '../utils/translations';
import { syncLiveScores, recalculateAllPoints, syncPlayerStats, syncStandings } from '../services/liveScoreService';
import { TIMEZONE_LIST } from '../utils/timezones';

// External helper functions to satisfy React Compiler purity check regarding Date.now()
async function confirmPaymentExternal(database, lid, uid, entryFee, currentUserUid) {
  await set(ref(database, `wc2026/leagues/${lid}/payments/${uid}`), {
    amount: entryFee || 0,
    status: 'confirmed',
    method: 'bank_transfer',
    confirmedBy: currentUserUid,
    confirmedAt: Date.now()
  });
}

async function saveAdminPredictionExternal(database, path, uid, matchNum, s1, s2) {
  await set(ref(database, `${path}/users/${uid}/predictions/${matchNum}`), {
    score1: parseInt(s1, 10),
    score2: parseInt(s2, 10),
    timestamp: Date.now(),
    editedByAdmin: true
  });
}

function removeDiacritics(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\./g, '')
    .trim();
}


export default function AdminPanel() {
  const { currentUser, isAdmin, isSuperAdmin } = useAuth();
  const { t, tt, ts, lang } = useLanguage();
  const { competition } = useCompetition();
  const [adminTab, setAdminTab] = useState('scores');
  const [users, setUsers] = useState({});
  const [leagues, setLeagues] = useState({});
  const [selectedMatch, setSelectedMatch] = useState('');
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [matchResults, setMatchResults] = useState({});
  const [updateLeaderboardOnStatsSave, setUpdateLeaderboardOnStatsSave] = useState(false);
  const [matchSearchQuery, setMatchSearchQuery] = useState('');
  const [importingCat, setImportingCat] = useState(null);
  const [importText, setImportText] = useState('');
  const autoSelectInitialized = useRef(false);
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncRound, setSyncRound] = useState('');
  const [newLeagueName, setNewLeagueName] = useState('');
  const [newLeagueDesc, setNewLeagueDesc] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  // Player stats editor
  const [editStats, setEditStats] = useState({ scorers: [], assists: [], cleanSheets: [] });
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [globalResults, setGlobalResults] = useState({});
  // New user creation
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserName, setNewUserName] = useState('');
  // League assignment
  const [assignLeague, setAssignLeague] = useState('');
  // Entry fee for league creation
  const [newLeagueFee, setNewLeagueFee] = useState('20');
  const [newLeagueCurrency, setNewLeagueCurrency] = useState('EUR');
  const [newLeaguePrizes, setNewLeaguePrizes] = useState('100');
  const [assignUser, setAssignUser] = useState('');
  // User detail modal
  const [selectedUser, setSelectedUser] = useState(null); // { uid, data }
  const [userPreds, setUserPreds] = useState({});
  const [editTZ, setEditTZ] = useState('');
  const [adminMemberSearch, setAdminMemberSearch] = useState('');
  const [editName, setEditName] = useState('');
  const [editHidden, setEditHidden] = useState(false);
  const [loadingUser, setLoadingUser] = useState(false);
  const [userViewComp, setUserViewComp] = useState('wc2026');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [predFilter, setPredFilter] = useState('predicted');
  const [predSearch, setPredSearch] = useState('');
  const [predLimit, setPredLimit] = useState(50);
  const [allUserLocks, setAllUserLocks] = useState({}); // { uid: { dateKey: timestamp } }
  const modalRef = useRef(null);
  const [viewCompFixtures, setViewCompFixtures] = useState({});
  const [viewCompResults, setViewCompResults] = useState({});

  useEffect(() => {
    if (!selectedUser || !userViewComp) return;
    const path = userViewComp === 'wc2026' ? 'wc2026' : 'pl2526';
    const unsub1 = onValue(ref(database, `${path}/fixtures`), s => {
      setViewCompFixtures(s.exists() ? s.val() : {});
    });
    const unsub2 = onValue(ref(database, `${path}/match_results`), s => {
      setViewCompResults(s.exists() ? s.val() : {});
    });
    return () => {
      unsub1();
      unsub2();
      setViewCompFixtures({});
      setViewCompResults({});
    };
  }, [selectedUser, userViewComp]);



  const fbPath = competition.firebasePath;
  const isWC = competition.id === 'wc2026';
  const matchList = isWC ? ALL_MATCHES : PL_2526_MATCHES;

  useEffect(() => {
    autoSelectInitialized.current = false;
    setSelectedMatch('');
  }, [competition.id]);

  useEffect(() => {
    const unsub1 = onValue(ref(database, 'wc2026/users'), s => setUsers(s.exists() ? s.val() : {}));
    const unsub2 = onValue(ref(database, 'wc2026/leagues'), s => setLeagues(s.exists() ? s.val() : {}));
    // Load global results from competition-specific path
    const grPath = isWC ? 'wc2026/metadata/globalResults' : `${fbPath}/metadata/globalResults`;
    get(ref(database, grPath)).then(s => { if (s.exists()) setGlobalResults(s.val()); });
    get(ref(database, 'wc2026/metadata/apiKey')).then(s => { if (s.exists()) setApiKeyInput(s.val()); });
    // Load all users' locked days/matches + globalPicks for the list view
    const unsub3 = onValue(ref(database, `${fbPath}/users`), s => {
      if (!s.exists()) return;
      const all = s.val();
      const locks = {};
      Object.entries(all).forEach(([uid, u]) => {
        const lockData = u.lockedMatches || u.lockedDays;
        if (lockData) locks[uid] = lockData;
      });
      setAllUserLocks(locks);
      // Merge globalPicks and globalPicksLocked into wc2026/users data
      if (!isWC) {
        setUsers(prev => {
          const merged = { ...prev };
          Object.entries(all).forEach(([uid, u]) => {
            if (merged[uid]) {
              merged[uid] = { ...merged[uid], globalPicks: u.globalPicks || {}, globalPicksLocked: u.globalPicksLocked };
            }
          });
          return merged;
        });
      }
    });
    const unsub4 = onValue(ref(database, `${fbPath}/match_results`), s => {
      setMatchResults(s.exists() ? s.val() : {});
    });
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  }, [fbPath, isWC]);

  useEffect(() => {
    if (selectedMatch) {
      const res = matchResults[`match_${selectedMatch}`];
      if (res) {
        setScore1(res.score1 !== null && res.score1 !== undefined ? String(res.score1) : '');
        setScore2(res.score2 !== null && res.score2 !== undefined ? String(res.score2) : '');
      } else {
        setScore1('');
        setScore2('');
      }
    } else {
      setScore1('');
      setScore2('');
    }
  }, [selectedMatch, matchResults]);

  useEffect(() => {
    if (selectedMatch && adminTab === 'scores') {
      setTimeout(() => {
        const element = document.getElementById(`admin-match-${selectedMatch}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    }
  }, [selectedMatch, adminTab]);

  useEffect(() => {
    if (adminTab === 'scores' && Object.keys(matchResults).length > 0 && !selectedMatch && !autoSelectInitialized.current) {
      const firstUnplayed = matchList.find(m => !matchResults[`match_${m.matchNumber}`]?.isPlayed);
      if (firstUnplayed) {
        setSelectedMatch(String(firstUnplayed.matchNumber));
      } else if (matchList.length > 0) {
        setSelectedMatch(String(matchList[0].matchNumber));
      }
      autoSelectInitialized.current = true;
    }
  }, [adminTab, matchResults, matchList, selectedMatch]);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };

  const tabs = [
    { id: 'scores', label: '⚽ ' + t('manualScore') },
    { id: 'users', label: '👥 ' + t('userManagement') },
    { id: 'leagues', label: '🏟️ ' + t('leagueManagement') },
    { id: 'api', label: '🔄 ' + t('apiSetupTitle') },
    { id: 'playerstats', label: '📊 ' + (lang === 'hr' ? 'Statistika igrača' : 'Player Stats') },
    { id: 'global', label: '🏆 ' + (isWC ? t('setTournamentResults') : t('setSeasonResults')) },
  ];

  // Score
  const handleSaveScore = async () => {
    if (!selectedMatch || score1 === '' || score2 === '') return;
    await set(ref(database, `${fbPath}/match_results/match_${selectedMatch}`), {
      score1: parseInt(score1), score2: parseInt(score2), status: 'finished', isPlayed: true, updatedAt: Date.now()
    });
    await recalculateAllPoints(competition.id);
    showMsg(lang === 'hr' ? `✅ Utakmica ${selectedMatch} spremljena!` : `✅ Match ${selectedMatch} saved!`);

    // Automatically select the next unplayed match
    const currentIdx = matchList.findIndex(m => String(m.matchNumber) === String(selectedMatch));
    if (currentIdx !== -1) {
      let nextUnplayed = matchList.slice(currentIdx + 1).find(m => {
        const res = matchResults[`match_${m.matchNumber}`];
        return !res?.isPlayed && String(m.matchNumber) !== String(selectedMatch);
      });
      if (!nextUnplayed) {
        nextUnplayed = matchList.slice(0, currentIdx).find(m => {
          const res = matchResults[`match_${m.matchNumber}`];
          return !res?.isPlayed && String(m.matchNumber) !== String(selectedMatch);
        });
      }
      if (nextUnplayed) {
        setSelectedMatch(String(nextUnplayed.matchNumber));
      }
    }
  };

  // Clear a single match result
  const handleClearResult = async () => {
    if (!selectedMatch) return;
    if (!window.confirm(`${t('confirmClearResult')} #${selectedMatch} (${competition.shortName})?`)) return;
    await remove(ref(database, `${fbPath}/match_results/match_${selectedMatch}`));
    await recalculateAllPoints(competition.id);
    showMsg(`🗑️ [${competition.shortName}] ` + (lang === 'hr' ? `Rezultat utakmice ${selectedMatch} obrisan!` : `Match ${selectedMatch} result cleared!`));
  };

  // Clear ALL results
  const handleClearAllResults = async () => {
    if (!window.confirm(t('confirmClearAllResults'))) return;
    if (!window.confirm(t('finalClearWarning'))) return;
    await remove(ref(database, `${fbPath}/match_results`));
    // Also clear any API fixtures for this competition to restore hardcoded schedule
    await remove(ref(database, `${fbPath}/fixtures`));
    await recalculateAllPoints(competition.id);
    showMsg(`🗑️ [${competition.shortName}] ` + (lang === 'hr' ? `Svi rezultati utakmica i API raspored obrisani!` : `All match results and API fixtures cleared!`));
  };

  const handleSync = async () => {
    setSyncing(true);
    const options = syncRound ? { matchday: parseInt(syncRound, 10) } : {};
    const result = await syncLiveScores(competition.id, options);
    showMsg(result.success ? `✅ ${result.message}` : `❌ ${result.error}`);
    setSyncing(false);
  };

  // User management
  const handleToggleAdmin = async (uid) => {
    const user = users[uid];
    const currentRole = user.role || 'user';
    let newRole;
    if (currentRole === 'user') {
      newRole = 'admin';
    } else if (currentRole === 'admin') {
      newRole = isSuperAdmin ? 'superadmin' : 'user';
    } else if (currentRole === 'superadmin') {
      newRole = 'user';
    } else {
      newRole = 'admin';
    }
    try {
      await update(ref(database, `wc2026/users/${uid}`), { role: newRole });
      if (newRole === 'admin' || newRole === 'superadmin') await set(ref(database, `admins/${uid}`), true);
      else await remove(ref(database, `admins/${uid}`));
      showMsg(`${users[uid]?.displayName || uid}: role → ${newRole}`);
    } catch (err) {
      console.error(err);
      showMsg(`❌ Error: ${err.message}`);
    }
  };

  const handleDeleteUser = async (uid) => {
    if (!window.confirm(t('deleteConfirm'))) return;
    try {
      await remove(ref(database, `wc2026/users/${uid}`));
      await remove(ref(database, `admins/${uid}`));
      for (const lid in leagues) {
        if (leagues[lid].members?.[uid]) await remove(ref(database, `wc2026/leagues/${lid}/members/${uid}`));
      }
      showMsg(lang === 'hr' ? '🗑️ Korisnik obrisan!' : '🗑️ User deleted!');
    } catch (err) {
      console.error(err);
      showMsg(`❌ Error: ${err.message}`);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPass || !newUserName) return;
    try {
      const cred = await createUserWithEmailAndPassword(auth, newUserEmail, newUserPass);
      await set(ref(database, `wc2026/users/${cred.user.uid}`), {
        email: newUserEmail, displayName: newUserName, role: 'user',
        createdAt: Date.now(), createdBy: currentUser.uid
      });
      showMsg(lang === 'hr' ? `✅ Korisnik ${newUserName} kreiran!` : `✅ User ${newUserName} created!`);
      setNewUserEmail(''); setNewUserPass(''); setNewUserName('');
    } catch (e) { showMsg(`❌ ${e.message}`); }
  };

  const handleTriggerPasswordReset = async (email, displayName) => {
    const confirmMsg = lang === 'hr'
      ? `⚠️ Jeste li sigurni da želite poslati email za ponovno postavljanje lozinke korisniku ${displayName || email}?`
      : `⚠️ Are you sure you want to send a password reset email to ${displayName || email}?`;
    if (!window.confirm(confirmMsg)) return;
    try {
      await sendPasswordResetEmail(auth, email);
      showMsg(lang === 'hr' ? `✅ Email za resetiranje lozinke poslan korisniku ${displayName || email}!` : `✅ Password reset email sent to ${displayName || email}!`);
    } catch (e) {
      showMsg(`❌ ${e.message}`);
    }
  };

  // League management
  const handleCreateLeague = async () => {
    if (!newLeagueName.trim()) return;
    const fee = parseFloat(newLeagueFee) || 0;
    const prizeSplits = newLeaguePrizes.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    const prizeDistribution = {};
    prizeSplits.forEach((pct, i) => { prizeDistribution[i + 1] = pct; });
    const newRef = push(ref(database, 'wc2026/leagues'));
    await set(newRef, {
      name: newLeagueName.trim(), description: newLeagueDesc.trim(),
      createdBy: currentUser.uid, createdByName: users[currentUser.uid]?.displayName || currentUser.email,
      createdAt: Date.now(), members: { [currentUser.uid]: true },
      entryFee: fee, currency: newLeagueCurrency,
      platformFeePercent: 0,
      prizeDistribution,
      payments: {}
    });
    setNewLeagueName(''); setNewLeagueDesc(''); setNewLeagueFee('20'); setNewLeaguePrizes('100');
    showMsg(`✅ ${t('leagueCreated')}`);
  };

  const handleAssignUserToLeague = async () => {
    if (!assignLeague || !assignUser) return;
    await set(ref(database, `wc2026/leagues/${assignLeague}/members/${assignUser}`), true);
    showMsg(lang === 'hr' ? '✅ Korisnik dodijeljen u ligu!' : '✅ User assigned to league!');
    setAssignUser('');
  };

  const handleAssignAllUsersToLeague = async () => {
    if (!assignLeague) return;
    const league = leagues[assignLeague];
    if (!league) return;
    const confirmMsg = lang === 'hr'
      ? `Jeste li sigurni da želite dodati SVE registrirane korisnike u ligu "${league.name}"?`
      : `Are you sure you want to add ALL registered users to the league "${league.name}"?`;
    if (!window.confirm(confirmMsg)) return;

    const updates = {};
    Object.keys(users).forEach(uid => {
      updates[`wc2026/leagues/${assignLeague}/members/${uid}`] = true;
    });

    await update(ref(database), updates);
    showMsg(lang === 'hr' ? '✅ Svi korisnici su dodani u ligu!' : '✅ All users added to the league!');
  };

  const handleRemoveMember = async (lid, uid) => await remove(ref(database, `wc2026/leagues/${lid}/members/${uid}`));
  const handleDeleteLeague = async (lid) => {
    const confirmMsg = lang === 'hr' ? 'Obrisati ligu?' : 'Delete league?';
    if (window.confirm(confirmMsg)) await remove(ref(database, `wc2026/leagues/${lid}`));
  };

  const handleConfirmPayment = async (lid, uid) => {
    await confirmPaymentExternal(database, lid, uid, leagues[lid]?.entryFee, currentUser.uid);
    showMsg(lang === 'hr' ? '✅ Uplata potvrđena!' : '✅ Payment confirmed!');
  };

  const handleUnconfirmPayment = async (lid, uid) => {
    await remove(ref(database, `wc2026/leagues/${lid}/payments/${uid}`));
  };

  const calcPrizePool = (league) => {
    const fee = league.entryFee || 0;
    if (fee === 0) return null;
    const paidCount = league.payments ? Object.values(league.payments).filter(p => p.status === 'confirmed').length : 0;
    const gross = fee * paidCount;
    const net = gross;
    return { gross, processorFee: 0, platformFee: 0, net, paidCount, currency: league.currency || 'EUR' };
  };

  // API Key
  const handleSaveApiKey = async () => {
    await set(ref(database, 'wc2026/metadata/apiKey'), apiKeyInput.trim());
    setApiKeySaved(true); setTimeout(() => setApiKeySaved(false), 3000);
  };

  // Player stats editor
  const loadPlayerStats = async () => {
    const statsSnap = await get(ref(database, `${fbPath}/statistics`));
    if (statsSnap.exists()) {
      const s = statsSnap.val();
      setEditStats({
        scorers: Array.isArray(s.scorers) ? s.scorers : (s.scorers ? Object.values(s.scorers) : []),
        assists: Array.isArray(s.assists) ? s.assists : (s.assists ? Object.values(s.assists) : []),
        cleanSheets: Array.isArray(s.cleanSheets) ? s.cleanSheets : (s.cleanSheets ? Object.values(s.cleanSheets) : []),
      });
    }
    setStatsLoaded(true);
  };

  const savePlayerStats = async () => {
    const sorted = {
      scorers: [...editStats.scorers].sort((a, b) => (b.count || 0) - (a.count || 0)),
      assists: [...editStats.assists].sort((a, b) => (b.count || 0) - (a.count || 0)),
      cleanSheets: [...editStats.cleanSheets].sort((a, b) => (b.count || 0) - (a.count || 0)),
      lastSynced: Date.now(),
    };
    await set(ref(database, `${fbPath}/statistics`), sorted);

    if (updateLeaderboardOnStatsSave) {
      // Auto-update global results with leaders (clearing them if lists are empty)
      const globalResultsUpdates = {
        topScorer: "",
        topAssist: "",
        topGoalkeeper: ""
      };
      if (sorted.scorers.length > 0) {
        const maxG = sorted.scorers[0].count;
        globalResultsUpdates.topScorer = sorted.scorers.filter(s => s.count === maxG).map(s => s.name).join(', ');
      }
      if (sorted.assists.length > 0) {
        const maxA = sorted.assists[0].count;
        globalResultsUpdates.topAssist = sorted.assists.filter(a => a.count === maxA).map(a => a.name).join(', ');
      }
      if (sorted.cleanSheets.length > 0) {
        const maxCS = sorted.cleanSheets[0].count;
        globalResultsUpdates.topGoalkeeper = sorted.cleanSheets.filter(c => c.count === maxCS).map(c => c.name).join(', ');
      }

      const grRef = ref(database, `${fbPath}/metadata/globalResults`);
      const grSnap = await get(grRef);
      const existing = grSnap.exists() ? grSnap.val() : {};
      
      // Update global results with new values (empty strings will clear deleted categories)
      await set(grRef, { ...existing, ...globalResultsUpdates });
      await recalculateAllPoints(competition.id);
      
      showMsg(lang === 'hr' ? '✅ Statistika spremljena i poredak preračunat!' : '✅ Player stats saved & leaderboard updated!');
    } else {
      showMsg(lang === 'hr' ? '✅ Statistika spremljena (poredak nije preračunat)!' : '✅ Player stats saved (leaderboard not updated)!');
    }
  };

  const parsePastedStats = (text) => {
    if (!text) return [];
    const lines = text.split('\n');
    const results = [];
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      
      // Remove leading numbering like "1. ", "1) ", "[1] "
      line = line.replace(/^\d+[\.\)\s\]\-]+/g, '').trim();
      
      let name = '';
      let team = '';
      let count = 0;
      
      // Try format: Name (Team) - Count or Name (Team) Count
      const parenMatch = line.match(/^([^\(]+)\(([^\)]+)\)[\s\-]*(\d+)/);
      if (parenMatch) {
        name = parenMatch[1].trim();
        team = parenMatch[2].trim();
        count = parseInt(parenMatch[3], 10) || 0;
      } else {
        // Try CSV/TSV/comma separated or dash separated: "Name, Team, Count"
        const parts = line.split(/[,;\t]|\s-\s/).map(s => s.trim());
        if (parts.length >= 3) {
          name = parts[0];
          team = parts[1];
          count = parseInt(parts[2], 10) || 0;
        } else if (parts.length === 2) {
          const maybeCount = parseInt(parts[1], 10);
          if (!isNaN(maybeCount)) {
            name = parts[0];
            count = maybeCount;
          } else {
            name = parts[0];
            team = parts[1];
          }
        } else {
          // Fallback: try last word as number
          const tokens = line.split(/\s+/);
          if (tokens.length >= 2) {
            const lastToken = tokens[tokens.length - 1];
            const maybeCount = parseInt(lastToken, 10);
            if (!isNaN(maybeCount)) {
              count = maybeCount;
              if (tokens.length >= 3) {
                team = tokens[tokens.length - 2];
                name = tokens.slice(0, tokens.length - 2).join(' ');
              } else {
                name = tokens[0];
              }
            } else {
              name = line;
            }
          } else {
            name = line;
          }
        }
      }
      
      if (name) {
        results.push({ name, team, count });
      }
    }
    return results;
  };

  const addStatRow = (category) => {
    setEditStats(prev => ({
      ...prev,
      [category]: [...prev[category], { name: '', team: '', count: 0 }],
    }));
  };

  const updateStatRow = (category, idx, field, value) => {
    setEditStats(prev => {
      const arr = [...prev[category]];
      arr[idx] = { ...arr[idx], [field]: field === 'count' ? (parseInt(value) || 0) : value };
      return { ...prev, [category]: arr };
    });
  };

  const removeStatRow = (category, idx) => {
    setEditStats(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== idx),
    }));
  };



  // Open user detail modal
  const handleOpenUser = async (uid) => {
    setLoadingUser(true);
    let data = { ...(users[uid] || {}) };
    // Also load competition-specific data (locks, globalPicks)
    try {
      const compSnap = await get(ref(database, `${fbPath}/users/${uid}`));
      if (compSnap.exists()) {
        const compData = compSnap.val();
        data = { ...data, lockedMatches: compData.lockedMatches || {}, lockedDays: compData.lockedDays || {}, globalPicks: compData.globalPicks || {}, globalPicksLocked: compData.globalPicksLocked };
      }
    } catch (e) { console.error(e); }
    setSelectedUser({ uid, data });
    setEditName(data?.displayName || '');
    setEditTZ(data?.timezone || '');
    setEditHidden(data?.hidden === true);
    setUserViewComp(competition.id);
    setPredFilter('predicted');
    setPredSearch('');
    setPredLimit(50);
    await loadUserPreds(uid, fbPath);
    setLoadingUser(false);
    setTimeout(() => { if (modalRef.current) modalRef.current.scrollTop = 0; }, 50);
  };

  // Unlock ALL locks for a user from the list
  const handleUnlockAllDays = async (uid) => {
    const confirmMsg = lang === 'hr' ? '⚠️ Otključati SVA predviđanja za ovog korisnika?' : '⚠️ Unlock ALL predictions for this user?';
    if (!window.confirm(confirmMsg)) return;
    try {
      await remove(ref(database, `${fbPath}/users/${uid}/lockedDays`));
      await remove(ref(database, `${fbPath}/users/${uid}/lockedMatches`));
      showMsg(lang === 'hr' ? '🔓 Sva zaključavanja uklonjena!' : '🔓 All locks removed!');
    } catch (err) {
      console.error(err);
      showMsg(`❌ Error: ${err.message}`);
    }
  };

  const loadUserPreds = async (uid, path) => {
    const predSnap = await get(ref(database, `${path}/users/${uid}/predictions`));
    let data = {};
    if (predSnap.exists()) {
      const val = predSnap.val();
      if (Array.isArray(val)) {
        val.forEach((item, idx) => {
          if (item) data[idx] = item;
        });
      } else {
        data = val || {};
      }
    }
    setUserPreds(data);
  };

  const handleAdminSaveProfile = async () => {
    if (!selectedUser) return;
    await update(ref(database, `wc2026/users/${selectedUser.uid}`), {
      displayName: editName.trim(), timezone: editTZ,
      hidden: editHidden,
    });
    setSelectedUser(prev => prev && prev.uid === selectedUser.uid ? {
      ...prev,
      data: { ...prev.data, displayName: editName.trim(), timezone: editTZ, hidden: editHidden }
    } : prev);
    showMsg(lang === 'hr' ? `✅ Profil ažuriran za ${editName}` : `✅ Profile updated for ${editName}`);
  };

  const handleAdminEditPred = async (matchNum, s1, s2) => {
    if (!selectedUser) return;
    const compId = userViewComp;
    const path = compId === 'wc2026' ? 'wc2026' : 'pl2526';
    
    const s1Empty = s1 === '' || s1 === null || s1 === undefined;
    const s2Empty = s2 === '' || s2 === null || s2 === undefined;

    // If both scores are empty, delete the prediction
    if (s1Empty && s2Empty) {
      setUserPreds(p => {
        const updated = { ...p };
        delete updated[matchNum];
        return updated;
      });
      try {
        await remove(ref(database, `${path}/users/${selectedUser.uid}/predictions/${matchNum}`));
        await recalculateAllPoints(compId);
      } catch (err) {
        console.error(err);
        showMsg(`❌ Error: ${err.message}`);
        await loadUserPreds(selectedUser.uid, path);
      }
      return;
    }
    
    // If only one score is empty, do not save to DB yet, but keep the partial local state
    if (s1Empty || s2Empty) {
      setUserPreds(p => ({
        ...p,
        [matchNum]: {
          ...(p[matchNum] || {}),
          score1: s1Empty ? '' : parseInt(s1, 10),
          score2: s2Empty ? '' : parseInt(s2, 10),
        }
      }));
      return;
    }
    
    // Optimistically update local state synchronously first
    setUserPreds(p => ({
      ...p,
      [matchNum]: {
        ...(p[matchNum] || {}),
        score1: parseInt(s1, 10),
        score2: parseInt(s2, 10),
        editedByAdmin: true
      }
    }));

    try {
      await saveAdminPredictionExternal(database, path, selectedUser.uid, matchNum, s1, s2);
      await recalculateAllPoints(compId);
    } catch (err) {
      console.error(err);
      showMsg(`❌ Error: ${err.message}`);
      // Revert local state to matches database on failure
      await loadUserPreds(selectedUser.uid, path);
    }
  };

  const handleSwitchUserComp = async (compId) => {
    if (!selectedUser) return;
    setUserViewComp(compId);
    setPredFilter('predicted');
    setPredSearch('');
    setPredLimit(50);
    const path = compId === 'wc2026' ? 'wc2026' : 'pl2526';
    await loadUserPreds(selectedUser.uid, path);
    // Also reload lock data for the selected competition
    try {
      const compSnap = await get(ref(database, `${path}/users/${selectedUser.uid}`));
      if (compSnap.exists()) {
        const compData = compSnap.val();
        setSelectedUser(prev => ({
          ...prev,
          data: {
            ...prev.data,
            lockedMatches: compData.lockedMatches || {},
            lockedDays: compData.lockedDays || {},
            globalPicks: compData.globalPicks || {},
            globalPicksLocked: compData.globalPicksLocked,
          }
        }));
      }
    } catch (e) { console.error('Failed to reload lock data:', e); }
  };

  const groupMatchesByStage = () => {
    const stages = {};
    matchList.forEach(m => { if (!stages[m.stage]) stages[m.stage] = []; stages[m.stage].push(m); });
    return stages;
  };

  const cs = { padding: '16px', marginBottom: '15px' };

  return (
    <div className="admin-panel-mobile">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '8px' }}>
        <h2 className="text-gradient-primary" style={{ fontSize: '1.2rem' }}>{t('adminPanel')}</h2>
        {isSuperAdmin && <span style={{ background: 'rgba(255,215,0,0.15)', color: 'gold', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>👑 {t('superadmin')}</span>}
      </div>

      {msg && <div style={{ background: 'rgba(0,255,136,0.1)', color: 'var(--primary)', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem' }}>{msg}</div>}

      <div className="admin-tabs-scroll">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setAdminTab(tab.id)}
            className={adminTab === tab.id ? 'admin-tab active' : 'admin-tab'}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* SCORES */}
      {adminTab === 'scores' && (
        <div>
          <div className="glass-card" style={cs}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '10px', fontSize: '0.95rem' }}>🔄 {t('liveScoreSync')} — {competition.shortName}</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '12px', fontSize: '0.8rem' }}>
              {lang === 'hr'
                ? `Dohvaća rezultate utakmica s apifootball.com i ažurira rezultate i bodove za ${competition.shortName}.`
                : `Fetches match results from apifootball.com and updates scores + points for ${competition.shortName}.`}
            </p>
            {/* Round/Matchday selector */}
            {!isWC && (
              <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {lang === 'hr' ? '📅 Kolo:' : '📅 Matchday:'}
                </label>
                <select
                  className="input-glass"
                  value={syncRound}
                  onChange={e => setSyncRound(e.target.value)}
                  style={{ width: 'auto', minWidth: '140px', fontSize: '0.85rem' }}
                >
                  <option value="">{lang === 'hr' ? 'Sva kola' : 'All rounds'}</option>
                  {[37, 38].map(r => (
                    <option key={r} value={r}>
                      {lang === 'hr' ? `Kolo ${r}` : `Matchday ${r}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="admin-form-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <button onClick={handleSync} className="btn-primary" disabled={syncing} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                {syncing ? `⏳ ${t('syncing')}` : (lang === 'hr'
                  ? `🔄 Sinkroniziraj rezultate${syncRound ? ` (kolo ${syncRound})` : ''} za ${competition.shortName}`
                  : `🔄 Sync ${competition.shortName} Scores${syncRound ? ` (MD ${syncRound})` : ''}`)}
              </button>
              <button onClick={async () => { setSyncing(true); const r = await syncPlayerStats(competition.id); showMsg(r.success ? r.message : `❌ ${r.error}`); setSyncing(false); }} className="btn-outline" disabled={syncing} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                {syncing ? '⏳ ...' : (lang === 'hr' ? '📊 Sinkroniziraj statistiku' : '📊 Sync Stats')}
              </button>
              <button onClick={async () => { setSyncing(true); const r = await syncStandings(competition.id); showMsg(r.success ? r.message : `❌ ${r.error}`); setSyncing(false); }} className="btn-outline" disabled={syncing} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                {syncing ? '⏳ ...' : (lang === 'hr' ? '📋 Sinkroniziraj tablicu' : '📋 Sync Table')}
              </button>
              <button onClick={async () => { setSyncing(true); await recalculateAllPoints(competition.id); showMsg(lang === 'hr' ? '✅ Bodovi preračunati!' : '✅ Points recalculated!'); setSyncing(false); }} className="btn-outline" disabled={syncing} style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                {syncing ? '⏳ ...' : (lang === 'hr' ? '🔢 Preračunaj bodove' : '🔢 Recalculate Points')}
              </button>
            </div>
            {isWC && (
              <p style={{ color: '#FFB800', fontSize: '0.72rem', marginTop: '8px' }}>
                {lang === 'hr'
                  ? `ℹ️ Raspored za SP je tvrdo kodiran. "Sinkroniziraj rezultate" samo ažurira rezultate završenih utakmica.`
                  : `ℹ️ WC schedule is hardcoded. "Sync Scores" only updates finished match results.`}
              </p>
            )}
          </div>
          <div className="glass-card" style={cs}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.95rem' }}>📝 {t('manualScore')} — {competition.shortName}</h3>
            
            {/* Search Input for Matches */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                type="text"
                className="input-glass"
                placeholder={lang === 'hr' ? 'Traži utakmicu (npr. Brazil, 1, Group Stage)...' : 'Search match (e.g. Brazil, 1, Group Stage)...'}
                value={matchSearchQuery}
                onChange={e => setMatchSearchQuery(e.target.value)}
                style={{ fontSize: '0.82rem', padding: '8px 12px', flex: 1 }}
              />
              {matchSearchQuery && (
                <button 
                  onClick={() => setMatchSearchQuery('')} 
                  className="btn-outline" 
                  style={{ padding: '0 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              {/* Match List column */}
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column' }}>
                <div 
                  style={{ 
                    maxHeight: '320px', 
                    overflowY: 'auto', 
                    background: 'rgba(0,0,0,0.25)', 
                    borderRadius: '8px', 
                    border: '1px solid var(--glass-border)',
                    padding: '6px'
                  }}
                  className="custom-scrollbar"
                >
                  {(() => {
                    const filteredMatches = matchList.filter(m => {
                      const q = removeDiacritics(matchSearchQuery);
                      if (!q) return true;
                      return removeDiacritics(m.team1 || '').includes(q) || 
                             removeDiacritics(m.team2 || '').includes(q) || 
                             removeDiacritics(m.stage || '').includes(q) ||
                             String(m.matchNumber).includes(q);
                    });

                    return (
                      <>
                        {filteredMatches.map(m => {
                          const isSelected = String(m.matchNumber) === String(selectedMatch);
                          const res = matchResults[`match_${m.matchNumber}`];
                          const isPlayed = res?.isPlayed;
                          return (
                            <div 
                              key={m.matchNumber} 
                              id={`admin-match-${m.matchNumber}`}
                              onClick={() => setSelectedMatch(String(m.matchNumber))}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                borderRadius: '6px',
                                background: isSelected 
                                  ? 'rgba(0, 255, 136, 0.15)' 
                                  : isPlayed 
                                    ? 'rgba(255, 255, 255, 0.02)' 
                                    : 'rgba(255, 255, 255, 0.05)',
                                border: isSelected 
                                  ? '1px solid var(--primary)' 
                                  : '1px solid rgba(255, 255, 255, 0.05)',
                                cursor: 'pointer',
                                marginBottom: '5px',
                                transition: 'all 0.15s ease',
                                fontSize: '0.82rem'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ 
                                  background: isPlayed ? 'rgba(0, 255, 136, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                                  color: isPlayed ? 'var(--primary)' : 'var(--text-muted)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '0.7rem',
                                  fontWeight: 'bold'
                                }}>
                                  #{m.matchNumber}
                                </span>
                                <span style={{ color: isSelected ? '#fff' : 'var(--text-main)', fontWeight: isSelected ? 'bold' : 'normal' }}>
                                  {tt(m.team1)} vs {tt(m.team2)}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {isPlayed ? (
                                  <span style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
                                    {res.score1} - {res.score2}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                    {lang === 'hr' ? 'neodigrano' : 'unplayed'}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {filteredMatches.length === 0 && (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '15px', textAlign: 'center', margin: 0 }}>
                            {lang === 'hr' ? 'Nema pronađenih utakmica.' : 'No matches found.'}
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Score Input form column */}
              <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.01)', padding: '14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                {selectedMatch ? (
                  <>
                    <div style={{ marginBottom: '12px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--primary)', textAlign: 'center' }}>
                      {(() => {
                        const m = matchList.find(x => String(x.matchNumber) === String(selectedMatch));
                        return m ? `#${m.matchNumber} : ${tt(m.team1)} - ${tt(m.team2)}` : `#${selectedMatch}`;
                      })()}
                    </div>
                    <div className="admin-score-row" style={{ justifyContent: 'center', marginBottom: '12px' }}>
                      <input type="number" className="input-glass" placeholder={t('homeScore')} value={score1} onChange={e => setScore1(e.target.value)} min="0" style={{ width: '65px', padding: '8px', textAlign: 'center', fontSize: '0.95rem' }} />
                      <span style={{ color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '1.2rem' }}>-</span>
                      <input type="number" className="input-glass" placeholder={t('awayScore')} value={score2} onChange={e => setScore2(e.target.value)} min="0" style={{ width: '65px', padding: '8px', textAlign: 'center', fontSize: '0.95rem' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={handleSaveScore} className="btn-primary" style={{ flex: 2, padding: '10px 14px', fontSize: '0.82rem', whiteSpace: 'nowrap', background: 'var(--primary)', color: '#000' }}>💾 {t('saveScore')}</button>
                      <button onClick={handleClearResult} style={{ flex: 1, padding: '10px 10px', whiteSpace: 'nowrap', background: 'rgba(255,50,50,0.12)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.25)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem' }}>
                        🗑️ {t('clear') || 'Clear'}
                      </button>
                    </div>
                  </>
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', margin: 0, padding: '10px' }}>
                    {lang === 'hr' ? 'Izaberite utakmicu iz popisa lijevo.' : 'Select a match from the list on the left.'}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="glass-card" style={{ ...cs, borderColor: 'rgba(255,50,50,0.15)' }}>
            <h3 style={{ color: '#ff5555', marginBottom: '10px', fontSize: '0.95rem' }}>
              {lang === 'hr' ? `⚠️ Opasna zona — ${competition.shortName}` : `⚠️ Danger Zone — ${competition.shortName}`}
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '12px', fontSize: '0.8rem' }}>
              {lang === 'hr'
                ? <>Izbriši <strong>SVE</strong> rezultate utakmica za <strong>{competition.shortName}</strong> i preračunaj bodove. Ovo se ne može poništiti.</>
                : <>Clear ALL match results for <strong>{competition.shortName}</strong> and recalculate points. This cannot be undone.</>}
            </p>
            <button onClick={handleClearAllResults} style={{ padding: '8px 20px', background: 'rgba(255,50,50,0.15)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 600 }}>
              {lang === 'hr' ? `🗑️ Izbriši sve rezultate za ${competition.shortName}` : `🗑️ Clear All ${competition.shortName} Results`}
            </button>
          </div>
        </div>
      )}

      {/* USERS */}
      {adminTab === 'users' && (
        <div>
          {isSuperAdmin && (
            <div className="glass-card" style={cs}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.95rem' }}>➕ {t('createNewUser') || 'Create New User'}</h3>
              <div className="admin-form-row">
                <input className="input-glass" placeholder={t('displayName') || 'Display Name'} value={newUserName} onChange={e => setNewUserName(e.target.value)} />
                <input className="input-glass" placeholder={t('email') || 'Email'} value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} />
                <input className="input-glass" type="password" placeholder={t('password') || 'Password'} value={newUserPass} onChange={e => setNewUserPass(e.target.value)} />
                <button onClick={handleCreateUser} className="btn-primary" style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>➕ {lang === 'hr' ? 'Kreiraj' : 'Create'}</button>
              </div>
            </div>
          )}
          {Object.keys(leagues).length > 0 && (
            <div className="glass-card" style={cs}>
              <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.95rem' }}>🏟️ {t('assignUserToLeague') || 'Assign User to League'}</h3>
              <div className="admin-form-row" style={{ flexWrap: 'wrap', gap: '8px' }}>
                <select className="input-glass" value={assignUser} onChange={e => setAssignUser(e.target.value)} style={{ flex: 1, minWidth: '130px' }}>
                  <option value="">{t('selectUser') || '-- Select User --'}</option>
                  {Object.entries(users).map(([uid, u]) => <option key={uid} value={uid}>{u.displayName || u.email}</option>)}
                </select>
                <select className="input-glass" value={assignLeague} onChange={e => setAssignLeague(e.target.value)} style={{ flex: 1, minWidth: '130px' }}>
                  <option value="">{t('selectLeague') || '-- Select League --'}</option>
                  {Object.entries(leagues).map(([lid, l]) => <option key={lid} value={lid}>{l.name}</option>)}
                </select>
                <div style={{ display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' }}>
                  <button onClick={handleAssignUserToLeague} className="btn-primary" style={{ flex: 1, padding: '10px', minWidth: '120px' }}>{t('assign') || 'Assign'}</button>
                  <button onClick={handleAssignAllUsersToLeague} className="btn-outline" style={{ flex: 1, padding: '10px', minWidth: '120px' }}>👥 {lang === 'hr' ? 'Dodaj sve korisnike' : 'Add All Users'}</button>
                </div>
              </div>
            </div>
          )}

          <div className="glass-card" style={cs}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.95rem' }}>👥 {t('userManagement')}</h3>
            <div style={{ marginBottom: '12px' }}>
              <input
                type="text"
                className="input-glass"
                placeholder={lang === 'hr' ? '🔍 Traži korisnika po imenu ili e-mailu...' : '🔍 Search user by name or email...'}
                value={userSearchQuery}
                onChange={e => setUserSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: '0.82rem' }}
              />
            </div>
            {/* Desktop table */}
            <div className="admin-user-table" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead><tr style={{ borderBottom: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px' }}>{t('player')}</th>
                  <th style={{ textAlign: 'left', padding: '8px 4px' }}>{t('email')}</th>
                  <th style={{ textAlign: 'center', padding: '8px 4px' }}>{t('role')}</th>
                  {isAdmin && <th style={{ textAlign: 'right', padding: '8px 4px' }}>{t('actions')}</th>}
                </tr></thead>
                <tbody>
                  {Object.entries(users)
                    .filter(([uid, user]) => {
                      if (!userSearchQuery.trim()) return true;
                      const q = removeDiacritics(userSearchQuery);
                      const name = removeDiacritics(user.displayName || '');
                      const email = removeDiacritics(user.email || '');
                      return name.includes(q) || email.includes(q);
                    })
                    .sort((a,b) => (b[1].totalPoints||0) - (a[1].totalPoints||0)).map(([uid, user]) => {
                    const isSuper = user.role === 'superadmin' || user.email === 'admin@wc2026.com';
                    const isAdm = user.role === 'admin';
                    const lockCount = allUserLocks[uid] ? Object.keys(allUserLocks[uid]).length : 0;
                    const targetStart = isWC ? new Date('2026-06-11T19:00:00Z') : new Date('2025-08-16T00:00:00Z');
                    const isAfterStart = Date.now() >= targetStart.getTime();
                    const isGlobalLocked = user.globalPicksLocked === true || (isAfterStart && user.globalPicksLocked !== false);
                    return (
                      <tr key={uid} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }} onClick={() => handleOpenUser(uid)}>
                        <td style={{ padding: '8px 4px' }}>{user.flag || '🌍'} <b>{user.displayName || 'Unknown'}</b>{user.hidden && <span style={{ marginLeft: '6px', fontSize: '0.78rem', color: '#ff5555' }} title="Hidden from other users">👻</span>}</td>
                        <td style={{ padding: '8px 4px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{user.email}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                          {isSuper && <span style={{ background: 'rgba(255,215,0,0.15)', color: 'gold', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>👑 Super</span>}
                          {isAdm && !isSuper && <span style={{ background: 'rgba(0,255,136,0.1)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>Admin</span>}
                          {!isAdm && !isSuper && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{t('player')}</span>}
                          {lockCount > 0 && <span style={{ marginLeft: '4px', background: 'rgba(255,184,0,0.1)', color: '#FFB800', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>🔒 {lockCount}{isWC ? (lang === 'hr' ? 'u' : 'm') : (lang === 'hr' ? 'd' : 'd')}</span>}
                          {isGlobalLocked && <span style={{ marginLeft: '4px', background: 'rgba(144,76,255,0.15)', color: 'var(--secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>🌍🔒</span>}
                        </td>
                        {isAdmin && (
                          <td style={{ padding: '8px 4px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end', flexWrap: 'wrap', alignItems: 'center' }}>
                              <button onClick={() => handleOpenUser(uid)} className="btn-outline" style={{ padding: '3px 8px', fontSize: '0.7rem' }}>👁️</button>
                              {lockCount > 0 && (
                                <div style={{ position: 'relative', display: 'inline-block' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const el = e.currentTarget.nextSibling;
                                      if (el) el.style.display = el.style.display === 'none' ? 'flex' : 'none';
                                    }}
                                    style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.3)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>🔒 {lockCount}{isWC ? (lang === 'hr' ? 'u' : 'm') : (lang === 'hr' ? 'd' : 'd')} ▾</button>
                                  <div style={{ display: 'none', position: 'absolute', right: 0, top: '100%', marginTop: '4px', background: 'rgba(15,15,25,0.97)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px', zIndex: 50, flexDirection: 'column', gap: '4px', minWidth: '200px', maxHeight: '250px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>🔒 {isWC ? (t('lockedMatches') || 'Locked Matches') : (t('lockedDays') || 'Locked Days')}:</div>
                                    {Object.keys(allUserLocks[uid]).sort().map(dk => (
                                      <div key={dk} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', padding: '3px 0' }}>
                                        <span style={{ fontSize: '0.72rem' }}>{isWC ? (lang === 'hr' ? `Utakmica #${dk}` : `Match #${dk}`) : `📅 ${dk}`}</span>
                                        <button onClick={(e) => {
                                          e.stopPropagation();
                                          const lockPath = isWC ? `${fbPath}/users/${uid}/lockedMatches/${dk}` : `${fbPath}/users/${uid}/lockedDays/${dk}`;
                                          const confirmMsg = lang === 'hr'
                                            ? `⚠️ Jeste li sigurni da želite otključati ${isWC ? `utakmicu #${dk}` : dk} za korisnika ${users[uid]?.displayName || 'ovog korisnika'}?`
                                            : `⚠️ Are you sure you want to unlock ${isWC ? `match #${dk}` : dk} for ${users[uid]?.displayName || 'this user'}?`;
                                          if (!window.confirm(confirmMsg)) return;
                                          remove(ref(database, lockPath));
                                          showMsg(lang === 'hr' ? `🔓 Otključana ${isWC ? `utakmica #${dk}` : dk} za ${users[uid]?.displayName}` : `🔓 Unlocked ${isWC ? `match #${dk}` : dk} for ${users[uid]?.displayName}`);
                                        }} style={{ background: 'rgba(255,50,50,0.15)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', cursor: 'pointer' }}>🔓</button>
                                      </div>
                                    ))}
                                    <button onClick={(e) => {
                                      e.stopPropagation();
                                      handleUnlockAllDays(uid);
                                    }} style={{ marginTop: '4px', background: 'rgba(255,184,0,0.1)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.2)', borderRadius: '4px', padding: '4px 8px', fontSize: '0.65rem', cursor: 'pointer', width: '100%' }}>🔓 {t('unlockAll') || 'Unlock All'}</button>
                                  </div>
                                </div>
                              )}
                              {uid !== currentUser.uid && (!isSuper || isSuperAdmin) && (
                                  <>
                                    {isGlobalLocked && <button onClick={async (e) => {
                                      e.stopPropagation();
                                      const confirmGlobalMsg = lang === 'hr'
                                        ? `⚠️ Jeste li sigurni da želite otključati globalna predviđanja za korisnika ${users[uid]?.displayName || 'ovog korisnika'}?`
                                        : `⚠️ Are you sure you want to unlock global predictions for ${users[uid]?.displayName || 'this user'}?`;
                                      if (!window.confirm(confirmGlobalMsg)) return;
                                      try {
                                        await set(ref(database, `${fbPath}/users/${uid}/globalPicksLocked`), false);
                                        setUsers(prev => ({ ...prev, [uid]: { ...prev[uid], globalPicksLocked: false } }));
                                        showMsg(lang === 'hr' ? `🔓 Otključana globalna predviđanja za ${users[uid]?.displayName || 'korisnika'}` : `🔓 Unlocked global picks for ${users[uid]?.displayName || 'user'}`);
                                      } catch (err) {
                                        console.error(err);
                                        showMsg(`❌ Error: ${err.message}`);
                                      }
                                    }} style={{ background: 'rgba(144,76,255,0.15)', color: 'var(--secondary)', border: '1px solid rgba(144,76,255,0.3)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.65rem', cursor: 'pointer' }} title={lang === 'hr' ? "Otključaj globalna predviđanja" : "Unlock Global Picks"}>🌍🔓</button>}
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleTriggerPasswordReset(user.email, user.displayName); }}
                                      style={{ background: 'rgba(0,180,255,0.15)', color: '#00b4ff', border: '1px solid rgba(0,180,255,0.3)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.65rem', cursor: 'pointer' }}
                                      title={lang === 'hr' ? "Pošalji email za resetiranje lozinke" : "Send Password Reset Email"}
                                    >
                                      🔑
                                    </button>
                                    {isSuperAdmin && (
                                      <>
                                        <button onClick={() => handleToggleAdmin(uid)} className="btn-outline" style={{ padding: '3px 8px', fontSize: '0.7rem' }}>{isSuper ? '→User' : isAdm ? (isSuperAdmin ? '→Super' : '→User') : '+Admin'}</button>
                                        <button onClick={() => handleDeleteUser(uid)} style={{ background: 'rgba(255,50,50,0.15)', color: '#FF5555', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.7rem', cursor: 'pointer' }}>🗑️</button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile cards */}
              <div className="admin-user-cards">
                {Object.entries(users)
                  .filter(([uid, user]) => {
                    if (!userSearchQuery.trim()) return true;
                    const q = removeDiacritics(userSearchQuery);
                    const name = removeDiacritics(user.displayName || '');
                    const email = removeDiacritics(user.email || '');
                    return name.includes(q) || email.includes(q);
                  })
                  .sort((a,b) => (b[1].totalPoints||0) - (a[1].totalPoints||0)).map(([uid, user]) => {
                  const isSuper = user.role === 'superadmin' || user.email === 'admin@wc2026.com';
                  const isAdm = user.role === 'admin';
                  const lockCount = allUserLocks[uid] ? Object.keys(allUserLocks[uid]).length : 0;
                  const targetStart = isWC ? new Date('2026-06-11T19:00:00Z') : new Date('2025-08-16T00:00:00Z');
                  const isAfterStart = Date.now() >= targetStart.getTime();
                  const isGlobalLocked = user.globalPicksLocked === true || (isAfterStart && user.globalPicksLocked !== false);
                  return (
                    <div key={uid} className="user-card-mobile" onClick={() => handleOpenUser(uid)} style={{ cursor: 'pointer' }}>
                      <div className="user-card-info">
                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{user.flag || '🌍'} {user.displayName || 'Unknown'}{user.hidden && <span style={{ marginLeft: '6px', fontSize: '0.78rem', color: '#ff5555' }} title="Hidden from other users">👻</span>}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{user.email}</div>
                        <div style={{ marginTop: '3px', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {isSuper && <span style={{ background: 'rgba(255,215,0,0.15)', color: 'gold', padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>👑 Super</span>}
                          {isAdm && !isSuper && <span style={{ background: 'rgba(0,255,136,0.1)', color: 'var(--primary)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>Admin</span>}
                          {!isAdm && !isSuper && <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{t('player')}</span>}
                          {lockCount > 0 && <span style={{ background: 'rgba(255,184,0,0.1)', color: '#FFB800', padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>🔒 {lockCount}{isWC ? (lang === 'hr' ? 'u' : 'm') : (lang === 'hr' ? 'd' : 'd')}</span>}
                          {isGlobalLocked && <span style={{ background: 'rgba(144,76,255,0.15)', color: 'var(--secondary)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.65rem' }}>🌍🔒</span>}
                        </div>
                      </div>
                      <div className="user-card-actions" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleOpenUser(uid)} className="btn-outline" style={{ padding: '3px 8px', fontSize: '0.68rem' }}>👁️</button>
                        {lockCount > 0 && (
                          <button onClick={() => handleOpenUser(uid)} style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.3)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.68rem', cursor: 'pointer' }}>🔒 {lockCount}{isWC ? (lang === 'hr' ? 'u' : 'm') : (lang === 'hr' ? 'd' : 'd')}</button>
                        )}
                        {uid !== currentUser.uid && (!isSuper || isSuperAdmin) && (
                          <>
                            {isGlobalLocked && <button onClick={async (e) => {
                              e.stopPropagation();
                              const confirmGlobalMsg = lang === 'hr'
                                ? `⚠️ Jeste li sigurni da želite otključati globalna predviđanja za korisnika ${users[uid]?.displayName || 'ovog korisnika'}?`
                                : `⚠️ Are you sure you want to unlock global predictions for ${users[uid]?.displayName || 'this user'}?`;
                              if (!window.confirm(confirmGlobalMsg)) return;
                              try {
                                await set(ref(database, `${fbPath}/users/${uid}/globalPicksLocked`), false);
                                setUsers(prev => ({ ...prev, [uid]: { ...prev[uid], globalPicksLocked: false } }));
                                showMsg(lang === 'hr' ? `🔓 Otključana globalna predviđanja za ${users[uid]?.displayName || 'korisnika'}` : `🔓 Unlocked global picks for ${users[uid]?.displayName || 'user'}`);
                              } catch (err) {
                                console.error(err);
                                showMsg(`❌ Error: ${err.message}`);
                              }
                            }} style={{ background: 'rgba(144,76,255,0.15)', color: 'var(--secondary)', border: '1px solid rgba(144,76,255,0.3)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.68rem', cursor: 'pointer' }} title={lang === 'hr' ? "Otključaj globalna predviđanja" : "Unlock Global Picks"}>🌍🔓</button>}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleTriggerPasswordReset(user.email, user.displayName); }}
                              style={{ background: 'rgba(0,180,255,0.15)', color: '#00b4ff', border: '1px solid rgba(0,180,255,0.3)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.68rem', cursor: 'pointer' }}
                              title={lang === 'hr' ? "Pošalji email za resetiranje lozinke" : "Send Password Reset Email"}
                            >
                              🔑
                            </button>
                          </>
                        )}
                        {isSuperAdmin && uid !== currentUser.uid && (!isSuper || isSuperAdmin) && (
                          <>
                            <button onClick={() => handleToggleAdmin(uid)} className="btn-outline" style={{ padding: '3px 8px', fontSize: '0.68rem' }}>{isSuper ? '→User' : isAdm ? (isSuperAdmin ? '→Super' : '→User') : '+Admin'}</button>
                            <button onClick={() => handleDeleteUser(uid)} style={{ background: 'rgba(255,50,50,0.15)', color: '#FF5555', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.68rem', cursor: 'pointer' }}>🗑️</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

      {/* LEAGUES */}
      {adminTab === 'leagues' && (
        <div>
          <div className="glass-card" style={cs}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.95rem' }}>➕ {t('createLeague')}</h3>
            <div className="admin-form-row">
              <input className="input-glass" placeholder={t('leagueName')} value={newLeagueName} onChange={e => setNewLeagueName(e.target.value)} />
              <input className="input-glass" placeholder={t('leagueDesc')} value={newLeagueDesc} onChange={e => setNewLeagueDesc(e.target.value)} />
            </div>
            <div className="admin-form-row">
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>💰 {t('fee')}:</label>
                <input className="input-glass" type="number" min="0" step="0.5" value={newLeagueFee} onChange={e => setNewLeagueFee(e.target.value)} style={{ width: '70px', flex: '0 0 auto' }} />
                <select className="input-glass" value={newLeagueCurrency} onChange={e => setNewLeagueCurrency(e.target.value)} style={{ width: '70px', flex: '0 0 auto' }}>
                  <option value="EUR">EUR</option><option value="USD">USD</option><option value="HRK">HRK</option><option value="BAM">BAM</option><option value="GBP">GBP</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>🏆 {t('splitPct')}:</label>
                <input className="input-glass" placeholder="100" value={newLeaguePrizes} onChange={e => setNewLeaguePrizes(e.target.value)} style={{ flex: 1, minWidth: '80px' }} />
              </div>
              <button onClick={handleCreateLeague} className="btn-primary" style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>➕ {t('createLeague')}</button>
            </div>
            {parseFloat(newLeagueFee) > 0 && (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '6px' }}>
                {lang === 'hr' ? (
                  `ℹ️ Sav prikupljeni iznos (${newLeagueFee} ${newLeagueCurrency} po sudioniku) ide pobjedniku (Pobjednik uzima sve). Nema nikakvih administrativnih naknada.`
                ) : (
                  `ℹ️ All collected entry fees (${newLeagueFee} ${newLeagueCurrency} per participant) are awarded to the winner (Winner Takes All). No admin or platform fees are deducted.`
                )}
              </div>
            )}
          </div>
          {Object.keys(leagues).length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px' }}>{t('noLeagues')}</p>}
          {Object.entries(leagues).map(([lid, league]) => {
            const canManage = isSuperAdmin || league.createdBy === currentUser.uid;
            const memberCount = league.members ? Object.keys(league.members).length : 0;
            const nonMembers = Object.entries(users).filter(([uid]) => !league.members?.[uid]);
            return (
              <div key={lid} className="glass-card" style={{ ...cs, border: '1px solid rgba(0,255,136,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <div>
                    <h3 style={{ color: 'var(--primary)' }}>🏟️ {league.name}
                      {league.joinRequests && Object.keys(league.joinRequests).length > 0 && (
                        <span style={{ marginLeft: '8px', background: 'rgba(255,184,0,0.15)', color: '#FFB800', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 'normal' }}>📩 {Object.keys(league.joinRequests).length} {t('pending')}</span>
                      )}
                    </h3>
                    {league.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>{league.description}</p>}
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {t('createdBy')}: {league.createdByName} • {memberCount} {t('members')}
                      {(league.entryFee || 0) > 0 && <> • 💰 {league.entryFee} {league.currency || 'EUR'}</>}
                    </p>
                  </div>
                  {canManage && <button onClick={() => handleDeleteLeague(lid)} style={{ background: 'rgba(255,50,50,0.1)', color: '#FF5555', border: '1px solid rgba(255,50,50,0.2)', borderRadius: '6px', padding: '5px 12px', fontSize: '0.8rem', cursor: 'pointer' }}>🗑️</button>}
                </div>

                {/* Prize Pool Info */}
                {(() => { const pp = calcPrizePool(league); if (!pp) return null; return (
                  <div style={{ background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: '8px', padding: '12px', marginBottom: '15px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', textAlign: 'center', fontSize: '0.8rem' }}>
                    <div><div style={{ color: 'var(--text-muted)' }}>{t('gross')}</div><div style={{ fontWeight: 'bold', color: '#fff' }}>{pp.gross.toFixed(2)} {pp.currency}</div></div>
                    <div><div style={{ color: 'var(--text-muted)' }}>{t('fees')}</div><div style={{ fontWeight: 'bold', color: '#FF8800' }}>-{(pp.processorFee + pp.platformFee).toFixed(2)}</div></div>
                    <div><div style={{ color: 'var(--text-muted)' }}>{t('prizePool')}</div><div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{pp.net.toFixed(2)} {pp.currency}</div></div>
                    <div><div style={{ color: 'var(--text-muted)' }}>{t('paid')}</div><div style={{ fontWeight: 'bold', color: '#fff' }}>{pp.paidCount}/{memberCount}</div></div>
                  </div>
                ); })()}

                {/* Prize Distribution */}
                {league.prizeDistribution && (league.entryFee || 0) > 0 && (
                  <div style={{ marginBottom: '15px' }}>
                    <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>🏆 {t('prizeSplit')}:</h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {Object.entries(league.prizeDistribution).map(([pos, pct]) => {
                        const pp = calcPrizePool(league);
                        const amount = pp ? (pp.net * pct / 100).toFixed(2) : '0';
                        return (
                          <div key={pos} style={{ background: 'rgba(0,255,136,0.05)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'center' }}>
                            <div style={{ fontWeight: 'bold', color: pos === '1' ? 'gold' : pos === '2' ? 'silver' : '#cd7f32' }}>{pos === '1' ? '🥇' : pos === '2' ? '🥈' : '🥉'} {pct}%</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{amount} {league.currency || 'EUR'}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Members with payment status */}
                <div style={{ marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>👥 {t('members')}:</h4>
                  {league.members && Object.keys(league.members).map(uid => {
                    const u = users[uid]; if (!u) return null;
                    const hasFee = (league.entryFee || 0) > 0;
                    const isPaid = league.payments?.[uid]?.status === 'confirmed';
                    return (
                      <div key={uid} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: isPaid ? 'rgba(0,255,136,0.08)' : 'rgba(255,255,255,0.03)', padding: '4px 10px', borderRadius: '20px', margin: '3px', fontSize: '0.85rem', border: hasFee ? `1px solid ${isPaid ? 'rgba(0,255,136,0.2)' : 'rgba(255,100,100,0.2)'}` : 'none' }}>
                        {u.flag || '🌍'} {u.displayName || u.email}
                        {hasFee && (isPaid
                          ? <span style={{ color: 'var(--primary)', fontSize: '0.7rem', cursor: canManage ? 'pointer' : 'default' }} onClick={() => canManage && handleUnconfirmPayment(lid, uid)} title={canManage ? (lang === 'hr' ? 'Kliknite za poništenje' : 'Click to unconfirm') : ''}>✅</span>
                          : canManage
                            ? <button onClick={() => handleConfirmPayment(lid, uid)} style={{ background: 'rgba(255,184,0,0.15)', color: '#FFB800', border: '1px solid rgba(255,184,0,0.3)', borderRadius: '4px', padding: '1px 6px', fontSize: '0.65rem', cursor: 'pointer' }}>{t('confirmPaid')}</button>
                            : <span style={{ color: '#FF5555', fontSize: '0.7rem' }}>💸 {t('unpaid')}</span>
                        )}
                        {canManage && uid !== league.createdBy && <button onClick={() => handleRemoveMember(lid, uid)} style={{ background: 'none', border: 'none', color: '#FF5555', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>}
                      </div>
                    );
                  })}
                  {memberCount === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('noMembersYet')}</p>}
                </div>

                {/* Pending Join Requests */}
                {league.joinRequests && Object.keys(league.joinRequests).length > 0 && (
                  <div style={{ background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '0.85rem', color: '#FFB800', marginBottom: '8px' }}>📩 {t('pendingJoinRequests')} ({Object.keys(league.joinRequests).length})</h4>
                    {Object.entries(league.joinRequests).map(([reqUid, req]) => (
                      <div key={reqUid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={{ fontSize: '0.82rem' }}>{users[reqUid]?.flag || '🌍'} {req.displayName || users[reqUid]?.displayName || 'Unknown'} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{users[reqUid]?.email}</span></span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={async () => { await set(ref(database, `wc2026/leagues/${lid}/members/${reqUid}`), true); await remove(ref(database, `wc2026/leagues/${lid}/joinRequests/${reqUid}`)); showMsg(lang === 'hr' ? `✅ Prihvaćen ${req.displayName || 'korisnik'}` : `✅ Accepted ${req.displayName || 'user'}`); }} style={{ background: 'rgba(0,255,136,0.15)', color: 'var(--primary)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: '6px', padding: '4px 12px', fontSize: '0.75rem', cursor: 'pointer' }}>✅ {t('accept')}</button>
                          <button onClick={async () => { await remove(ref(database, `wc2026/leagues/${lid}/joinRequests/${reqUid}`)); showMsg(lang === 'hr' ? `❌ Odbijen ${req.displayName || 'korisnik'}` : `❌ Denied ${req.displayName || 'user'}`); }} style={{ background: 'rgba(255,50,50,0.15)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '6px', padding: '4px 12px', fontSize: '0.75rem', cursor: 'pointer' }}>❌ {t('deny')}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {canManage && (
                  <div style={{ marginTop: '8px' }}>
                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '6px' }}>➕ {t('addMember')}:</h4>
                    <input
                      className="input-glass"
                      type="text"
                      placeholder={lang === 'hr' ? "Traži po imenu ili emailu..." : "Search by name or email..."}
                      value={adminMemberSearch}
                      onChange={e => setAdminMemberSearch(e.target.value)}
                      style={{ fontSize: '0.82rem', marginBottom: '4px', padding: '8px 12px' }}
                    />
                    <div style={{ maxHeight: '130px', overflowY: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                      {(() => {
                        const q = removeDiacritics(adminMemberSearch);
                        if (q.length === 0) return <p style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>{lang === 'hr' ? 'Upišite za pretraživanje korisnika…' : 'Type to search users…'}</p>;
                        const filtered = nonMembers.filter(([, u]) =>
                          removeDiacritics(u.displayName || '').includes(q) ||
                          removeDiacritics(u.email || '').includes(q)
                        );
                        if (filtered.length === 0) return <p style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>{lang === 'hr' ? `Nema pronađenih korisnika koji se podudaraju s "${adminMemberSearch}"` : `No users found matching "${adminMemberSearch}"`}</p>;
                        return filtered.slice(0, 15).map(([uid, u]) => (
                          <button key={uid} onClick={() => { set(ref(database, `wc2026/leagues/${lid}/members/${uid}`), true); setAdminMemberSearch(''); }} style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '6px 10px', cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.8rem', textAlign: 'left' }}>
                            <span>{u.flag || '🌍'}</span>
                            <span style={{ flex: 1 }}>{u.displayName || u.email}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>{u.email}</span>
                            <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>+</span>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* API SETUP */}
      {adminTab === 'api' && (
        <div className="glass-card" style={cs}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '15px' }}>🔄 {t('apiSetupTitle')}</h3>
          <div style={{ background: 'rgba(0,255,136,0.05)', padding: '20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid rgba(0,255,136,0.1)' }}>
            <p style={{ color: 'var(--text-muted)', lineHeight: '2', fontSize: '0.9rem' }}>
              {t('apiStep1')} <a href="https://apifootball.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>apifootball.com</a><br/>
              {t('apiStep2')}<br/>{t('apiStep3')}<br/>{t('apiStep4')}<br/>{t('apiStep5')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input type="text" className="input-glass" placeholder={t('apiKeyLabel')} value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)} style={{ flex: 1, fontFamily: 'monospace' }} />
            <button onClick={handleSaveApiKey} className="btn-primary" style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}>💾 {t('saveApiKey')}</button>
          </div>
          {apiKeySaved && <p style={{ color: 'var(--primary)', marginTop: '10px' }}>✅ {t('apiKeySaved')}</p>}
        </div>
      )}

      {/* PLAYER STATS EDITOR */}
      {adminTab === 'playerstats' && (
        <div>
          <div className="glass-card" style={cs}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ color: 'var(--primary)', margin: 0 }}>📊 {lang === 'hr' ? 'Uredi statistiku igrača' : 'Edit Player Stats'} — {competition.shortName}</h3>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', marginRight: '6px' }} title={lang === 'hr' ? 'Ako je označeno, spremanje će ažurirati i službene pobjednike i preračunati bodove na tablici' : 'If checked, saving will also update official global results and recalculate leaderboard points'}>
                  <input type="checkbox" checked={updateLeaderboardOnStatsSave} onChange={e => setUpdateLeaderboardOnStatsSave(e.target.checked)} style={{ cursor: 'pointer' }} />
                  {lang === 'hr' ? 'Preračunaj i poredak' : 'Update leaderboard'}
                </label>
                <button onClick={loadPlayerStats} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>🔄 {lang === 'hr' ? 'Učitaj' : 'Load'}</button>
                <button onClick={savePlayerStats} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem', background: 'var(--primary)', color: '#000' }}>💾 {lang === 'hr' ? 'Spremi' : 'Save'}</button>
              </div>
            </div>
            {!statsLoaded && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{lang === 'hr' ? 'Klikni "Učitaj" za učitavanje trenutne statistike.' : 'Click "Load" to load current stats.'}</p>}
          </div>

          {statsLoaded && [['scorers', '👟', lang === 'hr' ? 'Strijelci (golovi)' : 'Top Scorers (goals)'],
                          ['assists', '🎯', lang === 'hr' ? 'Asistenti' : 'Top Assists'],
                          ['cleanSheets', '🧤', lang === 'hr' ? 'Vratari (čiste mreže)' : 'Goalkeepers (clean sheets)']].map(([cat, icon, label]) => (
            <div key={cat} className="glass-card" style={{ ...cs, marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ color: 'var(--primary)', margin: 0, fontSize: '0.9rem' }}>{icon} {label}</h4>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => { setImportingCat(cat); setImportText(''); }} className="btn-outline" style={{ padding: '5px 12px', fontSize: '0.8rem', borderColor: 'var(--secondary)', color: 'var(--secondary)' }}>📋 {lang === 'hr' ? 'Brzi uvoz' : 'Quick Import'}</button>
                  <button onClick={() => addStatRow(cat)} className="btn-primary" style={{ padding: '5px 12px', fontSize: '0.8rem' }}>+ {lang === 'hr' ? 'Dodaj' : 'Add'}</button>
                </div>
              </div>

              {importingCat === cat && (
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px', borderRadius: '8px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    {lang === 'hr' 
                      ? 'Zalijepite tekst (jedna stavka po redu, npr. "1. Harry Kane (Engleska) 6" ili "Kylian Mbappe, Francuska, 5"):'
                      : 'Paste stats (one entry per line, e.g. "1. Harry Kane (England) 6" or "Kylian Mbappe, France, 5"):'}
                  </label>
                  <textarea 
                    className="input-glass"
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    placeholder={lang === 'hr' ? 'Zalijepite ovdje...' : 'Paste here...'}
                    style={{ width: '100%', height: '100px', fontSize: '0.8rem', fontFamily: 'monospace', padding: '6px 10px', marginBottom: '8px' }}
                  />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setImportingCat(null)} className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>{t('cancel')}</button>
                    <button 
                      onClick={() => {
                        const parsed = parsePastedStats(importText);
                        if (parsed.length > 0) {
                          setEditStats(prev => ({ ...prev, [cat]: [...prev[cat], ...parsed] }));
                          showMsg(lang === 'hr' ? `✅ Uvezeno ${parsed.length} stavki!` : `✅ Imported ${parsed.length} entries!`);
                        } else {
                          alert(lang === 'hr' ? 'Nije pronađena valjana statistika za uvoz. Provjerite format.' : 'No valid stats found to import. Check format.');
                        }
                        setImportingCat(null);
                      }} 
                      className="btn-primary" 
                      style={{ padding: '4px 14px', fontSize: '0.75rem', background: 'var(--primary)', color: '#000' }}
                    >
                      {lang === 'hr' ? 'Uvezi' : 'Import'}
                    </button>
                  </div>
                </div>
              )}

              {editStats[cat].length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{lang === 'hr' ? 'Nema podataka. Klikni + Dodaj ili Brzi uvoz.' : 'No data. Click + Add or Quick Import.'}</p>}
              {[...editStats[cat]].sort((a, b) => (b.count || 0) - (a.count || 0)).map((row, idx) => {
                const realIdx = editStats[cat].indexOf(row);
                return (
                  <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', width: '22px', textAlign: 'right' }}>{idx + 1}.</span>
                    <input className="input-glass" value={row.name || ''} onChange={e => updateStatRow(cat, realIdx, 'name', e.target.value)} placeholder={lang === 'hr' ? 'Ime igrača' : 'Player name'} style={{ flex: 2, minWidth: '120px', padding: '6px 10px', fontSize: '0.85rem' }} />
                    <input className="input-glass" value={row.team || ''} onChange={e => updateStatRow(cat, realIdx, 'team', e.target.value)} placeholder={lang === 'hr' ? 'Tim' : 'Team'} style={{ flex: 1, minWidth: '90px', padding: '6px 10px', fontSize: '0.85rem' }} />
                    <input className="input-glass" type="number" min="0" value={row.count || 0} onChange={e => updateStatRow(cat, realIdx, 'count', e.target.value)} style={{ width: '55px', padding: '6px 8px', fontSize: '0.85rem', textAlign: 'center' }} />
                    <button onClick={() => removeStatRow(cat, realIdx)} style={{ background: 'rgba(255,50,50,0.15)', border: '1px solid rgba(255,50,50,0.3)', color: '#ff5050', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer', fontSize: '0.8rem' }}>✖</button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* GLOBAL RESULTS */}
      {adminTab === 'global' && (
        <div>
          <div className="glass-card" style={cs}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.95rem' }}>🏆 {isWC ? t('setTournamentResults') : t('setSeasonResults')}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '12px' }}>{isWC ? t('setGlobalResultsDesc') : t('seasonResultsDesc')}</p>
            <div className="admin-form-row" style={{ flexDirection: 'column', gap: '10px' }}>
              {[['champion','🏆',isWC ? t('champion') : t('leagueChampion')],['secondPlace','🥈',isWC ? t('secondPlace') : t('secondPlacePL')],['thirdPlace','🥉',isWC ? t('thirdPlace') : t('thirdPlacePL')],['topScorer','👟',isWC ? t('topScorer') : t('goldenBoot')],['topAssist','🎯',isWC ? t('topAssist') : t('mostAssists')],['topGoalkeeper','🧤',isWC ? t('topGoalkeeper') : t('goldenGlove')]].map(([key,icon,label]) => (
                <div key={key}>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '4px', display: 'block' }}>{icon} {label}</label>
                  <input className="input-glass" value={globalResults[key] || ''} onChange={e => setGlobalResults({ ...globalResults, [key]: e.target.value })} placeholder={label} />
                </div>
              ))}
            </div>
            <button onClick={async () => {
              const savePath = isWC ? 'wc2026/metadata/globalResults' : `${fbPath}/metadata/globalResults`;
              await set(ref(database, savePath), globalResults);
              await recalculateAllPoints(competition.id);
              showMsg(`✅ ${t('globalResultsSaved')}`);
            }} className="btn-primary" style={{ marginTop: '15px', padding: '10px 20px', width: '100%' }}>💾 {t('saveResults') || 'Save Results'}</button>
          </div>

          {/* Users' global picks overview */}
          <div className="glass-card" style={cs}>
            <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.95rem' }}>🌍 {t('usersGlobalPicks')}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '12px' }}>{t('usersGlobalPicksDesc')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(users).map(([uid, u]) => {
                const gPicks = u.globalPicks || {};
                const gLocked = u.globalPicksLocked === true;
                const hasPicks = Object.values(gPicks).some(v => v && String(v).trim().length > 0);
                if (!hasPicks && !gLocked) return null;
                return (
                  <div key={uid} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{u.flag || '🌍'} {u.displayName || u.email || 'Unknown'}</div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {gLocked && <span style={{ fontSize: '0.68rem', background: 'rgba(0,255,136,0.1)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px' }}>🔒 {t('locked')}</span>}
                        {gLocked && (
                          <button onClick={async () => {
                             const confirmMsg = lang === 'hr' 
                               ? `Otključati globalna predviđanja za korisnika ${u.displayName || 'korisnik'}?` 
                               : `Unlock global picks for ${u.displayName || 'user'}?`;
                             if (!window.confirm(confirmMsg)) return;
                             try {
                               await set(ref(database, `${fbPath}/users/${uid}/globalPicksLocked`), false);
                               setUsers(prev => ({ ...prev, [uid]: { ...prev[uid], globalPicksLocked: false } }));
                               const unlockedMsg = lang === 'hr'
                                 ? `🔓 Otključana globalna predviđanja za ${u.displayName || 'korisnik'}`
                                 : `🔓 Unlocked global picks for ${u.displayName || 'user'}`;
                               showMsg(unlockedMsg);
                             } catch (err) {
                               console.error(err);
                               showMsg(`❌ Error: ${err.message}`);
                             }
                          }}
                            style={{ background: 'rgba(255,50,50,0.12)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.2)', borderRadius: '4px', padding: '2px 6px', fontSize: '0.65rem', cursor: 'pointer' }}>🔓 {t('unlock')}</button>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '0.78rem' }}>
                      {['champion','secondPlace','thirdPlace','topScorer','topAssist','topGoalkeeper'].map(k => (
                        <div key={k} style={{ color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 600 }}>{k === 'champion' ? '🏆' : k === 'secondPlace' ? '🥈' : k === 'thirdPlace' ? '🥉' : k === 'topScorer' ? '👟' : k === 'topAssist' ? '🎯' : '🧤'}</span>
                          {' '}{gPicks[k] ? tt(gPicks[k]) : '—'}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {/* USER DETAIL MODAL — rendered via Portal to avoid transform positioning bug */}
      {selectedUser && createPortal(
        <div className="rules-modal-overlay" onClick={() => setSelectedUser(null)}>
          <div ref={modalRef} className="rules-modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
            <button className="rules-modal-close" onClick={() => setSelectedUser(null)}>✕</button>
            
            {loadingUser ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>⏳ {t('loading')}</div>
            ) : (
              <>
                {/* User header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), #00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>
                    {selectedUser.data?.flag || '👤'}
                  </div>
                  <div>
                    <h3 style={{ margin: 0 }}>{selectedUser.data?.displayName || 'Unknown'}</h3>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{selectedUser.data?.email}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {selectedUser.data?.country || ''} • {selectedUser.data?.timezone || t('notSet')}
                    </div>
                  </div>
                </div>

                {/* Edit Profile */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '14px', marginBottom: '15px' }}>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', color: 'var(--primary)' }}>📝 {t('editProfile')}</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' }}>
                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('name')}</label>
                      <input className="input-glass" value={editName} onChange={e => setEditName(e.target.value)} style={{ fontSize: '0.85rem' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: '140px' }}>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>{t('timezone')}</label>
                      <select className="input-glass" value={editTZ} onChange={e => setEditTZ(e.target.value)} style={{ fontSize: '0.85rem' }}>
                        <option value="">{t('notSet')}</option>
                        {TIMEZONE_LIST.map(tz => (
                          <option key={tz.value} value={tz.value}>{tz.label.replace(/_/g,' ')} (GMT{tz.offset === '0' ? '' : tz.offset})</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '160px', height: '38px', marginBottom: '4px' }}>
                      <input type="checkbox" id="manage-hidden" checked={editHidden} onChange={e => setEditHidden(e.target.checked)} style={{ cursor: 'pointer', width: '16px', height: '16px' }} />
                      <label htmlFor="manage-hidden" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
                        👻 {lang === 'hr' ? 'Sakrij s ljestvice' : 'Hide from Leaderboard'}
                      </label>
                    </div>
                    <button onClick={handleAdminSaveProfile} className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.8rem', flexShrink: 0 }}>💾 {lang === 'hr' ? 'Spremi' : 'Save'}</button>
                  </div>
                </div>

                {/* Locked Items (competition-aware) */}
                {(() => {
                  const compPath = userViewComp === 'wc2026' ? 'wc2026' : 'pl2526';
                  const isViewWC = userViewComp === 'wc2026';
                  const lockNode = isViewWC ? (selectedUser.data?.lockedMatches || {}) : (selectedUser.data?.lockedDays || {});
                  const lockKeys = Object.keys(lockNode);
                  if (lockKeys.length === 0) return null;
                  return (
                    <div style={{ background: 'rgba(255,184,0,0.05)', borderRadius: '10px', padding: '14px', marginBottom: '15px' }}>
                      <h4 style={{ fontSize: '0.85rem', marginBottom: '10px', color: '#FFB800' }}>🔒 {isViewWC ? t('lockedMatches') : t('lockedDays')}</h4>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {lockKeys.sort().map(dk => (
                          <div key={dk} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,184,0,0.1)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem' }}>
                            <span>{isViewWC ? `⚽ #${dk}` : `📅 ${dk}`}</span>
                            <button onClick={() => {
                              const label = isViewWC ? (lang === 'hr' ? `utakmicu #${dk}` : `match #${dk}`) : dk;
                              const confirmMsg = lang === 'hr'
                                ? `⚠️ Jeste li sigurni da želite otključati ${label} za korisnika ${selectedUser.data?.displayName || 'ovog korisnika'}?`
                                : `⚠️ Are you sure you want to unlock ${label} for ${selectedUser.data?.displayName || 'this user'}?`;
                              if (!window.confirm(confirmMsg)) return;
                              const path = isViewWC
                                ? `${compPath}/users/${selectedUser.uid}/lockedMatches/${dk}`
                                : `${compPath}/users/${selectedUser.uid}/lockedDays/${dk}`;
                              remove(ref(database, path));
                              // Update local state immediately
                              setSelectedUser(prev => {
                                if (!prev || prev.uid !== selectedUser.uid) return prev;
                                const lockKey = isViewWC ? 'lockedMatches' : 'lockedDays';
                                const updatedLocks = { ...(prev.data?.[lockKey] || {}) };
                                delete updatedLocks[dk];
                                return { ...prev, data: { ...prev.data, [lockKey]: updatedLocks } };
                              });
                              showMsg(lang === 'hr' ? `🔓 Otključano: ${label}` : `🔓 Unlocked ${label}`);
                            }} style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px' }} title="Click to unlock (with confirmation)">🔓</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* User Global Picks */}
                {(() => {
                  const targetStart = userViewComp === 'wc2026' ? new Date('2026-06-11T19:00:00Z') : new Date('2025-08-16T00:00:00Z');
                  const isAfterStart = Date.now() >= targetStart.getTime();
                  const isGlobalLocked = selectedUser.data?.globalPicksLocked === true || (isAfterStart && selectedUser.data?.globalPicksLocked !== false);
                  
                  return (
                    <div style={{ background: 'rgba(144,76,255,0.04)', borderRadius: '10px', padding: '14px', marginBottom: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--secondary)', margin: 0 }}>🌍 {t('globalPredictions')}</h4>
                        {isGlobalLocked && (
                          <button onClick={async () => {
                            const confirmMsg = lang === 'hr'
                              ? `⚠️ Otključati globalna predviđanja za korisnika ${selectedUser.data?.displayName}?`
                              : `⚠️ Unlock global picks for ${selectedUser.data?.displayName}?`;
                            if (!window.confirm(confirmMsg)) return;
                            const compPath = userViewComp === 'wc2026' ? 'wc2026' : 'pl2526';
                            try {
                              await set(ref(database, `${compPath}/users/${selectedUser.uid}/globalPicksLocked`), false);
                              setSelectedUser(prev => prev && prev.uid === selectedUser.uid ? {
                                ...prev,
                                data: { ...prev.data, globalPicksLocked: false }
                              } : prev);
                              setUsers(prev => ({ ...prev, [selectedUser.uid]: { ...prev[selectedUser.uid], globalPicksLocked: false } }));
                              showMsg(`🔓 ${t('globalPicksUnlocked')}`);
                            } catch (err) {
                              console.error(err);
                              showMsg(`❌ Error: ${err.message}`);
                            }
                          }} style={{ background: 'rgba(255,50,50,0.12)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.2)', borderRadius: '6px', padding: '3px 8px', fontSize: '0.68rem', cursor: 'pointer' }}>🔓 {t('unlock')}</button>
                        )}
                      </div>
                      {(() => {
                        const gp = selectedUser.data?.globalPicks || {};
                        const hasGP = Object.values(gp).some(v => v && String(v).trim());
                        if (!hasGP) return <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0 }}>{t('noGlobalPicksSet')}</p>;
                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.78rem' }}>
                            {[['champion','🏆'],['secondPlace','🥈'],['thirdPlace','🥉'],['topScorer','👟'],['topAssist','🎯'],['topGoalkeeper','🧤']].map(([k, icon]) => (
                              <div key={k} style={{ color: 'var(--text-muted)' }}>
                                <span style={{ fontWeight: 600 }}>{icon}</span> {gp[k] ? tt(gp[k]) : '—'}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {isGlobalLocked && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', marginTop: '6px', display: 'inline-block' }}>🔒 {t('locked')}</span>}
                    </div>
                  );
                })()}

                {/* Competition Switcher */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  <button onClick={() => handleSwitchUserComp('wc2026')} className={userViewComp === 'wc2026' ? 'phase-tab active' : 'phase-tab'} style={{ fontSize: '0.75rem' }}>⚽ WC 2026</button>
                  <button onClick={() => handleSwitchUserComp('pl2526')} className={userViewComp === 'pl2526' ? 'phase-tab active' : 'phase-tab'} style={{ fontSize: '0.75rem' }}>⚽ PL 25/26</button>
                </div>

                {/* Predictions Filter section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: lang === 'hr' ? 'Sve utakmice' : 'All Matches' },
                      { id: 'predicted', label: lang === 'hr' ? 'Predviđene' : 'Predicted' },
                      { id: 'unpredicted', label: lang === 'hr' ? 'Nepredviđene' : 'Unpredicted' }
                    ].map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setPredFilter(f.id); setPredLimit(50); }}
                        className={predFilter === f.id ? 'phase-tab active' : 'phase-tab'}
                        style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    className="input-glass"
                    placeholder={lang === 'hr' ? 'Traži po timu...' : 'Search by team...'}
                    value={predSearch}
                    onChange={e => { setPredSearch(e.target.value); setPredLimit(50); }}
                    style={{ fontSize: '0.78rem', padding: '6px 10px' }}
                  />
                </div>

                {/* Predictions */}
                <div style={{ maxHeight: '35vh', overflowY: 'auto' }}>
                  {(() => {
                    const userTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    const locale = lang === 'hr' ? 'hr-HR' : 'en-US';
                    const hasViewFixtures = Object.keys(viewCompFixtures).length > 0;
                    const rawMatches = hasViewFixtures
                      ? Object.values(viewCompFixtures).sort((a, b) => a.matchNumber - b.matchNumber).map(f => ({
                          matchNumber: f.matchNumber, team1: f.team1, team2: f.team2, date: f.date, utc: f.time,
                          venue: f.venue || '', stage: f.stage || `Matchday ${f.round || '?'}`, group: f.group || '',
                          matchday: f.matchday || parseInt(f.round) || 0,
                        }))
                      : (userViewComp === 'wc2026' ? ALL_MATCHES : PL_2526_MATCHES);
                    const resolvedRawMatches = userViewComp === 'wc2026'
                      ? resolveKnockoutMatches(rawMatches, viewCompResults)
                      : rawMatches;
                    const allMatches = [...resolvedRawMatches].sort((a, b) => a.matchNumber - b.matchNumber);
                    const filtered = allMatches.filter(m => {
                      if (predSearch.trim()) {
                        const q = removeDiacritics(predSearch);
                        const t1Eng = removeDiacritics(m.team1 || '');
                        const t2Eng = removeDiacritics(m.team2 || '');
                        const t1Hrv = removeDiacritics(translateTeam('hr', m.team1 || ''));
                        const t2Hrv = removeDiacritics(translateTeam('hr', m.team2 || ''));
                        const stEng = removeDiacritics(m.stage || '');
                        const stHrv = removeDiacritics(translateStage('hr', m.stage || ''));
                        const num = String(m.matchNumber);
                        const matchesQuery = t1Eng.includes(q) || t2Eng.includes(q) ||
                                             t1Hrv.includes(q) || t2Hrv.includes(q) ||
                                             stEng.includes(q) || stHrv.includes(q) ||
                                             num.includes(q);
                        if (!matchesQuery) {
                          return false;
                        }
                      }
                      const pred = userPreds[m.matchNumber];
                      const hasPred = pred !== undefined && pred.score1 !== undefined && pred.score2 !== undefined && pred.score1 !== '' && pred.score2 !== '';
                      if (predFilter === 'predicted') return hasPred;
                      if (predFilter === 'unpredicted') return !hasPred;
                      return true;
                    });

                    if (filtered.length === 0) {
                      return <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>{t('noPredictions')}</p>;
                    }

                    const visibleMatches = filtered.slice(0, predLimit);
                    const calcPts = userViewComp === 'wc2026' ? calculatePoints : calculatePLPoints;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {visibleMatches.map(m => {
                          const pred = userPreds[m.matchNumber];
                          const actual = viewCompResults[`match_${m.matchNumber}`];
                          const isFinished = actual?.status === 'finished';
                          const pts = isFinished ? calcPts(pred, actual) : 0;
                          const isExact = pts === 3, isCorrect = pts === 1;

                          const fmt = userViewComp === 'wc2026'
                            ? formatMatchTime(m.date, m.utc, userTZ, locale)
                            : formatPLMatchTime(m.date, m.utc, userTZ, locale);

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
                          }

                          return (
                            <div key={m.matchNumber} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', flexWrap: 'wrap', gap: '8px',
                              background: rowBg,
                              border: rowBorder,
                              opacity: isFinished ? 0.95 : 1,
                            }}>
                              <div style={{ flex: 1, minWidth: '120px' }}>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>#{m.matchNumber} </span>
                                <strong>{tt(m.team1)}</strong> <span style={{ color: 'var(--text-muted)' }}>vs</span> <strong>{tt(m.team2)}</strong>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '6px', display: 'block', marginTop: '2px' }}>
                                  ({ts(m.stage)} • {fmt.date} {fmt.time})
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{t('prediction') || 'Pred.'}:</span>
                                  <input type="number" min="0" value={pred?.score1 ?? ''} className="input-glass"
                                    style={{ width: '36px', padding: '3px', textAlign: 'center', fontSize: '0.8rem' }}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setUserPreds(p => ({
                                        ...p,
                                        [m.matchNumber]: {
                                          ...(p[m.matchNumber] || {}),
                                          score1: val === '' ? '' : parseInt(val, 10)
                                        }
                                      }));
                                    }}
                                    onBlur={e => handleAdminEditPred(m.matchNumber, e.target.value, document.getElementById(`adm2_${selectedUser.uid}_${m.matchNumber}_s2`)?.value || '')}
                                    id={`adm2_${selectedUser.uid}_${m.matchNumber}_s1`}
                                    key={`s1_${selectedUser.uid}_${userViewComp}_${m.matchNumber}`} />
                                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                                  <input type="number" min="0" value={pred?.score2 ?? ''} className="input-glass"
                                    style={{ width: '36px', padding: '3px', textAlign: 'center', fontSize: '0.8rem' }}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setUserPreds(p => ({
                                        ...p,
                                        [m.matchNumber]: {
                                          ...(p[m.matchNumber] || {}),
                                          score2: val === '' ? '' : parseInt(val, 10)
                                        }
                                      }));
                                    }}
                                    onBlur={e => handleAdminEditPred(m.matchNumber, document.getElementById(`adm2_${selectedUser.uid}_${m.matchNumber}_s1`)?.value || '', e.target.value)}
                                    id={`adm2_${selectedUser.uid}_${m.matchNumber}_s2`}
                                    key={`s2_${selectedUser.uid}_${userViewComp}_${m.matchNumber}`} />
                                  {pred && (pred.score1 !== undefined && pred.score2 !== undefined && pred.score1 !== '' && pred.score2 !== '') && (
                                    <button onClick={async () => {
                                      const confirmMsg = lang === 'hr' ? `⚠️ Izbrisati predviđanje za utakmicu #${m.matchNumber}?` : `⚠️ Delete prediction for match #${m.matchNumber}?`;
                                      if (window.confirm(confirmMsg)) {
                                        await handleAdminEditPred(m.matchNumber, '', '');
                                      }
                                    }} style={{
                                      background: 'transparent', border: 'none', color: '#ff5555', cursor: 'pointer',
                                      fontSize: '0.9rem', padding: '0 4px', display: 'flex', alignItems: 'center'
                                    }} title={t('delete') || 'Delete'}>🗑️</button>
                                  )}
                                </div>

                                {/* Lock/Unlock toggle for each match */}
                                {(() => {
                                  const isViewWC = userViewComp === 'wc2026';
                                  const compPath = isViewWC ? 'wc2026' : 'pl2526';
                                  const lockKey = isViewWC ? 'lockedMatches' : 'lockedDays';
                                  const matchKey = isViewWC ? String(m.matchNumber) : fmt.dateKey;
                                  const isLocked = !!(selectedUser.data?.[lockKey]?.[matchKey]);
                                  return (
                                    <button onClick={() => {
                                      const path = `${compPath}/users/${selectedUser.uid}/${lockKey}/${matchKey}`;
                                      if (isLocked) {
                                        const label = isViewWC ? `match #${matchKey}` : matchKey;
                                        if (!window.confirm(lang === 'hr' ? `⚠️ Otključati ${label}?` : `⚠️ Unlock ${label}?`)) return;
                                        remove(ref(database, path));
                                        setSelectedUser(prev => {
                                          if (!prev) return prev;
                                          const updated = { ...(prev.data?.[lockKey] || {}) };
                                          delete updated[matchKey];
                                          return { ...prev, data: { ...prev.data, [lockKey]: updated } };
                                        });
                                        showMsg(lang === 'hr' ? `🔓 Otključano: #${matchKey}` : `🔓 Unlocked #${matchKey}`);
                                      } else {
                                        if (!pred) return;
                                        set(ref(database, path), Date.now());
                                        setSelectedUser(prev => {
                                          if (!prev) return prev;
                                          const updated = { ...(prev.data?.[lockKey] || {}), [matchKey]: Date.now() };
                                          return { ...prev, data: { ...prev.data, [lockKey]: updated } };
                                        });
                                        showMsg(lang === 'hr' ? `🔒 Zaključano: #${matchKey}` : `🔒 Locked #${matchKey}`);
                                      }
                                    }} style={{
                                      padding: '3px 6px', fontSize: '0.65rem', borderRadius: '4px', cursor: (!isLocked && !pred) ? 'not-allowed' : 'pointer',
                                      background: isLocked ? 'rgba(0,255,136,0.1)' : 'rgba(255,184,0,0.1)',
                                      color: isLocked ? 'var(--primary)' : '#FFB800',
                                      border: isLocked ? '1px solid rgba(0,255,136,0.25)' : '1px solid rgba(255,184,0,0.25)',
                                      fontWeight: 600, whiteSpace: 'nowrap',
                                      opacity: (!isLocked && !pred) ? 0.4 : 1,
                                    }} disabled={!isLocked && !pred}
                                      title={isLocked ? (lang === 'hr' ? 'Otključaj' : 'Unlock') : (lang === 'hr' ? 'Zaključaj' : 'Lock')}
                                    >{isLocked ? '🔓' : '🔒'}</button>
                                  );
                                })()}

                                {isFinished && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                      {t('result')}: <strong>{actual.score1} - {actual.score2}</strong>
                                    </span>
                                    <span style={{
                                      fontSize: '0.72rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px',
                                      color: isExact ? '#00ff88' : isCorrect ? '#FFB800' : '#ff5555',
                                      background: isExact ? 'rgba(0, 255, 136, 0.15)' : isCorrect ? 'rgba(255, 184, 0, 0.12)' : 'rgba(255, 50, 50, 0.1)',
                                      border: `1px solid ${isExact ? 'rgba(0, 255, 136, 0.3)' : isCorrect ? 'rgba(255, 184, 0, 0.2)' : 'rgba(255, 50, 50, 0.2)'}`
                                    }}>
                                      +{pts} {t('pts')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {filtered.length > predLimit && (
                          <button
                            onClick={() => setPredLimit(prev => prev + 50)}
                            className="btn-primary"
                            style={{ padding: '6px 12px', fontSize: '0.75rem', marginTop: '6px', alignSelf: 'center' }}
                          >
                            {lang === 'hr' ? 'Prikaži više' : 'Show More'} ({filtered.length - predLimit} preostalo)
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      , document.body)}
    </div>
  );
}
