import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { TransactionType } from '../types';
import { TrendingUp, ShoppingCart, Wallet } from 'lucide-react';

interface ForecastData {
    productId: string;
    productName: string;
    category: string;
    image: string;
    costPrice: number;
    salePrice: number;
    marginPercent: number;
    currentStock: number; // ONLY STORE STOCK
    totalSoldLast30Days: number;
    dailyVelocity: number;
    daysRemaining: number;
    suggestionToBuy: number; // Amount needed for target period
}

export const ForecastView: React.FC = () => {
    const [forecasts, setForecasts] = useState<ForecastData[]>([]);
    const [targetMonths, setTargetMonths] = useState(3); // Default target: 3 months stock
    const [loading, setLoading] = useState(true);
    
    // State to track manual overrides: { productId: quantity }
    // If a key exists (even 0), it overrides the suggestion. If undefined, use suggestion.
    const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({});

    useEffect(() => {
        calculateForecasts();
    }, [targetMonths]);

    const calculateForecasts = () => {
        setLoading(true);
        const products = StorageService.getProducts();
        const inventory = StorageService.getInventory();
        const transactions = StorageService.getTransactions();

        // Filter last 30 days sales
        // STRICTLY BAR SALES (TransactionType.SALE)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recentSales = transactions.filter(t => 
            t.type === TransactionType.SALE && t.timestamp > thirtyDaysAgo
        );

        const data: ForecastData[] = products.map(p => {
            // 1. Calculate Stock - ONLY STORE STOCK as requested
            const storeQty = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
            // Bar stock is ignored for purchasing decisions per user request
            
            const currentStock = storeQty;

            // 2. Calculate Velocity (Sales Demand based on BAR SALES)
            const totalSold = recentSales
                .filter(t => t.productId === p.id)
                .reduce((acc, curr) => acc + curr.quantity, 0);
            
            const dailyVelocity = totalSold / 30; // Average per day based on 30-day window

            // 3. Calculate Days Remaining (Based on Store Stock only)
            // If velocity is 0, days remaining is Infinity (9999 for sorting)
            const daysRemaining = dailyVelocity > 0 ? Math.floor(currentStock / dailyVelocity) : 9999;

            // 4. Calculate Purchasing Suggestion
            // Target Stock = Velocity * (Target Months * 30 Days)
            // Needed = Target - Current (Store Only)
            const targetStock = dailyVelocity * (targetMonths * 30);
            const suggestion = Math.max(0, Math.ceil(targetStock - currentStock));

            // 5. Margin
            const margin = p.salePrice > 0 
                ? ((p.salePrice - p.costPrice) / p.salePrice) * 100 
                : 0;

            return {
                productId: p.id,
                productName: p.name,
                category: p.category,
                image: p.image,
                costPrice: p.costPrice,
                salePrice: p.salePrice,
                marginPercent: margin,
                currentStock: currentStock,
                totalSoldLast30Days: totalSold,
                dailyVelocity,
                daysRemaining,
                suggestionToBuy: suggestion
            };
        });

        // Sort by Critical Status (Low days remaining first)
        setForecasts(data.sort((a, b) => a.daysRemaining - b.daysRemaining));
        setLoading(false);
    };

    const handleManualChange = (productId: string, value: string) => {
        const num = parseInt(value);
        setManualOverrides(prev => {
            const next = { ...prev };
            if (value === '') {
                delete next[productId]; // Remove override if empty, fallback to suggestion
            } else {
                next[productId] = isNaN(num) ? 0 : num;
            }
            return next;
        });
    };

    // Calculate Totals based on Override logic
    const calculateTotals = () => {
        const categoryTotals: Record<string, number> = {};
        let grandTotal = 0;

        forecasts.forEach(item => {
            // Logic: Use Manual Override if defined, otherwise use Suggestion
            const finalQty = manualOverrides[item.productId] !== undefined 
                ? manualOverrides[item.productId] 
                : item.suggestionToBuy;
            
            if (finalQty > 0) {
                const cost = finalQty * item.costPrice;
                categoryTotals[item.category] = (categoryTotals[item.category] || 0) + cost;
                grandTotal += cost;
            }
        });

        return { categoryTotals, grandTotal };
    };

    const { categoryTotals, grandTotal } = calculateTotals();

    if (loading) return <div className="p-10 text-center text-slate-400">Veriler analiz ediliyor...</div>;

    return (
        <div className="flex flex-col flex-1 h-full min-h-[600px] relative">
            <div className="flex-1 overflow-y-auto pb-48 custom-scrollbar"> {/* Added padding bottom for fixed footer */}
                <div className="space-y-6 animate-fade-in">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                                <TrendingUp className="text-purple-500" />
                                Stok Planlama & Alım Simülasyonu
                            </h2>
                            <p className="text-slate-400 mt-1">
                                Satış hızı <strong>Bar Satış Verilerine</strong> göre, stok ömrü <strong>Depo Stoğuna</strong> göre hesaplanır.
                            </p>
                        </div>
                        
                        <div className="bg-slate-800 p-2 rounded-lg border border-slate-700 flex items-center gap-3">
                            <span className="text-sm font-medium text-slate-300 pl-2">Hedeflenen Stok Süresi:</span>
                            <select 
                                value={targetMonths} 
                                onChange={(e) => setTargetMonths(Number(e.target.value))}
                                className="bg-slate-900 text-white border border-slate-600 rounded px-3 py-1 text-sm outline-none focus:border-purple-500"
                            >
                                <option value="1">1 Ay</option>
                                <option value="2">2 Ay</option>
                                <option value="3">3 Ay</option>
                                <option value="6">6 Ay</option>
                                <option value="12">1 Yıl</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10">
                                    <tr>
                                        <th className="p-4">Ürün</th>
                                        <th className="p-4 text-center">Birim Maliyet</th>
                                        <th className="p-4 text-center bg-green-900/10 border-l border-r border-slate-800">30 Günlük<br/>Bar Satışı</th>
                                        <th className="p-4 text-center bg-blue-900/10 border-l border-r border-slate-800">Mevcut Stok<br/><span className="text-[9px] opacity-70">(Sadece Depo)</span></th>
                                        <th className="p-4 text-center">Stok Ömrü<br/><span className="text-[9px] opacity-70">(Gün)</span></th>
                                        <th className="p-4 text-center bg-purple-900/10 border-l border-r border-slate-800 font-bold text-purple-400">Önerilen Alım</th>
                                        <th className="p-4 text-center bg-slate-700/50 text-white">Manuel Adet</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700">
                                    {forecasts.map(item => (
                                        <tr key={item.productId} className="hover:bg-slate-700/50 transition-colors">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-slate-700 overflow-hidden border border-slate-600 shrink-0">
                                                        <img src={item.image} alt="" className="w-full h-full object-cover" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white text-sm">{item.productName}</p>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">{item.category}</span>
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${item.marginPercent > 50 ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                                %{item.marginPercent.toFixed(0)} Marj
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-center font-mono text-slate-300 text-sm">
                                                {StorageService.formatCurrency(item.costPrice)}
                                            </td>
                                            <td className="p-4 text-center font-mono text-green-400 font-bold bg-green-900/5 border-l border-r border-slate-700/50">
                                                {item.totalSoldLast30Days}
                                            </td>
                                            <td className="p-4 text-center font-mono text-blue-300 font-bold bg-blue-900/5 border-l border-r border-slate-700/50">
                                                {item.currentStock}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    item.daysRemaining < 15 ? 'bg-red-500 text-white' : 
                                                    item.daysRemaining < 30 ? 'bg-amber-500 text-slate-900' : 
                                                    'bg-slate-700 text-slate-300'
                                                }`}>
                                                    {item.daysRemaining > 365 ? '> 1 Yıl' : `${item.daysRemaining} Gün`}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center bg-purple-900/5 border-l border-r border-slate-700/50">
                                                {item.suggestionToBuy > 0 ? (
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-lg font-bold text-purple-400">{item.suggestionToBuy}</span>
                                                        <span className="text-[10px] text-slate-500">
                                                            (~{StorageService.formatCurrency(item.suggestionToBuy * item.costPrice)})
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-600 text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center bg-slate-700/20">
                                                <input 
                                                    type="number" 
                                                    min="0"
                                                    placeholder={item.suggestionToBuy > 0 ? item.suggestionToBuy.toString() : "0"}
                                                    value={manualOverrides[item.productId] !== undefined ? manualOverrides[item.productId] : ''}
                                                    onChange={(e) => handleManualChange(item.productId, e.target.value)}
                                                    className="w-20 bg-slate-900 border border-slate-600 rounded p-1 text-center text-white focus:border-purple-500 outline-none font-bold"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sticky Footer Summary Panel */}
            <div className="absolute bottom-0 left-0 w-full bg-slate-900 border-t border-slate-700 p-6 shadow-2xl z-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-600 rounded-lg shadow-lg shadow-purple-900/20">
                            <ShoppingCart size={24} className="text-white" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-400">Tahmini Fatura Tutarı</p>
                            <h3 className="text-2xl font-bold text-white tracking-tight">
                                {StorageService.formatCurrency(grandTotal)}
                            </h3>
                        </div>
                    </div>

                    <div className="flex-1 w-full md:w-auto overflow-x-auto">
                        <div className="flex gap-4">
                            {Object.entries(categoryTotals).map(([cat, total]) => (
                                <div key={cat} className="bg-slate-800 rounded px-3 py-2 border border-slate-700 min-w-[120px]">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold">{cat}</p>
                                    <p className="text-sm font-mono text-slate-200">{StorageService.formatCurrency(total)}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <button className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg shadow-green-900/20 flex items-center gap-2 transition-transform active:scale-95 whitespace-nowrap">
                        <Wallet size={18} />
                        Satın Alma Listesi Oluştur
                    </button>
                </div>
            </div>
        </div>
    );
};