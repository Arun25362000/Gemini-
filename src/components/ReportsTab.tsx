import React from 'react';
import { 
  FileSpreadsheet, 
  Scale, 
  Calendar, 
  FileDown, 
  Mail, 
  ArrowRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { getAppAvailableYears } from '../lib/utils';
import { motion } from 'motion/react';

interface ReportsTabProps {
  exportAllDataToExcel: () => void | Promise<void>;
  exportBalanceSheetExcel: () => void | Promise<void>;
  exportMonthlyCollectionsExcel: () => void | Promise<void>;
  triggerFullBackupReport: () => void | Promise<void>;
  isSendingReport: boolean;
  isTriggeringReminders: boolean;
  collectionMonth: number;
  setCollectionMonth: (month: number) => void;
  collectionYear: number;
  setCollectionYear: (year: number) => void;
  isSmtpConfigured?: boolean;
  totalMembersCount?: number;
  totalContributionsCount?: number;
}

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export const ReportsTab: React.FC<ReportsTabProps> = ({
  exportAllDataToExcel,
  exportBalanceSheetExcel,
  exportMonthlyCollectionsExcel,
  triggerFullBackupReport,
  isSendingReport,
  isTriggeringReminders,
  collectionMonth,
  setCollectionMonth,
  collectionYear,
  setCollectionYear,
  isSmtpConfigured = true,
}) => {
  const availableYears = getAppAvailableYears ? getAppAvailableYears() : [2024, 2025, 2026, 2027, 2028];

  const [collapsedReports, setCollapsedReports] = React.useState<Record<string, boolean>>({
    'master': false,
    'balance-sheet': false,
    'monthly': false,
    'backup': false,
  });

  const toggleReport = (id: string) => {
    setCollapsedReports(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="space-y-6" id="reports-tab-container">
      {/* Grid of Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Card 1: Master Report */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-teal-200/80 shadow-sm hover:shadow-md hover:border-teal-300 transition-all flex flex-col justify-between"
          id="report-card-master"
        >
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 border border-teal-200/70 flex items-center justify-center font-bold shadow-xs shrink-0">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200/80">
                Spreadsheet (.xlsx)
              </span>
            </div>

            <button
              type="button"
              onClick={() => toggleReport('master')}
              className="w-full flex items-center justify-between gap-2 cursor-pointer select-none group text-left mb-2 focus:outline-none"
              aria-expanded={!collapsedReports['master']}
              title={collapsedReports['master'] ? "Click to expand Master Report" : "Click to collapse Master Report"}
            >
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 group-hover:text-teal-600 transition-colors flex items-center gap-2">
                <span>Master Report</span>
                <span className="text-slate-400 group-hover:text-teal-600 transition-colors">
                  {collapsedReports['master'] ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronUp className="w-5 h-5" />
                  )}
                </span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-400 group-hover:text-teal-600 transition-colors">
                {collapsedReports['master'] ? 'Click to expand' : 'Click to collapse'}
              </span>
            </button>

            {!collapsedReports['master'] && (
              <>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-5">
                  Consolidated member summary report covering all member subscriptions, personal balances, loan commitments, and complete trust financial records across all recorded years.
                </p>

                <div className="space-y-2 mb-6 bg-teal-50/40 p-3.5 rounded-2xl border border-teal-100 text-xs text-slate-700">
                  <div className="flex items-center gap-2 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                    <span>Multi-sheet consolidated workbook</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                    <span>Member-by-member payment status &amp; totals</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                    <span>Automatic column styling &amp; official trust header</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {!collapsedReports['master'] && (
            <button
              type="button"
              id="btn-export-master-report"
              onClick={exportAllDataToExcel}
              className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 active:scale-[0.98] text-white rounded-xl font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer mt-2"
              title="Export all member contributions and financial data to Excel"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>Master Report</span>
              <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
            </button>
          )}
        </motion.div>

        {/* Card 2: Balance Sheet */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-indigo-200/80 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between"
          id="report-card-balance-sheet"
        >
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-200/70 flex items-center justify-center font-bold shadow-xs shrink-0">
                <Scale className="w-6 h-6" />
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                Audit Statement (.xlsx)
              </span>
            </div>

            <button
              type="button"
              onClick={() => toggleReport('balance-sheet')}
              className="w-full flex items-center justify-between gap-2 cursor-pointer select-none group text-left mb-2 focus:outline-none"
              aria-expanded={!collapsedReports['balance-sheet']}
              title={collapsedReports['balance-sheet'] ? "Click to expand Balance Sheet" : "Click to collapse Balance Sheet"}
            >
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                <span>Balance Sheet</span>
                <span className="text-slate-400 group-hover:text-indigo-600 transition-colors">
                  {collapsedReports['balance-sheet'] ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronUp className="w-5 h-5" />
                  )}
                </span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-400 group-hover:text-indigo-600 transition-colors">
                {collapsedReports['balance-sheet'] ? 'Click to expand' : 'Click to collapse'}
              </span>
            </button>

            {!collapsedReports['balance-sheet'] && (
              <>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-5">
                  Comprehensive audited trust balance sheet workbook featuring trust summary, member inflows, liquid cash vs bank reconciliation, and asset &amp; liability ledger.
                </p>

                <div className="space-y-2 mb-6 bg-indigo-50/40 p-3.5 rounded-2xl border border-indigo-100 text-xs text-slate-700">
                  <div className="flex items-center gap-2 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    <span>Real-time liquid cash vs bank reconciliation</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    <span>Cumulative loan interest earnings &amp; principal pool</span>
                  </div>
                  <div className="flex items-center gap-2 font-medium">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    <span>Auditor-ready trust net worth reconciliation</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {!collapsedReports['balance-sheet'] && (
            <button
              type="button"
              id="btn-export-balance-sheet"
              onClick={exportBalanceSheetExcel}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer mt-2"
              title="Download comprehensive trust Balance Sheet Excel report"
            >
              <Scale className="w-4 h-4 shrink-0" />
              <span>Balance Sheet</span>
              <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
            </button>
          )}
        </motion.div>

        {/* Card 3: Monthly Report */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-emerald-200/80 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between"
          id="report-card-monthly"
        >
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200/70 flex items-center justify-center font-bold shadow-xs shrink-0">
                <Calendar className="w-6 h-6" />
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                Cycle Statement (.xlsx)
              </span>
            </div>

            <button
              type="button"
              onClick={() => toggleReport('monthly')}
              className="w-full flex items-center justify-between gap-2 cursor-pointer select-none group text-left mb-2 focus:outline-none"
              aria-expanded={!collapsedReports['monthly']}
              title={collapsedReports['monthly'] ? "Click to expand Monthly Report" : "Click to collapse Monthly Report"}
            >
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 group-hover:text-emerald-600 transition-colors flex items-center gap-2">
                <span>Monthly Report</span>
                <span className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                  {collapsedReports['monthly'] ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronUp className="w-5 h-5" />
                  )}
                </span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-400 group-hover:text-emerald-600 transition-colors">
                {collapsedReports['monthly'] ? 'Click to expand' : 'Click to collapse'}
              </span>
            </button>

            {!collapsedReports['monthly'] && (
              <>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-4">
                  Monthly collections statement detailing member subscriptions, loan repayment installments, interest split, cash vs online modes, and verified transaction receipts.
                </p>

                {/* Target Cycle Selector */}
                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 mb-6">
                  <span className="text-[10.5px] font-bold text-emerald-900 uppercase tracking-wider block mb-2">
                    Target Collection Period
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block mb-1">Month</label>
                      <select
                        id="reports-collection-month-select"
                        value={collectionMonth}
                        onChange={(e) => setCollectionMonth(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white text-slate-900 rounded-xl border border-emerald-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                      >
                        {MONTHS.map((m) => (
                          <option key={`report-month-${m.value}`} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block mb-1">Year</label>
                      <select
                        id="reports-collection-year-select"
                        value={collectionYear}
                        onChange={(e) => setCollectionYear(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white text-slate-900 rounded-xl border border-emerald-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer"
                      >
                        {availableYears.map((y) => (
                          <option key={`report-year-${y}`} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {!collapsedReports['monthly'] && (
            <button
              type="button"
              id="btn-export-monthly-report"
              onClick={exportMonthlyCollectionsExcel}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white rounded-xl font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer mt-2"
              title="Export Monthly Collections Spreadsheet"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>Monthly Report</span>
              <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
            </button>
          )}
        </motion.div>

        {/* Card 4: Send Backup */}
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.15 }}
          className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-slate-300 shadow-sm hover:shadow-md hover:border-slate-400 transition-all flex flex-col justify-between"
          id="report-card-backup"
        >
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-800 border border-slate-200/80 flex items-center justify-center font-bold shadow-xs shrink-0">
                <FileDown className="w-6 h-6" />
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
                Email Dispatch
              </span>
            </div>

            <button
              type="button"
              onClick={() => toggleReport('backup')}
              className="w-full flex items-center justify-between gap-2 cursor-pointer select-none group text-left mb-2 focus:outline-none"
              aria-expanded={!collapsedReports['backup']}
              title={collapsedReports['backup'] ? "Click to expand Send Backup" : "Click to collapse Send Backup"}
            >
              <h3 className="text-lg sm:text-xl font-bold text-slate-900 group-hover:text-slate-700 transition-colors flex items-center gap-2">
                <span>Send Backup</span>
                <span className="text-slate-400 group-hover:text-slate-700 transition-colors">
                  {collapsedReports['backup'] ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronUp className="w-5 h-5" />
                  )}
                </span>
              </h3>
              <span className="text-[11px] font-semibold text-slate-400 group-hover:text-slate-700 transition-colors">
                {collapsedReports['backup'] ? 'Click to expand' : 'Click to collapse'}
              </span>
            </button>

            {!collapsedReports['backup'] && (
              <>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed mb-5">
                  Instantly compiles the full financial ledger, member database, active loan portfolios, and collection logs, securely dispatching an offsite backup package.
                </p>

                <div className="space-y-3 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Recipient:</span>
                    <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2.5 py-0.5 rounded-md border border-slate-200">
                      jpvenu2000@gmail.com
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Protocol:</span>
                    <span className="font-semibold text-slate-700">Encrypted SMTP Transport</span>
                  </div>
                  {!isSmtpConfigured && (
                    <div className="mt-1 flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 text-[11px] font-medium">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span>SMTP configuration required in environment</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {!collapsedReports['backup'] && (
            <button
              type="button"
              id="btn-trigger-backup-now"
              onClick={triggerFullBackupReport}
              disabled={isSendingReport || isTriggeringReminders}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 active:scale-[0.98] text-white rounded-xl font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
              title="Send full financial backup report to jpvenu2000@gmail.com"
            >
              {isSendingReport ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating Backup...</span>
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4 shrink-0" />
                  <span>Send Backup</span>
                  <ArrowRight className="w-4 h-4 ml-1 opacity-70" />
                </>
              )}
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
};
