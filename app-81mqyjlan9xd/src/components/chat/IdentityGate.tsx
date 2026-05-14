import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { verifyAudienceAccess, ensureUserFact } from '@/db/api';
import { supabase } from '@/db/supabase';

import { Lock, ArrowRight, ShieldCheck, Mail, ChevronLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from "@/components/ui/input-otp";

interface IdentityGateProps {
    onVerified: (user: any) => void;
    profileId?: string;
    children: React.ReactNode;
}

export default function IdentityGate({ onVerified, profileId, children }: IdentityGateProps) {
    const [email, setEmail] = useState('');
    const [otpValue, setOtpValue] = useState('');
    const [step, setStep] = useState<'email' | 'otp'>('email');
    const [isLoading, setIsLoading] = useState(true);
    const [isVerified, setIsVerified] = useState(false);
    const [tempUser, setTempUser] = useState<any>(null);

    console.log("🔒 IdentityGate State:", { isVerified, isLoading, step });
    const { toast } = useToast();

    // Development mode flag - set to true to bypass OTP
    const DEV_MODE = import.meta.env.DEV; // Automatically true in development

    // Lifecycle Debugging
    useEffect(() => {
        console.log("🔒 [IDENTITY_GATE] Mounted");
        return () => console.log("🔒 [IDENTITY_GATE] Unmounting!");
    }, []);

    // Check for existing session
    useEffect(() => {
        // If already verified, don't trigger a blocking reload that unmounts children
        if (isVerified) {
            console.log("🔒 [IDENTITY_GATE] Already verified, skipping blocking check.");
            setIsLoading(false);
            return;
        }

        const storedEmail = localStorage.getItem('chat_user_email');
        if (storedEmail) {
            handleFastVerify(storedEmail);
        } else {
            setIsLoading(false);
        }
    }, [profileId, isVerified]); // Added isVerified to deps but guarded inside


    // Fast verify for existing sessions (skip OTP if already logged in)
    async function handleFastVerify(emailToVerify: string) {
        try {
            const user = await verifyAudienceAccess(emailToVerify, profileId);
            if (user) {
                setIsVerified(true);
                onVerified(user);
            } else {
                localStorage.removeItem('chat_user_email');
            }
        } catch (error) {
            console.error("Fast verification failed", error);
        } finally {
            setIsLoading(false);
        }
    }

    async function handleStartVerification(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) return;

        const normalizedEmail = email.trim().toLowerCase();
        setIsLoading(true);
        try {
            // 1. Check if email is in audience list
            const user = await verifyAudienceAccess(normalizedEmail, profileId);

            if (user) {
                console.log("Requesting OTP for authorized email:", normalizedEmail);
                // 2. Trigger Supabase OTP
                const { error } = await supabase.auth.signInWithOtp({
                    email: normalizedEmail,
                    options: {
                        shouldCreateUser: true,
                        emailRedirectTo: window.location.href, // Redirect back to this exact page/widget
                    }
                });

                if (error) throw error;

                // Development mode bypass - skip OTP step
                if (DEV_MODE) {
                    console.log("🔧 DEV MODE: Bypassing OTP verification");
                    setTempUser(user);
                    // Directly verify without OTP
                    await handleDevModeVerify(user, normalizedEmail);
                    return;
                }

                setTempUser(user);
                setStep('otp');
                toast({
                    title: "OTP Sent",
                    description: "Please check your email for the 8-digit verification code.",
                });
            } else {
                toast({
                    title: "Access Denied",
                    description: "This email is not in the allowed audience list. Please contact the owner.",
                    variant: "destructive"
                });
            }
        } catch (error: any) {
            console.error("Verification start failed", error);
            toast({
                title: "Error",
                description: error.message || "Could not start verification. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    }

    async function handleVerifyOtp() {
        if (otpValue.length !== 8) return;

        const normalizedEmail = email.trim().toLowerCase();
        console.log("Starting OTP verification process for:", normalizedEmail, "Code:", otpValue);

        setIsLoading(true);
        try {
            const verificationTypes: ('email' | 'signup' | 'magiclink' | 'invite' | 'recovery')[] = [
                'email',
                'signup',
                'magiclink',
                'invite',
                'recovery'
            ];

            let finalResult: any = null;

            for (const type of verificationTypes) {
                console.log(`Attempting verification with type: '${type}'...`);
                const result = await supabase.auth.verifyOtp({
                    email: normalizedEmail,
                    token: otpValue,
                    type: type,
                });

                if (!result.error) {
                    console.log(`SUCCESS with type: '${type}'!`);
                    finalResult = result;
                    break;
                } else {
                    console.warn(`Type '${type}' failed:`, result.error.message);
                    finalResult = result; // Keep the last error if none succeed
                }
            }

            if (finalResult.error) {
                console.error("All verification attempts failed. Last error:", finalResult.error);
                throw finalResult.error;
            }

            const { data } = finalResult;
            console.log("OTP verified successfully! Data:", data);

            if (tempUser) {
                // Success
                localStorage.setItem('chat_user_email', normalizedEmail);

                // 1. Link Supabase Auth ID if not already linked
                let stableId = tempUser.user_id;
                const authUserId = data.user?.id;

                if (authUserId && !tempUser.user_id) {
                    console.log("🔗 Linking Auth ID to Audience User:", authUserId);
                    try {
                        const { supabase } = await import('@/db/supabase');
                        await supabase
                            .from('audience_users')
                            .update({ user_id: authUserId })
                            .eq('id', tempUser.id);
                        stableId = authUserId;
                    } catch (err) {
                        console.error("Failed to link Auth ID:", err);
                    }
                }

                if (!stableId) stableId = tempUser.id;

                // 2. Migration: Claim Guest Chats
                const guestId = localStorage.getItem('chat_user_id');
                if (guestId && guestId !== stableId) {
                    console.log("🚚 Migrating guest chats via API:", { from: guestId, to: stableId });
                    try {
                        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-engine`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${sessionStorage.getItem('sb-access-token') || import.meta.env.VITE_SUPABASE_ANON_KEY}`
                            },
                            body: JSON.stringify({
                                action: 'migrate_history',
                                guestId: guestId,
                                userId: stableId
                            })
                        });

                        const result = await response.json();
                        if (result.success) {
                            console.log("✅ History migrated successfully");
                        } else {
                            console.warn("Migration API returned error:", result.error);
                        }
                    } catch (err) {
                        console.error("Migration failed:", err);
                    }
                }

                if (stableId) {
                    localStorage.setItem('chat_user_id', stableId);
                    await ensureUserFact(stableId, 'name', tempUser.name, profileId);
                }

                setIsVerified(true);
                onVerified({ ...tempUser, user_id: stableId });
                toast({
                    title: "Identity Verified",
                    description: `Welcome, ${tempUser.name}!`,
                });
            }
        } catch (error: any) {
            console.error("OTP verification final catch:", error);
            toast({
                title: "Verification Failed",
                description: error.message || "The OTP you entered is incorrect or has expired.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    }

    // Development mode verification bypass
    async function handleDevModeVerify(user: any, normalizedEmail: string) {
        try {
            localStorage.setItem('chat_user_email', normalizedEmail);
            const stableId = user.user_id || user.id;

            // Migration: Claim Guest Chats
            const guestId = localStorage.getItem('chat_user_id');
            if (guestId && guestId !== stableId) {
                console.log("🚚 DEV MODE: Migrating guest chats via API:", { from: guestId, to: stableId });
                try {
                    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-engine`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                        },
                        body: JSON.stringify({
                            action: 'migrate_history',
                            guestId: guestId,
                            userId: stableId
                        })
                    });
                    const result = await response.json();
                    if (result.success) {
                        console.log("✅ History migrated successfully");
                    }
                } catch (err) {
                    console.error("Migration failed:", err);
                }
            }

            if (stableId) {
                localStorage.setItem('chat_user_id', stableId);
                await ensureUserFact(stableId, 'name', user.name, profileId);
            }

            setIsVerified(true);
            onVerified({ ...user, user_id: stableId });
            toast({
                title: "🔧 Dev Mode: Auto-Verified",
                description: `Welcome, ${user.name}! (OTP bypassed)`,
            });
        } catch (error) {
            console.error("Dev mode verification error:", error);
        } finally {
            setIsLoading(false);
        }
    }

    if (isLoading && step === 'email' && !isVerified) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            </div>
        );
    }

    if (isVerified) {
        return <>{children}</>;
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4 font-sans">
            <Card className="w-full max-w-md border-orange-100 shadow-2xl overflow-hidden rounded-2xl">
                <div className="h-2 bg-gradient-to-r from-orange-400 to-pink-500" />
                <CardHeader className="text-center space-y-2 pb-2 mt-4">
                    <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-2 border-2 border-orange-100 shadow-inner">
                        {step === 'email' ? (
                            <Mail className="w-10 h-10 text-orange-500" />
                        ) : (
                            <ShieldCheck className="w-10 h-10 text-orange-600" />
                        )}
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
                        {step === 'email' ? 'Private Access' : 'Verify Identity'}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground px-4 text-center">
                        {step === 'email'
                            ? "Enter your email to receive a secure access code."
                            : (
                                <div className="space-y-2">
                                    <p>We've sent an 8-digit code to <span className="text-foreground font-medium">{email}</span></p>
                                    <p className="text-xs text-amber-600 bg-amber-50 py-1 px-2 rounded-md border border-amber-100 italic">
                                        <b>Warning:</b> Mail mein aaye link par click na karein, sirf 8-digit code niche dalein.
                                    </p>
                                </div>
                            )}
                    </CardDescription>
                </CardHeader>

                <CardContent className="p-8">
                    {step === 'email' ? (
                        <form onSubmit={handleStartVerification} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-foreground ml-1 opacity-80">Email Address</label>
                                <Input
                                    type="email"
                                    placeholder="name@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="h-12 border-gray-200 focus-visible:ring-orange-500 rounded-xl transition-all shadow-sm"
                                    required
                                />
                            </div>
                            <Button
                                type="submit"
                                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                disabled={isLoading}
                            >
                                {isLoading ? 'Sending Code...' : 'Send Access Code'}
                                {!isLoading && <ArrowRight className="w-5 h-5" />}
                            </Button>
                        </form>
                    ) : (
                        <div className="space-y-8 flex flex-col items-center">
                            <div className="space-y-4 w-full flex flex-col items-center">
                                <InputOTP
                                    maxLength={8}
                                    value={otpValue}
                                    onChange={(value) => setOtpValue(value)}
                                    disabled={isLoading}
                                    autoFocus
                                >
                                    <InputOTPGroup className="gap-1.5">
                                        <InputOTPSlot index={0} className="w-10 h-12 text-lg font-bold rounded-lg border-gray-200 shadow-sm" />
                                        <InputOTPSlot index={1} className="w-10 h-12 text-lg font-bold rounded-lg border-gray-200 shadow-sm" />
                                        <InputOTPSlot index={2} className="w-10 h-12 text-lg font-bold rounded-lg border-gray-200 shadow-sm" />
                                        <InputOTPSlot index={3} className="w-10 h-12 text-lg font-bold rounded-lg border-gray-200 shadow-sm" />
                                        <InputOTPSlot index={4} className="w-10 h-12 text-lg font-bold rounded-lg border-gray-200 shadow-sm" />
                                        <InputOTPSlot index={5} className="w-10 h-12 text-lg font-bold rounded-lg border-gray-200 shadow-sm" />
                                        <InputOTPSlot index={6} className="w-10 h-12 text-lg font-bold rounded-lg border-gray-200 shadow-sm" />
                                        <InputOTPSlot index={7} className="w-10 h-12 text-lg font-bold rounded-lg border-gray-200 shadow-sm" />
                                    </InputOTPGroup>
                                </InputOTP>

                                <Button
                                    onClick={handleVerifyOtp}
                                    className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-200 active:scale-[0.98] transition-all"
                                    disabled={isLoading || otpValue.length !== 8}
                                >
                                    {isLoading ? 'Verifying...' : 'Verify & Enter Chat'}
                                </Button>

                                <div className="flex flex-col items-center gap-4 w-full">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleStartVerification}
                                        className="text-muted-foreground hover:text-orange-500 text-xs"
                                        disabled={isLoading}
                                    >
                                        Didn't receive a code? Resend
                                    </Button>

                                    <button
                                        onClick={() => setStep('email')}
                                        className="text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors flex items-center gap-1"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                        Use a different email
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                        <Lock className="w-3 h-3" />
                        End-to-End Secure
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
