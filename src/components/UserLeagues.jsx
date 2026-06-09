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
    .filter(([, l]) => l.members?.[uid] && matchesFilter(l))
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
        const memberCount = league.members ? Object.keys(league.members).length : 0;
        const pendingCount = league.joinRequests ? Object.keys(league.joinRequests).length : 0;
        const leagueComp = league.competitionId || 'wc2026';
        return (
          <div key={lid} className="glass-card" style={{ ...cs, border: isCreator ? '1px solid rgba(0,255,136,0.15)' : undefined, cursor: 'pointer' }}
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
                {isCreator && (
                  <button onClick={(e) => { e.stopPropagation(); setShowManage(lid); setManagePassword(league.password || ''); setManageMsg(''); }} className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.72rem' }}>⚙️ Manage</button>
                )}
                {!isCreator && (
                  <button onClick={(e) => { e.stopPropagation(); handleLeave(lid); }} className="btn-outline" style={{ padding: '4px 10px', fontSize: '0.72rem', borderColor: 'rgba(255,50,50,0.3)', color: '#ff5555' }}>🚪 Leave</button>
                )}
              </div>
            </div>

            {/* Pending requests (visible to creator) */}
            {isCreator && pendingCount > 0 && (
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
                    {isCreator && !isOwner && (
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
                <button onClick={async () => {
                  const nameEl = document.getElementById('manage-name');
                  const descEl = document.getElementById('manage-desc');
                  await update(ref(database, `wc2026/leagues/${showManage}`), {
                    name: nameEl?.value?.trim() || leagues[showManage]?.name,
                    description: descEl?.value?.trim() || '',
                    password: managePassword.trim() || null,
                  });
                  setManageMsg('✅ Settings saved!');
                  setTimeout(() => setManageMsg(''), 3000);
                }} className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.82rem' }}>💾 Save Settings</button>
              </div>
            </div>

            {/* Members Management */}
            <div style={{ marginBottom: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '14px' }}>
              <h4 style={{ fontSize: '0.85rem', color: 'var(--primary)', marginBottom: '8px' }}>👥 Members ({leagues[showManage]?.members ? Object.keys(leagues[showManage].members).length : 0})</h4>
              
              {/* Current members with remove */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' }}>
                {leagues[showManage]?.members && Object.keys(leagues[showManage].members).map(mUid => {
                  const u = users[mUid];
                  if (!u) return null;
                  const isOwner = mUid === leagues[showManage].createdBy;
                  return (
                    <div key={mUid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                        {u.flag || '🌍'} {u.displayName || u.email}
                        {isOwner && <span style={{ fontSize: '0.6rem', color: 'var(--primary)' }}>👑 Creator</span>}
                      </div>
                      {!isOwner && (
                        <button onClick={() => handleRemoveMember(showManage, mUid)} style={{ background: 'rgba(255,50,50,0.15)', color: '#ff5555', border: '1px solid rgba(255,50,50,0.3)', borderRadius: '4px', padding: '2px 8px', fontSize: '0.68rem', cursor: 'pointer' }}>✕ Remove</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add member — search-based */}
              <div>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>➕ Add a registered user</label>
                <input
                  className="input-glass"
                  type="text"
                  placeholder="Search by name or email..."
                  autoComplete="off"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  style={{ fontSize: '0.82rem', marginBottom: '4px' }}
                />
                <div style={{ maxHeight: '140px', overflowY: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                  {(() => {
                    const q = removeDiacritics(memberSearch);
                    const nonMembers = Object.entries(users)
                      .filter(([uid2]) => !leagues[showManage]?.members?.[uid2]);
                    const filtered = q.length > 0
                      ? nonMembers.filter(([, u]) =>
                          removeDiacritics(u.displayName || '').includes(q) ||
                          removeDiacritics(u.email || '').includes(q)
                        )
                      : [];
                    if (q.length === 0) return <p style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>Type to search users…</p>;
                    if (filtered.length === 0) return <p style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0 }}>No users found matching "{memberSearch}"</p>;
                    return filtered.slice(0, 20).map(([uid2, u]) => (
                      <button key={uid2} onClick={async () => {
                        await set(ref(database, `wc2026/leagues/${showManage}/members/${uid2}`), true);
                        setManageMsg(`✅ Added ${u.displayName || u.email}`);
                        setMemberSearch('');
                        setTimeout(() => setManageMsg(''), 3000);
                      }} style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '7px 10px', cursor: 'pointer', color: 'var(--text-main)', fontSize: '0.8rem', textAlign: 'left' }}>
                        <span>{u.flag || '🌍'}</span>
                        <span style={{ flex: 1 }}>{u.displayName || u.email}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>{u.email}</span>
                        <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>+</span>
                      </button>
                    ));
                  })()}
                </div>
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
                  .filter(p => !p.hidden || p.uid === currentUser?.uid || isAdmin)
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
