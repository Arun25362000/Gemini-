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

export interface Loan {
  id?: string;
  userId: string;
  userEmail: string;
  amount: number;
  details?: string;
  status: 'pending' | 'approved' | 'declined' | 'paid';
  approvedAmount?: number;
  interestRate?: number;
  createdAt: any;
  approvedAt?: any;
  installments?: number;
}

export interface LoanPayment {
  id?: string;
  loanId: string;
  userId: string;
  month: number;
  year: number;
  amount: number;
  interest: number;
  status: 'paid' | 'pending';
  timestamp: any;
}
