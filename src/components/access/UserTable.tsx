import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Trash2, Ban } from 'lucide-react';
import type { AudienceUser } from '@/types/types';

interface UserTableProps {
  users: AudienceUser[];
  selectedIds: string[];
  onSelectUser: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onDeleteUser: (id: string) => void;
  onRevokeUser?: (id: string) => void;
}

const UserTable = ({ users, selectedIds, onSelectUser, onSelectAll, onDeleteUser, onRevokeUser }: UserTableProps) => {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const isOnline = (lastSeen: string | null) => {
    if (!lastSeen) return false;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastSeen) > fiveMinutesAgo;
  };

  const isAllSelected = users.length > 0 && selectedIds.length === users.length;

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <Checkbox
                checked={isAllSelected}
                onCheckedChange={(checked) => onSelectAll(!!checked)}
              />
            </TableHead>
            <TableHead className="w-[40%]">Name</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Trial</TableHead>
            <TableHead className="text-right">Messages</TableHead>
            <TableHead className="text-right">Last Active</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                No users found.
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => {
              const signupDate = new Date(user.created_at).getTime();
              const daysUsed = Math.floor((Date.now() - signupDate) / (24 * 60 * 60 * 1000));
              const daysLeft = Math.max(0, 180 - daysUsed);
              const isExpired = daysUsed > 180;

              return (
                <TableRow key={`${user.id}-${user.status}`} className={selectedIds.includes(user.id) ? 'bg-muted/50' : ''}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(user.id)}
                      onCheckedChange={(checked) => onSelectUser(user.id, !!checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        {isOnline((user as any).last_seen) && (
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
                        )}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          {user.status === 'revoked' && (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1 uppercase">Revoked</Badge>
                          )}
                        </div>
                        {user.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {user.tags && user.tags.length > 0 ? (
                        user.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {isExpired || user.status === 'revoked' ? (
                      <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/5">Expired</Badge>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium">{daysLeft} days left</span>
                        <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-orange-500 transition-all"
                            style={{ width: `${Math.max(5, (daysLeft / 180) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {user.message_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatDate(user.last_active)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onRevokeUser && user.status !== 'revoked' && (
                          <DropdownMenuItem
                            className="text-orange-600 focus:text-orange-600"
                            onClick={() => onRevokeUser(user.id)}
                          >
                            <Ban className="mr-2 h-4 w-4" />
                            Revoke Access
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => onDeleteUser(user.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserTable;
