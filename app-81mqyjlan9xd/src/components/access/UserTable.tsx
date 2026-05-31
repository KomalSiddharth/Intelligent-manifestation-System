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
import { MoreHorizontal, Trash2 } from 'lucide-react';
import type { AudienceUser } from '@/types/types';

interface UserTableProps {
  users: AudienceUser[];
  selectedIds: string[];
  onSelectUser: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onDeleteUser: (id: string) => void;
  onUserClick?: (user: AudienceUser) => void;
}

const UserTable = ({ users, selectedIds, onSelectUser, onSelectAll, onDeleteUser, onUserClick }: UserTableProps) => {
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
            <TableHead className="w-[50%]">Name</TableHead>
            <TableHead className="text-right">Messages</TableHead>
            <TableHead className="text-right">Last Active</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                No users found.
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow
                key={`${user.id}-${user.status}`}
                className={[
                  selectedIds.includes(user.id) ? 'bg-muted/50' : '',
                  onUserClick ? 'cursor-pointer hover:bg-muted/30 transition-colors' : '',
                ].join(' ')}
                onClick={() => onUserClick?.(user)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
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
                <TableCell className="text-right font-medium">
                  {user.message_count.toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {formatDate(user.last_active)}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserTable;
