import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const port = parseInt(process.env.PORT || '3000', 10);

// Increase JSON body parser limits to comfortably accommodate base64-encoded PDF invoices
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Server-side Gemini Client Initialization
const serverApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';

function getAiClient(customKey?: string): GoogleGenAI | null {
  const key = (customKey && customKey.trim()) || serverApiKey;
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      timeout: 120000,
    },
  });
}

// Helper for resilient model execution with fallback
async function generateWithFallback(params: {
  ai: GoogleGenAI;
  contents: any;
  config?: any;
  preferredModel?: string;
}) {
  const modelsToTry = [
    params.preferredModel || 'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
  ];

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await params.ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      return response;
    } catch (err: any) {
      console.warn(`Model ${model} failed (${err.status || err.message}). Attempting fallback if available...`);
      lastError = err;
    }
  }

  throw lastError;
}

// API Routes

// 1. Business Analysis Endpoint
app.post('/api/gemini/analyze-business', async (req, res) => {
  try {
    const customKey = req.headers['x-custom-api-key'] as string | undefined;
    const aiClient = getAiClient(customKey);
    if (!aiClient) {
      return res.status(500).json({
        error: 'Sunucuda GEMINI_API_KEY tanımlanmamış. Lütfen Ayarlar > Gemini API Anahtarı bölümünden anahtarınızı giriniz.',
      });
    }

    const { dataContext } = req.body;

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

    const response = await generateWithFallback({
      ai: aiClient,
      preferredModel: 'gemini-3.1-flash-lite',
      contents: prompt,
    });

    res.json({ text: response.text || '' });
  } catch (error: any) {
    console.error('Server Gemini analyzeBusiness Error:', error);
    res.status(500).json({ error: error.message || 'İşletme analizi oluşturulamadı.' });
  }
});

// 2. PDF Invoice Parser Endpoint
app.post('/api/gemini/parse-invoice', async (req, res) => {
  try {
    const customKey = req.headers['x-custom-api-key'] as string | undefined;
    const aiClient = getAiClient(customKey);
    if (!aiClient) {
      return res.status(500).json({
        error: 'Sunucuda GEMINI_API_KEY tanımlanmamış. Lütfen Ayarlar > Gemini API Anahtarı bölümünden anahtarınızı giriniz.',
      });
    }

    const { base64Data } = req.body;
    if (!base64Data) {
      return res.status(400).json({ error: 'Fatura verisi bulunamadı.' });
    }

    const prompt = `
      Bu bir fatura belgesidir (Muhtemelen Türkçe). Lütfen belgedeki ürün kalemlerini analiz et ve listele.
      
      ÖNEMLİ KURALLAR:
      1. Sadece "Ürün/Hizmet Adı", "Miktar" ve "Birim Fiyat" alanlarını çek.
      2. KDV, İskonto, Ara Toplam, Genel Toplam, Vergi, Nakliye gibi satırları GÖRMEZDEN GEL.
      3. "Miktar" sütununu sayıya çevir (Örn: "10 Adet" -> 10).
      4. "Birim Fiyat" sütununu sayıya çevir. Para birimi işaretlerini kaldır.
      5. Her ürün için name, quantity ve unitPrice içeren JSON listesi döndür.
    `;

    const response = await generateWithFallback({
      ai: aiClient,
      preferredModel: 'gemini-3.1-flash-lite',
      contents: {
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: base64Data } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: 'Ürün veya hizmet adı',
              },
              quantity: {
                type: Type.NUMBER,
                description: 'Satın alınan miktar/adet (sayı)',
              },
              unitPrice: {
                type: Type.NUMBER,
                description: 'Birim fiyat (sayı)',
              },
            },
            required: ['name', 'quantity', 'unitPrice'],
          },
        },
      },
    });

    let jsonStr = response.text || '[]';
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

    let items: any[] = [];
    try {
      const parsed = JSON.parse(jsonStr);
      items = Array.isArray(parsed) ? parsed : [];
    } catch (parseErr) {
      console.warn('JSON parse warning:', parseErr);
    }

    res.json({ items });
  } catch (error: any) {
    console.error('Server Gemini parseInvoice Error:', error);
    let errMsg = error.message || 'Fatura analiz edilemedi.';
    if (errMsg.includes('DEADLINE_EXCEEDED') || errMsg.includes('504')) {
      errMsg = 'Fatura analizi zaman aşımına uğradı (DEADLINE_EXCEEDED). Lütfen tekrar deneyin.';
    }
    res.status(500).json({ error: errMsg });
  }
});

// 3. General Text Generation Endpoint
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const customKey = req.headers['x-custom-api-key'] as string | undefined;
    const aiClient = getAiClient(customKey);
    if (!aiClient) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const { prompt, model = 'gemini-3.1-flash-lite', systemInstruction } = req.body;
    const response = await aiClient.models.generateContent({
      model,
      contents: prompt,
      config: systemInstruction ? { systemInstruction } : undefined,
    });

    res.json({ text: response.text || '' });
  } catch (error: any) {
    console.error('Server Gemini generate Error:', error);
    res.status(500).json({ error: error.message || 'Generation failed.' });
  }
});

// 4. Streaming Text Endpoint (SSE)
app.post('/api/gemini/stream', async (req, res) => {
  try {
    const customKey = req.headers['x-custom-api-key'] as string | undefined;
    const aiClient = getAiClient(customKey);
    if (!aiClient) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const { prompt, model = 'gemini-3.1-flash-lite', systemInstruction } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const responseStream = await aiClient.models.generateContentStream({
      model,
      contents: prompt,
      config: systemInstruction ? { systemInstruction } : undefined,
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('Server Gemini stream Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Streaming failed.' });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

// 5. WebSocket Live API Server for real-time bidirectional audio/voice sessions
const wss = new WebSocketServer({ server, path: '/api/live' });

wss.on('connection', async (clientWs) => {
  const liveAi = getAiClient();
  if (!liveAi) {
    clientWs.send(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }));
    clientWs.close();
    return;
  }

  try {
    const session = await liveAi.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: 'You are an intelligent Turkish bar and inventory management assistant for Şehir Kebapçısı.',
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audio) {
            clientWs.send(JSON.stringify({ audio }));
          }
          if (message.serverContent?.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
        onclose: () => {
          clientWs.close();
        },
      },
    });

    clientWs.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.audio) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        }
      } catch (err) {
        console.error('Live WebSocket message parse error:', err);
      }
    });

    clientWs.on('close', () => {
      try {
        session.close();
      } catch (e) {
        // ignore
      }
    });
  } catch (err: any) {
    console.error('Live connect error:', err);
    clientWs.send(JSON.stringify({ error: err.message || 'Live session connection failed.' }));
    clientWs.close();
  }
});

// Dev Vite middleware or Production static files
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`✓ Full-stack server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
