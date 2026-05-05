import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged, deleteUser } from 'firebase/auth';
import { getDatabase, ref, get, set, push, update, remove, onValue, runTransaction } from 'firebase/database';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'swiper/css';
import 'swiper/css/pagination';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import './styles.css';

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyA_QtaO5NjrTg-XAo8-l9OO-t35r9ERmBA",
  authDomain: "twasol-a6376.firebaseapp.com",
  databaseURL: "https://twasol-a6376-default-rtdb.firebaseio.com",
  projectId: "twasol-a6376",
  storageBucket: "twasol-a6376.firebasestorage.app",
  messagingSenderId: "692913650252",
  appId: "1:692913650252:web:83142ece89f939130612e9"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const IMGBB_KEY = "2daa4a8113066b3b9b658cdb063c99b5";

// Helper functions
const uploadToImgBB = async (file) => {
  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: "POST", body: fd });
  const data = await res.json();
  return data.success ? data.data.url : null;
};

const escapeHtml = (str) => {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
};

const extractHashtags = (text) => {
  if (!text) return [];
  const matches = text.match(/#[\w\u0600-\u06FF]+/g);
  return matches ? matches.map(t => t.toLowerCase()) : [];
};

const showFullscreen = (url) => {
  const modal = document.createElement("div");
  modal.className = "fullscreen-modal";
  modal.innerHTML = `<div class="fullscreen-close"><i class="fas fa-times"></i></div><div class="fullscreen-content"><img src="${url}"></div>`;
  document.body.appendChild(modal);
  setTimeout(() => modal.classList.add("active"), 10);
  modal.onclick = (e) => {
    if (e.target === modal || e.target.closest('.fullscreen-close')) {
      modal.classList.remove("active");
      setTimeout(() => modal.remove(), 200);
    }
  };
};

const showToast = (msg) => {
  const d = document.createElement("div");
  d.innerText = msg;
  d.style.cssText = "position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:var(--surface);color:var(--text);padding:12px 24px;border-radius:50px;z-index:4000;box-shadow:var(--shadow);font-size:14px;";
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2500);
};

// Main App Component
const App = () => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentRoute, setCurrentRoute] = useState('auth');
  const [theme, setTheme] = useState(localStorage.getItem('flouTheme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  const [replyStates, setReplyStates] = useState({});

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('flouTheme', theme);
  }, [theme]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (authUser) {
        setUser(authUser);
        const userSnap = await get(ref(db, `users/${authUser.uid}`));
        if (!userSnap.exists()) {
          const defaultName = authUser.email.split("@")[0];
          await set(ref(db, `users/${authUser.uid}`), { name: defaultName, email: authUser.email, photoURL: null, bio: "" });
          setUserData({ name: defaultName, email: authUser.email, photoURL: null, bio: "" });
        } else {
          setUserData(userSnap.val());
        }
        setCurrentRoute(window.location.hash.slice(1) || 'home');
      } else {
        setUser(null);
        setUserData(null);
        setCurrentRoute('auth');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) || (user ? 'home' : 'auth');
      setCurrentRoute(hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [user]);

  if (loading) {
    return <SplashScreen />;
  }

  return (
    <div id="app">
      {user && <TopBar userData={userData} />}
      {user && <BottomNav currentRoute={currentRoute} />}
      
      {currentRoute === 'auth' && !user && <AuthPage />}
      {user && currentRoute === 'home' && <HomePage userUID={user.uid} userData={userData} />}
      {user && currentRoute === 'friends' && <FriendsPage userUID={user.uid} />}
      {user && currentRoute === 'explore' && <ExplorePage userUID={user.uid} />}
      {user && currentRoute === 'search' && <SearchPage userUID={user.uid} />}
      {user && currentRoute === 'messages' && <MessagesPage userUID={user.uid} userData={userData} />}
      {user && currentRoute === 'profile' && <ProfilePage userUID={user.uid} currentUserUID={user.uid} />}
      {user && currentRoute.startsWith('profile/') && <ProfilePage userUID={currentRoute.split('/')[1]} currentUserUID={user.uid} />}
      {user && currentRoute.startsWith('post/') && <PostPage postId={currentRoute.split('/')[1]} userUID={user.uid} />}
      {user && currentRoute.startsWith('followers/') && <FollowersPage uid={currentRoute.split('/')[1] || user.uid} />}
      {user && currentRoute.startsWith('following/') && <FollowingPage uid={currentRoute.split('/')[1] || user.uid} />}
      {user && currentRoute === 'saved' && <SavedPostsPage userUID={user.uid} />}
      {user && currentRoute === 'notifications' && <NotificationsPage userUID={user.uid} />}
      {user && currentRoute === 'settings-full' && <SettingsFullPage userUID={user.uid} userData={userData} setUserData={setUserData} setTheme={setTheme} theme={theme} />}
      
      {user && currentRoute !== 'auth' && <CreatePostFab />}
    </div>
  );
};

// Splash Screen Component
const SplashScreen = () => {
  const [fadeOut, setFadeOut] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <div className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}>
      <div className="splash-logo">FLOU</div>
      <div className="splash-tagline">premium moments • authentic connections</div>
      <div className="splash-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  );
};

// Top Bar Component
const TopBar = ({ userData }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  
  useEffect(() => {
    if (!userData?.uid) return;
    const notificationsRef = ref(db, `notifications/${userData.uid}`);
    const unsubscribe = onValue(notificationsRef, (snap) => {
      const notifs = snap.val() || {};
      const unread = Object.values(notifs).filter(n => !n.read).length;
      setUnreadCount(unread);
    });
    return () => unsubscribe();
  }, [userData]);
  
  return (
    <header className="top-bar">
      <div className="logo">FLOU</div>
      <div className="notification-btn" onClick={() => window.location.hash = "notifications"}>
        <i className="far fa-bell"></i>
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </div>
    </header>
  );
};

// Bottom Navigation Component
const BottomNav = ({ currentRoute }) => {
  const [unreadMessages, setUnreadMessages] = useState(0);
  const user = auth.currentUser;
  
  useEffect(() => {
    if (!user) return;
    const updateUnread = async () => {
      let totalUnread = 0;
      const messagesSnap = await get(ref(db, "messages"));
      const allMsgs = messagesSnap.val() || {};
      for (const chatId in allMsgs) {
        if (!chatId.includes(user.uid)) continue;
        const lastReadSnap = await get(ref(db, `userLastRead/${user.uid}/${chatId}`));
        const lastRead = lastReadSnap.val() || 0;
        for (const msg of Object.values(allMsgs[chatId])) {
          if (msg.from !== user.uid && msg.timestamp > lastRead) totalUnread++;
        }
      }
      setUnreadMessages(totalUnread);
    };
    updateUnread();
    const messagesRef = ref(db, "messages");
    const unsubscribe = onValue(messagesRef, () => updateUnread());
    return () => unsubscribe();
  }, [user]);
  
  const navItems = [
    { route: 'home', icon: 'fas fa-home', label: 'Home' },
    { route: 'explore', icon: 'fas fa-compass', label: 'Explore' },
    { route: 'search', icon: 'fas fa-search', label: 'Search' },
    { route: 'messages', icon: 'fas fa-comment-dots', label: 'Chat' },
    { route: 'profile', icon: 'fas fa-user', label: 'Profile' }
  ];
  
  return (
    <nav className="bottom-nav">
      {navItems.map(item => (
        <button
          key={item.route}
          className={`nav-item ${currentRoute === item.route ? 'active' : ''}`}
          onClick={() => window.location.hash = item.route}
        >
          <i className={item.icon}></i>
          <span>{item.label}</span>
          {item.route === 'messages' && unreadMessages > 0 && (
            <span className="msg-badge">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
          )}
        </button>
      ))}
    </nav>
  );
};

// Auth Page Component
const AuthPage = () => {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  
  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      alert(e.message);
    }
  };
  
  const handleSignup = async () => {
    if (password.length < 6) {
      alert("Password must be at least 6 characters");
      return;
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await set(ref(db, `users/${cred.user.uid}`), { name, email, photoURL: null, bio: "" });
      showToast("Account created successfully! 🎉");
    } catch (e) {
      alert(e.message);
    }
  };
  
  const handleResetPassword = async () => {
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      alert("Reset link sent to your email");
      setMode('login');
    } catch (e) {
      alert(e.message);
    }
  };
  
  return (
    <section id="auth-page" className="page active">
      <div style={{ textAlign: "center", marginTop: "60px" }}>
        <h1 className="logo" style={{ fontSize: "58px" }}>FLOU</h1>
        <p style={{ margin: "12px 0 30px" }}>premium moments • authentic connections</p>
      </div>
      
      {mode === 'login' && (
        <div className="glass-card">
          <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="btn btn-primary" onClick={handleLogin}>Log in →</button>
          <div className="forgot-link"><a href="#" onClick={(e) => { e.preventDefault(); setMode('reset'); }}>Forgot password?</a></div>
          <div className="auth-switch">No account? <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); }}>Sign up</a></div>
        </div>
      )}
      
      {mode === 'signup' && (
        <div className="glass-card">
          <input type="text" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
          <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="btn btn-primary" onClick={handleSignup}>Create account</button>
          <div className="auth-switch">Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>Log in</a></div>
        </div>
      )}
      
      {mode === 'reset' && (
        <div className="glass-card">
          <input type="email" placeholder="Your email address" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
          <button className="btn btn-primary" onClick={handleResetPassword}>Send reset link</button>
          <div className="auth-switch"><a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>← Back to login</a></div>
        </div>
      )}
    </section>
  );
};

// Post Card Component
const PostCard = ({ post, userUID, onRefresh, showSaveBtn = false, isSaved = false }) => {
  const [postData, setPostData] = useState(post);
  const [user, setUser] = useState(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  
  useEffect(() => {
    const fetchUser = async () => {
      const userSnap = await get(ref(db, `users/${post.userId}`));
      setUser(userSnap.val() || { name: "User", photoURL: null });
    };
    fetchUser();
    setIsLiked(post.likes && post.likes[userUID]);
  }, [post, userUID]);
  
  const handleLike = async () => {
    const likeRef = ref(db, `posts/${post.id}/likes/${userUID}`);
    const exists = (await get(likeRef)).exists();
    if (exists) {
      await remove(likeRef);
      await runTransaction(ref(db, `posts/${post.id}/likeCount`), (c) => (c || 1) - 1);
      setIsLiked(false);
      setLikeCount(prev => prev - 1);
    } else {
      await set(likeRef, true);
      await runTransaction(ref(db, `posts/${post.id}/likeCount`), (c) => (c || 0) + 1);
      setIsLiked(true);
      setLikeCount(prev => prev + 1);
      const postSnap = await get(ref(db, `posts/${post.id}`));
      const notifSettings = await get(ref(db, `userSettings/${postSnap.val().userId}/likeNotif`));
      if (post.userId !== userUID && notifSettings.val() !== false) {
        await push(ref(db, `notifications/${post.userId}`), {
          type: "like", fromId: userUID, postId: post.id, read: false, createdAt: Date.now()
        });
      }
    }
    if (onRefresh) onRefresh();
  };
  
  const handleComment = () => {
    openCommentModal(post.id, userUID, () => onRefresh && onRefresh());
  };
  
  const handleSave = async () => {
    const savedRef = ref(db, `savedPosts/${userUID}/${post.id}`);
    const exists = (await get(savedRef)).exists();
    if (exists) await remove(savedRef);
    else await set(savedRef, true);
    if (onRefresh) onRefresh();
  };
  
  const handleDelete = async () => {
    if (confirm("Delete post?")) {
      await remove(ref(db, `posts/${post.id}`));
      if (onRefresh) onRefresh();
    }
  };
  
  const handleShare = () => {
    sharePostInMessages(post.id, userUID);
  };
  
  const hashtags = extractHashtags(postData.caption);
  
  return (
    <div className="post-card">
      <div className="post-header" onClick={() => window.location.hash = `profile/${post.userId}`}>
        <img className="post-avatar" src={user?.photoURL || `https://ui-avatars.com/api/?background=ff3b5c&color=fff&name=${encodeURIComponent(user?.name || 'User')}`} />
        <div>
          <div className="post-username">{escapeHtml(user?.name || 'User')}</div>
          <div className="post-time">{new Date(postData.timestamp).toLocaleString()}</div>
        </div>
      </div>
      
      {postData.caption && <div className="post-caption">{escapeHtml(postData.caption)}</div>}
      
      {hashtags.length > 0 && (
        <div className="post-hashtags">
          {hashtags.map(tag => (
            <span key={tag} className="hashtag" onClick={() => searchByHashtag(tag)}>#{escapeHtml(tag)}</span>
          ))}
        </div>
      )}
      
      {postData.location && (
        <div className="post-location">
          <i className="fas fa-map-marker-alt"></i> {escapeHtml(postData.location.name || postData.location.address || 'Location')}
        </div>
      )}
      
      <div className="post-media-container">
        {postData.images && postData.images.length === 1 ? (
          <img src={postData.images[0]} className="single-image" loading="lazy" onClick={() => showFullscreen(postData.images[0])} />
        ) : postData.images && postData.images.length > 1 ? (
          <Swiper modules={[Pagination]} pagination={{ clickable: true, dynamicBullets: true }} slidesPerView={1}>
            {postData.images.map((img, idx) => (
              <SwiperSlide key={idx}>
                <img src={img} loading="lazy" onClick={() => showFullscreen(img)} />
              </SwiperSlide>
            ))}
          </Swiper>
        ) : null}
      </div>
      
      <div className="post-actions">
        <button className={`action-btn ${isLiked ? 'liked' : ''}`} onClick={handleLike}>
          <i className={isLiked ? "fas fa-heart liked" : "far fa-heart"}></i>
          <span className="like-count">{likeCount}</span>
        </button>
        <button className="action-btn" onClick={handleComment}>
          <i className="far fa-comment"></i> {postData.commentCount || 0}
        </button>
        <button className="action-btn" onClick={handleShare}>
          <i className="fas fa-share-alt"></i>
        </button>
        {showSaveBtn && (
          <button className="action-btn" onClick={handleSave}>
            <i className={isSaved ? "fas fa-bookmark" : "far fa-bookmark"}></i>
          </button>
        )}
        {post.userId === userUID && (
          <button className="action-btn" onClick={handleDelete}>
            <i className="fas fa-trash"></i>
          </button>
        )}
      </div>
    </div>
  );
};

// Home Page Component
const HomePage = ({ userUID }) => {
  const [posts, setPosts] = useState([]);
  const [savedPosts, setSavedPosts] = useState({});
  
  const calculatePostScore = (post, following) => {
    const now = Date.now();
    const ageInHours = (now - (post.timestamp || 0)) / (1000 * 60 * 60);
    const recencyScore = Math.max(0, 1 - (ageInHours / 168));
    const engagementScore = Math.min(1, ((post.likeCount || 0) * 0.01) + ((post.commentCount || 0) * 0.02));
    const isFollowing = following && following[post.userId];
    const relationshipScore = isFollowing ? 0.8 : 0.2;
    let interestScore = 0.2;
    if (post.caption) {
      const caps = post.caption.toLowerCase();
      if (caps.includes('love') || caps.includes('art') || caps.includes('beautiful')) interestScore = 0.7;
    }
    return (recencyScore * 0.3) + (engagementScore * 0.3) + (relationshipScore * 0.2) + (interestScore * 0.2);
  };
  
  const loadPosts = async () => {
    const postsSnap = await get(ref(db, "posts"));
    let postsList = Object.entries(postsSnap.val() || {}).map(([id, p]) => ({ id, ...p }));
    const followingSnap = await get(ref(db, `following/${userUID}`));
    const following = followingSnap.val() || {};
    for (let post of postsList) {
      post.score = calculatePostScore(post, following);
    }
    postsList.sort((a, b) => b.score - a.score);
    
    const savedSnap = await get(ref(db, `savedPosts/${userUID}`));
    const saved = savedSnap.val() || {};
    setSavedPosts(saved);
    setPosts(postsList);
  };
  
  useEffect(() => {
    loadPosts();
    const postsRef = ref(db, "posts");
    const unsubscribe = onValue(postsRef, () => loadPosts());
    return () => unsubscribe();
  }, [userUID]);
  
  return (
    <section id="home-page" className="page active">
      <div id="feed-container">
        {posts.length === 0 ? (
          <div className="glass-card" style={{ textAlign: "center" }}>✨ No posts yet</div>
        ) : (
          posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              userUID={userUID}
              showSaveBtn={true}
              isSaved={!!savedPosts[post.id]}
              onRefresh={loadPosts}
            />
          ))
        )}
      </div>
    </section>
  );
};

// Friends Page Component
const FriendsPage = ({ userUID }) => {
  const [posts, setPosts] = useState([]);
  
  const loadFriendsFeed = async () => {
    const followingSnap = await get(ref(db, `following/${userUID}`));
    const following = followingSnap.val() || {};
    const friendIds = Object.keys(following);
    const postsSnap = await get(ref(db, "posts"));
    let allPosts = Object.entries(postsSnap.val() || {}).map(([id, p]) => ({ id, ...p }));
    const filtered = allPosts.filter(p => friendIds.includes(p.userId));
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    setPosts(filtered);
  };
  
  useEffect(() => {
    loadFriendsFeed();
    const postsRef = ref(db, "posts");
    const unsubscribe = onValue(postsRef, () => loadFriendsFeed());
    return () => unsubscribe();
  }, [userUID]);
  
  return (
    <section id="friends-page" className="page">
      <div id="friends-feed-container">
        {posts.length === 0 ? (
          <div className="glass-card" style={{ textAlign: "center" }}>🤝 Follow friends to see their moments</div>
        ) : (
          posts.map(post => <PostCard key={post.id} post={post} userUID={userUID} showSaveBtn={true} />)
        )}
      </div>
    </section>
  );
};

// Explore Page Component
const ExplorePage = ({ userUID }) => {
  const [posts, setPosts] = useState([]);
  const [trendingHashtags, setTrendingHashtags] = useState([]);
  
  const getTrendingHashtags = async () => {
    const postsSnap = await get(ref(db, "posts"));
    const hashtagCount = {};
    for (const [id, p] of Object.entries(postsSnap.val() || {})) {
      const hashtags = extractHashtags(p.caption);
      hashtags.forEach(t => { hashtagCount[t] = (hashtagCount[t] || 0) + 1; });
    }
    return Object.entries(hashtagCount).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  };
  
  const loadExplore = async () => {
    const postsSnap = await get(ref(db, "posts"));
    const postsList = Object.entries(postsSnap.val() || {}).map(([id, p]) => ({ id, ...p }));
    postsList.sort((a, b) => b.timestamp - a.timestamp);
    setPosts(postsList.slice(0, 30));
    const trending = await getTrendingHashtags();
    setTrendingHashtags(trending);
  };
  
  useEffect(() => {
    loadExplore();
  }, []);
  
  return (
    <section id="explore-page" className="page">
      <div className="glass-card">
        <h4 style={{ marginBottom: "12px" }}>🔥 Trending Hashtags</h4>
        <div className="trending-hashtags">
          {trendingHashtags.map(t => (
            <span key={t.tag} className="hashtag-chip" onClick={() => searchByHashtag(t.tag)}>
              #{t.tag} ({t.count})
            </span>
          ))}
        </div>
      </div>
      <div className="explore-grid">
        {posts.map(post => post.images && post.images[0] && (
          <div key={post.id} className="grid-item" onClick={() => window.location.hash = `post/${post.id}`}>
            <img src={post.images[0]} />
          </div>
        ))}
      </div>
    </section>
  );
};

// Search Page Component
const SearchPage = ({ userUID }) => {
  const [searchTab, setSearchTab] = useState('users');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ users: [], posts: [], hashtags: [] });
  
  const searchGlobal = useCallback(async () => {
    if (!query.trim()) {
      setResults({ users: [], posts: [], hashtags: [] });
      return;
    }
    
    if (searchTab === 'users') {
      const usersSnap = await get(ref(db, "users"));
      const users = usersSnap.val() || {};
      const followingSnap = await get(ref(db, `following/${userUID}`));
      const following = followingSnap.val() || {};
      const usersList = [];
      for (const [uid, data] of Object.entries(users)) {
        if (uid !== userUID && data.name && data.name.toLowerCase().includes(query.toLowerCase())) {
          const userSettings = (await get(ref(db, `userSettings/${uid}/showInSearch`))).val();
          if (userSettings === false) continue;
          usersList.push({ uid, ...data, isFollowing: !!following[uid] });
        }
      }
      setResults(prev => ({ ...prev, users: usersList }));
    } else if (searchTab === 'posts') {
      const postsSnap = await get(ref(db, "posts"));
      const posts = Object.entries(postsSnap.val() || {}).map(([id, p]) => ({ id, ...p }));
      const filtered = posts.filter(p => p.caption && p.caption.toLowerCase().includes(query.toLowerCase()));
      const postsWithUsers = await Promise.all(filtered.slice(0, 20).map(async (p) => {
        const userSnap = await get(ref(db, `users/${p.userId}`));
        return { ...p, user: userSnap.val() || { name: "User" } };
      }));
      setResults(prev => ({ ...prev, posts: postsWithUsers }));
    } else if (searchTab === 'hashtags') {
      const postsSnap = await get(ref(db, "posts"));
      const hashtagMap = {};
      for (const [id, p] of Object.entries(postsSnap.val() || {})) {
        const hashtags = extractHashtags(p.caption);
        hashtags.forEach(t => {
          if (t.toLowerCase().includes(query.toLowerCase())) {
            hashtagMap[t] = (hashtagMap[t] || 0) + 1;
          }
        });
      }
      const hashtagsList = Object.entries(hashtagMap).map(([tag, count]) => ({ tag, count })).slice(0, 20);
      setResults(prev => ({ ...prev, hashtags: hashtagsList }));
    }
  }, [query, searchTab, userUID]);
  
  useEffect(() => {
    const timer = setTimeout(() => searchGlobal(), 300);
    return () => clearTimeout(timer);
  }, [query, searchTab, searchGlobal]);
  
  const handleFollow = async (targetUid, isFollowing) => {
    if (isFollowing) {
      await remove(ref(db, `followers/${targetUid}/${userUID}`));
      await remove(ref(db, `following/${userUID}/${targetUid}`));
    } else {
      await set(ref(db, `followers/${targetUid}/${userUID}`), true);
      await set(ref(db, `following/${userUID}/${targetUid}`), true);
      const notifSettings = await get(ref(db, `userSettings/${targetUid}/followNotif`));
      if (notifSettings.val() !== false) {
        await push(ref(db, `notifications/${targetUid}`), {
          type: "follow", fromId: userUID, read: false, createdAt: Date.now()
        });
      }
    }
    searchGlobal();
  };
  
  return (
    <section id="search-page" className="page">
      <div className="search-tabs">
        <div className={`search-tab ${searchTab === 'users' ? 'active' : ''}`} onClick={() => setSearchTab('users')}>👥 Users</div>
        <div className={`search-tab ${searchTab === 'posts' ? 'active' : ''}`} onClick={() => setSearchTab('posts')}>📷 Posts</div>
        <div className={`search-tab ${searchTab === 'hashtags' ? 'active' : ''}`} onClick={() => setSearchTab('hashtags')}># Hashtags</div>
      </div>
      <input type="text" placeholder="🔍 Search..." value={query} onChange={e => setQuery(e.target.value)} />
      <div style={{ marginTop: "16px" }}>
        {searchTab === 'users' && (
          <div className="glass-card">
            <h4>👥 Users</h4>
            {results.users.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px" }}>No users found</div>
            ) : (
              results.users.map(user => (
                <div key={user.uid} className="user-row">
                  <img className="avatar-small" src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`} />
                  <div style={{ flex: 1 }}><strong>{escapeHtml(user.name)}</strong></div>
                  <button
                    className="follow-search-btn"
                    onClick={() => handleFollow(user.uid, user.isFollowing)}
                    style={{ background: user.isFollowing ? '#475569' : '#ff3b5c' }}
                  >
                    {user.isFollowing ? 'Unfollow' : 'Follow'}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
        
        {searchTab === 'posts' && (
          <div className="glass-card">
            <h4>📷 Posts</h4>
            {results.posts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px" }}>No posts found</div>
            ) : (
              results.posts.map(post => (
                <div key={post.id} className="post-card" style={{ marginBottom: "12px", cursor: "pointer" }} onClick={() => window.location.hash = `post/${post.id}`}>
                  <div className="post-header" style={{ padding: "8px 12px" }}>
                    <img className="post-avatar" style={{ width: "36px", height: "36px" }} src={post.user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(post.user.name)}`} />
                    <div><strong>{escapeHtml(post.user.name)}</strong></div>
                  </div>
                  {post.images && post.images[0] && <img src={post.images[0]} style={{ width: "100%", maxHeight: "200px", objectFit: "cover" }} />}
                  {post.caption && <div className="post-caption" style={{ padding: "8px 12px" }}>{escapeHtml(post.caption.substring(0, 100))}</div>}
                </div>
              ))
            )}
          </div>
        )}
        
        {searchTab === 'hashtags' && (
          <div className="glass-card">
            <h4># Hashtags</h4>
            {results.hashtags.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px" }}>No hashtags found</div>
            ) : (
              results.hashtags.map(h => (
                <span key={h.tag} className="hashtag-chip" style={{ display: "inline-block", margin: "4px", padding: "8px 16px" }} onClick={() => searchByHashtag(h.tag)}>
                  #{h.tag} ({h.count} posts)
                </span>
              ))
            )}
          </div>
        )}
      </div>
    </section>
  );
};

// Messages Page Component
const MessagesPage = ({ userUID, userData }) => {
  const [friends, setFriends] = useState([]);
  
  const loadChatUsers = async () => {
    const followingSnap = await get(ref(db, `following/${userUID}`));
    const following = followingSnap.val() || {};
    const friendsList = [];
    for (const fid of Object.keys(following)) {
      const userSnap = await get(ref(db, `users/${fid}`));
      if (userSnap.exists()) {
        friendsList.push({ uid: fid, ...userSnap.val() });
      }
    }
    setFriends(friendsList);
  };
  
  useEffect(() => {
    loadChatUsers();
  }, [userUID]);
  
  const openChatWindow = async (partnerId) => {
    const chatId = userUID < partnerId ? `${userUID}_${partnerId}` : `${partnerId}_${userUID}`;
    const chatSettings = (await get(ref(db, `chatSettings/${userUID}/${partnerId}`))).val() || {};
    
    // Create modal for chat
    const modal = document.createElement("div");
    modal.className = "chat-view-modal";
    modal.innerHTML = `
      <div class="chat-header">
        <button id="closeChatBtn" style="background:none; border:none; font-size:24px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button>
        <div style="flex:1; text-align:center; font-weight:600;">Chat</div>
        <button id="chatSettingsBtn" style="background:none; border:none; font-size:20px; cursor:pointer;"><i class="fas fa-cog"></i></button>
      </div>
      <div id="chatMessagesArea" class="chat-messages-area"></div>
      <div id="typingIndicator" class="typing-indicator"></div>
      <div style="padding:12px; display:flex; gap:10px;">
        <input id="chatMsgInput" placeholder="Message..." style="flex:1; margin:0;">
        <button id="sendMsgBtn" style="background:#ff3b5c; border:none; border-radius:50%; width:44px; height:44px; cursor:pointer; color:white;"><i class="fas fa-paper-plane"></i></button>
        <button id="attachChatImageBtn" style="background:var(--surface); border:1px solid var(--border); border-radius:50%; width:44px; height:44px; cursor:pointer;"><i class="fas fa-image"></i></button>
        <input type="file" id="chatImageFile" style="display:none;">
      </div>
    `;
    document.body.appendChild(modal);
    
    let typingTimeout = null;
    
    const sendTypingIndicator = async (isTyping) => {
      const settings = (await get(ref(db, `userSettings/${userUID}/typingIndicators`))).val();
      if (settings === false) return;
      await set(ref(db, `typingIndicators/${chatId}/${userUID}`), isTyping ? Date.now() : null);
      if (isTyping) {
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(async () => {
          await set(ref(db, `typingIndicators/${chatId}/${userUID}`), null);
        }, 3000);
      }
    };
    
    document.getElementById("chatMsgInput").addEventListener("input", () => {
      sendTypingIndicator(true);
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => sendTypingIndicator(false), 2000);
    });
    
    onValue(ref(db, `typingIndicators/${chatId}`), (snap) => {
      const typingData = snap.val() || {};
      let isPartnerTyping = false;
      for (const [uid, time] of Object.entries(typingData)) {
        if (uid !== userUID && time && (Date.now() - time < 5000)) isPartnerTyping = true;
      }
      document.getElementById("typingIndicator").innerHTML = isPartnerTyping ? "<span>typing...</span>" : "";
    });
    
    const loadMessages = () => {
      onValue(ref(db, `messages/${chatId}`), async (snap) => {
        const msgs = snap.val() || {};
        const container = modal.querySelector("#chatMessagesArea");
        let html = "";
        const readReceiptsEnabled = (await get(ref(db, `userSettings/${userUID}/readReceipts`))).val() !== false;
        
        for (const [msgId, msg] of Object.entries(msgs).sort((a, b) => a[1].timestamp - b[1].timestamp)) {
          const isOwn = msg.from === userUID;
          html += `<div class="msg-bubble ${isOwn ? 'msg-sent' : 'msg-received'}">`;
          if (msg.image) html += `<img src="${msg.image}" style="max-width:150px; border-radius:12px; cursor:pointer;" onclick="window.showFullscreen('${msg.image}')">`;
          if (msg.text) html += escapeHtml(msg.text);
          if (isOwn && readReceiptsEnabled && msg.read) html += `<div class="read-receipt"><i class="fas fa-check-double"></i> Seen</div>`;
          html += `</div>`;
          
          if (!isOwn && !msg.read) {
            await set(ref(db, `userLastRead/${userUID}/${chatId}`), Date.now());
            await set(ref(db, `messages/${chatId}/${msgId}/read`), true);
          }
        }
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
      });
    };
    loadMessages();
    
    modal.querySelector("#closeChatBtn").onclick = () => {
      modal.remove();
    };
    
    modal.querySelector("#chatSettingsBtn").onclick = () => {
      openChatSettings(userUID, partnerId);
    };
    
    modal.querySelector("#sendMsgBtn").onclick = async () => {
      const txt = modal.querySelector("#chatMsgInput").value.trim();
      if (!txt) return;
      await push(ref(db, `messages/${chatId}`), {
        from: userUID, text: txt, image: null, timestamp: Date.now()
      });
      modal.querySelector("#chatMsgInput").value = "";
      sendTypingIndicator(false);
    };
    
    modal.querySelector("#chatMsgInput").onkeypress = (e) => {
      if (e.key === "Enter") modal.querySelector("#sendMsgBtn").click();
    };
    
    modal.querySelector("#attachChatImageBtn").onclick = () => document.getElementById("chatImageFile").click();
    document.getElementById("chatImageFile").onchange = async (e) => {
      if (e.target.files[0]) {
        const url = await uploadToImgBB(e.target.files[0]);
        if (url) {
          await push(ref(db, `messages/${chatId}`), {
            from: userUID, text: null, image: url, timestamp: Date.now()
          });
        }
        e.target.value = "";
      }
    };
  };
  
  const openChatSettings = async (userUID, partnerId) => {
    const chatSettings = (await get(ref(db, `chatSettings/${userUID}/${partnerId}`))).val() || {};
    const modal = document.createElement("div");
    modal.className = "chat-settings-modal";
    modal.innerHTML = `
      <div class="create-inner" style="max-width:380px;">
        <h3><i class="fas fa-sliders-h"></i> Chat Settings</h3>
        <div class="setting-item">
          <div><div class="setting-label">🔕 Mute Notifications</div></div>
          <div id="muteChatToggle" class="toggle-switch ${chatSettings.muted ? 'active' : ''}"><div class="toggle-knob"></div></div>
        </div>
        <div class="setting-item">
          <div><div class="setting-label">🗑️ Clear Chat</div></div>
          <button id="clearChatBtn" style="background:#ff5c7c; color:white; padding:6px 12px; border:none; border-radius:8px;">Clear</button>
        </div>
        <div class="setting-item">
          <div><div class="setting-label">🚫 Block User</div></div>
          <button id="blockUserBtn" style="background:#ff5c7c; color:white; padding:6px 12px; border:none; border-radius:8px;">Block</button>
        </div>
        <button id="closeChatSettings" style="margin-top:16px; padding:10px; background:var(--surface); border:1px solid var(--border); border-radius:12px; cursor:pointer;">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById("muteChatToggle").onclick = () => {
      document.getElementById("muteChatToggle").classList.toggle("active");
      set(ref(db, `chatSettings/${userUID}/${partnerId}/muted`), document.getElementById("muteChatToggle").classList.contains("active"));
    };
    
    document.getElementById("clearChatBtn").onclick = async () => {
      if (confirm("Clear all messages?")) {
        const chatId = userUID < partnerId ? `${userUID}_${partnerId}` : `${partnerId}_${userUID}`;
        await remove(ref(db, `messages/${chatId}`));
        showToast("Chat cleared");
        modal.remove();
      }
    };
    
    document.getElementById("blockUserBtn").onclick = async () => {
      if (confirm("Block this user?")) {
        await set(ref(db, `blocked/${userUID}/${partnerId}`), true);
        await remove(ref(db, `following/${userUID}/${partnerId}`));
        showToast("User blocked");
        modal.remove();
      }
    };
    
    document.getElementById("closeChatSettings").onclick = () => modal.remove();
  };
  
  return (
    <section id="messages-page" className="page">
      <div className="glass-card" style={{ marginBottom: "16px", textAlign: "center" }}>
        <i className="fas fa-comments"></i> Your conversations
      </div>
      {friends.length === 0 ? (
        <div className="glass-card">No conversations yet</div>
      ) : (
        friends.map(friend => (
          <div key={friend.uid} className="chat-user-item" onClick={() => openChatWindow(friend.uid)}>
            <img className="avatar-small" src={friend.photoURL || `https://ui-avatars.com/api/?background=ff3b5c&color=fff&name=${encodeURIComponent(friend.name)}`} />
            <div><strong>{escapeHtml(friend.name)}</strong></div>
            <button className="chat-settings-icon" style={{ marginLeft: "auto", background: "none", border: "none", fontSize: "18px", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); openChatSettings(friend.uid); }}>
              <i className="fas fa-cog"></i>
            </button>
          </div>
        ))
      )}
    </section>
  );
};

// Profile Page Component
const ProfilePage = ({ userUID, currentUserUID }) => {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const isOwn = userUID === currentUserUID;
  
  const loadProfile = async () => {
    const userSnap = await get(ref(db, `users/${userUID}`));
    if (!userSnap.exists()) return;
    setUser(userSnap.val());
    
    const postsSnap = await get(ref(db, "posts"));
    const userPosts = Object.values(postsSnap.val() || {}).filter(p => p.userId === userUID).sort((a, b) => b.timestamp - a.timestamp);
    setPosts(userPosts);
    
    const followersSnap = await get(ref(db, `followers/${userUID}`));
    setFollowersCount(followersSnap.exists() ? Object.keys(followersSnap.val()).length : 0);
    
    const followingSnap = await get(ref(db, `following/${userUID}`));
    setFollowingCount(followingSnap.exists() ? Object.keys(followingSnap.val()).length : 0);
    
    const followSnap = await get(ref(db, `followers/${userUID}/${currentUserUID}`));
    setIsFollowing(followSnap.exists());
  };
  
  useEffect(() => {
    loadProfile();
  }, [userUID, currentUserUID]);
  
  const handleFollow = async () => {
    if (isFollowing) {
      await remove(ref(db, `followers/${userUID}/${currentUserUID}`));
      await remove(ref(db, `following/${currentUserUID}/${userUID}`));
    } else {
      await set(ref(db, `followers/${userUID}/${currentUserUID}`), true);
      await set(ref(db, `following/${currentUserUID}/${userUID}`), true);
      const notifSettings = await get(ref(db, `userSettings/${userUID}/followNotif`));
      if (notifSettings.val() !== false) {
        await push(ref(db, `notifications/${userUID}`), {
          type: "follow", fromId: currentUserUID, read: false, createdAt: Date.now()
        });
      }
    }
    loadProfile();
  };
  
  const handleMessage = () => {
    window.location.hash = "messages";
    setTimeout(() => {
      const modal = document.querySelector(".chat-user-item");
      if (modal) modal.click();
    }, 100);
  };
  
  if (!user) return <div className="page">Loading...</div>;
  
  return (
    <section id="profile-page" className="page">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
        <button className="settings-icon" id="profileSettingsBtn" onClick={() => window.location.hash = "settings-full"}>
          <i className="fas fa-cog"></i>
        </button>
      </div>
      <div id="profile-content">
        <div style={{ textAlign: "center" }}>
          <img src={user.photoURL || `https://ui-avatars.com/api/?background=ff3b5c&color=fff&name=${encodeURIComponent(user.name)}`} style={{ width: "88px", height: "88px", borderRadius: "50%", border: "2px solid var(--primary)", objectFit: "cover" }} />
          <h2 style={{ marginTop: "12px", fontSize: "20px" }}>{escapeHtml(user.name)}</h2>
          {user.bio && <p style={{ fontSize: "13px", color: "var(--text-dim)", margin: "8px 0" }}>{escapeHtml(user.bio)}</p>}
          
          <div style={{ display: "flex", justifyContent: "center", gap: "32px", margin: "16px 0" }}>
            <div style={{ cursor: "pointer" }} onClick={() => window.location.hash = `followers/${userUID}`}>
              <strong>{followersCount}</strong>
              <div style={{ fontSize: "12px" }}>followers</div>
            </div>
            <div style={{ cursor: "pointer" }} onClick={() => window.location.hash = `following/${userUID}`}>
              <strong>{followingCount}</strong>
              <div style={{ fontSize: "12px" }}>following</div>
            </div>
            <div>
              <strong>{posts.length}</strong>
              <div style={{ fontSize: "12px" }}>posts</div>
            </div>
          </div>
          
          <div className="profile-actions">
            {!isOwn ? (
              <>
                <button className="btn btn-primary" onClick={handleFollow} style={{ background: isFollowing ? '#475569' : '#ff3b5c', width: "auto", padding: "8px 24px" }}>
                  {isFollowing ? 'Unfollow' : 'Follow'}
                </button>
                <button className="btn btn-secondary" onClick={handleMessage} style={{ width: "auto", padding: "8px 24px" }}>
                  <i className="fas fa-comment"></i> Message
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => window.location.hash = "settings-full"} style={{ width: "auto", padding: "8px 24px" }}>
                  <i className="fas fa-edit"></i> Edit Profile
                </button>
                <button className="btn btn-secondary" onClick={() => window.location.hash = "saved"} style={{ width: "auto", padding: "8px 24px" }}>
                  <i className="fas fa-bookmark"></i> Saved
                </button>
              </>
            )}
          </div>
        </div>
        
        <div className="profile-grid">
          {posts.map(post => post.images && post.images[0] && (
            <div key={post.id} className="grid-item" onClick={() => window.location.hash = `post/${post.id}`}>
              <img src={post.images[0]} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// Post Page Component
const PostPage = ({ postId, userUID }) => {
  const [post, setPost] = useState(null);
  const [saved, setSaved] = useState(false);
  
  const loadPost = async () => {
    const postSnap = await get(ref(db, `posts/${postId}`));
    if (postSnap.exists()) {
      setPost({ id: postId, ...postSnap.val() });
      const savedSnap = await get(ref(db, `savedPosts/${userUID}/${postId}`));
      setSaved(savedSnap.exists());
    }
  };
  
  useEffect(() => {
    loadPost();
  }, [postId, userUID]);
  
  if (!post) return <div className="page">Loading...</div>;
  
  return (
    <section id="post-page" className="page active">
      <div className="post-page-header">
        <button className="back-btn" onClick={() => window.history.back()}><i className="fas fa-arrow-left"></i></button>
        <h3 style={{ fontSize: "16px" }}>Post</h3>
        <div style={{ width: "40px" }}></div>
      </div>
      <PostCard post={post} userUID={userUID} showSaveBtn={true} isSaved={saved} onRefresh={loadPost} />
    </section>
  );
};

// Followers Page Component
const FollowersPage = ({ uid }) => {
  const [followers, setFollowers] = useState([]);
  
  useEffect(() => {
    const loadFollowers = async () => {
      const followersSnap = await get(ref(db, `followers/${uid}`));
      const followersData = followersSnap.val() || {};
      const followersList = [];
      for (const fid of Object.keys(followersData)) {
        const userSnap = await get(ref(db, `users/${fid}`));
        if (userSnap.exists()) {
          followersList.push({ uid: fid, ...userSnap.val() });
        }
      }
      setFollowers(followersList);
    };
    loadFollowers();
  }, [uid]);
  
  return (
    <section id="followers-page" className="page active">
      <div className="glass-card">
        <h3>Followers</h3>
        {followers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px" }}>No followers yet</div>
        ) : (
          followers.map(f => (
            <div key={f.uid} className="user-row" onClick={() => window.location.hash = `profile/${f.uid}`}>
              <img className="avatar-small" src={f.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(f.name)}`} />
              <div><strong>{escapeHtml(f.name)}</strong></div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

// Following Page Component
const FollowingPage = ({ uid }) => {
  const [following, setFollowing] = useState([]);
  
  useEffect(() => {
    const loadFollowing = async () => {
      const followingSnap = await get(ref(db, `following/${uid}`));
      const followingData = followingSnap.val() || {};
      const followingList = [];
      for (const fid of Object.keys(followingData)) {
        const userSnap = await get(ref(db, `users/${fid}`));
        if (userSnap.exists()) {
          followingList.push({ uid: fid, ...userSnap.val() });
        }
      }
      setFollowing(followingList);
    };
    loadFollowing();
  }, [uid]);
  
  return (
    <section id="following-page" className="page active">
      <div className="glass-card">
        <h3>Following</h3>
        {following.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px" }}>Not following anyone yet</div>
        ) : (
          following.map(f => (
            <div key={f.uid} className="user-row" onClick={() => window.location.hash = `profile/${f.uid}`}>
              <img className="avatar-small" src={f.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(f.name)}`} />
              <div><strong>{escapeHtml(f.name)}</strong></div>
            </div>
          ))
        )}
      </div>
    </section>
  );
};

// Saved Posts Page Component
const SavedPostsPage = ({ userUID }) => {
  const [posts, setPosts] = useState([]);
  
  const loadSavedPosts = async () => {
    const savedSnap = await get(ref(db, `savedPosts/${userUID}`));
    const savedIds = Object.keys(savedSnap.val() || {});
    const postsList = [];
    for (const pid of savedIds) {
      const postSnap = await get(ref(db, `posts/${pid}`));
      if (postSnap.exists()) {
        postsList.push({ id: pid, ...postSnap.val() });
      }
    }
    setPosts(postsList);
  };
  
  useEffect(() => {
    loadSavedPosts();
  }, [userUID]);
  
  return (
    <section id="saved-page" className="page active">
      {posts.length === 0 ? (
        <div className="glass-card" style={{ textAlign: "center" }}>📌 No saved posts yet</div>
      ) : (
        posts.map(post => <PostCard key={post.id} post={post} userUID={userUID} showSaveBtn={true} isSaved={true} onRefresh={loadSavedPosts} />)
      )}
    </section>
  );
};

// Notifications Page Component
const NotificationsPage = ({ userUID }) => {
  const [notifications, setNotifications] = useState([]);
  
  const loadNotifications = async () => {
    const notifsSnap = await get(ref(db, `notifications/${userUID}`));
    const notifs = notifsSnap.val() || {};
    const notifsList = [];
    for (const [nid, n] of Object.entries(notifs).reverse()) {
      const fromUser = await get(ref(db, `users/${n.fromId}`));
      notifsList.push({ id: nid, ...n, fromName: fromUser.val()?.name || "Someone" });
      await set(ref(db, `notifications/${userUID}/${nid}/read`), true);
    }
    setNotifications(notifsList);
  };
  
  useEffect(() => {
    loadNotifications();
    const notifsRef = ref(db, `notifications/${userUID}`);
    const unsubscribe = onValue(notifsRef, () => loadNotifications());
    return () => unsubscribe();
  }, [userUID]);
  
  return (
    <section id="notifications-page" className="page active">
      {notifications.length === 0 ? (
        <div className="glass-card" style={{ textAlign: "center" }}>✨ No notifications</div>
      ) : (
        notifications.map(n => (
          <div key={n.id} className="glass-card" style={{ cursor: "pointer" }} onClick={() => {
            if (n.postId) window.location.hash = `post/${n.postId}`;
            else window.location.hash = `profile/${n.fromId}`;
          }}>
            🔔 <strong>{escapeHtml(n.fromName)}</strong> {
              n.type === 'like' ? 'liked your post' :
              n.type === 'follow' ? 'started following you' : 'shared a post'
            }
          </div>
        ))
      )}
    </section>
  );
};

// Settings Page Component
const SettingsFullPage = ({ userUID, userData, setUserData, setTheme, theme }) => {
  const [settings, setSettings] = useState({
    privateAccount: false,
    showInSearch: true,
    readReceipts: true,
    typingIndicators: true,
    likeNotif: true,
    commentNotif: true,
    followNotif: true,
    commentPermission: 'everyone'
  });
  const [name, setName] = useState(userData?.name || '');
  const [bio, setBio] = useState(userData?.bio || '');
  const [photoURL, setPhotoURL] = useState(userData?.photoURL || '');
  
  useEffect(() => {
    const loadSettings = async () => {
      const settingsSnap = await get(ref(db, `userSettings/${userUID}`));
      const loadedSettings = settingsSnap.val() || {};
      setSettings(prev => ({ ...prev, ...loadedSettings }));
    };
    loadSettings();
  }, [userUID]);
  
  const handleAvatarUpload = async (e) => {
    if (e.target.files[0]) {
      const url = await uploadToImgBB(e.target.files[0]);
      if (url) {
        setPhotoURL(url);
      }
    }
  };
  
  const handleUpdateProfile = async () => {
    await update(ref(db, `users/${userUID}`), { name, bio, photoURL });
    setUserData(prev => ({ ...prev, name, bio, photoURL }));
    showToast("Profile updated!");
    window.location.hash = "profile";
  };
  
  const handleLogout = async () => {
    await signOut(auth);
  };
  
  const handleDeleteAccount = async () => {
    if (confirm("Delete account permanently?")) {
      const user = auth.currentUser;
      await deleteUser(user);
      await remove(ref(db, `users/${userUID}`));
      await signOut(auth);
    }
  };
  
  const updateSetting = (key, value) => {
    set(ref(db, `userSettings/${userUID}/${key}`), value);
    setSettings(prev => ({ ...prev, [key]: value }));
  };
  
  return (
    <section id="settings-full-page" className="page active">
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
        <button className="back-btn" onClick={() => window.location.hash = 'profile'}><i className="fas fa-arrow-left"></i></button>
        <h3 style={{ fontSize: "20px" }}>Settings</h3>
      </div>
      
      <div className="glass-card">
        <div className="setting-item">
          <div>
            <div className="setting-label"><i className="fas fa-moon"></i> Dark Mode</div>
            <div className="setting-desc">Switch between light and dark theme</div>
          </div>
          <div className={`toggle-switch ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            <div className="toggle-knob"></div>
          </div>
        </div>
      </div>
      
      <div className="glass-card">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
          <img style={{ width: "88px", height: "88px", borderRadius: "50%", cursor: "pointer", border: "2px solid var(--primary)", objectFit: "cover" }}
               src={photoURL || `https://ui-avatars.com/api/?background=ff3b5c&color=fff&name=${encodeURIComponent(name)}`}
               onClick={() => document.getElementById("avatarUploadFull").click()} />
        </div>
        <input type="file" id="avatarUploadFull" accept="image/*" style={{ display: "none" }} onChange={handleAvatarUpload} />
        <label>Display name</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)} />
        <label>Bio</label>
        <textarea rows="2" placeholder="Write something about yourself..." value={bio} onChange={e => setBio(e.target.value)} />
        <button className="btn btn-primary" onClick={handleUpdateProfile}>Update Profile</button>
      </div>
      
      <div className="glass-card">
        <h4 className="section-title">🔒 Privacy & Security</h4>
        <div className="setting-item">
          <div><div className="setting-label"><i className="fas fa-eye"></i> Private Account</div><div className="setting-desc">Only followers can see your posts</div></div>
          <div className={`toggle-switch ${settings.privateAccount ? 'active' : ''}`} onClick={() => updateSetting('privateAccount', !settings.privateAccount)}>
            <div className="toggle-knob"></div>
          </div>
        </div>
        <div className="setting-item">
          <div><div className="setting-label"><i className="fas fa-comment-dots"></i> Allow Comments</div><div className="setting-desc">Who can comment on your posts</div></div>
          <select value={settings.commentPermission} onChange={e => updateSetting('commentPermission', e.target.value)} style={{ padding: "8px", borderRadius: "12px", background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <option value="everyone">Everyone</option>
            <option value="followers">Followers only</option>
            <option value="none">No one</option>
          </select>
        </div>
        <div className="setting-item">
          <div><div className="setting-label"><i className="fas fa-search"></i> Show in Search</div><div className="setting-desc">Allow others to find you via search</div></div>
          <div className={`toggle-switch ${settings.showInSearch ? 'active' : ''}`} onClick={() => updateSetting('showInSearch', !settings.showInSearch)}>
            <div className="toggle-knob"></div>
          </div>
        </div>
      </div>
      
      <div className="glass-card">
        <h4 className="section-title">💬 Chat Settings</h4>
        <div className="setting-item">
          <div><div className="setting-label"><i className="fas fa-check-double"></i> Read Receipts</div><div className="setting-desc">Show when you've read messages</div></div>
          <div className={`toggle-switch ${settings.readReceipts ? 'active' : ''}`} onClick={() => updateSetting('readReceipts', !settings.readReceipts)}>
            <div className="toggle-knob"></div>
          </div>
        </div>
        <div className="setting-item">
          <div><div className="setting-label"><i className="fas fa-clock"></i> Typing Indicators</div><div className="setting-desc">Show when you're typing</div></div>
          <div className={`toggle-switch ${settings.typingIndicators ? 'active' : ''}`} onClick={() => updateSetting('typingIndicators', !settings.typingIndicators)}>
            <div className="toggle-knob"></div>
          </div>
        </div>
      </div>
      
      <div className="glass-card">
        <h4 className="section-title">📢 Notifications</h4>
        <div className="setting-item">
          <div><div className="setting-label"><i className="fas fa-heart"></i> Like Notifications</div><div className="setting-desc">Get notified when someone likes your post</div></div>
          <div className={`toggle-switch ${settings.likeNotif ? 'active' : ''}`} onClick={() => updateSetting('likeNotif', !settings.likeNotif)}>
            <div className="toggle-knob"></div>
          </div>
        </div>
        <div className="setting-item">
          <div><div className="setting-label"><i className="fas fa-comment"></i> Comment Notifications</div><div className="setting-desc">Get notified when someone comments on your post</div></div>
          <div className={`toggle-switch ${settings.commentNotif ? 'active' : ''}`} onClick={() => updateSetting('commentNotif', !settings.commentNotif)}>
            <div className="toggle-knob"></div>
          </div>
        </div>
        <div className="setting-item">
          <div><div className="setting-label"><i className="fas fa-user-plus"></i> Follow Notifications</div><div className="setting-desc">Get notified when someone follows you</div></div>
          <div className={`toggle-switch ${settings.followNotif ? 'active' : ''}`} onClick={() => updateSetting('followNotif', !settings.followNotif)}>
            <div className="toggle-knob"></div>
          </div>
        </div>
      </div>
      
      <div className="glass-card">
        <button className="btn" onClick={handleLogout} style={{ background: "var(--primary-soft)", color: "var(--primary)", marginTop: "8px" }}>Logout</button>
        <button className="btn" onClick={handleDeleteAccount} style={{ background: "transparent", color: "#ff5c7c", marginTop: "8px", border: "1px solid #ff5c7c" }}>Delete Account</button>
      </div>
    </section>
  );
};

// Create Post Fab Component
const CreatePostFab = () => {
  const [showModal, setShowModal] = useState(false);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [images, setImages] = useState([]);
  const [locationCoords, setLocationCoords] = useState(null);
  
  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files);
    const remainingSlots = 10 - images.length;
    const filesToAdd = files.slice(0, remainingSlots);
    for (const file of filesToAdd) {
      if (file.type.startsWith('image/')) {
        const previewUrl = URL.createObjectURL(file);
        setImages(prev => [...prev, { file, previewUrl }]);
      }
    }
    e.target.value = '';
  };
  
  const removeImage = (index) => {
    URL.revokeObjectURL(images[index].previewUrl);
    setImages(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleSubmit = async () => {
    if (images.length === 0) {
      showToast("Please select at least one image");
      return;
    }
    showToast("Uploading images... 📤");
    const urls = [];
    for (const img of images) {
      const url = await uploadToImgBB(img.file);
      if (url) urls.push(url);
    }
    if (urls.length === 0) {
      showToast("Upload failed!");
      return;
    }
    const postId = push(ref(db, "posts")).key;
    const locationData = location ? { name: location, lat: locationCoords?.lat, lng: locationCoords?.lng } : null;
    await set(ref(db, `posts/${postId}`), {
      id: postId, userId: auth.currentUser.uid, images: urls, caption, location: locationData,
      timestamp: Date.now(), likeCount: 0, commentCount: 0, likes: {}
    });
    for (const img of images) URL.revokeObjectURL(img.previewUrl);
    setShowModal(false);
    setCaption('');
    setLocation('');
    setImages([]);
    setLocationCoords(null);
    showToast("Post shared! 🎉");
  };
  
  const LocationPicker = () => {
    const mapEvents = useMapEvents({
      click: async (e) => {
        setLocationCoords(e.latlng);
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}&zoom=18&addressdetails=1`);
          const data = await res.json();
          setLocation(data.display_name || `${e.latlng.lat}, ${e.latlng.lng}`);
        } catch (err) {
          setLocation(`${e.latlng.lat}, ${e.latlng.lng}`);
        }
      }
    });
    return null;
  };
  
  if (!showModal) {
    return (
      <div className="fab" onClick={() => setShowModal(true)}>
        <i className="fas fa-plus"></i>
      </div>
    );
  }
  
  return (
    <div className="modal-create">
      <div className="create-inner">
        <h3>✨ New moment</h3>
        <textarea rows="3" placeholder="Write a caption... use #hashtags" value={caption} onChange={e => setCaption(e.target.value)}></textarea>
        <div className="image-counter">{images.length} / 10 images selected</div>
        <div className="image-preview-grid">
          {images.map((img, idx) => (
            <div key={idx} className="preview-item">
              <img src={img.previewUrl} />
              <button className="remove-image-btn" onClick={() => removeImage(idx)}><i className="fas fa-times"></i></button>
            </div>
          ))}
          {images.length < 10 && (
            <div className="add-more-btn" onClick={() => document.getElementById("postImagesInput").click()}>
              <i className="fas fa-plus-circle"></i><span>Add More</span>
            </div>
          )}
        </div>
        <input type="file" id="postImagesInput" multiple accept="image/*" style={{ display: "none" }} onChange={handleImageSelect} />
        <input type="text" placeholder="📍 Add location (optional)" value={location} onChange={e => setLocation(e.target.value)} />
        <div className="map-container">
          <MapContainer center={[51.505, -0.09]} zoom={13} style={{ height: "100%", width: "100%", borderRadius: "16px" }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OSM' />
            {locationCoords && <Marker position={[locationCoords.lat, locationCoords.lng]} />}
            <LocationPicker />
          </MapContainer>
        </div>
        <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={() => {
            images.forEach(img => URL.revokeObjectURL(img.previewUrl));
            setShowModal(false);
          }}>Cancel</button>
          <button className="btn-primary" style={{ flex: 1 }} onClick={handleSubmit}>Share</button>
        </div>
      </div>
    </div>
  );
};

// Helper functions that need to be globally accessible
const openCommentModal = async (postId, userUID, onRefresh) => {
  // This is a complex modal - implementing inline
  const modal = document.createElement("div");
  modal.className = "comment-modal";
  modal.innerHTML = `
    <div class="comment-modal-header"><h3>Comments</h3><button class="close-comment-btn">&times;</button></div>
    <div class="comments-list" id="commentsList"></div>
    <div class="comment-input-container">
      <img class="reply-avatar" src="" id="commentUserAvatar" style="width:32px;height:32px;border-radius:50%;">
      <input type="text" class="comment-input" id="commentInput" placeholder="Add a comment...">
      <button class="comment-image-btn" id="commentImageBtn"><i class="fas fa-image"></i></button>
      <button class="post-comment-btn" id="postCommentBtn">Post</button>
    </div>
    <input type="file" id="commentImageFile" accept="image/*" style="display:none;">
    <div id="commentImagePreview" style="padding:0 16px 12px;"></div>
  `;
  document.body.appendChild(modal);
  
  const user = auth.currentUser;
  const userDataSnap = await get(ref(db, `users/${user.uid}`));
  const userData = userDataSnap.val();
  document.getElementById("commentUserAvatar").src = userData?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userData?.name || '')}`;
  
  let pendingCommentImage = null;
  let replyStates = {};
  
  const loadComments = async () => {
    const commentsSnap = await get(ref(db, `comments/${postId}`));
    const comments = commentsSnap.val() || {};
    const container = modal.querySelector("#commentsList");
    let html = "";
    for (const [cid, c] of Object.entries(comments).reverse()) {
      const authorSnap = await get(ref(db, `users/${c.authorId}`));
      const author = authorSnap.val() || { name: c.authorName, photoURL: null };
      const isLiked = c.likes && c.likes[user.uid];
      const repliesSnap = await get(ref(db, `commentReplies/${postId}/${cid}`));
      const replies = repliesSnap.val() || {};
      const replyCount = Object.keys(replies).length;
      const showReplies = replyStates[`${postId}_${cid}`] || false;
      html += `<div class="comment-item" data-cid="${cid}">
        <img class="comment-avatar" src="${author.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(author.name)}`}">
        <div class="comment-content">
          <div><span class="comment-author">${escapeHtml(author.name)}</span> <span class="comment-text">${escapeHtml(c.text)}</span></div>
          ${c.image ? `<img src="${c.image}" class="comment-image" onclick="window.showFullscreen('${c.image}')">` : ''}
          <div class="comment-time">${new Date(c.timestamp).toLocaleString()}</div>
          <div class="comment-actions">
            <button class="comment-like-btn" data-cid="${cid}"><i class="${isLiked ? 'fas' : 'far'} fa-heart"></i> ${Object.keys(c.likes || {}).length}</button>
            <button class="comment-reply-btn" data-cid="${cid}">Reply</button>
          </div>
          <div class="replies-container" id="replies-${cid}" ${showReplies ? '' : 'style="display:none;"'}>
            ${await renderReplies(postId, cid, replies)}
          </div>
          ${replyCount > 0 ? `<button class="show-replies-btn" data-cid="${cid}">${showReplies ? 'Hide replies' : `View ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}</button>` : ''}
        </div>
      </div>`;
    }
    container.innerHTML = html || "<div style='text-align:center;padding:40px'>No comments yet</div>";
    
    document.querySelectorAll(".comment-like-btn").forEach(btn => {
      btn.onclick = async () => {
        const cid = btn.dataset.cid;
        const likeRef = ref(db, `comments/${postId}/${cid}/likes/${user.uid}`);
        const exists = (await get(likeRef)).exists();
        if (exists) await remove(likeRef);
        else await set(likeRef, true);
        await loadComments();
      };
    });
    
    document.querySelectorAll(".comment-reply-btn").forEach(btn => {
      btn.onclick = () => {
        const replyText = prompt("Write your reply...");
        if (replyText && replyText.trim()) {
          addReplyWithImage(postId, btn.dataset.cid, replyText.trim(), null);
        }
      };
    });
    
    document.querySelectorAll(".show-replies-btn").forEach(btn => {
      btn.onclick = () => {
        const cid = btn.dataset.cid;
        const key = `${postId}_${cid}`;
        replyStates[key] = !replyStates[key];
        loadComments();
      };
    });
  };
  
  const renderReplies = async (postId, commentId, replies) => {
    let html = "";
    for (const [rid, rep] of Object.entries(replies)) {
      const replyAuthorSnap = await get(ref(db, `users/${rep.authorId}`));
      const replyAuthor = replyAuthorSnap.val() || { name: rep.authorName };
      html += `<div class="reply-item">
        <img class="reply-avatar" src="${replyAuthor.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(replyAuthor.name)}`}">
        <div class="reply-content">
          <span class="reply-author">${escapeHtml(replyAuthor.name)}</span>
          <span class="reply-text">${escapeHtml(rep.text)}</span>
          ${rep.image ? `<img src="${rep.image}" class="reply-image" onclick="window.showFullscreen('${rep.image}')">` : ''}
        </div>
      </div>`;
    }
    return html;
  };
  
  const addReplyWithImage = async (postId, commentId, text, imageUrl) => {
    await push(ref(db, `commentReplies/${postId}/${commentId}`), {
      authorId: user.uid, authorName: userData.name, text, image: imageUrl || null, timestamp: Date.now()
    });
    await loadComments();
  };
  
  document.getElementById("commentImageBtn").onclick = () => document.getElementById("commentImageFile").click();
  document.getElementById("commentImageFile").onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type.startsWith('image/')) {
        showToast("Uploading image... 📸");
        const url = await uploadToImgBB(file);
        if (url) {
          pendingCommentImage = url;
          const previewContainer = modal.querySelector("#commentImagePreview");
          previewContainer.innerHTML = `<div class="comment-image-preview"><img src="${url}"><button class="remove-comment-image" id="removeCommentImageBtn"><i class="fas fa-times"></i></button></div>`;
          document.getElementById("removeCommentImageBtn").onclick = () => {
            pendingCommentImage = null;
            previewContainer.innerHTML = "";
          };
          showToast("Image attached! ✅");
        } else showToast("Upload failed!");
      } else showToast("Please select an image file");
    }
    e.target.value = '';
  };
  
  document.getElementById("postCommentBtn").onclick = async () => {
    const text = modal.querySelector("#commentInput").value.trim();
    if (!text && !pendingCommentImage) {
      showToast("Please write something or add an image");
      return;
    }
    await push(ref(db, `comments/${postId}`), {
      authorId: user.uid, authorName: userData.name, authorPhoto: userData.photoURL,
      text: text || "", image: pendingCommentImage || null, timestamp: Date.now(), likes: {}
    });
    await runTransaction(ref(db, `posts/${postId}/commentCount`), (c) => (c || 0) + 1);
    modal.querySelector("#commentInput").value = "";
    pendingCommentImage = null;
    modal.querySelector("#commentImagePreview").innerHTML = "";
    await loadComments();
    if (onRefresh) onRefresh();
  };
  
  modal.querySelector(".close-comment-btn").onclick = () => modal.remove();
  await loadComments();
};

const sharePostInMessages = async (postId, userUID) => {
  const followingSnap = await get(ref(db, `following/${userUID}`));
  const following = followingSnap.val() || {};
  const friends = Object.keys(following);
  if (!friends.length) {
    showToast("No friends to share with");
    return;
  }
  const modal = document.createElement("div");
  modal.className = "share-modal";
  modal.innerHTML = `<div class="create-inner" style="max-width:380px;"><h3><i class="fas fa-share-alt"></i> Share Post</h3><div id="friendsListForShare" style="max-height:400px; overflow-y:auto;"></div><button class="btn btn-secondary" id="closeShareModal">Cancel</button></div>`;
  document.body.appendChild(modal);
  let container = modal.querySelector("#friendsListForShare");
  let friendsHtml = "";
  for (const fid of friends) {
    const userSnap = await get(ref(db, `users/${fid}`));
    const user = userSnap.val();
    if (user) {
      friendsHtml += `<div class="chat-user-item" data-uid="${fid}" data-name="${escapeHtml(user.name)}">
        <img class="avatar-small" src="${user.photoURL || `https://ui-avatars.com/api/?background=ff3b5c&color=fff&name=${encodeURIComponent(user.name)}`}">
        <div><strong>${escapeHtml(user.name)}</strong></div>
      </div>`;
    }
  }
  container.innerHTML = friendsHtml || "<div class='glass-card'>No friends to share with</div>";
  container.querySelectorAll(".chat-user-item").forEach(el => {
    el.onclick = async () => {
      const friendId = el.dataset.uid;
      const chatId = userUID < friendId ? `${userUID}_${friendId}` : `${friendId}_${userUID}`;
      const postSnap = await get(ref(db, `posts/${postId}`));
      const post = postSnap.val();
      await push(ref(db, `messages/${chatId}`), {
        from: userUID, text: `📷 Shared a post: ${post.caption || "Check out this post!"}`,
        image: post.images?.[0], postId: postId, timestamp: Date.now()
      });
      modal.remove();
      showToast(`Shared with ${el.dataset.name}!`);
    };
  });
  modal.querySelector("#closeShareModal").onclick = () => modal.remove();
};

const searchByHashtag = async (hashtag) => {
  window.location.hash = "explore";
  setTimeout(async () => {
    const postsSnap = await get(ref(db, "posts"));
    const posts = Object.entries(postsSnap.val() || {}).map(([id, p]) => ({ id, ...p }));
    const filtered = posts.filter(p => p.caption && p.caption.toLowerCase().includes(hashtag.toLowerCase()));
    const container = document.getElementById("explore-container");
    if (container) {
      let html = `<div class="glass-card"><h3>#${escapeHtml(hashtag)}</h3><div class="explore-grid">`;
      for (const p of filtered.slice(0, 30)) {
        if (p.images && p.images[0]) {
          html += `<div class="grid-item" data-pid="${p.id}"><img src="${p.images[0]}"></div>`;
        }
      }
      html += `</div></div>`;
      container.innerHTML = html;
      document.querySelectorAll(".grid-item").forEach(el => {
        el.onclick = () => window.location.hash = `post/${el.dataset.pid}`;
      });
    }
  }, 100);
};

// Make helper functions available globally
window.showFullscreen = showFullscreen;

// Render the app
const root = createRoot(document.getElementById('root'));
root.render(<App />);