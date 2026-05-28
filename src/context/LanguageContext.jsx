/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { t as translate, translateTeam, translateStage } from '../utils/translations';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('wc2026_lang') || 'en');

  useEffect(() => {
    localStorage.setItem('wc2026_lang', lang);
  }, [lang]);

  const toggleLang = () => setLang(prev => prev === 'en' ? 'hr' : 'en');
  const t = (key) => translate(lang, key);
  const tt = (teamName) => translateTeam(lang, teamName);
  const ts = (stage) => translateStage(lang, stage);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t, tt, ts }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageSwitcher() {
  const { lang, toggleLang } = useLanguage();
  return (
    <button
      onClick={toggleLang}
      title={lang === 'en' ? "Switch to Croatian" : "Switch to English"}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '20px',
        cursor: 'pointer',
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.3s ease',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
    >
      <img
        src={lang === 'en' ? "https://flagcdn.com/w40/gb.png" : "https://flagcdn.com/w40/hr.png"}
        alt={lang}
        style={{ width: '22px', borderRadius: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
      />
      <span style={{ color: '#fff', fontWeight: '700', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {lang}
      </span>
    </button>
  );
}
