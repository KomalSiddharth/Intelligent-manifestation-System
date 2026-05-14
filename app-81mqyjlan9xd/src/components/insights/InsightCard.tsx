import { Sparkles, MoreVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { Insight } from '@/types/types';

interface InsightCardProps {
  insight: Insight;
}

const InsightCard = ({ insight }: InsightCardProps) => {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">Insight</span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-2">
            <h3 className="text-base font-medium leading-tight">{insight.title}</h3>
            {insight.description && (
              <p className="text-sm text-muted-foreground">{insight.description}</p>
            )}
          </div>
          {insight.action_text && (
            <Button variant="link" className="p-0 h-auto text-primary">
              {insight.action_text} →
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default InsightCard;
