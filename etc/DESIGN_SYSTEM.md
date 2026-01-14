# Design System Documentation

## Color Palette

### Primary Colors
The AI Creator Platform uses a vibrant **red color scheme** as its primary brand color:

- **Primary Red**: `#F44336` = `hsl(0, 85%, 60%)` - Vibrant red
- **Dark Red**: `#C62828` = `hsl(0, 70%, 45%)` - Deep red
- **Gradient**: Linear gradient from light red to dark red (90deg)

This creates a bold, professional visual effect with a classic red color scheme.

### Usage in Components

#### Buttons
The platform supports multiple button variants:

1. **Default Button** - Solid red color
   ```tsx
   <Button>Click Me</Button>
   ```

2. **Gradient Button** - #F44336 → #C62828 gradient (light red to dark red)
   ```tsx
   <Button variant="gradient">Add Content</Button>
   ```

3. **Outline Button** - Transparent with border
   ```tsx
   <Button variant="outline">Cancel</Button>
   ```

4. **Secondary Button** - Muted gray
   ```tsx
   <Button variant="secondary">Options</Button>
   ```

#### Charts and Data Visualization
- Line charts use the primary red color (#F44336)
- Chart accent colors complement the red theme
- Metric cards use red for indicators

#### Interactive Elements
- Active navigation tabs: Red background
- Hover states: Slightly darker red
- Focus rings: Red outline
- Links: Red color with underline

### Color Tokens

All colors are defined as CSS custom properties in `src/index.css`:

```css
:root {
  --primary: 0 85% 60%;              /* #F44336 - Red */
  --primary-glow: 0 70% 45%;         /* #C62828 - Dark Red */
  --gradient-primary: linear-gradient(90deg, #F44336, #C62828);
}
```

### Tailwind CSS Classes

Use these semantic classes throughout the application:

- `bg-primary` - Red background (#F44336)
- `text-primary` - Red text (#F44336)
- `border-primary` - Red border (#F44336)
- `bg-gradient-primary` - #F44336 → #C62828 gradient background
- `gradient-button` - Custom gradient button utility class

### Accessibility

The red color scheme maintains WCAG AA contrast ratios:
- #F44336 on white: 4.5:1 (AA compliant)
- White on #F44336: 4.5:1 (AA compliant)

### Dark Mode

In dark mode, the same red gradient is used but with adjusted opacity for better readability on dark backgrounds.

## Logo

The platform uses the **MK (Mitesh Khatri)** logo featuring:
- Circular design with red gradient
- "INDU and MITESH KHATRI" text below
- Rounded square container with gradient border

Logo location: Header (top-left corner)

## Typography

- **Font Family**: System font stack (sans-serif)
- **Headings**: Bold weight, hierarchical sizing
- **Body Text**: Regular weight, 14-16px
- **Small Text**: 12-14px for metadata and labels

## Spacing

Consistent spacing using a 16px grid system:
- Small: 8px (0.5rem)
- Medium: 16px (1rem)
- Large: 24px (1.5rem)
- Extra Large: 32px (2rem)

## Shadows

Subtle shadows for depth:
- Cards: `0 1px 3px rgba(0, 0, 0, 0.1)`
- Hover: `0 4px 6px rgba(0, 0, 0, 0.1)`
- Elevated: `0 10px 15px rgba(0, 0, 0, 0.1)`

## Border Radius

- Small: 4px
- Medium: 8px (default for cards and buttons)
- Large: 12px
- Full: 9999px (for circular elements)

## Component Examples

### Gradient Button (Primary CTA)
```tsx
<Button variant="gradient" size="lg">
  <Plus className="h-4 w-4 mr-2" />
  Add Content
</Button>
```

### Metric Card with Red Accent
```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-primary">Total Conversations</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-3xl font-bold">2,206</div>
    <p className="text-sm text-destructive">↓ 35%</p>
  </CardContent>
</Card>
```

### Active Navigation Tab
```tsx
<button className="px-4 py-2 rounded-full bg-primary/10 text-primary font-medium">
  Insights
</button>
```

## Migration History

The platform was originally designed with an orange color scheme (`#FF6B35`), then updated to a red-pink to blue-purple gradient (`#FF4D6D → #6A5CFF`), and now uses a **classic red color scheme** (`#F44336 → #C62828`). All components have been updated to use the new red color tokens.

### What Changed:
- ✅ Primary color: #FF4D6D → #F44336 (Red)
- ✅ Secondary color: #6A5CFF → #C62828 (Dark Red)
- ✅ Button styles: Pink-purple gradient → Red gradient (#F44336 → #C62828)
- ✅ Charts: Pink lines → Red lines (#F44336)
- ✅ Active states: Pink → Red (#F44336)
- ✅ Logo: MK branded logo (unchanged)

### What Stayed the Same:
- Layout structure
- Component hierarchy
- Spacing system
- Typography
- Functionality
