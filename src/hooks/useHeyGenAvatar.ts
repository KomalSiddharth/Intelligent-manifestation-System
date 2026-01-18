import { useState, useRef, useEffect, useCallback } from 'react';
import StreamingAvatar, { AvatarQuality, StreamingEvents, TaskType, TaskMode } from '@heygen/streaming-avatar';
import { useToast } from './use-toast';

interface UseHeyGenAvatarProps {
    onStreamReady?: (stream: MediaStream) => void;
    onDisconnected?: () => void;
}

export const useHeyGenAvatar = ({ onStreamReady, onDisconnected }: UseHeyGenAvatarProps = {}) => {
    const [isAvatarActive, setIsAvatarActive] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const avatarRef = useRef<StreamingAvatar | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const { toast } = useToast();

    const startSession = useCallback(async (avatarId: string, voiceId?: string) => {
        setIsLoading(true);
        try {
            // 1. Get Access Token from our Backend
            let token = "";
            let defaultAvatarId = "";
            try {
                const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/video-engine?mode=token`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                    }
                });

                if (!response.ok) {
                    const err = await response.text();
                    throw new Error(`Token Gen Failed: ${err}`);
                }
                const data = await response.json();
                token = data.data.token;
                defaultAvatarId = data.defaultAvatarId;
            } catch (tokenErr: any) {
                console.error("Token Generation Error:", tokenErr);
                throw new Error(tokenErr.message);
            }

            // 2. Initialize Avatar
            const avatar = new StreamingAvatar({
                token,
            });

            avatarRef.current = avatar;

            // 3. Setup Event Listeners
            avatar.on(StreamingEvents.STREAM_READY, (event) => {
                console.log('>> Stream Ready:', event.detail);
                mediaStreamRef.current = event.detail;
                if (onStreamReady) onStreamReady(event.detail);
                setIsAvatarActive(true);
            });

            avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
                console.log('>> Stream Disconnected');
                endSession();
            });

            // 4. Start Session
            const publicFallbackId = "Anna_public_3_20240108";
            const finalAvatarId = (avatarId && avatarId !== 'default') ? avatarId : (defaultAvatarId || publicFallbackId);

            console.log("Starting Avatar:", { finalAvatarId });

            if (!finalAvatarId) {
                throw new Error("No Avatar ID found");
            }

            await avatar.createStartAvatar({
                quality: AvatarQuality.Low,
                avatarName: finalAvatarId,
                // Voice removed to ensure successful start first. 
                // HeyGen will use the avatar's default voice.
                language: 'en',
            });

            setIsLoading(false);

        } catch (error: any) {
            console.error("Failed to start avatar session:", error);
            setIsLoading(false);
            toast({
                title: "Avatar Connection Failed",
                description: error.message || "Could not connect to video server.",
                variant: "destructive"
            });
            endSession();
        }
    }, [onStreamReady, toast]);

    const speak = useCallback(async (text: string) => {
        if (!avatarRef.current || !isAvatarActive) return;
        try {
            await avatarRef.current.speak({
                text: text,
                taskType: TaskType.REPEAT, // REPEAT tells avatar to say exactly this text
                taskMode: TaskMode.SYNC // SYNC makes it speak immediately
            });
        } catch (error) {
            console.error("Avatar speak error:", error);
        }
    }, [isAvatarActive]);

    const endSession = useCallback(async () => {
        if (avatarRef.current) {
            try {
                await avatarRef.current.stopAvatar();
            } catch (e) { console.error("Error stopping avatar:", e); }
            avatarRef.current = null;
        }
        mediaStreamRef.current = null;
        setIsAvatarActive(false);
        if (onDisconnected) onDisconnected();
    }, [onDisconnected]);

    return {
        startSession,
        endSession,
        speak,
        isAvatarActive,
        isLoading,
        stream: mediaStreamRef.current // Expose manual ref access if needed
    };
};
