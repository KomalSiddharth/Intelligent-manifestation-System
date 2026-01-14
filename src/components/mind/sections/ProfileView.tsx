import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera } from 'lucide-react';
import { getMindProfile, updateMindProfile } from '@/db/api';
import { useToast } from '@/hooks/use-toast';

interface ProfileViewProps {
    profileId: string;
    onDelete: () => void;
}

const ProfileView = ({ profileId, onDelete }: ProfileViewProps) => {
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState("https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [handle, setHandle] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        loadProfile();
    }, [profileId]);

    const loadProfile = async () => {
        try {
            const profile = await getMindProfile(profileId);
            if (profile) {
                setFirstName(profile.first_name || "");
                setLastName(profile.last_name || "");
                setHandle(profile.handle || "");
                if (profile.avatar_url) setPreviewUrl(profile.avatar_url);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await updateMindProfile({
                first_name: firstName,
                last_name: lastName,
                handle: handle,
                avatar_url: previewUrl
            }, profileId);
            toast({
                title: "Saved",
                description: "Profile updated successfully.",
            });
        } catch (error: any) {
            console.error('Error saving profile:', error);
            toast({
                title: "Error",
                description: `Failed: ${error.message || "Unknown error"}`,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-2xl font-semibold">Profile</h2>
                    <p className="text-muted-foreground">Introduce yourself</p>
                </div>
                <Button onClick={handleSave} disabled={isLoading} className="rounded-full px-8">
                    {isLoading ? "Saving..." : "Save Changes"}
                </Button>
            </div>

            <div className="space-y-6">
                <div className="flex items-center gap-6">
                    <div
                        className="relative w-24 h-24 rounded-full bg-muted overflow-hidden group cursor-pointer"
                        onClick={handleImageClick}
                    >
                        <img
                            src={previewUrl}
                            alt="Profile"
                            className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Camera className="w-6 h-6 text-white" />
                        </div>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileChange}
                    />
                    <Button variant="outline" className="rounded-full" onClick={handleImageClick}>
                        Upload new image
                    </Button>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <p className="text-sm text-muted-foreground">
                            The instance name will be displayed in addition to the Clone Name when shown on the profile
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <Input
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="First Name"
                            />
                            <Input
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Last Name"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Clone Handle</Label>
                        <p className="text-sm text-muted-foreground">
                            This is your unique URL. Ideally, this should match your name and/or your handle on another site like X/Instagram.
                        </p>
                        <div className="flex rounded-md border bg-muted/50">
                            <div className="px-3 py-2 text-sm text-muted-foreground border-r bg-muted">
                                www.delphi.ai/
                            </div>
                            <input
                                className="flex-1 px-3 py-2 bg-transparent text-sm outline-none"
                                value={handle}
                                onChange={(e) => setHandle(e.target.value)}
                                placeholder="your-handle"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-8 border-t">
                <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-6 flex items-center justify-between">
                    <div className="space-y-1">
                        <h4 className="text-destructive font-medium">Delete Clone</h4>
                        <p className="text-sm text-muted-foreground">Permanently delete this clone and all its knowledge. This cannot be undone.</p>
                    </div>
                    <Button variant="destructive" onClick={onDelete} className="rounded-full px-8">
                        Delete Clone
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ProfileView;
