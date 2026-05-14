import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Bell, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Alert {
    id: string;
    subject: string;
    dateCreated: string;
    mentions: number;
    lastMentioned: string;
}

const AlertsView = () => {
    const [searchQuery, setSearchQuery] = useState("");
    const [featureStates, setFeatureStates] = useState<Record<string, boolean>>(() => {
        const saved = localStorage.getItem('advanced_alerts_enabled');
        return saved ? JSON.parse(saved) : {};
    });

    const [alerts] = useState<Alert[]>([
        {
            id: '1',
            subject: "When a user says 'remind me' in conversation",
            dateCreated: "June 28th, 2025",
            mentions: 70,
            lastMentioned: "November 3rd, 2025"
        },
        {
            id: '2',
            subject: "expressed frustration around something that failed",
            dateCreated: "May 26th, 2025",
            mentions: 31,
            lastMentioned: "October 24th, 2025"
        },
        {
            id: '3',
            subject: "expresses intent to talk to the real person instead of the clone",
            dateCreated: "May 26th, 2025",
            mentions: 11,
            lastMentioned: "September 19th, 2025"
        }
    ]);

    const toggleAlert = (id: string, enabled: boolean) => {
        const newState = { ...featureStates, [id]: enabled };
        setFeatureStates(newState);
        localStorage.setItem('advanced_alerts_enabled', JSON.stringify(newState));
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background overflow-auto">
            <div className="p-8 max-w-7xl mx-auto w-full space-y-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold">Alerts</h1>
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button className="bg-black text-white hover:bg-black/90 rounded-full px-6">
                                Add Alert
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[600px]">
                            <DialogHeader>
                                <DialogTitle>Add Alert</DialogTitle>
                                <DialogDescription>
                                    Get notified when specific topics come up in conversations with your audience.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-6 py-4">
                                <div className="space-y-2">
                                    <Label>What would you like to be alerted about?</Label>
                                    <Input placeholder='e.g. "looking for tickets", "need pricing info", "when is the next event"' />
                                </div>
                                <div className="space-y-4">
                                    <Label>When Alert is triggered:</Label>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Switch id="notify-email" defaultChecked />
                                            <Label htmlFor="notify-email" className="font-normal">Notify me by email</Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Switch id="add-tag" />
                                            <Label htmlFor="add-tag" className="font-normal">Add users to a tag</Label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline">Cancel</Button>
                                <Button className="bg-black text-white hover:bg-black/90">Add Alert</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Search */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search..."
                        className="pl-9 rounded-full bg-muted/30 border-muted-foreground/20"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Table */}
                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow>
                                <TableHead className="w-[40%]">Subject</TableHead>
                                <TableHead>Date Created</TableHead>
                                <TableHead>Mentions</TableHead>
                                <TableHead>Last Mentioned</TableHead>
                                <TableHead>Enabled</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {alerts.map((alert) => (
                                <TableRow key={alert.id} className={!featureStates[alert.id] ? "opacity-60" : ""}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Bell className={cn("w-4 h-4", featureStates[alert.id] ? "text-orange-500" : "text-muted-foreground")} />
                                            <span className="font-medium">{alert.subject}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{alert.dateCreated}</TableCell>
                                    <TableCell className="text-muted-foreground">{alert.mentions}</TableCell>
                                    <TableCell className="text-muted-foreground">{alert.lastMentioned}</TableCell>
                                    <TableCell>
                                        <Switch
                                            checked={featureStates[alert.id] || false}
                                            onCheckedChange={(enabled) => toggleAlert(alert.id, enabled)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <Pencil className="w-4 h-4 text-muted-foreground" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="sm:max-w-[600px]">
                                                    <DialogHeader>
                                                        <DialogTitle>Edit Alert</DialogTitle>
                                                        <DialogDescription>
                                                            Get notified when specific topics come up in conversations with your audience.
                                                        </DialogDescription>
                                                    </DialogHeader>
                                                    <div className="space-y-6 py-4">
                                                        <div className="space-y-2">
                                                            <Label>What would you like to be alerted about?</Label>
                                                            <Input defaultValue={alert.subject} />
                                                        </div>
                                                        <div className="space-y-4">
                                                            <Label>When Alert is triggered:</Label>
                                                            <div className="space-y-4">
                                                                <div className="flex items-center gap-2">
                                                                    <Switch id="edit-notify-email" />
                                                                    <Label htmlFor="edit-notify-email" className="font-normal">Notify me by email</Label>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <Switch id="edit-add-tag" />
                                                                    <Label htmlFor="edit-add-tag" className="font-normal">Add users to a tag</Label>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="pt-4">
                                                            <Button variant="link" className="p-0 h-auto text-muted-foreground flex items-center gap-2">
                                                                View Conversations <ExternalLink className="w-3 h-3" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <DialogFooter>
                                                        <Button variant="outline">Cancel</Button>
                                                        <Button className="bg-black text-white hover:bg-black/90">Edit Alert</Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <Trash2 className="w-4 h-4 text-muted-foreground" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
};

export default AlertsView;
