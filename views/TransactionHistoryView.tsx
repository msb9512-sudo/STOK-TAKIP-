
import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import type { Order, Product, Transaction } from '../types';
import { TransactionType } from '../types';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Package, Clock, CheckCircle, XCircle, Search, Printer, Beer, ArrowRightLeft } from 'lucide-react';

export const TransactionHistoryView: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  
  // Toggle between viewing Orders (Transfers) or Sales
  const [viewMode, setViewMode] = useState<'ORDERS' | 'SALES'>('ORDERS');

  useEffect(() => {
    refreshData();
    window.addEventListener('barstock-storage-update', refreshData);
    return () => window.removeEventListener('barstock-storage-update', refreshData);
  }, []);

  const refreshData = () => {
    setOrders(StorageService.getOrders());
    setTransactions(StorageService.getTransactions());
    setProducts(StorageService.getProducts());
  };

  // Calendar Logic
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const changeMonth = (delta: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
    setSelectedDate(null);
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  const hasDataOnDate = (day: number) => {
    const checkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    if (viewMode === 'ORDERS') {
        return orders.some(o => isSameDay(new Date(o.timestamp), checkDate));
    } else {
        return transactions.some(t => t.type === TransactionType.SALE && isSameDay(new Date(t.timestamp), checkDate));
    }
  };

  const getFilteredDataForSelectedDate = () => {
    if (!selectedDate) return [];
    if (viewMode === 'ORDERS') {
        return orders.filter(o => isSameDay(new Date(o.timestamp), selectedDate)).sort((a,b) => b.timestamp - a.timestamp);
    } else {
        return transactions
            .filter(t => t.type === TransactionType.SALE && isSameDay(new Date(t.timestamp), selectedDate))
            .sort((a,b) => b.timestamp - a.timestamp);
    }
  };

  const selectedData = getFilteredDataForSelectedDate();

  const handlePrint = () => {
      if (!selectedDate || selectedData.length === 0) return;

      const printWindow = window.open('', '', 'width=600,height=800');
      if (!printWindow) return;

      const dateStr = selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
      const title = viewMode === 'ORDERS' ? 'Günlük Transfer Raporu' : 'Günlük Satış Raporu';

      let contentHtml = '';
      
      if (viewMode === 'ORDERS') {
          (selectedData as Order[]).forEach(order => {
              contentHtml += `
                <div style="border-bottom: 1px dashed #000; padding: 10px 0; page-break-inside: avoid;">
                    <div style="display:flex; justify-content:space-between; font-weight:bold;">
                        <span>Talep: ${order.requestedBy}</span>
                        <span>${new Date(order.timestamp).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div style="font-size:10px; margin-bottom:5px;">ID: #${order.id.substring(0,6)} - Durum: ${order.status}</div>
                    <table style="width:100%; font-size:12px;">
                        ${order.items.map(item => {
                            const prod = products.find(p => p.id === item.productId);
                            return `
                                <tr style="${item.status === 'REJECTED' ? 'text-decoration:line-through; color:red;' : ''}">
                                    <td style="padding:2px 0;">${prod?.name || 'Bilinmeyen'}</td>
                                    <td style="text-align:right;">${item.quantity} Ad.</td>
                                </tr>
                            `;
                        }).join('')}
                    </table>
                </div>
              `;
          });
      } else {
          let totalDayRevenue = 0;
          (selectedData as Transaction[]).forEach(tx => {
              const prod = products.find(p => p.id === tx.productId);
              totalDayRevenue += tx.totalValue;
              contentHtml += `
                <div style="border-bottom: 1px solid #eee; padding: 8px 0; display:flex; justify-content:space-between; font-size:12px;">
                    <div>
                        <strong>${prod?.name || 'Bilinmeyen'}</strong><br/>
                        <span style="font-size:10px; color:#666;">${new Date(tx.timestamp).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})} | ${tx.note || 'Bar Satışı'}</span>
                    </div>
                    <div style="text-align:right;">
                        ${tx.quantity} Adet<br/>
                        <strong>${StorageService.formatCurrency(tx.totalValue)}</strong>
                    </div>
                </div>
              `;
          });
          contentHtml += `
            <div style="margin-top:20px; border-top:2px solid #000; padding-top:10px; text-align:right; font-weight:bold; font-size:16px;">
                Günlük Toplam: ${StorageService.formatCurrency(totalDayRevenue)}
            </div>
          `;
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>${title}</title>
            <style>
              body { font-family: 'Courier New', monospace; padding: 20px; color: #000; }
              h2 { text-align: center; margin-bottom: 5px; }
              p { text-align: center; margin-top: 0; font-size: 12px; }
              .footer { margin-top: 30px; text-align: center; font-size: 10px; border-top: 1px solid #000; padding-top: 10px; }
              table { width: 100%; border-collapse: collapse; }
            </style>
          </head>
          <body>
            <h2>BARSTOCK PRO</h2>
            <p>${title}</p>
            <p>${dateStr}</p>
            <br/>
            ${contentHtml}
            <div class="footer">
              Toplam ${selectedData.length} işlem listelendi.
            </div>
            <script>window.onload = function() { window.print(); window.close(); }</script>
          </body>
        </html>
      `);
      printWindow.document.close();
  };

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-20 sm:h-24 bg-slate-900/50 border border-slate-800"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
      const hasData = hasDataOnDate(day);
      const isSelected = selectedDate && isSameDay(date, selectedDate);
      const isToday = isSameDay(date, new Date());

      days.push(
        <div 
          key={day}
          onClick={() => setSelectedDate(date)}
          className={`h-20 sm:h-24 border border-slate-700 p-2 cursor-pointer transition-all relative flex flex-col justify-between group
            ${isSelected ? 'bg-brand-900/40 ring-2 ring-inset ring-brand-500' : 'bg-slate-800 hover:bg-slate-750'}
          `}
        >
          <div className="flex justify-between items-start">
             <span className={`text-xs sm:text-sm font-medium w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-brand-500 text-white' : 'text-slate-400'}`}>
                {day}
             </span>
             {hasData && (
                 <span className={`w-2 h-2 sm:w-3 sm:h-3 rounded-full shadow-lg animate-pulse ${viewMode === 'ORDERS' ? 'bg-brand-500 shadow-brand-500/50' : 'bg-green-500 shadow-green-500/50'}`}></span>
             )}
          </div>
          
          {hasData && (
              <div className="hidden sm:block mt-1">
                  <div className={`text-[9px] rounded px-1 py-0.5 truncate text-center font-bold ${viewMode === 'ORDERS' ? 'bg-brand-900/30 text-brand-400' : 'bg-green-900/30 text-green-400'}`}>
                      {viewMode === 'ORDERS' ? 'SİPARİŞ VAR' : 'SATIŞ VAR'}
                  </div>
              </div>
          )}
        </div>
      );
    }
    return days;
  };

  const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  return (
    <div className="h-full flex flex-col lg:flex-row gap-6 animate-fade-in pb-10">
      {/* LEFT: Calendar */}
      <div className="flex-1 bg-slate-900 rounded-xl border border-slate-700 shadow-xl overflow-hidden flex flex-col">
          {/* Calendar Header */}
          <div className="p-4 sm:p-6 bg-slate-800 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex flex-col">
                  <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                      <CalendarIcon className="text-brand-500" />
                      İşlem Takvimi
                  </h2>
                  <div className="flex mt-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                      <button 
                        onClick={() => setViewMode('ORDERS')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all ${viewMode === 'ORDERS' ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                          TRANSFERLER
                      </button>
                      <button 
                        onClick={() => setViewMode('SALES')}
                        className={`px-3 py-1 rounded text-xs font-bold transition-all ${viewMode === 'SALES' ? 'bg-green-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                          SATIŞLAR
                      </button>
                  </div>
              </div>
              
              <div className="flex items-center gap-4 bg-slate-900 p-1 rounded-lg border border-slate-700">
                  <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-700 rounded-md text-slate-300 hover:text-white transition-colors">
                      <ChevronLeft size={20} />
                  </button>
                  <span className="font-bold text-sm sm:text-lg w-28 sm:w-32 text-center select-none">
                      {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </span>
                  <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-700 rounded-md text-slate-300 hover:text-white transition-colors">
                      <ChevronRight size={20} />
                  </button>
              </div>
          </div>

          {/* Days Header */}
          <div className="grid grid-cols-7 bg-slate-800/50 border-b border-slate-700">
              {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => (
                  <div key={d} className="py-2 sm:py-3 text-center text-[10px] sm:text-sm font-semibold text-slate-500 uppercase tracking-wider">
                      {d}
                  </div>
              ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 flex-1 bg-slate-900">
              {renderCalendarDays()}
          </div>
      </div>

      {/* RIGHT: Details Panel */}
      <div className="w-full lg:w-96 bg-slate-800 rounded-xl border border-slate-700 shadow-xl flex flex-col min-h-[400px] lg:h-auto overflow-hidden">
          <div className={`p-5 border-b border-slate-700 ${viewMode === 'SALES' ? 'bg-green-900/10' : 'bg-brand-900/10'}`}>
              <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      {viewMode === 'ORDERS' ? <ArrowRightLeft className="text-brand-400" /> : <Beer className="text-green-400" />}
                      {viewMode === 'ORDERS' ? 'Transfer Detayları' : 'Günlük Satışlar'}
                  </h3>
                  {selectedData.length > 0 && (
                      <button 
                        onClick={handlePrint}
                        className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-lg transition-colors flex items-center gap-1 text-xs"
                      >
                          <Printer size={14} /> Yazdır
                      </button>
                  )}
              </div>
              <p className="text-slate-400 text-sm mt-1">
                  {selectedDate 
                    ? selectedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) 
                    : 'Bir tarih seçiniz'}
              </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4 bg-slate-900/30">
              {!selectedDate ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
                      <CalendarIcon size={48} className="mb-4 opacity-20" />
                      <p className="px-10">Kayıtları görüntülemek için takvimden bir gün seçin.</p>
                  </div>
              ) : selectedData.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
                      <XCircle size={48} className="mb-4 opacity-20" />
                      <p>Bu tarihte kayıtlı bir {viewMode === 'ORDERS' ? 'transfer/sipariş' : 'satış'} bulunamadı.</p>
                  </div>
              ) : viewMode === 'ORDERS' ? (
                  // ORDERS VIEW
                  (selectedData as Order[]).map(order => (
                      <div key={order.id} className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden animate-fade-in shadow-sm">
                          <div className="p-3 border-b border-slate-700 flex justify-between items-center bg-slate-900/50">
                              <span className="text-xs font-mono text-slate-500">
                                  {new Date(order.timestamp).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}
                              </span>
                              {order.status === 'COMPLETED' 
                                ? <span className="flex items-center gap-1 text-[10px] font-bold bg-green-900/30 text-green-400 px-2 py-0.5 rounded border border-green-900/50"><CheckCircle size={10}/> ONAYLANDI</span>
                                : order.status === 'CANCELLED'
                                ? <span className="flex items-center gap-1 text-[10px] font-bold bg-red-900/30 text-red-400 px-2 py-0.5 rounded border border-red-900/50"><XCircle size={10}/> İPTAL</span>
                                : <span className="flex items-center gap-1 text-[10px] font-bold bg-red-900/30 text-red-400 px-2 py-0.5 rounded border border-red-900/50"><Clock size={10}/> BEKLİYOR</span>
                              }
                          </div>
                          <div className="p-3">
                              <div className="flex items-center gap-2 mb-3">
                                  <div className="w-8 h-8 rounded-full bg-brand-900/50 flex items-center justify-center text-brand-400 font-bold text-xs border border-brand-500/20">
                                      {order.requestedBy.substring(0,2).toUpperCase()}
                                  </div>
                                  <div>
                                      <p className="text-sm font-medium text-white">{order.requestedBy}</p>
                                      <p className="text-[10px] text-slate-500">ID: #{order.id.substring(0,6)}</p>
                                  </div>
                              </div>
                              <div className="space-y-2 bg-slate-950/50 p-2 rounded-lg border border-slate-800">
                                  {order.items.map((item, idx) => {
                                      const prod = products.find(p => p.id === item.productId);
                                      const showStrike = order.status === 'CANCELLED' || item.status === 'REJECTED';
                                      return (
                                          <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-800/50 last:border-0 pb-1 last:pb-0">
                                              <span className={`flex items-center gap-2 ${showStrike ? 'text-red-400 line-through' : 'text-slate-300'}`}>
                                                  <Package size={12} className="text-slate-600 shrink-0" />
                                                  {prod?.name || 'Bilinmeyen'}
                                              </span>
                                              <span className={`font-mono font-bold ${showStrike ? 'text-red-500 line-through' : 'text-white'}`}>{item.quantity} ad.</span>
                                          </div>
                                      );
                                  })}
                              </div>
                          </div>
                      </div>
                  ))
              ) : (
                  // SALES VIEW
                  <div className="space-y-3">
                      {(selectedData as Transaction[]).map(tx => {
                          const prod = products.find(p => p.id === tx.productId);
                          return (
                              <div key={tx.id} className="bg-slate-900 border border-slate-700 rounded-xl p-3 flex items-center justify-between hover:bg-slate-850 transition-colors shadow-sm animate-fade-in">
                                  <div className="flex items-center gap-3">
                                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 overflow-hidden">
                                          {prod?.image ? <img src={prod.image} className="w-full h-full object-cover" /> : <Beer className="text-green-500" size={18} />}
                                      </div>
                                      <div>
                                          <p className="text-sm font-bold text-white">{prod?.name || 'Bilinmeyen'}</p>
                                          <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                              <Clock size={10} /> {new Date(tx.timestamp).toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})} • 
                                              <span className="text-green-400 font-medium">{tx.note?.split('(')[1]?.replace(')', '') || 'Barmen'}</span>
                                          </p>
                                      </div>
                                  </div>
                                  <div className="text-right">
                                      <p className="text-sm font-bold text-white">{tx.quantity} Adet</p>
                                      <p className="text-[10px] font-mono text-green-400">{StorageService.formatCurrency(tx.totalValue)}</p>
                                  </div>
                              </div>
                          );
                      })}
                      
                      <div className="mt-6 p-4 bg-green-900/20 border border-green-500/30 rounded-xl">
                          <p className="text-xs text-green-500 font-bold uppercase tracking-wider mb-1">GÜNLÜK TOPLAM CİRO</p>
                          <p className="text-3xl font-mono font-bold text-white">
                              {StorageService.formatCurrency((selectedData as Transaction[]).reduce((acc, tx) => acc + tx.totalValue, 0))}
                          </p>
                      </div>
                  </div>
              )}
          </div>
      </div>
    </div>
  );
};
