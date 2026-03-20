import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole } from '../types';
import { useSettings } from './SettingsContext';

interface AuthContextType {
  role: UserRole | null;
  login: (code: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    const savedRole = sessionStorage.getItem('podhupu_role');
    if (savedRole && Object.values(UserRole).includes(savedRole as UserRole)) {
      setRole(savedRole as UserRole);
    }
  }, []);

  const login = async (code: string): Promise<boolean> => {
    if (code === settings.adminPassword) {
      setRole(UserRole.ADMIN);
      sessionStorage.setItem('podhupu_role', UserRole.ADMIN);
      return true;
    }
    if (code === (settings.operatorCode || 'operator')) {
      setRole(UserRole.OPERATOR);
      sessionStorage.setItem('podhupu_role', UserRole.OPERATOR);
      return true;
    }
    if (code === (settings.viewerCode || 'viewer')) {
      setRole(UserRole.VIEWER);
      sessionStorage.setItem('podhupu_role', UserRole.VIEWER);
      return true;
    }
    return false;
  };

  const logout = () => {
    setRole(null);
    sessionStorage.removeItem('podhupu_role');
  };

  return (
    <AuthContext.Provider value={{ role, login, logout, isAuthenticated: !!role }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
