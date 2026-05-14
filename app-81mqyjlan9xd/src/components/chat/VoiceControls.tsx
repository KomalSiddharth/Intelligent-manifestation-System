import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useVoiceOutput } from '@/hooks/useVoiceOutput';
import { voiceService } from '@/services/voiceService';

interface VoiceControlsProps {
    onVoiceInput?: (transcript: string) => void;
    onVoiceResponse?: (text: string) => void;
    onAutoSend?: (transcript: string) => void; // Callback to trigger send with text
    voiceEnabled: boolean; // Managed by parent
    onToggleVoice: () => void; // Managed by parent
    className?: string;
}

const VoiceControls = ({ onVoiceInput, onAutoSend, voiceEnabled, onToggleVoice, className }: VoiceControlsProps) => {
    const transcriptRef = useRef(""); // Track transcript for atomic access in onEnd

    const { isListening, toggleListening, isSupported: inputSupported } = useVoiceInput({
        language: 'en-IN',
        onResult: (transcript) => {
            transcriptRef.current = transcript; // Update ref
            if (onVoiceInput) {
                onVoiceInput(transcript);
            }
        },
        onEnd: () => {
            if (onAutoSend) {
                const finalTranscript = transcriptRef.current;
                if (finalTranscript.trim()) {
                    console.log("🎤 Mic released, auto-sending:", finalTranscript);
                    (onAutoSend as (text: string) => void)(finalTranscript);
                }
            }
        },
        onError: (error) => {
            console.error('Voice input error:', error);
        },
    });

    const handleToggleListening = () => {
        // Stop any active AI speech when user wants to talk
        if (!isListening) {
            voiceService.stop();
        }
        toggleListening();
    };

    const isOutputSupported = true; // Assume supported or pass from parent if critical

    if (!inputSupported && !isOutputSupported) {
        return null;
    }

    return (
        <div className={cn("flex items-center gap-2", className)}>
            {/* Voice Input (Microphone) */}
            {inputSupported && (
                <Button
                    variant={isListening ? "default" : "ghost"}
                    size="icon"
                    onClick={handleToggleListening}
                    className={cn(
                        "rounded-full transition-all",
                        isListening && "bg-red-500 hover:bg-red-600 animate-pulse"
                    )}
                    title={isListening ? "Stop listening" : "Start voice input"}
                >
                    <Mic className={cn("h-4 w-4", isListening && "text-white")} />
                </Button>
            )}

            {/* Voice Output (Speaker) */}
            <Button
                variant={voiceEnabled ? "default" : "ghost"}
                size="icon"
                onClick={onToggleVoice}
                className="rounded-full"
                title={voiceEnabled ? "Disable voice responses" : "Enable voice responses"}
            >
                {voiceEnabled ? (
                    <Volume2 className="h-4 w-4" />
                ) : (
                    <VolumeX className="h-4 w-4" />
                )}
            </Button>
        </div>
    );
};

export default VoiceControls;
