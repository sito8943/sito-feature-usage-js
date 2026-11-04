import { readFileSync } from "node:fs";
import { cwd } from "node:process";
import typescript from "@rollup/plugin-typescript";

const pkg = JSON.parse(readFileSync(`${cwd()}/package.json`, "utf8"));

export default {
  input: {
    index: "src/index.ts",
    "react/index": "src/react/index.tsx",
  },
  output: [
    {
      dir: "dist",
      format: "esm",
      entryFileNames: "[name].js",
    },
    {
      dir: "dist",
      format: "cjs",
      entryFileNames: "[name].cjs",
      // Shared chunks must be .cjs too: the package is "type": "module", so a .js chunk would be
      // parsed as ESM when require()d.
      chunkFileNames: "[name]-[hash].cjs",
    },
  ],
  plugins: [
    typescript({
      declaration: true,
      declarationDir: "dist",
      exclude: ["test/**"],
    }),
  ],
  external: [
    "react",
    "react/jsx-runtime",
    ...Object.keys(pkg.peerDependencies ?? {}),
  ],
};
