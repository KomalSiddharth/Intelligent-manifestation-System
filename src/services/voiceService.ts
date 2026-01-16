/**
 * Voice Service - Abstraction for Text-to-Speech
 * Supports browser native TTS (dummy voice) and Eleven Labs (future)
 */

import { supabase } from '../db/supabase';

interface VoiceConfig {
    elevenLabsApiKey?: string;
    elevenLabsVoiceId?: string;
    language?: string;
}

class VoiceService {
    private config: VoiceConfig;
    private synthesis: SpeechSynthesis | null = null;

    private currentAudio: HTMLAudioElement | null = null;

    constructor(config: VoiceConfig = {}) {
        this.config = config;
        if (typeof window !== 'undefined') {
            this.synthesis = window.speechSynthesis;
        }
    }

    async speak(text: string, profileId?: string): Promise<void> {
        // If Eleven Labs Voice ID is configured (env or profile), use backend proxy
        console.log("🎤 VoiceService: Checking config...", {
            envVoiceId: this.config.elevenLabsVoiceId,
            profileId,
            hasEnv: !!this.config.elevenLabsVoiceId
        });

        if (this.config.elevenLabsVoiceId || profileId) {
            console.log("🎤 VoiceService: Using ElevenLabs Backend");
            return this.speakWithElevenLabs(text, profileId);
        }

        console.log("🎤 VoiceService: Fallback to Browser TTS (No Voice ID found)");
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
    private async speakWithElevenLabs(text: string, profileId?: string): Promise<void> {
        try {
            // Stop any previous audio before starting new one
            this.stop();

            console.log("Calling voice-engine backend for TTS...");
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token;

            if (!token) {
                console.warn("No active session for TTS");
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-engine?mode=tts`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token || import.meta.env.VITE_SUPABASE_ANON_KEY}`
                    },
                    body: JSON.stringify({
                        text,
                        voiceId: this.config.elevenLabsVoiceId,
                        profileId,
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

            this.currentAudio = audio;

            return new Promise((resolve, reject) => {
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    if (this.currentAudio === audio) {
                        this.currentAudio = null;
                    }
                    resolve();
                };
                audio.onerror = (e) => {
                    console.error("Audio playback error:", e);
                    if (this.currentAudio === audio) {
                        this.currentAudio = null;
                    }
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
        // Stop Browser TTS
        if (this.synthesis) {
            this.synthesis.cancel();
        }

        // Stop ElevenLabs Audio
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0; // Reset
            this.currentAudio = null;
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
