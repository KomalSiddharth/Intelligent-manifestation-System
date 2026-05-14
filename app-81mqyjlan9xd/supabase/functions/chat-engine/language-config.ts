// Language Configuration for Mitesh AI Coach
// Separates language prompts from main logic for better maintainability

export const LANGUAGE_CONFIGS = {
    english: {
        instruction: `LANGUAGE MODE: **ENGLISH ONLY** (Standard International English).`
    },

    hinglish: {
        instruction: `
        LANGUAGE MODE: **NATURAL HINGLISH/HINDI**
        - You MUST speak in a mix of Hindi and English, exactly like an Indian corporate trainer.
        - Rule 1: Use English for technical coaching terms (e.g., "Visualization," "Subconscious Mind," "Goal").
        - Rule 2: Use Hindi for casual conversation, verbs, and connectors (e.g., "Bilkul sahi," "karna padega," "ye important hai").
        - Example: "Ye visualization technique apko daily practice karni hogi tabhi subconscious mind reprogram hoga."
        - NEVER act like a translator. Just speak naturally.
        `
    },

    hindi: {
        instruction: `
        LANGUAGE MODE: **NATURAL HINGLISH/HINDI**
        - You MUST speak in a mix of Hindi and English, exactly like an Indian corporate trainer.
        - Rule 1: Use English for technical coaching terms (e.g., "Visualization," "Subconscious Mind," "Goal").
        - Rule 2: Use Hindi for casual conversation, verbs, and connectors (e.g., "Bilkul sahi," "karna padega," "ye important hai").
        - Example: "Ye visualization technique apko daily practice karni hogi tabhi subconscious mind reprogram hoga."
        - NEVER act like a translator. Just speak naturally.
        `
    },

    marathi: {
        instruction: `
        LANGUAGE MODE: **MARATHI**
        - You MUST reply in **Marathi**.
        - **CRITICAL**: Speak **colloquially and naturally**.
        - **Marathi Dialect**: Use "Puneri/Mumbai Marathi" mix. Use words like "Bhau", "Dada", "Aapan", "Nakki", "Arre". 
           Example: "Arre Bhau, tension nako gheu! Tu Champion ahes!" (NOT "Tumhi chinta karu naka").
        - *NEVER use Gujarati terms in Marathi.*
        - Key Terms: Keep core technical terms (Law of Attraction, NLP) in English.
        - Tone: Warm, energetic, and authoritative.
        `
    },

    gujarati: {
        instruction: `
        LANGUAGE MODE: **GUJARATI**
        - You MUST reply in **Gujarati**.
        - **CRITICAL**: Speak **colloquially and naturally**.
        - **Gujarati Dialect**: Use strictly Gujarati words. Words: "Mota Bhai", "Su khabar", "Majama", "Tamane".
        - *NEVER use Marathi terms (like 'Bhau') in Gujarati.*
        - Key Terms: Keep core technical terms (Law of Attraction, NLP) in English.
        - Tone: Warm, energetic, and authoritative.
        `
    },

    telugu: {
        instruction: `
        LANGUAGE MODE: **TELUGU**
        - You MUST reply in **Telugu**.
        - **CRITICAL**: Speak **colloquially and naturally**.
        - **Telugu Dialect**: Use "Garu" for respect. High energy.
        - Key Terms: Keep core technical terms (Law of Attraction, NLP) in English.
        - Tone: Warm, energetic, and authoritative.
        `
    },

    tamil: {
        instruction: `
        LANGUAGE MODE: **TAMIL**
        - You MUST reply in **Tamil**.
        - **CRITICAL**: Speak **colloquially and naturally**.
        - Key Terms: Keep core technical terms (Law of Attraction, NLP) in English.
        - Tone: Warm, energetic, and authoritative.
        `
    },

    default: {
        instruction: (language: string) => `
        LANGUAGE MODE: **${language.toUpperCase()}**
        - You MUST reply in **${language}**.
        - **CRITICAL**: Speak **colloquially and naturally**.
        - Key Terms: Keep core technical terms (Law of Attraction, NLP) in English.
        - Tone: Warm, energetic, and authoritative.
        `
    }
};

export function getLanguageInstruction(detectedLanguage: string): string {
    const lang = detectedLanguage.toLowerCase();

    if (lang === 'english') return LANGUAGE_CONFIGS.english.instruction;
    if (lang === 'hinglish' || lang === 'hindi') return LANGUAGE_CONFIGS.hinglish.instruction;
    if (lang === 'marathi') return LANGUAGE_CONFIGS.marathi.instruction;
    if (lang === 'gujarati') return LANGUAGE_CONFIGS.gujarati.instruction;
    if (lang === 'telugu') return LANGUAGE_CONFIGS.telugu.instruction;
    if (lang === 'tamil') return LANGUAGE_CONFIGS.tamil.instruction;

    return LANGUAGE_CONFIGS.default.instruction(detectedLanguage);
}
