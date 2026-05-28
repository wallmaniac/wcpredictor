const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, get } = require('firebase/database');

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

async function main() {
  await signInWithEmailAndPassword(auth, 'admin@wc2026.com', 'admin1');
  console.log('✅ Signed in successfully.\n');

  console.log('--- WC2026 Users Global Picks ---');
  const wcUsersSnap = await get(ref(db, 'wc2026/users'));
  if (wcUsersSnap.exists()) {
    const users = wcUsersSnap.val();
    Object.entries(users).forEach(([uid, u]) => {
      console.log(`User: ${u.displayName || u.email} (${uid})`);
      console.log(`  globalPicksLocked:`, u.globalPicksLocked);
      console.log(`  globalPicks:`, u.globalPicks);
    });
  }

  console.log('\n--- PL2526 Users Global Picks ---');
  const plUsersSnap = await get(ref(db, 'pl2526/users'));
  if (plUsersSnap.exists()) {
    const users = plUsersSnap.val();
    Object.entries(users).forEach(([uid, u]) => {
      console.log(`User ID: ${uid}`);
      console.log(`  globalPicksLocked:`, u.globalPicksLocked);
      console.log(`  globalPicks:`, u.globalPicks);
    });
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
