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
        const handleCallback = async () => {
            try {
                const profileId = searchParams.get('profileId');
                const platform = searchParams.get('platform') || 'google_drive';

                if (!profileId) throw new Error("Missing profileId in callback URL");

                // ── Strategy 1: Read provider_token directly from URL hash ──────────
                // When Supabase redirects back after OAuth it puts tokens in the hash:
                // /callback?profileId=X#access_token=...&provider_token=ya29.xxx&...
                // Reading the hash directly is 100% reliable — no async race conditions.
                const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
                const tokenFromHash     = hashParams.get('provider_token');
                const refreshFromHash   = hashParams.get('provider_refresh_token');

                console.log('✅ [CALLBACK] Hash token present:', !!tokenFromHash);

                if (tokenFromHash) {
                    // Make sure Supabase session is also established (it processes the
                    // same hash, usually synchronously before our useEffect runs)
                    await supabase.auth.getSession(); // ensure session is in localStorage

                    const { data: { session } } = await supabase.auth.getSession();
                    await saveIntegration({
                        profile_id:    profileId,
                        platform:      platform,
                        access_token:  tokenFromHash,
                        refresh_token: refreshFromHash || undefined,
                        is_active:     true,
                        metadata: {
                            user_email: session?.user?.email,
                            last_sync:  new Date().toISOString()
                        }
                    });

                    console.log('✅ [CALLBACK] Saved from hash. Token:', tokenFromHash.slice(0, 10) + '...');
                    setStatus('success');
                    setTimeout(() => navigate('/mind'), 2000);
                    return;
                }

                // ── Strategy 2: Wait for onAuthStateChange SIGNED_IN event ──────────
                // Fallback if hash was already cleared (e.g. hard refresh on callback page)
                console.warn('⚠️ [CALLBACK] No token in hash — waiting for onAuthStateChange...');

                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        subscription.unsubscribe();
                        reject(new Error('Timed out waiting for Google auth session. Please try reconnecting.'));
                    }, 10_000);

                    const { data: { subscription } } = supabase.auth.onAuthStateChange(
                        async (event, session) => {
                            if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED') return;
                            if (!session) return;

                            clearTimeout(timeout);
                            subscription.unsubscribe();

                            const providerToken        = session.provider_token;
                            const providerRefreshToken = session.provider_refresh_token;

                            console.log('✅ [CALLBACK] onAuthStateChange fired:', event, 'hasToken:', !!providerToken);

                            await saveIntegration({
                                profile_id:    profileId,
                                platform:      platform,
                                access_token:  providerToken  || undefined,
                                refresh_token: providerRefreshToken || undefined,
                                is_active:     true,
                                metadata: {
                                    user_email: session.user?.email,
                                    last_sync:  new Date().toISOString()
                                }
                            });

                            resolve();
                        }
                    );
                });

                setStatus('success');
                setTimeout(() => navigate('/mind'), 2000);

            } catch (err: any) {
                console.error('❌ [CALLBACK] Error:', err);
                setStatus('error');
                setErrorMessage(err.message || 'Failed to complete authentication');
            }
        };

        handleCallback();
    }, []); // run once on mount — searchParams/navigate don't need to be deps here

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
