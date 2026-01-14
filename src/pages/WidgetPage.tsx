import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
// ... existing imports ...
import { Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createSession, saveMessage, getMindProfiles } from '@/db/api';
import { Message } from '@/types/types';
import IdentityGate from '@/components/chat/IdentityGate';
import VoiceControls from '@/components/chat/VoiceControls';
import { useVoiceOutput } from '@/hooks/useVoiceOutput';

const WidgetPage = () => {
    const { profileId } = useParams<{ profileId: string }>();
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: "Hi! How can I help you today?" }
    ]);
    const [chatUserId, setChatUserId] = useState<string>('');
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [selectedProfile, setSelectedProfile] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const isSendingRef = useRef(false);
    const [userFullDetails, setUserFullDetails] = useState<any>(null);

    // Voice Output Hook
    const { speak, isEnabled: voiceEnabled } = useVoiceOutput({ autoPlay: false, language: 'hi-IN' });

    useEffect(() => {
        const loadProfile = async () => {
            const profiles = await getMindProfiles();
            const profile = profiles.find(p => p.id === profileId) || profiles[0];
            setSelectedProfile(profile);

            // Set initial message from profile purpose or generic
            if (profile?.purpose) {
                setMessages([{ role: 'assistant', content: `Hello! I am ${profile.name}. ${profile.purpose.substring(0, 100)}... How can I assist you?` }]);
            }
        };
        loadProfile();
    }, [profileId]);

    const handleSendMessageInternal = async (text: string) => {
        if (!text.trim() || !chatUserId || isSendingRef.current) return;

        try {
            isSendingRef.current = true;
            setIsProcessing(true);

            let sessionId = currentSessionId;
            if (!sessionId) {
                const title = text.substring(0, 30);
                const newSession = await createSession(chatUserId, title, profileId);
                sessionId = newSession.id;
                setCurrentSessionId(sessionId);
            }

            setMessages(prev => [...prev, { role: 'user', content: text }]);
            await saveMessage(sessionId, 'user', text);

            let finalQuery = text;
            if (userFullDetails?.name) {
                const firstName = userFullDetails.name.trim().split(' ')[0];
                finalQuery = `(SYSTEM CONTEXT: The user's name is "${firstName}". Address them ONLY by their first name "${firstName}".) ${text}`;
            }

            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-engine`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    query: finalQuery,
                    userId: chatUserId,
                    sessionId: sessionId,
                    profileId: profileId
                })
            });

            if (!response.ok) throw new Error("Backend Error");

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let aiResponse = '';

            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

            while (true) {
                const { done, value } = await reader!.read();
                if (done) break;
                const chunk = decoder.decode(value);
                aiResponse += chunk;

                setMessages(prev => {
                    const newMsgs = [...prev];
                    newMsgs[newMsgs.length - 1].content = aiResponse;
                    return newMsgs;
                });
            }

            await saveMessage(sessionId, 'assistant', aiResponse);

            // Speak AI response if voice is enabled
            if (voiceEnabled && aiResponse) {
                console.log('🔊 Speaking AI response:', aiResponse.substring(0, 50) + '...');
                try {
                    await speak(aiResponse);
                } catch (err) {
                    console.error('Voice output error:', err);
                }
            }

        } catch (error: any) {
            console.error('Error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Error: " + error.message }]);
        } finally {
            setIsProcessing(false);
            isSendingRef.current = false;
        }
    };

    const handleSendMessage = () => {
        if (!message.trim()) return;
        const msg = message;
        setMessage('');
        handleSendMessageInternal(msg);
    };

    return (
        <IdentityGate onVerified={(user) => {
            setUserFullDetails(user);
            setChatUserId(user.user_id || user.id);
        }} profileId={profileId}>
            <div className="flex flex-col h-screen bg-background border rounded-lg overflow-hidden shadow-sm max-w-[500px] mx-auto">
                <header className="h-14 border-b flex items-center justify-between px-4 bg-muted/30 shrink-0">
                    <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                            <AvatarImage src={selectedProfile?.avatar_url} />
                            <AvatarFallback>{selectedProfile?.name?.substring(0, 2).toUpperCase() || "AI"}</AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-sm">{selectedProfile?.name || "Assistant"}</span>
                    </div>
                </header>

                <ScrollArea className="flex-1 p-4 bg-muted/10">
                    <div className="space-y-4">
                        {messages.map((msg, i) => (
                            <div key={i} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
                                <div className={cn(
                                    "rounded-2xl px-4 py-2 text-sm max-w-[85%]",
                                    msg.role === 'user'
                                        ? "bg-primary text-primary-foreground rounded-br-none"
                                        : "bg-muted text-foreground rounded-bl-none border border-border/50"
                                )}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                <div className="p-3 bg-background border-t shrink-0">
                    <div className="flex items-center gap-2">
                        <Input
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder="Type a message..."
                            className="h-10 rounded-full bg-muted/50 border-none px-4 text-sm"
                            disabled={isProcessing}
                        />
                        <VoiceControls
                            onVoiceInput={(transcript) => {
                                setMessage(transcript);
                            }}
                            className="shrink-0"
                        />
                        <Button
                            size="icon"
                            className="rounded-full h-10 w-10 shrink-0"
                            onClick={handleSendMessage}
                            disabled={!message.trim() || isProcessing}
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </IdentityGate>
    );
};

export default WidgetPage;
