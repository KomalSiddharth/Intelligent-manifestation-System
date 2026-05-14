import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Define the structure of a Mind Map Node
export interface MindMapNode {
    title: string;
    description?: string;
    children?: MindMapNode[];
}

interface MindMapBubbleProps {
    data: { root: MindMapNode } | MindMapNode;
    className?: string;
}

const TreeNode = ({ node, level = 0 }: { node: MindMapNode; level?: number }) => {
    const [isOpen, setIsOpen] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div className="flex flex-col">
            <div
                className={cn(
                    "flex flex-col gap-1 py-2 px-3 rounded-lg transition-colors cursor-pointer select-none border border-orange-200/30",
                    "hover:bg-white/10"
                )}
                style={{ marginLeft: `${level * 16}px` }}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2">
                    {hasChildren ? (
                        <div className="w-5 h-5 flex items-center justify-center bg-orange-100 rounded-full text-orange-600">
                            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </div>
                    ) : (
                        <div className="w-5 h-5 flex items-center justify-center">
                            <Circle className="w-2 h-2 fill-orange-400 text-orange-400" />
                        </div>
                    )}

                    <span className={cn(
                        "font-semibold",
                        level === 0 && "text-base bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent uppercase tracking-wide",
                        level === 1 && "text-sm text-orange-600",
                        level > 1 && "text-xs text-foreground"
                    )}>
                        {node.title}
                    </span>
                </div>

                {node.description && (
                    <p className="text-xs text-muted-foreground ml-7 leading-relaxed">
                        {node.description}
                    </p>
                )}
            </div>

            {isOpen && hasChildren && (
                <div className="relative ml-2 pl-2 border-l border-orange-200/50">
                    {node.children!.map((child, idx) => (
                        <TreeNode key={idx} node={child} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
};

export const MindMapBubble: React.FC<MindMapBubbleProps> = ({ data, className }) => {
    const root = 'root' in data ? (data as any).root : data;

    return (
        <div className={cn(
            "w-full max-w-md bg-background/50 backdrop-blur-sm border rounded-2xl p-4 shadow-sm",
            "border-orange-100 dark:border-orange-900/20",
            className
        )}>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-dashed border-muted-foreground/20">
                <span className="text-xl">🧠</span>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mind Map</span>
            </div>

            <TreeNode node={root} />
        </div>
    );
};
