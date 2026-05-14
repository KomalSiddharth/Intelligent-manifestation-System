import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
    Node,
    Edge,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    MarkerType,
    Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { MindMapNode } from './MindMapBubble';

interface InteractiveMindMapProps {
    data: { root: MindMapNode } | MindMapNode;
    className?: string;
}

// Convert tree structure to ReactFlow nodes and edges
const convertToFlowElements = (node: MindMapNode, parentId: string | null = null, level: number = 0, xOffset: number = 0, yOffset: number = 0, siblingIndex: number = 0): { nodes: Node[]; edges: Edge[] } => {
    const nodeId = `${level}-${xOffset}-${siblingIndex}`;
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Determine node style based on level with vibrant colors
    const colorPalettes = [
        ['#f97316', '#ec4899'], // Orange-Pink gradient (root)
        ['#3b82f6', '#8b5cf6'], // Blue-Purple
        ['#10b981', '#06b6d4'], // Green-Cyan
        ['#f59e0b', '#ef4444'], // Amber-Red
        ['#8b5cf6', '#ec4899'], // Purple-Pink
        ['#06b6d4', '#3b82f6'], // Cyan-Blue
    ];

    const getNodeStyle = (lvl: number, index: number = 0) => {
        if (lvl === 0) {
            return {
                background: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)',
                color: 'white',
                border: '3px solid #f97316',
                borderRadius: '16px',
                padding: '20px 28px',
                fontSize: '17px',
                fontWeight: 'bold',
                minWidth: '220px',
                boxShadow: '0 8px 16px rgba(249, 115, 22, 0.3)',
            };
        } else if (lvl === 1) {
            const palette = colorPalettes[index % colorPalettes.length];
            return {
                background: `linear-gradient(135deg, ${palette[0]} 0%, ${palette[1]} 100%)`,
                color: 'white',
                border: `2px solid ${palette[0]}`,
                borderRadius: '12px',
                padding: '14px 22px',
                fontSize: '15px',
                fontWeight: '600',
                minWidth: '190px',
                boxShadow: `0 4px 12px ${palette[0]}40`,
            };
        } else {
            const palette = colorPalettes[(index + 2) % colorPalettes.length];
            return {
                background: 'white',
                color: '#1f2937',
                border: `2px solid ${palette[0]}`,
                borderRadius: '10px',
                padding: '12px 18px',
                fontSize: '14px',
                minWidth: '170px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            };
        }
    };

    // Create current node
    const currentNode: Node = {
        id: nodeId,
        type: 'default',
        position: { x: xOffset, y: yOffset },
        data: {
            label: (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: node.description ? '4px' : '0' }}>
                        {node.title}
                    </div>
                    {node.description && (
                        <div style={{ fontSize: '11px', opacity: 0.8, lineHeight: '1.4' }}>
                            {node.description}
                        </div>
                    )}
                </div>
            ),
        },
        style: getNodeStyle(level, siblingIndex),
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
    };

    nodes.push(currentNode);

    // Create edge from parent
    if (parentId) {
        const palette = colorPalettes[siblingIndex % colorPalettes.length];
        edges.push({
            id: `${parentId}-${nodeId}`,
            source: parentId,
            target: nodeId,
            type: 'smoothstep',
            animated: level === 1,
            style: { stroke: level === 1 ? palette[0] : '#d1d5db', strokeWidth: 2 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: level === 1 ? palette[0] : '#d1d5db',
            },
        });
    }

    // Process children with vertical spacing
    if (node.children && node.children.length > 0) {
        const childSpacing = 150;
        const totalHeight = (node.children.length - 1) * childSpacing;
        const startY = yOffset - totalHeight / 2;

        node.children.forEach((child, index) => {
            const childY = startY + index * childSpacing;
            const childX = xOffset + 300; // Horizontal spacing
            const childElements = convertToFlowElements(child, nodeId, level + 1, childX, childY, index);
            nodes.push(...childElements.nodes);
            edges.push(...childElements.edges);
        });
    }

    return { nodes, edges };
};

export const InteractiveMindMap: React.FC<InteractiveMindMapProps> = ({ data, className }) => {
    const root = 'root' in data ? (data as any).root : data;

    const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
        return convertToFlowElements(root, null, 0, 0, 0);
    }, [root]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    return (
        <div style={{ width: '700px', height: '600px', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: 'white' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
                attributionPosition="bottom-left"
                minZoom={0.5}
                maxZoom={1.5}
                defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
            >
                <Background color="#f3f4f6" gap={16} />
                <Controls />
            </ReactFlow>
        </div>
    );
};
