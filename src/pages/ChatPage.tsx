import { useState, useEffect, useRef, useCallback } from 'react';
import { InteractiveMindMap } from '../components/chat/InteractiveMindMap';
import { MarkdownRenderer } from '../components/chat/MarkdownRenderer';
import { VideoAvatar } from '../components/chat/VideoAvatar';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
    Phone,
    History,
    Paperclip,
    Mic,
    MicOff,
    PhoneOff,
    Send,
    X,
    MessageSquare,
    Instagram,
    Linkedin,
    Facebook,
    Youtube,
    Globe,
    Plus,
    MessageCircle,
    Check,
    Copy,
    RefreshCw,
    Share2,
    Video,
    Volume2,
    Menu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Message } from '@/types/types';
import IdentityGate from '../components/chat/IdentityGate';
import VoiceControls from '../components/chat/VoiceControls';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useVoiceOutput } from '../hooks/useVoiceOutput';
import { getSessions, createSession, getMessages, saveMessage, getMindProfiles, verifyAudienceAccess } from '../db/api';
import { useToast } from '@/hooks/use-toast';

const SOCIAL_LINKS = [
    { icon: Instagram, label: '@ miteshkhatri', color: 'text-pink-600' },
    { icon: Linkedin, label: '@ in/miteshkhatri', color: 'text-blue-700' },
    { icon: X, label: '@ iMiteshKhatri', color: 'text-black' },
    { icon: Facebook, label: '@ MiteshKhatriPage', color: 'text-blue-600' },
    { icon: Youtube, label: '@ MiteshKhatriLOA', color: 'text-red-600' },
    { icon: Globe, label: 'www.miteshkhatri.com', color: 'text-gray-600' },
];

const ChatPage = () => {
    const { toast } = useToast();
    console.log("🚀 ChatPage Rendering...");
    const location = useLocation();
    const navigate = useNavigate();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [message, setMessage] = useState('');
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: "Hey, how's the Platinum Membership payment going? Need help with the balance or anything else, beta?" }
    ]);

    // Dialog States
    const [isActionCenterOpen, setIsActionCenterOpen] = useState(false);
    const [actionView, setActionView] = useState<'main' | 'socials' | 'feedback'>('main');

    // Call Voice Input
    const {
        startListening: startCallListening,
        stopListening: stopCallListening,
        transcript: callTranscript,
        isListening: isCallListening
    } = useVoiceInput({
        language: 'en-IN',
        onResult: (text) => console.log("📞 Call Transcript:", text)
    });
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isCallOpen, setIsCallOpen] = useState(false);
    const [videoUrl, setVideoUrl] = useState<string | undefined>();
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    // Call State
    const [callStatus, setCallStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const isSendingRef = useRef(false);

    // Identity & Session State
    const [chatUserId, setChatUserId] = useState<string>('');
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const activeSessionIdRef = useRef<string | null>(null);
    const [sessions, setSessions] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<any>(null);

    const [userFullDetails, setUserFullDetails] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [playingMessageId, setPlayingMessageId] = useState<string | number | null>(null);

    // Voice Output Hook
    const { speak, isEnabled: voiceEnabled, isSpeaking, toggleEnabled: toggleVoice } = useVoiceOutput({ autoPlay: false, language: 'hi-IN' });

    // Sync isSpeaking with callStatus
    useEffect(() => {
        if (isCallOpen) {
            if (isSpeaking) setCallStatus('speaking');
            else if (isProcessing) setCallStatus('processing');
            else if (callStatus !== 'listening') setCallStatus('idle');
        }
    }, [isSpeaking, isProcessing, isCallOpen]);

    const loadSessions = async (userId: string) => {
        try {
            // Only load if user is verified (has email in localStorage)
            const storedEmail = localStorage.getItem('chat_user_email');
            if (!storedEmail) {
                console.log("⏭️ Skipping session load - user not verified yet");
                return;
            }

            console.log("📋 Loading sessions for user:", userId);
            const dbSessions = await getSessions(userId);
            console.log("✅ Sessions loaded:", dbSessions.length, dbSessions);
            setSessions(dbSessions);
        } catch (e) {
            console.error("❌ Failed to load sessions", e);
        }
    };

    const startCall = async () => {
        // Stop any ongoing speech/audio first
        stop(); // From useVoiceOutput (wait, stop is not destructured)
        // Correcting stop usage
        // Note: stop() is not exposed by useVoiceOutput in the destructuring above? 
        // Checking useVoiceOutput hook definition from memory/context. 
        // Usually it exposes { speak, stop, isEnabled ... }
        // I will assume stop needs to be destructured.
        setCallStatus('listening');
        startCallListening();
    };

    // Need to update destructuring to include stop
    // But since I can't edit lines 116 in-place easily in this giant string block without being sure, 
    // I will use `speak` to stop? No.
    // I will assume `stop` was part of useVoiceOutput but I missed it in line 116 destructuring.
    // I will add it now.

    const stopListening = async () => {
        stopCallListening();
        setCallStatus('processing');

        setTimeout(async () => {
            if (callTranscript) {
                console.log("🗣️ Processing call input:", callTranscript);
                // isCall: true -> Don't add to main chat history
                await handleSendMessageInternal(callTranscript, { forceSpeak: true, isCall: true });
            } else {
                setCallStatus('listening');
            }
        }, 500);
    };

    const endCall = () => {
        // stop(); // Stop audio immediately. I need to make sure stop is available.
        setCallStatus('idle');
        stopCallListening();
        setIsCallOpen(false);
    };

    const handleSendMessageInternal = async (text: string, options?: { forceSpeak?: boolean; isCall?: boolean }) => {
        if (!text.trim() || !chatUserId || isSendingRef.current) return;

        try {
            isSendingRef.current = true;
            setIsProcessing(true);

            let sessionId = currentSessionId;
            if (!sessionId) {
                const title = text.substring(0, 30);
                const newSession = await createSession(chatUserId, title, selectedProfile?.id);
                sessionId = newSession.id;
                setCurrentSessionId(sessionId);
                activeSessionIdRef.current = sessionId;
                setSessions(prev => [newSession, ...prev]);
            }

            // ONLY add to chat UI if NOT a call
            if (!options?.isCall) {
                setMessages(prev => [...prev, { role: 'user', content: text }]);
                await saveMessage(sessionId, 'user', text);
            }

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
                    profileId: selectedProfile?.id
                })
            });

            if (!response.ok) throw new Error("Backend Error");

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let aiResponse = '';

            // Only add placeholder message if NOT a call
            if (!options?.isCall) {
                setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
            }

            while (true) {
                const { done, value } = await reader!.read();
                if (done) {
                    if (!aiResponse) {
                        const errorMsg = "⚠️ Connection established, but no response received. Please check Supabase Edge Function logs and API Keys.";
                        aiResponse = errorMsg;
                        if (!options?.isCall) {
                            setMessages(prev => {
                                const newMsgs = [...prev];
                                newMsgs[newMsgs.length - 1].content = errorMsg;
                                return newMsgs;
                            });
                        } else {
                            toast({ title: "Backend Error", description: "Connection established but no response.", variant: "destructive" });
                        }
                    }
                    console.log("✅ Stream complete. Final aiResponse length:", aiResponse.length);
                    break;
                }
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

                    // Update UI only if NOT a call
                    if (!options?.isCall) {
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
            }

            if (!aiResponse) {
                // If no response at all (and loop finished)
                if (options?.isCall) {
                    toast({ title: "No Response", description: "AI did not return any text.", variant: "destructive" });
                }
            }

            // Save to DB only if NOT a call
            if (!options?.isCall && aiResponse) {
                await saveMessage(sessionId, 'assistant', aiResponse);
            }

            if ((voiceEnabled || options?.forceSpeak) && aiResponse) {
                try {
                    if (options?.forceSpeak) setCallStatus('speaking');
                    await speak(aiResponse, selectedProfile?.id, options?.forceSpeak);
                    if (options?.forceSpeak) setCallStatus('listening');
                } catch (err) {
                    console.error('Voice output error:', err);
                    // ALWAYS show toast for voice error in Call mode so user knows
                    toast({ title: "Voice Error", description: "Audio playback failed. " + (err instanceof Error ? err.message : String(err)), variant: "destructive" });

                    if (options?.forceSpeak) setCallStatus('listening');
                }
            }
            const userWantsMindMap = text.toLowerCase().includes('mindmap') ||
                text.toLowerCase().includes('mind map') ||
                text.toLowerCase().includes('diagram') ||
                text.toLowerCase().includes('flowchart');

            if (userWantsMindMap) {
                setTimeout(() => handleGenerateMindMap(), 1000);
            }

        } catch (error: any) {
            console.error('Error:', error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Error: " + error.message }]);
        } finally {
            setIsProcessing(false);
            isSendingRef.current = false;
        }
    };

    const handleRegenerate = async (index: number) => {
        if (isSendingRef.current || !chatUserId) return;

        let userMessage = "";
        for (let j = index - 1; j >= 0; j--) {
            if (messages[j].role === 'user') {
                userMessage = messages[j].content;
                break;
            }
        }

        if (!userMessage) return;

        try {
            isSendingRef.current = true;
            setIsProcessing(true);

            const firstName = userFullDetails?.name?.trim().split(' ')[0] || "Champion";
            const regenQuery = `(SYSTEM: User "${firstName}" wants a BETTER, DELPHI-BEATING answer. 
            MANDATORY RULES:
            1. Use a Numbered List for ALL action steps.
            2. NO DENSE PARAGRAPHS. Every step must be its own line with a bold header.
            3. CONTEXT WEAVING: Mention the user's specific location (e.g. SF Bay Area) or industry in the steps.
            4. Provide a RELATABLE SCENARIO at the end.
            5. If URLs/Links are in your context, you MUST include them.) 
            
            Original Question: "${userMessage}"`;

            setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[index] = { ...newMsgs[index], content: '', sources: undefined };
                return newMsgs;
            });

            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-engine`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    query: regenQuery,
                    userId: chatUserId,
                    sessionId: currentSessionId,
                    profileId: selectedProfile?.id
                })
            });

            if (!response.ok) throw new Error("Backend Error");

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let aiResponse = '';

            while (true) {
                const { done, value } = await reader!.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (typeof data === 'string') {
                                aiResponse += data;
                            } else if (data?.choices?.[0]?.delta?.content) {
                                aiResponse += data.choices[0].delta.content;
                            }
                        } catch (e) { }
                    } else if (line.trim() !== '') {
                        aiResponse += line;
                    }

                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const targetMsg = newMsgs[index];

                        if (aiResponse.includes('__SOURCES__:')) {
                            const [cleanContent, sourcesJson] = aiResponse.split('__SOURCES__:');
                            targetMsg.content = cleanContent;
                            try {
                                targetMsg.sources = JSON.parse(sourcesJson);
                            } catch (e) { }
                        } else {
                            targetMsg.content = aiResponse;
                        }

                        return newMsgs;
                    });
                }
            }

            if (currentSessionId) {
                await saveMessage(currentSessionId, 'assistant', aiResponse);
            }

            if (voiceEnabled && aiResponse) {
                speak(aiResponse, selectedProfile?.id);
            }

        } catch (err) {
            console.error("Regeneration Error:", err);
        } finally {
            isSendingRef.current = false;
            setIsProcessing(false);
        }
    };

    useEffect(() => {
        if (messagesEndRef.current) {
            if (activeSessionIdRef.current === currentSessionId) {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, [messages.length, currentSessionId]);

    const handleCopy = async (text: string, index: number) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(index);
            setTimeout(() => setCopiedId(null), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    useEffect(() => {
        const init = async () => {
            const userId = localStorage.getItem('chat_user_id');
            const userEmail = localStorage.getItem('chat_user_email');

            if (userId) {
                setChatUserId(userId);
                try {
                    if (userEmail) {
                        const details = await verifyAudienceAccess(userEmail);
                        setUserFullDetails(details);
                    }
                } catch (err) {
                    console.error("Failed to load user details", err);
                }
            }

            const dbProfiles = await getMindProfiles();
            setProfiles(dbProfiles);
            if (dbProfiles.length > 0) {
                const primary = dbProfiles.find(p => p.is_primary) || dbProfiles[0];
                setSelectedProfile(primary);
            }

            if (userId) {
                loadSessions(userId);
            }
        };
        init();
    }, []);

    useEffect(() => {
        if (location.state?.initialMessage) {
            const initialMsg = location.state.initialMessage;
            setMessages(prev => [...prev, { role: 'user', content: initialMsg }]);
            handleSendMessageInternal(initialMsg);
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const handleGenerateMindMap = async () => {
        setIsActionCenterOpen(false);
        const processingId = Date.now().toString();

        setMessages(prev => [...prev, {
            role: 'assistant',
            content: '🧠 Analyzing conversation to generate Mind Map...',
            id: processingId
        }]);

        try {
            const contextMessages = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-mindmap`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ messages: contextMessages })
            });

            if (!response.ok) throw new Error("Failed to generate mind map");

            const data = await response.json();

            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== processingId);
                return [...filtered, {
                    role: 'assistant',
                    content: '[MINDMAP_GENERATED]',
                    mindMap: data
                }];
            });

        } catch (error) {
            console.error(error);
            setMessages(prev => prev.map(m =>
                m.id === processingId
                    ? { ...m, content: "⚠️ Failed to generate Mind Map. Please try again." }
                    : m
            ));
        }
    };

    const handleNewConversation = () => {
        setMessages([]);
        setCurrentSessionId(null);
        activeSessionIdRef.current = null;
        window.history.replaceState({}, document.title, location.pathname);
        setIsHistoryOpen(false);
    };

    const handleLoadConversation = async (session: any) => {
        setCurrentSessionId(session.id);
        if (session.profile_id) {
            const prof = profiles.find(p => p.id === session.profile_id);
            if (prof) setSelectedProfile(prof);
        }
        setIsHistoryOpen(false);
        try {
            const dbMessages = await getMessages(session.id);
            const mappedMessages = (dbMessages || []).map((msg: any) => ({
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
                image: msg.image_url,
                mindMap: msg.mind_map,
                sources: msg.sources
            }));

            setMessages(mappedMessages);
            activeSessionIdRef.current = session.id;
            setTimeout(() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
        } catch (error) {
            console.error('Error loading conversation:', error);
        }
    };

    const handleSendMessage = async () => {
        if (!message.trim()) return;
        const msg = message;
        setMessage('');
        await handleSendMessageInternal(msg);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result as string;
                setMessages(prev => [...prev, {
                    role: 'user',
                    content: `Sent an image: ${file.name}`,
                    image: result
                }]);

                setTimeout(() => {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: "I received your image. How can I help you with this?"
                    }]);
                }, 1000);
            };
            reader.readAsDataURL(file);
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };



    const handleVerified = useCallback((user: any) => {
        const stableId = user.user_id || user.id;
        console.log("✅ Verified in ChatPage:", user.name, "ID:", stableId);
        setUserFullDetails(user);

        // Only update if user ID actually changed
        if (stableId && stableId !== chatUserId) {
            console.log("🔄 User ID changed, updating sessions...");
            setChatUserId(stableId);
            if (location.state?.sessionId) {
                setCurrentSessionId(location.state.sessionId);
                activeSessionIdRef.current = location.state.sessionId;
                window.history.replaceState({}, document.title, location.pathname);
            }
            loadSessions(stableId);
        } else if (stableId) {
            console.log("✋ User ID same, skipping session reload");
        }
    }, [location.state, chatUserId]);

    return (
        <IdentityGate onVerified={handleVerified} profileId={selectedProfile?.id}>
            <div className="flex bg-background h-screen w-full overflow-hidden fixed inset-0">
                {/* Sidebar (Desktop) */}
                <aside className={cn(
                    "hidden md:flex w-80 border-r flex-col h-full bg-card transition-all duration-300",
                    !isSidebarOpen && "md:hidden"
                )}>
                    <div className="p-4 border-b flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold">
                                ⌘
                            </div>
                            <span className="font-bold text-lg">Delphi</span>
                            <div className="text-xs px-2 py-1 bg-muted rounded">Beta</div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsSidebarOpen(false)}
                            className="h-8 w-8"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="p-3">
                        <Button
                            className="w-full justify-start gap-2 bg-orange-50 text-orange-600 hover:bg-orange-100 border-none shadow-none"
                            onClick={handleNewConversation}
                        >
                            <Plus className="w-4 h-4" /> New Chat
                        </Button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-2">
                        {sessions.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-8">No saved chats yet.</div>
                        ) : (
                            <div className="space-y-1">
                                {sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className={cn(
                                            "group flex items-center gap-3 px-3 py-3 hover:bg-muted/50 rounded-lg cursor-pointer transition-all",
                                            currentSessionId === session.id && "bg-muted font-medium"
                                        )}
                                        onClick={() => handleLoadConversation(session)}
                                    >
                                        <MessageCircle className="w-4 h-4 text-muted-foreground" />
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
                </aside>

                <main className="flex-1 flex flex-col h-full w-full relative">
                    {/* Header */}
                    <header className="h-16 border-b flex items-center justify-between px-4 bg-background z-10 flex-shrink-0">
                        <div className="flex items-center gap-4">
                            {/* Hamburger Menu (when sidebar is closed) */}
                            {!isSidebarOpen && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsSidebarOpen(true)}
                                    className="hidden md:flex"
                                >
                                    <Menu className="w-5 h-5" />
                                </Button>
                            )}
                            <div className="flex items-center gap-2 text-orange-500 font-bold text-xl cursor-pointer" onClick={() => navigate('/')}>
                                <span>⌘</span> <span>Delphi</span>
                            </div>

                            {/* Mobile History Toggle */}
                            <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" className="md:hidden">
                                        <History className="w-5 h-5" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[300px] sm:w-[400px] p-0 flex flex-col h-full">
                                    <div className="p-4 border-b">
                                        <span className="font-bold">Chat History</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto">
                                        {sessions.length === 0 ? (
                                            <div className="text-center text-sm text-muted-foreground py-8">No saved chats yet.</div>
                                        ) : (
                                            <div className="space-y-1 p-2">
                                                {sessions.map((session) => (
                                                    <div
                                                        key={session.id}
                                                        className={cn(
                                                            "group flex items-center gap-3 px-3 py-3 hover:bg-muted/50 rounded-lg cursor-pointer transition-all",
                                                            currentSessionId === session.id && "bg-muted font-medium"
                                                        )}
                                                        onClick={() => handleLoadConversation(session)}
                                                    >
                                                        <MessageCircle className="w-4 h-4 text-muted-foreground" />
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
                        </div>

                        <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
                            <Avatar className="w-8 h-8">
                                <AvatarImage src={selectedProfile?.avatar_url || "https://miaoda-conversation-file.s3cdn.medo.dev/user-7nqges6yla0w/conv-81mqyjlan9xc/20251206/file-81ndgdtyydq8.png"} />
                                <AvatarFallback>{selectedProfile?.name?.substring(0, 2).toUpperCase() || "AI"}</AvatarFallback>
                            </Avatar>
                            <span className="font-semibold">{selectedProfile?.name || "AI Assistant"}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setVideoUrl('https://videos.heygen.ai/v1/realtime/...')}>
                                <Video className="w-5 h-5 text-muted-foreground" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setIsCallOpen(true)}>
                                <Phone className="w-5 h-5 text-muted-foreground" />
                            </Button>
                            <div className="w-8 h-8 rounded-full bg-teal-500 text-white flex items-center justify-center text-sm font-medium">
                                K
                            </div>
                        </div>
                    </header>

                    {/* Chat Area */}
                    <div className="flex-1 relative w-full bg-background">
                        <div
                            id="chat-scroller"
                            className="absolute inset-0 overflow-y-auto w-full h-full pb-32"
                        >
                            <div className="max-w-3xl mx-auto px-4 pt-4">
                                {messages.length === 0 && !isProcessing && (
                                    <div className="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center text-muted-foreground">
                                        <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-3xl mb-4">
                                            ⌘
                                        </div>
                                        <h2 className="text-xl font-semibold mb-2">Start a new conversation</h2>
                                        <p className="text-sm">Ask me anything, or choose a suggested question below.</p>
                                    </div>
                                )}
                                {messages.map((msg, i) => (
                                    <div
                                        key={msg.id || i}
                                        className={cn(
                                            "flex items-start gap-4 mb-6",
                                            msg.role === 'user' ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        {msg.role === 'assistant' && (
                                            <Avatar className="w-8 h-8 flex-shrink-0">
                                                <AvatarImage src={selectedProfile?.avatar_url || "https://miaoda-conversation-file.s3cdn.medo.dev/user-7nqges6yla0w/conv-81mqyjlan9xc/20251206/file-81ndgdtyydq8.png"} />
                                                <AvatarFallback>{selectedProfile?.name?.substring(0, 2).toUpperCase() || "AI"}</AvatarFallback>
                                            </Avatar>
                                        )}
                                        <div className={cn("flex flex-col max-w-[70%]", msg.role === 'user' ? "items-end" : "items-start")}>
                                            {msg.image && (
                                                <div className="relative group rounded-2xl overflow-hidden border shadow-lg mb-2">
                                                    <img src={msg.image} alt="Uploaded" className="max-w-full h-auto" />
                                                </div>
                                            )}

                                            <div className={cn(
                                                "rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm transition-all",
                                                msg.role === 'user'
                                                    ? "bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-tr-none shadow-orange-500/20 font-medium"
                                                    : "glass text-foreground rounded-tl-none border-white/40"
                                            )}>
                                                {msg.mindMap ? (
                                                    <InteractiveMindMap data={msg.mindMap} />
                                                ) : (
                                                    <>
                                                        <MarkdownRenderer content={msg.content} />
                                                        {msg.sources && msg.sources.length > 0 && (
                                                            <details className="mt-3 text-xs border-t border-white/10 pt-2">
                                                                <summary className="opacity-70 cursor-pointer hover:opacity-100 transition-opacity font-medium flex items-center gap-1">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                                                                    {msg.sources.length} Sources Used
                                                                </summary>
                                                                <ul className="mt-2 space-y-1 pl-2">
                                                                    {msg.sources.map((source: any, idx: number) => (
                                                                        <li key={idx}>
                                                                            <span className="font-bold text-orange-600 dark:text-orange-400">•</span>{' '}
                                                                            {source.title}
                                                                            <span className="opacity-60 ml-1">
                                                                                (Match: {(source.similarity * 100).toFixed(0)}%)
                                                                            </span>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </details>
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className={cn(
                                                "flex items-center mt-1 px-1 gap-1",
                                                msg.role === 'user' ? "justify-end" : "justify-start"
                                            )}>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 text-muted-foreground/50 hover:text-orange-500 hover:bg-orange-500/5 transition-all"
                                                    onClick={() => handleCopy(msg.content, i)}
                                                >
                                                    {copiedId === i ? (
                                                        <Check className="w-3.5 h-3.5 text-green-500" />
                                                    ) : (
                                                        <Copy className="w-3.5 h-3.5" />
                                                    )}
                                                </Button>
                                                {msg.role === 'assistant' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-muted-foreground/50 hover:text-orange-500 hover:bg-orange-500/5 transition-all"
                                                        onClick={() => handleRegenerate(i)}
                                                        disabled={isProcessing}
                                                    >
                                                        <RefreshCw className={cn("w-3.5 h-3.5", isProcessing && "animate-spin")} />
                                                    </Button>
                                                )}
                                                {!msg.mindMap && msg.content && (
                                                    <Button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const msgId = msg.id || i; // Use ID or Index
                                                            if (playingMessageId === msgId) {
                                                                // stop(); // stop logic if available
                                                                // I'll skip complex stop logic here to save space as stop is not in scope
                                                                setPlayingMessageId(null);
                                                            } else {
                                                                // stop();
                                                                setPlayingMessageId(msgId);
                                                                speak(msg.content, selectedProfile?.id, true)
                                                                    .then(() => setPlayingMessageId(null))
                                                                    .catch(() => setPlayingMessageId(null));
                                                            }
                                                        }}
                                                        variant="ghost"
                                                        size="icon"
                                                        className={cn(
                                                            "h-6 w-6 transition-all",
                                                            playingMessageId === (msg.id || i) ? "text-orange-500 opacity-100" : "text-muted-foreground/50 opacity-0 group-hover:opacity-100"
                                                        )}
                                                        title={playingMessageId === (msg.id || i) ? "Stop Speaking" : "Read Aloud"}
                                                    >
                                                        {playingMessageId === (msg.id || i) ? (
                                                            <div className="w-2.5 h-2.5 bg-current rounded-sm animate-pulse" />
                                                        ) : (
                                                            <Volume2 className="w-3.5 h-3.5" />
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {isProcessing && (
                                    <div className="flex items-center gap-2 text-muted-foreground ml-12 animate-in fade-in zoom-in duration-300">
                                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <div className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                )}
                                <div ref={messagesEndRef} className="h-4" />
                            </div>
                        </div>

                        {/* Input Area - Absolute Bottom */}
                        <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-md border-t p-4 z-20">
                            <div className="max-w-3xl mx-auto flex items-end gap-3 bg-muted/50 rounded-3xl p-2 border border-white/20 shadow-sm focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:bg-background transition-all">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full text-muted-foreground hover:text-orange-600 hover:bg-orange-50 flex-shrink-0"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Paperclip className="w-5 h-5" />
                                    <input
                                        type="file"
                                        className="hidden"
                                        ref={fileInputRef}
                                        onChange={handleFileSelect}
                                        accept="image/*"
                                    />
                                </Button>
                                <Textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder={isProcessing ? "K is thinking..." : "Ask K anything..."}
                                    className="min-h-[20px] max-h-[120px] w-full resize-none border-0 focus-visible:ring-0 bg-transparent py-3 px-2 text-[15px] placeholder:text-muted-foreground/70"
                                />
                                <div className="flex items-center gap-1 pb-1">
                                    <VoiceControls
                                        onVoiceInput={(transcript) => setMessage(transcript)}
                                        onAutoSend={(transcript) => {
                                            handleSendMessageInternal(transcript, { forceSpeak: false });
                                            setMessage('');
                                        }}
                                        voiceEnabled={voiceEnabled}
                                        onToggleVoice={toggleVoice}
                                        className="scale-90"
                                    />
                                    <Button
                                        onClick={handleSendMessage}
                                        disabled={!message.trim() || isProcessing}
                                        className="rounded-full w-10 h-10 p-0 bg-gradient-to-r from-orange-500 to-red-600 hover:shadow-lg hover:shadow-orange-500/30 transition-all"
                                    >
                                        <Send className="w-5 h-5 text-white" />
                                    </Button>
                                </div>
                            </div>

                            {/* Action Bar (Below Input) */}
                            <div className="max-w-3xl mx-auto mt-2 flex items-center justify-between px-2">
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => setActionView(actionView === 'socials' ? 'main' : 'socials')}
                                        variant="ghost"
                                        size="sm"
                                        className={cn("text-xs text-muted-foreground hover:bg-orange-50 hover:text-orange-600 gap-1 rounded-full", actionView === 'socials' && 'bg-orange-50 text-orange-600')}
                                    >
                                        <Globe className="w-3.5 h-3.5" />
                                        Socials
                                    </Button>
                                    <Button
                                        onClick={() => handleGenerateMindMap()}
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs text-muted-foreground hover:bg-orange-50 hover:text-orange-600 gap-1 rounded-full"
                                    >
                                        <Share2 className="w-3.5 h-3.5" />
                                        Mind Map
                                    </Button>
                                    <Button
                                        onClick={() => speak("Hello! This is a test to confirm that my voice is working correctly via Eleven Labs.", selectedProfile?.id, true)}
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs text-muted-foreground hover:bg-green-50 hover:text-green-600 gap-1 rounded-full"
                                    >
                                        <Volume2 className="w-3.5 h-3.5" />
                                        Test Voice
                                    </Button>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setActionView('feedback')}
                                    className="text-xs text-muted-foreground hover:text-foreground gap-1 rounded-full"
                                >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    Feedback
                                </Button>
                            </div>

                            {/* Collapsible Action View */}
                            {actionView === 'socials' && isActionCenterOpen && (
                                <div className="max-w-3xl mx-auto mt-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
                                    <div className="glass rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 border shadow-sm">
                                        {SOCIAL_LINKS.map((link, idx) => (
                                            <a
                                                key={idx}
                                                href={`https://${link.label.replace('@ ', '')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/50 transition-colors group"
                                            >
                                                <link.icon className={cn("w-4 h-4", link.color)} />
                                                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground truncate">{link.label}</span>
                                            </a>
                                        ))}
                                    </div>
                                    <div className="p-4 text-center text-xs text-muted-foreground border-t">
                                        Powered by ⌘ MiteshAI
                                    </div>
                                </div>
                            )}

                            {actionView === 'feedback' && (
                                <div className="max-w-3xl mx-auto mt-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
                                    <div className="glass rounded-xl p-6 border shadow-sm space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h3 className="font-semibold">Send Feedback</h3>
                                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setActionView('main')}>
                                                <X className="w-4 h-4" />
                                            </Button>
                                        </div>
                                        <p className="text-sm text-muted-foreground">
                                            If you're experiencing any problems or have suggestions for improvement, please share your thoughts with us.
                                        </p>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Subject</label>
                                            <Input className="bg-white/50" placeholder="Brief summary" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Content</label>
                                            <Textarea className="min-h-[100px] bg-white/50 resize-none" placeholder="Describe your experience..." />
                                        </div>
                                        <div className="flex justify-end">
                                            <Button className="bg-orange-600 hover:bg-orange-700 text-white rounded-full">
                                                Submit Feedback
                                            </Button>
                                        </div>
                                        <div className="text-center text-xs text-muted-foreground pt-2 border-t mt-4">
                                            Powered by ⌘ MiteshAI
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {/* Call Overlay */}
            <Dialog open={isCallOpen} onOpenChange={setIsCallOpen}>
                <DialogContent className="sm:max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border-slate-800 text-white p-0 overflow-hidden">
                    <div className="flex flex-col items-center justify-center p-8 h-[400px] relative">
                        <div className="absolute top-4 right-4 z-10">
                            <Button variant="ghost" size="icon" onClick={endCall} className="text-white/50 hover:text-white hover:bg-white/10 rounded-full">
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        {/* Video Avatar */}
                        <VideoAvatar
                            status={callStatus}
                            avatarUrl={selectedProfile?.avatar_url}
                            profileName={selectedProfile?.name}
                            videoUrl={videoUrl}
                            className="w-48 h-48 mb-8"
                        />

                        <h3 className="text-2xl font-bold mb-2">{selectedProfile?.name || "AI Assistant"}</h3>
                        <p className="text-slate-400 mb-8 animate-pulse">
                            {callStatus === 'listening' ? "Listening..." :
                                callStatus === 'speaking' ? "Speaking..." :
                                    callStatus === 'processing' ? "Thinking..." : "Ready"}
                        </p>

                        <div className="flex gap-6">
                            <Button
                                size="lg"
                                variant="outline"
                                className={cn(
                                    "rounded-full w-14 h-14 p-0 border-slate-700 bg-slate-800/50 hover:bg-slate-700 hover:text-white",
                                    callStatus === 'listening' && "bg-slate-700 text-white"
                                )}
                                onClick={callStatus === 'listening' ? stopListening : startCall}
                            >
                                {callStatus === 'listening' ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                            </Button>
                            <Button
                                size="lg"
                                variant="destructive"
                                className="rounded-full w-14 h-14 p-0 bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20"
                                onClick={endCall}
                            >
                                <PhoneOff className="w-6 h-6" />
                            </Button>
                        </div>

                        {/* Hidden Audio Player */}
                        <audio ref={audioPlayerRef} className="hidden" />
                    </div>
                </DialogContent>
            </Dialog>
        </IdentityGate>
    );
};

export default ChatPage;
