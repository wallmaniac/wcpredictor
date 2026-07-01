const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, get } = require('firebase/database');
const fs = require('fs');
const path = require('path');

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

function formatDateTimeHR(ts) {
  if (!ts) return 'N/A';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return 'N/A';
  const pad = (n) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}. ${month}. ${year}. ${hours}:${minutes}:${seconds}`;
}

async function run() {
  try {
    console.log("Signing in...");
    await signInWithEmailAndPassword(auth, 'admin@wc2026.com', 'admin1');
    console.log("Signed in successfully!");

    console.log("Fetching users...");
    const usersSnap = await get(ref(db, 'wc2026/users'));
    if (!usersSnap.exists()) {
      throw new Error("No users found in database");
    }
    const users = usersSnap.val();

    console.log("Fetching match results...");
    const resultsSnap = await get(ref(db, 'wc2026/match_results'));
    const liveMatches = resultsSnap.exists() ? resultsSnap.val() : {};

    // Dynamic import of matchData
    const { ALL_MATCHES, resolveKnockoutMatches } = await import('./src/utils/matchData.js');

    // Resolve knockout matches
    const resolvedMatches = resolveKnockoutMatches(ALL_MATCHES, liveMatches);

    // Sort users by totalPoints desc, then exactScores desc, then correctResults desc
    const sortedUsers = Object.entries(users).map(([uid, u]) => ({
      uid,
      displayName: u.displayName || 'Unknown',
      email: u.email || '',
      flag: u.flag || '🌍',
      country: u.country || 'Unknown',
      totalPoints: u.totalPoints || 0,
      matchPoints: u.matchPoints || 0,
      globalPickPoints: u.globalPickPoints || 0,
      exactScores: u.exactScores || 0,
      correctResults: u.correctResults || 0,
      globalPicks: u.globalPicks || {},
      globalPicksLocked: u.globalPicksLocked === true,
      predictions: u.predictions || {},
      lockedMatches: u.lockedMatches || {},
    })).sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.exactScores !== a.exactScores) return b.exactScores - a.exactScores;
      return b.correctResults - a.correctResults;
    });

    let md = `# PredictorZ World Cup 2026 - All Users Predictions & Global Picks\n\n`;
    md += `Generated on: ${formatDateTimeHR(Date.now())} (Zagreb Time)\n\n`;
    md += `## Table of Contents & Leaderboard Standings\n\n`;
    md += `| Rank | User | Email | Country | Match Points | Global Points | Total Points | Exact Scores | Correct Results |\n`;
    md += `| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

    let currentRank = 0;
    let prevPoints = -1;
    sortedUsers.forEach((u, index) => {
      if (u.totalPoints !== prevPoints) {
        currentRank = index + 1;
        prevPoints = u.totalPoints;
      }
      const anchor = u.displayName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      md += `| **${currentRank}** | [${u.displayName}](#${anchor}) | \`${u.email}\` | ${u.flag} ${u.country} | \`${u.matchPoints}\` | \`${u.globalPickPoints}\` | **\`${u.totalPoints}\`** | \`${u.exactScores}\` | \`${u.correctResults}\` |\n`;
    });

    md += `\n---\n\n`;

    sortedUsers.forEach(u => {
      md += `## ${u.displayName}\n\n`;
      md += `- **Email**: \`${u.email}\`\n`;
      md += `- **Country**: ${u.country} ${u.flag}\n`;
      md += `- **Total Points**: \`${u.totalPoints}\` (Match Points: \`${u.matchPoints}\`, Global Pick Points: \`${u.globalPickPoints}\`)\n`;
      md += `- **Exact Scores**: \`${u.exactScores}\` | **Correct Results**: \`${u.correctResults}\`\n\n`;

      md += `### Global Predictions\n\n`;
      md += `Status: ${u.globalPicksLocked ? '**🔒 LOCKED**' : '**🔓 UNLOCKED**'}\n\n`;
      md += `| Prediction Type | Pick |\n`;
      md += `| :--- | :--- |\n`;
      md += `| **Champion** | ${u.globalPicks.champion || '-'} |\n`;
      md += `| **Second Place** | ${u.globalPicks.secondPlace || '-'} |\n`;
      md += `| **Third Place** | ${u.globalPicks.thirdPlace || '-'} |\n`;
      md += `| **Top Scorer** | ${u.globalPicks.topScorer || '-'} |\n`;
      md += `| **Top Assist** | ${u.globalPicks.topAssist || u.globalPicks.topHighlight || '-'} |\n`;
      md += `| **Top Goalkeeper** | ${u.globalPicks.topGoalkeeper || '-'} |\n\n`;

      md += `### Match Predictions\n\n`;
      md += `| Match # | Stage | Matchup | Prediction | Status | Lock Time | Lock Timestamp | Pred Time | Notes |\n`;
      md += `| :---: | :--- | :--- | :---: | :---: | :--- | :---: | :--- | :--- |\n`;

      // Sort predictions by match number ascending
      const userPreds = Object.entries(u.predictions).map(([mn, p]) => ({
        matchNumber: parseInt(mn, 10),
        score1: p.score1,
        score2: p.score2,
        qualifier: p.qualifier || null,
        timestamp: p.timestamp,
        editedByAdmin: p.editedByAdmin
      })).sort((a, b) => a.matchNumber - b.matchNumber);

      userPreds.forEach(p => {
        const m = resolvedMatches.find(x => x.matchNumber === p.matchNumber);
        if (!m) return;
        const isLocked = !!u.lockedMatches[p.matchNumber];
        const statusStr = isLocked ? '🔒 Locked' : '🔓 Unlocked';
        const lockTime = isLocked ? formatDateTimeHR(u.lockedMatches[p.matchNumber]) : 'N/A';
        const lockTs = isLocked ? `\`${u.lockedMatches[p.matchNumber]}\`` : '``';
        const predTime = formatDateTimeHR(p.timestamp);
        const notes = p.editedByAdmin ? 'Admin Edited' : '';
        const matchup = `${m.team1} vs ${m.team2}`;
        let predStr = `**${p.score1} - ${p.score2}**`;
        if (m.stage !== 'Group Stage' && p.score1 === p.score2 && p.qualifier) {
          predStr += ` (${p.qualifier})`;
        }
        md += `| **#${p.matchNumber}** | ${m.stage} | ${matchup} | ${predStr} | ${statusStr} | ${lockTime} | ${lockTs} | ${predTime} | ${notes} |\n`;
      });

      md += `\n\n---\n\n`;
    });

    const targetPath1 = path.join(__dirname, '../all_users_predictions.md');
    const targetPath2 = path.join(__dirname, '../../all_users_predictions.md');
    fs.writeFileSync(targetPath1, md, 'utf8');
    fs.writeFileSync(targetPath2, md, 'utf8');
    console.log(`Successfully generated and wrote all_users_predictions.md to ${targetPath1} and ${targetPath2}`);
    process.exit(0);
  } catch (err) {
    console.error("Error during execution:", err);
    process.exit(1);
  }
}

run();
