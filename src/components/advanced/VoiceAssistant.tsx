
import { useState, useEffect, useRef } from 'react';
import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant } from 'livekit-client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Mic, MicOff, Phone } from 'lucide-react';

interface VoiceAssistantProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

export function VoiceAssistant({ isOpen, onClose, userId }: VoiceAssistantProps) {
    const [status, setStatus] = useState('Initializing...');
    const [isMuted, setIsMuted] = useState(true);
    const [isConnected, setIsConnected] = useState(false);
    const [isAISpeaking, setIsAISpeaking] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    const roomRef = useRef<Room | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    // Cleanup function
    const cleanup = () => {
        if (roomRef.current) {
            roomRef.current.disconnect();
            roomRef.current = null;
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

            // 1. Call backend to create room and get token
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

            setStatus('Connecting to LiveKit...');

            // 2. Initialize LiveKit Room
            const room = new Room({
                adaptiveStream: true,
                dynacast: true,
            });
            roomRef.current = room;

            // Handle track subscription
            room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant: RemoteParticipant) => {
                if (track.kind === Track.Kind.Audio) {
                    console.log('🔊 AI Track subscribed');
                    if (audioRef.current) {
                        track.attach(audioRef.current);
                        setIsAISpeaking(true);
                        setStatus('Mitesh is speaking...');
                    }
                }
            });

            room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
                if (track.kind === Track.Kind.Audio) {
                    console.log('🔇 AI stopped');
                    setIsAISpeaking(false);
                    setStatus(isMuted ? 'Click mic to speak' : 'Listening...');
                }
            });

            room.on(RoomEvent.Connected, () => {
                console.log('✅ Connected to room');
                setIsConnected(true);
                setIsConnecting(false);
                setStatus('Connected! Click mic to speak.');

                // Ensure initial mute
                room.localParticipant.setMicrophoneEnabled(false);
                setIsMuted(true);
            });

            room.on(RoomEvent.Disconnected, () => {
                console.log('👋 Disconnected');
                cleanup();
            });

            room.on(RoomEvent.ParticipantConnected, (p) => {
                console.log('🤖 Participant joined:', p.identity);
                if (p.identity.startsWith('bot-')) {
                    setStatus('Mitesh is ready!');
                }
            });

            // Join
            await room.connect(room_url, token);

        } catch (e) {
            console.error('LiveKit Connection Error:', e);
            setStatus('Failed to connect');
            setIsConnecting(false);
        }
    };

    const toggleMute = async () => {
        if (!roomRef.current?.localParticipant) return;

        const newMutedState = !isMuted;
        setIsMuted(newMutedState);

        // Toggle mic
        try {
            await roomRef.current.localParticipant.setMicrophoneEnabled(!newMutedState);
            if (newMutedState) {
                setStatus('Mic muted. Click to speak.');
            } else {
                setStatus('Listening... Speak now!');
            }
        } catch (e) {
            console.error("Failed to toggle mic:", e);
            setIsMuted(!newMutedState); // Revert
            return;
        }
    };

    const endCall = () => {
        cleanup();
        onClose();
    };

    useEffect(() => {
        if (isOpen && !isConnected && !isConnecting) {
            startVoiceSession();
        } else if (!isOpen && isConnected) {
            cleanup();
        }
    }, [isOpen]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800" aria-describedby="voice-assistant-description">
                <DialogTitle className="sr-only">Voice Assistant</DialogTitle>
                <div id="voice-assistant-description" className="sr-only">
                    Voice Assistant Interface for Mitesh Khatri AI using LiveKit
                </div>

                <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

                <div className="flex flex-col items-center gap-6 py-8">
                    {/* Avatar */}
                    <div className="relative cursor-pointer group">
                        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                            <span className="text-4xl font-bold text-white uppercase">{userId.substring(0, 2)}</span>
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
