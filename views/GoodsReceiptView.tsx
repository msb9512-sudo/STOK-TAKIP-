
import React, { useState, useEffect, useRef } from 'react';
import { StorageService } from '../services/storageService';
import { GeminiService } from '../services/geminiService';
import type { Product, Transaction, User } from '../types';
import { TransactionType } from '../types';
import { Truck, PlusCircle, Package, FileText, History, X, Check, FileUp, Link, AlertTriangle, RefreshCcw, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface ParsedItem {
    name: string; // Faturadaki ham isim
    quantity: number;
    unitPrice: number;
    status: 'NEW' | 'EXISTING';
    linkedProductId?: string; // Eşleşen sistem ID'si
}

export const GoodsReceiptView: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Calendar State
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);

  // Form State
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [supplier, setSupplier] = useState<string>('');
  const [invoiceNo, setInvoiceNo] = useState<string>('');
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  // PDF Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[] | null>(null);

  const refreshData = () => {
    setProducts(StorageService.getProducts());
    setTransactions(StorageService.getTransactions().filter(t => t.type === TransactionType.PURCHASE));
  };

  useEffect(() => {
    refreshData();
    const session = StorageService.getCurrentSession();
    if(session) setCurrentUser(session);
  }, []);

  // Update cost price when product changes
  useEffect(() => {
      const prod = products.find(p => p.id === selectedProduct);
      if (prod) {
          setCostPrice(prod.costPrice);
      }
  }, [selectedProduct, products]);

  const handlePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || quantity <= 0) {
        setFeedback({ msg: "Lütfen ürün ve miktar giriniz.", type: 'error' });
        return;
    }

    setLoading(true);
    const performerName = currentUser?.username || 'Sistem';

    try {
        await StorageService.purchaseStock(selectedProduct, quantity, costPrice, performerName, supplier, invoiceNo);
        setFeedback({ msg: "Mal kabul işlemi başarıyla kaydedildi. Stok güncellendi.", type: 'success' });
        
        // Reset Form
        setQuantity(0);
        setSupplier('');
        setInvoiceNo('');
        refreshData();
    } catch (err: any) {
        setFeedback({ msg: err.message, type: 'error' });
    } finally {
        setLoading(false);
        setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.type !== 'application/pdf') {
          alert("Lütfen sadece PDF formatında fatura yükleyiniz.");
          return;
      }

      setIsParsing(true);
      
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
          try {
              const base64Data = (reader.result as string).split(',')[1];
              const result = await GeminiService.parseInvoicePDF(base64Data);
              
              // Tag items as NEW or EXISTING based on Smart Match
              const taggedItems: ParsedItem[] = result.map((item: any) => {
                  const cleanName = item.name.trim();
                  const match = StorageService.findSmartMatch(cleanName);
                  
                  const qty = StorageService.parseNumber(item.quantity);
                  const price = StorageService.parseNumber(item.unitPrice);
                  
                  return { 
                      ...item, 
                      name: cleanName, // Faturadaki ham isim
                      quantity: qty,
                      unitPrice: price,
                      status: match ? 'EXISTING' : 'NEW',
                      linkedProductId: match ? match.id : undefined
                  };
              });

              setParsedItems(taggedItems);
          } catch (error: any) {
              setFeedback({ msg: error.message, type: 'error' });
              setTimeout(() => setFeedback(null), 6000);
              if (!error.message?.includes('Gemini API anahtarı') && !error.message?.includes('statik hosting')) {
                  alert("Fatura Analiz Hatası: " + error.message);
              }
          } finally {
              setIsParsing(false);
              if(fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.onerror = () => {
          setIsParsing(false);
          alert("Dosya okuma hatası.");
      };
  };

  // Kullanıcı dropdown'dan bir şey seçtiğinde çalışır
  const handleLinkChange = (index: number, value: string) => {
      if (!parsedItems) return;
      
      const updatedItems = [...parsedItems];
      
      if (value === 'NEW_ENTRY') {
          // Kullanıcı "Yeni Ürün Oluştur" dedi
          updatedItems[index].linkedProductId = undefined;
          updatedItems[index].status = 'NEW';
      } else {
          // Kullanıcı mevcut bir ürünü seçti
          updatedItems[index].linkedProductId = value;
          updatedItems[index].status = 'EXISTING';
      }
      
      setParsedItems(updatedItems);
  };

  const confirmPDFImport = async () => {
      if (!parsedItems) return;
      setLoading(true);
      const performerName = currentUser?.username || 'Sistem';
      
      try {
          // 1. Önce Aliases (Takma Adları) Öğren
          for (const item of parsedItems) {
              if (item.status === 'EXISTING' && item.linkedProductId) {
                  // Faturadaki isim ile sistemdeki ürün ismini karşılaştır
                  const product = products.find(p => p.id === item.linkedProductId);
                  if (product) {
                      // İsimler tam olarak aynı değilse, bu bir alias'tır. Öğren.
                      if (product.name.trim().toLowerCase() !== item.name.trim().toLowerCase()) {
                          await StorageService.learnProductAlias(product.id, item.name.trim());
                      }
                  }
              }
          }

          // 2. Stok İşlemlerini Yap
          const itemsToProcess = parsedItems.map(item => ({
              ...item,
              name: (item.status === 'EXISTING' && item.linkedProductId)
                  ? (products.find(p => p.id === item.linkedProductId)?.name || item.name)
                  : item.name 
          }));

          await StorageService.processBulkPurchase(itemsToProcess, performerName, supplier, invoiceNo);
          
          setParsedItems(null);
          setTimeout(() => {
              refreshData();
              setFeedback({ msg: "Fatura başarıyla işlendi! Eşleştirmeler kaydedildi ve stoklar güncellendi.", type: 'success' });
          }, 500);

      } catch (e: any) {
          setFeedback({ msg: "Hata: " + e.message, type: 'error' });
      } finally {
          setLoading(false);
          setTimeout(() => setFeedback(null), 5000);
      }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 animate-fade-in pb-10 flex-1 min-h-full relative">
      
      {/* PDF CONFIRMATION MODAL */}
      {parsedItems && (
          <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[90vh] animate-scale-in">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-2xl">
                      <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <FileText className="text-blue-500" />
                            Fatura Analizi & Eşleştirme
                        </h3>
                        <p className="text-slate-400 text-sm mt-1">
                            Lütfen otomatik eşleşmeleri kontrol ediniz. Yanlışsa <strong>"Yeni"</strong> butonuna basın.
                        </p>
                      </div>
                      <button onClick={() => setParsedItems(null)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
                          <X size={20} />
                      </button>
                  </div>
                  
                  {/* Price Change Warning Banner */}
                  {(() => {
                      const priceChangedCount = parsedItems.filter(item => {
                          const p = item.linkedProductId ? products.find(x => x.id === item.linkedProductId) : undefined;
                          return p && Math.abs(p.costPrice - item.unitPrice) >= 0.01;
                      }).length;

                      if (priceChangedCount === 0) return null;

                      return (
                          <div className="bg-red-950/40 border-b border-red-500/40 px-6 py-3 flex items-center justify-between gap-3 text-xs text-red-300">
                              <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                                      <AlertTriangle size={16} />
                                  </div>
                                  <div>
                                      <div className="font-bold text-red-200">
                                          {priceChangedCount} üründe alış fiyatı değişikliği tespit edildi!
                                      </div>
                                      <div className="text-red-300/80 text-[11px]">
                                          Kırmızıyla işaretlenen ürünlerin önceki ve yeni alış fiyatları gösterilmektedir. Onayladığınızda Depo Yönetimi'ndeki alış fiyatları yeni fiyatla otomatik güncellenecektir.
                                      </div>
                                  </div>
                              </div>
                              <span className="text-[10px] font-bold bg-red-500/20 text-red-300 px-2.5 py-1 rounded-md border border-red-500/40 uppercase whitespace-nowrap shrink-0">
                                  Depo Alış Fiyatı Güncellenecek
                              </span>
                          </div>
                      );
                  })()}
                  
                  <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-900">
                      <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-950 text-slate-500 text-xs uppercase sticky top-0 z-10 shadow-lg">
                              <tr>
                                  <th className="p-3 w-1/4">Faturadaki İsim</th>
                                  <th className="p-3 w-1/4">Durum</th>
                                  <th className="p-3 w-1/3">Eşleşen / Yeni Ürün Adı</th>
                                  <th className="p-3 text-right w-20">Adet</th>
                                  <th className="p-3 text-right w-36">Birim Fiyat (Alış)</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                              {parsedItems.map((item, idx) => {
                                  const isDuplicateID = item.status === 'EXISTING' && parsedItems.filter(x => x.linkedProductId === item.linkedProductId).length > 1;
                                  const linkedProd = item.linkedProductId ? products.find(p => p.id === item.linkedProductId) : undefined;
                                  const hasPriceDiff = linkedProd && Math.abs(linkedProd.costPrice - item.unitPrice) >= 0.01;
                                  const oldPrice = linkedProd ? linkedProd.costPrice : null;
                                  const newPrice = item.unitPrice;
                                  const priceDiff = oldPrice !== null ? newPrice - oldPrice : 0;
                                  const percentChange = (oldPrice && oldPrice > 0) ? ((priceDiff / oldPrice) * 100).toFixed(1) : null;

                                  return (
                                  <tr key={idx} className={`hover:bg-slate-800/50 transition-colors ${item.status === 'NEW' ? 'bg-blue-500/5' : ''}`}>
                                      {/* FATURA İSMİ */}
                                      <td className="p-3 align-middle">
                                          <div className="font-medium text-white text-sm">{item.name}</div>
                                      </td>

                                      {/* DURUM GÖSTERGESİ */}
                                      <td className="p-3 align-middle">
                                          {item.status === 'NEW' ? (
                                              <span className="inline-flex items-center gap-1 bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2 py-1 rounded border border-blue-500/30">
                                                  <PlusCircle size={10} /> YENİ ÜRÜN
                                              </span>
                                          ) : (
                                              <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-300 text-[10px] font-bold px-2 py-1 rounded border border-green-500/30">
                                                  <Link size={10} /> MEVCUT KAYIT
                                              </span>
                                          )}
                                          {isDuplicateID && (
                                              <div className="text-[9px] text-amber-500 mt-1 flex items-center gap-1">
                                                  <AlertTriangle size={10} />
                                                  Çoklu Eşleşme!
                                              </div>
                                          )}
                                      </td>

                                      {/* EŞLEŞTİRME SEÇİCİSİ - TAM KONTROL */}
                                      <td className="p-3 align-middle">
                                          <div className="flex items-center gap-2">
                                              <div className="relative flex-1">
                                                  <select 
                                                      className={`w-full border rounded py-2 pl-3 pr-8 text-xs font-medium outline-none appearance-none cursor-pointer transition-all
                                                          ${item.status === 'EXISTING' 
                                                              ? 'bg-green-900/10 border-green-500/30 text-green-300 focus:border-green-500' 
                                                              : 'bg-blue-900/10 border-blue-500/30 text-blue-300 focus:border-blue-500'
                                                          }
                                                      `}
                                                      value={item.linkedProductId || 'NEW_ENTRY'}
                                                      onChange={(e) => handleLinkChange(idx, e.target.value)}
                                                  >
                                                      <option value="NEW_ENTRY" className="bg-slate-900 text-blue-400 font-bold">
                                                          + YENİ ÜRÜN OLUŞTUR
                                                      </option>
                                                      <optgroup label="Mevcut Ürün Listesi" className="bg-slate-900 text-slate-400">
                                                          {products.sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                                                              <option key={p.id} value={p.id} className="text-white">
                                                                  {p.name} ({StorageService.formatCurrency(p.costPrice)})
                                                              </option>
                                                          ))}
                                                      </optgroup>
                                                  </select>
                                                  <div className="absolute right-3 top-2.5 pointer-events-none text-slate-500 text-[10px]">▼</div>
                                              </div>
                                              
                                              {/* QUICK RESET BUTTON */}
                                              {item.status === 'EXISTING' && (
                                                  <button 
                                                    onClick={() => handleLinkChange(idx, 'NEW_ENTRY')}
                                                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded border border-slate-700 transition-colors"
                                                    title="Eşleşmeyi Kaldır (Yeni Ürün Yap)"
                                                  >
                                                      <RefreshCcw size={14} />
                                                  </button>
                                              )}
                                          </div>
                                      </td>

                                      {/* QUANTITY */}
                                      <td className="p-3 align-middle text-right font-mono text-slate-300 text-sm">
                                          {item.quantity}
                                      </td>

                                      {/* PRICE SECTION: Kırmızıyla sadece o bölümü işaretle & Önceki/Yeni Fiyatı Göster */}
                                      <td className="p-3 align-middle text-right">
                                          {hasPriceDiff && oldPrice !== null ? (
                                              <div className="inline-flex flex-col items-end bg-red-500/15 border-2 border-red-500/80 rounded-xl p-2.5 shadow-md shadow-red-950/50">
                                                  <div className="flex items-center gap-1 text-[10px] uppercase font-black text-red-400">
                                                      <AlertTriangle size={11} className="text-red-400 shrink-0" />
                                                      <span>Farklı Fiyat!</span>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                                                      <span className="text-[10px] text-slate-400">Önceki:</span>
                                                      <span className="line-through font-mono text-slate-300 font-bold">
                                                          {StorageService.formatCurrency(oldPrice)}
                                                      </span>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 mt-0.5 text-sm font-black font-mono text-red-400">
                                                      <span className="text-[10px] font-bold text-red-300 uppercase">Yeni:</span>
                                                      <span>{StorageService.formatCurrency(newPrice)}</span>
                                                  </div>
                                                  <div className="text-[10px] font-bold text-red-200 mt-1 bg-red-600/30 px-2 py-0.5 rounded border border-red-500/40">
                                                      {priceDiff > 0 ? `▲ +${StorageService.formatCurrency(priceDiff)} (%${percentChange})` : `▼ ${StorageService.formatCurrency(priceDiff)} (%${percentChange})`}
                                                  </div>
                                              </div>
                                          ) : (
                                              <div className="flex flex-col items-end">
                                                  <span className="font-mono text-green-400 text-sm font-semibold">
                                                      {StorageService.formatCurrency(item.unitPrice)}
                                                  </span>
                                                  {linkedProd ? (
                                                      <span className="text-[10px] text-slate-500">Öncekiyle aynı</span>
                                                  ) : (
                                                      <span className="text-[10px] text-slate-500">İlk alış fiyatı</span>
                                                  )}
                                              </div>
                                          )}
                                      </td>
                                  </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>

                  <div className="p-6 border-t border-slate-800 bg-slate-900 rounded-b-2xl flex justify-between items-center">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                          <AlertTriangle size={14} className="text-amber-500" />
                          <span>Eşleştirmeleriniz kaydedilecek ve sistem bir dahaki sefere hatırlayacaktır.</span>
                      </div>
                      <div className="flex gap-3">
                        <button 
                            onClick={() => setParsedItems(null)}
                            className="px-4 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                            İptal
                        </button>
                        <button 
                            onClick={confirmPDFImport}
                            disabled={loading}
                            className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold shadow-lg shadow-green-900/20 flex items-center gap-2"
                        >
                            {loading ? 'Kaydediliyor...' : <><Check size={18}/> Onayla ve Kaydet</>}
                        </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* LEFT: Entry Form */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                <Truck className="text-brand-500" />
                Mal Kabul
            </h2>
            <p className="text-slate-400 mt-1">Tedarikçiden gelen ürünleri depoya işleyin.</p>
        </div>

        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg flex-1 overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <PlusCircle size={20} className="text-green-500" />
                Yeni Giriş
            </h3>

            <form onSubmit={handlePurchase} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Ürün Seçimi</label>
                    <div className="relative">
                        <Package className="absolute left-3 top-3 text-slate-500" size={18} />
                        <select 
                            value={selectedProduct}
                            onChange={(e) => setSelectedProduct(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:ring-1 focus:ring-brand-500 outline-none"
                        >
                            <option value="">Listeden Seçiniz...</option>
                            {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Miktar (Adet)</label>
                        <input 
                            type="number"
                            min="1"
                            value={quantity || ''}
                            onChange={(e) => setQuantity(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white focus:ring-1 focus:ring-brand-500 outline-none"
                            placeholder="0"
                        />
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-slate-400 mb-1">Birim Maliyet (₺)</label>
                         <div className="relative">
                            <span className="absolute left-3 top-2.5 text-slate-500">₺</span>
                            <input 
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={costPrice || ''}
                                onChange={(e) => setCostPrice(Number(e.target.value))}
                                className={`w-full bg-slate-900 border rounded-lg py-2.5 pl-8 pr-4 text-white outline-none transition-all ${
                                    (() => {
                                        const p = products.find(prod => prod.id === selectedProduct);
                                        return p && costPrice > 0 && Math.abs(p.costPrice - costPrice) >= 0.01
                                            ? 'border-red-500/80 focus:border-red-500 ring-1 ring-red-500/30'
                                            : 'border-slate-700 focus:ring-1 focus:ring-brand-500'
                                    })()
                                }`}
                            />
                         </div>
                         {(() => {
                             const p = products.find(prod => prod.id === selectedProduct);
                             if (!p || !costPrice || Math.abs(p.costPrice - costPrice) < 0.01) return null;
                             const diff = costPrice - p.costPrice;
                             const pct = ((diff / p.costPrice) * 100).toFixed(1);
                             return (
                                 <div className="mt-2 p-2 bg-red-500/15 border border-red-500/60 rounded-xl text-xs text-red-300 space-y-1">
                                     <div className="flex items-center gap-1 font-bold text-red-400 text-[11px]">
                                         <AlertTriangle size={12} />
                                         <span>Farklı Alış Fiyatı</span>
                                     </div>
                                     <div className="flex items-center justify-between text-[11px]">
                                         <span className="text-slate-400">Önceki: <span className="line-through font-mono text-slate-300 font-bold">{StorageService.formatCurrency(p.costPrice)}</span></span>
                                         <span className="font-mono font-black text-red-400">Yeni: {StorageService.formatCurrency(costPrice)}</span>
                                     </div>
                                     <div className="text-[10px] text-red-200/90 font-medium">
                                         {diff > 0 ? `▲ +${StorageService.formatCurrency(diff)} (%${pct})` : `▼ ${StorageService.formatCurrency(diff)} (%${pct})`} • Depo alış fiyatı güncellenecek
                                     </div>
                                 </div>
                             );
                         })()}
                    </div>
                </div>

                <div className="border-t border-slate-700 pt-4 mt-2">
                    <p className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Tedarikçi Bilgileri (Opsiyonel)</p>
                    <div className="space-y-3">
                        <div>
                            <div className="relative">
                                <Truck className="absolute left-3 top-3 text-slate-500" size={16} />
                                <input 
                                    type="text"
                                    value={supplier}
                                    onChange={(e) => setSupplier(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:ring-1 focus:ring-brand-500 outline-none"
                                    placeholder="Tedarikçi Firma Adı"
                                />
                            </div>
                        </div>
                        <div>
                             <div className="relative">
                                <FileText className="absolute left-3 top-3 text-slate-500" size={16} />
                                <input 
                                    type="text"
                                    value={invoiceNo}
                                    onChange={(e) => setInvoiceNo(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:ring-1 focus:ring-brand-500 outline-none"
                                    placeholder="Fatura Numarası"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-4 space-y-3">
                    <button 
                        type="submit"
                        disabled={loading || isParsing}
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-green-900/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                        {loading ? 'İşleniyor...' : 'KAYDET VE STOĞA EKLE'}
                    </button>

                    <div className="relative group">
                        <input 
                            type="file" 
                            accept="application/pdf"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            disabled={isParsing}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <button 
                            type="button"
                            disabled={isParsing}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-900/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isParsing ? (
                                <span className="animate-pulse">PDF Analiz Ediliyor...</span>
                            ) : (
                                <>
                                    <FileUp size={20} />
                                    PDF'TEN FATURA EKLE
                                </>
                            )}
                        </button>
                    </div>

                    {feedback && (
                        <div className={`mt-3 p-3 rounded text-sm text-center ${feedback.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {feedback.msg}
                        </div>
                    )}
                </div>
            </form>
        </div>
      </div>

      {/* RIGHT: Calendar & Details */}
      <div className="w-full lg:w-2/3 flex flex-col gap-6">
           <div className="flex justify-between items-end h-[52px]">
               <h3 className="text-xl font-bold text-white flex items-center gap-2">
                   <CalendarIcon className="text-slate-400" />
                   Mal Kabul Takvimi
               </h3>
               <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
                   <button 
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
                    className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white"
                   >
                       <ChevronLeft size={16} />
                   </button>
                   <span className="text-sm font-bold text-white min-w-[100px] text-center">
                       {viewDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
                   </span>
                   <button 
                    onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
                    className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-white"
                   >
                       <ChevronRight size={16} />
                   </button>
               </div>
           </div>

           <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden flex flex-col lg:flex-row">
               {/* Calendar Grid */}
               <div className="w-full lg:w-1/2 p-4 border-r border-slate-700">
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
                            <div key={d} className="text-[10px] font-bold text-slate-500 text-center uppercase py-1">{d}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                        {(() => {
                            const year = viewDate.getFullYear();
                            const month = viewDate.getMonth();
                            const firstDay = new Date(year, month, 1).getDay();
                            const daysInMonth = new Date(year, month + 1, 0).getDate();
                            
                            // Adjust firstDay for Monday start (JS default is Sunday=0)
                            const startOffset = firstDay === 0 ? 6 : firstDay - 1;
                            
                            const days = [];
                            
                            // Empty slots for previous month
                            for (let i = 0; i < startOffset; i++) {
                                days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
                            }
                            
                            // Actual days
                            for (let d = 1; d <= daysInMonth; d++) {
                                const date = new Date(year, month, d);
                                const dateStr = date.toDateString();
                                const hasTransactions = transactions.some(t => new Date(t.timestamp).toDateString() === dateStr);
                                const isSelected = selectedDate.toDateString() === dateStr;
                                const isToday = new Date().toDateString() === dateStr;

                                days.push(
                                    <button
                                        key={d}
                                        onClick={() => {
                                            setSelectedDate(date);
                                            setExpandedSupplier(null);
                                        }}
                                        className={`
                                            aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all
                                            ${isSelected ? 'bg-brand-600 text-white shadow-lg scale-105 z-10' : 'hover:bg-slate-700 text-slate-300'}
                                            ${isToday && !isSelected ? 'border border-brand-500/50' : ''}
                                        `}
                                    >
                                        <span className="text-sm font-bold">{d}</span>
                                        {hasTransactions && (
                                            <div className={`w-1 h-1 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-brand-500'}`}></div>
                                        )}
                                    </button>
                                );
                            }
                            return days;
                        })()}
                    </div>
               </div>

               {/* Day Details */}
               <div className="w-full lg:w-1/2 flex flex-col bg-slate-900/30">
                    <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                        <h4 className="font-bold text-white flex items-center gap-2">
                            <History size={16} className="text-slate-400" />
                            {selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </h4>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                        {(() => {
                            const dateStr = selectedDate.toDateString();
                            const dayTransactions = transactions.filter(t => new Date(t.timestamp).toDateString() === dateStr);
                            
                            if (dayTransactions.length === 0) {
                                return (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-500 py-10">
                                        <Truck size={32} className="mb-2 opacity-20" />
                                        <p className="text-sm">Bu tarihte işlem yok.</p>
                                    </div>
                                );
                            }

                            // Group by supplier
                            const bySupplier = dayTransactions.reduce((acc, t) => {
                                const s = t.supplier || 'Bilinmeyen Firma';
                                if (!acc[s]) acc[s] = [];
                                acc[s].push(t);
                                return acc;
                            }, {} as Record<string, Transaction[]>);

                            return Object.entries(bySupplier).map(([supplierName, txs]: [string, Transaction[]]) => (
                                <div key={supplierName} className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden">
                                    <button 
                                        onClick={() => setExpandedSupplier(expandedSupplier === supplierName ? null : supplierName)}
                                        className="w-full p-3 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Truck size={16} className="text-brand-500" />
                                            <span className="font-bold text-sm text-white">{supplierName}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                                                {txs.length} Kalem
                                            </span>
                                            <ChevronRight size={16} className={`text-slate-500 transition-transform ${expandedSupplier === supplierName ? 'rotate-90' : ''}`} />
                                        </div>
                                    </button>
                                    
                                    {expandedSupplier === supplierName && (
                                        <div className="p-3 bg-slate-900/50 border-t border-slate-700 space-y-2">
                                            {txs.map(t => {
                                                const prod = products.find(p => p.id === t.productId);
                                                return (
                                                    <div key={t.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-800 last:border-0">
                                                        <div className="flex flex-col">
                                                            <span className="text-slate-200 font-medium">{prod?.name || 'Bilinmeyen Ürün'}</span>
                                                            <span className="text-[10px] text-slate-500">
                                                                {new Date(t.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                                {t.invoiceNo && ` • No: ${t.invoiceNo}`}
                                                            </span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="font-mono text-white">+{t.quantity}</div>
                                                            <div className="text-[10px] text-green-400">{StorageService.formatCurrency(t.totalValue)}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <div className="pt-2 mt-2 border-t border-slate-700 flex justify-between items-center">
                                                <span className="text-[10px] uppercase font-bold text-slate-500">Toplam Tutar</span>
                                                <span className="text-sm font-mono font-bold text-green-400">
                                                    {StorageService.formatCurrency(txs.reduce((sum, t) => sum + t.totalValue, 0))}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ));
                        })()}
                    </div>
               </div>
           </div>
      </div>
    </div>
  );
};
