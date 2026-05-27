'use client';
import { useEffect, useState } from 'react';
import { Search, AlertCircle, Filter } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import MindSidebar from '@/components/mind/MindSidebar';
import FolderSidebar from '@/components/mind/FolderSidebar';
import ContentList from '@/components/mind/ContentList';
import ContentSettingsDialog from '@/components/mind/ContentSettingsDialog';
import ProfileView from '@/components/mind/sections/ProfileView';
import BiographyView from '@/components/mind/sections/BiographyView';
import SocialLinksView from '@/components/mind/sections/SocialLinksView';
import PurposeInstructionsView from '@/components/mind/sections/PurposeInstructionsView';
import SpeakingStyleView from '@/components/mind/sections/SpeakingStyleView';
import ResponseSettingsView from '@/components/mind/sections/ResponseSettingsView';
import SuggestedQuestionsView from '@/components/mind/sections/SuggestedQuestionsView';
import ExperienceSettingsView from '@/components/mind/sections/ExperienceSettingsView';

import CloneQualityView from '@/components/mind/sections/CloneQualityView';
import UserQuestionsView from '@/components/mind/sections/UserQuestionsView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AddContentDialog from '@/components/mind/AddContentDialog';
import {
  getContentItems,
  getFolders,
  getFailedContentCount,
  getTotalWordCount,
  deleteContentItem,
  createFolder,
  getMindProfiles,
  createMindProfile,
  updateMindProfile,
  deleteMindProfile,
  moveContentToFolder,
  updateContentItem,
} from '@/db/api';
import type { ContentItem, Folder } from '@/types/types';
import { supabase } from '@/db/supabase';

const MindPage = () => {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [failedCount, setFailedCount] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadContent, setUploadContent] = useState('');
  const [_isUploading, setIsUploading] = useState(false);
  
  // Settings dialog
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<ContentItem | null>(null);

  // Filter States
  const [selectedContentType, setSelectedContentType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedAccessGroup, setSelectedAccessGroup] = useState<string>('all');
  const [selectedWordCount, setSelectedWordCount] = useState<string>('all');
  const [selectedDatePublished, setSelectedDatePublished] = useState<string>('all');

  // Navigation State
  const [activeTab, setActiveTab] = useState('content');
  const [activeSection, setActiveSection] = useState('profile');

  const { toast } = useToast();

  useEffect(() => {
    initProfiles();
  }, []);

  useEffect(() => {
    console.log('🔄 [MindPage] Tab/Section Change:', { activeTab, activeSection, selectedProfileId });
    if (selectedProfileId === null) return;

    fetchData();

    // Champion Realtime: Auto-refresh when background processing finishes
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'knowledge_sources'
        },
        (payload) => {
          console.log('🔄 [MindPage] Realtime Update:', payload);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFolder, selectedProfileId, activeTab]);

  useEffect(() => {
    if (selectedProfileId && selectedProfileId !== 'all') {
      localStorage.setItem('globalSelectedProfileId', selectedProfileId);
    }
  }, [selectedProfileId]);

  const initProfiles = async () => {
    try {
      const dbProfiles = await getMindProfiles();
      console.log('🔍 Initialization - Found profiles:', dbProfiles.length);

      if (dbProfiles.length > 0) {
        setProfiles(dbProfiles);
        
        const savedId = localStorage.getItem('globalSelectedProfileId');
        const exists = savedId ? dbProfiles.some((p: any) => p.id === savedId) : false;
        const targetId = exists ? savedId : (dbProfiles.find((p: any) => p.is_primary)?.id || dbProfiles[0].id);
        
        setSelectedProfileId(targetId);

        // Ensure at least one is marked primary in DB if none are
        if (!dbProfiles.some((p: any) => p.is_primary)) {
          console.log('⚠️ No primary profile found, marking', primary.name, 'as primary');
          await updateMindProfile({ is_primary: true }, primary.id);
          // Update local state too
          setProfiles(prev => prev.map(p => p.id === primary.id ? { ...p, is_primary: true } : p));
        }
      } else {
        console.log('➕ No profiles found for user. Auto-creation disabled to prevent duplicates.');
        // Disable auto-creation for now to prevent redundant rows
        // const newProfile = await createMindProfile('MiteshAI');
        // await updateMindProfile({ is_primary: true }, newProfile.id);
        // const primaryProfile = { ...newProfile, is_primary: true };
        // setProfiles([primaryProfile]);
        // setSelectedProfileId(primaryProfile.id);

        // Just toast warning
        toast({
          title: "Profile Not Found",
          description: "Could not find your master profile. Please check database permissions or user linking.",
          variant: "destructive"
        });
      }
    } catch (e) {
      console.error("Init profiles error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProfile = async (name: string) => {
    try {
      const newProfile = await createMindProfile(name);
      setProfiles(prev => [...prev, newProfile]);
      setSelectedProfileId(newProfile.id);
      toast({
        title: "Success",
        description: `New clone "${name}" created.`,
      });
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to create clone.",
        variant: "destructive"
      });
    }
  };
  const handleDeleteProfile = async () => {
    if (!selectedProfileId) return;
    const profileToDelete = profiles.find(p => p.id === selectedProfileId);
    if (!profileToDelete) return;

    if (profileToDelete.is_primary) {
      toast({
        title: "Cannot Delete",
        description: "MiteshAI cannot be deleted.",
        variant: "destructive"
      });
      return;
    }

    if (!confirm(`Are you sure you want to delete "${profileToDelete.name || 'this clone'}"? This cannot be undone.`)) return;

    try {
      await deleteMindProfile(selectedProfileId);
      const remaining = profiles.filter(p => p.id !== selectedProfileId);
      setProfiles(remaining);
      if (remaining.length > 0) {
        setSelectedProfileId(remaining[0].id);
      } else {
        setSelectedProfileId(null);
      }
      toast({
        title: "Deleted",
        description: "Clone deleted successfully.",
      });
    } catch (e) {
      toast({
        title: "Error",
        description: "Failed to delete clone.",
        variant: "destructive"
      });
    }
  };

  const fetchData = async () => {
    try {
      console.log('🔄 [MindPage] Fetching data for profile:', selectedProfileId, 'folder:', selectedFolder);
      setLoading(true);
      const [items, foldersList, failed, words] = await Promise.all([
        getContentItems(selectedFolder || undefined, selectedProfileId === 'all' ? undefined : (selectedProfileId || undefined)),
        getFolders(selectedProfileId === 'all' ? undefined : (selectedProfileId || undefined)),
        getFailedContentCount(selectedProfileId === 'all' ? undefined : (selectedProfileId || undefined)),
        getTotalWordCount(selectedProfileId === 'all' ? undefined : (selectedProfileId || undefined)),
      ]);

      console.log('📦 [MindPage] Content items fetched:', items.length);
      console.log('📂 [MindPage] Folders fetched:', foldersList.length);
      console.log('📊 [MindPage] Stats:', { failed, words });

      // Calculate total words from items as a robust fallback
      const calculatedWords = items.reduce((sum, item) => sum + (item.word_count || 0), 0);

      setContentItems(items);
      setFolders(foldersList);
      setFailedCount(failed);
      setTotalWords(words > 0 ? words : calculatedWords);
    } catch (error) {
      console.error('❌ [MindPage] Fetch error:', error);
      toast({
        title: 'Error',
        description: 'Failed to load content. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteContent = async (id: string) => {
    try {
      await deleteContentItem(id);
      toast({
        title: 'Success',
        description: 'Content deleted successfully.',
      });
      fetchData();
    } catch (error) {
      console.error('Error deleting content:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete content.',
        variant: 'destructive',
      });
    }
  };

  const handleMoveContent = async (id: string, folderId: string | null) => {
    try {
      await moveContentToFolder(id, folderId);
      toast({
        title: 'Success',
        description: 'Content moved successfully.',
      });
      fetchData();
    } catch (error) {
      console.error('Error moving content:', error);
      toast({
        title: 'Error',
        description: 'Failed to move content.',
        variant: 'destructive',
      });
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      await createFolder(newFolderName, selectedProfileId || undefined);
      setNewFolderName('');
      setIsFolderDialogOpen(false);
      toast({
        title: 'Success',
        description: 'Folder created successfully.',
      });
      fetchData();
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: 'Error',
        description: 'Failed to create folder.',
        variant: 'destructive',
      });
    }
  };

  const handleUpload = async () => {
    if (!uploadContent.trim()) return;

    try {
      setIsUploading(true);
      const { data, error } = await supabase.functions.invoke('ingest-content', {
        body: {
          content: uploadContent,
          profileId: selectedProfileId,
          metadata: {
            type: 'text',
            source: 'user-upload',
            timestamp: new Date().toISOString(),
          },
        },
      });

      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error);

      toast({
        title: 'Success',
        description: 'Content uploaded to Knowledge Base successfully.',
      });
      setUploadContent('');
      setIsUploadDialogOpen(false);
      fetchData(); // Refresh content list if we were showing it (though ingest might not immediately show up in the list if it's just vector store, but good practice)
    } catch (error) {
      console.error('Error uploading content:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload content. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const filteredItems = contentItems.filter((item) => {
    // Search filter - SAFE ACCESS
    const matchesSearch = (item.title || '').toLowerCase().includes(searchQuery.toLowerCase());

    // Content Type filter
    const matchesContentType = selectedContentType === 'all' ||
      (item.type || '').toLowerCase() === selectedContentType.toLowerCase();

    // Status filter
    const matchesStatus = selectedStatus === 'all' ||
      (item.status || '').toLowerCase() === selectedStatus.toLowerCase();

    // Word count filter
    let matchesWordCount = true;
    const wc = item.word_count || 0;
    if (selectedWordCount === '< 500') matchesWordCount = wc < 500;
    if (selectedWordCount === '500 - 2000') matchesWordCount = wc >= 500 && wc <= 2000;
    if (selectedWordCount === '> 2000') matchesWordCount = wc > 2000;

    // Access Group filter (assuming it is stored in item.metadata.accessGroup, default to all for now)
    const matchesAccessGroup = selectedAccessGroup === 'all' || 
      ((item.metadata as any)?.accessGroup || 'insiders').toLowerCase() === selectedAccessGroup.toLowerCase();

    // Date Published filter
    let matchesDate = true;
    if (selectedDatePublished !== 'all' && item.uploaded_at) {
      const date = new Date(item.uploaded_at);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (selectedDatePublished === '7 days') matchesDate = diffDays <= 7;
      if (selectedDatePublished === '30 days') matchesDate = diffDays <= 30;
      if (selectedDatePublished === '90 days') matchesDate = diffDays <= 90;
      if (selectedDatePublished === '1 year') matchesDate = diffDays <= 365;
    }

    return matchesSearch && matchesContentType && matchesStatus && matchesWordCount && matchesAccessGroup && matchesDate;
  });

  const renderContent = () => {
    const activeProfile = profiles.find(p => p.id === selectedProfileId);

    if (activeTab === 'content') {
      return (
        <>
          {/* Middle Sidebar - Folders */}
          <div className="w-64 border-r bg-background/50">
            <FolderSidebar
              folders={folders}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              onCreateFolder={() => setIsFolderDialogOpen(true)}
              totalWordCount={totalWords}
            />

            {/* Create Folder Dialog */}
            <Dialog open={isFolderDialogOpen} onOpenChange={setIsFolderDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Folder</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="folderName">Folder Name</Label>
                    <Input
                      id="folderName"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="Enter folder name"
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                    />
                  </div>
                  <Button onClick={handleCreateFolder} className="w-full">
                    Create Folder
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-auto bg-background">
            <div className="container p-8 space-y-6">
              {/* Header */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-lg font-semibold text-muted-foreground">
                      <div className="p-1 border rounded bg-background">
                        <div className="w-4 h-4 bg-muted-foreground/20" />
                      </div>
                      <span>All Content</span>
                    </div>
                    {failedCount > 0 && (
                      <Badge variant="destructive" className="gap-1 bg-red-500 hover:bg-red-600 border-none">
                        <AlertCircle className="h-3 w-3" />
                        {failedCount} Failed Documents
                      </Badge>
                    )}
                  </div>

                  <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="bg-black text-white hover:bg-black/90 rounded-full px-6">
                        Add Content
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="!max-w-[95vw] !h-[95vh] p-0 overflow-hidden">
                      <DialogHeader>
                        <DialogTitle>Add Content</DialogTitle>
                      </DialogHeader>
                      <AddContentDialog
                        onClose={() => setIsUploadDialogOpen(false)}
                        onUpload={handleUpload}
                        profileId={selectedProfileId!}
                      />
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Search and Filters */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 max-w-2xl">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 rounded-full bg-muted/30 border-muted-foreground/20"
                      />
                    </div>
                  </div>
                </div>

                {/* Filters Row */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger className="rounded-full h-8 px-4 text-xs font-medium border-border/50 bg-background w-auto gap-2 hover:bg-muted/50 transition-colors">
                      <span className="text-muted-foreground">Status</span>
                      {selectedStatus !== 'all' && <span className="text-foreground border-l pl-2 border-border/50">{selectedStatus}</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="processing">Learning</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedContentType} onValueChange={setSelectedContentType}>
                    <SelectTrigger className="rounded-full h-8 px-4 text-xs font-medium border-border/50 bg-background w-auto gap-2 hover:bg-muted/50 transition-colors">
                      <span className="text-muted-foreground">Content Type</span>
                      {selectedContentType !== 'all' && <span className="text-foreground border-l pl-2 border-border/50">{selectedContentType}</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="File">File</SelectItem>
                      <SelectItem value="QA / Manual">QA / Manual</SelectItem>
                      <SelectItem value="Notion">Notion</SelectItem>
                      <SelectItem value="Website">Website</SelectItem>
                      <SelectItem value="YouTube">YouTube</SelectItem>
                      <SelectItem value="Podcast">Podcast</SelectItem>
                      <SelectItem value="Granola">Granola</SelectItem>
                      <SelectItem value="Evernote">Evernote</SelectItem>
                      <SelectItem value="Slack">Slack</SelectItem>
                      <SelectItem value="X">X</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="Facebook">Facebook</SelectItem>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedAccessGroup} onValueChange={setSelectedAccessGroup}>
                    <SelectTrigger className="rounded-full h-8 px-4 text-xs font-medium border-border/50 bg-background w-auto gap-2 hover:bg-muted/50 transition-colors">
                      <span className="text-muted-foreground">Access Group</span>
                      {selectedAccessGroup !== 'all' && <span className="text-foreground border-l pl-2 border-border/50">{selectedAccessGroup}</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Groups</SelectItem>
                      <SelectItem value="Insiders">Insiders</SelectItem>
                      <SelectItem value="Public">Public</SelectItem>
                      <SelectItem value="Collaborator">Collaborator</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedWordCount} onValueChange={setSelectedWordCount}>
                    <SelectTrigger className="rounded-full h-8 px-4 text-xs font-medium border-border/50 bg-background w-auto gap-2 hover:bg-muted/50 transition-colors">
                      <span className="text-muted-foreground">Word Count</span>
                      {selectedWordCount !== 'all' && <span className="text-foreground border-l pl-2 border-border/50">{selectedWordCount}</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Length</SelectItem>
                      <SelectItem value="< 500">{"< 500 words"}</SelectItem>
                      <SelectItem value="500 - 2000">{"500 - 2000 words"}</SelectItem>
                      <SelectItem value="> 2000">{"> 2000 words"}</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedDatePublished} onValueChange={setSelectedDatePublished}>
                    <SelectTrigger className="rounded-full h-8 px-4 text-xs font-medium border-border/50 bg-background w-auto gap-2 hover:bg-muted/50 transition-colors">
                      <span className="text-muted-foreground">Date Published</span>
                      {selectedDatePublished !== 'all' && <span className="text-foreground border-l pl-2 border-border/50">{selectedDatePublished}</span>}
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Date</SelectItem>
                      <SelectItem value="7 days">Last 7 days</SelectItem>
                      <SelectItem value="30 days">Last 30 days</SelectItem>
                      <SelectItem value="90 days">Last 90 days</SelectItem>
                      <SelectItem value="1 year">Last 1 year</SelectItem>
                    </SelectContent>
                  </Select>

                  {(selectedStatus !== 'all' || selectedContentType !== 'all' || selectedAccessGroup !== 'all' || selectedWordCount !== 'all' || selectedDatePublished !== 'all') && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-3 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-50/50 rounded-full ml-1"
                      onClick={() => {
                        setSelectedStatus('all');
                        setSelectedContentType('all');
                        setSelectedAccessGroup('all');
                        setSelectedWordCount('all');
                        setSelectedDatePublished('all');
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  Showing {filteredItems.length} items • {totalWords.toLocaleString()} total words
                </div>
              </div>

              {/* Content List */}
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-[400px] bg-muted" />
                </div>
              ) : (
                <>
                  <ContentList
                    items={filteredItems}
                    onDelete={handleDeleteContent}
                    folders={folders}
                    onMove={handleMoveContent}
                    onSettingsClick={setSelectedItemForEdit}
                  />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Total {contentItems.length.toLocaleString()} items synchronized
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <ContentSettingsDialog
            item={selectedItemForEdit}
            isOpen={selectedItemForEdit !== null}
            onClose={() => setSelectedItemForEdit(null)}
            onSave={async (id, updates) => {
              try {
                await updateContentItem(id, updates);
                setContentItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
                toast({
                  title: "Success",
                  description: "Content settings updated successfully.",
                });
              } catch (error) {
                console.error("Error updating content:", error);
                toast({
                  title: "Error",
                  description: "Failed to update content settings.",
                  variant: "destructive",
                });
              }
            }}
            folders={folders}
          />
        </>
      );
    }

    // Render other sections
    return (
      <div className="flex-1 overflow-auto bg-background">
        <>
          {activeSection === 'profile' && <ProfileView profileId={selectedProfileId!} initialData={activeProfile} onDelete={handleDeleteProfile} />}
          {activeSection === 'biography' && <BiographyView profileId={selectedProfileId!} initialData={activeProfile} />}
          {activeSection === 'social-links' && <SocialLinksView profileId={selectedProfileId!} initialData={activeProfile} />}
          {activeSection === 'purpose' && <PurposeInstructionsView profileId={selectedProfileId!} initialData={activeProfile} />}
          {activeSection === 'speaking-style' && <SpeakingStyleView profileId={selectedProfileId!} initialData={activeProfile} />}
          {activeSection === 'response-settings' && <ResponseSettingsView profileId={selectedProfileId!} initialData={activeProfile} />}
          {activeSection === 'suggested-questions' && <SuggestedQuestionsView profileId={selectedProfileId!} initialData={activeProfile} />}
          {activeSection === 'experience-settings' && <ExperienceSettingsView profileId={selectedProfileId!} initialData={activeProfile} />}
          {activeSection === 'clone-quality' && <CloneQualityView profileId={selectedProfileId!} initialData={activeProfile} />}
          {activeSection === 'user-questions' && (
            <>
              {console.log("!!!!!!!!!!!! MindPage: Rendering UserQuestionsView with profileId:", selectedProfileId)}
              <UserQuestionsView profileId={selectedProfileId!} />
            </>
          )}
        </>
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="flex h-[calc(100vh-4rem)] bg-background">
        <MindSidebar
          profiles={profiles}
          selectedProfileId={selectedProfileId!}
          onProfileChange={setSelectedProfileId}
          onAddProfile={handleCreateProfile}
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            if (tab === 'content') {
              setActiveSection(''); // Clear active section when going to content explorer
            }
          }}
          activeSection={activeSection}
          onSectionChange={(section) => {
            setActiveSection(section);
            setActiveTab('settings'); // Switch away from 'content' tab when a section is selected
          }}
        />
        {renderContent()}
      </div>
    </MainLayout>
  );
};

export default MindPage;
