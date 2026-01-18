import { useState, useEffect, useRef } from 'react';

interface UseVoiceInputOptions {
    language?: string;
    onResult?: (transcript: string) => void;
    onEnd?: () => void;
    onError?: (error: Error) => void;
    silenceTimeout?: number;
}

export const useVoiceInput = (options: UseVoiceInputOptions = {}) => {
    const { language = 'en-IN', onResult, onEnd, onError, silenceTimeout = 3000 } = options;
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

                // Set new timer based on silenceTimeout
                silenceTimerRef.current = setTimeout(() => {
                    // Check ref instead of state to avoid staleness
                    if (recognitionRef.current && isListeningRef.current) {
                        console.log(`⏰ Silence timeout (${silenceTimeout}ms) - stopping...`);
                        try {
                            recognitionRef.current.stop();
                        } catch (e) {
                            console.error("Error stopping on silence:", e);
                        }
                    }
                }, silenceTimeout);
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
    }, [language, onResult, onError, silenceTimeout]);

    const startListening = () => {
        if (recognitionRef.current && !isListeningRef.current) {
            try {
                setTranscript('');
                recognitionRef.current.start();
                isListeningRef.current = true;
                setIsListening(true);

                console.log("▶️ Mic started");

                // Start initial timer in case no speech at all (Initial wait is slightly longer)
                if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                const initialTimeout = silenceTimeout + 5000;

                silenceTimerRef.current = setTimeout(() => {
                    if (recognitionRef.current && isListeningRef.current) {
                        console.log(`⏰ Initial silence timeout (${initialTimeout}ms) - stopping...`);
                        try {
                            recognitionRef.current.stop();
                        } catch (e) { }
                    }
                }, initialTimeout);
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

    const clearTranscript = () => setTranscript('');

    // --- MediaRecorder Logic (For Voice Calls) ---
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const [isRecording, setIsRecording] = useState(false);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                // We'll expose this blob via a callback or state if needed, 
                // but for now let's just log it. 
                // ideally we pass an 'onAudioCaptured' prop.
                if (options.onAudioCaptured) {
                    options.onAudioCaptured(blob);
                }

                // Stop all tracks to release mic
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            console.log("🎙️ Audio Recording Started");

        } catch (err) {
            console.error("Failed to start recording:", err);
            if (onError) onError(err as Error);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            console.log("🛑 Audio Recording Stopped");
        }
    };

    return {
        isListening, // Text-mode status
        isRecording, // Audio-mode status
        transcript,
        isSupported,
        startListening, // Legacy (Text)
        stopListening,
        toggleListening,
        clearTranscript,
        startRecording, // New (Audio)
        stopRecording
    };
};
