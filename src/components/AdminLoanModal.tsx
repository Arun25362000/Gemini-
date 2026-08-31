import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Clock, Banknote, Zap } from 'lucide-react';
import { UserProfile } from '../types';

interface AdminLoanModalProps {
  isOpen: boolean;
  onClose: () => void;
  allUsers: UserProfile[];
  selectedLoanUserId: string;
  setSelectedLoanUserId: (id: string) => void;
  adminLoanAmount: number;
  setAdminLoanAmount: (amt: number) => void;
  adminLoanDetails: string;
  setAdminLoanDetails: (details: string) => void;
  adminLoanStatus: 'pending' | 'approved';
  setAdminLoanStatus: (status: 'pending' | 'approved') => void;
  adminLoanPaymentMode: 'Online' | 'Cash';
  setAdminLoanPaymentMode: (mode: 'Online' | 'Cash') => void;
  addAdminLoan: () => void;
  isSubmittingAdminLoan: boolean;
}

export const AdminLoanModal: React.FC<AdminLoanModalProps> = ({
  isOpen,
  onClose,
  allUsers,
  selectedLoanUserId,
  setSelectedLoanUserId,
  adminLoanAmount,
  setAdminLoanAmount,
  adminLoanDetails,
  setAdminLoanDetails,
  adminLoanStatus,
  setAdminLoanStatus,
  adminLoanPaymentMode,
  setAdminLoanPaymentMode,
  addAdminLoan,
  isSubmittingAdminLoan
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-900">Record New Loan</h2>
                <p className="text-slate-500 font-medium text-sm">Add a loan for a member manually</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              {/* Member Selection */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Member</label>
                <select 
                  value={selectedLoanUserId}
                  onChange={(e) => setSelectedLoanUserId(e.target.value)}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-2 border-slate-100 text-slate-900 font-bold focus:bg-white focus:border-indigo-500 transition-all outline-none"
                >
                  <option value="">Select Member</option>
                  {allUsers.map((u, uidx) => (
                    <option key={`loan-member-opt-${u.id || u.uid || u.email || uidx}`} value={u.uid || u.id || u.email}>{u.displayName || u.email}</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Loan Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">₹</span>
                  <input 
                    type="number"
                    value={adminLoanAmount}
                    onChange={(e) => setAdminLoanAmount(Number(e.target.value))}
                    className="w-full pl-10 pr-4 py-4 bg-slate-50 rounded-2xl border-2 border-slate-100 text-slate-900 font-black text-xl focus:bg-white focus:border-indigo-500 transition-all outline-none"
                  />
                </div>
              </div>

              {/* Details */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Details / Purpose</label>
                <textarea 
                  value={adminLoanDetails}
                  onChange={(e) => setAdminLoanDetails(e.target.value)}
                  placeholder="Reason for this loan..."
                  rows={3}
                  className="w-full px-4 py-4 bg-slate-50 rounded-2xl border-2 border-slate-100 text-slate-900 font-medium focus:bg-white focus:border-indigo-500 transition-all outline-none resize-none"
                />
              </div>

              {/* Status & Mode */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Status</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setAdminLoanStatus('approved')}
                      className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${
                        adminLoanStatus === 'approved' 
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-600' 
                          : 'bg-white border-slate-100 text-slate-400'
                      }`}
                    >
                      Approved
                    </button>
                    <button 
                      onClick={() => setAdminLoanStatus('pending')}
                      className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${
                        adminLoanStatus === 'pending' 
                          ? 'bg-amber-50 border-amber-600 text-amber-600' 
                          : 'bg-white border-slate-100 text-slate-400'
                      }`}
                    >
                      Pending
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Mode</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setAdminLoanPaymentMode('Online')}
                      className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${
                        adminLoanPaymentMode === 'Online' 
                          ? 'bg-indigo-50 border-indigo-600 text-indigo-600' 
                          : 'bg-white border-slate-100 text-slate-400'
                      }`}
                    >
                      Online
                    </button>
                    <button 
                      onClick={() => setAdminLoanPaymentMode('Cash')}
                      className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all ${
                        adminLoanPaymentMode === 'Cash' 
                          ? 'bg-amber-50 border-amber-600 text-amber-600' 
                          : 'bg-white border-slate-100 text-slate-400'
                      }`}
                    >
                      Cash
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={onClose}
                  className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  disabled={isSubmittingAdminLoan || !selectedLoanUserId}
                  onClick={addAdminLoan}
                  className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                >
                  {isSubmittingAdminLoan ? (
                    <>
                      <Clock className="w-5 h-5 animate-spin" /> Recording...
                    </>
                  ) : (
                    'Record Loan'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
