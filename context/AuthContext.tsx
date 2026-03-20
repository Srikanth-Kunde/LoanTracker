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

const readStoredRole = (): UserRole | null => {
  try {
    const savedRole = sessionStorage.getItem('podhupu_role');
    if (savedRole && Object.values(UserRole).includes(savedRole as UserRole)) {
      return savedRole as UserRole;
    }
  } catch (error) {
    console.warn('Failed to read persisted auth state.', error);
  }

  return null;
};

const persistRole = (role: UserRole | null) => {
  try {
    if (role) {
      sessionStorage.setItem('podhupu_role', role);
    } else {
      sessionStorage.removeItem('podhupu_role');
    }
  } catch (error) {
    console.warn('Failed to persist auth state.', error);
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { settings } = useSettings();
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    const savedRole = readStoredRole();
    if (savedRole) {
      setRole(savedRole);
    }
  }, []);

  const login = async (code: string): Promise<boolean> => {
    if (code === settings.adminPassword) {
      setRole(UserRole.ADMIN);
      persistRole(UserRole.ADMIN);
      return true;
    }
    if (code === (settings.operatorCode || 'operator')) {
      setRole(UserRole.OPERATOR);
      persistRole(UserRole.OPERATOR);
      return true;
    }
    if (code === (settings.viewerCode || 'viewer')) {
      setRole(UserRole.VIEWER);
      persistRole(UserRole.VIEWER);
      return true;
    }
    return false;
  };

  const logout = () => {
    setRole(null);
    persistRole(null);
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
