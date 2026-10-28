import React, { useState, useEffect } from 'react';
import { Key, Eye, EyeOff, Check, X, ExternalLink, ShieldCheck } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
  onSaved?: (key: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  reason,
  onSaved,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(StorageService.getCustomApiKey());
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = apiKey.trim();
    StorageService.saveCustomApiKey(trimmed);
    setSavedSuccess(true);
    if (onSaved) onSaved(trimmed);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleClear = () => {
    StorageService.saveCustomApiKey('');
    setApiKey('');
    if (onSaved) onSaved('');
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
              <Key size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Gemini API Anahtarı</h3>
              <p className="text-xs text-slate-400">cPanel ve Statik Barındırma Modu</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {reason && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300 leading-relaxed">
              <strong>Statik Hosting Uyarısı:</strong> Siteniz cPanel / statik hosting üzerinde çalıştığından, {reason} işlemini gerçekleştirmek için Gemini API anahtarınızı giriniz.
            </div>
          )}

          <p className="text-xs text-slate-300 leading-relaxed">
            API anahtarınız yalnızca kendi tarayıcınızın yerel hafızasında (<code className="text-brand-400">localStorage</code>) saklanır ve doğrudan Google Gemini servisine iletilir.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Google Gemini API Anahtarı (API Key)
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3.5 py-2.5 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-brand-400 hover:text-brand-300 transition-colors font-medium"
            >
              <span>Ücretsiz API Anahtarı Al</span>
              <ExternalLink size={13} />
            </a>

            {apiKey && (
              <button
                type="button"
                onClick={handleClear}
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                Anahtarı Temizle
              </button>
            )}
          </div>

          <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-lg flex items-start gap-2.5 text-xs text-slate-400">
            <ShieldCheck size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Google AI Studio üzerinden alacağınız API anahtarı ücretsiz kullanım limitine sahiptir ve kredi kartı gerektirmez.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-500 rounded-lg transition-colors shadow-lg shadow-brand-900/40 inline-flex items-center gap-1.5"
          >
            {savedSuccess ? (
              <>
                <Check size={14} className="text-white" />
                <span>Kaydedildi</span>
              </>
            ) : (
              <span>Kaydet</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
