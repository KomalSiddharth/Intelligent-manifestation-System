import { useState, useEffect, useRef, useCallback } from 'react';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Mic, MicOff, Phone } from 'lucide-react';

interface VoiceAssistantProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

export function VoiceAssistant({ isOpen, onClose, userId }: VoiceAssistantProps) {
    const [status, setStatus] = useState('Initializing...');
    const [isMuted, setIsMuted] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isAISpeaking, setIsAISpeaking] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [callDuration, setCallDuration] = useState(0);

    const callRef = useRef<DailyCall | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const cleanup = useCallback(async () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        if (callRef.current) {
            try {
                await callRef.current.leave();
                callRef.current.destroy();
            } catch (e) {
                console.warn('Cleanup warning:', e);
            }
            callRef.current = null;
        }

        try {
            const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const apiUrl = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;
            await fetch(`${apiUrl}/end-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
        } catch (e) {
            console.warn('End session notification failed:', e);
        }

        setIsConnected(false);
        setIsAISpeaking(false);
        setIsConnecting(false);
        setCallDuration(0);
        setStatus('Call ended');
    }, [userId]);

    const startVoiceSession = async () => {
        try {
            setIsConnecting(true);
            setStatus('Creating session...');

            const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const apiUrl = rawApiUrl.endsWith('/') ? rawApiUrl.slice(0, -1) : rawApiUrl;

            console.log('📡 Requesting session from:', `${apiUrl}/start-session`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(`${apiUrl}/start-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `Server Error: ${response.status}`);
            }

            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Session creation failed');
            }

            const { room_url, token } = data;
            console.log('✅ Session created, room:', room_url);

            setStatus('Connecting...');

            // ⭐ FIX: Do NOT set audioSource here — causes OverconstrainedError
            // Mic will be enabled AFTER joining the room
            const call = DailyIframe.createCallObject({
                videoSource: false,
            });
            callRef.current = call;

            // Set up event handlers BEFORE joining
            call.on('joined-meeting', async () => {
                console.log('✅ Connected to Daily room');
                setIsConnected(true);
                setIsConnecting(false);
                setStatus('Connected! Waiting for Mitesh...');

                // ⭐ FIX: Enable microphone AFTER joining (avoids OverconstrainedError)
                try {
                    await call.setLocalAudio(true);
                    setIsMuted(false);
                    console.log('🎤 Microphone enabled');
                } catch (micError) {
                    console.warn('⚠️ Microphone not available:', micError);
                    setIsMuted(true);
                    setStatus('Connected! (Mic unavailable - check permissions)');
                }

                timerRef.current = setInterval(() => {
                    setCallDuration(prev => prev + 1);
                }, 1000);
            });

            call.on('participant-joined', (event) => {
                console.log('👤 Participant joined:', event?.participant?.user_name);
                if (event?.participant?.user_name === 'Mitesh AI Coach') {
                    console.log('🤖 AI Bot joined the room');
                    setStatus('Mitesh is ready! Speak freely...');
                }
            });

            call.on('participant-left', (event) => {
                console.log('👤 Participant left:', event?.participant?.user_name);
                if (event?.participant?.user_name === 'Mitesh AI Coach') {
                    setStatus('Mitesh disconnected');
                }
            });

            // Track AI speaking via track state
            call.on('track-started', (event) => {
                if (event?.participant?.user_name === 'Mitesh AI Coach' && event?.track?.kind === 'audio') {
                    console.log('🔊 Bot audio track started');
                    setIsAISpeaking(true);
                }
            });

            call.on('track-stopped', (event) => {
                if (event?.participant?.user_name === 'Mitesh AI Coach' && event?.track?.kind === 'audio') {
                    setIsAISpeaking(false);
                }
            });

            call.on('error', (error) => {
                console.error('❌ Daily error:', error);
                setStatus(`Error: ${error?.errorMsg || 'Connection failed'}`);
                cleanup();
            });

            call.on('left-meeting', () => {
                console.log('👋 Left meeting');
                cleanup();
            });

            // Join the room
            await call.join({
                url: room_url,
                token: token,
                startVideoOff: true,
                startAudioOff: true, // Start audio off, enable after join
            });

        } catch (e: any) {
            console.error('❌ Voice session error:', e);
            if (e.name === 'AbortError') {
                setStatus('Connection timeout. Please try again.');
            } else {
                setStatus(`Error: ${e.message}`);
            }
            setIsConnecting(false);
        }
    };

    const toggleMute = async () => {
        if (!callRef.current) return;

        const newMutedState = !isMuted;
        setIsMuted(newMutedState);

        try {
            callRef.current.setLocalAudio(!newMutedState);
            if (newMutedState) {
                setStatus('Mic muted. Tap to unmute.');
            } else {
                setStatus('Listening...');
            }
        } catch (e) {
            console.error('Failed to toggle mic:', e);
            setIsMuted(!newMutedState);
        }
    };

    const endCall = () => {
        cleanup();
        onClose();
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        if (isOpen && !isConnected && !isConnecting) {
            startVoiceSession();
        } else if (!isOpen && isConnected) {
            cleanup();
        }

        return () => {
            if (!isOpen) cleanup();
        };
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={() => {
            if (isConnected) {
                endCall();
            } else {
                onClose();
            }
        }}>
            <DialogContent
                className="sm:max-w-md bg-gray-900 text-white border-gray-800"
                aria-describedby="voice-assistant-description"
            >
                <DialogTitle className="sr-only">Voice Assistant</DialogTitle>
                <div id="voice-assistant-description" className="sr-only">
                    Voice Assistant Interface for Mitesh Khatri AI
                </div>

                <div className="flex flex-col items-center gap-6 py-8">
                    {/* Avatar */}
                    <div className="relative">
                        <div className={`w-32 h-32 rounded-full bg-gradient-to-br from-red-500 to-purple-600
                            flex items-center justify-center transition-transform duration-300
                            ${isAISpeaking ? 'scale-110' : 'scale-100'}`}
                        >
                            <span className="text-4xl font-bold text-white">MK</span>
                        </div>

                        {isAISpeaking && (
                            <div className="absolute inset-0 rounded-full border-4 border-green-400 animate-ping opacity-30" />
                        )}
                        {isConnected && !isMuted && !isAISpeaking && (
                            <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-pulse opacity-40" />
                        )}
                    </div>

                    {/* Name & Status */}
                    <div className="text-center space-y-1">
                        <h3 className="text-xl font-semibold">Mitesh Khatri AI</h3>
                        <p className={`text-sm ${status.includes('Error') ? 'text-red-400' : 'text-gray-400'}`}>
                            {status}
                        </p>
                        {isConnected && (
                            <p className="text-xs text-gray-500 font-mono">
                                {formatDuration(callDuration)}
                            </p>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-6">
                        <button
                            onClick={toggleMute}
                            disabled={!isConnected}
                            className={`p-4 rounded-full transition-all duration-200
                                ${isMuted
                                    ? 'bg-yellow-600 hover:bg-yellow-500'
                                    : 'bg-gray-700 hover:bg-gray-600'
                                }
                                ${!isConnected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                            `}
                            title={isMuted ? 'Unmute' : 'Mute'}
                        >
                            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        </button>

                        <button
                            onClick={endCall}
                            className="p-4 rounded-full bg-red-600 hover:bg-red-500 transition-colors cursor-pointer"
                            title="End call"
                        >
                            <Phone className="w-6 h-6 rotate-[135deg]" />
                        </button>
                    </div>

                    {isConnecting && (
                        <div className="flex items-center gap-2 text-gray-400">
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm">Connecting to Mitesh...</span>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
