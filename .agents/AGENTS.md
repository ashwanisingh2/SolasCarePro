# SolasCarePro Workspace Rules

These design consistency rules apply to all new and modified React/Electron components in this workspace:

## 1. Color Palette
- **Backgrounds**: `bg-brand-navy` (#0F172A) for outer containers, `bg-slate-900` for panels.
- **Accent Primary**: `text-brand-violet` (#8B5CF6) and `border-brand-violet`.
- **Accent Secondary**: `text-brand-cyan` (#06B6D4).
- **Success States**: `text-emerald-400` / `bg-emerald-950/30`.
- **Warning States**: `text-amber-400` / `bg-amber-950/30`.
- **Danger States**: `text-rose-400` / `bg-rose-950/30`.
- **Info States**: `text-blue-400` / `bg-blue-950/30`.

## 2. Glass Panels
- Use `className="glass-panel"` (defined in [index.css](file:///C:/Users/SPTL/SolasCarePro/src/index.css)) for main content wrappers and containers.

## 3. Buttons & Interactive Controls
- Include a loading spinner (using `Loader2` from `lucide-react` with `animate-spin` class) when an asynchronous action is executing.
- Disable the button during load/execution.
- Provide clear success/error state feedback for a minimum of 2 seconds after completion, then reset the button state back to default.

## 4. Data-Fetching & API Calls
- Display a loading skeleton (gray pulse bars using `animate-pulse`) while waiting for data.
- Handle failure/errors gracefully with a dedicated error state and a visible **Retry** button.
- Provide a clean empty state with a descriptive message if no items are returned.

## 5. Transitions & Animations
- Use `framer-motion` for panel transitions to match the existing user interface.

## 6. Typography
- Use `font-semibold` for labels and form tags.
- Use `text-slate-400` for secondary descriptions and minor text.
- Use `text-white` for primary headers and emphasis.

## 7. Responsive & Fluid Sizing
- Never use hardcoded pixel sizes in CSS/styling. Only use Tailwind CSS spacing and dimension utilities (e.g., `h-64`, `w-full`, `p-4`).
