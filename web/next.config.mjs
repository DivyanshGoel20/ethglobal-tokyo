import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read parent root .env if it exists
const parentEnvPath = path.resolve(__dirname, "../.env");
const customEnv = {};
if (fs.existsSync(parentEnvPath)) {
  const content = fs.readFileSync(parentEnvPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      customEnv[key] = val;
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@worldcoin/idkit", "@worldcoin/idkit-core"],
  env: {
    ...customEnv,
  },
};

export default nextConfig;
