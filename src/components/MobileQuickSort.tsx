import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MobileSortOption<T extends string = string> {
  key: T;
  label: string;
}

interface MobileQuickSortProps<T extends string = string> {
  options: MobileSortOption<T>[];
  activeField?: T | string | null;
  direction?: 'asc' | 'desc';
  onSort: (field: T) => void;
  className?: string;
  label?: string;
}

export const MobileQuickSort = <T extends string>({
  options,
  activeField,
  direction = 'asc',
  onSort,
  className,
  label = 'Sort by:'
}: MobileQuickSortProps<T>) => {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto no-scrollbar py-1.5 px-0.5 touch-pan-x select-none", className)}>
      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-0.5">
        <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {options.map((opt) => {
          const isActive = activeField === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSort(opt.key)}
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-150 shrink-0 border cursor-pointer active:scale-95 whitespace-nowrap",
                isActive
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                  : "bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300"
              )}
            >
              <span>{opt.label}</span>
              {isActive ? (
                direction === 'asc' ? (
                  <ArrowUp className="w-3 h-3 text-white" />
                ) : (
                  <ArrowDown className="w-3 h-3 text-white" />
                )
              ) : (
                <ArrowUpDown className="w-2.5 h-2.5 text-slate-400 opacity-60" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
