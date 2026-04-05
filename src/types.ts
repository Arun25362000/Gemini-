export type UserRole = 'admin' | 'user';

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: UserRole;
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
