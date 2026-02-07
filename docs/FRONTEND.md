# Frontend Documentation

> **Note:** This documentation supplements [CLAUDE.md](../CLAUDE.md), which serves as the master implementation rules. In case of conflicts, CLAUDE.md takes precedence.

## Purpose
This document covers frontend architecture, component patterns, styling strategies, and development guidelines for the ResearchGPT web application.

---

## Stack Overview

- **React:** 18.3.1
- **Vite:** 5.1.6 (build tool)
- **TypeScript:** 5.2.2
- **TailwindCSS:** 3.4.1
- **shadcn/ui:** Component library
- **React Router DOM:** 6.22.0

---

## Project Structure

```
frontend/
├── src/
│   ├── components/          # React components
│   │   ├── ui/              # shadcn/ui base components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── label.tsx
│   │   ├── ProtectedRoute.tsx   # Auth guard (redirects to login)
│   │   ├── WizardStepper.tsx    # 3-step wizard
│   │   └── AgentLogsPanel.tsx   # Collapsible logs panel
│   ├── context/             # React contexts
│   │   └── AuthContext.tsx      # AuthProvider (session, user, loading)
│   ├── pages/               # Route pages
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── VerifyEmail.tsx
│   │   └── Callback.tsx         # Email verification callback
│   ├── lib/                 # Utilities
│   │   ├── utils.ts             # Class name utilities
│   │   └── supabaseClient.ts    # Supabase client init
│   ├── App.tsx              # Router setup
│   ├── main.tsx             # Entry point (wrapped in AuthProvider)
│   └── index.css            # Global styles
├── public/                  # Static assets
├── .env.example             # Environment variable template
├── vite.config.ts           # Vite configuration
├── tailwind.config.js       # Tailwind configuration
├── tsconfig.json            # TypeScript configuration
├── postcss.config.js        # PostCSS configuration
├── components.json          # shadcn/ui registry
└── package.json             # Dependencies
```

---

## Component Patterns

### WizardStepper Component
**Location:** [src/components/WizardStepper.tsx](frontend/src/components/WizardStepper.tsx)

Implements the 3-step research workflow:
1. **Idea** - User input for research idea
2. **Topic & Critic** - Generated topic with critic feedback
3. **Outline** - Generated research outline

**Features:**
- Visual step indicator with progress
- Next/Previous navigation
- Step-specific content rendering
- State management for current step

**Usage:**
```tsx
import { WizardStepper } from '@/components/WizardStepper'

function Page() {
  return <WizardStepper />
}
```

### AgentLogsPanel Component
**Location:** [src/components/AgentLogsPanel.tsx](frontend/src/components/AgentLogsPanel.tsx)

Collapsible panel for displaying streaming agent logs.

**Features:**
- Expand/collapse functionality
- Placeholder for SSE integration
- Clean UI with shadcn/ui Card

**Future Enhancement:**
Connect to backend SSE endpoint for live log streaming.

### shadcn/ui Components
**Location:** [src/components/ui/](frontend/src/components/ui/)

- **Button** - Multiple variants (default, outline, ghost, etc.)
- **Card** - Container with header, content, footer sections
- **Input** - Form text input
- **Label** - Form label with accessibility support

**Adding New Components:**
```bash
npx shadcn-ui@latest add [component-name]
```

---

## Styling Strategy

### TailwindCSS

**Configuration:** [tailwind.config.js](frontend/tailwind.config.js)

- Custom color scheme using CSS variables
- Dark mode support (class strategy)
- Custom animations (accordion, etc.)
- Container utilities

**Usage Example:**
```tsx
<div className="flex items-center justify-between p-6 bg-card rounded-lg">
  <h2 className="text-2xl font-semibold">Title</h2>
</div>
```

### CSS Variables
**Location:** [src/index.css](frontend/src/index.css)

Theme colors defined as CSS custom properties:
- `--background`, `--foreground`
- `--primary`, `--secondary`, `--muted`
- `--card`, `--popover`
- `--destructive`, `--border`, `--input`

**Dark Mode:**
Automatically applied with `.dark` class on root element.

### Class Utilities
**Location:** [src/lib/utils.ts](frontend/src/lib/utils.ts)

```typescript
import { cn } from '@/lib/utils'

// Merge Tailwind classes with conflict resolution
<div className={cn("base-class", conditionalClass && "active-class")} />
```

---

## Routing

**Location:** [src/App.tsx](frontend/src/App.tsx)

Routes implemented with React Router DOM:

| Path | Component | Purpose | Auth |
|------|-----------|---------|------|
| `/` | `Home` | Main wizard interface | Protected |
| `/auth/login` | `Login` | Email/password login | Public |
| `/auth/signup` | `Signup` | Email/password signup | Public |
| `/auth/verify` | `VerifyEmail` | "Check your email" message | Public |
| `/auth/callback` | `Callback` | Handles email verification redirect | Public |

**Example:**
```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/signup" element={<Signup />} />
        <Route path="/auth/verify" element={<VerifyEmail />} />
        <Route path="/auth/callback" element={<Callback />} />
      </Routes>
    </BrowserRouter>
  )
}
```

---

## Path Aliases

TypeScript and Vite configured for `@/` imports:

**tsconfig.json:**
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**vite.config.ts:**
```typescript
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Usage:**
```typescript
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```

---

## State Management

**Current:**
- Component-level state with `useState`
- **React Context** for global auth state via `AuthProvider` ([src/context/AuthContext.tsx](frontend/src/context/AuthContext.tsx)) — exposes `session`, `user`, `loading`

**Future Considerations:**
- **Zustand** - If complex state management needed
- **TanStack Query** - For server state (API calls, caching)

---

## Development Workflow

### Running Dev Server
```bash
cd frontend
npm run dev
```
Server runs on: http://localhost:5173

### Building for Production
```bash
npm run build
```
Output: `dist/` directory

### Preview Production Build
```bash
npm run preview
```

### Linting
```bash
npm run lint
```

---

## Environment Variables

**Template:** [.env.example](frontend/.env.example)

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

**Usage in Code:**
```typescript
const backendUrl = import.meta.env.VITE_BACKEND_URL
```

**Important:** All Vite env vars must be prefixed with `VITE_`

---

## Debugging Tips

### Browser DevTools
- **React DevTools:** Inspect component tree and props
- **Console:** Check for errors and warnings
- **Network Tab:** Monitor API requests and SSE connections

### Common Issues

**Path alias not resolving:**
- Restart dev server after changing tsconfig.json or vite.config.ts

**Tailwind classes not applying:**
- Ensure path is included in `tailwind.config.js` content array
- Check for typos in class names
- Verify PostCSS is processing styles

**Hot Module Replacement (HMR) not working:**
- Check console for HMR errors
- Try refreshing the page manually
- Restart dev server if needed

---

## Build Process

### Vite Build Steps
1. TypeScript compilation (`tsc`)
2. Bundle JavaScript with Rollup
3. Process CSS with PostCSS/Tailwind
4. Optimize assets (minification, tree-shaking)
5. Generate `dist/` output

### Build Optimization
- **Code Splitting:** Automatic with dynamic imports
- **Tree Shaking:** Unused code removed
- **Minification:** JavaScript and CSS minified
- **Asset Hashing:** Cache-busting filenames

---

## Future Enhancements

### SSE Integration
Connect AgentLogsPanel to backend SSE endpoint:
```typescript
const eventSource = new EventSource('http://localhost:8000/stream/logs')
eventSource.onmessage = (event) => {
  const log = JSON.parse(event.data)
  // Update logs state
}
```

### Form Validation
Consider adding:
- **React Hook Form** - Form state management
- **Zod** - Schema validation

---

## References

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [TailwindCSS Documentation](https://tailwindcss.com/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [React Router Documentation](https://reactrouter.com/)
