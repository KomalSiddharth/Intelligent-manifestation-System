import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { getMindProfile, updateMindProfile } from '@/db/api';
import { useToast } from '@/hooks/use-toast';
import { MindProfile } from '@/types/types';

interface SpeakingStyleViewProps {
    profileId: string;
    initialData?: MindProfile;
}

const SpeakingStyleView = ({ profileId, initialData }: SpeakingStyleViewProps) => {
    const { toast } = useToast();
    const [speakingStyle, setSpeakingStyle] = useState(initialData?.speaking_style || "");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadProfile();
    }, [profileId]);

    const loadProfile = async () => {
        try {
            const profile = await getMindProfile(profileId);
            if (profile) {
                setSpeakingStyle(profile.speaking_style || "");
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await updateMindProfile({
                speaking_style: speakingStyle
            }, profileId);
            toast({
                title: "Saved",
                description: "Speaking style updated successfully.",
            });
        } catch (error) {
            console.error('Error saving profile:', error);
            toast({
                title: "Error",
                description: "Failed to save changes.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold">Speaking Style</h2>
                    <p className="text-muted-foreground">
                        Delivery style and diction of your Clone. This field will affect how your Clone delivers responses. Quirks, guidance around word choice, and unique stylistic components of speech that make your Clone unique belong here. We will pre-populate this as your Clone is trained, and you can update it as you see fit, or select different style samples and we will re-generate it for you.
                    </p>
                </div>
                <Button onClick={handleSave} disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save Changes"}
                </Button>
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-medium">Your Clone's Speaking Style</h3>

                <div className="relative">
                    <Textarea
                        value={speakingStyle}
                        onChange={(e) => setSpeakingStyle(e.target.value)}
                        className="min-h-[200px] bg-muted/30 resize-y"
                        maxLength={5000}
                    />
                    <span className={cn("absolute bottom-2 right-2 text-xs", speakingStyle.length > 5000 ? "text-red-500" : "text-red-400")}>
                        {speakingStyle.length}/5000
                    </span>
                </div>
            </div>
        </div>
    );
};

export default SpeakingStyleView;
