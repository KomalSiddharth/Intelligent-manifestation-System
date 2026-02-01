import { useState, useEffect, useMemo } from 'react';
import { Search, Filter, AlertCircle, RefreshCw, Ghost } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from 'date-fns';
import { getAllConversations, getAudienceUsers, getMindProfile } from '@/db/api';
import type { Conversation, AudienceUser, MindProfile } from '@/types/types';
import ConversationContent from './ConversationContent';
import { cn } from '@/lib/utils';

interface ConversationsViewProps {
    profileId?: string;
    onSelectConversation?: (conversation: Conversation) => void;
}

const ConversationsView = ({ profileId, onSelectConversation }: ConversationsViewProps) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [usersMap, setUsersMap] = useState<Record<string, AudienceUser>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('recent');
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [profile, setProfile] = useState<MindProfile | null>(null);

    const anonymize = profile?.anonymize_users || false;

    useEffect(() => {
        fetchData();
    }, [profileId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [convsData, usersData, profileData] = await Promise.all([
                getAllConversations(profileId),
                getAudienceUsers('all', profileId),
                getMindProfile(profileId)
            ]);

            const uMap: Record<string, AudienceUser> = {};
            usersData.forEach(u => {
                if (u.user_id) uMap[u.user_id] = u;
            });

            setConversations(convsData);
            setUsersMap(uMap);
            setProfile(profileData as any);

            // Auto-select first conversation if none selected
            if (convsData.length > 0 && !selectedConv) {
                // Find first grouped conversation
                // (We'll handle this in the groupedConversations useMemo or just wait for it)
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const groupedConversations = useMemo(() => {
        const groups: Record<string, Conversation> = {};

        conversations.forEach(conv => {
            const uid = conv.user_id;
            if (!uid) return;

            if (groups[uid]) {
                const current = groups[uid];
                const convDate = new Date(conv.last_message_at || conv.created_at).getTime();
                const currDate = new Date(current.last_message_at || current.created_at).getTime();
                if (convDate > currDate) {
                    groups[uid] = conv;
                }
            } else {
                groups[uid] = conv;
            }
        });

        return Object.values(groups).sort((a, b) => {
            const dateA = new Date(a.last_message_at || a.created_at).getTime();
            const dateB = new Date(b.last_message_at || b.created_at).getTime();
            return dateB - dateA;
        });

    }, [conversations]);

    const filteredConversations = groupedConversations.filter(conv => {
        const query = searchQuery.toLowerCase();
        const user = usersMap[conv.user_id];
        const userName = user?.name?.toLowerCase() || '';
        const userEmail = user?.email?.toLowerCase() || '';
        const title = conv.title?.toLowerCase() || '';
        const rawId = conv.user_id.toLowerCase();

        return userName.includes(query) || userEmail.includes(query) || title.includes(query) || rawId.includes(query);
    });

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const getDisplayName = (conv: Conversation) => {
        if (anonymize) return `Anonymous ${conv.user_id.substring(0, 4).toUpperCase()}`;

        // Priority 2: Use the local map (fallback)
        const user = usersMap[conv.user_id];
        if (user && user.name && user.name !== 'Unknown') return user.name;
        if (user && user.email) return user.email;

        return `User ${conv.user_id.substring(0, 6)}...`;
    };

    return (
        <div className="h-[calc(100vh-200px)] min-h-[600px] border rounded-2xl bg-background overflow-hidden shadow-lg flex flex-col lg:flex-row transition-all duration-500 animate-in fade-in slide-in-from-bottom-2">

            {/* Sidebar: Conversation List */}
            <div className="w-full lg:w-[400px] border-r border-border flex flex-col bg-muted/5">
                <div className="p-5 space-y-5 bg-background border-b shrink-0">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold tracking-tight">Conversations</h2>
                        <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={fetchData} className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors">
                                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                <Filter className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                        <Input
                            placeholder="Search by name, email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-10 bg-muted/40 border-none rounded-xl focus-visible:ring-1 focus-visible:ring-primary shadow-sm"
                        />
                    </div>

                    <div className="flex items-center justify-between pt-1">
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                            <TabsList className="bg-transparent border-b rounded-none p-0 h-auto gap-6 transition-all">
                                <TabsTrigger
                                    value="recent"
                                    className="relative bg-transparent rounded-none px-0 py-2 text-sm font-semibold text-muted-foreground border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                                >
                                    Most Recent
                                </TabsTrigger>
                                <TabsTrigger
                                    value="notifications"
                                    className="relative bg-transparent rounded-none px-0 py-2 text-sm font-semibold text-muted-foreground border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none gap-2"
                                >
                                    Notifications
                                    {conversations.filter(c => (c as any).has_alert).length > 0 && (
                                        <Badge className="bg-orange-500 text-white border-none h-5 min-w-[20px] px-1 animate-pulse">
                                            {conversations.filter(c => (c as any).has_alert).length}
                                        </Badge>
                                    )}
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </div>

                <ScrollArea className="flex-1">
                    <div className="divide-y divide-border">
                        {loading && conversations.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground space-y-2">
                                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                                <p className="text-sm">Loading...</p>
                            </div>
                        ) : filteredConversations.length === 0 ? (
                            <div className="p-12 text-center text-muted-foreground space-y-2">
                                <Search className="w-8 h-8 opacity-20 mx-auto" />
                                <p className="text-sm font-medium">No conversations found</p>
                            </div>
                        ) : (
                            filteredConversations.map((conv) => (
                                <div
                                    key={conv.id}
                                    onClick={() => {
                                        setSelectedConv(conv);
                                        if (onSelectConversation) onSelectConversation(conv);
                                    }}
                                    className={cn(
                                        "p-4 cursor-pointer flex items-start gap-4 transition-all duration-200 border-l-[3px]",
                                        selectedConv?.id === conv.id
                                            ? "dark:bg-orange-500/10 bg-orange-50/50 border-orange-500 shadow-[inset_0_0_10px_rgba(249,115,22,0.05)]"
                                            : "hover:bg-muted border-transparent"
                                    )}
                                >
                                    <div className="relative shrink-0">
                                        <Avatar className={cn(
                                            "h-11 w-11 transition-transform duration-200",
                                            selectedConv?.id === conv.id ? "scale-105 ring-2 ring-orange-500/20" : ""
                                        )}>
                                            <AvatarFallback className={cn(
                                                "font-semibold text-sm",
                                                selectedConv?.id === conv.id ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"
                                            )}>
                                                {anonymize ? <Ghost className="w-4 h-4" /> : getInitials(getDisplayName(conv))}
                                            </AvatarFallback>
                                        </Avatar>
                                        {(conv as any).has_alert && (
                                            <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-background rounded-full animate-bounce" />
                                        )}
                                        {activeTab === 'recent' && !((conv as any).has_alert) && (
                                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full ring-1 ring-black/5" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={cn(
                                                "text-sm font-bold truncate transition-colors",
                                                selectedConv?.id === conv.id ? "dark:text-orange-300 text-orange-900" : "text-foreground"
                                            )}>
                                                {getDisplayName(conv)}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground font-medium whitespace-nowrap uppercase">
                                                {usersMap[conv.user_id]?.message_count ? `${usersMap[conv.user_id].message_count} msgs` : (conv.last_message_at
                                                    ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })
                                                    : 'Active')}
                                            </span>
                                        </div>

                                        <p className={cn(
                                            "text-xs line-clamp-1 leading-relaxed",
                                            selectedConv?.id === conv.id ? "dark:text-orange-300/70 text-orange-800/70" : "text-muted-foreground"
                                        )}>
                                            {conv.summary || conv.title || 'Start of conversation...'}
                                        </p>

                                        {(conv as any).has_alert && (
                                            <div className="flex items-center gap-1 text-[10px] text-red-500 font-bold uppercase tracking-wider pt-0.5 animate-pulse">
                                                <AlertCircle className="h-2.5 w-2.5" />
                                                Alert Triggered
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 bg-background relative">
                <ConversationContent
                    conversation={selectedConv}
                    participantName={selectedConv ? getDisplayName(selectedConv) : undefined}
                    onClose={() => setSelectedConv(null)}
                    anonymize={anonymize}
                />
            </div>
        </div>
    );
};

export default ConversationsView;
