import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Upload, Users, BookOpen, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type ImportType = 'members' | 'courses';

interface ImportResult {
    type: string;
    total: number;
    imported: number;
    updated: number;
    errors: number;
}

const KajabiImportView = () => {
    const [importType, setImportType] = useState<ImportType>('courses');
    const [csvText, setCsvText] = useState('');
    const [courseName, setCourseName] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleImport = async () => {
        if (!csvText.trim()) {
            toast.error('Please paste CSV data first');
            return;
        }
        if (importType === 'courses' && !courseName.trim()) {
            toast.error('Please enter the course name');
            return;
        }

        setLoading(true);
        setResult(null);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token ?? SUPABASE_ANON_KEY;

            const body: Record<string, any> = {
                type: importType,
                csv: csvText.trim(),
            };
            if (importType === 'courses' && courseName.trim()) {
                body.courseNameOverride = courseName.trim();
            }

            const res = await fetch(
                `${SUPABASE_URL}/functions/v1/kajabi-import`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify(body),
                }
            );

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Import failed');

            setResult(data);
            toast.success(`Import complete! ${data.imported} new, ${data.updated} updated`);
            setCsvText('');
        } catch (e: any) {
            setError(e.message);
            toast.error('Import failed: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const lineCount = csvText.trim() ? csvText.trim().split('\n').length - 1 : 0;

    return (
        <div className="flex-1 overflow-auto p-6 max-w-3xl">
            <div className="mb-6">
                <h2 className="text-xl font-semibold">Kajabi Data Import</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Import member and course progress data from Kajabi CSV exports
                </p>
            </div>

            {/* Step 1 — Choose type */}
            <Card className="mb-4">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Step 1 — What are you importing?</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setImportType('courses')}
                            className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
                                importType === 'courses'
                                    ? 'border-orange-500 bg-orange-50'
                                    : 'border-border hover:border-muted-foreground/30'
                            }`}
                        >
                            <BookOpen className={`w-5 h-5 mt-0.5 flex-shrink-0 ${importType === 'courses' ? 'text-orange-500' : 'text-muted-foreground'}`} />
                            <div>
                                <p className="font-medium text-sm">Course Progress</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    From Products → Course → Members → Export
                                </p>
                            </div>
                        </button>
                        <button
                            onClick={() => setImportType('members')}
                            className={`flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors ${
                                importType === 'members'
                                    ? 'border-orange-500 bg-orange-50'
                                    : 'border-border hover:border-muted-foreground/30'
                            }`}
                        >
                            <Users className={`w-5 h-5 mt-0.5 flex-shrink-0 ${importType === 'members' ? 'text-orange-500' : 'text-muted-foreground'}`} />
                            <div>
                                <p className="font-medium text-sm">All Contacts</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    From Contacts → All Contacts → Export
                                </p>
                            </div>
                        </button>
                    </div>
                </CardContent>
            </Card>

            {/* Step 2 — Course name (only for courses) */}
            {importType === 'courses' && (
                <Card className="mb-4">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Step 2 — Course Name</CardTitle>
                        <CardDescription className="text-xs">
                            Exact name of the course you're importing (e.g. "AI Manifestation Method")
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <input
                            type="text"
                            value={courseName}
                            onChange={e => setCourseName(e.target.value)}
                            placeholder="e.g. AI Manifestation Method"
                            className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                        />
                    </CardContent>
                </Card>
            )}

            {/* Step 3 — Paste CSV */}
            <Card className="mb-4">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">
                            Step {importType === 'courses' ? '3' : '2'} — Paste CSV Data
                        </CardTitle>
                        {lineCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                                {lineCount.toLocaleString()} rows detected
                            </Badge>
                        )}
                    </div>
                    <CardDescription className="text-xs">
                        Open the downloaded CSV file → Select All (Ctrl+A) → Copy → Paste below
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <textarea
                        value={csvText}
                        onChange={e => setCsvText(e.target.value)}
                        placeholder={
                            importType === 'courses'
                                ? 'Name,Email,Progress,Logins,Start Date,Last Activity At\nBalakrishna Hegde,bbhegde1@gmail.com,20%,3,2026-04-01,2026-05-23\n...'
                                : 'Name,Email,Status,Phone,Created At\nJohn Doe,john@example.com,active,,2026-01-01\n...'
                        }
                        rows={10}
                        className="w-full px-3 py-2 text-xs font-mono border rounded-md bg-muted/30 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                    />
                </CardContent>
            </Card>

            {/* Import button */}
            <Button
                onClick={handleImport}
                disabled={loading || !csvText.trim() || (importType === 'courses' && !courseName.trim())}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                size="lg"
            >
                {loading ? (
                    <>
                        <Upload className="w-4 h-4 mr-2 animate-pulse" />
                        Importing {lineCount > 0 ? `${lineCount.toLocaleString()} rows` : ''}...
                    </>
                ) : (
                    <>
                        <Upload className="w-4 h-4 mr-2" />
                        Import {lineCount > 0 ? `${lineCount.toLocaleString()} rows` : 'CSV'}
                    </>
                )}
            </Button>

            {/* Result */}
            {result && (
                <Card className="mt-4 border-green-200 bg-green-50">
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-3">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            <span className="font-medium text-green-800">
                                Import Complete — {result.type === 'courses' ? result.courseName || courseName : 'Members'}
                            </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center">
                            {/* total: use API value, fallback to sum of all outcomes */}
                            <div className="bg-white rounded-lg p-3">
                                <p className="text-2xl font-bold text-gray-900">
                                    {(result.total > 0 ? result.total : (result.imported + (result.updated ?? 0) + result.errors)).toLocaleString()}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">Total rows</p>
                            </div>
                            <div className="bg-white rounded-lg p-3">
                                <p className="text-2xl font-bold text-green-600">{result.imported.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground mt-1">✅ Saved</p>
                            </div>
                            <div className="bg-white rounded-lg p-3">
                                <p className="text-2xl font-bold text-blue-600">{(result.updated ?? 0).toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground mt-1">🔄 Updated</p>
                            </div>
                            <div className="bg-white rounded-lg p-3">
                                <p className="text-2xl font-bold text-red-500">{result.errors.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground mt-1">❌ Skipped</p>
                            </div>
                        </div>
                        {result.errors > 0 && (
                            <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Skipped rows usually have no email address — everything else imported fine.
                            </p>
                        )}
                        <p className="text-xs text-green-700 mt-3 font-medium">
                            🧠 MiteshAI will now see this course data when talking to these members.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Error */}
            {error && (
                <Card className="mt-4 border-red-200 bg-red-50">
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                            <XCircle className="w-5 h-5 text-red-500" />
                            <span className="text-sm text-red-700">{error}</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Instructions */}
            <Card className="mt-6 bg-muted/30">
                <CardContent className="pt-4">
                    <p className="text-xs font-medium mb-2">How to get the CSV from Kajabi:</p>
                    <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Course Progress:</span>{' '}
                            Kajabi Admin → Products → Click any course → Members tab → Export button (top right)
                        </p>
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">All Contacts:</span>{' '}
                            Kajabi Admin → Contacts → All Contacts → Export button (near Filters)
                        </p>
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">Note:</span>{' '}
                            Import each course separately with its exact course name. Do this once for historical data — webhooks handle new data automatically.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default KajabiImportView;
