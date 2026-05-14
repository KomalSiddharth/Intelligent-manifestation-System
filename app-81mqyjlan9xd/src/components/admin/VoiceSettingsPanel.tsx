import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { updateVoiceSettings, testVoice, type VoiceSettings } from '@/db/api';
import { Volume2, Save } from 'lucide-react';

interface VoiceSettingsPanelProps {
    profileId: string;
    initialSettings?: Partial<VoiceSettings>;
}

export function VoiceSettingsPanel({ profileId, initialSettings }: VoiceSettingsPanelProps) {
    const { toast } = useToast();
    const [settings, setSettings] = useState<VoiceSettings>({
        voice_stability: initialSettings?.voice_stability ?? 0.5,
        voice_similarity: initialSettings?.voice_similarity ?? 0.75,
        voice_speed: initialSettings?.voice_speed ?? 1.0,
        voice_model: initialSettings?.voice_model ?? 'eleven_multilingual_v2',
    });
    const [testText, setTestText] = useState('Hello! This is a test of your custom voice settings.');
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await updateVoiceSettings(profileId, settings);
            toast({
                title: 'Settings Saved',
                description: 'Voice settings have been updated successfully.',
            });
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'Failed to save settings',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleTest = async () => {
        if (!testText.trim()) {
            toast({
                title: 'Error',
                description: 'Please enter some text to test',
                variant: 'destructive',
            });
            return;
        }

        try {
            setIsTesting(true);
            const audioBlob = await testVoice(testText, settings, profileId);
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onended = () => URL.revokeObjectURL(audioUrl);
            audio.onerror = () => {
                URL.revokeObjectURL(audioUrl);
                toast({
                    title: 'Playback Error',
                    description: 'Failed to play audio',
                    variant: 'destructive',
                });
            };

            await audio.play();
            toast({
                title: 'Testing Voice',
                description: 'Playing audio with current settings...',
            });
        } catch (error: any) {
            toast({
                title: 'Test Failed',
                description: error.message || 'Failed to generate test audio',
                variant: 'destructive',
            });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Voice Settings</CardTitle>
                <CardDescription>
                    Fine-tune your AI voice parameters for the perfect sound
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Stability Slider */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Stability: {Math.round(settings.voice_stability * 100)}</Label>
                        <span className="text-xs text-muted-foreground">
                            {settings.voice_stability < 0.3 ? 'More Dynamic' : settings.voice_stability > 0.7 ? 'More Consistent' : 'Balanced'}
                        </span>
                    </div>
                    <Slider
                        value={[settings.voice_stability * 100]}
                        onValueChange={([value]) => setSettings({ ...settings, voice_stability: value / 100 })}
                        min={0}
                        max={100}
                        step={1}
                        className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                        Higher values = more consistent, lower values = more expressive
                    </p>
                </div>

                {/* Similarity Slider */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Similarity: {Math.round(settings.voice_similarity * 100)}</Label>
                        <span className="text-xs text-muted-foreground">
                            {settings.voice_similarity < 0.3 ? 'Creative' : settings.voice_similarity > 0.7 ? 'Accurate' : 'Balanced'}
                        </span>
                    </div>
                    <Slider
                        value={[settings.voice_similarity * 100]}
                        onValueChange={([value]) => setSettings({ ...settings, voice_similarity: value / 100 })}
                        min={0}
                        max={100}
                        step={1}
                        className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                        Higher values = closer to original voice samples
                    </p>
                </div>

                {/* Speed Slider */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>Speed: {settings.voice_speed.toFixed(2)}x</Label>
                        <span className="text-xs text-muted-foreground">
                            {settings.voice_speed < 0.8 ? 'Slow' : settings.voice_speed > 1.2 ? 'Fast' : 'Normal'}
                        </span>
                    </div>
                    <Slider
                        value={[settings.voice_speed * 100]}
                        onValueChange={([value]) => setSettings({ ...settings, voice_speed: value / 100 })}
                        min={50}
                        max={200}
                        step={5}
                        className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                        Adjust playback speed (0.5x - 2.0x)
                    </p>
                </div>

                {/* Voice Model Selector */}
                <div className="space-y-2">
                    <Label>Voice Model</Label>
                    <Select
                        value={settings.voice_model}
                        onValueChange={(value) => setSettings({ ...settings, voice_model: value })}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="eleven_multilingual_v2">
                                Multilingual v2 (Best for Indian Accent)
                            </SelectItem>
                            <SelectItem value="eleven_turbo_v2">
                                Turbo v2 (Faster, Less Quality)
                            </SelectItem>
                            <SelectItem value="eleven_monolingual_v1">
                                Monolingual v1 (English Only)
                            </SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                        Multilingual v2 recommended for best Indian accent support
                    </p>
                </div>

                {/* Test Text Area */}
                <div className="space-y-2">
                    <Label>Test Text</Label>
                    <Textarea
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        placeholder="Enter text to test your voice settings..."
                        rows={3}
                    />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                    <Button
                        onClick={handleTest}
                        disabled={isTesting || !testText.trim()}
                        variant="outline"
                        className="flex-1"
                    >
                        <Volume2 className="w-4 h-4 mr-2" />
                        {isTesting ? 'Testing...' : 'Test Voice'}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex-1"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
