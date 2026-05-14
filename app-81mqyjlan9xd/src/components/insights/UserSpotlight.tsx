import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AudienceUser } from '@/types/types';

interface UserSpotlightProps {
  user: AudienceUser;
}

const UserSpotlight = ({ user }: UserSpotlightProps) => {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{user.name}</h3>
                {user.tags && user.tags.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {user.tags[0]}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{user.email || 'No email'}</p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {user.message_count} messages • Last active{' '}
            {user.last_active
              ? new Date(user.last_active).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })
              : 'Never'}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1">
              Messages
            </Button>
            <Button size="sm" variant="outline" className="flex-1">
              Next →
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default UserSpotlight;
