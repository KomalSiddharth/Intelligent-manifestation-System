import { useState, useEffect } from 'react';
import { voiceService } from '@/services/voiceService';

interface UseVoiceOutputOptions {
    autoPlay?: boolean;
    language?: string;
}

export const useVoiceOutput = (options: UseVoiceOutputOptions = {}) => {
    const { autoPlay = false, language = 'hi-IN' } = options;
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isEnabled, setIsEnabled] = useState(autoPlay);
    const [isSupported, setIsSupported] = useState(false);

    useEffect(() => {
        setIsSupported(voiceService.isSupported());
    }, []);

    const speak = async (text: string) => {
        if (!isSupported || !isEnabled) return;

        try {
            setIsSpeaking(true);
            await voiceService.speak(text);
        } catch (error) {
            console.error('Voice output error:', error);
        } finally {
            setIsSpeaking(false);
        }
    };

    const stop = () => {
        voiceService.stop();
        setIsSpeaking(false);
    };

    const toggleEnabled = () => {
        if (isSpeaking) {
            stop();
        }
        setIsEnabled(!isEnabled);
    };

    return {
        isSpeaking,
        isEnabled,
        isSupported,
        speak,
        stop,
        toggleEnabled,
        setEnabled: setIsEnabled,
    };
};
