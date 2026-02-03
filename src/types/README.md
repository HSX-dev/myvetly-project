# Type Definitions Directory

This directory contains custom TypeScript type definitions for the project.

## Files

### `ambient.d.ts`
Contains ambient type declarations for third-party packages that don't have official `@types` packages. These are stub declarations that prevent TypeScript compilation errors.

**Usage:**
- Automatically included via `tsconfig.json`'s `typeRoots` configuration
- No need to import - TypeScript will automatically pick up these declarations
- Used for packages like `eslint-scope`, `istanbul-*`, `phoenix`, `stack-utils`

**When to add new declarations:**
- When you get TypeScript errors about missing type definitions
- Only for packages that don't have `@types` packages available
- Prefer installing `@types/*` packages when available

## How It Works

The `tsconfig.json` includes this directory in `typeRoots`:
```json
{
  "compilerOptions": {
    "typeRoots": ["./node_modules/@types", "./src/types"]
  }
}
```

This tells TypeScript to look for type definitions in both:
1. `node_modules/@types` - Official type packages
2. `./src/types` - Custom type definitions (this directory)

Any `.d.ts` files in this directory will be automatically included in the TypeScript compilation.








