# test_apis.py
import openai
from pinecone import Pinecone
import os
from dotenv import load_dotenv

load_dotenv()

# Test OpenAI
openai.api_key = os.getenv("OPENAI_API_KEY")
response = openai.chat.completions.create(
    model="gpt-3.5-turbo",
    messages=[{"role": "user", "content": "Say hello"}]
)
print("OpenAI works:", response.choices[0].message.content)

# Test Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
print("Pinecone works:", pc.list_indexes())