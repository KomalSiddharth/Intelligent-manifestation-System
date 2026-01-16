import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface VideoAvatarProps {
    status: 'idle' | 'listening' | 'processing' | 'speaking';
    avatarUrl?: string;
    videoUrl?: string; // For generated video
    stream?: MediaStream; // For real-time streaming
    className?: string;
    profileName?: string;
}

export const VideoAvatar: React.FC<VideoAvatarProps> = ({
    status,
    avatarUrl,
    videoUrl,
    stream,
    className,
    profileName
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className={cn("relative flex items-center justify-center", className)}>
            {/* Ambient Background Glow based on Status */}
            <div className={cn(
                "absolute inset-0 rounded-full blur-2xl opacity-20 transition-all duration-500",
                status === 'listening' && "bg-orange-500 animate-pulse",
                status === 'processing' && "bg-teal-500 animate-spin-slow",
                status === 'speaking' && "bg-blue-500",
                status === 'idle' && "bg-slate-500"
            )} />

            <div className="relative w-full h-full rounded-full overflow-hidden border-4 border-white/20 shadow-2xl bg-muted flex items-center justify-center">
                {/* Fallback Avatar Image (Visible when idle or no video) */}
                {(status === 'idle' || (!videoUrl && !stream)) && (
                    <Avatar className="w-full h-full scale-110">
                        <AvatarImage src={avatarUrl} className="object-cover" />
                        <AvatarFallback className="text-4xl">
                            {profileName?.substring(0, 2).toUpperCase() || "AI"}
                        </AvatarFallback>
                    </Avatar>
                )}

                {/* Video Content */}
                {stream && (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className={cn(
                            "w-full h-full object-cover transition-opacity duration-500",
                            status === 'speaking' ? "opacity-100" : "opacity-0 invisible"
                        )}
                    />
                )}

                {videoUrl && !stream && (
                    <video
                        src={videoUrl}
                        autoPlay
                        loop
                        playsInline
                        className={cn(
                            "w-full h-full object-cover transition-opacity duration-500",
                            status === 'speaking' ? "opacity-100" : "opacity-0 invisible"
                        )}
                    />
                )}

                {/* Animated Overlays */}
                {status === 'listening' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="flex gap-1 items-center">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="w-1.5 h-8 bg-orange-500 rounded-full animate-voice-bar" style={{ animationDelay: `${i * 150}ms` }} />
                            ))}
                        </div>
                    </div>
                )}

                {status === 'processing' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>

            {/* Speaking Aura */}
            {status === 'speaking' && (
                <div className="absolute -inset-4 rounded-full border-2 border-blue-400 opacity-20 animate-ping" />
            )}
        </div>
    );
};
