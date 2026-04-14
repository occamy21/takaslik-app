# 🔄 Takas Platformu - Full Stack Application

Tinder-style ürün takas uygulaması. Kullanıcılar ürünlerini yükler, AI otomatik değerler, benzer ürünleri keşfeder ve takas yapar.

## 🎯 Özellikler

✅ **Kullanıcı Sistemi**
- Kayıt ve giriş (JWT tokens)
- Profil yönetimi

✅ **Ürün Yönetimi**
- Ürün fotoğrafı yükleme
- **AI Otomatik Değerleme** (Claude API kullanarak)
  - Ürün durumunu tahmin eder
  - Değerini hesaplar
  - Kategori ve açıklama ekler

✅ **Swipe & Discover**
- Tinder tarzı ürün keşfi
- Beğen/Beğenme sistemi

✅ **Eşleşme & Mesajlaşma**
- Karşılıklı beğeni = Eşleşme
- Matched kullanıcılar arasında sohbet
- Match geçmişi

## 🛠️ Kurulum

### 1. Backend Setup

```bash
# Dependencies kur
npm install

# Environment variables set et
export CLAUDE_API_KEY="your-api-key-here"

# Server başlat
npm start
# Şu anda http://localhost:3001 adresinde çalışacak
```

### 2. Frontend Setup (React)

React başlamak için Create React App kullan:

```bash
npx create-react-app takas-frontend
cd takas-frontend

# App.jsx ve App.css dosyalarını src/ klasörüne kopyala
cp ../App.jsx src/
cp ../App.css src/
```

`src/index.js` dosyasını şu şekilde düzenle:
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
```

Frontend başlat:
```bash
npm start
# http://localhost:3000 adresinde çalışacak
```

## 📋 API Endpoints

### Auth
- `POST /api/auth/register` - Kaydol
- `POST /api/auth/login` - Giriş Yap
- `GET /api/auth/me` - Mevcut kullanıcı

### Products
- `GET /api/products` - Tüm ürünleri getir (keşif için)
- `GET /api/my-products` - Kendi ürünlerim
- `POST /api/products` - Ürün ekle
- `POST /api/products/evaluate` - AI ile ürün değerle

### Likes & Matches
- `POST /api/like/:productId` - Ürünü beğen
- `GET /api/matches` - Eşleşmelerimi getir

### Messages
- `GET /api/matches/:matchId/messages` - Sohbet geçmişi
- `POST /api/matches/:matchId/messages` - Mesaj gönder

## 🤖 Claude AI Integration

Fotoğraf yüklendiğinde Claude Vision kullanarak otomatik olarak:

```
Girdi: Ürün Fotoğrafı
↓
Claude API (Vision)
↓
Çıktı: {
  "estimated_value": 150,
  "condition": "good",
  "category": "Electronics",
  "description": "Gently used smartphone in good condition"
}
```

**API Key alma:**
1. https://console.anthropic.com adresine git
2. API Key oluştur
3. `CLAUDE_API_KEY` environment variable'ına set et

## 📱 Kullanım Adımları

1. **Kaydol/Giriş Yap**
   - Email ve şifre ile hesap oluştur

2. **Ürün Ekle** (📦 Ürünlerim sayfası)
   - Fotoğraf çek/seç
   - AI otomatik değerler
   - Manual düzenleme yapabilirsin
   - Ekle butonuna bas

3. **Keşfet** (⚡ Keşfet sayfası)
   - Diğer kullanıcıların ürünlerini gör
   - Beğen/Beğenme yap
   - Swipe aşağı = Beğen, Yukarı = Skip

4. **Eşleş & Sohbet** (❤️ Eşleşmeler)
   - Karşılıklı beğeni = Otomatik match
   - Matched kullanıcıya mesaj gönder
   - Takas detaylarını konuş

## 🎨 Tech Stack

**Backend:**
- Node.js + Express
- SQLite (in-memory database)
- JWT Authentication
- Multer (file upload)
- Claude AI API (Vision + NLP)

**Frontend:**
- React 18
- CSS3 (modern, responsive)
- Fetch API (no axios needed)

## 🚀 Deployment

### Backend (Heroku, Railway, vb)
```bash
# Heroku deploy örneği
heroku create takas-platform
git push heroku main
heroku config:set CLAUDE_API_KEY="your-key"
```

### Frontend (Vercel, Netlify)
```bash
npm run build
# build/ klasörünü deploy et
```

## 📌 Önemli Notlar

⚠️ **Şu anda:**
- Database in-memory (server restart'ta verileri kaybedecek)
- Production'da PostgreSQL kullan

⚠️ **Security:**
- JWT secret'ı güvenli yerde tut
- CORS ayarlarını kontrol et
- API rate limiting ekle

⚠️ **Claude API Costs:**
- Vision API calls $ 0.01 - 0.03 per image
- Ürün yükleme başına ~$0.01 - 0.02

## 💡 İleri Özellikler (Eklenebilir)

- [ ] Kullanıcı profil sayfası
- [ ] Rating/Review sistemi
- [ ] Takas tamamlama onayı
- [ ] Real-time notifications (WebSocket)
- [ ] Arama ve filter
- [ ] Similar products recommendation (AI)
- [ ] Payment integration (takas doğrulandığında)
- [ ] Image gallery (multiple images)
- [ ] User geolocation based matching

## 🔧 Troubleshooting

**CORS Error:**
```javascript
// server.js'e ekle
const cors = require('cors');
app.use(cors());
```

**Claude API Error:**
- API key kontrol et
- Rate limit check et
- Quota kontrol et

**Database Error:**
- SQLite path kontrol et
- Permission check et

## 📞 Support

Sorularınız için: knk@takas.local

---

**20$ bütçe kullanımı:**
- 🔧 Backend hosting: Free (local/Render free tier)
- 🎨 Frontend hosting: Free (Vercel/Netlify)
- 🤖 Claude API: ~1000 ürün değerleme = ~$10-20
- 💾 Database: Free (SQLite → PostgreSQL free tier)

**Bütçe: ✅ Yeterli!**
