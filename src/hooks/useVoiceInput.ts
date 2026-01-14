import { useState, useEffect, useRef } from 'react';

interface UseVoiceInputOptions {
    language?: string;
    onResult?: (transcript: string) => void;
    onError?: (error: Error) => void;
}

export const useVoiceInput = (options: UseVoiceInputOptions = {}) => {
    const { language = 'hi-IN', onResult, onError } = options;
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [isSupported, setIsSupported] = useState(false);

    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        // Check if browser supports Speech Recognition
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (SpeechRecognition) {
            setIsSupported(true);
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true; // Changed to true for better reliability
            recognitionRef.current.interimResults = true; // Show interim results
            recognitionRef.current.lang = language;
            recognitionRef.current.maxAlternatives = 1;

            recognitionRef.current.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setTranscript(transcript);
                if (onResult) {
                    onResult(transcript);
                }
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                // Don't stop on 'no-speech' error, just continue
                if (event.error !== 'no-speech') {
                    setIsListening(false);
                    if (onError) {
                        onError(new Error(event.error));
                    }
                }
            };

            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [language, onResult, onError]);

    const startListening = () => {
        if (recognitionRef.current && !isListening) {
            setTranscript('');
            recognitionRef.current.start();
            setIsListening(true);
        }
    };

    const stopListening = () => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };

    return {
        isListening,
        transcript,
        isSupported,
        startListening,
        stopListening,
        toggleListening,
    };
};
