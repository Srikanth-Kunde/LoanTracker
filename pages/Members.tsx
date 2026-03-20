
import React, { useState, useMemo } from 'react';
import { useMembers } from '../context/MemberContext';
import { useFinancials } from '../context/FinancialContext';
import { useAuth } from '../context/AuthContext';
import { useAuditLog } from '../context/AuditLogContext';
import { useSettings } from '../context/SettingsContext';
import { Member, UserRole, LoanType } from '../types';
import { 
    Users, Plus, Search, Edit, Trash2, Eye,
    UserPlus, CheckCircle, XCircle, Phone, Mail, MapPin, Calendar,
    TrendingUp, Banknote, Clock, Award
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { formatDisplayDate, isISODateOnOrBefore, compareISODate } from '../utils/date';
import { formatCurrency } from '../constants';
import { logger } from '../utils/logger';

const Members: React.FC = () => {
    const { members, addMember, updateMember, deleteMember, isLoading } = useMembers();
    const { loans, loanRepayments, loanTopups, getSpecialLoanOutstanding } = useFinancials();
    const { settings } = useSettings();
    const { role } = useAuth();
    const { log } = useAuditLog();

    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
    const [modals, setModals] = useState({
        create: false,
        edit: false,
        view: false
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
    const [selectedMember, setSelectedMember] = useState<Member | null>(null);

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
        setModals({ ...modals, edit: true, view: false });
    };

    const handleOpenView = (member: Member) => {
        setSelectedMember(member);
        setModals({ ...modals, view: true });
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
                                                <Button size="sm" variant="ghost" icon={Eye} onClick={() => handleOpenView(member)} title="View Member Details" className="text-primary-600 dark:text-primary-400" />
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

            {/* View Member Details Modal */}
            <Modal
                isOpen={modals.view && !!selectedMember}
                onClose={() => setModals({ ...modals, view: false })}
                title="Member Profile & Financial Summary"
                maxWidth="max-w-3xl"
            >
                {selectedMember && (() => {
                    const memberLoans = loans.filter(l => l.memberId === selectedMember.id && l.type === LoanType.SPECIAL);
                    const loanIds = new Set(memberLoans.map(l => l.id));
                    
                    const memberTopups = loanTopups.filter(t => loanIds.has(t.loanId));
                    const memberRepayments = loanRepayments.filter(r => loanIds.has(r.loanId));
                    
                    const totalTopups = memberTopups.reduce((sum, t) => sum + t.amount, 0);
                    const totalPrincipalRecovered = memberRepayments.reduce((sum, r) => sum + (r.principalPaid || 0), 0);
                    const totalInterestCollected = memberRepayments.reduce((sum, r) => sum + (r.interestPaid || 0), 0);
                    const currentOutstanding = memberLoans.reduce((sum, l) => sum + getSpecialLoanOutstanding(l.id), 0);
                    
                    const activeLoans = memberLoans.filter(l => l.status === 'ACTIVE');

                    return (
                        <div className="space-y-6 py-2">
                            {/* Member Header */}
                            <div className="flex items-start justify-between bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold text-2xl shadow-lg shadow-primary-500/20">
                                        {selectedMember.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">{selectedMember.name}</h3>
                                        <p className="text-sm font-mono text-slate-500">ID: {selectedMember.id}</p>
                                        <div className="mt-2 flex gap-2">
                                            {selectedMember.isActive ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                                    Active Member
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400">
                                                    Inactive
                                                </span>
                                            )}
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                                Joined {formatDisplayDate(selectedMember.joinDate)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right hidden sm:block">
                                    <Button variant="outline" size="sm" icon={Edit} onClick={() => handleOpenEdit(selectedMember)}>Edit Info</Button>
                                </div>
                            </div>

                            {/* Financial Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 mb-1">
                                        <TrendingUp size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Outstanding</span>
                                    </div>
                                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(currentOutstanding, settings.currency)}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-1">
                                        <Plus size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Top-ups</span>
                                    </div>
                                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(totalTopups, settings.currency)}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
                                        <Banknote size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Recovered</span>
                                    </div>
                                    <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(totalPrincipalRecovered, settings.currency)}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 border-l-4 border-l-primary-500">
                                    <div className="flex items-center gap-2 text-primary-600 dark:text-primary-400 mb-1">
                                        <Award size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Interest</span>
                                    </div>
                                    <p className="text-lg font-bold text-primary-600 dark:text-primary-400">{formatCurrency(totalInterestCollected, settings.currency)}</p>
                                </div>
                            </div>

                            {/* Two-Column Details */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                                        <Phone size={16} className="text-slate-400" /> Contact Information
                                    </h4>
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 p-1.5 bg-slate-100 dark:bg-slate-800 rounded">
                                                <Phone size={14} className="text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phone Number</p>
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{selectedMember.phone || 'Not provided'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 p-1.5 bg-slate-100 dark:bg-slate-800 rounded">
                                                <Mail size={14} className="text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</p>
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{selectedMember.email || 'Not provided'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 p-1.5 bg-slate-100 dark:bg-slate-800 rounded">
                                                <MapPin size={14} className="text-slate-500" />
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Residential Address</p>
                                                <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{selectedMember.address || 'Not provided'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2">
                                        <Clock size={16} className="text-slate-400" /> Special Loans Summary
                                    </h4>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                                            <span className="text-sm text-slate-600 dark:text-slate-400">Active Special Loans</span>
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">{activeLoans.length}</span>
                                        </div>
                                        <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                                            <span className="text-sm text-slate-600 dark:text-slate-400">Total Loans (All-time)</span>
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">{memberLoans.length}</span>
                                        </div>
                                        
                                        {activeLoans.length > 0 && (
                                            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg">
                                                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">Active Loan Breakdown</p>
                                                {activeLoans.map(l => (
                                                    <div key={l.id} className="flex justify-between items-center py-1 border-t border-amber-100/50 dark:border-amber-900/20 first:border-t-0">
                                                        <span className="text-xs text-amber-700 dark:text-amber-400 font-mono italic">{formatDisplayDate(l.startDate)}</span>
                                                        <span className="text-xs font-bold text-amber-900 dark:text-amber-200">{formatCurrency(getSpecialLoanOutstanding(l.id), settings.currency)} @ {l.interestRate}%</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                                <Button variant="outline" onClick={() => setModals({ ...modals, view: false })}>Close Profile</Button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* Create/Edit Member Modal */}
            <Modal
                isOpen={modals.create || modals.edit}
                onClose={() => setModals({ create: false, edit: false, view: modals.view })}
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
                        <Button variant="outline" onClick={() => setModals({ ...modals, create: false, edit: false })}>Cancel</Button>
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
