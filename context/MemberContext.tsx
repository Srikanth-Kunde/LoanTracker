import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Member } from '../types';
import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';

interface MemberContextType {
  members: Member[];
  addMember: (member: Omit<Member, 'id'> & { id?: string }) => Promise<void>;
  updateMember: (id: string, data: Partial<Member>) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  getMember: (id: string) => Member | undefined;
  isLoading: boolean;
}

const MemberContext = createContext<MemberContextType | undefined>(undefined);

const mapDbMember = (m: any): Member => ({
  id: m.id,
  name: m.name,
  phone: m.phone,
  address: m.address,
  email: m.email,
  joinDate: m.join_date,
  isActive: m.is_active
});

const sortMembersByName = (list: Member[]) =>
  [...list].sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

export const MemberProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMembers = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) {
        setIsLoading(true);
      }
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('name');

      if (error) throw error;

      if (data) {
        setMembers(sortMembersByName((data as any[]).map(mapDbMember)));
      }
    } catch (error) {
      logger.error('Error fetching members:', error);
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchMembers();

    const channel = supabase
      .channel('members_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members' },
        () => {
          logger.info('Database change: members');
          fetchMembers(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMembers]);

  const addMember = useCallback(async (memberData: Omit<Member, 'id'> & { id?: string }) => {
    const newId = memberData.id || Date.now().toString();

    const { error } = await supabase.from('members').insert([{
      id: newId,
      name: memberData.name,
      phone: memberData.phone,
      address: memberData.address,
      email: memberData.email,
      join_date: memberData.joinDate,
      is_active: memberData.isActive ?? true
    }]);

    if (error) {
      logger.error('Error adding member:', error);
      throw error;
    }

    setMembers(prev => sortMembersByName([
      ...prev,
      {
        id: newId,
        name: memberData.name,
        phone: memberData.phone || '',
        address: memberData.address || '',
        email: memberData.email || '',
        joinDate: memberData.joinDate,
        isActive: memberData.isActive ?? true
      }
    ]));

    await fetchMembers(false);
  }, [fetchMembers]);

  const updateMember = useCallback(async (id: string, data: Partial<Member>) => {
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.address !== undefined) updates.address = data.address;
    if (data.email !== undefined) updates.email = data.email;
    if (data.joinDate !== undefined) updates.join_date = data.joinDate;
    if (data.isActive !== undefined) updates.is_active = data.isActive;

    const { error } = await supabase.from('members').update(updates).eq('id', id);
    if (error) {
      logger.error('Error updating member:', error);
      throw error;
    }

    setMembers(prev => sortMembersByName(prev.map(member =>
      member.id === id
        ? { ...member, ...data }
        : member
    )));

    await fetchMembers(false);
  }, [fetchMembers]);

  const deleteMember = useCallback(async (id: string) => {
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) {
      logger.error('Error deleting member:', error);
      throw error;
    }

    setMembers(prev => prev.filter(member => member.id !== id));
    await fetchMembers(false);
  }, [fetchMembers]);

  const getMember = useCallback((id: string) => {
    return members.find((m: Member) => m.id === id);
  }, [members]);

  return (
    <MemberContext.Provider value={{ members, addMember, updateMember, deleteMember, getMember, isLoading }}>
      {children}
    </MemberContext.Provider>
  );
};

export const useMembers = () => {
  const context = useContext(MemberContext);
  if (!context) throw new Error('useMembers must be used within MemberProvider');
  return context;
};
