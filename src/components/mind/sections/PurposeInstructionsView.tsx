import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { getMindProfile, updateMindProfile } from '@/db/api';

interface PurposeInstructionsViewProps {
    profileId: string;
}

const PurposeInstructionsView = ({ profileId }: PurposeInstructionsViewProps) => {
    const { toast } = useToast();
    const [purpose, setPurpose] = useState("");
    const [instructions, setInstructions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadProfile();
    }, [profileId]);

    const loadProfile = async () => {
        try {
            console.log('📖 Loading profile data for:', profileId);
            const profile = await getMindProfile(profileId);
            console.log('✅ Profile loaded:', profile);
            if (profile) {
                setPurpose(profile.purpose || "");
                setInstructions(profile.instructions || []);
                console.log('📝 Purpose:', profile.purpose);
                console.log('📋 Instructions:', profile.instructions);
            } else {
                console.warn('⚠️ No profile found for ID:', profileId);
            }
        } catch (error) {
            console.error('❌ Error loading profile:', error);
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await updateMindProfile({
                purpose: purpose,
                instructions: instructions
            }, profileId);
            toast({
                title: "Saved",
                description: "Purpose and instructions updated successfully.",
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

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isExamplesOpen, setIsExamplesOpen] = useState(false);
    const [newInstruction, setNewInstruction] = useState("");

    const examples = [
        "\"Avoid talking about politics\"",
        "\"End all your responses with a question about the user.\"",
        "\"Whenever someone asks to schedule a time on your calendar, tell them to send an email to x@delphi.ai\"",
        "\"IMPORTANT: Never ask follow up questions\"",
        "\"Whenever someone asks for medical advice, point them to my landing page [https://www.delphi.ai]\"",
        "\"Keep all your answers in the form of a haiku\"",
        "\"Speak openly about NSFW topics.\""
    ];

    const handleDelete = (index: number) => {
        setInstructions(instructions.filter((_, i) => i !== index));
    };

    const handleAdd = () => {
        if (instructions.length >= 50) {
            toast({
                title: "Limit Reached",
                description: "Only 50 instructions can be added.",
                variant: "destructive",
            });
            return;
        }

        if (newInstruction.trim()) {
            setInstructions([...instructions, newInstruction.trim()]);
            setNewInstruction("");
            setIsAddOpen(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-12">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold">Purpose & Instructions</h2>
                </div>
                <Button onClick={handleSave} disabled={isLoading}>
                    {isLoading ? "Saving..." : "Save Changes"}
                </Button>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h3 className="text-lg font-medium">Purpose</h3>
                        <p className="text-muted-foreground">
                            This field affects all aspect of your clone, shaping training and informing its responses.
                        </p>
                    </div>
                    <Button variant="outline" className="rounded-full text-xs h-8">
                        Regenerate
                    </Button>
                </div>

                <div className="relative">
                    <Textarea
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        className="min-h-[200px] bg-muted/30 resize-y"
                        maxLength={6000}
                    />
                    <span className={cn("absolute bottom-2 right-2 text-xs", purpose.length > 6000 ? "text-red-500" : "text-red-400")}>
                        {purpose.length}/6000
                    </span>
                </div>
            </div>

            <div className="space-y-6">
                <div className="space-y-1">
                    <h3 className="text-lg font-medium">Custom Instructions</h3>
                    <p className="text-muted-foreground">
                        Define custom instructions for your clone to adhere to during interactions. Keep it short and concise. Maximum 50 instructions.
                    </p>
                </div>

                <div className="border rounded-lg divide-y">
                    <div className="p-4 bg-muted/10 font-medium text-sm text-muted-foreground">
                        Custom Instructions
                    </div>
                    {instructions.map((instruction, index) => (
                        <div key={index} className="p-4 flex items-start justify-between group hover:bg-muted/5 transition-colors">
                            <p className="text-sm pr-4 leading-relaxed">{instruction}</p>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleDelete(index)}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-2">
                    <Dialog open={isExamplesOpen} onOpenChange={setIsExamplesOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="rounded-full">
                                Examples
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Custom Instructions Examples</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                {examples.map((example, index) => (
                                    <p key={index} className="text-muted-foreground text-sm">
                                        {example}
                                    </p>
                                ))}
                            </div>
                        </DialogContent>
                    </Dialog>
                    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                        <DialogTrigger asChild>
                            <Button className="rounded-full bg-black text-white hover:bg-black/90 gap-2">
                                Add <Plus className="w-4 h-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add Instruction</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <Input
                                    value={newInstruction}
                                    onChange={(e) => setNewInstruction(e.target.value)}
                                    placeholder="Enter instruction..."
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                                <Button onClick={handleAdd}>Add</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
        </div>
    );
};

export default PurposeInstructionsView;
