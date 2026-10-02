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