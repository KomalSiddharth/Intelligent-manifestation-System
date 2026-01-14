import React from 'react';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
    const renderInlines = (text: string) => {
        // Helper to render Bold and Italic
        const renderRichText = (t: string) => {
            return t.split(/(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*)/g).map((part, i) => {
                if (part.startsWith('***') && part.endsWith('***')) {
                    return <strong key={i} className="font-extrabold italic text-foreground">{part.slice(3, -3)}</strong>;
                }
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith('*') && part.endsWith('*')) {
                    return <em key={i} className="italic text-foreground/80">{part.slice(1, -1)}</em>;
                }
                return part;
            });
        };

        // 1. Parse Links: [Title](URL)
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const elements: React.ReactNode[] = [];
        let lastIndex = 0;
        let match;

        while ((match = linkRegex.exec(text)) !== null) {
            // Push text before link (processed for rich text)
            if (match.index > lastIndex) {
                elements.push(...renderRichText(text.slice(lastIndex, match.index)));
            }

            // Push Link
            elements.push(
                <a
                    key={match.index}
                    href={match[2]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 hover:text-orange-400 font-medium underline decoration-orange-500/30 underline-offset-4 transition-colors"
                >
                    {match[1]}
                </a>
            );

            lastIndex = linkRegex.lastIndex;
        }

        // Push remaining text
        if (lastIndex < text.length) {
            elements.push(...renderRichText(text.slice(lastIndex)));
        }

        return elements.length > 0 ? elements : renderRichText(text);
    };

    const parseContent = (text: string) => {
        if (!text) return null;

        // 1. ELITE PRE-PROCESSING
        // We removed the aggressive list-splitting regexes that were fragmenting titles and colons.
        let processedText = text
            // Force-split numbered lists (e.g. "text 1. Point" or "text.1. Point")
            // Handles optional bold formatting like "**1." 
            .replace(/([.!?])\s*(\**\d+\.)/g, '$1\n\n$2')
            // Force-split bullet points (e.g. "text * Point")
            .replace(/([.!?])\s*([•\-*])\s/g, '$1\n\n$2 ')
            // Clean up bold headings that got merged
            .replace(/([.!?])\s+(\*\*[^*]+\*\*)/g, '$1\n\n$2')
            .replace(/^(##+)\s*([^#\n\s].+?)([A-Z][a-z]{3,}\b|\bHello\b|\bNamaste\b)/gm, '$1 $2\n\n$3')
            .replace(/^(##+)([^\s#])/gm, '$1 $2');

        const rawLines = processedText.split('\n');
        const elements: React.ReactNode[] = [];

        let currentList: React.ReactNode[] = [];
        let listType: 'bullet' | 'number' | null = null;

        const flushList = () => {
            if (currentList.length > 0) {
                const key = `list-${elements.length}`;
                const ListTag = listType === 'number' ? 'ol' : 'ul';
                elements.push(
                    <ListTag
                        key={key}
                        className={`ml-6 mb-4 mt-2 space-y-3 ${listType === 'number' ? 'list-decimal' : 'list-disc'} text-foreground`}
                    >
                        {currentList}
                    </ListTag>
                );
                currentList = [];
                listType = null;
            }
        };

        rawLines.forEach((line, index) => {
            const trimmedLine = line.trim();

            // 0. HANDLE BLANK LINES (CRITICAL FOR SCANNABILITY)
            if (!trimmedLine) {
                // If we are INSIDE a list, we ignore the blank line to maintain the list continuity (1, 2, 3...)
                // instead of breaking it into separate lists (1, 1, 1...)
                if (listType) return;

                flushList();
                // Reduce spacer height from h-4 to h-2 for tighter "1 line" feel
                elements.push(<div key={`spacer-${index}`} className="h-2" />);
                return;
            }

            // 1. HEADINGS
            if (trimmedLine.startsWith('##') && trimmedLine.length < 120) {
                flushList();
                const headingText = trimmedLine.replace(/^##+\s*/, '');
                elements.push(
                    <h2 key={`h-${index}`} className="text-[19px] font-black mt-8 mb-4 text-orange-500 border-b border-orange-500/10 pb-2 tracking-tight">
                        {renderInlines(headingText)}
                    </h2>
                );
                return;
            }

            // 2. LIST items (Bullet or Numbered)
            // Enhanced to catch composite markers like "* 1." or bold numbers "**1.**"
            const isDotNumber = /^[\*\-•]?\s*(\*\*)?\d+\./.test(trimmedLine);
            const isBullet = !isDotNumber && /^[•\-*]/.test(trimmedLine);

            if (isBullet || isDotNumber) {
                const type = isDotNumber ? 'number' : 'bullet';

                // If the type changes, we must flush
                if (listType && listType !== type) flushList();

                listType = type;

                // ROBUST STRIPPING: Removes "1.", "*", "* 1.", "**1.**", "* *", etc.
                let itemText = trimmedLine;

                // Iteratively clean markers from the start until no markers remain
                let prevText = '';
                while (itemText !== prevText) {
                    prevText = itemText;
                    itemText = itemText
                        .replace(/^[•\-*]\s*/, '')
                        .replace(/^(\*\*)?\d+\.\s*/, '')
                        .replace(/^(\*\*)?\s*/, '')
                        .trim();
                }

                // Auto-Bold Fix: "Title:" -> "**Title:**"
                // Also handles messy cases like "**Title:** **" or "Title:**"
                if (itemText.includes(':')) {
                    const colonIndex = itemText.indexOf(':');

                    // Only process as Title if colon is within first 60 chars
                    if (colonIndex < 60) {
                        let potentialTitle = itemText.substring(0, colonIndex);
                        let restOfLine = itemText.substring(colonIndex + 1);

                        // Clean any internal stars from the title text
                        potentialTitle = potentialTitle.replace(/\*\*/g, '').trim();

                        // Clean any "residue" stars immediately after the colon
                        restOfLine = restOfLine.replace(/^\s*\*\*/, '').trim();

                        // Reconstruct cleanly
                        itemText = `**${potentialTitle}:** ${restOfLine}`;
                    }
                }

                // Prevent "Ghost" items (empty lines that look like numbers)
                if (!itemText.trim() || itemText.trim() === '**') return;

                currentList.push(
                    <li key={`li-${index}`} className="text-[16px] leading-relaxed text-foreground pl-1">
                        {renderInlines(itemText)}
                    </li>
                );
                return;
            }

            // 3. REGULAR PARAGRAPH
            // If we hit a standard paragraph, we finally flush the list
            flushList();
            elements.push(
                <p key={`p-${index}`} className="text-[17px] leading-[1.8] mb-6 text-foreground/90 last:mb-0">
                    {renderInlines(trimmedLine)}
                </p>
            );
        });

        flushList();
        return elements;
    };

    return (
        <div className={`markdown-content ${className} selection:bg-orange-500/30 break-words whitespace-pre-wrap leading-[1.6]`}>
            {parseContent(content)}
        </div>
    );
};
