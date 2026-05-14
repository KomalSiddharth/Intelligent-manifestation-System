import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { supabase } from '@/db/supabase';
import { cn } from '@/lib/utils';

interface MessageFeedbackProps {
    messageId: string;
    className?: string;
}

export function MessageFeedback({ messageId, className }: MessageFeedbackProps) {
    const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleFeedback = async (type: 'up' | 'down') => {
        if (isSubmitting || feedback) return;

        setIsSubmitting(true);
        setFeedback(type);

        try {
            // Convert thumbs up/down to 1-5 rating
            const rating = type === 'up' ? 5 : 1;

            // Call edge function to track feedback
            const { error } = await supabase.functions.invoke('chat-engine', {
                body: {
                    action: 'track_feedback',
                    messageId,
                    rating
                }
            });

            if (error) throw error;

            console.log(`✅ Feedback submitted: ${type}`);
        } catch (error) {
            console.error('Failed to submit feedback:', error);
            setFeedback(null); // Reset on error
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => handleFeedback('up')}
                disabled={isSubmitting || feedback !== null}
                className={cn(
                    "h-7 w-7 p-0",
                    feedback === 'up' && "text-green-600 bg-green-50"
                )}
            >
                <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => handleFeedback('down')}
                disabled={isSubmitting || feedback !== null}
                className={cn(
                    "h-7 w-7 p-0",
                    feedback === 'down' && "text-red-600 bg-red-50"
                )}
            >
                <ThumbsDown className="h-4 w-4" />
            </Button>
        </div>
    );
}
