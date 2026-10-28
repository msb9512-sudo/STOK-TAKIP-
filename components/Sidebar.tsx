import React, { useRef, useState, useEffect } from 'react';
import { Role } from '../types';
import { LayoutDashboard, ShoppingBag, Beer, LogOut, Package, RefreshCcw, TrendingUp, Truck, ArrowRightLeft, Download, Settings, ChevronUp, ChevronDown, FileText, FileUp, FileDown, AlertOctagon, X, Users, Cloud, Server, Database, ClipboardCheck, Key } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface SidebarProps {
  currentRole: Role;
  username?: string;
  onLogout: () => void;
  onViewChange: (view: string) => void;
  currentView: string;
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentRole, username, onLogout, onViewChange, currentView, isMobileOpen, onMobileClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isCloudActive, setIsCloudActive] = useState(StorageService.isCloudActive());

  useEffect(() => {
    const checkCloud = () => setIsCloudActive(StorageService.isCloudActive());
    window.addEventListener('barstock-storage-update', checkCloud);
    return () => window.removeEventListener('barstock-storage-update', checkCloud);
  }, []);
  
  const getNavItems = () => {
    switch (currentRole) {
      case Role.MANAGER:
        return [
          { id: 'dashboard', label: 'Genel Bakış', icon: LayoutDashboard },
          { id: 'inventory-store', label: 'Depo Görünümü', icon: Package },
          { id: 'forecast', label: 'Stok Planlama', icon: TrendingUp },
        ];
      case Role.STORE_OWNER:
        return [
          { id: 'store-dashboard', label: 'Genel Durum', icon: LayoutDashboard },
          { id: 'inventory-store', label: 'Depo Yönetimi', icon: Package },
          { id: 'transactions', label: 'Transfer Kayıtları', icon: ArrowRightLeft },
          { id: 'goods-receipt', label: 'Mal Kabul', icon: Truck },
          { id: 'forecast', label: 'Stok Planlama & Alım', icon: TrendingUp },
          { id: 'stock-count', label: 'Sayım', icon: ClipboardCheck },
        ];
      case Role.BARTENDER:
        return [
          { id: 'pos', label: 'Satış Noktası', icon: Beer },
          { id: 'inventory-bar', label: 'Bar Envanteri', icon: ShoppingBag },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();

  const roleLabels: Record<Role, string> = {
    [Role.MANAGER]: 'Mağaza Sahibi',
    [Role.STORE_OWNER]: 'Depo Sorumlusu',
    [Role.BARTENDER]: 'Barmen'
  };

  const isManager = currentRole === Role.MANAGER;
  const isStoreOwner = currentRole === Role.STORE_OWNER;
  const canSeeSettings = isManager || isStoreOwner;

  const handleResetConfirm = () => {
      StorageService.hardReset();
      setShowResetModal(false);
  };

  const handleDownloadBackup = () => {
      const data = StorageService.createBackup();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.download = `barstock-pro-yedek-${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExportCSV = () => {
      const csvContent = StorageService.exportToCSV();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.download = `barstock-envanter-${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleDownloadTemplate = () => {
      const csvContent = StorageService.getImportTemplate();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `urun-yukleme-sablonu.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          const csvText = event.target?.result as string;
          try {
              const result = await StorageService.importFromCSV(csvText);
              alert(`İşlem Başarılı!\n\n${result.created} yeni ürün eklendi.\n${result.updated} mevcut ürün güncellendi.`);
          } catch (err: any) {
              alert("Hata: " + err.message);
          }
      };
      // CRITICAL FIX: Use ISO-8859-9 (Turkish) encoding instead of default UTF-8
      // This fixes the issue where Excel CSVs show '?' for Turkish characters
      reader.readAsText(file, 'ISO-8859-9');
      
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleViewClick = (id: string) => {
      onViewChange(id);
      onMobileClose();
  };

  return (
    <>
    {/* SYSTEM RESET MODAL */}
    {showResetModal && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl animate-scale-in">
                  <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                          <AlertOctagon size={32} className="text-red-500" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Veritabanı Sıfırlama</h3>
                      <p className="text-slate-400 mb-6 text-sm">
                          {isCloudActive 
                              ? "Sunucu tabanlı sistemlerde sıfırlama işlemi hosting panelinden yapılmalıdır." 
                              : "Bu işlem yerel tarayıcı verilerinizi temizleyecektir. Onaylıyor musunuz?"}
                      </p>
                      <div className="flex gap-3 justify-center">
                          <button onClick={() => setShowResetModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-medium">İptal</button>
                          {!isCloudActive && (
                              <button onClick={handleResetConfirm} className="px-4 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-500">Sıfırla</button>
                          )}
                          {isCloudActive && (
                              <button onClick={() => setShowResetModal(false)} className="px-4 py-2 rounded-lg bg-slate-700 text-white font-medium">Tamam</button>
                          )}
                      </div>
                  </div>
              </div>
          </div>
    )}

    {/* MOBILE BACKDROP */}
    {isMobileOpen && <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden animate-fade-in" onClick={onMobileClose}></div>}

    {/* SIDEBAR */}
    <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:h-screen ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="p-6 border-b border-slate-800 shrink-0 flex justify-between items-start">
        <div>
            <h1 className="text-2xl font-bold text-brand-500 tracking-tight">BarStock Pro</h1>
            <div className="mt-2">
                {username && <p className="text-white font-medium truncate max-w-[150px]">{username}</p>}
                <div className="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                    {roleLabels[currentRole]}
                </div>
            </div>
        </div>
        <button onClick={onMobileClose} className="md:hidden text-slate-400 hover:text-white"><X size={24} /></button>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleViewClick(item.id)}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 cursor-pointer ${
              currentView === item.id ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/50 font-semibold' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={20} />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-2 shrink-0 bg-slate-900">
        {canSeeSettings && (
            <div className="mb-2">
                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors text-sm font-medium ${isSettingsOpen ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                    <div className="flex items-center space-x-3"><Settings size={20} /><span>Ayarlar</span></div>
                    {isSettingsOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>

                {isSettingsOpen && (
                    <div className="mt-2 ml-4 space-y-1 border-l border-slate-700 pl-2 animate-fade-in">
                        {isManager && (
                            <>
                                <button onClick={() => handleViewClick('users')} className="w-full flex items-center space-x-3 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs"><Users size={14} /><span>Personel Yönetimi</span></button>
                                <button onClick={() => setShowResetModal(true)} className="w-full flex items-center space-x-3 px-4 py-2 text-red-500 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-colors text-xs"><RefreshCcw size={14} /><span>Sistemi Sıfırla</span></button>
                            </>
                        )}

                        {isStoreOwner && (
                            <>
                                <button onClick={handleDownloadBackup} className="w-full flex items-center space-x-3 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs"><Download size={14} /><span>Yedekle (JSON)</span></button>
                                <button onClick={handleExportCSV} className="w-full flex items-center space-x-3 px-4 py-2 text-green-400 hover:text-green-300 hover:bg-green-900/20 rounded-lg transition-colors text-xs"><FileText size={14} /><span>Stok Listesi (Excel)</span></button>
                                <div className="border-t border-slate-700 my-1 pt-1">
                                    <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center space-x-3 px-4 py-2 text-purple-400 hover:text-purple-300 hover:bg-purple-900/20 rounded-lg transition-colors text-xs"><FileUp size={14} /><span>Toplu Ürün Yükle</span></button>
                                    <button onClick={handleDownloadTemplate} className="w-full flex items-center space-x-3 px-4 py-2 text-slate-500 hover:text-slate-400 hover:bg-slate-800 rounded-lg transition-colors text-[10px]"><FileDown size={12} /><span>Örnek Şablon İndir</span></button>
                                </div>
                            </>
                        )}
                        <div className="border-t border-slate-700 my-1 pt-1">
                            <button 
                                onClick={() => window.dispatchEvent(new CustomEvent('barstock-open-apikey-modal'))} 
                                className="w-full flex items-center space-x-3 px-4 py-2 text-amber-400 hover:text-amber-300 hover:bg-amber-950/20 rounded-lg transition-colors text-xs"
                            >
                                <Key size={14} />
                                <span>Gemini API Anahtarı</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )}
        <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv" className="hidden" />
        <div className="h-px bg-slate-800 my-2"></div>
        <button onClick={onLogout} className="w-full flex items-center space-x-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm font-medium"><LogOut size={20} /><span>Çıkış Yap</span></button>
      </div>
    </div>
    </>
  );
};