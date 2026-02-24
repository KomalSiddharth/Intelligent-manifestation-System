import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Bell,
    Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
// import { VoiceSettingsPanel } from '@/components/admin/VoiceSettingsPanel';
import { getMindProfiles } from '@/db/api';

const SettingsPage = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('notifications');
    const [emailNoAnswer, setEmailNoAnswer] = useState(true);
    const [activityReport, setActivityReport] = useState("never");
    const [emailNewUser, setEmailNewUser] = useState(false);
    // const [profileId, setProfileId] = useState<string | null>(null);

    // useEffect(() => {
    //     // Fetch primary profile for voice settings
    //     getMindProfiles().then(profiles => {
    //         const primary = profiles.find(p => p.is_primary);
    //         if (primary) setProfileId(primary.id);
    //     });
    // }, []);

    const sidebarItems = [
        {
            category: "GENERAL",
            items: [
                { icon: Bell, label: "Notifications", id: "notifications" },
                { icon: Users, label: "Personal Profile", id: "profile" },
            ]
        }
    ];

    const bottomItems = [];

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Header */}
            <header className="h-14 border-b flex items-center px-4 gap-4 bg-background">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Clone Studio</span>
                    <span className="text-muted-foreground">›</span>
                    <span className="font-medium">Settings</span>
                </div>
            </header>

            <div className="flex-1 flex">
                {/* Sidebar */}
                <aside className="w-64 border-r bg-background flex flex-col">
                    <div className="flex-1 py-6 px-4 space-y-8">
                        {sidebarItems.map((group, idx) => (
                            <div key={idx} className="space-y-2">
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                                    {group.category}
                                </h3>
                                <div className="space-y-1">
                                    {group.items.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveTab(item.id)}
                                            className={cn(
                                                "flex items-center w-full px-2 py-1.5 text-sm font-medium rounded-md transition-colors",
                                                activeTab === item.id
                                                    ? "bg-muted text-foreground"
                                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                            )}
                                        >
                                            <item.icon className="w-4 h-4 mr-3" />
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="p-4 border-t space-y-1">
                        {bottomItems.map((item, idx) => (
                            <button
                                key={idx}
                                className="flex items-center w-full px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
                            >
                                <item.icon className="w-4 h-4 mr-3" />
                                {item.label}
                            </button>
                        ))}
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-8 max-w-4xl">
                    {activeTab === 'notifications' && (
                        <div className="space-y-6">
                            <div className="space-y-1">
                                <h1 className="text-2xl font-semibold">Notifications</h1>
                                <p className="text-muted-foreground">
                                    Your personal email settings - does not affect settings for other contributors.
                                </p>
                            </div>

                            <div className="border rounded-lg divide-y bg-card">
                                <div className="p-6 flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="font-medium">Email When Clone Can't Answer</div>
                                        <div className="text-sm text-muted-foreground">
                                            Be alerted if your clone can't answer a user's question
                                        </div>
                                    </div>
                                    <Switch
                                        checked={emailNoAnswer}
                                        onCheckedChange={setEmailNoAnswer}
                                        className="data-[state=checked]:bg-orange-500"
                                    />
                                </div>

                                <div className="p-6 flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="font-medium">Clone Activity Report</div>
                                        <div className="text-sm text-muted-foreground">
                                            Send a weekly or daily report of your clone's activity
                                        </div>
                                    </div>
                                    <Select value={activityReport} onValueChange={setActivityReport}>
                                        <SelectTrigger className="w-[100px]">
                                            <SelectValue placeholder="Select" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="never">Never</SelectItem>
                                            <SelectItem value="daily">Daily</SelectItem>
                                            <SelectItem value="weekly">Weekly</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="p-6 flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <div className="font-medium">Email If New User</div>
                                        <div className="text-sm text-muted-foreground">
                                            Be alerted when a new user messages your clone for the first time
                                        </div>
                                    </div>
                                    <Switch
                                        checked={emailNewUser}
                                        onCheckedChange={setEmailNewUser}
                                        className="data-[state=checked]:bg-orange-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}


                    {activeTab === 'profile' && (
                        <div className="space-y-6">
                            <div className="space-y-1">
                                <h1 className="text-2xl font-semibold">Personal Profile</h1>
                                <p className="text-muted-foreground">
                                    Manage your personal details and preferences.
                                </p>
                            </div>

                            <div className="border rounded-lg bg-card p-6 space-y-4">
                                <Button className="bg-orange-600 hover:bg-orange-700 text-white">
                                    Save Changes
                                </Button>
                            </div>
                        </div>
                    )}


                </main>
            </div>
        </div>
    );
};

export default SettingsPage;
