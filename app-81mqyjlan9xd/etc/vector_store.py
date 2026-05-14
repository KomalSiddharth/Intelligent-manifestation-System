from pinecone import Pinecone
import openai
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
index = pc.Index("database-storage")  # ← Use your existing index!
openai.api_key = os.getenv("OPENAI_API_KEY")

def generate_embedding(text: str):
    """Convert text to vector"""
    response = openai.embeddings.create(
        model="text-embedding-3-small",  # 1536 dimensions - matches your index!
        input=text
    )
    return response.data[0].embedding

def store_chunks(user_id: str, chunks: list, source_name: str, content_type: str):
    """Store text chunks in Pinecone"""
    vectors = []
    
    for i, chunk in enumerate(chunks):
        vector_id = f"{user_id}_{source_name}_{i}"
        embedding = generate_embedding(chunk)
        
        vectors.append({
            "id": vector_id,
            "values": embedding,
            "metadata": {
                "user_id": user_id,
                "text": chunk,
                "source": source_name,
                "type": content_type,
                "chunk_index": i
            }
        })
    
    # Upload to Pinecone
    index.upsert(vectors=vectors)
    return len(vectors)

def search_content(user_id: str, query: str, top_k=5):
    """Search for relevant content"""
    query_embedding = generate_embedding(query)
    
    results = index.query(
        vector=query_embedding,
        top_k=top_k,
        filter={"user_id": user_id},
        include_metadata=True
    )
    
    return results.matches

# Test it
if __name__ == "__main__":
    # Test with sample data
    test_chunks = [
        "I believe in waking up at 5am every day for productivity",
        "My morning routine includes meditation and journaling",
        "Goal setting should be done every 90 days"
    ]
    
    num_stored = store_chunks("test_user", test_chunks, "Morning_Routine_Video", "video")
    print(f"✅ Stored {num_stored} chunks")
    
    # Test search
    results = search_content("test_user", "what time should I wake up?")
    print(f"✅ Search found {len(results)} results")
    if results:
        print(f"Top result: {results[0].metadata['text']}")