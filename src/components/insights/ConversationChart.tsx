import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import type { ChartDataPoint } from '@/types/types';

interface ConversationChartProps {
  data: ChartDataPoint[];
  totalConversations: number;
  change: number;
}

const ConversationChart = ({ data, totalConversations, change }: ConversationChartProps) => {
  const isNegative = change < 0;

  const chartConfig = {
    value: {
      label: 'Conversations',
      color: 'hsl(var(--primary))',
    },
  };

  return (
    <Card className="premium-card">
      <CardHeader>
        <div className="space-y-3">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">
            Total Conversations
          </CardTitle>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-foreground">{totalConversations.toLocaleString()}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isNegative ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              {change > 0 ? '+' : ''}{change}%
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[200px] w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsla(var(--border), 0.5)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 10, fontWeight: 600, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 10, fontWeight: 600, fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(value) => {
                if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                return value.toString();
              }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={3}
              fill="url(#fillValue)"
              animationDuration={1500}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
};

export default ConversationChart;
