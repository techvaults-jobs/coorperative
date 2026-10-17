/**
 * The parts of the core domain that are safe to ship to the browser: no Node built-ins.
 * Client components import from "@techvaults/core/browser"; the audit chain (node:crypto)
 * stays server-side.
 */
export * from "./money.js";
export * from "./ledger.js";
export * from "./permissions.js";
export * from "./configuration.js";
export * from "./loans.js";
export * from "./products.js";
export * from "./payroll.js";
export * from "./importing.js";
