import { MessageSquare, Users, Radio, Settings as SettingsIcon, Globe, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface AccessSidebarProps {
    activeSection: string;
    onSectionChange: (section: string) => void;
}

const AccessSidebar = ({ activeSection, onSectionChange }: AccessSidebarProps) => {
    const usageSections = [
        { id: 'users', label: 'Users', icon: Users },
        { id: 'conversations', label: 'Conversations', icon: MessageSquare },
        { id: 'broadcasts', label: 'Broadcasts', icon: Radio },
    ];


    const integrationSections = [
        { id: 'website', label: 'Website', icon: Globe },
    ];

    return (
        <div className="w-64 border-r bg-background flex flex-col h-full">
            {/* Main Navigation */}
            <div className="flex-1 overflow-y-auto p-4">
                {/* USAGE Section */}
                <div className="mb-6">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">
                        Usage
                    </h3>
                    <div className="space-y-1">
                        {usageSections.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => onSectionChange(section.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                                    activeSection === section.id
                                        ? "bg-muted font-medium"
                                        : "hover:bg-muted/50 text-muted-foreground"
                                )}
                            >
                                <section.icon className="w-4 h-4" />
                                {section.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* INTEGRATIONS Section */}
                <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">
                        Integrations
                    </h3>
                    <div className="space-y-1">
                        {integrationSections.map((section) => (
                            <button
                                key={section.id}
                                onClick={() => onSectionChange(section.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                                    activeSection === section.id
                                        ? "bg-muted font-medium"
                                        : "hover:bg-muted/50 text-muted-foreground"
                                )}
                            >
                                <section.icon className="w-4 h-4" />
                                {section.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="border-t p-4 space-y-1">
                <Link
                    to="/talk-to-miteshai"
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-muted/50 text-orange-500 font-medium transition-colors"
                >
                    <MessageCircle className="w-4 h-4" />
                    Talk to MiteshAI
                </Link>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-muted/50 text-muted-foreground transition-colors">
                    <SettingsIcon className="w-4 h-4" />
                    Settings
                </button>
            </div>
        </div>
    );
};

export default AccessSidebar;
