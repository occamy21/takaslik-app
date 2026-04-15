const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const db = new sqlite3.Database(':memory:');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET environment variable is not set');
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY || 'your-api-key-here';

// Middleware
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://xn--takasl-u9a.app',
  'https://www.xn--takasl-u9a.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ─── Database Setup ────────────────────────────────────────────────────────────

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    title TEXT,
    description TEXT,
    image_data TEXT,
    value REAL,
    category TEXT,
    condition TEXT,
    location TEXT,
    wishlist TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY,
    user1_id INTEGER,
    user2_id INTEGER,
    product1_id INTEGER,
    product2_id INTEGER,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user1_id) REFERENCES users(id),
    FOREIGN KEY(user2_id) REFERENCES users(id),
    FOREIGN KEY(product1_id) REFERENCES products(id),
    FOREIGN KEY(product2_id) REFERENCES products(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    product_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(product_id) REFERENCES products(id),
    UNIQUE(user_id, product_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    match_id INTEGER,
    sender_id INTEGER,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(match_id) REFERENCES matches(id),
    FOREIGN KEY(sender_id) REFERENCES users(id)
  )`);

  // ─── Seed Demo Data ──────────────────────────────────────────────────────────
  const demoProducts = [
    { title: 'YKS Matematik Soru Bankası 2024', desc: '2023 baskı, az çizikli. Tüm konuları kapsıyor.', category: 'Kitap', condition: 'İyi', city: 'İstanbul', wishlist: 'Fizik kitabı veya Kimya soru bankası' },
    { title: 'Minecraft Java Edition Lisansı', desc: 'Orijinal lisans, kullanılmamış. Farklı bir oyunla takas ederim.', category: 'Oyun', condition: 'Yeni', city: 'Bursa', wishlist: 'Steam oyunu veya kutu oyunu' },
    { title: 'AYT Fizik Notları (Tüm Konular)', desc: 'El yazısıyla hazırlanmış, konu özetleri ve formüller dahil.', category: 'Ders Notları', condition: 'Çok İyi', city: 'Kocaeli', wishlist: 'Kimya veya Biyoloji notları' },
    { title: 'Catan Kutu Oyunu (Türkçe)', desc: 'Türkçe baskı, tüm parçalar tam, kutusu sağlam.', category: 'Oyun', condition: 'Çok İyi', city: 'İstanbul', wishlist: 'Başka bir strateji kutu oyunu' },
    { title: 'Suç ve Ceza – Dostoyevski', desc: 'İş Bankası Kültür Yayınları baskısı. Tarih veya felsefe kitabıyla takas.', category: 'Kitap', condition: 'İyi', city: 'Edirne', wishlist: 'Felsefe veya tarih kitabı' },
    { title: 'Bireysel Matematik Dersi (YKS)', desc: 'Haftada 2 saat, YKS odaklı birebir ders. Üniversite öğrencisiyim.', category: 'Ders Eğitimi', condition: 'Yeni', city: 'İstanbul', wishlist: 'İngilizce veya programlama dersi' },
    { title: 'One Piece Manga Seti (1–10. Cilt)', desc: '1-10. ciltler, Türkçe çeviri, temiz ve eksiksiz takım.', category: 'Kitap', condition: 'İyi', city: 'Bursa', wishlist: 'Naruto veya başka bir manga serisi' },
    { title: 'TYT Kimya Notları (Renkli)', desc: 'TYT kimya tüm konular, renkli ve düzenli. Çok okunmadı.', category: 'Ders Notları', condition: 'Çok İyi', city: 'Tekirdağ', wishlist: 'Biyoloji veya Matematik notları' },
    { title: 'Pokemon Kart Destesi (60 Kart)', desc: '60 kartlık deste, bazı nadir kartlar mevcut. Karşılıklı takas.', category: 'Oyun', condition: 'İyi', city: 'İstanbul', wishlist: 'Magic the Gathering kartları veya Yu-Gi-Oh destesi' },
    { title: 'Yamaha F310 Akustik Gitar', desc: 'Yamaha F310, iyi durumda, sert kılıf dahil.', category: 'Diğer', condition: 'İyi', city: 'Kırklareli', wishlist: 'Ukulele veya elektronik klavye' },
  ];

  const demoHash = bcrypt.hashSync('demo123', 10);
  db.run(
    'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
    ['demo@takas.com', demoHash, 'Demo Kullanıcı'],
    function(err) {
      if (err) return; // already exists or other error
      const demoId = this.lastID;
      demoProducts.forEach(p => {
        db.run(
          `INSERT INTO products (user_id, title, description, category, condition, location, wishlist)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [demoId, p.title, p.desc, p.category, p.condition, p.city, p.wishlist]
        );
      });
      console.log('Demo data seeded. Login: demo@takas.com / demo123');
    }
  );
});

// ─── Auth Middleware ───────────────────────────────────────────────────────────

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── Auth Routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Tüm alanlar zorunlu' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Geçersiz e-posta' });
  if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
  if (name.trim().length < 2) return res.status(400).json({ error: 'İsim en az 2 karakter olmalı' });
  const hash = bcrypt.hashSync(password, 10);
  db.run(
    'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
    [email.toLowerCase().trim(), hash, name.trim()],
    function(err) {
      if (err) return res.status(400).json({ error: 'Bu e-posta zaten kullanılıyor' });
      const token = jwt.sign({ id: this.lastID, email }, SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: this.lastID, email, name } });
    }
  );
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()], (_err, user) => {
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
    }
    const token = jwt.sign({ id: user.id, email }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  });
});

app.get('/api/auth/me', auth, (req, res) => {
  db.get('SELECT id, email, name FROM users WHERE id = ?', [req.user.id], (_err, user) => {
    res.json(user);
  });
});

// ─── Product Routes ────────────────────────────────────────────────────────────

// Upload product
app.post('/api/products', auth, upload.single('image'), (req, res) => {
  const { title, description, category, condition, location, wishlist } = req.body;
  const imageData = req.file ? req.file.buffer.toString('base64') : null;

  db.run(
    `INSERT INTO products (user_id, title, description, image_data, category, condition, location, wishlist)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, title, description || '', imageData, category, condition, location, wishlist || ''],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({
        id: this.lastID,
        title,
        description,
        category,
        condition,
        location,
        wishlist: wishlist || '',
      });
    }
  );
});

// Get all products (excluding own) — global pool
app.get('/api/products', auth, (req, res) => {
  db.all(
    `SELECT p.*, u.name as owner_name
     FROM products p
     JOIN users u ON p.user_id = u.id
     WHERE p.user_id != ?
     ORDER BY p.created_at DESC`,
    [req.user.id],
    (err, products) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(products);
    }
  );
});

// Get own products
app.get('/api/my-products', auth, (req, res) => {
  db.all(
    'SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
    (err, products) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(products);
    }
  );
});

// ─── Like / Match ──────────────────────────────────────────────────────────────

app.post('/api/like/:productId', auth, (req, res) => {
  const productId = parseInt(req.params.productId);
  const userId = req.user.id;

  // Record like
  db.run(
    'INSERT OR IGNORE INTO likes (user_id, product_id) VALUES (?, ?)',
    [userId, productId],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });

      // Find the product's owner
      db.get('SELECT user_id FROM products WHERE id = ?', [productId], (_err, product) => {
        if (!product) return res.json({ matched: false });
        const otherUserId = product.user_id;

        // Check if other user liked any of current user's products
        db.get(
          `SELECT l.product_id as theirProductId
           FROM likes l
           JOIN products p ON l.product_id = p.id
           WHERE l.user_id = ? AND p.user_id = ?
           LIMIT 1`,
          [otherUserId, userId],
          (_err, mutual) => {
            if (!mutual) return res.json({ matched: false });

            // Check if match already exists
            db.get(
              `SELECT id FROM matches
               WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`,
              [userId, otherUserId, otherUserId, userId],
              (_err, existing) => {
                if (existing) return res.json({ matched: true, matchId: existing.id, existing: true });

                // Create new match
                db.run(
                  `INSERT INTO matches (user1_id, user2_id, product1_id, product2_id)
                   VALUES (?, ?, ?, ?)`,
                  [userId, otherUserId, productId, mutual.theirProductId],
                  function(err2) {
                    if (err2) return res.json({ matched: false });
                    res.json({ matched: true, matchId: this.lastID });
                  }
                );
              }
            );
          }
        );
      });
    }
  );
});

// ─── Matches ───────────────────────────────────────────────────────────────────

app.get('/api/matches', auth, (req, res) => {
  db.all(
    `SELECT m.*,
            p1.title as product1_title, p1.image_data as product1_image,
            p2.title as product2_title, p2.image_data as product2_image,
            u1.name as user1_name, u2.name as user2_name
     FROM matches m
     JOIN products p1 ON m.product1_id = p1.id
     JOIN products p2 ON m.product2_id = p2.id
     JOIN users u1 ON m.user1_id = u1.id
     JOIN users u2 ON m.user2_id = u2.id
     WHERE m.user1_id = ? OR m.user2_id = ?
     ORDER BY m.created_at DESC`,
    [req.user.id, req.user.id],
    (err, matches) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(matches);
    }
  );
});

// ─── Messages ──────────────────────────────────────────────────────────────────

app.post('/api/matches/:matchId/messages', auth, (req, res) => {
  const { matchId } = req.params;
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Mesaj boş olamaz' });

  // Verify user is part of this match
  db.get(
    'SELECT id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
    [matchId, req.user.id, req.user.id],
    (_err, match) => {
      if (!match) return res.status(403).json({ error: 'Yetkisiz erişim' });
      db.run(
        'INSERT INTO messages (match_id, sender_id, content) VALUES (?, ?, ?)',
        [matchId, req.user.id, content.trim()],
        function(err) {
          if (err) return res.status(400).json({ error: err.message });
          res.json({ id: this.lastID, match_id: matchId, sender_id: req.user.id, content: content.trim(), created_at: new Date().toISOString() });
        }
      );
    }
  );
});

app.get('/api/matches/:matchId/messages', auth, (req, res) => {
  const { matchId } = req.params;
  db.get(
    'SELECT id FROM matches WHERE id = ? AND (user1_id = ? OR user2_id = ?)',
    [matchId, req.user.id, req.user.id],
    (_err, match) => {
      if (!match) return res.status(403).json({ error: 'Yetkisiz erişim' });
      db.all(
        'SELECT * FROM messages WHERE match_id = ? ORDER BY created_at ASC',
        [matchId],
        (err, messages) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json(messages);
        }
      );
    }
  );
});

// ─── Admin Middleware ──────────────────────────────────────────────────────────

const ADMIN_EMAIL = 'denizfurkan030@gmail.com';

const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token required' });
  try {
    const decoded = jwt.verify(token, SECRET);
    if (decoded.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin yetkisi gerekli' });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ─── Admin Routes ──────────────────────────────────────────────────────────────

app.get('/api/admin/stats', adminAuth, (_req, res) => {
  db.get('SELECT COUNT(*) as users FROM users', [], (_err, u) => {
    db.get('SELECT COUNT(*) as products FROM products', [], (_err2, p) => {
      db.get('SELECT COUNT(*) as matches FROM matches', [], (_err3, m) => {
        db.get('SELECT COUNT(*) as messages FROM messages', [], (_err4, msg) => {
          res.json({
            users:    u?.users    || 0,
            products: p?.products || 0,
            matches:  m?.matches  || 0,
            messages: msg?.messages || 0,
          });
        });
      });
    });
  });
});

app.get('/api/admin/users', adminAuth, (_req, res) => {
  db.all('SELECT id, email, name, created_at FROM users ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/admin/products', adminAuth, (_req, res) => {
  db.all(
    `SELECT p.id, p.title, p.category, p.condition, p.location, p.created_at, u.name as owner_name
     FROM products p
     JOIN users u ON p.user_id = u.id
     ORDER BY p.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.delete('/api/admin/products/:id', adminAuth, (req, res) => {
  const id = parseInt(req.params.id);
  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Ürün bulunamadı' });
    res.json({ ok: true });
  });
});

// ─── AI Evaluate (optional) ────────────────────────────────────────────────────

app.post('/api/products/evaluate', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image required' });
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          { type: 'text', text: 'Analyze this product image and provide a JSON response with: estimated_value (USD), condition ("new","like new","good","fair","poor"), category ("Kitap","Oyun","Ders Notları","Ders Eğitimi","Diğer"), description (1-2 sentences). Return ONLY valid JSON.' }
        ]}]
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: 'AI değerlendirme başarısız' });
    const evaluation = JSON.parse(data.content[0].text);
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: 'Değerlendirme başarısız' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
