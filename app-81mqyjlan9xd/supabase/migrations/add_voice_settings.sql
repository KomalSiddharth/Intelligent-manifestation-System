-- Add voice settings columns to mind_profile table
ALTER TABLE mind_profile 
ADD COLUMN IF NOT EXISTS voice_stability DECIMAL DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS voice_similarity DECIMAL DEFAULT 0.75,
ADD COLUMN IF NOT EXISTS voice_speed DECIMAL DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS voice_model TEXT DEFAULT 'eleven_multilingual_v2';

-- Add comment for documentation
COMMENT ON COLUMN mind_profile.voice_stability IS 'ElevenLabs voice stability (0-1, higher = more consistent)';
COMMENT ON COLUMN mind_profile.voice_similarity IS 'ElevenLabs voice similarity boost (0-1, higher = closer to original)';
COMMENT ON COLUMN mind_profile.voice_speed IS 'Voice playback speed multiplier (0.5-2.0)';
COMMENT ON COLUMN mind_profile.voice_model IS 'ElevenLabs voice model (eleven_multilingual_v2, eleven_turbo_v2, etc)';
