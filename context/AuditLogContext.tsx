import { createContext, useContext, useCallback, ReactNode } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditAction =
    | 'CREATE_MEMBER' | 'UPDATE_MEMBER' | 'DELETE_MEMBER'
    | 'RECORD_PAYMENT' | 'DELETE_PAYMENT'
    | 'CREATE_LOAN' | 'UPDATE_LOAN' | 'DELETE_LOAN' | 'CLOSE_LOAN'
    | 'RECORD_REPAYMENT' | 'DELETE_REPAYMENT' | 'BULK_RECORD_INTEREST'
    | 'ADD_TOPUP' | 'DELETE_TOPUP'
    | 'LEGACY_MIGRATION'
    | 'UPDATE_SETTINGS'
    | 'LOGIN' | 'LOGOUT';

export interface AuditLogEntry {
    id: string;
    performed_by: string;         // role: ADMIN | OPERATOR
    action: AuditAction;
    table_name: string;
    record_id?: string;
    details?: Record<string, unknown>;
    created_at: string;
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AuditLogContextValue {
    log: (action: AuditAction, tableName: string, recordId?: string, details?: Record<string, unknown>) => void;
}

const AuditLogContext = createContext<AuditLogContextValue>({ log: () => { } });

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuditLogProvider({ children }: { children: ReactNode }) {
    const { role } = useAuth();

    /**
     * Fire-and-forget audit log insert.
     * Failures are silent — audit logging must NEVER break normal operations.
     */
    const log = useCallback((
        action: AuditAction,
        tableName: string,
        recordId?: string,
        details?: Record<string, unknown>
    ) => {
        if (!role) return; // Not logged in — skip
        const entry = {
            id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            performed_by: role.toUpperCase(),
            action,
            table_name: tableName,
            record_id: recordId ?? null,
            details: details ?? null,
            created_at: new Date().toISOString()
        };
        // Intentionally NOT awaited — fire and forget
        supabase.from('audit_logs').insert([entry]).then(({ error }) => {
            if (error) console.warn('[AuditLog] Failed to write log:', error.message);
        });
    }, [role]);

    return (
        <AuditLogContext.Provider value={{ log }}>
            {children}
        </AuditLogContext.Provider>
    );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuditLog() {
    return useContext(AuditLogContext);
}
