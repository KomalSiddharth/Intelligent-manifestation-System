import { useEffect, useState } from 'react';
import { Plus, Search, Filter as FilterIcon, Users, ExternalLink, Trash2, Brain, Ghost } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
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
  updateMindProfile
} from '@/db/api';
import type { AudienceUser, MindProfile } from '@/types/types';
import ConversationsView from '@/components/access/ConversationsView';
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
import AddPhoneDialog from '@/components/access/AddPhoneDialog';

const AccessPage = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AudienceUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AudienceUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isAddIntegrationDialogOpen, setIsAddIntegrationDialogOpen] = useState(false);
  const [isAddPhoneDialogOpen, setIsAddPhoneDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('users');
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(undefined);
  const [profiles, setProfiles] = useState<MindProfile[]>([]);
  const currentProfile = profiles.find(p => p.id === selectedProfileId);

  // Selection & Delete State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [idToDelete, setIdToDelete] = useState<string | 'bulk' | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    initProfiles();
  }, []);

  useEffect(() => {
    if (selectedProfileId) {
      fetchData();
    }
  }, [statusFilter, selectedProfileId]);

  useEffect(() => {
    filterUsers();
    // Reset selection when filtering or changing views
    setSelectedIds([]);
  }, [users, searchQuery]);

  const initProfiles = async () => {
    try {
      const data = await getMindProfiles();
      setProfiles(data);
      if (data.length > 0) {
        const primary = data.find(p => p.is_primary) || data[0];
        setSelectedProfileId(primary.id);
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const usersData = await getAudienceUsers(statusFilter, selectedProfileId);
      console.log(`[ACCESS] Fetched ${usersData.length} users for filter: ${statusFilter}`);
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
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
                      {profiles.map(profile => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
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
            </div>
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
          </div>

          {/* Filters */}
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

          {/* User Table */}
          {loading ? (
            <Skeleton className="h-[500px] bg-muted" />
          ) : (
            <UserTable
              users={filteredUsers}
              selectedIds={selectedIds}
              onSelectUser={handleSelectUser}
              onSelectAll={handleSelectAll}
              onDeleteUser={(id) => setIdToDelete(id)}
              onRevokeUser={handleRevokeUser}
            />
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


    // ... inside renderContent
    if (activeSection === 'external') {
      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold">External Integrations</h1>
            <p className="text-muted-foreground text-lg">Connect your Clone with your audience and external tools</p>
          </div>

          <div>
            <Button
              onClick={() => setIsAddIntegrationDialogOpen(true)}
              className="bg-[#1A1A1A] hover:bg-black text-white rounded-full px-6 h-10 font-medium"
            >
              Add Integration +
            </Button>
          </div>

          {/* Placeholder for list if needed, currently just empty state implied */}
          <div className="mt-8 border rounded-xl p-8 text-center text-muted-foreground bg-muted/20 border-dashed">
            <p>No active external integrations. Click "Add Integration" to get started.</p>
          </div>
        </div>
      );
    }

    if (activeSection === 'phone') {
      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold">Phone Integrations</h1>
            <p className="text-muted-foreground text-lg">Connect your Clone with your audience and external tools</p>
          </div>

          <div>
            <Button
              onClick={() => setIsAddPhoneDialogOpen(true)}
              className="bg-[#1A1A1A] hover:bg-black text-white rounded-full px-6 h-10 font-medium"
            >
              Add Phone Number +
            </Button>
          </div>

          <div className="mt-8 border rounded-xl p-8 text-center text-muted-foreground bg-muted/20 border-dashed">
            <p>No phone number connected. Click "Add Phone Number" to provision one.</p>
          </div>
        </div>
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
      const widgetUrl = `${window.location.origin}/widget/${selectedProfileId}`;
      const embedCode = `<iframe 
  src="${widgetUrl}" 
  width="100%" 
  height="600" 
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
                    <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
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
                  Your widget is protected. Visitors will be asked to verify their email before they can start chatting with {currentProfile?.name || 'your AI'}.
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
              <div className="border rounded-2xl overflow-hidden bg-white shadow-xl aspect-[9/12] max-h-[600px] relative group">
                <iframe
                  src={widgetUrl}
                  className="w-full h-full border-none"
                  title="Widget Preview"
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

      {/* Integrations Dialogs */}
      <AddIntegrationDialog
        open={isAddIntegrationDialogOpen}
        onOpenChange={setIsAddIntegrationDialogOpen}
      />
      <AddPhoneDialog
        open={isAddPhoneDialogOpen}
        onOpenChange={setIsAddPhoneDialogOpen}
      />

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
