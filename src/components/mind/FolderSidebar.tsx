import { Folder, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { Folder as FolderType } from '@/types/types';

interface FolderSidebarProps {
  folders: FolderType[];
  selectedFolder: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: () => void;
  totalWordCount?: number;
}

const FolderSidebar = ({
  folders,
  selectedFolder,
  onSelectFolder,
  onCreateFolder,
  totalWordCount = 0,
}: FolderSidebarProps) => {
  return (
    <div className="w-full p-4 flex flex-col h-full">
      <div className="mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Content</h2>
          <span className="text-xs font-medium text-orange-500 bg-orange-50 px-2 py-1 rounded-full">
            {totalWordCount.toLocaleString()} words
          </span>
        </div>

        <div className="space-y-1">
          <button
            onClick={() => onSelectFolder(null)}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              selectedFolder === null ? "bg-muted shadow-sm" : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            <div className="w-4 h-4 grid grid-cols-2 gap-0.5">
              <div className={cn("rounded-[1px]", selectedFolder === null ? "bg-foreground" : "bg-muted-foreground")} />
              <div className={cn("rounded-[1px]", selectedFolder === null ? "bg-foreground" : "bg-muted-foreground")} />
              <div className={cn("rounded-[1px]", selectedFolder === null ? "bg-foreground" : "bg-muted-foreground")} />
              <div className={cn("rounded-[1px]", selectedFolder === null ? "bg-foreground" : "bg-muted-foreground")} />
            </div>
            <span>All</span>
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
            <div className="w-4 h-4 border-2 border-muted-foreground rounded-sm" />
            <span>Synced</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">FOLDERS</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCreateFolder}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 -mx-2 px-2">
        <div className="space-y-0.5">
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${selectedFolder === folder.id
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
            >
              <Folder className="h-4 w-4 fill-current" />
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FolderSidebar;
