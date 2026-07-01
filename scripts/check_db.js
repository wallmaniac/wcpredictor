/* eslint-disable no-undef */
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
  
  const wcStats = await get(ref(db, 'wc2026/statistics'));
  console.log('wc2026/statistics exists:', wcStats.exists());
  if (wcStats.exists()) {
    console.log('wc2026/statistics val:', wcStats.val());
  }

  const plStats = await get(ref(db, 'pl2526/statistics'));
  console.log('pl2526/statistics exists:', plStats.exists());

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
