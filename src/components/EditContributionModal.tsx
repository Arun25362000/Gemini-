import React from 'react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { UserProfile, Contribution } from '../types';
import { cn } from '../lib/utils';

interface EditContributionModalProps {
  editingContribution: Contribution | null;
  setEditingContribution: (c: Contribution | null) => void;
  allUsers: UserProfile[];
  updateContribution: () => void;
}

export const EditContributionModal: React.FC<EditContributionModalProps> = ({
  editingContribution,
  setEditingContribution,
  allUsers,
  updateContribution
}) => {
  if (!editingContribution) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        key="modal-edit-contrib-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setEditingContribution(null)}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div 
        key="modal-edit-contrib-content"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
      >
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Edit Contribution</h2>
        <div className="space-y-6">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Member</p>
            <p className="font-bold text-slate-900">
              {allUsers.find(u => 
                (editingContribution.userId && u.uid === editingContribution.userId) || 
                (editingContribution.userEmail && u.email.toLowerCase() === editingContribution.userEmail.toLowerCase())
              )?.displayName || editingContribution.userEmail.split('@')[0]}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Period</p>
            <p className="font-bold text-slate-900">{format(new Date(editingContribution.year, editingContribution.month - 1), 'MMMM yyyy')}</p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
              <input 
                type="number"
                value={editingContribution.amount}
                onChange={(e) => setEditingContribution({ ...editingContribution, amount: Number(e.target.value) })}
                className="w-full pl-8 pr-4 py-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Status</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setEditingContribution({ ...editingContribution, status: 'paid' })}
                className={cn(
                  "flex-1 py-3 rounded-xl font-bold border transition-all",
                  editingContribution.status === 'paid' 
                    ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-200"
                )}
              >
                Paid
              </button>
              <button 
                onClick={() => setEditingContribution({ ...editingContribution, status: 'pending' })}
                className={cn(
                  "flex-1 py-3 rounded-xl font-bold border transition-all",
                  editingContribution.status === 'pending' 
                    ? "bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-100" 
                    : "bg-white text-slate-600 border-slate-200 hover:border-amber-200"
                )}
              >
                Pending
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={() => setEditingContribution(null)}
              className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={updateContribution}
              className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
            >
              Save Changes
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
