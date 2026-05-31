import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Filter as FilterIcon, Users, ExternalLink, Trash2, Brain, Ghost, Info, MessageSquare as ConvIcon, Ban, UserCheck, X, Tag as TagIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import MainLayout from '@/components/layout/MainLayout';
import AccessSidebar from '@/components/access/AccessSidebar';
import UserTable from '@/components/access/UserTable';
import AddUsersDialog from '@/components/access/AddUsersDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  getAudienceUsers,
  getMindProfiles,
  deleteAudienceUser,
  deleteAudienceUsers,
  deleteAllAudienceUsers,
  revokeAudienceAccess,
  grantAudienceAccess,
  updateAudienceUserTags,
  updateMindProfile
} from '@/db/api';
import type { AudienceUser, MindProfile } from '@/types/types';
import ConversationsView from '@/components/access/ConversationsView';
import BroadcastsView from '@/components/access/BroadcastsView';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AddIntegrationDialog from '@/components/access/AddIntegrationDialog';

const AccessPage = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AudienceUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AudienceUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isAddIntegrationDialogOpen, setIsAddIntegrationDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('users');
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);
  const [profiles, setProfiles] = useState<MindProfile[]>([]);
  const currentProfile = profiles.find(p => p.id === selectedProfileId);

  // Support/FAQ bots are public — no audience management needed
  const isCurrentProfileSupport = useMemo(() => {
    const name = (currentProfile?.name || '').toLowerCase();
    return name.includes('support') || name.includes('imk') || name.includes('faq') || name.includes('helpdesk');
  }, [currentProfile]);

  // Selection & Delete State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [idToDelete, setIdToDelete] = useState<string | 'bulk' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // User Detail Panel State
  const [selectedUser, setSelectedUser] = useState<AudienceUser | null>(null);
  const [panelTags, setPanelTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [tagsModified, setTagsModified] = useState(false);
  const [isUpdatingAccess, setIsUpdatingAccess] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    initProfiles();
  }, []);

  useEffect(() => {
    console.log('🔄 [AccessPage] Tab/Filter Change:', { activeSection, statusFilter, selectedProfileId });
    if (selectedProfileId === undefined) return;
    fetchData();
  }, [statusFilter, selectedProfileId, activeSection]);

  useEffect(() => {
    filterUsers();
    // Reset selection when filtering or changing views
    setSelectedIds([]);
  }, [users, searchQuery]);

  useEffect(() => {
    if (selectedProfileId && selectedProfileId !== 'all') {
      localStorage.setItem('globalSelectedProfileId', selectedProfileId);
    }
  }, [selectedProfileId]);

  // Website widget preview needs a concrete profile id (not "all")
  useEffect(() => {
    if (activeSection !== 'website' || profiles.length === 0) return;
    if (!selectedProfileId || selectedProfileId === 'all') {
      const fallbackId = profiles.find(p => p.is_primary)?.id || profiles[0].id;
      setSelectedProfileId(fallbackId);
    }
  }, [activeSection, selectedProfileId, profiles]);

  const initProfiles = async () => {
    try {
      const data = await getMindProfiles();
      setProfiles(data);
      if (data.length > 0) {
        const savedId = localStorage.getItem('globalSelectedProfileId');
        const exists = savedId ? data.some(p => p.id === savedId) : false;
        const targetId = exists ? savedId : (data.find(p => p.is_primary)?.id || data[0].id);
        
        setSelectedProfileId(targetId);
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const fetchData = async () => {
    try {
      console.log('🔄 [AccessPage] Fetching data for profile:', selectedProfileId, 'filter:', statusFilter);
      setLoading(true);
      const usersData = await getAudienceUsers(statusFilter, selectedProfileId === 'all' ? undefined : selectedProfileId);
      console.log('📦 [AccessPage] Audience users fetched:', usersData.length);
      setUsers(usersData);
    } catch (error) {
      console.error('❌ [AccessPage] Fetch error:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchQuery) {
      filtered = filtered.filter(
        (user) =>
          user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    console.log(`[ACCESS] Filtering ${users.length} users. Search: "${searchQuery}"`);
    setFilteredUsers(filtered);
  };

  const handleSelectUser = (id: string, selected: boolean) => {
    setSelectedIds(prev =>
      selected ? [...prev, id] : prev.filter(item => item !== id)
    );
  };

  const handleSelectAll = (selected: boolean) => {
    setSelectedIds(selected ? filteredUsers.map(u => u.id) : []);
  };

  const handleDeleteConfirmed = async () => {
    if (!idToDelete) return;

    setIsDeleting(true);
    try {
      if (idToDelete === 'bulk') {
        await deleteAudienceUsers(selectedIds);
        toast({
          title: 'Success',
          description: `${selectedIds.length} users deleted successfully.`,
        });
        setSelectedIds([]);
      } else if (idToDelete === 'all') {
        await deleteAllAudienceUsers(selectedProfileId, true); // forceAll: true to wipe EVERYTHING
        toast({
          title: 'Success',
          description: 'All audience data has been wiped from the database.',
        });
        setSelectedIds([]);
      } else {
        await deleteAudienceUser(idToDelete);
        toast({
          title: 'Success',
          description: 'User deleted successfully.',
        });
        setSelectedIds(prev => prev.filter(id => id !== idToDelete));
      }
      fetchData();
    } catch (error) {
      console.error('Error deleting:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setIdToDelete(null);
    }
  };

  const handleRevokeUser = async (id: string) => {
    try {
      await revokeAudienceAccess(id);
      toast({
        title: 'Success',
        description: 'User access revoked successfully.',
      });
      fetchData();
    } catch (error) {
      console.error('Error revoking user:', error);
      toast({
        title: 'Error',
        description: 'Failed to revoke user access.',
        variant: 'destructive',
      });
    }
  };

  // ── User Detail Panel Handlers ────────────────────────────────────────────

  const handleUserClick = (user: AudienceUser) => {
    setSelectedUser(user);
    setPanelTags(user.tags || []);
    setNewTagInput('');
    setTagsModified(false);
  };

  const handleGrantAccess = async (id: string) => {
    setIsUpdatingAccess(true);
    try {
      await grantAudienceAccess(id);
      toast({ title: 'Access Granted', description: 'User access has been restored.' });
      setSelectedUser(prev => prev ? { ...prev, status: 'active' } : null);
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to grant access.', variant: 'destructive' });
    } finally {
      setIsUpdatingAccess(false);
    }
  };

  const handleRevokeFromPanel = async (id: string) => {
    setIsUpdatingAccess(true);
    try {
      await revokeAudienceAccess(id);
      toast({ title: 'Access Revoked', description: 'User access has been revoked.' });
      setSelectedUser(prev => prev ? { ...prev, status: 'revoked' } : null);
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to revoke access.', variant: 'destructive' });
    } finally {
      setIsUpdatingAccess(false);
    }
  };

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !panelTags.includes(trimmed)) {
      setPanelTags(prev => [...prev, trimmed]);
      setTagsModified(true);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    setPanelTags(prev => prev.filter(t => t !== tag));
    setTagsModified(true);
  };

  const handleSaveTags = async () => {
    if (!selectedUser) return;
    setIsSavingTags(true);
    try {
      await updateAudienceUserTags(selectedUser.id, panelTags);
      toast({ title: 'Tags Saved', description: 'User tags updated successfully.' });
      setTagsModified(false);
      setSelectedUser(prev => prev ? { ...prev, tags: panelTags } : null);
      setUsers(prev => prev.map(u => u.id === selectedUser.id ? { ...u, tags: panelTags } : u));
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save tags.', variant: 'destructive' });
    } finally {
      setIsSavingTags(false);
    }
  };

  const renderContent = () => {
    if (activeSection === 'users') {
      return (
        <>
          {/* Header */}
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-2xl font-bold">Audience</h1>
                {profiles.length > 0 && (
                  <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                    <SelectTrigger className="w-[200px] h-8 text-xs bg-muted/50 border-none">
                      <Brain className="h-3 w-3 mr-2 text-primary" />
                      <SelectValue placeholder="Select Clone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clones</SelectItem>
                      {profiles.map(profile => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {!isCurrentProfileSupport && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{filteredUsers.length.toLocaleString()} {statusFilter !== 'all' ? statusFilter : ''} Users</span>
                  {searchQuery && (
                    <>
                      <span>•</span>
                      <span>{users.length - filteredUsers.length} filtered by search</span>
                    </>
                  )}
                </div>
              )}
            </div>
            {!isCurrentProfileSupport && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIdToDelete('all')}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All
              </Button>
              {selectedIds.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setIdToDelete('bulk')}
                  className="animate-in fade-in slide-in-from-right-2"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Selected ({selectedIds.length})
                </Button>
              )}
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                Sync CRM
              </Button>
              <Button onClick={() => setIsAddUserDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Users
              </Button>
            </div>
            )}
          </div>

          {/* Public support bot notice */}
          {isCurrentProfileSupport && (
            <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100">Public Support Bot — No Audience Needed</h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    This is a public-facing support bot. Anyone can access it without being added to an audience list.
                    To view conversations users have had with this bot, go to the <strong>Conversations</strong> tab.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-100"
                    onClick={() => setActiveSection('conversations')}
                  >
                    <ConvIcon className="w-3.5 h-3.5 mr-2" />
                    View Conversations
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters + Table — only for non-support profiles */}
          {!isCurrentProfileSupport && (
          <>
          <div className="flex flex-col xl:flex-row gap-4">
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full xl:w-auto">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="invited">Invited</TabsTrigger>
                <TabsTrigger value="revoked">Revoked</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="icon">
                <FilterIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-[500px] bg-muted" />
          ) : (
            <UserTable
              users={filteredUsers}
              selectedIds={selectedIds}
              onSelectUser={handleSelectUser}
              onSelectAll={handleSelectAll}
              onDeleteUser={(id) => setIdToDelete(id)}
              onUserClick={handleUserClick}
            />
          )}
          </>
          )}
        </>
      );
    }

    if (activeSection === 'conversations') {
      return (
        <ConversationsView
          profileId={selectedProfileId}
          onSelectConversation={() => { }}
        />
      );
    }


    if (activeSection === 'broadcasts') {
      return (
        <BroadcastsView />
      );
    }
    if (activeSection === 'engage-preferences') {
      return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold">Engage Preferences</h1>
          </div>

          <Card className="max-w-2xl border-muted-foreground/10 shadow-sm overflow-hidden rounded-2xl">
            <CardContent className="p-8">
              <div className="flex items-start justify-between gap-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    <Ghost className="w-6 h-6 text-slate-600" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-lg font-semibold leading-none">Anonymize Users</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Anonymize users to remove their identities from chat transcripts.
                      <span className="text-red-500 ml-1">Changes to this setting will apply to all clone contributors.</span>
                    </p>
                  </div>
                </div>
                <Switch
                  checked={currentProfile?.anonymize_users || false}
                  onCheckedChange={async (checked) => {
                    try {
                      if (!selectedProfileId) return;
                      await updateMindProfile({ anonymize_users: checked }, selectedProfileId);
                      setProfiles(prev => prev.map(p =>
                        p.id === selectedProfileId ? { ...p, anonymize_users: checked } : p
                      ));
                      toast({
                        title: checked ? 'Anonymization Enabled' : 'Anonymization Disabled',
                        description: `User identities will now be ${checked ? 'hidden' : 'visible'} in chat transcripts.`,
                      });
                    } catch (error) {
                      toast({
                        title: 'Error',
                        description: 'Failed to update preferences.',
                        variant: 'destructive',
                      });
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (activeSection === 'website') {
      const websiteProfileId =
        selectedProfileId && selectedProfileId !== 'all'
          ? selectedProfileId
          : profiles.find(p => p.is_primary)?.id || profiles[0]?.id;

      if (!websiteProfileId) {
        return (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            <p>Loading profiles…</p>
          </div>
        );
      }

      // Production embed URL (identity gate applies)
      const widgetUrl = `${window.location.origin}/widget/${websiteProfileId}`;
      // Preview iframe bypasses identity gate and uses iframe-safe layout
      const previewUrl = `${widgetUrl}?preview=1`;
      const previewProfile = profiles.find(p => p.id === websiteProfileId);
      const embedCode = `<iframe 
  src="${widgetUrl}" 
  width="100%" 
  height="700" 
  style="border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"
  allow="microphone"
></iframe>`;


      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold">Website Widget</h1>
            <p className="text-muted-foreground text-lg">Embed your AI Clone directly onto your website to engage visitors.</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {/* Configuration Side */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Widget Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Select MiteshAI Profile</label>
                    <Select value={websiteProfileId} onValueChange={setSelectedProfileId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select MiteshAI" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="p-4 bg-muted/30 rounded-lg border border-dashed text-xs text-muted-foreground">
                    <p>Instructions: Copy the code below and paste it into your website's HTML where you want the chat widget to appear.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Embed Code</label>
                    <div className="relative group">
                      <pre className="p-4 bg-[#1A1A1A] text-gray-300 rounded-xl overflow-x-auto text-xs font-mono leading-relaxed min-h-[120px]">
                        {embedCode}
                      </pre>
                      <Button
                        size="sm"
                        className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white"
                        onClick={() => {
                          navigator.clipboard.writeText(embedCode);
                          toast({ title: "Copied!", description: "Embed code copied to clipboard." });
                        }}
                      >
                        Copy Code
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Alert className="bg-orange-50 border-orange-200">
                <Brain className="h-4 w-4 text-orange-500" />
                <AlertTitle className="text-orange-800">Identity Gate Protection</AlertTitle>
                <AlertDescription className="text-orange-700/80">
                  Your widget is protected. Visitors will be asked to verify their email before they can start chatting with {previewProfile?.name || 'your AI'}.
                </AlertDescription>
              </Alert>
            </div>

            {/* Preview Side */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Live Preview
                </h3>
                <Button variant="ghost" size="sm" onClick={() => window.open(widgetUrl, '_blank')}>
                  <ExternalLink className="h-3 w-3 mr-2" />
                  Open in New Tab
                </Button>
              </div>
              <div className="border rounded-2xl overflow-hidden bg-white shadow-xl aspect-[9/12] max-h-[600px] min-h-[480px] relative group">
                <iframe
                  key={websiteProfileId}
                  src={previewUrl}
                  className="w-full h-full border-none bg-white"
                  title="Widget Preview"
                  allow="microphone"
                />
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-[500px] text-muted-foreground">
        <p>Content for {activeSection} coming soon...</p>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <AccessSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-4 xl:p-8 space-y-6">
            {renderContent()}
          </div>
        </div>
      </div>

      {/* Add Users Dialog */}
      <AddUsersDialog
        open={isAddUserDialogOpen}
        onOpenChange={setIsAddUserDialogOpen}
        profileId={selectedProfileId}
        onUserAdded={() => {
          fetchData();
          toast({
            title: 'List Updated',
            description: 'Audience list has been refreshed.',
          });
        }}
      />

      <AddIntegrationDialog
        open={isAddIntegrationDialogOpen}
        onOpenChange={setIsAddIntegrationDialogOpen}
      />

      {/* User Detail Panel */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="w-[400px] sm:w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>User Details</SheetTitle>
          </SheetHeader>

          {selectedUser && (
            <div className="mt-6 space-y-6">
              {/* User Info */}
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold">
                    {selectedUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg leading-tight">{selectedUser.name}</h3>
                  {selectedUser.email && (
                    <p className="text-sm text-muted-foreground truncate">{selectedUser.email}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant={selectedUser.status === 'revoked' ? 'destructive' : 'secondary'} className="text-xs capitalize">
                      {selectedUser.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{selectedUser.message_count.toLocaleString()} messages</span>
                  </div>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Joined</p>
                  <p className="font-medium">
                    {new Date(selectedUser.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Last Active</p>
                  <p className="font-medium">
                    {selectedUser.last_active
                      ? new Date(selectedUser.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Never'}
                  </p>
                </div>
              </div>

              {/* Access Control */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Access Control</h4>
                <div className="flex gap-2">
                  {selectedUser.status === 'revoked' ? (
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => handleGrantAccess(selectedUser.id)}
                      disabled={isUpdatingAccess}
                    >
                      <UserCheck className="w-4 h-4 mr-2" />
                      {isUpdatingAccess ? 'Granting...' : 'Grant Access'}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="flex-1 border-orange-300 text-orange-600 hover:bg-orange-50 hover:border-orange-400"
                      onClick={() => handleRevokeFromPanel(selectedUser.id)}
                      disabled={isUpdatingAccess}
                    >
                      <Ban className="w-4 h-4 mr-2" />
                      {isUpdatingAccess ? 'Revoking...' : 'Revoke Access'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="flex-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSelectedUser(null);
                      setActiveSection('conversations');
                    }}
                  >
                    <ConvIcon className="w-4 h-4 mr-2" />
                    Conversations
                  </Button>
                </div>
              </div>

              {/* Tags */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <TagIcon className="w-4 h-4 text-muted-foreground" />
                  Tags
                </h4>
                <div className="flex flex-wrap gap-2 min-h-[36px] p-3 bg-muted/20 rounded-lg border border-dashed">
                  {panelTags.length > 0 ? (
                    panelTags.map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="gap-1 pl-2.5 pr-1 py-1 text-sm">
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-1 rounded-full hover:bg-muted/60 p-0.5 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No tags yet. Add one below.</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="Type a tag and press Enter..."
                    className="flex-1 h-9 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newTagInput.trim()) handleAddTag(newTagInput.trim());
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    onClick={() => { if (newTagInput.trim()) handleAddTag(newTagInput.trim()); }}
                    disabled={!newTagInput.trim()}
                  >
                    Add
                  </Button>
                </div>
                {tagsModified && (
                  <Button
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={handleSaveTags}
                    disabled={isSavingTags}
                  >
                    {isSavingTags ? 'Saving...' : 'Save Tags'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!idToDelete} onOpenChange={(open) => !open && setIdToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {idToDelete === 'bulk'
                ? `This will permanently delete ${selectedIds.length} selected users. This action cannot be undone.`
                : idToDelete === 'all'
                  ? "This will permanently delete ALL users across ALL clones from the database. This action cannot be undone."
                  : "This will permanently delete this user. This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirmed();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

export default AccessPage;
