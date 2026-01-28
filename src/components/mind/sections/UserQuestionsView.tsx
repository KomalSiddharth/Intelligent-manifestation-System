import { useState, useEffect } from 'react';
import { MessageSquare, BrainCircuit, Trash2, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { getMessageHistoryForTraining, ingestContent } from '@/db/api';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface UserQuestionsViewProps {
    profileId: string;
}

const UserQuestionsView = ({ profileId }: UserQuestionsViewProps) => {
    console.log("!!!!!!!!!!!! UserQuestionsView MOUNTED with profileId:", profileId);
    const [loading, setLoading] = useState(true);
    const [questions, setQuestions] = useState<any[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const { toast } = useToast();

    useEffect(() => {
        fetchQuestions();
    }, [profileId]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const fetchQuestions = async () => {
        try {
            setLoading(true);
            console.log("🚀 [UserQuestionsView] Fetching questions for profile:", profileId);
            const data = await getMessageHistoryForTraining(profileId);
            console.log("🎯 [UserQuestionsView] Pairs received:", data.length);
            setQuestions(data);
        } catch (error) {
            console.error('Error fetching questions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddToBrain = async (q: any) => {
        try {
            const content = `Question: ${q.question}\n\nAnswer: ${q.answer}`;
            const title = `Q&A: ${q.question.substring(0, 50)}...`;

            await ingestContent(
                title,
                content,
                'text', // Changed from 'manual' to fix type error
                undefined,
                undefined,
                profileId
            );

            toast({
                title: "Added to Brain",
                description: "This Q&A pair has been added to the knowledge base.",
            });

            // Remove from list locally
            setQuestions(prev => prev.filter(item => item.id !== q.id));
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to add to knowledge base.",
                variant: "destructive"
            });
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">AI Learning Review</h2>
                    <p className="text-muted-foreground">
                        Review user questions and AI responses to improve your MiteshAI's brain.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {questions.length > 0 && (
                        <span className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded-full font-medium">
                            {questions.length} Pending
                        </span>
                    )}
                    <Button variant="outline" size="sm" onClick={fetchQuestions}>
                        Refresh
                    </Button>
                </div>
            </div>

            <ScrollArea className="h-[calc(100vh-16rem)]">
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-32 w-full rounded-xl" />
                        ))}
                    </div>
                ) : questions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-xl">
                        <MessageSquare className="h-12 w-12 text-muted-foreground/20 mb-4" />
                        <h3 className="text-lg font-medium">No new Q&A pairs found</h3>
                        <p className="text-sm text-muted-foreground max-w-xs">
                            As users interact with your MiteshAI, their questions will appear here for review.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4 pr-4">
                        {questions.map((q) => {
                            const isExpanded = expandedIds.has(q.id);
                            return (
                                <Card
                                    key={q.id}
                                    className={cn(
                                        "overflow-hidden border-muted-foreground/10 hover:border-orange-200 transition-all duration-200",
                                        isExpanded ? "ring-1 ring-orange-500/20" : ""
                                    )}
                                >
                                    <CardContent className="p-0">
                                        <div className="flex flex-col md:flex-row">
                                            <div
                                                className="flex-1 p-5 space-y-4 cursor-pointer hover:bg-muted/5 transition-colors group"
                                                onClick={() => toggleExpand(q.id)}
                                            >
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2 text-xs font-semibold text-orange-500 uppercase tracking-wider">
                                                            <MessageSquare className="w-3 h-3" />
                                                            User Question
                                                        </div>
                                                        {isExpanded ? (
                                                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        )}
                                                    </div>
                                                    <p className="text-sm font-medium leading-relaxed">
                                                        "{q.question}"
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-500 uppercase tracking-wider">
                                                        <BrainCircuit className="w-3 h-3" />
                                                        AI Response
                                                    </div>
                                                    {q.is_verified && (
                                                        <div className="flex items-center gap-1 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/20">
                                                            <span className="text-[9px] uppercase tracking-wider font-bold text-green-700">
                                                                Verified by Mitesh
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className={cn(
                                                    "text-sm text-muted-foreground leading-relaxed italic transition-all duration-300",
                                                    !isExpanded && "line-clamp-3"
                                                )}>
                                                    "{q.answer}"
                                                </p>
                                                {!isExpanded && q.answer.length > 150 && (
                                                    <span className="text-[10px] text-orange-500 font-medium bg-orange-50 px-1.5 py-0.5 rounded">Read More</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="bg-muted/30 p-5 flex flex-col justify-between border-t md:border-t-0 md:border-l border-muted-foreground/10 min-w-[200px]">
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4 md:mb-0">
                                                <Clock className="w-3 h-3" />
                                                {formatDate(q.created_at)}
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    size="sm"
                                                    className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleAddToBrain(q);
                                                    }}
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                    Teach to Brain
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setQuestions(prev => prev.filter(item => item.id !== q.id));
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Dismiss
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )
                }
            </ScrollArea >
        </div >
    );
};

export default UserQuestionsView;
