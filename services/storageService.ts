
import type { InventoryState, Product, Transaction, User, Order, OrderItem, StockCountSession, StockCountItem } from '../types';
import { TransactionType, Role } from '../types';

// --- CONFIGURATION ---
// PHP API Mode is ENABLED for shared database usage
const USE_SERVER_API = true; 

// Relative path to API. 
const API_BASE_URL = 'api'; 

const STORAGE_KEYS = {
  MASTER_KEY: 'barstock_master_key',
  DATA: 'barstock_data',
  SESSION: 'barstock_session',
  SORT_PREFERENCE: 'barstock_sort_preference',
  STOCK_COUNTS: 'barstock_stock_counts',
  HIDDEN_PRODUCTS: 'barstock_hidden_products',
  API_KEY: 'barstock_gemini_api_key'
};

// --- IN-MEMORY CACHE ---
let cache = {
    products: [] as Product[],
    inventory: { store: [], bar: [] } as InventoryState,
    transactions: [] as Transaction[],
    categories: ['Bira', 'Şarap', 'Alkollü İçki', 'Meşrubat', 'Kokteyl', 'Atıştırmalık', 'Genel'],
    users: [] as User[],
    orders: [] as Order[],
    stockCounts: [] as StockCountSession[]
};

// Runtime flags
let isServerConnected = false;
let isServerAvailable = true; 

// Helper to save to local storage when API is disabled/offline
const saveToLocal = () => {
    if (!USE_SERVER_API || !isServerConnected) {
        try {
            localStorage.setItem(STORAGE_KEYS.DATA, JSON.stringify(cache));
            if (cache.stockCounts) {
                localStorage.setItem(STORAGE_KEYS.STOCK_COUNTS, JSON.stringify(cache.stockCounts));
            }
        } catch (e) {
            console.error("Local Save Error:", e);
        }
    }
};

// --- ENCODING FIX HELPER (STANDARD) ---
const fixEncoding = (text: string): string => {
    if (!text) return "";
    let fixed = text.trim();
    
    // 1. Fix multi-byte sequences FIRST before single-character replacements
    fixed = fixed.replace(/Ä±/g, 'ı').replace(/Ä°/g, 'İ');
    fixed = fixed.replace(/ÄŸ/g, 'ğ').replace(/Äž/g, 'Ğ').replace(/ÄĞ/g, 'Ğ');
    fixed = fixed.replace(/ÅŸ/g, 'ş').replace(/Åž/g, 'Ş');
    fixed = fixed.replace(/Ã§/g, 'ç').replace(/Ã‡/g, 'Ç');
    fixed = fixed.replace(/Ã¶/g, 'ö').replace(/Ã–/g, 'Ö');
    fixed = fixed.replace(/Ã¼/g, 'ü').replace(/Ãœ/g, 'Ü');
    fixed = fixed.replace(/â€“/g, '-').replace(/â€™/g, "'");

    // Fix already corrupted artifacts from prior wrong regex replacements
    fixed = fixed.replace(/Ğ±/g, 'ı').replace(/ğ±/g, 'ı');
    fixed = fixed.replace(/Ğ°/g, 'İ').replace(/ğ°/g, 'İ');
    fixed = fixed.replace(/Ã½/g, 'ı').replace(/Ã¾/g, 'ş');
    
    return fixed;
};

// --- ADVANCED MATCHING HELPERS ---

// Levenshtein Distance Algorithm
const levenshteinDistance = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
    }
    return matrix[b.length][a.length];
};

// 1. Dictionary for abbreviations commonly used in invoices vs system
const ALIAS_MAP: Record<string, string> = {
    'td': 'tekirdag',
    'y.seri': 'yeni seri',
    'y seri': 'yeni seri',
    'yseri': 'yeni seri',
    'b.b': 'beylerbeyi',
    'bb': 'beylerbeyi',
    'b.u': 'bu', 
    's.z': 'sari zeybek',
    'y.raki': 'yeni raki',
    'yas': 'yas uzum',
    'm.mese': 'mese',
    'c.regal': 'chivas',
    'regal': 'chivas',
    'egeo': 'egeo',
    'selection': 'selection',
    'sauv': 'sauvignon',
    'cab': 'cabernet',
    'blc': 'blanc',
    'okuzgozu': 'okuzgozu',
    'bogazkere': 'bogazkere',
    'a.s': 'altin seri',     
    'as': 'altin seri',      
    'a.s.': 'altin seri',    
    'altin': 'altin seri',   
    'gold': 'altin seri',
    'gb': 'gobek',
    'gobek': 'gobek',
    'göbek': 'gobek'
};

// Helper to extract volume (e.g., 70, 35, 50, 100) from string
const extractVolume = (text: string): number | null => {
    // Look for explicit units first: 70cl, 70 cl, 700ml, 0.7lt
    // Handles formats like "6/70 CL", "100clx12AD"
    const clMatch = text.match(/(\d+(?:\.\d+)?)\s*cl/i);
    if (clMatch) return parseFloat(clMatch[1]);

    const mlMatch = text.match(/(\d+)\s*ml/i);
    if (mlMatch) return parseFloat(mlMatch[1]) / 10; // Convert to cl

    const ltMatch = text.match(/(\d+(?:\.\d+)?)\s*lt/i);
    if (ltMatch) return parseFloat(ltMatch[1]) * 100; // Convert to cl

    // Look for implicit volume numbers commonly used in alcohol names
    // Only if they appear as standalone tokens to avoid matching year dates (1937) or codes (450)
    const commonVolumes = ['35', '50', '70', '100', '175', '20', '200', '37.5', '75'];
    
    // Normalize text for search (spaces around)
    const padded = ` ${text.toLowerCase().replace(/[^a-z0-9]/g, ' ')} `;
    
    for (const vol of commonVolumes) {
        if (padded.includes(` ${vol} `)) return parseFloat(vol);
    }

    return null;
};

const normalizeForMatching = (text: string): string[] => {
    let clean = fixEncoding(text).toLocaleLowerCase('tr-TR');
    
    // --- SPECIAL INVOICE CLEANING RULES ---
    
    // 1. Remove Wine Codes (e.g. 153.01.029)
    clean = clean.replace(/^\d{3}\.\d{2}\.\d{3}\s+/, '');
    
    // 2. Remove HNR/Raki Codes (e.g. RBB-GB 100-TR00)
    clean = clean.replace(/rbb-[a-z]+\s+/g, '');
    clean = clean.replace(/\d{2,3}-tr\d{2}/g, '');
    clean = clean.replace(/cr\d{6}/g, ''); // Chivas codes like CR180070

    // 3. Remove "garbage" and OCR errors
    clean = clean.replace(/%\d+/g, '');
    clean = clean.replace(/\d+%/g, '');
    clean = clean.replace(/\d+º/g, ''); // 45º
    clean = clean.replace(/\d+o/g, ''); // 45o
    clean = clean.replace(/\d+°/g, ''); // 45°
    clean = clean.replace(/\b450\b/g, '45'); // OCR Error: 450 -> 45
    clean = clean.replace(/\(\d+\)/g, ''); // (1937)
    
    // Replace Aliases
    Object.keys(ALIAS_MAP).forEach(alias => {
        // Escape dots for regex
        const escapedAlias = alias.replace('.', '\\.');
        // Match whole word or end of string to avoid replacing inside words
        const regex = new RegExp(`\\b${escapedAlias}\\b`, 'g');
        clean = clean.replace(regex, ALIAS_MAP[alias]);
    });

    // Remove invoice artifacts
    clean = clean.replace(/^\d{4,}\s+/, ''); // Remove leading SKUs like "40015..."
    
    // Replace punctuation with space
    clean = clean.replace(/[\(\)\[\]\{\}\.\,\-\_\*\?\!\/\\\:\;\|\&]/g, ' ');

    // Split into tokens
    let tokens = clean.split(/\s+/).filter(t => t.length > 1);

    // Filter noise tokens
    const STOP_WORDS = [
        'raki', 'rakisi', 'sarap', 'sarabi', 'votka', 'viski', 'bira', // Generic types
        'koli', 'adet', 'ad', 'tava', 'shr', 'sise', 'depozito', 'kapak', 'bilye', // Packaging
        'vol', 'alk', 'derece', 'fici', 'kutu', 'teneke', 'sabla', // Specs
        'kod', 'urun', 'mal', 'hizmet', 'dy', 'on', 'tr', 'yap', 'kredi', 'bankasi', // Invoice artifacts
        'yeni', 'eski' 
    ];

    tokens = tokens.filter(t => !STOP_WORDS.includes(t));

    return tokens;
};

const findSmartMatch = (invoiceName: string, products: Product[]): Product | undefined => {
    const invVol = extractVolume(invoiceName);
    const invTokens = normalizeForMatching(invoiceName);
    
    // 0. EXACT ALIAS CHECK (THE "LEARNING" SHORTCUT)
    // If the invoice name exactly matches a known alias, return it immediately.
    const normalizedInvoiceName = invoiceName.trim();
    for (const prod of products) {
        if (prod.aliases && prod.aliases.some(a => a.toLowerCase() === normalizedInvoiceName.toLowerCase())) {
            return prod;
        }
    }

    let bestMatch: Product | undefined;
    let maxScore = 0;

    // --- CRITICAL: DISTINGUISHING FEATURES ---
    // These words define the IDENTITY of the product.
    // Mismatches here are FATAL for a match.
    const DISTINGUISHING_TOKENS = [
        'gobek', 'altin', 'gold', 'yas', 'uzum', 'no', '10', '12', '18', 
        'mavi', 'yesil', 'sari', 'zeybek', 'platin', 'ala', 'kara', 'egeo', 'klasik', 'seri'
    ];

    for (const prod of products) {
        // 1. VOLUME CHECK (CRITICAL)
        const prodVol = extractVolume(prod.name);
        
        // If invoice has volume, product MUST match volume.
        if (invVol !== null && prodVol !== null) {
            if (invVol !== prodVol) continue; // Mismatch 35cl vs 70cl -> SKIP
        }

        const prodTokens = normalizeForMatching(prod.name);
        
        // --- 2. STRICT CONFLICT CHECK ---
        const invFeatures = invTokens.filter(t => DISTINGUISHING_TOKENS.includes(t));
        const prodFeatures = prodTokens.filter(t => DISTINGUISHING_TOKENS.includes(t));
        
        // Intersection Rule:
        // If BOTH have distinguishing features, they MUST share at least one.
        // Example: Inv: [altin], Prod: [gobek] -> No intersection -> REJECT
        // Example: Inv: [tekirdag], Prod: [gobek] -> Inv has NO features, Prod has [gobek]. 
        //          This is "Generic vs Specific". Usually risky.
        
        if (invFeatures.length > 0 && prodFeatures.length > 0) {
            const intersection = invFeatures.filter(f => prodFeatures.includes(f));
            if (intersection.length === 0) continue; // NO SHARED DISTINGUISHING FEATURES -> REJECT
        }

        // Specific Anti-Pattern: A.S. (Altin) should never match Generic "Tekirdag Raki" if "Tekirdag Altin Seri" exists.
        // But here we are just checking ONE product. 
        // If Invoice is "Altin" and Product is "Generic" (no features), it MIGHT be a match (if Altin prod doesn't exist yet).
        // But usually it's safer to create a NEW product than to pollute a generic one.
        // For now, let's allow Specific -> Generic matches but score them lower.
        // But BLOCKS Specific A -> Specific B.

        // 3. TOKEN MATCHING
        let score = 0;
        for (const iToken of invTokens) {
            let tokenMatch = false;

            // Exact match
            if (prodTokens.includes(iToken)) {
                score += 10;
                tokenMatch = true;
            } else {
                // Fuzzy match
                for (const pToken of prodTokens) {
                    if (Math.abs(pToken.length - iToken.length) <= 1) {
                        const dist = levenshteinDistance(pToken, iToken);
                        if (dist <= 1 && pToken.length > 3) {
                            score += 8; // Close enough
                            tokenMatch = true;
                            break;
                        }
                    }
                }
            }

            if (tokenMatch) {
                // Brand/Key Word Bonuses
                if (['tekirdag', 'efe', 'beylerbeyi', 'sari', 'zeybek', 'chivas', 'jack', 'jb', 'egeo', 'selection'].includes(iToken)) {
                    score += 5; 
                }
            }
        }

        // 4. PENALTIES
        // If product has a specific number (e.g. "10", "12", "18") that is NOT in invoice, penalize.
        const prodNumbers = prodTokens.filter(t => /^\d+$/.test(t));
        const invNumbers = invTokens.filter(t => /^\d+$/.test(t));
        
        for (const num of prodNumbers) {
            if (parseFloat(num) === prodVol) continue;
            if (!invNumbers.includes(num)) {
                score -= 20; // Heavy penalty for mismatching Year/Series number
            }
        }

        // Minimum threshold to accept a match
        // Increased threshold to reduce false positives
        if (score > maxScore && score > 25) {
            maxScore = score;
            bestMatch = prod;
        }
    }

    return bestMatch;
};

// --- SORTING HELPER ---
const applySortOrder = (products: Product[]) => {
    return [...products].sort((a, b) => {
        const orderA = a.sortOrder !== undefined ? a.sortOrder : 9999;
        const orderB = b.sortOrder !== undefined ? b.sortOrder : 9999;
        return orderA - orderB;
    });
};

const notifyChanges = () => {
    saveToLocal(); 
    window.dispatchEvent(new Event('barstock-storage-update'));
};

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// --- API HELPER ---
const apiCall = async (action: string, method: 'GET' | 'POST', body?: any) => {
    if (!USE_SERVER_API || !isServerAvailable) return null; 

    try {
        const options: RequestInit = { 
            method,
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store' 
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        const url = `${API_BASE_URL}/index.php?action=${action}&t=${Date.now()}`;
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
            if(response.status === 404) {
                isServerAvailable = false;
                throw new Error('API_MISSING');
            }
            if(response.status === 500) throw new Error(`Sunucu Hatası (500).`);
            throw new Error(`HTTP Hatası: ${response.status}`);
        }
        
        const text = await response.text();
        if (!text) return {}; 

        try {
            if (text.trim().startsWith('<')) throw new Error(`Sunucudan geçersiz yanıt alındı.`);
            const json = JSON.parse(text);
            if (json.error) throw new Error(json.error);
            isServerConnected = true;
            return json;
        } catch (e: any) {
            if (e.message.includes('Sunucu') || e.message.includes('API')) throw e;
            console.error("JSON Parse Error:", text);
            throw new Error("Sunucudan gelen veri okunamadı.");
        }

    } catch (error: any) {
        isServerConnected = false;
        if (error.message === 'API_MISSING' || error.message.includes('404')) {
             console.warn("Sunucu bulunamadı (404), çevrimdışı mod.");
             throw new Error("Sunucu bulunamadı (Çevrimdışı Mod)");
        } else {
            console.warn(`API '${action}' failed:`, error.message);
        }
        throw error; 
    }
};

// --- SYNC HELPER ---
const syncWithServerInternal = async () => {
    if (!USE_SERVER_API) return false;
    try {
        const data = await apiCall('sync', 'GET');
        if (data) {
            let fetchedProducts = data.products || [];
            
            // --- PERSISTENT LOCAL SORT AUTHORITY ---
            try {
                const localSortPref = localStorage.getItem(STORAGE_KEYS.SORT_PREFERENCE);
                
                if (localSortPref) {
                    const idOrder: string[] = JSON.parse(localSortPref);
                    if (Array.isArray(idOrder) && idOrder.length > 0) {
                        const sortMap = new Map(idOrder.map((id, index) => [id, index]));
                        
                        fetchedProducts = fetchedProducts.map((p: Product) => {
                            if (sortMap.has(p.id)) {
                                return { ...p, sortOrder: sortMap.get(p.id) };
                            }
                            return { ...p, sortOrder: p.sortOrder ?? 9999 };
                        });
                    }
                } else if (fetchedProducts.length > 0) {
                    const initialOrder = applySortOrder(fetchedProducts).map((p: Product) => p.id);
                    localStorage.setItem(STORAGE_KEYS.SORT_PREFERENCE, JSON.stringify(initialOrder));
                }
            } catch (sortErr) {
                console.warn("Error applying local sort preference:", sortErr);
            }

            // Apply encoding fix
            fetchedProducts = fetchedProducts.map((p: Product) => ({
                ...p,
                name: fixEncoding(p.name),
                category: fixEncoding(p.category),
                aliases: p.aliases || []
            }));

            // DYNAMIC CATEGORY EXTRACTION
            const productCategories = new Set(fetchedProducts.map((p: Product) => p.category));
            const serverCategories = data.categories || [];
            const allCategories = Array.from(new Set([
                ...cache.categories, 
                ...serverCategories, 
                ...Array.from(productCategories)
            ]));
            
            cache.categories = allCategories;

            // Apply Sort
            cache.products = applySortOrder(fetchedProducts);
            
            cache.inventory = {
                store: data.inventory?.store || [],
                bar: data.inventory?.bar || []
            };
            cache.transactions = data.transactions || [];
            cache.users = data.users || [];
            cache.orders = data.orders || [];
            cache.stockCounts = data.stockCounts || [];
            
            isServerConnected = true;
            notifyChanges();
            return true;
        }
    } catch (e) {
        // Silent fail for polling
    }
    return false;
};

export const StorageService = {
  formatCurrency: (amount: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount),
  
  // Public exposure for views to use
  normalizeText: fixEncoding,
  
  // EXPOSE SMART MATCHER FOR VIEWS
  findSmartMatch: (name: string) => findSmartMatch(name, cache.products),

  parseNumber: (value: any): number => {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
          let clean = value.replace(/[₺$€\s"]/g, ''); 
          if (clean.includes('.') && clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
          else if (clean.includes(',') && !clean.includes('.')) clean = clean.replace(',', '.');
          const num = parseFloat(clean);
          return isNaN(num) ? 0 : num;
      }
      return 0;
  },

  // --- INITIALIZATION ---
  init: async () => {
      if (!localStorage.getItem(STORAGE_KEYS.MASTER_KEY)) localStorage.setItem(STORAGE_KEYS.MASTER_KEY, '1453');

      let syncSuccess = false;

      // 2. SYNC WITH PHP SERVER
      syncSuccess = await syncWithServerInternal();
      if(syncSuccess) console.log("✅ Sunucu ile senkronize edildi.");
      else console.log(`ℹ️ Sunucu bağlantısı kurulamadı.`);
      
      // 3. FALLBACK TO LOCAL STORAGE
      if (!syncSuccess) {
          const localData = localStorage.getItem(STORAGE_KEYS.DATA);
          if (localData) {
              try {
                  const parsed = JSON.parse(localData);
                  let localProducts = parsed.products || [];
                  
                  localProducts = localProducts.map((p: Product) => ({
                      ...p,
                      name: fixEncoding(p.name),
                      category: fixEncoding(p.category),
                      aliases: p.aliases || []
                  }));
                  
                  cache = {
                      ...cache,
                      products: applySortOrder(localProducts),
                      categories: parsed.categories?.length > 0 ? parsed.categories : cache.categories,
                      inventory: parsed.inventory || { store: [], bar: [] },
                      transactions: parsed.transactions || [],
                      users: parsed.users || [],
                      orders: parsed.orders || [],
                      stockCounts: parsed.stockCounts || []
                  };
                  console.log("✅ Yerel veriler yüklendi.");
              } catch (e) {
                  console.error("Yerel veri okuma hatası:", e);
              }
          }
      }

      // Check separate stock counts storage if needed
      if (!cache.stockCounts || cache.stockCounts.length === 0) {
          const localCounts = localStorage.getItem(STORAGE_KEYS.STOCK_COUNTS);
          if (localCounts) {
              try {
                  cache.stockCounts = JSON.parse(localCounts);
              } catch (e) {
                  console.error("Stock counts parse error:", e);
              }
          }
      }

      // SEED DEFAULT PRODUCTS IF EMPTY (Includes prominent Rakı line-up)
      if (cache.products.length === 0) {
          const defaultItems: Array<{ name: string; category: string; costPrice: number; salePrice: number; store: number; bar: number }> = [
              { name: 'Yeni Rakı 70cl', category: 'Alkollü İçki', costPrice: 550, salePrice: 1100, store: 24, bar: 8 },
              { name: 'Yeni Rakı Yeni Seri 70cl', category: 'Alkollü İçki', costPrice: 600, salePrice: 1250, store: 18, bar: 6 },
              { name: 'Tekirdağ Rakısı Altın Seri 70cl', category: 'Alkollü İçki', costPrice: 680, salePrice: 1400, store: 16, bar: 6 },
              { name: 'Tekirdağ Rakısı Göbek 70cl', category: 'Alkollü İçki', costPrice: 750, salePrice: 1550, store: 12, bar: 4 },
              { name: 'Beylerbeyi Göbek Rakısı 70cl', category: 'Alkollü İçki', costPrice: 780, salePrice: 1600, store: 20, bar: 7 },
              { name: 'Sarı Zeybek 70cl', category: 'Alkollü İçki', costPrice: 720, salePrice: 1500, store: 10, bar: 4 },
              { name: 'Kulüp Rakı 70cl', category: 'Alkollü İçki', costPrice: 650, salePrice: 1350, store: 8, bar: 3 },
              { name: 'Efe Gold Rakı 70cl', category: 'Alkollü İçki', costPrice: 690, salePrice: 1450, store: 14, bar: 5 },
              { name: 'Efes Pilsen 50cl', category: 'Bira', costPrice: 45, salePrice: 110, store: 96, bar: 36 },
              { name: 'Tuborg Gold 50cl', category: 'Bira', costPrice: 45, salePrice: 110, store: 84, bar: 30 },
              { name: 'Chivas Regal 12 70cl', category: 'Alkollü İçki', costPrice: 850, salePrice: 1800, store: 12, bar: 4 },
              { name: 'Kavaklıdere Yakut 75cl', category: 'Şarap', costPrice: 220, salePrice: 550, store: 24, bar: 10 }
          ];

          defaultItems.forEach((d, idx) => {
              const pid = 'prod_' + (idx + 1);
              cache.products.push({
                  id: pid,
                  name: d.name,
                  category: d.category,
                  costPrice: d.costPrice,
                  salePrice: d.salePrice,
                  image: `https://picsum.photos/200/200?random=${idx + 10}`,
                  minStockLevel: 15,
                  sortOrder: idx,
                  aliases: []
              });
              cache.inventory.store.push({ productId: pid, quantity: d.store });
              cache.inventory.bar.push({ productId: pid, quantity: d.bar });
          });
      }

      // Seed initial sample stock count for calendar demonstration if empty
      if (!cache.stockCounts || cache.stockCounts.length === 0) {
          const todayStr = new Date().toISOString().split('T')[0];
          const rakiProds = cache.products.filter(p => 
              p.name.toLowerCase().includes('rakı') || 
              p.name.toLowerCase().includes('raki') || 
              p.name.toLowerCase().includes('beylerbeyi') ||
              p.name.toLowerCase().includes('tekirdağ') ||
              p.name.toLowerCase().includes('sarı zeybek')
          );

          if (rakiProds.length > 0) {
              const sampleItems: StockCountItem[] = rakiProds.map(p => {
                  const s = cache.inventory.store.find(i => i.productId === p.id)?.quantity || 0;
                  const b = cache.inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
                  return {
                      productId: p.id,
                      productName: p.name,
                      category: p.category,
                      systemStore: s,
                      systemBar: b,
                      systemTotal: s + b,
                      countedStore: s,
                      countedBar: b,
                      countedTotal: s + b,
                      difference: 0,
                      costPrice: p.costPrice,
                      differenceValue: 0
                  };
              });

              cache.stockCounts = [
                  {
                      id: 'sc_sample_1',
                      date: todayStr,
                      timestamp: Date.now() - 3600000 * 2,
                      performedBy: 'Sistem Yöneticisi',
                      note: 'Haftalık Rutin Rakı Envanter Sayımı',
                      categoryFilter: 'Rakılar',
                      items: sampleItems,
                      totalDifferenceQuantity: 0,
                      totalDifferenceValue: 0,
                      appliedToInventory: true
                  }
              ];
          }
      }

      notifyChanges();
      return true; 
  },

  isCloudActive: () => isServerConnected, 
  connectToCloud: async () => true,
  disconnectCloud: () => {},
  
  // Explicitly trigger a sync (Polling)
  syncWithServer: syncWithServerInternal,

  // --- GETTERS ---
  getProducts: () => {
      // Return sorted products
      return applySortOrder(cache.products).map(p => ({
          ...p,
          name: fixEncoding(p.name),
          category: fixEncoding(p.category)
      }));
  },
  getInventory: () => JSON.parse(JSON.stringify(cache.inventory)),
  getTransactions: () => [...cache.transactions],
  getCategories: () => [...cache.categories],
  getUsers: () => [...cache.users],
  getOrders: () => [...cache.orders],
  getStockCounts: (): StockCountSession[] => [...(cache.stockCounts || [])],
  
  // Hidden products (Kullanılmayan/Gizlenen ürünler)
  getHiddenProductIds: (): string[] => {
      try {
          const stored = localStorage.getItem(STORAGE_KEYS.HIDDEN_PRODUCTS);
          return stored ? JSON.parse(stored) : [];
      } catch {
          return [];
      }
  },
  hideProduct: (productId: string) => {
      try {
          const current = StorageService.getHiddenProductIds();
          if (!current.includes(productId)) {
              const updated = [...current, productId];
              localStorage.setItem(STORAGE_KEYS.HIDDEN_PRODUCTS, JSON.stringify(updated));
              notifyChanges();
          }
      } catch (e) {
          console.error("Hide product error:", e);
      }
  },
  unhideProduct: (productId: string) => {
      try {
          const current = StorageService.getHiddenProductIds();
          const updated = current.filter(id => id !== productId);
          localStorage.setItem(STORAGE_KEYS.HIDDEN_PRODUCTS, JSON.stringify(updated));
          notifyChanges();
      } catch (e) {
          console.error("Unhide product error:", e);
      }
  },
  unhideAllProducts: () => {
      try {
          localStorage.setItem(STORAGE_KEYS.HIDDEN_PRODUCTS, JSON.stringify([]));
          notifyChanges();
      } catch (e) {
          console.error("Unhide all error:", e);
      }
  },

  // Helper to get current session
  getCurrentSession: () => {
      try {
          const stored = localStorage.getItem(STORAGE_KEYS.SESSION);
          return stored ? JSON.parse(stored) : null;
      } catch { return null; }
  },

  // --- ACTIONS ---

  hardReset: async () => {
      if (confirm("Tüm verileri silmek istediğinize emin misiniz?")) {
           if (USE_SERVER_API && isServerConnected) {
              alert("Sunucu modu aktifken sıfırlama işlemi hosting panelinden yapılmalıdır.");
           } else {
               localStorage.removeItem(STORAGE_KEYS.DATA);
               localStorage.removeItem(STORAGE_KEYS.SESSION);
               localStorage.removeItem(STORAGE_KEYS.SORT_PREFERENCE);
               localStorage.removeItem(STORAGE_KEYS.STOCK_COUNTS);
               window.location.reload();
           }
      }
  },

  saveStockCount: async (session: StockCountSession, applyToInventory: boolean = true): Promise<StockCountSession> => {
      if (!cache.stockCounts) cache.stockCounts = [];
      const sessionWithFlag: StockCountSession = { ...session, appliedToInventory: applyToInventory };
      
      const existingIdx = cache.stockCounts.findIndex(s => s.id === session.id);
      if (existingIdx !== -1) {
          cache.stockCounts[existingIdx] = sessionWithFlag;
      } else {
          cache.stockCounts.unshift(sessionWithFlag);
      }

      if (applyToInventory) {
          session.items.forEach(item => {
              // Update Store Stock
              let storeItem = cache.inventory.store.find(i => i.productId === item.productId);
              if (storeItem) {
                  storeItem.quantity = item.countedStore;
              } else {
                  cache.inventory.store.push({ productId: item.productId, quantity: item.countedStore });
              }

              // Update Bar Stock
              let barItem = cache.inventory.bar.find(i => i.productId === item.productId);
              if (barItem) {
                  barItem.quantity = item.countedBar;
              } else {
                  cache.inventory.bar.push({ productId: item.productId, quantity: item.countedBar });
              }

              // If there is any discrepancy, register a transaction
              if (item.difference !== 0) {
                  const diffTx: Transaction = {
                      id: generateId(),
                      type: TransactionType.COUNT_ADJUSTMENT,
                      productId: item.productId,
                      quantity: item.difference,
                      totalValue: item.differenceValue,
                      timestamp: session.timestamp,
                      note: `Fiziki Sayım Düzeltmesi (${session.date} - ${session.performedBy}): Depo ${item.systemStore} -> ${item.countedStore}, Bar ${item.systemBar} -> ${item.countedBar}`
                  };
                  cache.transactions.unshift(diffTx);
                  if (isServerConnected) {
                      apiCall('save_transaction', 'POST', { transaction: diffTx }).catch(console.error);
                  }
              }
          });
      }

      notifyChanges();

      if (isServerConnected) {
          try {
              await apiCall('save_stock_count', 'POST', sessionWithFlag);
          } catch (e) {
              console.warn("Server stock count save failed, saved locally:", e);
          }
      }

      return sessionWithFlag;
  },

  deleteStockCount: async (id: string): Promise<void> => {
      if (!cache.stockCounts) return;
      cache.stockCounts = cache.stockCounts.filter(s => s.id !== id);
      notifyChanges();
      if (isServerConnected) {
          try {
              await apiCall('delete_stock_count', 'POST', { id });
          } catch (e) {
              console.warn("Server delete stock count failed:", e);
          }
      }
  },

  createNewProduct: async (name: string, costPrice: number, salePrice: number, category: string = 'Genel') => {
      const newProduct: Product = {
          id: generateId(), 
          name: fixEncoding(name), 
          category: fixEncoding(category), 
          costPrice, 
          salePrice,
          image: `https://picsum.photos/200/200?random=${Math.floor(Math.random() * 1000)}`,
          minStockLevel: 20,
          sortOrder: cache.products.length,
          aliases: []
      };
      
      cache.products.push(newProduct);
      cache.inventory.store.push({ productId: newProduct.id, quantity: 0 });
      cache.inventory.bar.push({ productId: newProduct.id, quantity: 0 });
      
      notifyChanges();

      if(isServerConnected) await apiCall('save_product', 'POST', newProduct);
      return newProduct;
  },

  learnProductAlias: async (productId: string, alias: string) => {
      const cleanAlias = alias.trim();
      const idx = cache.products.findIndex(x => x.id === productId);
      if (idx !== -1) {
          const product = cache.products[idx];
          if (!product.aliases) product.aliases = [];
          
          if (!product.aliases.includes(cleanAlias)) {
              product.aliases.push(cleanAlias);
              notifyChanges();
              if (isServerConnected) await apiCall('save_product', 'POST', product);
          }
      }
  },

  updateProduct: async (productId: string, updates: Partial<Product>) => {
      const idx = cache.products.findIndex(x => x.id === productId);
      if(idx !== -1) {
          const updatedProduct = { ...cache.products[idx], ...updates };
          
          if (updatedProduct.name) updatedProduct.name = fixEncoding(updatedProduct.name);
          if (updatedProduct.category) updatedProduct.category = fixEncoding(updatedProduct.category);

          cache.products[idx] = updatedProduct;
          notifyChanges();
          if(isServerConnected) await apiCall('save_product', 'POST', updatedProduct);
      }
  },

  deleteProduct: async (productId: string) => {
      cache.products = cache.products.filter(p => p.id !== productId);
      cache.inventory.store = cache.inventory.store.filter(i => i.productId !== productId);
      cache.inventory.bar = cache.inventory.bar.filter(i => i.productId !== productId);
      
      notifyChanges();
      if(isServerConnected) await apiCall('delete_product', 'POST', { id: productId });
  },

  saveProducts: async (products: Product[]) => {
      const updatedProducts = products.map((p, index) => ({
          ...p,
          sortOrder: index
      }));
      cache.products = updatedProducts;

      try {
          const idOrder = updatedProducts.map(p => p.id);
          localStorage.setItem(STORAGE_KEYS.SORT_PREFERENCE, JSON.stringify(idOrder));
      } catch (e) {
          console.error("Failed to save local sort preference", e);
      }

      notifyChanges();

      if (isServerConnected) {
          try {
              const updates = updatedProducts.map(p => apiCall('save_product', 'POST', p));
              Promise.all(updates).then(() => {
                  console.log("Sort order synced to server.");
              }).catch(e => {
                  console.error("Sort sync error:", e);
              });
          } catch (e) {
              console.warn("Sort order sync initiation failed", e);
          }
      }
  },

  purchaseStock: async (productId: string, quantity: number, cost: number, performedBy: string = 'Sistem', supplier?: string, invoiceNo?: string) => {
      // Update product cost price in Depo Yönetimi if incoming price is different
      const product = cache.products.find(p => p.id === productId);
      const incomingCost = Number(cost);
      if (product && incomingCost > 0 && Math.abs(product.costPrice - incomingCost) >= 0.01) {
          product.costPrice = incomingCost;
          if (isServerConnected) {
              apiCall('save_product', 'POST', product).catch(console.error);
          }
      }

      const transaction: Transaction = {
          id: generateId(), 
          type: TransactionType.PURCHASE, 
          productId, 
          quantity: Number(quantity), 
          totalValue: incomingCost * Number(quantity), 
          timestamp: Date.now(), 
          note: `Mal Kabul (İşleyen: ${performedBy})`,
          supplier,
          invoiceNo
      };

      const item = cache.inventory.store.find(i => i.productId === productId);
      if (item) item.quantity += Number(quantity);
      else cache.inventory.store.push({ productId, quantity: Number(quantity) });
      
      cache.transactions.unshift(transaction);
      notifyChanges();

      if(isServerConnected) await apiCall('save_transaction', 'POST', { transaction });
  },

  transferToBar: async (productId: string, quantity: number, customNote?: string) => {
      const storeItem = cache.inventory.store.find(i => i.productId === productId);
      if (!storeItem || storeItem.quantity < quantity) throw new Error("Yetersiz stok");

      const transaction: Transaction = {
          id: generateId(), type: TransactionType.TRANSFER, productId, quantity, totalValue: 0, 
          timestamp: Date.now(), note: customNote || 'Bara Transfer'
      };

      storeItem.quantity -= quantity;
      const barItem = cache.inventory.bar.find(i => i.productId === productId);
      if (barItem) barItem.quantity += quantity;
      else cache.inventory.bar.push({ productId, quantity });

      cache.transactions.unshift(transaction);
      notifyChanges();

      if(isServerConnected) await apiCall('save_transaction', 'POST', { transaction });
  },

  makeSale: async (productId: string, quantity: number, performedBy: string = 'Barmen') => {
      const barItem = cache.inventory.bar.find(i => i.productId === productId);
      
      if (barItem) {
          barItem.quantity -= quantity; 
      } else {
          cache.inventory.bar.push({ productId, quantity: -quantity });
      }

      const product = cache.products.find(p => p.id === productId);
      const val = (product?.salePrice || 0) * quantity;

      const transaction: Transaction = {
          id: generateId(), type: TransactionType.SALE, productId, quantity, totalValue: val,
          timestamp: Date.now(), 
          note: `Bar Satışı (${performedBy})`
      };

      cache.transactions.unshift(transaction);
      notifyChanges();

      if(isServerConnected) await apiCall('save_transaction', 'POST', { transaction });
  },

  // User Management
  restoreSession: async () => {
      const stored = localStorage.getItem(STORAGE_KEYS.SESSION);
      return stored ? JSON.parse(stored) : null;
  },
  loginUser: async (username: string, pass: string) => {
      if (isServerConnected) await StorageService.init(); 
      const user = cache.users.find((u: User) => u.username === username && u.password === pass);
      if (!user) throw new Error('Hatalı kullanıcı adı veya şifre');
      localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
      return user;
  },
  logoutUser: () => localStorage.removeItem(STORAGE_KEYS.SESSION),
  
  registerUser: async (user: User) => {
      if(cache.users.some(u => u.username === user.username)) throw new Error("Bu kullanıcı adı zaten kullanılıyor.");
      if (isServerConnected) await apiCall('register_user', 'POST', user);
      cache.users.push(user);
      notifyChanges();
  },
  
  updateUser: async (username: string, updates: Partial<User>) => {
      const idx = cache.users.findIndex(u => u.username === username);
      if(idx !== -1) {
          cache.users[idx] = {...cache.users[idx], ...updates};
          notifyChanges();
          if(isServerConnected) await apiCall('update_user', 'POST', { username, ...updates });
      }
  },
  
  deleteUser: async (username: string) => {
      cache.users = cache.users.filter(u => u.username !== username);
      notifyChanges();
      if(isServerConnected) await apiCall('delete_user', 'POST', { username });
  },

  // Categories
  addCategory: async (name: string) => {
      if (!cache.categories.includes(name)) {
          cache.categories.push(name);
          notifyChanges();
      }
  },
  deleteCategory: async (name: string) => {
      cache.categories = cache.categories.filter(c => c !== name);
      cache.products.forEach(p => {
          if (p.category === name) p.category = 'Genel';
      });
      notifyChanges();
  },
  updateProductCategory: async (productId: string, newCat: string) => {
      const p = cache.products.find(x => x.id === productId);
      if(p) { 
          p.category = newCat;
          notifyChanges();
          if(isServerConnected) await apiCall('save_product', 'POST', p);
      }
  },

  // Orders
  createOrder: async (items: OrderItem[], username: string) => {
      const newOrder: Order = {
          id: generateId(), items, status: 'PENDING', timestamp: Date.now(), requestedBy: username
      };
      cache.orders.unshift(newOrder);
      notifyChanges();
      if(isServerConnected) await apiCall('create_order', 'POST', newOrder);
  },

  rejectOrder: async (orderId: string) => {
      const order = cache.orders.find(o => o.id === orderId);
      if (order) {
          order.status = 'CANCELLED';
          notifyChanges();
          if(isServerConnected) await apiCall('update_order', 'POST', { id: orderId, status: 'CANCELLED' });
      }
  },

  approveOrder: async (orderId: string, approvedProductIds: string[], approvedBy: string = 'Yönetici') => {
      const order = cache.orders.find(o => o.id === orderId);
      if (!order) throw new Error("Sipariş bulunamadı");
      if (order.status !== 'PENDING') throw new Error("Bu sipariş zaten işlenmiş.");

      const itemsStatus: any[] = [];
      
      for (const item of order.items) {
          if (approvedProductIds.includes(item.productId)) {
              item.status = 'APPROVED';
              const qty = Number(item.quantity);

              const storeItem = cache.inventory.store.find(i => i.productId === item.productId);
              if (storeItem) storeItem.quantity -= qty;
              
              const barItem = cache.inventory.bar.find(i => i.productId === item.productId);
              if (barItem) barItem.quantity += qty;
              else cache.inventory.bar.push({ productId: item.productId, quantity: qty });

              const tx: Transaction = {
                  id: generateId(), 
                  type: TransactionType.TRANSFER, 
                  productId: item.productId, 
                  quantity: qty, 
                  totalValue: 0, 
                  timestamp: Date.now(), 
                  // CRITICAL CHANGE: Note now includes who requested it and who approved it
                  note: `Sipariş Transferi (Talep: ${order.requestedBy} | Onay: ${approvedBy})`
              };
              cache.transactions.unshift(tx);
          } else {
              item.status = 'REJECTED';
          }
          itemsStatus.push({ productId: item.productId, status: item.status || 'REJECTED', quantity: item.quantity });
      }
      
      order.status = 'COMPLETED';
      notifyChanges();

      if(isServerConnected) {
          try {
             await apiCall('update_order', 'POST', { id: orderId, status: 'COMPLETED', items: itemsStatus });
          } catch (e) {
              console.error("Server sync failed during order approval", e);
          }
      }
  },

  // Bulk
  processBulkPurchase: async (items: any[], performedBy: string = 'Sistem', supplier?: string, invoiceNo?: string) => {
      for (const item of items) {
          // If a linkedProductId is provided (User manually selected it), use it directly.
          // Otherwise, try to find it by name (e.g., if item.status was 'NEW', but maybe same name exists?)
          let product: Product | undefined;
          
          if (item.linkedProductId) {
              product = cache.products.find(p => p.id === item.linkedProductId);
          }
          
          if (!product) {
              // Fallback to name search if ID not valid, or if no ID provided
               product = findSmartMatch(item.name, cache.products);
          }
          
          if (!product && item.status === 'NEW') {
               const newProd: Product = {
                  id: generateId(),
                  name: fixEncoding(item.name),
                  category: 'Yeni Giriş',
                  costPrice: item.unitPrice,
                  salePrice: item.unitPrice * 3, 
                  image: `https://picsum.photos/200/200?random=${Math.floor(Math.random() * 1000)}`,
                  minStockLevel: 20,
                  sortOrder: cache.products.length,
                  aliases: []
               };
               cache.products.push(newProd);
               cache.inventory.store.push({ productId: newProd.id, quantity: 0 });
               cache.inventory.bar.push({ productId: newProd.id, quantity: 0 });
               
               product = newProd;
               if(isServerConnected) await apiCall('save_product', 'POST', newProd);
          }
          
          if(product) {
              const unitCost = Number(item.unitPrice);
              if (unitCost > 0 && Math.abs(product.costPrice - unitCost) >= 0.01) {
                  product.costPrice = unitCost;
                  if (isServerConnected) {
                      apiCall('save_product', 'POST', product).catch(console.error);
                  }
              }
              await StorageService.purchaseStock(product.id, item.quantity, item.unitPrice, performedBy, supplier, invoiceNo);
          }
      }
      notifyChanges();
  },

  processBulkSales: async (items: {productId: string, quantity: number}[], performedBy: string = 'Barmen') => {
      for(const item of items) {
          await StorageService.makeSale(item.productId, item.quantity, performedBy);
      }
  },

  verifyMasterKey: (inputKey: string) => inputKey === (localStorage.getItem(STORAGE_KEYS.MASTER_KEY) || '1453'),
  updateMasterKey: (newKey: string) => localStorage.setItem(STORAGE_KEYS.MASTER_KEY, newKey),
  
  resetAdminPassword: async (newPass: string) => {
      const admin = cache.users.find(u => u.role === Role.MANAGER);
      if(admin) {
          admin.password = newPass;
          notifyChanges();
          if(isServerConnected) await apiCall('update_user', 'POST', { username: admin.username, password: newPass });
      }
  },
  
  createBackup: () => JSON.stringify(cache),
  exportToCSV: () => {
       const headers = "Ürün Adı;Kategori;Alış Fiyatı;Satış Fiyatı;Depo Stoğu;Bar Stoğu";
       const rows = cache.products.map(p => {
           const store = cache.inventory.store.find(i => i.productId === p.id)?.quantity || 0;
           const bar = cache.inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
           return `${p.name};${p.category};${p.costPrice};${p.salePrice};${store};${bar}`;
       });
       return "\uFEFF" + [headers, ...rows].join("\n");
  },

  getImportTemplate: () => {
       return "\uFEFFÜrün Adı;Kategori;Alış Fiyatı;Satış Fiyatı;Depo Stoğu;Bar Stoğu\nÖrnek Bira;Bira;45.00;120.00;100;50";
  },

  // --- IMPORT WITH CHARACTER NORMALIZATION ---
  importFromCSV: async (csvText: string) => {
      const cleanContent = csvText.trim().replace(/^\uFEFF/, '');
      const lines = cleanContent.split(/\r\n|\n/);
      let delimiter = ';';
      const firstLine = lines.find(l => l.trim().length > 0);
      if (firstLine && (firstLine.match(/,/g) || []).length > (firstLine.match(/;/g) || []).length) {
          delimiter = ',';
      }

      let dataStartIndex = 0;
      const headerRowIndex = lines.findIndex(l => {
          const lower = l.toLowerCase();
          return lower.includes('ürün') || lower.includes('name') || lower.includes('product');
      });
      if (headerRowIndex !== -1) dataStartIndex = headerRowIndex + 1;
      
      let created = 0;
      let updated = 0;

      for (let i = dataStartIndex; i < lines.length; i++) {
          const line = lines[i].trim();
          if(!line) continue;
          
          const cols = line.split(delimiter).map(c => c.replace(/^"|"$/g, '').trim());
          if (cols.length < 4) continue;

          const rawName = cols[0];
          const rawCat = cols[1];
          if (!rawName) continue;

          const fixedName = fixEncoding(rawName);
          const fixedCat = fixEncoding(rawCat || 'Genel');

          const cost = cols[2];
          const sale = cols[3];
          const storeStock = cols[4];
          const barStock = cols[5];

          const costVal = StorageService.parseNumber(cost);
          const saleVal = StorageService.parseNumber(sale);
          const storeQty = storeStock ? (parseInt(storeStock.replace(/[^0-9-]/g, '')) || 0) : 0;
          const barQty = barStock ? (parseInt(barStock.replace(/[^0-9-]/g, '')) || 0) : 0;

          const existing = findSmartMatch(fixedName, cache.products);
          
          if (existing) {
              await StorageService.updateProduct(existing.id, {
                  category: fixedCat,
                  costPrice: costVal || existing.costPrice,
                  salePrice: saleVal || existing.salePrice
              });

              if (storeStock !== undefined && storeStock.trim() !== '') {
                  const sItem = cache.inventory.store.find(x => x.productId === existing.id);
                  const oldQty = sItem ? sItem.quantity : 0;
                  const diff = storeQty - oldQty;
                  
                  if (diff !== 0) {
                      if (sItem) sItem.quantity = storeQty;
                      else cache.inventory.store.push({ productId: existing.id, quantity: storeQty });

                      cache.transactions.unshift({
                          id: generateId(), type: TransactionType.PURCHASE, productId: existing.id, 
                          quantity: diff, totalValue: diff * costVal, timestamp: Date.now(), 
                          note: 'CSV Stok Güncelleme (Depo)'
                      });
                      if(isServerConnected) await apiCall('save_transaction', 'POST', { transaction: cache.transactions[0] });
                  }
              }

              if (barStock !== undefined && barStock.trim() !== '') {
                  const bItem = cache.inventory.bar.find(x => x.productId === existing.id);
                  if (bItem) bItem.quantity = barQty;
                  else cache.inventory.bar.push({ productId: existing.id, quantity: barQty });
              }

              updated++;
          } else {
              const newProd: Product = {
                  id: generateId(), name: fixedName, category: fixedCat, costPrice: costVal, salePrice: saleVal,
                  image: `https://picsum.photos/200/200?random=${Math.floor(Math.random() * 1000)}`,
                  minStockLevel: 20,
                  sortOrder: cache.products.length,
                  aliases: []
              };
              
              cache.products.push(newProd);

              if (storeQty > 0 || barQty > 0) {
                  cache.inventory.store.push({ productId: newProd.id, quantity: storeQty });
                  cache.inventory.bar.push({ productId: newProd.id, quantity: barQty });
                  
                  if (storeQty > 0) {
                       cache.transactions.unshift({
                          id: generateId(), type: TransactionType.PURCHASE, productId: newProd.id, 
                          quantity: storeQty, totalValue: storeQty * costVal, timestamp: Date.now(), 
                          note: 'CSV Stok Başlangıç'
                      });
                      if(isServerConnected) await apiCall('save_transaction', 'POST', { transaction: cache.transactions[0] });
                  }
              } else {
                   cache.inventory.store.push({ productId: newProd.id, quantity: 0 });
                   cache.inventory.bar.push({ productId: newProd.id, quantity: 0 });
              }

              if(isServerConnected) await apiCall('save_product', 'POST', newProd);
              created++;
          }
      }
      notifyChanges();
      return { created, updated };
  },

  getCustomApiKey: (): string => {
      try {
          return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
      } catch {
          return '';
      }
  },

  saveCustomApiKey: (key: string): void => {
      try {
          if (key && key.trim()) {
              localStorage.setItem(STORAGE_KEYS.API_KEY, key.trim());
          } else {
              localStorage.removeItem(STORAGE_KEYS.API_KEY);
          }
          window.dispatchEvent(new Event('barstock-storage-update'));
      } catch (e) {
          console.error("Failed to save API key:", e);
      }
  }
};
