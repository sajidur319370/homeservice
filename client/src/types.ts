// The shapes the API sends back. Kept in one file so every page agrees.
export type Role = "CUSTOMER" | "PROVIDER" | "ADMIN";
export type BookingStatus = "PENDING_PAYMENT" | "CONFIRMED" | "COMPLETED" | "CANCELLED";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  provider: { area: string; approved: boolean } | null;
};

export type Category = { id: string; name: string; slug: string };

export type ServiceCard = {
  id: string;
  title: string;
  description: string;
  price: number;
  durationMin: number;
  area: string;
  providerId: string;
  providerName: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  ratingAvg: number | null;
  ratingCount: number;
};

export type Page<T> = { total: number; page: number; totalPages: number } & T;

export type MyService = Pick<ServiceCard, "id" | "title" | "description" | "price" | "durationMin" | "area" | "categoryId" | "categoryName"> & {
  openBookings: number;
};

export type Booking = {
  id: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  price: number;
  address: string;
  holdActive: boolean;
  serviceId: string;
  serviceTitle: string;
  customerName: string;
  customerPhone: string | null;
  providerName: string;
  providerPhone: string | null;
  paymentStatus: "INITIATED" | "PAID" | "FAILED" | null;
  refundRequired: boolean;
  reviewRating: number | null;
};

export type Review = { id: string; rating: number; comment: string | null; createdAt: string; customerName: string };

export type DayHours = { weekday: number; startMin: number; endMin: number };

export type ProviderMe = { id: string; area: string; bio: string | null; approved: boolean; availability: DayHours[] };

export type AdminProvider = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  area: string;
  approved: boolean;
  serviceCount: number;
};

export type AdminCategory = Category & { serviceCount: number }; // includes removed services

export type AdminStats = {
  usersByRole: Partial<Record<Role, number>>;
  bookingsByStatus: Partial<Record<BookingStatus, number>>;
  revenue: number;
  pendingProviders: number;
  refunds: { id: string; amount: number; tranId: string; bookingId: string; customerName: string; customerEmail: string }[];
};
