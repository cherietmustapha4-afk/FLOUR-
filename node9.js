// routes/search.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Global search
router.get('/', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const { q, type } = req.query;
  const currentUserId = req.userId;
  
  if (!q || q.trim().length < 2) {
    return res.json({ users: [], posts: [], hashtags: [] });
  }
  
  const query = q.toLowerCase();
  const result = { users: [], posts: [], hashtags: [] };
  
  try {
    // Search users
    if (!type || type === 'users') {
      const usersSnap = await db.ref('users').once('value');
      const users = usersSnap.val() || {};
      
      for (const [uid, user] of Object.entries(users)) {
        if (uid !== currentUserId && user.name && user.name.toLowerCase().includes(query)) {
          const settingsSnap = await db.ref(`userSettings/${uid}/showInSearch`).once('value');
          if (settingsSnap.val() !== false) {
            const isFollowing = await db.ref(`followers/${uid}/${currentUserId}`).once('value').then(s => s.exists());
            result.users.push({ uid, ...user, isFollowing });
          }
        }
      }
    }
    
    // Search posts
    if (!type || type === 'posts') {
      const postsSnap = await db.ref('posts').once('value');
      const posts = postsSnap.val() || {};
      
      for (const [pid, post] of Object.entries(posts)) {
        if (post.caption && post.caption.toLowerCase().includes(query)) {
          const userSnap = await db.ref(`users/${post.userId}`).once('value');
          result.posts.push({ id: pid, ...post, author: userSnap.val() });
        }
      }
      result.posts.sort((a, b) => b.timestamp - a.timestamp);
      result.posts = result.posts.slice(0, 30);
    }
    
    // Search hashtags
    if (!type || type === 'hashtags') {
      const postsSnap = await db.ref('posts').once('value');
      const posts = postsSnap.val() || {};
      const hashtagMap = {};
      
      for (const post of Object.values(posts)) {
        if (post.caption) {
          const matches = post.caption.match(/#[\w\u0600-\u06FF]+/g);
          if (matches) {
            matches.forEach(tag => {
              const normalizedTag = tag.toLowerCase();
              if (normalizedTag.includes(query)) {
                hashtagMap[normalizedTag] = (hashtagMap[normalizedTag] || 0) + 1;
              }
            });
          }
        }
      }
      
      result.hashtags = Object.entries(hashtagMap)
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search by hashtag
router.get('/hashtag/:tag', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const { tag } = req.params;
  
  try {
    const postsSnap = await db.ref('posts').once('value');
    const posts = postsSnap.val() || {};
    const matchingPosts = [];
    
    for (const [pid, post] of Object.entries(posts)) {
      if (post.caption && post.caption.toLowerCase().includes(tag.toLowerCase())) {
        const userSnap = await db.ref(`users/${post.userId}`).once('value');
        matchingPosts.push({ id: pid, ...post, author: userSnap.val() });
      }
    }
    
    matchingPosts.sort((a, b) => b.timestamp - a.timestamp);
    res.json({ tag, posts: matchingPosts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;