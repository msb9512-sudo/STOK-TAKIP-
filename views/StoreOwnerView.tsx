
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StorageService } from '../services/storageService';
import type { Product, InventoryState, Order, User } from '../types';
import { 
    PlusCircle, AlertTriangle, Package, CheckSquare, Check, XCircle, Bell, 
    RefreshCw, CheckCircle, Trash2, Settings, List, Edit, Save, 
    AlertOctagon, Upload, Image as ImageIcon, Filter, ChevronDown, ChevronUp,
    Wallet, TrendingUp, DollarSign, PieChart, ArrowUpRight,
    Eye, EyeOff, RotateCcw, X,
    ArrowUpDown, ArrowDownAZ, ArrowUpZA, Building2
} from 'lucide-react';

export type SortOption = 
  | 'DEFAULT'
  | 'COMPANY_ASC'
  | 'COMPANY_DESC'
  | 'NAME_ASC'
  | 'NAME_DESC'
  | 'PRICE_DESC'
  | 'PRICE_ASC';

interface StoreOwnerViewProps {
    isReadOnly?: boolean;
}

export const StoreOwnerView: React.FC<StoreOwnerViewProps> = ({ isReadOnly = false }) => {
  const [inventory, setInventory] = useState<InventoryState>(StorageService.getInventory());
  const [products, setProducts] = useState<Product[]>(StorageService.getProducts());
  const [categories, setCategories] = useState<string[]>(StorageService.getCategories());
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  // UI States
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('Tümü'); 
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  // Product Edit State
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState({ 
      name: '', 
      category: '', 
      costPrice: 0, 
      salePrice: 0, 
      image: '', 
      minStockLevel: 20,
      supplier: ''
  });
  const [showAddProductModal, setShowAddProductModal] = useState(false); 

  // Delete Confirmation States
  const [deleteTarget, setDeleteTarget] = useState<{id: string, name: string} | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<string | null>(null);

  // Drag and Drop State
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Order Processing State
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  // Hidden products state (Kullanılmayan/Gizlenen İçecekler)
  const [hiddenProductIds, setHiddenProductIds] = useState<string[]>(() => StorageService.getHiddenProductIds());
  const [showHiddenModal, setShowHiddenModal] = useState(false);

  // Sorting State (Firma Adı A-Z, Ürün Adı A-Z vb.)
  const [sortBy, setSortBy] = useState<SortOption>('DEFAULT');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);

  // Close menus on click outside
  useEffect(() => {
    const handleGlobalClick = () => {
      setIsSortMenuOpen(false);
      setIsFilterMenuOpen(false);
    };
    if (isSortMenuOpen || isFilterMenuOpen) {
      window.addEventListener('click', handleGlobalClick);
      return () => window.removeEventListener('click', handleGlobalClick);
    }
  }, [isSortMenuOpen, isFilterMenuOpen]);

  const refreshData = () => {
    setInventory(StorageService.getInventory());
    setProducts(StorageService.getProducts());
    setCategories(StorageService.getCategories());
    setOrders(StorageService.getOrders());
    setHiddenProductIds(StorageService.getHiddenProductIds());
  };

  useEffect(() => {
      refreshData();
      const session = StorageService.getCurrentSession();
      if(session) setCurrentUser(session);
      
      const handleStorageUpdate = () => {
          refreshData();
      };
      
      window.addEventListener('barstock-storage-update', handleStorageUpdate);
      
      // AUTO-POLLING: Sync with server every 5 seconds to check for new orders
      const intervalId = setInterval(() => {
          if (!isReadOnly) { // Only store owner needs to poll for orders
              StorageService.syncWithServer();
          }
      }, 5000);

      return () => {
          window.removeEventListener('barstock-storage-update', handleStorageUpdate);
          clearInterval(intervalId);
      }
  }, [isReadOnly]);

  const pendingOrders = orders.filter(o => o.status === 'PENDING');

  // Filter products based on selection & hide status
  const visibleProducts = products.filter(p => !hiddenProductIds.includes(p.id));
  const hiddenProducts = products.filter(p => hiddenProductIds.includes(p.id));

  const filteredProducts = selectedCategoryFilter === 'Tümü' 
      ? visibleProducts 
      : visibleProducts.filter(p => p.category === selectedCategoryFilter);

  // Helper to determine supplier/company name for any product
  const getProductSupplier = (product: Product): string => {
      if (product.supplier && product.supplier.trim()) {
          return product.supplier.trim();
      }
      // Check purchase history for this product
      const tx = StorageService.getTransactions().find(t => t.type === 'PURCHASE' && t.productId === product.id && t.supplier);
      if (tx && tx.supplier && tx.supplier.trim()) {
          return tx.supplier.trim();
      }
      // Infer known distributor/producer by brand name
      const lower = (product.name || '').toLowerCase();
      if (
          lower.includes('yeni rakı') || 
          lower.includes('tekirdağ') || 
          lower.includes('kulüp') || 
          lower.includes('altınbaş') || 
          lower.includes('cîroc') || 
          lower.includes('johnnie') || 
          lower.includes('smirnoff') || 
          lower.includes('baileys') || 
          lower.includes('gordon') || 
          lower.includes('tanqueray') || 
          lower.includes('don julio')
      ) {
          return 'Mey İçki (Diageo)';
      }
      if (lower.includes('beylerbeyi')) {
          return 'Beylerbeyi İçecek';
      }
      if (lower.includes('efe') || lower.includes('sarı zeybek') || lower.includes('çilingir') || lower.includes('kara efe')) {
          return 'Efe İçecek';
      }
      if (lower.includes('efes') || lower.includes('miller') || lower.includes('corona') || lower.includes('beck') || lower.includes('belfast') || lower.includes('bremen') || lower.includes('erdinger')) {
          return 'Anadolu Efes';
      }
      if (lower.includes('tuborg') || lower.includes('carlsberg') || lower.includes('kronenbourg') || lower.includes('guinness') || lower.includes('weihenstephan') || lower.includes('frederik') || lower.includes('skol')) {
          return 'Türk Tuborg';
      }
      if (lower.includes('chivas') || lower.includes('jameson') || lower.includes('ballantine') || lower.includes('absolut') || lower.includes('olmeca') || lower.includes('malibu') || lower.includes('havana') || lower.includes('beefeater')) {
          return 'Pernod Ricard';
      }
      if (lower.includes('jack daniel') || lower.includes('finlandia') || lower.includes('woodford')) {
          return 'Brown-Forman';
      }
      if (lower.includes('kavaklıdere') || lower.includes('yakut') || lower.includes('çankaya') || lower.includes('lal') || lower.includes('ancyra') || lower.includes('prestige')) {
          return 'Kavaklıdere Şarapları';
      }
      if (lower.includes('doluca') || lower.includes('dlc') || lower.includes('antik') || lower.includes('karma') || lower.includes('villa doluca') || lower.includes('sarafin')) {
          return 'Doluca Şarapçılık';
      }
      if (lower.includes('suvla')) return 'Suvla Şarapları';
      if (lower.includes('coca') || lower.includes('fanta') || lower.includes('sprite') || lower.includes('schweppes') || lower.includes('cappy') || lower.includes('damla') || lower.includes('fuse')) {
          return 'Coca-Cola İçecek';
      }
      if (lower.includes('pepsi') || lower.includes('yedigün') || lower.includes('7up') || lower.includes('lipton')) {
          return 'PepsiCo';
      }
      if (lower.includes('red bull')) return 'Red Bull Türkiye';

      return 'Diğer / Yerel Tedarikçi';
  };

  // Sort products based on selected option (Firma Adı A-Z, Ürün Adı A-Z vb.)
  const sortedProducts = useMemo(() => {
      const list = [...filteredProducts];
      switch (sortBy) {
          case 'COMPANY_ASC':
              return list.sort((a, b) => {
                  const suppA = getProductSupplier(a);
                  const suppB = getProductSupplier(b);
                  const comp = suppA.localeCompare(suppB, 'tr', { sensitivity: 'base' });
                  if (comp !== 0) return comp;
                  return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
              });
          case 'COMPANY_DESC':
              return list.sort((a, b) => {
                  const suppA = getProductSupplier(a);
                  const suppB = getProductSupplier(b);
                  const comp = suppB.localeCompare(suppA, 'tr', { sensitivity: 'base' });
                  if (comp !== 0) return comp;
                  return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
              });
          case 'NAME_ASC':
              return list.sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
          case 'NAME_DESC':
              return list.sort((a, b) => b.name.localeCompare(a.name, 'tr', { sensitivity: 'base' }));
          case 'PRICE_DESC':
              return list.sort((a, b) => b.costPrice - a.costPrice);
          case 'PRICE_ASC':
              return list.sort((a, b) => a.costPrice - b.costPrice);
          case 'DEFAULT':
          default:
              return list;
      }
  }, [filteredProducts, sortBy, products]);

  const handleHideProduct = (productId: string) => {
      StorageService.hideProduct(productId);
      setHiddenProductIds(StorageService.getHiddenProductIds());
  };

  const handleUnhideProduct = (productId: string) => {
      StorageService.unhideProduct(productId);
      setHiddenProductIds(StorageService.getHiddenProductIds());
  };

  const handleUnhideAll = () => {
      StorageService.unhideAllProducts();
      setHiddenProductIds([]);
      setShowHiddenModal(false);
  };

  // --- Financial Calculations ---
  // 1. Total Store Value (Cost Basis) - Money tied up in Warehouse
  const totalStoreValue = products.reduce((acc, p) => {
      const qty = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
      return acc + (qty * p.costPrice);
  }, 0);

  // 2. Total Bar Potential (Sale Basis) - Potential revenue from Bar Stock
  const totalBarPotential = products.reduce((acc, p) => {
      const qty = inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
      return acc + (qty * p.salePrice);
  }, 0);

  // 3. Projected Total Profit (If everything in Store + Bar is sold)
  const totalProjectedRevenue = products.reduce((acc, p) => {
      const totalQty = (inventory.store.find(i => i.productId === p.id)?.quantity || 0) + 
                       (inventory.bar.find(i => i.productId === p.id)?.quantity || 0);
      return acc + (totalQty * p.salePrice);
  }, 0);
  
  const totalProjectedCost = products.reduce((acc, p) => {
      const totalQty = (inventory.store.find(i => i.productId === p.id)?.quantity || 0) + 
                       (inventory.bar.find(i => i.productId === p.id)?.quantity || 0);
      return acc + (totalQty * p.costPrice);
  }, 0);

  const totalProjectedProfit = totalProjectedRevenue - totalProjectedCost;
  const averageMargin = totalProjectedRevenue > 0 ? ((totalProjectedProfit / totalProjectedRevenue) * 100) : 0;


  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, position: number) => {
      if (isReadOnly || selectedCategoryFilter !== 'Tümü') {
          if(selectedCategoryFilter !== 'Tümü') alert("Sıralama değiştirmek için lütfen 'Tümü' kategorisini seçiniz.");
          e.preventDefault();
          return;
      }
      dragItem.current = position;
  };

  const handleDragEnter = (_e: React.DragEvent<HTMLTableRowElement>, position: number) => {
      if (isReadOnly || selectedCategoryFilter !== 'Tümü') return;
      dragOverItem.current = position;
  };

  const handleDragEnd = () => {
      if (isReadOnly || selectedCategoryFilter !== 'Tümü') return;
      const copyListItems = [...products];
      if (dragItem.current !== null && dragOverItem.current !== null) {
          const dragItemContent = copyListItems[dragItem.current];
          copyListItems.splice(dragItem.current, 1);
          copyListItems.splice(dragOverItem.current, 0, dragItemContent);
          dragItem.current = null;
          dragOverItem.current = null;
          setProducts(copyListItems);
          StorageService.saveProducts(copyListItems);
      }
  };

  // --- Category Management ---
  const handleAddCategory = () => {
      if (newCategoryName.trim()) {
          StorageService.addCategory(newCategoryName.trim());
          setNewCategoryName('');
          refreshData();
      }
  };

  const confirmDeleteCategory = () => {
      if (deleteCategoryTarget) {
          StorageService.deleteCategory(deleteCategoryTarget);
          setDeleteCategoryTarget(null);
          refreshData();
      }
  };

  const handleCategoryChange = (productId: string, newCat: string) => {
      StorageService.updateProductCategory(productId, newCat);
      refreshData();
  };

  // --- Product Management ---
  const initiateDeleteProduct = (productId: string, productName: string) => {
      setDeleteTarget({ id: productId, name: productName });
  };

  const confirmDeleteProduct = () => {
      if (deleteTarget) {
          StorageService.deleteProduct(deleteTarget.id);
          setDeleteTarget(null);
          refreshData();
      }
  };

  const handleStartEdit = (product: Product) => {
      setEditingProduct(product);
      setEditForm({
          name: product.name,
          category: product.category,
          costPrice: product.costPrice,
          salePrice: product.salePrice,
          image: product.image,
          minStockLevel: product.minStockLevel || 20,
          supplier: product.supplier || getProductSupplier(product)
      });
  };

  const handleAddProduct = () => {
      if (!editForm.name || editForm.costPrice < 0) return;
      
      StorageService.createNewProduct(
          editForm.name, 
          editForm.costPrice, 
          editForm.salePrice, 
          editForm.category || 'Genel'
      );
      
      const newProds = StorageService.getProducts();
      const created = newProds[newProds.length - 1];
      StorageService.updateProduct(created.id, {
          image: editForm.image || created.image,
          minStockLevel: editForm.minStockLevel,
          supplier: editForm.supplier.trim() || undefined
      });

      setShowAddProductModal(false);
      setEditForm({ name: '', category: '', costPrice: 0, salePrice: 0, image: '', minStockLevel: 20, supplier: '' });
      refreshData();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              setEditForm(prev => ({ ...prev, image: reader.result as string }));
          };
          reader.readAsDataURL(file);
      }
  };

  const handleSaveEdit = () => {
      if (!editingProduct) return;
      
      StorageService.updateProduct(editingProduct.id, {
          name: editForm.name,
          category: editForm.category,
          costPrice: editForm.costPrice,
          salePrice: editForm.salePrice,
          image: editForm.image,
          minStockLevel: editForm.minStockLevel,
          supplier: editForm.supplier.trim() || undefined
      });
      
      setEditingProduct(null);
      refreshData();
  };

  // --- Order Management ---
  const handleOpenPendingOrder = () => {
      // Open the first pending order if exists
      const firstPending = pendingOrders[0];
      if (firstPending) {
          setActiveOrder(firstPending);
          setCheckedItems({});
      }
  };

  const toggleItemCheck = (productId: string) => {
      setCheckedItems(prev => ({
          ...prev,
          [productId]: !prev[productId]
      }));
  };

  const handleRejectOrder = async () => {
      if (!activeOrder) return;
      if (!confirm("Bu sipariş talebini iptal etmek istediğinize emin misiniz?")) return;

      try {
          await StorageService.rejectOrder(activeOrder.id);
          setActiveOrder(null);
          refreshData();
          setFeedback({ msg: `Sipariş iptal edildi.`, type: 'success' });
          setTimeout(() => setFeedback(null), 3000);
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleApproveOrder = async () => {
      if (!activeOrder) return;

      const approvedIds = Object.keys(checkedItems).filter(id => checkedItems[id]);
      
      if (approvedIds.length === 0) {
          alert("Lütfen transfer etmek istediğiniz ürünleri işaretleyin.");
          return;
      }

      const approverName = currentUser?.username || 'Yönetici';

      try {
          await StorageService.approveOrder(activeOrder.id, approvedIds, approverName);
          setActiveOrder(null);
          setCheckedItems({});
          refreshData();
          setFeedback({ msg: `Seçilen ürünler stoktan düşüldü ve bara transfer edildi.`, type: 'success' });
          setTimeout(() => setFeedback(null), 3000);
      } catch (error: any) {
          alert("Hata: " + error.message);
      }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-full mx-auto relative pb-10">
      
      {/* PRODUCT DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl animate-scale-in">
                  <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                          <AlertOctagon size={32} className="text-red-500" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Silme Onayı</h3>
                      <p className="text-slate-400 mb-6">
                          <span className="text-white font-bold">{deleteTarget.name}</span> adlı ürünü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                      </p>
                      
                      <div className="flex gap-3 justify-center">
                          <button 
                            onClick={() => setDeleteTarget(null)}
                            className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 font-medium"
                          >
                            İptal
                          </button>
                          <button 
                            onClick={confirmDeleteProduct}
                            className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-red-900/20"
                          >
                             <Trash2 size={18} /> Evet, Sil
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* CATEGORY DELETE CONFIRMATION MODAL */}
      {deleteCategoryTarget && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm shadow-2xl animate-scale-in">
                  <div className="p-6 text-center">
                      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                          <AlertOctagon size={32} className="text-red-500" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Kategori Silme Onayı</h3>
                      <p className="text-slate-400 mb-6">
                          <span className="text-white font-bold text-lg block my-2">"{deleteCategoryTarget}"</span> 
                          kategorisini silmek istediğinize emin misiniz?
                          <br/><br/>
                          <span className="text-amber-400 text-sm bg-amber-900/20 p-2 rounded block">
                             Bu kategoriye ait ürünler "Genel" kategorisine taşınacaktır.
                          </span>
                      </p>
                      
                      <div className="flex gap-3 justify-center">
                          <button 
                            onClick={() => setDeleteCategoryTarget(null)}
                            className="px-4 py-2 rounded-lg text-slate-400 hover:bg-slate-800 font-medium"
                          >
                            İptal
                          </button>
                          <button 
                            onClick={confirmDeleteCategory}
                            className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-red-900/20"
                          >
                             <Trash2 size={18} /> Evet, Sil
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Category Manager Modal */}
      {showCategoryModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md shadow-2xl animate-scale-in">
                  <div className="p-4 border-b border-slate-700 flex justify-between items-center">
                      <h3 className="font-bold text-white flex items-center gap-2"><Settings size={18}/> Kategori Yönetimi</h3>
                      <button onClick={() => setShowCategoryModal(false)}><XCircle className="text-slate-400 hover:text-white" /></button>
                  </div>
                  <div className="p-4">
                      <div className="flex gap-2 mb-4">
                          <input 
                            type="text" 
                            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-brand-500"
                            placeholder="Yeni Kategori Adı"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                          />
                          <button 
                            onClick={handleAddCategory}
                            className="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded font-medium"
                          >Ekle</button>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                          {categories.map(cat => (
                              <div key={cat} className="flex justify-between items-center p-2 bg-slate-800/50 rounded border border-slate-700">
                                  <span>{cat}</span>
                                  {cat !== 'Genel' && (
                                      <button onClick={() => setDeleteCategoryTarget(cat)} className="text-red-400 hover:text-red-300 p-1">
                                          <Trash2 size={16} />
                                      </button>
                                  )}
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Product Edit / Add Modal */}
      {(editingProduct || showAddProductModal) && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl animate-scale-in overflow-hidden">
                  <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                      <h3 className="font-bold text-white flex items-center gap-2">
                          <Edit size={18}/> {showAddProductModal ? 'Yeni Ürün Ekle' : 'Ürün Düzenle'}
                      </h3>
                      <button onClick={() => { setEditingProduct(null); setShowAddProductModal(false); }}><XCircle className="text-slate-400 hover:text-white" /></button>
                  </div>
                  
                  <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                      {/* Image Upload Section */}
                      <div className="flex gap-4 items-center">
                          <div className="w-20 h-20 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 relative group">
                                {editForm.image ? (
                                    <img src={editForm.image} alt="Preview" className="w-full h-full object-cover" />
                                ) : (
                                    <ImageIcon className="text-slate-500" />
                                )}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                    <p className="text-[10px] text-white">Değiştir</p>
                                </div>
                          </div>
                          <div className="flex-1 space-y-2">
                                <label className="block text-sm text-slate-400">Ürün Görseli</label>
                                <div className="flex gap-2">
                                    <label className="flex-1 cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded px-3 py-2 flex items-center gap-2 text-sm text-slate-300 transition-colors">
                                        <Upload size={14} />
                                        Dosya Seç
                                        <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                    </label>
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="veya resim URL'si yapıştırın..."
                                    value={editForm.image}
                                    onChange={e => setEditForm({...editForm, image: e.target.value})}
                                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1 text-xs text-white focus:border-brand-500 outline-none"
                                />
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm text-slate-400 mb-1">Ürün Adı</label>
                          <input 
                              type="text" 
                              value={editForm.name}
                              onChange={e => setEditForm({...editForm, name: e.target.value})}
                              className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-brand-500 outline-none"
                          />
                      </div>
                      <div>
                          <label className="block text-sm text-slate-400 mb-1">Kategori</label>
                          <select 
                              value={editForm.category}
                              onChange={e => setEditForm({...editForm, category: e.target.value})}
                              className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-brand-500 outline-none"
                          >
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm text-slate-400 mb-1 flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                  <Building2 size={14} className="text-amber-400" />
                                  <span>Tedarikçi / Dağıtıcı Firma</span>
                              </span>
                              <span className="text-[11px] text-slate-500 font-normal">Sıralama ve fatura eşleşmesi için</span>
                          </label>
                          <input 
                              type="text" 
                              placeholder="Örn: Mey İçki, Türk Tuborg, Anadolu Efes, Efe İçecek..."
                              value={editForm.supplier}
                              onChange={e => setEditForm({...editForm, supplier: e.target.value})}
                              className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-brand-500 outline-none placeholder:text-slate-500"
                          />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm text-slate-400 mb-1">Alış Fiyatı (₺)</label>
                              <input 
                                  type="number" 
                                  step="0.01"
                                  value={editForm.costPrice}
                                  onChange={e => setEditForm({...editForm, costPrice: parseFloat(e.target.value)})}
                                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-brand-500 outline-none"
                              />
                          </div>
                          <div>
                              <label className="block text-sm text-slate-400 mb-1">Satış Fiyatı (₺)</label>
                              <input 
                                  type="number" 
                                  step="0.01"
                                  value={editForm.salePrice}
                                  onChange={e => setEditForm({...editForm, salePrice: parseFloat(e.target.value)})}
                                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-white focus:border-brand-500 outline-none"
                              />
                          </div>
                      </div>
                      
                      <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg">
                          <label className="block text-sm font-bold text-red-400 mb-1 flex items-center gap-2">
                              <AlertTriangle size={14} /> Kritik Stok Uyarısı (Adet)
                          </label>
                          <input 
                              type="number" 
                              min="0"
                              value={editForm.minStockLevel}
                              onChange={e => setEditForm({...editForm, minStockLevel: parseInt(e.target.value)})}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-red-500 outline-none"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Depo stoğu bu sayının altına düşerse uyarı verir.</p>
                      </div>
                  </div>
                  
                  <div className="p-4 border-t border-slate-700 bg-slate-800 flex justify-end gap-3">
                        <button 
                        onClick={() => { setEditingProduct(null); setShowAddProductModal(false); }}
                        className="px-4 py-2 rounded text-slate-400 hover:bg-slate-700"
                        >İptal</button>
                        <button 
                        onClick={showAddProductModal ? handleAddProduct : handleSaveEdit}
                        className="bg-brand-600 hover:bg-brand-500 text-white px-6 py-2 rounded font-bold flex items-center gap-2"
                        >
                            <Save size={16}/> {showAddProductModal ? 'Ürünü Oluştur' : 'Kaydet'}
                        </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- Active Order Modal --- */}
      {activeOrder && !isReadOnly && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-600 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
                  <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800">
                      <div>
                          <h3 className="text-xl font-bold text-white flex items-center gap-2">
                              <Package className="text-brand-500" />
                              Sipariş Detayı
                          </h3>
                          <p className="text-sm text-slate-400 mt-1">
                              Talep Eden: <span className="text-white font-medium">{activeOrder.requestedBy}</span>
                          </p>
                      </div>
                      <button onClick={() => setActiveOrder(null)} className="text-slate-400 hover:text-white transition-colors bg-slate-700 px-3 py-1 rounded">
                          Kapat
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-4 overflow-y-auto">
                      {activeOrder.status === 'COMPLETED' ? (
                          <div className="bg-green-500/20 text-green-400 p-4 rounded-lg flex items-center gap-2 border border-green-500/30">
                              <CheckSquare size={20} />
                              Bu sipariş daha önce onaylandı. Ürünler transfer edildi.
                          </div>
                      ) : activeOrder.status === 'CANCELLED' ? (
                          <div className="bg-red-500/20 text-red-400 p-4 rounded-lg flex items-center gap-2 border border-red-500/30">
                              <XCircle size={20} />
                              Bu sipariş iptal edildi.
                          </div>
                      ) : (
                          <div className="bg-amber-500/10 text-amber-300 text-sm p-4 rounded-lg border border-amber-500/20 flex items-start gap-3">
                              <AlertTriangle className="shrink-0 mt-0.5" size={18} />
                              <div>
                                  <p className="font-bold mb-1">ONAY AŞAMASI</p>
                                  <p>Ürünleri kutuya/teslimata hazırladıktan sonra aşağıdan işaretleyiniz. <br/>İşaretlemediğiniz ürünler stoktan düşmez.</p>
                              </div>
                          </div>
                      )}

                      <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                          {activeOrder.items.map((item, idx) => {
                              const prod = products.find(p => p.id === item.productId);
                              const stock = inventory.store.find(i => i.productId === item.productId)?.quantity || 0;
                              
                              const isChecked = activeOrder.status === 'COMPLETED' 
                                  ? item.status === 'APPROVED' 
                                  : (checkedItems[item.productId] || false);

                              const isRejected = activeOrder.status === 'COMPLETED' 
                                  ? item.status === 'REJECTED' 
                                  : (activeOrder.status === 'PENDING' && !isChecked);
                              
                              const hasStock = stock >= item.quantity;

                              return (
                                  <div 
                                    key={idx} 
                                    onClick={() => activeOrder.status === 'PENDING' && toggleItemCheck(item.productId)}
                                    className={`flex items-center justify-between p-4 border-b border-slate-800 last:border-0 cursor-pointer transition-colors ${isChecked ? 'bg-brand-900/30' : 'hover:bg-slate-900/50'}`}
                                  >
                                      <div className="flex items-center gap-4">
                                          <div className={`w-8 h-8 rounded border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-brand-500 border-brand-500' : 'border-slate-600'}`}>
                                              {isChecked && <Check size={18} className="text-white" />}
                                          </div>
                                          
                                          {prod?.image && (
                                              <div className="w-12 h-12 rounded bg-slate-800 overflow-hidden hidden sm:block">
                                                  <img src={prod.image} className="w-full h-full object-cover" alt="" />
                                              </div>
                                          )}
                                          
                                          <div>
                                              <p className={`font-medium text-sm sm:text-lg ${isRejected ? 'text-slate-500' : (isChecked ? 'text-brand-200' : 'text-slate-200')}`}>{prod?.name || 'Bilinmeyen Ürün'}</p>
                                              <p className="text-xs text-slate-500">{prod?.category}</p>
                                          </div>
                                      </div>

                                      <div className="text-right">
                                          <div className="flex flex-col items-end">
                                               <p className={`text-lg font-bold relative ${isRejected ? 'text-red-500 line-through decoration-red-500 decoration-2' : 'text-white'}`}>
                                                   {item.quantity} Adet
                                               </p>
                                               {isRejected && <span className="text-[10px] font-bold text-red-500">ONAYLANMADI</span>}
                                          </div>
                                          <p className={`text-xs ${hasStock ? 'text-green-500' : 'text-red-500'}`}>
                                              Depo Stoğu: {stock}
                                          </p>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>

                  {activeOrder.status === 'PENDING' && (
                      <div className="p-6 border-t border-slate-700 bg-slate-800 flex flex-col sm:flex-row justify-between gap-3">
                          <button 
                            onClick={handleRejectOrder}
                            className="px-4 py-3 rounded-lg text-red-400 hover:text-white hover:bg-red-900/30 flex items-center justify-center gap-2 transition-colors font-medium w-full sm:w-auto disabled:opacity-50"
                          >
                              <XCircle size={18} />
                              Siparişi İptal Et
                          </button>
                          
                          <button 
                                onClick={handleApproveOrder}
                                disabled={Object.keys(checkedItems).length === 0}
                                className={`flex-1 px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${
                                    Object.keys(checkedItems).length > 0 
                                    ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20 scale-105' 
                                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                }`}
                            >
                                <RefreshCw size={18} />
                                {Object.keys(checkedItems).length > 0 ? `${Object.keys(checkedItems).length} Ürünü Transfer Et` : 'Seçim Yapınız'}
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* HEADER WITH FINANCIAL & NOTIFICATION AREA */}
      {!isReadOnly && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white">Depo Yönetimi</h2>
                    <p className="text-slate-400 mt-2">Varlık dağılımı ve stok kontrolü.</p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <button 
                        onClick={() => {
                            setEditForm({ name: '', category: categories[0] || 'Genel', costPrice: 0, salePrice: 0, image: '', minStockLevel: 20 });
                            setShowAddProductModal(true);
                        }}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 px-4 py-2 rounded-lg text-sm text-white font-bold transition-colors shadow-lg shadow-brand-900/20"
                    >
                        <PlusCircle size={16} /> Yeni Ürün Ekle
                    </button>
                    <button onClick={refreshData} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm text-white transition-colors border border-slate-700">
                        <RefreshCw size={14} /> Yenile
                    </button>
                </div>
            </div>

            {/* --- NEW FINANCIAL ASSET OVERVIEW --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 relative overflow-hidden group hover:border-blue-500/50 transition-colors">
                    <div className="absolute top-0 right-0 p-3 opacity-5">
                        <Package size={64} />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                         <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                             <Package size={20} />
                         </div>
                         <span className="text-slate-400 font-medium text-sm">Depo Varlığı (Maliyet)</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">{StorageService.formatCurrency(totalStoreValue)}</h3>
                    <p className="text-xs text-slate-500 mt-1">Stoktaki ürünlerin alış değeri</p>
                </div>

                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 relative overflow-hidden group hover:border-green-500/50 transition-colors">
                    <div className="absolute top-0 right-0 p-3 opacity-5">
                        <Wallet size={64} />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                         <div className="p-2 bg-green-500/10 rounded-lg text-green-400">
                             <Wallet size={20} />
                         </div>
                         <span className="text-slate-400 font-medium text-sm">Bar Potansiyeli (Ciro)</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">{StorageService.formatCurrency(totalBarPotential)}</h3>
                    <p className="text-xs text-slate-500 mt-1">Satışa hazır ürünlerin değeri</p>
                </div>

                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 relative overflow-hidden group hover:border-purple-500/50 transition-colors">
                    <div className="absolute top-0 right-0 p-3 opacity-5">
                        <ArrowUpRight size={64} />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                         <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                             <TrendingUp size={20} />
                         </div>
                         <span className="text-slate-400 font-medium text-sm">Tahmini Toplam Kâr</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">{StorageService.formatCurrency(totalProjectedProfit)}</h3>
                    <p className="text-xs text-slate-500 mt-1">Tüm stok satıldığında (Brüt)</p>
                </div>

                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 relative overflow-hidden group hover:border-amber-500/50 transition-colors">
                    <div className="absolute top-0 right-0 p-3 opacity-5">
                        <PieChart size={64} />
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                         <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
                             <PieChart size={20} />
                         </div>
                         <span className="text-slate-400 font-medium text-sm">Ortalama Kâr Marjı</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white">%{averageMargin.toFixed(1)}</h3>
                    <p className="text-xs text-slate-500 mt-1">Mevcut envanter kârlılığı</p>
                </div>
            </div>

            {/* NOTIFICATION BANNER (Replaces Order List Widget) */}
            {pendingOrders.length > 0 ? (
                <div 
                    onClick={handleOpenPendingOrder}
                    className="bg-red-600 hover:bg-red-500 cursor-pointer text-white p-4 rounded-xl shadow-xl shadow-red-900/40 flex flex-col md:flex-row items-center justify-between animate-pulse transition-all border border-red-500 gap-4"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-2 bg-white/20 rounded-full">
                            <Bell size={24} className="animate-bounce" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg">ONAY BEKLEYEN {pendingOrders.length} YENİ SİPARİŞ VAR!</h3>
                            <p className="text-red-100 text-sm">Barmen stok talep etti. Onaylamak için tıklayın.</p>
                        </div>
                    </div>
                    <div className="bg-white text-red-600 px-6 py-2 rounded-lg font-bold shadow-sm w-full md:w-auto text-center">
                        İNCELE & ONAYLA
                    </div>
                </div>
            ) : null}
          </div>
      )}

      {/* --- MAIN GRID (FULL WIDTH) --- */}
      <div className="grid grid-cols-1 gap-8">
        
        {/* --- FULL INVENTORY TABLE --- */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-700 bg-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <Package size={20} className="text-blue-500"/> Genel Stok Listesi
                    <span className="text-xs text-slate-400 font-normal">({filteredProducts.length} aktif ürün)</span>
                </h3>
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Küçük Kutucuk: Gizlenen İçecekleri Gör */}
                    {!isReadOnly && (
                        <button
                            type="button"
                            onClick={() => setShowHiddenModal(true)}
                            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-bold transition-all border shadow-sm cursor-pointer ${
                                hiddenProductIds.length > 0
                                    ? 'bg-amber-950/50 text-amber-300 border-amber-500/60 hover:bg-amber-900/60 shadow-amber-950/40'
                                    : 'bg-slate-700/80 text-slate-300 border-slate-600 hover:text-white hover:bg-slate-700'
                            }`}
                            title="Kullanılmayan veya gizlenen içecekleri görüntüle ve ana menüye geri al"
                        >
                            <EyeOff size={14} className={hiddenProductIds.length > 0 ? "text-amber-400" : "text-slate-400"} />
                            <span>Gizlenen İçecekleri Gör</span>
                            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                                hiddenProductIds.length > 0 ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                            }`}>
                                {hiddenProductIds.length}
                            </span>
                        </button>
                    )}

                    {!isReadOnly && (
                        <button 
                            onClick={() => setShowCategoryModal(true)}
                            className="flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded text-slate-300 transition-colors"
                        >
                            <List size={14} /> Kategorileri Düzenle
                        </button>
                    )}
                    
                    {/* Filter Dropdown */}
                    <div className="relative inline-block text-left">
                        <button
                            onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
                            className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-slate-600"
                        >
                            <Filter size={14} className="text-brand-400"/>
                            <span>{selectedCategoryFilter}</span>
                            {isFilterMenuOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {isFilterMenuOpen && (
                            <div className="absolute right-0 mt-2 w-48 origin-top-right bg-slate-800 border border-slate-700 rounded-xl shadow-2xl animate-fade-in overflow-hidden z-20">
                                <div className="p-1 space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                                    <button
                                        onClick={() => { setSelectedCategoryFilter('Tümü'); setIsFilterMenuOpen(false); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${selectedCategoryFilter === 'Tümü' ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                                    >
                                        Tümü
                                        {selectedCategoryFilter === 'Tümü' && <Check size={14} />}
                                    </button>
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => { setSelectedCategoryFilter(cat); setIsFilterMenuOpen(false); }}
                                            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${selectedCategoryFilter === cat ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
                                        >
                                            {cat}
                                            {selectedCategoryFilter === cat && <Check size={14} />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Horizontal Scroll for Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left table-auto min-w-[800px]">
                    <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase tracking-wider select-none">
                        <tr>
                            {!isReadOnly && <th className="p-3 w-8"></th>}
                            <th className="p-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-300">Ürün Detayı</span>
                                        {/* Küçük kutucuk: Kaç ürün olduğunu gösterir */}
                                        <span 
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 whitespace-nowrap shadow-xs" 
                                            title="Listelenen aktif ürün sayısı"
                                        >
                                            <Package size={11} className="text-blue-400" />
                                            <span>{sortedProducts.length} Ürün</span>
                                        </span>
                                    </div>

                                    {/* Sırala Sekmesi / Butonu (Açılır Menü) */}
                                    <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            type="button"
                                            onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all border shadow-xs cursor-pointer ${
                                                sortBy !== 'DEFAULT'
                                                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
                                                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
                                            }`}
                                            title="Ürünleri firma adına veya alfabetik sıraya göre sırala"
                                        >
                                            <ArrowUpDown size={12} className={sortBy !== 'DEFAULT' ? 'text-amber-400' : 'text-slate-400'} />
                                            <span className="tracking-normal font-bold">
                                                {sortBy === 'DEFAULT' && 'Sırala'}
                                                {sortBy === 'COMPANY_ASC' && 'Firma (A-Z)'}
                                                {sortBy === 'COMPANY_DESC' && 'Firma (Z-A)'}
                                                {sortBy === 'NAME_ASC' && 'Ürün (A-Z)'}
                                                {sortBy === 'NAME_DESC' && 'Ürün (Z-A)'}
                                                {sortBy === 'PRICE_DESC' && 'Fiyat (Azalan)'}
                                                {sortBy === 'PRICE_ASC' && 'Fiyat (Artan)'}
                                            </span>
                                            <ChevronDown size={11} className={`transition-transform duration-200 ${isSortMenuOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {isSortMenuOpen && (
                                            <div 
                                                className="absolute left-0 mt-1.5 w-60 origin-top-left bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-30 p-1.5 space-y-1 normal-case tracking-normal animate-scale-in text-xs"
                                            >
                                                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex items-center justify-between">
                                                    <span>Sıralama Seçenekleri</span>
                                                    <span className="text-slate-500 font-normal">{sortedProducts.length} ürün</span>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => { setSortBy('COMPANY_ASC'); setIsSortMenuOpen(false); }}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between font-medium cursor-pointer transition-colors ${
                                                        sortBy === 'COMPANY_ASC'
                                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                                    }`}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Building2 size={13} className="text-amber-400" />
                                                        <span>Firma Adına Göre (A → Z)</span>
                                                    </span>
                                                    {sortBy === 'COMPANY_ASC' && <Check size={13} className="text-amber-400" />}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => { setSortBy('COMPANY_DESC'); setIsSortMenuOpen(false); }}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between font-medium cursor-pointer transition-colors ${
                                                        sortBy === 'COMPANY_DESC'
                                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                                    }`}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Building2 size={13} className="text-amber-400" />
                                                        <span>Firma Adına Göre (Z → A)</span>
                                                    </span>
                                                    {sortBy === 'COMPANY_DESC' && <Check size={13} className="text-amber-400" />}
                                                </button>

                                                <div className="border-t border-slate-800/80 my-1"></div>

                                                <button
                                                    type="button"
                                                    onClick={() => { setSortBy('NAME_ASC'); setIsSortMenuOpen(false); }}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between font-medium cursor-pointer transition-colors ${
                                                        sortBy === 'NAME_ASC'
                                                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                                    }`}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <ArrowDownAZ size={13} className="text-blue-400" />
                                                        <span>Ürün Adına Göre (A → Z)</span>
                                                    </span>
                                                    {sortBy === 'NAME_ASC' && <Check size={13} className="text-blue-400" />}
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => { setSortBy('NAME_DESC'); setIsSortMenuOpen(false); }}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between font-medium cursor-pointer transition-colors ${
                                                        sortBy === 'NAME_DESC'
                                                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                                    }`}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <ArrowUpZA size={13} className="text-blue-400" />
                                                        <span>Ürün Adına Göre (Z → A)</span>
                                                    </span>
                                                    {sortBy === 'NAME_DESC' && <Check size={13} className="text-blue-400" />}
                                                </button>

                                                <div className="border-t border-slate-800/80 my-1"></div>

                                                <button
                                                    type="button"
                                                    onClick={() => { setSortBy('DEFAULT'); setIsSortMenuOpen(false); }}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between font-medium cursor-pointer transition-colors ${
                                                        sortBy === 'DEFAULT'
                                                            ? 'bg-slate-800 text-white font-bold'
                                                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                                    }`}
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <RotateCcw size={13} className="text-slate-400" />
                                                        <span>Varsayılan Sıralama (Özel)</span>
                                                    </span>
                                                    {sortBy === 'DEFAULT' && <Check size={13} />}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </th>
                            <th className="p-3 text-center">Fiyatlar <span className="opacity-50">(Alış/Satış)</span></th>
                            <th className="p-3 text-center">Stok Dağılımı <span className="opacity-50">(Depo/Bar)</span></th>
                            <th className="p-3 text-center">Varlık Payı <span className="opacity-50 text-blue-400">(Yaratıcı Analiz)</span></th>
                            <th className="p-3 text-right">Toplam Değer</th>
                            {!isReadOnly && <th className="p-3 text-center">İşlem</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700 text-sm">
                        {sortedProducts.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-10 text-center text-slate-500">
                                    {selectedCategoryFilter === 'Tümü' 
                                        ? (isReadOnly ? 'Görüntülenecek stok yok.' : 'Henüz ürün eklenmemiş. "Yeni Ürün Ekle" butonu ile başlayın.')
                                        : 'Bu kategoride ürün bulunamadı.'}
                                </td>
                            </tr>
                        ) : (
                        sortedProducts.map((p, index) => {
                            const storeQty = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
                            const barQty = inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
                            const criticalLimit = p.minStockLevel || 20;
                            const isLow = storeQty < criticalLimit;
                            
                            const totalQty = storeQty + barQty;
                            const totalCostValue = totalQty * p.costPrice;
                            
                            // Calculate asset share percentage (avoid div by zero)
                            const assetShare = totalStoreValue > 0 ? (totalCostValue / totalStoreValue) * 100 : 0;

                            return (
                                <tr 
                                    key={p.id} 
                                    className={`hover:bg-slate-700/50 transition-colors group ${!isReadOnly && selectedCategoryFilter === 'Tümü' && sortBy === 'DEFAULT' ? 'cursor-move' : ''}`}
                                    draggable={!isReadOnly && selectedCategoryFilter === 'Tümü' && sortBy === 'DEFAULT'}
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragEnter={(e) => handleDragEnter(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => e.preventDefault()}
                                >
                                    {!isReadOnly && (
                                        <td className="p-3 text-slate-600 group-hover:text-slate-400 text-center">
                                            {selectedCategoryFilter === 'Tümü' && sortBy === 'DEFAULT' ? <div className="cursor-grab active:cursor-grabbing">⋮⋮</div> : <span className="w-3 block"></span>}
                                        </td>
                                    )}
                                    <td className="p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-md bg-slate-700 overflow-hidden border border-slate-600 group-hover:border-slate-500 relative shrink-0">
                                                <img src={p.image} alt="" className="w-full h-full object-cover opacity-90" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-white text-sm truncate">{p.name}</p>
                                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                    <select 
                                                        disabled={isReadOnly}
                                                        value={p.category}
                                                        onChange={(e) => handleCategoryChange(p.id, e.target.value)}
                                                        className="bg-transparent text-[10px] text-slate-400 border-none outline-none hover:text-white cursor-pointer p-0 m-0 w-24 truncate appearance-none"
                                                    >
                                                        {categories.map(c => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
                                                    </select>

                                                    {/* Firma Badge */}
                                                    <span 
                                                        className="text-[10px] text-amber-300 font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 truncate max-w-[140px]" 
                                                        title={`Tedarikçi / Dağıtıcı Firma: ${getProductSupplier(p)}`}
                                                    >
                                                        🏢 {getProductSupplier(p)}
                                                    </span>

                                                    {isLow && !isReadOnly && (
                                                        <div className="flex items-center gap-1 text-amber-500 bg-amber-900/20 px-1 rounded" title={`Kritik Stok: ${criticalLimit}`}>
                                                            <AlertTriangle size={10} className="animate-pulse shrink-0" />
                                                            <span className="text-[9px]">Stok Az</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    
                                    <td className="p-3 text-center font-mono text-xs">
                                        <div className="flex flex-col">
                                            <span className="text-red-300 opacity-80">{StorageService.formatCurrency(p.costPrice)}</span>
                                            <span className="text-green-400 font-bold">{StorageService.formatCurrency(p.salePrice)}</span>
                                        </div>
                                    </td>

                                    <td className="p-3 text-center">
                                         <div className="flex justify-center gap-2">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${storeQty === 0 ? 'bg-red-500/20 text-red-500' : 'bg-slate-700 text-slate-300'}`}>
                                                D: {storeQty}
                                            </span>
                                            <span className="px-2 py-1 rounded text-xs font-bold bg-blue-500/20 text-blue-300">
                                                B: {barQty}
                                            </span>
                                         </div>
                                    </td>

                                    {/* CREATIVE FEATURE: Asset Share Visualization */}
                                    <td className="p-3 align-middle">
                                        <div className="w-full max-w-[100px] mx-auto">
                                            <div className="flex justify-between text-[9px] text-slate-500 mb-0.5">
                                                <span>Pay</span>
                                                <span>%{assetShare.toFixed(1)}</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-slate-700 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-blue-500 rounded-full" 
                                                    style={{ width: `${Math.min(assetShare * 5, 100)}%` }} // Multiplied by 5 to make small shares visible visually
                                                ></div>
                                            </div>
                                        </div>
                                    </td>

                                    <td className="p-3 text-right font-mono text-xs font-bold text-slate-200">
                                        {StorageService.formatCurrency(totalCostValue)}
                                    </td>
                                    
                                    {!isReadOnly && (
                                        <td className="p-3 text-center">
                                            <div className="flex gap-1.5 justify-center items-center">
                                                <button 
                                                    onClick={() => handleHideProduct(p.id)}
                                                    className="text-slate-400 hover:text-amber-400 transition-colors p-1.5 rounded hover:bg-slate-700/80 cursor-pointer"
                                                    title="Bu ürünü depoda ve sayımda gizle"
                                                >
                                                    <EyeOff size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => handleStartEdit(p)}
                                                    className="text-slate-500 hover:text-blue-400 transition-colors p-1.5 rounded hover:bg-slate-800"
                                                    title="Ürünü Düzenle"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button 
                                                    onClick={() => initiateDeleteProduct(p.id, p.name)}
                                                    className="text-slate-500 hover:text-red-500 transition-colors p-1.5 rounded hover:bg-slate-800"
                                                    title="Ürünü Sil"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            );
                        })
                        )}
                    </tbody>
                </table>
            </div>
         </div>
      </div>

      {/* GİZLENEN İÇECEKLERİ GÖR MODALI */}
      {showHiddenModal && (
        <div className="fixed inset-0 z-[125] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <EyeOff size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Depoda Gizlenen İçecekler</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                      {hiddenProducts.length} adet
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Kullanılmayan ürünler hem Depo Yönetimi'nde hem de Sayım ekranında gizlenir. "Tekrar Aç" ile ana menüye aktarılır.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHiddenModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Items List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 custom-scrollbar">
              {hiddenProducts.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto mb-3 text-slate-500">
                    <Eye size={28} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-300">Gizlenmiş içecek bulunmuyor</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Kullanılmayan içecekleri tablodaki <strong>Göz (Gizle)</strong> simgesine basarak buraya alabilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80 text-xs text-slate-400">
                    <span>Gizlenen Ürünler ({hiddenProducts.length})</span>
                    <button
                      type="button"
                      onClick={handleUnhideAll}
                      className="px-3 py-1 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 font-semibold text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw size={12} />
                      <span>Tümünü Tekrar Aç</span>
                    </button>
                  </div>

                  {hiddenProducts.map(p => {
                    const storeQty = inventory.store.find(i => i.productId === p.id)?.quantity || 0;
                    const barQty = inventory.bar.find(i => i.productId === p.id)?.quantity || 0;
                    const totalQty = storeQty + barQty;

                    return (
                      <div
                        key={p.id}
                        className="bg-slate-950/70 border border-slate-800 hover:border-slate-700/80 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={p.image}
                            alt={p.name}
                            className="w-10 h-10 rounded-lg object-cover bg-slate-800 border border-slate-700 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                          <div className="min-w-0">
                            <h4 className="font-bold text-white text-xs sm:text-sm truncate">
                              {StorageService.normalizeText(p.name)}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-medium text-slate-300">
                                {StorageService.normalizeText(p.category)}
                              </span>
                              <span>•</span>
                              <span className="text-slate-400">
                                Depo: <strong className="text-slate-200">{storeQty}</strong>
                              </span>
                              <span>•</span>
                              <span className="text-amber-400">
                                Bar: <strong>{barQty}</strong>
                              </span>
                              <span>•</span>
                              <span className="text-slate-400">
                                Toplam: <strong className="text-white">{totalQty}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Unhide / Return to main list button */}
                        <button
                          type="button"
                          onClick={() => handleUnhideProduct(p.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-sm hover:scale-[1.02] active:scale-95 shrink-0"
                          title="Bu içeceği ana menüye/stok listesine geri al"
                        >
                          <Eye size={13} className="text-emerald-400" />
                          <span>Tekrar Aç</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {hiddenProducts.length} içecek şu an gizli durumda
              </span>
              <button
                type="button"
                onClick={() => setShowHiddenModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
