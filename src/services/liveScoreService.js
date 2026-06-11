/**
 * Live Score Sync Service
 * Uses APIFootball.com (apiv3) — free tier
 * Endpoint: https://apiv3.apifootball.com/
 * Auth: query param APIkey=xxx (NO CORS issues — no proxy needed!)
 * 
 * Get your key at: https://apifootball.com/
 * Save via Admin Panel → Live Score API Setup
 * 
 * League IDs:  PL = 152,  World Cup = 28 (or check with get_leagues)
 * Actions: get_events (matches), get_standings, get_topscorers
 */

import { database } from '../config/firebase';
import { ref, update, get, set } from 'firebase/database';
import { ALL_MATCHES, calculatePoints } from '../utils/matchData';
import { PL_2526_MATCHES, calculatePLPoints } from '../utils/plMatchData';

const BASE_URL = 'https://apiv3.apifootball.com/';

async function getApiKey() {
  // First check env var
  const envKey = import.meta.env?.VITE_FOOTBALL_API_KEY;
  if (envKey) return envKey;
  // Then check Firebase
  try {
    const snap = await get(ref(database, 'wc2026/metadata/apiKey'));
    if (snap.exists()) return snap.val();
  } catch {
    // Ignore error and fallback to empty key
  }
  return '';
}

// Normalize team names between API responses and our match data
const TEAM_NAME_MAP = {
  // WC variants
  'Cote D Ivoire': 'Ivory Coast',
  "Côte d'Ivoire": 'Ivory Coast',
  'Cabo Verde': 'Cape Verde',
  'Korea Republic': 'South Korea',
  'USA': 'United States',
  'IR Iran': 'Iran',
  'Curacao': 'Curaçao',
  'Congo DR': 'DR Congo',
  'Congo': 'DR Congo',
  // PL team name variants (apifootball.com uses slightly different names)
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
  
  // Last names match + first initials match
  const last1 = words1[words1.length - 1];
  const last2 = words2[words2.length - 1];
  if (last1 === last2) {
    const first1 = words1[0];
    const first2 = words2[0];
    if (first1.length === 1 && first2.startsWith(first1)) return true;
    if (first2.length === 1 && first1.startsWith(first2)) return true;
  }
  
  // Check if one name is a subset of the other
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

function isGlobalPickMatch(userPick, actualResult) {
  if (!userPick || !actualResult) return false;
  
  const pickNorm = removeDiacritics(userPick.toString());
  const actualNorm = removeDiacritics(actualResult.toString());
  
  if (pickNorm === actualNorm) return true;
  
  const actuals = actualNorm.split(',').map(s => s.trim()).filter(Boolean);
  for (const act of actuals) {
    if (pickNorm === act) return true;
    
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


/**
 * Fetch finished events (matches) from apifootball.com
 * @param {number} leagueId - 152 = PL, 28 = WC
 * @param {string} from - start date YYYY-MM-DD
 * @param {string} to - end date YYYY-MM-DD
 */
export async function fetchLiveFixtures(leagueId = 152, from = '', to = '') {
  const API_KEY = await getApiKey();
  if (!API_KEY) {
    console.warn('[LiveScoreService] No API key configured.');
    return { success: false, error: 'No API key configured. Save your key in Admin Panel → Live Score API Setup.', fixtures: [] };
  }

  // Default date range: last 30 days to today
  if (!from) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    from = d.toISOString().split('T')[0];
  }
  if (!to) {
    to = new Date().toISOString().split('T')[0];
  }

  try {
    const url = `${BASE_URL}?action=get_events&from=${from}&to=${to}&league_id=${leagueId}&timezone=Etc/UTC&APIkey=${API_KEY}`;
    
    console.log(`[LiveScoreService] Fetching events: league=${leagueId}, from=${from}, to=${to}`);
    console.log(`[LiveScoreService] API Key: ${API_KEY.substring(0, 10)}***`);
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();
    
    // apifootball.com returns { error: 'xxx' } or { error: 404 } on errors
    if (data.error) {
      throw new Error(`API Error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
    }

    // If result is not an array, it means no data
    if (!Array.isArray(data)) {
      return { success: true, fixtures: [], totalFixtures: 0, finishedCount: 0 };
    }

    // Filter to finished matches only
    const finishedFixtures = data.filter(m => 
      m.match_status === 'Finished' || 
      m.match_status === 'After ET' || 
      m.match_status === 'After Pen.'
    );

    console.log(`[LiveScoreService] ✅ Got ${data.length} events, ${finishedFixtures.length} finished.`);

    return { 
      success: true, 
      fixtures: finishedFixtures,
      totalFixtures: data.length,
      finishedCount: finishedFixtures.length,
    };
  } catch (err) {
    console.error('[LiveScoreService] Fetch failed:', err);
    return { success: false, error: err.message, fixtures: [] };
  }
}

/**
 * Fetch top scorers from apifootball.com
 */
export async function fetchTopScorers(leagueId = 152) {
  const API_KEY = await getApiKey();
  if (!API_KEY) return { success: false, error: 'No API key', scorers: [] };

  try {
    const url = `${BASE_URL}?action=get_topscorers&league_id=${leagueId}&timezone=Etc/UTC&APIkey=${API_KEY}`;
    console.log(`[LiveScoreService] Fetching top scorers: league=${leagueId}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`[LiveScoreService] Top scorers API raw response type: ${typeof data}, isArray: ${Array.isArray(data)}, length: ${Array.isArray(data) ? data.length : 'N/A'}`);
    
    if (data.error) {
      console.error('[LiveScoreService] API error:', data.error);
      return { success: false, error: `API Error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`, scorers: [] };
    }
    
    if (!Array.isArray(data)) {
      console.error('[LiveScoreService] Unexpected response format:', JSON.stringify(data).substring(0, 200));
      return { success: false, error: 'Unexpected API response format (not an array)', scorers: [] };
    }

    if (data.length === 0) {
      return { success: false, error: 'API returned empty top scorers list', scorers: [] };
    }

    // Log first entry to help debug field names
    console.log(`[LiveScoreService] First scorer entry fields:`, Object.keys(data[0]).join(', '));
    console.log(`[LiveScoreService] Sample entry:`, JSON.stringify(data[0]));

    const scorers = data.map(p => ({
      name: p.player_name,
      team: p.team_name,
      count: parseInt(p.goals) || 0,
      assists: parseInt(p.assists) || 0,
      penalty: parseInt(p.penalty_goals) || 0,
    }));

    console.log(`[LiveScoreService] ✅ Got ${scorers.length} top scorers. Top 3:`, scorers.slice(0, 3).map(s => `${s.name} (${s.count}g, ${s.assists}a)`).join(', '));
    return { success: true, scorers };
  } catch (err) {
    console.error('[LiveScoreService] Top scorers fetch failed:', err);
    return { success: false, error: err.message, scorers: [] };
  }
}

/**
 * Fetch standings from apifootball.com
 */
export async function fetchStandings(leagueId = 152) {
  const API_KEY = await getApiKey();
  if (!API_KEY) return { success: false, error: 'No API key', standings: [] };

  try {
    const url = `${BASE_URL}?action=get_standings&league_id=${leagueId}&timezone=Etc/UTC&APIkey=${API_KEY}`;
    console.log(`[LiveScoreService] Fetching standings: league=${leagueId}`);

    const response = await fetch(url);
    const data = await response.json();

    if (data.error || !Array.isArray(data)) {
      return { success: false, error: data.error || 'No data', standings: [] };
    }

    const standings = data.map(t => ({
      position: parseInt(t.overall_league_position) || 0,
      team: t.team_name,
      played: parseInt(t.overall_league_payed) || 0,
      won: parseInt(t.overall_league_W) || 0,
      drawn: parseInt(t.overall_league_D) || 0,
      lost: parseInt(t.overall_league_L) || 0,
      gf: parseInt(t.overall_league_GF) || 0,
      ga: parseInt(t.overall_league_GA) || 0,
      points: parseInt(t.overall_league_PTS) || 0,
      badge: t.team_badge || '',
      promotion: t.overall_promotion || '',
    }));

    standings.sort((a, b) => a.position - b.position);
    console.log(`[LiveScoreService] ✅ Got standings for ${standings.length} teams.`);
    return { success: true, standings };
  } catch (err) {
    console.error('[LiveScoreService] Standings fetch failed:', err);
    return { success: false, error: err.message, standings: [] };
  }
}

/**
 * Sync the FULL fixture schedule from the API into Firebase.
 */
export async function syncFixtures(competitionId = 'pl2526') {
  // WC uses hardcoded matchData.js — NEVER replace it with API data
  if (competitionId === 'wc2026') {
    return { success: false, error: '❌ World Cup schedule is hardcoded in matchData.js. Use "Sync Live Scores" to update results only, without replacing the schedule.' };
  }

  const config = {
    pl2526: { leagueId: 152, fbPath: 'pl2526', matchdays: ['37', '38'] },
  }[competitionId];
  if (!config) return { success: false, error: 'Unknown competition' };

  const API_KEY = await getApiKey();
  if (!API_KEY) return { success: false, error: 'No API key configured.' };

  // Fetch events for a wide date range to capture the full schedule
  const from = '2026-05-01';
  const to = '2026-06-30';

  try {
    const url = `${BASE_URL}?action=get_events&from=${from}&to=${to}&league_id=${config.leagueId}&timezone=Etc/UTC&APIkey=${API_KEY}`;
    console.log(`[LiveScoreService] Fetching full fixture list: league=${config.leagueId}, ${from} to ${to}`);
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.error || !Array.isArray(data)) {
      return { success: false, error: data.error || 'No fixture data from API' };
    }

    // Filter to only the matchdays we care about
    let relevantEvents = data;
    if (config.matchdays) {
      relevantEvents = data.filter(ev => config.matchdays.includes(ev.match_round));
    }

    if (relevantEvents.length === 0) {
      return { success: false, error: `No events found for matchdays ${config.matchdays?.join(', ')} (total events from API: ${data.length})` };
    }

    // Sort events by date, then time, so match numbers are chronological
    relevantEvents.sort((a, b) => {
      const dA = `${a.match_date}T${a.match_time}`;
      const dB = `${b.match_date}T${b.match_time}`;
      if (a.match_round !== b.match_round) return parseInt(a.match_round) - parseInt(b.match_round);
      return dA.localeCompare(dB);
    });

    // Clear old fixtures and results, then write new ones
    const updates = {};
    updates[`${config.fbPath}/fixtures`] = null;
    updates[`${config.fbPath}/match_results`] = null;

    const newFixtures = {};
    const newResults = {};
    
    relevantEvents.forEach((ev, idx) => {
      const matchNum = idx + 1;
      const homeTeam = normalizeTeamName(ev.match_hometeam_name);
      const awayTeam = normalizeTeamName(ev.match_awayteam_name);
      const isFinished = ev.match_status === 'Finished' || ev.match_status === 'After ET' || ev.match_status === 'After Pen.';
      const isLive = !isFinished && ev.match_status && ev.match_status !== '' && ev.match_status !== '-';

      newFixtures[`match_${matchNum}`] = {
        matchNumber: matchNum,
        apiMatchId: ev.match_id,
        team1: homeTeam,
        team2: awayTeam,
        date: ev.match_date,
        time: ev.match_time,
        venue: ev.match_stadium || '',
        round: ev.match_round || '',
        stage: `Matchday ${ev.match_round || ''}`,
        matchday: parseInt(ev.match_round) || 0,
        status: ev.match_status || '',
      };

      if (isFinished) {
        const homeGoals = parseInt(ev.match_hometeam_score) || 0;
        const awayGoals = parseInt(ev.match_awayteam_score) || 0;
        newResults[`match_${matchNum}`] = {
          score1: homeGoals,
          score2: awayGoals,
          status: 'finished',
          isPlayed: true,
          apiMatchId: ev.match_id,
          syncedAt: Date.now(),
        };
      } else if (isLive) {
        const homeGoals = parseInt(ev.match_hometeam_score) || 0;
        const awayGoals = parseInt(ev.match_awayteam_score) || 0;
        newResults[`match_${matchNum}`] = {
          score1: homeGoals,
          score2: awayGoals,
          status: 'live',
          liveMinute: ev.match_status,
          isPlayed: false,
          apiMatchId: ev.match_id,
          syncedAt: Date.now(),
        };
      }
    });

    updates[`${config.fbPath}/fixtures`] = newFixtures;
    if (Object.keys(newResults).length > 0) {
      updates[`${config.fbPath}/match_results`] = newResults;
    }

    await update(ref(database), updates);

    if (Object.keys(newResults).length > 0) {
      await recalculateAllPoints(competitionId);
    }

    const finishedCount = Object.values(newResults).filter(r => r.status === 'finished').length;
    return { 
      success: true, 
      message: `✅ Synced ${relevantEvents.length} fixtures (${finishedCount} finished) from API. Old schedule replaced.`,
      matched: relevantEvents.length,
    };
  } catch (err) {
    console.error('[LiveScoreService] syncFixtures failed:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Recalculate all user points using fixture-based match data.
 */
async function recalculateAllPointsFromFixtures(competitionId, fixtures, results) {
  const fbPath = competitionId === 'wc2026' ? 'wc2026' : 'pl2526';
  const calcFn = competitionId === 'wc2026' ? calculatePoints : calculatePLPoints;

  const allUsersSnap = await get(ref(database, 'wc2026/users'));
  if (!allUsersSnap.exists()) return;
  const allUsers = allUsersSnap.val();

  const compUsersSnap = competitionId !== 'wc2026' ? await get(ref(database, `${fbPath}/users`)) : null;
  const compUsers = compUsersSnap?.val() || {};

  const updates = {};
  for (const uid in allUsers) {
    let totalPoints = 0;
    let exactScoresCount = 0;
    let correctResultsCount = 0;

    const preds = competitionId === 'wc2026' 
      ? (allUsers[uid].predictions || {})
      : (compUsers[uid]?.predictions || {});

    for (const mKey in results) {
      const r = results[mKey];
      const mNum = mKey.replace('match_', '');
      if (r.status === 'finished' && preds[mNum]) {
        const pts = calcFn(preds[mNum], r);
        totalPoints += pts;
        if (pts === 3) exactScoresCount++;
        if (pts === 1) correctResultsCount++;
      }
    }

    updates[`${fbPath}/users/${uid}/totalPoints`] = totalPoints;
    updates[`${fbPath}/users/${uid}/exactScores`] = exactScoresCount;
    updates[`${fbPath}/users/${uid}/correctResults`] = correctResultsCount;
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }
}

/**
 * Match API event to our internal match number by comparing team names and date
 */
function findMatchNumber(apiEvent, matchList) {
  const homeTeam = normalizeTeamName(apiEvent.match_hometeam_name);
  const awayTeam = normalizeTeamName(apiEvent.match_awayteam_name);
  const matchDate = apiEvent.match_date; // YYYY-MM-DD
  const apiRound = apiEvent.match_round || '';

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

  // Fallback: match by teams + matchday/round (for PL — most reliable)
  if (!match && apiRound) {
    match = matchList.find(m => {
      const teamsMatch = (m.team1 === homeTeam && m.team2 === awayTeam) ||
                         (m.team1 === awayTeam && m.team2 === homeTeam);
      return teamsMatch && m.matchday && String(m.matchday) === String(apiRound);
    });
  }

  // Fallback: match by teams + close date (within 5 days to handle timezone shifts)
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

  if (match) {
    console.log(`[LiveScoreService] ✅ Matched: ${homeTeam} vs ${awayTeam} (${matchDate}) → Match #${match.matchNumber}`);
  } else {
    console.warn(`[LiveScoreService] ⚠️ No match found for: ${homeTeam} vs ${awayTeam} (${matchDate}, round=${apiRound})`);
  }

  return match?.matchNumber ?? null;
}

/**
 * Sync live scores for the specified competition
 */
export async function syncLiveScores(competitionId = 'wc2026', options = {}) {
  // WC hasn't started yet — don't hit the API
  if (competitionId === 'wc2026' && Date.now() < new Date('2026-06-11T19:00:00Z').getTime()) {
    return { success: false, error: '⏳ World Cup 2026 starts June 11, 2026. No matches to sync yet.' };
  }

  const config = {
    wc2026: { leagueId: 28, matches: ALL_MATCHES, fbPath: 'wc2026' },
    pl2526: { leagueId: 152, matches: PL_2526_MATCHES, fbPath: 'pl2526' },
  }[competitionId];

  if (!config) return { success: false, error: 'Unknown competition' };

  // Date range for API query
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 60);
  const from = fromDate.toISOString().split('T')[0];
  const to = new Date().toISOString().split('T')[0];

  const result = await fetchLiveFixtures(config.leagueId, from, to);
  
  if (!result.success) {
    return { success: false, error: result.error, updated: 0 };
  }

  if (result.fixtures.length === 0) {
    return { success: true, updated: 0, message: `No finished matches found (checked ${from} to ${to}).` };
  }

  // Filter by matchday if specified
  let apiFixtures = result.fixtures;
  if (options.matchday) {
    apiFixtures = apiFixtures.filter(ev => String(ev.match_round) === String(options.matchday));
    if (apiFixtures.length === 0) {
      return { success: true, updated: 0, message: `No finished matches found for matchday ${options.matchday}.` };
    }
  }

  // ALWAYS use the hardcoded match list for number assignment
  const matchList = config.matches;

  let updated = 0;
  const updates = {};

  for (const event of apiFixtures) {
    const matchNumber = findMatchNumber(event, matchList);
    if (matchNumber === null) continue;

    const homeGoals = parseInt(event.match_hometeam_score) || 0;
    const awayGoals = parseInt(event.match_awayteam_score) || 0;

    // Check team order
    const homeTeam = normalizeTeamName(event.match_hometeam_name);
    const ourMatch = matchList.find(m => m.matchNumber === matchNumber);
    
    let score1, score2;
    if (ourMatch && ourMatch.team1 === homeTeam) {
      score1 = homeGoals;
      score2 = awayGoals;
    } else {
      score1 = awayGoals;
      score2 = homeGoals;
    }

    updates[`${config.fbPath}/match_results/match_${matchNumber}`] = {
      score1,
      score2,
      status: 'finished',
      isPlayed: true,
      apiMatchId: event.match_id,
      syncedAt: Date.now()
    };
    updated++;
  }

  if (updated > 0) {
    await update(ref(database), updates);
    await recalculateAllPoints(competitionId);
  }

  const roundInfo = options.matchday ? ` (matchday ${options.matchday})` : '';
  return { 
    success: true, 
    updated, 
    totalAPIFixtures: result.totalFixtures,
    message: `✅ Synced ${updated} match result(s) from API${roundInfo}. Points recalculated.`
  };
}

/**
 * Calculate Premier League clean sheets by parsing all match scores from the API.
 * Maps clean sheets to the primary goalkeepers.
 */
async function calculatePLCleanSheets() {
  const API_KEY = await getApiKey();
  if (!API_KEY) return [];

  // Fetch all matches for the season
  const from = '2025-08-11';
  const to = new Date().toISOString().split('T')[0];
  const url = `${BASE_URL}?action=get_events&from=${from}&to=${to}&league_id=152&timezone=Etc/UTC&APIkey=${API_KEY}`;

  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];

    const finished = data.filter(f => 
      f.match_status === 'Finished' || 
      f.match_status === 'After ET' || 
      f.match_status === 'After Pen.'
    );

    const cleanSheetsMap = {};
    finished.forEach(f => {
      const homeTeam = normalizeTeamName(f.match_hometeam_name);
      const awayTeam = normalizeTeamName(f.match_awayteam_name);
      const homeScore = parseInt(f.match_hometeam_score);
      const awayScore = parseInt(f.match_awayteam_score);
      
      if (homeScore === 0) {
        cleanSheetsMap[awayTeam] = (cleanSheetsMap[awayTeam] || 0) + 1;
      }
      if (awayScore === 0) {
        cleanSheetsMap[homeTeam] = (cleanSheetsMap[homeTeam] || 0) + 1;
      }
    });

    const TEAM_GOALKEEPER_MAP = {
      "Arsenal": "David Raya",
      "Manchester City": "Gianluigi Donnarumma",
      "Bournemouth": "Djordje Petrovic",
      "AFC Bournemouth": "Djordje Petrovic",
      "Crystal Palace": "Dean Henderson",
      "Everton": "Jordan Pickford",
      "Manchester United": "André Onana",
      "Manchester Utd": "André Onana",
      "Brentford": "Mark Flekken",
      "Liverpool": "Alisson Becker",
      "Chelsea": "Robert Sánchez",
      "Newcastle United": "Nick Pope",
      "Newcastle": "Nick Pope",
      "Aston Villa": "Emiliano Martínez",
      "Tottenham Hotspur": "Guglielmo Vicario",
      "Tottenham": "Guglielmo Vicario",
      "Fulham": "Bernd Leno",
      "West Ham United": "Alphonse Areola",
      "West Ham": "Alphonse Areola",
      "Nottingham Forest": "Matz Sels",
      "Nottingham": "Matz Sels",
      "Sunderland": "Anthony Patterson",
      "Leeds United": "Illan Meslier",
      "Leeds": "Illan Meslier",
      "Burnley": "James Trafford",
      "Wolverhampton Wanderers": "José Sá",
      "Wolves": "José Sá",
      "Brighton & Hove Albion": "Bart Verbruggen",
      "Brighton": "Bart Verbruggen"
    };

    const gks = {};
    Object.keys(cleanSheetsMap).forEach(team => {
      const gkName = TEAM_GOALKEEPER_MAP[team];
      if (gkName) {
        gks[gkName] = {
          name: gkName,
          team: team,
          count: (gks[gkName]?.count || 0) + cleanSheetsMap[team]
        };
      }
    });

    return Object.values(gks)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  } catch (err) {
    console.error('[LiveScoreService] Failed to calculate clean sheets:', err);
    return [];
  }
}

/**
 * Sync player stats (top scorers) from API to Firebase
 */
export async function syncPlayerStats(competitionId = 'pl2526') {
  // WC hasn't started yet — API returns old 2022 data, don't save it
  if (competitionId === 'wc2026' && Date.now() < new Date('2026-06-11T19:00:00Z').getTime()) {
    return { success: false, error: '⏳ World Cup 2026 starts June 11, 2026. Stats will be available once the tournament begins.' };
  }

  const leagueId = competitionId === 'pl2526' ? 152 : 28;
  const fbPath = competitionId === 'pl2526' ? 'pl2526' : 'wc2026';

  const result = await fetchTopScorers(leagueId);
  if (!result.success) return result;

  // Deduplicate scorers first
  const deduplicated = [];
  for (const s of result.scorers) {
    const existing = deduplicated.find(d => isSamePlayer(d, s));
    if (existing) {
      // Keep longer name
      if (s.name.length > existing.name.length) {
        existing.name = s.name;
      }
      // Keep max goals
      existing.count = Math.max(existing.count, s.count);
      // Keep max assists
      existing.assists = Math.max(existing.assists || 0, s.assists || 0);
    } else {
      deduplicated.push({ ...s });
    }
  }

  // Format for our PlayerStats component (scorers sorted by goals desc)
  const scorers = deduplicated
    .filter(p => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map(s => ({
      name: s.name,
      team: s.team,
      count: s.count,
    }));

  // Also get assist leaders from the same data
  const assists = deduplicated
    .filter(p => (p.assists || 0) > 0)
    .map(p => ({
      name: p.name,
      team: p.team,
      count: p.assists || 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Get existing stats to preserve cleanSheets
  const statsSnap = await get(ref(database, `${fbPath}/statistics`));
  const existingStats = statsSnap.exists() ? statsSnap.val() : {};
  let cleanSheets = existingStats.cleanSheets || [];
  if (competitionId === 'pl2526') {
    const computedGks = await calculatePLCleanSheets();
    if (computedGks && computedGks.length > 0) {
      cleanSheets = computedGks;
    } else if (cleanSheets.length === 0) {
      cleanSheets = PL_DEFAULT_CLEAN_SHEETS;
    }
  }

  const statsToSave = {
    scorers,
    assists,
    cleanSheets,
    lastSynced: Date.now(),
  };

  await set(ref(database, `${fbPath}/statistics`), statsToSave);

  // Auto-update global results with leaders (top scorer, assist, goalkeeper)
  const globalResultsUpdates = {};
  
  if (scorers.length > 0) {
    const maxGoals = scorers[0].count;
    const topScorers = scorers.filter(s => s.count === maxGoals).map(s => s.name).join(', ');
    globalResultsUpdates.topScorer = topScorers;
  }

  if (assists.length > 0) {
    const maxAssists = assists[0].count;
    const topAssists = assists.filter(a => a.count === maxAssists).map(a => a.name).join(', ');
    globalResultsUpdates.topAssist = topAssists;
  }

  if (cleanSheets.length > 0) {
    const maxCleanSheets = cleanSheets[0].count;
    const topGoalkeepers = cleanSheets.filter(c => c.count === maxCleanSheets).map(c => c.name).join(', ');
    globalResultsUpdates.topGoalkeeper = topGoalkeepers;
  }

  if (Object.keys(globalResultsUpdates).length > 0) {
    const globalResultsRef = ref(database, `${fbPath}/metadata/globalResults`);
    const globalResultsSnap = await get(globalResultsRef);
    const existingGlobalResults = globalResultsSnap.exists() ? globalResultsSnap.val() : {};
    
    await set(globalResultsRef, {
      ...existingGlobalResults,
      ...globalResultsUpdates,
    });
  }

  await recalculateAllPoints(competitionId);

  const topScorerName = scorers.length > 0 ? `${scorers[0].name} (${scorers[0].count}g)` : 'none';
  const topAssistName = assists.length > 0 ? `${assists[0].name} (${assists[0].count}a)` : 'none';
  const topGKName = cleanSheets.length > 0 ? `${cleanSheets[0].name} (${cleanSheets[0].count}cs)` : 'none';

  return { 
    success: true, 
    message: `✅ Stats synced! Scorers: ${scorers.length} (top: ${topScorerName}), Assists: ${assists.length} (top: ${topAssistName}), GK: ${cleanSheets.length} (top: ${topGKName}). Global results auto-updated.`
  };
}

/**
 * Sync league standings from API to Firebase
 */
export async function syncStandings(competitionId = 'pl2526') {
  // WC hasn't started yet — don't fetch stale data
  if (competitionId === 'wc2026' && Date.now() < new Date('2026-06-11T19:00:00Z').getTime()) {
    return { success: false, error: '⏳ World Cup 2026 starts June 11, 2026. Standings will be available once the tournament begins.' };
  }

  const leagueId = competitionId === 'pl2526' ? 152 : 28;
  const fbPath = competitionId === 'pl2526' ? 'pl2526' : 'wc2026';

  const result = await fetchStandings(leagueId);
  if (!result.success) return result;

  await set(ref(database, `${fbPath}/standings`), {
    table: result.standings,
    lastSynced: Date.now(),
  });

  // Auto-update global results with the top 3 teams
  if (result.standings && result.standings.length >= 3) {
    const champion = result.standings[0].team;
    const secondPlace = result.standings[1].team;
    const thirdPlace = result.standings[2].team;

    const globalResultsRef = ref(database, `${fbPath}/metadata/globalResults`);
    const globalResultsSnap = await get(globalResultsRef);
    const existingGlobalResults = globalResultsSnap.exists() ? globalResultsSnap.val() : {};

    await set(globalResultsRef, {
      ...existingGlobalResults,
      champion,
      secondPlace,
      thirdPlace,
    });
  }

  await recalculateAllPoints(competitionId);

  return { success: true, message: `✅ Synced standings for ${result.standings.length} teams.` };
}

/**
 * Recalculate points for all users in the given competition
 */
export async function recalculateAllPoints(competitionId = 'wc2026') {
  const config = {
    wc2026: { matches: ALL_MATCHES, fbPath: 'wc2026', calcFn: calculatePoints },
    pl2526: { matches: PL_2526_MATCHES, fbPath: 'pl2526', calcFn: calculatePLPoints },
  }[competitionId];

  if (!config) return;

  const usersSnap = await get(ref(database, `${config.fbPath}/users`));
  if (!usersSnap.exists()) {
    // For PL, also check wc2026/users for user profiles
    if (competitionId !== 'wc2026') {
      const wcSnap = await get(ref(database, 'wc2026/users'));
      if (!wcSnap.exists()) return;
    } else return;
  }

  // For non-WC competitions, read predictions from competition path but get user list from wc2026
  const userPath = competitionId === 'wc2026' ? 'wc2026/users' : 'wc2026/users';
  const allUsersSnap = await get(ref(database, userPath));
  if (!allUsersSnap.exists()) return;
  const allUsers = allUsersSnap.val();

  const currentMatchesSnap = await get(ref(database, `${config.fbPath}/match_results`));
  const currentMatches = currentMatchesSnap.val() || {};

  // For PL, read predictions from pl2526/users/<uid>/predictions
  const plUsersSnap = competitionId !== 'wc2026' ? await get(ref(database, `${config.fbPath}/users`)) : null;
  const plUsers = plUsersSnap?.val() || {};

  const updates = {};

  // Fetch global results ONCE outside the user loop (avoids N+1 Firebase queries)
  const metaPath = competitionId === 'wc2026' ? 'wc2026/metadata/globalResults' : `${config.fbPath}/metadata/globalResults`;
  const globalMetaSnap = await get(ref(database, metaPath));
  const actualGlobals = globalMetaSnap.val() || {};

  for (const uid in allUsers) {
    let matchPoints = 0;
    let exactScoresCount = 0;
    let correctResultsCount = 0;
    
    // Get predictions from the right place
    let preds;
    if (competitionId === 'wc2026') {
      preds = allUsers[uid].predictions || {};
    } else {
      preds = plUsers[uid]?.predictions || {};
    }

    // Match points
    for (const mId in currentMatches) {
      const m = currentMatches[mId];
      const mNum = mId.replace('match_', '');
      if (m.status === 'finished' && preds[mNum]) {
        const pts = config.calcFn(preds[mNum], m);
        matchPoints += pts;
        if (pts === 3) exactScoresCount++;
        if (pts === 1) correctResultsCount++;
      }
    }

    // Global picks bonus points (both WC and PL)
    let gPicks;
    if (competitionId === 'wc2026') {
      gPicks = allUsers[uid].globalPicks || {};
    } else {
      gPicks = plUsers[uid]?.globalPicks || {};
    }

    let globalPickPoints = 0;
    const globalPickResults = {};

    const globalChecks = [
      { key: 'champion', pick: gPicks.champion, actual: actualGlobals.champion, pts: 10 },
      { key: 'secondPlace', pick: gPicks.secondPlace, actual: actualGlobals.secondPlace, pts: 5 },
      { key: 'thirdPlace', pick: gPicks.thirdPlace, actual: actualGlobals.thirdPlace, pts: 5 },
      { key: 'topScorer', pick: gPicks.topScorer, actual: actualGlobals.topScorer, pts: 5 },
      { key: 'topAssist', pick: gPicks.topAssist || gPicks.topHighlight, actual: actualGlobals.topAssist, pts: 5 },
      { key: 'topGoalkeeper', pick: gPicks.topGoalkeeper, actual: actualGlobals.topGoalkeeper, pts: 5 },
    ];

    for (const check of globalChecks) {
      const correct = check.actual && check.pick && isGlobalPickMatch(check.pick, check.actual);
      if (correct) globalPickPoints += check.pts;
      // Store result for each category (only if actual result exists)
      if (check.actual) {
        globalPickResults[check.key] = {
          pick: check.pick || '',
          actual: check.actual,
          correct: !!correct,
          points: correct ? check.pts : 0,
          maxPoints: check.pts,
        };
      }
    }

    const totalPoints = matchPoints + globalPickPoints;

    updates[`${config.fbPath}/users/${uid}/totalPoints`] = totalPoints;
    updates[`${config.fbPath}/users/${uid}/matchPoints`] = matchPoints;
    updates[`${config.fbPath}/users/${uid}/globalPickPoints`] = globalPickPoints;
    updates[`${config.fbPath}/users/${uid}/globalPickResults`] = globalPickResults;
    updates[`${config.fbPath}/users/${uid}/exactScores`] = exactScoresCount;
    updates[`${config.fbPath}/users/${uid}/correctResults`] = correctResultsCount;
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(database), updates);
  }
}
