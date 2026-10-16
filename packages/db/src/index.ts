export { connect } from './client.js';
export type { Db, DbConnection } from './client.js';
export * as schema from './schema/index.js';
export { applyMigrations, dropAllObjects } from './migrate/runner.js';
export type { MigrationReport } from './migrate/runner.js';
export { expectedRolePermissionPairs, syncRolePermissions } from './seed/catalog.js';
export { DEV_ESTANCIAS, DEV_ROOMS, DEV_SCHOOL_YEAR, assertSeedAllowed, devUserEmail, seedDevelopmentData } from './seed/dev.js';
