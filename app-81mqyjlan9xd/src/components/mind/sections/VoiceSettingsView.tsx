import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Info, Volume2, Play } from 'lucide-react';
import { getMindProfile, updateMindProfile } from '@/db/api';
import { useToast } from '@/hooks/use-toast';
import { voiceService } from '@/services/voiceService';

interface VoiceSettingsViewProps {
    profileId: string;
}

const VoiceSettingsView = ({ profileId }: VoiceSettingsViewProps) => {
    const { toast } = useToast();
    const [voiceId, setVoiceId] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        loadProfile();
    }, [profileId]);

    const loadProfile = async () => {
        try {
            const profile = await getMindProfile(profileId);
            if (profile) {
                // @ts-ignore - for the new column
                setVoiceId(profile.eleven_labs_voice_id || "");
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await updateMindProfile({
                eleven_labs_voice_id: voiceId
            }, profileId);
            toast({
                title: "Saved",
                description: "Voice ID updated successfully.",
            });
        } catch (error: any) {
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

    const handleTestVoice = async () => {
        if (!voiceId.trim()) {
            toast({
                title: "Enter Voice ID",
                description: "Please enter an Eleven Labs Voice ID to test.",
                variant: "destructive"
            });
            return;
        }

        setIsTesting(true);
        try {
            await voiceService.speak("Hello! This is a test of your custom voice. How does it sound?", {
                voiceId: voiceId.trim(),
                profileId: profileId
            });
        } catch (error) {
            console.error('Test voice error:', error);
            toast({
                title: "Test Failed",
                description: "Could not play test audio. Please check your Voice ID and API Key.",
                variant: "destructive"
            });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold">Voice Settings</h2>
                    <p className="text-muted-foreground">Configure your AI's custom voice using Eleven Labs.</p>
                </div>
                <Button onClick={handleSave} disabled={isLoading} className="rounded-full px-8">
                    {isLoading ? "Saving..." : "Save Changes"}
                </Button>
            </div>

            <div className="space-y-6">
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Volume2 className="w-5 h-5 text-orange-500" />
                        <h3 className="text-lg font-medium">Eleven Labs Configuration</h3>
                    </div>

                    <div className="p-6 border rounded-xl bg-muted/30 space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="voiceId">Eleven Labs Voice ID</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="voiceId"
                                    value={voiceId}
                                    onChange={(e) => setVoiceId(e.target.value)}
                                    placeholder="e.g. L4Eg8uEFc2zchjwsa9Jy"
                                    className="bg-background"
                                />
                                <Button
                                    variant="outline"
                                    onClick={handleTestVoice}
                                    disabled={isTesting}
                                    className="gap-2 shrink-0"
                                >
                                    {isTesting ? (
                                        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Play className="w-4 h-4" />
                                    )}
                                    Test Voice
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                You can find this ID in your Eleven Labs Voice Lab. Each profile can have its own unique voice.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border border-blue-100 bg-blue-50/50 rounded-lg flex gap-3">
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700 space-y-1">
                        <p className="font-medium">How to get a Voice ID?</p>
                        <ol className="list-decimal ml-4 space-y-1">
                            <li>Go to <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="underline font-semibold">ElevenLabs.io</a></li>
                            <li>Open "Voices" or "Voice Lab"</li>
                            <li>Copy the 'ID' for your preferred character or cloned voice.</li>
                            <li>Paste it here and click Save.</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VoiceSettingsView;
