import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ImportFromCSVDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId?: string;
  onUserAdded?: () => void;
}

export default function ImportFromCSVDialog({ open, onOpenChange, profileId, onUserAdded }: ImportFromCSVDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [userCount, setUserCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
        toast({
          title: "Invalid file type",
          description: "Please select a CSV file.",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      parseCSVPreview(file);
    }
  };

  const parseCSVPreview = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter(line => line.trim() !== "");
      setUserCount(Math.max(0, lines.length - 1));
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string): Array<{ email: string; tags: string[]; name: string }> => {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) throw new Error("CSV is empty or missing data rows");

    // Improved header parsing (strip quotes)
    const headers = lines[0].split(",").map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    console.log("CSV Headers identified:", headers);

    const emailIndex = headers.indexOf("email");
    const tagsIndex = headers.indexOf("tags");
    const nameIndex = headers.indexOf("name");

    if (emailIndex === -1) {
      throw new Error("CSV must contain an 'email' column header");
    }

    const users: Array<{ email: string; tags: string[]; name: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple split, then strip quotes
      const values = line.split(",").map(v => v.trim().replace(/^["']|["']$/g, ''));
      const email = values[emailIndex];

      if (!email) continue;

      const tags = tagsIndex !== -1 && values[tagsIndex]
        ? values[tagsIndex].split(";").map(t => t.trim()).filter(t => t !== "")
        : [];

      const name = nameIndex !== -1 && values[nameIndex]
        ? values[nameIndex]
        : email.split("@")[0];

      users.push({ email, tags, name });
    }

    return users;
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);

    try {
      const text = await selectedFile.text();
      const users = parseCSV(text);

      if (users.length === 0) {
        throw new Error("No valid users found in CSV");
      }

      if (users.length === 0) {
        throw new Error("No valid users found in CSV");
      }

      const { bulkCreateAudienceUsers } = await import("@/db/api");

      // Bulk insert in chunks to avoid payload size limits
      const chunkSize = 500;
      for (let i = 0; i < users.length; i += chunkSize) {
        const chunk = users.slice(i, i + chunkSize);
        await bulkCreateAudienceUsers(
          chunk.map(user => ({
            name: user.name,
            email: user.email,
            tags: user.tags,
            message_count: 0,
            last_active: new Date().toISOString(),
          })),
          profileId
        );
      }

      toast({
        title: "Success",
        description: `${users.length} user(s) imported successfully.`,
      });

      if (onUserAdded) onUserAdded();
      handleCancel();
    } catch (error) {
      console.error("Error importing CSV:", error);
      toast({
        title: "Import failed",
        description: error instanceof Error ? `Error: ${error.message}` : "Failed to import users. check console for details.",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setUserCount(0);
    onOpenChange(false);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DialogTitle className="text-xl font-semibold">
              Import from CSV
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="text-sm text-muted-foreground space-y-3">
            <p>
              Upload a CSV with "email", "tags", and "name" columns.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />

          <Button
            variant="outline"
            onClick={handleUploadClick}
            className="w-full h-auto py-10 border-2 border-dashed"
          >
            <div className="flex flex-col items-center gap-2">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
              <span className="font-medium">
                {selectedFile ? selectedFile.name : "Select CSV file"}
              </span>
            </div>
          </Button>

          {selectedFile && (
            <p className="text-sm text-center font-medium">
              Detected {userCount} users
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={handleCancel} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || !selectedFile}
          >
            {isImporting ? "Importing..." : `Import ${userCount} users`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
