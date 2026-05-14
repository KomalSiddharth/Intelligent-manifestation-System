import { useState } from 'react';
import { Settings, PieChart, ChevronRight, Sparkles, MessageSquare, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useNavigate, Link } from 'react-router-dom';

interface SidebarItemProps {
    icon?: React.ElementType;
    label: string;
    isActive?: boolean;
    onClick?: () => void;
    className?: string;
}

const SidebarItem = ({ icon: Icon, label, isActive, onClick, className }: SidebarItemProps) => (
    <button
        onClick={onClick}
        className={cn(
            "flex items-center w-full px-4 py-2 text-sm font-medium transition-colors rounded-md",
            isActive
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            className
        )}
    >
        {Icon && <Icon className="w-4 h-4 mr-3" />}
        {label}
    </button>
);

interface MindSidebarProps {
    profiles: any[];
    selectedProfileId: string;
    onProfileChange: (id: string) => void;
    onAddProfile: (name: string) => Promise<void>;
    activeTab: string;
    onTabChange: (tab: string) => void;
    activeSection: string;
    onSectionChange: (section: string) => void;
}

const MindSidebar = ({
    profiles,
    selectedProfileId,
    onProfileChange,
    onAddProfile,
    activeTab,
    onTabChange,
    activeSection,
    onSectionChange,
}: MindSidebarProps) => {
    const navigate = useNavigate();
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newCloneName, setNewCloneName] = useState('');

    const handleCreate = async () => {
        if (!newCloneName.trim()) return;
        await onAddProfile(newCloneName);
        setNewCloneName('');
        setIsCreateDialogOpen(false);
    };

    return (
        <div className="w-64 h-full border-r bg-background flex flex-col">
            {/* Top Tabs */}
            <div className="p-4 space-y-4">
                <div className="space-y-1">
                    <button
                        onClick={() => onTabChange('content')}
                        className={cn(
                            "flex items-center w-full px-2 py-1.5 text-sm font-medium transition-colors rounded-md",
                            activeTab === 'content' ? "text-orange-500" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <PieChart className="w-4 h-4 mr-2" />
                        Content
                    </button>

                </div>

                {/* Clone Selector */}
                <div className="space-y-2">
                    <Select value={selectedProfileId} onValueChange={onProfileChange}>
                        <SelectTrigger className="w-full">
                            <div className="flex items-center overflow-hidden">
                                <div className="shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 mr-2" />
                                <SelectValue placeholder="Select Clone" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            {profiles.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                    {p.name || `${p.first_name} ${p.last_name}`.trim() || 'MiteshAI'}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <button className="flex items-center w-full px-2 py-1.5 text-xs font-medium text-orange-500 hover:text-orange-600 transition-colors">
                                <Plus className="w-3 h-3 mr-1" />
                                Create New MiteshAI
                            </button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create New MiteshAI</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>MiteshAI Name</Label>
                                    <Input
                                        placeholder="e.g. Business Clone"
                                        value={newCloneName}
                                        onChange={(e) => setNewCloneName(e.target.value)}
                                    />
                                </div>
                                <Button onClick={handleCreate} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
                                    Create MiteshAI
                                </Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <ScrollArea className="flex-1 px-2 min-h-0">
                <div className="space-y-6 py-2">
                    {/* Insights Section */}
                    <div className="space-y-1">
                        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Insights
                        </h3>
                        <SidebarItem
                            label="User Questions"
                            isActive={activeSection === 'user-questions'}
                            onClick={() => onSectionChange('user-questions')}
                            icon={MessageSquare}
                        />
                    </div>

                    {/* Identity Section */}
                    <div className="space-y-1">
                        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Identity
                        </h3>
                        <SidebarItem
                            label="Profile"
                            isActive={activeSection === 'profile'}
                            onClick={() => onSectionChange('profile')}
                        />
                        <SidebarItem
                            label="Biography"
                            isActive={activeSection === 'biography'}
                            onClick={() => onSectionChange('biography')}
                        />
                        <SidebarItem
                            label="Social Links"
                            isActive={activeSection === 'social-links'}
                            onClick={() => onSectionChange('social-links')}
                        />
                    </div>

                    {/* Behavior Section */}
                    <div className="space-y-1">
                        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Behavior
                        </h3>
                        <SidebarItem
                            label="Purpose & Instructions"
                            isActive={activeSection === 'purpose'}
                            onClick={() => onSectionChange('purpose')}
                        />
                        <SidebarItem
                            label="Speaking Style"
                            isActive={activeSection === 'speaking-style'}
                            onClick={() => onSectionChange('speaking-style')}
                        />
                        <SidebarItem
                            label="Response Settings"
                            isActive={activeSection === 'response-settings'}
                            onClick={() => onSectionChange('response-settings')}
                        />
                    </div>

                    {/* Appearance Section */}
                    <div className="space-y-1">
                        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Appearance
                        </h3>
                        <SidebarItem
                            label="Suggested Questions"
                            isActive={activeSection === 'suggested-questions'}
                            onClick={() => onSectionChange('suggested-questions')}
                        />
                        <SidebarItem
                            label="Experience Settings"
                            isActive={activeSection === 'experience-settings'}
                            onClick={() => onSectionChange('experience-settings')}
                        />
                    </div>


                    {/* Clone Quality */}
                    <div className="px-4 pt-4">
                        <div
                            onClick={() => onSectionChange('clone-quality')}
                            className={cn(
                                "p-4 border rounded-xl space-y-3 cursor-pointer transition-colors",
                                activeSection === 'clone-quality'
                                    ? "border-orange-200 bg-orange-50"
                                    : "hover:bg-muted/50"
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <h1 className="text-xl font-bold tracking-tight text-white">MiteshAI</h1>
                                <ChevronRight className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-orange-500 font-medium">
                                    <Sparkles className="w-4 h-4" />
                                    <span>Legendary</span>
                                </div>
                                <div className="h-1.5 w-full bg-orange-100 rounded-full overflow-hidden">
                                    <div className="h-full w-full bg-orange-500 rounded-full" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </ScrollArea>

            {/* Bottom Actions */}
            <div className="p-4 border-t space-y-1">
                <Link
                    to="/talk-to-miteshai"
                    className="flex items-center w-full px-4 py-2 text-sm font-medium text-orange-500 hover:bg-orange-50 rounded-md transition-colors"
                >
                    <MessageSquare className="w-4 h-4 mr-3" />
                    Talk to MiteshAI
                </Link>
                <button
                    onClick={() => navigate('/settings')}
                    className="flex items-center w-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                >
                    <Settings className="w-4 h-4 mr-3" />
                    Settings
                </button>
            </div>
        </div>
    );
};

export default MindSidebar;
