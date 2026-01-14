import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
    MoreHorizontal,
    ArrowUp,
    Plus,
    Moon,
    Clock,
    LifeBuoy,
    Mail,
    Tag,
    Share2,
    Fingerprint,
    GitBranch,
    Calendar,
    MessageCircle,
    Phone,
    Sparkles,
    ThumbsUp,
    MessageSquare,
    Heart,
    UserPlus,
    ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ActionCard = ({
    status,
    title,
    updatedAt,
    enabled = false
}: {
    status: 'Enabled' | 'Disabled',
    title: string,
    updatedAt: string,
    enabled?: boolean
}) => (
    <div className="border rounded-xl p-6 space-y-8 bg-card hover:border-primary/50 transition-colors cursor-pointer group">
        <div className="flex items-start justify-between">
            <Badge
                variant="secondary"
                className={cn(
                    "text-xs font-medium",
                    enabled
                        ? "bg-green-100 text-green-700 hover:bg-green-100"
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                )}
            >
                <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", enabled ? "bg-green-600" : "bg-red-600")} />
                {status}
            </Badge>
            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2 text-muted-foreground">
                <MoreHorizontal className="w-4 h-4" />
            </Button>
        </div>
        <div className="space-y-1">
            <h3 className="font-medium leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground">Updated {updatedAt}</p>
        </div>
    </div>
);

const TemplateCard = ({
    icon: Icon,
    title,
    description
}: {
    icon: React.ElementType,
    title: string,
    description: string
}) => (
    <div className="border rounded-xl p-6 space-y-4 bg-card hover:border-primary/50 transition-colors cursor-pointer">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Icon className="w-4 h-4" />
        </div>
        <div className="space-y-1">
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm text-muted-foreground leading-snug">{description}</p>
        </div>
    </div>
);

const DataCard = ({
    icon: Icon,
    title,
    description
}: {
    icon: React.ElementType,
    title: string,
    description: string
}) => (
    <div className="border rounded-xl p-6 space-y-4 bg-card hover:border-primary/50 transition-colors cursor-pointer">
        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Icon className="w-4 h-4" />
        </div>
        <div className="space-y-1">
            <h3 className="font-medium">{title}</h3>
            <p className="text-sm text-muted-foreground leading-snug">{description}</p>
        </div>
    </div>
);

const ActionsView = () => {
    const actions = [
        { title: "Inactivity Nudge", status: "Disabled", updatedAt: "3 days ago", enabled: false },
        { title: "Member Check-In - Part 1", status: "Enabled", updatedAt: "4 months ago", enabled: true },
        { title: "Member Check-In - Part 1", status: "Enabled", updatedAt: "4 months ago", enabled: true },
        { title: "New Users Tagged as Accountability Coaches", status: "Disabled", updatedAt: "3 months ago", enabled: false },
        { title: "Welcome New Members with Onboarding Message", status: "Disabled", updatedAt: "5 months ago", enabled: false },
        { title: "Welcome Call for New Users", status: "Disabled", updatedAt: "5 months ago", enabled: false },
        { title: "WhatsApp Reminder on Command", status: "Disabled", updatedAt: "5 months ago", enabled: false },
        { title: "Welcome New Users with Orientation Guide", status: "Disabled", updatedAt: "3 months ago", enabled: false },
        { title: "Event Reminder", status: "Enabled", updatedAt: "5 months ago", enabled: true },
        { title: "Follow-Up Message", status: "Enabled", updatedAt: "5 months ago", enabled: true },
        { title: "Event Reminder", status: "Enabled", updatedAt: "5 months ago", enabled: true },
        { title: "Daily Accountability Texts for Success", status: "Disabled", updatedAt: "5 months ago", enabled: false },
        { title: "Follow-Up Message", status: "Enabled", updatedAt: "5 months ago", enabled: true },
    ];

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background overflow-auto">
            <div className="p-8 max-w-7xl mx-auto w-full space-y-12">

                {/* Header Section */}
                <div className="text-center space-y-6">
                    <div className="flex items-center justify-center gap-2 text-orange-500 font-medium">
                        <GitBranch className="w-5 h-5" />
                        <span>Automations</span>
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-3xl font-semibold">Delphi Actions</h1>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            Your Delphi can now automatically perform actions based on intelligent triggers.
                            To get started, simply describe a flow or use one of our pre-built templates.
                        </p>
                    </div>

                    {/* Composer */}
                    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border p-4 text-left space-y-4">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <GitBranch className="w-4 h-4" />
                            <span>Composer</span>
                        </div>
                        <Textarea
                            placeholder="When the user finishes a conversation, check in on their progress the next day..."
                            className="min-h-[100px] border-none resize-none focus-visible:ring-0 p-0 text-base"
                        />
                        <div className="flex justify-end">
                            <Button size="icon" className="rounded-full h-8 w-8 bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground">
                                <ArrowUp className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    <Button variant="secondary" className="rounded-full text-xs h-7">
                        Explore Templates ↓
                    </Button>
                </div>

                {/* Your Actions */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Your Actions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        Connect external applications to your MiteshAI.
                        {actions.map((action, i) => (
                            <ActionCard
                                key={i}
                                title={action.title}
                                status={action.status as 'Enabled' | 'Disabled'}
                                updatedAt={action.updatedAt}
                                enabled={action.enabled}
                            />
                        ))}
                    </div>
                </div>

                {/* Start From Scratch */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Start From Scratch</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="border rounded-xl p-8 flex flex-col items-center justify-center gap-4 bg-card hover:border-primary/50 transition-colors cursor-pointer min-h-[200px] text-muted-foreground hover:text-foreground">
                            <Plus className="w-8 h-8" />
                            <span className="font-medium">New Action</span>
                        </div>
                    </div>
                </div>

                {/* Featured Templates */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Featured Templates</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Moon}
                            title="Inactivity Nudge"
                            description="Message users after a period of inactivity."
                        />
                        <TemplateCard
                            icon={Clock}
                            title="User-Requested Reminder"
                            description="Follow up when users ask for a reminder about something specific."
                        />
                        <TemplateCard
                            icon={LifeBuoy}
                            title="Support Response"
                            description="Respond to support requests with a predefined message."
                        />
                        <TemplateCard
                            icon={Mail}
                            title="Notify Me On Alert"
                            description="When an alert is triggered, send me an email"
                        />
                    </div>
                </div>

                {/* Data Collection */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Data Collection</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <DataCard
                            icon={Tag}
                            title="User Tagging"
                            description="Group users based on interactions for audience categorization."
                        />
                        <DataCard
                            icon={Share2}
                            title="Data Forwarding"
                            description="Forward user data to an API for integration with external systems."
                        />
                        <DataCard
                            icon={Fingerprint}
                            title="User Properties"
                            description="Automatically stores a user's location when mentioned."
                        />
                    </div>
                </div>

                {/* User Engagement & Retention */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">User Engagement & Retention</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Moon}
                            title="Inactivity Nudge"
                            description="Message users after a period of inactivity."
                        />
                        <TemplateCard
                            icon={Calendar}
                            title="Weekly Progress Check"
                            description="Check-in weekly with users to maintain regular contact."
                        />
                        <TemplateCard
                            icon={Clock}
                            title="Conversation Recap"
                            description="Auto-send a summary every 50 messages."
                        />
                    </div>
                </div>

                {/* Follow Ups & Reminders */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Follow Ups & Reminders</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Clock}
                            title="User-Requested Reminder"
                            description="Follow up when users ask for a reminder about something specific."
                        />
                        <TemplateCard
                            icon={Calendar}
                            title="Event Reminder"
                            description="Remind users about events they've expressed interest in."
                        />
                        <TemplateCard
                            icon={MessageCircle}
                            title="Follow-Up Message"
                            description="Follow up with users about a topic/event they mentioned earlier."
                        />
                        <TemplateCard
                            icon={Share2}
                            title="Post-Conversation Plan"
                            description="Send next steps after a conversation."
                        />
                        <TemplateCard
                            icon={ArrowRight}
                            title="Instant Meeting Setup"
                            description="Auto-send your calendar link upon request."
                        />
                        <TemplateCard
                            icon={Sparkles}
                            title="Pre-Event Pep Talk"
                            description="Call users an hour before events with a pep talk."
                        />
                    </div>
                </div>

                {/* Message Scripting */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Message Scripting</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={ThumbsUp}
                            title="Thank You Message"
                            description="Send a thank you message when new users sign up."
                        />
                        <TemplateCard
                            icon={LifeBuoy}
                            title="Support Response"
                            description="Respond to support requests with a predefined message."
                        />
                        <TemplateCard
                            icon={MessageSquare}
                            title="Feedback Collection"
                            description="Request feedback on your Delphi the day after the user's first conversation."
                        />
                    </div>
                </div>

                {/* Multi-Step Actions */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Multi-Step Actions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Calendar}
                            title="Member Check-In - Part 1"
                            description="Enable accountability for members only, 2 part process."
                        />
                        <TemplateCard
                            icon={Calendar}
                            title="Member Check-In - Part 2"
                            description="Enable accountability for members only, 2 part process."
                        />
                        <TemplateCard
                            icon={Heart}
                            title="Birthday Wishes"
                            description="Send a personalized note on every user's birthday."
                        />
                    </div>
                </div>

                {/* Conversion & Growth */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold">Conversion & Growth</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <TemplateCard
                            icon={Mail}
                            title="Personal Contact"
                            description="Notify yourself about highly inactive users for personal follow-up."
                        />
                        <TemplateCard
                            icon={UserPlus}
                            title="Convert Users"
                            description="Send users a signup link after 10 chat messages."
                        />
                        <TemplateCard
                            icon={ArrowRight}
                            title="Quota Reached"
                            description="Offer a discount when users hit their chat quota limit the first time."
                        />
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ActionsView;
