import { useState, useEffect, useRef, useCallback } from 'react';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { Mic, MicOff, Phone, X } from 'lucide-react';

// ──────────────────────────── Pipecat Cloud Config ────────────────────────────
const PIPECAT_AGENT_NAME = 'mitesh-coach';
const PIPECAT_PUBLIC_KEY = 'pk_bf854221-8cbb-434a-b2a8-2839159fe3ad';
const PIPECAT_API_URL = 'https://api.pipecat.daily.co/v1/public';

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
    const [isUserSpeaking, setIsUserSpeaking] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [callDuration, setCallDuration] = useState(0);

    const callRef = useRef<DailyCall | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ──────────────────────────── Cleanup ────────────────────────────
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

        // Remove audio element
        const audioEl = document.getElementById('daily-remote-audio');
        if (audioEl) audioEl.remove();

        setIsConnected(false);
        setIsAISpeaking(false);
        setIsUserSpeaking(false);
        setIsConnecting(false);
        setCallDuration(0);
        setStatus('Call ended');
    }, []);

    // ──────────────────────────── Start Session via Pipecat Cloud ────────────────────────────
    const startVoiceSession = async () => {
        try {
            setIsConnecting(true);
            setStatus('Creating session...');

            console.log('📡 Starting Pipecat Cloud session...');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            // ⭐ Pipecat Cloud API - creates Daily room + spawns bot automatically
            const response = await fetch(`${PIPECAT_API_URL}/${PIPECAT_AGENT_NAME}/start`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${PIPECAT_PUBLIC_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    createDailyRoom: true,
                    body: {
                        user_id: userId,
                    }
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                if (response.status === 429) {
                    throw new Error('Server is busy. Please try again in a moment.');
                }
                throw new Error(errorData.error || `Server Error: ${response.status}`);
            }

            const data = await response.json();
            const roomUrl = data.dailyRoom;
            const token = data.dailyToken;

            if (!roomUrl || !token) {
                throw new Error('Invalid session response - missing room URL or token');
            }

            console.log('✅ Pipecat session created, room:', roomUrl);
            setStatus('Connecting to room...');

            // ──────────────────────────── Daily.co Setup ────────────────────────────
            const call = DailyIframe.createCallObject({
                videoSource: false,
                // Ensure we subscribe to remote audio
                subscribeToTracksAutomatically: true,
            });
            callRef.current = call;

            // Event: Joined meeting
            call.on('joined-meeting', async () => {
                console.log('✅ Connected to Daily room');
                setIsConnected(true);
                setIsConnecting(false);
                setStatus('Connected! Waiting for Mitesh...');

                // Enable local mic
                try {
                    await call.setLocalAudio(true);
                    setIsMuted(false);
                    console.log('🎤 Microphone enabled');
                } catch (micError) {
                    console.warn('⚠️ Microphone not available:', micError);
                    setIsMuted(true);
                    setStatus('Connected! (Mic unavailable - check permissions)');
                }

                // Ensure remote audio plays in browser
                try {
                    const audioElement = document.createElement('audio');
                    audioElement.autoplay = true;
                    audioElement.id = 'daily-remote-audio';
                    document.body.appendChild(audioElement);
                    console.log('🔊 Remote audio element created');
                } catch (e) {
                    console.warn('Audio element warning:', e);
                }

                timerRef.current = setInterval(() => {
                    setCallDuration(prev => prev + 1);
                }, 1000);
            });

            // Event: Bot joined
            call.on('participant-joined', (event) => {
                const name = event?.participant?.user_name || '';
                console.log('👤 Participant joined:', name);
                // Any non-local participant is the bot
                if (!event?.participant?.local) {
                    console.log('🤖 AI Bot joined the room');
                    setStatus('Mitesh is here! Start speaking...');
                }
            });

            // Event: Bot left
            call.on('participant-left', (event) => {
                if (!event?.participant?.local) {
                    setStatus('Mitesh disconnected');
                }
            });

            // Event: Track started (AI speaking) — PLAY AUDIO
            call.on('track-started', (event) => {
                if (!event?.participant?.local && event?.track?.kind === 'audio') {
                    console.log('🔊 Bot audio track started — attaching to audio element');
                    setIsAISpeaking(true);
                    setStatus('Mitesh is speaking...');

                    // Explicitly play remote audio track
                    try {
                        const existingAudio = document.getElementById('daily-remote-audio') as HTMLAudioElement;
                        if (existingAudio && event.track) {
                            const stream = new MediaStream([event.track]);
                            existingAudio.srcObject = stream;
                            existingAudio.play().catch(e => {
                                console.warn('Audio autoplay blocked, user interaction needed:', e);
                            });
                            console.log('🔊 Remote audio attached and playing');
                        }
                    } catch (e) {
                        console.warn('Audio attach error:', e);
                    }
                }
            });

            // Event: Track stopped
            call.on('track-stopped', (event) => {
                if (!event?.participant?.local && event?.track?.kind === 'audio') {
                    setIsAISpeaking(false);
                    setStatus('Listening...');
                }
            });

            // Event: Active speaker changed
            call.on('active-speaker-change', (event) => {
                const localId = call.participants()?.local?.session_id;
                if (event?.activeSpeaker?.peerId === localId) {
                    setIsUserSpeaking(true);
                    setIsAISpeaking(false);
                } else if (event?.activeSpeaker?.peerId) {
                    setIsUserSpeaking(false);
                    setIsAISpeaking(true);
                    setStatus('Mitesh is speaking...');
                }
            });

            // Event: Error
            call.on('error', (error) => {
                console.error('❌ Daily error:', error);
                setStatus(`Error: ${error?.errorMsg || 'Connection failed'}`);
                cleanup();
            });

            // Event: Left meeting
            call.on('left-meeting', () => {
                console.log('👋 Left meeting');
                cleanup();
            });

            // Join the room
            await call.join({
                url: roomUrl,
                token: token,
                startVideoOff: true,
                startAudioOff: true,
            });

        } catch (e: any) {
            console.error('❌ Voice session error:', e);
            if (e.name === 'AbortError') {
                setStatus('Connection timeout. Bot may be starting up — please try again.');
            } else {
                setStatus(`Error: ${e.message}`);
            }
            setIsConnecting(false);
        }
    };

    // ──────────────────────────── Mute Toggle ────────────────────────────
    const toggleMute = async () => {
        if (!callRef.current) return;
        const newMutedState = !isMuted;
        setIsMuted(newMutedState);
        try {
            callRef.current.setLocalAudio(!newMutedState);
            setStatus(newMutedState ? 'Mic muted' : 'Listening...');
        } catch (e) {
            console.error('Failed to toggle mic:', e);
            setIsMuted(!newMutedState);
        }
    };

    // ──────────────────────────── End Call ────────────────────────────
    const endCall = () => {
        cleanup();
        onClose();
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // ──────────────────────────── Lifecycle ────────────────────────────
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

    // Escape key to end call
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) endCall();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    if (!isOpen) return null;

    // ──────────────────────────── Full Screen Overlay UI ────────────────────────────
    return (
        <div className="fixed inset-0 z-[9999] bg-gradient-to-b from-gray-900 via-gray-950 to-black flex flex-col items-center justify-center">
            {/* Close / X button */}
            <button
                onClick={endCall}
                className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                title="Close (Esc)"
            >
                <X className="w-6 h-6" />
            </button>

            {/* Duration badge */}
            {isConnected && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm px-4 py-1.5 rounded-full">
                    <span className="text-white/80 text-sm font-mono">{formatDuration(callDuration)}</span>
                </div>
            )}

            {/* Main content */}
            <div className="flex flex-col items-center gap-8">
                {/* Avatar with animated rings */}
                <div className="relative">
                    {/* AI speaking rings */}
                    {isAISpeaking && (
                        <>
                            <div className="absolute inset-[-20px] rounded-full border-2 border-orange-400/30 animate-ping" />
                            <div className="absolute inset-[-12px] rounded-full border-2 border-orange-400/50 animate-pulse" />
                        </>
                    )}

                    {/* User speaking ring */}
                    {isUserSpeaking && !isMuted && (
                        <div className="absolute inset-[-12px] rounded-full border-2 border-blue-400/50 animate-pulse" />
                    )}

                    {/* Connecting spinner */}
                    {isConnecting && (
                        <div className="absolute inset-[-8px] rounded-full border-4 border-transparent border-t-orange-500 animate-spin" />
                    )}

                    {/* Avatar */}
                    <div
                        className={`
                            w-40 h-40 sm:w-48 sm:h-48 rounded-full 
                            bg-gradient-to-br from-orange-500 via-red-500 to-purple-600
                            flex items-center justify-center
                            transition-transform duration-300 shadow-2xl shadow-orange-500/20
                            ${isAISpeaking ? 'scale-110' : 'scale-100'}
                        `}
                    >
                        <span className="text-5xl sm:text-6xl font-bold text-white select-none">MK</span>
                    </div>

                    {/* Live indicator */}
                    {isConnected && (
                        <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-green-500 px-2 py-0.5 rounded-full">
                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                            <span className="text-[10px] font-bold text-white uppercase">Live</span>
                        </div>
                    )}
                </div>

                {/* Name & Status */}
                <div className="text-center space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white">Mitesh Khatri AI</h2>
                    <p className={`text-sm sm:text-base ${status.includes('Error') ? 'text-red-400' : 'text-gray-400'}`}>
                        {status}
                    </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-8 mt-4">
                    {/* Mute */}
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={toggleMute}
                            disabled={!isConnected}
                            className={`
                                p-5 rounded-full transition-all duration-200 
                                ${isMuted
                                    ? 'bg-yellow-500/20 ring-2 ring-yellow-500/50 hover:bg-yellow-500/30'
                                    : 'bg-white/10 hover:bg-white/20'
                                }
                                ${!isConnected ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
                            `}
                            title={isMuted ? 'Unmute' : 'Mute'}
                        >
                            {isMuted ? (
                                <MicOff className="w-7 h-7 text-yellow-400" />
                            ) : (
                                <Mic className={`w-7 h-7 ${isUserSpeaking ? 'text-blue-400' : 'text-white'}`} />
                            )}
                        </button>
                        <span className="text-xs text-gray-500">{isMuted ? 'Unmute' : 'Mute'}</span>
                    </div>

                    {/* End call */}
                    <div className="flex flex-col items-center gap-2">
                        <button
                            onClick={endCall}
                            className="p-5 rounded-full bg-red-600 hover:bg-red-500 transition-all duration-200 cursor-pointer active:scale-95 shadow-lg shadow-red-600/30"
                            title="End call"
                        >
                            <Phone className="w-7 h-7 text-white rotate-[135deg]" />
                        </button>
                        <span className="text-xs text-gray-500">End</span>
                    </div>
                </div>

                {/* Connecting spinner message */}
                {isConnecting && (
                    <div className="flex items-center gap-3 text-gray-400 mt-4 bg-white/5 px-6 py-3 rounded-full">
                        <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm">Connecting to Mitesh... (may take 10-15s on first call)</span>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="absolute bottom-6 text-center">
                <p className="text-xs text-gray-600">Powered by MiteshAI • Press Esc to end call</p>
            </div>
        </div>
    );
}
