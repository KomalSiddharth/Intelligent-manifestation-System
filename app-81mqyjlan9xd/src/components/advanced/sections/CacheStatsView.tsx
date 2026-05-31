import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/db/supabase';
import { getMindProfiles } from '@/db/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Zap, Database, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';

// Default warm queries — most common Mitesh AI coaching topics
const DEFAULT_WARM_QUERIES = [
    "what is law of attraction",
    "how to manifest money",
    "how to overcome fear",
    "morning routine for success",
    "how to stay motivated",
    "subconscious mind programming",
    "ho oponopono technique",
    "visualization practice",
    "how to set goals",
    "dealing with negative thoughts",
    "law of attraction exercise",
    "how to reprogram subconscious",
    "nlp techniques for success",
    "how to build confidence",
    "gratitude practice",
];

interface DayStat {
    date: string;
    l1_hit: number;
    l2_hit: number;
    l3_hit: number;
    l3_miss: number;
    llm_call: number;
    total: number;
    saved: number;
    hit_rate_pct: number;
    l3_rate_pct: number;
}

const CacheStatsView = () => {
    const [stats, setStats] = useState<DayStat[]>([]);
    const [kbVersion, setKbVersion] = useState<string | null>(null);
    const [profileId, setProfileId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [warming, setWarming] = useState(false);
    const [bumping, setBumping] = useState(false);

    // Load user's first profile ID
    useEffect(() => {
        getMindProfiles().then(profiles => {
            if (profiles?.[0]?.id) setProfileId(profiles[0].id);
        });
    }, []);

    const loadStats = useCallback(async () => {
        if (!profileId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('cache-stats', {
                body: { profileId },
            });
            if (error) throw error;
            setStats(data?.stats || []);
            setKbVersion(data?.kbVersion ?? null);
        } catch (e: any) {
            toast.error('Failed to load cache stats: ' + (e.message || e));
        } finally {
            setLoading(false);
        }
    }, [profileId]);

    useEffect(() => {
        if (profileId) loadStats();
    }, [profileId, loadStats]);

    const warmCache = async () => {
        if (!profileId) { toast.error('No profile found'); return; }
        setWarming(true);
        try {
            const { data, error } = await supabase.functions.invoke('warm-cache', {
                body: { profileId, queries: DEFAULT_WARM_QUERIES },
            });
            if (error) throw error;
            toast.success(`✅ Cache warmed: ${data.warmed} / ${data.total} queries pre-cached`);
            loadStats();
        } catch (e: any) {
            toast.error('Warm cache failed: ' + (e.message || e));
        } finally {
            setWarming(false);
        }
    };

    const bumpKbVersion = async () => {
        if (!profileId) { toast.error('No profile found'); return; }
        setBumping(true);
        try {
            const { data, error } = await supabase.functions.invoke('bump-kb-version', {
                body: { profileId },
            });
            if (error) throw error;
            toast.success(`🔄 KB version refreshed — ${data.keysDeleted} stale L3 entries cleared`);
            setKbVersion(null);
            loadStats();
        } catch (e: any) {
            toast.error('Failed to bump KB version: ' + (e.message || e));
        } finally {
            setBumping(false);
        }
    };

    const today = stats[0];

    return (
        <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-xl font-semibold flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-orange-500" />
                            Cache Analytics
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Monitor Redis cache layers and manage KB invalidation
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                {/* Today summary cards */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <Card>
                        <CardContent className="pt-5 pb-4">
                            <div className={`text-3xl font-bold ${today?.hit_rate_pct >= 60 ? 'text-green-600' : today?.hit_rate_pct >= 30 ? 'text-amber-500' : 'text-muted-foreground'}`}>
                                {today?.hit_rate_pct ?? 0}%
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 font-medium">LLM bypass today</div>
                            <div className="text-xs text-muted-foreground">
                                {today?.saved ?? 0} saved / {today?.total ?? 0} total reqs
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5 pb-4">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-bold text-blue-600">{today?.l1_hit ?? 0}</span>
                                <span className="text-muted-foreground">/</span>
                                <span className="text-2xl font-bold text-purple-600">{today?.l2_hit ?? 0}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 font-medium">L1 exact / L2 semantic hits</div>
                            <div className="text-xs text-muted-foreground">{today?.llm_call ?? 0} LLM calls made</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-5 pb-4">
                            <div className={`text-3xl font-bold ${today?.l3_rate_pct >= 50 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                                {today?.l3_rate_pct ?? 0}%
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 font-medium">L3 retrieval hit rate</div>
                            <div className="text-xs text-muted-foreground">
                                {today?.l3_hit ?? 0} hits / {today?.l3_miss ?? 0} misses
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Layer legend */}
                <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />L1 = exact key match (30 min)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />L2 = semantic vector (24 h)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />L3 = retrieval cache (12 h)</span>
                </div>

                {/* 7-day table */}
                <Card className="mb-6">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Last 7 Days</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {loading ? (
                            <div className="text-sm text-muted-foreground text-center py-6">Loading…</div>
                        ) : stats.every(s => s.total === 0) ? (
                            <div className="text-sm text-muted-foreground text-center py-6">
                                No data yet — stats appear after the first cached coaching response.
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {stats.map(s => {
                                    const isToday = s.date === new Date().toISOString().split('T')[0];
                                    return (
                                        <div
                                            key={s.date}
                                            className={`flex items-center justify-between text-sm py-2 px-2 rounded-md ${isToday ? 'bg-muted/50' : ''}`}
                                        >
                                            <div className="flex items-center gap-2 w-32">
                                                <span className="text-muted-foreground text-xs tabular-nums">{s.date}</span>
                                                {isToday && (
                                                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 py-0">today</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                <span>L1 <strong className="text-blue-600">{s.l1_hit}</strong></span>
                                                <span>L2 <strong className="text-purple-600">{s.l2_hit}</strong></span>
                                                <span>L3↑ <strong className="text-orange-600">{s.l3_hit}</strong></span>
                                                <span>LLM <strong className="text-foreground">{s.llm_call}</strong></span>
                                                <Badge
                                                    variant={s.hit_rate_pct >= 60 ? 'default' : s.hit_rate_pct >= 30 ? 'secondary' : 'outline'}
                                                    className="text-[10px] h-4 px-1.5 min-w-[48px] justify-center"
                                                >
                                                    {s.hit_rate_pct}% saved
                                                </Badge>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Action cards */}
                <div className="grid grid-cols-2 gap-4">
                    <Card>
                        <CardContent className="pt-5 pb-5 space-y-3">
                            <div>
                                <h3 className="font-medium text-sm flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-orange-500" />
                                    Warm Cache
                                </h3>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Pre-cache the 15 most common coaching topics so first-time visitors get instant
                                    responses instead of waiting for vector search.
                                </p>
                            </div>
                            <Button
                                onClick={warmCache}
                                disabled={warming || !profileId}
                                size="sm"
                                className="w-full bg-orange-500 hover:bg-orange-600"
                            >
                                {warming ? (
                                    <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Warming…</>
                                ) : (
                                    <><Zap className="w-3.5 h-3.5 mr-2" />Warm Now (15 Queries)</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-5 pb-5 space-y-3">
                            <div>
                                <h3 className="font-medium text-sm flex items-center gap-2">
                                    <Database className="w-4 h-4 text-blue-500" />
                                    Bump KB Version
                                </h3>
                                <p className="text-xs text-muted-foreground mt-1">
                                    After editing lessons in Supabase, click this to clear stale L2/L3 cache entries
                                    so users get fresh answers immediately.
                                </p>
                                {kbVersion && (
                                    <p className="text-[10px] font-mono text-muted-foreground mt-1">
                                        Current version: <span className="text-foreground">{kbVersion}</span>
                                    </p>
                                )}
                            </div>
                            <Button
                                onClick={bumpKbVersion}
                                disabled={bumping || !profileId}
                                variant="outline"
                                size="sm"
                                className="w-full"
                            >
                                {bumping ? (
                                    <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Refreshing…</>
                                ) : (
                                    <><Database className="w-3.5 h-3.5 mr-2" />Invalidate & Refresh</>
                                )}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default CacheStatsView;
