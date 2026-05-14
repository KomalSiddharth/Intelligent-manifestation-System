import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addAudienceMember } from "@/db/api";

interface InviteByEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId?: string;
  onUserAdded?: () => void;
}

export default function InviteByEmailDialog({ open, onOpenChange, profileId, onUserAdded }: InviteByEmailDialogProps) {
  const [emails, setEmails] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleAddEmail = () => {
    setEmails([...emails, ""]);
  };

  const handleEmailChange = (index: number, value: string) => {
    const newEmails = [...emails];
    newEmails[index] = value;
    setEmails(newEmails);
  };

  const handleRemoveEmail = (index: number) => {
    if (emails.length > 1) {
      const newEmails = emails.filter((_, i) => i !== index);
      setEmails(newEmails);
    }
  };

  const handleSubmit = async () => {
    const validEmails = emails.filter(email => email.trim() !== "");

    if (validEmails.length === 0) {
      toast({
        title: "No emails provided",
        description: "Please enter at least one email address.",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = validEmails.filter(email => !emailRegex.test(email));

    if (invalidEmails.length > 0) {
      toast({
        title: "Invalid email format",
        description: "Please check the email addresses and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Add each email to the database
      const promises = validEmails.map(email =>
        addAudienceMember({
          name: email.split("@")[0],
          email: email,
          tags: [],
          message_count: 0,
          last_active: new Date().toISOString(),
        }, profileId)
      );

      await Promise.all(promises);

      toast({
        title: "Success",
        description: `${validEmails.length} user(s) added successfully. Email invites will be sent in the background.`,
      });

      if (onUserAdded) onUserAdded();
      setEmails([""]);
      onOpenChange(false);
    } catch (error) {
      console.error("Error inviting users:", error);
      toast({
        title: "Error",
        description: "Failed to send invites. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setEmails([""]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="sr-only">Back</span>
            </button>
            <DialogTitle className="text-xl font-semibold">
              Invite Audience Members
            </DialogTitle>
          </div>
          <button
            onClick={handleCancel}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {emails.map((email, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => handleEmailChange(index, e.target.value)}
                className="flex-1"
              />
              {emails.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveEmail(index)}
                  className="flex-shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={handleAddEmail}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add another email
          </Button>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-muted-foreground hover:bg-muted-foreground/90 text-white"
          >
            {isSubmitting ? "Sending..." : "Send user invite(s)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
