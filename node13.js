// routes/chat.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get chat list
router.get('/chats', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  
  try {
    const followingSnap = await db.ref(`following/${userId}`).once('value');
    const following = followingSnap.val() || {};
    const chatPartners = [];
    
    for (const partnerId of Object.keys(following)) {
      const userSnap = await db.ref(`users/${partnerId}`).once('value');
      if (userSnap.exists()) {
        const chatId = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
        const messagesSnap = await db.ref(`messages/${chatId}`).once('value');
        const messages = messagesSnap.val() || {};
        const lastMessage = Object.values(messages).sort((a, b) => b.timestamp - a.timestamp)[0];
        
        // Get unread count
        const lastReadSnap = await db.ref(`userLastRead/${userId}/${chatId}`).once('value');
        const lastRead = lastReadSnap.val() || 0;
        const unreadCount = Object.values(messages).filter(m => m.from !== userId && m.timestamp > lastRead).length;
        
        chatPartners.push({
          uid: partnerId,
          ...userSnap.val(),
          lastMessage: lastMessage || null,
          unreadCount,
        });
      }
    }
    
    chatPartners.sort((a, b) => {
      if (!a.lastMessage) return 1;
      if (!b.lastMessage) return -1;
      return b.lastMessage.timestamp - a.lastMessage.timestamp;
    });
    
    res.json(chatPartners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat messages
router.get('/messages/:partnerId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { partnerId } = req.params;
  
  try {
    const chatId = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
    const messagesSnap = await db.ref(`messages/${chatId}`).once('value');
    const messages = messagesSnap.val() || {};
    
    const messageList = Object.entries(messages).map(([id, msg]) => ({
      id,
      ...msg,
      isOwn: msg.from === userId,
    })).sort((a, b) => a.timestamp - b.timestamp);
    
    res.json(messageList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message
router.post('/messages/:partnerId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { partnerId } = req.params;
  const { text, image, postId } = req.body;
  
  if (!text && !image) {
    return res.status(400).json({ error: 'Message text or image required' });
  }
  
  try {
    const chatId = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
    const message = {
      from: userId,
      text: text || null,
      image: image || null,
      postId: postId || null,
      timestamp: Date.now(),
      read: false,
    };
    
    const msgRef = await db.ref(`messages/${chatId}`).push(message);
    const io = req.app.get('io');
    
    io.to(`user_${partnerId}`).emit('new_message', {
      id: msgRef.key,
      ...message,
      chatId,
    });
    
    res.json({ id: msgRef.key, ...message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark messages as read
router.post('/read/:partnerId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { partnerId } = req.params;
  
  try {
    const chatId = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
    await db.ref(`userLastRead/${userId}/${chatId}`).set(Date.now());
    
    // Mark individual messages as read
    const messagesSnap = await db.ref(`messages/${chatId}`).once('value');
    const messages = messagesSnap.val() || {};
    const updates = {};
    
    for (const [msgId, msg] of Object.entries(messages)) {
      if (msg.from !== userId && !msg.read) {
        updates[`messages/${chatId}/${msgId}/read`] = true;
      }
    }
    
    if (Object.keys(updates).length) {
      await db.ref().update(updates);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear chat
router.delete('/clear/:partnerId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { partnerId } = req.params;
  
  try {
    const chatId = userId < partnerId ? `${userId}_${partnerId}` : `${partnerId}_${userId}`;
    await db.ref(`messages/${chatId}`).remove();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Block user
router.post('/block/:userId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const currentUserId = req.userId;
  const { userId } = req.params;
  
  try {
    await db.ref(`blocked/${currentUserId}/${userId}`).set(true);
    await db.ref(`following/${currentUserId}/${userId}`).remove();
    res.json({ blocked: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unblock user
router.delete('/block/:userId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const currentUserId = req.userId;
  const { userId } = req.params;
  
  try {
    await db.ref(`blocked/${currentUserId}/${userId}`).remove();
    res.json({ blocked: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;