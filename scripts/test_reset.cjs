const { initializeApp } = require('firebase/app');
const { getAuth, sendPasswordResetEmail } = require('firebase/auth');

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
  console.log("Sending password reset email to zzidar1111@gmail.com...");
  await sendPasswordResetEmail(auth, 'zzidar1111@gmail.com');
  console.log("Success! Password reset email sent.");
  process.exit(0);
}

main().catch(err => {
  console.error("Failed to send password reset email:", err);
  process.exit(1);
});
