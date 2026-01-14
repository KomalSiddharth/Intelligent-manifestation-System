/**
 * Voice Service - Abstraction for Text-to-Speech
 * Supports browser native TTS (dummy voice) and Eleven Labs (future)
 */

interface VoiceConfig {
    elevenLabsApiKey?: string;
    elevenLabsVoiceId?: string;
    language?: string;
}

class VoiceService {
    private config: VoiceConfig;
    private synthesis: SpeechSynthesis | null = null;

    constructor(config: VoiceConfig = {}) {
        this.config = config;
        if (typeof window !== 'undefined') {
            this.synthesis = window.speechSynthesis;
        }
    }

    /**
     * Convert text to speech using available voice provider
     */
    async speak(text: string): Promise<void> {
        // If Eleven Labs is configured, use it (future implementation)
        if (this.config.elevenLabsApiKey && this.config.elevenLabsVoiceId) {
            return this.speakWithElevenLabs(text);
        }

        // Fallback to browser native TTS
        return this.speakWithBrowserTTS(text);
    }

    /**
     * Browser native Text-to-Speech (dummy voice)
     */
    private speakWithBrowserTTS(text: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.synthesis) {
                reject(new Error('Speech synthesis not supported'));
                return;
            }

            // Cancel any ongoing speech
            this.synthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);

            // Configure voice settings
            utterance.lang = this.config.language || 'hi-IN'; // Hindi by default
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            // Try to find a Hindi voice, fallback to English
            const voices = this.synthesis.getVoices();
            const hindiVoice = voices.find(v => v.lang.startsWith('hi'));
            const englishVoice = voices.find(v => v.lang.startsWith('en'));

            if (hindiVoice) {
                utterance.voice = hindiVoice;
            } else if (englishVoice) {
                utterance.voice = englishVoice;
            }

            utterance.onend = () => resolve();
            utterance.onerror = (error) => reject(error);

            this.synthesis.speak(utterance);
        });
    }

    /**
     * Eleven Labs Text-to-Speech (cloned voice) - Now proxied through Supabase for security
     */
    private async speakWithElevenLabs(text: string): Promise<void> {
        if (!this.config.elevenLabsVoiceId) {
            throw new Error('Eleven Labs voice ID not configured');
        }

        try {
            console.log("Calling voice-engine backend for TTS...");
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-engine?mode=tts`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                    },
                    body: JSON.stringify({
                        text,
                        voiceId: this.config.elevenLabsVoiceId,
                    }),
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: response.statusText }));
                throw new Error(`Voice Engine error: ${errorData.error || response.statusText}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            return new Promise((resolve, reject) => {
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                };
                audio.onerror = (e) => {
                    console.error("Audio playback error:", e);
                    reject(e);
                };
                audio.play().catch(reject);
            });
        } catch (error) {
            console.error('Eleven Labs TTS error (backend proxy):', error);
            // Fallback to browser TTS
            return this.speakWithBrowserTTS(text);
        }
    }

    /**
     * Stop any ongoing speech
     */
    stop(): void {
        if (this.synthesis) {
            this.synthesis.cancel();
        }
    }

    /**
     * Check if speech synthesis is supported
     */
    isSupported(): boolean {
        return this.synthesis !== null;
    }

    /**
     * Get available voices
     */
    getAvailableVoices(): SpeechSynthesisVoice[] {
        if (!this.synthesis) return [];
        return this.synthesis.getVoices();
    }
}

// Export singleton instance
export const voiceService = new VoiceService({
    elevenLabsVoiceId: import.meta.env.VITE_ELEVEN_LABS_VOICE_ID,
    language: 'hi-IN',
});

export default VoiceService;
