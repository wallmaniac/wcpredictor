/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useState, useEffect } from 'react';
import { auth, database } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, get, update } from 'firebase/database';

// The superadmin email - has full control over everything
const SUPERADMIN_EMAIL = 'admin@wc2026.com';

export const AuthContext = createContext();

export function useAuth() {
  return React.useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (!user) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setUserProfile(null);
        setLoading(false);
        return;
      }

      const superAdmin = user.email === SUPERADMIN_EMAIL;
      let adminFlag = superAdmin;
      let superAdminFlag = superAdmin;

      // Save/update user profile
      const profileUpdates = { email: user.email };
      if (superAdmin) {
        profileUpdates.role = 'superadmin';
      }
      update(ref(database, `wc2026/users/${user.uid}`), profileUpdates).catch(() => {});

      // Check if user is admin in DB
      try {
        const userSnap = await get(ref(database, `wc2026/users/${user.uid}`));
        if (userSnap.exists()) {
          const data = userSnap.val();
          setUserProfile(data);
          if (data.role === 'admin' || data.role === 'superadmin') {
            adminFlag = true;
          }
          if (data.role === 'superadmin') {
            superAdminFlag = true;
          }
        }
      } catch {
        // Ignore errors during user profile fetch
      }

      // Legacy admin check
      if (!adminFlag) {
        try {
          const adminSnap = await get(ref(database, `admins/${user.uid}`));
          if (adminSnap.exists()) adminFlag = true;
        } catch {
          // Ignore errors during legacy admin check
        }
      }

      setIsSuperAdmin(superAdminFlag);
      setIsAdmin(adminFlag);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, loading, isAdmin, isSuperAdmin, userProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
