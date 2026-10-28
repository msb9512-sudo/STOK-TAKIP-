
export const Role = {
  MANAGER: 'MANAGER',
  STORE_OWNER: 'STORE_OWNER',
  BARTENDER: 'BARTENDER',
} as const;

export type Role = typeof Role[keyof typeof Role];

export const TransactionType = {
  PURCHASE: 'PURCHASE', // Store buys from supplier
  TRANSFER: 'TRANSFER', // Store moves to Bar
  SALE: 'SALE',         // Bar sells to customer
  COUNT_ADJUSTMENT: 'COUNT_ADJUSTMENT', // Sayım düzeltmesi
} as const;

export type TransactionType = typeof TransactionType[keyof typeof TransactionType];

export interface StockCountItem {
  productId: string;
  productName: string;
  category: string;
  systemStore: number;
  systemBar: number;
  systemTotal: number;
  countedStore: number;
  countedBar: number;
  countedTotal: number;
  difference: number;
  costPrice: number;
  differenceValue: number;
}

export interface StockCountSession {
  id: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  performedBy: string;
  note?: string;
  categoryFilter: string;
  items: StockCountItem[];
  totalDifferenceQuantity: number;
  totalDifferenceValue: number;
  appliedToInventory: boolean;
}

export interface User {
  username: string;
  password: string;
  role: Role;
  phoneNumber?: string; 
}

export interface Product {
  id: string;
  name: string;
  category: string;
  costPrice: number; // Cost to buy from supplier
  salePrice: number; // Price sold at bar
  image: string;
  minStockLevel?: number; // Custom critical stock alert level (Default: 20)
  sortOrder?: number; // Syncs drag-and-drop order across devices
  aliases?: string[]; // Learned alternative names from invoices
  supplier?: string; // Firma / Tedarikçi adı
}

export interface InventoryItem {
  productId: string;
  quantity: number;
}

export interface InventoryState {
  store: InventoryItem[];
  bar: InventoryItem[];
}

export interface Transaction {
  id: string;
  type: TransactionType;
  productId: string;
  quantity: number;
  totalValue: number;
  timestamp: number;
  note?: string;
  supplier?: string;
  invoiceNo?: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  status?: 'APPROVED' | 'REJECTED';
}

export interface Order {
  id: string;
  items: OrderItem[];
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  timestamp: number;
  requestedBy: string;
}

export interface SalesReport {
  date: string;
  revenue: number;
  profit: number;
}
