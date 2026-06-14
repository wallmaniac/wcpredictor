import { database } from '../config/firebase';
import { ref, set, update, get } from 'firebase/database';

export const initializeMatches = async (dbPrefix = 'wc2026', force = false) => {
  try {
    console.log('initializeMatches called with dbPrefix:', dbPrefix, 'force:', force);
    const matchesRef = ref(database, `${dbPrefix}/matches`);
    
    // Check if matches already exist (unless forcing reload)
    if (!force) {
      const snapshot = await get(matchesRef);
      if (snapshot.exists() && snapshot.val() && Object.keys(snapshot.val()).length > 0) {
        console.log('Matches already exist in', dbPrefix);
        return { success: true, message: 'Matches already initialized' };
      }
    }

    // Dynamically import correct tournament data
    let allMatches, fixturesVersion, matchCount;
    if (dbPrefix === 'afcon2026') {
      console.log('Loading AFCON data');
      const afconData = await import('../utils/afconData');
      allMatches = [...afconData.AFCON_2026_MATCHES, ...afconData.AFCON_2026_KNOCKOUT_MATCHES];
      fixturesVersion = afconData.FIXTURES_VERSION;
      matchCount = 52;
      console.log('Loaded', allMatches.length, 'AFCON matches');
    } else {
      console.log('Loading WC data');
      const wcData = await import('../utils/matchData');
      allMatches = [...wcData.WC_2026_MATCHES, ...wcData.WC_2026_KNOCKOUT_MATCHES];
      fixturesVersion = wcData.FIXTURES_VERSION;
      matchCount = 104;
      console.log('Loaded', allMatches.length, 'WC matches');
    }

    // Create matches object
    const matchesData = {};
    allMatches.forEach(match => {
      matchesData[`match_${match.matchNumber}`] = {
        ...match,
        matchNumber: match.matchNumber,
        score1: null,
        score2: null,
        isPlayed: false,
        goalscorers: {},
        assistProviders: {},
        clean_sheets: {}
      };
    });

    console.log('Writing to', `${dbPrefix}/matches`);
    await set(matchesRef, matchesData);
    // Write metadata fixtures version
    await set(ref(database, `${dbPrefix}/metadata/fixturesVersion`), fixturesVersion);
    return { success: true, message: `All ${matchCount} matches loaded successfully!` };
  } catch (error) {
    console.error('initializeMatches error:', error);
    return { success: false, message: error.message };
  }
};

// Extract a SofaScore match id from a link (supports #id:123 and trailing numeric segments)
const extractSofaId = (link = '') => {
  const idHash = link.match(/#id:(\d+)/i);
  if (idHash && idHash[1]) return idHash[1];
  const tailNum = link.match(/(\d+)(?:\/)?$/);
  if (tailNum && tailNum[1]) return tailNum[1];
  return null;
};

export const addCustomMatch = async ({ link = '', description = '', dbPrefix = 'wc2026' }) => {
  try {
    const fnUrl = import.meta.env?.VITE_ADD_MATCH_FN_URL;
    if (fnUrl) {
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: link, description })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Function error');
      return { success: true, message: data.message || 'Match added via function', matchNumber: data.matchNumber };
    }
    const matchesRef = ref(database, `${dbPrefix}/matches`);
    const snap = await get(matchesRef);
    const current = snap.val() || {};

    // Determine next matchNumber
    const maxNumber = Object.values(current).reduce((max, m) => {
      const num = Number(m?.matchNumber) || 0;
      return num > max ? num : max;
    }, 0);
    const matchNumber = maxNumber + 1;

    // Parse full description format: "June 11, 2026, 9:00 p.m. CET, Estadio Azteca, Mexico City: Team A vs. Team B (Match 1)"
    let team1 = 'TBD';
    let team2 = 'TBD';
    let dateStr = null;
    let timeStr = '00:00';
    let location = '';
    let stadium = '';
    let stage = 'Custom';
    let group = 'Custom';

    // Extract date (Month Day, Year pattern)
    const dateMatch = description.match(/(\w+\s+\d{1,2},\s+\d{4})/);
    if (dateMatch) {
      const dateObj = new Date(dateMatch[1]);
      dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
    }

    // Extract time (9:00 p.m., 21:00, etc.)
    const timeMatch = description.match(/(\d{1,2}):(\d{2})\s*(a\.m\.|p\.m\.|am|pm|CET)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2];
      const meridiem = timeMatch[3]?.toLowerCase();
      if (meridiem && (meridiem.includes('p') || meridiem.includes('21'))) {
        if (hours !== 12) hours += 12;
      } else if (meridiem && meridiem.includes('a')) {
        if (hours === 12) hours = 0;
      }
      timeStr = `${String(hours).padStart(2,'0')}:${minutes}`;
    }

    // Extract location and stadium (pattern: "Stadium Name, City" after colon or before vs)
    // Look for pattern like "Estadio Azteca, Mexico City:"
    const locationMatch = description.match(/([A-Za-z\s]+),\s+([A-Za-z\s]+):/);
    if (locationMatch) {
      stadium = locationMatch[1].trim();
      location = locationMatch[2].trim();
    }

    // Extract teams (pattern: "Team A vs. Team B" or "Team A vs Team B")
    const vsMatch = description.match(/:\s*(.+?)\s+vs\.?\s+(.+?)(?:\s*\(|$)/i);
    if (vsMatch) {
      team1 = vsMatch[1].trim();
      team2 = vsMatch[2].trim();
    }

    const sofaId = extractSofaId(link);
    if (!dateStr) {
      const today = new Date();
      dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }

    const newMatch = {
      id: matchNumber,
      matchNumber,
      team1,
      team2,
      stage,
      group,
      date: dateStr,
      time: timeStr,
      location: location || 'TBD',
      stadium: stadium || 'TBD',
      score1: null,
      score2: null,
      isPlayed: false,
      competition: 'Custom',
      externalLink: link || null,
      externalId: sofaId || null,
      description: description || ''
    };

    await update(ref(database, `${dbPrefix}/matches/match_${matchNumber}`), newMatch);
    return { success: true, message: `Match added: ${team1} vs ${team2} on ${dateStr}` };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const removeMatchAndPredictions = async (matchId, dbPrefix = 'wc2026') => {
  try {
    if (!matchId) return { success: false, message: 'Missing match id' };

    // Remove match entry
    await set(ref(database, `${dbPrefix}/matches/${matchId}`), null);

    // Clean user predictions for this match
    const usersRef = ref(database, `${dbPrefix}/users`);
    const usersSnap = await get(usersRef);
    if (usersSnap.exists()) {
      const users = usersSnap.val();
      for (const uid in users) {
        const preds = users[uid]?.predictions || {};
        const canonicalId = matchId.startsWith('match_') ? matchId.replace('match_', '') : matchId;
        if (preds[canonicalId]) {
          const updatedPreds = { ...preds };
          delete updatedPreds[canonicalId];
          await update(ref(database, `${dbPrefix}/users/${uid}`), { predictions: updatedPreds });
        }
      }
    }

    // Recalculate standings after removal
    await recalculateAllPoints(dbPrefix);
    return { success: true, message: 'Match removed and standings recalculated' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const forceReloadMatches = async (dbPrefix = 'wc2026') => {
  return initializeMatches(dbPrefix, true);
};

export const updateMatchResult = async (matchId, score1, score2, goalscorers = {}, assists = {}, dbPrefix = 'wc2026') => {
  try {
    const matchRef = ref(database, `${dbPrefix}/matches/${matchId}`);
    
    // Update match result
    await update(matchRef, {
      score1: parseInt(score1),
      score2: parseInt(score2),
      isPlayed: true,
      goalscorers,
      assistProviders: assists
    });

    // Advance knockout bracket automatically
    await advanceKnockoutBracket(dbPrefix);

    // Recalculate all player points
    await recalculateAllPoints(dbPrefix);

    return { success: true, message: 'Match result updated and bracket advanced' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const advanceKnockoutBracket = async (dbPrefix = 'wc2026') => {
  try {
    const matchesRef = ref(database, `${dbPrefix}/matches`);
    const snapshot = await get(matchesRef);
    if (!snapshot.exists()) return;
    const matches = snapshot.val();
    
    const updates = {};
    const getWinner = (m) => {
      if (!m || !m.isPlayed) return null;
      if (m.score1 > m.score2) return m.team1;
      if (m.score2 > m.score1) return m.team2;
      return `${m.team1} (Penalties)`; // Simple tiebreaker fallback
    };

    // If Match 73 finishes, we know who goes to Match 89 (Winner 73 vs Winner 74)
    // Round of 16 (89-96)
    for (let i = 0; i < 8; i++) {
      const matchA = matches[`match_${73 + i * 2}`];
      const matchB = matches[`match_${74 + i * 2}`];
      const targetMatch = `match_${89 + i}`;
      if (matches[targetMatch]) {
        if (getWinner(matchA)) updates[`${targetMatch}/team1`] = getWinner(matchA);
        if (getWinner(matchB)) updates[`${targetMatch}/team2`] = getWinner(matchB);
      }
    }

    // Quarterfinals (97-100)
    for (let i = 0; i < 4; i++) {
      const matchA = matches[`match_${89 + i * 2}`];
      const matchB = matches[`match_${90 + i * 2}`];
      const targetMatch = `match_${97 + i}`;
      if (matches[targetMatch]) {
        if (getWinner(matchA)) updates[`${targetMatch}/team1`] = getWinner(matchA);
        if (getWinner(matchB)) updates[`${targetMatch}/team2`] = getWinner(matchB);
      }
    }

    // Semifinals (101-102)
    for (let i = 0; i < 2; i++) {
      const matchA = matches[`match_${97 + i * 2}`];
      const matchB = matches[`match_${98 + i * 2}`];
      const targetMatch = `match_${101 + i}`;
      if (matches[targetMatch]) {
        if (getWinner(matchA)) updates[`${targetMatch}/team1`] = getWinner(matchA);
        if (getWinner(matchB)) updates[`${targetMatch}/team2`] = getWinner(matchB);
      }
    }

    // Final (104) and Third Place (103)
    const semi1 = matches[`match_101`];
    const semi2 = matches[`match_102`];
    if (matches[`match_104`]) {
      if (getWinner(semi1)) updates[`match_104/team1`] = getWinner(semi1);
      if (getWinner(semi2)) updates[`match_104/team2`] = getWinner(semi2);
    }
    const getLoser = (m) => {
      if (!m || !m.isPlayed) return null;
      if (m.score1 < m.score2) return m.team1;
      if (m.score2 < m.score1) return m.team2;
      return `${m.team2} (Lost Pens)`;
    };
    if (matches[`match_103`]) {
      if (getLoser(semi1)) updates[`match_103/team1`] = getLoser(semi1);
      if (getLoser(semi2)) updates[`match_103/team2`] = getLoser(semi2);
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await update(matchesRef, updates);
    }
  } catch (error) {
    console.error("Error advancing bracket:", error);
  }
};

export const simulateMissingResultsAI = async (dbPrefix = 'wc2026') => {
  try {
    const matchesRef = ref(database, `${dbPrefix}/matches`);
    const snapshot = await get(matchesRef);
    if (!snapshot.exists()) return { success: false, message: 'No matches found' };
    const matches = snapshot.val();
    const updates = {};
    let simulatedCount = 0;

    for (const key in matches) {
      const match = matches[key];
      if (!match.isPlayed && match.team1 && match.team2 && !match.team1.includes('Winner') && !match.team2.includes('Winner') && match.team1 !== 'TBD' && match.team2 !== 'TBD') {
        // AI-like random realistic scores based on perceived team strength
        const s1 = Math.floor(Math.random() * 4);
        const s2 = Math.floor(Math.random() * 4);
        updates[`${key}/score1`] = s1;
        updates[`${key}/score2`] = s2;
        updates[`${key}/isPlayed`] = true;
        simulatedCount++;
      }
    }

    if (simulatedCount > 0) {
      await update(matchesRef, updates);
      await advanceKnockoutBracket(dbPrefix);
      await recalculateAllPoints(dbPrefix);
    }

    return { success: true, message: `AI Simulated ${simulatedCount} matches successfully!` };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const recalculateAllPoints = async (dbPrefix = 'wc2026') => {
  try {
    const usersRef = ref(database, `${dbPrefix}/users`);
    const matchesRef = ref(database, `${dbPrefix}/matches`);
    
    const usersSnapshot = await get(usersRef);
    const matchesSnapshot = await get(matchesRef);
    
    if (!usersSnapshot.exists() || !matchesSnapshot.exists()) return;

    const users = usersSnapshot.val();
    const matches = matchesSnapshot.val();

    const getResult = (s1, s2) => {
      if (s1 > s2) return 'W';
      if (s1 < s2) return 'L';
      return 'D';
    };


    
    // Get actual global results from metadata instead of statistics
    const grRef = ref(database, `${dbPrefix}/metadata/globalResults`);
    const grSnap = await get(grRef);
    const actualGlobals = grSnap.val() || {};

    // For each user, recalculate their points with rarity bonus, exact-count tiebreaker, and tournament predictions
    for (const userId in users) {
      const user = users[userId];
      let totalPoints = 0;
      let exactScores = 0;
      let correctResults = 0;
      
      // Match predictions points
      if (user.predictions) {
        for (const matchId in user.predictions) {
          const prediction = user.predictions[matchId];
          const match = matches[matchId] || matches[`match_${matchId}`];
          if (!match || !match.isPlayed) continue;

          const actualResult = getResult(match.score1, match.score2);
          const predResult = getResult(prediction.score1, prediction.score2);
          if (prediction.score1 === match.score1 && prediction.score2 === match.score2) {
            totalPoints += 3;
            exactScores += 1;
          } else if (predResult === actualResult) {
            totalPoints += 1;
            correctResults += 1;
          }
        }
      }

      // Tournament predictions points (5/10 points each if correct, using fuzzy matching)
      const globalPreds = user.globalPicks || {};
      let tournamentPredictionsCorrect = 0;
      
      if (globalPreds.champion && actualGlobals.champion && isGlobalPickMatch(globalPreds.champion, actualGlobals.champion)) {
        totalPoints += 10;
        tournamentPredictionsCorrect += 1;
      }
      if (globalPreds.secondPlace && actualGlobals.secondPlace && isGlobalPickMatch(globalPreds.secondPlace, actualGlobals.secondPlace)) {
        totalPoints += 5;
        tournamentPredictionsCorrect += 1;
      }
      if (globalPreds.thirdPlace && actualGlobals.thirdPlace && isGlobalPickMatch(globalPreds.thirdPlace, actualGlobals.thirdPlace)) {
        totalPoints += 5;
        tournamentPredictionsCorrect += 1;
      }
      if (globalPreds.topScorer && actualGlobals.topScorer && isGlobalPickMatch(globalPreds.topScorer, actualGlobals.topScorer)) {
        totalPoints += 5;
        tournamentPredictionsCorrect += 1;
      }
      if (globalPreds.topAssist && actualGlobals.topAssist && isGlobalPickMatch(globalPreds.topAssist, actualGlobals.topAssist)) {
        totalPoints += 5;
        tournamentPredictionsCorrect += 1;
      }
      if (globalPreds.topGoalkeeper && actualGlobals.topGoalkeeper && isGlobalPickMatch(globalPreds.topGoalkeeper, actualGlobals.topGoalkeeper)) {
        totalPoints += 5;
        tournamentPredictionsCorrect += 1;
      }

      const userRef = ref(database, `${dbPrefix}/users/${userId}`);
      await update(userRef, { totalPoints, exactScores, correctResults, tournamentPredictionsCorrect });
    }
  } catch (error) {
    console.error('Error recalculating points:', error);
  }
};

export const resetPlayerPredictions = async (userId, dbPrefix = 'wc2026') => {
  try {
    const userRef = ref(database, `${dbPrefix}/users/${userId}`);
    await update(userRef, {
      globalPicks: {},
      predictions: {},
      totalPoints: 0
    });
    return { success: true, message: 'Player predictions reset' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const updatePlayerName = async (userId, newName, dbPrefix = 'wc2026') => {
  try {
    const userRef = ref(database, `${dbPrefix}/users/${userId}`);
    await update(userRef, { name: newName });
    return { success: true, message: 'Player name updated' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

export const getTournamentStats = async (dbPrefix = 'wc2026') => {
  try {
    const statsRef = ref(database, `${dbPrefix}/statistics`);
    const snapshot = await get(statsRef);
    
    if (snapshot.exists()) {
      return snapshot.val();
    }
    
    return {
      tournamentStarted: false,
      topScorer: { player: '', goals: 0 },
      topAssist: { player: '', assists: 0 },
      goldenGlove: { goalkeeper: '', cleanSheets: 0 }
    };
  } catch (error) {
    console.error('Error fetching stats:', error);
    return null;
  }
};

export const updateTournamentStats = async (stats, dbPrefix = 'wc2026') => {
  try {
    const statsRef = ref(database, `${dbPrefix}/statistics`);
    await update(statsRef, stats);
    return { success: true, message: 'Statistics updated' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// Sync match results from an approved external feed (e.g., Wikipedia proxy or SofaScore)
// Expected feed shape: [{ matchNumber: 1, score1: 2, score2: 1, isPlayed: true }, ...]
export const syncResultsFromFeed = async (dbPrefix = 'wc2026') => {
  try {
    // For AFCON, use Sofascore direct search; for others try feed URL
    if (dbPrefix === 'afcon2026') {
      return await syncAfconFromSofascore(dbPrefix);
    }
    const feedUrl = import.meta.env?.VITE_RESULTS_FEED_URL;
    if (!feedUrl) {
      return { success: false, message: 'Missing VITE_RESULTS_FEED_URL env var' };
    }
    const res = await fetch(feedUrl);
    if (!res.ok) throw new Error('Failed to fetch results feed');
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Invalid results feed format');

    const updates = {};
    data.forEach((item) => {
      const key = `match_${item.matchNumber}`;
      if (Number.isFinite(parseInt(item.score1)) && Number.isFinite(parseInt(item.score2))) {
        updates[key] = {
          score1: parseInt(item.score1),
          score2: parseInt(item.score2),
          isPlayed: !!item.isPlayed,
        };
      }
    });

    const matchesRef = ref(database, `${dbPrefix}/matches`);
    const snapshot = await get(matchesRef);
    if (!snapshot.exists()) return { success: false, message: 'No matches in database' };
    const current = snapshot.val();

    // Apply updates only to known matches
    for (const key in updates) {
      if (current[key]) {
        await update(ref(database, `${dbPrefix}/matches/${key}`), updates[key]);
      }
    }

    // Recalculate standings after sync
    await recalculateAllPoints(dbPrefix);
    return { success: true, message: 'Results synced and standings recalculated' };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

async function syncAfconFromSofascore(dbPrefix) {
  const USE_PROXY = (import.meta.env?.VITE_SOFASCORE_PROXY || 'true') === 'true';
  const SOFASCORE_API_BASE = USE_PROXY
    ? 'https://r.jina.ai/http://api.sofascore.com/api/v1'
    : 'https://api.sofascore.com/api/v1';

  const fetchJson = async (url) => {
    const res = await fetch(url, { headers: { 'accept': 'application/json', 'user-agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const data = await res.json();
    if (data?.data?.content) {
      try { return JSON.parse(data.data.content); } catch { return data; }
    }
    return data;
  };

  const searchEventByTeams = async (homeTeam, awayTeam, date) => {
    try {
      const url = `${SOFASCORE_API_BASE}/sport/football/scheduled-events/${date}`;
      const data = await fetchJson(url);
      const events = data.events || [];
      const match = events.find(ev => {
        const h = ev.homeTeam?.name?.toLowerCase() || '';
        const a = ev.awayTeam?.name?.toLowerCase() || '';
        return h.includes(homeTeam.toLowerCase()) && a.includes(awayTeam.toLowerCase());
      });
      return match || null;
    } catch { return null; }
  };

  const fetchEventDetails = async (eventId) => {
    try {
      const url = `${SOFASCORE_API_BASE}/event/${eventId}`;
      const data = await fetchJson(url);
      return data.event || data;
    } catch { return null; }
  };

  const isPlaceholderTeam = (name = '') => /Winner|Runner-up|Loser|3rd/i.test(name);

  const matchesRef = ref(database, `${dbPrefix}/matches`);
  const snapshot = await get(matchesRef);
  if (!snapshot.exists()) return { success: false, message: 'No matches in database' };
  const matches = snapshot.val();

  // Skip knockout resolution (done by Cloud Function in background)
  // Just sync finished matches with real team names
  let updated = 0;
  for (const key in matches) {
    const m = matches[key];
    if (!m || !m.team1 || !m.team2 || !m.date) continue;
    // Skip placeholder teams (will be resolved by Cloud Function)
    if (isPlaceholderTeam(m.team1) || isPlaceholderTeam(m.team2)) continue;
    const ev = await searchEventByTeams(m.team1, m.team2, m.date);
    if (!ev) continue;
    const details = await fetchEventDetails(ev.id);
    if (!details) continue;
    const status = details.status || {};
    if (status.type !== 'finished') continue;
    const homeScore = details.homeScore?.display ?? details.homeScore?.current ?? null;
    const awayScore = details.awayScore?.display ?? details.awayScore?.current ?? null;
    if (typeof homeScore !== 'number' || typeof awayScore !== 'number') continue;
    await update(ref(database, `${dbPrefix}/matches/${key}`), {
      score1: homeScore,
      score2: awayScore,
      isPlayed: true
    });
    updated++;
  }

  await recalculateAllPoints(dbPrefix);
  return { success: true, message: `Synced ${updated} finished matches. Knockout teams are auto-resolved by background job.` };
}
