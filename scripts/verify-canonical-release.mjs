import { spawnSync } from "node:child_process";

const commands = process.platform === "win32"
  ? [
      [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm run test:release-governance"]],
      [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm run verify:migration-files"]],
      [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npx tsc --noEmit"]],
      [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm run test:commercial-core"]],
      [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm run build"]],
    ]
  : [
      ["npm", ["run", "test:release-governance"]],
      ["npm", ["run", "verify:migration-files"]],
      ["npx", ["tsc", "--noEmit"]],
      ["npm", ["run", "test:commercial-core"]],
      ["npm", ["run", "build"]],
    ];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Canonical release gate passed.");
