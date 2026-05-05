// routes/notifications.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get notifications
router.get('/', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  
  try {
    const notifSnap = await db.ref(`notifications/${userId}`).once('value');
    const notifications = notifSnap.val() || {};
    
    const notifList = [];
    for (const [id, notif] of Object.entries(notifications)) {
      const fromUserSnap = await db.ref(`users/${notif.fromId}`).once('value');
      notifList.push({
        id,
        ...notif,
        fromUser: fromUserSnap.val() || { name: 'Someone' },
      });
    }
    
    notifList.sort((a, b) => b.createdAt - a.createdAt);
    res.json(notifList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.post('/:notifId/read', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { notifId } = req.params;
  
  try {
    await db.ref(`notifications/${userId}/${notifId}/read`).set(true);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all as read
router.post('/read-all', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  
  try {
    const notifSnap = await db.ref(`notifications/${userId}`).once('value');
    const notifications = notifSnap.val() || {};
    const updates = {};
    
    for (const id of Object.keys(notifications)) {
      updates[`notifications/${userId}/${id}/read`] = true;
    }
    
    if (Object.keys(updates).length) {
      await db.ref().update(updates);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread count
router.get('/unread/count', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  
  try {
    const notifSnap = await db.ref(`notifications/${userId}`).once('value');
    const notifications = notifSnap.val() || {};
    const unreadCount = Object.values(notifications).filter(n => !n.read).length;
    res.json({ count: unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;