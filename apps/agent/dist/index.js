#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agentInfoSchema, RACKORA_VERSION, } from "@rackora/shared";
export function getAgentInfo() {
    return agentInfoSchema.parse({
        name: "rackora-agent",
        version: RACKORA_VERSION,
        status: "idle",
    });
}
export function formatAgentStatus(info) {
    return `rackora-agent v${info.version} — status: ${info.status}`;
}
export function run() {
    const info = getAgentInfo();
    console.log(formatAgentStatus(info));
}
const entry = process.argv[1];
if (entry !== undefined &&
    path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url))) {
    run();
}
//# sourceMappingURL=index.js.map