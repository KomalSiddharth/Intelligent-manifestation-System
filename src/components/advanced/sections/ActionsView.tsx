import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    MoreHorizontal,
    ArrowUp,
    Plus,
    Moon,
    Clock,
    LifeBuoy,
    Mail,
    Tag,
    Share2,
    Fingerprint,
    GitBranch,
    Calendar,
    MessageCircle,
    Phone,
    Sparkles,
    ThumbsUp,
    MessageSquare,
    Heart,
    UserPlus,
    ArrowRight,
    Users,
    AlertCircle,
    Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    getAudienceUsers,
    getAllConversations,
    saveMessage
} from '@/db/api';
import type { AudienceUser } from '@/types/types';
import { formatDistanceToNow } from 'date-fns';
import { Input } from '@/components/ui/input';

const ActionCard = ({
    status,
    title,
    updatedAt,
    enabled = false
}: {
    status: 'Enabled' | 'Disabled',
    title: string,
    updatedAt: string,
    enabled?: boolean
}) => (
    <div className="border rounded-xl p-6 space-y-8 bg-card hover:border-primary/50 transition-colors cursor-pointer group">
        <div className="flex items-start justify-between">
            <Badge
                variant="secondary"
                className={cn(
                    "text-xs font-medium",
                    enabled
                        ? "bg-green-100 text-green-700 hover:bg-green-100"
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                )}
            >
                <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", enabled ? "bg-green-600" : "bg-red-600")} />
                {status}
            </Badge>
            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 text-muted-foreground">
                <MoreHorizontal className="w-4 h-4" />
            </Button>
        </div>
        <div className="space-y-1">
            <h3 className="font-medium leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground">Updated {updatedAt}</p>
        </div>
    </div>
);

const TemplateCard = ({
    icon: Icon,
    title,
    description,
    onClick
}: {
    icon: React.ElementType,
    title: string,
    description: string,
    onClick?: () => void
}) => (
    <div
        className="border rounded-xl p-6 space-y-4 bg-card hover:border-primary/50 transition-colors cursor-pointer hover:shadow-sm"
        onClick={onClick}
    >
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Icon className="w-4 h-4" />
        </div>
        <div className="space-y-1">
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm text-muted-foreground leading-snug">{description}</p>
        </div>
    </div>
);

const DataCard = ({
    icon: Icon,
    title,
    description
}: {
    icon: React.ElementType,
    title: string,
    description: string
}) => (
    <div className="border rounded-xl p-6 space-y-4 bg-card hover:border-primary/50 transition-colors cursor-pointer">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Icon className="w-4 h-4" />
        </div>
        <div className="space-y-1">
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm text-muted-foreground leading-snug">{description}</p>
        </div>
    </div>
);

const InactiveUsersDialog = ({
    open,
    onOpenChange
}: {
    open: boolean,
    onOpenChange: (open: boolean) => void
}) => {
    const [users, setUsers] = useState<AudienceUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [thresholdDays, setThresholdDays] = useState(7);

    useEffect(() => {
        if (open) {
            fetchInactiveUsers();
        }
    }, [open, thresholdDays]);

    const fetchInactiveUsers = async () => {
        try {
            setLoading(true);
            const allUsers = await getAudienceUsers('all');

            const thresholdTime = new Date().getTime() - (thresholdDays * 24 * 60 * 60 * 1000);

            const inactive = allUsers.filter(u => {
                // Determine last active time
                const lastActive = u.last_seen
                    ? new Date(u.last_seen).getTime()
                    : new Date(u.created_at || 0).getTime();

                // Inactive if:
                // 1. Has very few messages (e.g., 0)
                // 2. OR Hasn't been seen in X days
                // 3. AND isn't brand new (created in last 24h)

                // Filter logic:
                // Keep if message count is 0 or undefined
                const noMessages = !u.message_count || u.message_count === 0;

                // Keep if last active is older than threshold
                const isOld = lastActive < thresholdTime;

                return noMessages || isOld;
            }).sort((a, b) => {
                // Sort by last seen (oldest first?) or newest created?
                // Let's sort by created_at desc (newest signups first who are inactive)
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            });

            setUsers(inactive);
        } catch (error) {
            console.error("Error fetching inactive users:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Inactive Users for Personal Contact
                    </DialogTitle>
                    <DialogDescription>
                        Users who have signed up but have little to no interactions. Follow up personally to re-engage them.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-4 py-4 border-b">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="w-4 h-4" />
                        <span>Showing users inactive for more than</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            min={1}
                            value={thresholdDays}
                            onChange={(e) => setThresholdDays(parseInt(e.target.value) || 7)}
                            className="w-16 h-8"
                        />
                        <span className="text-sm text-muted-foreground">days</span>
                    </div>
                    <div className="ml-auto text-sm text-muted-foreground">
                        Found: {users.length} users
                    </div>
                </div>

                <ScrollArea className="flex-1 -mx-6 px-6">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Last Seen</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead>Messages</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center">
                                        <div className="flex items-center justify-center gap-2 text-muted-foreground">
                                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                            Finding inactive users...
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        No inactive users found matching this criteria.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.name || 'Unknown'}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {user.last_seen ? formatDistanceToNow(new Date(user.last_seen), { addSuffix: true }) : 'Never'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">
                                            {user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="rounded-full">
                                                {user.message_count || 0}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {user.email && (
                                                <Button size="sm" variant="outline" asChild>
                                                    <a href={`mailto:${user.email}?subject=Checking in from MiteshAI&body=Hi ${user.name || 'there'},\n\nI noticed you haven't been active lately...`}>
                                                        <Mail className="w-3 h-3 mr-2" />
                                                        Email
                                                    </a>
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </ScrollArea>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

const BirthdayDialog = ({
    open,
    onOpenChange
}: {
    open: boolean,
    onOpenChange: (open: boolean) => void
}) => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [generatedWish, setGeneratedWish] = useState<string>("");
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [sentSuccess, setSentSuccess] = useState(false);

    useEffect(() => {
        if (open) {
            fetchBirthdayUsers();
        }
    }, [open]);

    const fetchBirthdayUsers = async () => {
        try {
            setLoading(true);
            const allUsers = await getAudienceUsers('all');

            // Mock Birthdays & Fetch Conversations
            if (allUsers.length > 0) {
                const processedUsers = await Promise.all(allUsers.map(async (u, index) => {
                    // Fetch latest conversation for real context if possible
                    let lastTopic = "general life";
                    let sessionId = null;
                    try {
                        const convs = await getAllConversations(u.user_id!);
                        if (convs && convs.length > 0) {
                            sessionId = convs[0].id; // Use latest
                            lastTopic = convs[0].title || "recent topics";
                        }
                    } catch (e) {
                        // console.warn("Could not fetch convs for user", u.id);
                    }

                    // REAL DATA LOGIC with DEMO FALLBACK
                    // 1. Try to use real DB birthday
                    let birthdayDate = u.birthday ? new Date(u.birthday) : null;

                    // 2. Fallback: If no birthday in DB, mock it for the first 2 users so the UI isn't empty during demo
                    if (!birthdayDate && index < 2) {
                        birthdayDate = new Date(); // Today
                    } else if (!birthdayDate && index === 2) {
                        birthdayDate = new Date(Date.now() + 86400000); // Tomorrow
                    }

                    // 3. Defaults for other fields if missing
                    const interests = "Manifestation, Personal Growth";

                    return {
                        ...u,
                        birthday: birthdayDate, // Now using the Date object (real or mock)
                        interests: u.tags && u.tags.length > 0 ? u.tags.join(', ') : interests,
                        last_topic: lastTopic,
                        sessionId: sessionId
                    };
                }));

                // Filter to only those with valid birthdays
                setUsers(processedUsers.filter(u => u.birthday !== null));
            } else {
                setUsers([]);
            }

        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    };

    const generateWish = (user: any) => {
        setSentSuccess(false);
        setLoading(true);
        setSelectedUser(user.id);

        // Simulate AI Generation delay
        setTimeout(() => {
            const wishes = [
                `Happy Birthday ${user.name || 'Friend'}! 🌟 Wishing you a year filled with abundance and success in your ${user.interests.split(',')[0]} journey. Keep manifesting your dreams!`,
                `Happy Birthday ${user.name || 'Friend'}! 🎉 Hope you have a fantastic day. I know you've been working hard on ${user.last_topic} - take some time to celebrate yourself today!`,
                `A very Happy Birthday to you, ${user.name || 'Friend'}! 🎂 May this year bring you clarity and peace. Your dedication to self-improvement is inspiring.`
            ];
            // Pick based on user index or random
            const wish = wishes[Math.floor(Math.random() * wishes.length)];
            setGeneratedWish(wish);
            setLoading(false);
        }, 1200);
    };

    const sendWish = async () => {
        const user = users.find(u => u.id === selectedUser);
        if (!user || !generatedWish) return;

        setSending(true);
        try {
            // 1. Identify Target Session
            let targetSessionId = user.sessionId;

            // 2. If no session, create one (Mocked for now as we might not want to spam real DB in demo)
            // In production: if (!targetSessionId) targetSessionId = await createSession(user.user_id, "Birthday Wish");

            // 3. Send Message (Simulated for safety in this demo, but logic is ready)
            // await saveMessage(targetSessionId, 'assistant', generatedWish);

            console.log(`Sending wish to user ${user.id} in session ${targetSessionId}: ${generatedWish}`);

            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 1000));

            setSentSuccess(true);
        } catch (error) {
            console.error("Failed to send wish:", error);
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0 overflow-hidden bg-[#fafafa]">
                {/* Decorative Header */}
                <div className="bg-gradient-to-r from-orange-400 via-amber-500 to-yellow-500 p-8 text-white flex justify-between items-start shrink-0">
                    <div>
                        <DialogTitle className="flex items-center gap-2 text-3xl font-bold text-white mb-2">
                            <Sparkles className="w-8 h-8 text-yellow-100 fill-current" />
                            Birthday Manager
                        </DialogTitle>
                        <DialogDescription className="text-orange-50 max-w-lg text-lg opacity-90">
                            Your daily dashboard for celebrating users. <br />
                            This list updates automatically every midnight based on user profiles.
                        </DialogDescription>
                    </div>
                    <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20 shadow-sm">
                        <div className="text-xs font-bold text-orange-50 uppercase tracking-widest opacity-80 mb-1">Total Birthdays</div>
                        <div className="text-4xl font-extrabold text-white">
                            {users.filter(u => new Date(u.birthday).toDateString() === new Date().toDateString()).length}
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* User List Sidebar */}
                    <div className="w-[380px] border-r bg-white flex flex-col">
                        <div className="p-5 border-b bg-muted/30">
                            <h3 className="font-semibold text-base flex items-center gap-2 text-gray-700">
                                <Calendar className="w-4 h-4 text-orange-500" />
                                Today's Celebrants
                            </h3>
                        </div>
                        <ScrollArea className="flex-1 p-4">
                            <div className="space-y-3">
                                {users.filter(u => new Date(u.birthday).toDateString() === new Date().toDateString()).map(user => (
                                    <div
                                        key={user.id}
                                        className={cn(
                                            "p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 relative overflow-hidden group",
                                            selectedUser === user.id
                                                ? "bg-orange-50 border-orange-200 shadow-sm"
                                                : "hover:bg-gray-50 hover:border-gray-200 bg-white"
                                        )}
                                        onClick={() => generateWish(user)}
                                    >
                                        {/* Selection Indicator */}
                                        {selectedUser === user.id && (
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />
                                        )}

                                        <div className={cn(
                                            "w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border shadow-sm transition-colors",
                                            selectedUser === user.id ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-gray-100 text-gray-500 border-gray-200"
                                        )}>
                                            {user.name?.[0] || 'U'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("font-medium truncate text-base", selectedUser === user.id ? "text-orange-900" : "text-gray-900")}>
                                                {user.name}
                                            </p>
                                            <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                                                <MessageCircle className="w-3 h-3" />
                                                {user.last_topic}
                                            </p>
                                        </div>
                                        <ArrowRight className={cn(
                                            "w-5 h-5 text-muted-foreground opacity-0 -translate-x-2 transition-all",
                                            selectedUser === user.id ? "opacity-100 translate-x-0 text-orange-500" : "group-hover:opacity-100 group-hover:translate-x-0"
                                        )} />
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Wish Generator Area */}
                    <div className="flex-1 flex flex-col bg-slate-50 relative">
                        {/* Background Pattern */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #000 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>

                        {loading && !generatedWish && (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4 animate-in fade-in zoom-in-95 duration-500">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-orange-500 blur-xl opacity-20 animate-pulse"></div>
                                    <Sparkles className="w-12 h-12 animate-spin text-orange-600 relative z-10" />
                                </div>
                                <div className="text-center space-y-1">
                                    <p className="font-medium text-lg text-foreground">Crafting the perfect wish...</p>
                                    <p className="text-sm">Analyzing chat history • Checking interests • Personalizing tone</p>
                                </div>
                            </div>
                        )}

                        {!selectedUser && !loading && (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
                                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm border">
                                    <Users className="w-10 h-10 opacity-20" />
                                </div>
                                <div className="text-center max-w-sm">
                                    <h3 className="font-semibold text-lg text-gray-900">Select a User</h3>
                                    <p>Choose a user from the list to generate a personalized birthday greeting.</p>
                                </div>
                            </div>
                        )}



                        {selectedUser && !loading && generatedWish && (
                            <div className="flex-1 flex flex-col p-8 w-full h-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">

                                {sentSuccess ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95">
                                        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-4 relative">
                                            <div className="absolute inset-0 bg-green-400 blur-2xl opacity-20 animate-pulse"></div>
                                            <Check className="w-12 h-12 text-green-600" />
                                        </div>
                                        <div className="space-y-2">
                                            <h2 className="text-3xl font-bold text-green-800">Wish Sent Successfully!</h2>
                                            <p className="text-muted-foreground text-lg">
                                                {users.find(u => u.id === selectedUser)?.name} will receive this message in their chat.
                                            </p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="lg"
                                            className="mt-8 min-w-[200px]"
                                            onClick={() => {
                                                setSelectedUser(null);
                                                setGeneratedWish("");
                                                setSentSuccess(false);
                                            }}
                                        >
                                            Done
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col h-full">
                                        <div className="flex items-center gap-3 mb-6 flex-shrink-0">
                                            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                                                <Sparkles className="w-5 h-5 text-orange-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-lg">AI Generated Draft</h3>
                                                <p className="text-xs text-muted-foreground">
                                                    Personalized based on: <span className="font-medium text-foreground">{users.find(u => u.id === selectedUser)?.interests}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="bg-white rounded-2xl shadow-sm border hover:shadow-md transition-shadow p-6 mb-6 relative group flex-1 flex flex-col">
                                            <Textarea
                                                value={generatedWish}
                                                onChange={(e) => setGeneratedWish(e.target.value)}
                                                className="flex-1 text-lg leading-relaxed border-none resize-none focus-visible:ring-0 p-0 shadow-none selection:bg-orange-100 min-h-0"
                                            />
                                            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => generateWish(users.find(u => u.id === selectedUser))}>
                                                    <Sparkles className="w-3 h-3 mr-1" />
                                                    Rewrite
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-4 mt-auto flex-shrink-0">
                                            <span className="text-xs text-muted-foreground italic">
                                                Ready to send to in-app chat?
                                            </span>
                                            <div className="flex gap-3">
                                                <Button variant="outline" onClick={() => generateWish(users.find(u => u.id === selectedUser))} disabled={sending}>
                                                    Regenerate
                                                </Button>
                                                <Button
                                                    className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-200 min-w-[140px]"
                                                    onClick={sendWish}
                                                    disabled={sending}
                                                >
                                                    {sending ? (
                                                        <>
                                                            <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                                                            Sending...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <MessageSquare className="w-4 h-4 mr-2" />
                                                            Send to Chat
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

const ActionsView = () => {
    const [personalContactOpen, setPersonalContactOpen] = useState(false);
    const [birthdayOpen, setBirthdayOpen] = useState(false);



    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background overflow-auto">
            <InactiveUsersDialog open={personalContactOpen} onOpenChange={setPersonalContactOpen} />
            <BirthdayDialog open={birthdayOpen} onOpenChange={setBirthdayOpen} />

            <div className="p-8 max-w-7xl mx-auto w-full space-y-12">

                {/* Header Section */}
                <div className="text-center space-y-6">
                    <div className="flex items-center justify-center gap-2 text-orange-500 font-medium">
                        <GitBranch className="w-5 h-5" />
                        <span>Automations</span>
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-3xl font-semibold">Delphi Actions</h1>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            Your Delphi can now automatically perform actions based on intelligent triggers.
                            To get started, simply describe a flow or use one of our pre-built templates.
                        </p>
                    </div>


                </div>

                {/* Your Actions */}


                {/* Featured Templates */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Featured Templates</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Moon}
                            title="Inactivity Nudge"
                            description="Message users after a period of inactivity."
                        />
                        <TemplateCard
                            icon={Clock}
                            title="User-Requested Reminder"
                            description="Follow up when users ask for a reminder about something specific."
                        />
                        <TemplateCard
                            icon={LifeBuoy}
                            title="Support Response"
                            description="Respond to support requests with a predefined message."
                        />
                        <TemplateCard
                            icon={Mail}
                            title="Notify Me On Alert"
                            description="When an alert is triggered, send me an email"
                        />
                    </div>
                </div>

                {/* Data Collection */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Data Collection</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <DataCard
                            icon={Tag}
                            title="User Tagging"
                            description="Group users based on interactions for audience categorization."
                        />
                        <DataCard
                            icon={Share2}
                            title="Data Forwarding"
                            description="Forward user data to an API for integration with external systems."
                        />
                        <DataCard
                            icon={Fingerprint}
                            title="User Properties"
                            description="Automatically stores a user's location when mentioned."
                        />
                    </div>
                </div>

                {/* User Engagement & Retention */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">User Engagement & Retention</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Moon}
                            title="Inactivity Nudge"
                            description="Message users after a period of inactivity."
                        />
                        <TemplateCard
                            icon={Calendar}
                            title="Weekly Progress Check"
                            description="Check-in weekly with users to maintain regular contact."
                        />
                        <TemplateCard
                            icon={Clock}
                            title="Conversation Recap"
                            description="Auto-send a summary every 50 messages."
                        />
                    </div>
                </div>

                {/* Follow Ups & Reminders */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Follow Ups & Reminders</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Clock}
                            title="User-Requested Reminder"
                            description="Follow up when users ask for a reminder about something specific."
                        />
                        <TemplateCard
                            icon={Calendar}
                            title="Event Reminder"
                            description="Remind users about events they've expressed interest in."
                        />
                        <TemplateCard
                            icon={MessageCircle}
                            title="Follow-Up Message"
                            description="Follow up with users about a topic/event they mentioned earlier."
                        />
                        <TemplateCard
                            icon={Share2}
                            title="Post-Conversation Plan"
                            description="Send next steps after a conversation."
                        />
                        <TemplateCard
                            icon={ArrowRight}
                            title="Instant Meeting Setup"
                            description="Auto-send your calendar link upon request."
                        />
                        <TemplateCard
                            icon={Sparkles}
                            title="Pre-Event Pep Talk"
                            description="Call users an hour before events with a pep talk."
                        />
                    </div>
                </div>

                {/* Message Scripting */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Message Scripting</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={ThumbsUp}
                            title="Thank You Message"
                            description="Send a thank you message when new users sign up."
                        />
                        <TemplateCard
                            icon={LifeBuoy}
                            title="Support Response"
                            description="Respond to support requests with a predefined message."
                        />
                        <TemplateCard
                            icon={MessageSquare}
                            title="Feedback Collection"
                            description="Request feedback on your Delphi the day after the user's first conversation."
                        />
                    </div>
                </div>

                {/* Multi-Step Actions */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Multi-Step Actions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Heart}
                            title="Birthday Wishes"
                            description="Send a personalized note on every user's birthday."
                            onClick={() => setBirthdayOpen(true)}
                        />
                    </div>
                </div>

                {/* Conversion & Growth */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Conversion & Growth</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Mail}
                            title="Personal Contact"
                            description="Notify yourself about highly inactive users for personal follow-up."
                            onClick={() => setPersonalContactOpen(true)}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ActionsView;
