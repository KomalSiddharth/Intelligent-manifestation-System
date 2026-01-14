from youtube_transcript_api import YouTubeTranscriptApi
import sys

print("Python Version:", sys.version)
print("Testing YouTubeTranscriptApi...")

try:
    # Try to fetch transcript for a known safe video (TED Talk)
    # Video ID: R1vskiVDwl4
    transcript = YouTubeTranscriptApi.get_transcript("R1vskiVDwl4")
    print("\nSUCCESS! Transcript fetched.")
    print(f"First line: {transcript[0]}")
except AttributeError as e:
    print(f"\nFAILURE: Attribute Error. {e}")
    print("Dir of YouTubeTranscriptApi:", dir(YouTubeTranscriptApi))
except Exception as e:
    print(f"\nFAILURE: Other Error. {e}")
