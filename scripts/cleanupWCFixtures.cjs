// Clear stale WC statistics (old 2022 data)
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, remove, get } = require('firebase/database');

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
  console.log('🔐 Signing in as admin...');
  await signInWithEmailAndPassword(auth, 'admin@wc2026.com', 'admin1');
  console.log('✅ Signed in\n');

  // Clear stale WC stats (2022 data)
  const statsSnap = await get(ref(db, 'wc2026/statistics'));
  if (statsSnap.exists()) {
    console.log('🗑️ Removing stale wc2026/statistics (old 2022 data)...');
    await remove(ref(db, 'wc2026/statistics'));
    console.log('✅ Cleared');
  } else {
    console.log('ℹ️ wc2026/statistics already clean');
  }

  // Clear stale WC standings
  const standSnap = await get(ref(db, 'wc2026/standings'));
  if (standSnap.exists()) {
    console.log('🗑️ Removing stale wc2026/standings...');
    await remove(ref(db, 'wc2026/standings'));
    console.log('✅ Cleared');
  } else {
    console.log('ℹ️ wc2026/standings already clean');
  }

  console.log('\n🎉 Done! Stale WC 2022 data cleared.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
