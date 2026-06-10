const { initializeApp } = require('firebase/app');
const { getAuth, createUserWithEmailAndPassword, deleteUser, signInWithEmailAndPassword } = require('firebase/auth');

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

async function main() {
  const email = 'zzidar1111@gmail.com';
  console.log(`Checking if ${email} exists in Firebase Auth...`);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, 'TemporaryPass123!');
    console.log(`RESULT: User ${email} DID NOT exist in Firebase Auth (created successfully).`);
    // Delete it so we don't pollute the Auth database
    await deleteUser(cred.user);
    console.log("Cleanup: Deleted temporary Auth account.");
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      console.log(`RESULT: User ${email} EXISTS in Firebase Auth.`);
    } else {
      console.error("Unexpected error:", err);
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
