import { Button } from '@/components/ui/button';
import { Mic, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useVoiceOutput } from '@/hooks/useVoiceOutput';

interface VoiceControlsProps {
    onVoiceInput?: (transcript: string) => void;
    onVoiceResponse?: (text: string) => void;
    className?: string;
}

const VoiceControls = ({ onVoiceInput, className }: VoiceControlsProps) => {
    const { isListening, toggleListening, isSupported: inputSupported } = useVoiceInput({
        language: 'hi-IN',
        onResult: (transcript) => {
            if (onVoiceInput) {
                onVoiceInput(transcript);
            }
        },
        onError: (error) => {
            console.error('Voice input error:', error);
        },
    });

    const { isEnabled, toggleEnabled, isSupported: outputSupported } = useVoiceOutput({
        autoPlay: false,
        language: 'hi-IN',
    });

    if (!inputSupported && !outputSupported) {
        return null;
    }

    return (
        <div className={cn("flex items-center gap-2", className)}>
            {/* Voice Input (Microphone) */}
            {inputSupported && (
                <Button
                    variant={isListening ? "default" : "ghost"}
                    size="icon"
                    onClick={toggleListening}
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
            {outputSupported && (
                <Button
                    variant={isEnabled ? "default" : "ghost"}
                    size="icon"
                    onClick={toggleEnabled}
                    className="rounded-full"
                    title={isEnabled ? "Disable voice responses" : "Enable voice responses"}
                >
                    {isEnabled ? (
                        <Volume2 className="h-4 w-4" />
                    ) : (
                        <VolumeX className="h-4 w-4" />
                    )}
                </Button>
            )}
        </div>
    );
};

export default VoiceControls;
