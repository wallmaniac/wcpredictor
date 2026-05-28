# PredictorZ — Real-time Sports Prediction Platform

A premium, feature-rich Progressive Web Application (PWA) built for sports tournament predictions. Currently configured for **FIFA World Cup 2026** and **Premier League 2025/26**, the platform enables users to compete in public and private leagues, submit match-by-match score predictions, lock in long-term tournament outcome projections, and view real-time leaderboard adjustments driven by live match data.

---

## 🌟 App Purpose & Value Proposition

**PredictorZ** turns sports viewership into a highly engaging, gamified social experience. Rather than acting as a passive spectator, users become active participants in the tournament's narrative. 

### Key Business Goals:
1. **Maximize Engagement**: High-frequency user touchpoints around every matchday via real-time point adjustments.
2. **Community Virality**: User-created private leagues drive organic growth as friends and colleagues invite each other.
3. **Fair and Secure Play**: A strict lock-in mechanism prevents prediction copy-cats, maintaining the integrity of the leaderboard.
4. **Monetization Potential**: Dynamic support for league entry fees, automated platform fee collection (e.g., 10%), and prize distribution management.

---

## 🎮 Game Rules & Scoring System

The platform's scoring is designed to reward precise forecasting while keeping the competition accessible to casual fans.

### 1. Match Predictions (Group & League stages)
Users submit predictions for the final score of each match before kickoff.
* **Exact Score (3 Points)**: Nab the exact scoreline (e.g., predicted 2-1, final score 2-1).
* **Correct Outcome (1 Point)**: Correctly guess the winner or draw, but with a different scoreline (e.g., predicted 2-0, final score 3-1).
* **Incorrect Outcome (0 Points)**: Incorrect result prediction.
* **Knockout Stage Specifics**: Knockout matches evaluate the scoreline at the end of extra time (120 minutes). Penalty shootout results are excluded (matches going to shootouts are scored as draws).

### 2. Global Predictions (Tournament-wide)
Locked in before the first match kicks off:
* **Champion (10 Points)**: Predict the tournament winner.
* **Second Place (5 Points)**: Predict the runner-up.
* **Third Place (5 Points)**: Predict the 3rd place team.
* **Golden Boot / Top Scorer (5 Points)**: Predict the tournament's top goalscorer.
* **Most Assists (5 Points)**: Predict the top assist provider.
* **Golden Glove / Best Goalkeeper (5 Points)**: Predict the tournament's top goalkeeper.

### 3. Standings & Tiebreakers
* **Total Points**: Sum of match predictions + global prediction bonus points.
* **Primary Tiebreaker**: The total count of **Exact Scores** guessed correctly. Users with more exact scores rank higher in ties.

---

## 🛠️ How to Use the App

### 1. Account & Profile Setup
* **Onboarding**: Users sign up via email. Admins can manage approvals to keep leagues exclusive or open to the public.
* **Localization**: From their profile, users configure their display name, country flag, and timezone (automatically adjusting all match kickoffs to local time).

### 2. Submitting predictions
* **Matches Tab**: Organized chronologically. Users enter predicted scores.
* **Saving vs Locking**:
  * Users can **Save** draft predictions and modify them up until kickoff.
  * To see friends' predictions, users must click **Lock** (per-match or per-day). **Once locked, predictions cannot be modified.**
  * *Note: Other users' predictions remain hidden until you lock yours for that specific match/day, neutralizing copy-cat tactics.*

### 3. Social Leagues
* **Private & Public Leagues**: Users can search for and join leagues, or create their own.
* **Admin Approval**: League creators approve or deny join requests.
* **Financial Layer**: For paid leagues, creators track entry payments, which are subject to a platform-level fee, showing the net prize pool and payout splits (e.g., 70% for 1st, 20% for 2nd, 10% for 3rd).

### 4. Tracking Standings
* **Leaderboard Tab**: Filter by A-Z sorted leagues or view global standings. stand-out analytics panels show user statistics (exact match rates, win/draw/loss distribution).
* **Live Projected standings**: During active games, the leaderboard calculates a **Projected Standing** in real time. Standard indicators show "+3 live" or "+1 live" badge modifications based on active scorelines.
* **Live Stats**: Group standings, player statistics (goals, assists, clean sheets), and live match events sync dynamically.

### 5. Administrative Dashboard
* **Automatic Live Score Sync**: Integrates with live data feeds (`apifootball.com`) for automated result fetching and real-time point distribution.
* **Manual Control**: Admins can override/set official results, edit/unlock user predictions if required, manage user roles (cycling from User -> Admin -> Super Admin), and configure API keys.

---

## 🌍 Purpose to Society

PredictorZ delivers positive social value across multiple vectors:

1. **Building Community & Social Cohesion**: Brings groups of colleagues, families, and digital communities together. Sports events become conversational focal points, driving healthy, non-destructive social connection.
2. **Promoting Sportsmanship & Enthusiasm**: Boosts broad engagement in international tournaments. Fans pay closer attention to lesser-known teams and fixtures because their prediction league remains active.
3. **Cognitive Engagement & Analytical Thinking**: Users engage in analytical reasoning, factoring in team forms, histories, player injuries, and statistical likelihoods. It makes fans active analysts rather than passive content consumers.
4. **Platform for Charity & Fundraising**: The league structures make it easy for groups to coordinate charity pools, where the entry fees go to a chosen social cause, gamifying philanthropic donations.

---

## 💻 Tech Stack & Architecture

* **Frontend**: React + Vite (HTML5, Tailwind CSS/Vanilla CSS, Mobile-first responsive UI).
* **Realtime Database**: Firebase Realtime Database (handles lightning-fast synchronization of live match minutes, events, and score changes directly to client-side views).
* **Authentication**: Firebase Authentication.
* **Hosting**: Firebase Hosting (optimized for fast edge delivery, installable as a Progressive Web App (PWA)).
* **Security**: Firebase Database Security Rules enforcing restricted path access (anti-tampering of others' saved picks).
* **API Integration**: Scheduled Node/Cloud functions polling API-Football.
