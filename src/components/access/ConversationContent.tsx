import { useState, useEffect, useRef } from 'react';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, MoreHorizontal, MessageSquareOff, Ghost, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { getConversationMessages } from '@/db/api';
import type { Conversation, Message } from '@/types/types';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { Badge } from '@/components/ui/badge';

interface ConversationContentProps {
    conversation: Conversation | null;
    participantName?: string;
    onClose?: () => void;
    anonymize?: boolean;
}

const ConversationContent = ({ conversation, participantName, onClose, anonymize }: ConversationContentProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    useEffect(() => {
        if (conversation) {
            fetchMessages();
        } else {
            setMessages([]);
        }
    }, [conversation]);

    useEffect(() => {
        // Auto-scroll to bottom on new messages
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const fetchMessages = async () => {
        if (!conversation) return;
        try {
            setLoading(true);
            const userId = (conversation as any).audience_users?.user_id || conversation.user_id;

            let data: Message[] = [];
            if (userId) {
                data = await getConversationMessages(userId, true);
            } else {
                data = await getConversationMessages(conversation.id);
            }

            const uniqueMessages = data.filter((msg, index, self) =>
                index === self.findIndex((m) => (
                    m.role === msg.role &&
                    m.content === msg.content &&
                    (m.created_at === msg.created_at || Math.abs(new Date(m.created_at || 0).getTime() - new Date(msg.created_at || 0).getTime()) < 1000)
                ))
            );

            setMessages(uniqueMessages);
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async (text: string, index: number) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(index);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const userName = participantName || 'User';

    if (!conversation) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground bg-muted/10 p-8 transition-all duration-300 animate-in fade-in">
                <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                    <MessageSquareOff className="w-8 h-8 opacity-20" />
                </div>
                <h3 className="text-lg font-medium">No Conversation Selected</h3>
                <p className="text-sm">Choose a conversation from the list to view chat history.</p>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 flex flex-col overflow-hidden bg-background">
            {/* Chat Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between bg-background/95 backdrop-blur z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 ring-2 ring-primary/10">
                        <AvatarFallback className="bg-primary/5 text-primary text-sm font-semibold">
                            {anonymize ? <Ghost className="w-4 h-4" /> : getInitials(userName)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <span className="text-base font-semibold">{userName}</span>
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider h-4 px-1.5 font-bold">
                                {messages.length} messages
                            </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-xs text-muted-foreground">Active now</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 gap-2 rounded-full text-xs font-semibold px-4 border-muted-foreground/20">
                        <Phone className="w-3 h-3" />
                        Call
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-muted/50 rounded-full">
                        <MoreHorizontal className="w-4 h-4" />
                    </Button>
                    {onClose && (
                        <Button variant="ghost" size="sm" onClick={onClose} className="xl:hidden">
                            Back
                        </Button>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-6">
                <div className="max-w-4xl mx-auto w-full space-y-8 pb-4">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm text-muted-foreground animate-pulse">Retrieving chat history...</p>
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-20 text-muted-foreground italic bg-muted/10 rounded-2xl">
                            Start of the conversation with {userName}
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {messages.map((message, index) => (
                                <div
                                    key={index}
                                    className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'} group`}
                                >
                                    <div className={`flex flex-col gap-2 max-w-[85%] ${message.role === 'assistant' ? 'items-start' : 'items-end'}`}>
                                        <div
                                            className={`rounded-2xl p-4 shadow-sm relative transition-all duration-200 ${message.role === 'assistant'
                                                ? 'bg-muted rounded-tl-none text-foreground border border-border hover:shadow-md'
                                                : 'bg-orange-500 text-white rounded-tr-none hover:bg-orange-600 hover:shadow-lg'
                                                }`}
                                        >
                                            <MarkdownRenderer
                                                content={message.content.replace(/\(SYSTEM CONTEXT:.*?\)\s*/g, '').trim()}
                                                className={message.role === 'assistant' ? '' : 'text-white'}
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-muted-foreground/50 hover:text-orange-500 hover:bg-orange-500/5 transition-all"
                                                onClick={() => handleCopy(message.content, index)}
                                            >
                                                {copiedId === index ? (
                                                    <Check className="w-3 h-3 text-green-500" />
                                                ) : (
                                                    <Copy className="w-3 h-3" />
                                                )}
                                            </Button>
                                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                                                {message.created_at && format(new Date(message.created_at), 'MMM d, h:mm a')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </ScrollArea>
        </div>
    );
};

export default ConversationContent;
