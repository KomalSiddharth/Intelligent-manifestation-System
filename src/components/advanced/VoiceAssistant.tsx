import { useState, useEffect, useRef } from 'react';
import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Mic, MicOff, Phone } from 'lucide-react';

interface VoiceAssistantProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

export function VoiceAssistant({ isOpen, onClose, userId }: VoiceAssistantProps) {
    const [isConnecting, setIsConnecting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(true); // ✅ Start muted!
    const [isAISpeaking, setIsAISpeaking] = useState(false);
    const [status, setStatus] = useState('Initializing...');

    const callObjectRef = useRef<DailyCall | null>(null);

    // ✅ Start voice session
    const startVoiceSession = async () => {
        try {
            setIsConnecting(true);
            setStatus('Creating session...');

            // Call backend
            const response = await fetch('http://localhost:5000/start-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });

            if (!response.ok) {
                throw new Error('Failed to create session');
            }

            const data = await response.json();
            const { room_url, token } = data;

            console.log('✅ Room created:', room_url);
            setStatus('Connecting to room...');

            // Create Daily call object
            const callObject = DailyIframe.createCallObject({
                audioSource: true,
                videoSource: false
            });

            callObjectRef.current = callObject;

            // ✅ Event: Call joined
            callObject.on('joined-meeting', () => {
                console.log('✅ Joined meeting');
                setIsConnected(true);
                setIsConnecting(false);
                setStatus('Connected! Click mic to start.');

                // ✅ Start with mic muted
                callObject.setLocalAudio(false);
            });

            // ✅ Event: Participant joined (AI bot)
            callObject.on('participant-joined', (event) => {
                console.log('🤖 AI joined:', event.participant.user_name);
                if (event.participant.user_name === 'Mitesh AI Coach') {
                    setStatus('Mitesh is ready! Click mic to speak.');
                }
            });

            // ✅ Event: AI starts speaking
            callObject.on('track-started', (event) => {
                if (!event.participant.local && event.track.kind === 'audio') {
                    console.log('🔊 AI speaking');
                    setIsAISpeaking(true);
                    setStatus('Mitesh is speaking...');
                }
            });

            // ✅ Event: AI stops speaking
            callObject.on('track-stopped', (event) => {
                if (!event.participant.local && event.track.kind === 'audio') {
                    console.log('🔇 AI stopped');
                    setIsAISpeaking(false);
                    setStatus(isMuted ? 'Click mic to speak' : 'Listening...');
                }
            });

            // ✅ Event: Errors
            callObject.on('error', (event) => {
                console.error('❌ Daily error:', event);
                setStatus(`Error: ${event.errorMsg}`);
            });

            // Join the room
            await callObject.join({ url: room_url, token });

        } catch (error) {
            console.error('❌ Voice session error:', error);
            setStatus('Failed to connect. Try again.');
            setIsConnecting(false);
        }
    };

    // ✅ Toggle microphone
    const toggleMute = async () => {
        if (!callObjectRef.current) return;

        const newMutedState = !isMuted;
        setIsMuted(newMutedState);

        // Toggle mic
        await callObjectRef.current.setLocalAudio(!newMutedState);

        // Update status
        if (newMutedState) {
            setStatus('Mic muted. Click to speak.');
        } else {
            setStatus('Listening... Speak now!');
        }

        console.log(`🎤 Mic ${newMutedState ? 'muted' : 'unmuted'}`);
    };

    // ✅ End call
    const endCall = async () => {
        if (callObjectRef.current) {
            await callObjectRef.current.leave();
            await callObjectRef.current.destroy();
            callObjectRef.current = null;
        }
        setIsConnected(false);
        setIsMuted(true);
        setStatus('Disconnected');
        onClose();
    };

    // ✅ Start session when dialog opens
    useEffect(() => {
        if (isOpen && !isConnecting && !isConnected) {
            startVoiceSession();
        }
    }, [isOpen]);

    // ✅ Cleanup on close
    useEffect(() => {
        return () => {
            if (callObjectRef.current) {
                callObjectRef.current.destroy();
            }
        };
    }, []);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md bg-gray-900 text-white border-gray-800">
                <div className="flex flex-col items-center gap-6 py-8">
                    {/* Avatar */}
                    <div className="relative">
                        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center">
                            <span className="text-4xl font-bold text-white">MK</span>
                        </div>
                        {isAISpeaking && (
                            <div className="absolute inset-0 rounded-full border-4 border-green-500 animate-pulse" />
                        )}
                    </div>

                    {/* Name */}
                    <h2 className="text-2xl font-bold">Mitesh-Khatri</h2>

                    {/* Status */}
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-800">
                        <div className={`w-2 h-2 rounded-full ${isConnected && !isMuted ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
                            }`} />
                        <span className="text-sm">{status}</span>
                    </div>

                    {/* Mic Button */}
                    <div className="flex gap-4">
                        <button
                            onClick={toggleMute}
                            disabled={!isConnected}
                            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isMuted
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : 'bg-green-600 hover:bg-green-700 animate-pulse'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {isMuted ? (
                                <MicOff className="w-6 h-6 text-white" />
                            ) : (
                                <Mic className="w-6 h-6 text-white" />
                            )}
                        </button>

                        {/* End Call Button */}
                        <button
                            onClick={endCall}
                            disabled={!isConnected}
                            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Phone className="w-6 h-6 text-white rotate-135" />
                        </button>
                    </div>

                    {/* Instructions */}
                    <p className="text-sm text-gray-400 text-center max-w-xs">
                        {isConnecting && 'Connecting...'}
                        {isConnected && isMuted && 'Click microphone to start speaking'}
                        {isConnected && !isMuted && 'Speak your question now'}
                        {!isConnecting && !isConnected && 'Connection failed'}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
