const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();

// ── Env Guards ─────────────────────────────────────────────────────────────────
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET is not set');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) throw new Error('MONGO_URI is not set');

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'denizfurkan030@gmail.com';

// ── MongoDB ────────────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => { console.error('MongoDB connection error:', err); process.exit(1); });

// ── Schemas & Models ───────────────────────────────────────────────────────────
const { Schema, model } = mongoose;

const UserSchema = new Schema({
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name:     { type: String, required: true, trim: true },
}, { timestamps: true });

const ProductSchema = new Schema({
  userId:      { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  imageUrl:    { type: String, default: null }, // TODO Step 2: Cloudinary URL
  value:       { type: Number, default: 0 },
  category:    { type: String, required: true },
  condition:   { type: String, required: true },
  location:    { type: String, default: '' },
  wishlist:    { type: String, default: '' },
}, { timestamps: true });

const LikeSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
}, { timestamps: true });
LikeSchema.index({ userId: 1, productId: 1 }, { unique: true });

const MatchSchema = new Schema({
  user1Id:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  user2Id:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  product1Id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  product2Id: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  status:     { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
}, { timestamps: true });
MatchSchema.index({ user1Id: 1, user2Id: 1 });

const MessageSchema = new Schema({
  matchId:  { type: Schema.Types.ObjectId, ref: 'Match', required: true, index: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content:  { type: String, required: true, trim: true },
}, { timestamps: true });

const User    = model('User', UserSchema);
const Product = model('Product', ProductSchema);
const Like    = model('Like', LikeSchema);
const Match   = model('Match', MatchSchema);
const Message = model('Message', MessageSchema);

// ── Middleware ─────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://takaslik.app',
  'https://www.takaslik.app',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    // Allow any Vercel preview/production deployment
    if (/^https:\/\/[a-z0-9-]+(\.vercel\.app)$/.test(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// ── Multer (temp storage — replaced by Cloudinary in Step 2) ──────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── Auth Middleware ────────────────────────────────────────────────────────────
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

// ── Auth Routes ────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Tüm alanlar zorunlu' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Geçersiz e-posta' });
    if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
    if (name.trim().length < 2) return res.status(400).json({ error: 'İsim en az 2 karakter olmalı' });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hash, name: name.trim() });
    const token = jwt.sign({ id: user._id, email: user.email }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'Bu e-posta zaten kullanılıyor' });
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-posta ve şifre gerekli' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
    }
    const token = jwt.sign({ id: user._id, email: user.email }, SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
  } catch {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('_id email name');
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ id: user._id, email: user.email, name: user.name });
  } catch {
    res.status(500).json({ error: 'Sunucu hatası' });
  }
});

// ── Product Routes ─────────────────────────────────────────────────────────────
app.post('/api/products', auth, upload.single('image'), async (req, res) => {
  try {
    const { title, description, category, condition, location, wishlist, value } = req.body;
    // TODO Step 2: swap this for a Cloudinary upload, store the returned URL
    const imageUrl = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
      : null;

    const product = await Product.create({
      userId: req.user.id,
      title,
      description: description || '',
      imageUrl,
      value: parseFloat(value) || 0,
      category,
      condition,
      location: location || '',
      wishlist: wishlist || '',
    });
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/products', auth, async (req, res) => {
  try {
    const products = await Product.find({ userId: { $ne: req.user.id } })
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json(products.map(p => ({
      ...p,
      id: p._id,
      image_data: p.imageUrl,   // keep field name so existing frontend doesn't break
      owner_name: p.userId?.name,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/my-products', auth, async (req, res) => {
  try {
    const products = await Product.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(products.map(p => ({ ...p, id: p._id, image_data: p.imageUrl })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Like / Match ───────────────────────────────────────────────────────────────
app.post('/api/like/:productId', auth, async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user.id;

    await Like.findOneAndUpdate(
      { userId, productId },
      { userId, productId },
      { upsert: true }
    );

    const product = await Product.findById(productId).select('userId');
    if (!product) return res.json({ matched: false });
    const otherUserId = product.userId;

    const myProductIds = await Product.find({ userId }).distinct('_id');
    const mutual = await Like.findOne({ userId: otherUserId, productId: { $in: myProductIds } });
    if (!mutual) return res.json({ matched: false });

    const existing = await Match.findOne({
      $or: [
        { user1Id: userId, user2Id: otherUserId },
        { user1Id: otherUserId, user2Id: userId },
      ],
    });
    if (existing) return res.json({ matched: true, matchId: existing._id, existing: true });

    const match = await Match.create({
      user1Id: userId,
      user2Id: otherUserId,
      product1Id: productId,
      product2Id: mutual.productId,
    });
    res.json({ matched: true, matchId: match._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Matches ────────────────────────────────────────────────────────────────────
app.get('/api/matches', auth, async (req, res) => {
  try {
    const matches = await Match.find({
      $or: [{ user1Id: req.user.id }, { user2Id: req.user.id }],
    })
      .populate('user1Id', 'name')
      .populate('user2Id', 'name')
      .populate('product1Id', 'title imageUrl')
      .populate('product2Id', 'title imageUrl')
      .sort({ createdAt: -1 })
      .lean();

    res.json(matches.map(m => ({
      id: m._id,
      user1_id: m.user1Id._id,
      user2_id: m.user2Id._id,
      user1_name: m.user1Id.name,
      user2_name: m.user2Id.name,
      product1_title: m.product1Id.title,
      product1_image: m.product1Id.imageUrl,
      product2_title: m.product2Id.title,
      product2_image: m.product2Id.imageUrl,
      status: m.status,
      createdAt: m.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Messages ───────────────────────────────────────────────────────────────────
app.post('/api/matches/:matchId/messages', auth, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Mesaj boş olamaz' });

    const match = await Match.findOne({
      _id: matchId,
      $or: [{ user1Id: req.user.id }, { user2Id: req.user.id }],
    });
    if (!match) return res.status(403).json({ error: 'Yetkisiz erişim' });

    const message = await Message.create({ matchId, senderId: req.user.id, content: content.trim() });
    res.json({ id: message._id, match_id: matchId, sender_id: req.user.id, content: message.content, createdAt: message.createdAt });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/matches/:matchId/messages', auth, async (req, res) => {
  try {
    const { matchId } = req.params;
    const match = await Match.findOne({
      _id: matchId,
      $or: [{ user1Id: req.user.id }, { user2Id: req.user.id }],
    });
    if (!match) return res.status(403).json({ error: 'Yetkisiz erişim' });

    const messages = await Message.find({ matchId }).sort({ createdAt: 1 }).lean();
    res.json(messages.map(m => ({ ...m, id: m._id, sender_id: m.senderId })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Routes ───────────────────────────────────────────────────────────────
app.get('/api/admin/stats', adminAuth, async (_req, res) => {
  try {
    const [users, products, matches, messages] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Match.countDocuments(),
      Message.countDocuments(),
    ]);
    res.json({ users, products, matches, messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', adminAuth, async (_req, res) => {
  try {
    const users = await User.find().select('_id email name createdAt').sort({ createdAt: -1 }).lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/products', adminAuth, async (_req, res) => {
  try {
    const products = await Product.find()
      .populate('userId', 'name')
      .select('_id title category condition location createdAt userId')
      .sort({ createdAt: -1 })
      .lean();
    res.json(products.map(p => ({ ...p, owner_name: p.userId?.name })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
  try {
    const result = await Product.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Ürün bulunamadı' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI Evaluate ────────────────────────────────────────────────────────────────
app.post('/api/products/evaluate', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image required' });
    if (!CLAUDE_API_KEY) return res.status(503).json({ error: 'AI değerlendirme şu an kapalı' });

    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          { type: 'text', text: 'Analyze this product image and provide a JSON response with: estimated_value (USD), condition ("new","like new","good","fair","poor"), category ("Kitap","Oyun","Ders Notları","Ders Eğitimi","Diğer"), description (1-2 sentences). Return ONLY valid JSON.' },
        ]}],
      }),
    });

    if (!response.ok) return res.status(500).json({ error: 'AI değerlendirme başarısız' });
    const data = await response.json();
    const evaluation = JSON.parse(data.content[0].text);
    res.json(evaluation);
  } catch {
    res.status(500).json({ error: 'Değerlendirme başarısız' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
