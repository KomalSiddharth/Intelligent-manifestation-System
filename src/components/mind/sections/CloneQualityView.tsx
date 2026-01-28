import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, CheckCircle2, ChevronDown, Trash2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";

import { MindProfile } from '@/types/types';

interface CloneQualityViewProps {
    profileId: string;
    initialData?: MindProfile;
}

const CloneQualityView = ({ profileId, initialData }: CloneQualityViewProps) => {
    const [tasks] = useState([
        { id: 1, text: "Add Purpose to your Clone", completed: true },
        { id: 2, text: "Add a Description for your Clone", completed: true },
        { id: 3, text: "Train your Clone's Style", completed: true },
        { id: 4, text: "Add Clone Voice", completed: true },
        { id: 5, text: "Add a Headline to your Clone", completed: true },
        { id: 6, text: "Add Topics to your Clone", completed: true },
        { id: 7, text: "Add a Profile Picture to your Clone", completed: true },
        { id: 8, text: "Link your social media to your Clone", completed: true },
    ]);

    const [requirements] = useState([
        { id: 1, text: "Knowledge of 's Signature Programs and Content", status: 'good' },
        { id: 2, text: "Comprehensive Understanding of Leadership Training Techniques", status: 'good' },
        { id: 3, text: "Expertise in the Law of Attraction Principles", status: 'good' },
        { id: 4, text: "Knowledge of Educational and Training Program Development", status: 'good' },
        { id: 5, text: "Proficiency in Identifying and Addressing Individual Needs", status: 'good' },
        { id: 6, text: "Ability to Communicate in an Authentic and Engaging Manner", status: 'good' },
        { id: 7, text: "Insights into Wealth Creation and Financial Mastery", status: 'good' },
        { id: 8, text: "Familiarity with Coaching Frameworks and Techniques", status: 'good' },
        { id: 9, text: "In-depth Knowledge of Personal Transformation Strategies", status: 'good' },
        { id: 10, text: "Expertise in Wellness and Holistic Health Practices", status: 'good' },
        { id: 11, text: "Understanding of Relationship Building and Mastery", status: 'good' },
        { id: 12, text: "Understanding of Entrepreneurship and Business Development", status: 'good' },
        { id: 13, text: "Proficiency in Psychology and Behavioral Change", status: 'good' },
    ]);

    return (
        <div className="max-w-5xl mx-auto p-8 space-y-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <span>Mind</span>
                <span>›</span>
                <span className="font-medium text-foreground">Clone Quality</span>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground">Clone Quality</h2>
                    <div className="flex items-center gap-2 text-2xl font-bold text-orange-500">
                        <Sparkles className="w-6 h-6" />
                        <span>Legendary</span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="flex gap-0.5 h-4 w-full overflow-hidden">
                    {Array.from({ length: 100 }).map((_, i) => (
                        <div
                            key={i}
                            className={cn(
                                "w-1 h-full rounded-full",
                                i < 92 ? "bg-orange-500" : "bg-muted"
                            )}
                        />
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border border-muted-foreground/50" style={{ clipPath: 'polygon(50% 0%, 50% 100%, 100% 50%)' }} />
                    <h3 className="font-medium">Clone Setup Tasks</h3>
                </div>
                <div className="border rounded-lg divide-y bg-card">
                    {tasks.map((task) => (
                        <div key={task.id} className="p-4 flex items-center justify-between hover:bg-muted/5 transition-colors">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-orange-500 fill-orange-100" />
                                <span className="font-medium">{task.text}</span>
                            </div>
                            <span className="text-sm text-muted-foreground">Done</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-muted-foreground" />
                        <h3 className="font-medium">Training Data Requirements</h3>
                    </div>
                    <Button className="bg-black text-white hover:bg-black/90 rounded-full h-8 text-xs">
                        Add Requirement
                    </Button>
                </div>
                <div className="border rounded-lg divide-y bg-card">
                    {requirements.map((req) => (
                        <div key={req.id} className="p-4 flex items-center justify-between hover:bg-muted/5 transition-colors group">
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-muted-foreground w-6 text-center">{req.id}</span>
                                <span className="font-medium">{req.text}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Circle className="w-4 h-4 text-green-500 fill-transparent" />
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-4 pt-8">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 flex flex-col justify-between py-0.5">
                        <div className="h-0.5 w-full bg-muted-foreground" />
                        <div className="h-0.5 w-full bg-muted-foreground" />
                        <div className="h-0.5 w-full bg-muted-foreground" />
                    </div>
                    <h3 className="font-medium">Frequently Asked Questions</h3>
                </div>
                <Accordion type="single" collapsible className="w-full border rounded-lg bg-card">
                    <AccordionItem value="item-1" className="border-b px-4">
                        <AccordionTrigger className="hover:no-underline py-4">What is Clone Quality?</AccordionTrigger>
                        <AccordionContent>
                            Clone Quality is a measure of how well your clone is set up and trained.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-2" className="border-b px-4">
                        <AccordionTrigger className="hover:no-underline py-4">What are Clone Requirements?</AccordionTrigger>
                        <AccordionContent>
                            Requirements help ensure your clone has specific knowledge in key areas.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value="item-3" className="px-4 border-none">
                        <AccordionTrigger className="hover:no-underline py-4">How can I improve my score?</AccordionTrigger>
                        <AccordionContent>
                            Complete setup tasks and add more high-quality training data.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </div>
        </div>
    );
};

export default CloneQualityView;
