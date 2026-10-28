
import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: LucideIcon;
  colorClass: string;
}

export const KPICard: React.FC<KPICardProps> = ({ title, value, subValue, icon: Icon, colorClass }) => {
  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm relative overflow-hidden">
        <div className={`absolute top-0 right-0 p-4 opacity-10 ${colorClass}`}>
            <Icon size={64} />
        </div>
      <div className="flex items-center space-x-4">
        <div className={`p-3 rounded-lg bg-opacity-20 ${colorClass.replace('text-', 'bg-')} ${colorClass}`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-slate-400 text-sm font-medium">{title}</p>
          <h3 className="text-2xl font-bold text-white mt-1">{value}</h3>
          {subValue && <p className="text-xs text-slate-500 mt-1">{subValue}</p>}
        </div>
      </div>
    </div>
  );
};
