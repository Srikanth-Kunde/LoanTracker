import React from 'react';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  children, 
  title, 
  subtitle, 
  className = '', 
  noPadding = false 
}) => {
  return (
    <div className={`overflow-hidden rounded-[28px] border border-white/70 bg-white/85 shadow-[0_12px_40px_-20px_rgba(15,23,42,0.35)] backdrop-blur-sm transition-all duration-300 dark:border-slate-700/70 dark:bg-slate-800/80 ${className}`}>
      {(title || subtitle) && (
        <div className="border-b border-slate-100/80 bg-slate-50/80 px-6 py-4 dark:border-slate-700/70 dark:bg-slate-900/30">
          {title && <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-6'}>
        {children}
      </div>
    </div>
  );
};
