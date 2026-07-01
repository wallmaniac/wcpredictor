/**
 * Full Firebase Sync Script
 * Syncs PL match scores, standings, and player stats from API-Football v3 (api-sports.io)
 * Run with: node syncAll.cjs
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, set, get, update } = require('firebase/database');

const firebaseConfig = {
  apiKey: "AIzaSyD18nM_L5YtQuYojZq8ofAYe14pPHBV6SE",
  authDomain: "wc-2026-predictor.firebaseapp.com",
  databaseURL: "https://wc-2026-predictor-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "wc-2026-predictor",
  storageBucket: "wc-2026-predictor.firebasestorage.app",
  messagingSenderId: "164230057412",
  appId: "1:164230057412:web:b28c00a99b8d451b68e891",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const API_BASE = 'https://v3.football.api-sports.io';
const PL_LEAGUE_ID = 39;
const PL_SEASON = 2025;

// Normalize team names between API responses and our match data
const TEAM_NAME_MAP = {
  'Cote D Ivoire': 'Ivory Coast',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cabo Verde': 'Cape Verde',
  'Korea Republic': 'South Korea',
  'USA': 'United States',
  'IR Iran': 'Iran',
  'Curacao': 'Curaçao',
  'Congo DR': 'DR Congo',
  'Congo': 'DR Congo',
  'Wolverhampton Wanderers': 'Wolverhampton Wanderers',
  'Wolves': 'Wolverhampton Wanderers',
  'Brighton': 'Brighton & Hove Albion',
  'Brighton Hove Albion': 'Brighton & Hove Albion',
  'Brighton and Hove Albion': 'Brighton & Hove Albion',
  'Tottenham': 'Tottenham Hotspur',
  'Spurs': 'Tottenham Hotspur',
  'West Ham': 'West Ham United',
  'Nottingham Forest': 'Nottingham Forest',
  'Nott\'m Forest': 'Nottingham Forest',
  'Man City': 'Manchester City',
  'Man United': 'Manchester United',
  'Manchester Utd': 'Manchester United',
  'Newcastle': 'Newcastle United',
  'Newcastle Utd': 'Newcastle United',
  'Bournemouth': 'AFC Bournemouth',
  'AFC Bournemouth': 'AFC Bournemouth',
  'A.F.C. Bournemouth': 'AFC Bournemouth',
  'Leeds': 'Leeds United',
  'Crystal Palace': 'Crystal Palace',
  'Aston Villa': 'Aston Villa',
  'Sunderland AFC': 'Sunderland',
};

function normalizeTeamName(name) {
  if (!name) return '';
  const trimmed = name.trim();
  return TEAM_NAME_MAP[trimmed] || trimmed;
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

function isSamePlayer(p1, p2) {
  if (!p1 || !p2) return false;
  if (normalizeTeamName(p1.team) !== normalizeTeamName(p2.team)) {
    return false;
  }
  const n1 = removeDiacritics(p1.name);
  const n2 = removeDiacritics(p2.name);
  
  if (n1 === n2) return true;
  
  const words1 = n1.split(/\s+/).filter(Boolean);
  const words2 = n2.split(/\s+/).filter(Boolean);
  
  if (words1.length === 0 || words2.length === 0) return false;
  
  const last1 = words1[words1.length - 1];
  const last2 = words2[words2.length - 1];
  if (last1 === last2) {
    const first1 = words1[0];
    const first2 = words2[0];
    if (first1.length === 1 && first2.startsWith(first1)) return true;
    if (first2.length === 1 && first1.startsWith(first2)) return true;
  }
  
  const shorter = words1.length < words2.length ? words1 : words2;
  const longer = words1.length < words2.length ? words2 : words1;
  if (shorter.length > 0) {
    const isSubset = shorter.every(w => {
      return longer.some(lw => lw === w || (w.length === 1 && lw.startsWith(w)));
    });
    if (isSubset) return true;
  }
  
  return false;
}

function levenshteinDistance(a, b) {
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
}

function areNamesSimilar(pick, act) {
  const p = removeDiacritics(pick).replace(/[^a-z0-9]/g, '');
  const a = removeDiacritics(act).replace(/[^a-z0-9]/g, '');
  if (p === a) return true;
  if (p.length < 3 || a.length < 3) return false;
  
  const dist = levenshteinDistance(p, a);
  const allowedError = a.length >= 6 ? 2 : 1;
  if (dist <= allowedError) return true;

  const pWords = removeDiacritics(pick).split(/\s+/).filter(w => w.length >= 3);
  const aWords = removeDiacritics(act).split(/\s+/).filter(w => w.length >= 3);
  for (const pw of pWords) {
    for (const aw of aWords) {
      if (pw === aw) return true;
      const wDist = levenshteinDistance(pw, aw);
      const wAllowed = aw.length >= 6 ? 2 : 1;
      if (wDist <= wAllowed) return true;
    }
  }
  
  return false;
}

function isGlobalPickMatch(userPick, actualResult) {
  if (!userPick || !actualResult) return false;
  
  const pickNorm = removeDiacritics(userPick.toString());
  const actualNorm = removeDiacritics(actualResult.toString());
  
  if (pickNorm === actualNorm) return true;
  
  const actuals = actualNorm.split(',').map(s => s.trim()).filter(Boolean);
  for (const act of actuals) {
    if (pickNorm === act) return true;
    if (areNamesSimilar(userPick.toString(), act)) return true;
    
    const pickWords = pickNorm.split(/\s+/).filter(Boolean);
    const actWords = act.split(/\s+/).filter(Boolean);
    
    if (pickWords.length > 0 && actWords.length > 0) {
      const pickLast = pickWords[pickWords.length - 1];
      const actLast = actWords[actWords.length - 1];
      if (pickLast.length >= 3 && pickLast === actLast) return true;
      if (act.includes(pickNorm) || pickNorm.includes(act)) return true;
    }
  }
  return false;
}

const PL_DEFAULT_CLEAN_SHEETS = [
  { name: "David Raya", team: "Arsenal", count: 18 },
  { name: "Gianluigi Donnarumma", team: "Manchester City", count: 14 },
  { name: "Djordje Petrovic", team: "Bournemouth", count: 11 },
  { name: "Dean Henderson", team: "Crystal Palace", count: 11 },
  { name: "Jordan Pickford", team: "Everton", count: 11 },
  { name: "André Onana", team: "Manchester United", count: 10 },
  { name: "Mark Flekken", team: "Brentford", count: 9 },
];

function calculatePLPoints(prediction, actual) {
  if (!prediction || !actual || actual.status !== 'finished') return 0;
  const p1 = prediction.score1;
  const p2 = prediction.score2;
  if (p1 === undefined || p1 === null || p1 === '' ||
      p2 === undefined || p2 === null || p2 === '') {
    return 0;
  }
  if (p1 === actual.score1 && p2 === actual.score2) return 3;
  const predDiff = p1 - p2;
  const actDiff = actual.score1 - actual.score2;
  if ((predDiff > 0 && actDiff > 0) || (predDiff < 0 && actDiff < 0) || (predDiff === 0 && actDiff === 0)) return 1;
  return 0;
}

async function getApiKey() {
  const snap = await get(ref(db, 'wc2026/metadata/apiKey'));
  return snap.exists() ? snap.val() : '';
}

async function apiFetch(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}/${endpoint}?${qs}`;
  console.log(`[API-Football] GET /${endpoint}?${qs}`);
  const response = await fetch(url, {
    headers: { 'x-apisports-key': API_KEY }
  });
  if (!response.ok) throw new Error(`API responded with status ${response.status}`);
  const json = await response.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(`API Error: ${Object.values(json.errors).join(', ')}`);
  }
  const remaining = response.headers.get('x-ratelimit-requests-remaining');
  if (remaining) console.log(`[API-Football] Remaining requests today: ${remaining}`);
  return json;
}

// Module-level API_KEY, set in main() before any apiFetch calls
let API_KEY = '';

async function recalculateAllPoints() {
  console.log('🔄 Recalculating user points and global pick bonuses...');
  
  const allUsersSnap = await get(ref(db, 'wc2026/users'));
  if (!allUsersSnap.exists()) return;
  const allUsers = allUsersSnap.val();

  const currentMatchesSnap = await get(ref(db, 'pl2526/match_results'));
  const currentMatches = currentMatchesSnap.val() || {};

  const plUsersSnap = await get(ref(db, 'pl2526/users'));
  const plUsers = plUsersSnap?.val() || {};

  const globalMetaSnap = await get(ref(db, 'pl2526/metadata/globalResults'));
  const actualGlobals = globalMetaSnap.val() || {};

  const updates = {};

  for (const uid in allUsers) {
    let matchPoints = 0;
    let exactScoresCount = 0;
    let correctResultsCount = 0;
    
    const preds = plUsers[uid]?.predictions || {};

    // Match points
    for (const mId in currentMatches) {
      const m = currentMatches[mId];
      const mNum = mId.replace('match_', '');
      if (m.status === 'finished' && preds[mNum]) {
        const pts = calculatePLPoints(preds[mNum], m);
        matchPoints += pts;
        if (pts === 3) exactScoresCount++;
        if (pts === 1) correctResultsCount++;
      }
    }

    // Global picks bonus points
    const gPicks = plUsers[uid]?.globalPicks || {};
    let globalPickPoints = 0;

    const globalChecks = [
      { key: 'champion', pick: gPicks.champion, actual: actualGlobals.champion, pts: 10 },
      { key: 'secondPlace', pick: gPicks.secondPlace, actual: actualGlobals.secondPlace, pts: 5 },
      { key: 'thirdPlace', pick: gPicks.thirdPlace, actual: actualGlobals.thirdPlace, pts: 5 },
      { key: 'topScorer', pick: gPicks.topScorer, actual: actualGlobals.topScorer, pts: 5 },
      { key: 'topHighlight', pick: gPicks.topAssist || gPicks.topHighlight, actual: actualGlobals.topAssist, pts: 5 },
      { key: 'topGoalkeeper', pick: gPicks.topGoalkeeper, actual: actualGlobals.topGoalkeeper, pts: 5 },
    ];

    for (const check of globalChecks) {
      const correct = check.actual && check.pick && isGlobalPickMatch(check.pick, check.actual);
      if (correct) globalPickPoints += check.pts;
    }

    const totalPoints = matchPoints + globalPickPoints;

    updates[`pl2526/users/${uid}/totalPoints`] = totalPoints;
    updates[`pl2526/users/${uid}/matchPoints`] = matchPoints;
    updates[`pl2526/users/${uid}/globalPickPoints`] = globalPickPoints;
    updates[`pl2526/users/${uid}/exactScores`] = exactScoresCount;
    updates[`pl2526/users/${uid}/correctResults`] = correctResultsCount;
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
    console.log(`   ✅ Recalculated points for ${Object.keys(updates).length / 5} users.`);
  }
}

function findMatchNumber(apiEvent, matchList) {
  const homeTeam = normalizeTeamName(apiEvent.teams.home.name);
  const awayTeam = normalizeTeamName(apiEvent.teams.away.name);
  const matchDate = apiEvent.fixture.date.split('T')[0];
  const apiRound = apiEvent.league.round || '';
  const roundNumber = apiRound.replace(/\D/g, '');

  // Try exact team + date match first
  let match = matchList.find(m => 
    m.team1 === homeTeam && m.team2 === awayTeam && m.date === matchDate
  );
  
  // Try reversed teams + exact date
  if (!match) {
    match = matchList.find(m => 
      m.team1 === awayTeam && m.team2 === homeTeam && m.date === matchDate
    );
  }

  // Fallback: match by teams + matchday/round
  if (!match && roundNumber) {
    match = matchList.find(m => {
      const teamsMatch = (m.team1 === homeTeam && m.team2 === awayTeam) ||
                         (m.team1 === awayTeam && m.team2 === homeTeam);
      return teamsMatch && m.matchday && String(m.matchday) === String(roundNumber);
    });
  }

  // Fallback: match by teams + close date (within 5 days)
  if (!match) {
    match = matchList.find(m => {
      const teamsMatch = (m.team1 === homeTeam && m.team2 === awayTeam) ||
                         (m.team1 === awayTeam && m.team2 === homeTeam);
      if (!teamsMatch) return false;
      const apiDate = new Date(matchDate);
      const ourDate = new Date(m.date);
      const diffDays = Math.abs(apiDate - ourDate) / (1000 * 60 * 60 * 24);
      return diffDays <= 5;
    });
  }

  return match?.matchNumber ?? null;
}

async function main() {
  console.log('🔐 Signing in...');
  await signInWithEmailAndPassword(auth, 'admin@wc2026.com', 'admin1');
  console.log('✅ Signed in.\n');

  API_KEY = await getApiKey();
  if (!API_KEY) {
    console.error('❌ No API key found in Firebase. Save it via Admin Panel first.');
    process.exit(1);
  }
  console.log(`🔑 API Key: ${API_KEY.substring(0, 10)}***\n`);

  // === 1. SYNC PL MATCH SCORES ===
  console.log('═══════════════════════════════════════');
  console.log('⚽ SYNCING PL MATCH SCORES...');
  console.log('═══════════════════════════════════════');
  try {
    const json = await apiFetch('fixtures', {
      league: PL_LEAGUE_ID,
      season: PL_SEASON,
      status: 'FT-AET-PEN',
    });

    const finished = json.response || [];
    console.log(`   Total finished fixtures: ${finished.length}`);

    const fixturesSnap = await get(ref(db, 'pl2526/fixtures'));
    const savedFixtures = fixturesSnap.val() || {};
    const savedFixturesList = Object.values(savedFixtures);

    const apiIdToMatch = {};
    for (const key in savedFixtures) {
      const f = savedFixtures[key];
      if (f.apiMatchId) apiIdToMatch[f.apiMatchId] = f.matchNumber;
    }

    const matchUpdates = {};
    const resultsUpdates = {};

    for (const m of finished) {
      const fixtureId = m.fixture.id;
      const homeTeamName = m.teams.home.name;
      const awayTeamName = m.teams.away.name;
      const homeScore = m.goals.home ?? 0;
      const awayScore = m.goals.away ?? 0;
      const matchDate = m.fixture.date.split('T')[0];
      const matchTime = m.fixture.date.split('T')[1]?.substring(0, 5) || '';
      const matchRound = m.league.round || '';
      const matchStatus = m.fixture.status.short; // FT, AET, PEN
      const stadium = m.fixture.venue?.name || '';

      // Save raw match for api_matches
      matchUpdates[`pl2526/api_matches/${fixtureId}`] = {
        home: homeTeamName,
        away: awayTeamName,
        homeScore: parseInt(homeScore) || 0,
        awayScore: parseInt(awayScore) || 0,
        date: matchDate,
        time: matchTime,
        round: matchRound,
        status: matchStatus,
        stadium: stadium,
      };

      // Save correct score mapped results
      let matchNumber = apiIdToMatch[fixtureId] || null;
      if (matchNumber === null) {
        matchNumber = findMatchNumber(m, savedFixturesList);
      }

      if (matchNumber !== null) {
        const homeGoals = parseInt(homeScore) || 0;
        const awayGoals = parseInt(awayScore) || 0;
        const homeTeam = normalizeTeamName(homeTeamName);
        const dbMatch = savedFixtures[`match_${matchNumber}`];
        
        let score1, score2;
        if (dbMatch && dbMatch.team1 === homeTeam) {
          score1 = homeGoals;
          score2 = awayGoals;
        } else {
          score1 = awayGoals;
          score2 = homeGoals;
        }

        resultsUpdates[`pl2526/match_results/match_${matchNumber}`] = {
          score1,
          score2,
          status: 'finished',
          isPlayed: true,
          apiMatchId: fixtureId,
          syncedAt: Date.now()
        };
      }
    }

    if (Object.keys(matchUpdates).length > 0) {
      await update(ref(db), matchUpdates);
    }
    if (Object.keys(resultsUpdates).length > 0) {
      await update(ref(db), resultsUpdates);
      console.log(`   ✅ Saved ${Object.keys(resultsUpdates).length} finished match results.`);
    }
  } catch (err) {
    console.error('❌ Match sync error:', err.message);
  }

  // === 2. SYNC PL STANDINGS ===
  console.log('\n═══════════════════════════════════════');
  console.log('📋 SYNCING PL STANDINGS...');
  console.log('═══════════════════════════════════════');
  try {
    const json = await apiFetch('standings', {
      league: PL_LEAGUE_ID,
      season: PL_SEASON,
    });

    const standingsArr = json.response?.[0]?.league?.standings?.[0];
    if (!standingsArr || !Array.isArray(standingsArr)) {
      console.error('❌ API Error: No standings data received');
    } else {
      const standings = standingsArr.map(t => ({
        position: t.rank || 0,
        team: t.team.name,
        played: t.all.played || 0,
        won: t.all.win || 0,
        drawn: t.all.draw || 0,
        lost: t.all.lose || 0,
        gf: t.all.goals.for || 0,
        ga: t.all.goals.against || 0,
        points: t.points || 0,
        badge: t.team.logo || '',
        promotion: t.description || '',
      }));
      standings.sort((a, b) => a.position - b.position);

      await set(ref(db, 'pl2526/standings'), {
        table: standings,
        lastSynced: Date.now(),
      });
      console.log(`   ✅ Saved standings for ${standings.length} teams.`);

      // Auto-update global results top 3 teams (removed to prevent premature leaderboard updates)
    }
  } catch (err) {
    console.error('❌ Standings sync error:', err.message);
  }

  // === 3. SYNC PL TOP SCORERS ===
  console.log('\n═══════════════════════════════════════');
  console.log('👟 SYNCING PL TOP SCORERS...');
  console.log('═══════════════════════════════════════');
  try {
    const json = await apiFetch('players/topscorers', {
      league: PL_LEAGUE_ID,
      season: PL_SEASON,
    });

    const scorersData = json.response || [];
    if (scorersData.length === 0) {
      console.error('❌ No top scorers data received');
    } else {
      const rawScorers = scorersData.map(p => ({
        name: p.player.name,
        team: p.statistics[0].team.name,
        count: p.statistics[0].goals.total || 0,
      }));

      // Deduplicate scorers
      const deduplicated = [];
      for (const s of rawScorers) {
        const existing = deduplicated.find(d => isSamePlayer(d, s));
        if (existing) {
          if (s.name.length > existing.name.length) {
            existing.name = s.name;
          }
          existing.count = Math.max(existing.count, s.count);
        } else {
          deduplicated.push({ ...s });
        }
      }

      const scorers = deduplicated
        .filter(p => p.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 15)
        .map(s => ({
          name: s.name,
          team: s.team,
          count: s.count,
        }));

      console.log(`   ✅ Fetched ${scorers.length} deduplicated top scorers.`);

      // Store scorers temporarily, will write all stats together below
      // Continue to fetch assists, clean sheets, then write once

      // === 4. SYNC PL TOP ASSISTS ===
      console.log('\n═══════════════════════════════════════');
      console.log('🎯 SYNCING PL TOP ASSISTS...');
      console.log('═══════════════════════════════════════');

      let assists = [];
      try {
        const assistsJson = await apiFetch('players/topassists', {
          league: PL_LEAGUE_ID,
          season: PL_SEASON,
        });

        const assistsData = assistsJson.response || [];
        assists = assistsData.map(p => ({
          name: p.player.name,
          team: p.statistics[0].team.name,
          count: p.statistics[0].goals.assists || 0,
        }))
        .filter(p => p.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

        console.log(`   ✅ Fetched ${assists.length} top assist leaders.`);
      } catch (err) {
        console.error('❌ Top assists sync error:', err.message);
      }

      // === 5. SYNC PL GOALKEEPER CLEAN SHEETS ===
      console.log('\n═══════════════════════════════════════');
      console.log('🧤 SYNCING PL GOALKEEPER CLEAN SHEETS...');
      console.log('═══════════════════════════════════════');

      let cleanSheets = [];
      try {
        const gkJson = await apiFetch('players', {
          league: PL_LEAGUE_ID,
          season: PL_SEASON,
          position: 'Goalkeeper',
          page: 1,
        });

        const gkData = gkJson.response || [];
        cleanSheets = gkData
          .map(p => ({
            name: p.player.name,
            team: p.statistics[0].team.name,
            count: p.statistics[0].games.cleansheets || 0,
            appearances: p.statistics[0].games.appearences || 0,
          }))
          .filter(gk => gk.appearances >= 5 && gk.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
          .map(gk => ({
            name: gk.name,
            team: gk.team,
            count: gk.count,
          }));

        console.log(`   ✅ Fetched ${cleanSheets.length} goalkeeper clean sheet leaders.`);
      } catch (err) {
        console.error('❌ Clean sheets sync error:', err.message);
      }

      // Fallback to defaults if nothing returned
      if (cleanSheets.length === 0) {
        const statsSnap = await get(ref(db, 'pl2526/statistics'));
        const existingStats = statsSnap.exists() ? statsSnap.val() : {};
        cleanSheets = existingStats.cleanSheets || PL_DEFAULT_CLEAN_SHEETS;
      }

      // Write all statistics
      await set(ref(db, 'pl2526/statistics'), {
        scorers,
        assists,
        cleanSheets,
        lastSynced: Date.now(),
      });

      console.log(`   ✅ Saved ${scorers.length} top scorers, ${assists.length} assist leaders, ${cleanSheets.length} GK clean sheets.`);

      // Auto-update global results with leaders (removed to prevent premature leaderboard updates)
    }
  } catch (err) {
    console.error('❌ Top scorers sync error:', err.message);
  }

  // === 6. RECALCULATE POINTS ===
  console.log('\n═══════════════════════════════════════');
  console.log('🧮 RECALCULATING ALL USER POINTS...');
  console.log('═══════════════════════════════════════');
  try {
    await recalculateAllPoints();
  } catch (err) {
    console.error('❌ Points calculation error:', err.message);
  }

  console.log('\n🎉 All syncs complete!');
  process.exit(0);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
