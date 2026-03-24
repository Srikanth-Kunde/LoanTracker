
import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  Settings,
  Menu,
  X,
  Star,
  LogOut,
  WifiOff,
  ClipboardList,
  History,
  Users,
  FileUp
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

export const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const location = useLocation();
  const { role, logout } = useAuth();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    const restEndpoint = supabaseUrl ? `${new URL(supabaseUrl).origin}/rest/v1/` : null;

    const checkConnection = async () => {
      if (!restEndpoint) {
        setIsOffline(false);
        return;
      }

      try {
        await fetch(restEndpoint, { method: 'HEAD', mode: 'no-cors' });
        setIsOffline(false);
      } catch {
        setIsOffline(true);
      }
    };
    checkConnection();
    timer = setInterval(checkConnection, 15000); // re-check every 15s
    return () => clearInterval(timer);
  }, []);

  const navigation = [
    { name: 'Special Loans', href: '/', icon: Star },
    { name: 'Members', href: '/members', icon: Users },
    { name: 'Import Data', href: '/import', icon: FileUp },
    { name: 'Audit Report', href: '/audit', icon: ClipboardList },
    ...(role === UserRole.ADMIN ? [{ name: 'Audit Log History', href: '/audit-log', icon: History }] : []),
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/' && location.pathname !== '/') return false;
    return location.pathname.startsWith(path);
  };

  const getRoleBadgeColor = () => {
    switch (role) {
      case UserRole.ADMIN: return 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300';
      case UserRole.OPERATOR: return 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
    }
  };

  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.1),_transparent_24%)] transition-colors duration-200 dark:bg-slate-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-12 h-56 w-56 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>
      <div className="relative min-h-screen flex">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm cursor-pointer"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-72 border-r border-white/60 bg-white/80 shadow-2xl backdrop-blur-xl
        dark:border-slate-700/70 dark:bg-slate-900/85
        transform transition-all duration-200 ease-in-out lg:shadow-none
        lg:translate-x-0 lg:static lg:inset-auto lg:flex lg:flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="border-b border-slate-100/80 px-6 py-5 dark:border-slate-800">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-600 shadow-lg shadow-primary-500/20">
                <span className="text-white font-bold text-lg">L</span>
              </div>
              <div>
                <span className="block text-lg font-bold text-slate-800 dark:text-white">
                  Legacy Loan
                </span>
                <span className="text-[11px] uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                  Audit Ledger
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <X size={20} />
            </button>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/90 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/70 dark:text-slate-300">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Workspace</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isOffline ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                {isOffline ? 'Offline' : 'Live Sync'}
              </span>
            </div>
            <div className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Enter legacy books, verify principal history, and audit interest logic without page refreshes.
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigation.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`
                  flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition-all
                  ${active
                    ? 'bg-primary-50 text-primary-700 shadow-sm ring-1 ring-primary-100 dark:bg-primary-600/10 dark:text-primary-400 dark:ring-primary-900/40'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-white/70 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white'}
                `}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 ${active ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500'}`}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-100/80 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200/90 text-slate-600 dark:bg-slate-700 dark:text-slate-300 font-bold text-xs">
                {role?.charAt(0)}
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 capitalize">{role?.toLowerCase()}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getRoleBadgeColor()}`}>
                  {role} Access
                </span>
              </div>
            </div>
            <button
              onClick={logout}
              className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 bg-white/85 backdrop-blur-xl dark:bg-slate-900/85 border-b border-slate-200/80 dark:border-slate-700">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none"
          >
            <Menu size={24} />
          </button>
          <span className="font-semibold text-slate-800 dark:text-white truncate px-2">Legacy Loan Tracker</span>
          <div className="w-6" /> {/* Spacer */}
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {isOffline && (
            <div className="mb-4 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 px-4 py-3 rounded-xl text-sm">
              <WifiOff size={16} className="shrink-0" />
              <span><strong>Database connection lost</strong> — data may be outdated. Check your network or VPN.</span>
            </div>
          )}
          <div className="mx-auto max-w-[1500px]">
            <Outlet />
          </div>
        </main>
      </div>
      </div>
    </div>
  );
};

export default Layout;
