import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, X, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addAudienceMember } from "@/db/api";

interface AddSingleUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId?: string;
  onUserAdded?: () => void;
}

export default function AddSingleUserDialog({ open, onOpenChange, profileId, onUserAdded }: AddSingleUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: "Name required", description: "Please enter the user's name.", variant: "destructive" });
      return;
    }
    if (!email.trim()) {
      toast({ title: "Email required", description: "Please enter the user's email address.", variant: "destructive" });
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast({ title: "Invalid email", description: "Please enter a valid email address.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await addAudienceMember({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        tags: [],
        message_count: 0,
        last_active: new Date().toISOString(),
      }, profileId);

      toast({ title: "User added!", description: `${name.trim()} (${email.trim()}) has been added to the audience.` });

      if (onUserAdded) onUserAdded();
      setName("");
      setEmail("");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error adding user:", error);
      toast({ title: "Error", description: error?.message || "Failed to add user. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setName("");
    setEmail("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="sr-only">Back</span>
            </button>
            <DialogTitle className="text-xl font-semibold">Add Single User</DialogTitle>
          </div>
          <button
            onClick={handleCancel}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="user-name" className="text-sm font-medium">Full Name</Label>
            <Input
              id="user-name"
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-email" className="text-sm font-medium">Email Address</Label>
            <Input
              id="user-email"
              type="email"
              placeholder="e.g. rahul@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim() || !email.trim()}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
          >
            <UserPlus className="h-4 w-4" />
            {isSubmitting ? "Adding..." : "Add User"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
