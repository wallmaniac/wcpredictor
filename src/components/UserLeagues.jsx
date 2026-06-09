import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useCompetition } from '../context/CompetitionContext';
import { COMPETITIONS } from '../context/CompetitionContext';
import { database } from '../config/firebase';
import { ref, onValue, set, remove, push, update } from 'firebase/database';

// External database helper to satisfy React Compiler purity check regarding Date.now()
async function sendJoinRequestExternal(database, lid, uid, displayName, email) {
  await set(ref(database, `wc2026/leagues/${lid}/joinRequests/${uid}`), {
    displayName: displayName || email,
    requestedAt: Date.now()
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


/** Small colored badge showing which competition a league is for */
function CompBadge({ compId, style }) {
  const comp = COMPETITIONS[compId];
  if (!comp) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      fontSize: '0.68rem', fontWeight: 600,
      padding: '2px 7px', borderRadius: '4px',
      background: compId === 'wc2026' ? 'rgba(255,215,0,0.12)' : 'rgba(144,76,255,0.12)',
      color: compId === 'wc2026' ? '#FFD700' : '#b07cff',
      border: `1px solid ${compId === 'wc2026' ? 'rgba(255,215,0,0.25)' : 'rgba(144,76,255,0.25)'}`,
      ...style,
    }}>
      {comp.icon} {comp.shortName}
    </span>
  );
}

export default function UserLeagues() {
  const { currentUser, isAdmin } = useAuth();
  const { competition } = useCompetition();
  const [leagues, setLeagues] = useState({});
  const [users, setUsers] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [joinMsg, setJoinMsg] = useState('');
  const [showManage, setShowManage] = useState(null);
  const [filterComp, setFilterComp] = useState('all'); // 'all' | 'wc2026' | 'pl2526'
  // Create form
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFee, setNewFee] = useState('20');
  const [newCurrency, setNewCurrency] = useState('EUR');
  const [newPrizes, setNewPrizes] = useState('100');
  const [createMsg, setCreateMsg] = useState('');
  // Manage
  const [managePassword, setManagePassword] = useState('');
  const [manageMsg, setManageMsg] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [compUsers, setCompUsers] = useState({});
  const [manageFee, setManageFee] = useState('20');
  const [manageCurrency, setManageCurrency] = useState('EUR');
  const [managePrizes, setManagePrizes] = useState('100');

  useEffect(() => {
    const u1 = onValue(ref(database, 'wc2026/leagues'), s => setLeagues(s.exists() ? s.val() : {}));
    const u2 = onValue(ref(database, 'wc2026/users'), s => setUsers(s.exists() ? s.val() : {}));
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    if (!showManage || !leagues[showManage]) {
      const timer = setTimeout(() => {
        setCompUsers({});
      }, 0);
      return () => clearTimeout(timer);
    }
    const compId = leagues[showManage].competitionId || 'wc2026';
    if (compId === 'wc2026') {
      const timer = setTimeout(() => {
        setCompUsers({});
      }, 0);
      return () => clearTimeout(timer);
    }
    const compRef = ref(database, `${compId}/users`);
    const unsubscribe = onValue(compRef, (snap) => {
      setCompUsers(snap.exists() ? snap.val() : {});
    });
    return () => unsubscribe();
  }, [showManage, leagues]);

  const uid = currentUser?.uid;

  // Filter helpers
  const matchesFilter = (league) => {
    if (filterComp === 'all') return true;
    return (league.competitionId || 'wc2026') === filterComp;
  };

  const myLeagueIds = Object.entries(leagues)
    .filter(([, l]) => (l.members?.[uid] || isAdmin) && matchesFilter(l))
    .map(([id]) => id);

  const searchResults = searchTerm.trim().length >= 2
    ? Object.entries(leagues).filter(([, l]) =>
        removeDiacritics(l.name || '').includes(removeDiacritics(searchTerm)) && !l.members?.[uid]
      )
    : [];

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const fee = parseFloat(newFee) || 0;
    const splits = newPrizes.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
    const dist = {}; splits.forEach((p, i) => { dist[i + 1] = p; });
    const newRef = push(ref(database, 'wc2026/leagues'));
    await set(newRef, {
      name: newName.trim(), description: newDesc.trim(),
      competitionId: competition.id,
      competitionName: competition.shortName,
      createdBy: uid, createdByName: users[uid]?.displayName || currentUser.email,
      createdAt: Date.now(), members: { [uid]: true },
      password: newPassword.trim() || null,
      entryFee: fee, currency: newCurrency,
      platformFeePercent: 0, prizeDistribution: dist, payments: {},
      joinRequests: {},
    });
    setNewName(''); setNewDesc(''); setNewPassword(''); setNewFee('20'); setNewPrizes('100');
    setShowCreate(false);
    setCreateMsg('✅ League created!');
    setTimeout(() => setCreateMsg(''), 3000);
  };

  const handleRequestJoin = async (lid) => {
    const league = leagues[lid];
    if (league?.password) {
      setShowJoinModal(lid);
      setJoinPassword('');
      setJoinMsg('');
    } else {
      await sendJoinRequestExternal(database, lid, uid, users[uid]?.displayName, currentUser.email);
      setJoinMsg('✅ Request sent!');
      setTimeout(() => setJoinMsg(''), 3000);
    }
  };

  const handleJoinWithPassword = async () => {
    if (!showJoinModal) return;
    const league = leagues[showJoinModal];
    if (joinPassword === league.password) {
      await set(ref(database, `wc2026/leagues/${showJoinModal}/members/${uid}`), true);
      setShowJoinModal(null);
      setJoinMsg('✅ Joined!');
      setTimeout(() => setJoinMsg(''), 3000);
    } else {
      setJoinMsg('❌ Wrong password');
    }
  };

  const handleRequestJoinNoPassword = async () => {
    if (!showJoinModal) return;
    await set(ref(database, `wc2026/leagues/${showJoinModal}/joinRequests/${uid}`), {
      displayName: users[uid]?.displayName || currentUser.email,
      requestedAt: Date.now(),
    });
    setShowJoinModal(null);
    setJoinMsg('✅ Request sent!');
    setTimeout(() => setJoinMsg(''), 3000);
  };

  const handleAcceptRequest = async (lid, reqUid) => {
    await set(ref(database, `wc2026/leagues/${lid}/members/${reqUid}`), true);
    await remove(ref(database, `wc2026/leagues/${lid}/joinRequests/${reqUid}`));
  };

  const handleDenyRequest = async (lid, reqUid) => {
    await remove(ref(database, `wc2026/leagues/${lid}/joinRequests/${reqUid}`));
  };

  const handleLeave = async (lid) => {
    if (!window.confirm('Leave this league?')) return;
    await remove(ref(database, `wc2026/leagues/${lid}/members/${uid}`));
  };

  const handleRemoveMember = async (lid, memberUid) => {
    await remove(ref(database, `wc2026/leagues/${lid}/members/${memberUid}`));
  };

  const handleDeleteLeague = async (lid) => {
    if (!window.confirm('Delete this league permanently?')) return;
    await remove(ref(database, `wc2026/leagues/${lid}`));
    setShowManage(null);
  };

  const handleConfirmPayment = async (lid, memberUid) => {
    const entryFee = parseFloat(leagues[lid]?.entryFee) || 0;
    await set(ref(database, `wc2026/leagues/${lid}/payments/${memberUid}`), {
      amount: entryFee,
      status: 'confirmed',
      method: 'bank_transfer',
      confirmedBy: currentUser?.uid || 'unknown',
      confirmedAt: Date.now()
    });
  };

  const handleUnconfirmPayment = async (lid, memberUid) => {
    await remove(ref(database, `wc2026/leagues/${lid}/payments/${memberUid}`));
  };

  const calcPrizePool = (league) => {
    if (!league) return null;
    const fee = league.entryFee || 0;
    if (fee === 0) return null;
    const paidCount = league.payments ? Object.values(league.payments).filter(p => p.status === 'confirmed').length : 0;
    const gross = fee * paidCount;
    const net = gross;
    return { gross, processorFee: 0, platformFee: 0, net, paidCount, currency: league.currency || 'EUR' };
  };


  const cs = { padding: '16px', marginBottom: '12px' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <h2>🏟️ Leagues</h2>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
          ➕ Create League
        </button>
      </div>

      {createMsg && <div style={{ background: 'rgba(0,255,136,0.1)', color: 'var(--primary)', padding: '8px 12px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.85rem' }}>{createMsg}</div>}
      {joinMsg && <div style={{ background: joinMsg.startsWith('✅') ? 'rgba(0,255,136,0.1)' : 'rgba(255,50,50,0.1)', color: joinMsg.startsWith('✅') ? 'var(--primary)' : '#ff5555', padding: '8px 12px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.85rem' }}>{joinMsg}</div>}

      {/* Create League Form */}
      {showCreate && (
        <div className="glass-card" style={{ ...cs, border: '1px solid rgba(0,255,136,0.2)' }}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '12px', fontSize: '0.95rem' }}>➕ Create New League</h3>
          {/* Competition indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
            <span style={{ fontSize: '1.3rem' }}>{competition.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{competition.name}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>This league will be created for the currently selected competition</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input className="input-glass" placeholder="League Name *" value={newName} onChange={e => setNewName(e.target.value)} />
            <input className="input-glass" placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            <div>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: '4px', display: 'block' }}>🔑 League Password (optional — lets users join without approval)</label>
              <input className="input-glass" type="text" placeholder="Leave empty for request-only" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '80px' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'block', marginBottom: '4px' }}>💰 Entry Fee</label>
                <input className="input-glass" type="number" min="0" step="0.5" value={newFee} onChange={e => setNewFee(e.target.value)} />
              </div>
              <div style={{ width: '80px' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'block', marginBottom: '4px' }}>Currency</label>
                <select className="input-glass" value={newCurrency} onChange={e => setNewCurrency(e.target.value)}>
                  <option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="BAM">BAM</option><option value="HRK">HRK</option>
                </select>
              </div>
            </div>
            {parseFloat(newFee) > 0 && (
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'block', marginBottom: '4px' }}>🏆 Prize Split % (comma separated)</label>
                <input className="input-glass" placeholder="50,30,20" value={newPrizes} onChange={e => setNewPrizes(e.target.value)} />
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleCreate} className="btn-primary" style={{ flex: 1, padding: '10px' }}>✅ Create</button>
              <button onClick={() => setShowCreate(false)} className="btn-outline" style={{ padding: '10px 16px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Search Leagues */}
      <div className="glass-card" style={cs}>
        <h3 style={{ color: 'var(--primary)', marginBottom: '10px', fontSize: '0.95rem' }}>🔍 Find a League</h3>
        <input className="input-glass" placeholder="Search by league name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        {searchResults.length > 0 && (
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {searchResults.map(([lid, league]) => {
              const memberCount = league.members ? Object.keys(league.members).length : 0;
              const hasPending = league.joinRequests?.[uid];
              const hasPassword = !!league.password;
              const leagueComp = league.competitionId || 'wc2026';
              return (
                <div key={lid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--glass-border)', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: '120px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      {hasPassword && <span style={{ color: '#FFB800' }}>🔑 </span>}
                      {league.name}
                      <CompBadge compId={leagueComp} />
                    </div>
                    {league.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{league.description}</div>}
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      👥 {memberCount} members • by {league.createdByName}
                      {league.entryFee > 0 && <span> • 💰 {league.entryFee} {league.currency || 'EUR'}</span>}
                    </div>
                  </div>
                  {hasPending ? (
                    <span style={{ fontSize: '0.75rem', color: '#FFB800', padding: '4px 10px', background: 'rgba(255,184,0,0.1)', borderRadius: '6px' }}>⏳ Pending</span>
                  ) : (
                    <button onClick={() => handleRequestJoin(lid)} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.78rem' }}>
                      {hasPassword ? '🔑 Join' : '📩 Request'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {searchTerm.trim().length >= 2 && searchResults.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '12px' }}>No leagues found matching "{searchTerm}"</p>
        )}
      </div>

      {/* My Leagues — with filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
        <h3 style={{ fontSize: '0.95rem' }}>📋 My Leagues ({myLeagueIds.length})</h3>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['all', 'wc2026', 'pl2526'].map(f => (
            <button key={f} onClick={() => setFilterComp(f)}
              style={{
                padding: '3px 8px', fontSize: '0.68rem', borderRadius: '5px', cursor: 'pointer',
                border: filterComp === f ? '1px solid var(--primary)' : '1px solid var(--glass-border)',
                background: filterComp === f ? 'rgba(0,255,136,0.12)' : 'transparent',
                color: filterComp === f ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: filterComp === f ? 600 : 400,
              }}>
              {f === 'all' ? 'All' : COMPETITIONS[f]?.icon + ' ' + COMPETITIONS[f]?.shortName}
            </button>
          ))}
        </div>
      </div>

      {myLeagueIds.length === 0 && (
        <div className="glass-card" style={{ ...cs, textAlign: 'center', color: 'var(--text-muted)' }}>
          <p>You haven't joined any leagues yet.</p>
          <p style={{ fontSize: '0.8rem', marginTop: '6px' }}>Create your own or search for one above!</p>
        </div>
      )}
      {myLeagueIds.map(lid => {
        const league = leagues[lid];
        if (!league) return null;
        const isCreator = league.createdBy === uid;
        const canManage = isCreator || isAdmin;
        const memberCount = league.members ? Object.keys(league.members).length : 0;
        const pendingCount = league.joinRequests ? Object.keys(league.joinRequests).length : 0;
        const leagueComp = league.competitionId || 'wc2026';
        return (
          <div key={lid} className="glass-card" style={{ ...cs, border: canManage ? '1px solid rgba(0,255,136,0.15)' : undefined, cursor: 'pointer' }}
            onClick={() => {
              if (window.__setDashboardTab) window.__setDashboardTab('leaderboard');
              setTimeout(() => window.dispatchEvent(new CustomEvent('select-league', { detail: lid })), 100);
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  🏟️ {league.name}
                  <CompBadge compId={leagueComp} />
                  {isCreator && <span style={{ fontSize: '0.65rem', color: 'var(--primary)', background: 'rgba(0,255,136,0.1)', padding: '2px 6px', borderRadius: '4px' }}>Creator</span>}
                  {league.password && <span style={{ fontSize: '0.65rem', color: '#FFB800' }}>🔑</span>}
                </h4>
                {league.description && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{league.description}</p>}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  👥 {memberCount} members • by {league.createdByName}
                  {league.entryFee > 0 && <span> • 💰 {league.entryFee} {league.currency || 'EUR'}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {canManage && (
                  <button onClick={(e) => {
                    e.stopPropagation();
                    setShowManage(lid);
                    setManagePassword(league.password || '');
                    setManageFee(league.entryFee !== undefined ? league.entryFee.toString() : '20');
                    setManageCurrency(league.currency || 'EUR');
                    setManagePrizes(Object.values(league.prizeDistribution || {}).join(',') || '100');
                    setManageMsg('');
                  }} className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>⚙️ Manage</button>
                )}
                {!canManage && (
                  <button onClick={(e) => { e.stopPropagation(); handleLeave(lid); }} className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.72rem', borderColor: 'rgba(255,50,50,0.3)', color: '#ff5555' }}>🚪 Leave</button>
                )}
              </div>
            </div>

            {/* Pending requests (visible to creator) */}
            {canManage && pendingCount > 0 && (
              <div style={{ background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                <h5 style={{ fontSize: '0.8rem', color: '#FFB800', marginBottom: '6px' }}>📩 Join Requests ({pendingCount})</h5>
                {Object.entries(league.joinRequests).map(([reqUid, req]) => (
                  <div key={reqUid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontSize: '0.82rem' }}>{users[reqUid]?.flag || '🌍'} {req.displayName || users[reqUid]?.displayName || 'Unknown'}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => handleAcceptRequest(lid, reqUid)} style={{ background: 'rgba(0,255,136,0.15)', color: 'var(--primary)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: '6px', padding: '3px 10px', fontSize: '0.72rem', cursor: 'pointer' }}>✅ Accept</button>
                      <button onClick={() => handleDenyRequest(lid, reqUid)} style={{ background: 'rgba(255,50,50,0.15)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '6px', padding: '3px 10px', fontSize: '0.72rem', cursor: 'pointer' }}>❌ Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Members */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {league.members && Object.keys(league.members).map(mUid => {
                const u = users[mUid]; if (!u) return null;
                const isOwner = mUid === league.createdBy;
                return (
                  <div key={mUid} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '3px 8px', borderRadius: '14px', fontSize: '0.78rem' }}>
                    {u.flag || '🌍'} {u.displayName || u.email}
                    {isOwner && <span style={{ fontSize: '0.6rem', color: 'var(--primary)' }}>👑</span>}
                    {canManage && !isOwner && (
                      <button onClick={() => handleRemoveMember(lid, mUid)} style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px' }}>✕</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Password Join Modal */}
      {showJoinModal && createPortal(
        <div className="rules-modal-overlay" onClick={() => setShowJoinModal(null)}>
          <div className="rules-modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
            <button className="rules-modal-close" onClick={() => setShowJoinModal(null)}>✕</button>
            <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>🔑</div>
            <h3 style={{ marginBottom: '6px' }}>Join {leagues[showJoinModal]?.name}</h3>
            <CompBadge compId={leagues[showJoinModal]?.competitionId || 'wc2026'} style={{ marginBottom: '10px' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '16px' }}>This league has a password. Enter it to join instantly, or request access from the creator.</p>
            {joinMsg && <div style={{ padding: '6px 10px', borderRadius: '6px', marginBottom: '10px', fontSize: '0.82rem', background: joinMsg.startsWith('✅') ? 'rgba(0,255,136,0.1)' : 'rgba(255,50,50,0.1)', color: joinMsg.startsWith('✅') ? 'var(--primary)' : '#ff5555' }}>{joinMsg}</div>}
            <input className="input-glass" type="text" placeholder="Enter league password..." value={joinPassword} onChange={e => setJoinPassword(e.target.value)} style={{ marginBottom: '12px' }} />
            <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
              <button onClick={handleJoinWithPassword} className="btn-primary" style={{ padding: '10px', width: '100%' }}>🔑 Join with Password</button>
              <button onClick={handleRequestJoinNoPassword} className="btn-outline" style={{ padding: '10px', width: '100%', fontSize: '0.82rem' }}>📩 Request Access Instead</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* Manage League Modal */}
      {showManage && createPortal(
        <div className="rules-modal-overlay" onClick={() => setShowManage(null)}>
          <div className="rules-modal-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <button className="rules-modal-close" onClick={() => setShowManage(null)}>✕</button>
            <h3 style={{ marginBottom: '4px' }}>⚙️ Manage: {leagues[showManage]?.name}</h3>
            <CompBadge compId={leagues[showManage]?.competitionId || 'wc2026'} style={{ marginBottom: '16px' }} />
            {manageMsg && <div style={{ padding: '6px 10px', borderRadius: '6px', marginBottom: '10px', fontSize: '0.82rem', background: manageMsg.startsWith('❌') ? 'rgba(255,50,50,0.1)' : 'rgba(0,255,136,0.1)', color: manageMsg.startsWith('❌') ? '#ff5555' : 'var(--primary)' }}>{manageMsg}</div>}

            {/* League Settings */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '8px' }}>📝 League Settings</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>League Name</label>
                  <input className="input-glass" defaultValue={leagues[showManage]?.name || ''} id="manage-name" style={{ fontSize: '0.85rem' }} />
                </div>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>Description</label>
                  <input className="input-glass" defaultValue={leagues[showManage]?.description || ''} id="manage-desc" style={{ fontSize: '0.85rem' }} />
                </div>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>🔑 Password (empty = approval required)</label>
                  <input className="input-glass" type="text" placeholder="No password set" value={managePassword} onChange={e => setManagePassword(e.target.value)} style={{ fontSize: '0.85rem' }} />
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '80px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>💰 Entry Fee</label>
                    <input className="input-glass" type="number" min="0" step="0.5" value={manageFee} onChange={e => setManageFee(e.target.value)} style={{ fontSize: '0.85rem' }} />
                  </div>
                  <div style={{ width: '80px' }}>
                    <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>Currency</label>
                    <select className="input-glass" value={manageCurrency} onChange={e => setManageCurrency(e.target.value)} style={{ fontSize: '0.85rem' }}>
                      <option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option><option value="BAM">BAM</option><option value="HRK">HRK</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>🏆 Prize Split % (comma separated)</label>
                  <input className="input-glass" placeholder="100 or 50,30,20" value={managePrizes} onChange={e => setManagePrizes(e.target.value)} style={{ fontSize: '0.85rem' }} />
                </div>
                <button onClick={async () => {
                  const nameEl = document.getElementById('manage-name');
                  const descEl = document.getElementById('manage-desc');
                  const fee = parseFloat(manageFee) || 0;
                  const splits = managePrizes.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                  const dist = {};
                  splits.forEach((p, i) => { dist[i + 1] = p; });

                  await update(ref(database, `wc2026/leagues/${showManage}`), {
                    name: nameEl?.value?.trim() || leagues[showManage]?.name,
                    description: descEl?.value?.trim() || '',
                    password: managePassword.trim() || null,
                    entryFee: fee,
                    currency: manageCurrency,
                    prizeDistribution: dist,
                  });
                  setManageMsg('✅ Settings saved!');
                  setTimeout(() => setManageMsg(''), 3000);
                }} className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.82rem' }}>💾 Save Settings</button>
              </div>
            </div>

            {/* Budget & Prize Pool Display */}
            {leagues[showManage]?.entryFee > 0 && (() => {
              const pp = calcPrizePool(leagues[showManage]);
              if (!pp) return null;
              const memberCount = leagues[showManage]?.members ? Object.keys(leagues[showManage].members).length : 0;
              const dist = leagues[showManage]?.prizeDistribution || {};
              return (
                <div style={{ marginBottom: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
                  <h4 style={{ fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '8px' }}>💰 Budget & Prize Pool</h4>
                  <div className="glass-card" style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', marginBottom: '10px' }}>
                      <div style={{ padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Entry Fee</div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{leagues[showManage].entryFee} {pp.currency}</div>
                      </div>
                      <div style={{ padding: '6px', background: 'rgba(0,255,136,0.05)', borderRadius: '6px' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Net Prize Pool</div>
                        <div style={{ fontWeight: 'bold', color: 'var(--primary)', fontSize: '0.85rem' }}>{pp.net.toFixed(2)} {pp.currency}</div>
                      </div>
                      <div style={{ padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Paid Status</div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{pp.paidCount} / {memberCount}</div>
                      </div>
                    </div>
                    {/* Prize Splits Distribution */}
                    {Object.keys(dist).length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>Prize Distribution:</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {Object.entries(dist).map(([pos, pct]) => {
                            const amount = (pp.net * pct / 100).toFixed(2);
                            return (
                              <div key={pos} style={{ flex: '1', minWidth: '80px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', padding: '6px', borderRadius: '6px', fontSize: '0.75rem', textAlign: 'center' }}>
                                <div style={{ fontWeight: 'bold', color: pos === '1' ? 'gold' : pos === '2' ? 'silver' : '#cd7f32' }}>
                                  {pos === '1' ? '🥇 1st' : pos === '2' ? '🥈 2nd' : pos === '3' ? '🥉 3rd' : `${pos}th`} ({pct}%)
                                </div>
                                <div style={{ color: 'var(--primary)', fontWeight: 'bold', marginTop: '2px' }}>{amount} {pp.currency}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Members Management */}
            <div style={{ marginBottom: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '8px' }}>👥 Members ({leagues[showManage]?.members ? Object.keys(leagues[showManage].members).length : 0})</h4>
              
              {/* Current members with remove and payment toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {leagues[showManage]?.members && Object.keys(leagues[showManage].members).map(mUid => {
                  const u = users[mUid];
                  if (!u) return null;
                  const isOwner = mUid === leagues[showManage].createdBy;
                  const isPaid = leagues[showManage]?.payments?.[mUid]?.status === 'confirmed';
                  const entryFee = leagues[showManage]?.entryFee || 0;
                  const hasFee = entryFee > 0;
                  
                  return (
                    <div key={mUid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--glass-border)', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', flex: 1, minWidth: '150px' }}>
                        <span>{u.flag || '🌍'}</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{u.displayName || u.email} {isOwner && <span style={{ fontSize: '0.65rem', color: 'var(--primary)' }}>👑 Creator</span>}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{u.email}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {hasFee && (
                          <button
                            onClick={() => isPaid ? handleUnconfirmPayment(showManage, mUid) : handleConfirmPayment(showManage, mUid)}
                            style={{
                              background: isPaid ? 'rgba(0,255,136,0.15)' : 'rgba(255,184,0,0.15)',
                              color: isPaid ? 'var(--primary)' : '#FFB800',
                              border: isPaid ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,184,0,0.3)',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title={isPaid ? "Click to set as unpaid" : "Click to set as paid"}
                          >
                            {isPaid ? '✅ Paid' : '💸 Unpaid'}
                          </button>
                        )}
                        {!isOwner && (
                          <button onClick={() => handleRemoveMember(showManage, mUid)} style={{ background: 'rgba(255,50,50,0.15)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer' }}>✕ Remove</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add member dropdown selection */}
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>➕ Add a registered user</label>
                <select
                  className="input-glass"
                  value=""
                  onChange={async (e) => {
                    const selectUid = e.target.value;
                    if (!selectUid) return;
                    const u = users[selectUid];
                    await set(ref(database, `wc2026/leagues/${showManage}/members/${selectUid}`), true);
                    setManageMsg(`✅ Added ${u.displayName || u.email}`);
                    setTimeout(() => setManageMsg(''), 3000);
                  }}
                  style={{ fontSize: '0.85rem', width: '100%', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: 'var(--text-main)', borderRadius: '8px' }}
                >
                  <option value="" style={{ background: '#111', color: '#888' }}>-- Select a user to add instantly --</option>
                  {Object.entries(users)
                    .filter(([uid2]) => !leagues[showManage]?.members?.[uid2])
                    .sort((a, b) => (a[1].displayName || a[1].email || '').localeCompare(b[1].displayName || b[1].email || ''))
                    .map(([uid2, u]) => (
                      <option key={uid2} value={uid2} style={{ background: '#111', color: 'var(--text-main)' }}>
                        {u.flag || '🌍'} {u.displayName || u.email} ({u.email})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Pending Requests */}
            {leagues[showManage]?.joinRequests && Object.keys(leagues[showManage].joinRequests).length > 0 && (
              <div style={{ marginBottom: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
                <h4 style={{ fontSize: '0.85rem', color: '#FFB800', marginBottom: '8px' }}>📩 Pending Requests ({Object.keys(leagues[showManage].joinRequests).length})</h4>
                {Object.entries(leagues[showManage].joinRequests).map(([reqUid, req]) => (
                  <div key={reqUid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem' }}>{users[reqUid]?.flag || '🌍'} {req.displayName || users[reqUid]?.displayName || 'Unknown'}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => handleAcceptRequest(showManage, reqUid)} style={{ background: 'rgba(0,255,136,0.15)', color: 'var(--primary)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: '6px', padding: '3px 10px', fontSize: '0.72rem', cursor: 'pointer' }}>✅</button>
                      <button onClick={() => handleDenyRequest(showManage, reqUid)} style={{ background: 'rgba(255,50,50,0.15)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '6px', padding: '3px 10px', fontSize: '0.72rem', cursor: 'pointer' }}>❌</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Mini Leaderboard */}
            <div style={{ marginBottom: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '8px' }}>🏆 League Leaderboard</h4>
              {(() => {
                const memberUids = leagues[showManage]?.members ? Object.keys(leagues[showManage].members) : [];
                // Build leaderboard from user data
                const board = memberUids
                  .map(mUid => {
                    const u = users[mUid] || {};
                    const cu = compUsers[mUid] || {};
                    const points = leagues[showManage]?.competitionId === 'wc2026'
                      ? (u.totalPoints || 0)
                      : (cu.totalPoints || 0);
                    const exact = leagues[showManage]?.competitionId === 'wc2026'
                      ? (u.exactScores || 0)
                      : (cu.exactScores || 0);
                    return {
                      uid: mUid,
                      name: u.displayName || u.email || 'Unknown',
                      flag: u.flag || '🌍',
                      points,
                      exact,
                      hidden: u.hidden === true,
                    };
                  })
                  .filter(p => !p.hidden || p.uid === currentUser?.uid)
                  .sort((a, b) => b.points - a.points || b.exact - a.exact);
                
                return board.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>No members yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {board.map((p, i) => (
                      <div key={p.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: i === 0 ? 'rgba(255,215,0,0.06)' : 'rgba(255,255,255,0.02)', borderRadius: '6px', border: i === 0 ? '1px solid rgba(255,215,0,0.15)' : '1px solid transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                          <span style={{ width: '18px', textAlign: 'center', fontWeight: 'bold', color: i === 0 ? 'gold' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'var(--text-muted)', fontSize: '0.78rem' }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                          </span>
                          {p.flag} {p.name}
                          {p.hidden && isAdmin && <span style={{ marginLeft: '6px', fontSize: '0.78rem', color: '#ff5555' }} title="Hidden from other users">👻</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--primary)', fontWeight: 'bold', fontSize: '0.85rem' }}>{p.points}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>({p.exact}✓)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Delete */}
            <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
              <button onClick={() => handleDeleteLeague(showManage)} style={{ background: 'rgba(255,50,50,0.1)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.2)', borderRadius: '8px', padding: '10px', width: '100%', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>🗑️ Delete League</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
