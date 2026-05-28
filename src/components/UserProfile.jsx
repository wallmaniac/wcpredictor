import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { database } from '../config/firebase';
import { ref, get, update } from 'firebase/database';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { TIMEZONE_LIST, formatTZLabel } from '../utils/timezones';

const FLAGS = [
  { code: 'HR', flag: '🇭🇷', name: 'Croatia' }, { code: 'BA', flag: '🇧🇦', name: 'Bosnia and Herzegovina' },
  { code: 'RS', flag: '🇷🇸', name: 'Serbia' }, { code: 'SI', flag: '🇸🇮', name: 'Slovenia' },
  { code: 'ME', flag: '🇲🇪', name: 'Montenegro' }, { code: 'MK', flag: '🇲🇰', name: 'North Macedonia' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' }, { code: 'FR', flag: '🇫🇷', name: 'France' },
  { code: 'ES', flag: '🇪🇸', name: 'Spain' }, { code: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: 'PT', flag: '🇵🇹', name: 'Portugal' }, { code: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' }, { code: 'BE', flag: '🇧🇪', name: 'Belgium' },
  { code: 'AT', flag: '🇦🇹', name: 'Austria' }, { code: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: 'SE', flag: '🇸🇪', name: 'Sweden' }, { code: 'NO', flag: '🇳🇴', name: 'Norway' },
  { code: 'DK', flag: '🇩🇰', name: 'Denmark' }, { code: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: 'CZ', flag: '🇨🇿', name: 'Czech Republic' }, { code: 'GR', flag: '🇬🇷', name: 'Greece' },
  { code: 'TR', flag: '🇹🇷', name: 'Turkey' }, { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' }, { code: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: 'BR', flag: '🇧🇷', name: 'Brazil' }, { code: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' }, { code: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: 'KR', flag: '🇰🇷', name: 'South Korea' }, { code: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
].sort((a, b) => a.name.localeCompare(b.name));

export default function UserProfile() {
  const { currentUser } = useAuth();
  const { t } = useLanguage();
  const [profile, setProfile] = useState({});
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [country, setCountry] = useState('');
  const [flag, setFlag] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [msg, setMsg] = useState('');
  const [passMsg, setPassMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    get(ref(database, `wc2026/users/${currentUser.uid}`)).then(snap => {
      if (snap.exists()) {
        const data = snap.val();
        setProfile(data);
        setDisplayName(data.displayName || '');
        setTimezone(data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
        setCountry(data.country || '');
        setFlag(data.flag || '🌍');
      }
    });
  }, [currentUser]);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000); };
  const showPassMsg = (m) => { setPassMsg(m); setTimeout(() => setPassMsg(''), 4000); };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await update(ref(database, `wc2026/users/${currentUser.uid}`), {
        displayName: displayName.trim(),
        timezone,
        country,
        flag,
      });
      showMsg('✅ ' + t('profileUpdated'));
    } catch (e) {
      showMsg('❌ ' + e.message);
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (!currentPass || !newPass) return showPassMsg('❌ ' + t('fillAllPasswordFields'));
    if (newPass !== confirmPass) return showPassMsg('❌ ' + t('passwordsDontMatch'));
    if (newPass.length < 6) return showPassMsg('❌ ' + t('passwordTooShort'));
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPass);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPass);
      setCurrentPass(''); setNewPass(''); setConfirmPass('');
      showPassMsg('✅ ' + t('passwordChanged'));
    } catch (e) {
      showPassMsg('❌ ' + (e.code === 'auth/wrong-password' ? t('currentPasswordIncorrect') : e.message));
    }
  };

  const handleCountryChange = (code) => {
    const entry = FLAGS.find(f => f.code === code);
    if (entry) {
      setFlag(entry.flag);
      setCountry(entry.name);
    }
  };

  const memberSince = profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A';
  const currentFlag = FLAGS.find(f => f.flag === flag);

  return (
    <div>
      <h2 style={{ marginBottom: '20px' }}>👤 {t('myProfile')}</h2>

      {/* Profile Info */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), #00d4ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
            {flag || '👤'}
          </div>
          <div>
            <h3 style={{ marginBottom: '2px' }}>{displayName || currentUser?.email}</h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{currentUser?.email}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              📅 {t('memberSince')}: {memberSince}
              {profile.role && <span style={{ marginLeft: '10px', color: profile.role === 'admin' || profile.role === 'superadmin' ? 'var(--primary)' : 'var(--text-muted)' }}>
                {profile.role === 'superadmin' ? `👑 ${t('superadmin')}` : profile.role === 'admin' ? `🔧 ${t('admin')}` : `👤 ${t('player')}`}
              </span>}
            </div>
          </div>
        </div>

        {msg && <div style={{ padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem', background: msg.startsWith('✅') ? 'rgba(0,255,136,0.1)' : 'rgba(255,50,50,0.1)', color: msg.startsWith('✅') ? 'var(--primary)' : '#ff5555' }}>{msg}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '5px', display: 'block' }}>📛 {t('displayName')}</label>
            <input className="input-glass" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={t('displayName')} />
          </div>

          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '5px', display: 'block' }}>🏳️ {t('countryFlag')}</label>
            <select className="input-glass" value={currentFlag?.code || ''} onChange={e => handleCountryChange(e.target.value)}>
              <option value="">🌍 {t('selectCountry')}...</option>
              {FLAGS.map(f => (
                <option key={f.code} value={f.code}>{f.flag} {f.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '5px', display: 'block' }}>🕐 {t('timezone')}</label>
            <select className="input-glass" value={timezone} onChange={e => setTimezone(e.target.value)}>
              {TIMEZONE_LIST.map(tz => (
                <option key={tz.value} value={tz.value}>{formatTZLabel(tz.value)}</option>
              ))}
            </select>
          </div>

          <button onClick={handleSaveProfile} className="btn-primary" disabled={saving}
            style={{ padding: '10px 20px', width: '100%' }}>
            {saving ? t('saving') : `💾 ${t('saveProfile')}`}
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '15px' }}>
        <h3 style={{ marginBottom: '15px', fontSize: '0.95rem' }}>🔑 {t('changePassword')}</h3>
        {passMsg && <div style={{ padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem', background: passMsg.startsWith('✅') ? 'rgba(0,255,136,0.1)' : 'rgba(255,50,50,0.1)', color: passMsg.startsWith('✅') ? 'var(--primary)' : '#ff5555' }}>{passMsg}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input className="input-glass" type="password" placeholder={t('currentPassword')} value={currentPass} onChange={e => setCurrentPass(e.target.value)} />
          <input className="input-glass" type="password" placeholder={t('newPasswordMin')} value={newPass} onChange={e => setNewPass(e.target.value)} />
          <input className="input-glass" type="password" placeholder={t('confirmNewPassword')} value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
          <button onClick={handleChangePassword} className="btn-primary" style={{ padding: '10px 20px', width: '100%' }}>
            🔑 {t('changePassword')}
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <h3 style={{ marginBottom: '15px', fontSize: '0.95rem' }}>📊 {t('myStats')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px' }}>
          <div style={{ background: 'rgba(0,255,136,0.05)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>{profile.totalPoints || 0}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('totalPoints')}</div>
          </div>
          <div style={{ background: 'rgba(255,215,0,0.05)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'gold' }}>{profile.exactScores || 0}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('exactScore')}</div>
          </div>
          <div style={{ background: 'rgba(0,200,255,0.05)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00d4ff' }}>{profile.correctOutcomes || 0}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('correctOutcomes')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
