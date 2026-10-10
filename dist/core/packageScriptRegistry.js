/**
 * packages/auditor/src/core/packageScriptRegistry.ts
 *
 * CENTRALIZED PACKAGE SCRIPTS REGISTRY (Node.js 26+ Native)
 * Allows the core framework, built-in sub-auditors, and user-extended modules
 * to dynamically register recommended package.json scripts and CLI invocations.
 */
export const CORE_PACKAGE_SCRIPT_REQUIREMENTS = [
    // Core Auditor Invocations
    {
        name: 'auditor',
        command: 'auditor',
        description: 'Ejecución del orquestador completo de auditoría estática y arquitectura',
        category: 'core'
    },
    {
        name: 'auditor:fix',
        command: 'auditor fix',
        description: 'Modo de auto-reparación mecánica y scaffolding de configuraciones',
        category: 'core'
    },
    {
        name: 'auditor:by-file',
        command: 'auditor-by-file',
        description: 'Desglose detallado de hallazgos ordenados por archivo y línea',
        category: 'reporting'
    },
    {
        name: 'auditor:lint',
        command: 'auditor preset=lint',
        description: 'Preset rápido de linter y análisis estático (ast, eslint, markdown)',
        category: 'core'
    },
    {
        name: 'auditor:md',
        command: 'auditor preset=md',
        description: 'Preset rápido de documentación y markdown (enlaces relativos e índices DOX)',
        category: 'core'
    },
    {
        name: 'auditor:build',
        command: 'auditor preset=build',
        description: 'Preset de validación post-compilación sobre artefactos distribuidos en dist/',
        category: 'core'
    },
    {
        name: 'build:prod',
        command: 'auditor-build-prod',
        description: 'Compilación de producción bajo AUDITOR_ENV=production (omite similar-code y cobertura)',
        category: 'core'
    },
    {
        name: 'auditor:changed',
        command: 'auditor changed-since=main',
        description: 'Auditoría incremental acotada a diferencias respecto a la rama principal',
        category: 'core'
    },
    // Versioning and Lifecycle Maintenance
    {
        name: 'auditor:update',
        command: 'auditor-update',
        description: 'Actualización y sincronización automática del paquete @francogp/auditor',
        category: 'lifecycle'
    },
    {
        name: 'auditor:version',
        command: 'auditor-version',
        description: 'Diagnóstico e inspección de versión del motor auditor',
        category: 'lifecycle'
    },
    {
        name: 'version:analyze',
        command: 'auditor-version analyze',
        description: 'Análisis estático de cambios y cálculo de incremento de versión semántica',
        category: 'versioning'
    },
    {
        name: 'version:bump',
        command: 'auditor-version bump',
        description: 'Incremento atómico de versión en package.json y commit histórico',
        category: 'versioning'
    },
    // Reports and CLI Diagnostic Tools
    {
        name: 'auditor:findings',
        command: 'auditor-findings',
        description: 'Visor de hallazgos en formato Box-Drawing de 80 columnas',
        category: 'reporting'
    },
    {
        name: 'auditor:errors',
        command: 'auditor-findings severity=error',
        description: 'Filtro de hallazgos exclusivo para errores bloqueantes',
        category: 'reporting'
    },
    {
        name: 'auditor:warnings',
        command: 'auditor-findings severity=warning',
        description: 'Filtro de hallazgos exclusivo para advertencias de deuda técnica',
        category: 'reporting'
    },
    {
        name: 'auditor:summary',
        command: 'auditor-findings',
        description: 'Resumen consolidado de métricas y violaciones de la última auditoría',
        category: 'reporting'
    },
    {
        name: 'auditor:files',
        command: 'auditor-findings files',
        description: 'Lista consolidada de archivos con violaciones de arquitectura',
        category: 'reporting'
    },
    {
        name: 'auditor:complexity',
        command: 'auditor-complexity',
        description: 'Diagnóstico de complejidad ciclomática y refactoring targets de Fallow',
        category: 'reporting'
    },
    {
        name: 'auditor:similar',
        command: 'auditor-similar',
        description: 'Detección de código duplicado semántico por vectores Candle CPU',
        category: 'reporting',
        isApplicable: (config) => config.fallow?.similarCode?.enabled !== false
    },
    {
        name: 'auditor:review',
        command: 'auditor-review',
        description: 'Revisión arquitectónica de diffs contra grafo estático de Fallow',
        category: 'reporting'
    },
    {
        name: 'auditor:guard',
        command: 'auditor-guard',
        description: 'Barrera de control de sanidad y bloqueo de regresiones',
        category: 'reporting'
    },
    {
        name: 'auditor:flags',
        command: 'auditor-flags',
        description: 'Auditoría de feature flags y dead-code derivado de condicionales',
        category: 'reporting'
    },
    {
        name: 'auditor:coverage-gaps',
        command: 'auditor-fallow category=coverage-gaps',
        description: 'Brechas de cobertura y código no ejecutado detectado por Fallow',
        category: 'reporting'
    },
    // Fallow Categories
    {
        name: 'auditor:fallow:dupes',
        command: 'auditor-fallow category=dupes',
        description: 'Detección de bloques de código duplicados sintácticos vía Fallow',
        category: 'fallow',
        isApplicable: (config) => config.fallow?.enabled !== false
    },
    {
        name: 'auditor:fallow:circular',
        command: 'auditor-fallow category=circular',
        description: 'Detección de dependencias circulares entre módulos vía Fallow',
        category: 'fallow',
        isApplicable: (config) => config.fallow?.enabled !== false
    },
    {
        name: 'auditor:fallow:exports',
        command: 'auditor-fallow category=exports',
        description: 'Detección de exportaciones huérfanas y símbolos no importados',
        category: 'fallow',
        isApplicable: (config) => config.fallow?.enabled !== false
    },
    {
        name: 'auditor:fallow:security',
        command: 'auditor-fallow category=security',
        description: 'Escaneo estático de vulnerabilidades y sinks de seguridad CWE',
        category: 'fallow',
        isApplicable: (config) => config.fallow?.enabled !== false && config.fallow?.security?.enabled !== false
    },
    {
        name: 'auditor:fallow:dead-code',
        command: 'auditor-fallow category=dead-code',
        description: 'Detección de archivos muertos y código no referenciado vía Fallow',
        category: 'fallow',
        isApplicable: (config) => config.fallow?.enabled !== false
    },
    {
        name: 'auditor:fallow:suppressions',
        command: 'auditor-fallow category=suppressions',
        description: 'Auditoría de marcadores de supresión activos de fallow-ignore',
        category: 'fallow',
        isApplicable: (config) => config.fallow?.enabled !== false
    },
    {
        name: 'auditor:fallow:flags',
        command: 'auditor-fallow category=flags',
        description: 'Auditoría de feature flags y código condicional vía Fallow',
        category: 'fallow',
        isApplicable: (config) => config.fallow?.enabled !== false
    },
    {
        name: 'auditor:fallow:viz',
        command: 'auditor-fallow category=viz',
        description: 'Generación de mapa interactivo HTML de arquitectura vía Fallow',
        category: 'fallow',
        isApplicable: (config) => config.fallow?.enabled !== false
    },
    // Family Invocations
    {
        name: 'auditor:family:architecture',
        command: 'auditor family=architecture',
        description: 'Ejecución de la familia de arquitectura, estándares AST y Fallow',
        category: 'family'
    },
    {
        name: 'auditor:family:domain',
        command: 'auditor family=domain_data',
        description: 'Ejecución de la familia de tipos de dominio y cuadros de datos',
        category: 'family',
        isApplicable: (config) => config.domain?.enabled !== false
    },
    {
        name: 'auditor:family:persistence',
        command: 'auditor family=persistence',
        description: 'Ejecución de la familia de persistencia, SQL y migraciones',
        category: 'family',
        isApplicable: (config) => config.persistence?.engine !== 'none'
    },
    // Standard Linter Aliases
    {
        name: 'lint',
        command: 'npm run auditor:lint',
        description: 'Alias canónico de linter delegando en auditor preset=lint',
        category: 'aliases'
    },
    {
        name: 'lint:fix',
        command: 'auditor preset=lint fix',
        description: 'Reparación automática rápida de violaciones de linting',
        category: 'aliases'
    }
];
export class PackageScriptRegistry {
    static requirements = new Map();
    static {
        this.reset();
    }
    /**
     * Registers a single package script requirement.
     * Throws an explicit error if a script name collides with another registered command.
     */
    static register(requirement, sourceId) {
        if (!requirement || !requirement.name || !requirement.command)
            return;
        const existing = this.requirements.get(requirement.name);
        if (existing) {
            if (existing.requirement.command === requirement.command) {
                return;
            }
            throw new Error(`[COLISIÓN DE COMANDOS] El comando de script '${requirement.name}' está duplicado entre '${existing.sourceId ?? 'core'}' ` +
                `('${existing.requirement.command}') y '${sourceId ?? 'desconocido'}' ('${requirement.command}'). ` +
                `Cada sub-auditor y extensión DEBE declarar nombres de comandos únicos en package.json. ` +
                `Cambia el nombre del comando para resolver la colisión.`);
        }
        this.requirements.set(requirement.name, { requirement, sourceId });
    }
    /**
     * Registers multiple package script requirements.
     */
    static registerMany(requirements, sourceId) {
        for (const req of requirements) {
            this.register(req, sourceId);
        }
    }
    /**
     * Retrieves a registered package script requirement by script name.
     */
    static get(name) {
        return this.requirements.get(name)?.requirement;
    }
    /**
     * Checks whether a package script requirement is already registered.
     */
    static has(name) {
        return this.requirements.has(name);
    }
    /**
     * Returns all currently registered package script requirements.
     */
    static getAll() {
        return Array.from(this.requirements.values()).map(v => v.requirement);
    }
    /**
     * Resets the registry back to core framework defaults.
     */
    static reset() {
        this.requirements.clear();
        for (const req of CORE_PACKAGE_SCRIPT_REQUIREMENTS) {
            this.requirements.set(req.name, { requirement: req, sourceId: 'framework:core' });
        }
    }
}
//# sourceMappingURL=packageScriptRegistry.js.map