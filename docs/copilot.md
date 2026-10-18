# Estrategias Eficientes para Refactorizar Código Duplicado en Proyectos TypeScript

## Introducción

La duplicación de código es uno de los principales factores que degradan la mantenibilidad, escalabilidad y calidad de los proyectos de software, especialmente en bases de código grandes y en evolución como las desarrolladas en TypeScript. Herramientas modernas de análisis estático, como Fallow, permiten detectar de manera precisa bloques duplicados o triplicados, pero la remediación efectiva de estos clones requiere una estrategia técnica rigurosa, la selección adecuada de herramientas y un flujo de trabajo que minimice riesgos y maximice el retorno de inversión. Este informe analiza en profundidad las mejores estrategias para refactorizar proyectos TypeScript tras la detección de duplicación, evaluando la eficiencia de distintas aproximaciones, el ecosistema de herramientas y librerías, la posibilidad de crear utilidades propias, y proponiendo un pipeline recomendado, todo ello fundamentado en referencias técnicas actuales y experiencias de la industria.

## **1\. Diagnóstico y Detección de Duplicación con Fallow**

### 1.1. Interpretación de los Reportes de Fallow

Fallow es una herramienta de inteligencia de código para TypeScript y JavaScript que analiza el repositorio como un grafo unificado, reportando duplicación, complejidad, salud, drift arquitectónico y código no utilizado en una sola pasada

Google Drive

Google Drive. Documento sin título

. Su motor, construido en Rust sobre Oxc y paralelizado con rayon, permite analizar proyectos de hasta 20.000 archivos en menos de 3 segundos, identificando tanto duplicaciones literales como variantes semánticas mediante arreglos de sufijos y algoritmos LCP (Longest Common Prefix)

Google Drive

Google Drive. Documento sin título

.

El reporte de duplicación de Fallow incluye:

- **clone\_groups\[\]**: Grupos de bloques duplicados, cada uno con fingerprint, cantidad de tokens, dispersión (spread) y lista de instancias (archivo y rango de líneas).
- **clone\_families\[\]**: Familias de clones que co-ocurren en los mismos archivos, con directivas prescriptivas (extract function o extract module).
- **actions\[\]**: Sugerencias de remediación automática, incluyendo la eliminación de código muerto duplicado.
- **Métricas de dispersión y ranking**: Priorización de clones según tamaño, número de ocurrencias y distancia en el árbol de directorios.

Esta granularidad permite filtrar y priorizar los clones de mayor impacto, evitando el refactorizado de duplicaciones triviales o de bajo retorno

Google Drive

Google Drive. Documento sin título

.

### 1.2. Algoritmos y Modos de Detección de Clones

Fallow soporta varios modos de detección:

| Modo en Fallow | Tipo de Clon Detectado                  | Implicación para la Refactorización          |
| :------------- | :-------------------------------------- | :------------------------------------------- |
| strict / mild  | Copias literales (Tipo 1\)              | Extracción directa, reemplazo mecánico       |
| weak           | Literales variables (Tipo 1.5)          | Extracción parametrizada                     |
| semantic       | Renombrado de identificadores (Tipo 2\) | Unificación con metavariables y genéricos    |
| near           | Casi-clones (Tipo 3, ≥80% similitud)    | Requiere callbacks, opciones o condicionales |
| similar-code   | Intención similar (Tipo 4\)             | Revisión manual, branch by abstraction       |

La configuración recomendada es filtrar por minOccurrences: 3 (Regla de Tres), enfocando el esfuerzo en clones triplicados o más, que son los verdaderos generadores de deuda técnica y errores futuros

Google Drive

Google Drive. Documento sin título

.

## **2\. Estrategias de Refactorización para Código Duplicado en TypeScript**

### 2.1. Principios y Patrones de Refactorización

La refactorización consiste en mejorar la estructura del código sin alterar su comportamiento observable. En el contexto de duplicación, los patrones más efectivos son:

- **Extract Function/Method**: Extraer el bloque duplicado a una función parametrizada, reemplazando las ocurrencias originales por llamadas a la nueva abstracción
- Visual Studio Code
- Visual Studio Code. Refactoring TypeScript \- Visual Studio Code
- .
- **Extract Module**: Cuando los clones se distribuyen en varios archivos, extraer a un módulo compartido, gestionando dependencias y rutas de importación.
- **Parametrización de literales y variables**: Convertir diferencias menores en parámetros de entrada o diccionarios de configuración.
- **Unificación de tipos**: Aprovechar el sistema de tipos de TypeScript para definir interfaces, genéricos o uniones que absorban variantes entre clones.

El sistema de tipos de TypeScript es un aliado clave: al renombrar símbolos, cambiar firmas o mover código, el compilador y el servidor de lenguaje (LSP) alertan de todos los usos afectados, permitiendo refactorizaciones seguras y deterministas

Visual Studio Code

Visual Studio Code. Refactoring TypeScript \- Visual Studio Code

.

### 2.2. Refactorización Manual vs. Automatizada

- **Manual**: Adecuada para clones simples, funciones cortas o cuando se requiere juicio semántico para diseñar la abstracción. El uso del servidor de lenguaje en el IDE (VSCode, CodeLens, TypeLens) permite renombrar, extraer función, mover archivos y actualizar imports de forma segura y contextual
- Visual Studio Code+1
- Visual Studio Code. Refactoring TypeScript \- Visual Studio Code
- Visual Studio Marketplace. TypeLens \- Visual Studio Marketplace
- .
- **Automatizada**: Esencial para clones masivos, refactorizaciones repetitivas o multiarchivo. Requiere herramientas que operen sobre el AST y el grafo de tipos, evitando la edición textual frágil y los errores de contexto
- Google Drive
- Google Drive. Documento sin título
- .

## **3\. Ecosistema de Herramientas y Librerías para Refactorización en TypeScript**

### 3.1. Motores Sintácticos y de Reescritura Estructural

#### ast-grep y GritQL

- **ast-grep**: Motor en Rust basado en Tree-sitter, permite búsqueda y reemplazo estructural usando patrones con metavariables (\$META, \$\$ARGS), reglas YAML y transformaciones Find & Patch. Es ultra-rápido y adecuado para reemplazos masivos de clones, aunque carece de conciencia de tipos entre archivos
- Google Drive
- Google Drive. Documento sin título
- .
- **GritQL/Biome**: DSL lógico para consultas sobre el CST, ideal para migraciones compuestas y reglas contextuales. Permite condicionar transformaciones a la presencia de otros patrones en el archivo.

#### Limitaciones

Ambos motores son puramente sintácticos: no resuelven tipos, referencias cruzadas ni rutas de importación, por lo que su uso debe complementarse con herramientas semánticas para refactorizaciones profundas

Google Drive

Google Drive. Documento sin título

.

### 3.2. Librerías de Manipulación Semántica y Codemods

#### ts-morph

- **ts-morph**: Envoltorio de alto nivel sobre la API del compilador de TypeScript. Permite manipular nodos AST preservando formato, gestionar imports, calcular rutas relativas, encontrar referencias y modificar el grafo de tipos. Es la base para codemods programáticos y refactorizaciones multiarchivo seguras
- codemod.com+1
- codemod.com. Codemod AI Now Supports ts-morph | Codemod Blog
- Google Drive. Documento sin título
- .

#### jscodeshift y Putout

- **jscodeshift**: Framework de codemods sobre Babel, soporta TypeScript mediante plugins. Adecuado para transformaciones programáticas, aunque menos eficiente que motores nativos en Rust
- Github
- Github. chimurai/jscodeshift-typescript-example \- GitHub
- .
- **Putout**: Plugin para transformaciones automáticas sobre el AST, útil para limpiezas y refactorizaciones simples.

### 3.3. Herramientas Híbridas: ts-surgeon

- **ts-surgeon**: Fusiona la velocidad de ast-grep con la inteligencia semántica de ts-morph. Permite filtrar coincidencias sintácticas por predicados de tipo (is, extends, assignable), mover símbolos entre archivos con resolución automática de dependencias y ejecutar operaciones batch compartiendo el AST en memoria. Es la herramienta más avanzada para refactorización determinista y multiarchivo en TypeScript
- Google Drive
- Google Drive. Documento sin título
- .

### 3.4. Herramientas de Detección y Métricas

- **Fallow**: Detección de duplicación, código muerto, complejidad, drift arquitectónico y health score en una sola pasada. Soporta integración en CI/CD y generación de línea base para evitar regresiones de duplicación
- Google Drive
- Google Drive. Documento sin título
- .
- **ts-analyzer**: Analiza cobertura de tipos, complejidad ciclomática, duplicación, code smells y dependencias circulares, generando reportes en JSON, HTML y dashboards interactivos
- Github
- Github. GitHub \- amir-valizadeh/ts-analyzer: A comprehensive TypeScript ...
- .
- **SonarQube, CodeScene, CodeClimate**: Plataformas de análisis estático y métricas de calidad, útiles para priorizar refactorizaciones y visualizar hotspots
- webdevtutor.net
- webdevtutor.net. Understanding TypeScript Code Metrics: A Comprehensive Guide
- .

### 3.5. Automatización Asistida por IA y Agentes

- **GitHub Copilot Agent Mode, Claude Code, Cursor**: Agentes de codificación capaces de planificar y ejecutar tareas multiarchivo, abrir PRs y auto-corrigiendo errores. Su eficiencia depende de la integración con servidores MCP y herramientas estructurales; colapsan ante refactorizaciones masivas si operan solo con edición textual o contexto completo de archivos
- baeseokjae.github.io+1
- baeseokjae.github.io. GitHub Copilot Agent Mode Guide 2026: Multi-File Edits and Autonomous ...
- Google Drive. Documento sin título
- .

## **4\. Ventajas y Desventajas de las Opciones de Refactorización**

### 4.1. Uso de Herramientas Existentes

**Ventajas:**

- Velocidad y precisión determinista en detección y transformación.
- Integración con CI/CD, IDEs y flujos de revisión.
- Soporte para refactorizaciones multiarchivo, preservando formato y rutas de importación.
- Validación automática de tipos y referencias cruzadas.
- Reducción drástica de errores humanos y regresiones
- Google Drive
- Google Drive. Documento sin título
- .

**Desventajas:**

- Curva de aprendizaje para escribir reglas AST o codemods.
- Limitaciones en refactorizaciones semánticas complejas (diseño de abstracciones).
- Dependencia de la actualización y compatibilidad de las herramientas con nuevas versiones de TypeScript.

### 4.2. Desarrollo de Herramientas Propias

**Ventajas:**

- Adaptación total a los flujos y convenciones del equipo.
- Orquestación personalizada de herramientas existentes (arnés propio).
- Posibilidad de integrar lógica de negocio, validaciones y métricas específicas.

**Desventajas:**

- Alto coste de desarrollo y mantenimiento si se intenta replicar motores de análisis o transformación desde cero.
- Riesgo de errores y deuda técnica si no se apalancan librerías maduras.
- Requiere inversión en testing, documentación y gobernanza interna
- Google Drive
- Google Drive. Documento sin título
- .

### 4.3. Refactorización Manual Asistida por IDE

**Ventajas:**

- Control total y juicio humano en cada paso.
- Integración nativa con el servidor de lenguaje, CodeLens, TypeLens y Quick Fixes.
- Adecuada para clones simples o refactorizaciones locales.

**Desventajas:**

- Impracticable para clones masivos o dispersos en muchos archivos.
- Propensa a errores de omisión, especialmente en proyectos grandes.
- No escala para refactorizaciones repetitivas o multiarchivo
- Visual Studio Code+1
- Visual Studio Code. Refactoring TypeScript \- Visual Studio Code
- Visual Studio Marketplace. TypeLens \- Visual Studio Marketplace
- .

### 4.4. Automatización Asistida por IA/Agentes

**Ventajas:**

- Capacidad de sintetizar abstracciones y patrones a partir de ejemplos.
- Integración con flujos de PR, generación de tests y documentación.
- Eficiencia en tareas bien acotadas y repetitivas.

**Desventajas:**

- Latencia y consumo de recursos elevado si operan sobre archivos completos.
- Riesgo de alucinaciones, omisión de casos borde y errores en firmas de tipos.
- Necesidad de integración con herramientas estructurales para evitar bloqueos y errores de contexto
- Google Drive+1
- Google Drive. Documento sin título
- baeseokjae.github.io. GitHub Copilot Agent Mode Guide 2026: Multi-File Edits and Autonomous ...
- .

## **5\. Flujo de Trabajo Recomendado para Refactorizar Duplicados Detectados**

### 5.1. Resumen del Pipeline Determinista

El flujo óptimo combina la detección estructural de Fallow, la síntesis acotada de abstracciones (humana o asistida por IA), la aplicación de transformaciones sobre el AST (ast-grep, ts-morph, ts-surgeon) y la validación automática en CI/CD. La clave es evitar la edición textual manual y la recarga innecesaria del compilador, orquestando las herramientas en un arnés propio ligero

Google Drive

Google Drive. Documento sin título

.

#### Tabla Comparativa de Estrategias

| Etapa del Proceso            | Flujo Tradicional (Manual/Agente) | Arnés Híbrido Determinista (Recomendado)           |
| :--------------------------- | :-------------------------------- | :------------------------------------------------- |
| Descubrimiento               | Búsqueda textual, grep, regex     | Fallow dupes \+ dead-code, minOccurrences: 3       |
| Ingesta de Contexto          | Lectura de archivos completos     | Extracción de rangos de líneas reportados (+5)     |
| Rol del Agente/Desarrollador | Edición manual línea a línea      | Síntesis de función y patrón AST (solo fragmentos) |
| Mutación y Cableado          | Parches secuenciales, recarga tsc | AST en memoria, importación automática             |
| Verificación y Cierre        | Prueba y error, revisión manual   | Fallow audit, fix, actualización de línea base     |

### 5.2. Implementación Paso a Paso

#### Fase 1: Detección y Priorización

- Ejecutar npx fallow dead-code \--include-dupes \--format json \--quiet para eliminar duplicados muertos.
- Ejecutar npx fallow dupes \--min-occurrences 3 \--mode semantic \--format json \--quiet para identificar clones triplicados de alto impacto.
- Procesar clone\_groups\[\] y clone\_families\[\] en orden de prioridad (spread-aware ranking)
- Google Drive
- Google Drive. Documento sin título
- .

#### Fase 2: Extracción de Micro-Contexto

- Leer únicamente los rangos de líneas de cada instancia (+5 líneas de contexto).
- Calcular hash sha256 para asegurar la integridad y evitar desfases.
- Consultar tipos inferidos con ts-surgeon si es necesario.

#### Fase 3: Síntesis de Abstracción

- El agente (humano o IA) diseña la función parametrizada y el patrón de reescritura AST (ast-grep), usando metavariables para diferencias menores.
- Si el clon es una función completa, usar ts-surgeon move\_symbol\_to\_file para promoverla a un módulo compartido.

#### Fase 4: Aplicación Programática

- Script propio en TypeScript combinando @ast-grep/napi y ts-morph:
  - Crear o actualizar el módulo compartido con la función extraída.
  - Reescribir los sitios de llamada usando el patrón AST.
  - Inyectar imports idempotentes y limpiar imports huérfanos.
  - Persistir todos los cambios en una sola operación de I/O
  - Google Drive
  - Google Drive. Documento sin título
  - .

#### Fase 5: Verificación y Cierre

- Ejecutar npx fallow audit \--format json \--quiet para validar fronteras arquitectónicas y dependencias circulares.
- Ejecutar npx fallow fix \--yes \--format json \--quiet para limpiar exportaciones y miembros no utilizados.
- Actualizar la línea base con npx fallow dupes \--save-baseline fallow-baselines/dupes.json.
- Integrar fallow audit y baseline en las Pull Requests y pipelines de CI/CD para bloquear regresiones de duplicación
- Google Drive
- Google Drive. Documento sin título
- .

#### Fase 6: Estrategias para Clones Complejos y Excepciones

- Aplicar Branch by Abstraction para clones de Tipo 3/4 o funciones de alta complejidad y bajo test coverage.
- Introducir feature flags y canary releases para validar la nueva abstracción en producción de forma gradual y reversible
- iamlino.net+1
- iamlino.net. Feature flags, canary releases y el arte de no romper producción ...
- beefed.ai. Despliegues canarios y feature flags para reducir fallos
- .
- Registrar clones intencionales en .fallowrc.json para silenciar alertas y evitar refactorizaciones innecesarias.

## **6\. Pruebas, Validación y Mitigación de Riesgos**

### 6.1. Pruebas Unitarias, Integración y Mutation Testing

- Escribir o actualizar pruebas unitarias para la nueva función/módulo extraído, cubriendo casos borde y variantes de entrada
- xjavascript.com+1
- xjavascript.com. Mastering TypeScript Unit Testing: A Comprehensive Guide
- Reintech. JavaScript Unit Testing Best Practices 2026 | TypeScript & Modern JS
- .
- Ejecutar pruebas de integración para validar el comportamiento en los sitios de llamada.
- Utilizar mutation testing (Stryker) para medir la efectividad de las pruebas y detectar falsos positivos.
- Integrar la ejecución de pruebas en CI/CD, bloqueando la fusión de PRs si hay fallos o cobertura insuficiente.

### 6.2. Despliegue Seguro: Feature Flags y Canary Releases

- Separar el despliegue del encendido de la nueva abstracción mediante feature flags, permitiendo activar la funcionalidad para un subconjunto de usuarios o entornos
- iamlino.net+1
- iamlino.net. Feature flags, canary releases y el arte de no romper producción ...
- beefed.ai. Despliegues canarios y feature flags para reducir fallos
- .
- Implementar canary releases para limitar el radio de impacto y automatizar la reversión ante métricas anómalas.
- Monitorizar métricas técnicas (errores, latencia) y de negocio (conversiones, éxito de checkout) para decidir la promoción o rollback de la refactorización.

### 6.3. Estrategias de Rollback y Control de Daños

- Mantener la implementación anterior detrás de una flag o interfaz hasta validar la nueva en producción.
- Documentar el plan de rollback y los criterios de éxito/fallo antes de activar la refactorización a toda la base de usuarios.
- Automatizar la limpieza de feature flags y código muerto tras la validación exitosa, evitando deuda técnica acumulada
- iamlino.net+1
- iamlino.net. Feature flags, canary releases y el arte de no romper producción ...
- beefed.ai. Despliegues canarios y feature flags para reducir fallos
- .

## **7\. Métricas para Medir el Impacto de la Refactorización**

### 7.1. Métricas Clave

| Métrica                   | Descripción                                         | Herramientas Sugeridas         |
| :------------------------ | :-------------------------------------------------- | :----------------------------- |
| Porcentaje de Duplicación | % de tokens/funciones duplicadas en el repositorio  | Fallow, SonarQube, ts-analyzer |
| Complejidad Ciclomática   | Número de caminos independientes por función        | Fallow, ts-analyzer, SonarQube |
| Health Score              | Índice compuesto de complejidad, duplicación, tests | Fallow, CodeScene, CodeClimate |
| Cobertura de Pruebas      | % de código cubierto por tests automáticos          | Jest, Vitest, Istanbul         |
| Tasa de Fallo de Cambios  | % de despliegues que requieren rollback/remediación | CI/CD, métricas de negocio     |

El seguimiento de estas métricas antes y después de la refactorización permite cuantificar el retorno de inversión, justificar el esfuerzo ante stakeholders y priorizar futuras intervenciones

webdevtutor.net+2

webdevtutor.net. Understanding TypeScript Code Metrics: A Comprehensive Guide

Github. GitHub \- amir-valizadeh/ts-analyzer: A comprehensive TypeScript ...

beefed.ai. Despliegues canarios y feature flags para reducir fallos

.

## **8\. Priorización y Coste-Beneficio de Refactorizaciones**

- Priorizar clones triplicados o más, de mayor tamaño y dispersión, que afectan módulos críticos o de alta rotación.
- Evitar refactorizar duplicaciones triviales, locales o en código próximo a ser eliminado.
- Justificar el esfuerzo ante el negocio con métricas de reducción de bugs, aceleración de desarrollo y habilitación de nuevas funcionalidades
- FreeCodecamp
- FreeCodecamp. How to Refactor Complex Codebases – A Practical Guide for Devs
- .
- Balancear el tiempo dedicado a refactorización con la entrega de valor, aplicando la regla de "dejar el código un poco mejor cada vez que se toca"
- FreeCodecamp
- FreeCodecamp. How to Refactor Complex Codebases – A Practical Guide for Devs
- .

## **9\. Gobernanza, Políticas de Equipo y Automatización**

- Definir políticas de revisión de código específicas para refactorizaciones: checklist de calidad, validación de tests, cobertura mínima, ausencia de duplicación nueva.
- Documentar las decisiones de refactorización, los clones intencionales y las excepciones en .fallowrc.json y la wiki del equipo.
- Automatizar la ejecución de análisis estático, pruebas y validaciones en CI/CD, bloqueando la fusión de PRs que introduzcan regresiones.
- Capacitar al equipo en el uso de herramientas estructurales y codemods, evitando la edición textual manual y los parches frágiles
- Google Drive
- Google Drive. Documento sin título
- .

## **10\. Comparativa de Herramientas Comerciales y Open Source**

| Herramienta/Librería          | Motor Subyacente            | Conciencia de Tipos | Velocidad    | Caso de Uso Ideal                        | Licencia/Coste          |
| :---------------------------- | :-------------------------- | :------------------ | :----------- | :--------------------------------------- | :---------------------- |
| Fallow / fallow-mcp           | Rust \+ Oxc AST             | Opcional            | Ultra-rápida | Detección de clones, health, CI/CD       | Open Source / Gratis    |
| ast-grep / @ast-grep/napi     | Rust \+ Tree-sitter         | No                  | Instantánea  | Reemplazo masivo, patrones estructurales | Open Source / Gratis    |
| GritQL / Biome                | Rust \+ CST                 | Limitada            | Instantánea  | Migraciones compuestas, reglas linter    | Open Source / Gratis    |
| ts-morph                      | TypeScript Compiler API     | Completa            | Moderada     | Codemods, manipulación semántica         | Open Source / Gratis    |
| ts-surgeon                    | Híbrido (ts-morph+ast-grep) | Completa            | Alta (batch) | Movimiento de símbolos, refactorización  | Open Source / Gratis    |
| SonarQube, CodeScene, Moderne | Varios                      | Parcial             | Variable     | Métricas, análisis estático, migraciones | Comercial / Variable    |
| GitHub Copilot Agent Mode     | LLM \+ MCP                  | Parcial             | Variable     | Refactorización asistida por IA          | Comercial / \$10-39/mes |

La combinación de herramientas open source (Fallow, ast-grep, ts-morph, ts-surgeon) permite cubrir el 95% de los casos de refactorización de duplicados en TypeScript con eficiencia, precisión y bajo coste. Las plataformas comerciales aportan valor añadido en métricas, visualización y gobernanza para equipos grandes

Google Drive+1

Google Drive. Documento sin título

baeseokjae.github.io. GitHub Copilot Agent Mode Guide 2026: Multi-File Edits and Autonomous ...

.

## **11\. Checklist de Calidad para Pull Requests de Refactorización**

- \[ \] ¿Se eliminaron todos los clones reportados por Fallow en el grupo/familia objetivo?
- \[ \] ¿La nueva función/módulo extraído tiene cobertura de pruebas suficiente?
- \[ \] ¿Se actualizaron o eliminaron imports obsoletos en todos los archivos afectados?
- \[ \] ¿Se ejecutaron fallow audit y fallow fix sin errores ni advertencias?
- \[ \] ¿Se actualizó la línea base de duplicación y health score?
- \[ \] ¿Se documentaron las decisiones y excepciones en .fallowrc.json?
- \[ \] ¿Se validó el despliegue con feature flags/canary si aplica?
- \[ \] ¿Se revisó el impacto en métricas de negocio y técnicas tras el despliegue?
- \[ \] ¿Se planificó la limpieza de feature flags y código muerto tras la validación?

## **Conclusiones**

La refactorización eficiente de código duplicado en proyectos TypeScript requiere abandonar la edición textual manual y la dependencia exclusiva de agentes de IA, adoptando un pipeline determinista basado en análisis estructural, síntesis acotada de abstracciones y transformación programática sobre el AST y el grafo de tipos. Fallow es la piedra angular para la detección y priorización de clones, mientras que ast-grep, ts-morph y ts-surgeon permiten aplicar refactorizaciones masivas, seguras y auditables. El desarrollo de un arnés propio ligero que orqueste estas herramientas maximiza la eficiencia y elimina los cuellos de botella de los flujos tradicionales. La integración con CI/CD, la validación automática y el uso de feature flags/canary releases aseguran un despliegue seguro y reversible, minimizando el riesgo de regresiones. Finalmente, la gobernanza, la medición de métricas y la automatización de políticas de equipo consolidan una cultura de mejora continua y calidad sostenible en el tiempo.

**La estrategia óptima para refactorizar duplicados en TypeScript es híbrida y determinista: filtrar antes de transformar, sintetizar la abstracción solo sobre el micro-contexto relevante, aplicar la transformación sobre el AST con herramientas estructurales, y validar en bucle cerrado con métricas y pruebas automatizadas.** Esta aproximación maximiza el retorno de inversión, minimiza riesgos y sienta las bases para una base de código limpia, mantenible y escalable a largo plazo.

Ver mi razonamiento

## **Referencias**

13

- [1![docs.google.com][image1]docs.google.com](https://docs.google.com/document/d/1ECEdX_9Q6geGJTfGj5VCrfES9mWBd7xPUMl25U6fMVs/edit?usp=drivesdk&utm_source=copilot.com)
- Documento sin título
-
- [2![code.visualstudio.com][image2]code.visualstudio.com](https://code.visualstudio.com/docs/typescript/typescript-refactoring?utm_source=copilot.com)
- Refactoring TypeScript \- Visual Studio Code
-
- [3![marketplace.visualstudio.com][image3]marketplace.visualstudio.com](https://marketplace.visualstudio.com/items?itemName=kisstkondoros.typelens&utm_source=copilot.com)
- TypeLens \- Visual Studio Marketplace
-
- [4![codemod.com][image4]codemod.com](https://codemod.com/blog/ts-morph-support?utm_source=copilot.com)
- Codemod AI Now Supports ts-morph | Codemod Blog
-
- [5![github.com](<>)github.com](https://github.com/chimurai/jscodeshift-typescript-example?utm_source=copilot.com)
- chimurai/jscodeshift-typescript-example \- GitHub
-
- [6![github.com](<>)github.com](https://github.com/amir-valizadeh/ts-analyzer?utm_source=copilot.com)
- GitHub \- amir-valizadeh/ts-analyzer: A comprehensive TypeScript ...
-
- [7![www\.webdevtutor.net][image5]www\.webdevtutor.net](https://www.webdevtutor.net/blog/typescript-code-metrics?utm_source=copilot.com)
- Understanding TypeScript Code Metrics: A Comprehensive Guide
-
- [8![baeseokjae.github.io][image6]baeseokjae.github.io](https://baeseokjae.github.io/posts/github-copilot-agent-mode-2026/?utm_source=copilot.com)
- GitHub Copilot Agent Mode Guide 2026: Multi-File Edits and Autonomous ...
-
- [9![iamlino.net][image7]iamlino.net](https://iamlino.net/blog/feature-flags-canary-releases-arte-no-romper-produccion/?utm_source=copilot.com)
- Feature flags, canary releases y el arte de no romper producción ...
-
- [10![beefed.ai][image8]beefed.ai](https://beefed.ai/es/canary-deployments-feature-flags-reduce-failures?utm_source=copilot.com)
- Despliegues canarios y feature flags para reducir fallos
-
- [11![www\.xjavascript.com][image9]www\.xjavascript.com](https://www.xjavascript.com/blog/typescript-unit-testing/?utm_source=copilot.com)
- Mastering TypeScript Unit Testing: A Comprehensive Guide
-
- [12![reintech.io][image10]reintech.io](https://reintech.io/blog/javascript-unit-testing-best-practices-2026?utm_source=copilot.com)
- JavaScript Unit Testing Best Practices 2026 | TypeScript & Modern JS
-
- [13![www\.freecodecamp.org][image11]www\.freecodecamp.org](https://www.freecodecamp.org/news/how-to-refactor-complex-codebases?utm_source=copilot.com)
- How to Refactor Complex Codebases – A Practical Guide for Devs
-

[image1]: data:image/png;base64,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
[image2]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADuklEQVR4XrWXz1LbVhTGz0yXXZSZ7lMBMdMlj8Aj9A3IsgFiO7WNwQSsAAHSpLG7aRdtavf/XyJjjIGWjLrqTCEgDKFZdfQIgrj7m+9eSbZ0Ld2UDP5mfiNLcznfd8+RL0DUD+nmwNtr++a7n72wRxr/Vd43HE1e0j/ppkbzT20q7DHK7LCRzbYggSBa34P45neeMpr9g9HtbTZSdwP0P0jBHKW5PRswwczvCNB0A0SQqLfNqwvimjtUwK598giQRoCNdiwJo23JpS6vub3xkHEnwC4CbLFEra1ELnc5FfZSNIudRjG9wyjV4LtU0i1WsgaA1n3wGs3sFgGLhQdIbvYYyrjFPn0xTuUzBzB8LoadIjQN8zwMQuyG77PbPICTeAIjBUSP/klRCcZhrNhu5HcqYnevI9O0KW1o19fbTAUCPGfRnNn04HSsY5w2Bii3bdI0dhYkJ92LZ82yWA9d/+0lU0H08HmVPoFhHI/OinwnlG5Y2BUvHoEXJLftULaZ7oT2A/zq4RsH7t1VD0/LCMJiWdrHPBt4q+uMPsI1uwWaYXKi5aNBc66OWQzdlQ9OdcBiWT1CABhNbeCEQ4jMVpdss+q3XNbwLy+ZivDq+wjxMcxUzPzJaMJwu3F7E+aNUMtlDf8MIwXyeoRopen+CVOy8BdGUrcRpKflsoZ/gpECeT3R5MY4ZXCSrRwzWjtRYdNqzFc1oI7Zj73mvQHSm0VKYsYTTzBrtPceQqyeeLQ8/HuPlVPlwTUEYxXdlUmY87ly/BB81ovPYNJSs3pSId2KfAmHfrhgKtxVqXqJUjANkqwxuokQNxFi6cihe55Z8BpkpWUjhBZyh4a+h5ECmNdKwiyKW2BiXRezXj62xEiWj93R8GsUK1boWyGMvotBBLhVc4SRTLJm05Qx1qnEW7x8bNISTGSCAcR9q+SPZBBGKhDAuAEjJmHShzh+o7RkVWnR6povSvjP9SMxksFvYaTALTplfECThkOT/O1fL4cdI3TX0kWIOO6CIk7O/IEz+A2MFHSL8h3/j4OlIx0huJGM7rEgArDBry+UyGUvJ/1QR6t5u3u5c4hfUAdMg0mHauCzh1zy8tKf3RDtlpnD+ZHbd00VyOXeTPr+KFruiLZz5nkAdCCLAJVzFbZc6s3FD6GFQ5vmD932F9CBzN9M++o8msq5qVWu6h8TXzzEPELwALMH+OPFC/A4ZG5qXzhj8o9enfIIUUCIGTfAezDnXHt8UemvcVA4Bd+as6rvrP1rX/vSKWufx7f6FcJ1njOMYAdWAAAAAElFTkSuQmCC
[image3]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAb0lEQVR4Xu3QQQpAUBSF4bMSiu3oZT962YzsgexJeSKjw4A3MNLNiHPqn96+LqYyo6XZ5cQ5P4B1bwv3w08TQAABBBBAgNcAi0toaSvSCKgOgO9tXTf+vDbQ1hrfxw60BjQjbQUBBBBAAAEE+AZgB6a5skefiG+8AAAAAElFTkSuQmCC
[image4]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAADAFBMVEX///92dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABzGIEHAAAAEHRSTlMAMIDAYNBQIPDgoBCwQHCQZx1Y1QAAAWVJREFUeF6NU4tuwyAMNI+SdrTS/v8rV9FohCR4tqEFskrbSQkmvpjjMApeUErdJAiI2L4+A6v86yPArFKNKmHays8NwS4yFoLT55aKapIhSxErr4+WBlj3eHEAZ8gbzQw9rl8dICGsy04Ul3cATevrIS9Ax/X1VCqMBSIXhnW1GmxEIthBf3pInnDaLEx5t80JxvJdRosQSQXgwR+o9thrnfu7Hgo80TnNhGLZIVOhWGItMu+g85gGuLEHUVaeXRbrDmCCF+n73L5eWigu4oNerpM7x1do6BgfmDdHx4aaYViHMYscIwn8pAL3bufEFyVqKh2gQ3Gnk1e2iqsMQdN0emtWATKhF30EEeZxAyNm1OKj9cA7/Q1FPiSS6RG2r94pKA6FxB3lqCmMdmvypfcSy/InEhb1zryFnXFJQWi/q8TtkpfS9ilfuTFT7SZKc9tXx/68OP+8esBSe0owh8sr4dvr/wOiCobrwBNl5wAAAABJRU5ErkJggg==
[image5]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAFFklEQVR4Xq2Va2xTZRzGwQCJRv0AEhOFkJjoFyUxboiCGiEoCips7ELXbjH6ATERP3GTGBQQo+EDBLmoIAwHG3Qba1d2Y2wro7sPytpt7S4dYxe2EQgKbIxBH5/3HE579tKNbvhPfjnted/3eZ73/57TTpgwzkJ6xNMkmhwjTeQG+Zf4iJnEkmfkdf9LUfhVcoLcJBiBWySdzJbXP1ZR8HVyIYThSLjJ27LOuIpCU0l+CJNHUUVmyXpjLop8QYZCGITDz7LemIoCU0hWQDAjUjZ4FB4yQ9YNu7j4edKgiGXNBSo/BewfAJlz1DAnteubqqH5DZVggH6yUNYNu7h4JsQrlkGx8iVAaxLQbAJql/P7UqD6MyDnHTVY2cdA4QIg713ANk8LII5umawbdnE304lbMfEkMEAi4EtSg7QkqtTHA14xJu4nqgHFvVPzRTfuwByxWNYNu+CKncndNODcR4rBkMeIrjNRGHAZggEecN9rQndRFG47V6phKpaKoxpE0cIoWTfsotBqOKP9DAK0JcGbuRRrI19A6e73le+BAOxKR8EybHxrBnK3zVO75GFIB4+l0ZCK3q8mydphFcV3BExoeDFlMVa9NA15P80fHoCfW6yf4OtXeGJrI9UAwe6Uk/H9PHPhmoAQz/fm+Xhl932lK1QTn9i9OjZQZ4BjzwJ0FS5Xn4VggHQyWdYOq7hwBsnTh1B2TvOhehN6LCvRZY5Hf7UxOKZ/QFsSW8kCWXdMRYFFpF8nqpgJU+e2aFRvisLV3JVqJ/RzVH6U9cZcFHmReOQA4jrkNuGuywR/04N7w1s/QJbIemMutJgmUmi3JixMb5Un4H6jKWAmAoiO9NcY9QGqyHRZb1xFoQjSKXZ4w56Amu+j4NwejYadMWjcFQPXryuUo+hIi9e6cJesknUeq+BL+Aatxn5/sxG3HAZcyYhDe3IM2g7HoCM1HtcLDbjXEOhKKnlW1gjU7ydOPUFm7z9u+3JfWvaafWm2b0djb5ptzaH0zPVVZ3/x1pVtgat8K9wV29Dh3oG7lzYGX8eWRD/JIjNlz2FF80XEl2w5DUtxBaxhIOZZiiv9RFxhLnAg2VKI864qDLZtht8rngvjFb/H+Jrs91DRfCt3D2tJJTyXuuFpHxve9iuobfThr8x8nMh3oNuXj3v1fBi9pstXG00vRxyMmrTeGjuFTCYTZX8RIIncOZCeiyPWQvwdAnFfQx4THM4qADVwICMPFxvrMNS2Ad3uhIHtuXEl66yxOTTOJTbyG1lCntQHmEXqhcD+4yNhU3YoQorP8rhYq6634XT5BdR5DmBnQSxoFIrbZC+Zpg+xSxOREaLH8+yoa25HTUMrjtqKhpnKc1Nz7Chy27HJZpKN9fjJDqL+L3Dxh+S2LKiJltS40dF3HR2911HhasKf7IQ8T0OMOepc2Fm8AessK2RjPb3kPS3AVFIhi2kB7AxwmebtPdfQdLkHKUoXbA/N1ebnltYio/YI1lljZFOZLfpj+EEW0wRPnilDW/dVJURrZx/bXDJqgJTsYpytL8PmnM9pMmqIQ/oAc8k1WVAg2mqvdaO1qw/V9S04mJn30Bw9f5hzUOp0Yc/ZzVg7+jEk6wM8RfJlMX0IsXPtlRsN0YXskipkO834zmYYTrYhdIAHIVaTe7KgXli+NxLKL2OTF2XNZXA0ndPhwNHKvTSPCxngOXKMDMqC48Hh9KCz7wbfniCdff+gwH0KG7LjlQD/AaSEvmebEnY0AAAAAElFTkSuQmCC
[image6]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABRElEQVR4XmNgQAOqya//0xKj24cC0BXTCqPbCwboimiNB9RyGB5Qy2F41AGjDhg6Drj84Pd/bODvv///333++//wlV//MyZ/xNBHCFPsAHTQsOQzhl58mGQHgGiN1NdwbJD95n9cz4f/bz/9Bcs/f/cXQy8+TJYD0OVAePPJH2D5n7//Ycjhw2Q5ADkE9LPe/E/s+/D/w5d/YPkTN35h6MWHSXYAPvDqw9//XrXvMPTiw1RzwNoj3/+b5L7B0EcIk+wA5DSgmfb6//0Xf8DiD17++a+dTmcHgHDqxI/wUJi08SuGPkKYYgeA8KErP8FyP379++9UQeM0gM0BHjXv/v+BFAP/D176iSGPD1PFASC8aM83iAuAIHsq8UUy0Q6gFR51wKgDBt4BA9k3QO4c0d0RKJbDALoiWmF0e1EAumJqY3T7AIXN43h89e6JAAAAAElFTkSuQmCC
[image7]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAADAFBMVEX///92dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnZ2dnYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABzGIEHAAAAEHRSTlMAMIDAYNBQIPDgoBCwQHCQZx1Y1QAAAWVJREFUeF6NU4tuwyAMNI+SdrTS/v8rV9FohCR4tqEFskrbSQkmvpjjMApeUErdJAiI2L4+A6v86yPArFKNKmHays8NwS4yFoLT55aKapIhSxErr4+WBlj3eHEAZ8gbzQw9rl8dICGsy04Ul3cATevrIS9Ax/X1VCqMBSIXhnW1GmxEIthBf3pInnDaLEx5t80JxvJdRosQSQXgwR+o9thrnfu7Hgo80TnNhGLZIVOhWGItMu+g85gGuLEHUVaeXRbrDmCCF+n73L5eWigu4oNerpM7x1do6BgfmDdHx4aaYViHMYscIwn8pAL3bufEFyVqKh2gQ3Gnk1e2iqsMQdN0emtWATKhF30EEeZxAyNm1OKj9cA7/Q1FPiSS6RG2r94pKA6FxB3lqCmMdmvypfcSy/InEhb1zryFnXFJQWi/q8TtkpfS9ilfuTFT7SZKc9tXx/68OP+8esBSe0owh8sr4dvr/wOiCobrwBNl5wAAAABJRU5ErkJggg==
[image8]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADIUlEQVR4Xt2WS08TURTHh1epbad0CoWhWKKiLcToEhPDxp26MTEulKDBBQuNMRoSwYT4xmhM/AaaYAjiTmMEF4q8dOfrC0gCuAAXpSY0Adr+vecMQ8aZykwnKSSe5J/b+2jP79x77umVgkodtlOSeWCr9Z8DhOuFGoSi1rl1OQJQaqIIR4TWW+qb11gknMtVCgI+D+SAX4yp1jWKA4CqsIrSigCkEi+kUi+31Kdx89oNkfNgEEqsFdG2fkT2tzOMZZ1iA0BOvH4FN27dweDQMAaeDXJLfRrPC7EeeVg439s5h8TFjFAO6qFeBGS/5Tg2BQhV16PME8DnL19hNOrTOM2bv0NnTtsebbuPxIUMms7NIN6VxJ4z38V8rWW9LUB5pYyxD+NYW1vD8nKaW+rTeH6AKJ85bTtFvk84b74ExI4NQ5ZlLTELBZiYnOLIV1ZWuKX+PwFYqjiGENTWXhH5NzQK5yG1WYyFeW4LADRp2V/LkedzTnINUOENorp2p7iWDSy6mpak1BOO64HVuWuAyalpSGU+cR39kCQPq6Tch0BVxFmNMMgVwLv3Y1yQ2js6cbf/AW7evoeTp04josYYrBCIggDoBpAtLv7C/PxP/my0HzMz6Dh7HiUCIuQQoiCATCbzl0PqExTJOHe1+xpXTSViD+EKIJfLIZvNbTjUjeZJ2WwWh9uOcKLa3RRXAJuZfkxDz1+I/41KzhXz7xYVgKKnHaJ8oGSUQ9byW1QAck6WSqWwq6kFPrnaWh+KCUA7QDY7O4eaupioDVu8A5QDtAsvX70W13GHbU1wBUAO9K02Go3pSXj0+AmUiYdLUQB002oA1QKtHuj28NFjUQfso3cMMD4xydGtrmrbu7SUQjqdNqBolkr9Rk9vH8o9Nk+2QgGmP35iB3qCjU9MId58AD3X+/iZ9uTpAC5f6Ua85SBH7tQ5yRaAqtmbkVEkk0ksLCxyOzL6VvsXFM74sSoKDoneiU623ahNAUhUSKKxJjTuTgjFuaU+Ram9Beiprr0JColcly0AyR+s4YKii/rmNW7lCIAiM8u8xq0cARRT2w7wB4yn5lDs7RRFAAAAAElFTkSuQmCC
[image9]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEsUlEQVR4Xo1WbWxTVRhe0nvbrV3XZWpiu7LVsW6sg7XburF1lS+HrAOmg5mSDWMR2PyIQNzCHIholAwx6hZ/IMEfYMCvRAU1kpgwNBonI5o4k4HMTMQ/YiQaIvHjz+O5X73nnnNu3Y8n597zvu/zPuc977n35HkCVfAEwtBGOxh2ZaTB+s2Dy2+152XJaIOfIVNsqp32pUUYfvqzJZ7mtSbXBdBGxoEVYjxzROw7izDcOlhbnpHYra6SCSTvapAlIS1Uf2bjhKDiVF5tPivACrtgu2SimFw2c87cAiE5E6zYufKzyGXnbVYBXIA+L+iPUCyB+nV9Yn9uzt5mngLDwa7xmOBX3/0Qg6emcFtDO0PK++aaF1eA2worUr1bcfnPfzH+5SxiT7+J4qomzme+yMueXbYSAmcFty6sw6eX5nDpxj8Y/WwW8UMfIXN8AnXpXZxvLh7DpleATmwflBoYxtCRdzBz429M//4X0m9cwOrD53D4659RsmEE7nALF/N/vJoA7svGo6yuFWev/IpNJ8/jm+s38fbFX7D+2CQOfD6H/We+RVH3HrgTpCmDi7hYDSy3qALCBtTwxPhRTP12E31vXcD4V3PY88lFPDlxGWOTP6L2sVeIgL1wr9wOX3s/PJXNXDy3QPVIW05B2PaMl8facPan6zgxcw39p79D+uQU9k3MYuz8VcSGjsB3334V7vZHULyRCEneD08pXQmN1/yqKqM2LzgFvIjBsddw5uof2PnxDLa+P42nzv2AFyevIPH8aZQPHUNJ3wEUp58hVRiBd90g3Kv64YmlOB5rLtEWcCPZ+1gS731/DaNfzGH7qWk8S/b8IHlue+ED3DFyQkVo93GU9D6HwrWPw5PaCXfHDlKNh+GpaOSTZ6tsEWBVpcAb64A33oVb7sogNPAy/A8egj9zEKWZUfg6d8CV2AxX62Y4W3rhbN4Eub4b0pK1kGpTkCIdkGrWwFmZhCvUBFd5PSXAKkiwBSyq4Us9isDAGCqGX8ft215C0Ya9kJvSkOI9kBp74Ih2wVG5HI6KOwmS6igtaMz+8XiYVaC2gAYTEF4Kb9dueDt3oeieYRSThiskz3JzGjIR4Vi0mghYBsdCgoo2krwB+YEIzyPAPCqgwdvSg/zkA5AbulF07wh8PfuQv2wLHKTcmgBSgVALpGAMzmCUi7eDWQHLH08gJhhBwdI0ClZsUxO7WvsgR9fDUbUSjpq7yepJ2QNRSP7FKAiIPkZMdfV82ndAvQ0JBOgNk71KldfBs3wL6fCHiIBe0mwkcVkjKXsCUlmTltxfzTWaAY3HFKHcwnQBhiI+yCJIwYJaFK7IwBnfSDqedHtZXF25XBolCar5OPY6Jz4FrCOdmA/yBGvgirRDXtypdrvsj+To+CrBAg1ewZdQdHPNBtDlI6t11qwiK19ik1zEZ3IYn2Xr35BTadgYcn1OEcEnp4WawrVbNzVvNiFPbCUQEZvgKyZ61+ZUEQwPcx9gSfRRKCxMxVGx+m/WGkfZmBzU75hOwDrazTMxbLNyYHnoLRAFsyuwkNAVENmNZ9qf9xH3AC1GvziYduo5e7zYpHYj7aeBO4a8Mx9k2kWk7Htu/AckeasaRDlFTAAAAABJRU5ErkJggg==
[image10]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAw0lEQVR4XmNgGAXDC4R/V2CI/GUPx1E/DdCVkAdifgQwRv+6D8T/EfjnB6IsiJ/+XyFu+r/+uBn/9sNw/Ix/G+Ln/xcAK4j6mYBqMGmGJ8TP+P8fGcdN//8hftZ/iOZRw0cNhwNqGf59u7XDr20W9iD8fbu5AlgQm+HgdE6k4T92WAb83GF1H4j/w/CP7ZYX/u+3F4BZ4ADHMENhgJDh2y0XIBuMYTheMGIM/7Hd6gNIjEzDf35gjPq1gCEeWrCNgiEJAAHt/1tdYP7KAAAAAElFTkSuQmCC
[image11]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAFMklEQVR4Xu1Wa0yVZRx/DwdUlItyOYebHgMOKHFpyVAjVpNyFW3gB9ImOWIOYiuW2bA5MVOykWIyxNF2omwjcG0I6MYcibMpsFpNP4DKLQqnDqUPSnLn3/v7P+c5nfO+59TGB/vis/33vu/z/C+///V5laVLY+j/JEW78bjpCQAdgGXLYikgII6f2rOFEnT5+1vd6nQBAAaQopjIyytMx6wlPz+rbs8deXlFqjpDydc3WgfCAUAeKEo4lZUdobq6RvL2XqUTkARlRmOUx3MQAELf/v1HyGZrUHljaNEiiwtwBwA/P+F5RUUNYZWXH1e/I9x6uXjxajKbk2n9+iwyGMI8ghAAImj79ndZ57lzP6iyFpdIMADkXFHMVFhYyoyHD1er3yFuFWMPXoSHP0NDQ39QcfFHDBw6tLz/gAiivDwB4sSJrzkqqAkGAAYvryhKSXmZ5ufn6cyZNpVBeOUOACJlNK6ktWtfoMnJKZqbm6OsrLdclGopICCeQRw6dJxB5OYWsg1//zgBAB9NTW00PT1NMTEbycfHwodaRUIZohVCRUUiWljXr/dTUFACLVnylFvQzs709Q3RwMAwfyMVisEQSampr7KiyspaVXmwx3BKZT4+q+jSpS6WmZqa4mdJSRmh0v8L+I4dJcyfl/cep06BwYMHv+DNtLTXyFPhgThkaq0g5FhI2czMLL+jwP6tK0TtrCaTKYnGx/+ilpbzHHkFBtvbf6Q7d0YZpbtedVaCMF+58hMbnZ2d5RrAunlzkM89gRcOIN1munDhMo2OjonawMHg4O/U2fkzH3pSIEIYSrt2fcwGYXhiYpJu3Bjg797ePgaPgvbkgIigiaqqbCwTFbWOFKC4d2/MXv0mt5UMUKiV5ORMevBgnIWxEEaZDputnqzWjVRaWm5Pox6EABBK+/ZVsAw6ScHm3buj1NzsGQA8gmetre0sKMOelpZFCQkv8ntjYwudPt3K7ykpL/H41UZTCyAu7nmZgmG1qrsZgF5IjNPNm99koZmZGX4eO/aluu9HmZlv8DfW9LQ4q6r6ig1pO0Km4OjRWuaLjFwnivDixU4aHh7hKtV6L9unurrOYQh5RzWjg7ZtK+a9qalpJqzu7l9ZVlvQEkBr63m6f/9P+4BSJ1RNzTcsaLWm85Rzzp/M/9mzIvxYO3d+SKKFwhwAnDsCwyY4+Gl17rsOJgACjYzc5jkCvQqU5OQUsCCmG7x1Dp3s/YaGZubp7x+i0NBEtR2j2UBExLPU1fULnz16NMFPRFRGEzeg0CMmbnp6NvMcOFDJthQoWb58Dd26dZuuXevVXZey/XDpYNls3znyK6cilMfGPueoh7Kyz1m580QNDES4zXTq1PfMk5i4iQubuwB52bPnUz7Iz3+fcxsYuMbuQSxfvyEhiWrextTr+iSfS+Vy+MBgUtImNUK/cXHBERl+kesw2rDhdbZRX99EKGyWE9MtmhFevdpDDx+Oc2s5DyU5wXJzi6i29ltW5hwlOGEwRNHevZ/ZbzqzI43g8/ZeSStWxFNPTx+P4fj4DN7jfxDJBESpqa9wJaPKLZY0vhWlF3iCBz8hmGDIMfbEjLcwf0ZGDvM4y8A56G9r62Dvt259x5FC8Dj+iGQqtmx5mxk7Oi7rxqrMuXZWSHmc6dvOzHMBa/fuT9iGc5G7/JRKEJmZuVRQ8IE9j66GEDZfX9c9ENpLO34BBjdkdnY+t6s2dToAIIAwGiPUnJp0RhZGGOOYGaKmtA7pAIBkZWv3F0rQ5UmfWwCPk54A+BuyY3TVi61o/AAAAABJRU5ErkJggg==
