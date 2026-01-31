import { useState, useEffect, useRef, useCallback } from 'react';
import { InteractiveMindMap } from '../components/chat/InteractiveMindMap';
import { MarkdownRenderer } from '../components/chat/MarkdownRenderer';
import { VideoAvatar } from '../components/chat/VideoAvatar';
import { VoiceAssistant } from '../components/advanced/VoiceAssistant';
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
    Menu,
    LogOut,
    Pencil,
    ShieldCheck,
    Save,
    XCircle
} from 'lucide-react';
import { supabase } from '../db/supabase';
import { cn } from '@/lib/utils';
import { Message } from '@/types/types';
import IdentityGate from '../components/chat/IdentityGate';
import VoiceControls from '../components/chat/VoiceControls';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useVoiceOutput } from '../hooks/useVoiceOutput';
import { voiceService } from '../services/voiceService';
import { getSessions, createSession, getMessages, saveMessage, getMindProfiles, verifyAudienceAccess, upsertAudienceUser, updateMessage } from '../db/api';
import { useToast } from '@/hooks/use-toast';
// Feedback import removed

const SOCIAL_LINKS = [
    { icon: Instagram, label: '@ miteshkhatri', color: 'text-pink-600' },
    { icon: Linkedin, label: '@ in/miteshkhatri', color: 'text-blue-700' },
    { icon: X, label: '@ iMiteshKhatri', color: 'text-black' },
    { icon: Facebook, label: '@ MiteshKhatriPage', color: 'text-blue-600' },
    { icon: Youtube, label: '@ MiteshKhatriLOA', color: 'text-red-600' },
    { icon: Globe, label: 'www.miteshkhatri.com', color: 'text-gray-600' },
];

const ADMIN_EMAILS = [
    'admin@example.com', // REPLACE with your actual admin email
    'mitesh@miteshkhatri.com',
    'support@miteshkhatri.com',
    'komalsiddharth814@gmail.com' // User email added for admin access
];

const ChatPage = () => {
    const { toast } = useToast();
    console.log("🚀 ChatPage Rendering...");
    const location = useLocation();
    const navigate = useNavigate();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [message, setMessage] = useState('');
    const [isAdmin, setIsAdmin] = useState(false); // Admin State
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
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const isSendingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);

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

    // Editing State
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState('');
    const [editIsVerified, setEditIsVerified] = useState(false);

    // Voice Output Hook
    const { speak, stop, isEnabled: voiceEnabled, isSpeaking, toggleEnabled: toggleVoice } = useVoiceOutput({ autoPlay: false, language: 'hi-IN' });

    // Check Admin Status
    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            const localEmail = localStorage.getItem('chat_user_email');

            const currentUserEmail = user?.email || localEmail;

            if (currentUserEmail && ADMIN_EMAILS.some(e => currentUserEmail.toLowerCase().includes(e.toLowerCase()))) {
                console.log("👑 Admin Access Granted:", currentUserEmail);
                setIsAdmin(true);
            } else {
                console.log("❌ Admin Access Denied:", { currentUserEmail, ADMIN_EMAILS });
                setIsAdmin(false);
            }
        };
        checkAdmin();
    }, []);

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
        voiceService.stop();
        setCallStatus('listening');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = async () => {
                setIsRecording(false);
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                console.log("🎤 Audio recorded, size:", audioBlob.size);

                // Stop the stream
                stream.getTracks().forEach(track => track.stop());

                // Send to backend
                if (audioBlob.size > 0) {
                    setCallStatus('processing');
                    await processVoiceInput(audioBlob);
                } else {
                    console.warn("⚠️ Empty audio blob");
                    setCallStatus('listening');
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
            console.log("🎤 Recording started");
        } catch (error) {
            console.error("❌ Microphone access denied:", error);
            toast({ title: "Microphone Error", description: "Please allow microphone access", variant: "destructive" });
            setCallStatus('idle');
        }
    };

    const stopListening = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            console.log("🎤 Recording stopped");
        }
    };

    const processVoiceInput = async (audioBlob: Blob) => {
        try {
            // Cancel any ongoing request
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            if (selectedProfile?.id) {
                formData.append('profileId', selectedProfile.id);
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-engine`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                    body: formData,
                    signal: abortControllerRef.current.signal
                }
            );

            if (!response.ok) {
                throw new Error(`Voice Engine Error: ${response.status}`);
            }

            // Extract transcript and response text from headers
            const transcribedText = response.headers.get("X-Transcribed-Text")
                ? decodeURIComponent(response.headers.get("X-Transcribed-Text")!)
                : "";
            const responseText = response.headers.get("X-Response-Text")
                ? decodeURIComponent(response.headers.get("X-Response-Text")!)
                : "";

            console.log("📝 Transcript:", transcribedText);
            console.log("💬 Response:", responseText);

            // Save to chat history
            if (transcribedText) {
                let sessionId = currentSessionId;
                if (!sessionId) {
                    console.log("🆕 Voice: Creating new session...");
                    try {
                        // Sync identity first
                        const email = localStorage.getItem('chat_user_email');
                        const audienceUser = await upsertAudienceUser({
                            id: chatUserId,
                            email: email || undefined,
                            name: userFullDetails?.name || email?.split('@')[0] || 'Unknown User',
                            profile_id: selectedProfile?.id
                        });

                        const internalUserId = audienceUser?.id || chatUserId;
                        const newSession = await createSession(internalUserId, transcribedText.substring(0, 30), selectedProfile?.id);
                        sessionId = newSession.id;
                        setCurrentSessionId(sessionId);
                        activeSessionIdRef.current = sessionId;
                        setSessions(prev => [newSession, ...prev]);
                    } catch (err) {
                        console.error("❌ Voice: Failed to create session:", err);
                    }
                }

                if (sessionId) {
                    setMessages(prev => [...prev,
                    { role: 'user', content: transcribedText },
                    { role: 'assistant', content: responseText }
                    ]);
                    await saveMessage(sessionId, 'user', transcribedText)
                        .then(() => console.log("✅ Voice: User message saved"))
                        .catch(err => console.error("❌ Voice: Save user failed", err));

                    await saveMessage(sessionId, 'assistant', responseText)
                        .then(() => console.log("✅ Voice: Assistant message saved"))
                        .catch(err => console.error("❌ Voice: Save assistant failed", err));
                }
            }

            // Check for TTS failure - DON'T use browser fallback for voice calls
            if (response.headers.get("X-TTS-Failed") === "true") {
                const errorMsg = decodeURIComponent(response.headers.get("X-TTS-Error") || "Unknown Error");
                console.error("❌ ElevenLabs TTS Failed:", errorMsg);
                toast({
                    title: "Voice Error",
                    description: "Premium voice unavailable. Please check your ElevenLabs plan.",
                    variant: "destructive"
                });
                setCallStatus('listening');
                return;
            }

            // Play audio response
            const responseAudioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(responseAudioBlob);
            const audio = new Audio(audioUrl);
            audioPlayerRef.current = audio;

            setCallStatus('speaking');
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                audioPlayerRef.current = null;
                setCallStatus('listening');
            };
            audio.onerror = () => {
                URL.revokeObjectURL(audioUrl);
                audioPlayerRef.current = null;
                setCallStatus('listening');
            };

            await audio.play();
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log("✨ Request cancelled (user interrupted)");
                return;
            }
            console.error("❌ Voice processing error:", error);
            toast({ title: "Error", description: error.message, variant: "destructive" });
            setCallStatus('listening');
        } finally {
            abortControllerRef.current = null;
        }
    };

    const endCall = () => {
        // stop(); // Stop audio immediately. I need to make sure stop is available.
        setCallStatus('idle');
        stopCallListening();
        setIsCallOpen(false);
    };

    const handleSendMessageInternal = async (text: string, options?: { forceSpeak?: boolean; isCall?: boolean }) => {
        console.log("🚀 [handleSendMessageInternal] START", { text, chatUserId, currentSessionId });
        // Validation with Call Status Reset
        if (!text.trim() || !chatUserId || isSendingRef.current) {
            console.warn("⚠️ Send aborted:", { hasText: !!text.trim(), hasUser: !!chatUserId, isSending: isSendingRef.current });
            if (options?.isCall) {
                // Return to listening if we aborted a valid call request (e.g. empty text)
                // Or idle if critical missing data
                setCallStatus(chatUserId ? 'listening' : 'idle');
                if (!chatUserId) toast({ title: "Error", description: "User ID missing. Try refreshing.", variant: "destructive" });
            }
            return;
        }

        try {
            // 1. ABORT PREVIOUS REQUEST
            if (abortControllerRef.current) {
                console.log("🛑 Interrupt detected: Aborting previous request...");
                abortControllerRef.current.abort();
                voiceService.stop();
            }

            // 2. CREATE NEW CONTROLLER
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const signal = controller.signal;

            isSendingRef.current = true;
            setIsProcessing(true);

            let sessionId = currentSessionId;
            if (!sessionId) {
                const title = text.substring(0, 30);

                // 1. SYNC AUDIENCE USER FIRST (To get the correct UUID for foreign key)
                let internalUserId = chatUserId;
                try {
                    const email = localStorage.getItem('chat_user_email');
                    const audienceUser = await upsertAudienceUser({
                        id: chatUserId,
                        email: email || undefined,
                        name: userFullDetails?.name || email?.split('@')[0] || 'Unknown User',
                        profile_id: selectedProfile?.id
                    });

                    if (audienceUser?.id) {
                        internalUserId = audienceUser.id; // Use the internal UUID
                    }
                } catch (err) {
                    console.error("Failed to sync audience user:", err);
                }

                // 2. CREATE SESSION with the valid UUID
                const newSession = await createSession(internalUserId, title, selectedProfile?.id);
                sessionId = newSession.id;
                setCurrentSessionId(sessionId);
                activeSessionIdRef.current = sessionId;
                setSessions(prev => [newSession, ...prev]);
            }

            // ALWAYS add to chat UI and DB
            setMessages(prev => [...prev, { role: 'user', content: text }]);

            try {
                const savedUserMsg = await saveMessage(sessionId, 'user', text);
                if (savedUserMsg) {
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        // Update the last user message with real ID
                        const lastUserIdx = newMsgs.findLastIndex(m => m.role === 'user' && m.content === text);
                        if (lastUserIdx !== -1) {
                            newMsgs[lastUserIdx] = { ...newMsgs[lastUserIdx], id: savedUserMsg.id };
                        }
                        return newMsgs;
                    });
                }
            } catch (err) {
                console.error("❌ [ChatPage] Failed to save user message:", err);
            }

            let finalQuery = text;
            if (userFullDetails?.name) {
                const firstName = userFullDetails.name.trim().split(' ')[0];
                finalQuery = `(SYSTEM CONTEXT: The user's name is "${firstName}". Address them ONLY by their first name "${firstName}".) ${text}`;
            }

            // Generate ID for assistant message upfront to link with backend metrics
            const assistantMessageId = crypto.randomUUID();

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
                    profileId: selectedProfile?.id,
                    assistantMessageId: assistantMessageId // Pass ID to backend
                }),
                signal: signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null) || await response.text();
                console.error("❌ [ChatPage] Backend Error Details:", errorData);
                throw new Error(`Backend Error: ${JSON.stringify(errorData)}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let aiResponse = '';

            // ALWAYS add placeholder message
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
            const assistantMessageIndex = messages.length + 1; // Anticipate next index

            try {
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

                        // Update UI for ALL messages
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
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    console.log("✨ Stream aborted successfully.");
                    // Clean up UI if we were interrupted mid-sentence
                    // Clean up UI if we were interrupted mid-sentence
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        const lastMsg = newMsgs[newMsgs.length - 1];
                        if (lastMsg && lastMsg.role === 'assistant' && !lastMsg.content) {
                            return prev.slice(0, -1); // Remove empty assistant bubble
                        }
                        return newMsgs;
                    });
                    return; // EXIT EVERYTHING FOR THIS OLD REQUEST
                }
                throw err;
            }

            if (!aiResponse) {
                // If no response at all (and loop finished)
                if (options?.isCall) {
                    toast({ title: "No Response", description: "AI did not return any text.", variant: "destructive" });
                }
            }

            // Save to DB for ALL messages if response exists
            if (aiResponse) {
                const savedAssistantMsg = await saveMessage(sessionId, 'assistant', aiResponse)
                    .then((msg) => {
                        console.log("✅ Assistant message saved to DB");
                        return msg;
                    })
                    .catch(err => {
                        console.error("❌ Failed to save assistant message:", err);
                        return null;
                    });

                if (savedAssistantMsg) {
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        // Update the assistant message with real ID
                        // It should be the last message or close to it
                        const lastAssistIdx = newMsgs.findLastIndex(m => m.role === 'assistant');
                        if (lastAssistIdx !== -1) {
                            newMsgs[lastAssistIdx] = { ...newMsgs[lastAssistIdx], id: savedAssistantMsg.id };
                        }
                        return newMsgs;
                    });
                }
            }

            // Clear ref if this request finished normally
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
            }

            // Reset processing flags BEFORE audio playback starts
            // This prevents the "hang" where user can't send a new message while AI is still speaking
            setIsProcessing(false);
            isSendingRef.current = false;

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
            console.error('Error in handleSendMessage:', error);
            const errorMsg = "Error: " + (error.message || "Unknown error");

            if (options?.isCall) {
                toast({ title: "Error", description: errorMsg, variant: "destructive" });
                // Reset to listening so user can try again
                setCallStatus('listening');
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: errorMsg }]);
            }
            // Reset flags on error too
            setIsProcessing(false);
            isSendingRef.current = false;
        }
    };

    const handleSaveEdit = async () => {
        if (!editingMessageId) {
            setEditingMessageId(null);
            return;
        }

        try {
            // Use Backend Function to bypass RLS policies
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-engine`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    action: 'update_message',
                    messageId: editingMessageId,
                    content: editContent,
                    isVerified: editIsVerified
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null) || await response.text();
                console.error("❌ [ChatPage] Update Failed Details:", errorData);
                throw new Error(`Backend Error: ${JSON.stringify(errorData)}`);
            }

            setMessages(prev => prev.map(m =>
                m.id === editingMessageId
                    ? { ...m, content: editContent, is_edited: true, is_verified: editIsVerified }
                    : m
            ));

            setEditingMessageId(null);
            toast({ title: "Success", description: "Message updated successfully" });
        } catch (error: any) {
            console.error("Failed to update message", error);
            toast({
                title: "Error",
                description: `Failed to update: ${error.message || "Unknown error"}`,
                variant: "destructive"
            });
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

        if (location.state?.autoStartCall) {
            // Auto-start voice call
            setIsCallOpen(true);
            // Small timeout to allow Dialog to mount before starting audio
            setTimeout(() => {
                startCall();
            }, 500);
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

        // Only update if something actually changed to avoid re-render loops
        if (stableId !== chatUserId || !userFullDetails) {
            console.log("✅ Verified in ChatPage:", user.name, "ID:", stableId);
            setUserFullDetails(user);
            setChatUserId(stableId);

            if (location.state?.sessionId) {
                setCurrentSessionId(location.state.sessionId);
                activeSessionIdRef.current = location.state.sessionId;
                window.history.replaceState({}, document.title, location.pathname);
            }
            loadSessions(stableId);
        }
    }, [location.state, chatUserId, userFullDetails]);

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

                    <div className="p-4 border-t mt-auto">
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={async () => {
                                await supabase.auth.signOut();
                                localStorage.removeItem('chat_user_id');
                                localStorage.removeItem('chat_user_email');
                                window.location.reload();
                            }}
                        >
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </Button>
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

                                            {editingMessageId === msg.id ? (
                                                <div className="bg-background/80 backdrop-blur-md border border-orange-500/30 rounded-2xl p-3 w-full shadow-lg animate-in fade-in zoom-in-95 duration-200">
                                                    <Textarea
                                                        value={editContent}
                                                        onChange={(e) => setEditContent(e.target.value)}
                                                        className="min-h-[200px] mb-3 bg-white/50 dark:bg-black/20 resize-y header-font text-base"
                                                    />
                                                    <div className="flex items-center justify-between gap-3">
                                                        <label className="flex items-center gap-2 cursor-pointer group select-none bg-black/10 dark:bg-white/5 px-3 py-1.5 rounded-full hover:bg-black/20 dark:hover:bg-white/10 transition-colors border border-transparent hover:border-orange-500/30">
                                                            <div className={cn(
                                                                "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                                                editIsVerified ? "bg-green-500 border-green-500" : "border-muted-foreground group-hover:border-orange-500"
                                                            )} onClick={(e) => {
                                                                e.preventDefault();
                                                                setEditIsVerified(!editIsVerified);
                                                            }}>
                                                                {editIsVerified && <Check className="w-3 h-3 text-white" />}
                                                            </div>
                                                            <span className={cn("text-xs font-bold transition-colors uppercase tracking-wide", editIsVerified ? "text-green-600" : "text-muted-foreground")}>
                                                                Verify by Human Mitesh
                                                            </span>
                                                        </label>
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setEditingMessageId(null)}
                                                                className="h-7 w-7 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive"
                                                            >
                                                                <XCircle className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                onClick={handleSaveEdit}
                                                                className="h-7 px-3 text-xs bg-green-600 hover:bg-green-700 text-white rounded-full gap-1"
                                                            >
                                                                <Save className="w-3.5 h-3.5" />
                                                                Save
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={cn(
                                                    "rounded-2xl px-5 py-3.5 text-[15px] leading-relaxed shadow-sm transition-all relative overflow-hidden",
                                                    msg.role === 'user'
                                                        ? "bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-tr-none shadow-orange-500/20 font-medium"
                                                        : cn(
                                                            "glass text-foreground rounded-tl-none border-white/40",
                                                            msg.is_verified && "border-green-500/30 bg-green-50/50 dark:bg-green-900/10"
                                                        )
                                                )}>
                                                    {msg.mindMap ? (
                                                        <InteractiveMindMap data={msg.mindMap} />
                                                    ) : (
                                                        <>
                                                            <MarkdownRenderer content={msg.content} />
                                                            {msg.sources && msg.sources.length > 0 && (
                                                                <details className="mt-3 text-xs border-t border-white/10 pt-2 mb-2">
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
                                                            {msg.is_verified && (
                                                                <div className="mt-4 pt-2 border-t border-green-500/20 flex items-center justify-end">
                                                                    <div className="flex items-center gap-1.5 bg-green-500/10 dark:bg-green-500/20 px-2.5 py-1 rounded-full border border-green-500/20">
                                                                        <ShieldCheck className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                                                                        <span className="text-[10px] uppercase tracking-wider font-bold text-green-700 dark:text-green-300">
                                                                            By Human Mitesh
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {/* Action Buttons */}
                                            <div className={cn(
                                                "flex items-center mt-1 px-1 gap-1",
                                                msg.role === 'user' ? "justify-end" : "justify-start"
                                            )}>
                                                {msg.role === 'assistant' && isAdmin && msg.id && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-muted-foreground/50 hover:text-blue-500 hover:bg-blue-500/5 transition-all"
                                                        onClick={() => {
                                                            setEditingMessageId(msg.id || null);
                                                            setEditContent(msg.content);
                                                            setEditIsVerified(msg.is_verified || false);
                                                        }}
                                                        title="Edit Message (Admin)"
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </Button>
                                                )}
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

                                                {/* Feedback Buttons Removed */}
                                                {!msg.mindMap && msg.content && (
                                                    <Button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const msgId = msg.id || i; // Use ID or Index
                                                            if (playingMessageId === msgId) {
                                                                // STOP logic would go here
                                                                setPlayingMessageId(null);
                                                            } else {
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

            {/* Voice Call Overlay */}
            {/* Voice Call Overlay */}
            <VoiceAssistant
                isOpen={isCallOpen}
                onClose={() => setIsCallOpen(false)}
                userId={chatUserId}
            />
        </IdentityGate >
    );
};

export default ChatPage;
