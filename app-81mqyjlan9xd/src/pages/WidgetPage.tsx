import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Menu, MessageCircle, Phone, ArrowRight, X, MoreHorizontal, Sparkles, AlertTriangle, Send, History, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn, toDisplayText, isValidUuid } from '@/lib/utils';
import { createSession, saveMessage, getMindProfiles, getSessions, getMessages } from '@/db/api';
import { Message } from '@/types/types';
import IdentityGate from '@/components/chat/IdentityGate';
import VoiceControls from '@/components/chat/VoiceControls';
import { useVoiceOutput } from '@/hooks/useVoiceOutput';
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';

const WidgetPage = () => {
    const { profileId } = useParams<{ profileId: string }>();
    const [searchParams] = useSearchParams();
    const isPreview = searchParams.get('preview') === '1';
    const isEmbedded = useMemo(() => {
        try {
            return window.self !== window.top;
        } catch {
            return true;
        }
    }, []);
    const useIframeLayout = isPreview || isEmbedded;
    const [view, setView] = useState<'landing' | 'chat'>('landing');
    const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(true);
    const [message, setMessage] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [chatUserId, setChatUserId] = useState<string>('');
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [selectedProfile, setSelectedProfile] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const isSendingRef = useRef(false);
    const [userFullDetails, setUserFullDetails] = useState<any>(null);
    const [isDisclaimerVisible, setIsDisclaimerVisible] = useState(true);
    const [sessions, setSessions] = useState<any[]>([]);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    /** Resolved DB profile id — never use invalid URL params like "test-id". */
    const activeProfileId = isValidUuid(selectedProfile?.id)
        ? selectedProfile.id
        : isValidUuid(profileId)
            ? profileId
            : undefined;

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Voice Output Hook
    const { speak, isEnabled: voiceEnabled } = useVoiceOutput({ autoPlay: false, language: 'hi-IN' });

    useEffect(() => {
        if (!useIframeLayout) return;
        document.documentElement.classList.add('widget-embed');
        return () => document.documentElement.classList.remove('widget-embed');
    }, [useIframeLayout]);

    useEffect(() => {
        if (!isPreview) return;
        const guestId = localStorage.getItem('chat_user_id') || `guest_${Date.now()}`;
        if (!localStorage.getItem('chat_user_id')) {
            localStorage.setItem('chat_user_id', guestId);
        }
        setChatUserId(guestId);
        setUserFullDetails({ id: guestId, user_id: guestId, name: 'Guest User' });
    }, [isPreview]);

    useEffect(() => {
        const loadProfile = async () => {
            try {
                const profiles = await getMindProfiles();
                const matched = isValidUuid(profileId)
                    ? profiles.find(p => p.id === profileId)
                    : undefined;
                const profile = matched || profiles.find(p => p.is_primary) || profiles[0];
                setSelectedProfile(profile);

                if (profile && profileId && profile.id !== profileId) {
                    const qs = isPreview ? '?preview=1' : '';
                    window.history.replaceState(null, '', `/widget/${profile.id}${qs}`);
                }

                const welcomeText =
                    profile?.experience_settings?.initialMessage ||
                    profile?.response_settings?.initialMessage ||
                    `Welcome! 🌟 I'm ${profile?.name || 'your AI Coach'}. How can I help you today?`;
                setMessages([{ role: 'assistant', content: welcomeText }]);
            } catch (error) {
                console.error('Failed to load widget profile:', error);
            }
        };
        loadProfile();
    }, [profileId]);

    const loadSessions = async (userId: string) => {
        try {
            const dbSessions = await getSessions(userId);
            setSessions(dbSessions);
        } catch (e) {
            console.error('Failed to load sessions', e);
        }
    };

    const handleLoadConversation = async (session: any) => {
        setIsHistoryOpen(false);
        setCurrentSessionId(session.id);
        setView('chat');
        try {
            const dbMessages = await getMessages(session.id);
            const mapped = (dbMessages || []).map((msg: any) => ({
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
            }));
            setMessages(mapped);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch (e) {
            console.error('Failed to load conversation', e);
        }
    };

    const handleNewConversation = () => {
        const welcomeText =
            selectedProfile?.experience_settings?.initialMessage ||
            selectedProfile?.response_settings?.initialMessage ||
            `Welcome! 🌟 I'm ${selectedProfile?.name || 'your AI Coach'}. How can I help you today?`;
        setMessages([{ role: 'assistant', content: welcomeText }]);
        setCurrentSessionId(null);
        setIsHistoryOpen(false);
        setView('chat');
    };

    useEffect(() => {
        if (view === 'chat') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, view]);

    const handleSendMessageInternal = async (text: string) => {
        if (!text.trim() || !chatUserId || isSendingRef.current) return;
        if (!activeProfileId) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'This widget is still loading. Please wait a moment and try again.',
            }]);
            return;
        }

        try {
            isSendingRef.current = true;
            setIsProcessing(true);

            let sessionId = currentSessionId;
            if (!sessionId) {
                const title = text.substring(0, 30);
                const newSession = await createSession(chatUserId, title, activeProfileId);
                sessionId = newSession.id;
                setCurrentSessionId(sessionId);
                setSessions(prev => [newSession, ...prev]);
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
                    profileId: activeProfileId
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
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line) continue;

                    if (line.startsWith('data: ')) {
                        const dataContent = line.slice(6).trim();
                        if (dataContent === '[DONE]') break;

                        try {
                            const parsed = JSON.parse(dataContent);
                            if (typeof parsed === 'string') {
                                aiResponse += parsed;
                            } else if (parsed?.choices?.[0]?.delta?.content) {
                                aiResponse += parsed.choices[0].delta.content;
                            } else if (parsed?.text) {
                                aiResponse += parsed.text;
                            } else if (parsed?.content) {
                                aiResponse += parsed.content;
                            }
                        } catch (e) {
                            aiResponse += dataContent;
                        }
                    } else {
                        aiResponse += line + (chunk.endsWith('\n') ? '\n' : '');
                    }

                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];

                        if (aiResponse.includes('__SOURCES__:')) {
                            const [cleanContent, sourcesJson] = aiResponse.split('__SOURCES__:');
                            lastMsg.content = cleanContent;
                            try {
                                lastMsg.sources = JSON.parse(sourcesJson);
                            } catch (e) {
                                console.error("Failed to parse sources", e);
                            }
                        } else {
                            lastMsg.content = aiResponse;
                        }

                        return newMsgs;
                    });
                }
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
        if (view === 'landing') {
            setView('chat');
        }
        handleSendMessageInternal(msg);
    };

    const startChat = () => {
        setView('chat');
    };

    const widgetBody = (
            <div className={cn(
                "flex flex-col w-full bg-background overflow-hidden relative",
                useIframeLayout ? "h-full min-h-0" : "h-screen"
            )}>
                
                {/* Landing View */}
                {view === 'landing' && (
                    <div className="flex-1 overflow-y-auto w-full h-full pb-32">
                        {/* Header — minimal, no unnecessary icons */}

                        {/* Main Content */}
                        <main className="max-w-3xl mx-auto w-full px-4 py-8 flex flex-col items-center text-center space-y-8">
                            {/* Profile Section */}
                            <div className="space-y-4 w-full">
                                <div className="relative mx-auto w-24 h-24 md:w-32 md:h-32">
                                    {selectedProfile?.avatar_url ? (
                                        <img
                                            src={selectedProfile.avatar_url}
                                            alt={selectedProfile?.name || "Assistant"}
                                            className="w-full h-full rounded-full object-cover border-4 border-white shadow-lg"
                                        />
                                    ) : (
                                        <div className="w-full h-full rounded-full border-4 border-white shadow-lg bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-3xl">
                                            {selectedProfile?.name?.substring(0, 2).toUpperCase() || "AI"}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-center gap-2">
                                        <h1 className="text-2xl font-bold">{selectedProfile?.name || "Assistant"}</h1>
                                    </div>
                                    {(selectedProfile?.description || selectedProfile?.headline) && (
                                        <p className="text-muted-foreground max-w-lg mx-auto text-sm leading-relaxed">
                                            {selectedProfile?.description || selectedProfile?.headline}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center justify-center gap-4 pt-2">
                                    <Button
                                        className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-8 gap-2"
                                        onClick={startChat}
                                    >
                                        <MessageCircle className="w-4 h-4" />
                                        Chat
                                    </Button>
                                    <Button
                                        className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-8 gap-2"
                                        onClick={startChat}
                                    >
                                        <Phone className="w-4 h-4" />
                                        Call
                                    </Button>
                                </div>
                            </div>

                            {/* Description Section — hidden */}
                        </main>
                    </div>
                )}

                {/* Chat View */}
                {view === 'chat' && (
                    <>
                        <header className="h-16 border-b flex items-center justify-between px-4 bg-background z-10 flex-shrink-0 relative">
                            {/* History Button — left */}
                            <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <History className="w-5 h-5 text-muted-foreground" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[280px] p-0 flex flex-col h-full">
                                    <div className="p-4 border-b flex items-center justify-between">
                                        <span className="font-bold">Chat History</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-orange-500"
                                            onClick={handleNewConversation}
                                            title="New Chat"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-2">
                                        {sessions.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-8">No saved chats yet.</p>
                                        ) : (
                                            <div className="space-y-1">
                                                {sessions.map((session) => (
                                                    <div
                                                        key={session.id}
                                                        className={cn(
                                                            "flex items-center gap-3 px-3 py-3 hover:bg-muted/50 rounded-lg cursor-pointer transition-all",
                                                            currentSessionId === session.id && "bg-muted font-medium"
                                                        )}
                                                        onClick={() => handleLoadConversation(session)}
                                                    >
                                                        <MessageCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                        <div className="flex-1 overflow-hidden">
                                                            <div className="truncate text-sm">{session.title || "Untitled Chat"}</div>
                                                            <div className="text-[10px] text-muted-foreground">
                                                                {new Date(session.last_message_at || session.created_at).toLocaleDateString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </SheetContent>
                            </Sheet>

                            {/* Centered Title */}
                            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
                                <Avatar className="w-8 h-8">
                                    <AvatarImage src={selectedProfile?.avatar_url} />
                                    <AvatarFallback>{selectedProfile?.name?.substring(0, 2).toUpperCase() || "AI"}</AvatarFallback>
                                </Avatar>
                                <span className="font-semibold">{selectedProfile?.name || "Assistant"}</span>
                            </div>

                            {/* Right spacer */}
                            <div className="w-10" />
                        </header>

                        <div className="flex-1 relative w-full bg-background">
                            <div className="absolute inset-0 overflow-y-auto w-full h-full pb-32">
                                <div className="max-w-3xl mx-auto px-4 pt-4">
                                    {messages.map((msg, i) => (
                                        <div key={i} className={cn("flex items-start gap-4 mb-6", msg.role === 'user' ? "justify-end" : "justify-start")}>
                                            {msg.role === 'assistant' && (
                                                <Avatar className="w-8 h-8 flex-shrink-0 mt-1">
                                                    <AvatarImage src={selectedProfile?.avatar_url} />
                                                    <AvatarFallback>{selectedProfile?.name?.substring(0, 2).toUpperCase() || "AI"}</AvatarFallback>
                                                </Avatar>
                                            )}
                                            <div className={cn("flex flex-col max-w-[85%] md:max-w-[75%]", msg.role === 'user' ? "items-end" : "items-start")}>
                                                <div className={cn(
                                                    "rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm transition-all relative overflow-hidden",
                                                    msg.role === 'user'
                                                        ? "bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-tr-none shadow-orange-500/20 font-medium"
                                                        : "glass text-foreground rounded-tl-none border-white/40"
                                                )}>
                                                    {msg.role === 'assistant' ? (
                                                        <MarkdownRenderer content={msg.content} />
                                                    ) : (
                                                        msg.content
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Input Area - Absolute Bottom for BOTH views */}
                <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t p-4 z-20">
                    <div className="max-w-3xl mx-auto flex items-center gap-3 bg-muted/50 rounded-full p-2 border border-white/20 shadow-sm focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:bg-background transition-all relative">
                        {view === 'landing' && (
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                                <Sparkles className="w-5 h-5 ml-2" />
                            </div>
                        )}
                        <Input
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            placeholder={`Ask ${selectedProfile?.name || "Assistant"} a question`}
                            className={cn(
                                "h-10 bg-transparent border-none px-4 text-[15px] focus-visible:ring-0 shadow-none w-full",
                                view === 'landing' ? "pl-14 py-6" : ""
                            )}
                            disabled={isProcessing}
                        />
                        <div className="flex items-center gap-1 shrink-0 pr-1">
                            {view === 'chat' && (
                                <VoiceControls
                                    onVoiceInput={(transcript) => {
                                        setMessage(transcript);
                                    }}
                                    className="scale-90"
                                />
                            )}
                            <Button
                                size="icon"
                                className="rounded-full h-10 w-10 shrink-0 bg-gradient-to-r from-orange-500 to-red-600 hover:shadow-lg hover:shadow-orange-500/30 transition-all text-white"
                                onClick={handleSendMessage}
                                disabled={!message.trim() || isProcessing}
                            >
                                {view === 'landing' ? <ArrowRight className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                            </Button>
                        </div>
                    </div>
                </div>

            </div>
    );

    if (isPreview) {
        return widgetBody;
    }

    return (
        <IdentityGate
            onVerified={(user) => {
                setUserFullDetails(user);
                const uid = user.user_id || user.id;
                setChatUserId(uid);
                loadSessions(uid);
            }}
            profileId={activeProfileId}
            requireIdentityGate={selectedProfile?.experience_settings?.requireIdentityGate ?? true}
            embedded={useIframeLayout}
        >
            {widgetBody}
        </IdentityGate>
    );
};

export default WidgetPage;
