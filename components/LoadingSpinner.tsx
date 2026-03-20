import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center space-y-4">
      <div className="relative">
        <div className="w-12 h-12 border-4 border-primary-200 dark:border-primary-900/30 rounded-full"></div>
        <div className="absolute top-0 left-0 w-12 h-12 border-4 border-primary-600 rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="text-slate-500 dark:text-slate-400 text-sm font-medium animate-pulse">Loading Module...</p>
    </div>
  );
};

export default LoadingSpinner;
