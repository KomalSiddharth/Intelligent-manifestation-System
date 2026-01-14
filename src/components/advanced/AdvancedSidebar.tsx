import {
    Settings,
    MessageSquare,
} from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useNavigate, Link } from 'react-router-dom';

interface SidebarItemProps {
    label: string;
    isActive?: boolean;
    onClick?: () => void;
    className?: string;
    badge?: string;
}

const SidebarItem = ({ label, isActive, onClick, className, badge }: SidebarItemProps) => (
    <button
        onClick={onClick}
        className={cn(
            "flex items-center justify-between w-full px-4 py-2 text-sm font-medium transition-colors rounded-md",
            isActive
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            className
        )}
    >
        <span>{label}</span>
        {badge && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-orange-100 text-orange-600 hover:bg-orange-100">
                {badge}
            </Badge>
        )}
    </button>
);

interface AdvancedSidebarProps {
    activeSection: string;
    onSectionChange: (section: string) => void;
}

const AdvancedSidebar = ({
    activeSection,
    onSectionChange,
}: AdvancedSidebarProps) => {
    const navigate = useNavigate();

    return (
        <div className="w-64 h-full border-r bg-background flex flex-col">
            {/* Clone Selector */}
            <div className="p-4">
                <Select defaultValue="main-clone">
                    <SelectTrigger className="w-full">
                        <div className="flex items-center">
                            <div className="w-5 h-5 rounded-full overflow-hidden mr-2">
                                <img
                                    src="https://miaoda-conversation-file.s3cdn.medo.dev/user-7nqges6yla0w/conv-81mqyjlan9xc/20251206/file-81ndgdtyydq8.png"
                                    alt="Clone"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <SelectValue placeholder="Select MiteshAI" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="main-clone">MiteshAI</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <ScrollArea className="flex-1 px-2">
                <div className="space-y-6 py-2">
                    {/* Monetization Section */}
                    <div className="space-y-1">
                        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Monetization
                        </h3>
                        <div className="relative">
                            {activeSection === 'manage-monetization' && (
                                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-orange-500 rounded-r-full" />
                            )}
                            <SidebarItem
                                label="Manage Monetization"
                                isActive={activeSection === 'manage-monetization'}
                                onClick={() => onSectionChange('manage-monetization')}
                            />
                        </div>
                    </div>

                    {/* Automations Section */}
                    <div className="space-y-1">
                        <h3 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                            Automations
                        </h3>
                        <SidebarItem
                            label="Actions"
                            badge="Beta"
                            isActive={activeSection === 'actions'}
                            onClick={() => onSectionChange('actions')}
                        />
                        <SidebarItem
                            label="Alerts"
                            isActive={activeSection === 'alerts'}
                            onClick={() => onSectionChange('alerts')}
                        />
                        <SidebarItem
                            label="Products"
                            isActive={activeSection === 'products'}
                            onClick={() => onSectionChange('products')}
                        />
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

export default AdvancedSidebar;
