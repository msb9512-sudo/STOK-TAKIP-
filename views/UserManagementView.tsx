import React, { useState, useEffect } from 'react';
import { StorageService } from '../services/storageService';
import { Role, User } from '../types';
import { Users, Shield, Store, Beer, Key, Trash2, ShieldCheck, X } from 'lucide-react';

export const UserManagementView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUser, setNewUser] = useState<{ username: string; password: string; role: Role }>({ username: '', password: '', role: Role.BARTENDER });
  const [userFeedback, setUserFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  // Password Reset State
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');

  // Master Key Update State
  const [showMasterKeyInput, setShowMasterKeyInput] = useState(false);
  const [newMasterKey, setNewMasterKey] = useState('');

  useEffect(() => {
    setUsers(StorageService.getUsers());
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newUser.username || !newUser.password) {
          setUserFeedback({ msg: "Kullanıcı adı ve şifre zorunludur.", type: 'error' });
          return;
      }
      
      try {
          await StorageService.registerUser(newUser);
          setUsers(StorageService.getUsers());
          setUserFeedback({ msg: "Personel başarıyla oluşturuldu.", type: 'success' });
          setNewUser({ username: '', password: '', role: Role.BARTENDER }); // Reset
          setTimeout(() => setUserFeedback(null), 3000);
      } catch (err: any) {
          setUserFeedback({ msg: err.message, type: 'error' });
      }
  };

  const handleDeleteUser = async (username: string) => {
      if (!confirm(`${username} kullanıcısını silmek istediğinize emin misiniz?`)) return;
      
      try {
          await StorageService.deleteUser(username);
          setUsers(StorageService.getUsers());
      } catch (e) {
          console.error(e);
      }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resetTargetUser || !resetNewPassword) return;

      try {
          await StorageService.updateUser(resetTargetUser.username, { password: resetNewPassword });
          setUserFeedback({ msg: `${resetTargetUser.username} şifresi güncellendi.`, type: 'success' });
          setResetTargetUser(null);
          setResetNewPassword('');
          setUsers(StorageService.getUsers());
          setTimeout(() => setUserFeedback(null), 3000);
      } catch (err: any) {
          setUserFeedback({ msg: "Hata: " + err.message, type: 'error' });
      }
  };

  const handleUpdateMasterKey = (e: React.FormEvent) => {
      e.preventDefault();
      if(newMasterKey.length < 4) {
          setUserFeedback({ msg: "Kurtarma anahtarı en az 4 karakter olmalı.", type: 'error' });
          return;
      }
      StorageService.updateMasterKey(newMasterKey);
      setUserFeedback({ msg: "Ana Kurtarma Anahtarı başarıyla değiştirildi.", type: 'success' });
      setNewMasterKey('');
      setShowMasterKeyInput(false);
      setTimeout(() => setUserFeedback(null), 3000);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10 min-h-full">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2">
              <Users className="text-blue-500" />
              Personel Yönetimi
          </h2>
          <p className="text-slate-400 mt-1">Sistem kullanıcılarını ekleyin, yetkilendirin veya şifrelerini yönetin.</p>
        </div>

        <div className="bg-slate-900 border border-slate-700 rounded-xl w-full shadow-2xl flex flex-col md:flex-row overflow-hidden min-h-[500px]">
            
            {/* LEFT: User List */}
            <div className="flex-1 border-r border-slate-800 flex flex-col">
                <div className="p-4 border-b border-slate-800 bg-slate-800/50">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        Mevcut Personel
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {users.map(u => (
                        <div key={u.username} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                                    u.role === Role.MANAGER ? 'bg-purple-500/10 border-purple-500/50 text-purple-400' :
                                    u.role === Role.STORE_OWNER ? 'bg-blue-500/10 border-blue-500/50 text-blue-400' :
                                    'bg-amber-500/10 border-amber-500/50 text-amber-400'
                                }`}>
                                    {u.role === Role.MANAGER ? <Shield size={18} /> : u.role === Role.STORE_OWNER ? <Store size={18} /> : <Beer size={18} />}
                                </div>
                                <div>
                                    <p className="font-bold text-white">{u.username}</p>
                                    <p className="text-xs text-slate-500">{u.role}</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                                <button 
                                onClick={() => setResetTargetUser(u)}
                                className="text-slate-400 hover:text-white p-2 rounded hover:bg-slate-700 transition-colors"
                                title="Şifre Sıfırla"
                                >
                                    <Key size={16} />
                                </button>
                                
                                {u.role !== Role.MANAGER && (
                                    <button 
                                    onClick={() => handleDeleteUser(u.username)}
                                    className="text-slate-500 hover:text-red-500 p-2 rounded hover:bg-slate-700 transition-colors"
                                    title="Sil"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Master Key Update Section */}
                <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                    {!showMasterKeyInput ? (
                        <button 
                        onClick={() => setShowMasterKeyInput(true)}
                        className="w-full py-2 bg-slate-800 border border-slate-700 text-slate-400 rounded-lg text-xs font-bold hover:bg-slate-700 hover:text-white flex items-center justify-center gap-2"
                        >
                            <ShieldCheck size={14} /> Ana Kurtarma Anahtarını Değiştir
                        </button>
                    ) : (
                        <form onSubmit={handleUpdateMasterKey} className="flex gap-2">
                            <input 
                            type="text" 
                            value={newMasterKey}
                            onChange={e => setNewMasterKey(e.target.value)}
                            placeholder="Yeni Anahtar"
                            className="flex-1 bg-slate-950 border border-slate-700 rounded text-xs px-2 py-2 text-white outline-none focus:border-purple-500"
                            />
                            <button type="submit" className="bg-purple-600 px-3 rounded text-white text-xs font-bold hover:bg-purple-500">
                                Kaydet
                            </button>
                            <button type="button" onClick={() => setShowMasterKeyInput(false)} className="px-2 text-slate-500 hover:text-white">
                                <X size={14} />
                            </button>
                        </form>
                    )}
                </div>
            </div>

            {/* RIGHT: Add New User / Reset Password Form */}
            <div className="w-full md:w-96 bg-slate-800 p-6 flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-white">
                        {resetTargetUser ? 'Şifre Sıfırla' : 'Yeni Personel Ekle'}
                    </h3>
                    {resetTargetUser && (
                        <button onClick={() => setResetTargetUser(null)} className="text-xs text-slate-400 hover:text-white bg-slate-700 px-2 py-1 rounded">
                            İptal
                        </button>
                    )}
                </div>

                {resetTargetUser ? (
                        <form onSubmit={handleResetPassword} className="space-y-4 animate-fade-in">
                            <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg text-sm text-blue-200 mb-4">
                                <strong>{resetTargetUser.username}</strong> kullanıcısı için yeni şifre belirliyorsunuz.
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Yeni Şifre</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-2.5 text-slate-500" size={16} />
                                    <input 
                                        type="text" 
                                        value={resetNewPassword}
                                        onChange={e => setResetNewPassword(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded py-2 pl-10 pr-4 text-white text-sm focus:border-blue-500 outline-none"
                                        placeholder="Yeni şifre giriniz"
                                    />
                                </div>
                            </div>
                            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-bold mt-2">
                                Şifreyi Güncelle
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleCreateUser} className="space-y-4 animate-fade-in">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Kullanıcı Adı</label>
                                <input 
                                    type="text" 
                                    value={newUser.username}
                                    onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-white text-sm focus:border-brand-500 outline-none"
                                    placeholder="kullaniciadi"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Şifre</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-2.5 text-slate-500" size={16} />
                                    <input 
                                        type="text" 
                                        value={newUser.password}
                                        onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-700 rounded py-2 pl-10 pr-4 text-white text-sm focus:border-brand-500 outline-none"
                                        placeholder="••••"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Rol / Yetki</label>
                                <div className="flex gap-2 bg-slate-950 p-1 rounded border border-slate-700">
                                    <button 
                                    type="button"
                                    onClick={() => setNewUser({ ...newUser, role: Role.BARTENDER })}
                                    className={`flex-1 py-1.5 text-xs rounded font-medium transition-colors ${newUser.role === Role.BARTENDER ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        Barmen
                                    </button>
                                    <button 
                                    type="button"
                                    onClick={() => setNewUser({ ...newUser, role: Role.STORE_OWNER })}
                                    className={`flex-1 py-1.5 text-xs rounded font-medium transition-colors ${newUser.role === Role.STORE_OWNER ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                    >
                                        Depocu
                                    </button>
                                </div>
                            </div>

                            <button type="submit" className="w-full bg-brand-600 hover:bg-brand-500 text-white py-2 rounded font-bold mt-2 shadow-lg shadow-brand-900/20">
                                Personeli Ekle
                            </button>
                        </form>
                    )}
                    
                    {userFeedback && (
                        <div className={`mt-4 p-3 rounded text-xs text-center ${userFeedback.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {userFeedback.msg}
                        </div>
                    )}
            </div>
        </div>
    </div>
  );
};