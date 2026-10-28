
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import type { Product, Transaction, InventoryState } from '../types';
import { TransactionType } from '../types';
import { KPICard } from '../components/KPICard';
import { TrendingUp, AlertTriangle, ArrowUpRight, ArrowDownRight, MessageCircle, CheckCircle, History, ArrowRightLeft, Calendar, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

export const StoreDashboardView: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryState>(StorageService.getInventory());
  const [loading, setLoading] = useState(true);

  // Date Filter State
  const [viewMode, setViewMode] = useState<'MONTH' | 'YEAR'>('MONTH');
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    // Load data
    const tx = StorageService.getTransactions();
    const prod = StorageService.getProducts();
    const inv = StorageService.getInventory();
    
    setTransactions(tx);
    setProducts(prod);
    setInventory(inv);
    setLoading(false);

    // Listen for updates
    const handleUpdate = () => {
        setTransactions(StorageService.getTransactions());
        setProducts(StorageService.getProducts());
        setInventory(StorageService.getInventory());
    };
    window.addEventListener('barstock-storage-update', handleUpdate);
    return () => window.removeEventListener('barstock-storage-update', handleUpdate);
  }, []);

  // --- Date Navigation Logic ---
  const handlePrev = () => {
      const newDate = new Date(selectedDate);
      if (viewMode === 'MONTH') {
          newDate.setMonth(newDate.getMonth() - 1);
      } else {
          newDate.setFullYear(newDate.getFullYear() - 1);
      }
      setSelectedDate(newDate);
  };

  const handleNext = () => {
      const newDate = new Date(selectedDate);
      if (viewMode === 'MONTH') {
          newDate.setMonth(newDate.getMonth() + 1);
      } else {
          newDate.setFullYear(newDate.getFullYear() + 1);
      }
      setSelectedDate(newDate);
  };

  const formatDateLabel = () => {
      if (viewMode === 'MONTH') {
          return selectedDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
      } else {
          return selectedDate.getFullYear().toString();
      }
  };

  // --- Filter Logic ---
  const filteredTransactions = transactions.filter(t => {
      const tDate = new Date(t.timestamp);
      if (viewMode === 'MONTH') {
          return tDate.getMonth() === selectedDate.getMonth() && 
                 tDate.getFullYear() === selectedDate.getFullYear();
      } else {
          return tDate.getFullYear() === selectedDate.getFullYear();
      }
  });

  // 1. Period Purchases (Alımlar)
  const periodPurchases = filteredTransactions.filter(t => t.type === TransactionType.PURCHASE);
  const totalPurchaseAmount = periodPurchases.reduce((acc, t) => acc + t.totalValue, 0);
  const totalPurchaseCount = periodPurchases.reduce((acc, t) => acc + t.quantity, 0);

  // 2. Period Sales/Transfers (Satışlar/Çıkışlar)
  const periodSales = filteredTransactions.filter(t => t.type === TransactionType.SALE);
  const totalSaleRevenue = periodSales.reduce((acc, t) => acc + t.totalValue, 0);
  const totalSaleCount = periodSales.reduce((acc, t) => acc + t.quantity, 0);

  // 3. Critical Stock - Now uses individual product minStockLevel
  const criticalProducts = products.map(p => {
      const storeQty = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
      const barQty = inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
      const limit = p.minStockLevel || 20; // Default to 20 if not set
      
      return {
          ...p,
          storeQty,
          barQty,
          totalQty: storeQty + barQty,
          limit
      };
  }).filter(p => p.storeQty < p.limit); 

  const handleShareWhatsApp = () => {
      if (criticalProducts.length === 0) return;

      // 1. Group items by category
      const groupedItems: Record<string, typeof criticalProducts> = {};
      criticalProducts.forEach(item => {
          if (!groupedItems[item.category]) {
              groupedItems[item.category] = [];
          }
          groupedItems[item.category].push(item);
      });

      // 2. Build Message String
      let message = `*🚨 ACİL SİPARİŞ LİSTESİ (Kritik Stoklar)*\n`;
      message += `📅 Tarih: ${new Date().toLocaleDateString('tr-TR')}\n`;
      message += `----------------------------\n\n`;

      Object.entries(groupedItems).forEach(([category, items]) => {
          message += `*📦 ${category.toUpperCase()}*\n`;
          items.forEach(item => {
              message += `- ${item.name}: *${item.storeQty} Adet* (Limit: ${item.limit})\n`;
          });
          message += `\n`;
      });

      message += `----------------------------\n`;
      message += `Lütfen en kısa sürede temin edelim.`;

      // 3. Open WhatsApp
      const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
  };

  const getTransactionLabel = (type: TransactionType) => {
      switch (type) {
          case TransactionType.PURCHASE: return { text: 'Mal Kabul', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' };
          case TransactionType.TRANSFER: return { text: 'Transfer', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' };
          case TransactionType.SALE: return { text: 'Satış', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' };
          default: return { text: type, color: 'text-slate-400', bg: 'bg-slate-700' };
      }
  };

  if (loading) return <div>Yükleniyor...</div>;

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
              <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                  <TrendingUp className="text-brand-500" />
                  Depo Genel Durum
              </h2>
              <p className="text-slate-400 mt-1">Aylık/Yıllık hareketler ve stok uyarıları.</p>
          </div>

          {/* Date Filter Controls */}
          <div className="flex items-center gap-3 bg-slate-800 p-1.5 rounded-xl border border-slate-700 shadow-lg">
              <div className="flex bg-slate-900 rounded-lg p-1">
                  <button 
                      onClick={() => setViewMode('MONTH')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${viewMode === 'MONTH' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                      Aylık
                  </button>
                  <button 
                      onClick={() => setViewMode('YEAR')}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${viewMode === 'YEAR' ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                      Yıllık
                  </button>
              </div>

              <div className="flex items-center gap-2 px-2 border-l border-slate-700">
                  <button onClick={handlePrev} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                      <ChevronLeft size={20} />
                  </button>
                  <div className="flex items-center gap-2 min-w-[120px] justify-center text-sm font-bold text-white">
                      <Calendar size={16} className="text-brand-400" />
                      {formatDateLabel()}
                  </div>
                  <button onClick={handleNext} className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                      <ChevronRight size={20} />
                  </button>
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <KPICard 
              title={`${viewMode === 'MONTH' ? 'Ayın' : 'Yılın'} Alımları`}
              value={StorageService.formatCurrency(totalPurchaseAmount)}
              subValue={`${totalPurchaseCount} Adet Ürün Girişi`}
              icon={ArrowDownRight}
              colorClass="text-blue-500"
          />
          <KPICard 
              title={`${viewMode === 'MONTH' ? 'Ayın' : 'Yılın'} Satış Hacmi`}
              value={StorageService.formatCurrency(totalSaleRevenue)}
              subValue={`${totalSaleCount} Adet Ürün Satışı`}
              icon={ArrowUpRight}
              colorClass="text-green-500"
          />
          <KPICard 
              title="Kritik Stok Sayısı"
              value={criticalProducts.length.toString()}
              subValue="Acil müdahale gerekenler"
              icon={AlertTriangle}
              colorClass="text-red-500"
          />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Critical Stock List */}
          <div className="xl:col-span-2 bg-slate-800 rounded-xl border border-slate-700 shadow-lg flex flex-col">
              <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                  <h3 className="font-bold text-white flex items-center gap-2">
                      <AlertTriangle size={18} className="text-red-500" />
                      Kritik Seviyedeki Ürünler
                  </h3>
                  {criticalProducts.length > 0 && (
                      <button 
                          onClick={handleShareWhatsApp}
                          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold shadow-lg shadow-green-900/20 transition-all active:scale-95"
                      >
                          <MessageCircle size={16} /> WhatsApp ile Paylaş
                      </button>
                  )}
              </div>
              
              <div className="flex-1 overflow-y-auto max-h-[400px] p-2 custom-scrollbar">
                  {criticalProducts.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center p-10 text-slate-500">
                          <CheckCircle size={48} className="mb-4 text-green-500/50" />
                          <p>Harika! Kritik seviyede ürün bulunmuyor.</p>
                      </div>
                  ) : (
                      <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-900 text-slate-500 text-xs uppercase sticky top-0">
                              <tr>
                                  <th className="p-3 rounded-tl-lg">Ürün</th>
                                  <th className="p-3 text-center">Kategori</th>
                                  <th className="p-3 text-center">Depo Stoğu</th>
                                  <th className="p-3 text-right rounded-tr-lg">Bar Stoğu</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-700">
                              {criticalProducts.map(p => (
                                  <tr key={p.id} className="hover:bg-slate-700/50 transition-colors">
                                      <td className="p-3">
                                          <div className="flex items-center gap-3">
                                              <div className="w-8 h-8 rounded bg-slate-700 overflow-hidden">
                                                  <img src={p.image} alt="" className="w-full h-full object-cover opacity-80" />
                                              </div>
                                              <div>
                                                <span className="font-medium text-red-200 block">{p.name}</span>
                                                <span className="text-[10px] text-red-500">Limit: {p.limit}</span>
                                              </div>
                                          </div>
                                      </td>
                                      <td className="p-3 text-center text-xs text-slate-400">{p.category}</td>
                                      <td className="p-3 text-center">
                                          <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded font-bold text-xs border border-red-500/30">
                                              {p.storeQty}
                                          </span>
                                      </td>
                                      <td className="p-3 text-right text-slate-400 text-sm">{p.barQty}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  )}
              </div>
          </div>

          {/* Recent Transactions List (Replaced Summary) */}
          <div className="xl:col-span-1 bg-slate-800 rounded-xl border border-slate-700 shadow-lg flex flex-col h-[500px]">
              <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                  <h3 className="font-bold text-white flex items-center gap-2">
                      <History size={18} className="text-brand-500" />
                      Son Depo Hareketleri
                  </h3>
                  <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-300">Canlı</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                  {transactions.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500">
                          <History size={32} className="mb-2 opacity-20" />
                          <p className="text-sm">Henüz işlem kaydı yok.</p>
                      </div>
                  ) : (
                      transactions.slice(0, 15).map(t => {
                          const prod = products.find(p => p.id === t.productId);
                          const typeInfo = getTransactionLabel(t.type);
                          
                          return (
                              <div key={t.id} className="flex gap-3 items-start p-3 rounded-lg border border-slate-700/50 bg-slate-700/20 hover:bg-slate-700/40 transition-colors">
                                  <div className={`mt-1 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${typeInfo.bg}`}>
                                      {t.type === TransactionType.PURCHASE && <ArrowDownRight size={16} className={typeInfo.color} />}
                                      {t.type === TransactionType.TRANSFER && <ArrowRightLeft size={16} className={typeInfo.color} />}
                                      {t.type === TransactionType.SALE && <ArrowUpRight size={16} className={typeInfo.color} />}
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                      <div className="flex justify-between items-start">
                                          <p className="text-sm font-bold text-slate-200 truncate">{prod?.name || 'Bilinmeyen'}</p>
                                          <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                                              {new Date(t.timestamp).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}
                                          </span>
                                      </div>
                                      
                                      <div className="flex justify-between items-end mt-1">
                                          <div>
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${typeInfo.bg} ${typeInfo.color} font-medium`}>
                                                  {typeInfo.text}
                                              </span>
                                          </div>
                                          <p className="text-sm font-mono font-bold text-white">
                                              {t.quantity} Adet
                                          </p>
                                      </div>
                                  </div>
                              </div>
                          );
                      })
                  )}
              </div>
          </div>
      </div>
    </div>
  );
};
