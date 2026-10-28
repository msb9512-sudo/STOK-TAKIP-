
import React, { useState, useEffect } from 'react';
import type { User } from './types';
import { Role } from './types';
import { StorageService } from './services/storageService';
import { Sidebar } from './components/Sidebar';
import { ManagerView } from './views/ManagerView';
import { StoreOwnerView } from './views/StoreOwnerView';
import { StoreDashboardView } from './views/StoreDashboardView';
import { BartenderView } from './views/BartenderView';
import { TransactionHistoryView } from './views/TransactionHistoryView';
import { ForecastView } from './views/ForecastView';
import { GoodsReceiptView } from './views/GoodsReceiptView';
import { UserManagementView } from './views/UserManagementView';
import { StockCountView } from './views/StockCountView';
import { ApiKeyModal } from './components/ApiKeyModal';
import { User as UserIcon, Lock, LogIn, AlertCircle, ShieldCheck, HelpCircle, CheckCircle, X, Menu, Fingerprint, Cloud, CloudOff, ServerCrash, RefreshCcw } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<string>('dashboard');

  const [isSystemLoading, setIsSystemLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyModalReason, setApiKeyModalReason] = useState<string | undefined>(undefined);

  const [authMode, setAuthMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>(Role.BARTENDER);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [systemHasUsers, setSystemHasUsers] = useState(false);

  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<1 | 2>(1);
  const [recoveryFeedback, setRecoveryFeedback] = useState<{msg: string, type: 'error' | 'success'} | null>(null);
  const [recoveredUsername, setRecoveredUsername] = useState<string | null>(null);

  const [isCloudActive, setIsCloudActive] = useState(false);

  useEffect(() => {
    const handleOpenApiKey = (e: any) => {
      setApiKeyModalReason(e.detail?.reason);
      setIsApiKeyModalOpen(true);
    };
    window.addEventListener('barstock-open-apikey-modal', handleOpenApiKey);
    return () => window.removeEventListener('barstock-open-apikey-modal', handleOpenApiKey);
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
        setIsSystemLoading(true);
        setConnectionError(null);
        
        try {
            await StorageService.init();
            const users = StorageService.getUsers();
            setSystemHasUsers(users.length > 0);
            
            if (users.length === 0) {
                setAuthMode('REGISTER');
                setSelectedRole(Role.MANAGER);
            } else {
                setAuthMode('LOGIN');
            }

            const user = await StorageService.restoreSession();
            if (user) {
                const exists = users.find(u => u.username === user.username);
                if (exists) {
                    setCurrentUser(user);
                    if (user.role === Role.BARTENDER) setCurrentView('pos');
                    else if (user.role === Role.STORE_OWNER) setCurrentView('store-dashboard');
                    else setCurrentView('dashboard');
                } else {
                    StorageService.logoutUser();
                }
            }
        } catch (err: any) {
            setConnectionError(err.message || "Sunucu hatası.");
        } finally {
            setIsSystemLoading(false);
        }
    };

    initializeApp();

    const checkCloud = () => setIsCloudActive(StorageService.isCloudActive());
    checkCloud();
    window.addEventListener('barstock-storage-update', checkCloud);
    return () => window.removeEventListener('barstock-storage-update', checkCloud);
  }, []);

  // Ensure restricted views like 'stock-count' are not accessible by Bartender or Manager (Mağaza Sahibi)
  useEffect(() => {
    if (currentUser) {
      if (currentView === 'stock-count' && currentUser.role !== Role.STORE_OWNER) {
        if (currentUser.role === Role.BARTENDER) setCurrentView('pos');
        else if (currentUser.role === Role.MANAGER) setCurrentView('dashboard');
      }
    }
  }, [currentUser, currentView]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
        const user = await StorageService.loginUser(username, password);
        setCurrentUser(user);
        if (user.role === Role.BARTENDER) setCurrentView('pos');
        else if (user.role === Role.STORE_OWNER) setCurrentView('store-dashboard');
        else setCurrentView('dashboard');
    } catch (err: any) {
        setAuthError(err.message);
    } finally {
        setAuthLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
        if (!username || !password) throw new Error("Eksik alan!");
        const roleToAssign = !systemHasUsers ? Role.MANAGER : selectedRole;
        const newUser: User = { username, password, role: roleToAssign };
        await StorageService.registerUser(newUser);
        setSuccessMsg("Kayıt başarılı.");
        setSystemHasUsers(true);
        setAuthMode('LOGIN');
        setPassword('');
    } catch (err: any) {
        setAuthError(err.message);
    } finally {
        setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    StorageService.logoutUser();
    setCurrentUser(null);
    setIsMobileMenuOpen(false);
  };

  const handleVerifyRecoveryKey = (e: React.FormEvent) => {
      e.preventDefault();
      if(StorageService.verifyMasterKey(recoveryKey)) {
          const admin = StorageService.getUsers().find(u => u.role === Role.MANAGER);
          setRecoveredUsername(admin?.username || "Yönetici");
          setRecoveryStep(2);
      } else {
          setRecoveryFeedback({ msg: "Hatalı anahtar.", type: 'error' });
      }
  };

  const handleResetAdminPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          await StorageService.resetAdminPassword(newAdminPassword);
          setRecoveryFeedback({ msg: "Şifre güncellendi.", type: 'success' });
          setTimeout(() => setShowRecoveryModal(false), 2000);
      } catch (err: any) {
          setRecoveryFeedback({ msg: err.message, type: 'error' });
      }
  };

  if (isSystemLoading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
              <div className="text-center animate-pulse"><Cloud size={48} className="mx-auto text-brand-500 mb-4" /><h2 className="text-xl font-bold">Sistem Yükleniyor...</h2></div>
          </div>
      );
  }

  if (connectionError) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
              <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6"><ServerCrash size={32} className="text-red-500" /></div>
                  <h2 className="text-2xl font-bold text-white mb-2">Bağlantı Hatası</h2>
                  <p className="text-slate-400 mb-6 text-sm">{connectionError}</p>
                  <button onClick={() => window.location.reload()} className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"><RefreshCcw size={18} /> Tekrar Dene</button>
              </div>
          </div>
      );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 relative overflow-hidden">
        {showRecoveryModal && (
            <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl overflow-hidden animate-scale-in">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                        <h3 className="font-bold text-white flex items-center gap-2"><ShieldCheck size={18} className="text-purple-500"/> Kurtarma</h3>
                        <button onClick={() => setShowRecoveryModal(false)} className="text-slate-500 hover:text-white"><X size={20} /></button>
                    </div>
                    <div className="p-6">
                        {recoveryStep === 1 ? (
                            <form onSubmit={handleVerifyRecoveryKey} className="space-y-4">
                                <p className="text-sm text-slate-400">Kurtarma Anahtarı (Master Key) giriniz.</p>
                                <input type="password" value={recoveryKey} onChange={e => setRecoveryKey(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-center font-mono" placeholder="••••" autoFocus />
                                <button type="submit" className="w-full bg-purple-600 text-white py-2 rounded font-bold">Doğrula</button>
                            </form>
                        ) : (
                            <form onSubmit={handleResetAdminPassword} className="space-y-4">
                                <p className="text-xs text-purple-300">Admin: <strong>{recoveredUsername}</strong></p>
                                <input type="text" value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white" placeholder="Yeni şifre" autoFocus />
                                <button type="submit" className="w-full bg-green-600 text-white py-2 rounded font-bold">Güncelle</button>
                            </form>
                        )}
                        {recoveryFeedback && <div className={`mt-4 p-2 text-center text-xs rounded ${recoveryFeedback.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>{recoveryFeedback.msg}</div>}
                    </div>
                </div>
            </div>
        )}
        <div className="relative z-10 w-full max-w-md p-6 animate-fade-in">
            <div className="text-center mb-8"><h1 className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-purple-400 mb-2">BarStock Pro</h1></div>
            <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">
                {authError && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{authError}</div>}
                <form onSubmit={authMode === 'LOGIN' ? handleLogin : handleRegister} className="space-y-4">
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-4 text-white outline-none" placeholder="Kullanıcı Adı" />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg py-2.5 px-4 text-white outline-none" placeholder="Şifre" />
                    <button type="submit" className="w-full bg-brand-600 text-white font-bold py-3 rounded-lg shadow-lg">{authMode === 'LOGIN' ? 'Giriş Yap' : 'Kayıt Ol'}</button>
                </form>
                {systemHasUsers && authMode === 'LOGIN' && (
                    <button onClick={() => setShowRecoveryModal(true)} className="mt-6 w-full text-xs text-slate-500 hover:text-purple-400">Yönetici Erişimini Kurtar</button>
                )}
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen h-[100dvh] bg-slate-950 text-slate-100 overflow-hidden font-sans">
        {/* Sidebar z-index set to 50 */}
        <Sidebar currentRole={currentUser.role} username={currentUser.username} onLogout={handleLogout} onViewChange={setCurrentView} currentView={currentView} isMobileOpen={isMobileMenuOpen} onMobileClose={() => setIsMobileMenuOpen(false)} />
        
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
            {/* MOBILE HEADER - Fixed layout and z-index */}
            <header className="md:hidden h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 shrink-0 z-40">
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors">
                        <Menu size={24} />
                    </button>
                </div>
                
                <div className="flex flex-col items-center">
                    <span className="font-black text-sm tracking-[0.2em] text-white">BARSTOCK PRO</span>
                    <span className="text-[9px] text-brand-500 font-bold uppercase">{currentView === 'pos' ? 'Satış Noktası' : 'Yönetim'}</span>
                </div>

                <div className={`p-2 rounded-lg border ${isCloudActive ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                    {isCloudActive ? <Cloud size={20} /> : <CloudOff size={20} />}
                </div>
            </header>
            
            {/* MAIN CONTENT - Removed z-0 to allow internal modals to be above sidebar */}
            <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-950 scroll-smooth relative">
                {currentView === 'dashboard' && <ManagerView />}
                {currentView === 'store-dashboard' && <StoreDashboardView />}
                {currentView === 'inventory-store' && <StoreOwnerView />}
                {currentView === 'transactions' && <TransactionHistoryView />}
                {currentView === 'pos' && <BartenderView />}
                {currentView === 'inventory-bar' && <StoreOwnerView isReadOnly={true} />}
                {currentView === 'forecast' && <ForecastView />}
                {currentView === 'stock-count' && currentUser.role === Role.STORE_OWNER && <StockCountView />}
                {currentView === 'goods-receipt' && <GoodsReceiptView />}
                {currentView === 'users' && <UserManagementView />}
            </main>
        </div>

        <ApiKeyModal
            isOpen={isApiKeyModalOpen}
            onClose={() => setIsApiKeyModalOpen(false)}
            reason={apiKeyModalReason}
        />
    </div>
  );
};
