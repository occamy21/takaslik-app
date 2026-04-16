import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import './App.css';
import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged,
} from 'firebase/auth';
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, getCountFromServer,
} from 'firebase/firestore';

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = 'denizfurkan030@gmail.com';

const CITIES = ['İstanbul', 'Bursa', 'Tekirdağ', 'Edirne', 'Kırklareli', 'Kocaeli', 'Yalova'];

const CATEGORIES = {
  'Kitap':        ['Test Kitabı', 'Okuma Kitabı', 'Ders Kitabı', 'Çizgi Roman'],
  'Oyun':         ['Video Oyunu', 'Kutu Oyunu', 'Kart Oyunu', 'Masaüstü Oyunu'],
  'Ders Notları': ['Matematik', 'Türkçe', 'Fizik', 'Kimya', 'Biyoloji'],
  'Ders Eğitimi': ['Bireysel Dersler', 'Grup Dersler', 'Online Eğitim', 'Seminer'],
  'Diğer':        ['Elektronik', 'Spor Ekipmanı', 'Hobi Malzemeleri', 'Koleksiyonlar'],
};

const CONDITIONS = ['Yeni', 'Çok İyi', 'İyi', 'Orta'];

const CAT = {
  dark: {
    'Kitap':        { emoji: '📚', bg: '#1C1A0D', text: '#FCD34D', border: '#3D3315' },
    'Oyun':         { emoji: '🎮', bg: '#17133A', text: '#C4B5FD', border: '#2D2558' },
    'Ders Notları': { emoji: '📝', bg: '#0D2018', text: '#6EE7B7', border: '#163525' },
    'Ders Eğitimi': { emoji: '🎓', bg: '#0D1B30', text: '#93C5FD', border: '#152D4A' },
    'Diğer':        { emoji: '📦', bg: '#20100F', text: '#FCA5A5', border: '#3A1A18' },
  },
  light: {
    'Kitap':        { emoji: '📚', bg: '#FEF9C3', text: '#92400E', border: '#FCD34D' },
    'Oyun':         { emoji: '🎮', bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD' },
    'Ders Notları': { emoji: '📝', bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
    'Ders Eğitimi': { emoji: '🎓', bg: '#DBEAFE', text: '#1E40AF', border: '#93C5FD' },
    'Diğer':        { emoji: '📦', bg: '#FFE4E6', text: '#9F1239', border: '#FCA5A5' },
  },
};

// ─── Theme Context ─────────────────────────────────────────────────────────────

const ThemeCtx = createContext('dark');

function useCAT(category) {
  const theme = useContext(ThemeCtx);
  return CAT[theme]?.[category] ?? CAT[theme]['Diğer'];
}

// ─── Router ───────────────────────────────────────────────────────────────────

function getRouteState() {
  const raw = window.location.hash.slice(1) || '/explore';
  const [path, query = ''] = raw.split('?');
  const page = path.replace(/^\//, '') || 'explore';
  const params = {};
  query.split('&').forEach(p => {
    const [k, v] = p.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return { page, params };
}

function useRouter() {
  const [state, setState] = useState(getRouteState);
  useEffect(() => {
    const handler = () => setState(getRouteState());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  const navigate = useCallback((page, params = {}) => {
    const q = Object.entries(params)
      .filter(([, v]) => v)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    window.location.hash = `/${page}${q ? '?' + q : ''}`;
  }, []);
  return { page: state.page, params: state.params, navigate };
}

// ─── LocalStorage ─────────────────────────────────────────────────────────────

function useLS(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; }
    catch { return init; }
  });
  const set = useCallback((val) => {
    setV(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);
  return [v, set];
}

// ─── Firebase Auth Error Translator ──────────────────────────────────────────

function authError(code) {
  const map = {
    'auth/email-already-in-use': 'Bu e-posta zaten kullanılıyor',
    'auth/user-not-found':       'E-posta veya şifre hatalı',
    'auth/wrong-password':       'E-posta veya şifre hatalı',
    'auth/invalid-credential':   'E-posta veya şifre hatalı',
    'auth/invalid-email':        'Geçersiz e-posta',
    'auth/weak-password':        'Şifre en az 6 karakter olmalı',
    'auth/too-many-requests':    'Çok fazla deneme. Lütfen bekle.',
  };
  return map[code] || 'Bir hata oluştu';
}

// ─── Auth Hook (Firebase) ─────────────────────────────────────────────────────

function useAuth() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        const snap = await getDoc(doc(db, 'users', fbUser.uid));
        const data = snap.exists() ? snap.data() : {};
        setUser({
          id:       fbUser.uid,
          email:    fbUser.email,
          name:     data.name || fbUser.email,
          is_admin: fbUser.email === ADMIN_EMAIL,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { ok: true };
    } catch (err) { return { ok: false, error: authError(err.code) }; }
  };

  const register = async (email, password, name) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: email.toLowerCase().trim(),
        name:  name.trim(),
        createdAt: serverTimestamp(),
      });
      return { ok: true };
    } catch (err) { return { ok: false, error: authError(err.code) }; }
  };

  const logout = () => signOut(auth);

  return { user, loading, login, register, logout, isAuth: !!user };
}

// ─── Normalize Firestore Product ──────────────────────────────────────────────

function normalize(p) {
  return {
    ...p,
    image:     p.imageUrl || null,
    city:      p.location || p.city || '',
    desc:      p.description || p.desc || '',
    owner:     p.ownerName || p.owner || '?',
    price:     p.value || 0,
    priceType: 'takas',
    rating:    0,
    sub:       p.sub || '',
    createdAt: p.createdAt?.seconds
      ? p.createdAt.seconds * 1000
      : (p.createdAt ? new Date(p.createdAt).getTime() : Date.now()),
  };
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <svg width="30" height="30" viewBox="0 0 34 34" fill="none">
      <rect x="1.5"  y="3"  width="31" height="10" rx="5"   stroke="#F04747" strokeWidth="2.4" fill="none"/>
      <rect x="5"    y="6"  width="16" height="4"  rx="2"   stroke="#F04747" strokeWidth="1.5" fill="none"/>
      <rect x="13"   y="7"  width="8"  height="24" rx="4"   stroke="#F04747" strokeWidth="2.4" fill="none"/>
      <rect x="15.5" y="10" width="3"  height="17" rx="1.5" stroke="#F04747" strokeWidth="1.4" fill="none"/>
    </svg>
  );
}

// ─── Theme Toggle Button ───────────────────────────────────────────────────────

function ThemeToggle({ theme, onToggle }) {
  return (
    <button className="theme-toggle" onClick={onToggle}
      title={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'} aria-label="Tema değiştir">
      {theme === 'dark' ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3a9 9 0 100 18A9 9 0 0012 3zm0 2a7 7 0 110 14A7 7 0 0112 5zm0 1a6 6 0 100 12A6 6 0 0012 6z"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          <circle cx="12" cy="12" r="4" fill="currentColor"/>
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
        </svg>
      )}
    </button>
  );
}

// ─── Product Card (Grid) ──────────────────────────────────────────────────────

function ProductCard({ product, favorites, onFav }) {
  const cs  = useCAT(product.category);
  const fav = favorites.includes(product.id);
  const ago = (() => {
    const d = Math.floor((Date.now() - (product.createdAt || 0)) / 86400000);
    return d === 0 ? 'Bugün' : d === 1 ? 'Dün' : `${d} gün önce`;
  })();

  return (
    <article className="pcard">
      <div className="pcard-img" style={{ background: cs.bg }}>
        {product.image
          ? <img src={product.image} alt={product.title} />
          : <span className="pcard-emoji">{cs.emoji}</span>
        }
        <button className={`fav-btn ${fav ? 'on' : ''}`}
          onClick={e => { e.stopPropagation(); onFav(product.id); }} aria-label="Favoriye ekle">
          {fav ? '❤️' : '🤍'}
        </button>
        <span className="pcard-cat" style={{ background: cs.bg, color: cs.text }}>
          {cs.emoji} {product.category}
        </span>
      </div>
      <div className="pcard-body">
        <h3 className="pcard-title">{product.title}</h3>
        <div className="pcard-meta">
          <span className="pcard-city">📍 {product.city}</span>
          <span className="pcard-cond">{product.condition}</span>
        </div>
        <p className="pcard-desc">{product.desc}</p>
        {product.wishlist && (
          <div className="pcard-wish"><span className="wish-pill">🔄 {product.wishlist}</span></div>
        )}
        <div className="pcard-foot"><span className="price-tag takas">🔄 Takas</span></div>
        <div className="pcard-owner">
          <span className="owner-av">{product.owner[0]?.toUpperCase()}</span>
          <span className="owner-name">{product.owner}</span>
          <span className="pcard-ago">{ago}</span>
        </div>
      </div>
    </article>
  );
}

// ─── Swipe Card ───────────────────────────────────────────────────────────────

function SwipeCard({ product, onSwipe, isTop, zIndex, stackIndex, favorites, onFav }) {
  const [drag, setDrag]     = useState({ x: 0, y: 0, active: false });
  const [flying, setFlying] = useState(null);
  const startPos = useRef(null);
  const cs  = useCAT(product.category);
  const fav = favorites.includes(product.id);

  const getPos = e => { const s = e.touches ? e.touches[0] : e; return { x: s.clientX, y: s.clientY }; };

  const onStart = e => {
    if (!isTop || flying) return;
    startPos.current = getPos(e);
    setDrag({ x: 0, y: 0, active: true });
  };
  const onMove = e => {
    if (!drag.active || !startPos.current) return;
    const p = getPos(e);
    setDrag(d => ({ ...d, x: p.x - startPos.current.x, y: p.y - startPos.current.y }));
  };
  const onEnd = () => {
    if (!drag.active) return;
    if (Math.abs(drag.x) >= 90) {
      const dir = drag.x > 0 ? 'right' : 'left';
      setFlying(dir);
      setTimeout(() => onSwipe(dir, product), 380);
    } else {
      setDrag({ x: 0, y: 0, active: false });
    }
    startPos.current = null;
  };

  const dx     = flying === 'right' ? 900 : flying === 'left' ? -900 : drag.x;
  const dy     = flying ? -80 : drag.y * 0.2;
  const rotate = flying === 'right' ? 28 : flying === 'left' ? -28 : drag.x * 0.07;
  const likeOp = Math.min(1, Math.max(0,  drag.x / 80));
  const passOp = Math.min(1, Math.max(0, -drag.x / 80));

  return (
    <div className="sc" style={{
        zIndex,
        transform: isTop
          ? `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`
          : `scale(${1 - stackIndex * 0.045}) translateY(${stackIndex * 14}px)`,
        transition: drag.active ? 'none'
          : flying ? 'transform 0.38s cubic-bezier(0.55,0,1,0.45), opacity 0.38s ease'
          : 'transform 0.42s cubic-bezier(0.175,0.885,0.32,1.275)',
        opacity: flying ? 0 : 1,
        cursor: isTop ? (drag.active ? 'grabbing' : 'grab') : 'default',
        pointerEvents: isTop ? 'auto' : 'none',
      }}
      onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
      onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
    >
      <div className="sc-stamp sc-stamp-like" style={{ opacity: likeOp }}><span>❤</span> Teklif Ver</div>
      <div className="sc-stamp sc-stamp-pass" style={{ opacity: passOp }}><span>✕</span> Geç</div>
      <div className="sc-img" style={{ background: cs.bg }}>
        {product.image
          ? <img src={product.image} alt={product.title} draggable="false" />
          : <span className="sc-emoji">{cs.emoji}</span>
        }
        <div className="sc-img-fade" />
        <div className="sc-img-top">
          <span className="sc-cat" style={{ background: cs.bg, color: cs.text }}>{cs.emoji} {product.category}</span>
          <button className={`sc-fav ${fav ? 'on' : ''}`} onClick={e => { e.stopPropagation(); onFav(product.id); }}>
            {fav ? '❤️' : '🤍'}
          </button>
        </div>
      </div>
      <div className="sc-body">
        <h3 className="sc-title">{product.title}</h3>
        <div className="sc-meta">
          <span className="sc-city">📍 {product.city}</span>
          <span className="sc-cond">{product.condition}</span>
        </div>
        <p className="sc-desc">{product.desc}</p>
        {product.wishlist && (
          <div className="sc-wish">
            <span className="sc-wish-label">🔄 Aradığı:</span>
            <span className="sc-wish-text">{product.wishlist}</span>
          </div>
        )}
        <div className="sc-owner">
          <span className="owner-av">{product.owner[0]?.toUpperCase()}</span>
          <span className="owner-name">{product.owner}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Match Modal ──────────────────────────────────────────────────────────────

function MatchModal({ onClose, onGoChat }) {
  return (
    <div className="match-overlay" onClick={onClose}>
      <div className="match-modal" onClick={e => e.stopPropagation()}>
        <div className="match-burst">🎉</div>
        <h2 className="match-title">Eşleşme!</h2>
        <p className="match-sub">İkiniz de birbirinin ürününü beğendiniz. Şimdi konuşabilirsiniz!</p>
        <div className="match-actions">
          <button className="btn-red" onClick={onGoChat}>Sohbete Git</button>
          <button className="btn-ghost" onClick={onClose}>Keşfete Devam</button>
        </div>
      </div>
    </div>
  );
}

// ─── Swipe View ───────────────────────────────────────────────────────────────

function SwipeView({ products, favorites, onFav, user, navigate }) {
  const [gone,       setGone]       = useState(new Set());
  const [likedIds,   setLikedIds]   = useState([]);
  const [matchModal, setMatchModal] = useState(false);

  const remaining = products.filter(p => !gone.has(p.id));
  const topThree  = remaining.slice(0, 3);

  const handleSwipe = useCallback(async (dir, product) => {
    setGone(g => new Set([...g, product.id]));
    if (dir !== 'right') return;
    setLikedIds(l => [...l, product.id]);

    try {
      // 1. Record like with compound ID for O(1) mutual lookup
      await setDoc(doc(db, 'likes', `${user.id}_${product.id}`), {
        userId: user.id, productId: product.id, createdAt: serverTimestamp(),
      });

      // 2. Get my products to check mutual likes
      const myProdsSnap = await getDocs(
        query(collection(db, 'products'), where('userId', '==', user.id))
      );

      for (const myProd of myProdsSnap.docs) {
        const mutualSnap = await getDoc(doc(db, 'likes', `${product.userId}_${myProd.id}`));
        if (!mutualSnap.exists()) continue;

        // 3. Check if match already exists
        const existingSnap = await getDocs(
          query(collection(db, 'matches'), where('participants', 'array-contains', user.id))
        );
        const alreadyMatched = existingSnap.docs.some(d => {
          const p = d.data().participants;
          return p.includes(user.id) && p.includes(product.userId);
        });
        if (alreadyMatched) return;

        // 4. Get other user's name
        const otherSnap = await getDoc(doc(db, 'users', product.userId));
        const otherName = otherSnap.exists() ? otherSnap.data().name : '?';

        // 5. Create match with denormalized data for fast listing
        await addDoc(collection(db, 'matches'), {
          participants:   [user.id, product.userId],
          user1Id:        user.id,
          user1Name:      user.name,
          user2Id:        product.userId,
          user2Name:      otherName,
          product1Id:     product.id,
          product1Title:  product.title,
          product2Id:     myProd.id,
          product2Title:  myProd.data().title,
          createdAt:      serverTimestamp(),
        });
        setMatchModal(true);
        return;
      }
    } catch (err) {
      console.error('Like error:', err);
    }
  }, [user]);

  const handleBtnSwipe = dir => { if (topThree.length) handleSwipe(dir, topThree[0]); };

  if (topThree.length === 0) return (
    <div className="swipe-done">
      <div className="sd-icon">🎉</div>
      <h3>Hepsi bitti!</h3>
      <p>{likedIds.length > 0 ? `${likedIds.length} ürüne takas teklifi verdin.` : 'Tüm ilanları gördün.'}</p>
      <button className="btn-red" onClick={() => { setGone(new Set()); setLikedIds([]); }}>Yeniden Başla</button>
    </div>
  );

  return (
    <>
      {matchModal && (
        <MatchModal onClose={() => setMatchModal(false)} onGoChat={() => { setMatchModal(false); navigate('matches'); }} />
      )}
      <div className="swipe-view">
        <div className="swipe-progress">
          <span>{remaining.length} ilan kaldı</span>
          {likedIds.length > 0 && <span className="swipe-liked-count">❤ {likedIds.length} teklif</span>}
        </div>
        <div className="swipe-stack">
          {[...topThree].reverse().map((product, revIdx) => {
            const stackIdx = topThree.length - 1 - revIdx;
            return (
              <SwipeCard key={product.id} product={product} onSwipe={handleSwipe}
                isTop={stackIdx === 0} zIndex={topThree.length - stackIdx}
                stackIndex={stackIdx} favorites={favorites} onFav={onFav} />
            );
          })}
        </div>
        <div className="swipe-actions">
          <button className="swipe-btn pass" onClick={() => handleBtnSwipe('left')} title="Geç">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
          <button className="swipe-btn like" onClick={() => handleBtnSwipe('right')} title="Teklif Ver">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
        </div>
        <div className="swipe-hint"><span>← geç</span><span>takas teklif et →</span></div>
      </div>
    </>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({ f, set }) {
  const theme = useContext(ThemeCtx);
  const catList = Object.keys(CAT[theme]);
  return (
    <div className="filter-bar">
      <div className="filter-search">
        <span className="search-ico">🔍</span>
        <input type="text" placeholder="Ürün, not, ders ara..." value={f.q}
          onChange={e => set({ ...f, q: e.target.value })} />
        {f.q && <button className="search-clear" onClick={() => set({ ...f, q: '' })}>✕</button>}
      </div>
      <div className="filter-selects">
        <select value={f.cat} onChange={e => set({ ...f, cat: e.target.value })}>
          <option value="">Tüm Kategoriler</option>
          {catList.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={f.city} onChange={e => set({ ...f, city: e.target.value })}>
          <option value="">Tüm Şehirler</option>
          {CITIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={f.sort} onChange={e => set({ ...f, sort: e.target.value })}>
          <option value="new">En Yeni</option>
          <option value="az">A → Z</option>
        </select>
      </div>
    </div>
  );
}

// ─── Explore Page ─────────────────────────────────────────────────────────────

const EMPTY_F = { q: '', cat: '', city: '', sort: 'new' };

function ExplorePage({ favorites, onFav, user, navigate }) {
  const theme = useContext(ThemeCtx);
  const [mode,     setMode]     = useState('swipe');
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [f, setF]               = useState(EMPTY_F);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    getDocs(q)
      .then(snap => {
        const list = snap.docs
          .filter(d => d.data().userId !== user.id)
          .map(d => normalize({ id: d.id, ...d.data() }));
        setProducts(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  let list = products.filter(p => {
    const ql = f.q.toLowerCase();
    if (ql && !p.title.toLowerCase().includes(ql) && !p.desc.toLowerCase().includes(ql)) return false;
    if (f.cat  && p.category !== f.cat)  return false;
    if (f.city && p.city     !== f.city) return false;
    return true;
  });
  list = [...list].sort((a, b) =>
    f.sort === 'az' ? a.title.localeCompare(b.title) : (b.createdAt || 0) - (a.createdAt || 0)
  );

  const catStyles = CAT[theme];

  return (
    <div className="explore-page">
      <div className="mode-toggle">
        <button className={mode === 'swipe' ? 'active' : ''} onClick={() => setMode('swipe')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          Keşfet
        </button>
        <button className={mode === 'grid' ? 'active' : ''} onClick={() => setMode('grid')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          Tüm İlanlar
        </button>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /><p>Yükleniyor...</p></div>
      ) : mode === 'swipe' ? (
        <SwipeView products={list} favorites={favorites} onFav={onFav} user={user} navigate={navigate} />
      ) : (
        <>
          <FilterBar f={f} set={setF} />
          <div className="cat-pills">
            <button className={`pill ${!f.cat ? 'active' : ''}`} onClick={() => setF({ ...f, cat: '' })}>Tümü</button>
            {Object.entries(catStyles).map(([name, s]) => (
              <button key={name} className={`pill ${f.cat === name ? 'active' : ''}`}
                onClick={() => setF({ ...f, cat: f.cat === name ? '' : name })}
                style={f.cat === name ? { background: s.bg, color: s.text, borderColor: s.border } : {}}>
                {s.emoji} {name}
              </button>
            ))}
          </div>
          <div className="explore-top">
            <span className="result-count"><strong>{list.length}</strong> ilan</span>
            {(f.cat || f.city || f.q) && (
              <button className="clear-btn" onClick={() => setF(EMPTY_F)}>Filtreleri Temizle</button>
            )}
          </div>
          {list.length === 0 ? (
            <div className="empty-state">
              <div className="es-icon">🔍</div>
              <h3>Sonuç bulunamadı</h3>
              <p>Farklı filtreler deneyin veya ilk ilanı sen ekle!</p>
              <button className="btn-red" onClick={() => navigate('add')}>İlan Ekle</button>
            </div>
          ) : (
            <div className="pgrid">
              {list.map(p => <ProductCard key={p.id} product={p} favorites={favorites} onFav={onFav} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Add Page ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = { title: '', category: '', sub: '', city: '', condition: 'İyi', desc: '', wishlist: '' };

function AddPage({ user, navigate }) {
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const ref = await addDoc(collection(db, 'products'), {
        userId:      user.id,
        ownerName:   user.name,
        title:       form.title.trim(),
        description: form.desc.trim(),
        category:    form.category,
        condition:   form.condition,
        location:    form.city,
        wishlist:    form.wishlist.trim(),
        imageUrl:    null, // TODO: Firebase Storage
        value:       0,
        createdAt:   serverTimestamp(),
      });
      if (ref.id) { setDone(true); setTimeout(() => navigate('explore'), 1600); }
      else setError('Bir hata oluştu');
    } catch (err) {
      setError(err.message || 'Sunucu hatası');
    }
    setLoading(false);
  };

  if (done) return (
    <div className="add-page">
      <div className="success-box">
        <div style={{ fontSize: '2.5rem' }}>✅</div>
        <h2>İlan Yayında!</h2>
        <p>Ürününüz tüm kullanıcıların havuzuna düştü.</p>
      </div>
    </div>
  );

  return (
    <div className="add-page">
      <div className="add-card">
        <h2>Yeni İlan</h2>
        <p className="add-sub">Takaslamak istediğin ürünü ekle</p>
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={handleSubmit} className="add-form">
          <div className="fg">
            <label>Başlık *</label>
            <input type="text" placeholder="Ürün adı" value={form.title}
              onChange={e => set('title', e.target.value)} required />
          </div>
          <div className="fg-row">
            <div className="fg">
              <label>Kategori *</label>
              <select value={form.category} onChange={e => { set('category', e.target.value); set('sub', ''); }} required>
                <option value="">Seçin</option>
                {Object.keys(CATEGORIES).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Alt Kategori</label>
              <select value={form.sub} onChange={e => set('sub', e.target.value)} disabled={!form.category}>
                <option value="">Seçin</option>
                {(form.category ? CATEGORIES[form.category] : []).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="fg-row">
            <div className="fg">
              <label>Şehir *</label>
              <select value={form.city} onChange={e => set('city', e.target.value)} required>
                <option value="">Seçin</option>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Durum *</label>
              <select value={form.condition} onChange={e => set('condition', e.target.value)}>
                {CONDITIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="fg">
            <label>Açıklama</label>
            <textarea placeholder="Ürün hakkında kısa bir açıklama..." value={form.desc}
              onChange={e => set('desc', e.target.value)} rows={3} />
          </div>
          <div className="fg wish-fg">
            <label className="wish-label-main">🔄 Ne karşılığında takas istersin?</label>
            <input type="text" placeholder="örn: Fizik kitabı, kutu oyunu, Steam kodu..."
              value={form.wishlist} onChange={e => set('wishlist', e.target.value)} />
            <span className="fg-hint">Swipe ekranında diğer kullanıcılara gösterilecek</span>
          </div>
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Yükleniyor...' : '🚀 İlanı Yayınla'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Matches Page ─────────────────────────────────────────────────────────────

function MatchesPage({ user, navigate }) {
  const [matches,     setMatches]     = useState([]);
  const [activeMatch, setActiveMatch] = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [newMsg,      setNewMsg]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const bottomRef = useRef(null);

  // Load matches (user can be user1 or user2)
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'matches'),
      where('participants', 'array-contains', user.id),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Real-time messages — Firebase superpower vs old polling
  useEffect(() => {
    if (!activeMatch) return;
    const q = query(
      collection(db, 'messages'),
      where('matchId', '==', activeMatch.id),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [activeMatch]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMsg = async e => {
    e.preventDefault();
    if (!newMsg.trim() || !activeMatch) return;
    const content = newMsg.trim();
    setNewMsg('');
    try {
      await addDoc(collection(db, 'messages'), {
        matchId:   activeMatch.id,
        senderId:  user.id,
        content,
        createdAt: serverTimestamp(),
      });
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="loading-state"><div className="spinner" /><p>Yükleniyor...</p></div>;

  if (matches.length === 0) return (
    <div className="matches-page">
      <div className="empty-state">
        <div className="es-icon">💬</div>
        <h3>Henüz eşleşme yok</h3>
        <p>Ürünlere takas teklifi ver — karşılıklı beğenince eşleşirsiniz!</p>
        <button className="btn-red" onClick={() => navigate('explore')}>Keşfete Git</button>
      </div>
    </div>
  );

  return (
    <div className="matches-page">
      <div className="matches-layout">
        <aside className={`matches-list ${activeMatch ? 'collapsed-mobile' : ''}`}>
          <div className="matches-list-head">
            <h3>Eşleşmeler</h3>
            <span className="match-count-badge">{matches.length}</span>
          </div>
          {matches.map(m => {
            const isU1   = m.user1Id === user?.id;
            const other  = isU1 ? m.user2Name  : m.user1Name;
            const myProd = isU1 ? m.product1Title : m.product2Title;
            const thProd = isU1 ? m.product2Title : m.product1Title;
            return (
              <button key={m.id}
                className={`match-item ${activeMatch?.id === m.id ? 'active' : ''}`}
                onClick={() => { setActiveMatch(m); setMessages([]); }}
              >
                <div className="mi-av">{other?.[0]?.toUpperCase() || '?'}</div>
                <div className="mi-info">
                  <div className="mi-name">{other}</div>
                  <div className="mi-swap">
                    <span className="mi-prod">{myProd}</span>
                    <span className="mi-arrow">⇄</span>
                    <span className="mi-prod">{thProd}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        {activeMatch ? (
          <section className="chat-room">
            <div className="chat-header">
              <button className="chat-back" onClick={() => setActiveMatch(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
              </button>
              <div className="chat-header-info">
                <div className="chat-other-name">
                  {activeMatch.user1Id === user?.id ? activeMatch.user2Name : activeMatch.user1Name}
                </div>
                <div className="chat-swap-label">
                  {activeMatch.user1Id === user?.id ? activeMatch.product1Title : activeMatch.product2Title}
                  {' ⇄ '}
                  {activeMatch.user1Id === user?.id ? activeMatch.product2Title : activeMatch.product1Title}
                </div>
              </div>
            </div>
            <div className="chat-messages">
              {messages.length === 0 && <div className="chat-empty">👋 Sohbeti sen başlat!</div>}
              {messages.map(msg => (
                <div key={msg.id} className={`chat-msg ${msg.senderId === user?.id ? 'mine' : 'theirs'}`}>
                  <div className="msg-bubble">{msg.content}</div>
                  <div className="msg-time">
                    {msg.createdAt?.toDate
                      ? msg.createdAt.toDate().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <form className="chat-form" onSubmit={sendMsg}>
              <input type="text" placeholder="Mesaj yaz..." value={newMsg}
                onChange={e => setNewMsg(e.target.value)} />
              <button type="submit" className="chat-send" disabled={!newMsg.trim()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </form>
          </section>
        ) : (
          <div className="chat-placeholder">
            <div className="cp-icon">💬</div>
            <p>Bir eşleşme seç</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Admin Page ───────────────────────────────────────────────────────────────

function AdminPage() {
  const [stats,    setStats]    = useState(null);
  const [users,    setUsers]    = useState([]);
  const [products, setProducts] = useState([]);
  const [tab,      setTab]      = useState('overview');
  const [loading,  setLoading]  = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [uc, pc, mc, msgc] = await Promise.all([
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(collection(db, 'products')),
        getCountFromServer(collection(db, 'matches')),
        getCountFromServer(collection(db, 'messages')),
      ]);
      setStats({
        users:    uc.data().count,
        products: pc.data().count,
        matches:  mc.data().count,
        messages: msgc.data().count,
      });

      const [uSnap, pSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'),    orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc'))),
      ]);
      setUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProducts(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const deleteProduct = async id => {
    if (!confirm('Bu ilanı silmek istediğinden emin misin?')) return;
    await deleteDoc(doc(db, 'products', id));
    setProducts(p => p.filter(x => x.id !== id));
  };

  if (loading) return <div className="loading-state"><div className="spinner" /><p>Admin paneli yükleniyor...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="admin-badge">👑 Admin</div>
        <h1>Yönetim Paneli</h1>
        <p className="admin-sub">takaslık.app — Tam Yetki</p>
      </div>

      {stats && (
        <div className="admin-stats">
          <div className="astat"><span className="astat-num">{stats.users}</span><span>Kullanıcı</span></div>
          <div className="astat"><span className="astat-num">{stats.products}</span><span>İlan</span></div>
          <div className="astat"><span className="astat-num">{stats.matches}</span><span>Eşleşme</span></div>
          <div className="astat"><span className="astat-num">{stats.messages}</span><span>Mesaj</span></div>
        </div>
      )}

      <div className="admin-tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Genel Bakış</button>
        <button className={tab === 'users'    ? 'active' : ''} onClick={() => setTab('users')}>Kullanıcılar ({users.length})</button>
        <button className={tab === 'products' ? 'active' : ''} onClick={() => setTab('products')}>İlanlar ({products.length})</button>
      </div>

      {tab === 'overview' && (
        <div className="admin-section">
          <h3>Son Kullanıcılar</h3>
          <div className="admin-table">
            {users.slice(0, 5).map(u => (
              <div key={u.id} className="admin-row">
                <span className="owner-av">{u.name?.[0]?.toUpperCase()}</span>
                <span className="admin-row-main">{u.name}</span>
                <span className="admin-row-sub">{u.email}</span>
                <span className="admin-row-date">
                  {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('tr-TR') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="admin-section">
          <h3>Tüm Kullanıcılar</h3>
          <div className="admin-table">
            {users.map(u => (
              <div key={u.id} className="admin-row">
                <span className="owner-av">{u.name?.[0]?.toUpperCase()}</span>
                <span className="admin-row-main">{u.name}</span>
                <span className="admin-row-sub">{u.email}</span>
                <span className="admin-row-date">
                  {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleDateString('tr-TR') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'products' && (
        <div className="admin-section">
          <h3>Tüm İlanlar</h3>
          <div className="admin-table">
            {products.map(p => (
              <div key={p.id} className="admin-row">
                <span className="admin-row-main">{p.title}</span>
                <span className="admin-row-sub">{p.category} · {p.ownerName}</span>
                <span className="admin-row-date">
                  {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString('tr-TR') : ''}
                </span>
                <button className="admin-del" onClick={() => deleteProduct(p.id)} title="Sil">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profile Page ─────────────────────────────────────────────────────────────

function ProfilePage({ favorites, onFav, navigate, user, onLogout }) {
  const [tab,        setTab]        = useState('my');
  const [myProducts, setMyProducts] = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'products'), where('userId', '==', user.id), orderBy('createdAt', 'desc'));
    getDocs(q)
      .then(snap => setMyProducts(snap.docs.map(d => normalize({ id: d.id, ...d.data() }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const displayName = user?.name || 'Kullanıcı';

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-av">{displayName[0]?.toUpperCase()}</div>
        <div className="profile-info">
          <div className="profile-name-row">
            <h2>{displayName}</h2>
            {user?.is_admin && <span className="admin-badge-sm">👑 Admin</span>}
          </div>
          <p className="profile-sub">{user?.email}</p>
          <div className="profile-stats">
            <div className="stat"><strong>{myProducts.length}</strong><span>İlan</span></div>
            <div className="stat"><strong>{favorites.length}</strong><span>Favori</span></div>
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Çıkış
        </button>
      </div>

      <div className="profile-tabs">
        <button className={tab === 'my'  ? 'active' : ''} onClick={() => setTab('my')}>İlanlarım ({myProducts.length})</button>
        <button className={tab === 'fav' ? 'active' : ''} onClick={() => setTab('fav')}>Favorilerim ({favorites.length})</button>
      </div>

      {tab === 'my' && (
        loading
          ? <div className="loading-state"><div className="spinner" /><p>Yükleniyor...</p></div>
          : myProducts.length === 0
            ? <div className="empty-state">
                <div className="es-icon">📦</div>
                <h3>Henüz ilan yok</h3>
                <p>İlk ürününü ekleyerek başla!</p>
                <button className="btn-red" onClick={() => navigate('add')}>İlan Ekle</button>
              </div>
            : <div className="pgrid">
                {myProducts.map(p => <ProductCard key={p.id} product={p} favorites={favorites} onFav={onFav} />)}
              </div>
      )}

      {tab === 'fav' && (
        favorites.length === 0
          ? <div className="empty-state">
              <div className="es-icon">🤍</div>
              <h3>Henüz favori yok</h3>
              <p>Keşfet sayfasında ilanları favorile!</p>
              <button className="btn-red" onClick={() => navigate('explore')}>Keşfete Git</button>
            </div>
          : <div className="empty-state">
              <div className="es-icon">❤️</div>
              <h3>{favorites.length} favori var</h3>
              <p>Keşfet sayfasında favorilediğin ilanları görebilirsin</p>
              <button className="btn-red" onClick={() => navigate('explore')}>Keşfete Git</button>
            </div>
      )}
    </div>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────

function AuthPage({ authHook }) {
  const [mode,    setMode]    = useState('login');
  const [form,    setForm]    = useState({ email: '', password: '', name: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError('');
    const result = mode === 'login'
      ? await authHook.login(form.email, form.password)
      : await authHook.register(form.email, form.password, form.name);
    if (!result.ok) setError(result.error);
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo-wrap"><Logo /></div>
          <span className="auth-wordmark">takaslık</span>
        </div>
        <p className="auth-tagline">Ürünlerini takas et · Yeni şeyler keşfet</p>

        <h2 className="auth-title">
          {mode === 'login' ? 'Tekrar hoş geldin 👋' : 'Hemen başla'}
        </h2>
        <p className="auth-sub">
          {mode === 'login'
            ? 'Hesabına giriş yap ve takasa devam et'
            : 'Saniyeler içinde ücretsiz hesap oluştur'}
        </p>

        {error && <div className="form-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <div className="fg">
              <label>İsim</label>
              <input type="text" placeholder="Adın Soyadın" value={form.name}
                onChange={e => set('name', e.target.value)} required autoFocus />
            </div>
          )}
          <div className="fg">
            <label>E-posta</label>
            <input type="email" placeholder="ornek@mail.com" value={form.email}
              onChange={e => set('email', e.target.value)} required autoFocus={mode === 'login'} />
          </div>
          <div className="fg">
            <label>Şifre</label>
            <input type="password" placeholder="••••••••" value={form.password}
              onChange={e => set('password', e.target.value)} required minLength={6} />
          </div>
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Bekle...' : mode === 'login' ? '→  Giriş Yap' : '→  Kayıt Ol'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login'
            ? <span>Hesabın yok mu? <button onClick={() => { setMode('register'); setError(''); }}>Kayıt Ol</button></span>
            : <span>Hesabın var mı? <button onClick={() => { setMode('login'); setError(''); }}>Giriş Yap</button></span>
          }
        </div>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const { page, navigate }        = useRouter();
  const [favorites, setFavorites] = useLS('takaslık_fav', []);
  const [theme, setTheme]         = useLS('takas_theme', 'dark');
  const authHook = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.background = theme === 'dark' ? '#0C0C0E' : '#F5F5F5';
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');
  const toggleFav   = useCallback(
    id => setFavorites(p => p.includes(id) ? p.filter(f => f !== id) : [...p, id]),
    [setFavorites]
  );

  // Firebase auth check — show spinner until resolved
  if (authHook.loading) {
    return (
      <ThemeCtx.Provider value={theme}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <div className="spinner" />
        </div>
      </ThemeCtx.Provider>
    );
  }

  if (!authHook.isAuth) {
    return (
      <ThemeCtx.Provider value={theme}>
        <AuthPage authHook={authHook} />
      </ThemeCtx.Provider>
    );
  }

  const { user } = authHook;
  const isAdmin  = user?.is_admin;

  const NAV = [
    {
      id: 'explore', label: 'Keşfet',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>,
    },
    {
      id: 'matches', label: 'Eşleşmeler',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
    },
    {
      id: 'add', label: 'İlan Ekle',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>,
    },
    ...(isAdmin ? [{
      id: 'admin', label: 'Admin',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    }] : []),
    {
      id: 'profile', label: 'Profil',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
    },
  ];

  return (
    <ThemeCtx.Provider value={theme}>
      <div className="app">
        <header className="header">
          <button className="logo-btn" onClick={() => navigate('explore')}>
            <Logo />
            <span className="logo-text">takaslık</span>
            {isAdmin && <span className="admin-dot" title="Admin" />}
          </button>
          <nav className="nav">
            {NAV.map(n => (
              <button key={n.id}
                className={`nav-btn ${page === n.id ? 'active' : ''} ${n.id === 'admin' ? 'nav-admin' : ''}`}
                onClick={() => navigate(n.id)}
              >
                {n.icon}<span>{n.label}</span>
              </button>
            ))}
          </nav>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        <main className="main">
          {page === 'explore' && <ExplorePage favorites={favorites} onFav={toggleFav} user={user} navigate={navigate} />}
          {page === 'matches' && <MatchesPage user={user} navigate={navigate} />}
          {page === 'add'     && <AddPage user={user} navigate={navigate} />}
          {page === 'admin'   && isAdmin  && <AdminPage />}
          {page === 'admin'   && !isAdmin && <ExplorePage favorites={favorites} onFav={toggleFav} user={user} navigate={navigate} />}
          {page === 'profile' && <ProfilePage favorites={favorites} onFav={toggleFav} navigate={navigate} user={user} onLogout={authHook.logout} />}
        </main>

        <nav className="bottom-nav">
          {NAV.map(n => (
            <button key={n.id} className={`bnav-btn ${page === n.id ? 'active' : ''}`} onClick={() => navigate(n.id)}>
              {n.icon}<span>{n.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </ThemeCtx.Provider>
  );
}
