import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Trash2, X, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { getMindProfile, updateMindProfile } from '@/db/api';
import { useToast } from '@/hooks/use-toast';
import { MindProfile } from '@/types/types';

interface Organization {
    id: string;
    name: string;
    image: string;
}

interface BiographyViewProps {
    profileId: string;
    initialData?: MindProfile;
}

const BiographyView = ({ profileId, initialData }: BiographyViewProps) => {
    const { toast } = useToast();
    const [headline, setHeadline] = useState(initialData?.headline || "");
    const [description, setDescription] = useState(initialData?.description || "");
    const [selectedTopics, setSelectedTopics] = useState<string[]>(initialData?.topics || []);
    const [availableTopics, setAvailableTopics] = useState<string[]>([
        'Psychology', 'Wellness', 'Entrepreneurship', 'Education',
        'Finance', 'Technology', 'Health', 'Science', 'Design', 'Marketing', 'Music', 'Law', 'Religion', 'Art'
    ]);
    const [isAddingTopic, setIsAddingTopic] = useState(false);
    const [newTopic, setNewTopic] = useState("");
    const [organizations, setOrganizations] = useState<Organization[]>(initialData?.organizations || []);
    const [isAddOrgOpen, setIsAddOrgOpen] = useState(false);
    const [isEditOrgOpen, setIsEditOrgOpen] = useState(false);
    const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
    const [orgName, setOrgName] = useState("");
    const [orgImage, setOrgImage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadProfile();
    }, [profileId]);

    const loadProfile = async () => {
        try {
            console.log('📖 BiographyView: Loading profile for', profileId);
            const profile = await getMindProfile(profileId);
            console.log('✅ BiographyView: Profile data:', profile);
            if (profile) {
                setHeadline(profile.headline || "");
                setDescription(profile.description || "");
                setSelectedTopics(profile.topics || []);
                setOrganizations(profile.organizations || []);
                console.log('✨ BiographyView: State updated');
            } else {
                console.warn('⚠️ BiographyView: No profile found');
            }
        } catch (error) {
            console.error('❌ BiographyView: Error loading profile:', error);
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            await updateMindProfile({
                headline,
                description,
                topics: selectedTopics,
                organizations
            }, profileId);
            toast({
                title: "Saved",
                description: "Biography updated successfully.",
            });
        } catch (error: any) {
            console.error('Error saving profile:', error);
            toast({
                title: "Error",
                description: `Failed: ${error.message || error.details || "Unknown error"}`,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleTopicClick = (topic: string) => {
        if (selectedTopics.includes(topic)) {
            setSelectedTopics(selectedTopics.filter(t => t !== topic));
        } else {
            if (selectedTopics.length < 5) {
                setSelectedTopics([...selectedTopics, topic]);
            }
        }
    };

    const handleAddTopic = () => {
        if (newTopic.trim()) {
            const topic = newTopic.trim();
            if (!availableTopics.includes(topic)) {
                setAvailableTopics([...availableTopics, topic]);
            }
            if (!selectedTopics.includes(topic) && selectedTopics.length < 5) {
                setSelectedTopics([...selectedTopics, topic]);
            }
            setNewTopic("");
            setIsAddingTopic(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setOrgImage(url);
        }
    };

    const saveOrganization = () => {
        if (!orgName.trim()) return;

        if (currentOrg) {
            // Edit mode
            setOrganizations(organizations.map(org =>
                org.id === currentOrg.id ? { ...org, name: orgName, image: orgImage } : org
            ));
            setIsEditOrgOpen(false);
        } else {
            // Add mode
            const newOrg: Organization = {
                id: Date.now().toString(),
                name: orgName,
                image: orgImage
            };
            setOrganizations([...organizations, newOrg]);
            setIsAddOrgOpen(false);
        }
        resetOrgForm();
    };

    const resetOrgForm = () => {
        setOrgName("");
        setOrgImage("");
        setCurrentOrg(null);
    };

    const openEditOrg = (org: Organization) => {
        setCurrentOrg(org);
        setOrgName(org.name);
        setOrgImage(org.image);
        setIsEditOrgOpen(true);
    };

    const deleteOrg = (id: string) => {
        setOrganizations(organizations.filter(org => org.id !== id));
    };

    return (
        <div className="max-w-4xl mx-auto p-8 space-y-8">
            <div className="space-y-1">
                <h3 className="text-lg font-semibold">MiteshAI Bio</h3>
                <p className="text-muted-foreground">Give your Clone a biography</p>
            </div>


            <div className="space-y-8">
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <Label>Headline</Label>
                        <span className={cn("text-xs", headline.length > 120 ? "text-red-500" : "text-muted-foreground")}>
                            {headline.length}/120
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        Displayed in various places. Similar to LinkedIn headline. Max 120 characters.
                    </p>
                    <Input
                        value={headline}
                        onChange={(e) => setHeadline(e.target.value)}
                        maxLength={120}
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Label>Description</Label>
                        <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full">
                            This will be used in Training
                        </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        A longer overview of this clone's identity, background, and experiences. This will be displayed on your clone's profile page.
                    </p>
                    <div className="relative">
                        <Textarea
                            className="min-h-[200px]"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={1500}
                        />
                        <span className={cn("absolute bottom-2 right-2 text-xs", description.length > 1500 ? "text-red-500" : "text-muted-foreground")}>
                            {description.length}/1500
                        </span>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Topics</Label>
                        <p className="text-sm text-muted-foreground">
                            Select 1-5 topics that are relevant to your clone's realm of expertise. Helps calculate readiness score.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {availableTopics.map((topic) => {
                            const isSelected = selectedTopics.includes(topic);
                            return (
                                <button
                                    key={topic}
                                    onClick={() => handleTopicClick(topic)}
                                    className={cn(
                                        "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                                        isSelected
                                            ? "bg-orange-500 text-white"
                                            : "border hover:bg-muted text-foreground"
                                    )}
                                >
                                    {topic}
                                </button>
                            );
                        })}

                        {isAddingTopic ? (
                            <div className="flex items-center gap-2">
                                <Input
                                    value={newTopic}
                                    onChange={(e) => setNewTopic(e.target.value)}
                                    className="h-9 w-40 rounded-full"
                                    placeholder="New topic"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleAddTopic();
                                        if (e.key === 'Escape') setIsAddingTopic(false);
                                    }}
                                />
                                <Button size="sm" onClick={handleAddTopic} className="rounded-full h-9">Add</Button>
                                <Button size="icon" variant="ghost" onClick={() => setIsAddingTopic(false)} className="rounded-full h-9 w-9">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        ) : (
                            <Button
                                variant="outline"
                                className="rounded-full gap-2"
                                onClick={() => setIsAddingTopic(true)}
                            >
                                <Plus className="w-4 h-4" />
                                Add your own
                            </Button>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <Label>Organizations</Label>
                            <p className="text-sm text-muted-foreground">
                                Add the organization(s) your clone is associated with, such as a company, nonprofit, or school
                            </p>
                        </div>
                        <Dialog open={isAddOrgOpen} onOpenChange={(open) => {
                            setIsAddOrgOpen(open);
                            if (!open) resetOrgForm();
                        }}>
                            <DialogTrigger asChild>
                                <Button className="bg-black text-white hover:bg-black/90 rounded-full px-6">
                                    Add
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Add Organization</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-6 pt-4">
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden cursor-pointer relative group"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            {orgImage ? (
                                                <img src={orgImage} alt="Org" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-muted" />
                                            )}
                                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Camera className="w-6 h-6 text-white" />
                                            </div>
                                        </div>
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                        />
                                        <Button variant="outline" className="rounded-full" onClick={() => fileInputRef.current?.click()}>
                                            Upload new image
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Organization Name</Label>
                                        <p className="text-sm text-muted-foreground">
                                            A name that you can share with everyone so they can find you on Delphi
                                        </p>
                                        <Input
                                            value={orgName}
                                            onChange={(e) => setOrgName(e.target.value)}
                                            placeholder="Organization Name"
                                        />
                                    </div>

                                    <div className="flex justify-end">
                                        <Button onClick={saveOrganization} className="rounded-full px-8">
                                            Save
                                        </Button>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    {organizations.map((org) => (
                        <div key={org.id} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <span className="text-muted-foreground">::</span>
                                    {org.image ? (
                                        <img src={org.image} alt={org.name} className="w-10 h-10 rounded object-cover" />
                                    ) : (
                                        <div className="w-10 h-10 rounded bg-pink-100 flex items-center justify-center text-pink-600 font-bold">
                                            {org.name.substring(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <span className="font-medium">{org.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full gap-2"
                                        onClick={() => openEditOrg(org)}
                                    >
                                        <Pencil className="w-3 h-3" />
                                        Edit
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-full gap-2 text-red-500 hover:text-red-600"
                                        onClick={() => deleteOrg(org.id)}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}

                    <Dialog open={isEditOrgOpen} onOpenChange={(open) => {
                        setIsEditOrgOpen(open);
                        if (!open) resetOrgForm();
                    }}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Edit Organization</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6 pt-4">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-20 h-20 rounded-full bg-muted flex items-center justify-center overflow-hidden cursor-pointer relative group"
                                        onClick={() => fileInputRef.current?.click()}
                                    >
                                        {orgImage ? (
                                            <img src={orgImage} alt="Org" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-muted" />
                                        )}
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Camera className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                    />
                                    <Button variant="outline" className="rounded-full" onClick={() => fileInputRef.current?.click()}>
                                        Upload new image
                                    </Button>
                                </div>

                                <div className="space-y-2">
                                    <Label>Organization Name</Label>
                                    <p className="text-sm text-muted-foreground">
                                        A name that you can share with everyone so they can find you on Delphi
                                    </p>
                                    <Input
                                        value={orgName}
                                        onChange={(e) => setOrgName(e.target.value)}
                                        placeholder="Organization Name"
                                    />
                                </div>

                                <div className="flex justify-end">
                                    <Button onClick={saveOrganization} className="rounded-full px-8">
                                        Save
                                    </Button>
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <Button onClick={handleSave} disabled={isLoading} className="rounded-full px-8">
                    {isLoading ? "Saving..." : "Save Changes"}
                </Button>
            </div>
        </div>
    );
};

export default BiographyView;
