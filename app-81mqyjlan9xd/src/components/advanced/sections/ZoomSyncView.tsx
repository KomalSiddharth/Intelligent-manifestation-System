import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Video, Calendar, Users, CheckCircle, AlertCircle, Play } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface SyncResult {
    webinarsProcessed: number;
    attendanceRecords: number;
    skipped: number;
    errors: number;
    dateRange: { from: string; to: string };
    webinars: { sessionName: string; sessionDate: string; participants: number; synced?: number; wouldSync?: number }[];
    dryRun?: boolean;
}

const ZoomSyncView = () => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<SyncResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [sessionType, setSessionType] = useState('DMP');
    const [dryRun, setDryRun] = useState(true); // default to preview first

    const runSync = async (preview: boolean) => {
        setLoading(true);
        setResult(null);
        setError(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token ?? SUPABASE_ANON_KEY;

            const res = await fetch(`${SUPABASE_URL}/functions/v1/zoom-sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    fromDate,
                    toDate,
                    sessionType,
                    dryRun: preview,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Sync failed');

            setResult(data);
            if (preview) {
                toast.info(`Preview: ${data.webinarsProcessed} webinars, ${data.attendanceRecords} records would be saved`);
            } else {
                toast.success(`Synced! ${data.attendanceRecords} attendance records saved`);
            }
        } catch (e: any) {
            setError(e.message);
            toast.error('Sync failed: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 overflow-auto p-6 max-w-3xl">
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <Video className="w-5 h-5 text-blue-500" />
                    <h2 className="text-xl font-semibold">Zoom Attendance Sync</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    Fetch webinar attendance from Zoom → store in DB → AI sees member consistency
                </p>
            </div>

            {/* Date Range */}
            <Card className="mb-4">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Date Range
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Zoom Reports API supports up to 12 months of history
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">From</label>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={e => setFromDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">To</label>
                            <input
                                type="date"
                                value={toDate}
                                onChange={e => setToDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Session Type */}
            <Card className="mb-4">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Session Type Label</CardTitle>
                    <CardDescription className="text-xs">
                        How to categorise these sessions in DB (e.g. DMP, Webinar, Coaching)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <input
                        type="text"
                        value={sessionType}
                        onChange={e => setSessionType(e.target.value)}
                        placeholder="DMP"
                        className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <Button
                    onClick={() => runSync(true)}
                    disabled={loading}
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                    {loading ? 'Running...' : '👁️ Preview (dry run)'}
                </Button>
                <Button
                    onClick={() => runSync(false)}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <Play className="w-4 h-4 animate-pulse" /> Syncing...
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <Play className="w-4 h-4" /> Sync Now
                        </span>
                    )}
                </Button>
            </div>

            {/* Result */}
            {result && (
                <Card className={`mb-4 ${result.dryRun ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'}`}>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-3">
                            <CheckCircle className={`w-5 h-5 ${result.dryRun ? 'text-blue-600' : 'text-green-600'}`} />
                            <span className={`font-medium ${result.dryRun ? 'text-blue-800' : 'text-green-800'}`}>
                                {result.dryRun ? '👁️ Preview Result' : '✅ Sync Complete'}
                            </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-center mb-4">
                            <div className="bg-white rounded-lg p-2">
                                <p className="text-xl font-bold text-gray-900">{result.webinarsProcessed}</p>
                                <p className="text-xs text-muted-foreground">Webinars</p>
                            </div>
                            <div className="bg-white rounded-lg p-2">
                                <p className="text-xl font-bold text-green-600">{result.attendanceRecords}</p>
                                <p className="text-xs text-muted-foreground">{result.dryRun ? 'Would save' : 'Saved'}</p>
                            </div>
                            <div className="bg-white rounded-lg p-2">
                                <p className="text-xl font-bold text-orange-500">{result.skipped}</p>
                                <p className="text-xs text-muted-foreground">Not in DB</p>
                            </div>
                            <div className="bg-white rounded-lg p-2">
                                <p className="text-xl font-bold text-red-500">{result.errors}</p>
                                <p className="text-xs text-muted-foreground">Errors</p>
                            </div>
                        </div>

                        {result.skipped > 0 && (
                            <p className="text-xs text-orange-600 mb-3 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                {result.skipped} attendees not found in audience_users — import contacts first to capture them
                            </p>
                        )}

                        {/* Webinar breakdown */}
                        {result.webinars && result.webinars.length > 0 && (
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Webinar breakdown:</p>
                                {result.webinars.map((w, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white rounded px-2 py-1">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate">{w.sessionName}</p>
                                            <p className="text-xs text-muted-foreground">{w.sessionDate}</p>
                                        </div>
                                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                            <span className="text-xs text-muted-foreground">
                                                <Users className="w-3 h-3 inline mr-1" />
                                                {w.participants}
                                            </span>
                                            <Badge variant="secondary" className="text-xs">
                                                {result.dryRun ? `${w.wouldSync ?? 0} would save` : `${w.synced ?? 0} saved`}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!result.dryRun && (
                            <p className="text-xs text-green-700 mt-3 font-medium">
                                🧠 MiteshAI will now see attendance consistency for all members
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Error */}
            {error && (
                <Card className="mb-4 border-red-200 bg-red-50">
                    <CardContent className="pt-4">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-red-700">Sync Failed</p>
                                <p className="text-xs text-red-600 mt-1">{error}</p>
                                {error.includes('ZOOM_') && (
                                    <p className="text-xs text-red-500 mt-2">
                                        → Add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET to Supabase Secrets
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Instructions */}
            <Card className="bg-muted/30">
                <CardContent className="pt-4">
                    <p className="text-xs font-medium mb-2">Setup required (one-time):</p>
                    <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">1. Add Secrets:</span>{' '}
                            Supabase → Edge Functions → Secrets → Add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
                        </p>
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">2. Deploy Function:</span>{' '}
                            Add zoom-sync Edge Function in Supabase with the code from GitHub
                        </p>
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">3. Run SQL migration:</span>{' '}
                            supabase/migrations/20260603_zoom_attendance.sql in SQL Editor
                        </p>
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">4. Preview first:</span>{' '}
                            Click "Preview" to see what will be synced before saving
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ZoomSyncView;
