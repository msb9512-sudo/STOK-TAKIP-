import { StorageService } from "./storageService";
import { TransactionType } from "../types";

export const GeminiService = {
  // Direct client call to Google Generative Language REST API (used on static cPanel hosting)
  callDirectGemini: async (apiKey: string, contents: any, generationConfig?: any) => {
    const cleanKey = apiKey.trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(cleanKey)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cleanKey,
      },
      body: JSON.stringify({
        contents: Array.isArray(contents)
          ? contents
          : [{ parts: Array.isArray(contents?.parts) ? contents.parts : [{ text: String(contents) }] }],
        generationConfig,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      let msg = errJson.error?.message || `Google API Hatası (${response.status})`;
      if (response.status === 400 || response.status === 401) {
        msg = "Girdiğiniz Gemini API anahtarı geçersiz. Lütfen Ayarlar > Gemini API Anahtarı bölümünden doğru anahtarı kontrol ediniz.";
      }
      throw new Error(msg);
    }

    return await response.json();
  },

  // Direct client invoice parser
  parseInvoiceDirect: async (base64Data: string, apiKey: string) => {
    const prompt = `
      Bu bir fatura belgesidir (Muhtemelen Türkçe). Lütfen belgedeki ürün kalemlerini analiz et ve listele.
      
      ÖNEMLİ KURALLAR:
      1. Sadece "Ürün/Hizmet Adı", "Miktar" ve "Birim Fiyat" alanlarını çek.
      2. KDV, İskonto, Ara Toplam, Genel Toplam, Vergi, Nakliye gibi satırları GÖRMEZDEN GEL.
      3. "Miktar" sütununu sayıya çevir (Örn: "10 Adet" -> 10).
      4. "Birim Fiyat" sütununu sayıya çevir. Para birimi işaretlerini kaldır.
      5. Her ürün için name, quantity ve unitPrice içeren saf bir JSON listesi döndür.
    `;

    const contents = [
      {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Data } },
          { text: prompt },
        ],
      },
    ];

    const generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Ürün veya hizmet adı' },
            quantity: { type: 'NUMBER', description: 'Satın alınan miktar/adet' },
            unitPrice: { type: 'NUMBER', description: 'Birim alış fiyatı' },
          },
          required: ['name', 'quantity', 'unitPrice'],
        },
      },
    };

    const data = await GeminiService.callDirectGemini(apiKey, contents, generationConfig);
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    try {
      const items = JSON.parse(text);
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  },

  // Direct client business analyzer
  analyzeBusinessDirect: async (dataContext: any, apiKey: string) => {
    const prompt = `
      Bir Bar ve Mağaza için işletme danışmanı olarak hareket et. 
      Aşağıda işletme verilerinin güncel JSON özeti bulunmaktadır:
      ${JSON.stringify(dataContext || {})}

      Lütfen Türkçe dilinde şu konuları içeren kısa bir analiz yap (maksimum 3 paragraf):
      1. Stok uyarıları (mağaza ve bar stok durumlarına göre ne eksik).
      2. Karlılık gözlemi (marjlar).
      3. Yönetici veya Mağaza Sahibi için önerilen bir aksiyon.

      Ton profesyonel ama harekete geçirici olsun. Cevabı tamamen Türkçe ver.
    `;

    const data = await GeminiService.callDirectGemini(apiKey, prompt);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Analiz oluşturulamadı.";
  },

  analyzeBusiness: async (): Promise<string> => {
    const products = StorageService.getProducts();
    const inventory = StorageService.getInventory();
    const transactions = StorageService.getTransactions();
    
    const recentTx = transactions.slice(0, 50);

    const dataContext = {
      products: products.map(p => ({ name: p.name, cost: p.costPrice, price: p.salePrice })),
      storeStock: inventory.store.map(i => {
        const p = products.find(prod => prod.id === i.productId);
        return { name: p?.name, qty: i.quantity };
      }),
      barStock: inventory.bar.map(i => {
        const p = products.find(prod => prod.id === i.productId);
        return { name: p?.name, qty: i.quantity };
      }),
      recentSales: recentTx.filter(t => t.type === TransactionType.SALE).length,
      recentTransfers: recentTx.filter(t => t.type === TransactionType.TRANSFER).length,
    };

    const customKey = StorageService.getCustomApiKey();

    // 1. Try server-side endpoint first
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customKey) headers['x-custom-api-key'] = customKey;

      const response = await fetch('/api/gemini/analyze-business', {
        method: 'POST',
        headers,
        body: JSON.stringify({ dataContext }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.text || "Analiz oluşturulamadı.";
      }

      // If server returned 404 (static hosting) or 401, fall through to direct client call
      if (response.status !== 404 && response.status !== 401) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Sunucu yanıt vermedi (${response.status})`);
      }
    } catch (serverErr: any) {
      console.warn("Server API unavailable, falling back to direct mode:", serverErr.message);
    }

    // 2. Direct client fallback (for cPanel static hosting)
    if (!customKey) {
      window.dispatchEvent(new CustomEvent('barstock-open-apikey-modal', {
        detail: { reason: 'Yapay zeka işletme analizi' },
      }));
      return "Statik hosting modu tespit edildi. İşletme analizi oluşturmak için lütfen açılan pencereden ücretsiz Google Gemini API anahtarınızı tanımlayınız.";
    }

    try {
      return await GeminiService.analyzeBusinessDirect(dataContext, customKey);
    } catch (err: any) {
      console.error("Direct Business Analysis Error:", err);
      return `Analiz oluşturulamadı. (${err.message})`;
    }
  },

  // Parse PDF Invoice with Auto-Detecting Hybrid Service
  parseInvoicePDF: async (base64Data: string) => {
    const customKey = StorageService.getCustomApiKey();

    // 1. Try server-side endpoint first (works in AI Studio Dev / Preview)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customKey) headers['x-custom-api-key'] = customKey;

      const response = await fetch('/api/gemini/parse-invoice', {
        method: 'POST',
        headers,
        body: JSON.stringify({ base64Data }),
      });

      if (response.ok) {
        const data = await response.json();
        return data.items || [];
      }

      // If 404, we are definitely on cPanel / static web hosting!
      if (response.status === 404 || response.status === 401) {
        console.info(`Server returned ${response.status}, switching to direct client mode for static hosting.`);
      } else {
        const errJson = await response.json().catch(() => ({}));
        let errMsg = errJson.error || `Sunucu hatası (${response.status})`;
        if (errMsg.includes('DEADLINE_EXCEEDED') || errMsg.includes('504')) {
          errMsg = "Fatura analizi zaman aşımına uğradı. Lütfen tekrar deneyiniz.";
        }
        throw new Error(errMsg);
      }
    } catch (fetchErr: any) {
      if (fetchErr.message && !fetchErr.message.includes('404') && !fetchErr.message.includes('Failed to fetch') && !fetchErr.message.includes('NetworkError')) {
        if (!fetchErr.message.includes('UNAUTHENTICATED') && !fetchErr.message.includes('API key')) {
          throw fetchErr;
        }
      }
    }

    // 2. Direct client fallback for cPanel static hosting
    if (!customKey) {
      window.dispatchEvent(new CustomEvent('barstock-open-apikey-modal', {
        detail: { reason: 'PDF fatura okuma' },
      }));
      throw new Error("Siteniz cPanel / statik hosting üzerinde çalışıyor. Fatura okumak için lütfen açılan pencereden Gemini API anahtarınızı giriniz.");
    }

    try {
      return await GeminiService.parseInvoiceDirect(base64Data, customKey);
    } catch (directErr: any) {
      console.error("Direct PDF Parse Error:", directErr);
      if (directErr.message?.includes('API key not valid') || directErr.message?.includes('INVALID_ARGUMENT')) {
        window.dispatchEvent(new CustomEvent('barstock-open-apikey-modal', {
          detail: { reason: 'Geçersiz API anahtarı' },
        }));
      }
      throw directErr;
    }
  },

  // Streaming Text Generation via SSE
  streamContent: async (
    prompt: string,
    onChunk: (text: string) => void,
    systemInstruction?: string
  ): Promise<void> => {
    const response = await fetch('/api/gemini/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, systemInstruction }),
    });

    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Streaming isteği başarısız oldu: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') return;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.text) onChunk(parsed.text);
            if (parsed.error) throw new Error(parsed.error);
          } catch (e: any) {
            if (e.message && e.message !== 'Unexpected end of JSON input') {
              throw e;
            }
          }
        }
      }
    }
  },

  // WebSocket Live API Helper
  createLiveSession: (
    onAudioChunk: (base64Audio: string) => void,
    onInterrupted?: () => void,
    onError?: (err: string) => void
  ) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/live`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.audio) onAudioChunk(msg.audio);
        if (msg.interrupted && onInterrupted) onInterrupted();
        if (msg.error && onError) onError(msg.error);
      } catch (e) {
        console.error('Live session message error:', e);
      }
    };

    ws.onerror = (event) => {
      console.error('Live WebSocket error:', event);
      if (onError) onError('Canlı ses bağlantısı kesildi.');
    };

    return {
      sendAudio: (base64Pcm: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ audio: base64Pcm }));
        }
      },
      close: () => {
        ws.close();
      },
      isOpen: () => ws.readyState === WebSocket.OPEN,
    };
  },
};