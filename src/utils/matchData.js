// 2026 FIFA World Cup – 104 Matches (Wikipedia source)
// All kickoff times stored as UTC for timezone conversion
const gs = "Group Stage";
export const WC_2026_MATCHES = [
  // ── June 11 ──
  {matchNumber:1,group:"A",team1:"Mexico",team2:"South Africa",date:"2026-06-11",utc:"19:00",venue:"Estadio Azteca, Mexico City",stage:gs},
  {matchNumber:2,group:"A",team1:"South Korea",team2:"Czech Republic",date:"2026-06-12",utc:"02:00",venue:"Estadio Akron, Zapopan",stage:gs},
  // ── June 12 ──
  {matchNumber:7,group:"B",team1:"Canada",team2:"Bosnia and Herzegovina",date:"2026-06-12",utc:"19:00",venue:"BMO Field, Toronto",stage:gs},
  {matchNumber:19,group:"D",team1:"United States",team2:"Paraguay",date:"2026-06-13",utc:"01:00",venue:"SoFi Stadium, Inglewood",stage:gs},
  // ── June 13 ──
  {matchNumber:8,group:"B",team1:"Qatar",team2:"Switzerland",date:"2026-06-13",utc:"19:00",venue:"Levi's Stadium, Santa Clara",stage:gs},
  {matchNumber:13,group:"C",team1:"Brazil",team2:"Morocco",date:"2026-06-13",utc:"22:00",venue:"MetLife Stadium, East Rutherford",stage:gs},
  {matchNumber:14,group:"C",team1:"Haiti",team2:"Scotland",date:"2026-06-14",utc:"01:00",venue:"Gillette Stadium, Foxborough",stage:gs},
  {matchNumber:20,group:"D",team1:"Australia",team2:"Turkey",date:"2026-06-14",utc:"04:00",venue:"BC Place, Vancouver",stage:gs},
  // ── June 14 ──
  {matchNumber:25,group:"E",team1:"Germany",team2:"Curaçao",date:"2026-06-14",utc:"17:00",venue:"NRG Stadium, Houston",stage:gs},
  {matchNumber:31,group:"F",team1:"Netherlands",team2:"Japan",date:"2026-06-14",utc:"20:00",venue:"AT&T Stadium, Arlington",stage:gs},
  {matchNumber:26,group:"E",team1:"Ivory Coast",team2:"Ecuador",date:"2026-06-14",utc:"23:00",venue:"Lincoln Financial Field, Philadelphia",stage:gs},
  {matchNumber:32,group:"F",team1:"Sweden",team2:"Tunisia",date:"2026-06-15",utc:"02:00",venue:"Estadio BBVA, Guadalupe",stage:gs},
  // ── June 15 ──
  {matchNumber:43,group:"H",team1:"Spain",team2:"Cape Verde",date:"2026-06-15",utc:"16:00",venue:"Mercedes-Benz Stadium, Atlanta",stage:gs},
  {matchNumber:37,group:"G",team1:"Belgium",team2:"Egypt",date:"2026-06-15",utc:"19:00",venue:"Lumen Field, Seattle",stage:gs},
  {matchNumber:44,group:"H",team1:"Saudi Arabia",team2:"Uruguay",date:"2026-06-15",utc:"22:00",venue:"Hard Rock Stadium, Miami Gardens",stage:gs},
  {matchNumber:38,group:"G",team1:"Iran",team2:"New Zealand",date:"2026-06-16",utc:"01:00",venue:"SoFi Stadium, Inglewood",stage:gs},
  // ── June 16 ──
  {matchNumber:49,group:"I",team1:"France",team2:"Senegal",date:"2026-06-16",utc:"19:00",venue:"MetLife Stadium, East Rutherford",stage:gs},
  {matchNumber:50,group:"I",team1:"Iraq",team2:"Norway",date:"2026-06-16",utc:"22:00",venue:"Gillette Stadium, Foxborough",stage:gs},
  {matchNumber:55,group:"J",team1:"Argentina",team2:"Algeria",date:"2026-06-17",utc:"01:00",venue:"Arrowhead Stadium, Kansas City",stage:gs},
  {matchNumber:56,group:"J",team1:"Austria",team2:"Jordan",date:"2026-06-17",utc:"04:00",venue:"Levi's Stadium, Santa Clara",stage:gs},
  // ── June 17 ──
  {matchNumber:61,group:"K",team1:"Portugal",team2:"DR Congo",date:"2026-06-17",utc:"17:00",venue:"NRG Stadium, Houston",stage:gs},
  {matchNumber:67,group:"L",team1:"England",team2:"Croatia",date:"2026-06-17",utc:"20:00",venue:"AT&T Stadium, Arlington",stage:gs},
  {matchNumber:68,group:"L",team1:"Ghana",team2:"Panama",date:"2026-06-17",utc:"23:00",venue:"BMO Field, Toronto",stage:gs},
  {matchNumber:62,group:"K",team1:"Uzbekistan",team2:"Colombia",date:"2026-06-18",utc:"02:00",venue:"Estadio Azteca, Mexico City",stage:gs},
  // ── June 18 ──
  {matchNumber:3,group:"A",team1:"Czech Republic",team2:"South Africa",date:"2026-06-18",utc:"16:00",venue:"Mercedes-Benz Stadium, Atlanta",stage:gs},
  {matchNumber:9,group:"B",team1:"Switzerland",team2:"Bosnia and Herzegovina",date:"2026-06-18",utc:"19:00",venue:"SoFi Stadium, Inglewood",stage:gs},
  {matchNumber:10,group:"B",team1:"Canada",team2:"Qatar",date:"2026-06-18",utc:"22:00",venue:"BC Place, Vancouver",stage:gs},
  {matchNumber:4,group:"A",team1:"Mexico",team2:"South Korea",date:"2026-06-19",utc:"01:00",venue:"Estadio Akron, Zapopan",stage:gs},
  // ── June 19 ──
  {matchNumber:21,group:"D",team1:"United States",team2:"Australia",date:"2026-06-19",utc:"19:00",venue:"Lumen Field, Seattle",stage:gs},
  {matchNumber:15,group:"C",team1:"Scotland",team2:"Morocco",date:"2026-06-19",utc:"22:00",venue:"Gillette Stadium, Foxborough",stage:gs},
  {matchNumber:16,group:"C",team1:"Brazil",team2:"Haiti",date:"2026-06-20",utc:"00:30",venue:"Lincoln Financial Field, Philadelphia",stage:gs},
  {matchNumber:22,group:"D",team1:"Turkey",team2:"Paraguay",date:"2026-06-20",utc:"03:00",venue:"Levi's Stadium, Santa Clara",stage:gs},
  // ── June 20 ──
  {matchNumber:33,group:"F",team1:"Netherlands",team2:"Sweden",date:"2026-06-20",utc:"17:00",venue:"NRG Stadium, Houston",stage:gs},
  {matchNumber:27,group:"E",team1:"Germany",team2:"Ivory Coast",date:"2026-06-20",utc:"20:00",venue:"BMO Field, Toronto",stage:gs},
  {matchNumber:28,group:"E",team1:"Ecuador",team2:"Curaçao",date:"2026-06-21",utc:"00:00",venue:"Arrowhead Stadium, Kansas City",stage:gs},
  {matchNumber:34,group:"F",team1:"Tunisia",team2:"Japan",date:"2026-06-21",utc:"04:00",venue:"Estadio BBVA, Guadalupe",stage:gs},
  // ── June 21 ──
  {matchNumber:45,group:"H",team1:"Spain",team2:"Saudi Arabia",date:"2026-06-21",utc:"16:00",venue:"Mercedes-Benz Stadium, Atlanta",stage:gs},
  {matchNumber:39,group:"G",team1:"Belgium",team2:"Iran",date:"2026-06-21",utc:"19:00",venue:"SoFi Stadium, Inglewood",stage:gs},
  {matchNumber:46,group:"H",team1:"Uruguay",team2:"Cape Verde",date:"2026-06-21",utc:"22:00",venue:"Hard Rock Stadium, Miami Gardens",stage:gs},
  {matchNumber:40,group:"G",team1:"New Zealand",team2:"Egypt",date:"2026-06-22",utc:"01:00",venue:"BC Place, Vancouver",stage:gs},
  // ── June 22 ──
  {matchNumber:57,group:"J",team1:"Argentina",team2:"Austria",date:"2026-06-22",utc:"17:00",venue:"AT&T Stadium, Arlington",stage:gs},
  {matchNumber:51,group:"I",team1:"France",team2:"Iraq",date:"2026-06-22",utc:"21:00",venue:"Lincoln Financial Field, Philadelphia",stage:gs},
  {matchNumber:52,group:"I",team1:"Norway",team2:"Senegal",date:"2026-06-23",utc:"00:00",venue:"MetLife Stadium, East Rutherford",stage:gs},
  {matchNumber:58,group:"J",team1:"Jordan",team2:"Algeria",date:"2026-06-23",utc:"03:00",venue:"Levi's Stadium, Santa Clara",stage:gs},
  // ── June 23 ──
  {matchNumber:63,group:"K",team1:"Portugal",team2:"Uzbekistan",date:"2026-06-23",utc:"17:00",venue:"NRG Stadium, Houston",stage:gs},
  {matchNumber:69,group:"L",team1:"England",team2:"Ghana",date:"2026-06-23",utc:"20:00",venue:"Gillette Stadium, Foxborough",stage:gs},
  {matchNumber:70,group:"L",team1:"Panama",team2:"Croatia",date:"2026-06-23",utc:"23:00",venue:"BMO Field, Toronto",stage:gs},
  {matchNumber:64,group:"K",team1:"Colombia",team2:"DR Congo",date:"2026-06-24",utc:"02:00",venue:"Estadio Akron, Zapopan",stage:gs},
  // ── June 24 ──
  {matchNumber:5,group:"A",team1:"Czech Republic",team2:"Mexico",date:"2026-06-25",utc:"01:00",venue:"Estadio Azteca, Mexico City",stage:gs},
  {matchNumber:6,group:"A",team1:"South Africa",team2:"South Korea",date:"2026-06-25",utc:"01:00",venue:"Estadio BBVA, Guadalupe",stage:gs},
  {matchNumber:17,group:"C",team1:"Scotland",team2:"Brazil",date:"2026-06-24",utc:"22:00",venue:"Hard Rock Stadium, Miami Gardens",stage:gs},
  {matchNumber:18,group:"C",team1:"Morocco",team2:"Haiti",date:"2026-06-24",utc:"22:00",venue:"Mercedes-Benz Stadium, Atlanta",stage:gs},
  {matchNumber:11,group:"B",team1:"Switzerland",team2:"Canada",date:"2026-06-24",utc:"19:00",venue:"BC Place, Vancouver",stage:gs},
  {matchNumber:12,group:"B",team1:"Bosnia and Herzegovina",team2:"Qatar",date:"2026-06-24",utc:"19:00",venue:"Lumen Field, Seattle",stage:gs},
  // ── June 25 ──
  {matchNumber:29,group:"E",team1:"Curaçao",team2:"Ivory Coast",date:"2026-06-25",utc:"20:00",venue:"Lincoln Financial Field, Philadelphia",stage:gs},
  {matchNumber:30,group:"E",team1:"Ecuador",team2:"Germany",date:"2026-06-25",utc:"20:00",venue:"MetLife Stadium, East Rutherford",stage:gs},
  {matchNumber:35,group:"F",team1:"Japan",team2:"Sweden",date:"2026-06-25",utc:"23:00",venue:"AT&T Stadium, Arlington",stage:gs},
  {matchNumber:36,group:"F",team1:"Tunisia",team2:"Netherlands",date:"2026-06-25",utc:"23:00",venue:"Arrowhead Stadium, Kansas City",stage:gs},
  {matchNumber:23,group:"D",team1:"Turkey",team2:"United States",date:"2026-06-26",utc:"02:00",venue:"SoFi Stadium, Inglewood",stage:gs},
  {matchNumber:24,group:"D",team1:"Paraguay",team2:"Australia",date:"2026-06-26",utc:"02:00",venue:"Levi's Stadium, Santa Clara",stage:gs},
  // ── June 26 ──
  {matchNumber:53,group:"I",team1:"Norway",team2:"France",date:"2026-06-26",utc:"19:00",venue:"Gillette Stadium, Foxborough",stage:gs},
  {matchNumber:54,group:"I",team1:"Senegal",team2:"Iraq",date:"2026-06-26",utc:"19:00",venue:"BMO Field, Toronto",stage:gs},
  {matchNumber:47,group:"H",team1:"Cape Verde",team2:"Saudi Arabia",date:"2026-06-27",utc:"00:00",venue:"NRG Stadium, Houston",stage:gs},
  {matchNumber:48,group:"H",team1:"Uruguay",team2:"Spain",date:"2026-06-27",utc:"00:00",venue:"Estadio Akron, Zapopan",stage:gs},
  {matchNumber:41,group:"G",team1:"Egypt",team2:"Iran",date:"2026-06-27",utc:"03:00",venue:"Lumen Field, Seattle",stage:gs},
  {matchNumber:42,group:"G",team1:"New Zealand",team2:"Belgium",date:"2026-06-27",utc:"03:00",venue:"BC Place, Vancouver",stage:gs},
  // ── June 27 ──
  {matchNumber:65,group:"K",team1:"Colombia",team2:"Portugal",date:"2026-06-27",utc:"23:30",venue:"Hard Rock Stadium, Miami Gardens",stage:gs},
  {matchNumber:66,group:"K",team1:"DR Congo",team2:"Uzbekistan",date:"2026-06-27",utc:"23:30",venue:"Mercedes-Benz Stadium, Atlanta",stage:gs},
  {matchNumber:71,group:"L",team1:"Panama",team2:"England",date:"2026-06-27",utc:"21:00",venue:"MetLife Stadium, East Rutherford",stage:gs},
  {matchNumber:72,group:"L",team1:"Croatia",team2:"Ghana",date:"2026-06-27",utc:"21:00",venue:"Lincoln Financial Field, Philadelphia",stage:gs},
  {matchNumber:59,group:"J",team1:"Algeria",team2:"Austria",date:"2026-06-28",utc:"02:00",venue:"Arrowhead Stadium, Kansas City",stage:gs},
  {matchNumber:60,group:"J",team1:"Jordan",team2:"Argentina",date:"2026-06-28",utc:"02:00",venue:"AT&T Stadium, Arlington",stage:gs},
];

export const WC_2026_KNOCKOUT_MATCHES = [
  // Round of 32
  {matchNumber:73,team1:"Runner-up Group A",team2:"Runner-up Group B",date:"2026-06-28",utc:"20:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:74,team1:"Winner Group C",team2:"Runner-up Group F",date:"2026-06-29",utc:"17:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:75,team1:"Winner Group E",team2:"3rd Group A/B/C/D/F",date:"2026-06-29",utc:"20:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:76,team1:"Winner Group F",team2:"Runner-up Group C",date:"2026-06-29",utc:"23:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:77,team1:"Runner-up Group E",team2:"Runner-up Group I",date:"2026-06-30",utc:"17:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:78,team1:"Winner Group I",team2:"3rd Group C/D/F/G/H",date:"2026-06-30",utc:"20:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:79,team1:"Winner Group A",team2:"3rd Group C/E/F/H/I",date:"2026-06-30",utc:"23:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:80,team1:"Winner Group L",team2:"3rd Group E/H/I/J/K",date:"2026-07-01",utc:"17:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:81,team1:"Winner Group G",team2:"3rd Group A/E/H/I/J",date:"2026-07-01",utc:"20:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:82,team1:"Winner Group D",team2:"3rd Group B/E/F/I/J",date:"2026-07-01",utc:"23:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:83,team1:"Winner Group H",team2:"Runner-up Group J",date:"2026-07-02",utc:"17:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:84,team1:"Runner-up Group K",team2:"Runner-up Group L",date:"2026-07-02",utc:"20:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:85,team1:"Winner Group B",team2:"3rd Group E/F/G/I/J",date:"2026-07-02",utc:"23:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:86,team1:"Runner-up Group D",team2:"Runner-up Group G",date:"2026-07-03",utc:"17:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:87,team1:"Winner Group J",team2:"Runner-up Group H",date:"2026-07-03",utc:"20:00",venue:"TBD",stage:"Round of 32"},
  {matchNumber:88,team1:"Winner Group K",team2:"3rd Group D/E/I/J/L",date:"2026-07-03",utc:"23:00",venue:"TBD",stage:"Round of 32"},
  // Round of 16
  {matchNumber:89,team1:"W73",team2:"W75",date:"2026-07-04",utc:"19:00",venue:"TBD",stage:"Round of 16"},
  {matchNumber:90,team1:"W74",team2:"W77",date:"2026-07-04",utc:"22:00",venue:"TBD",stage:"Round of 16"},
  {matchNumber:91,team1:"W76",team2:"W78",date:"2026-07-05",utc:"19:00",venue:"TBD",stage:"Round of 16"},
  {matchNumber:92,team1:"W79",team2:"W80",date:"2026-07-05",utc:"22:00",venue:"TBD",stage:"Round of 16"},
  {matchNumber:93,team1:"W83",team2:"W84",date:"2026-07-06",utc:"19:00",venue:"TBD",stage:"Round of 16"},
  {matchNumber:94,team1:"W81",team2:"W82",date:"2026-07-06",utc:"22:00",venue:"TBD",stage:"Round of 16"},
  {matchNumber:95,team1:"W86",team2:"W88",date:"2026-07-07",utc:"19:00",venue:"TBD",stage:"Round of 16"},
  {matchNumber:96,team1:"W85",team2:"W87",date:"2026-07-07",utc:"22:00",venue:"TBD",stage:"Round of 16"},
  // Quarterfinals
  {matchNumber:97,team1:"W89",team2:"W90",date:"2026-07-09",utc:"20:00",venue:"TBD",stage:"Quarterfinals"},
  {matchNumber:98,team1:"W93",team2:"W94",date:"2026-07-10",utc:"20:00",venue:"TBD",stage:"Quarterfinals"},
  {matchNumber:99,team1:"W91",team2:"W92",date:"2026-07-11",utc:"20:00",venue:"TBD",stage:"Quarterfinals"},
  {matchNumber:100,team1:"W95",team2:"W96",date:"2026-07-11",utc:"23:00",venue:"TBD",stage:"Quarterfinals"},
  // Semifinals
  {matchNumber:101,team1:"W97",team2:"W98",date:"2026-07-14",utc:"20:00",venue:"AT&T Stadium, Arlington",stage:"Semifinals"},
  {matchNumber:102,team1:"W99",team2:"W100",date:"2026-07-15",utc:"20:00",venue:"Mercedes-Benz Stadium, Atlanta",stage:"Semifinals"},
  // Third Place
  {matchNumber:103,team1:"L101",team2:"L102",date:"2026-07-18",utc:"20:00",venue:"Hard Rock Stadium, Miami Gardens",stage:"Third Place"},
  // Final
  {matchNumber:104,team1:"W101",team2:"W102",date:"2026-07-19",utc:"20:00",venue:"MetLife Stadium, East Rutherford",stage:"Final"},
];

// Sort group matches chronologically by UTC time
WC_2026_MATCHES.sort((a,b) => {
  const da = a.date + 'T' + a.utc;
  const db = b.date + 'T' + b.utc;
  return da < db ? -1 : da > db ? 1 : a.matchNumber - b.matchNumber;
});

export const GROUP_TEAMS = {
  A:["Mexico","South Africa","South Korea","Czech Republic"],
  B:["Canada","Bosnia and Herzegovina","Qatar","Switzerland"],
  C:["Brazil","Morocco","Haiti","Scotland"],
  D:["United States","Paraguay","Australia","Turkey"],
  E:["Germany","Curaçao","Ivory Coast","Ecuador"],
  F:["Netherlands","Japan","Sweden","Tunisia"],
  G:["Belgium","Egypt","Iran","New Zealand"],
  H:["Spain","Cape Verde","Saudi Arabia","Uruguay"],
  I:["France","Senegal","Iraq","Norway"],
  J:["Argentina","Algeria","Austria","Jordan"],
  K:["Portugal","DR Congo","Uzbekistan","Colombia"],
  L:["England","Croatia","Ghana","Panama"],
};
export const TEAMS = Object.values(GROUP_TEAMS).flat().sort();
export const ALL_MATCHES = [...WC_2026_MATCHES,...WC_2026_KNOCKOUT_MATCHES];
export const GLOBAL_PREDICTIONS_DEADLINE = "2026-06-11T19:00:00Z";
export const FIXTURES_VERSION = "2026-05-15-wiki-utc";

export const calculatePoints = (prediction, actual) => {
  if (!prediction || !actual) return 0;
  if (actual.status && actual.status !== 'finished') return 0;
  const p1 = prediction.score1 ?? null, p2 = prediction.score2 ?? null;
  const a1 = actual.score1, a2 = actual.score2;
  if (p1 === a1 && p2 === a2) return 3;
  const pr = p1 > p2 ? "W" : p1 < p2 ? "L" : "D";
  const ar = a1 > a2 ? "W" : a1 < a2 ? "L" : "D";
  return pr === ar ? 1 : 0;
};

// Convert UTC time to user's timezone
export function formatMatchTime(utcDateStr, utcTimeStr, timeZone, locale) {
  const dt = new Date(utcDateStr + 'T' + utcTimeStr + ':00Z');
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const loc = locale || 'en-US';
  return {
    date: dt.toLocaleDateString(loc, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }),
    time: dt.toLocaleTimeString(loc, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }),
    fullDate: dt.toLocaleDateString(loc, { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    dateKey: dt.toLocaleDateString('en-CA', { timeZone: tz }),
  };
}
