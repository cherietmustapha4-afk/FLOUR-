// routes/posts.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get feed posts (with scoring algorithm)
router.get('/feed', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  
  try {
    const postsSnap = await db.ref('posts').once('value');
    const posts = [];
    
    for (const [id, post] of Object.entries(postsSnap.val() || {})) {
      // Check privacy settings
      const userSettingsSnap = await db.ref(`userSettings/${post.userId}/privateAccount`).once('value');
      const isPrivate = userSettingsSnap.val() === true;
      
      if (isPrivate && post.userId !== userId) {
        const followingSnap = await db.ref(`followers/${post.userId}/${userId}`).once('value');
        if (!followingSnap.exists()) continue;
      }
      
      posts.push({ id, ...post });
    }
    
    // Get following list for scoring
    const followingSnap = await db.ref(`following/${userId}`).once('value');
    const following = followingSnap.val() || {};
    
    // Calculate scores
    for (const post of posts) {
      const now = Date.now();
      const ageInHours = (now - (post.timestamp || 0)) / (1000 * 60 * 60);
      const recencyScore = Math.max(0, 1 - (ageInHours / 168));
      const engagementScore = Math.min(1, ((post.likeCount || 0) * 0.01) + ((post.commentCount || 0) * 0.02));
      const isFollowing = following[post.userId];
      const relationshipScore = isFollowing ? 0.8 : 0.2;
      
      let interestScore = 0.2;
      if (post.caption) {
        const caps = post.caption.toLowerCase();
        if (caps.includes('love') || caps.includes('art') || caps.includes('beautiful')) interestScore = 0.7;
      }
      
      post.score = (recencyScore * 0.3) + (engagementScore * 0.3) + (relationshipScore * 0.2) + (interestScore * 0.2);
    }
    
    posts.sort((a, b) => b.score - a.score);
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create post
router.post('/', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { images, caption, location } = req.body;
  
  if (!images || images.length === 0) {
    return res.status(400).json({ error: 'At least one image required' });
  }
  
  try {
    const postId = db.ref('posts').push().key;
    const post = {
      id: postId,
      userId,
      images,
      caption: caption || '',
      location: location || null,
      timestamp: Date.now(),
      likeCount: 0,
      commentCount: 0,
      likes: {},
    };
    
    await db.ref(`posts/${postId}`).set(post);
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single post
router.get('/:postId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const { postId } = req.params;
  
  try {
    const postSnap = await db.ref(`posts/${postId}`).once('value');
    if (!postSnap.exists()) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    const post = { id: postId, ...postSnap.val() };
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Like/unlike post
router.post('/:postId/like', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { postId } = req.params;
  
  try {
    const likeRef = db.ref(`posts/${postId}/likes/${userId}`);
    const exists = (await likeRef.get()).exists();
    const io = req.app.get('io');
    
    if (exists) {
      await likeRef.remove();
      await db.ref(`posts/${postId}/likeCount`).transaction(c => (c || 1) - 1);
      res.json({ liked: false });
    } else {
      await likeRef.set(true);
      await db.ref(`posts/${postId}/likeCount`).transaction(c => (c || 0) + 1);
      
      // Get post owner for notification
      const postSnap = await db.ref(`posts/${postId}`).once('value');
      const postOwnerId = postSnap.val().userId;
      
      if (postOwnerId !== userId) {
        const notifSettings = await db.ref(`userSettings/${postOwnerId}/likeNotif`).once('value');
        if (notifSettings.val() !== false) {
          const notification = {
            type: 'like',
            fromId: userId,
            postId: postId,
            read: false,
            createdAt: Date.now(),
          };
          await db.ref(`notifications/${postOwnerId}`).push(notification);
          io.to(`user_${postOwnerId}`).emit('new_notification', notification);
        }
      }
      
      res.json({ liked: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add comment
router.post('/:postId/comments', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { postId } = req.params;
  const { text, image } = req.body;
  
  if (!text && !image) {
    return res.status(400).json({ error: 'Comment text or image required' });
  }
  
  try {
    const userSnap = await db.ref(`users/${userId}`).once('value');
    const user = userSnap.val();
    
    const comment = {
      authorId: userId,
      authorName: user.name,
      authorPhoto: user.photoURL,
      text: text || '',
      image: image || null,
      timestamp: Date.now(),
      likes: {},
    };
    
    const commentRef = await db.ref(`comments/${postId}`).push(comment);
    await db.ref(`posts/${postId}/commentCount`).transaction(c => (c || 0) + 1);
    
    // Send notification
    const postSnap = await db.ref(`posts/${postId}`).once('value');
    const postOwnerId = postSnap.val().userId;
    
    if (postOwnerId !== userId) {
      const notifSettings = await db.ref(`userSettings/${postOwnerId}/commentNotif`).once('value');
      if (notifSettings.val() !== false) {
        const notification = {
          type: 'comment',
          fromId: userId,
          postId: postId,
          read: false,
          createdAt: Date.now(),
        };
        await db.ref(`notifications/${postOwnerId}`).push(notification);
        const io = req.app.get('io');
        io.to(`user_${postOwnerId}`).emit('new_notification', notification);
      }
    }
    
    res.json({ id: commentRef.key, ...comment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete post
router.delete('/:postId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { postId } = req.params;
  
  try {
    const postSnap = await db.ref(`posts/${postId}`).once('value');
    if (!postSnap.exists()) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    if (postSnap.val().userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await db.ref(`posts/${postId}`).remove();
    await db.ref(`comments/${postId}`).remove();
    await db.ref(`savedPosts`).once('value', (snap) => {
      const updates = {};
      for (const [uid, saves] of Object.entries(snap.val() || {})) {
        if (saves[postId]) {
          updates[`savedPosts/${uid}/${postId}`] = null;
        }
      }
      if (Object.keys(updates).length) db.ref().update(updates);
    });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;