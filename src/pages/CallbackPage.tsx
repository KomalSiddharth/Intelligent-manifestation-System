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
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) throw sessionError;
                if (!session) {
                    // If no session yet, wait a bit or redirect to login
                    // Sometimes the redirect happens before the session is fully established in local storage
                    return;
                }

                const profileId = searchParams.get('profileId');
                const platform = searchParams.get('platform') || 'google_drive';

                if (!profileId) {
                    throw new Error("Missing profileId in callback URL");
                }

                // Supabase Auth provides the provider tokens in the session metadata or alongside the session
                // Note: provider_refresh_token is only available if access_type=offline was used (which we did)
                const providerToken = session.provider_token;
                const providerRefreshToken = session.provider_refresh_token;

                console.log("Captured Provider Tokens:", { providerToken: !!providerToken, providerRefreshToken: !!providerRefreshToken });

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

                setStatus('success');
                setTimeout(() => {
                    navigate('/mind');
                }, 2000);

            } catch (err: any) {
                console.error("Callback Error:", err);
                setStatus('error');
                setErrorMessage(err.message || "Failed to complete authentication");
            }
        };

        handleCallback();
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
