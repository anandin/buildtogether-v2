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
- Root stack navigator for modal screens (AddExpense, ScanReceipt, GoalDetail, SettleUp)
- Bottom tab navigator for main sections (Home, Expenses, Chart, Goals, Profile)
- Each tab has its own stack navigator for future nested screens

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