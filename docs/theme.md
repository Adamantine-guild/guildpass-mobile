# Theme & Dark Mode

GuildPass Mobile uses NativeWind v2 for styling, integrating Tailwind CSS utilities into React Native. The application fully supports both light and dark modes based on the user's OS preference.

## Dark Mode Implementation

We use NativeWind's `dark:` variant to style components for dark mode. Instead of maintaining separate stylesheets or using React Native's `StyleSheet`, all components under `app/` are styled exclusively with NativeWind `className` utilities to ensure dynamic theming.

**Common Patterns:**
- Backgrounds: `bg-background` -> `dark:bg-slate-900`
- Text: `text-text` -> `dark:text-slate-100`
- Muted Text: `text-text-muted` -> `dark:text-slate-400`
- Borders: `border-border` -> `dark:border-slate-700`
- Cards: `bg-white` -> `dark:bg-slate-800`

## Fixed-Color Exceptions

Certain elements in the application intentionally do not adapt to dark mode and use fixed colors:

1. **Brand Primary Accents**: The GuildPass brand color (`bg-primary`, `text-primary`) is intentionally kept identical across both light and dark modes to maintain brand consistency. It is legible on both `bg-white` and `dark:bg-slate-900`.
2. **Alert/Status Accents**: While status colors (success, error, amber) have dark variants (e.g. `dark:text-green-400`), their specific `primary` status badges remain fixed when used for interactive buttons.

## Guidelines for Developers

1. **Do not use `StyleSheet.create`** for components that need to respond to theme changes. `StyleSheet` definitions are statically evaluated and will not re-render dynamically when the OS appearance changes. Use NativeWind's `className` props instead.
2. **Avoid Hardcoded Hex Colors**: Always use tailwind token classes defined in `tailwind.config.js`.
3. **Always specify dark mode text colors**: Explicitly declare `dark:text-slate-100` or similar for textual content, as React Native `Text` components may fall back to default black in some environments, rendering invisible on dark backgrounds.
