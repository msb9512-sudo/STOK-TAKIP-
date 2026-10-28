import React, { useState, useEffect, useMemo } from 'react';
import { StorageService } from '../services/storageService';
import type { Product, StockCountSession, StockCountItem } from '../types';
import { 
  ClipboardCheck, 
  Calendar as CalendarIcon, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp, 
  Save, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Clock, 
  User, 
  FileSpreadsheet, 
  Trash2, 
  Eye, 
  EyeOff,
  X, 
  Sparkles,
  Check,
  Wine,
  Package,
  Beer,
  Building2,
  Columns,
  LayoutGrid
} from 'lucide-react';

interface CountInputState {
  [productId: string]: {
    store: number | '';
    bar: number | '';
  };
}

export const StockCountView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState(StorageService.getInventory());
  const [stockCounts, setStockCounts] = useState<StockCountSession[]>([]);
  
  // Active Category Filter ('RAKI' | 'ALL' | specific category)
  const [activeCategory, setActiveCategory] = useState<string>('RAKI');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Location Filter Mode ('all' = Depo + Bar, 'bar' = Sadece Bar, 'store' = Sadece Depo)
  const [countLocationMode, setCountLocationMode] = useState<'all' | 'bar' | 'store'>('all');

  // Page View Layout ('workbench' = Geniş Sayım Masası, 'split' = Yan Yana, 'calendar' = Takvim ve Geçmiş)
  const [viewLayout, setViewLayout] = useState<'workbench' | 'split' | 'calendar'>('workbench');

  // Count inputs
  const [countInputs, setCountInputs] = useState<CountInputState>({});
  const [note, setNote] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // In-App Confirmation Modal (avoiding blocked window.confirm in iframe)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    applyToInventory: boolean;
    itemsToProcess: StockCountItem[];
    title: string;
    description: string;
  } | null>(null);

  // Calendar State
  const [currentCalendarDate, setCurrentCalendarDate] = useState(() => new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // History detail modal
  const [viewingSession, setViewingSession] = useState<StockCountSession | null>(null);

  // Hidden products (depo yönetiminde gizlenen ürünler burada da gizlenir)
  const [hiddenProductIds, setHiddenProductIds] = useState<string[]>(() => StorageService.getHiddenProductIds());

  // Load and subscribe
  const refreshData = () => {
    setProducts(StorageService.getProducts());
    setInventory(StorageService.getInventory());
    setStockCounts(StorageService.getStockCounts());
    setHiddenProductIds(StorageService.getHiddenProductIds());
  };

  useEffect(() => {
    refreshData();
    window.addEventListener('barstock-storage-update', refreshData);
    return () => window.removeEventListener('barstock-storage-update', refreshData);
  }, []);

  // Automatically pre-fill count inputs with current system inventory so buttons are immediately responsive
  useEffect(() => {
    if (products.length > 0 && Object.keys(countInputs).length === 0) {
      const initial: CountInputState = {};
      products.forEach(p => {
        const s = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
        const b = inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
        initial[p.id] = { store: s, bar: b };
      });
      setCountInputs(initial);
    }
  }, [products, inventory]);

  // Helper to identify Rakı products
  const isRakiProduct = (p: Product) => {
    const text = (p.name + ' ' + p.category).toLowerCase();
    return (
      text.includes('rakı') ||
      text.includes('raki') ||
      text.includes('beylerbeyi') ||
      text.includes('tekirdağ') ||
      text.includes('tekirdag') ||
      text.includes('sarı zeybek') ||
      text.includes('sari zeybek') ||
      text.includes('kulüp') ||
      text.includes('yeni seri') ||
      text.includes('altın seri') ||
      text.includes('altin seri') ||
      text.includes('göbek') ||
      text.includes('gobek') ||
      text.includes('efe') ||
      text.includes('ala') ||
      text.includes('civan')
    );
  };

  // Filtered Products (excluding hidden/unused products)
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Exclude hidden products
      if (hiddenProductIds.includes(p.id)) return false;

      // Category filter
      if (activeCategory === 'RAKI') {
        if (!isRakiProduct(p)) return false;
      } else if (activeCategory !== 'ALL') {
        if (p.category !== activeCategory) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      }

      return true;
    });
  }, [products, activeCategory, searchQuery, hiddenProductIds]);

  // List of all hidden products for the "Gizlenen İçecekleri Gör" modal
  const hiddenProducts = useMemo(() => {
    return products.filter(p => hiddenProductIds.includes(p.id));
  }, [products, hiddenProductIds]);

  // Current session username
  const currentUser = StorageService.getCurrentSession()?.username || 'Yetkili';

  // Initialize or pre-fill inputs with system numbers
  const handlePreFillWithSystem = () => {
    const newInputs: CountInputState = {};
    filteredProducts.forEach(p => {
      const storeStock = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
      const barStock = inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
      newInputs[p.id] = {
        store: storeStock,
        bar: barStock
      };
    });
    setCountInputs(prev => ({ ...prev, ...newInputs }));
  };

  // Clear inputs for filtered products
  const handleClearInputs = () => {
    if (confirm('Girilen sayım miktarlarını temizlemek istediğinize emin misiniz?')) {
      const newInputs = { ...countInputs };
      filteredProducts.forEach(p => {
        delete newInputs[p.id];
      });
      setCountInputs(newInputs);
    }
  };

  // Handle number input change
  const handleInputChange = (productId: string, location: 'store' | 'bar', value: string) => {
    const sysStore = inventory.store.find(i => i.productId === productId)?.quantity || 0;
    const sysBar = inventory.bar.find(i => i.productId === productId)?.quantity || 0;
    const num = value === '' ? '' : Math.max(0, parseInt(value, 10) || 0);

    setCountInputs(prev => {
      const current = prev[productId] || { store: sysStore, bar: sysBar };
      return {
        ...prev,
        [productId]: {
          store: current.store === '' || current.store === undefined ? sysStore : current.store,
          bar: current.bar === '' || current.bar === undefined ? sysBar : current.bar,
          [location]: num
        }
      };
    });
  };

  // Stepper increment/decrement
  const stepQuantity = (productId: string, location: 'store' | 'bar', delta: number) => {
    const sysStore = inventory.store.find(i => i.productId === productId)?.quantity || 0;
    const sysBar = inventory.bar.find(i => i.productId === productId)?.quantity || 0;

    setCountInputs(prev => {
      const current = prev[productId] || { store: sysStore, bar: sysBar };
      const currentVal = current[location];
      const baseNum = (currentVal === '' || currentVal === undefined)
        ? (location === 'store' ? sysStore : sysBar) 
        : Number(currentVal);
      const nextNum = Math.max(0, baseNum + delta);

      return {
        ...prev,
        [productId]: {
          store: current.store === '' || current.store === undefined ? sysStore : current.store,
          bar: current.bar === '' || current.bar === undefined ? sysBar : current.bar,
          [location]: nextNum
        }
      };
    });
  };

  // Compute live calculations
  const countSummary = useMemo(() => {
    let countedProductsCount = 0;
    let totalMissingQty = 0;
    let totalMissingValue = 0;
    let totalSurplusQty = 0;
    let totalSurplusValue = 0;
    let netDifferenceQty = 0;
    let netDifferenceValue = 0;

    const itemsToSave: StockCountItem[] = [];

    products.forEach(p => {
      const storeInput = countInputs[p.id]?.store;
      const barInput = countInputs[p.id]?.bar;

      const hasStoreCount = storeInput !== '' && storeInput !== undefined;
      const hasBarCount = barInput !== '' && barInput !== undefined;

      const systemStore = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
      const systemBar = inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
      const systemTotal = systemStore + systemBar;

      if (hasStoreCount || hasBarCount) {
        countedProductsCount++;
        const countedStore = hasStoreCount ? Number(storeInput) : systemStore;
        const countedBar = hasBarCount ? Number(barInput) : systemBar;
        const countedTotal = countedStore + countedBar;
        const difference = countedTotal - systemTotal;
        const differenceValue = difference * p.costPrice;

        if (difference < 0) {
          totalMissingQty += Math.abs(difference);
          totalMissingValue += Math.abs(differenceValue);
        } else if (difference > 0) {
          totalSurplusQty += difference;
          totalSurplusValue += differenceValue;
        }

        netDifferenceQty += difference;
        netDifferenceValue += differenceValue;

        itemsToSave.push({
          productId: p.id,
          productName: p.name,
          category: p.category,
          systemStore,
          systemBar,
          systemTotal,
          countedStore,
          countedBar,
          countedTotal,
          difference,
          costPrice: p.costPrice,
          differenceValue
        });
      }
    });

    return {
      countedProductsCount,
      totalMissingQty,
      totalMissingValue,
      totalSurplusQty,
      totalSurplusValue,
      netDifferenceQty,
      netDifferenceValue,
      itemsToSave
    };
  }, [products, inventory, countInputs]);

  // Trigger save stock count confirmation modal
  const handleSaveStockCount = (applyToInventory: boolean) => {
    let itemsToProcess = countSummary.itemsToSave;
    if (itemsToProcess.length === 0) {
      itemsToProcess = filteredProducts.map(p => {
        const sysStore = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
        const sysBar = inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
        return {
          productId: p.id,
          productName: StorageService.normalizeText(p.name),
          category: StorageService.normalizeText(p.category),
          systemStore: sysStore,
          systemBar: sysBar,
          systemTotal: sysStore + sysBar,
          countedStore: sysStore,
          countedBar: sysBar,
          countedTotal: sysStore + sysBar,
          difference: 0,
          costPrice: p.costPrice,
          differenceValue: 0
        };
      });
    }

    if (itemsToProcess.length === 0) {
      setErrorMessage('Sayım yapılacak ürün bulunamadı.');
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    setConfirmModal({
      isOpen: true,
      applyToInventory,
      itemsToProcess,
      title: applyToInventory ? 'Sayımı Onayla ve Stoğu Güncelle' : 'Sayım Raporunu Kaydet',
      description: applyToInventory
        ? `Toplam ${itemsToProcess.length} çeşit ürün için fiziki sayım onaylanacak, Depo ve Bar sistem stokları bu sayım rakamlarıyla eşitlenecektir.`
        : `Toplam ${itemsToProcess.length} çeşit ürün için sayım verileri takvime ve denetim geçmişine kaydedilecek (stoklar değiştirilmeyecek).`
    });
  };

  // Execute Save after in-app modal confirmation
  const executeSaveStockCount = async () => {
    if (!confirmModal) return;
    const { applyToInventory, itemsToProcess } = confirmModal;
    setConfirmModal(null);
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const session: StockCountSession = {
        id: 'sc_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
        date: todayStr,
        timestamp: Date.now(),
        performedBy: currentUser,
        note: note.trim() || (activeCategory === 'RAKI' ? 'Rakı Sayımı' : 'Periyodik Envanter Sayımı'),
        categoryFilter: activeCategory === 'RAKI' ? 'Rakılar' : activeCategory === 'ALL' ? 'Tüm Ürünler' : activeCategory,
        items: itemsToProcess,
        totalDifferenceQuantity: countSummary.netDifferenceQty,
        totalDifferenceValue: countSummary.netDifferenceValue,
        appliedToInventory: applyToInventory
      };

      await StorageService.saveStockCount(session, applyToInventory);
      
      setSaveSuccessMsg(
        applyToInventory 
          ? `✅ Sayım başarıyla onaylandı ve ${itemsToProcess.length} ürünün sistem stoğu güncellendi!`
          : `✅ Sayım denetim raporu takvime kaydedildi (Stoklar değiştirilmedi).`
      );
      setTimeout(() => setSaveSuccessMsg(null), 6000);

      // Re-populate inputs with updated inventory
      const updatedInv = StorageService.getInventory();
      const newInputs: CountInputState = {};
      products.forEach(p => {
        const s = updatedInv.store.find(i => i.productId === p.id)?.quantity || 0;
        const b = updatedInv.bar.find(i => i.productId === p.id)?.quantity || 0;
        newInputs[p.id] = { store: s, bar: b };
      });
      setCountInputs(newInputs);
      setNote('');
      setSelectedCalendarDate(todayStr);
      refreshData();
    } catch (e: any) {
      setErrorMessage('Sayım kaydedilirken hata oluştu: ' + (e?.message || 'Bilinmeyen hata'));
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete history item
  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await StorageService.deleteStockCount(id);
    if (viewingSession?.id === id) setViewingSession(null);
    setSaveSuccessMsg('Sayım kaydı silindi.');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
    refreshData();
  };

  // --- CALENDAR LOGIC ---
  const calendarYear = currentCalendarDate.getFullYear();
  const calendarMonth = currentCalendarDate.getMonth();

  const monthNames = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  // Map of date (YYYY-MM-DD) -> array of StockCountSession
  const countsByDate = useMemo(() => {
    const map: Record<string, StockCountSession[]> = {};
    stockCounts.forEach(sc => {
      if (!map[sc.date]) map[sc.date] = [];
      map[sc.date].push(sc);
    });
    return map;
  }, [stockCounts]);

  // Calendar Grid Days
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(calendarYear, calendarMonth, 1);
    const lastDayOfMonth = new Date(calendarYear, calendarMonth + 1, 0);
    
    // Turkish Monday start: Sunday=0 -> 6, Monday=1 -> 0
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const daysInMonth = lastDayOfMonth.getDate();
    const days = [];

    // Empty cells before first day
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ day: null, dateStr: null });
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const mStr = String(calendarMonth + 1).padStart(2, '0');
      const dStr = String(d).padStart(2, '0');
      const dateStr = `${calendarYear}-${mStr}-${dStr}`;
      days.push({
        day: d,
        dateStr
      });
    }

    return days;
  }, [calendarYear, calendarMonth]);

  const changeMonth = (delta: number) => {
    setCurrentCalendarDate(new Date(calendarYear, calendarMonth + delta, 1));
  };

  // Filtered sessions for selected calendar day
  const sessionsForSelectedDate = useMemo(() => {
    if (!selectedCalendarDate) return stockCounts;
    return stockCounts.filter(sc => sc.date === selectedCalendarDate);
  }, [stockCounts, selectedCalendarDate]);

  // Export count report to CSV
  const exportSessionToCSV = (session: StockCountSession) => {
    const headers = 'Ürün Adı;Kategori;Birim Maliyet;Sistem Depo;Sistem Bar;Sistem Toplam;Sayılan Depo;Sayılan Bar;Sayılan Toplam;Fark Adet;Fark Tutar (TL)';
    const rows = session.items.map(item => {
      return `"${item.productName}";"${item.category}";${item.costPrice};${item.systemStore};${item.systemBar};${item.systemTotal};${item.countedStore};${item.countedBar};${item.countedTotal};${item.difference};${item.differenceValue}`;
    });
    const content = '\uFEFF' + [headers, ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sayim-raporu-${session.date}-${session.id.substring(0, 6)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Unified Header, Filter & Summary Control Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-800/80 relative">
        <div className="absolute top-0 right-0 w-80 h-40 bg-brand-500/5 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10"></div>
        
        {/* Row 1: Title & Clear Action */}
        <div className="p-4 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
              <ClipboardCheck size={17} />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">Sayım</h1>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-semibold">
                <Wine size={11} />
                Rakılar & İçecekler
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handleClearInputs}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-red-950/40 text-slate-400 hover:text-red-400 text-xs font-medium border border-slate-700 hover:border-red-900/50 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Temizle</span>
            </button>
          </div>
        </div>

        {/* Notifications if any */}
        {saveSuccessMsg && (
          <div className="px-4 py-2.5 bg-green-500/10 text-green-300 text-xs flex items-center justify-between gap-2 border-b border-green-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-green-400 shrink-0" />
              <span className="font-medium">{saveSuccessMsg}</span>
            </div>
            <button type="button" onClick={() => setSaveSuccessMsg(null)} className="text-green-400 hover:text-white p-0.5">
              <X size={14} />
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="px-4 py-2.5 bg-red-500/10 text-red-300 text-xs flex items-center justify-between gap-2 border-b border-red-500/20">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-red-400 shrink-0" />
              <span className="font-medium">{errorMessage}</span>
            </div>
            <button type="button" onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white p-0.5">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Row 2: Category Tabs & Search Bar */}
        <div className="p-3 sm:px-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-900">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
            <button
              onClick={() => setActiveCategory('RAKI')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                activeCategory === 'RAKI'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-900/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Wine size={13} />
              <span>Rakılar ({products.filter(p => isRakiProduct(p) && !hiddenProductIds.includes(p.id)).length})</span>
            </button>

            <button
              onClick={() => setActiveCategory('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeCategory === 'ALL'
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-900/30'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <span>Tüm Ürünler ({products.filter(p => !hiddenProductIds.includes(p.id)).length})</span>
            </button>

            {['Alkollü İçki', 'Bira', 'Şarap'].map(cat => {
              const count = products.filter(p => p.category === cat && !hiddenProductIds.includes(p.id)).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all shrink-0 cursor-pointer ${
                    activeCategory === cat
                      ? 'bg-brand-600 text-white shadow-md shadow-brand-900/30'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <span>{cat} ({count})</span>
                </button>
              );
            })}
          </div>

          <div className="relative min-w-[200px] shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Şişe veya marka ara..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
        </div>

        {/* Row 3: 4 Metric Stats in a seamless, compact grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-800/80 bg-slate-950/50">
          <div className="p-3 sm:px-4 flex flex-col justify-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Sayılan Ürün</span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-base sm:text-lg font-bold text-white">{countSummary.countedProductsCount}</span>
              <span className="text-xs text-slate-400">/ {filteredProducts.length} Çeşit</span>
            </div>
          </div>

          <div className="p-3 sm:px-4 flex flex-col justify-center">
            <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1">
              <TrendingDown size={11} />
              <span>Toplam Eksik</span>
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base sm:text-lg font-bold text-red-400">
                {countSummary.totalMissingQty > 0 ? `-${countSummary.totalMissingQty}` : '0'} adet
              </span>
              {countSummary.totalMissingValue > 0 && (
                <span className="text-[11px] font-mono text-red-400/80">
                  ({StorageService.formatCurrency(countSummary.totalMissingValue)})
                </span>
              )}
            </div>
          </div>

          <div className="p-3 sm:px-4 flex flex-col justify-center">
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <TrendingUp size={11} />
              <span>Toplam Fazla</span>
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-base sm:text-lg font-bold text-emerald-400">
                {countSummary.totalSurplusQty > 0 ? `+${countSummary.totalSurplusQty}` : '0'} adet
              </span>
              {countSummary.totalSurplusValue > 0 && (
                <span className="text-[11px] font-mono text-emerald-400/80">
                  (+{StorageService.formatCurrency(countSummary.totalSurplusValue)})
                </span>
              )}
            </div>
          </div>

          <div className="p-3 sm:px-4 flex flex-col justify-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Net Maliyet Farkı</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className={`text-base sm:text-lg font-bold font-mono ${
                countSummary.netDifferenceValue < 0 
                  ? 'text-red-400' 
                  : countSummary.netDifferenceValue > 0 
                  ? 'text-emerald-400' 
                  : 'text-slate-300'
              }`}>
                {countSummary.netDifferenceValue !== 0 && (countSummary.netDifferenceValue > 0 ? '+' : '')}
                {StorageService.formatCurrency(countSummary.netDifferenceValue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left is Count Table, Right is Mini Calendar & Past Audits */}
      <div className={`grid grid-cols-1 ${viewLayout === 'split' ? 'lg:grid-cols-12' : 'grid-cols-1'} gap-6`}>
        
        {/* LEFT COLUMN: Count Workbench */}
        {(viewLayout === 'workbench' || viewLayout === 'split') && (
          <div className={`${viewLayout === 'split' ? 'lg:col-span-8' : 'w-full'} space-y-6`}>

          {/* Counting Table / Product List */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {/* Table Header with Category, Location filter and Quick Actions */}
            <div className="p-4 border-b border-slate-800 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3 bg-slate-950/60">
              <div className="flex items-center gap-2 flex-wrap">
                <ClipboardCheck size={20} className="text-brand-400" />
                <h2 className="font-bold text-white text-base">
                  {activeCategory === 'RAKI' ? 'Rakı Şişeleri Sayım Tablosu' : 'Stok Sayım Tablosu'}
                </h2>
                <span className="text-xs text-slate-400 font-medium">({filteredProducts.length} aktif çeşit)</span>
              </div>

                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setCountLocationMode('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      countLocationMode === 'all'
                        ? 'bg-slate-800 text-white shadow-sm border border-slate-700'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Package size={13} />
                    <span>Tümü (Depo & Bar)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCountLocationMode('bar')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      countLocationMode === 'bar'
                        ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm'
                        : 'text-slate-400 hover:text-amber-300'
                    }`}
                  >
                    <Beer size={13} className="text-amber-400" />
                    <span>🍸 Sadece Bar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCountLocationMode('store')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      countLocationMode === 'store'
                        ? 'bg-blue-500/25 text-blue-300 border border-blue-500/50 shadow-sm'
                        : 'text-slate-400 hover:text-blue-300'
                    }`}
                  >
                    <Building2 size={13} className="text-blue-400" />
                    <span>📦 Sadece Depo</span>
                  </button>
                </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <Wine size={48} className="mx-auto text-slate-700 mb-3" />
                <p className="text-base font-semibold text-slate-400">Bu filtrelere uygun ürün bulunamadı.</p>
                <p className="text-xs mt-1">Arama terimini temizleyebilir veya kategori sekmesini değiştirebilirsiniz.</p>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/90 text-slate-300 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-2.5 px-3.5 whitespace-nowrap min-w-[210px]">Ürün & Şişe</th>
                      <th className="py-2.5 px-2 text-center whitespace-nowrap min-w-[80px]">Birim Maliyet</th>

                      {/* Depo Columns */}
                      {(countLocationMode === 'all' || countLocationMode === 'store') && (
                        <>
                          <th className="py-2.5 px-2 text-center bg-slate-950/40 whitespace-nowrap min-w-[70px] text-[10.5px]">
                            Sistem Depo
                          </th>
                          <th className="py-2 px-1 text-center bg-blue-950/30 text-blue-300 whitespace-nowrap min-w-[95px] border-x border-blue-900/30 text-[10px]">
                            <span className="flex items-center justify-center gap-1">
                              <Building2 size={10} className="text-blue-400" />
                              <span>Sayılan Depo</span>
                            </span>
                          </th>
                        </>
                      )}

                      {/* Bar Columns - prominently styled in amber, compact */}
                      {(countLocationMode === 'all' || countLocationMode === 'bar') && (
                        <>
                          <th className="py-2.5 px-2 text-center bg-amber-950/20 text-amber-300 whitespace-nowrap min-w-[65px] text-[10.5px]">
                            <span className="flex items-center justify-center gap-1">
                              <Beer size={11} className="text-amber-400" />
                              <span>Sistem Bar</span>
                            </span>
                          </th>
                          <th className="py-2.5 px-2 text-center bg-amber-950/40 text-amber-200 whitespace-nowrap min-w-[115px] border-x border-amber-800/40 text-[10.5px]">
                            <span className="flex items-center justify-center gap-1 font-bold text-amber-300">
                              <Beer size={12} className="text-amber-400" />
                              <span>Sayılan Bar</span>
                            </span>
                          </th>
                        </>
                      )}

                      {/* System Total (in 'all' mode) */}
                      {countLocationMode === 'all' && (
                        <th className="py-2.5 px-2 text-center bg-slate-950/40 whitespace-nowrap min-w-[75px] text-[10.5px]">
                          Sistem Toplam
                        </th>
                      )}

                      <th className="py-2.5 px-3 text-center whitespace-nowrap min-w-[110px] text-[10.5px]">
                        {countLocationMode === 'bar' ? 'Bar Farkı' : countLocationMode === 'store' ? 'Depo Farkı' : 'Net Fark Durumu'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredProducts.map(p => {
                      const sysStore = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
                      const sysBar = inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
                      const sysTotal = sysStore + sysBar;

                      const userStoreVal = countInputs[p.id]?.store;
                      const userBarVal = countInputs[p.id]?.bar;

                      const hasStoreInput = userStoreVal !== '' && userStoreVal !== undefined;
                      const hasBarInput = userBarVal !== '' && userBarVal !== undefined;

                      const effectiveStore = hasStoreInput ? Number(userStoreVal) : sysStore;
                      const effectiveBar = hasBarInput ? Number(userBarVal) : sysBar;
                      const effectiveTotal = effectiveStore + effectiveBar;
                      
                      // Calculate difference depending on view mode
                      const totalDiff = effectiveTotal - sysTotal;
                      const totalDiffValue = totalDiff * p.costPrice;

                      const barDiff = effectiveBar - sysBar;
                      const barDiffValue = barDiff * p.costPrice;

                      const storeDiff = effectiveStore - sysStore;
                      const storeDiffValue = storeDiff * p.costPrice;

                      const currentDiff = countLocationMode === 'bar' ? barDiff : countLocationMode === 'store' ? storeDiff : totalDiff;
                      const currentDiffValue = countLocationMode === 'bar' ? barDiffValue : countLocationMode === 'store' ? storeDiffValue : totalDiffValue;

                      const isCounted = hasStoreInput || hasBarInput;

                      return (
                        <tr 
                          key={p.id} 
                          className={`hover:bg-slate-800/40 transition-colors ${isCounted ? 'bg-slate-800/20' : ''}`}
                        >
                          {/* Product Info with Quick Hide Action */}
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <img
                                  src={p.image}
                                  alt={p.name}
                                  className="w-10 h-10 rounded-lg object-cover bg-slate-800 border border-slate-700 shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                  }}
                                />
                                <div className="min-w-0">
                                  <div className="font-bold text-white text-sm tracking-tight leading-snug truncate">
                                    {StorageService.normalizeText(p.name)}
                                  </div>
                                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                                      {StorageService.normalizeText(p.category)}
                                    </span>
                                    {isRakiProduct(p) && (
                                      <span className="text-[10px] text-amber-400 font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                        Rakı
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Unit Cost */}
                          <td className="py-2 px-2 text-center text-slate-300 font-mono text-xs font-semibold whitespace-nowrap">
                            {StorageService.formatCurrency(p.costPrice)}
                          </td>

                          {/* System Store */}
                          {(countLocationMode === 'all' || countLocationMode === 'store') && (
                            <td className="py-2 px-2 text-center bg-slate-950/30 font-bold text-slate-300 text-xs">
                              {sysStore}
                            </td>
                          )}

                          {/* Counted Store Input */}
                          {(countLocationMode === 'all' || countLocationMode === 'store') && (
                            <td className="py-1.5 px-1 text-center bg-blue-950/15 border-x border-blue-900/30">
                              <div className="inline-flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(p.id, 'store', -1)}
                                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 active:bg-blue-600 active:scale-95 text-slate-100 hover:text-white text-[11px] font-black flex items-center justify-center cursor-pointer transition-all border border-slate-700 shadow-sm select-none"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  value={userStoreVal === undefined ? '' : userStoreVal}
                                  onChange={(e) => handleInputChange(p.id, 'store', e.target.value)}
                                  placeholder={sysStore.toString()}
                                  className="w-11 h-6 text-center bg-slate-950 border border-slate-700 focus:border-blue-500 rounded py-0 px-0.5 text-white font-bold text-xs outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(p.id, 'store', 1)}
                                  className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 active:bg-blue-600 active:scale-95 text-slate-100 hover:text-white text-[11px] font-black flex items-center justify-center cursor-pointer transition-all border border-slate-700 shadow-sm select-none"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                          )}

                          {/* System Bar */}
                          {(countLocationMode === 'all' || countLocationMode === 'bar') && (
                            <td className="py-2 px-2 text-center bg-amber-950/15 font-bold text-amber-300 text-xs">
                              {sysBar}
                            </td>
                          )}

                          {/* Counted Bar Input - Prominent Amber Theme */}
                          {(countLocationMode === 'all' || countLocationMode === 'bar') && (
                            <td className="py-2 px-1.5 text-center bg-amber-950/25 border-x border-amber-800/40">
                              <div className="inline-flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(p.id, 'bar', -1)}
                                  className="w-7 h-7 rounded-md bg-amber-950/80 hover:bg-amber-900 active:bg-amber-600 active:scale-95 text-amber-200 hover:text-white text-xs font-black flex items-center justify-center cursor-pointer transition-all border border-amber-700/60 shadow-sm select-none"
                                  title="Bar miktarını 1 azalt"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  value={userBarVal === undefined ? '' : userBarVal}
                                  onChange={(e) => handleInputChange(p.id, 'bar', e.target.value)}
                                  placeholder={sysBar.toString()}
                                  className="w-14 h-7 text-center bg-slate-950 border border-amber-600/70 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-md py-0.5 px-0.5 text-white font-bold text-xs outline-none"
                                  title="Fiziki sayılan bar şişe adedi"
                                />
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(p.id, 'bar', 1)}
                                  className="w-7 h-7 rounded-md bg-amber-950/80 hover:bg-amber-900 active:bg-amber-600 active:scale-95 text-amber-200 hover:text-white text-xs font-black flex items-center justify-center cursor-pointer transition-all border border-amber-700/60 shadow-sm select-none"
                                  title="Bar miktarını 1 artır"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                          )}

                          {/* System Total (in 'all' mode) */}
                          {countLocationMode === 'all' && (
                            <td className="py-2 px-2 text-center bg-slate-950/30 font-bold text-white text-xs">
                              {sysTotal}
                            </td>
                          )}

                          {/* Difference Status */}
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            {!isCounted ? (
                              <span className="text-[11px] text-slate-500 italic">Girilmedi</span>
                            ) : currentDiff === 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold bg-green-500/15 text-green-400 border border-green-500/30">
                                <Check size={13} />
                                <span>Tam (0 Fark)</span>
                              </span>
                            ) : currentDiff < 0 ? (
                              <div className="flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                                  <AlertTriangle size={12} />
                                  <span>{Math.abs(currentDiff)} Adet Eksik</span>
                                </span>
                                <span className="text-[10px] text-red-400 font-mono mt-0.5 font-semibold">
                                  {StorageService.formatCurrency(currentDiffValue)}
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  <TrendingUp size={12} />
                                  <span>+{currentDiff} Adet Fazla</span>
                                </span>
                                <span className="text-[10px] text-emerald-400 font-mono mt-0.5 font-semibold">
                                  +{StorageService.formatCurrency(currentDiffValue)}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Bottom Actions Panel */}
            <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="w-full md:w-auto flex-1 max-w-md">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Sayım notu ekleyin (örn: Hafta sonu öncesi rakı sayımı)..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveStockCount(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-medium text-xs border border-slate-700 transition-colors shadow-sm cursor-pointer"
                  title="Stokları değiştirmez, sadece denetim geçmişine kaydeder"
                >
                  Sadece Rapor Olarak Kaydet
                </button>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleSaveStockCount(true)}
                  className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-brand-900/40 transition-colors cursor-pointer"
                >
                  <Save size={15} />
                  <span>{isSaving ? 'Kaydediliyor...' : 'Sayımı Onayla & Stoğu Güncelle'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* RIGHT COLUMN: Interactive Mini Calendar & Count History */}
        {(viewLayout === 'split' || viewLayout === 'calendar' || viewLayout === 'workbench') && (
          <div className={`${
            viewLayout === 'split' 
              ? 'lg:col-span-4 space-y-6' 
              : 'w-full grid grid-cols-1 md:grid-cols-2 gap-6 pt-4'
          }`}>
          
          {/* Mini Calendar Widget */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                  <CalendarIcon size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm leading-tight">Sayım Takvimi</h3>
                  <span className="text-[11px] text-slate-400">
                    {monthNames[calendarMonth]} {calendarYear}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => changeMonth(-1)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Önceki Ay"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setCurrentCalendarDate(new Date())}
                  className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 transition-colors"
                >
                  Bugün
                </button>
                <button
                  onClick={() => changeMonth(1)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Sonraki Ay"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Days of Week */}
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map((dw, i) => (
                <span key={i} className="text-[10px] font-bold text-slate-500 uppercase">
                  {dw}
                </span>
              ))}
            </div>

            {/* Calendar Month Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cDay, idx) => {
                if (!cDay.day || !cDay.dateStr) {
                  return <div key={'empty_' + idx} className="h-9 rounded-lg opacity-0 pointer-events-none"></div>;
                }

                const todayStr = new Date().toISOString().split('T')[0];
                const isToday = cDay.dateStr === todayStr;
                const isSelected = selectedCalendarDate === cDay.dateStr;
                const dayCounts = countsByDate[cDay.dateStr] || [];
                const hasCounts = dayCounts.length > 0;

                return (
                  <button
                    key={cDay.dateStr}
                    onClick={() => {
                      setSelectedCalendarDate(prev => prev === cDay.dateStr ? null : cDay.dateStr);
                    }}
                    className={`h-9 rounded-xl flex flex-col items-center justify-center relative transition-all text-xs font-semibold ${
                      isSelected
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-900/50 ring-2 ring-brand-400'
                        : isToday
                        ? 'bg-slate-800 text-brand-400 border border-brand-500/40'
                        : hasCounts
                        ? 'bg-purple-950/40 text-purple-200 border border-purple-500/30 hover:bg-purple-900/50'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{cDay.day}</span>
                    {hasCounts && (
                      <span className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                        isSelected ? 'bg-white' : 'bg-emerald-400 ring-2 ring-emerald-950'
                      }`} />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Sayım Yapılan Gün</span>
              </div>
              {selectedCalendarDate && (
                <button
                  onClick={() => setSelectedCalendarDate(null)}
                  className="text-xs text-brand-400 hover:underline"
                >
                  Tümünü Göster
                </button>
              )}
            </div>
          </div>

          {/* Counts Log for Selected Date / History */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Clock size={16} className="text-brand-400" />
                  <span>
                    {selectedCalendarDate 
                      ? `${selectedCalendarDate} Tarihli Sayımlar` 
                      : 'Geçmiş Sayım Raporları'}
                  </span>
                </h3>
                <span className="text-[11px] text-slate-500">
                  {sessionsForSelectedDate.length} adet sayım kaydı
                </span>
              </div>
            </div>

            {sessionsForSelectedDate.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/60">
                <CalendarIcon size={32} className="mx-auto text-slate-700 mb-2" />
                <p className="text-xs font-semibold text-slate-400">Bu tarihte yapılmış sayım yok.</p>
                <p className="text-[10px] mt-1 text-slate-500">Sol panelden şişe sayımı yaparak bu güne kaydedebilirsiniz.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
                {sessionsForSelectedDate.map(sc => {
                  const hasDiscrepancy = sc.totalDifferenceQuantity !== 0;
                  const timeFormatted = new Date(sc.timestamp).toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <div
                      key={sc.id}
                      onClick={() => setViewingSession(sc)}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-brand-500/50 transition-all cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                            <span>{sc.note || 'Envanter Sayımı'}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-1">
                            <span className="flex items-center gap-1">
                              <CalendarIcon size={12} className="text-slate-500" />
                              {sc.date} - {timeFormatted}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <User size={12} className="text-slate-500" />
                              {sc.performedBy}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              exportSessionToCSV(sc);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-green-400 hover:bg-slate-800"
                            title="Excel / CSV İndir"
                          >
                            <FileSpreadsheet size={15} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteSession(sc.id, e)}
                            className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800"
                            title="Kaydı Sil"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400">
                          {sc.items.length} çeşit ürün sayıldı
                        </span>

                        <div>
                          {!hasDiscrepancy ? (
                            <span className="text-[11px] font-bold text-green-400 flex items-center gap-1">
                              <CheckCircle2 size={13} />
                              <span>Eksiksiz</span>
                            </span>
                          ) : sc.totalDifferenceQuantity < 0 ? (
                            <span className="text-[11px] font-bold text-red-400">
                              {sc.totalDifferenceQuantity} adet eksik ({StorageService.formatCurrency(sc.totalDifferenceValue)})
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-emerald-400">
                              +{sc.totalDifferenceQuantity} adet fazla (+{StorageService.formatCurrency(sc.totalDifferenceValue)})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
        )}
      </div>

      {/* DETAIL MODAL: View Specific Stock Count Breakdown */}
      {viewingSession && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                  <ClipboardCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Sayım Detay Raporu: {viewingSession.note || 'Envanter Sayımı'}
                  </h3>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>Tarih: {viewingSession.date}</span>
                    <span>•</span>
                    <span>İşleyen: {viewingSession.performedBy}</span>
                    <span>•</span>
                    <span className={viewingSession.appliedToInventory ? 'text-green-400' : 'text-amber-400'}>
                      {viewingSession.appliedToInventory ? 'Stoğa İşlendi' : 'Sadece Rapor'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportSessionToCSV(viewingSession)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center gap-1.5"
                >
                  <FileSpreadsheet size={14} className="text-green-400" />
                  <span>Excel'e Aktar</span>
                </button>
                <button
                  onClick={() => setViewingSession(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950 text-slate-400 font-semibold uppercase text-[11px]">
                      <th className="py-2.5 px-3">Ürün Adı</th>
                      <th className="py-2.5 px-2 text-center">Birim Fiyat</th>
                      <th className="py-2.5 px-2 text-center">Sistem Toplam</th>
                      <th className="py-2.5 px-2 text-center">Sayılan Toplam</th>
                      <th className="py-2.5 px-2 text-center">Fark Adet</th>
                      <th className="py-2.5 px-3 text-right">Fark Tutar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {viewingSession.items.map(item => {
                      const isZero = item.difference === 0;
                      return (
                        <tr key={item.productId} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 font-medium text-white">
                            {item.productName}
                            <span className="block text-[10px] text-slate-500">{item.category}</span>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono text-slate-400">
                            {StorageService.formatCurrency(item.costPrice)}
                          </td>
                          <td className="py-2.5 px-2 text-center text-slate-300">
                            {item.systemTotal}
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold text-white">
                            {item.countedTotal}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {isZero ? (
                              <span className="text-green-400 font-bold">0</span>
                            ) : item.difference < 0 ? (
                              <span className="text-red-400 font-bold">{item.difference}</span>
                            ) : (
                              <span className="text-emerald-400 font-bold">+{item.difference}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            {isZero ? (
                              <span className="text-slate-500">0,00 ₺</span>
                            ) : item.differenceValue < 0 ? (
                              <span className="text-red-400">{StorageService.formatCurrency(item.differenceValue)}</span>
                            ) : (
                              <span className="text-emerald-400">+{StorageService.formatCurrency(item.differenceValue)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Net Fark:{' '}
                <span className={`font-bold font-mono ${
                  viewingSession.totalDifferenceValue < 0 ? 'text-red-400' : viewingSession.totalDifferenceValue > 0 ? 'text-emerald-400' : 'text-white'
                }`}>
                  {StorageService.formatCurrency(viewingSession.totalDifferenceValue)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setViewingSession(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL (Replaces blocked window.confirm in iframe) */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[130] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl p-6 animate-scale-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center shrink-0">
                <ClipboardCheck size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{confirmModal.title}</h3>
                <p className="text-xs text-slate-400 mt-0.5">Lütfen işlemi onaylayın</p>
              </div>
            </div>

            <p className="text-slate-300 text-sm mb-4 leading-relaxed">
              {confirmModal.description}
            </p>

            {confirmModal.applyToInventory && (
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 mb-5 space-y-2 text-xs">
                <div className="flex justify-between text-slate-300 font-medium">
                  <span>İşlenecek Ürün:</span>
                  <span className="font-bold text-white">{confirmModal.itemsToProcess.length} çeşit</span>
                </div>
                {countSummary.totalMissingQty > 0 && (
                  <div className="flex justify-between text-red-400 font-semibold">
                    <span>Toplam Eksik Şişe:</span>
                    <span>-{countSummary.totalMissingQty} adet ({StorageService.formatCurrency(countSummary.totalMissingValue)})</span>
                  </div>
                )}
                {countSummary.totalSurplusQty > 0 && (
                  <div className="flex justify-between text-emerald-400 font-semibold">
                    <span>Toplam Fazla Şişe:</span>
                    <span>+{countSummary.totalSurplusQty} adet (+{StorageService.formatCurrency(countSummary.totalSurplusValue)})</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-slate-800 pt-2 text-slate-200 font-bold">
                  <span>Net Maliyet Etkisi:</span>
                  <span className={countSummary.netDifferenceValue < 0 ? 'text-red-400 font-mono' : countSummary.netDifferenceValue > 0 ? 'text-emerald-400 font-mono' : 'text-slate-300 font-mono'}>
                    {countSummary.netDifferenceValue > 0 ? '+' : ''}{StorageService.formatCurrency(countSummary.netDifferenceValue)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={executeSaveStockCount}
                className="px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 active:bg-brand-700 text-white font-bold text-xs shadow-lg shadow-brand-900/40 transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Save size={15} />
                <span>{confirmModal.applyToInventory ? 'Evet, Stoğu Güncelle' : 'Evet, Raporu Kaydet'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
