import { useEffect, useState } from 'react';
import { Search, AlertCircle, Filter } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import MindSidebar from '@/components/mind/MindSidebar';
import FolderSidebar from '@/components/mind/FolderSidebar';
import ContentList from '@/components/mind/ContentList';
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

  // Filter States
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedContentType, setSelectedContentType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedMemoryType, setSelectedMemoryType] = useState<string>('all');

  // Navigation State
  const [activeTab, setActiveTab] = useState('content');
  const [activeSection, setActiveSection] = useState('profile');

  const { toast } = useToast();

  useEffect(() => {
    initProfiles();
  }, []);

  useEffect(() => {
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
          console.log('🔄 Realtime Update:', payload);
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedFolder, selectedProfileId]);

  const initProfiles = async () => {
    try {
      const dbProfiles = await getMindProfiles();
      console.log('🔍 Initialization - Found profiles:', dbProfiles.length);

      if (dbProfiles.length > 0) {
        setProfiles(dbProfiles);
        // Prioritize primary, then latest update
        const primary = dbProfiles.find((p: any) => p.is_primary) || dbProfiles[0];
        setSelectedProfileId(primary.id);

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
      setLoading(true);
      const [items, foldersList, failed, words] = await Promise.all([
        getContentItems(selectedFolder || undefined, selectedProfileId === 'all' ? undefined : (selectedProfileId || undefined)),
        getFolders(),
        getFailedContentCount(selectedProfileId || undefined),
        getTotalWordCount(selectedProfileId || undefined),
      ]);

      console.log('📦 Content items fetched:', items.length);
      console.log('📂 Folders fetched:', foldersList.length);

      console.log('📦 Content items fetched:', items.length, items);

      // Calculate total words from items as a robust fallback
      const calculatedWords = items.reduce((sum, item) => sum + (item.word_count || 0), 0);
      console.log('📊 Calculated total words from items:', calculatedWords);

      setContentItems(items);
      setFolders(foldersList);
      setFailedCount(failed);

      // Use words from backend if available, else calculated fallback
      setTotalWords(words > 0 ? words : calculatedWords);
    } catch (error) {
      console.error('Error fetching content data:', error);
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
    // Search filter
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());

    // Content Type filter
    const matchesContentType = selectedContentType === 'all' ||
      item.type?.toLowerCase() === selectedContentType.toLowerCase();

    // Status filter
    const matchesStatus = selectedStatus === 'all' ||
      item.status?.toLowerCase() === selectedStatus.toLowerCase();

    // Memory Type filter (assuming there's a field like 'createdBy' or 'author')
    const matchesMemoryType = selectedMemoryType === 'all' ||
      (selectedMemoryType === 'by-me' && item.isOwnContent) ||
      (selectedMemoryType === 'by-others' && !item.isOwnContent);

    return matchesSearch && matchesContentType && matchesStatus && matchesMemoryType;
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
                    <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="rounded-full border-muted-foreground/20 gap-2">
                          Edit Filters
                          <Filter className="h-3 w-3" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Edit Filters</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          {/* Content Type Filter */}
                          <div className="space-y-2">
                            <Label>Content Type</Label>
                            <select
                              value={selectedContentType}
                              onChange={(e) => setSelectedContentType(e.target.value)}
                              className="w-full p-2 border rounded-md bg-background"
                            >
                              <option value="all">All Types</option>
                              <option value="file">File</option>
                              <option value="podcast">Podcast</option>
                              <option value="twitter">Twitter</option>
                              <option value="pdf">PDF</option>
                              <option value="website">Website</option>
                              <option value="youtube">YouTube</option>
                              <option value="tiktok">TikTok</option>
                              <option value="manual">Manual</option>
                              <option value="qa">Q&A</option>
                              <option value="slack">Slack</option>
                              <option value="facebook">Facebook</option>
                              <option value="email">Email</option>
                              <option value="instagram">Instagram</option>
                              <option value="linkedin">LinkedIn</option>
                              <option value="image">Image</option>
                            </select>
                          </div>

                          {/* Status Filter */}
                          <div className="space-y-2">
                            <Label>Status</Label>
                            <select
                              value={selectedStatus}
                              onChange={(e) => setSelectedStatus(e.target.value)}
                              className="w-full p-2 border rounded-md bg-background"
                            >
                              <option value="all">All Status</option>
                              <option value="complete">✓ Complete</option>
                              <option value="failed">● Failed</option>
                              <option value="queued">○ Queued</option>
                              <option value="processing">○ Processing</option>
                              <option value="deleting">○ Deleting</option>
                            </select>
                          </div>

                          {/* Memory Type Filter */}
                          <div className="space-y-2">
                            <Label>Memory Type</Label>
                            <select
                              value={selectedMemoryType}
                              onChange={(e) => setSelectedMemoryType(e.target.value)}
                              className="w-full p-2 border rounded-md bg-background"
                            >
                              <option value="all">All</option>
                              <option value="by-me">By Me</option>
                              <option value="by-others">By Others</option>
                            </select>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-4">
                            <Button
                              variant="outline"
                              className="flex-1 rounded-full"
                              onClick={() => {
                                setSelectedContentType('all');
                                setSelectedStatus('all');
                                setSelectedMemoryType('all');
                              }}
                            >
                              Reset
                            </Button>
                            <Button
                              className="flex-1 rounded-full bg-black text-white hover:bg-black/90"
                              onClick={() => setIsFilterOpen(false)}
                            >
                              Apply
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Showing {filteredItems.length} items • {totalWords.toLocaleString()} total words
                  </div>
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
