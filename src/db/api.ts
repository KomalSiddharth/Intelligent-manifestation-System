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
    const storedId = localStorage.getItem('chat_user_id');
    const userId = user?.id || storedId;

    console.log('🔍 [getMindProfiles] User ID:', userId);

    const { data, error } = await supabase.rpc('get_admin_profiles');
    if (error) throw error;

    let profiles = (data || []).filter((p: any) => !userId || p.user_id === userId || p.is_primary);

    console.log('📦 [getMindProfiles] Found:', profiles.length);
    return profiles;
  } catch (err) {
    console.error("Error fetching profiles via RPC:", err);
    // Fallback with proper filtering
    const { data: { user } } = await supabase.auth.getUser();
    const storedId = localStorage.getItem('chat_user_id');
    const userId = user?.id || storedId;

    let query = supabase.from('mind_profile').select('*');
    if (userId) {
      query = query.or(`user_id.eq.${userId},is_primary.eq.true`);
    } else {
      query = query.eq('is_primary', true);
    }

    const { data } = await query.order('is_primary', { ascending: false });
    console.log('📦 [getMindProfiles] Fallback result:', data?.length);
    return data || [];
  }
};

export const getMindProfile = async (profileId?: string) => {
  console.log('🔍 [getMindProfile] profileId:', profileId);
  try {
    const { data, error } = await supabase.rpc('get_admin_profile', { p_profile_id: profileId || null });
    if (error) throw error;
    // Handle RPC returning array or single object
    const profile = Array.isArray(data) ? data[0] : data;
    console.log('📦 [getMindProfile] (RPC):', profileId, !!profile);
    return profile;
  } catch (err) {
    console.error("Error fetching profile via RPC:", err);
    // Fallback: This bypasses RPC if it fails or is too restrictive
    let query = supabase.from('mind_profile').select('*');
    if (profileId) {
      query = query.eq('id', profileId);
    } else {
      query = query.eq('is_primary', true);
    }
    const { data } = await query.limit(1).maybeSingle();
    console.log('📦 [getMindProfile] (Fallback):', profileId, !!data);
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

export const updateFeatureFlags = async (profileId: string, flags: Record<string, boolean>) => {
  const { data, error } = await supabase
    .from('mind_profile')
    .update({
      feature_flags: flags,
      updated_at: new Date().toISOString()
    })
    .eq('id', profileId)
    .select()
    .single();

  if (error) {
    console.error("Error updating feature flags:", error);
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
  console.log('🔍 [getFolders] profileId:', profileId);
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
  console.log('📂 [getFolders] result:', data?.length);
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

// Voice Settings Management
export interface VoiceSettings {
  voice_stability: number;
  voice_similarity: number;
  voice_speed: number;
  voice_model: string;
}

export const updateVoiceSettings = async (profileId: string, settings: VoiceSettings) => {
  try {
    const { error } = await supabase
      .from('mind_profile')
      .update({
        voice_stability: settings.voice_stability,
        voice_similarity: settings.voice_similarity,
        voice_speed: settings.voice_speed,
        voice_model: settings.voice_model
      })
      .eq('id', profileId);

    if (error) throw error;
    console.log('✅ Voice settings updated:', profileId);
  } catch (error) {
    console.error('Error updating voice settings:', error);
    throw error;
  }
};

export const testVoice = async (text: string, settings: VoiceSettings, profileId?: string): Promise<Blob> => {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-engine?mode=test`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          text,
          voiceId: profileId, // Will fetch from profile if provided
          settings: {
            stability: settings.voice_stability,
            similarity_boost: settings.voice_similarity,
            speed: settings.voice_speed,
            model_id: settings.voice_model
          }
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Voice test failed: ${response.status}`);
    }

    return await response.blob();
  } catch (error) {
    console.error('Error testing voice:', error);
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
  console.log('🔍 [getContentItems] folderId:', folderId, 'profileId:', profileId);

  try {
    const { data, error } = await supabase.functions.invoke('admin-data', {
      body: {
        action: 'get_content',
        folderId: folderId || null,
        profileId: profileId === 'all' ? null : (profileId || null)
      }
    });

    if (error) throw error;

    const items = (data.data || []).map((item: any) => ({
      ...item,
      uploaded_at: item.uploaded_at || item.created_at,
    }));

    console.log('📦 [getContentItems] Edge Function result:', items.length);
    return items;
  } catch (err) {
    console.warn('⚠️ [getContentItems] Edge Function failed, falling back to direct DB query:', err);

    // Fallback: Query DB directly
    // We primarily use knowledge_sources now
    let query = supabase
      .from('knowledge_sources')
      .select('*')
      .order('created_at', { ascending: false });

    if (folderId) {
      query = query.eq('folder_id', folderId);
    } else {
      // If no folder specified (Root), only show items with no folder_id
      query = query.is('folder_id', null);
    }

    if (profileId && profileId !== 'all') {
      query = query.eq('profile_id', profileId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [getContentItems] DB Fallback Error:', error);
      throw error;
    }

    // Map DB result to ContentItem shape if needed, but usually it matches
    const items = (data || []).map((item: any) => ({
      ...item,
      uploaded_at: item.uploaded_at || item.created_at,
      // Ensure type is set if missing
      type: item.type || 'text',
      // Ensure robust defaults for potential missing fields
      title: item.title || 'Untitled',
      source_type: item.source_type || item.type || 'text',
      word_count: item.word_count || 0
    }));

    return items;
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
export const getAudienceUsers = async (status?: string, profileId?: string): Promise<AudienceUser[]> => {
  console.log('🔍 [getAudienceUsers] status:', status, 'profileId:', profileId);

  try {
    const { data, error } = await supabase.functions.invoke('admin-data', {
      body: {
        action: 'get_audience',
        status: status || 'all',
        profileId: profileId === 'all' ? null : (profileId || null)
      }
    });

    if (error) throw error;

    console.log('📦 [getAudienceUsers] Edge Function result:', data.data?.length);
    return (data.data as AudienceUser[]) || [];
  } catch (err) {
    console.warn('⚠️ [getAudienceUsers] Edge Function failed, falling back to direct DB query:', err);

    // Fallback: Query DB directly
    let query = supabase
      .from('audience_users')
      .select('*')
      .order('last_active', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (profileId && profileId !== 'all') {
      // If filtering by profile, we might need to join or filter by tags/metadata if implemented
      // For now, return all or implement specific logic if audience is segmented by profile
      // Note: Current schema might not have direct profile_id on audience_users, confirm schema
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [getAudienceUsers] DB Fallback Error:', error);
      throw error;
    }

    return (data as AudienceUser[]) || [];
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
      birthday: user.birthday || null,
      profile_id: profileId,
      user_id: user.user_id || null
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
    birthday: user.birthday || null,
    profile_id: profileId,
    user_id: user.user_id || null
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



export const upsertAudienceUser = async (user: { id: string; email?: string; name?: string; profile_id?: string; birthday?: string }) => {
  console.log("🔍 [upsertAudienceUser] Syncing:", user.id);
  try {
    // 1. Fetch matching user by user_id
    const { data: usersByUid, error: findUidError } = await supabase
      .from('audience_users')
      .select('*')
      .eq('user_id', user.id);

    if (findUidError) {
      console.error("❌ [upsertAudienceUser] UID Find error:", findUidError);
      throw findUidError;
    }

    let existing = usersByUid && usersByUid.length > 0 ? usersByUid[0] : null;

    // 2. FALLBACK: If not found by UID, search by email to link existing record
    if (!existing && user.email) {
      console.log("🔍 [upsertAudienceUser] No record by UID, searching by email:", user.email);
      const { data: usersByEmail, error: findEmailError } = await supabase
        .from('audience_users')
        .select('*')
        .ilike('email', user.email);

      if (findEmailError) {
        console.error("❌ [upsertAudienceUser] Email Find error:", findEmailError);
      } else if (usersByEmail && usersByEmail.length > 0) {
        // Link the first match that doesn't have a user_id yet (or any match if needed)
        existing = usersByEmail[0];
        console.log("🔗 [upsertAudienceUser] Found existing record by email, will link UID:", existing.id);
      }
    }
    const updates: any = {
      user_id: user.id,
      email: user.email || existing?.email,
      name: user.name || existing?.name || 'Unknown',
      last_active: new Date().toISOString(),
      profile_id: user.profile_id || existing?.profile_id,
      birthday: user.birthday || existing?.birthday,
      status: existing?.status || 'active'
    };

    if (existing) {
      console.log("📝 [upsertAudienceUser] Updating existing record:", existing.id);
      const { data, error } = await supabase
        .from('audience_users')
        .update(updates)
        .eq('id', existing.id)
        .select();

      if (error) {
        console.error("❌ [upsertAudienceUser] Update error:", error);
        throw error;
      }
      return data?.[0];
    } else {
      console.log("🆕 [upsertAudienceUser] Inserting new record");
      const { data, error } = await supabase
        .from('audience_users')
        .insert([updates])
        .select();

      if (error) {
        console.error("❌ [upsertAudienceUser] Insert error:", error);
        throw error;
      }
      return data?.[0];
    }
  } catch (error) {
    console.error("❌ [upsertAudienceUser] CRITICAL FAILURE:", error);
    return null;
  }
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

  // AUTO-REVOKE: Check if 180-day trial has expired
  if (data && data.status !== 'revoked' && data.created_at) {
    const signupDate = new Date(data.created_at).getTime();
    const now = Date.now();
    const diffDays = Math.floor((now - signupDate) / (24 * 60 * 60 * 1000));

    if (diffDays > 180) {
      console.warn(`⏳ [AUTH] Trial expired for ${email} (${diffDays} days since signup). Revoking access.`);
      // Update status in DB as well so it shows in Admin Panel
      await supabase.from('audience_users').update({ status: 'revoked' }).eq('id', data.id);
      return null;
    }
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
    .select('*')
    .order('last_message_at', { ascending: false });

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data: conversations, error } = await query;

  if (error) {
    console.error("Error fetching all conversations:", error);
    return [];
  }

  if (!conversations || conversations.length === 0) return [];

  // Manual Join: Fetch audience users for these conversations
  const userIds = [...new Set(conversations.map(c => c.user_id).filter(Boolean))];

  if (userIds.length === 0) return conversations;

  const idList = userIds.map(id => `"${id}"`).join(',');
  let userQuery = supabase
    .from('audience_users')
    .select('id, user_id, name, email')
    .or(`user_id.in.(${idList}),id.in.(${idList})`);

  if (profileId && profileId !== 'all') {
    userQuery = userQuery.eq('profile_id', profileId);
  }

  const { data: users } = await userQuery;

  // Manual Join: Fetch real message counts from the messages table
  const { data: counts } = await supabase
    .from('messages')
    .select('user_id')
    .in('user_id', userIds);

  const messageCountMap: Record<string, number> = {};
  if (counts) {
    counts.forEach(m => {
      if (m.user_id) {
        messageCountMap[m.user_id] = (messageCountMap[m.user_id] || 0) + 1;
      }
    });
  }

  if (users) {
    const userMapFull = new Map();
    // Pass 1: Map by primary ID (includes guests and partial records)
    users.forEach(u => {
      userMapFull.set(u.id, u);
    });
    // Pass 2: Map by user_id (Auth UID) - This is more authoritative
    // and will overwrite entry for the same key if it exists,
    // ensuring verified profile data takes clinical precedence.
    users.forEach(u => {
      if (u.user_id) userMapFull.set(u.user_id, u);
    });

    return conversations.map(c => {
      const u = userMapFull.get(c.user_id);

      let finalCount = 0;
      if (u) {
        finalCount = (messageCountMap[u.id] || 0) + (u.user_id && u.user_id !== u.id ? (messageCountMap[u.user_id] || 0) : 0);
      } else {
        finalCount = messageCountMap[c.user_id] || 0;
      }

      return {
        ...c,
        audience_user: u ? { ...u, message_count: finalCount } : undefined
      };
    });
  }

  return conversations;
};

// Enhanced to fetch by conversationId OR userId(s) (for full history)
export const getConversationMessages = async (idOrIds: string | string[], byUserId: boolean = false): Promise<Message[]> => {
  let query = supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: true });

  if (byUserId) {
    if (Array.isArray(idOrIds)) {
      query = query.in('user_id', idOrIds);
    } else {
      query = query.eq('user_id', idOrIds);
    }
  } else {
    if (Array.isArray(idOrIds)) {
      query = query.in('conversation_id', idOrIds);
    } else {
      query = query.eq('conversation_id', idOrIds);
    }
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

export const saveMessage = async (sessionId: string, role: string, content: string, id?: string) => {
  const logPrefix = `[saveMessage][${role}]`;
  console.log(`${logPrefix} START - Session: ${sessionId}, Length: ${content.length}`);

  try {
    // 1. Get User ID from Conversation
    const { data: convData, error: fetchErr } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', sessionId)
      .single();

    if (fetchErr || !convData) {
      console.error(`${logPrefix} Conversation not found for sessionId:`, sessionId);
      throw new Error("Conversation not found");
    }

    // 2. Insert Message
    const { data: savedMsg, error: msgError } = await supabase.from('messages').insert({
      id: id || undefined, // Use explicit ID if provided
      conversation_id: sessionId,
      user_id: convData.user_id,
      role,
      content
    })
      .select()
      .single();

    if (msgError) {
      console.error(`${logPrefix} Insert error:`, msgError);
      throw msgError;
    }

    // 3. Update Conversation Timestamp
    const { error: convError } = await supabase.from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (convError) console.error(`${logPrefix} Conv update error:`, convError);

    // 4. Increment Message Count for Audience User (if user message)
    if (role === 'user') {
      console.log(`${logPrefix} Incrementing count for user_id:`, convData.user_id);
      const { data: users, error: audError } = await supabase
        .from('audience_users')
        .select('*')
        .eq('user_id', convData.user_id);

      if (audError) {
        console.error(`${logPrefix} Audience fetch error:`, audError);
      }

      const audienceUser = users && users.length > 0 ? users[0] : null;

      if (audienceUser) {
        console.log(`${logPrefix} Audience user found, updating count`);
        await supabase.from('audience_users')
          .update({
            message_count: (Number(audienceUser.message_count) || 0) + 1,
            last_active: new Date().toISOString()
          })
          .eq('id', audienceUser.id);
      } else {
        console.warn(`${logPrefix} No audience user found to increment count`);
      }
    }
    console.log(`${logPrefix} END - Success`);
    return savedMsg;
  } catch (err) {
    console.error(`${logPrefix} CRITICAL FAILURE:`, err);
    throw err;
  }
};

export const updateMessage = async (id: string, content: string, isVerified: boolean) => {
  console.log("Updating message:", id, { contentLength: content.length, isVerified });
  const { data, error } = await supabase
    .from('messages')
    .update({
      content,
      is_edited: true,
      is_verified: isVerified,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error("Error updating message:", error);
    throw error;
  }
  return data;
};

export const dismissMessage = async (id: string) => {
  console.log("Dismissing message:", id);
  const { data, error } = await supabase
    .from('messages')
    .update({
      is_dismissed: true,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error("Error dismissing message:", error);
    throw error;
  }
  return data;
};

export const getMessageHistoryForTraining = async (profileId?: string): Promise<any[]> => {
  try {
    let query = supabase
      .from('messages')
      .select(`
        id,
        content,
        role,
        is_verified,
        is_dismissed,
        created_at,
        conversation_id,
        conversations(id, profile_id)
      `)
      .order('created_at', { ascending: false });

    // Filter by profile if requested
    if (profileId && profileId !== 'all') {
      query = query.eq('conversations.profile_id', profileId);
    }

    const { data, error } = await query.limit(500);
    if (error) {
      console.error("Error fetching message history for training:", error);
      throw error;
    }

    if (!data || data.length === 0) return [];

    // Grouping by conversation to create Q&A pairs
    const pairs: any[] = [];
    const convGroups: Record<string, any[]> = {};

    data.forEach((msg: any) => {
      const cid = msg.conversation_id || 'unlinked';
      if (!convGroups[cid]) convGroups[cid] = [];
      convGroups[cid].push(msg);
    });

    Object.keys(convGroups).forEach(cid => {
      // Sort messages in this conversation chronologically
      const msgs = convGroups[cid].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      for (let i = 0; i < msgs.length; i++) {
        // Find User questions
        if (msgs[i].role === 'user') {
          // Look for next message as answer (usually role: assistant)
          const assistantReply = msgs[i + 1]?.role === 'assistant' ? msgs[i + 1].content : "No AI reply saved yet";

          // SKIP if message is dismissed
          if (msgs[i].is_dismissed) continue;

          pairs.push({
            id: msgs[i].id,
            question: msgs[i].content,
            answer: assistantReply,
            is_verified: msgs[i + 1]?.is_verified || false,
            created_at: msgs[i].created_at,
            conversation_id: cid
          });
        }
      }
    });

    // Sort pairs by newest first
    return pairs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (err) {
    console.error("Error in getMessageHistoryForTraining:", err);
    return [];
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
