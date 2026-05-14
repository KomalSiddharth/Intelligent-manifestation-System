import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        console.log('🔔 Notification Worker: Starting reminder check...');

        // Query for due reminders
        const { data: dueReminders, error: queryError } = await supabase
            .from('reminders')
            .select('*')
            .eq('status', 'pending')
            .lte('due_at', new Date().toISOString())
            .order('due_at', { ascending: true });

        if (queryError) {
            console.error('Error querying reminders:', queryError);
            throw queryError;
        }

        console.log(`📋 Found ${dueReminders?.length || 0} due reminders`);

        if (!dueReminders || dueReminders.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'No due reminders found',
                    processed: 0
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Process each reminder
        const results = await Promise.allSettled(
            dueReminders.map(async (reminder) => {
                try {
                    console.log(`📤 Processing reminder ${reminder.id}: ${reminder.task}`);

                    // Broadcast via Realtime channel
                    const channel = supabase.channel('platform-broadcast');

                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => {
                            reject(new Error('Channel subscription timeout'));
                        }, 5000);

                        channel.subscribe(async (status) => {
                            if (status === 'SUBSCRIBED') {
                                clearTimeout(timeout);

                                const broadcastResponse = await channel.send({
                                    type: 'broadcast',
                                    event: 'reminder',
                                    payload: {
                                        title: '⏰ Reminder',
                                        message: reminder.task,
                                        reminderId: reminder.id,
                                        userId: reminder.user_id,
                                        priority: reminder.priority || 'normal',
                                        timestamp: new Date().toISOString()
                                    },
                                });

                                console.log(`✅ Broadcast sent for reminder ${reminder.id}:`, broadcastResponse);

                                // Clean up channel
                                await supabase.removeChannel(channel);
                                resolve(broadcastResponse);
                            }
                        });
                    });

                    // Update reminder status to completed
                    const { error: updateError } = await supabase
                        .from('reminders')
                        .update({
                            status: 'completed',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', reminder.id);

                    if (updateError) {
                        console.error(`Error updating reminder ${reminder.id}:`, updateError);
                        throw updateError;
                    }

                    return { id: reminder.id, success: true };
                } catch (error) {
                    console.error(`Failed to process reminder ${reminder.id}:`, error);

                    // Mark as overdue if broadcast failed
                    await supabase
                        .from('reminders')
                        .update({
                            status: 'overdue',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', reminder.id);

                    return { id: reminder.id, success: false, error: error.message };
                }
            })
        );

        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;

        console.log(`✨ Notification Worker Complete: ${successful} sent, ${failed} failed`);

        return new Response(
            JSON.stringify({
                success: true,
                processed: dueReminders.length,
                successful,
                failed,
                results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason })
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Notification Worker Error:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
