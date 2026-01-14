import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info, Pin } from 'lucide-react';
import { getMindProfile, updateMindProfile } from '@/db/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ResponseSettingsViewProps {
    profileId: string;
}

const ResponseSettingsView = ({ profileId }: ResponseSettingsViewProps) => {
    const { toast } = useToast();
    const [language, setLanguage] = useState("en-US");
    const [responseLength, setResponseLength] = useState("explanatory");
    const [creativity, setCreativity] = useState("adaptive");
    const [dynamicQuestions, setDynamicQuestions] = useState(true);
    const [recencyBias, setRecencyBias] = useState(true);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadProfile();
    }, [profileId]);

    const loadProfile = async () => {
        try {
            const profile = await getMindProfile(profileId);
            if (profile?.response_settings) {
                const settings = profile.response_settings as any;
                setLanguage(settings.language || "en-US");
                setResponseLength(settings.responseLength || "explanatory");
                setCreativity(settings.creativity || "adaptive");
                setDynamicQuestions(settings.dynamicQuestions ?? true);
                setRecencyBias(settings.recencyBias ?? true);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            // Fetch latest to merge
            const profile = await getMindProfile(profileId);
            const existingSettings = profile?.response_settings || {};

            await updateMindProfile({
                response_settings: {
                    ...existingSettings,
                    language,
                    responseLength,
                    creativity,
                    dynamicQuestions,
                    recencyBias
                }
            }, profileId);
            toast({
                title: "Saved",
                description: "Response settings updated successfully.",
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
        <div className="max-w-4xl mx-auto p-8 space-y-12">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-semibold">Response Settings</h2>
                    <span className="px-2 py-0.5 text-xs bg-muted text-muted-foreground rounded-full flex items-center gap-1">
                        <Info className="w-3 h-3" /> Info
                    </span>
                </div>
                <Button onClick={handleSave} disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save Changes"}
                </Button>
            </div>

            <div className="space-y-6">
                <h3 className="text-lg font-medium">Language Settings</h3>
                <div className="border rounded-lg p-6 flex items-center justify-between">
                    <div className="space-y-1">
                        <Label>Default Language</Label>
                        <p className="text-sm text-muted-foreground">Your Clone's native language</p>
                    </div>
                    <Select value={language} onValueChange={setLanguage}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="en-US">🇺🇸 English</SelectItem>
                            <SelectItem value="es">🇪🇸 Spanish</SelectItem>
                            <SelectItem value="fr">🇫🇷 French</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="space-y-6">
                <h3 className="text-lg font-medium">Message Configurations</h3>

                <div className="border rounded-lg p-6 flex items-center justify-between">
                    <div className="space-y-1">
                        <Label>Response Length</Label>
                        <p className="text-sm text-muted-foreground">How long should your Clone's responses be?</p>
                    </div>
                    <div className="flex bg-muted rounded-lg p-1">
                        {['Intelligent', 'Concise', 'Explanatory', 'Custom'].map((option) => {
                            const value = option.toLowerCase();
                            const isSelected = responseLength === value;
                            return (
                                <button
                                    key={value}
                                    onClick={() => setResponseLength(value)}
                                    className={cn(
                                        "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                                        isSelected ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="border rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <Label>Creativity</Label>
                            <p className="text-sm text-muted-foreground">How strictly should your Clone adhere to its content?</p>
                        </div>
                        <div className="flex bg-muted rounded-lg p-1">
                            {['Strict', 'Adaptive', 'Creative'].map((option) => {
                                const value = option.toLowerCase();
                                const isSelected = creativity === value;
                                return (
                                    <button
                                        key={value}
                                        onClick={() => setCreativity(value)}
                                        className={cn(
                                            "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                                            isSelected ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {option}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <p>Your Delphi will infer what you might say in new situations based solely on your training data</p>
                    </div>
                </div>

                <div className="border rounded-lg p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <Label>Dynamic Questions</Label>
                            <p className="text-sm text-muted-foreground">Should your Clone ask follow-up questions at the end of messages?</p>
                        </div>
                        <Switch checked={dynamicQuestions} onCheckedChange={setDynamicQuestions} className="data-[state=checked]:bg-orange-500" />
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                        <Pin className="w-4 h-4 mt-0.5 shrink-0 rotate-45" />
                        <p>You can provide specific guidance about questioning style (e.g., formal vs. casual, brief vs. detailed) in your <span className="font-medium text-foreground">Custom Instructions</span></p>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <h3 className="text-lg font-medium">Additional Configurations</h3>
                <div className="border rounded-lg p-6 flex items-center justify-between">
                    <div className="space-y-1">
                        <Label>Recency Bias</Label>
                        <p className="text-sm text-muted-foreground">Prioritize more recent documents</p>
                    </div>
                    <Switch checked={recencyBias} onCheckedChange={setRecencyBias} className="data-[state=checked]:bg-orange-500" />
                </div>
            </div>
        </div>
    );
};

export default ResponseSettingsView;
