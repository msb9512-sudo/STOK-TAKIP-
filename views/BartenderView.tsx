
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import type { Product, InventoryState, Order, User, Transaction } from '../types';
import { TransactionType } from '../types';
import { ShoppingCart, Minus, Plus, Trash2, CheckCircle, Truck, Beer, ClipboardList, X, Store, FileText, Printer, Filter, ChevronDown, ChevronUp, Check, ArrowRightLeft } from 'lucide-react';

interface CartItem {
  product: Product;
  quantity: number;
}

export const BartenderView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(StorageService.getProducts());
  const [inventory, setInventory] = useState<InventoryState>(StorageService.getInventory());
  const [categories, setCategories] = useState<string[]>(StorageService.getCategories());
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [transfers, setTransfers] = useState<Transaction[]>([]);
  
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastActionMsg, setLastActionMsg] = useState<string | null>(null);
  
  const [showOrderHistory, setShowOrderHistory] = useState(false);
  const [showTransferHistory, setShowTransferHistory] = useState(false);
  const [showBulkReport, setShowBulkReport] = useState(false);
  const [bulkInputs, setBulkInputs] = useState<Record<string, number>>({});
  
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('Tümü');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [mode, setMode] = useState<'SALE' | 'REQUEST'>('SALE');

  const refreshData = () => {
      setProducts(StorageService.getProducts());
      setInventory(StorageService.getInventory());
      setCategories(StorageService.getCategories());
      setMyOrders(StorageService.getOrders());
      
      const allTx = StorageService.getTransactions();
      const transferTx = allTx.filter(t => t.type === TransactionType.TRANSFER);
      setTransfers(transferTx.sort((a, b) => b.timestamp - a.timestamp));
  };

  useEffect(() => {
     refreshData();
     const session = StorageService.getCurrentSession();
     if(session) setCurrentUser(session);

     const handleStorageUpdate = () => refreshData();
     window.addEventListener('barstock-storage-update', handleStorageUpdate);
     
     const intervalId = setInterval(() => {
         StorageService.syncWithServer();
     }, 5000);

     return () => {
         window.removeEventListener('barstock-storage-update', handleStorageUpdate);
         clearInterval(intervalId);
     };
  }, []);

  const filteredProducts = selectedCategoryFilter === 'Tümü' 
      ? products 
      : products.filter(p => p.category === selectedCategoryFilter);

  const addToCart = (product: Product) => {
    setCart(prev => {
        const existing = prev.find(item => item.product.id === product.id);
        if (existing) {
            return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
        }
        return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
      setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
      setCart(prev => prev.map(item => {
          if (item.product.id === productId) {
              const newQty = Math.max(1, item.quantity + delta);
              return { ...item, quantity: newQty };
          }
          return item;
      }));
  };

  const cartTotal = cart.reduce((acc, item) => acc + (item.product.salePrice * item.quantity), 0);
  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    const performerName = currentUser?.username || 'Barmen';

    try {
        if (mode === 'SALE') {
            for (const item of cart) {
                await StorageService.makeSale(item.product.id, item.quantity, performerName);
            }
            setLastActionMsg(`Satış Başarılı: ${StorageService.formatCurrency(cartTotal)}`);
        } else {
            await StorageService.createOrder(
                cart.map(i => ({ productId: i.product.id, quantity: i.quantity })),
                performerName
            );
            setLastActionMsg("Sipariş Depoya İletildi!");
        }
        
        setCart([]);
        refreshData();
        setIsMobileCartOpen(false);
        setTimeout(() => setLastActionMsg(null), 3000);
    } catch (error: any) {
        alert("İşlem başarısız: " + error.message);
    }
    setIsProcessing(false);
  };

  const handleBulkSubmit = async () => {
      const itemsToProcess = Object.entries(bulkInputs)
          .filter(([_, qty]) => (qty as number) > 0)
          .map(([id, qty]) => ({ productId: id, quantity: qty as number }));

      if (itemsToProcess.length === 0) return;
      
      const performerName = currentUser?.username || 'Barmen';
      setIsProcessing(true);
      try {
          await StorageService.processBulkSales(itemsToProcess, performerName);
          setBulkInputs({});
          setShowBulkReport(false);
          setLastActionMsg("Rapor İşlendi!");
          setTimeout(() => setLastActionMsg(null), 3000);
          refreshData();
      } catch (err: any) {
          alert("Hata: " + err.message);
      }
      setIsProcessing(false);
  };

  const toggleMode = (newMode: 'SALE' | 'REQUEST') => {
      if (cart.length > 0) {
          if (!confirm("Mod değiştirirseniz sepetiniz temizlenecek?")) return;
      }
      setMode(newMode);
      setCart([]);
  };

  const getGroupedTransfers = () => {
      const grouped: Record<string, Transaction[]> = {};
      transfers.forEach(t => {
          const dateKey = new Date(t.timestamp).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
          if (!grouped[dateKey]) grouped[dateKey] = [];
          grouped[dateKey].push(t);
      });
      return grouped;
  };

  const handlePrintTransfers = () => {
      const printWindow = window.open('', '', 'width=600,height=800');
      if (!printWindow) return;
      const itemsHtml = transfers.slice(0, 50).map(t => {
          const prod = products.find(p => p.id === t.productId);
          return `<tr><td>${new Date(t.timestamp).toLocaleString('tr-TR')}</td><td>${prod?.name || 'Bilinmeyen'}</td><td align="right">${t.quantity}</td></tr>`;
      }).join('');
      printWindow.document.write(`<html><head><title>Transferler</title><style>body{font-family:monospace;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd}th{text-align:left}</style></head><body><h2>BARSTOCK PRO</h2><p>Transfer Listesi</p><table><thead><tr><th>Tarih</th><th>Ürün</th><th align="right">Miktar</th></tr></thead><tbody>${itemsHtml}</tbody></table><script>window.onload=function(){window.print();window.close();}</script></body></html>`);
      printWindow.document.close();
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 relative pb-24 lg:pb-0 overflow-hidden">
      
      {/* MODALS - Using z-[100] and fixed inset-0 to cover everything including Sidebar */}
      
      {/* BULK REPORT MODAL */}
      {showBulkReport && (
          <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-xl flex flex-col p-4 animate-scale-in">
              <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <FileText className="text-purple-400" /> Rapor Girişi
                  </h2>
                  <button onClick={() => setShowBulkReport(false)} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-full text-white transition-colors">
                      <X size={24} />
                  </button>
              </div>
              <div className="flex-1 overflow-y-auto grid grid-cols-1 gap-3 pb-24 custom-scrollbar px-1">
                  {products.map(p => (
                      <div key={p.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
                          <div className="min-w-0 flex-1 mr-4">
                              <p className="font-bold text-white truncate text-sm">{p.name}</p>
                              <p className="text-[10px] text-slate-500">Mevcut: {inventory.bar.find(i => i.productId === p.id)?.quantity || 0}</p>
                          </div>
                          <input 
                            type="number" min="0" placeholder="0"
                            className="w-24 bg-slate-950 border border-slate-700 rounded-xl py-3 px-4 text-right text-white font-mono font-bold focus:border-purple-500 outline-none"
                            value={bulkInputs[p.id] || ''}
                            onChange={(e) => setBulkInputs(prev => ({...prev, [p.id]: parseInt(e.target.value) || 0}))}
                          />
                      </div>
                  ))}
              </div>
              <div className="p-4 bg-slate-950 border-t border-slate-800">
                  <button onClick={handleBulkSubmit} disabled={isProcessing} className="w-full bg-purple-600 hover:bg-purple-500 text-white py-5 rounded-2xl font-black shadow-2xl transition-all active:scale-95 text-lg">
                      {isProcessing ? 'İŞLENİYOR...' : 'RAPORU ONAYLA'}
                  </button>
              </div>
          </div>
      )}

      {/* ORDER HISTORY MODAL */}
      {showOrderHistory && (
          <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-xl p-6 flex flex-col animate-fade-in">
              <div className="flex justify-between items-center mb-6 bg-slate-800 p-4 rounded-2xl border border-slate-700">
                  <h2 className="text-xl font-bold text-white flex items-center gap-3">
                      <ClipboardList className="text-blue-400" /> İstek Geçmişim
                  </h2>
                  <button onClick={() => setShowOrderHistory(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-300"><X size={28} /></button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                  {myOrders.length === 0 ? (
                      <div className="text-center text-slate-500 mt-20"><ClipboardList size={64} className="mx-auto opacity-10 mb-4"/><p>Kayıtlı istek bulunamadı.</p></div>
                  ) : (
                      myOrders.map(order => (
                          <div key={order.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex justify-between items-center">
                              <div>
                                  <span className={`text-[10px] font-black px-3 py-1 rounded-full ${
                                      order.status === 'PENDING' ? 'bg-amber-500/20 text-amber-400' : 
                                      order.status === 'CANCELLED' ? 'bg-red-500/20 text-red-400' :
                                      'bg-green-500/20 text-green-400'
                                  }`}>{order.status === 'CANCELLED' ? 'İPTAL' : (order.status === 'PENDING' ? 'BEKLİYOR' : 'ONAYLANDI')}</span>
                                  <p className="text-xs text-slate-500 mt-2">{new Date(order.timestamp).toLocaleString('tr-TR')}</p>
                              </div>
                              <div className="text-right">
                                  <p className="text-sm font-black text-white">{order.items.length} Kalem Ürün</p>
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </div>
      )}

      {/* TRANSFER HISTORY MODAL */}
      {showTransferHistory && (
          <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-xl p-6 flex flex-col animate-fade-in">
              <div className="flex justify-between items-center mb-6 bg-slate-800 p-4 rounded-2xl border border-slate-700">
                  <h2 className="text-xl font-bold text-white flex items-center gap-3">
                      <ArrowRightLeft className="text-amber-400" /> Gelen Transferler
                  </h2>
                  <div className="flex items-center gap-4">
                      <button onClick={handlePrintTransfers} className="bg-slate-700 hover:bg-slate-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
                          <Printer size={18} /> Yazdır
                      </button>
                      <button onClick={() => setShowTransferHistory(false)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-300"><X size={28} /></button>
                  </div>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {transfers.length === 0 ? (
                      <div className="text-center text-slate-500 mt-20"><ArrowRightLeft size={64} className="mx-auto opacity-10 mb-4"/><p>Kayıtlı transfer bulunamadı.</p></div>
                  ) : (
                      Object.entries(getGroupedTransfers()).map(([date, items]) => (
                          <div key={date} className="mb-8">
                              <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest mb-4 flex items-center gap-3">{date}</h3>
                              <div className="grid grid-cols-1 gap-2">
                                  {items.map(t => {
                                      const prod = products.find(p => p.id === t.productId);
                                      return (
                                          <div key={t.id} className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between hover:border-amber-500/50 transition-all">
                                              <div className="flex items-center gap-4">
                                                  <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400"><ArrowRightLeft size={20} /></div>
                                                  <div>
                                                      <p className="text-sm font-bold text-white">{prod?.name || 'Bilinmeyen'}</p>
                                                      <p className="text-[10px] text-slate-500">{new Date(t.timestamp).toLocaleTimeString('tr-TR')}</p>
                                                  </div>
                                              </div>
                                              <div className="text-right"><span className="text-xl font-black text-amber-400">+{t.quantity}</span></div>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      ))
                  )}
              </div>
          </div>
      )}

      {/* MAIN VIEW AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mode Switchers and Actions */}
        <div className="bg-slate-900/80 backdrop-blur-md p-3 rounded-2xl border border-slate-800 mb-6 shrink-0 shadow-lg">
            <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800 mb-4">
                <button onClick={() => toggleMode('SALE')} className={`flex-1 py-3 rounded-lg font-black text-xs tracking-tighter transition-all ${mode === 'SALE' ? 'bg-green-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}>SATIŞ MODU</button>
                <button onClick={() => toggleMode('REQUEST')} className={`flex-1 py-3 rounded-lg font-black text-xs tracking-tighter transition-all ${mode === 'REQUEST' ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}>İSTEK MODU</button>
            </div>
            
            <div className="grid grid-cols-3 gap-2">
                {mode === 'SALE' && (
                    <button onClick={() => setShowBulkReport(true)} className="flex flex-col items-center justify-center gap-1.5 py-3.5 bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/20 rounded-2xl text-purple-400 transition-all active:scale-95">
                        <FileText size={20}/> <span className="text-[10px] font-black uppercase">Rapor Gir</span>
                    </button>
                )}
                <button onClick={() => setShowOrderHistory(true)} className="flex flex-col items-center justify-center gap-1.5 py-3.5 bg-slate-800/40 hover:bg-slate-800 border border-slate-700 rounded-2xl text-slate-300 transition-all active:scale-95">
                    <ClipboardList size={20}/> <span className="text-[10px] font-black uppercase">İsteklerim</span>
                </button>
                <button onClick={() => setShowTransferHistory(true)} className="flex flex-col items-center justify-center gap-1.5 py-3.5 bg-amber-600/10 hover:bg-amber-600/20 border border-amber-500/20 rounded-2xl text-amber-400 transition-all active:scale-95">
                    <ArrowRightLeft size={20}/> <span className="text-[10px] font-black uppercase">Gelenler</span>
                </button>
            </div>
        </div>
        
        {/* Category Filters */}
        <div className="flex gap-2 overflow-x-auto pb-4 custom-scrollbar shrink-0 no-scrollbar">
            <button
                onClick={() => setSelectedCategoryFilter('Tümü')}
                className={`whitespace-nowrap px-6 py-2.5 rounded-full text-xs font-black border transition-all ${selectedCategoryFilter === 'Tümü' ? 'bg-brand-600 border-brand-500 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white'}`}
            >
                Tümü
            </button>
            {categories.map(cat => (
                <button
                    key={cat}
                    onClick={() => setSelectedCategoryFilter(cat)}
                    className={`whitespace-nowrap px-6 py-2.5 rounded-full text-xs font-black border transition-all ${selectedCategoryFilter === cat ? 'bg-brand-600 border-brand-500 text-white shadow-lg' : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-white'}`}
                >
                    {cat}
                </button>
            ))}
        </div>
        
        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-32 lg:pb-6">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map(product => {
                    const barStock = inventory.bar.find(i => i.productId === product.id)?.quantity || 0;
                    const storeStock = inventory.store.find(i => i.productId === product.id)?.quantity || 0;
                    const isDisabled = mode === 'SALE' && barStock <= 0;
                    return (
                        <button
                            key={product.id}
                            disabled={isDisabled}
                            onClick={() => addToCart(product)}
                            className={`relative flex flex-col p-4 rounded-3xl border transition-all active:scale-95 group ${isDisabled ? 'opacity-40 bg-slate-950 border-slate-900' : 'bg-slate-900 border-slate-800 hover:border-brand-500 shadow-sm'}`}
                        >
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 group-hover:scale-110 transition-transform">
                                <img src={product.image} alt="" className="w-full h-full object-cover" />
                            </div>
                            
                            <h3 className="font-bold text-white text-xs text-center line-clamp-2 min-h-[32px] mb-3">{product.name}</h3>
                            
                            <div className="flex flex-col gap-1.5 mt-auto">
                                <div className="flex items-center justify-between text-[10px] px-2 py-1.5 bg-slate-950 rounded-xl border border-slate-800">
                                    <span className="text-slate-500 font-bold">DEPO</span>
                                    <span className="text-blue-400 font-mono font-black">{storeStock}</span>
                                </div>
                                <div className={`flex items-center justify-between text-[10px] px-2 py-1.5 rounded-xl border font-black ${barStock < 5 ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-green-500/10 border-green-500/30 text-green-500'}`}>
                                    <span className="opacity-80">BAR</span>
                                    <span className="font-mono">{barStock}</span>
                                </div>
                            </div>

                            {mode === 'SALE' && (
                                <div className="mt-3 text-center">
                                    <span className="text-brand-400 font-mono font-black text-sm">{StorageService.formatCurrency(product.salePrice)}</span>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
      </div>

      {/* CART SECTION - Stays fixed bottom for mobile */}
      <div className={`
          fixed bottom-0 left-0 w-full z-[80] transition-all duration-500 ease-in-out shadow-[0_-10px_40px_rgba(0,0,0,0.5)]
          lg:static lg:w-96 lg:h-full lg:shadow-none lg:translate-y-0
          ${isMobileCartOpen ? 'h-[85vh]' : 'h-20'}
          ${mode === 'REQUEST' ? 'bg-blue-600' : 'bg-green-600'}
      `}>
          {/* Cart Header */}
          <div 
            onClick={() => setIsMobileCartOpen(!isMobileCartOpen)}
            className="h-20 px-6 flex items-center justify-between cursor-pointer lg:cursor-default"
          >
              <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/20 rounded-2xl shadow-lg">
                      {mode === 'SALE' ? <ShoppingCart size={24}/> : <Truck size={24}/>}
                  </div>
                  <div>
                      <span className="font-black text-sm uppercase tracking-widest text-white">{mode === 'SALE' ? 'Satış Sepeti' : 'Stok İsteği'}</span>
                      <p className="text-[10px] font-bold text-white/70 mt-0.5">{totalItems} Ürün Listede</p>
                  </div>
              </div>
              
              <div className="flex items-center gap-3">
                  {mode === 'SALE' && <span className="font-mono font-black text-xl text-white">{StorageService.formatCurrency(cartTotal)}</span>}
                  <ChevronUp size={24} className={`text-white transition-transform lg:hidden ${isMobileCartOpen ? 'rotate-180' : ''}`} />
              </div>
          </div>

          {/* Cart Content */}
          <div className="flex flex-col h-[calc(100%-5rem)] bg-slate-950 lg:bg-slate-900 border-x border-slate-800 lg:rounded-b-3xl">
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                  {cart.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-700 italic">
                          <ShoppingCart size={48} className="mb-4 opacity-10" />
                          <p className="font-black opacity-20 uppercase tracking-widest">Liste Boş</p>
                      </div>
                  ) : (
                      cart.map(item => (
                          <div key={item.product.id} className="flex items-center justify-between bg-slate-900 p-3.5 rounded-2xl border border-slate-800">
                              <div className="min-w-0 flex-1 mr-4">
                                  <p className="text-white text-xs font-black truncate">{item.product.name}</p>
                                  {mode === 'SALE' && <p className="text-brand-500 text-[10px] font-mono font-black">{StorageService.formatCurrency(item.product.salePrice * item.quantity)}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                  <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                                      <button onClick={() => updateQuantity(item.product.id, -1)} className="p-2.5 text-slate-500 hover:text-white"><Minus size={12}/></button>
                                      <span className="w-8 text-center text-xs font-black text-white">{item.quantity}</span>
                                      <button onClick={() => updateQuantity(item.product.id, 1)} className="p-2.5 text-slate-500 hover:text-white"><Plus size={12}/></button>
                                  </div>
                                  <button onClick={() => removeFromCart(item.product.id)} className="p-2.5 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"><Trash2 size={18}/></button>
                              </div>
                          </div>
                      ))
                  )}
              </div>

              {/* Action Area */}
              <div className="p-6 bg-slate-900 border-t border-slate-800">
                  {lastActionMsg ? (
                      <div className="bg-green-500/20 text-green-400 p-5 rounded-2xl text-center text-xs font-black border border-green-500/30 animate-bounce">
                          {lastActionMsg}
                      </div>
                  ) : (
                      <button 
                          onClick={handleSubmit}
                          disabled={cart.length === 0 || isProcessing}
                          className={`w-full py-4.5 rounded-2xl font-black text-sm tracking-widest shadow-2xl active:scale-95 transition-all ${
                              mode === 'SALE' ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'
                          } disabled:opacity-20`}
                      >
                          {isProcessing ? 'İŞLENİYOR...' : (mode === 'SALE' ? 'İŞLEMİ TAMAMLA' : 'İSTEĞİ GÖNDER')}
                      </button>
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};
