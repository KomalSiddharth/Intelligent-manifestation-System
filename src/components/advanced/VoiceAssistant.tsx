
import { useState, useEffect, useRef } from 'react';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Mic, MicOff, Phone, X } from 'lucide-react';

interface VoiceAssistantProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

export function VoiceAssistant({ isOpen, onClose, userId }: VoiceAssistantProps) {
    const [status, setStatus] = useState('Initializing...');
    const [isMuted, setIsMuted] = useState(true); // ✅ Start muted!
    const [isConnected, setIsConnected] = useState(false);
    const [isAISpeaking, setIsAISpeaking] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    const callObjectRef = useRef<DailyCall | null>(null);

    // Cleanup function
    const cleanup = () => {
        if (callObjectRef.current) {
            callObjectRef.current.destroy();
            callObjectRef.current = null;
        }
        setIsConnected(false);
        setIsAISpeaking(false);
        setIsConnecting(false);
        setStatus('Ended');
    };

    const startVoiceSession = async () => {
        try {
            setIsConnecting(true);
            setStatus('Creating session...');

            // 1. Call backend to create room
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const response = await fetch(`${apiUrl}/start-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ user_id: userId })
            });

            if (!response.ok) throw new Error('Failed to start session');
            const data = await response.json();
            const { room_url, token } = data;

            setStatus('Joining room...');

            // 2. Initialize Daily Call
            const callObject = DailyIframe.createCallObject({
                url: room_url,
                token: token,
                subscribeToTracksAutomatically: true,
                dailyConfig: {
                    experimentalChromeVideoMuteLightOff: true
                }
            });

            callObjectRef.current = callObject;

            // Events
            callObject
                .on('joined-meeting', () => {
                    console.log('✅ Joined meeting');
                    setIsConnected(true);
                    setIsConnecting(false);
                    setStatus('Connected! Click mic to speak.');
                    callObject.setLocalAudio(false); // ✅ Force muted on join
                })
                .on('left-meeting', () => {
                    console.log('👋 Left meeting');
                    cleanup();
                })
                .on('error', (e) => {
                    console.error('Daily Error:', e);
                    setStatus('Connection Error');
                })
                .on('participant-joined', (event) => {
                    console.log('🤖 Participant joined:', event.participant.user_name);
                    if (event.participant.user_name === 'Mitesh AI Coach') {
                        setStatus('Mitesh is ready!');
                    }
                })
                .on('track-started', (event) => {
                    if (!event.participant.local && event.track.kind === 'audio') {
                        console.log('🔊 AI speaking');
                        setIsAISpeaking(true);
                        setStatus('Mitesh is speaking...');
                    }
                })
                .on('track-stopped', (event) => {
                    if (!event.participant.local && event.track.kind === 'audio') {
                        console.log('🔇 AI stopped');
                        setIsAISpeaking(false);
                        setStatus(isMuted ? 'Click mic to speak' : 'Listening...');
                    }
                });

            // Join
            await callObject.join();

        } catch (e) {
            console.error(e);
            setStatus('Failed to connect');
            setIsConnecting(false);
        }
    };

    const toggleMute = async () => {
        if (!callObjectRef.current) return;

        const newMutedState = !isMuted;
        setIsMuted(newMutedState);

        // Toggle mic
        try {
            callObjectRef.current.setLocalAudio(!newMutedState);
        } catch (e) {
            console.error("Failed to toggle mic:", e);
            setIsMuted(!newMutedState); // Revert
            return;
        }

        // Update status
        if (newMutedState) {
            setStatus('Mic muted. Click to speak.');
        } else {
            setStatus('Listening... Speak now!');
        }
    };

    const endCall = () => {
        if (callObjectRef.current) {
            callObjectRef.current.leave();
        }
        onClose();
    };

    // Lifecycle
    useEffect(() => {
        if (isOpen && !isConnected && !isConnecting) {
            startVoiceSession();
        } else if (!isOpen) {
            cleanup();
        }
        return () => cleanup();
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800" aria-describedby="voice-assistant-description">
                <DialogTitle className="sr-only">Voice Assistant</DialogTitle>
                <div id="voice-assistant-description" className="sr-only">
                    Voice Assistant Interface for Mitesh Khatri AI
                </div>
                <div className="flex flex-col items-center gap-6 py-8">
                    {/* Avatar */}
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center">
                            <span className="text-4xl font-bold text-white">MK</span>
                        </div>
                        {/* Pulse animation when AI is speaking */}
                        {isAISpeaking && (
                            <div className="absolute inset-0 rounded-full border-4 border-green-500 animate-pulse" />
                        )}
                        {/* Pulse animation when User is speaking (and connected) */}
                        {isConnected && !isMuted && !isAISpeaking && (
                            <div className="absolute inset-0 rounded-full border-4 border-blue-500 animate-pulse opacity-50" />
                        )}
                    </div>

                    {/* Status Text */}
                    <div className="text-center space-y-2">
                        <h3 className="text-xl font-semibold">Mitesh Khatri AI</h3>
                        <p className={`text-sm ${status.includes('Error') ? 'text-red-400' : 'text-gray-400'}`}>
                            {status}
                        </p>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-6">
                        <button
                            onClick={toggleMute}
                            disabled={!isConnected}
                            className={`p-4 rounded-full transition-colors ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-gray-800 text-white hover:bg-gray-700'
                                }`}
                        >
                            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                        </button>

                        <button
                            onClick={endCall}
                            className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                            <Phone className="w-6 h-6 transform rotate-[135deg]" />
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
