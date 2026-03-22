import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Member } from '../types';
import { supabase } from '../supabaseClient';
import { logger } from '../utils/logger';

interface MemberContextType {
  members: Member[];
  addMember: (member: Omit<Member, 'id'> & { id?: string }) => Promise<void>;
  updateMember: (id: string, data: Partial<Member>) => Promise<void>;
  changeMemberId: (currentId: string, nextId: string, data?: Partial<Member>) => Promise<void>;
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

const toMemberInsertPayload = (member: Member) => ({
  id: member.id,
  name: member.name,
  phone: member.phone || null,
  address: member.address || null,
  email: member.email || null,
  join_date: member.joinDate,
  is_active: member.isActive
});

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

  const changeMemberId = useCallback(async (currentId: string, nextId: string, data: Partial<Member> = {}) => {
    const sourceId = String(currentId || '').trim();
    const targetId = String(nextId || '').trim();

    if (!sourceId) {
      throw new Error('Current member ID is missing.');
    }

    if (!targetId) {
      throw new Error('Member ID is required.');
    }

    if (sourceId === targetId) {
      await updateMember(sourceId, data);
      return;
    }

    const existingMember = members.find(member => member.id === sourceId);
    if (!existingMember) {
      throw new Error('Member not found.');
    }

    const { data: duplicateMember, error: duplicateError } = await supabase
      .from('members')
      .select('id')
      .eq('id', targetId)
      .maybeSingle();

    if (duplicateError) {
      logger.error('Error validating new member ID:', duplicateError);
      throw duplicateError;
    }

    if (duplicateMember) {
      throw new Error(`Member ID ${targetId} already exists.`);
    }

    const replacementMember: Member = {
      ...existingMember,
      ...data,
      id: targetId
    };

    const { error: insertError } = await supabase
      .from('members')
      .insert([toMemberInsertPayload(replacementMember)]);

    if (insertError) {
      logger.error('Error creating replacement member:', insertError);
      throw insertError;
    }

    try {
      const loanReferenceColumns = ['member_id', 'surety1_id', 'surety2_id'] as const;

      for (const column of loanReferenceColumns) {
        const { error } = await supabase
          .from('loans')
          .update({ [column]: targetId })
          .eq(column, sourceId);

        if (error) {
          throw error;
        }
      }

      const { error: deleteError } = await supabase
        .from('members')
        .delete()
        .eq('id', sourceId);

      if (deleteError) {
        throw deleteError;
      }
    } catch (error) {
      for (const column of ['member_id', 'surety1_id', 'surety2_id'] as const) {
        await supabase
          .from('loans')
          .update({ [column]: sourceId })
          .eq(column, targetId);
      }

      await supabase
        .from('members')
        .delete()
        .eq('id', targetId);

      logger.error('Error remapping member ID:', error);
      throw error;
    }

    setMembers(prev => sortMembersByName([
      ...prev.filter(member => member.id !== sourceId),
      replacementMember
    ]));

    await fetchMembers(false);
  }, [fetchMembers, members, updateMember]);

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
    <MemberContext.Provider value={{ members, addMember, updateMember, changeMemberId, deleteMember, getMember, isLoading }}>
      {children}
    </MemberContext.Provider>
  );
};

export const useMembers = () => {
  const context = useContext(MemberContext);
  if (!context) throw new Error('useMembers must be used within MemberProvider');
  return context;
};
