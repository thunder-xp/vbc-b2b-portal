import { accessSync, constants, statSync } from "node:fs";
import { dirname } from "node:path";

import { loadConfig } from "../src/config.mjs";

const [major, minor] = process.versions.node.split(".").map(Number);
const nodeSupported = major === 24 && minor >= 2;
const config = loadConfig();
let databaseDirectoryWritable = false;
try {
  const directory = dirname(config.databasePath);
  accessSync(directory, constants.W_OK);
  databaseDirectoryWritable = statSync(directory).isDirectory();
} catch {
  databaseDirectoryWritable = false;
}

const report = {
  nodeVersion: process.versions.node,
  nodeSupported,
  bindAddress: config.host,
  port: config.port,
  databaseDirectoryWritable,
  authenticationConfigured: config.authenticationConfigured,
  providerConfigured: config.providerConfigured,
  ready: nodeSupported && databaseDirectoryWritable && config.authenticationConfigured && config.providerConfigured,
};
console.log(JSON.stringify(report, null, 2));
if (!report.ready) process.exitCode = 1;
