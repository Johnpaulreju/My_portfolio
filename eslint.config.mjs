import nextVitals from "eslint-config-next/core-web-vitals"

export default [
  ...nextVitals,
  // Surface the new React Compiler diagnostics while preserving the existing lint gate.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "react-hooks/globals": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  { ignores: [".next/**", "node_modules/**", ".cache/**", "next-env.d.ts"] },
]
