import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from 'date-fns';
import { getConversationMessages } from '@/db/api';
import type { Conversation, Message } from '@/types/types';

interface ConversationHistoryDialogProps {
    conversation: Conversation | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    participantName?: string; // Prop for explicit name
}

const ConversationHistoryDialog = ({ conversation, open, onOpenChange, participantName }: ConversationHistoryDialogProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && conversation) {
            fetchMessages();
        }
    }, [open, conversation]);

    const fetchMessages = async () => {
        if (!conversation) return;
        try {
            setLoading(true);

            // Check if we have a linked user_id to fetch FULL history
            const userId = (conversation as any).audience_users?.user_id || conversation.user_id;

            let data: Message[] = [];
            if (userId) {
                // Fetch ALL messages for this user (aggregated history)
                data = await getConversationMessages(userId, true);
            } else {
                // Fallback: Fetch only this specific session
                data = await getConversationMessages(conversation.id);
            }

            // Deduplicate: Sometimes messages are saved twice due to connection retries or double triggers.
            // We filter out identical messages with the same role, content, and timestamp.
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

    const getInitials = (name: string) => {
        return name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const userName = participantName || (conversation as any)?.audience_users?.name || 'User';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] h-[85vh] flex flex-col p-0 overflow-hidden shadow-2xl border-none">
                <DialogHeader className="p-6 border-b shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <DialogTitle className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {getInitials(userName)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="text-base font-semibold">{userName}</span>
                            <span className="text-xs text-muted-foreground font-normal">
                                Conversation History
                            </span>
                        </div>
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1 overflow-y-auto">
                    <div className="p-6 h-full min-h-0">
                        {loading ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                Loading history...
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground italic">
                                No messages in this conversation.
                            </div>
                        ) : (
                            <div className="space-y-6 pb-4">
                                {messages.map((message, index) => (
                                    <div
                                        key={index}
                                        className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
                                    >
                                        <div
                                            className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${message.role === 'assistant'
                                                ? 'bg-muted rounded-tl-none text-foreground border border-border/50'
                                                : 'bg-primary text-primary-foreground rounded-tr-none'
                                                }`}
                                        >
                                            <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                                {message.content.replace(/\(SYSTEM CONTEXT:.*?\)\s*/g, '').trim()}
                                            </p>
                                            <p className={`text-[10px] mt-2 opacity-70 ${message.role === 'assistant' ? 'text-muted-foreground' : 'text-primary-foreground'
                                                }`}>
                                                {message.created_at && format(new Date(message.created_at), 'MMM d, h:mm a')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};

export default ConversationHistoryDialog;
