// routes/users.js
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

// Get user profile
router.get('/:userId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const { userId } = req.params;
  const currentUserId = req.userId;
  
  try {
    const userSnap = await db.ref(`users/${userId}`).once('value');
    if (!userSnap.exists()) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userSnap.val();
    
    // Check privacy
    const settingsSnap = await db.ref(`userSettings/${userId}/privateAccount`).once('value');
    const isPrivate = settingsSnap.val() === true;
    
    let isFollowing = false;
    if (isPrivate && userId !== currentUserId) {
      const followingSnap = await db.ref(`followers/${userId}/${currentUserId}`).once('value');
      isFollowing = followingSnap.exists();
      if (!isFollowing) {
        user.isPrivateView = true;
      }
    }
    
    const followersSnap = await db.ref(`followers/${userId}`).once('value');
    const followingSnap = await db.ref(`following/${userId}`).once('value');
    const postsSnap = await db.ref('posts').once('value');
    
    const posts = Object.values(postsSnap.val() || {})
      .filter(p => p.userId === userId)
      .sort((a, b) => b.timestamp - a.timestamp);
    
    res.json({
      ...user,
      uid: userId,
      followersCount: followersSnap.exists() ? Object.keys(followersSnap.val()).length : 0,
      followingCount: followingSnap.exists() ? Object.keys(followingSnap.val()).length : 0,
      postsCount: posts.length,
      posts: isPrivate && !isFollowing && userId !== currentUserId ? [] : posts,
      isFollowing,
      isOwnProfile: userId === currentUserId,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { name, bio, photoURL } = req.body;
  
  try {
    const updates = {};
    if (name) updates.name = name;
    if (bio !== undefined) updates.bio = bio;
    if (photoURL) updates.photoURL = photoURL;
    
    await db.ref(`users/${userId}`).update(updates);
    const updatedSnap = await db.ref(`users/${userId}`).once('value');
    res.json(updatedSnap.val());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Follow/unfollow user
router.post('/:userId/follow', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const currentUserId = req.userId;
  const { userId } = req.params;
  
  if (currentUserId === userId) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }
  
  try {
    const followRef = db.ref(`followers/${userId}/${currentUserId}`);
    const isFollowing = (await followRef.get()).exists();
    const io = req.app.get('io');
    
    if (isFollowing) {
      await followRef.remove();
      await db.ref(`following/${currentUserId}/${userId}`).remove();
      res.json({ following: false });
    } else {
      await followRef.set(true);
      await db.ref(`following/${currentUserId}/${userId}`).set(true);
      
      // Send notification
      const notifSettings = await db.ref(`userSettings/${userId}/followNotif`).once('value');
      if (notifSettings.val() !== false) {
        const notification = {
          type: 'follow',
          fromId: currentUserId,
          read: false,
          createdAt: Date.now(),
        };
        await db.ref(`notifications/${userId}`).push(notification);
        io.to(`user_${userId}`).emit('new_notification', notification);
      }
      
      res.json({ following: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get followers
router.get('/:userId/followers', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const { userId } = req.params;
  
  try {
    const followersSnap = await db.ref(`followers/${userId}`).once('value');
    const followers = followersSnap.val() || {};
    const followerIds = Object.keys(followers);
    
    const followerDetails = [];
    for (const fid of followerIds) {
      const userSnap = await db.ref(`users/${fid}`).once('value');
      if (userSnap.exists()) {
        followerDetails.push({ uid: fid, ...userSnap.val() });
      }
    }
    
    res.json(followerDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get following
router.get('/:userId/following', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const { userId } = req.params;
  
  try {
    const followingSnap = await db.ref(`following/${userId}`).once('value');
    const following = followingSnap.val() || {};
    const followingIds = Object.keys(following);
    
    const followingDetails = [];
    for (const fid of followingIds) {
      const userSnap = await db.ref(`users/${fid}`).once('value');
      if (userSnap.exists()) {
        followingDetails.push({ uid: fid, ...userSnap.val() });
      }
    }
    
    res.json(followingDetails);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save/unsave post
router.post('/saved/:postId', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const { postId } = req.params;
  
  try {
    const saveRef = db.ref(`savedPosts/${userId}/${postId}`);
    const isSaved = (await saveRef.get()).exists();
    
    if (isSaved) {
      await saveRef.remove();
      res.json({ saved: false });
    } else {
      await saveRef.set(true);
      res.json({ saved: true });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get saved posts
router.get('/saved/posts', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  
  try {
    const savedSnap = await db.ref(`savedPosts/${userId}`).once('value');
    const savedIds = Object.keys(savedSnap.val() || {});
    
    const posts = [];
    for (const pid of savedIds) {
      const postSnap = await db.ref(`posts/${pid}`).once('value');
      if (postSnap.exists()) {
        posts.push({ id: pid, ...postSnap.val() });
      }
    }
    
    posts.sort((a, b) => b.timestamp - a.timestamp);
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user settings
router.get('/settings', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  
  try {
    const settingsSnap = await db.ref(`userSettings/${userId}`).once('value');
    const settings = settingsSnap.val() || {
      privateAccount: false,
      showInSearch: true,
      readReceipts: true,
      typingIndicators: true,
      likeNotif: true,
      commentNotif: true,
      followNotif: true,
      commentPermission: 'everyone',
    };
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user settings
router.put('/settings', authenticateToken, async (req, res) => {
  const db = req.app.get('db');
  const userId = req.userId;
  const settings = req.body;
  
  try {
    await db.ref(`userSettings/${userId}`).update(settings);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;