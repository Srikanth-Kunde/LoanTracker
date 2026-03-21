import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  maxWidth
}: ModalProps) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-300" 
        onClick={onClose} 
      />
      <div className={`
        relative w-full ${maxWidth || maxWidths[size as keyof typeof maxWidths]} bg-white/95 dark:bg-slate-800/95 rounded-[28px] shadow-2xl border border-slate-200/80 dark:border-slate-700 
        overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300
      `}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/80 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
          <button 
            onClick={onClose}
            className="p-1 px-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all font-bold"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto max-h-[80vh]">
          {children}
        </div>
      </div>
    </div>
  );
};
