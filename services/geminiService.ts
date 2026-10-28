import { StorageService } from "./storageService";
import { TransactionType } from "../types";

export const GeminiService = {
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

    try {
      const response = await fetch('/api/gemini/analyze-business', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataContext }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        let raw = errJson.error || `Sunucu yanıt vermedi (${response.status})`;
        let clean = typeof raw === 'string' ? raw : JSON.stringify(raw);
        if (clean.includes('401') || clean.includes('UNAUTHENTICATED') || clean.includes('API key') || clean.includes('ACCESS_TOKEN')) {
          clean = "Gemini API anahtarı geçersiz veya tanımlanmamış.";
        }
        throw new Error(clean);
      }

      const data = await response.json();
      return data.text || "Analiz oluşturulamadı.";
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      return `Analiz oluşturulamadı. (${error.message})`;
    }
  },

  parseInvoicePDF: async (base64Data: string) => {
    try {
      const response = await fetch('/api/gemini/parse-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ base64Data }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        let raw = errJson.error || `Sunucu hatası (${response.status})`;
        let clean = typeof raw === 'string' ? raw : JSON.stringify(raw);
        if (clean.includes('401') || clean.includes('UNAUTHENTICATED') || clean.includes('ACCESS_TOKEN') || clean.includes('API key')) {
          clean = "Gemini API anahtarı bağlı değil veya yetkisiz. PDF fatura analizi için geçerli bir API anahtarı gereklidir. Dilerseniz faturadaki ürünleri manuel form üzerinden ekleyebilirsiniz.";
        } else if (clean.includes('DEADLINE_EXCEEDED') || clean.includes('504')) {
          clean = "Fatura analizi zaman aşımına uğradı. Lütfen tekrar deneyiniz.";
        } else if (clean.includes('404')) {
          clean = "Sunucu uç noktası bulunamadı (404). Lütfen ürünleri manuel form üzerinden ekleyiniz.";
        }
        throw new Error(clean);
      }

      const data = await response.json();
      return data.items || [];
    } catch (error: any) {
      console.error("PDF Parse Error:", error);
      throw error;
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