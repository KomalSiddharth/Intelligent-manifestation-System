import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import MetricCard from '@/components/insights/MetricCard';
import ConversationChart from '@/components/insights/ConversationChart';
import InsightCard from '@/components/insights/InsightCard';
import UserSpotlight from '@/components/insights/UserSpotlight';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAnalyticsMetrics, getLatestMetrics, getInsights, getAudienceUsers, getTotalWordCount } from '@/db/api';

// Expose API helpers globally for debugging in the browser console (development only)
if (typeof window !== 'undefined') {
  (window as any).getAnalyticsMetrics = getAnalyticsMetrics;
  (window as any).getLatestMetrics = getLatestMetrics;
  (window as any).getInsights = getInsights;
  (window as any).getAudienceUsers = getAudienceUsers;
  (window as any).getTotalWordCount = getTotalWordCount;
}

// Optional TypeScript global declarations (helps IDE autocomplete)
declare global {
  interface Window {
    getAnalyticsMetrics: typeof getAnalyticsMetrics;
    getLatestMetrics: typeof getLatestMetrics;
    getInsights: typeof getInsights;
    getAudienceUsers: typeof getAudienceUsers;
    getTotalWordCount: typeof getTotalWordCount;
  }
}
import type { AnalyticsMetric, Insight, AudienceUser, ChartDataPoint } from '@/types/types';

const InsightsPage = () => {
  const [timeRange, setTimeRange] = useState('7');
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<AnalyticsMetric | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [topUsers, setTopUsers] = useState<AudienceUser[]>([]);
  const [totalWords, setTotalWords] = useState(0);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const days = Number.parseInt(timeRange);

        const [metricsData, latest, insightsData, usersData, words] = await Promise.all([
          getAnalyticsMetrics(days),
          getLatestMetrics(),
          getInsights(3),
          getAudienceUsers('active'),
          getTotalWordCount(),
        ]);

        const formattedChartData: ChartDataPoint[] = metricsData.map((m) => ({
          date: m.date,
          value: m.total_conversations,
        }));

        setChartData(formattedChartData);
        setLatestMetrics(latest);
        setInsights(insightsData);
        setTopUsers(usersData.slice(0, 2));
        setTotalWords(words);
      } catch (error) {
        console.error('Error fetching insights data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  const calculateChange = (current: number, previous: number): number => {
    if (previous === 0) return 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const displayChartData = chartData.length > 0 ? chartData : Array.from({ length: Number.parseInt(timeRange) || 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - ((Number.parseInt(timeRange) || 7) - 1 - i));
    return { date: d.toISOString().split('T')[0], value: 0 };
  });

  const getRank = (words: number) => {
    const ranks = [
      { name: "Novice", threshold: 0 },
      { name: "Apprentice", threshold: 10000 },
      { name: "Scholar", threshold: 50000 },
      { name: "Master", threshold: 200000 },
      { name: "Legendary", threshold: 1000000 },
      { name: "Mythic", threshold: 5000000 },
      { name: "Eternal", threshold: 10000000 },
      { name: "Omniscient", threshold: 50000000 },
    ];
    let currentRank = ranks[0];
    let nextRank = ranks[1];
    for (let i = 0; i < ranks.length; i++) {
      if (words >= ranks[i].threshold) {
        currentRank = ranks[i];
        nextRank = ranks[i + 1] || ranks[i];
      }
    }
    const progress = nextRank.threshold > currentRank.threshold 
      ? Math.max(0, Math.min(100, ((words - currentRank.threshold) / (nextRank.threshold - currentRank.threshold)) * 100))
      : 100;
      
    return { currentRank, nextRank, progress };
  };

  const rankInfo = getRank(totalWords);

  return (
    <MainLayout>
      <div className="container mx-auto p-4 xl:p-8 space-y-6 relative z-10 max-w-6xl">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6 mb-8">
          <h1 className="text-3xl font-semibold text-foreground tracking-tight">
            {getGreeting()}, Mitesh!
          </h1>
          <Button className="bg-blue-500 hover:bg-blue-600 text-white rounded-full px-6 py-2 h-auto text-sm font-semibold shadow-sm">
            Publish
          </Button>
        </div>

        {/* Charts Section */}
        <div>
          {loading ? (
            <Skeleton className="h-[320px] w-full bg-muted rounded-xl" />
          ) : (
            <Card className="premium-card overflow-hidden">
              <div className="flex items-center justify-between p-6 pb-2">
                <div className="flex items-center gap-4">
                  <Select defaultValue="conversations">
                    <SelectTrigger className="w-[180px] border-none bg-transparent font-medium p-0 h-auto focus:ring-0 shadow-none text-muted-foreground hover:text-foreground transition-colors">
                      <SelectValue placeholder="Total Conversations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conversations">Total Conversations</SelectItem>
                      <SelectItem value="messages">Total Messages</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="w-[140px] border-none bg-transparent font-medium p-0 h-auto focus:ring-0 shadow-none text-muted-foreground hover:text-foreground transition-colors">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 14 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="text-sm font-bold text-red-500">
                  ↓3%
                </div>
              </div>
              
              <div className="px-6 pt-2 pb-6">
                <div className="text-4xl font-bold tracking-tight text-foreground mb-8">
                  {latestMetrics?.total_conversations?.toLocaleString() || "0"}
                </div>
                
                <div className="h-[200px] -mx-6 flex items-center justify-center">
                  <ConversationChart
                    data={displayChartData}
                    totalConversations={latestMetrics?.total_conversations || 0}
                    change={calculateChange(
                      latestMetrics?.total_conversations || 0,
                      chartData[0]?.value || 0
                    )}
                  />
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Mind Score and Analytics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {loading ? (
            <>
              <Skeleton className="h-[300px] w-full bg-muted rounded-xl" />
              <Skeleton className="h-[300px] w-full bg-muted rounded-xl" />
            </>
          ) : (
            <>
              {/* Mind Score Card */}
              <Card className="premium-card p-6 flex flex-col justify-between shadow-sm">
                <div className="flex justify-between items-start mb-6">
                  <div className="font-semibold text-foreground text-lg">Mind Score</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
                    Improving Mind Score... <span className="text-xs font-bold">↗</span>
                  </div>
                </div>
                <div className="mb-12 mt-4">
                  <div className="text-sm font-medium text-muted-foreground mb-1">{rankInfo.currentRank.name}</div>
                  <div className="text-[2.5rem] leading-none font-semibold tracking-tight text-foreground">
                    {totalWords >= 1000 ? (totalWords / 1000).toFixed(1) + 'K' : totalWords.toLocaleString()}
                  </div>
                </div>
                <div className="mt-auto">
                  <div className="flex justify-between text-xs text-muted-foreground mb-3">
                    <div>
                      <span className="font-medium text-muted-foreground">{rankInfo.currentRank.name}</span>
                      <div className="mt-0.5 font-medium">{rankInfo.currentRank.threshold.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <span className="font-medium text-muted-foreground">{rankInfo.nextRank.name}</span>
                      <div className="mt-0.5 font-medium">{rankInfo.nextRank.threshold.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                     <div className="text-muted-foreground/50 text-xs font-bold">→</div>
                     <div className="h-2.5 w-full bg-[#f3eae1] dark:bg-muted rounded-full overflow-hidden flex flex-1">
                        <div className="bg-[#cca869] h-full rounded-full transition-all duration-1000" style={{ width: `${Math.max(2, rankInfo.progress)}%` }}></div>
                     </div>
                  </div>
                </div>
              </Card>

              {/* Analytics Card */}
              <Card className="premium-card p-0 shadow-sm flex flex-col">
                <div className="flex justify-between items-center p-6 pb-4">
                  <div className="font-semibold text-foreground text-lg">Analytics</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    Last {timeRange} days
                  </div>
                </div>
                
                <div className="px-6 pb-6 space-y-0 flex-1 flex flex-col justify-between">
                  {/* Active Visitors */}
                  <div className="flex justify-between items-end border-b border-border/40 pb-5">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1.5">Active Visitors</div>
                      <div className="text-3xl font-semibold tracking-tight text-foreground">
                        {latestMetrics?.active_users?.toLocaleString() || "0"}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-green-600 mb-1">
                      {latestMetrics?.active_users ? '↑100%' : '0%'}
                    </div>
                  </div>
                  
                  {/* Total Messages */}
                  <div className="flex justify-between items-end border-b border-border/40 py-5">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1.5">Total Messages</div>
                      <div className="text-3xl font-semibold tracking-tight text-foreground">
                        {latestMetrics?.messages_answered?.toLocaleString() || "0"}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-green-600 mb-1">
                      {latestMetrics?.messages_answered ? '↑100%' : '0%'}
                    </div>
                  </div>
                  
                  {/* Avg Session Duration */}
                  <div className="flex justify-between items-end pt-5">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-1.5">Avg Session Duration</div>
                      <div className="text-3xl font-semibold tracking-tight text-foreground flex items-baseline">
                        {Math.floor((latestMetrics?.time_created_minutes || 0) / 60)}<span className="text-lg text-muted-foreground font-medium mx-1">h</span> 
                        {(latestMetrics?.time_created_minutes || 0) % 60}<span className="text-lg text-muted-foreground font-medium mx-1">m</span>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-muted-foreground mb-1">0%</div>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default InsightsPage;
