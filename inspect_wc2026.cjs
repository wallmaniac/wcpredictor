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

  const wcNode = await get(ref(db, 'wc2026'));
  if (wcNode.exists()) {
    console.log('wc2026 keys:', Object.keys(wcNode.val()));
    const val = wcNode.val();
    if (val.statistics !== undefined) {
      console.log('statistics type:', typeof val.statistics, 'val:', val.statistics);
    } else {
      console.log('statistics is undefined');
    }
  } else {
    console.log('wc2026 does not exist');
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
