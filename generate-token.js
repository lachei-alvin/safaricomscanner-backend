const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const crypto = require('crypto');

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

const duration = process.argv[2] ?? '7days';
const count = parseInt(process.argv[3] ?? '1');

const daysMap = {'1day': 1, '7days': 7, '30days': 30};

async function generateTokens() {
  if (!daysMap[duration]) {
    console.error('Usage: node generate-token.js [1day|7days|30days] [count]');
    process.exit(1);
  }

  const tokens = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    await db.collection('tokens').doc(code).set({
      code,
      duration,
      daysGranted: daysMap[duration],
      used: false,
      createdAt: Date.now(),
    });
    tokens.push(code);
  }

  console.log(`Generated ${count} token(s) for ${duration}:`);
  tokens.forEach(t => console.log(` → ${t}`));
  process.exit(0);
}

generateTokens().catch(console.error);
