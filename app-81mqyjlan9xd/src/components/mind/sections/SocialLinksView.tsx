import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pencil, Trash2, Facebook, Linkedin, Twitter, Youtube, Globe, Instagram, Video } from 'lucide-react';
import { getMindProfile, updateMindProfile } from '@/db/api';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";

import { MindProfile } from '@/types/types';

interface SocialLink {
    id: string;
    name: string;
    handle: string;
    connected: boolean;
    icon: React.ElementType;
}

interface SocialLinksViewProps {
    profileId: string;
    initialData?: MindProfile;
}

const SocialLinksView = ({ profileId, initialData }: SocialLinksViewProps) => {
    const { toast } = useToast();
    const [availableSocials, setAvailableSocials] = useState<SocialLink[]>(() => {
        const initial = [
            { id: 'instagram', name: 'Instagram', handle: 'Add an account!', connected: false, icon: Instagram },
            { id: 'x', name: 'X', handle: 'Add an account!', connected: false, icon: Twitter },
            { id: 'twitter', name: 'Twitter', handle: 'Add an account!', connected: false, icon: Twitter },
            { id: 'linkedin', name: 'Linkedin', handle: 'Add an account!', connected: false, icon: Linkedin },
            { id: 'facebook', name: 'Facebook', handle: 'Add an account!', connected: false, icon: Facebook },
            { id: 'youtube', name: 'Youtube', handle: 'Add an account!', connected: false, icon: Youtube },
            { id: 'tiktok', name: 'Tiktok', handle: 'Add an account!', connected: false, icon: Video },
            { id: 'website', name: 'Website', handle: 'Add an account!', connected: false, icon: Globe },
        ];
        if (initialData?.social_links) {
            const savedLinks = initialData.social_links as Array<{ id: string, handle: string }>;
            return initial.map(social => {
                const saved = savedLinks.find(s => s.id === social.id);
                return saved ? { ...social, handle: saved.handle, connected: true } : social;
            });
        }
        return initial;
    });
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadProfile();
    }, [profileId]);

    const loadProfile = async () => {
        try {
            const profile = await getMindProfile(profileId);
            if (profile?.social_links) {
                const savedLinks = profile.social_links as Array<{ id: string, handle: string }>;
                setAvailableSocials(prev => prev.map(social => {
                    const saved = savedLinks.find(s => s.id === social.id);
                    return saved ? { ...social, handle: saved.handle, connected: true } : social;
                }));
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    };

    const handleSaveAll = async () => {
        setIsLoading(true);
        try {
            const connectedLinks = availableSocials
                .filter(s => s.connected)
                .map(s => ({ id: s.id, handle: s.handle }));

            await updateMindProfile({
                social_links: connectedLinks
            }, profileId);
            toast({
                title: "Saved",
                description: "Social links updated successfully.",
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

    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isAddCustomOpen, setIsAddCustomOpen] = useState(false);
    const [editingSocial, setEditingSocial] = useState<SocialLink | null>(null);
    const [editHandle, setEditHandle] = useState("");
    const [customUrl, setCustomUrl] = useState("");

    const openEdit = (social: SocialLink) => {
        setEditingSocial(social);
        setEditHandle(social.handle);
        setIsEditOpen(true);
    };

    const saveEdit = async () => {
        if (editingSocial) {
            setAvailableSocials(availableSocials.map(s =>
                s.id === editingSocial.id ? { ...s, handle: editHandle, connected: true } : s
            ));
            setIsEditOpen(false);
            // Auto-save after edit
            setTimeout(() => handleSaveAll(), 100);
        }
    };

    const saveCustom = () => {
        if (customUrl.trim()) {
            // Logic to add custom link would go here
            // For now just closing dialog
            setIsAddCustomOpen(false);
            setCustomUrl("");
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold">Social Links</h2>
                    <p className="text-muted-foreground">Link to your social media profiles</p>
                </div>
            </div>

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h3 className="font-medium">All Socials</h3>
                        <p className="text-sm text-muted-foreground">
                            Link your accounts from your favorite apps.
                        </p>
                    </div>
                    <Dialog open={isAddCustomOpen} onOpenChange={setIsAddCustomOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="rounded-full">
                                Add Custom
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Add Extras</DialogTitle>
                            </DialogHeader>
                            <div className="py-4">
                                <Input
                                    value={customUrl}
                                    onChange={(e) => setCustomUrl(e.target.value)}
                                    placeholder="Link URL"
                                    className="border-orange-500 focus-visible:ring-orange-500"
                                />
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddCustomOpen(false)} className="rounded-full">
                                    Cancel
                                </Button>
                                <Button onClick={saveCustom} className="rounded-full bg-gray-500 hover:bg-gray-600">
                                    Update
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="space-y-3">
                    {availableSocials.map((social) => (
                        <div key={social.id} className="flex items-center justify-between p-4 border rounded-full bg-background">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                                    <social.icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-medium">{social.name}</div>
                                    <div className={`text-sm ${social.connected ? 'text-muted-foreground' : 'text-blue-500'}`}>
                                        {social.handle}
                                    </div>
                                </div>
                            </div>
                            {social.connected ? (
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="rounded-full h-8 w-8"
                                        onClick={() => openEdit(social)}
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    className="bg-black text-white hover:bg-black/90 rounded-full px-6 h-8 text-sm"
                                    onClick={() => openEdit(social)}
                                >
                                    Add
                                </Button>
                            )}
                        </div>
                    ))}
                </div>

                <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit {editingSocial?.name}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Your {editingSocial?.name} handle</Label>
                                <Input
                                    value={editHandle}
                                    onChange={(e) => setEditHandle(e.target.value)}
                                    className="border-orange-500 focus-visible:ring-orange-500 text-blue-500"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="rounded-full">
                                Cancel
                            </Button>
                            <Button onClick={saveEdit} className="rounded-full bg-gray-500 hover:bg-gray-600">
                                Update
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default SocialLinksView;
