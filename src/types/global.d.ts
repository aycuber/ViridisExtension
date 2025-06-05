/* Pull in the ambient declarations for the Chrome MV3 APIs */
/// <reference types="chrome-types" />

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}