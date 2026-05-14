import { useState, useEffect } from 'react';
import mammoth from 'mammoth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    Youtube,
    Globe,
    Upload,
    ChevronRight,
    Table,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Helper: Configure Worker safely
const configurePdfWorker = () => {
    try {
        if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
        }
    } catch (e) {
        console.warn("Failed to set PDF worker", e);
    }
};

// Helper: Extract Text from PDF
const extractTextFromPDF = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let text = "";

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
            .map((item: any) => item.str)
            .join(" ");
        text += pageText + "\n\n";
    }

    return text.trim();
};

// Helper: Extract Text from DOCX
const extractTextFromDocx = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
};



interface AddContentDialogProps {
    onClose: () => void;
    onUpload: (content: any) => void;
    userId?: string;
    profileId: string;
}

const AddContentDialog = ({ onClose, onUpload, profileId }: AddContentDialogProps) => {
    useEffect(() => {
        configurePdfWorker();
    }, []);

    const [selectedCategory, setSelectedCategory] = useState('popular');
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [snippetTitle, setSnippetTitle] = useState('');
    const [snippetContent, setSnippetContent] = useState('');
    const [driveFolderUrl, setDriveFolderUrl] = useState('');

    // Socials state
    const [socialUrl, setSocialUrl] = useState('');
    const [autoSync, setAutoSync] = useState(false);
    const [integrationId, setIntegrationId] = useState<string | null>(null);

    useEffect(() => {
        const checkIntegration = async () => {
            try {
                const { getIntegrations } = await import('@/db/api');
                const integrations = await getIntegrations(profileId);
                const gd = integrations.find(i => i.platform === 'google_drive');
                if (gd) {
                    setIntegrationId(gd.id);
                    setAutoSync(gd.metadata?.auto_sync || false);
                }
            } catch (err) {
                console.error("Error checking integration:", err);
            }
        };
        if (profileId) checkIntegration();
    }, [profileId]);

    const handleAutoSyncToggle = async (checked: boolean) => {
        setAutoSync(checked);
        if (integrationId) {
            try {
                const { saveIntegration } = await import('@/db/api');
                await saveIntegration({
                    id: integrationId,
                    metadata: { auto_sync: checked }
                });
            } catch (err) {
                console.error("Failed to save sync preference:", err);
            }
        }
    };

    // Files state
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const [uploadingFiles, setUploadingFiles] = useState<string[]>([]); // Track which files are currently being uploaded
    const [folders, setFolders] = useState<any[]>([]);
    const [targetFolderId, setTargetFolderId] = useState<string>("");

    useEffect(() => {
        const fetchFolders = async () => {
            try {
                const { getFolders } = await import('@/db/api');
                const list = await getFolders(profileId);
                setFolders(list);
            } catch (err) {
                console.error("Error fetching folders for dialog:", err);
            }
        };
        if (profileId) fetchFolders();
    }, [profileId]);


    const handleUpload = async (type: 'text' | 'youtube' | 'pdf' | 'audio' | 'file' | 'social' | 'web' | 'spreadsheet', contentValue: string, titleValue: string, urlValue?: string) => {
        try {
            setLoading(true);
            const { ingestContent } = await import('@/db/api');
            await ingestContent(titleValue, contentValue, type as any, urlValue, undefined, profileId, targetFolderId || undefined);
            onUpload({ title: titleValue, type });
            onClose();
        } catch (error: any) {
            console.error("Upload error:", error);
            alert(`Upload failed: ${error.message || JSON.stringify(error)}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const validFiles = files.filter(file => {
                if (file.size > 500 * 1024 * 1024) {
                    alert(`File ${file.name} is too large (Max 500MB).`);
                    return false;
                }
                return true;
            });
            setSelectedFiles(prev => [...prev, ...validFiles]);
        }
    };

    const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files) {
            const files = Array.from(e.dataTransfer.files);
            const validFiles = files.filter(file => {
                if (file.size > 500 * 1024 * 1024) {
                    alert(`File ${file.name} is too large (Max 500MB).`);
                    return false;
                }
                return true;
            });
            setSelectedFiles(prev => [...prev, ...validFiles]);
        }
    };

    const processSingleFile = async (file: File) => {
        try {
            setUploadingFiles(prev => [...prev, file.name]);
            let extractedText = "";
            const fileType = file.type;
            const fileName = file.name.toLowerCase();

            const isMedia = fileType.startsWith('audio/') || fileType.startsWith('video/') ||
                fileName.endsWith('.mp3') || fileName.endsWith('.mp4') ||
                fileName.endsWith('.mpeg') || fileName.endsWith('.wav') ||
                fileName.endsWith('.m4a') || fileName.endsWith('.webm');

            if (isMedia) {
                const { ingestMedia } = await import('@/db/api');
                await ingestMedia(file, profileId, targetFolderId || undefined);
                onUpload({ title: file.name, type: 'file' });
                return;
            }

            if (fileType === "application/pdf" || fileName.endsWith('.pdf')) {
                try {
                    extractedText = await extractTextFromPDF(file);
                    if (!extractedText || extractedText.trim().length < 10) throw new Error("Extracted text too short, might be a scanned PDF.");
                } catch (pdfErr: any) {
                    console.warn("Client-side PDF extraction failed, falling back to server-side:", pdfErr.message);
                    const { ingestMedia } = await import('@/db/api');
                    await ingestMedia(file, profileId, targetFolderId || undefined); // Pass targetFolderId here
                    onUpload({ title: file.name, type: 'pdf' });
                    return;
                }
            } else if (
                fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                fileName.endsWith('.docx') ||
                fileName.endsWith('.doc')
            ) {
                extractedText = await extractTextFromDocx(file);
            } else if (fileType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.md')) {
                extractedText = await file.text();
            } else {
                // Fallback for unknown file types - try reading as text
                try {
                    extractedText = await file.text();
                } catch (e) {
                    throw new Error(`Unsupported file type: ${fileType}. Only documents, text, and media are supported.`);
                }
            }

            if (!extractedText || !extractedText.trim()) throw new Error(`Could not extract text from file (${fileName}).`);

            const { ingestContent } = await import('@/db/api');
            await ingestContent(file.name, extractedText, 'text', '', undefined, profileId, targetFolderId || undefined); // Pass targetFolderId here

            onUpload({ title: file.name, type: 'text' });
        } catch (error: any) {
            console.error(`Error processing ${file.name}:`, error);
            throw error;
        } finally {
            setUploadingFiles(prev => prev.filter(name => name !== file.name));
        }
    };

    const handleFileUpload = async () => {
        if (selectedFiles.length === 0) return;
        setLoading(true);

        const filesToProcess = [...selectedFiles];
        const failedFiles: string[] = [];

        for (const file of filesToProcess) {
            try {
                await processSingleFile(file);
                // Remove from selected files after success
                setSelectedFiles(prev => prev.filter(f => f !== file));
            } catch (error: any) {
                failedFiles.push(`${file.name}: ${error.message}`);
            }
        }

        if (failedFiles.length > 0) {
            alert(`Some files failed to process:\n${failedFiles.join('\n')}`);
        }

        if (selectedFiles.length === 0 || failedFiles.length === 0) {
            onClose();
        }
        setLoading(false);
    };

    const categories = [
        { id: 'popular', label: 'Popular' },
        { id: 'youtube', label: 'YouTube' },
        { id: 'spreadsheet', label: 'Google Sheet' },
        { id: 'socials', label: 'Socials' },
        { id: 'google-drive', label: 'Google Drive' },
        { id: 'files', label: 'Files' },
        { id: 'websites', label: 'Websites' },
        { id: 'snippets', label: 'Snippets' },
    ];

    const renderPopular = () => (
        <div className="space-y-6">
            <div className="border-2 border-dashed rounded-lg p-12 text-center bg-muted/20">
                <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-lg flex items-center justify-center">
                    <Upload className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                    Drag and drop your files here or{' '}
                    <span className="text-foreground font-medium cursor-pointer hover:underline">
                        click here to browse
                    </span>
                </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors group" onClick={() => setSelectedCategory('youtube')}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                                <Youtube className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h4 className="font-medium">Upload from YouTube</h4>
                                <p className="text-xs text-muted-foreground">Add videos or channels</p>
                            </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                </div>

                <div className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors group" onClick={() => setSelectedCategory('spreadsheet')}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                                <Table className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h4 className="font-medium">Google Sheet / Bulk</h4>
                                <p className="text-xs text-muted-foreground">Import links from spreadsheets</p>
                            </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                </div>
            </div>
        </div>
    );

    const renderWebsites = () => (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label>Enter Website URL</Label>
                <Input placeholder="https://example.com/article" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <Button onClick={() => handleUpload('web', 'Fetching...', 'Website Link', url)} disabled={loading || !url} className="w-full">
                {loading ? 'Processing...' : 'Import URL'}
            </Button>
        </div>
    );

    const renderYouTube = () => (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label>Paste YouTube URL</Label>
                <Input placeholder="https://youtube.com/watch?v=..." value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <Button onClick={() => handleUpload('youtube', 'YouTube Video', 'YouTube Video', url)} disabled={loading || !url} className="w-full bg-[#FC5859]">
                {loading ? "Processing..." : "Continue"}
            </Button>
        </div>
    );

    const renderSpreadsheet = () => (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label>Google Sheet URL (Public)</Label>
                <Input
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                    Must be set to "Anyone with the link can view". We will scan all links in the sheet.
                </p>
            </div>
            <Button
                onClick={() => handleUpload('spreadsheet' as any, 'Spreadsheet Import', 'Google Sheet', url)}
                disabled={loading || !url}
                className="w-full bg-green-600 hover:bg-green-700"
            >
                {loading ? "Scraping Sheet & Processing Links..." : "Start Bulk Ingestion"}
            </Button>
        </div>
    );

    const renderGoogleDrive = () => (
        <div className="space-y-6">
            <div className="border rounded-lg p-8 text-center bg-muted/20">
                <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-lg flex items-center justify-center">
                    <Globe className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Google Drive Sync</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                    Connect your Google Drive to import documents. You can also paste a specific folder link to sync transcripts from that folder.
                </p>

                {integrationId && (
                    <div className="max-w-md mx-auto mb-6 text-left">
                        <Label className="text-xs font-medium mb-1 block">Google Drive Folder Link (Optional)</Label>
                        <Input
                            placeholder="https://drive.google.com/drive/folders/..."
                            value={driveFolderUrl}
                            onChange={(e) => setDriveFolderUrl(e.target.value)}
                            className="bg-white/50"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Use this to sync only a specific folder instead of your entire drive.
                        </p>
                    </div>
                )}

                <div className="flex gap-4 justify-center">
                    <Button
                        className={cn("bg-primary text-white gap-2", integrationId && "bg-green-600 hover:bg-green-700")}
                        onClick={async () => {
                            try {
                                setLoading(true);
                                const { initiateGoogleDriveAuth } = await import('@/db/api');
                                await initiateGoogleDriveAuth(profileId);
                            } catch (err: any) {
                                alert("Failed to initiate Google Drive auth: " + err.message);
                            } finally {
                                setLoading(false);
                            }
                        }}
                        disabled={loading}
                    >
                        {loading ? "Redirecting..." : integrationId ? "Reconnect Google Drive" : "Connect Google Drive"}
                    </Button>

                    {integrationId && (
                        <Button
                            variant="outline"
                            className="gap-2"
                            onClick={async () => {
                                try {
                                    setLoading(true);
                                    const { supabase } = await import('@/db/supabase');
                                    const { data, error } = await supabase.functions.invoke('sync-drive', {
                                        body: {
                                            profileId,
                                            driveFolderUrl: driveFolderUrl.trim() || undefined
                                        }
                                    });

                                    if (error) {
                                        console.error("Invoke Error:", error);
                                        if (error.status === 401) {
                                            throw new Error("Supabase Auth expired. Please log out and back in. Also ensure 'Enforce JWT Verification' is DISABLED in Supabase Dashboard.");
                                        }
                                        throw new Error(`Edge Function error: ${error.message}`);
                                    }

                                    if (data.success === false) {
                                        if (data.error?.includes("session expired") || data.error?.includes("401")) {
                                            throw new Error("Your Google Drive connection has expired. Please click 'Reconnect Google Drive'.");
                                        }
                                        throw new Error(data.error || "Unknown sync error");
                                    }

                                    if (data.count === 0) {
                                        alert("Sync complete! No new or updated compatible documents were found since the last sync.");
                                    } else {
                                        alert(`Sync complete! Successfully imported ${data.count} new items.`);
                                    }
                                } catch (err: any) {
                                    alert("Sync failed: " + err.message);
                                } finally {
                                    setLoading(false);
                                }
                            }}
                            disabled={loading}
                        >
                            Sync Now
                        </Button>
                    )}
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="text-sm font-medium">Automatic Syncing</h4>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                        <Label>Real-time updates</Label>
                        <p className="text-xs text-muted-foreground">Automatically add new files as you save them to Drive.</p>
                    </div>
                    <Switch checked={autoSync} onCheckedChange={handleAutoSyncToggle} disabled={!integrationId} />
                </div>
            </div>
        </div>
    );

    const renderSocials = () => (
        <div className="space-y-6">
            <div className="space-y-2">
                <Label>Social Link</Label>
                <Input placeholder="https://x.com/..." value={socialUrl} onChange={(e) => setSocialUrl(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => handleUpload('social' as any, '', 'Social Post', socialUrl)} disabled={!socialUrl || loading}>
                {loading ? "Scraping..." : "Scrape"}
            </Button>
        </div>
    );

    const renderFiles = () => (
        <div className="space-y-6">
            <div
                className={cn(
                    "border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer",
                    dragActive ? "border-primary bg-primary/5" : "bg-muted/20"
                )}
                onClick={() => document.getElementById('file-upload')?.click()}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
            >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">Click to browse or drag and drop</p>
                <p className="text-xs text-muted-foreground mt-1">Accepts multiple documents, audio, or video files</p>
                <input id="file-upload" type="file" className="hidden" multiple onChange={handleFileSelect} />
            </div>

            {selectedFiles.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                    {selectedFiles.map((file, idx) => {
                        const isUploading = uploadingFiles.includes(file.name);
                        return (
                            <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded text-sm group">
                                <span className="truncate flex-1">{file.name}</span>
                                <div className="flex items-center gap-2">
                                    {isUploading && (
                                        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                    )}
                                    {!loading && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedFiles(prev => prev.filter((_, i) => i !== idx));
                                            }}
                                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <span className="text-xs">✕</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Button className="w-full bg-[#FC5859]" onClick={handleFileUpload} disabled={loading || selectedFiles.length === 0}>
                {loading ? `Processing (${uploadingFiles.length} uploading)...` : `Add ${selectedFiles.length} files to Brain`}
            </Button>

            {loading && (
                <div className="space-y-1">
                    <p className="text-[10px] text-center text-muted-foreground animate-pulse">
                        Sequential processing active. Please don't close this dialog.
                    </p>
                    <p className="text-[10px] text-center text-muted-foreground">
                        Files will appear in your Brain list as "Processing..." once uploaded.
                    </p>
                </div>
            )}
        </div>
    );

    const renderPodcasts = () => (
        <div className="text-center py-12 text-muted-foreground">Podcast integration coming soon...</div>
    );

    const renderSnippets = () => (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Title</Label>
                <Input value={snippetTitle} onChange={(e) => setSnippetTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
                <Label>Content</Label>
                <textarea className="w-full p-3 border rounded-md min-h-[200px]" value={snippetContent} onChange={(e) => setSnippetContent(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => handleUpload('text', snippetContent, snippetTitle)} disabled={loading || !snippetTitle || !snippetContent}>
                Add Snippet
            </Button>
        </div>
    );

    const renderNotesApps = () => (
        <div className="text-center py-12 text-muted-foreground">Notes integration coming soon...</div>
    );

    const renderMessagingApps = () => (
        <div className="text-center py-12 text-muted-foreground">Messaging integration coming soon...</div>
    );

    const renderContent = () => {
        switch (selectedCategory) {
            case 'popular': return renderPopular();
            case 'websites': return renderWebsites();
            case 'youtube': return renderYouTube();
            case 'spreadsheet': return renderSpreadsheet();
            case 'google-drive': return renderGoogleDrive();
            case 'socials': return renderSocials();
            case 'files': return renderFiles();
            case 'podcasts': return renderPodcasts();
            case 'snippets': return renderSnippets();
            case 'notes-apps': return renderNotesApps();
            case 'messaging-apps': return renderMessagingApps();
            default: return <div className="text-center text-muted-foreground py-12">Coming soon...</div>;
        }
    };

    return (
        <div className="flex h-[600px]">
            <div className="w-56 border-r bg-muted/20 p-4">
                <div className="space-y-1">
                    {categories.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={cn(
                                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                                selectedCategory === cat.id ? "bg-background font-medium shadow-sm" : "hover:bg-background/50 text-muted-foreground"
                            )}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto">
                <h2 className="text-xl font-semibold mb-6 capitalize">{selectedCategory.replace('-', ' ')}</h2>

                {/* Folder Selection (Common for all tabs) */}
                {folders.length > 0 && (
                    <div className="mb-6 space-y-2">
                        <Label className="text-xs text-muted-foreground">Add to Folder (Optional)</Label>
                        <select
                            value={targetFolderId}
                            onChange={(e) => setTargetFolderId(e.target.value)}
                            className="w-full h-9 px-3 py-1 rounded-md border border-input bg-background/50 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                            <option value="">No Folder (Root)</option>
                            {folders.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {renderContent()}
            </div>
        </div>
    );
};

export default AddContentDialog;
