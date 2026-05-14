import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, GripVertical, Pencil, Trash2, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMindProfile, updateMindProfile } from '@/db/api';
import { useToast } from '@/hooks/use-toast';
import { MindProfile } from '@/types/types';

interface Question {
    id: string;
    text: string;
}

interface SuggestedQuestionsViewProps {
    profileId: string;
    initialData?: MindProfile;
}

const SuggestedQuestionsView = ({ profileId, initialData }: SuggestedQuestionsViewProps) => {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([
        { id: '1', text: "What advice would you give to someone who feels their affirmations are not working?" },
        { id: '2', text: "What is the key to maintaining motivation during slow progress?" },
        { id: '3', text: "How do you suggest people deal with negative opinions they hold about themselves?" },
        { id: '4', text: "What is a powerful question you often ask your clients to inspire reflection?" },
        { id: '5', text: "What is a common pattern you observe in individuals who seek your guidance?" },
    ]);
    const [visibleQuestions, setVisibleQuestions] = useState<Question[]>(initialData?.suggested_questions as Question[] || []);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadProfile();
    }, [profileId]);

    const loadProfile = async () => {
        try {
            const profile = await getMindProfile(profileId);
            if (profile?.suggested_questions) {
                setVisibleQuestions(profile.suggested_questions as Question[]);
            } else if (profile?.response_settings?.suggestedQuestions) {
                // Fallback for legacy data
                setVisibleQuestions(profile.response_settings.suggestedQuestions as Question[]);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    };

    const handleSave = async (newVisible: Question[]) => {
        setIsLoading(true);
        try {
            await updateMindProfile({
                suggested_questions: newVisible
            }, profileId);

            toast({
                title: "Saved",
                description: "Suggested questions updated.",
            });
        } catch (error) {
            console.error('Error saving profile:', error);
            toast({
                title: "Error",
                description: "Failed to save questions.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const addToVisible = (q: Question) => {
        if (!visibleQuestions.find(v => v.id === q.id)) {
            const updated = [...visibleQuestions, q];
            setVisibleQuestions(updated);
            handleSave(updated);
        }
    };

    const removeFromVisible = (id: string) => {
        const updated = visibleQuestions.filter(v => v.id !== id);
        setVisibleQuestions(updated);
        handleSave(updated);
    };

    return (
        <div className="max-w-6xl mx-auto p-8 space-y-8">
            <div className="space-y-1">
                <h2 className="text-2xl font-semibold">Suggested Questions</h2>
                <p className="text-muted-foreground">Set questions to display on the Clone's profile</p>
            </div>

            <div className="grid grid-cols-2 gap-8">
                {/* Generated Questions Column */}
                <div className="space-y-4">
                    <h3 className="text-lg font-medium">Generated Questions</h3>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search your questions"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 rounded-full bg-muted/30"
                        />
                    </div>
                    <div className="space-y-3">
                        {generatedQuestions.map((q) => (
                            <div
                                key={q.id}
                                className="flex items-center gap-3 p-4 border rounded-lg bg-background group hover:border-orange-200 transition-colors cursor-pointer"
                                onClick={() => addToVisible(q)}
                            >
                                <GripVertical className="w-4 h-4 text-muted-foreground" />
                                <p className="flex-1 text-sm font-medium">{q.text}</p>
                                <Plus className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Visible to Users Column */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/50" />
                            <h3 className="text-lg font-medium">Visible to users</h3>
                        </div>
                    </div>

                    {visibleQuestions.length > 0 ? (
                        <div className="space-y-3">
                            {visibleQuestions.map((q) => (
                                <div key={q.id} className="flex items-center gap-3 p-4 border rounded-lg bg-background group">
                                    <p className="flex-1 text-sm font-medium">{q.text}</p>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                                        onClick={() => removeFromVisible(q.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="border-2 border-dashed rounded-xl h-[400px] flex flex-col items-center justify-center text-center p-8 space-y-4 bg-muted/10">
                            <div className="w-16 h-16 bg-orange-100 rounded-xl flex items-center justify-center rotate-3">
                                <Sparkles className="w-8 h-8 text-orange-500" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="font-medium">No visible questions</h4>
                                <p className="text-sm text-muted-foreground max-w-[200px]">
                                    Click plus on generated questions to make them visible to users.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SuggestedQuestionsView;
