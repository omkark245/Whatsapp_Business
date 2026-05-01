import { useCallback, useEffect, useMemo, useState } from 'react';
import { IoAdd, IoClose, IoKey, IoPeople, IoPersonAdd, IoTrash } from 'react-icons/io5';
import toast from 'react-hot-toast';
import api from '../services/api';
import AppSelect from '../components/ui/AppSelect';
import PaginationBar from '../components/ui/PaginationBar';
import useConfirmDialog from '../hooks/useConfirmDialog';
import useAccountStore from '../store/accountStore';
import { showApiError } from '../utils/apiError';

const DEFAULT_TEAM_PAGE_SIZE = 20;
const DEFAULT_MEMBER_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 40, 80, 100];

export default function TeamManagement() {
  const { activeAccount } = useAccountStore();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [activeTab, setActiveTab] = useState('teams');
  const [teamPage, setTeamPage] = useState(1);
  const [memberPage, setMemberPage] = useState(1);
  const [teamPageSize, setTeamPageSize] = useState(DEFAULT_TEAM_PAGE_SIZE);
  const [memberPageSize, setMemberPageSize] = useState(DEFAULT_MEMBER_PAGE_SIZE);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [teamForm, setTeamForm] = useState({ name: '', description: '' });
  const [memberForm, setMemberForm] = useState({ name: '', email: '', password: '', teamId: '' });
  const [teamGroupDrafts, setTeamGroupDrafts] = useState({});
  const [resetPasswordState, setResetPasswordState] = useState({});
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showCreateMemberModal, setShowCreateMemberModal] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [creatingMember, setCreatingMember] = useState(false);
  const [savingMemberId, setSavingMemberId] = useState(null);
  const [savingGroupId, setSavingGroupId] = useState(null);
  const [resettingMemberId, setResettingMemberId] = useState(null);
  const [deletingTeamId, setDeletingTeamId] = useState(null);
  const [deletingMemberId, setDeletingMemberId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const groupRequest = activeAccount?.id
        ? api.get(`/contact-groups/${activeAccount.id}`)
        : Promise.resolve({ data: { groups: [] } });

      const [teamsResponse, membersResponse, groupsResponse] = await Promise.all([
        api.get('/teams'),
        api.get('/team-members'),
        groupRequest,
      ]);
      const nextTeams = teamsResponse.data.teams || [];
      const nextMembers = membersResponse.data.members || [];
      const nextGroups = groupsResponse.data.groups || [];

      setTeams(nextTeams);
      setMembers(nextMembers);
      setGroups(nextGroups);
    } catch (error) {
      showApiError(error, 'Failed to load teams');
    }
    setLoading(false);
  }, [activeAccount]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadData();
    });
  }, [loadData]);

  const activeTeams = useMemo(
    () => teams.filter((team) => team.status !== 'archived'),
    [teams]
  );

  const teamOptions = useMemo(
    () => activeTeams.map((team) => ({ value: String(team.id), label: team.name })),
    [activeTeams]
  );

  const totalTeamPages = Math.max(1, Math.ceil(activeTeams.length / teamPageSize));
  const safeTeamPage = Math.min(teamPage, totalTeamPages);
  const visibleTeams = useMemo(() => {
    const startIndex = (safeTeamPage - 1) * teamPageSize;
    return activeTeams.slice(startIndex, startIndex + teamPageSize);
  }, [activeTeams, safeTeamPage, teamPageSize]);

  const totalMemberPages = Math.max(1, Math.ceil(members.length / memberPageSize));
  const safeMemberPage = Math.min(memberPage, totalMemberPages);
  const visibleMembers = useMemo(() => {
    const startIndex = (safeMemberPage - 1) * memberPageSize;
    return members.slice(startIndex, startIndex + memberPageSize);
  }, [memberPageSize, members, safeMemberPage]);

  const getTeamGroupDraft = useCallback((teamId) => (
    teamGroupDrafts[teamId] || { groupId: '', assignedUserId: '' }
  ), [teamGroupDrafts]);

  const getAssignableGroupOptionsForTeam = useCallback((teamId) => [
    { value: '', label: 'Select group' },
    ...groups
      .filter((group) => String(group.teamId || '') !== String(teamId))
      .map((group) => ({
        value: String(group.id),
        label: group.team?.name ? `${group.name} (${group.team.name})` : group.name,
      })),
  ], [groups]);

  const updateTeamGroupDraft = (teamId, nextValues) => {
    setTeamGroupDrafts((current) => ({
      ...current,
      [teamId]: {
        ...(current[teamId] || { groupId: '', assignedUserId: '' }),
        ...nextValues,
      },
    }));
  };

  const getPreservedGroupAssignee = useCallback((groupId, teamId) => {
    const group = groups.find((item) => Number(item.id) === Number(groupId));
    if (!group?.assignedUserId) return null;

    const member = members.find((item) => Number(item.id) === Number(group.assignedUserId));
    if (!member || member.status !== 'active') return null;

    return Number(member.teamId) === Number(teamId) ? Number(member.id) : null;
  }, [groups, members]);

  const assignGroupToTeam = async (team) => {
    if (!activeAccount?.id) {
      toast.error('Select a WhatsApp account first');
      return;
    }

    const draft = getTeamGroupDraft(team.id);
    if (!draft.groupId) {
      toast.error('Select a group to add');
      return;
    }

    const savingKey = `team-${team.id}`;
    const preservedAssignedUserId = getPreservedGroupAssignee(draft.groupId, team.id);
    setSavingGroupId(savingKey);
    try {
      await api.patch(`/contact-groups/${draft.groupId}/assignment`, {
        teamId: Number(team.id),
        assignedUserId: preservedAssignedUserId,
      });
      toast.success('Group added to team');
      setTeamGroupDrafts((current) => ({
        ...current,
        [team.id]: { groupId: '' },
      }));
      await loadData();
    } catch (error) {
      showApiError(error, 'Failed to add group to team');
    }
    setSavingGroupId(null);
  };

  const removeGroupFromTeam = async (group) => {
    if (!activeAccount?.id) {
      toast.error('Select a WhatsApp account first');
      return;
    }

    const savingKey = `remove-${group.id}`;
    setSavingGroupId(savingKey);
    try {
      await api.patch(`/contact-groups/${group.id}/assignment`, {
        teamId: null,
        assignedUserId: null,
      });
      toast.success('Group removed from team');
      await loadData();
    } catch (error) {
      showApiError(error, 'Failed to remove group from team');
    }
    setSavingGroupId(null);
  };

  const createTeam = async (event) => {
    event.preventDefault();
    if (!teamForm.name.trim()) {
      toast.error('Team name is required');
      return;
    }

    setCreatingTeam(true);
    try {
      await api.post('/teams', {
        name: teamForm.name.trim(),
        description: teamForm.description.trim(),
      });
      toast.success('Team created');
      setTeamForm({ name: '', description: '' });
      setShowCreateTeamModal(false);
      await loadData();
    } catch (error) {
      showApiError(error, 'Failed to create team');
    }
    setCreatingTeam(false);
  };

  const createMember = async (event) => {
    event.preventDefault();
    if (!memberForm.teamId) {
      toast.error('Select a team for this member');
      return;
    }

    setCreatingMember(true);
    try {
      await api.post('/team-members', {
        name: memberForm.name.trim(),
        email: memberForm.email.trim(),
        password: memberForm.password,
        teamId: Number(memberForm.teamId),
      });
      toast.success('Member created');
      setMemberForm({ name: '', email: '', password: '', teamId: '' });
      setShowCreateMemberModal(false);
      await loadData();
    } catch (error) {
      showApiError(error, 'Failed to create member');
    }
    setCreatingMember(false);
  };

  const updateMember = async (memberId, payload) => {
    setSavingMemberId(memberId);
    try {
      await api.patch(`/team-members/${memberId}`, payload);
      toast.success('Member updated');
      await loadData();
    } catch (error) {
      showApiError(error, 'Failed to update member');
    }
    setSavingMemberId(null);
  };

  const resetPassword = async (memberId) => {
    const password = String(resetPasswordState[memberId] || '');
    if (password.trim().length < 6) {
      toast.error('Reset password should be at least 6 characters');
      return;
    }

    setResettingMemberId(memberId);
    try {
      await api.post(`/team-members/${memberId}/reset-password`, { password });
      toast.success('Temporary password reset');
      setResetPasswordState((current) => ({ ...current, [memberId]: '' }));
      await loadData();
    } catch (error) {
      showApiError(error, 'Failed to reset password');
    }
    setResettingMemberId(null);
  };

  const deleteTeam = async (team) => {
    const approved = await confirm({
      title: 'Delete Team',
      message: `Delete ${team.name}? This will archive the team and unassign its members, contacts, and groups.`,
      confirmLabel: 'Delete Team',
    });
    if (!approved) return;

    setDeletingTeamId(team.id);
    try {
      await api.delete(`/teams/${team.id}`);
      toast.success('Team deleted');
      await loadData();
    } catch (error) {
      showApiError(error, 'Failed to delete team');
    }
    setDeletingTeamId(null);
  };

  const deleteMember = async (member) => {
    const approved = await confirm({
      title: 'Delete Member',
      message: `Delete ${member.name}? Assigned chats and group ownership will be unassigned.`,
      confirmLabel: 'Delete Member',
    });
    if (!approved) return;

    setDeletingMemberId(member.id);
    try {
      await api.delete(`/team-members/${member.id}`);
      toast.success('Member deleted');
      setResetPasswordState((current) => {
        const nextState = { ...current };
        delete nextState[member.id];
        return nextState;
      });
      await loadData();
    } catch (error) {
      showApiError(error, 'Failed to delete member');
    }
    setDeletingMemberId(null);
  };

  const openCreateTeamModal = () => {
    setTeamForm({ name: '', description: '' });
    setShowCreateTeamModal(true);
  };

  const openCreateMemberModal = () => {
    setMemberForm({ name: '', email: '', password: '', teamId: '' });
    setShowCreateMemberModal(true);
  };

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Teams</h1>
            <p className="mt-2 text-sm text-gray-500">
              Create teams, add members, and assign contact groups here so chats route to the right team.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              onClick={openCreateTeamModal}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-primary/15 bg-white px-3 py-3 text-sm font-semibold text-primary shadow-sm transition-colors hover:bg-primary/5 sm:px-5"
            >
              <IoPeople />
              Create Team
            </button>
            <button
              type="button"
              onClick={openCreateMemberModal}
              className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-3 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover sm:px-5"
            >
              <IoPersonAdd />
              Create Member
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {[
            { id: 'teams', label: 'Teams' },
            { id: 'members', label: 'Members' },
          ].map(({ id, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-sm font-semibold transition-all ${
                  active
                    ? 'border-white bg-white text-gray-900 shadow-sm'
                    : 'border-transparent bg-transparent text-gray-500 hover:border-gray-200 hover:bg-white hover:text-gray-800'
                }`}
              >
                {id === 'teams' ? (
                  <IoPeople className={active ? 'text-primary' : 'text-gray-400'} />
                ) : (
                  <IoPersonAdd className={active ? 'text-primary' : 'text-gray-400'} />
                )}
                {label}
              </button>
            );
          })}
        </div>

        <div className="space-y-6">
          {activeTab === 'teams' && (
          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Teams Overview</h2>
                  <p className="text-sm text-gray-500">Overview of teams, members and assigned groups.</p>
                </div>
                <div className="rounded-2xl bg-primary/8 px-4 py-2 text-sm font-semibold text-primary">
                  {activeTeams.length} teams
                </div>
              </div>

              {loading ? (
                <div className="py-12 text-center text-sm text-gray-500">Loading teams...</div>
              ) : activeTeams.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-500">
                  No teams yet. Create your first team.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="min-w-full divide-y divide-gray-100">
                      <thead className="bg-gray-50/90">
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-3">Team</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Members</th>
                          <th className="px-4 py-3">Assigned Groups</th>
                          <th className="px-4 py-3">Add Group</th>
                          <th className="px-4 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {visibleTeams.map((team) => {
                          const teamMembers = members.filter((member) => Number(member.teamId) === Number(team.id));
                          const teamGroups = groups.filter((group) => Number(group.teamId) === Number(team.id));
                          const draft = getTeamGroupDraft(team.id);
                          const addableGroupOptions = getAssignableGroupOptionsForTeam(team.id);
                          const savingKey = `team-${team.id}`;

                          return (
                            <tr key={team.id} className="align-top">
                              <td className="px-4 py-4">
                                <div className="min-w-[180px]">
                                  <div className="font-semibold text-gray-900">{team.name}</div>
                                  
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                                  team.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {team.status}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-sm font-semibold text-gray-900">{teamMembers.length}</td>
                              <td className="px-4 py-4">
                                {teamGroups.length === 0 ? (
                                  <span className="text-sm text-gray-400">No groups assigned</span>
                                ) : (
                                  <div className="flex min-w-[260px] max-w-[360px] flex-wrap gap-2">
                                    {teamGroups.map((group) => (
                                      <span
                                        key={group.id}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700"
                                      >
                                        <span>{group.name}</span>
                                        <button
                                          type="button"
                                          onClick={() => removeGroupFromTeam(group)}
                                          disabled={savingGroupId === `remove-${group.id}`}
                                          className="ml-0.5 rounded-full p-0.5 text-emerald-500 transition-colors hover:bg-emerald-100 hover:text-red-500 disabled:opacity-50"
                                          title="Remove group from team"
                                        >
                                          <IoClose className="text-xs" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <AppSelect
                                  value={draft.groupId}
                                  onChange={(value) => updateTeamGroupDraft(team.id, { groupId: value })}
                                  options={addableGroupOptions}
                                  placeholder={addableGroupOptions.length > 1 ? 'Select group' : 'No groups available'}
                                  disabled={savingGroupId === savingKey || addableGroupOptions.length <= 1}
                                  className="min-w-[200px]"
                                  buttonClassName="bg-white"
                                />
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => assignGroupToTeam(team)}
                                    disabled={savingGroupId === savingKey || !draft.groupId}
                                    className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover disabled:opacity-60"
                                  >
                                    {savingGroupId === savingKey ? 'Adding...' : 'Add'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteTeam(team)}
                                    disabled={deletingTeamId === team.id}
                                    title={deletingTeamId === team.id ? 'Deleting team' : 'Delete team'}
                                    aria-label={deletingTeamId === team.id ? `Deleting ${team.name}` : `Delete ${team.name}`}
                                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                                  >
                                    <IoTrash />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    className="mt-5"
                    page={safeTeamPage}
                    totalPages={totalTeamPages}
                    pageSize={teamPageSize}
                    totalItems={activeTeams.length}
                    onPageChange={setTeamPage}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={(size) => {
                      setTeamPageSize(size || DEFAULT_TEAM_PAGE_SIZE);
                      setTeamPage(1);
                    }}
                  />
                </>
              )}
          </section>
          )}

          {activeTab === 'members' && (
          <section className="rounded-3xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Members</h2>
                  <p className="text-sm text-gray-500">Update team mapping, status, or update passwords.</p>
                </div>
                <div className="rounded-2xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-600">
                  {members.length} members
                </div>
              </div>

              {loading ? (
                <div className="py-12 text-center text-sm text-gray-500">Loading members...</div>
              ) : members.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-500">
                  No members yet. Create your first member above.
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-2xl border border-gray-100">
                    <table className="min-w-full divide-y divide-gray-100">
                      <thead className="bg-gray-50/90">
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-3">Member</th>
                          <th className="px-4 py-3">Team</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Update Password</th>
                          <th className="px-4 py-3">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {visibleMembers.map((member) => (
                          <tr key={member.id} className="align-top">
                            <td className="px-4 py-4">
                              <div className="min-w-[220px]">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-gray-900">{member.name}</span>
                                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                                    member.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                                  }`}>
                                    {member.status}
                                  </span>
                                  
                                </div>
                                <div className="mt-1 text-sm text-gray-500">{member.email}</div>
                                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                  
                                  
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <AppSelect
                                value={member.teamId || ''}
                                onChange={(value) => updateMember(member.id, { teamId: Number(value) })}
                                options={teamOptions}
                                placeholder="Select team"
                                disabled={savingMemberId === member.id}
                                className="min-w-[180px]"
                                buttonClassName="bg-white"
                              />
                            </td>
                            <td className="px-4 py-4">
                              <button
                                type="button"
                                onClick={() => updateMember(member.id, {
                                  status: member.status === 'active' ? 'inactive' : 'active',
                                })}
                                disabled={savingMemberId === member.id}
                                className={`inline-flex min-w-[138px] items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                                  member.status === 'active'
                                    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                                    : 'border-rose-100 bg-rose-50 text-rose-600'
                                }`}
                              >
                                <span>{savingMemberId === member.id ? 'Updating...' : member.status === 'active' ? 'Active' : 'Inactive'}</span>
                                <span className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                                  member.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'
                                }`}>
                                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                    member.status === 'active' ? 'translate-x-6' : 'translate-x-1'
                                  }`} />
                                </span>
                              </button>
                            </td>
                            <td className="px-4 py-4">
                              <input
                                type="text"
                                value={resetPasswordState[member.id] || ''}
                                onChange={(event) => setResetPasswordState((current) => ({ ...current, [member.id]: event.target.value }))}
                                className="min-w-[220px] rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                                placeholder="Enter new password"
                              />
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => resetPassword(member.id)}
                                  disabled={resettingMemberId === member.id}
                                  className="inline-flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/12 disabled:opacity-60"
                                >
                                  <IoKey />
                                  {resettingMemberId === member.id ? 'Resetting...' : 'Update'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteMember(member)}
                                  disabled={deletingMemberId === member.id}
                                  title={deletingMemberId === member.id ? 'Deleting member' : 'Delete member'}
                                  aria-label={deletingMemberId === member.id ? `Deleting ${member.name}` : `Delete ${member.name}`}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-red-100 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-60"
                                >
                                  <IoTrash />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    className="mt-5"
                    page={safeMemberPage}
                    totalPages={totalMemberPages}
                    pageSize={memberPageSize}
                    totalItems={members.length}
                    onPageChange={setMemberPage}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageSizeChange={(size) => {
                      setMemberPageSize(size || DEFAULT_MEMBER_PAGE_SIZE);
                      setMemberPage(1);
                    }}
                  />
                </>
              )}
          </section>
          )}
        </div>

        {showCreateTeamModal && (
          <div
            className="app-modal-overlay z-50 bg-black/50"
            onClick={() => !creatingTeam && setShowCreateTeamModal(false)}
          >
            <div
              className="app-modal-scroll-panel max-w-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <IoPeople className="text-xl" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Create Team</h2>
                    <p className="text-sm text-gray-500">Add a new team for inbox access and campaign ownership.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateTeamModal(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <IoClose />
                </button>
              </div>

              <form onSubmit={createTeam} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Team Name</label>
                  <input
                    type="text"
                    value={teamForm.name}
                    onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Enter team name"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={teamForm.description}
                    onChange={(event) => setTeamForm((current) => ({ ...current, description: event.target.value }))}
                    className="min-h-[120px] w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Enter team description"
                  />
                </div>
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCreateTeamModal(false)}
                    className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingTeam}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover disabled:opacity-60"
                  >
                    <IoAdd />
                    {creatingTeam ? 'Creating...' : 'Create Team'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showCreateMemberModal && (
          <div
            className="app-modal-overlay z-50 bg-black/50"
            onClick={() => !creatingMember && setShowCreateMemberModal(false)}
          >
            <div
              className="app-modal-scroll-panel max-w-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <IoPersonAdd className="text-xl" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Create Member</h2>
                    <p className="text-sm text-gray-500">Create a member account with a temporary password and team.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateMemberModal(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                >
                  <IoClose />
                </button>
              </div>

              <form onSubmit={createMember} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      value={memberForm.name}
                      onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="Enter member name"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      value={memberForm.email}
                      onChange={(event) => setMemberForm((current) => ({ ...current, email: event.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="Enter member email"
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Temporary Password</label>
                    <input
                      type="text"
                      value={memberForm.password}
                      onChange={(event) => setMemberForm((current) => ({ ...current, password: event.target.value }))}
                      className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                      placeholder="Enter temporary password"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Assign Team</label>
                    <AppSelect
                      value={memberForm.teamId}
                      onChange={(value) => setMemberForm((current) => ({ ...current, teamId: value }))}
                      options={teamOptions}
                      placeholder={teamOptions.length > 0 ? 'Select team' : 'Create team first'}
                      disabled={teamOptions.length === 0}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowCreateMemberModal(false)}
                    className="rounded-2xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingMember || teamOptions.length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover disabled:opacity-60"
                  >
                    <IoPersonAdd />
                    {creatingMember ? 'Creating...' : 'Create Member'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
