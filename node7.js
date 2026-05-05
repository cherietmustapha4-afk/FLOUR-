// routes/auth.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  
  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });
    
    const db = req.app.get('db');
    await db.ref(`users/${userRecord.uid}`).set({
      name: name,
      email: email,
      photoURL: null,
      bio: '',
      createdAt: Date.now(),
    });
    
    // Create default settings
    await db.ref(`userSettings/${userRecord.uid}`).set({
      privateAccount: false,
      showInSearch: true,
      readReceipts: true,
      typingIndicators: true,
      likeNotif: true,
      commentNotif: true,
      followNotif: true,
      commentPermission: 'everyone',
    });
    
    const customToken = await admin.auth().createCustomToken(userRecord.uid);
    res.json({ token: customToken, user: { uid: userRecord.uid, email, name } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/login', async (req, res) => {
  const { idToken } = req.body;
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const db = req.app.get('db');
    const userSnap = await db.ref(`users/${decodedToken.uid}`).once('value');
    const userData = userSnap.val();
    
    res.json({
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: userData?.name || decodedToken.name,
        photoURL: userData?.photoURL || null,
        bio: userData?.bio || '',
      }
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;