import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
}

const MetricCard = ({ label, value, change, changeLabel }: MetricCardProps) => {
  const isNegative = change !== undefined && change < 0;
  const isPositive = change !== undefined && change > 0;

  return (
    <Card className="premium-card group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
        <div className="w-12 h-12 rounded-full bg-orange-500 blur-xl" />
      </div>
      <CardContent className="p-6 relative z-10">
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">{label}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-black tracking-tight text-foreground">{value}</p>
          </div>
          {change !== undefined && (
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-bold ${isNegative ? 'bg-red-50 text-red-600' : isPositive ? 'bg-green-50 text-green-600' : 'bg-muted text-muted-foreground'
              }`}>
              {isNegative && <ArrowDown className="h-3 w-3" />}
              {isPositive && <ArrowUp className="h-3 w-3" />}
              <span>
                {change > 0 ? '+' : ''}
                {change}%
              </span>
              {changeLabel && <span className="opacity-70 ml-1">{changeLabel}</span>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MetricCard;
