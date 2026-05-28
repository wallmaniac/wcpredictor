/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';

/**
 * Competition Context
 * Manages which competition the user is viewing: 'wc2026' or 'pl2526'
 * Each competition has its own Firebase paths, match data, and display config.
 */

export const COMPETITIONS = {
  wc2026: {
    id: 'wc2026',
    name: 'World Cup 2026',
    shortName: 'WC 2026',
    nameHR: 'SP 2026',
    icon: '🏆',
    apiLeague: 1,
    apiSeason: 2026,
    firebasePath: 'wc2026',
    hasGroups: true,
    hasGlobalPicks: true,
    phases: ['Group Stage', 'Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Third Place', 'Final'],
  },
  pl2526: {
    id: 'pl2526',
    name: 'Premier League 25/26',
    shortName: 'PL 25/26',
    nameHR: 'Premier Liga 25/26',
    icon: '⚽',
    apiLeague: 39,
    apiSeason: 2025,
    firebasePath: 'pl2526',
    hasGroups: false,
    hasGlobalPicks: true,
    phases: ['Matchday 37', 'Matchday 38'],
  }
};

const CompetitionContext = createContext();

export function CompetitionProvider({ children }) {
  const [compId, setCompId] = useState(() => localStorage.getItem('wc2026_comp') || 'wc2026');

  useEffect(() => {
    localStorage.setItem('wc2026_comp', compId);
  }, [compId]);

  const competition = COMPETITIONS[compId];
  const switchCompetition = (id) => { if (COMPETITIONS[id]) setCompId(id); };

  return (
    <CompetitionContext.Provider value={{ competition, compId, switchCompetition, COMPETITIONS }}>
      {children}
    </CompetitionContext.Provider>
  );
}

export function useCompetition() {
  return useContext(CompetitionContext);
}
