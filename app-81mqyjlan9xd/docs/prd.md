# AI Creator Platform Requirements Document

## 1. Website Overview

### 1.1 Website Name
AI Creator Platform

### 1.2 Website Description
An AI-powered creator platform that enables content creators to upload their knowledge, build an AI clone of themselves, and track and monetize audience interactions through an intelligent dashboard system.

### 1.3 Core Purpose
- Content management system for uploading videos, documents, courses, and other materials
- Analytics dashboard showing conversations, user activity, and insights
- User engagement platform for creators to interact with audiences through AI clones
- Monetization system with subscriptions, usage limits, and pay-per-use options

## 2. Main Features

### 2.1 Content Library / Mind Tab
- Folder-based content organization system
- Multi-format upload support: videos, PDFs, documents, transcripts, feeds
- Automatic transcription and text extraction from uploaded content
- Word count display per content item
- Failed document tracking with alert badge (e.g., '46 Failed Documents')
- Content search functionality\n- Filter options for content types\n- Content list showing: title, source (YouTube/Document), word count, upload date, source type (From Feed)\n- Actions menu for each content item (settings, delete)\n-'Add Content' button for new uploads
- Display total word count across all content (e.g., '18,387,144 words')
- Pagination showing items per page (e.g., 'Showing 10 of 4,561')

### 2.2 Insights / Analytics Dashboard
- Personalized greeting with user name (e.g., 'Good afternoon, Mitesh')
- Time range filter (e.g., 'Last 7 days')
- Key metrics cards:\n  - Total Conversations with percentage change indicator
  - Active Users with percentage change\n  - Time Created (total hours and minutes)
  - Messages Answered with percentage change
  - Messages Unanswered with percentage\n- Line chart visualization for conversation trends over time
- AI-generated insight cards with actionable recommendations
- Trending topics section showing most popular discussion themes
- User spotlight cards showing active audience members with their details
- Navigation buttons (Messages, Next) for deeper analysis

### 2.3 User Audience Management / Access Tab
- Complete user list with profile information
- User tags display (e.g., 'AccountabilityCoach')
- Message count per user
- Last active date tracking
- Search functionality for finding specific users
- Filter tabs: All, Active, Invited, Revoked
- 'Sync CRM' integration button
- User count display (e.g., '1,400 Users')
- Hidden users indicator (e.g., '184 users hidden by filters')
-'Add Users' button with two-step modal flow:\n  - **Step 1 - Add Users Modal**: Display two options:\n    + 'Invite by email' option with orange email icon, description'Invite members to your audience by email', and 'Add +' button
    + 'Import from CSV' option with gray CSV icon, description 'Upload your audience in bulk from a CSV file', and 'Add +' button
  - **Step 2a - Invite by Email**: When'Invite by email' is selected, show'Invite Audience Members' modal with:
    + Back arrow button to return to Step 1
    + Email input field with placeholder 'Enter email address'
    + '+' button to add multiple email addresses
    + 'Cancel' and 'Send user invite(s)' buttons at bottom
  - **Step 2b - Import from CSV**: When 'Import from CSV' is selected, show 'Import from CSV' modal with:
    + Back arrow button to return to Step 1
    + Instructions text explaining CSV format requirements (two columns with header row containing'email', 'tags', and 'name')
    + Additional guidance about optional tags and name columns
    + 'Upload CSV...' button with folder icon
    + 'Cancel' and 'Import 0 user(s)' buttons at bottom\n- Sortable columns: Name, Tags, Messages, Last Active
- Additional sections: Conversations, Broadcasts, Engage Preferences
\n### 2.4 Advanced / Monetization Tab
- Pay-as-you-go pricing configuration
- Usage limits management
- Stripe payment integration
- Subscription plan management
- Earnings dashboard\n- Automation features:\n  - Alerts configuration\n  - Actions setup
  - Products management
\n### 2.5 Additional Features
- Top navigation bar with tabs: Insights, Mind, Access, Advanced
- Search functionality (Find with⌘K shortcut)
- 'Publish' button for making changes live
- User profile menu with notifications
- Left sidebar navigation for:\n  - Content/Voice toggle
  - Clone selection dropdown
  - Identity settings (Profile, Biography, Social Links)
  - Behavior settings (Purpose & Instructions, Speaking Style, Response Settings)
  - Appearance customization\n  - Usage tracking
  - Integrations (Website, Phone, External)\n  - Settings access
\n## 3. Technical Requirements

### 3.1 Data Visualization
- Interactive line charts for trend analysis
- Metric cards with percentage indicators (up/down arrows)
- Color-coded performance indicators (red for decrease, green for increase)
- Real-time data updates
- Responsive chart rendering

### 3.2 Search and Filter Functionality
- Global search across all sections
- Content library search
- Audience/user search
- Conversation search
- Multi-criteria filtering:\n  - User status filters (Active, Invited, Revoked, All)
  - Content type filters\n  - Time range filters for metrics
  - Custom filter creation ('Edit Filters' option)
- Sortable data tables:\n  - Sort by upload date
  - Sort by message count
  - Sort by alphabetical order
  - Sort by last active date
\n### 3.3 Integration Requirements
- CRM synchronization capability
- Stripe payment processing
- Website embedding options
- Phone integration\n- External platform connections
\n## 4. User Interface Design

### 4.1 Design Style
- Clean, modern dashboard interface with card-based layout
- Primary color: Vibrant orange (#FF6B35) for CTAs and active states
- Secondary colors: Soft gray backgrounds (#F5F5F5) with white content cards
- Typography: Clear sans-serif font with hierarchical sizing for readability
- Subtle shadows on cards for depth without overwhelming the interface
- Rounded corners (8px radius) on buttons and cards for friendly appearance
- Consistent spacing using16px grid system for visual harmony
- Icon style: Simple line icons with occasional filled variants for emphasis
- Data visualization: Orange primary line charts with subtle grid backgrounds
- Responsive layout adapting seamlessly between desktop and tablet views

### 4.2 Layout Structure
- Fixed top navigation bar\n- Collapsible left sidebar for settings and navigation
- Main content area with card-based components
- Right panel for insights and recommendations (where applicable)
\n## 5. Reference Screenshots
1. Screenshot2025-12-06 141848.png - Content Library / Mind Tab interface
2. Screenshot 2025-12-06 141903.png - User Audience Management / Access Tab
3. Screenshot 2025-12-06 141808.png - Insights Dashboard (upper section)
4. Screenshot 2025-12-06 141834.png - Insights Dashboard (metrics and trending topics)
5. Screenshot 2025-12-06 141820.png - Insights Dashboard (additional metrics view)
6. Screenshot 2025-10-11 130038.png - Add Users modal (Step 1)
7. Screenshot 2025-11-22 234359.png - Invite by email modal (Step 2a)
8. Screenshot 2025-12-06 160630.png - Import from CSV modal (Step 2b)
9. Screenshot 2025-12-06 160657.png - Additional reference\n10. Screenshot 2025-12-06 160643.png - Additional reference