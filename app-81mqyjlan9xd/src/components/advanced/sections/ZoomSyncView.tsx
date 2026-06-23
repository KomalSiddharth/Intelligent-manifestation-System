import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/db/supabase';
import { toast } from 'sonner';
import { Video, Calendar, Users, CheckCircle, AlertCircle, Play, List, Zap } from 'lucide-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

interface SessionInfo {
    id: string;
    name: string;
    date: string;
    type: string;
    participants: number;
    detectedLabel: string;
}

interface SyncResult {
    webinarsProcessed: number;
    attendanceRecords: number;
    skipped: number;
    errors: number;
    totalFound?: number;
    remaining?: number;
    note?: string;
    dateRange: { from: string; to: string };
    webinars: { sessionName: string; sessionDate: string; participants: number; synced?: number; wouldSync?: number }[];
    dryRun?: boolean;
}

const LABEL_COLORS: Record<string, string> = {
    DMP: 'bg-blue-100 text-blue-700',
    CHAKRA: 'bg-purple-100 text-purple-700',
    PLATINUM: 'bg-yellow-100 text-yellow-700',
    RELATIONSHIP_MASTERY: 'bg-pink-100 text-pink-700',
    WEALTH_MASTERY: 'bg-green-100 text-green-700',
    MIND_MASTERY: 'bg-indigo-100 text-indigo-700',
    AI_MANIFESTATION: 'bg-cyan-100 text-cyan-700',
    BRAD_YATES: 'bg-orange-100 text-orange-700',
    SUPPORT: 'bg-gray-100 text-gray-700',
    MASTERCLASS: 'bg-red-100 text-red-700',
    HEALING: 'bg-teal-100 text-teal-700',
    MEDITATION: 'bg-violet-100 text-violet-700',
};

const ZoomSyncView = () => {
    const [loading, setLoading] = useState(false);
    const [sessionList, setSessionList] = useState<SessionInfo[] | null>(null);
    const [result, setResult] = useState<SyncResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [syncProgress, setSyncProgress] = useState<{ done: number; total: number; records: number } | null>(null);
    const [syncingSession, setSyncingSession] = useState<string | null>(null);  // ID of session being synced
    const [syncedSessions, setSyncedSessions] = useState<Set<string>>(new Set()); // IDs already synced

    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [fallbackLabel, setFallbackLabel] = useState('OTHER');

    const getToken = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token ?? SUPABASE_ANON_KEY;
    };

    const callSync = async (body: object) => {
        const token = await getToken();
        const res = await fetch(`${SUPABASE_URL}/functions/v1/zoom-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    };

    // ── Sync ONE specific session by ID ───────────────────────
    const syncOneSession = async (session: SessionInfo) => {
        setSyncingSession(session.id);
        try {
            let pageToken = "";
            let totalSaved = 0;
            do {
                const data = await callSync({
                    dryRun:          false,
                    sessionId:       session.id,
                    sessionZoomType: session.type,
                    sessionName:     session.name,
                    sessionDate:     session.date,
                    detectedLabel:   session.detectedLabel,
                    pageToken,
                });
                totalSaved += data.attendanceRecords ?? 0;
                pageToken   = data.nextPageToken ?? "";
                if (pageToken) await new Promise(r => setTimeout(r, 150));
            } while (pageToken);

            setSyncedSessions(prev => new Set([...prev, session.id]));
            toast.success(`✅ "${session.name}" — ${totalSaved} records saved`);
        } catch (e: any) {
            toast.error(`❌ "${session.name}" failed: ${e.message}`);
        } finally {
            setSyncingSession(null);
        }
    };

    // ── List all sessions without fetching participants ────────
    const listAllSessions = async () => {
        setLoading(true);
        setSessionList(null);
        setError(null);
        setResult(null);
        try {
            const data = await callSync({ fromDate, toDate, listOnly: true, sessionType: fallbackLabel });
            setSessionList(data.sessions ?? []);
            toast.info(`Found ${data.total} sessions in Zoom`);
        } catch (e: any) {
            setError(e.message);
            toast.error('Failed: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Sync ALL sessions using direct session ID mode ────────
    const syncAll = async () => {
        setLoading(true);
        setResult(null);
        setError(null);
        setSyncProgress(null);

        try {
            // Step 1: Use already-loaded session list OR fetch once
            let allSessions = (sessionList ?? []).filter(s => s.detectedLabel !== 'SKIP');

            if (allSessions.length === 0) {
                toast.info('Fetching session list from Zoom...');
                const listData = await callSync({ fromDate, toDate, listOnly: true, sessionType: fallbackLabel });
                allSessions = (listData.sessions ?? []).filter((s: any) => !s.skip && s.detectedLabel !== 'SKIP');
                setSessionList(listData.sessions ?? []);
            } else {
                toast.info(`Using cached list of ${allSessions.length} sessions`);
            }

            const total = allSessions.length;
            if (total === 0) { toast.info('No sessions found'); setLoading(false); return; }
            toast.info(`Syncing ${total} sessions one by one...`);

            let totalRecords = 0;
            let totalSkipped = 0;
            let failedCount  = 0;

            // Step 2: For each session, page through participants (300 at a time)
            for (let i = 0; i < allSessions.length; i++) {
                const session = allSessions[i];
                setSyncProgress({ done: i, total, records: totalRecords });

                try {
                    let pageToken = "";
                    let pageNum   = 0;

                    // Loop through all pages for this session
                    do {
                        const data = await callSync({
                            dryRun:          false,
                            sessionId:       session.id,
                            sessionZoomType: session.type,
                            sessionName:     session.name,
                            sessionDate:     session.date,
                            detectedLabel:   session.detectedLabel,
                            sessionType:     fallbackLabel,
                            pageToken,       // empty on first call
                        });

                        totalRecords += data.attendanceRecords ?? 0;
                        totalSkipped += data.skipped ?? 0;
                        pageToken     = data.nextPageToken ?? "";
                        pageNum++;

                        if (pageToken) await new Promise(r => setTimeout(r, 150));
                    } while (pageToken);  // keep going until all pages done

                } catch (err: any) {
                    console.warn(`Session "${session.name}" failed: ${err.message}`);
                    failedCount++;
                }

                await new Promise(r => setTimeout(r, 150));
            }

            setSyncProgress({ done: total, total, records: totalRecords });
            toast.success(`✅ All done! ${totalRecords} attendance records saved`);
            setResult({
                webinarsProcessed: total,
                attendanceRecords: totalRecords,
                skipped: totalSkipped,
                errors: failedCount,
                dateRange: { from: fromDate, to: toDate },
                webinars: [],
            });
        } catch (e: any) {
            setError(e.message);
            toast.error('Sync failed: ' + e.message);
        } finally {
            setLoading(false);
            setSyncProgress(null);
        }
    };

    // ── Group sessions by label for display (exclude SKIP) ───
    const grouped = sessionList
        ? sessionList
            .filter(s => s.detectedLabel !== 'SKIP')
            .reduce((acc, s) => {
                const key = s.detectedLabel;
                if (!acc[key]) acc[key] = [];
                acc[key].push(s);
                return acc;
            }, {} as Record<string, SessionInfo[]>)
        : null;

    const skippedList = sessionList?.filter(s => s.detectedLabel === 'SKIP') ?? [];

    return (
        <div className="flex-1 overflow-auto p-6 max-w-3xl">
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-1">
                    <Video className="w-5 h-5 text-blue-500" />
                    <h2 className="text-xl font-semibold">Zoom Attendance Sync</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                    Fetch all Zoom meetings & webinars → store attendance → AI sees member journey
                </p>
            </div>

            {/* Date Range */}
            <Card className="mb-4">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Date Range
                    </CardTitle>
                    <CardDescription className="text-xs">Zoom supports up to 12 months history</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">From</label>
                            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">To</label>
                            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                        Session types (DMP, CHAKRA, WEALTH_MASTERY etc.) are auto-detected from session names.
                        Fallback label for unrecognised sessions:
                    </p>
                    <input type="text" value={fallbackLabel} onChange={e => setFallbackLabel(e.target.value)}
                        placeholder="OTHER"
                        className="mt-1 w-full px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <Button onClick={listAllSessions} disabled={loading} variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50">
                    <List className="w-4 h-4 mr-2" />
                    {loading ? 'Loading...' : 'List All Sessions'}
                </Button>
                <Button onClick={syncAll} disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 text-white">
                    <Zap className="w-4 h-4 mr-2" />
                    {loading ? 'Syncing...' : 'Sync All Sessions'}
                </Button>
            </div>

            {/* Sync Progress Bar */}
            {syncProgress && (
                <Card className="mb-4 border-blue-200 bg-blue-50">
                    <CardContent className="pt-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-blue-800">
                                Syncing... {syncProgress.done}/{syncProgress.total} sessions
                            </span>
                            <span className="text-sm text-blue-600">{syncProgress.records} records saved</span>
                        </div>
                        <div className="w-full bg-blue-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(syncProgress.done / syncProgress.total) * 100}%` }} />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Session List grouped by type */}
            {grouped && (
                <Card className="mb-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <List className="w-4 h-4" />
                            All Sessions Found — {sessionList!.length} total
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Grouped by auto-detected type. Click "Sync All" to save attendance for all.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                            {Object.entries(grouped)
                                .sort(([a], [b]) => b.localeCompare(a))
                                .map(([label, sessions]) => (
                                <div key={label}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${LABEL_COLORS[label] ?? 'bg-gray-100 text-gray-700'}`}>
                                            {label}
                                        </span>
                                        <span className="text-xs text-muted-foreground">{sessions.length} sessions</span>
                                    </div>
                                    <div className="space-y-1 ml-2">
                                        {sessions.map((s, i) => (
                                            <div key={i} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5 gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium truncate">{s.name}</p>
                                                    <p className="text-xs text-muted-foreground">{s.date} · <Users className="w-3 h-3 inline" /> {s.participants}</p>
                                                </div>
                                                <button
                                                    onClick={() => syncOneSession(s)}
                                                    disabled={!!syncingSession}
                                                    className={`flex-shrink-0 text-xs px-2 py-1 rounded font-medium transition-all ${
                                                        syncedSessions.has(s.id)
                                                            ? 'bg-green-100 text-green-700 cursor-default'
                                                            : syncingSession === s.id
                                                            ? 'bg-blue-100 text-blue-700 animate-pulse'
                                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                                    }`}
                                                >
                                                    {syncedSessions.has(s.id) ? '✅ Done' : syncingSession === s.id ? 'Syncing...' : '⚡ Sync'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Final Sync Result */}
            {result && (
                <Card className="mb-4 border-green-200 bg-green-50">
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-2 mb-3">
                            <CheckCircle className="w-5 h-5 text-green-600" />
                            <span className="font-medium text-green-800">✅ Sync Complete</span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-center mb-3">
                            <div className="bg-white rounded-lg p-2">
                                <p className="text-xl font-bold">{result.webinarsProcessed}</p>
                                <p className="text-xs text-muted-foreground">Sessions</p>
                            </div>
                            <div className="bg-white rounded-lg p-2">
                                <p className="text-xl font-bold text-green-600">{result.attendanceRecords}</p>
                                <p className="text-xs text-muted-foreground">Saved</p>
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
                        <p className="text-xs text-green-700 font-medium">
                            🧠 MiteshAI will now see full attendance journey for all members
                        </p>
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
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Setup Instructions */}
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
                            <span className="font-medium text-foreground">3. List first:</span>{' '}
                            Click "List All Sessions" to verify all sessions are detected correctly
                        </p>
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">4. Sync All:</span>{' '}
                            Click "Sync All Sessions" — auto-batches all sessions, shows live progress
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default ZoomSyncView;
