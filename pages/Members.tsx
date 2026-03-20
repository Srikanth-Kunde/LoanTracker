
import React, { useState, useMemo } from 'react';
import { useMembers } from '../context/MemberContext';
import { useAuth } from '../context/AuthContext';
import { useAuditLog } from '../context/AuditLogContext';
import { Member, UserRole } from '../types';
import { 
    Users, Plus, Search, Edit, Trash2, 
    UserPlus, CheckCircle, XCircle, Phone, Mail, MapPin, Calendar
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { formatDisplayDate } from '../utils/date';
import { logger } from '../utils/logger';

const Members: React.FC = () => {
    const { members, addMember, updateMember, deleteMember, isLoading } = useMembers();
    const { role } = useAuth();
    const { log } = useAuditLog();

    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
    const [modals, setModals] = useState({
        create: false,
        edit: false
    });
    const [errorMsg, setErrorMsg] = useState('');

    // Form states
    const [memberForm, setMemberForm] = useState({
        id: '',
        name: '',
        phone: '',
        email: '',
        address: '',
        joinDate: new Date().toISOString().split('T')[0],
        isActive: true
    });

    const [editingMember, setEditingMember] = useState<Member | null>(null);

    // Permissions
    const canManageMembers = role === UserRole.ADMIN || role === UserRole.OPERATOR;

    // Filtered members
    const filteredMembers = useMemo(() => {
        return members.filter(m => {
            const matchesSearch = 
                m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (m.phone && m.phone.includes(searchTerm));
            
            const matchesStatus = 
                statusFilter === 'ALL' || 
                (statusFilter === 'ACTIVE' && m.isActive) || 
                (statusFilter === 'INACTIVE' && !m.isActive);
            
            return matchesSearch && matchesStatus;
        });
    }, [members, searchTerm, statusFilter]);

    // Handlers
    const handleOpenCreate = () => {
        setMemberForm({
            id: '',
            name: '',
            phone: '',
            email: '',
            address: '',
            joinDate: new Date().toISOString().split('T')[0],
            isActive: true
        });
        setErrorMsg('');
        setModals({ ...modals, create: true });
    };

    const handleCreateMember = async () => {
        if (!memberForm.name) {
            setErrorMsg('Name is required');
            return;
        }
        try {
            await addMember({
                id: memberForm.id || undefined,
                name: memberForm.name,
                phone: memberForm.phone,
                email: memberForm.email,
                address: memberForm.address,
                joinDate: memberForm.joinDate,
                isActive: memberForm.isActive
            });
            log('CREATE_MEMBER', 'members', memberForm.id || 'new', { name: memberForm.name });
            setModals({ ...modals, create: false });

        } catch (error) {
            logger.error('Error adding member:', error);
            setErrorMsg('Failed to add member');
        }
    };

    const handleOpenEdit = (member: Member) => {
        setEditingMember(member);
        setMemberForm({
            id: member.id,
            name: member.name,
            phone: member.phone || '',
            email: member.email || '',
            address: member.address || '',
            joinDate: member.joinDate,
            isActive: member.isActive
        });
        setErrorMsg('');
        setModals({ ...modals, edit: true });
    };

    const handleUpdateMember = async () => {
        if (!editingMember) return;
        if (!memberForm.name) {
            setErrorMsg('Name is required');
            return;
        }
        try {
            await updateMember(editingMember.id, {
                name: memberForm.name,
                phone: memberForm.phone,
                email: memberForm.email,
                address: memberForm.address,
                joinDate: memberForm.joinDate,
                isActive: memberForm.isActive
            });
            log('UPDATE_MEMBER', 'members', editingMember.id, { name: memberForm.name });
            setModals({ ...modals, edit: false });
        } catch (error) {
            logger.error('Error updating member:', error);
            setErrorMsg('Failed to update member');
        }
    };

    const handleDelete = async (member: Member) => {
        if (!window.confirm(`Are you sure you want to delete ${member.name}? This may affect linked loans.`)) return;
        try {
            await deleteMember(member.id);
            log('DELETE_MEMBER', 'members', member.id, { name: member.name });
        } catch (error) {
            logger.error('Error deleting member:', error);
            alert('Failed to delete member');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Users className="text-primary-600" /> Members
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400">Manage your society members and their contact details.</p>
                </div>

                {canManageMembers && (
                    <Button icon={Plus} onClick={handleOpenCreate}>Add New Member</Button>
                )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <Input
                        placeholder="Search by name, ID or phone..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <div className="w-full sm:w-48">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="block w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg leading-5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:text-sm cursor-pointer"
                    >
                        <option value="ALL">All Members</option>
                        <option value="ACTIVE">Active Only</option>
                        <option value="INACTIVE">Inactive Only</option>
                    </select>
                </div>
            </div>

            <Card noPadding>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Member Details</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Contact</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Join Date</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">Loading members...</td>
                                </tr>
                            ) : filteredMembers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">No members found matching your criteria.</td>
                                </tr>
                            ) : (
                                filteredMembers.map((member) => (
                                    <tr key={member.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center font-bold text-lg">
                                                    {member.name.charAt(0)}
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-semibold text-slate-900 dark:text-white uppercase">{member.name}</div>
                                                    <div className="text-xs text-slate-500 font-mono">ID: {member.id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                {member.phone && (
                                                    <div className="flex items-center text-xs text-slate-600 dark:text-slate-300">
                                                        <Phone size={12} className="mr-1 text-slate-400" /> {member.phone}
                                                    </div>
                                                )}
                                                {member.email && (
                                                    <div className="flex items-center text-xs text-slate-600 dark:text-slate-300">
                                                        <Mail size={12} className="mr-1 text-slate-400" /> {member.email}
                                                    </div>
                                                )}
                                                {member.address && (
                                                    <div className="flex items-center text-xs text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                                                        <MapPin size={12} className="mr-1 text-slate-400 shrink-0" /> {member.address}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                                                <Calendar size={14} className="mr-1 text-slate-400" />
                                                {formatDisplayDate(member.joinDate)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            {member.isActive ? (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                                    <CheckCircle size={12} className="mr-1" /> Active
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-400">
                                                    <XCircle size={12} className="mr-1" /> Inactive
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex justify-end gap-2">
                                                {canManageMembers && (
                                                    <>
                                                        <Button size="sm" variant="ghost" icon={Edit} onClick={() => handleOpenEdit(member)} title="Edit Member" />
                                                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => handleDelete(member)} title="Delete Member" className="text-red-500 hover:text-red-700" />
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Create/Edit Member Modal */}
            <Modal
                isOpen={modals.create || modals.edit}
                onClose={() => setModals({ create: false, edit: false })}
                title={modals.create ? "Add New Member" : "Edit Member"}
            >
                <div className="space-y-4 pt-2">
                    {errorMsg && (
                        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
                            {errorMsg}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Member Name *</label>
                            <Input
                                placeholder="Full Name"
                                value={memberForm.name}
                                onChange={e => setMemberForm({ ...memberForm, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Member ID (Optional)</label>
                            <Input
                                placeholder="Auto-generated if empty"
                                value={memberForm.id}
                                onChange={e => setMemberForm({ ...memberForm, id: e.target.value })}
                                disabled={modals.edit}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Phone Number</label>
                            <Input
                                placeholder="10-digit mobile"
                                value={memberForm.phone}
                                onChange={e => setMemberForm({ ...memberForm, phone: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                            <Input
                                placeholder="email@example.com"
                                value={memberForm.email}
                                onChange={e => setMemberForm({ ...memberForm, email: e.target.value })}
                            />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Address</label>
                            <Input
                                placeholder="Residential Address"
                                value={memberForm.address}
                                onChange={e => setMemberForm({ ...memberForm, address: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Join Date</label>
                            <Input
                                type="date"
                                value={memberForm.joinDate}
                                onChange={e => setMemberForm({ ...memberForm, joinDate: e.target.value })}
                            />
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={memberForm.isActive}
                                    onChange={e => setMemberForm({ ...memberForm, isActive: e.target.checked })}
                                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Active Status</span>
                            </label>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="outline" onClick={() => setModals({ create: false, edit: false })}>Cancel</Button>
                        <Button
                            icon={modals.create ? UserPlus : CheckCircle}
                            onClick={modals.create ? handleCreateMember : handleUpdateMember}
                        >
                            {modals.create ? "Create Member" : "Save Changes"}
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Members;
