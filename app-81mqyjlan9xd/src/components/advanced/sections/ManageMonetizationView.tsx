import { Button } from '@/components/ui/button';
import { Share2, FileText, MessageSquare, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const ManageMonetizationView = () => {
    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background">
            {/* Top Stats Bar */}
            <div className="border-b px-8 py-4 flex items-center justify-between bg-background">
                <span className="text-muted-foreground">Preview</span>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4 bg-muted/30 px-4 py-1.5 rounded-full border">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Total Earnings</span>
                            <span className="font-medium">$0.00</span>
                        </div>
                        <div className="w-px h-4 bg-border" />
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Subscribers</span>
                            <span className="font-medium">0</span>
                        </div>
                    </div>
                    <Button variant="outline" className="gap-2 rounded-full">
                        <FileText className="w-4 h-4" />
                        Personalize Page
                    </Button>
                    <Button variant="outline" size="icon" className="rounded-full">
                        <Share2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl mx-auto space-y-8">
                    {/* Profile Section */}
                    <div className="text-center space-y-4">
                        <div className="w-24 h-24 mx-auto rounded-full overflow-hidden border-4 border-white shadow-lg">
                            <img
                                src="https://miaoda-conversation-file.s3cdn.medo.dev/user-7nqges6yla0w/conv-81mqyjlan9xc/20251206/file-81ndgdtyydq8.png"
                                alt="Mitesh Khatri"
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <h1 className="text-2xl font-semibold">Mitesh Khatri</h1>
                    </div>

                    {/* Pay-As-You-Go Pricing */}
                    <div className="bg-muted/10 border rounded-xl p-6 flex items-center justify-between">
                        <div className="space-y-1">
                            <h3 className="font-medium text-lg">Add Pay-As-You-Go Pricing</h3>
                            <p className="text-sm text-muted-foreground">
                                Let users pay per message/minute, allowing them to pay for what they use with no commitment at a low barrier to entry.
                            </p>
                        </div>
                        <Button variant="outline" disabled className="bg-white">
                            Stripe Required
                        </Button>
                    </div>

                    {/* Grid Section */}
                    <div className="grid grid-cols-2 gap-6">
                        {/* Usage Limits */}
                        <div className="border rounded-xl p-6 space-y-6">
                            <div className="space-y-4">
                                <h3 className="font-medium">Usage Limits</h3>
                                <p className="text-sm text-muted-foreground">
                                    You can choose to permit and/or restrict access to your Clone for users who are either logged out or have not purchased a subscription.
                                </p>
                                <Button className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-6">
                                    Edit →
                                </Button>
                            </div>

                            <div className="space-y-3 pt-4 border-t">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">Allowance</span>
                                    <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground hover:bg-muted">
                                        Resets Monthly
                                    </Badge>
                                </div>
                                <div className="space-y-2 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4" />
                                        <span>Unlimited messages</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone className="w-4 h-4" />
                                        <span>100 voice minutes</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stripe Billing */}
                        <div className="border rounded-xl overflow-hidden">
                            <div className="bg-muted/30 px-6 py-3 border-b">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Stripe Billing
                                </span>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="flex items-start gap-2">
                                    <div className="w-2 h-2 mt-2 rounded-full bg-orange-500 shrink-0" />
                                    <div className="space-y-1">
                                        <h4 className="font-medium text-orange-600">Awaiting Further Information</h4>
                                        <p className="text-sm text-muted-foreground">
                                            There is additional information required from you to complete your application.
                                        </p>
                                    </div>
                                </div>
                                <Button className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-6">
                                    Finish Setup →
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManageMonetizationView;
