const { signInWithEmailAndPassword } = require('firebase/auth');

async function main() {
  console.log('Importing firebase config...');
  const { auth } = await import('../src/config/firebase.js');
  
  await signInWithEmailAndPassword(auth, 'admin@wc2026.com', 'admin1');
  console.log('✅ Signed in successfully.\n');

  console.log('Importing liveScoreService...');
  const { recalculateAllPoints } = await import('../src/services/liveScoreService.js');
  
  console.log('Recalculating all points for wc2026...');
  await recalculateAllPoints('wc2026');
  console.log('✅ Recalculation complete!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
