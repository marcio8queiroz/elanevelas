export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}
export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
export interface Session extends Tokens {
  user: User;
}
export interface Picture {
  id?: string;
  url: string;
  alt?: string;
  isMain?: boolean;
}
export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  image?: Picture;
}
export interface Product {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription?: string;
  category: Category | null;
  fragrance: string;
  price: number;
  promotionalPrice: number | null;
  stock: number;
  lowStockThreshold: number;
  shipping: Record<string, number>;
  specifications?: Record<string, string | number>;
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  images: Picture[];
}
export interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
export interface Envelope<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
}
export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  customer?: { id: string; name: string; email: string };
  subtotal: number;
  shippingAmount: number;
  discountAmount: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  items: {
    productId: string;
    name: string;
    sku: string;
    imageUrl?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  shippingAddress: Record<string, string>;
  shipping?: {
    provider: string;
    serviceId: string;
    serviceName: string;
    price: number;
    estimatedDays: number;
  };
  statusHistory: { type: string; status: string; description?: string; changedAt: string }[];
  allowedActions: {
    statuses: string[];
    paymentStatuses: string[];
    paymentManagedExternally: boolean;
  };
}
