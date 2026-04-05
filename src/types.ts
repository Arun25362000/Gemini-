export type UserRole = 'admin' | 'user';

export interface UserProfile {
  uid?: string; // Optional until they log in
  email: string;
  phoneNumber?: string;
  displayName?: string;
  role: UserRole;
  joinDate: string; // ISO date string
}

export interface Contribution {
  id?: string;
  userId: string;
  userEmail: string;
  month: number; // 1-12
  year: number;
  amount: number;
  status: 'paid' | 'pending';
  timestamp: any; // Firestore Timestamp
}
