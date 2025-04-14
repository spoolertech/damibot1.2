const admin = require('firebase-admin');
const path = process.env.FIREBASE_KEY_PATH;

const serviceAccount = require(path);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();
module.exports = db;
