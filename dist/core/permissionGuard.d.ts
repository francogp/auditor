/**
 * Polyfills fs.fsync / fs.fsyncSync / FileHandle.prototype.sync as safe no-ops under Node.js --permission model.
 * Under Node.js permission model, fsync is unconditionally disabled with ERR_ACCESS_DENIED,
 * causing tools like Stylelint --fix or atomic file writers to fail even when --allow-fs-write=* is granted.
 */
export declare function polyfillPermissionModelFsync(): void;
export interface PermissionRequirements {
    fsRead?: string[];
    fsWrite?: string[];
    child?: boolean;
    worker?: boolean;
}
/**
 * assertRequiredPermissions
 *
 * Verifies required Node.js 26 native permissions via process.permission.has().
 * Gracefully no-ops when Node is executed without the experimental permission model.
 */
export declare function checkRequiredPermissions(requirements: PermissionRequirements): string[];
export declare function assertRequiredPermissions(requirements: PermissionRequirements): void;
//# sourceMappingURL=permissionGuard.d.ts.map