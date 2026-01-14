# AI Model Selection Guide

## Active Models (5 Total)

### 1. **Gemini 1.5 Pro** (Google) 🧠
- **Best for**: Long context, memory recall, historical conversations
- **Trigger Keywords**: 
  - "remember", "last time", "before", "past"
  - "weeks ago", "months ago", "summary of our chats"
  - "pichli baat"
- **Example**: "Remember what we discussed last week about marketing?"

### 2. **Claude 3.5 Sonnet** (Anthropic) ✍️
- **Best for**: Creative writing, storytelling, content creation
- **Trigger Keywords**:
  - "write", "story", "creative", "poem"
  - "essay", "article", "blog", "draft", "compose"
- **Example**: "Write a blog post about AI trends"

### 3. **GPT-4o** (OpenAI) 🔬
- **Best for**: Complex reasoning, coding, mathematics
- **Trigger Keywords**:
  - "code", "logic", "calculate", "strategy"
  - "complex", "plan", "science", "physics", "math"
  - "debug", "algorithm"
- **Example**: "Help me debug this Python function"

### 4. **Cerebras Llama 3.1 70B** ⚡
- **Best for**: Fast responses, standard conversations
- **When**: Default for most queries (if no specific keywords match)
- **Speed**: Ultra-fast (instant responses)
- **Example**: "What's the weather like?" or "Tell me a joke"

### 5. **GPT-4o-mini** (OpenAI) 🎯
- **Best for**: Fallback when Cerebras is unavailable
- **When**: If Cerebras key is not set or fails
- **Speed**: Fast & reliable

## Selection Priority

```
1. Historical/Memory query? → Gemini 1.5 Pro
2. Creative writing? → Claude 3.5 Sonnet
3. Complex logic/code? → GPT-4o
4. Standard chat? → Cerebras Llama 3.1 70B
5. Fallback → GPT-4o-mini
```

## API Keys Required

All keys should be set in Supabase Secrets:
- `GEMINI_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY` (required)
- `CEREBRAS_API_KEY`

## Testing

Try these queries to test each model:
1. "Remember our last conversation" → Gemini
2. "Write a short story about AI" → Claude
3. "Help me code a sorting algorithm" → GPT-4o
4. "What's your favorite color?" → Cerebras
