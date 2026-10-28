# Statik cPanel Barındırma için PDF Fatura Okuma ve Hibrit Gemini Entegrasyonu

cPanel veya paylaşımlı statik web hosting ortamında (`stoktakip.ahmettosun.me`) çalışan sistemin, Node.js backend gerektirmeden PDF fatura okuma ve yapay zeka analizlerini sorunsuz çalıştırmasını sağlayacak akıllı hibrit çözüm planı.

## Kullanıcı İncelemesi ve Kritik Kararlar

> [!IMPORTANT]
> Kullanıcı tarafından onaylanan tercihler:
> - **Barındırma Ortamı:** cPanel / Paylaşımlı Statik Web Hosting (`stoktakip.ahmettosun.me`).
> - **Çalışma Modu:** Statik uyumlu otomatik istemci modu ve API anahtarı desteği.

- **Otomatik 404 Algılama ve Geçiş:** Uygulama öncelikle sunucu API'sini (`/api/gemini/*`) dener; eğer sunucu bulunamazsa (cPanel static 404 yanıtı verirse) anında doğrudan istemci moduna (Direct Client Mode) geçer.
- **Kullanıcı API Anahtarı Depolama:** cPanel'e yüklenen statik versiyonda fatura okuma ve analizlerin çalışabilmesi için Ayarlar menüsüne ve ilk kullanım modalına "Gemini API Anahtarı" tanımlama alanı eklenir. Anahtar `localStorage` üzerinde güvenle tutulur.
- **Geliştirme / Önizleme Uyumluluğu:** AI Studio önizleme ortamında mevcut sunucu uç noktası (`server.ts`) kesintisiz çalışmaya devam eder; kullanıcı kendi sitesine `dist/` klasörünü yüklediğinde ise statik mod devreye girer.

---

## 1. Genel Bakış ve Temel Konsept

* **Sorunun Kaynağı:** AI Studio geliştirme ortamında Node.js sunucusu (`server.ts`) çalışırken, proje `npm run build` ile derlenip cPanel public_html dizinine yüklendiğinde sadece statik HTML/JS dosyaları barındırılır. Arka planda Node.js sunucusu çalışmadığı için `/api/gemini/parse-invoice` adresi 404 (Bulunamadı) hatası vermektedir.
* **Çözüm:** `services/geminiService.ts` içerisine otomatik algılama katmanı eklenerek, backend olmayan ortamlarda doğrudan Google Gemini REST API'si (`gemini-3.1-flash-lite`) çağrılır. Kullanıcı tek seferlik ücretsiz API anahtarını sisteme girdiğinde fatura okuma kendi domaininde de anında çalışır.

---

## 2. Kullanıcı Deneyimi ve Arayüz Tasarımı

* **Akıllı Uyarı ve Anahtar Giriş Modalı:**
  * Kullanıcı kendi domaininde (`stoktakip.ahmettosun.me`) PDF fatura yüklediğinde, eğer backend 404 dönerse ve kayıtlı bir API anahtarı yoksa temiz bir bilgilendirme modalı açılır:
    *"Statik Barındırma Modu: PDF fatura okuma özelliğini kendi sunucunuzda kullanabilmek için lütfen ücretsiz Gemini API anahtarınızı giriniz."*
  * Anahtar girilip "Kaydet ve Analiz Et" butonuna basıldığında fatura analizi kaldığı yerden devam eder.
* **Ayarlar Menüsünde API Yönetimi:**
  * Yan menüdeki (Sidebar) **Ayarlar** açılır menüsüne *"Gemini API Anahtarı"* seçeneği eklenir. Kullanıcı dilediği zaman anahtarını güncelleyebilir veya silebilir.
* **Tasarım Kuralları:**
  * Bildirim ve giriş ekranlarında koyu tema uyumu (`slate-900`, `slate-800`), odak halkaları (`focus:border-brand-500`) ve net hata/başarı mesajları kullanılır.

---

## 3. Mimari ve Teknik Strateji

```
┌────────────────────────────────────────────────────────┐
│                   Kullanıcı Tarayıcısı                  │
│                (stoktakip.ahmettosun.me)               │
└──────────────────────────┬─────────────────────────────┘
                           │
                 PDF Yükleme / Analiz İsteği
                           │
                           ▼
          ┌───────────────────────────────────┐
          │     services/geminiService.ts     │
          │    Akıllı Çift Modlu Denetleyici   │
          └────────────────┬──────────────────┘
                           │
            /api/gemini/* endpoint'ini dene
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      [ 200 OK Sunucu Var ]      [ 404 / Ağ Hatası ]
     (AI Studio Önizleme)      (cPanel Statik Hosting)
             │                           │
             ▼                           ▼
    server.ts Express API       localStorage API Key Kontrolü
             │                           │
             │                   ┌───────┴───────┐
             │                   ▼               ▼
             │              [ Anahtar Var ] [ Anahtar Yok ]
             │                   │               │
             │                   ▼               ▼
             │          Doğrudan Gemini API   Modal Aç:
             │          (v1beta REST / SDK)  "API Anahtarı Girin"
             │                   │
             └───────────┬───────┘
                         ▼
             Fatura Kalemleri Listelenir
```

### Teknik Adımlar:
1. **`services/storageService.ts`:**
   * `getCustomApiKey()` ve `saveCustomApiKey(key: string)` fonksiyonları eklenerek anahtarın tarayıcıda saklanması sağlanacak.
2. **`services/geminiService.ts`:**
   * `parseInvoicePDF`: İlk olarak `/api/gemini/parse-invoice` çağrısı yapılacak. Eğer 404 dönerse, `storageService`'deki anahtarla doğrudan `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent` REST uç noktasına PDF base64 ve yapılandırılmış JSON şeması ile istek atılacak.
   * `analyzeBusiness`: Aynı şekilde 404 durumunda doğrudan istemci çağrısı ile işletme analizini üretecek.
3. **`components/ApiKeyModal.tsx`:**
   * Kullanıcının API anahtarını girebileceği, `aistudio.google.com/app/apikey` bağlantısını içeren şık ve kompakt bir modal bileşeni oluşturulacak.
4. **`components/Sidebar.tsx`:**
   * Ayarlar paneline "API Anahtarı Yönetimi" butonu entegre edilecek.
5. **Doğrulama:**
   * Hem sunucu API yolu hem de doğrudan istemci API yolu test edilecek; `npm run build` ile derleme doğrulanacak.
