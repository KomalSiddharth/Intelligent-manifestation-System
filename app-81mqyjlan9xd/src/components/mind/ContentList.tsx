import { Settings, Trash2, Youtube, FileText, Rss, Music, Instagram, Twitter, Move } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { ContentItem } from '@/types/types';

interface ContentListProps {
  items: ContentItem[];
  onDelete: (id: string) => void;
  folders: any[];
  onMove: (id: string, folderId: string | null) => void;
}

const ContentList = ({ items, onDelete, folders, onMove }: ContentListProps) => {
  const getSourceIcon = (item: ContentItem) => {
    const title = (item.title || '').toLowerCase();
    const isVideo = title.endsWith('.mp4') || title.endsWith('.mov') || title.endsWith('.avi');
    const isAudio = title.endsWith('.mp3') || title.endsWith('.wav') || title.endsWith('.m4a') || title.endsWith('.aac') || title.endsWith('.ogg');
    const wordCount = item.word_count || 0;
    const isShort = wordCount < 100;

    // Highest priority: Short audio/video content
    if ((isVideo || isAudio) && isShort) {
      return <Instagram className="h-5 w-5 text-pink-500" />;
    }

    // Secondary priority: Extension based icons
    if (isVideo) {
      return <Youtube className="h-5 w-5 text-red-600" />;
    }

    if (isAudio) {
      return <Music className="h-5 w-5 text-blue-500" />;
    }

    // Default source type based icons
    const sourceType = (item.source_type || 'text').toLowerCase();
    switch (sourceType) {
      case 'youtube':
        return <Youtube className="h-5 w-5 text-red-600" />;
      case 'instagram':
        return <Instagram className="h-5 w-5 text-pink-500" />;
      case 'twitter':
        return <Twitter className="h-5 w-5 text-sky-400" />;
      case 'feed':
        return <Rss className="h-5 w-5 text-primary" />;
      default:
        return <FileText className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown Date';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch (e) {
      return 'Invalid Date';
    }
  };

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50%]">CONTENT</TableHead>
            <TableHead className="text-right">UPLOADED</TableHead>
            <TableHead className="text-right">ACTIONS</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center py-12 text-muted-foreground">
                No content found. Upload your first content to get started.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-start gap-3">
                    <div className="mt-1">{getSourceIcon(item)}</div>
                    <div className="space-y-1">
                      <p className="font-medium leading-tight">{item.title || 'Untitled'}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{item.source_type || 'Unknown'}</span>
                        <span>•</span>
                        <span>{(item.word_count === -1 || item.word_count === undefined) ? 'Processing...' : `${(item.word_count || 0).toLocaleString()} words`}</span>
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="space-y-1">
                    <p className="text-sm">{formatDate(item.uploaded_at)}</p>
                    {item.metadata?.source && (
                      <Badge variant="secondary" className="text-xs">
                        From {item.metadata.source}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <Move className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>Move to Folder</DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuItem onClick={() => onMove(item.id, null)}>
                              Root (No Folder)
                            </DropdownMenuItem>
                            {folders.map(folder => (
                              <DropdownMenuItem key={folder.id} onClick={() => onMove(item.id, folder.id)}>
                                {folder.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Button variant="ghost" size="icon">
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default ContentList;
