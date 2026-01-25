/**
 * Ambient Type Declarations
 * 
 * This file contains type declarations for third-party packages that don't have
 * official @types packages available. These are stub declarations that allow
 * TypeScript to compile without errors when these packages are referenced.
 * 
 * These packages are typically internal dependencies of development tools
 * (like ESLint, Jest, Istanbul) and don't need full type definitions.
 * 
 * Location: This file is automatically included via tsconfig.json's typeRoots
 * configuration which includes "./src/types" directory.
 */

declare module 'eslint' {
  const eslint: any;
  export = eslint;
}

declare module 'eslint-scope' {
  const eslintScope: any;
  export = eslintScope;
}

declare module 'istanbul-lib-coverage' {
  const istanbulLibCoverage: any;
  export = istanbulLibCoverage;
}

declare module 'istanbul-lib-report' {
  const istanbulLibReport: any;
  export = istanbulLibReport;
}

declare module 'istanbul-reports' {
  const istanbulReports: any;
  export = istanbulReports;
}

declare module 'phoenix' {
  const phoenix: any;
  export = phoenix;
}

declare module 'stack-utils' {
  const stackUtils: any;
  export = stackUtils;
}


