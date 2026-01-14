import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, ArrowDownToLine, X, Plus, ChevronRight, Upload, ShoppingBag, FileSpreadsheet, ChevronLeft, Pencil, Trash2 } from 'lucide-react';

interface Product {
    id: string;
    name: string;
    mentions: number;
    enabled: boolean;
    link?: string;
    description?: string;
    keywords?: string[];
    image?: string;
}

const ProductsView = () => {
    const [products, setProducts] = useState<Product[]>([
        {
            id: '1',
            name: "Law of Attraction Workshop",
            mentions: 2,
            enabled: false,
            link: "https://coaching.miteshkhatri.com/aloa-fb-aevent",
            description: "The #1 Reason Law of Attraction Is Not Working For you!\n\nDiscover The Secrets That Can Make Law of Attraction REALLY Work For You To Attract Your Dream Health, Relationships, Career & Abundance!",
            keywords: ["workshop", "How can I", "manifest", "dreams", "attraction"],
            image: "/placeholder-image.png" // In a real app this would be a real URL
        }
    ]);

    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importStep, setImportStep] = useState<'select' | 'csv'>('select');
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const handleEditClick = (product: Product) => {
        setEditingProduct(product);
        setIsEditOpen(true);
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background overflow-auto">
            <div className="p-8 max-w-7xl mx-auto w-full space-y-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-semibold">Products</h1>
                    <div className="flex items-center gap-3">
                        <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="gap-2 rounded-full" onClick={() => setImportStep('select')}>
                                    Import
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[600px]">
                                {importStep === 'select' ? (
                                    <>
                                        <DialogHeader>
                                            <DialogTitle>Import Products</DialogTitle>
                                        </DialogHeader>
                                        <div className="space-y-4 py-4">
                                            <div className="border rounded-xl p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                                        <ShoppingBag className="w-5 h-5" />
                                                    </div>
                                                    <span className="font-medium">Import from Shopify</span>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                                            </div>
                                            <div
                                                className="border rounded-xl p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer transition-colors group"
                                                onClick={() => setImportStep('csv')}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600">
                                                        <FileSpreadsheet className="w-5 h-5" />
                                                    </div>
                                                    <span className="font-medium">Import from CSV</span>
                                                </div>
                                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <DialogHeader>
                                            <div className="flex items-center gap-2">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 -ml-2" onClick={() => setImportStep('select')}>
                                                    <ChevronLeft className="w-4 h-4" />
                                                </Button>
                                                <DialogTitle>Import Products</DialogTitle>
                                            </div>
                                        </DialogHeader>
                                        <div className="space-y-6 py-4">
                                            <div className="flex gap-4">
                                                <div className="flex-none w-8 h-8 rounded-full bg-muted flex items-center justify-center font-medium text-sm">1</div>
                                                <div className="space-y-1">
                                                    <h3 className="font-medium">Import from CSV</h3>
                                                    <p className="text-sm text-muted-foreground">
                                                        Download our template or use your own spreadsheet. Your header row must include: product title, image URL (optional), Description, Keywords (separated by commas).
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-none w-8 h-8 rounded-full bg-muted flex items-center justify-center font-medium text-sm">2</div>
                                                <div className="space-y-1">
                                                    <h3 className="font-medium">Upload the file</h3>
                                                    <p className="text-sm text-muted-foreground">we'll check it right away</p>
                                                </div>
                                            </div>
                                        </div>
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
                                            <Button className="bg-black text-white hover:bg-black/90">Upload CSV</Button>
                                        </DialogFooter>
                                    </>
                                )}
                            </DialogContent>
                        </Dialog>

                        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                            <DialogTrigger asChild>
                                <Button className="bg-black text-white hover:bg-black/90 rounded-full px-6" onClick={() => {
                                    setEditingProduct(null);
                                    setIsEditOpen(true);
                                }}>
                                    Add Product
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>{editingProduct ? 'Edit Affiliate Product' : 'Add Affiliate Product'}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-6 py-4">
                                    <div className="space-y-2">
                                        <Label>Product Image</Label>
                                        <div className="w-24 h-24 border rounded-lg flex items-center justify-center relative group cursor-pointer bg-muted/10">
                                            {editingProduct?.image ? (
                                                <>
                                                    <img src="https://github.com/shadcn.png" alt="Product" className="w-full h-full object-cover rounded-lg" />
                                                    <div className="absolute -top-2 -right-2 bg-white rounded-full shadow-sm p-0.5 cursor-pointer hover:bg-red-50">
                                                        <X className="w-4 h-4 text-red-500" />
                                                    </div>
                                                </>
                                            ) : (
                                                <Upload className="w-6 h-6 text-muted-foreground" />
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Product Name</Label>
                                        <Input defaultValue={editingProduct?.name} className="border-blue-500 ring-1 ring-blue-500" />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Link</Label>
                                        <Input defaultValue={editingProduct?.link} />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Description</Label>
                                        <Textarea defaultValue={editingProduct?.description} className="min-h-[100px]" />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Keywords</Label>
                                        <div className="space-y-3">
                                            <div className="relative">
                                                <Input placeholder="Enter Text" className="pr-10" />
                                                <Button size="icon" variant="ghost" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8">
                                                    <Plus className="w-4 h-4" />
                                                </Button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {editingProduct?.keywords?.map((keyword, i) => (
                                                    <div key={i} className="bg-muted px-3 py-1 rounded-full text-sm flex items-center gap-2">
                                                        {keyword}
                                                        <X className="w-3 h-3 cursor-pointer hover:text-red-500" />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <Label>When to promote</Label>
                                        <div className="grid grid-cols-3 gap-4">
                                            <Button variant="outline" className="h-auto py-3 justify-center font-normal">
                                                Every Mention
                                            </Button>
                                            <Button variant="outline" className="h-auto py-3 justify-center font-normal">
                                                Once Per User
                                            </Button>
                                            <Button variant="outline" className="h-auto py-3 justify-center font-normal border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-50 hover:text-blue-700">
                                                Once Per Conversation
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="ghost" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                                    <Button className="bg-black text-white hover:bg-black/90">
                                        {editingProduct ? 'Edit Product' : 'Add Product'}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Table */}
                <div className="border rounded-lg overflow-hidden">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow>
                                <TableHead className="w-[70%]">Product Name</TableHead>
                                <TableHead>Mentions <ArrowDownToLine className="w-3 h-3 inline-block ml-1" /></TableHead>
                                <TableHead className="text-right"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.map((product) => (
                                <TableRow key={product.id}>
                                    <TableCell>
                                        <span className="font-medium">{product.name}</span>
                                    </TableCell>
                                    <TableCell>{product.mentions}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-4">
                                            <Switch
                                                checked={product.enabled}
                                                onCheckedChange={(checked) => {
                                                    setProducts(products.map(p =>
                                                        p.id === product.id ? { ...p, enabled: checked } : p
                                                    ));
                                                }}
                                            />
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="w-4 h-4 text-muted-foreground" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleEditClick(product)}>
                                                        <Pencil className="w-4 h-4 mr-2" />
                                                        Edit
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem className="text-red-600">
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {products.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                                        No products found
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
};

export default ProductsView;
