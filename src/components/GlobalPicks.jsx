import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useCompetition } from '../context/CompetitionContext';
import { database } from '../config/firebase';
import { ref, onValue, set, get } from 'firebase/database';
import { TEAMS } from '../utils/matchData';
import { PL_LEAGUE_TABLE_TEAMS } from '../utils/plMatchData';

export default function GlobalPicks() {
  const { currentUser } = useAuth();
  const { t, tt, lang } = useLanguage();
  const { competition } = useCompetition();
  const isWC = competition.id === 'wc2026';
  const fbPath = competition.firebasePath;

  const [picks, setPicks] = useState({
    champion: '', secondPlace: '', thirdPlace: '',
    topScorer: '', topAssist: '', topGoalkeeper: ''
  });
  const [dbLockStatus, setDbLockStatus] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [locking, setLocking] = useState(false);
  const [isAfterStart, setIsAfterStart] = useState(false);
  const [globalPickResults, setGlobalPickResults] = useState(null);
  const [actualGlobalResults, setActualGlobalResults] = useState({});

  const teamList = isWC ? TEAMS : PL_LEAGUE_TABLE_TEAMS;

  // Competition start dates for auto-lock
  const competitionStartDates = {
    wc2026: new Date('2026-06-11T00:00:00Z'),
    pl2526: new Date('2025-08-16T00:00:00Z'), // PL already started
  };

  const startDate = competitionStartDates[competition.id];
  const isLocked = dbLockStatus === true || (isAfterStart && dbLockStatus !== false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAfterStart(startDate ? Date.now() >= startDate.getTime() : false);
    }, 0);
    return () => clearTimeout(timer);
  }, [startDate]);

  useEffect(() => {
    if (!currentUser) return;
    const picksRef = ref(database, `${fbPath}/users/${currentUser.uid}/globalPicks`);
    const unsubscribe = onValue(picksRef, (snapshot) => {
      if (snapshot.exists()) setPicks(snapshot.val());
      else setPicks({ champion: '', secondPlace: '', thirdPlace: '', topScorer: '', topAssist: '', topGoalkeeper: '' });
    });
    return () => unsubscribe();
  }, [currentUser, fbPath]);

  // Listen for lock status
  useEffect(() => {
    if (!currentUser) return;
    const lockRef = ref(database, `${fbPath}/users/${currentUser.uid}/globalPicksLocked`);
    const unsubscribe = onValue(lockRef, (snapshot) => {
      setDbLockStatus(snapshot.exists() ? snapshot.val() : undefined);
    });
    return () => unsubscribe();
  }, [currentUser, fbPath]);

  // Listen for global pick results (correct/incorrect status)
  useEffect(() => {
    if (!currentUser) return;
    const resultsRef = ref(database, `${fbPath}/users/${currentUser.uid}/globalPickResults`);
    const unsubscribe = onValue(resultsRef, (snapshot) => {
      setGlobalPickResults(snapshot.exists() ? snapshot.val() : null);
    });
    return () => unsubscribe();
  }, [currentUser, fbPath]);

  // Listen for actual global results
  useEffect(() => {
    const metaPath = isWC ? 'wc2026/metadata/globalResults' : `${fbPath}/metadata/globalResults`;
    const unsubscribe = onValue(ref(database, metaPath), (snapshot) => {
      setActualGlobalResults(snapshot.exists() ? snapshot.val() : {});
    });
    return () => unsubscribe();
  }, [fbPath, isWC]);

  const handleSave = async () => {
    if (isLocked) return;
    setSaving(true);
    try {
      await set(ref(database, `${fbPath}/users/${currentUser.uid}/globalPicks`), picks);
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (err) { alert(`${t('failedToSave')}: ` + err.message); }
    finally { setSaving(false); }
  };

  const handleLock = async () => {
    // Check if at least some picks are filled
    const filled = Object.values(picks).filter(v => v.trim().length > 0).length;
    if (filled === 0) {
      alert(t('needOnePick'));
      return;
    }
    if (!window.confirm(t('lockConfirm'))) return;
    setLocking(true);
    try {
      // Save picks first
      await set(ref(database, `${fbPath}/users/${currentUser.uid}/globalPicks`), picks);
      // Then lock
      await set(ref(database, `${fbPath}/users/${currentUser.uid}/globalPicksLocked`), true);
    } catch (err) { alert(`${t('failedToLock')}: ` + err.message); }
    finally { setLocking(false); }
  };

  const fields = isWC ? [
    { key: 'champion', label: `🏆 ${t('champion')}`, pts: 10, type: 'select' },
    { key: 'secondPlace', label: `🥈 ${t('secondPlace')}`, pts: 5, type: 'select' },
    { key: 'thirdPlace', label: `🥉 ${t('thirdPlace')}`, pts: 5, type: 'select' },
    { key: 'topScorer', label: `👟 ${t('topScorer')}`, pts: 5, type: 'text' },
    { key: 'topAssist', label: `🎯 ${t('topAssist')}`, pts: 5, type: 'text' },
    { key: 'topGoalkeeper', label: `🧤 ${t('topGoalkeeper')}`, pts: 5, type: 'text' },
  ] : [
    { key: 'champion', label: `🏆 ${t('leagueChampion')}`, pts: 10, type: 'select' },
    { key: 'secondPlace', label: `🥈 ${t('secondPlacePL')}`, pts: 5, type: 'select' },
    { key: 'thirdPlace', label: `🥉 ${t('thirdPlacePL')}`, pts: 5, type: 'select' },
    { key: 'topScorer', label: `👟 ${t('goldenBoot')}`, pts: 5, type: 'text' },
    { key: 'topAssist', label: `🎯 ${t('mostAssists')}`, pts: 5, type: 'text' },
    { key: 'topGoalkeeper', label: `🧤 ${t('goldenGlove')}`, pts: 5, type: 'text' },
  ];

  // Calculate totals
  let totalEarned = 0;
  let totalPossible = 0;
  let correctCount = 0;
  let resolvedCount = 0;
  fields.forEach(f => {
    const result = globalPickResults?.[f.key];
    if (result) {
      resolvedCount++;
      totalPossible += f.pts;
      if (result.correct) {
        totalEarned += result.points || f.pts;
        correctCount++;
      }
    }
  });

  return (
    <div className="glass-card global-picks-card">
      <h3 style={{ marginBottom: '8px', color: 'var(--primary)' }}>
        🌍 {isWC ? t('yourGlobalPicks') : t('plGlobalPicksTitle')}
      </h3>
      <p style={{ color: 'var(--text-muted)', marginBottom: '12px', fontSize: '0.85rem' }}>
        {isWC ? t('globalPicksDesc') : t('plGlobalPicksDesc')}
      </p>

      {/* Lock status banner */}
      {isLocked && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.85rem',
          background: 'rgba(0,255,136,0.08)', color: 'var(--primary)',
          border: '1px solid rgba(0,255,136,0.2)', display: 'flex', alignItems: 'center', gap: '8px'
        }}>
          🔒 <strong>{t('predictionsLocked')}</strong>
        </div>
      )}

      {/* Points summary — show when there are results */}
      {resolvedCount > 0 && (
        <div style={{
          display: 'flex', justifyContent: 'space-around', padding: '12px', borderRadius: '8px', marginBottom: '14px',
          background: 'rgba(144,76,255,0.06)', border: '1px solid rgba(144,76,255,0.2)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--primary)' }}>+{totalEarned}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('pts')} {lang === 'hr' ? 'zarađeno' : 'earned'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#00ff88' }}>{correctCount}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{lang === 'hr' ? 'pogođeno' : 'correct'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#ff5555' }}>{resolvedCount - correctCount}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{lang === 'hr' ? 'promašeno' : 'wrong'}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>{6 - resolvedCount}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{lang === 'hr' ? 'na čekanju' : 'pending'}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {fields.map(f => {
          const result = globalPickResults?.[f.key];
          const hasResult = !!result;
          const isCorrectPick = result?.correct;
          const actualValue = result?.actual || actualGlobalResults[f.key];
          const displayActual = actualValue ? (['champion', 'secondPlace', 'thirdPlace'].includes(f.key) ? tt(actualValue) : actualValue) : null;

          return (
            <div key={f.key} style={{
              padding: '12px 14px', borderRadius: '8px',
              background: hasResult ? (isCorrectPick ? 'rgba(0,255,136,0.05)' : 'rgba(255,50,50,0.03)') : 'rgba(255,255,255,0.02)',
              border: `1px solid ${hasResult ? (isCorrectPick ? 'rgba(0,255,136,0.2)' : 'rgba(255,50,50,0.12)') : 'var(--glass-border)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>{f.label}</label>
                <span style={{ fontSize: '0.72rem', color: hasResult ? (isCorrectPick ? '#00ff88' : '#ff5555') : 'var(--text-muted)', fontWeight: 'bold' }}>
                  {hasResult ? (isCorrectPick ? `✅ +${result.points || f.pts} ${t('pts')}` : `❌ +0 ${t('pts')}`) : `${f.pts} ${t('pts')}`}
                </span>
              </div>
              
              {isLocked ? (
                <div style={{
                  padding: '10px 14px', borderRadius: '8px', fontSize: '0.92rem', fontWeight: 600,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)',
                  color: picks[f.key] ? '#fff' : 'var(--text-muted)',
                }}>
                  {hasResult && (isCorrectPick ? '✅ ' : '❌ ')}
                  {picks[f.key] ? (f.type === 'select' ? tt(picks[f.key]) : picks[f.key]) : t('notSet')}
                </div>
              ) : f.type === 'select' ? (
                <select className="input-glass" value={picks[f.key] || ''} onChange={e => setPicks({...picks, [f.key]: e.target.value})}>
                  <option value="">{t('selectTeam')}</option>
                  {teamList.map(team => <option key={team} value={team}>{tt(team)}</option>)}
                </select>
              ) : (
                <input type="text" className="input-glass" placeholder={t('playerName')} value={picks[f.key] || ''} onChange={e => setPicks({...picks, [f.key]: e.target.value})} />
              )}

              {/* Show actual result if available and pick was wrong */}
              {hasResult && !isCorrectPick && displayActual && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {t('result') || 'Result'}: <strong style={{ color: '#00ff88' }}>{displayActual}</strong>
                </div>
              )}
            </div>
          );
        })}

        {!isLocked && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving || isLocked} style={{ flex: 1, minWidth: '120px' }}>
              {saving ? `⏳ ${t('saving')}` : saved ? `✅ ${t('saved')}` : `💾 ${t('saveGlobalPicks')}`}
            </button>
            <button onClick={handleLock} disabled={locking} style={{
              flex: 1, minWidth: '120px', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer',
              background: 'rgba(255,184,0,0.12)', color: '#FFB800',
              border: '1px solid rgba(255,184,0,0.3)', fontWeight: 'bold', fontSize: '0.9rem',
              transition: 'all 0.2s', fontFamily: 'inherit',
            }}>
              {locking ? '⏳ ...' : t('lockGlobalPicks')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
