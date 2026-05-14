/**
 * Voice Service - Abstraction for Text-to-Speech
 * Supports browser native TTS and Eleven Labs (proxied)
 */

import { supabase } from '../db/supabase';

interface VoiceConfig {
    elevenLabsApiKey?: string;
    elevenLabsVoiceId?: string;
    language?: string;
}

interface VoiceOptions {
    voiceId?: string;
    profileId?: string;
}

class VoiceService {
    private config: VoiceConfig;
    private synthesis: SpeechSynthesis | null = null;
    private currentAudio: HTMLAudioElement | null = null;
    private abortController: AbortController | null = null;

    constructor(config: VoiceConfig = {}) {
        this.config = config;
        if (typeof window !== 'undefined') {
            this.synthesis = window.speechSynthesis;
        }
    }

    async speak(text: string, options?: VoiceOptions | string): Promise<void> {
        let profileId: string | undefined;
        let voiceId: string | undefined;

        if (typeof options === 'string') {
            profileId = options;
        } else if (options) {
            profileId = options.profileId;
            voiceId = options.voiceId;
        }

        console.log("🎤 VoiceService: Speaking...", { text: text.slice(0, 30), profileId, voiceId });

        if (this.config.elevenLabsVoiceId || profileId || voiceId) {
            return this.speakWithElevenLabs(text, { profileId, voiceId });
        }

        return this.speakWithBrowserTTS(text);
    }

    /**
     * Browser native Text-to-Speech
     */
    private speakWithBrowserTTS(text: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.synthesis) {
                console.error("❌ Browser TTS: Not supported.");
                reject(new Error('Speech synthesis not supported'));
                return;
            }

            this.stop();
            console.log("🗣️ Browser TTS: Starting...", { text: text.slice(0, 20) });

            const speak = () => {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = this.config.language || 'hi-IN';
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                const voices = this.synthesis!.getVoices();
                console.log("🗣️ Browser TTS: Available voices:", voices.length);

                const hindiVoice = voices.find(v => v.lang.startsWith('hi'));
                const englishVoice = voices.find(v => v.lang.startsWith('en')); // Fallback to EN if HI missing
                const defaultVoice = voices.find(v => v.default);

                if (hindiVoice) {
                    utterance.voice = hindiVoice;
                    console.log("🗣️ Using Hindi Voice:", hindiVoice.name);
                } else if (englishVoice) {
                    utterance.voice = englishVoice;
                    console.log("🗣️ Using English Voice (Fallback):", englishVoice.name);
                } else if (defaultVoice) {
                    utterance.voice = defaultVoice;
                    console.log("🗣️ Using Default Voice:", defaultVoice.name);
                } else {
                    console.warn("⚠️ No specific voice found, relying on browser default.");
                }

                utterance.onend = () => {
                    console.log("✅ Browser TTS: Finished.");
                    resolve();
                };
                utterance.onerror = (error) => {
                    console.error("❌ Browser TTS Error:", error);
                    reject(error);
                };

                this.synthesis!.speak(utterance);
            };

            // Handle async voice loading
            if (this.synthesis.getVoices().length === 0) {
                console.log("⏳ Browser TTS: Waiting for voices...");
                this.synthesis.onvoiceschanged = () => {
                    this.synthesis!.onvoiceschanged = null; // Cleanup
                    speak();
                };
            } else {
                speak();
            }
        });
    }

    /**
     * Eleven Labs Text-to-Speech (Cancellable)
     */
    private async speakWithElevenLabs(text: string, options?: VoiceOptions): Promise<void> {
        try {
            this.stop();
            this.abortController = new AbortController();
            const signal = this.abortController.signal;

            console.log(`🎙️ Fetching Eleven Labs audio... `);

            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token;

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-engine?mode=tts`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({
                        text,
                        voiceId: options?.voiceId || this.config.elevenLabsVoiceId,
                        profileId: options?.profileId
                    }),
                    signal
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(async () => ({ error: await response.text() }));
                console.error("❌ Voice Engine Failure:", errorData);
                throw new Error(errorData.error || `Voice Engine Status: ${response.status}`);
            }

            // Check for explicit TTS failure signal from backend (even if 200 OK)
            if (response.headers.get("X-TTS-Failed") === "true") {
                const errorMsg = decodeURIComponent(response.headers.get("X-TTS-Error") || "Unknown TTS Error");
                console.warn("⚠️ Backend signaled TTS failure, switching to fallback:", errorMsg);
                throw new Error("ElevenLabs Fallback: " + errorMsg);
            }

            const audioBlob = await response.blob();

            if (signal.aborted) return;

            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            this.currentAudio = audio;

            return new Promise((resolve, reject) => {
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    if (this.currentAudio === audio) this.currentAudio = null;
                    resolve();
                };
                audio.onerror = (e) => {
                    URL.revokeObjectURL(audioUrl);
                    if (this.currentAudio === audio) this.currentAudio = null;
                    reject(e);
                };

                if (signal.aborted) {
                    URL.revokeObjectURL(audioUrl);
                    return;
                }

                audio.play().catch(reject);
            });
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log("✨ Voice fetch cancelled.");
                return;
            }
            console.error('Eleven Labs TTS error:', error);
            // Fallback to browser voice if Eleven Labs fails
            return this.speakWithBrowserTTS(text);
        } finally {
            this.abortController = null;
        }
    }

    stop(): void {
        console.log("⏹️ Stopping VoiceService...");

        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        if (this.synthesis) {
            this.synthesis.cancel();
        }

        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
    }

    isSupported(): boolean {
        return this.synthesis !== null;
    }

    getAvailableVoices(): SpeechSynthesisVoice[] {
        if (!this.synthesis) return [];
        return this.synthesis.getVoices();
    }
}

export const voiceService = new VoiceService({
    elevenLabsVoiceId: import.meta.env.VITE_ELEVEN_LABS_VOICE_ID,
    language: 'hi-IN',
});

export default VoiceService;
