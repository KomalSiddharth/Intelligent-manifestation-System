
import { useState } from 'react';
import { Radio, Send, Users, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/db/supabase';

const BroadcastsView = () => {
    const [message, setMessage] = useState('');
    const [title, setTitle] = useState('');
    const [isSending, setIsSending] = useState(false);
    const { toast } = useToast();

    const handleBroadcast = async () => {
        if (!message.trim()) return;

        setIsSending(true);
        const channel = supabase.channel('platform-broadcast');

        console.log('📡 Subscribing to broadcast channel...');

        // Timeout fallback
        const timeoutId = setTimeout(() => {
            console.warn('⚠️ Subscription timeout reached');
            setIsSending(false);
            supabase.removeChannel(channel);
            toast({
                title: "Connection Timeout",
                description: "Realtime connection taking too long. Check your internet or Supabase settings.",
                variant: "destructive"
            });
        }, 8000); // 8 seconds

        try {
            channel.subscribe(async (status, err) => {
                console.log(`🔌 Channel status change: ${status}`, err || '');

                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeoutId);
                    console.log('✅ Subscribed! Sending payload...');

                    const response = await channel.send({
                        type: 'broadcast',
                        event: 'notification',
                        payload: {
                            title: title || 'New Announcement',
                            message: message,
                            sender: 'Mitesh Khatri',
                            timestamp: new Date().toISOString()
                        },
                    });

                    console.log('📤 Broadcast response:', response);

                    if (response === 'ok') {
                        toast({
                            title: 'Broadcast Sent!',
                            description: 'Notification has been pushed to online users.',
                        });
                        setMessage('');
                        setTitle('');
                    } else {
                        console.error('❌ Broadcast delivery failed:', response);
                        toast({
                            title: 'Delivery Failed',
                            description: `Supabase returned: ${response}`,
                            variant: 'destructive'
                        });
                    }

                    setIsSending(false);
                    supabase.removeChannel(channel);

                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    clearTimeout(timeoutId);
                    setIsSending(false);
                    console.error('❌ Channel error/closed:', status);
                    toast({
                        title: 'Connection Error',
                        description: `Realtime channel ${status.toLowerCase()}.`,
                        variant: 'destructive',
                    });
                    supabase.removeChannel(channel);
                }
            });

        } catch (error) {
            clearTimeout(timeoutId);
            console.error('🔥 Broadcast error:', error);
            toast({
                title: 'Error',
                description: 'An unexpected error occurred while broadcasting.',
                variant: 'destructive',
            });
            setIsSending(false);
        }
    };



    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-bold">Real-time Broadcasts</h1>
                <p className="text-muted-foreground text-lg">Push live notifications to all online users instantly.</p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Composer */}
                <div className="xl:col-span-2 space-y-6">
                    <Card className="border-muted-foreground/10 shadow-sm rounded-2xl overflow-hidden">
                        <CardHeader className="border-b bg-muted/30">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Radio className="w-5 h-5 text-orange-500" />
                                Compose Broadcast
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Broadcast Title</label>
                                <Input
                                    placeholder="e.g. Workshop Starting Now!"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="bg-muted/20"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Message Content</label>
                                <Textarea
                                    placeholder="Type your announcement here..."
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    className="min-h-[150px] bg-muted/20 resize-none"
                                />
                            </div>
                            <div className="flex justify-end pt-2">
                                <Button
                                    onClick={handleBroadcast}
                                    disabled={!message.trim() || isSending}
                                    className="bg-orange-600 hover:bg-orange-700 text-white rounded-full px-8"
                                >
                                    <Send className="w-4 h-4 mr-2" />
                                    {isSending ? 'Sending...' : 'Send Broadcast'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="bg-blue-50/50 border-blue-100 shadow-none rounded-xl">
                            <CardContent className="p-4 flex gap-3">
                                <Users className="w-5 h-5 text-blue-600 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-blue-900">Reach Online Users</p>
                                    <p className="text-xs text-blue-700/80">Only users currently active on the platform will receive this.</p>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="bg-orange-50/50 border-orange-100 shadow-none rounded-xl">
                            <CardContent className="p-4 flex gap-3">
                                <Info className="w-5 h-5 text-orange-600 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-orange-900">No Emails Sent</p>
                                    <p className="text-xs text-orange-700/80">This is a browser-only notification. No emails will be triggered.</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Info / Help */}
                <div className="space-y-6">
                    <Card className="rounded-2xl border-muted-foreground/10 h-full">
                        <CardHeader>
                            <CardTitle className="text-base">About Broadcasting</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-4">
                            <p>
                                Broadcasting uses Supabase Realtime to push messages directly to users' devices without saving them to the database.
                            </p>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    <span>Instant delivery (&lt;100ms)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    <span>Interactive Pop-ups</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    <span>Zero Database Overhead</span>
                                </div>
                            </div>
                            <div className="pt-4 border-t">
                                <p className="text-xs font-mono bg-muted p-2 rounded">
                                    Channel: platform-broadcast
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default BroadcastsView;
