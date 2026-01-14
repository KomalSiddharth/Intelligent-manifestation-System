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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  getAnalyticsMetrics,
  getLatestMetrics,
  getInsights,
  getAudienceUsers,
} from '@/db/api';
import type { AnalyticsMetric, Insight, AudienceUser, ChartDataPoint } from '@/types/types';

const InsightsPage = () => {
  const [timeRange, setTimeRange] = useState('7');
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [latestMetrics, setLatestMetrics] = useState<AnalyticsMetric | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [topUsers, setTopUsers] = useState<AudienceUser[]>([]);

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

        const [metricsData, latest, insightsData, usersData] = await Promise.all([
          getAnalyticsMetrics(days),
          getLatestMetrics(),
          getInsights(3),
          getAudienceUsers('active'),
        ]);

        const formattedChartData: ChartDataPoint[] = metricsData.map((m) => ({
          date: m.date,
          value: m.total_conversations,
        }));

        setChartData(formattedChartData);
        setLatestMetrics(latest);
        setInsights(insightsData);
        setTopUsers(usersData.slice(0, 2));
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

  return (
    <MainLayout>
      <div className="container mx-auto p-4 xl:p-8 space-y-10 relative z-10">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-extrabold tracking-tight">
              <span className="text-muted-foreground font-medium">{getGreeting()},</span>{' '}
              <span className="text-gradient">Mitesh</span>
            </h1>
            <p className="text-muted-foreground font-medium">Here's what's happening with your AI mind today.</p>
          </div>
          <div className="glass p-1 rounded-xl">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full xl:w-[200px] border-none bg-transparent font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="glass">
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {loading ? (
            <>
              <Skeleton className="h-[320px] bg-muted" />
              <Skeleton className="h-[320px] bg-muted" />
            </>
          ) : (
            <>
              <ConversationChart
                data={chartData}
                totalConversations={latestMetrics?.total_conversations || 0}
                change={calculateChange(
                  latestMetrics?.total_conversations || 0,
                  chartData[0]?.value || 0
                )}
              />
              <ConversationChart
                data={chartData}
                totalConversations={latestMetrics?.total_conversations || 0}
                change={calculateChange(
                  latestMetrics?.total_conversations || 0,
                  chartData[0]?.value || 0
                )}
              />
            </>
          )}
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {loading ? (
            <>
              <Skeleton className="h-[140px] bg-muted" />
              <Skeleton className="h-[140px] bg-muted" />
              <Skeleton className="h-[140px] bg-muted" />
              <Skeleton className="h-[140px] bg-muted" />
            </>
          ) : (
            <>
              <MetricCard
                label="Active Users"
                value={latestMetrics?.active_users || 0}
                change={-9.4}
              />
              <MetricCard
                label="Time Created"
                value={`${Math.floor((latestMetrics?.time_created_minutes || 0) / 60)}h ${(latestMetrics?.time_created_minutes || 0) % 60}m`}
                change={-6.2}
              />
              <MetricCard
                label="Messages Answered"
                value={latestMetrics?.messages_answered || 0}
                change={-18.5}
              />
              <MetricCard
                label="Messages Unanswered"
                value={latestMetrics?.messages_unanswered || 0}
                change={0}
                changeLabel="0%"
              />
            </>
          )}
        </div>

        {/* Insights and User Spotlight */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Left Column - Trending Topics and Insights */}
          <div className="space-y-6">
            <Card className="premium-card overflow-hidden">
              <CardHeader className="border-b border-orange-500/5 bg-orange-500/[0.02]">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-orange-500 opacity-60">
                  Trending last {timeRange} days
                </CardTitle>
                <h2 className="text-2xl font-black tracking-tight text-foreground">Most popular topics</h2>
              </CardHeader>
              <CardContent className="p-8">
                <div className="flex flex-col items-center justify-center h-48 text-center space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-orange-50 flex items-center justify-center text-3xl">
                    🔥
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-lg">No topics found yet</p>
                    <p className="text-sm text-muted-foreground max-w-[250px]">
                      Topics will appear here as your audience starts interacting more with your AI mind.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Insights and User Spotlight */}
          <div className="space-y-6">
            {loading ? (
              <>
                <Skeleton className="h-[200px] bg-muted" />
                <Skeleton className="h-[200px] bg-muted" />
              </>
            ) : (
              <>
                {insights.map((insight) => (
                  <InsightCard key={insight.id} insight={insight} />
                ))}
                {topUsers.map((user) => (
                  <UserSpotlight key={user.id} user={user} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default InsightsPage;
