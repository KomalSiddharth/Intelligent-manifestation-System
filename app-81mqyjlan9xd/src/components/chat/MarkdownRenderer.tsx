import React from 'react';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
    const renderInlines = (text: string) => {
        // Turn bare URLs into markdown links so Enroll/register links are clickable.
        // IMPORTANT: skip URLs already inside []() markdown syntax to avoid double-processing.
        // Strategy: replace existing []() links with placeholders, auto-link bare URLs, restore.
        const placeholders: string[] = [];
        const withPlaceholders = text.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            (match) => {
                const idx = placeholders.length;
                placeholders.push(match);
                return `\x00LINK${idx}\x00`;
            }
        );

        const withAutoLinks = withPlaceholders
            .replace(
                /(^|[\s(])((https?:\/\/[^\s<>"')\]]+))/gi,
                (_, pre, url) => `${pre}[${url}](${url})`
            )
            // Restore original []() links
            .replace(/\x00LINK(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]);

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

        while ((match = linkRegex.exec(withAutoLinks)) !== null) {
            // Push text before link (processed for rich text)
            if (match.index > lastIndex) {
                elements.push(...renderRichText(withAutoLinks.slice(lastIndex, match.index)));
            }

            // Ensure URL is absolute — GPT sometimes omits https:// prefix which
            // causes React Router to treat the link as an internal relative route.
            const rawHref = match[2].trim();
            const safeHref = /^https?:\/\//i.test(rawHref)
                ? rawHref
                : `https://${rawHref}`;

            // Push Link
            elements.push(
                <a
                    key={match.index}
                    href={safeHref}
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
        if (lastIndex < withAutoLinks.length) {
            elements.push(...renderRichText(withAutoLinks.slice(lastIndex)));
        }

        return elements.length > 0 ? elements : renderRichText(withAutoLinks);
    };

    const parseContent = (text: string) => {
        if (!text) return null;

        // 1. PRE-PROCESSING
        let processedText = text
            // Force-split numbered lists (e.g. "text 1. Point" or "text.1. Point")
            .replace(/([.!?])\s*(\**\d+\.)/g, '$1\n\n$2')
            // Force-split bullet points (e.g. "text * Point")
            .replace(/([.!?])\s*([•\-*])\s/g, '$1\n\n$2 ')
            // Clean up bold headings that got merged
            .replace(/([.!?])\s+(\*\*[^*]+\*\*)/g, '$1\n\n$2')
            .replace(/^(##+)\s*([^#\n\s].+?)(?<=[a-z])([A-Z][a-z]{3,}\b|\bHello\b|\bNamaste\b)/gm, '$1 $2\n\n$3')
            .replace(/^(##+)([^\s#])/gm, '$1 $2');

        const rawLines = processedText.split('\n');
        const elements: React.ReactNode[] = [];

        let currentList: React.ReactNode[] = [];
        let listType: 'bullet' | 'number' | 'emoji' | null = null;

        const flushList = () => {
            if (currentList.length > 0) {
                const key = `list-${elements.length}`;
                if (listType === 'number') {
                    elements.push(
                        <ol key={key} className="ml-5 mb-2 mt-1 space-y-1 list-decimal text-foreground">
                            {currentList}
                        </ol>
                    );
                } else if (listType === 'emoji') {
                    // emoji bullets — no extra disc marker, left-aligned, tight spacing
                    elements.push(
                        <ul key={key} className="ml-1 mb-2 mt-1 space-y-1 list-none text-foreground">
                            {currentList}
                        </ul>
                    );
                } else {
                    elements.push(
                        <ul key={key} className="ml-5 mb-2 mt-1 space-y-1 list-disc text-foreground">
                            {currentList}
                        </ul>
                    );
                }
                currentList = [];
                listType = null;
            }
        };

        rawLines.forEach((line, index) => {
            const trimmedLine = line.trim();

            // 0. HANDLE BLANK LINES
            if (!trimmedLine) {
                // Inside a list — ignore blank lines to keep list continuity
                if (listType) return;

                flushList();
                // Tight single-line spacer between paragraphs
                elements.push(<div key={`spacer-${index}`} className="h-1" />);
                return;
            }

            // 1. HEADINGS
            if (trimmedLine.startsWith('##') && trimmedLine.length < 120) {
                flushList();
                const headingText = trimmedLine.replace(/^##+\s*/, '');
                elements.push(
                    <h2 key={`h-${index}`} className="text-[18px] font-black mt-5 mb-2 text-orange-500 border-b border-orange-500/10 pb-1.5 tracking-tight">
                        {renderInlines(headingText)}
                    </h2>
                );
                return;
            }

            // 2. LIST items
            // a) Numbered
            const isDotNumber = /^[\*\-•]?\s*(\*\*)?\d+\./.test(trimmedLine);
            // b) Emoji bullets: ✅ ☑ ✓ ✔ 🔹 🔸 → ➤ ▸ ● ◆
            const isEmojiBullet = !isDotNumber && /^[✅☑✓✔️\u{1F539}\u{1F538}\u{1F7E2}\u{1F535}→➤▸►◆●]/u.test(trimmedLine);
            // c) Classic bullet chars
            const isBullet = !isDotNumber && !isEmojiBullet && /^[•\-*]/.test(trimmedLine);

            if (isEmojiBullet) {
                if (listType && listType !== 'emoji') flushList();
                listType = 'emoji';
                // Keep the full line including the emoji — it IS the visual marker
                currentList.push(
                    <li key={`li-${index}`} className="text-[15px] leading-snug text-foreground pl-1">
                        {renderInlines(trimmedLine)}
                    </li>
                );
                return;
            }

            if (isBullet || isDotNumber) {
                const type = isDotNumber ? 'number' : 'bullet';
                if (listType && listType !== type) flushList();
                listType = type;

                // ROBUST STRIPPING: Removes "1.", "*", "* 1.", "**1.**", etc.
                let itemText = trimmedLine;
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
                if (itemText.includes(':')) {
                    const colonIndex = itemText.indexOf(':');
                    if (colonIndex < 60) {
                        let potentialTitle = itemText.substring(0, colonIndex).replace(/\*\*/g, '').trim();
                        let restOfLine = itemText.substring(colonIndex + 1).replace(/^\s*\*\*/, '').trim();
                        itemText = `**${potentialTitle}:** ${restOfLine}`;
                    }
                }

                if (!itemText.trim() || itemText.trim() === '**') return;

                currentList.push(
                    <li key={`li-${index}`} className="text-[15px] leading-snug text-foreground pl-1">
                        {renderInlines(itemText)}
                    </li>
                );
                return;
            }

            // 3. REGULAR PARAGRAPH — flush any open list first
            flushList();
            elements.push(
                <p key={`p-${index}`} className="text-[16px] leading-[1.65] mb-2 text-foreground/90 last:mb-0">
                    {renderInlines(trimmedLine)}
                </p>
            );
        });

        flushList();
        return elements;
    };

    return (
        <div className={`markdown-content ${className} selection:bg-orange-500/30 break-words whitespace-pre-wrap leading-[1.5]`}>
            {parseContent(content)}
        </div>
    );
};
