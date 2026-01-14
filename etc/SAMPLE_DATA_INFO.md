# Sample Data Information

## Overview
This AI Creator Platform has been pre-populated with sample data to demonstrate its full functionality immediately upon launch.

## What Data Has Been Added?

### 1. Folders (5 folders)
- AI Course
- YouTube Videos
- Podcast Transcripts
- Documents
- Workshop Materials

### 2. Content Items (10 items)
Sample content including:
- YouTube videos about manifestation, wealth, and personal development
- AI course materials
- Machine learning documents
- Podcast transcripts
- Total word count: ~113,000 words

### 3. Audience Users (11 users)
Sample users with:
- Various message counts (25 to 2,150 messages)
- Different tags (e.g., "AccountabilityCoach")
- Recent activity dates
- Email addresses (example.com domain)

### 4. Analytics Metrics (7 days)
Historical data from Nov 29 - Dec 5, 2025:
- Daily conversation counts (2,206 to 3,400)
- Active user counts (210 to 232)
- Time created metrics
- Messages answered/unanswered

### 5. Insights (3 insights)
AI-generated insights about:
- Audience behavior patterns
- Engagement trends
- Content performance recommendations

## Purpose of Sample Data

This demonstration data allows you to:
- ✅ See the platform in action immediately
- ✅ Understand how data is organized and displayed
- ✅ Test all features without needing to add content first
- ✅ Visualize charts and analytics with realistic data
- ✅ Experience the full user interface and workflows

## Managing Sample Data

### Option 1: Keep the Sample Data
The sample data is harmless and can remain in your database. You can:
- Add your own content alongside it
- Delete individual items as needed
- Use it as a template for your own data structure

### Option 2: Delete Sample Data
If you prefer to start fresh, you can delete the sample data through the UI:
1. **Content Items**: Go to Mind tab → Delete individual items
2. **Folders**: Delete folders after removing their content
3. **Users**: Go to Access tab → Remove individual users
4. **Analytics**: Will be replaced with real data over time

### Option 3: Database Reset
For a complete fresh start, you can reset the database tables (requires database access):
```sql
TRUNCATE TABLE content_items, folders, audience_users, analytics_metrics, insights CASCADE;
```

## Note
All sample data uses placeholder information:
- Email addresses use @example.com domain
- Names are fictional
- Metrics are for demonstration purposes only
- No real user data or personal information is included

## Questions?
The sample data is designed to help you understand the platform's capabilities. Feel free to modify or remove it as needed for your actual use case.
