
import React, { useState, useEffect } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
  Settings,
  Menu,
  X,
  Star,
  LogOut,
  WifiOff,
  ClipboardList
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
    { name: 'Audit Report', href: '/audit', icon: ClipboardList },
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
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900 transition-colors duration-200">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm cursor-pointer"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 
        transform transition-all duration-200 ease-in-out shadow-lg lg:shadow-none
        lg:translate-x-0 lg:static lg:inset-auto lg:flex lg:flex-col
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">L</span>
            </div>
            <span className="text-xl font-bold text-slate-800 dark:text-white truncate max-w-[150px]">
              LoanTracker
            </span>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navigation.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setIsSidebarOpen(false)}
                className={`
                  flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors
                  ${active
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-600/10 dark:text-primary-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'}
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

        <div className="p-4 border-t border-slate-100 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-xs">
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
        <header className="lg:hidden flex items-center justify-between h-16 px-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none"
          >
            <Menu size={24} />
          </button>
          <span className="font-semibold text-slate-800 dark:text-white">LoanTracker</span>
          <div className="w-6" /> {/* Spacer */}
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {isOffline && (
            <div className="mb-4 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300 px-4 py-3 rounded-xl text-sm">
              <WifiOff size={16} className="shrink-0" />
              <span><strong>Database connection lost</strong> — data may be outdated. Check your network or VPN.</span>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
