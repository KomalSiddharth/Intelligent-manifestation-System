from youtube_transcript_api import YouTubeTranscriptApi
import inspect

print(f"Type: {type(YouTubeTranscriptApi)}")
print(f"Dir: {dir(YouTubeTranscriptApi)}")
try:
    print(f"File: {inspect.getfile(YouTubeTranscriptApi)}")
except:
    print("File: Unknown")
