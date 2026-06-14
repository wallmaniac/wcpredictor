/**
 * Premier League 2025-26 — Last 2 Matchdays (37 & 38)
 * Used to test live score syncing in the app.
 * All kickoff times in UTC.
 * Source: premierleague.com — BST times converted to UTC (-1h).
 */

const PL_TEAMS = [
  "Arsenal", "Aston Villa", "AFC Bournemouth", "Brentford", "Brighton & Hove Albion",
  "Burnley", "Chelsea", "Crystal Palace", "Everton", "Fulham",
  "Leeds United", "Liverpool", "Manchester City", "Manchester United", "Newcastle United",
  "Nottingham Forest", "Sunderland", "Tottenham Hotspur", "West Ham United", "Wolverhampton Wanderers"
];

// PL doesn't have groups — it's a league table
export const PL_LEAGUE_TABLE_TEAMS = PL_TEAMS;

export const PL_2526_MATCHES = [
  // ── Matchday 37 (May 15-19, 2026) ──
  // Friday May 15, 20:00 BST = 19:00 UTC
  { matchNumber: 1, team1: "Aston Villa", team2: "Liverpool", date: "2026-05-15", utc: "19:00", venue: "Villa Park, Birmingham", stage: "Matchday 37", matchday: 37 },
  // Sunday May 17
  { matchNumber: 2, team1: "Manchester United", team2: "Nottingham Forest", date: "2026-05-17", utc: "11:30", venue: "Old Trafford, Manchester", stage: "Matchday 37", matchday: 37 },
  { matchNumber: 3, team1: "Brentford", team2: "Crystal Palace", date: "2026-05-17", utc: "14:00", venue: "Gtech Community Stadium, London", stage: "Matchday 37", matchday: 37 },
  { matchNumber: 4, team1: "Everton", team2: "Sunderland", date: "2026-05-17", utc: "14:00", venue: "Goodison Park, Liverpool", stage: "Matchday 37", matchday: 37 },
  { matchNumber: 5, team1: "Leeds United", team2: "Brighton & Hove Albion", date: "2026-05-17", utc: "14:00", venue: "Elland Road, Leeds", stage: "Matchday 37", matchday: 37 },
  { matchNumber: 6, team1: "Wolverhampton Wanderers", team2: "Fulham", date: "2026-05-17", utc: "14:00", venue: "Molineux Stadium, Wolverhampton", stage: "Matchday 37", matchday: 37 },
  { matchNumber: 7, team1: "Newcastle United", team2: "West Ham United", date: "2026-05-17", utc: "16:30", venue: "St James' Park, Newcastle", stage: "Matchday 37", matchday: 37 },
  // Monday May 18, 20:00 BST = 19:00 UTC
  { matchNumber: 8, team1: "Arsenal", team2: "Burnley", date: "2026-05-18", utc: "19:00", venue: "Emirates Stadium, London", stage: "Matchday 37", matchday: 37 },
  // Tuesday May 19
  { matchNumber: 9, team1: "AFC Bournemouth", team2: "Manchester City", date: "2026-05-19", utc: "18:30", venue: "Vitality Stadium, Bournemouth", stage: "Matchday 37", matchday: 37 },
  { matchNumber: 10, team1: "Chelsea", team2: "Tottenham Hotspur", date: "2026-05-19", utc: "19:15", venue: "Stamford Bridge, London", stage: "Matchday 37", matchday: 37 },

  // ── Matchday 38 — Final Day (May 24, 2026, all at 16:00 BST = 15:00 UTC) ──
  { matchNumber: 11, team1: "Brighton & Hove Albion", team2: "Manchester United", date: "2026-05-24", utc: "15:00", venue: "Amex Stadium, Brighton", stage: "Matchday 38", matchday: 38 },
  { matchNumber: 12, team1: "Burnley", team2: "Wolverhampton Wanderers", date: "2026-05-24", utc: "15:00", venue: "Turf Moor, Burnley", stage: "Matchday 38", matchday: 38 },
  { matchNumber: 13, team1: "Crystal Palace", team2: "Arsenal", date: "2026-05-24", utc: "15:00", venue: "Selhurst Park, London", stage: "Matchday 38", matchday: 38 },
  { matchNumber: 14, team1: "Fulham", team2: "Newcastle United", date: "2026-05-24", utc: "15:00", venue: "Craven Cottage, London", stage: "Matchday 38", matchday: 38 },
  { matchNumber: 15, team1: "Liverpool", team2: "Brentford", date: "2026-05-24", utc: "15:00", venue: "Anfield, Liverpool", stage: "Matchday 38", matchday: 38 },
  { matchNumber: 16, team1: "Manchester City", team2: "Aston Villa", date: "2026-05-24", utc: "15:00", venue: "Etihad Stadium, Manchester", stage: "Matchday 38", matchday: 38 },
  { matchNumber: 17, team1: "Nottingham Forest", team2: "AFC Bournemouth", date: "2026-05-24", utc: "15:00", venue: "City Ground, Nottingham", stage: "Matchday 38", matchday: 38 },
  { matchNumber: 18, team1: "Sunderland", team2: "Chelsea", date: "2026-05-24", utc: "15:00", venue: "Stadium of Light, Sunderland", stage: "Matchday 38", matchday: 38 },
  { matchNumber: 19, team1: "Tottenham Hotspur", team2: "Everton", date: "2026-05-24", utc: "15:00", venue: "Tottenham Hotspur Stadium, London", stage: "Matchday 38", matchday: 38 },
  { matchNumber: 20, team1: "West Ham United", team2: "Leeds United", date: "2026-05-24", utc: "15:00", venue: "London Stadium, London", stage: "Matchday 38", matchday: 38 },
];

// Same utility functions compatible with the main matchData format
export function formatPLMatchTime(dateStr, utcTime, timezone = 'Europe/Zagreb', locale = 'en-US') {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = utcTime.split(':').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day, hour, minute));

  const time = dt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone });
  const date = dt.toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: timezone });
  const fullDate = dt.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone });
  const dateKey = dt.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD for sorting

  return { time, date, fullDate, dateKey };
}

export function calculatePLPoints(prediction, actual) {
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
