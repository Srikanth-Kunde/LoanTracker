import * as React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ElementType;
  leftIcon?: React.ReactNode;
  description?: string;
  className?: string;
  id?: string;
}

export const Input: React.FC<InputProps> = ({ 
  label, 
  error, 
  icon: Icon, 
  leftIcon,
  description,
  className = '', 
  id,
  ...props 
}: InputProps) => {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 ml-0.5">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            {leftIcon}
          </div>
        )}
        {Icon && !leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Icon className="h-4 w-4 text-slate-400" />
          </div>
        )}
        <input
          id={inputId}
          className={`
            block w-full rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-3 shadow-sm
            text-slate-900 placeholder:text-slate-400
            focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10 sm:text-sm transition-all
            disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/90 dark:text-white dark:disabled:bg-slate-900 disabled:text-slate-500
            ${(Icon || leftIcon) ? 'pl-10' : 'pl-4'}
            ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}
            ${className}
          `}
          {...props}
        />
      </div>
      {description && <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 ml-1 italic">{description}</p>}
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 ml-1">{error}</p>}
    </div>
  );
};
