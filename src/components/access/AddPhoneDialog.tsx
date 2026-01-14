import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Phone, X } from 'lucide-react';

interface AddPhoneDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export default function AddPhoneDialog({ open, onOpenChange }: AddPhoneDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] p-8 overflow-hidden bg-white rounded-3xl shadow-xl">
                <button
                    onClick={() => onOpenChange(false)}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>

                <div className="space-y-6">
                    {/* Icon */}
                    <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white">
                        <Phone className="w-6 h-6" />
                    </div>

                    {/* Content */}
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold tracking-tight">Give your clone a Phone Number</h2>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Enable SMS interactions with your clone. Users can text or call this number to chat with your Clone directly from their phones.
                            <br />
                            Each instance of your clone can be associated with only one phone number.
                        </p>
                    </div>

                    {/* Action */}
                    <Button
                        className="w-full h-12 bg-[#1A1A1A] hover:bg-black text-white font-medium rounded-full mt-4 text-base"
                        onClick={() => onOpenChange(false)}
                    >
                        Get Phone Number
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
