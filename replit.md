# Build Together

## Overview

Build Together is a couples finance app that helps partners transparently share expenses, manage budgets, and save toward shared goals. The app solves awkward money conversations by providing collaborative financial management with dual-user awareness throughout the interface.

The project is built as an Expo React Native application with an Express backend, designed to run on iOS, Android, and web platforms.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: Expo SDK 54 with React Native 0.81, using the new architecture (Fabric/TurboModules enabled).

**Navigation**: React Navigation v7 with a hybrid structure:
- Root stack navigator for modal screens (AddExpense, ScanReceipt, DreamDetail, SettleUp, ExpenseDetail)
- Bottom tab navigator with intuitive naming:
  - **Home** (home icon) - Minimal dashboard with Dream Guardian and quick actions
  - **Expenses** (credit-card icon) - Full expense list with smart time-based grouping, settlement tracker, and category budgets
  - **Insights** (trending-up icon) - Analytics, charts, Steady Progress, AI Coach, and Future Us timeline
  - **Dreams** (star icon) - Shared savings dreams tracking (renamed from Goals)
  - **Settings** (settings icon) - Partner profiles and budget configuration
- Each tab has its own stack navigator for nested screens

**Recent Updates (Jan 2026)**:
- **Apple Sign-In Authentication**: Full authentication flow with Apple Sign-In, JWT session tokens, and secure token storage (SecureStore on mobile, AsyncStorage on web)
- **Partner Linking System**: 6-character invite codes with 7-day expiry for connecting partners to shared couple accounts
- **AuthContext Provider**: App-wide authentication state management with automatic session refresh
- **Legal Compliance Pages**: Privacy Policy and Terms of Service screens for App Store readiness
- **Settings Screen Enhancements**: New Partner section (Connect Partner), Legal section (Privacy/Terms), and Account section (Sign Out)
- **Cloud Storage Migration**: Moved from local AsyncStorage to PostgreSQL database for cross-device sync
- **Cloud API Endpoints**: Full REST API for expenses, goals, budgets, categories, settlements, and couple data
- **Offline Support**: Local cache fallback when network unavailable, syncs on reconnect
- **Image Compression**: Receipt images resized to 1024px width and 50% JPEG quality before upload
- AI-first expense entry with natural language parsing and smart categorization
- Merchant extraction from receipts (separate from notes) for trend analysis
- Multi-category budget tracking with 9 pre-defined categories and custom categories
- AI Coach component providing weekly savings nudges and spending insights
- Enhanced Insights screen with daily budget calculator, spending change indicators, and merchant leaderboard
- Redesigned navigation with user-friendly names (Expenses, Insights, Settings)
- **Advanced Budget System**: Three budget types (recurring, rollover, one-time) with configurable alert thresholds
- **Rollover Budgets**: Unused budget amounts carry forward to the next month automatically
- **Budget-to-Goal Suggestions**: GoalDetailScreen shows potential savings from under-budget categories
- **AI-Powered Budget Analysis**: Backend AI endpoint now analyzes budget status and suggests savings toward goals
- **The Harmony Spark**: Behavioral economics-driven dashboard with pulsating orb visualization
- **Invisible Wealth Counter**: 10-year compound projection toggle (7% growth rate)
- **Commitment Heart**: Loss aversion streak tracker that cracks after 72h without Dream deposits
- **Onboarding Flow**: Welcome screen with feature highlights, followed by partner name setup and optional first goal creation
- **Dream Guardian**: Friendly AI companion replacing complex visualizations - speaks naturally and gives contextual encouragement based on savings behavior
- **Ego Spend Detection**: AI identifies luxury/status purchases with "Vanish to Dream" redirect buttons
- **Haptic Dream Deposits**: Enhanced goal contribution flow with celebration animation
- **Steady Progress**: Calm streak tracking showing days of mindful spending, no impulse purchases, and expense tracking consistency
- **Future Us Timeline**: Visual goal horizon showing projected completion dates based on savings rate
- **Bill Split System**: Configurable expense splitting with equal, income-based, or custom ratios
- **Monthly Settlement Summary**: Dashboard card showing who owes what each month based on split preferences
- **Reorganized Tab Structure (Jan 2026)**:
  - Home: Minimal - Dream Guardian, budget snapshot, quick actions only
  - Expenses: Smart time-grouped list (Today/Yesterday/This Week/Earlier), category filter chips, payer indicators, settlement tracker, category budgets
  - Insights: Steady Progress, Future Us, AI Coach (moved from Home), spending analytics
  - Dreams: Renamed from Goals, star icon, shared savings dreams

**State Management**: 
- React Context (AppContext) for global app data including expenses, goals, budget, and partner information
- TanStack Query (React Query) for server state management and API calls
- AsyncStorage for local data persistence

**Styling Approach**:
- Custom theming system with light/dark mode support via `useTheme` hook
- Warm pastel color palette (primary: #FF9AA2, accent: #C7CEEA)
- Nunito font family loaded via expo-font
- Consistent spacing, border radius, and shadow constants in `constants/theme.ts`

**Animation**: React Native Reanimated for smooth micro-interactions and spring animations on buttons and cards.

### Backend Architecture

**Framework**: Express 5 with TypeScript.

**API Structure**:
- `/api/scan-receipt` - OpenAI Vision API integration for receipt OCR
- Replit AI Integrations modules for chat, audio, image, and batch processing

**Database**: 
- Drizzle ORM with PostgreSQL (schema in `shared/schema.ts`)
- Currently using in-memory storage (`MemStorage` class) with PostgreSQL schema ready for migration
- Shared schema exports for conversations and messages (chat feature scaffolding)

**Server Configuration**:
- CORS configured for Replit domains and localhost development
- Serves static landing page for non-mobile web access
- Body parser configured with 50MB limit for audio/image payloads

### Data Flow

1. Client stores app data locally via AsyncStorage
2. Receipt scanning sends base64 image to server, which calls OpenAI Vision API
3. Server returns extracted expense data (amount, description, category)
4. Client updates local storage and refreshes context

### Budget System

**Budget Types**:
- **Recurring**: Resets at the start of each month (default for most expenses)
- **Rollover**: Unused budget carries forward to next month (good for variable expenses)
- **One-time**: Fixed budget until a specific end date (for special events/projects)

**Key Components**:
- `CategoryBudget` type in `client/types/index.ts`: Includes budgetType, alertThreshold, rolloverBalance, endDate
- `getEffectiveBudget()` in `client/lib/storage.ts`: Calculates monthlyLimit + rolloverBalance for rollover types
- `processMonthlyRollover()` in `client/lib/storage.ts`: Updates rollover balances at month transitions
- `BudgetSettingsScreen`: Full CRUD UI for category budgets accessible from Settings tab
- AI insights endpoint (`/api/ai-insights`): Analyzes budget status and suggests savings toward goals
- Ego spend endpoint (`/api/detect-ego-spends`): Identifies luxury/impulse purchases for "Vanish" nudges

### Harmony Spark Feature

**Behavioral Economics Components**:
- **Harmony Orb**: Central pulsating visualization showing Ego vs Dream ratio (savings / (savings + ego spending))
- **Invisible Wealth Counter**: Toggle shows 10-year compound value at 7% growth (fights hyperbolic discounting)
- **Commitment Heart**: Tracks last Dream deposit, "cracks" after 72 hours without contribution (loss aversion)
- **Vanish Nudges**: AI-detected Ego Spends appear on expense list with one-tap redirect to Dreams

**Key Components**:
- `HarmonySpark` component in `client/components/HarmonySpark.tsx`
- `ExpenseItem` enhanced with `egoNudge` and `onVanish` props for Vanish functionality
- Ego categories: shopping, entertainment, restaurants, personal, gifts
- Essential categories: groceries, utilities, internet, transport, health

**Visual System**:
- Orb gradient colors shift based on ratio: indigo (steady) → gold (high saving) → amber (warning)

### Key Design Decisions

**Local-First Storage**: Expenses, goals, and budgets are stored locally on device. This was chosen for:
- Offline functionality
- Privacy (financial data stays on device)
- Simplified initial architecture

**Shared Schema Location**: `shared/` directory contains database schemas and types used by both client and server, enabling type-safe API contracts.

**Path Aliases**: 
- `@/` maps to `./client/`
- `@shared/` maps to `./shared/`

## External Dependencies

### AI Services
- **OpenAI API** (via Replit AI Integrations): GPT-4o for receipt scanning/OCR, GPT Image model for image generation
- Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Database
- **PostgreSQL**: Primary database (requires `DATABASE_URL` environment variable)
- **Drizzle ORM**: Database toolkit with `drizzle-kit` for migrations

### Authentication (Planned)
- Apple Sign-In (iOS)
- Google Sign-In (Android)
- Currently not implemented, but design guidelines specify SSO approach

### Device Features
- **expo-camera**: Receipt scanning
- **expo-image-picker**: Photo library access for receipts
- **expo-haptics**: Tactile feedback for interactions

### Key NPM Packages
- `@tanstack/react-query`: Server state management
- `react-native-reanimated`: Animations
- `react-native-gesture-handler`: Touch handling
- `date-fns`: Date manipulation
- `zod`: Schema validation (paired with drizzle-zod)