import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import { database } from '../config/firebase';
import { ref, onValue, set, get } from 'firebase/database';
import { ALL_MATCHES, calculatePoints, formatMatchTime, resolveKnockoutMatches } from '../utils/matchData';
import { PL_2526_MATCHES, calculatePLPoints, formatPLMatchTime } from '../utils/plMatchData';
import { translateTeam, translateStage } from '../utils/translations';
import { syncLiveScores } from '../services/liveScoreService';

function getMatchKickoffUTC(match) { return new Date(`${match.date}T${match.utc}:00Z`); }
function hasMatchStarted(match) { return Date.now() >= getMatchKickoffUTC(match).getTime(); }

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


// External database helpers to satisfy React Compiler purity check regarding Date.now()
async function saveUserPredictionExternal(database, fbPath, uid, matchNumber, score1, score2) {
  await set(ref(database, `${fbPath}/users/${uid}/predictions/${matchNumber}`), {
    score1: parseInt(score1, 10),
    score2: parseInt(score2, 10),
    timestamp: Date.now()
  });
}

async function lockMatchExternal(database, fbPath, uid, mn) {
  await set(ref(database, `${fbPath}/users/${uid}/lockedMatches/${mn}`), Date.now());
}

async function lockDayExternal(database, fbPath, uid, dk) {
  await set(ref(database, `${fbPath}/users/${uid}/lockedDays/${dk}`), Date.now());
}

const ROUND_COLORS = {
  1: { bg: 'rgba(0,180,255,0.10)', border: 'rgba(0,180,255,0.35)', label: '#00B4FF', labelBg: 'rgba(0,180,255,0.18)' },
  2: { bg: 'rgba(255,170,0,0.10)', border: 'rgba(255,170,0,0.35)', label: '#FFAA00', labelBg: 'rgba(255,170,0,0.18)' },
  3: { bg: 'rgba(160,80,255,0.10)', border: 'rgba(160,80,255,0.35)', label: '#A050FF', labelBg: 'rgba(160,80,255,0.18)' },
};

const ROUND_BANNER = {
  1: { bg: 'linear-gradient(90deg, rgba(0,180,255,0.25), rgba(0,180,255,0.05))', color: '#00B4FF', border: '1px solid rgba(0,180,255,0.3)' },
  2: { bg: 'linear-gradient(90deg, rgba(255,170,0,0.25), rgba(255,170,0,0.05))', color: '#FFAA00', border: '1px solid rgba(255,170,0,0.3)' },
  3: { bg: 'linear-gradient(90deg, rgba(160,80,255,0.25), rgba(160,80,255,0.05))', color: '#A050FF', border: '1px solid rgba(160,80,255,0.3)' },
};

export default function MatchList() {
  const { currentUser, isAdmin } = useAuth();
  const { t, tt, ts, lang } = useLanguage();
  const { competition } = useCompetition();
  const [predictions, setPredictions] = useState({});
  const [liveMatches, setLiveMatches] = useState({});
  const [saving, setSaving] = useState({});
  const [selectedPhase, setSelectedPhase] = useState(null);
  const [userTZ, setUserTZ] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [lockedDays, setLockedDays] = useState({});
  const [lockedMatches, setLockedMatches] = useState({});
  const [showLockConfirm, setShowLockConfirm] = useState(null);
  const [, setNow] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPlayed, setShowPlayed] = useState(false);
  const [adminSyncing, setAdminSyncing] = useState(false);
  const [adminSyncMsg, setAdminSyncMsg] = useState(null);
  const firstUpcomingRef = useRef(null);
  const scrollDone = useRef(false);
  const activeTabRef = useRef(null);

  const isWC = competition.id === 'wc2026';
  const fbPath = competition.firebasePath;

  // ALWAYS use hardcoded matches — predictions are keyed to these numbers
  const rawMatchesRaw = isWC ? ALL_MATCHES : PL_2526_MATCHES;
  const rawMatches = useMemo(() => {
    if (!isWC) return rawMatchesRaw;
    return resolveKnockoutMatches(rawMatchesRaw, liveMatches);
  }, [rawMatchesRaw, liveMatches, isWC]);

  // Annotate WC group matches with round number
  const matches = useMemo(() => {
    if (!isWC) return rawMatches;
    const groupBuckets = {};
    rawMatches.forEach(m => {
      if (m.group && m.stage === 'Group Stage') {
        if (!groupBuckets[m.group]) groupBuckets[m.group] = [];
        groupBuckets[m.group].push(m.matchNumber);
      }
    });
    const roundMap = {};
    Object.values(groupBuckets).forEach(bucket => {
      const sorted = [...bucket].sort((a, b) => {
        const mA = rawMatches.find(x => x.matchNumber === a);
        const mB = rawMatches.find(x => x.matchNumber === b);
        return (mA.date + mA.utc).localeCompare(mB.date + mB.utc);
      });
      sorted.forEach((mn, i) => { roundMap[mn] = Math.floor(i / 2) + 1; });
    });
    return rawMatches.map(m => ({ ...m, _groupRound: roundMap[m.matchNumber] || 0 }));
  }, [rawMatches, isWC]);

  const phases = competition.phases;
  const activePhase = (selectedPhase && phases.includes(selectedPhase)) ? selectedPhase : phases[0];

  useEffect(() => {
    const timer = setTimeout(() => {
      setNow(Date.now());
    }, 0);
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      clearTimeout(timer);
      clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    get(ref(database, `wc2026/users/${currentUser.uid}/timezone`)).then(s => { if (s.exists()) setUserTZ(s.val()); });
    const u1 = onValue(ref(database, `${fbPath}/users/${currentUser.uid}/predictions`), s => setPredictions(s.exists() ? s.val() : {}));
    const u2 = onValue(ref(database, `${fbPath}/match_results`), s => setLiveMatches(s.exists() ? s.val() : {}));
    const u3 = onValue(ref(database, `${fbPath}/users/${currentUser.uid}/lockedDays`), s => setLockedDays(s.exists() ? s.val() : {}));
    const u4 = onValue(ref(database, `${fbPath}/users/${currentUser.uid}/lockedMatches`), s => setLockedMatches(s.exists() ? s.val() : {}));
    return () => { u1(); u2(); u3(); u4(); };
  }, [currentUser, fbPath]);

  // Auto-scroll
  useEffect(() => { scrollDone.current = false; }, [activePhase]);
  useEffect(() => {
    if (!scrollDone.current && firstUpcomingRef.current) {
      const timer = setTimeout(() => { firstUpcomingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); scrollDone.current = true; }, 400);
      return () => clearTimeout(timer);
    }
  });

  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [activePhase]);

  const locale = lang === 'hr' ? 'hr-HR' : 'en-US';
  const calcPts = isWC ? calculatePoints : calculatePLPoints;
  const fmtTime = isWC ? formatMatchTime : formatPLMatchTime;

  const handlePredict = async (matchNumber, score1, score2) => {
    const match = matches.find(m => m.matchNumber === matchNumber);
    if (!match) return;
    if (!isAdmin && hasMatchStarted(match)) return;
    if (isWC) { if (!isAdmin && lockedMatches[matchNumber]) return; }
    else { const fmt = fmtTime(match.date, match.utc, userTZ, locale); if (!isAdmin && lockedDays[fmt.dateKey]) return; }

    // If either score is empty string or null/undefined, delete the prediction
    if (score1 === '' || score2 === '' || score1 === null || score2 === null || score1 === undefined || score2 === undefined) {
      if (predictions[matchNumber]) {
        setSaving(p => ({ ...p, [matchNumber]: true }));
        try {
          await set(ref(database, `${fbPath}/users/${currentUser.uid}/predictions/${matchNumber}`), null);
        } catch (e) {
          console.error(e);
        } finally {
          setSaving(p => ({ ...p, [matchNumber]: false }));
        }
      }
      return;
    }

    setSaving(p => ({ ...p, [matchNumber]: true }));
    try { await saveUserPredictionExternal(database, fbPath, currentUser.uid, matchNumber, score1, score2); }
    catch (e) { console.error(e); }
    finally { setSaving(p => ({ ...p, [matchNumber]: false })); }
  };

  const handleLockMatch = async (mn) => { try { await lockMatchExternal(database, fbPath, currentUser.uid, mn); setShowLockConfirm(null); } catch (e) { console.error(e); } };
  const handleLockDay = async (dk) => { try { await lockDayExternal(database, fbPath, currentUser.uid, dk); setShowLockConfirm(null); } catch (e) { console.error(e); } };

  const isMatchEditable = (match, dk) => { if (isAdmin) return true; if (hasMatchStarted(match)) return false; if (isWC) return !lockedMatches[match.matchNumber]; return !lockedDays[dk]; };
  const isMatchLocked = (match, dk) => { if (isWC) return !!lockedMatches[match.matchNumber]; return !!lockedDays[dk]; };

  let filtered = matches.filter(m => m.stage === activePhase);
  if (searchQuery.trim()) {
    const q = removeDiacritics(searchQuery);
    filtered = filtered.filter(m => {
      const t1Eng = removeDiacritics(m.team1 || '');
      const t2Eng = removeDiacritics(m.team2 || '');
      const t1Hrv = removeDiacritics(translateTeam('hr', m.team1 || ''));
      const t2Hrv = removeDiacritics(translateTeam('hr', m.team2 || ''));
      const stEng = removeDiacritics(m.stage || '');
      const stHrv = removeDiacritics(translateStage('hr', m.stage || ''));
      
      const matchesTeam = t1Eng.includes(q) || t2Eng.includes(q) || t1Hrv.includes(q) || t2Hrv.includes(q);
      const matchesStage = stEng.includes(q) || stHrv.includes(q);
      const matchesOther = String(m.matchNumber).includes(q) || 
                           removeDiacritics(m.group || '').includes(q) || 
                           removeDiacritics(m.venue || '').includes(q);
      
      return matchesTeam || matchesStage || matchesOther;
    });
  }

  // Sort chronologically and assign display number
  const sortedFiltered = [...filtered].sort((a, b) => (a.date + a.utc).localeCompare(b.date + b.utc) || a.matchNumber - b.matchNumber);

  // Split into played and upcoming
  const playedMatches = sortedFiltered.filter(m => liveMatches[`match_${m.matchNumber}`]?.status === 'finished');
  const upcomingMatches = sortedFiltered.filter(m => liveMatches[`match_${m.matchNumber}`]?.status !== 'finished');

  // Group upcoming by date
  const byDate = {};
  upcomingMatches.forEach(m => {
    const fmt = fmtTime(m.date, m.utc, userTZ, locale);
    const key = fmt.dateKey;
    if (!byDate[key]) byDate[key] = { label: fmt.fullDate, matches: [] };
    byDate[key].matches.push({ ...m, localTime: fmt.time, _dateKey: key });
  });

  // Group played by date
  const playedByDate = {};
  playedMatches.forEach(m => {
    const fmt = fmtTime(m.date, m.utc, userTZ, locale);
    const key = fmt.dateKey;
    if (!playedByDate[key]) playedByDate[key] = { label: fmt.fullDate, matches: [] };
    playedByDate[key].matches.push({ ...m, localTime: fmt.time, _dateKey: key });
  });

  const predCount = filtered.filter(m => predictions[m.matchNumber]).length;
  const firstUpcomingMatchNumber = upcomingMatches[0]?.matchNumber || null;

  const renderMatch = (match, dk, dimmed) => {
    const pred = predictions[match.matchNumber];
    const actual = liveMatches[`match_${match.matchNumber}`];
    const pts = actual?.status === 'finished' ? calcPts(pred, actual) : 0;
    const started = hasMatchStarted(match);
    const editable = isMatchEditable(match, dk);
    const matchLocked = isMatchLocked(match, dk);
    const isFinished = actual?.status === 'finished';
    const isLive = started && !actual;
    const round = match._groupRound || 0;
    const rc = (isWC && round >= 1 && round <= 3) ? ROUND_COLORS[round] : null;

    return (
      <div key={match.matchNumber} className="glass-card match-card" style={{
        ...(rc ? { borderLeft: `3px solid ${rc.border}`, background: rc.bg } : {}),
        ...(isLive ? { borderLeft: '3px solid rgba(255,184,0,0.6)', background: 'rgba(255,184,0,0.06)' } : {}),
        ...(dimmed ? { opacity: 0.5, filter: 'saturate(0.4)' } : {}),
        transition: 'all 0.3s',
      }}>
        <div className="match-meta">
          <span className="match-badge">#{match.matchNumber}</span>
          {match.group && <span className="match-group">{t('group')} {match.group}</span>}
          {rc && <span style={{ fontSize: '0.6rem', padding: '1px 6px', borderRadius: '4px', background: rc.labelBg, color: rc.label, fontWeight: 700 }}>R{round}</span>}
          {match.matchday && <span className="match-group">MD {match.matchday}</span>}
          <span>⏰ {match.localTime}</span>
          {isLive && <span style={{ color: '#FFB800', fontSize: '0.65rem', fontWeight: 600 }}>🔴 LIVE</span>}
          {isFinished && <span style={{ color: 'var(--primary)', fontSize: '0.6rem', fontWeight: 600, background: 'rgba(0,255,136,0.08)', padding: '1px 5px', borderRadius: '4px' }}>✅ FT</span>}
          {match.venue && match.venue !== 'TBD' && <span className="match-venue">📍 {match.venue}</span>}
        </div>
        <div className="match-body">
          <div className="match-teams">
            <span className="team-name">{isWC ? tt(match.team1) : match.team1}</span>
            <span className="match-vs">{t('vs')}</span>
            <span className="team-name">{isWC ? tt(match.team2) : match.team2}</span>
          </div>
          <div className="match-actions">
            <div className="prediction-box">
              <span className="prediction-label">{t('prediction')}{!editable && <span style={{ marginLeft: '4px' }}>{started ? '⏰' : '🔒'}</span>}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div className="prediction-inputs">
                  <input type="number" className="input-glass score-input" min="0" defaultValue={pred?.score1 ?? ''} disabled={!editable}
                    key={`s1_${match.matchNumber}_${pred?.score1 ?? ''}`}
                    style={!editable ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                    onBlur={e => handlePredict(match.matchNumber, e.target.value, document.getElementById(`m${competition.id}_${match.matchNumber}_s2`).value)}
                    id={`m${competition.id}_${match.matchNumber}_s1`} />
                  <span className="score-dash">-</span>
                  <input type="number" className="input-glass score-input" min="0" defaultValue={pred?.score2 ?? ''} disabled={!editable}
                    key={`s2_${match.matchNumber}_${pred?.score2 ?? ''}`}
                    style={!editable ? { opacity: 0.6, cursor: 'not-allowed' } : {}}
                    onBlur={e => handlePredict(match.matchNumber, document.getElementById(`m${competition.id}_${match.matchNumber}_s1`).value, e.target.value)}
                    id={`m${competition.id}_${match.matchNumber}_s2`} />
                </div>
                {/* Lock button inline with prediction */}
                {isWC && !matchLocked && !started && (
                  <button disabled={!pred} onClick={() => pred && setShowLockConfirm(match.matchNumber)} style={{
                    padding: '6px 10px', fontSize: '0.68rem', borderRadius: '6px',
                    cursor: pred ? 'pointer' : 'not-allowed',
                    background: pred ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.03)',
                    color: pred ? '#FFB800' : 'var(--text-muted)',
                    border: pred ? '1px solid rgba(255,184,0,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap',
                    opacity: pred ? 1 : 0.5, transition: 'all 0.2s',
                  }}>🔒 {t('lock')}</button>
                )}
                {isWC && matchLocked && !started && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--primary)', background: 'rgba(0,255,136,0.1)', padding: '4px 8px', borderRadius: '6px', fontWeight: 600, whiteSpace: 'nowrap' }}>🔒 {t('locked')}</span>
                )}
              </div>
              {saving[match.matchNumber] && <span style={{ fontSize: '0.6rem', color: 'var(--primary)' }}>{t('saving')}</span>}
            </div>
            {actual && (
              <div className={`result-box ${pts === 3 ? 'exact' : pts === 1 ? 'correct' : ''}`}>
                <div className="result-label">{t('result')}</div>
                <div className="result-score">{actual.score1} - {actual.score2}</div>
                {actual.status === 'finished' && <div className={`result-pts ${pts === 3 ? 'exact' : pts === 1 ? 'correct' : 'wrong'}`}>+{pts} {t('pts')}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="match-list-container">
      <div className="phase-tabs">
        {phases.map(ph => (
          <button key={ph}
            ref={activePhase === ph ? activeTabRef : null}
            onClick={() => { setSelectedPhase(ph); setSearchQuery(''); setShowPlayed(false); }}
            className={activePhase === ph ? 'phase-tab active' : 'phase-tab'}>
            {ts(ph)} <span style={{ opacity: 0.6 }}>({matches.filter(m => m.stage === ph).length})</span>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <input className="input-glass" type="text" placeholder={`🔍 ${t('searchMatches') || 'Search matches...'}`}
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '8px 14px', fontSize: '0.82rem' }} />
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
        <span>🕐 {t('timesShownIn')} <b style={{ color: '#fff' }}>{userTZ.replace(/_/g, ' ')}</b></span>
        <span style={{ color: '#FFB800' }}>📝 {predCount}/{filtered.length} {t('predicted') || 'predicted'}</span>
      </div>

      {/* Admin sync button */}
      {isAdmin && (
        <div style={{ marginBottom: '10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={async () => {
            setAdminSyncing(true); setAdminSyncMsg(null);
            try {
              const r = await syncLiveScores(competition.id);
              setAdminSyncMsg({ ok: r.success, msg: r.success ? r.message : r.error });
            } catch (e) { setAdminSyncMsg({ ok: false, msg: e.message }); }
            setAdminSyncing(false);
          }} className="btn-outline" disabled={adminSyncing}
            style={{ padding: '5px 12px', fontSize: '0.75rem' }}>
            {adminSyncing ? '⏳ Syncing...' : '🔄 Sync Scores from API'}
          </button>
          {adminSyncMsg && (
            <span style={{ fontSize: '0.72rem', color: adminSyncMsg.ok ? '#00ff88' : '#ff5555' }}>
              {adminSyncMsg.msg}
            </span>
          )}
        </div>
      )}

      {isWC && activePhase === 'Group Stage' && (
        <div style={{ display: 'flex', gap: '14px', marginBottom: '10px', flexWrap: 'wrap', fontSize: '0.72rem' }}>
          {[1, 2, 3].map(r => (
            <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: ROUND_COLORS[r].label }}></span>
              <span style={{ color: 'var(--text-muted)' }}>{t('round')} {r}</span>
            </span>
          ))}
        </div>
      )}

      {/* Played matches collapsible */}
      {playedMatches.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <button onClick={() => setShowPlayed(!showPlayed)} style={{
            width: '100%', padding: '10px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
            borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>📋 {t('playedMatches') || 'Played Matches'} ({playedMatches.length})</span>
            <span style={{ fontSize: '1rem' }}>{showPlayed ? '▲' : '▼'}</span>
          </button>
          {showPlayed && (
            <div style={{ marginTop: '8px' }}>
              {Object.keys(playedByDate).sort().map(dk => (
                <div key={dk}>
                  <div className="date-header">📅 {playedByDate[dk].label}</div>
                  {playedByDate[dk].matches.map(m => {
                    return renderMatch(m, dk, true);
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming / active matches */}
      {(() => {
        return Object.keys(byDate).sort().map(dk => {
          const dayData = byDate[dk];
          const isDayLocked = !isWC && !!lockedDays[dk];
          const allStarted = dayData.matches.every(m => hasMatchStarted(m));
          const anyPredicted = dayData.matches.some(m => predictions[m.matchNumber]);
          return (
            <div key={dk}>
              <div className="date-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📅 {dayData.label}</span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {!isWC && isDayLocked && <span style={{ fontSize: '0.7rem', background: 'rgba(0,255,136,0.1)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '10px' }}>🔒 {t('locked')}</span>}
                  {!isWC && allStarted && !isDayLocked && <span style={{ fontSize: '0.7rem', background: 'rgba(255,50,50,0.1)', color: '#ff5555', padding: '2px 8px', borderRadius: '10px' }}>⏰ {t('started')}</span>}
                  {!isWC && !isDayLocked && !allStarted && anyPredicted && (
                    <button onClick={() => setShowLockConfirm(dk)} className="btn-outline" style={{ padding: '2px 10px', fontSize: '0.65rem', borderColor: '#FFB800', color: '#FFB800' }}>🔒 {t('lockDay')}</button>
                  )}
                </div>
              </div>
              {dayData.matches.map(match => {
                const round = match._groupRound || 0;
                const isFirst = match.matchNumber === firstUpcomingMatchNumber;
                // Round banner
                const isFirstOfRound = isWC && round >= 1 && round <= 3 && activePhase === 'Group Stage' &&
                  (match.matchNumber === sortedFiltered.find(m => m._groupRound === round)?.matchNumber);
                const roundBanner = isFirstOfRound ? (
                  <div style={{ background: ROUND_BANNER[round].bg, border: ROUND_BANNER[round].border, borderRadius: '8px', padding: '8px 16px', marginBottom: '8px', textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', color: ROUND_BANNER[round].color, letterSpacing: '1px' }}>
                    ⚽ {t('roundUppercase')} {round}
                  </div>
                ) : null;
                return (
                  <Fragment key={match.matchNumber}>
                    {roundBanner}
                    <div ref={isFirst ? firstUpcomingRef : null} style={isFirst ? { scrollMarginTop: '20px' } : {}}>
                      {renderMatch(match, dk, false)}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          );
        });
      })()}

      {/* Search with no results */}
      {searchQuery && sortedFiltered.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('noSearchResults') || 'No matches found'}</div>}
      {!searchQuery && upcomingMatches.length === 0 && playedMatches.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('noMatches')}</div>}

      {/* Lock modal */}
      {showLockConfirm !== null && createPortal(
        <div className="rules-modal-overlay" onClick={() => setShowLockConfirm(null)}>
          <div className="rules-modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🔒</div>
            {isWC ? (() => {
              const m = matches.find(x => x.matchNumber === showLockConfirm);
              return m ? (<>
                <h3 style={{ marginBottom: '12px', color: '#FFB800' }}>{t('lockPredictionsFor')} #{m.matchNumber}?</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '6px' }}><strong>{tt(m.team1)}</strong> vs <strong>{tt(m.team2)}</strong></p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '20px' }}>
                  <strong style={{ color: '#ff5555' }}>⚠️ {t('cannotBeUndone')}</strong><br/><br/>{t('lockMatchDesc')}
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button onClick={() => setShowLockConfirm(null)} className="btn-outline" style={{ padding: '10px 24px' }}>{t('cancel')}</button>
                  <button onClick={() => handleLockMatch(showLockConfirm)} className="btn-primary" style={{ padding: '10px 24px', background: '#FFB800', color: '#000' }}>🔒 {t('yesLock')}</button>
                </div>
              </>) : null;
            })() : (<>
              <h3 style={{ marginBottom: '12px', color: '#FFB800' }}>{t('lockPredictionsFor')} {byDate[showLockConfirm]?.label}?</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '20px' }}>
                <strong style={{ color: '#ff5555' }}>⚠️ {t('cannotBeUndone')}</strong><br/><br/>{t('lockModalDesc1')}<br/><br/>{t('lockModalDesc2')}
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <button onClick={() => setShowLockConfirm(null)} className="btn-outline" style={{ padding: '10px 24px' }}>{t('cancel')}</button>
                <button onClick={() => handleLockDay(showLockConfirm)} className="btn-primary" style={{ padding: '10px 24px', background: '#FFB800', color: '#000' }}>🔒 {t('yesLockDay')}</button>
              </div>
            </>)}
          </div>
        </div>, document.body)}
    </div>
  );
}
