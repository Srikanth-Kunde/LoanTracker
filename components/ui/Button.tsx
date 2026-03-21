import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  icon?: React.ElementType;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon: Icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]';
  
  const variants = {
    primary: 'border border-transparent bg-primary-600 text-white shadow-lg shadow-primary-500/20 hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-primary-500/30 focus:ring-primary-500',
    secondary: 'border border-slate-200 bg-slate-100 text-slate-700 hover:-translate-y-0.5 hover:bg-slate-200 focus:ring-slate-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
    danger: 'border border-transparent bg-red-600 text-white shadow-lg shadow-red-500/20 hover:-translate-y-0.5 hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-slate-600 hover:bg-white/80 hover:text-slate-900 focus:ring-slate-500 dark:text-slate-300 dark:hover:bg-slate-700/80 dark:hover:text-white',
    outline: 'border border-slate-300 bg-white/90 text-slate-700 hover:-translate-y-0.5 hover:bg-white focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700'
  };

  const sizes = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
    icon: 'p-2'
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant as keyof typeof variants]} ${sizes[size as keyof typeof sizes]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {!isLoading && Icon && <span><Icon size={16} /></span>}
      {children}
    </button>
  );
};
