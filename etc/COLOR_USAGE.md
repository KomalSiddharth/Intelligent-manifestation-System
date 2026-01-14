# Color Usage Guide - Red Color Scheme

## Overview
The AI Creator Platform uses a **classic red color scheme** with gradient **#F44336 → #C62828** (light red to dark red) throughout the application for buttons and all primary color elements.

## Color Definitions

### Primary Colors
- **Primary Red**: `#F44336` (Red) = `hsl(0, 85%, 60%)`
- **Dark Red**: `#C62828` (Deep Red) = `hsl(0, 70%, 45%)`
- **Gradient**: `linear-gradient(90deg, #F44336, #C62828)`

## Where the Gradient is Applied

### 1. Buttons with Gradient Variant
All buttons using `variant="gradient"` will display the #F44336 → #C62828 red gradient:

```tsx
<Button variant="gradient">Add Content</Button>
<Button variant="gradient">Add Users</Button>
<Button variant="gradient">Publish</Button>
```

**Locations:**
- Mind/Content Library page: "Add Content" button
- Access/Audience page: "Add Users" button
- Header: "Publish" button
- Any custom buttons with gradient variant

### 2. Default Buttons (Solid Color)
Buttons using `variant="default"` will use the solid #F44336 red color:

```tsx
<Button>Click Me</Button>
<Button variant="default">Submit</Button>
```

### 3. Primary Color Elements
Any element using `bg-primary`, `text-primary`, or `border-primary` will use #F44336:

**Examples:**
- Active navigation tabs: `bg-primary/10 text-primary`
- Chart lines: Uses `--chart-1` which is set to #F44336
- Focus rings: `ring-primary`
- Links: `text-primary`
- Badges with primary color
- Icons with primary color

### 4. Navigation Tabs
The active tab in the main navigation uses the primary color:

```tsx
// Active tab
<button className="px-4 py-2 rounded-full bg-primary/10 text-primary font-medium">
  Insights
</button>
```

**Locations:**
- Insights tab (when active)
- Mind tab (when active)
- Access tab (when active)
- Advanced tab (when active)

### 5. Charts and Data Visualization
All charts use the primary red color (#F44336) for the main data line:

```tsx
<Line
  type="monotone"
  dataKey="conversations"
  stroke="hsl(var(--chart-1))"  // This is #F44336
  strokeWidth={2}
/>
```

**Locations:**
- Insights page: Conversation trends chart
- Any future charts added to the platform

### 6. Metric Cards
Metric cards use the primary red color for titles and indicators:

```tsx
<CardTitle className="text-primary">Total Conversations</CardTitle>
```

**Locations:**
- Insights page: All metric cards (Total Conversations, Active Users, etc.)

### 7. Interactive Elements
- **Hover states**: Elements with `hover:bg-primary` or `hover:text-primary`
- **Focus states**: Input fields and buttons with `focus:ring-primary`
- **Active states**: Selected items in lists or tables

## CSS Custom Properties

All colors are defined in `src/index.css`:

```css
:root {
  --primary: 0 85% 60%;              /* #F44336 */
  --primary-glow: 0 70% 45%;         /* #C62828 */
  --gradient-primary: linear-gradient(90deg, #F44336, #C62828);
}
```

## Tailwind CSS Classes

### Solid Primary Color (#F44336)
- `bg-primary` - Background
- `text-primary` - Text color
- `border-primary` - Border color
- `ring-primary` - Focus ring

### Gradient (#F44336 → #C62828)
- `bg-gradient-primary` - Gradient background
- `gradient-button` - Custom utility class for gradient buttons

## How to Use

### For Gradient Buttons
```tsx
import { Button } from "@/components/ui/button";

<Button variant="gradient">
  <Plus className="h-4 w-4 mr-2" />
  Add New Item
</Button>
```

### For Solid Primary Color
```tsx
<Button variant="default">Submit</Button>
<div className="bg-primary text-white p-4">Primary Background</div>
<h2 className="text-primary">Primary Text</h2>
```

### For Custom Gradient Elements
```tsx
<div className="bg-gradient-primary text-white p-6 rounded-lg">
  Custom gradient background
</div>
```

## Dark Mode
The same red colors are used in dark mode with adjusted opacity for better readability:

```css
.dark {
  --primary: 0 85% 60%;              /* Same #F44336 */
  --primary-glow: 0 70% 45%;         /* Same #C62828 */
  --gradient-primary: linear-gradient(90deg, #F44336, #C62828);
}
```

## Verification Checklist

✅ All gradient buttons use #F44336 → #C62828
✅ All primary color elements use #F44336
✅ Active navigation tabs use #F44336
✅ Charts use #F44336 for primary data lines
✅ No hardcoded pink or purple colors in the codebase
✅ Gradient direction is left to right (90deg)
✅ Hover states darken the gradient appropriately
✅ Dark mode uses the same red gradient

## Future Development

When adding new components:
1. Use `variant="gradient"` for primary action buttons
2. Use `bg-primary` or `text-primary` for solid red color elements
3. Never hardcode color values - always use CSS custom properties
4. Test in both light and dark modes
5. Ensure proper contrast ratios for accessibility
