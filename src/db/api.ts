import { supabase } from './supabase';
import type {
  Folder,
  ContentItem,
  AudienceUser,
  Conversation,
  Message,
  AnalyticsMetric,
  Insight,
  TrendingTopic
} from '@/types/types';

export interface UserIntegration {
  id: string;
  profile_id: string;
  platform: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  is_active: boolean;
  metadata?: any;
}

export const getMindProfiles = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    // STRICT ISOLATION: Only listen to verified user if logged in.
    // If user is null, fallback to storedId (Guest Mode).
    const storedId = localStorage.getItem('chat_user_id');
    const userId = user?.id || storedId;

    const { data, error } = await supabase.rpc('get_admin_profiles');
    if (error) throw error;
    return (data || []).filter((p: any) => !userId || p.user_id === userId || p.is_primary);
  } catch (err) {
    console.error("Error fetching profiles via RPC:", err);
    // Fallback with proper filtering
    const { data: { user } } = await supabase.auth.getUser();
    const storedId = localStorage.getItem('chat_user_id');
    const userId = user?.id || storedId;

    let query = supabase.from('mind_profile').select('*');
    if (userId) query = query.eq('user_id', userId);

    const { data } = await query.order('is_primary', { ascending: false });
    return data || [];
  }
};

export const getMindProfile = async (profileId?: string) => {
  try {
    const { data, error } = await supabase.rpc('get_admin_profile', { p_profile_id: profileId || null });
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("Error fetching profile via RPC:", err);
    // Fallback
    let query = supabase.from('mind_profile').select('*');
    if (profileId) query = query.eq('id', profileId);
    const { data } = await query.limit(1).maybeSingle();
    return data;
  }
};

export const ensureUserFact = async (userId: string, type: string, fact: string, profileId?: string): Promise<void> => {
  // Check if fact already exists
  let query = supabase
    .from('user_facts')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type);

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data: existing } = await query.maybeSingle();

  if (existing) {
    // Update
    await supabase
      .from('user_facts')
      .update({ fact, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    // Insert
    await supabase
      .from('user_facts')
      .insert({
        user_id: userId,
        type,
        fact,
        profile_id: profileId || null
      });
  }
};

export const createMindProfile = async (name: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  const storedId = localStorage.getItem('chat_user_id');
  const userId = user?.id || storedId;

  if (!userId) throw new Error("Unauthorized: No User ID found");

  const { data, error } = await supabase
    .from('mind_profile')
    .insert({
      user_id: userId,
      name,
      headline: `${name}'s Clone`,
      is_primary: false,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating profile:", error);
    throw error;
  }
  return data;
};

export const updateMindProfile = async (profileUpdate: any, profileId?: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  const storedId = localStorage.getItem('chat_user_id');
  const userId = user?.id || storedId || "00000000-0000-0000-0000-000000000000";

  // 1. If we are setting this profile as primary, unset others for this user first
  if (profileUpdate.is_primary === true) {
    await supabase
      .from('mind_profile')
      .update({ is_primary: false })
      .eq('user_id', userId)
      .neq('id', profileId || '00000000-0000-0000-0000-000000000000');
  }

  // 2. Use profileId or find the primary/latest one
  let targetId = profileId;
  if (!targetId) {
    const currentProfile = await getMindProfile();
    targetId = currentProfile?.id;
  }

  const { data, error } = await supabase
    .from('mind_profile')
    .upsert({
      id: targetId,
      user_id: userId,
      ...profileUpdate,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase Profile Update Error:", error);
    throw error;
  }
  return data;
};

export const deleteMindProfile = async (profileId: string) => {
  const { error } = await supabase
    .from('mind_profile')
    .delete()
    .eq('id', profileId);

  if (error) {
    console.error("Error deleting profile:", error);
    throw error;
  }
};

// --- Integrations API ---

export const getIntegrations = async (profileId: string): Promise<UserIntegration[]> => {
  const { data, error } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('profile_id', profileId);

  if (error) {
    console.error("Error fetching integrations:", error);
    return [];
  }
  return data || [];
};

export const saveIntegration = async (integration: Partial<UserIntegration>) => {
  const { data, error } = await supabase
    .from('user_integrations')
    .upsert({
      ...integration,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'profile_id,platform'
    })
    .select()
    .single();

  if (error) {
    console.error("Error saving integration:", error);
    throw error;
  }
  return data;
};

export const initiateGoogleDriveAuth = async (profileId: string) => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'https://www.googleapis.com/auth/drive.readonly',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
      redirectTo: `${window.location.origin}/callback?profileId=${profileId}&platform=google_drive`,
    },
  });

  if (error) throw error;
  return data;
};

// Folders API
export const getFolders = async (profileId?: string): Promise<Folder[]> => {
  let query = supabase
    .from('folders')
    .select('*')
    .order('name', { ascending: true });

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching folders:", error);
    return [];
  }
  return data || [];
};

export const createFolder = async (name: string, profileId?: string, parent_id: string | null = null): Promise<Folder> => {
  const { data, error } = await supabase
    .from('folders')
    .insert({
      name,
      profile_id: profileId,
      parent_id
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating folder:", error);
    throw error;
  }
  return data;
};

export const deleteFolder = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Error deleting folder:", error);
    throw error;
  }
};

export const moveContentToFolder = async (id: string, folderId: string | null): Promise<void> => {
  // Try mapping to both tables
  const { error: ksError } = await supabase
    .from('knowledge_sources')
    .update({ folder_id: folderId })
    .eq('id', id);

  const { error: ciError } = await supabase
    .from('content_items')
    .update({ folder_id: folderId })
    .eq('id', id);

  if (ksError && ciError) {
    console.error("Error moving content:", { ksError, ciError });
    throw new Error("Failed to move content to folder.");
  }
};
export const getContentItems = async (folderId?: string, profileId?: string): Promise<ContentItem[]> => {
  try {
    const { data, error } = await supabase.functions.invoke('admin-data', {
      body: {
        action: 'get_content',
        folderId: folderId || null,
        profileId: profileId === 'all' ? null : (profileId || null)
      }
    });

    if (error) throw error;

    return (data.data || []).map((item: any) => ({
      ...item,
      uploaded_at: item.uploaded_at || item.created_at,
    }));
  } catch (err) {
    console.error("Error fetching content via Edge Function:", err);
    return [];
  }
};

export const deleteContentItem = async (id: string): Promise<void> => {
  // 1. Delete from knowledge_sources (New AI-Ingested content)
  const { error: ksError } = await supabase
    .from('knowledge_sources')
    .delete()
    .eq('id', id);

  // 2. Delete from content_items (Legacy/Sample data)
  const { error: ciError } = await supabase
    .from('content_items')
    .delete()
    .eq('id', id);

  if (ksError && ciError) {
    console.error("Error deleting content from both tables:", { ksError, ciError });
    throw new Error("Failed to delete content item from database.");
  }
};

export const getFailedContentCount = async (profileId?: string): Promise<number> => {
  let query = supabase
    .from('knowledge_sources')
    .select('id', { count: 'exact', head: true })
    .eq('word_count', 0);

  if (profileId && profileId !== 'all') {
    query = query.eq('profile_id', profileId);
  }

  const { count, error } = await query;
  if (error) console.error("Error fetching failed count:", error);
  return count || 0;
};

export const getTotalWordCount = async (profileId?: string): Promise<number> => {
  try {
    const { data, error } = await supabase.functions.invoke('admin-data', {
      body: {
        action: 'get_stats',
        profileId: (profileId === 'all' ? null : profileId) || null
      }
    });

    if (error) throw error;
    return data?.totalWords || 0;
  } catch (err) {
    console.error("Error fetching total word count via Edge Function:", err);
    return 0;
  }
};

// Ingestion API
export const ingestContent = async (
  title: string,
  content: string,
  type: 'text' | 'youtube' | 'pdf' | 'audio' | 'spreadsheet' = 'text',
  url?: string,
  overrideUserId?: string,
  profileId?: string,
  folderId?: string
) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // Fallback userId if no local session (e.g. dev mode)
  const storedId = localStorage.getItem('chat_user_id');

  // Use override if provided, else storedId
  const finalUserId = overrideUserId || storedId;

  if (!token && !finalUserId) {
    throw new Error("No active session or user ID found");
  }

  const finalContent = content;
  const finalType = type;

  // Note: For 'youtube', content is empty initially, Edge Function fetches it.


  const { data, error } = await supabase.functions.invoke('ingest-content', {
    body: {
      title,
      content: finalContent,
      type: finalType,
      url, // Keep URL for metadata even if type is text
      userId: finalUserId,
      profileId,
      folderId
    },
  });

  if (error) throw error;

  if (data && data.success === false) {
    throw new Error(data.error || "Ingestion failed");
  }

  return data;
};

// Upload Audio/Video to Supabase Storage -> Edge Function (Whisper)
export const ingestMedia = async (file: File, profileId?: string, folderId?: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  const storedId = localStorage.getItem('chat_user_id');
  const userId = user?.id || storedId || 'anonymous';

  try {
    // 1. Get Signed Upload URL via Edge Function (Bypasses RLS)
    const fileName = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    console.log("Requesting upload URL for:", fileName);

    const { data: uploadInfo, error: uploadErr } = await supabase.functions.invoke('ingest-content', {
      body: { action: 'get_upload_url', fileName, userId }
    });

    if (uploadErr || !uploadInfo?.signedUrl) throw new Error(uploadErr?.message || "Failed to get upload URL");

    // 2. Upload directly to S3/Supabase Storage using PUT
    console.log("Uploading file to signed URL...");
    const uploadRes = await fetch(uploadInfo.signedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type }
    });

    if (!uploadRes.ok) throw new Error("Upload failed to storage");

    // 3. Get public URL (signed for read)
    const { data: readInfo, error: readErr } = await supabase.functions.invoke('ingest-content', {
      body: { action: 'get_read_url', fileName, userId }
    });

    if (readErr || !readInfo?.signedUrl) {
      console.warn("Failed to get signed read URL, using path-based fallback");
    }

    // 4. Process media via Edge Function (Transcribe & Ingest)
    console.log("Requesting media processing for:", fileName);
    const { data: processResult, error: processErr } = await supabase.functions.invoke('ingest-content', {
      body: {
        action: 'process_media',
        filePath: fileName,
        fileName: file.name,
        fileType: file.type,
        profileId,
        userId,
        folderId
      }
    });

    if (processErr) throw processErr;
    if (processResult && processResult.success === false) {
      throw new Error(processResult.error || "Media processing failed");
    }

    return processResult;

  } catch (error: any) {
    console.error("Media Ingestion Error:", error);
    throw new Error(`Media Processing Failed: ${error.message || JSON.stringify(error)}`);
  }
};

export const trackSocialSource = async (url: string, platform: string, profileId?: string, folderId?: string) => {
  const storedId = localStorage.getItem('chat_user_id');
  const userId = storedId;

  const { data, error } = await supabase.functions.invoke('ingest-content', {
    body: {
      action: 'track_source',
      url,
      platform,
      userId,
      profileId,
      folderId
    },
  });

  if (error) throw error;
  if (data && data.success === false) throw new Error(data.error || "Tracking failed");
  return data;
};

// Audience Users API
export const getAudienceUsers = async (status?: string, _profileId?: string): Promise<AudienceUser[]> => {
  try {
    const { data, error } = await supabase.functions.invoke('admin-data', {
      body: {
        action: 'get_audience',
        status: status === 'all' ? null : (status || null),
        profileId: _profileId === 'all' ? null : (_profileId || null),
        limit: 5000 // Set high limit for now
      }
    });

    if (error) throw error;
    return (data.data as AudienceUser[]) || [];
  } catch (err) {
    console.error("Error fetching audience via Edge Function:", err);
    return [];
  }
};


export const getTotalUserCount = async (profileId?: string): Promise<number> => {
  try {
    const { data, error } = await supabase.functions.invoke('admin-data', {
      body: {
        action: 'get_stats',
        profileId: (profileId === 'all' ? null : profileId) || null
      }
    });

    if (error) throw error;
    return data?.userCount || 0;
  } catch (err) {
    console.error("Error fetching total user count via Edge Function:", err);
    // Silent fallback to standard head query if Edge Function fails
    const { count } = await supabase.from('audience_users').select('id', { count: 'exact', head: true });
    return count || 0;
  }
};

export const createAudienceUser = async (user: Partial<AudienceUser>, profileId?: string): Promise<AudienceUser> => {
  const { data, error } = await supabase
    .from('audience_users')
    .insert({
      name: user.name || 'Unknown',
      email: user.email || null,
      tags: user.tags || [],
      message_count: user.message_count || 0,
      status: user.status || 'active',
      last_active: user.last_active || null,
      profile_id: profileId,
      user_id: user.user_id || crypto.randomUUID()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Alias for createAudienceUser
export const addAudienceMember = createAudienceUser;

export const bulkCreateAudienceUsers = async (users: Partial<AudienceUser>[], profileId?: string): Promise<void> => {
  const rows = users.map(user => ({
    name: user.name || 'Unknown',
    email: user.email || null,
    tags: user.tags || [],
    message_count: user.message_count || 0,
    status: user.status || 'active',
    last_active: user.last_active || null,
    profile_id: profileId,
    user_id: user.user_id || crypto.randomUUID()
  }));

  const { error } = await supabase
    .from('audience_users')
    .insert(rows);

  if (error) throw error;
};

export const deleteAudienceUser = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('audience_users')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

export const deleteAudienceUsers = async (ids: string[]): Promise<void> => {
  const { error } = await supabase
    .from('audience_users')
    .delete()
    .in('id', ids);

  if (error) throw error;
};



export const upsertAudienceUser = async (user: { id: string; email?: string; name?: string; profile_id?: string }) => {
  // Check if user exists first to preserve existing data like tags/status
  const { data: existing } = await supabase
    .from('audience_users')
    .select('*')
    .eq('user_id', user.id)
    .single();

  const updates = {
    user_id: user.id,
    email: user.email || existing?.email,
    name: user.name || existing?.name || 'Unknown',
    last_active: new Date().toISOString(),
    profile_id: user.profile_id || existing?.profile_id,
    // Only set default status if new
    status: existing?.status || 'active'
  };

  const { data, error } = await supabase
    .from('audience_users')
    .upsert(updates, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error("Error syncing audience user:", error);
  }
  return data;
};

export const deleteAllAudienceUsers = async (profileId?: string, forceAll: boolean = false): Promise<void> => {
  let query = supabase
    .from('audience_users')
    .delete();

  if (!forceAll) {
    if (profileId) {
      query = query.eq('profile_id', profileId);
    } else {
      query = query.is('profile_id', null);
    }
  } else {
    // Force delete EVERYTHING in the table
    query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // Always true delete
  }

  const { error } = await query;

  if (error) throw error;
};

export const verifyAudienceAccess = async (email: string, profileId?: string): Promise<AudienceUser | null> => {
  let query = supabase
    .from('audience_users')
    .select('*')
    .ilike('email', email);

  if (profileId) {
    // Allow if user belongs to this profile OR is a global user (profile_id is null)
    query = query.or(`profile_id.eq.${profileId},profile_id.is.null`);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("Error verifying audience access:", error);
    return null;
  }

  // STRICT BLOCK: Reject revoked users
  if (data && data.status === 'revoked') {
    console.warn(`🚫 [AUTH] Access denied for revoked email: ${email}`);
    return null;
  }

  return data;
};

// Revoke user access
export const revokeAudienceAccess = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('audience_users')
    .update({ status: 'revoked' })
    .eq('id', id);

  if (error) throw error;
};

// Conversations API (Sessions)
export const getSessions = async (userId: string, profileId?: string): Promise<Conversation[]> => {
  let query = supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId);

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data, error } = await query.order('last_message_at', { ascending: false });

  if (error) {
    console.error("Error fetching sessions:", error);
    return [];
  }
  return data || [];
};

export const getAllConversations = async (profileId?: string): Promise<Conversation[]> => {
  let query = supabase
    .from('conversations')
    .select('*') // JOIN REMOVED FOR DEBUGGING
    .order('last_message_at', { ascending: false });

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching all conversations:", error);
    return [];
  }
  return data || [];
};

// Enhanced to fetch by conversationId OR userId (for full history)
export const getConversationMessages = async (id: string, byUserId: boolean = false): Promise<Message[]> => {
  let query = supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true });

  if (byUserId) {
    // Fetch ALL messages for this user across all sessions
    query = query.eq('user_id', id);
  } else {
    // Fetch just this conversation
    query = query.eq('conversation_id', id);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as Message[];
};

export const createSession = async (userId: string, title: string = "New Chat", profileId?: string): Promise<Conversation> => {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title, profile_id: profileId })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getMessages = async (sessionId: string): Promise<Message[]> => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) return [];
  return data as Message[];
};

export const saveMessage = async (sessionId: string, role: string, content: string) => {
  console.log("Saving message:", { sessionId, role, contentLength: content.length });

  // 1. Get User ID (Required)
  // 1. Get User ID (Required)
  const { data: convData, error: fetchErr } = await supabase
    .from('conversations')
    .select('user_id')
    .eq('id', sessionId)
    .single();

  if (fetchErr || !convData) throw new Error("Conversation not found");

  // 2. Insert Message
  const { error: msgError } = await supabase.from('messages').insert({
    conversation_id: sessionId,
    user_id: convData.user_id,
    role,
    content
  });

  if (msgError) {
    console.error("Error saving message:", msgError);
    throw msgError;
  }

  // 3. Update Conversation Timestamp + Summary
  const summaryPreview = content.substring(0, 100) + (content.length > 100 ? '...' : '');

  const { error: convError } = await supabase.from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      summary: summaryPreview
    })
    .eq('id', sessionId);

  if (convError) console.error("Error updating conversation timestamp:", convError);

  // 3. Increment Message Count for Audience User (if user message)
  if (role === 'user') {
    try {
      // First get the conversation to find the user_id
      const { data: conv } = await supabase.from('conversations').select('user_id').eq('id', sessionId).single();

      if (conv && conv.user_id) {
        // Increment count using rpc is safer, but direct update works for simple apps
        // We find the audience user by user_id link
        const { data: audienceUser } = await supabase
          .from('audience_users')
          .select('id, message_count')
          .eq('user_id', conv.user_id)
          .single();

        if (audienceUser) {
          await supabase.from('audience_users')
            .update({ message_count: (audienceUser.message_count || 0) + 1, last_active: new Date().toISOString() })
            .eq('id', audienceUser.id);
        }
      }
    } catch (err) {
      console.warn("Failed to update message count:", err);
    }
  }
};

// Analytics API
export const getAnalyticsMetrics = async (days: number = 7): Promise<AnalyticsMetric[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('analytics_metrics')
    .select('*')
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

export const getLatestMetrics = async (): Promise<AnalyticsMetric | null> => {
  try {
    // Get current profile
    const profileId = localStorage.getItem('selected_profile_id');
    if (!profileId) {
      console.warn('No profile selected for analytics');
      return null;
    }

    // Call real-time analytics RPC
    const { data, error } = await supabase.rpc('get_realtime_analytics', {
      p_profile_id: profileId
    });

    if (error) {
      console.error('Error fetching real-time analytics:', error);
      return null;
    }

    if (!data) return null;

    // Transform RPC response to AnalyticsMetric format
    return {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      total_conversations: data.total_conversations || 0,
      active_users: data.active_users || 0,
      time_created_minutes: data.time_created_minutes || 0,
      messages_answered: data.messages_answered || 0,
      messages_unanswered: data.messages_unanswered || 0,
      created_at: data.last_updated || new Date().toISOString()
    };
  } catch (error) {
    console.error('Failed to fetch latest metrics:', error);
    return null;
  }
};

// Insights API
export const getInsights = async (limit: number = 5): Promise<Insight[]> => {
  const { data, error } = await supabase
    .from('insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

// Trending Topics API
export const getTrendingTopics = async (days: number = 7): Promise<TrendingTopic[]> => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('trending_topics')
    .select('*')
    .gte('period_start', startDate.toISOString())
    .order('mention_count', { ascending: false })
    .limit(10);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
};
