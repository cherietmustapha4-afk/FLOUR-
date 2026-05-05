// middleware/auth.js
const admin = require('firebase-admin');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    req.userId = decodedToken.uid;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

module.exports = { authenticateToken };