import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, FileText, ExternalLink } from 'lucide-react';
import type { ContentItem } from '@/types/types';

interface ContentSettingsDialogProps {
  item: ContentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: any) => void;
  folders: any[];
}

export default function ContentSettingsDialog({ item, isOpen, onClose, onSave, folders }: ContentSettingsDialogProps) {
  if (!item) return null;

  const [name, setName] = useState(item.title || '');
  const [context, setContext] = useState(item.metadata?.context || '');
  const [publishedDate, setPublishedDate] = useState(item.uploaded_at?.split('T')[0] || '');
  const [isByMe, setIsByMe] = useState(true);
  const [citationUrl, setCitationUrl] = useState(item.url || '');
  const [hideCitations, setHideCitations] = useState(false);
  const [folderId, setFolderId] = useState(item.folder_id || 'none');
  const [accessGroup, setAccessGroup] = useState('insiders');

  const handleSave = () => {
    onSave(item.id, {
      title: name,
      metadata: {
        ...item.metadata,
        context,
        publishedDate,
        isByMe,
        hideCitations,
        accessGroup
      },
      url: citationUrl,
      folder_id: folderId === 'none' ? null : folderId
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] gap-0 p-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between border-b p-6 pb-4">
          <DialogTitle className="text-xl font-semibold">Content Settings</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-6 pt-2 space-y-6">

        <div className="flex items-center gap-6 mb-2">
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground font-medium">Status</div>
            <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200 hover:bg-green-50 gap-1.5 rounded-full px-3 py-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completed
            </Badge>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground font-medium">Type</div>
            <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1 bg-muted/50 text-muted-foreground">
              <FileText className="w-3.5 h-3.5" />
              {item.type || 'Manual'}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs text-muted-foreground font-medium">Word Count</div>
            <div className="text-sm font-medium px-1">{item.word_count || 0}</div>
          </div>
          <div className="space-y-1.5 ml-auto">
            <div className="text-xs text-muted-foreground font-medium text-transparent">Link</div>
            <Button variant="outline" size="sm" className="rounded-full gap-2 border-border/50">
              View Content <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-background rounded-lg" />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground flex items-center gap-1">
              Context <span className="w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center text-[9px] cursor-help">i</span>
            </Label>
            <Input value={context} onChange={(e) => setContext(e.target.value)} placeholder="My interview about: Humility in Sales" className="bg-background rounded-lg" />
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground flex items-center gap-1">
              Published Date <span className="w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center text-[9px] cursor-help">i</span>
            </Label>
            <Input type="date" value={publishedDate} onChange={(e) => setPublishedDate(e.target.value)} className="bg-background rounded-lg" />
          </div>

          <div className="space-y-3 pt-2">
            <Label className="text-muted-foreground flex items-center gap-1">
              Author <span className="w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center text-[9px] cursor-help">i</span>
            </Label>
            <div className="flex items-center space-x-2">
              <Checkbox id="isByMe" checked={isByMe} onCheckedChange={(checked) => setIsByMe(checked === true)} className="border-muted-foreground/30 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500" />
              <Label htmlFor="isByMe" className="font-medium">Content is by or about me</Label>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <Label className="text-muted-foreground flex items-center gap-1">
              Citation URL <span className="w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center text-[9px] cursor-help">i</span>
            </Label>
            <Input value={citationUrl} onChange={(e) => setCitationUrl(e.target.value)} placeholder="Citation URL" className="bg-background rounded-lg" />
          </div>

          <div className="flex items-center space-x-2 pt-1 pb-2">
            <Checkbox id="hideCitations" checked={hideCitations} onCheckedChange={(checked) => setHideCitations(checked === true)} className="border-muted-foreground/30 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500" />
            <Label htmlFor="hideCitations" className="font-medium">Hide citations</Label>
          </div>

          <div className="space-y-2">
            <Label className="text-muted-foreground">Folder</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger className="w-full bg-background rounded-lg">
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Folder</SelectItem>
                {folders.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pb-4">
            <Label className="text-muted-foreground">Access Group</Label>
            <Select value={accessGroup} onValueChange={setAccessGroup}>
              <SelectTrigger className="w-full bg-background rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="insiders"><div className="flex items-center gap-2"><span className="text-blue-500 text-lg leading-none mt-[-2px]">🔒</span> Insiders</div></SelectItem>
                <SelectItem value="public"><div className="flex items-center gap-2"><span className="text-green-500 text-lg leading-none mt-[-2px]">🌍</span> Public</div></SelectItem>
                <SelectItem value="collaborator"><div className="flex items-center gap-2"><span className="text-purple-500 text-lg leading-none mt-[-2px]">👥</span> Collaborator</div></SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        </div>

        <div className="flex items-center gap-3 p-6 pt-0 mt-auto">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-full border-border/50">
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1 rounded-full bg-muted-foreground/20 text-foreground hover:bg-muted-foreground/30">
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
