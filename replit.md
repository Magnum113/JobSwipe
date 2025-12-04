# JobSwipe - Tinder-Style Job Application Platform

## Overview

JobSwipe is a modern job search application that brings the familiar swipe-based interface to job hunting. Users can swipe through job vacancies, manage their resume, search for specific positions, and view their application history. The platform integrates AI-powered cover letter generation to streamline the job application process.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System**
- **React 18** with TypeScript for type-safe component development
- **Vite** as the build tool and development server, configured with custom plugins for Replit integration
- **Client-side routing** via React state management (no router library currently used)

**UI & Styling**
- **Shadcn UI** component library with Radix UI primitives for accessible, customizable components
- **Tailwind CSS** (v4 inline syntax) for utility-first styling with custom theme configuration
- **Framer Motion** for swipe animations and gesture-based interactions on the vacancy cards
- **Plus Jakarta Sans** as the primary font family

**State Management**
- **TanStack Query (React Query)** for server state management, data fetching, and caching
- Local React state for UI interactions and tab navigation
- Custom query client configuration with infinite stale time to minimize refetching

**Application Structure**
- **Tab-based navigation** with four main sections:
  - Vacancies (main Tinder-style swipe interface)
  - Search (filtered job search)
  - History (application history with cover letters)
  - Profile (resume management)
- Component organization follows feature-based structure in `/client/src/pages`
- Reusable UI components in `/client/src/components/ui`

### Backend Architecture

**Framework**
- **Express.js** REST API server with TypeScript
- **Node.js** runtime with ES modules enabled
- Custom middleware for JSON parsing, logging, and request tracking

**API Design**
- RESTful endpoints for jobs, swipes, resumes, and applications
- `/api/jobs/unswiped` - Fetches jobs not yet swiped by the user
- `/api/jobs/search` - Search with filters (company, salary, title, keywords)
- `/api/swipes` - Records left/right swipe decisions
- `/api/resume` - GET/POST endpoints for resume management
- `/api/applications` - Application history tracking
- `/api/cover-letter/generate` - AI-powered cover letter generation

**Server Organization**
- `/server/routes.ts` - Centralized route registration
- `/server/storage.ts` - Database abstraction layer (IStorage interface)
- `/server/openrouter.ts` - OpenRouter API integration for AI features
- `/server/static.ts` - Static file serving for production builds

### Data Layer

**Database**
- **PostgreSQL** as the primary database
- **Drizzle ORM** for type-safe database queries and schema management
- Schema location: `/shared/schema.ts` (shared between client and server)

**Schema Design**
- `jobs` table: Stores job vacancies with title, company, salary, description, and tags array
- `swipes` table: Records user swipe actions with job reference and direction
- `resumes` table: Stores user resume content with timestamps
- `applications` table: Tracks job applications with cover letters and status
- `users` table: User authentication (username/password)

**Data Access Pattern**
- Repository pattern via `DbStorage` class implementing `IStorage` interface
- All database operations abstracted behind methods for easier testing and maintenance
- Drizzle's query builder for type-safe SQL generation

### External Dependencies

**AI Integration**
- **OpenRouter API** for cover letter generation
  - Model: `openai/gpt-4.1-mini`
  - API key stored in Replit Secrets as `OPENROUTER_API_KEY`
  - Generates contextual cover letters based on resume and job description
  - Fallback mechanism when API is unavailable

**Replit Platform Integration**
- **@replit/vite-plugin-runtime-error-modal** - Development error overlay
- **@replit/vite-plugin-cartographer** - Development tooling
- **@replit/vite-plugin-dev-banner** - Development environment banner
- Environment variable access via `process.env.REPLIT_DEV_DOMAIN`

**Database Infrastructure**
- **PostgreSQL connection** via `pg` (node-postgres)
- Connection string from `DATABASE_URL` environment variable
- Connection pooling for efficient database access

**Session Management**
- **connect-pg-simple** - PostgreSQL-backed session store (imported but not fully configured)
- Session storage infrastructure ready for authentication implementation

**Development & Build**
- **TSX** for TypeScript execution in development
- **esbuild** for fast server-side bundling with selective dependency bundling
- **Drizzle Kit** for database migrations and schema management
- Build script bundles allowlisted dependencies to reduce cold start times

**Font & Icon Libraries**
- **Google Fonts** (Plus Jakarta Sans) loaded via CDN
- **Lucide React** for consistent icon system throughout the UI

**Form Management**
- **React Hook Form** with **@hookform/resolvers** for form validation
- **Zod** for schema validation with Drizzle integration via `drizzle-zod`

**Utility Libraries**
- **clsx** and **tailwind-merge** for conditional className composition
- **date-fns** for date formatting and manipulation
- **nanoid** for unique ID generation