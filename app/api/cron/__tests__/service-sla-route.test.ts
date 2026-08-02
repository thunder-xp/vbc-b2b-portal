import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
describe("service SLA schedule",()=>{it("uses shared cron authorization and an hourly bounded worker",()=>{const route=readFileSync("app/api/cron/service-sla/route.ts","utf8"),vercel=readFileSync("vercel.json","utf8");expect(route).toContain("authorizeCronRequest");expect(route).toContain('run_service_sla_worker');expect(route).toContain("p_batch_size:100");expect(vercel).toContain('"path": "/api/cron/service-sla"');expect(vercel).toContain('"schedule": "20 * * * *"')})});
