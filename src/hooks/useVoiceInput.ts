import { useState, useEffect, useRef } from 'react';

interface UseVoiceInputOptions {
    language?: string;
    onResult?: (transcript: string) => void;
    onEnd?: () => void; // New: called when recognition ends
    onError?: (error: Error) => void;
}

export const useVoiceInput = (options: UseVoiceInputOptions = {}) => {
    const { language = 'en-IN', onResult, onEnd, onError } = options;
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [isSupported, setIsSupported] = useState(false);

    // Use refs to track state inside event handlers (avoid stale closures)
    const isListeningRef = useRef(false);
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (SpeechRecognition) {
            setIsSupported(true);
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = language;

            recognitionRef.current.onresult = (event: any) => {
                // Reset silence timer on any input
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

                const currentTranscript = Array.from(event.results)
                    .map((result: any) => result[0].transcript)
                    .join('');

                console.log("🎤 Transcript:", currentTranscript);
                setTranscript(currentTranscript);
                if (onResult) {
                    onResult(currentTranscript);
                }

                // Set new timer for 5 seconds (User Request)
                silenceTimerRef.current = setTimeout(() => {
                    // Check ref instead of state to avoid staleness
                    if (recognitionRef.current && isListeningRef.current) {
                        console.log("⏰ Silence timeout (5s) - stopping...");
                        try {
                            recognitionRef.current.stop();
                        } catch (e) {
                            console.error("Error stopping on silence:", e);
                        }
                    }
                }, 5000);
            };

            recognitionRef.current.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

                // Ignore 'no-speech' errors which often happen innocuously
                if (event.error !== 'no-speech') {
                    isListeningRef.current = false;
                    setIsListening(false);
                    if (onError) onError(new Error(event.error));
                }
            };

            recognitionRef.current.onend = () => {
                console.log("🛑 Mic stopped (onend)");
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                isListeningRef.current = false;
                setIsListening(false);
                if (onEnd) {
                    onEnd();
                }
            };
        }

        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch (e) { }
            }
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };
    }, [language, onResult, onError]); // Stable dependencies

    const startListening = () => {
        if (recognitionRef.current && !isListeningRef.current) {
            try {
                setTranscript('');
                recognitionRef.current.start();
                isListeningRef.current = true;
                setIsListening(true);

                console.log("▶️ Mic started");

                // Start initial timer in case no speech at all (8s)
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                silenceTimerRef.current = setTimeout(() => {
                    if (recognitionRef.current && isListeningRef.current) {
                        console.log("⏰ Initial silence timeout (8s) - stopping...");
                        try {
                            recognitionRef.current.stop();
                        } catch (e) { }
                    }
                }, 8000);
            } catch (err) {
                console.error("Failed to start recognition:", err);
                isListeningRef.current = false;
                setIsListening(false);
                if (onError) onError(err as Error);
            }
        }
    };

    const stopListening = () => {
        if (recognitionRef.current && isListeningRef.current) {
            try {
                recognitionRef.current.stop();
                // State updates will happen in onend
            } catch (err) {
                console.error("Failed to stop recognition:", err);
            }
        }
    };

    const toggleListening = () => {
        if (isListeningRef.current) {
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
