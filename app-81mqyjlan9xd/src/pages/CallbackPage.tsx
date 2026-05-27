import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { saveIntegration } from '@/db/api';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const CallbackPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const profileId = searchParams.get('profileId');
        const platform = searchParams.get('platform') || 'google_drive';

        if (!profileId) {
            setStatus('error');
            setErrorMessage("Missing profileId in callback URL");
            return;
        }

        // Use onAuthStateChange so we catch the SIGNED_IN event which fires
        // AFTER Supabase has parsed the URL hash and populated provider_token.
        // The old getSession() approach had a race condition where session was
        // null at call time, causing provider_token to be lost forever.
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED') return;
                if (!session) return;

                try {
                    const providerToken = session.provider_token;
                    const providerRefreshToken = session.provider_refresh_token;

                    console.log("✅ [CALLBACK] Auth event:", event);
                    console.log("✅ [CALLBACK] Provider tokens captured:", {
                        hasAccessToken: !!providerToken,
                        hasRefreshToken: !!providerRefreshToken
                    });

                    if (!providerToken) {
                        console.warn("⚠️ [CALLBACK] provider_token is null — Google may not have issued one. Saving integration without token.");
                    }

                    await saveIntegration({
                        profile_id: profileId,
                        platform: platform,
                        access_token: providerToken || undefined,
                        refresh_token: providerRefreshToken || undefined,
                        is_active: true,
                        metadata: {
                            user_email: session.user?.email,
                            last_sync: new Date().toISOString()
                        }
                    });

                    subscription.unsubscribe();
                    setStatus('success');
                    setTimeout(() => navigate('/mind'), 2000);

                } catch (err: any) {
                    console.error("❌ [CALLBACK] Save integration error:", err);
                    subscription.unsubscribe();
                    setStatus('error');
                    setErrorMessage(err.message || "Failed to save integration");
                }
            }
        );

        // Also try getSession() immediately in case the event already fired
        // (e.g. user refreshed the callback page)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.provider_token) {
                // Session already has provider_token — save it directly
                saveIntegration({
                    profile_id: profileId,
                    platform: platform,
                    access_token: session.provider_token,
                    refresh_token: session.provider_refresh_token || undefined,
                    is_active: true,
                    metadata: {
                        user_email: session.user?.email,
                        last_sync: new Date().toISOString()
                    }
                }).then(() => {
                    subscription.unsubscribe();
                    setStatus('success');
                    setTimeout(() => navigate('/mind'), 2000);
                }).catch((err) => {
                    subscription.unsubscribe();
                    setStatus('error');
                    setErrorMessage(err.message);
                });
            }
        });

        return () => subscription.unsubscribe();
    }, [searchParams, navigate]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
            <div className="w-full max-w-md p-8 border rounded-xl shadow-lg bg-card text-center space-y-6">
                {status === 'loading' && (
                    <>
                        <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
                        <h1 className="text-2xl font-bold">Connecting your account...</h1>
                        <p className="text-muted-foreground text-sm">
                            Please wait while we finalize your integration.
                        </p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <CheckCircle2 className="w-12 h-12 mx-auto text-green-500" />
                        <h1 className="text-2xl font-bold">Successfully Connected!</h1>
                        <p className="text-muted-foreground text-sm">
                            Your Google Drive is now linked. Redirecting you back to the dashboard...
                        </p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <XCircle className="w-12 h-12 mx-auto text-destructive" />
                        <h1 className="text-2xl font-bold text-destructive">Authentication Failed</h1>
                        <p className="text-muted-foreground text-sm">
                            {errorMessage}
                        </p>
                        <Button onClick={() => navigate('/mind')} className="w-full">
                            Back to Mind
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

export default CallbackPage;
