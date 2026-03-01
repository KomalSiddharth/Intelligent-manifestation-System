export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface ContentItem {
  id: string;
  title: string;
  source_type: string;
  word_count: number;
  file_url: string | null;
  folder_id: string | null;
  status: 'active' | 'failed';
  uploaded_at: string;
  metadata: Record<string, any>;
  type?: string;
  isOwnContent?: boolean;
}

export interface AudienceUser {
  id: string;
  name: string;
  email: string | null;
  tags: string[];
  message_count: number;
  status: 'active' | 'invited' | 'revoked';
  last_active: string | null;
  last_seen: string | null;
  birthday: string | null;
  user_id: string | null;
  profile_id: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  profile_id?: string;
  title?: string;
  summary?: string;
  created_at: string;
  last_message_at: string | null;
  updated_at?: string;
  has_alert?: boolean;
}

export interface Message {
  id?: string;
  session_id?: string;
  conversation_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  is_edited?: boolean;
  is_verified?: boolean;
  original_content?: string;
  // UI only fields
  image?: string;
  mindMap?: any;
  sources?: any[];
}

export interface AnalyticsMetric {
  id: string;
  date: string;
  total_conversations: number;
  active_users: number;
  time_created_minutes: number;
  messages_answered: number;
  messages_unanswered: number;
  created_at: string;
}

export interface Insight {
  id: string;
  title: string;
  description: string | null;
  action_text: string | null;
  created_at: string;
}

export interface TrendingTopic {
  id: string;
  topic: string;
  mention_count: number;
  period_start: string;
  period_end: string;
}

export interface MetricCard {
  label: string;
  value: string | number;
  change: number;
  changeLabel: string;
}

export interface MindProfile {
  id: string;
  user_id: string;
  name: string;
  headline: string;
  description?: string;
  avatar_url?: string;
  is_primary: boolean;
  purpose?: string;
  instructions?: string[];
  speaking_style?: string;
  response_settings?: any;
  experience_settings?: any;
  suggested_questions?: any[];
  topics?: string[];
  organizations?: any[];
  social_links?: any[];
  anonymize_users?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
}
