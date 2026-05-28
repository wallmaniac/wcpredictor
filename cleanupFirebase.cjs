/**
 * Firebase Database Cleanup Script
 * Deletes afcon2026 data and ensures pl2526 structure exists
 * Run with: node cleanupFirebase.cjs
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, remove, set, get } = require('firebase/database');

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
  try {
    await signInWithEmailAndPassword(auth, 'admin@wc2026.com', 'admin1');
    console.log('✅ Signed in successfully.\n');
  } catch (err) {
    console.error('❌ Login failed:', err.message);
    process.exit(1);
  }

  // 1. Delete afcon2026
  console.log('🗑️  Deleting /afcon2026 ...');
  try {
    const afconSnap = await get(ref(db, 'afcon2026'));
    if (afconSnap.exists()) {
      await remove(ref(db, 'afcon2026'));
      console.log('✅ /afcon2026 deleted successfully.');
    } else {
      console.log('ℹ️  /afcon2026 does not exist (already clean).');
    }
  } catch (err) {
    console.error('❌ Failed to delete /afcon2026:', err.message);
  }

  // 2. Ensure pl2526 structure exists
  console.log('\n📋 Checking /pl2526 structure...');
  try {
    const plSnap = await get(ref(db, 'pl2526'));
    if (!plSnap.exists()) {
      console.log('   Creating /pl2526 base structure...');
      await set(ref(db, 'pl2526/metadata'), {
        competition: 'Premier League 2025/26',
        createdAt: Date.now()
      });
      console.log('✅ /pl2526 structure created.');
    } else {
      console.log('✅ /pl2526 already exists.');
      const data = plSnap.val();
      console.log('   Keys:', Object.keys(data).join(', '));
    }
  } catch (err) {
    console.error('❌ Failed to create /pl2526:', err.message);
  }

  // 3. Check wc2026 structure
  console.log('\n📋 Checking /wc2026 structure...');
  try {
    const wcSnap = await get(ref(db, 'wc2026'));
    if (wcSnap.exists()) {
      const data = wcSnap.val();
      console.log('✅ /wc2026 exists. Keys:', Object.keys(data).join(', '));
      if (data.users) console.log('   Users:', Object.keys(data.users).length);
      if (data.leagues) console.log('   Leagues:', Object.keys(data.leagues).length);
    }
  } catch (err) {
    console.error('❌ Error checking /wc2026:', err.message);
  }

  // 4. List all root-level keys
  console.log('\n📊 Database root structure:');
  try {
    // We can't easily list root keys without reading everything,
    // so let's check specific known paths
    for (const path of ['wc2026', 'pl2526', 'afcon2026', 'admins']) {
      const snap = await get(ref(db, path));
      console.log(`   /${path}: ${snap.exists() ? '✅ exists' : '❌ does not exist'}`);
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  console.log('\n🎉 Database cleanup complete!');
  process.exit(0);
}

main();
