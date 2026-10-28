
import React, { useEffect, useState } from 'react';
import { StorageService } from '../services/storageService';
import { GeminiService } from '../services/geminiService';
import type { Transaction } from '../types';
import { TransactionType } from '../types';
import { KPICard } from '../components/KPICard';
import { DollarSign, Package, TrendingUp, AlertCircle, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const ManagerView: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState(StorageService.getInventory());
  const [products, setProducts] = useState(StorageService.getProducts());
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [loadingAi, setLoadingAi] = useState(false);
  
  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = () => {
    setTransactions(StorageService.getTransactions());
    setInventory(StorageService.getInventory());
    setProducts(StorageService.getProducts());
  };

  const totalRevenue = transactions
    .filter(t => t.type === TransactionType.SALE)
    .reduce((acc, curr) => acc + curr.totalValue, 0);

  const totalPurchases = transactions
    .filter(t => t.type === TransactionType.PURCHASE)
    .reduce((acc, curr) => acc + curr.totalValue, 0);

  // Group by product for chart
  const salesByProduct = products.map(p => {
    const sold = transactions
      .filter(t => t.type === TransactionType.SALE && t.productId === p.id)
      .reduce((acc, curr) => acc + curr.quantity, 0);
    return { name: p.name, sold };
  });

  const handleAiAnalysis = async () => {
    setLoadingAi(true);
    const analysis = await GeminiService.analyzeBusiness();
    setAiAnalysis(analysis || "Analiz oluşturulamadı.");
    setLoadingAi(false);
  };

  return (
    <div className="space-y-6 animate-fade-in relative pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Yönetici Paneli</h2>
          <p className="text-slate-400 mt-1">İşletme performansı ve analizler.</p>
        </div>
        <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3">
             <button 
              onClick={handleAiAnalysis}
              disabled={loadingAi}
              className="flex items-center justify-center space-x-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-purple-900/20 active:scale-95 disabled:opacity-70"
            >
              <Sparkles size={18} />
              <span>{loadingAi ? 'Analiz Yapılıyor...' : 'AI Analizi Başlat'}</span>
            </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Toplam Satış Geliri" 
          value={StorageService.formatCurrency(totalRevenue)} 
          icon={DollarSign} 
          colorClass="text-green-500" 
        />
        <KPICard 
          title="Toplam Alım Maliyeti" 
          value={StorageService.formatCurrency(totalPurchases)} 
          icon={TrendingUp} 
          colorClass="text-blue-500" 
        />
        <KPICard 
          title="Net Kar Tahmini" 
          value={StorageService.formatCurrency(totalRevenue - totalPurchases)} 
          icon={Package} 
          colorClass="text-purple-500" 
        />
        <KPICard 
          title="Kritik Stok (Bar)" 
          value={inventory.bar.filter(i => i.quantity < 10).length.toString()} 
          subValue="Ürün kritik seviyede" 
          icon={AlertCircle} 
          colorClass="text-red-500" 
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Sales Chart */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
          <h3 className="text-lg font-bold text-white mb-6">En Çok Satan Ürünler</h3>
          <div className="h-64 md:h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByProduct.sort((a,b) => b.sold - a.sold).slice(0, 5)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                  itemStyle={{ color: '#f1f5f9' }}
                  cursor={{ fill: '#334155', opacity: 0.4 }}
                />
                <Bar dataKey="sold" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Analysis */}
        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg flex flex-col min-h-[400px]">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Sparkles className="text-purple-400" size={20} />
            Yapay Zeka Analizi
          </h3>
          <div className="flex-1 bg-slate-900/50 rounded-lg p-4 border border-slate-700 overflow-y-auto custom-scrollbar">
            {aiAnalysis ? (
              <div className="prose prose-invert prose-sm max-w-none">
                <p className="whitespace-pre-line leading-relaxed text-slate-300">{aiAnalysis}</p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <Sparkles size={48} className="mb-4 opacity-20" />
                <p className="text-center text-sm">
                  Henüz analiz yapılmadı.<br/>
                  Güncel verileri yorumlamak için "AI Analizi Başlat" butonuna basın.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
