# Build Together

## Overview

Build Together is a couples finance application designed to foster transparency and collaboration in managing shared expenses, budgets, and savings goals. It aims to eliminate financial awkwardness between partners by providing a dual-user aware interface for comprehensive financial management. The application supports iOS, Android, and web platforms and includes features like AI-powered expense tracking, personalized financial coaching, and behavioral economics-driven nudges to encourage saving and mindful spending.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

The frontend is an Expo React Native application (SDK 54, React Native 0.81, new architecture enabled). It utilizes React Navigation v7 with a hybrid root stack for modals and a bottom tab navigator for core features: Home, Expenses, Insights, and Dreams (renamed from Goals), and Settings.

Key features and design principles include:
- **Authentication**: Apple Sign-In with JWT session tokens and secure storage.
- **Partner Linking**: 6-character invite codes for couple account connection.
- **State Management**: React Context for global app data and TanStack Query for server state.
- **Styling**: Custom theming system with light/dark mode, purple as primary color, warm pastel accents, and Nunito font.
- **Animations**: React Native Reanimated for smooth micro-interactions.
- **UI/UX**: Emphasis on intuitive navigation, user-friendly language, and accessibility (WCAG AA).
- **AI Integration**: AI-first expense entry, natural language parsing, smart categorization, AI Coach for nudges, and ego spend detection.
- **Budgeting**: Supports recurring, rollover, and one-time budgets with configurable alerts and AI-powered analysis for goal suggestions.
- **Behavioral Economics**: Features like "Harmony Spark" (Ego vs. Dream ratio), "Invisible Wealth Counter" (compound projection), and "Commitment Heart" (loss aversion streak tracker).
- **Guardian AI**: A personalized AI companion that observes, learns, nudges, and adapts based on user behavior, with a transparent "Guardian Memory System" showing AI's learning and rationale.
- **Real-time Feedback**: AI feedback toasts and live budget impact previews for immediate user insights.
- **Data Storage**: Local-first storage (AsyncStorage) with robust cloud synchronization via a PostgreSQL backend. All data synchronization and utility functions are consolidated in `@/lib/cloudStorage` for consistency.
- **Enhanced Onboarding**: 4-step onboarding flow that collects partner names, family composition (kids by age groups), city location, and first dream. Uses AI-powered budget generation based on cost of living data.

### Backend Architecture

The backend is built with Express 5 and TypeScript. It provides a REST API for managing expenses, goals, budgets, categories, settlements, and couple data.

Key backend components include:
- **API Endpoints**: Comprehensive set of RESTful endpoints for all application functionalities.
- **AI Integrations**: Utilizes Replit AI Integrations (OpenAI Vision API) for receipt scanning/OCR and other AI models.
- **Database**: PostgreSQL with Drizzle ORM for schema management, currently using an in-memory storage during development but designed for full PostgreSQL integration.
- **Shared Schema**: Database schemas and types are shared between client and server for type-safe API contracts.

## External Dependencies

### AI Services
- **OpenAI API**: Used via Replit AI Integrations for receipt OCR (GPT-4o) and image generation (GPT Image model).

### Database
- **PostgreSQL**: The primary relational database.
- **Drizzle ORM**: Used for database interactions and migrations.

### Device Features
- **expo-camera**: For capturing receipt images.
- **expo-image-picker**: For accessing the device's photo library.
- **expo-haptics**: For providing tactile feedback.

### Key NPM Packages
- **@tanstack/react-query**: For server state management.
- **react-native-reanimated**: For animations.
- **react-native-gesture-handler**: For advanced touch handling.
- **date-fns**: For date manipulation.
- **zod**: For schema validation.
- **react-native-purchases**: RevenueCat SDK for subscription management.

## Subscription Model

### Pricing
- **14-day free trial** with full access to all premium features
- **$7.99/month** - flexible monthly billing
- **$59.99/year** - best value, saves 37% (~$5/month equivalent)
- Cancel anytime during trial with no charge

### Premium Features (Gated)
1. **Dream Guardian AI**: Self-learning AI companion with hyper-personalized nudges
2. **AI Receipt Scanner**: Unlimited receipt scans with automatic extraction
3. **Guardian Memory**: Full transparency into AI's learning process
4. **Smart Insights**: AI-powered spending analysis

### Implementation
- **RevenueCat SDK**: `react-native-purchases` handles all subscription logic
- **SubscriptionContext**: `client/context/SubscriptionContext.tsx` provides subscription state with:
  - `isPremium`: boolean indicating active subscription
  - `packages`: { monthly, annual } - available subscription packages from RevenueCat
  - `purchasePackage(pkg)`: initiates purchase flow
  - `restorePurchases()`: restores previous purchases
  - `isPreviewMode`: true when API keys not configured (development/testing)
- **PaywallScreen**: `client/screens/PaywallScreen.tsx` shows upgrade options with plan selector
- **SubscriptionManagementScreen**: `client/screens/SubscriptionManagementScreen.tsx` - Customer center for managing subscriptions
- **PremiumGate**: `client/components/PremiumGate.tsx` wraps premium features

### RevenueCat Configuration
- **Entitlement ID**: "Build Together Pro" (with fallbacks to "premium" and "pro")
- **Products**: 
  - Monthly: $7.99/month with product ID matching "MONTHLY" package type
  - Annual: $59.99/year with product ID matching "ANNUAL" package type
  - Both products include 14-day free trial

### Environment Variables Required
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`: RevenueCat API key for iOS (currently configured with test key)
- `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`: RevenueCat API key for Android

Note: Without API keys, the app runs in "preview mode" where clicking "Start Free Trial" activates premium locally for testing.

## Admin Dashboard

### Overview
The admin dashboard allows remote management of AI features without requiring App Store deployments. It's a standalone web interface served by the Express backend on port 5000.

### Access
- URL: `/admin` on port 5000 (Express backend)
- Credentials: admin@buildtogether.app / admin123

### Features
1. **AI Prompts Editor**: View, edit, and manage all AI prompt templates used throughout the app
   - Expense categorization
   - Budget generation
   - Guardian nudges
   - Spending insights
   - Receipt extraction
   - Ego spend detection

2. **AI Logs**: Monitor all AI API calls with inputs, outputs, errors, latency, and token usage

3. **User Corrections**: Track when users override AI suggestions for model improvement

4. **Benchmarks**: Configure city cost multipliers, family size factors, and default category budgets

### Database Tables
- `admin_users`: Admin user accounts with bcrypt password hashing
- `ai_prompts`: Editable AI prompt templates with versioning
- `ai_logs`: AI call logs with performance metrics
- `ai_corrections`: User correction history for AI improvement
- `benchmark_configs`: Configurable financial benchmarks

### Authentication
- JWT-based authentication with 7-day expiration
- Tokens stored in sessionStorage (client-side)
- First login with default credentials creates the admin account