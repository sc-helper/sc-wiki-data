declare global {
  var mapVersion: string;
}

declare module '*.webp' {
  const value: string;
  export default value;
}

export {};
