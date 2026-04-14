import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL ?? '';

const CITIES = ['İstanbul', 'Bursa', 'Tekirdağ', 'Edirne', 'Kırklareli', 'Kocaeli', 'Yalova'];

const CATEGORIES = {
  'Kitap':        ['Test Kitabı', 'Okuma Kitabı', 'Ders Kitabı', 'Çizgi Roman'],
  'Oyun':         ['Video Oyunu', 'Kutu Oyunu', 'Kart Oyunu', 'Masaüstü Oyunu'],
  'Ders Notları': ['Matematik', 'Türkçe', 'Fizik', 'Kimya', 'Biyoloji'],
  'Ders Eğitimi': ['Bireysel Dersler', 'Grup Dersler', 'Online Eğitim', 'Seminer'],
  'Diğer':        ['Elektronik', 'Spor Ekipmanı', 'Hobi Malzemeleri', 'Koleksiyonlar'],
};

const CONDITIONS = ['Yeni', 'Çok İyi', 'İyi', 'Orta'];

const CAT_STYLE = {
  'Kitap':        { emoji: '📚', bg: '#1C1A0D', text: '#FCD34D', border: '#3D3315' },
  'Oyun':         { emoji: '🎮', bg: '#17133A', text: '#C4B5FD', border: '#2D2558' },
  'Ders Notları': { emoji: '📝', bg: '#0D2018', text: '#6EE7B7', border: '#163525' },
  'Ders Eğitimi': { emoji: '🎓', bg: '#0D1B30', text: '#93C5FD', border: '#152D4A' },
  'Diğer':        { emoji: '📦', bg: '#20100F', text: '#FCA5A5', border: '#3A1A18' },
};

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

// ─── Auth Hook ────────────────────────────────────────────────────────────────

function useAuth() {
  const [token, setToken] = useLS('takas_tok',  null);
  const [user,  setUser]  = useLS('takas_user', null);

  const login = async (email, password) => {
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (d.token) { setToken(d.token); setUser(d.user); return { ok: true }; }
      return { ok: false, error: d.error || 'Giriş başarısız' };
    } catch { return { ok: false, error: 'Sunucuya bağlanılamadı' }; }
  };

  const register = async (email, password, name) => {
    try {
      const r = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const d = await r.json();
      if (d.token) { setToken(d.token); setUser(d.user); return { ok: true }; }
      return { ok: false, error: d.error || 'Kayıt başarısız' };
    } catch { return { ok: false, error: 'Sunucuya bağlanılamadı' }; }
  };

  const logout = () => { setToken(null); setUser(null); };

  const authFetch = useCallback((path, opts = {}) => {
    const headers = { 'Authorization': `Bearer ${token}`, ...opts.headers };
    return fetch(`${API}${path}`, { ...opts, headers });
  }, [token]);

  return { token, user, login, register, logout, isAuth: !!token, authFetch };
}

// ─── Normalize API Product ────────────────────────────────────────────────────

function normalize(p) {
  return {
    ...p,
    image:     p.image_data ? `data:image/jpeg;base64,${p.image_data}` : null,
    city:      p.location   || p.city  || '',
    desc:      p.description || p.desc || '',
    owner:     p.owner_name  || p.owner || '?',
    price:     p.value       || 0,
    priceType: 'takas',
    rating:    0,
    sub:       p.sub         || '',
    createdAt: p.created_at  ? new Date(p.created_at).getTime() : Date.now(),
  };
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 34 34" fill="none">
      <rect x="1.5"  y="3"  width="31" height="10" rx="5"   stroke="#DC2626" strokeWidth="2.4" fill="none"/>
      <rect x="5"    y="6"  width="16" height="4"  rx="2"   stroke="#DC2626" strokeWidth="1.5" fill="none"/>
      <rect x="13"   y="7"  width="8"  height="24" rx="4"   stroke="#DC2626" strokeWidth="2.4" fill="none"/>
      <rect x="15.5" y="10" width="3"  height="17" rx="1.5" stroke="#DC2626" strokeWidth="1.4" fill="none"/>
    </svg>
  );
}

// ─── Product Card (Grid) ──────────────────────────────────────────────────────

function ProductCard({ product, favorites, onFav }) {
  const cs  = CAT_STYLE[product.category] || CAT_STYLE['Diğer'];
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
        <button
          className={`fav-btn ${fav ? 'on' : ''}`}
          onClick={e => { e.stopPropagation(); onFav(product.id); }}
          aria-label="Favoriye ekle"
        >
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
          <div className="pcard-wish">
            <span className="wish-pill">🔄 {product.wishlist}</span>
          </div>
        )}

        <div className="pcard-foot">
          <span className="price-tag takas">🔄 Takas</span>
        </div>
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
  const cs  = CAT_STYLE[product.category] || CAT_STYLE['Diğer'];
  const fav = favorites.includes(product.id);

  const getPos = e => {
    const s = e.touches ? e.touches[0] : e;
    return { x: s.clientX, y: s.clientY };
  };

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
    const THRESHOLD = 90;
    if (Math.abs(drag.x) >= THRESHOLD) {
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

  const topTransform   = `translate(${dx}px, ${dy}px) rotate(${rotate}deg)`;
  const stackTransform = `scale(${1 - stackIndex * 0.045}) translateY(${stackIndex * 14}px)`;

  const likeOp = Math.min(1, Math.max(0,  drag.x / 80));
  const passOp = Math.min(1, Math.max(0, -drag.x / 80));

  return (
    <div
      className="sc"
      style={{
        zIndex,
        transform: isTop ? topTransform : stackTransform,
        transition: drag.active
          ? 'none'
          : flying
            ? 'transform 0.38s cubic-bezier(0.55,0,1,0.45), opacity 0.38s ease'
            : 'transform 0.42s cubic-bezier(0.175,0.885,0.32,1.275)',
        opacity:       flying ? 0 : 1,
        cursor:        isTop ? (drag.active ? 'grabbing' : 'grab') : 'default',
        pointerEvents: isTop ? 'auto' : 'none',
      }}
      onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
      onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
    >
      {/* Swipe stamps */}
      <div className="sc-stamp sc-stamp-like" style={{ opacity: likeOp }}>
        <span>❤</span> Teklif Ver
      </div>
      <div className="sc-stamp sc-stamp-pass" style={{ opacity: passOp }}>
        <span>✕</span> Geç
      </div>

      {/* Image */}
      <div className="sc-img" style={{ background: cs.bg }}>
        {product.image
          ? <img src={product.image} alt={product.title} draggable="false" />
          : <span className="sc-emoji">{cs.emoji}</span>
        }
        <div className="sc-img-fade" />
        <div className="sc-img-top">
          <span className="sc-cat" style={{ background: cs.bg, color: cs.text }}>
            {cs.emoji} {product.category}
          </span>
          <button
            className={`sc-fav ${fav ? 'on' : ''}`}
            onClick={e => { e.stopPropagation(); onFav(product.id); }}
          >
            {fav ? '❤️' : '🤍'}
          </button>
        </div>
      </div>

      {/* Info */}
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

function SwipeView({ products, favorites, onFav, authFetch, navigate }) {
  const [gone,       setGone]       = useState(new Set());
  const [likedIds,   setLikedIds]   = useState([]);
  const [matchModal, setMatchModal] = useState(false);

  const remaining = products.filter(p => !gone.has(p.id));
  const topThree  = remaining.slice(0, 3);

  const handleSwipe = useCallback(async (dir, product) => {
    setGone(g => new Set([...g, product.id]));

    if (dir === 'right') {
      setLikedIds(l => [...l, product.id]);
      try {
        const r = await authFetch(`/api/like/${product.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const d = await r.json();
        if (d.matched && !d.existing) setMatchModal(true);
      } catch {}
    }
  }, [authFetch]);

  const handleBtnSwipe = dir => {
    if (!topThree.length) return;
    handleSwipe(dir, topThree[0]);
  };

  if (topThree.length === 0) return (
    <div className="swipe-done">
      <div className="sd-icon">🎉</div>
      <h3>Hepsi bitti!</h3>
      <p>{likedIds.length > 0 ? `${likedIds.length} ürüne takas teklifi verdin.` : 'Tüm ilanları gördün.'}</p>
      <button className="btn-red" onClick={() => { setGone(new Set()); setLikedIds([]); }}>
        Yeniden Başla
      </button>
    </div>
  );

  return (
    <>
      {matchModal && (
        <MatchModal
          onClose={() => setMatchModal(false)}
          onGoChat={() => { setMatchModal(false); navigate('matches'); }}
        />
      )}

      <div className="swipe-view">
        <div className="swipe-progress">
          <span>{remaining.length} ilan kaldı</span>
          {likedIds.length > 0 && (
            <span className="swipe-liked-count">❤ {likedIds.length} teklif</span>
          )}
        </div>

        <div className="swipe-stack">
          {[...topThree].reverse().map((product, revIdx) => {
            const stackIdx = topThree.length - 1 - revIdx;
            return (
              <SwipeCard
                key={product.id}
                product={product}
                onSwipe={handleSwipe}
                isTop={stackIdx === 0}
                zIndex={topThree.length - stackIdx}
                stackIndex={stackIdx}
                favorites={favorites}
                onFav={onFav}
              />
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

        <div className="swipe-hint">
          <span>← geç</span>
          <span>takas teklif et →</span>
        </div>
      </div>
    </>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({ f, set }) {
  return (
    <div className="filter-bar">
      <div className="filter-search">
        <span className="search-ico">🔍</span>
        <input
          type="text"
          placeholder="Ürün, not, ders ara..."
          value={f.q}
          onChange={e => set({ ...f, q: e.target.value })}
        />
        {f.q && <button className="search-clear" onClick={() => set({ ...f, q: '' })}>✕</button>}
      </div>
      <div className="filter-selects">
        <select value={f.cat} onChange={e => set({ ...f, cat: e.target.value })}>
          <option value="">Tüm Kategoriler</option>
          {Object.keys(CATEGORIES).map(c => <option key={c}>{c}</option>)}
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

function ExplorePage({ favorites, onFav, authFetch, navigate }) {
  const [mode,     setMode]     = useState('swipe');
  const [products, setProducts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [f, setF]               = useState(EMPTY_F);

  useEffect(() => {
    setLoading(true);
    authFetch('/api/products')
      .then(r => r.json())
      .then(data => { setProducts(Array.isArray(data) ? data.map(normalize) : []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch]);

  let list = products.filter(p => {
    const ql = f.q.toLowerCase();
    if (ql && !p.title.toLowerCase().includes(ql) && !p.desc.toLowerCase().includes(ql)) return false;
    if (f.cat  && p.category !== f.cat)  return false;
    if (f.city && p.city     !== f.city) return false;
    return true;
  });

  list = [...list].sort((a, b) => {
    if (f.sort === 'az') return a.title.localeCompare(b.title);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return (
    <div className="explore-page">
      {/* Mode toggle */}
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
        <div className="loading-state">
          <div className="spinner" />
          <p>Yükleniyor...</p>
        </div>
      ) : mode === 'swipe' ? (
        <SwipeView
          products={list}
          favorites={favorites}
          onFav={onFav}
          authFetch={authFetch}
          navigate={navigate}
        />
      ) : (
        <>
          <FilterBar f={f} set={setF} />

          <div className="cat-pills">
            <button className={`pill ${!f.cat ? 'active' : ''}`} onClick={() => setF({ ...f, cat: '' })}>
              Tümü
            </button>
            {Object.entries(CAT_STYLE).map(([name, s]) => (
              <button
                key={name}
                className={`pill ${f.cat === name ? 'active' : ''}`}
                onClick={() => setF({ ...f, cat: f.cat === name ? '' : name })}
                style={f.cat === name ? { background: s.bg, color: s.text, borderColor: s.border } : {}}
              >
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
              {list.map(p => (
                <ProductCard key={p.id} product={p} favorites={favorites} onFav={onFav} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Add Page ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = { title: '', category: '', sub: '', city: '', condition: 'İyi', desc: '', wishlist: '' };

function AddPage({ authFetch, navigate }) {
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleImg = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const r = new FileReader();
    r.onload = ev => setPreview(ev.target.result);
    r.readAsDataURL(file);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (imageFile) fd.append('image', imageFile);

      const r = await authFetch('/api/products', { method: 'POST', body: fd });
      const d = await r.json();
      if (d.id) {
        setDone(true);
        setTimeout(() => navigate('explore'), 1600);
      } else {
        setError(d.error || 'Bir hata oluştu');
      }
    } catch {
      setError('Sunucuya bağlanılamadı');
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
          {/* Photo */}
          <div className="fg">
            <label>Fotoğraf</label>
            <label className="upload-box">
              <input type="file" accept="image/*" onChange={handleImg} />
              {preview
                ? <img src={preview} alt="önizleme" className="img-prev" />
                : <div className="upload-ph"><span>📷</span><span>Fotoğraf ekle (opsiyonel)</span></div>
              }
            </label>
          </div>

          {/* Title */}
          <div className="fg">
            <label>Başlık *</label>
            <input type="text" placeholder="Ürün adı" value={form.title}
              onChange={e => set('title', e.target.value)} required />
          </div>

          {/* Category + Sub */}
          <div className="fg-row">
            <div className="fg">
              <label>Kategori *</label>
              <select value={form.category}
                onChange={e => { set('category', e.target.value); set('sub', ''); }} required>
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

          {/* City + Condition */}
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

          {/* Description */}
          <div className="fg">
            <label>Açıklama</label>
            <textarea placeholder="Ürün hakkında kısa bir açıklama..." value={form.desc}
              onChange={e => set('desc', e.target.value)} rows={3} />
          </div>

          {/* Wishlist */}
          <div className="fg wish-fg">
            <label className="wish-label-main">🔄 Ne karşılığında takas istersin?</label>
            <input
              type="text"
              placeholder="örn: Fizik kitabı, kutu oyunu, Steam kodu..."
              value={form.wishlist}
              onChange={e => set('wishlist', e.target.value)}
            />
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

function MatchesPage({ authFetch, navigate, user }) {
  const [matches,     setMatches]     = useState([]);
  const [activeMatch, setActiveMatch] = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [newMsg,      setNewMsg]      = useState('');
  const [loading,     setLoading]     = useState(true);
  const bottomRef = useRef(null);

  // Load match list
  useEffect(() => {
    authFetch('/api/matches')
      .then(r => r.json())
      .then(data => setMatches(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch]);

  // Poll messages for active match
  useEffect(() => {
    if (!activeMatch) return;
    const load = () =>
      authFetch(`/api/matches/${activeMatch.id}/messages`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setMessages(data); })
        .catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [activeMatch, authFetch]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMsg = async e => {
    e.preventDefault();
    if (!newMsg.trim() || !activeMatch) return;
    const content = newMsg.trim();
    setNewMsg('');
    try {
      await authFetch(`/api/matches/${activeMatch.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } catch {}
  };

  const openMatch = m => { setActiveMatch(m); setMessages([]); };

  if (loading) return (
    <div className="loading-state"><div className="spinner" /><p>Yükleniyor...</p></div>
  );

  if (!loading && matches.length === 0) return (
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

        {/* ── Sidebar: match list ── */}
        <aside className={`matches-list ${activeMatch ? 'collapsed-mobile' : ''}`}>
          <div className="matches-list-head">
            <h3>Eşleşmeler</h3>
            <span className="match-count-badge">{matches.length}</span>
          </div>
          {matches.map(m => {
            const isU1   = m.user1_id === user?.id;
            const other  = isU1 ? m.user2_name  : m.user1_name;
            const myProd = isU1 ? m.product1_title : m.product2_title;
            const thProd = isU1 ? m.product2_title : m.product1_title;
            return (
              <button
                key={m.id}
                className={`match-item ${activeMatch?.id === m.id ? 'active' : ''}`}
                onClick={() => openMatch(m)}
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

        {/* ── Chat room ── */}
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
                  {activeMatch.user1_id === user?.id ? activeMatch.user2_name : activeMatch.user1_name}
                </div>
                <div className="chat-swap-label">
                  {activeMatch.user1_id === user?.id ? activeMatch.product1_title : activeMatch.product2_title}
                  {' ⇄ '}
                  {activeMatch.user1_id === user?.id ? activeMatch.product2_title : activeMatch.product1_title}
                </div>
              </div>
            </div>

            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="chat-empty">👋 Sohbeti sen başlat!</div>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`chat-msg ${msg.sender_id === user?.id ? 'mine' : 'theirs'}`}
                >
                  <div className="msg-bubble">{msg.content}</div>
                  <div className="msg-time">
                    {new Date(msg.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <form className="chat-form" onSubmit={sendMsg}>
              <input
                type="text"
                placeholder="Mesaj yaz..."
                value={newMsg}
                onChange={e => setNewMsg(e.target.value)}
              />
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

// ─── Profile Page ─────────────────────────────────────────────────────────────

function ProfilePage({ favorites, onFav, authFetch, navigate, user, onLogout }) {
  const [tab,        setTab]        = useState('my');
  const [myProducts, setMyProducts] = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    authFetch('/api/my-products')
      .then(r => r.json())
      .then(data => setMyProducts(Array.isArray(data) ? data.map(normalize) : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [authFetch]);

  const displayName = user?.name || 'Kullanıcı';

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-av">{displayName[0]?.toUpperCase()}</div>
        <div className="profile-info">
          <h2>{displayName}</h2>
          <p className="profile-sub">{user?.email}</p>
          <div className="profile-stats">
            <div className="stat"><strong>{myProducts.length}</strong><span>İlan</span></div>
            <div className="stat"><strong>{favorites.length}</strong><span>Favori</span></div>
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout} title="Çıkış yap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Çıkış
        </button>
      </div>

      <div className="profile-tabs">
        <button className={tab === 'my' ? 'active' : ''} onClick={() => setTab('my')}>
          İlanlarım ({myProducts.length})
        </button>
        <button className={tab === 'fav' ? 'active' : ''} onClick={() => setTab('fav')}>
          Favorilerim ({favorites.length})
        </button>
      </div>

      {tab === 'my' && (
        loading ? (
          <div className="loading-state"><div className="spinner" /><p>Yükleniyor...</p></div>
        ) : myProducts.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon">📦</div>
            <h3>Henüz ilan yok</h3>
            <p>İlk ürününü ekleyerek başla!</p>
            <button className="btn-red" onClick={() => navigate('add')}>İlan Ekle</button>
          </div>
        ) : (
          <div className="pgrid">
            {myProducts.map(p => <ProductCard key={p.id} product={p} favorites={favorites} onFav={onFav} />)}
          </div>
        )
      )}

      {tab === 'fav' && (
        favorites.length === 0 ? (
          <div className="empty-state">
            <div className="es-icon">🤍</div>
            <h3>Henüz favori yok</h3>
            <p>Keşfet sayfasında ilanları favorile!</p>
            <button className="btn-red" onClick={() => navigate('explore')}>Keşfete Git</button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="es-icon">❤️</div>
            <h3>{favorites.length} favori var</h3>
            <p>Favorilediğin ilanları Keşfet sayfasında görebilirsin</p>
            <button className="btn-red" onClick={() => navigate('explore')}>Keşfete Git</button>
          </div>
        )
      )}
    </div>
  );
}

// ─── Auth Page ────────────────────────────────────────────────────────────────

function AuthPage({ auth }) {
  const [mode,    setMode]    = useState('login');
  const [form,    setForm]    = useState({ email: '', password: '', name: '' });
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = mode === 'login'
      ? await auth.login(form.email, form.password)
      : await auth.register(form.email, form.password, form.name);
    if (!result.ok) setError(result.error);
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">

        {/* Brand */}
        <div className="auth-brand">
          <div className="auth-logo-wrap">
            <Logo />
          </div>
          <span className="auth-wordmark">takaslık</span>
        </div>
        <p className="auth-tagline">Ürünlerini takas et · Yeni şeyler keşfet</p>

        {/* Title */}
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
              onChange={e => set('email', e.target.value)} required
              autoFocus={mode === 'login'} />
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
          {mode === 'login' ? (
            <span>Hesabın yok mu? <button onClick={() => { setMode('register'); setError(''); }}>Kayıt Ol</button></span>
          ) : (
            <span>Hesabın var mı? <button onClick={() => { setMode('login'); setError(''); }}>Giriş Yap</button></span>
          )}
        </div>

        {mode === 'login' && (
          <>
            <div className="auth-divider"><span>ya da</span></div>
            <div className="auth-demo">
              <span>Demo hesapla dene →</span>
              <button onClick={() => setForm({ email: 'demo@takas.com', password: 'demo123', name: '' })}>
                demo@takas.com / demo123
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

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
  {
    id: 'profile', label: 'Profil',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  },
];

export default function App() {
  const { page, navigate }        = useRouter();
  const [favorites, setFavorites] = useLS('takaslık_fav', []);
  const auth = useAuth();

  const toggleFav = useCallback(
    id => setFavorites(p => p.includes(id) ? p.filter(f => f !== id) : [...p, id]),
    [setFavorites]
  );

  // Auth gate
  if (!auth.isAuth) return <AuthPage auth={auth} />;

  return (
    <div className="app">
      <header className="header">
        <button className="logo-btn" onClick={() => navigate('explore')}>
          <Logo />
          <span className="logo-text">takaslık</span>
        </button>
        <nav className="nav">
          {NAV.map(n => (
            <button
              key={n.id}
              className={`nav-btn ${page === n.id ? 'active' : ''}`}
              onClick={() => navigate(n.id)}
            >
              {n.icon}
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {page === 'explore' && (
          <ExplorePage favorites={favorites} onFav={toggleFav} authFetch={auth.authFetch} navigate={navigate} />
        )}
        {page === 'matches' && (
          <MatchesPage authFetch={auth.authFetch} navigate={navigate} user={auth.user} />
        )}
        {page === 'add' && (
          <AddPage authFetch={auth.authFetch} navigate={navigate} />
        )}
        {page === 'profile' && (
          <ProfilePage
            favorites={favorites}
            onFav={toggleFav}
            authFetch={auth.authFetch}
            navigate={navigate}
            user={auth.user}
            onLogout={auth.logout}
          />
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {NAV.map(n => (
          <button
            key={n.id}
            className={`bnav-btn ${page === n.id ? 'active' : ''}`}
            onClick={() => navigate(n.id)}
          >
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
