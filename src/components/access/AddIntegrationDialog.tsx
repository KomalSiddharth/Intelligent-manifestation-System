import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, MessageSquare, Zap, Cloud, Smartphone, Send, Slack, Check } from 'lucide-react';

interface AddIntegrationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface IntegrationOption {
    id: string;
    name: string;
    description: string;
    icon: any;
    color: string;
    isAdded?: boolean;
}

const INTEGRATIONS: IntegrationOption[] = [
    {
        id: 'kajabi',
        name: 'Kajabi',
        description: 'Embed your Clone on your Kajabi site',
        icon: Globe, // Fallback for Kajabi
        color: 'bg-blue-600',
    },
    {
        id: 'mighty',
        name: 'Mighty Networks',
        description: 'Embed your Clone on your Mighty Networks site',
        icon: Users, // Fallback
        color: 'bg-slate-800',
    },
    {
        id: 'thinkific',
        name: 'Thinkific',
        description: 'Embed your Clone on your Thinkific site',
        icon: Cloud, // Fallback
        color: 'bg-indigo-900',
    },
    {
        id: 'wix',
        name: 'Wix',
        description: 'Embed your Clone on your Wix site',
        icon: Globe, // Fallback
        color: 'bg-black',
    },
    {
        id: 'telegram',
        name: 'Telegram',
        description: 'Create a Telegram bot',
        icon: Send,
        color: 'bg-sky-500',
    },
    {
        id: 'slack',
        name: 'Slack',
        description: 'Create a Slack bot',
        icon: Slack,
        color: 'bg-purple-800',
    },
    {
        id: 'zapier',
        name: 'Zapier',
        description: 'Webhooks for new users and subscribers',
        icon: Zap,
        color: 'bg-orange-500',
        isAdded: true, // As per screenshot
    },
];

import { Users } from 'lucide-react'; // Late import fix

export default function AddIntegrationDialog({ open, onOpenChange }: AddIntegrationDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden bg-white">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-xl font-bold">Add Integration</DialogTitle>
                </DialogHeader>

                <ScrollArea className="h-[500px] p-6 pt-2">
                    <div className="space-y-4">
                        {INTEGRATIONS.map((item) => (
                            <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full ${item.color} flex items-center justify-center text-white shrink-0`}>
                                        <item.icon className="w-5 h-5" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="font-semibold text-sm">{item.name}</h4>
                                        <p className="text-xs text-muted-foreground">{item.description}</p>
                                    </div>
                                </div>
                                {item.isAdded ? (
                                    <Button variant="outline" className="rounded-full px-6 bg-gray-50 text-gray-400 hover:text-gray-400 cursor-default" disabled>
                                        Added
                                    </Button>
                                ) : (
                                    <Button className="rounded-full px-6 bg-black hover:bg-gray-800 text-white font-medium">
                                        Integrate
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
