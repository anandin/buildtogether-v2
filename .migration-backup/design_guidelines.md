# Build Together - Design Guidelines

## Brand Identity

**Purpose**: A finance app for couples to transparently share expenses, manage budgets, and work toward shared dreams. Solves the awkward money conversations and helps partners build a financial future together.

**Aesthetic Direction**: **Soft/optimistic with warm intimacy** - This isn't a cold finance tool, it's a relationship strengthener. Use warm pastels, gentle curves, and hopeful imagery. The app should feel like a cozy shared space, not a sterile spreadsheet.

**Memorable Element**: Dual-user awareness everywhere - subtle visual indicators that this is *our* money, not mine. Paired avatars, shared celebrations, collaborative interactions.

## Navigation Architecture

**Root Navigation**: Tab Bar (4 tabs)
- **Home** - Dashboard with budget overview, recent expenses, goals progress
- **Expenses** - List of all shared transactions with AI scan entry point
- **Goals** - Shared financial dreams and savings targets
- **Profile** - Settings, partner management, account

**Authentication Required**: Yes - Apple Sign-In (iOS) and Google Sign-In (Android). Partners must invite/connect to each other in-app.

## Screen Specifications

### Onboarding (Stack-Only)
1. **Welcome Screen**: Hero illustration, "Build your dreams together" tagline, Continue button
2. **Sign In**: SSO buttons (Apple/Google), terms/privacy links
3. **Partner Setup**: "Invite your partner" with shareable code/link

### Home (Dashboard)
- **Header**: Transparent, paired avatars (left), notifications bell (right)
- **Content** (scrollable):
  - Monthly budget card (circular progress, spent/remaining)
  - Quick actions: Add Expense (floating), Scan Receipt
  - Recent expenses (last 5, See All link)
  - Active goals preview (2 cards max)
- **Safe Area**: Top: headerHeight + Spacing.xl, Bottom: tabBarHeight + Spacing.xl

### Expenses List
- **Header**: Transparent, search icon (right), filter icon (right)
- **Content** (FlatList): Grouped by date, each expense shows category icon, description, amount, who paid
- **Floating Button**: Bottom-right, "+" for Add/Scan options (shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.10, shadowRadius: 2)
- **Empty State**: "No expenses yet" illustration
- **Safe Area**: Top: headerHeight + Spacing.xl, Bottom: tabBarHeight + Spacing.xl + 60 (for floating button)

### Add/Scan Expense (Modal)
- **Header**: Default navigation, "Add Expense" title, Cancel (left), Save (right)
- **Content** (scrollable form): Amount input, category picker, description, date, who paid toggle, split method (50/50, custom, one person)
- **Scan Receipt Button**: Camera icon, triggers AI scan flow
- **Safe Area**: Top: Spacing.xl, Bottom: insets.bottom + Spacing.xl

### Goals
- **Header**: Transparent, "+" add goal (right)
- **Content** (scrollable grid): Goal cards showing name, target amount, saved amount, progress bar, emoji/image
- **Empty State**: "Start building together" illustration
- **Safe Area**: Top: headerHeight + Spacing.xl, Bottom: tabBarHeight + Spacing.xl

### Goal Detail (Stack)
- **Header**: Default navigation, goal name title, edit (right)
- **Content** (scrollable): Large progress ring, milestone markers, contribution history, Add Funds button
- **Safe Area**: Top: Spacing.xl, Bottom: tabBarHeight + Spacing.xl

### Profile
- **Header**: Transparent, settings gear (right)
- **Content** (scrollable):
  - Partner section: Both avatars, names, "Connected since [date]"
  - Preferences: Notifications, theme toggle
  - Account actions: Log out, Delete account (nested in Settings)
- **Safe Area**: Top: headerHeight + Spacing.xl, Bottom: tabBarHeight + Spacing.xl

## Color Palette

- **Primary**: #7C3AED (vibrant purple - trust & stability for finance)
- **Accent**: #F97316 (warm orange - warmth & partnership)
- **Success**: #059669 (emerald - growth/savings)
- **Warning**: #D97706 (amber - alerts)
- **Error**: #DC2626 (red - destructive actions ONLY)
- **Background**: #FAFAF9 (warm off-white)
- **Surface**: #FFFFFF (pure white cards)
- **Text Primary**: #1C1917 (near black)
- **Text Secondary**: #57534E (warm gray)
- **AI/Guardian**: #8B5CF6 (violet - Dream Guardian features)

**Color Philosophy**: Purple primary signals trust and financial stability. Red is reserved ONLY for destructive/error actions (delete, cancel). Orange accent adds warmth for partnership elements.

## Typography

- **Font**: Nunito (Google Font) - friendly, approachable, modern
- **Scale**:
  - Hero: 32px, Bold
  - Title: 24px, Bold
  - Heading: 18px, SemiBold
  - Body: 16px, Regular
  - Caption: 14px, Regular
  - Small: 12px, Regular

## Visual Design

- **Touchables**: Use Primary color tint on press (opacity: 0.7)
- **Cards**: Soft shadows (shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 4)
- **Floating Button**: Primary color, white icon, shadow per specifications above
- **Icons**: Feather icons from @expo/vector-icons, 24px default
- **Forms**: Rounded inputs (borderRadius: 12), subtle borders (#E5E5EA)

## Assets to Generate

1. **icon.png** - App icon: Two overlapping hearts forming a piggy bank silhouette, coral/lavender gradient
2. **splash-icon.png** - Launch screen: Simplified version of app icon
3. **onboarding-welcome.png** - Two figures building a house together (abstract, warm colors) - USED: Welcome screen hero
4. **empty-expenses.png** - Single receipt floating gently - USED: Expenses empty state
5. **empty-goals.png** - Two hands planting a seedling - USED: Goals empty state
6. **avatar-preset-1.png** - Neutral smiling face, coral background - USED: Default profile avatar option 1
7. **avatar-preset-2.png** - Neutral smiling face, lavender background - USED: Default profile avatar option 2
8. **scan-success.png** - Receipt with checkmark animation frame - USED: Receipt scan confirmation

All illustrations should use the warm, soft color palette (corals, lavenders, mints) with gentle gradients and rounded organic shapes. Style: modern flat illustration with subtle texture, NOT clipart.