# **Estrategia de Refactorización Determinista y Asistida por AST para Código Duplicado en Proyectos TypeScript**

## **Diagnóstico Operativo: Por Qué Colapsan los Agentes de Codificación en la Refactorización de Clones**

Cuando un equipo de ingeniería detecta bloques de código duplicados o triplicados mediante analizadores estáticos de alta velocidad como fallow y delega su remediación directamente a agentes de codificación basados en modelos de lenguaje (como Claude Code, Cursor, Codex u OpenCode), el flujo de trabajo suele degradarse hasta el estancamiento. Este bloqueo operativo no responde a una incapacidad del modelo para comprender la sintaxis de TypeScript, sino a una incompatibilidad estructural entre las primitivas de edición textual que utilizan los agentes por defecto y la naturaleza topológica de una refactorización multi-archivo.  
El primer factor de degradación es la explosión combinatoria de contexto ocasionada por la lectura de archivos completos. Para consolidar un bloque triplicado disperso en tres módulos distintos, un agente convencional carga en su ventana de contexto la totalidad de los tres archivos fuente, el archivo de destino para la nueva abstracción y los archivos de definición de tipos asociados. La evidencia empírica documentada en arquitecturas de agentes orientadas a árboles de sintaxis abstracta (AST), como Dirac, demuestra que el envío reiterado de archivos completos en cada llamada a herramientas incrementa el consumo de tokens y el costo de API en un 64,8 % en comparación con las ediciones aisladas mediante nodos AST y anclajes criptográficos (_Hash-Anchored Edits_). Al saturarse la ventana de contexto con código irrelevante adyacente al clon, la latencia de inferencia crece de forma cuadrática y la atención del modelo se dispersa, provocando alucinaciones en las firmas de tipos o la omisión de casos borde y decisiones arquitectónicas del repositorio.  
El segundo cuello de botella radica en la fricción entre la búsqueda textual y la estructura sintáctica del lenguaje. Los agentes suelen invocar herramientas como grep o ripgrep con expresiones regulares para localizar las variantes de un bloque duplicado o rastrear sus referencias a lo largo del proyecto. Sin embargo, las expresiones regulares operan sobre secuencias planas de caracteres y fracasan ante variaciones de formato, saltos de línea introducidos por formateadores como Prettier, comentarios intercalados o el renombrado de variables locales propio de los clones de Tipo 2\. Cuando el agente intenta editar manualmente a escala (_hand-editing at scale_) aplicando parches de texto línea por línea en múltiples archivos simultáneamente, cualquier desfase en los números de línea invalida los parches subsiguientes, forzando al agente a releer los archivos completos y reiniciar el ciclo de edición.  
El tercer obstáculo técnico es la penalización acumulada por el re-análisis reiterado del compilador de TypeScript. Verificar la validez semántica de una extracción o resolver referencias cruzadas requiere inicializar el TypeChecker de TypeScript. Cargar la librería ts-morph y el compilador subyacente conlleva un costo fijo de arranque de aproximadamente 350 ms por invocación, sumado a varios segundos adicionales para parsear el grafo completo de archivos definido en tsconfig.json. Cuando un agente ejecuta herramientas de verificación o scripts de refactorización archivo por archivo sin compartir el estado del AST en memoria, paga este impuesto computacional decenas de veces por minuto, bloqueando el hilo de ejecución y agotando los tiempos de espera.  
Finalmente, existe una severa fricción de protocolo en la integración por línea de comandos con fallow dentro de subprocesos de agentes sin terminal interactiva (no-TTY). En primer lugar, fallow devuelve el código de salida 0 cuando el repositorio está limpio y el código 1 cuando el análisis concluye exitosamente pero reporta hallazgos (como duplicados o código muerto), reservando el código 2 exclusivamente para errores fatales de configuración o fallos de parseo. Los ejecutores Bash de los agentes interpretan el código 1 como un fallo de ejecución y cancelan los comandos paralelos a menos que la invocación se encadene explícitamente con || true. En segundo lugar, cuando el agente redirige el flujo de error hacia la salida estándar mediante 2\>&1, los mensajes de progreso y las advertencias de umbrales corrompen el documento JSON emitido en stdout, por lo que resulta obligatorio invocar la herramienta con \--format json \--quiet 2\>/dev/null. En tercer lugar, ejecutar fallow fix sin la bandera \--yes en un entorno no interactivo provoca que el binario aborte de inmediato con código de salida 2 al no poder solicitar confirmación por consola.

## **Triaje Inteligente y Orquestación Preliminar con Fallow**

Antes de ejecutar cualquier transformación sobre los archivos fuente, la estrategia más eficiente exige utilizar el motor de fallow —construido en Rust sobre el parseador nativo Oxc y paralelizado en todos los núcleos de CPU mediante rayon— para filtrar, clasificar y reducir el volumen de trabajo. A diferencia de los detectores tradicionales que operan de forma aislada, fallow construye un único grafo del repositorio que unifica el análisis de código muerto, la detección de duplicación (mediante arreglos de sufijos y arreglos LCP de prefijo común más largo que evitan comparaciones cuadráticas), las métricas de complejidad ciclomática y cognitiva (junto con el puntaje de riesgo CRAP) y las reglas de límites arquitectónicos en una sola pasada que toma apenas 0,16 segundos en proyectos de hasta 3.000 archivos y entre 1,48 y 2,95 segundos en monorepositorios masivos como Next.js con más de 20.000 archivos.

### **Paso 1: Poda de Duplicados Muertos Antes de la Extracción**

El desperdicio de cómputo más frecuente en flujos asistidos por agentes consiste en invertir minutos extrayendo y parametrizando funciones duplicadas que en realidad son inalcanzables desde los puntos de entrada de la aplicación. Dado que fallow evalúa la alcanzabilidad de módulos y la duplicación sobre el mismo grafo en memoria, el proceso debe iniciar obligatoriamente con la intersección de ambos análisis:

```sh
fallow dead-code --include-dupes --format json --quiet 2>/dev/null || true
```

Los bloques reportados por \--include-dupes representan código que está simultáneamente duplicado y sin uso activo, constituyendo los objetivos de mayor retorno de inversión porque su eliminación suprime código muerto y duplicación en un solo cambio. Eliminar un archivo no referenciado o ejecutar la limpieza automática mediante fallow fix \--dry-run seguido de fallow fix \--yes \--format json \--quiet purga de forma determinista exportaciones muertas, miembros de enum no referenciados, entradas de catálogos pnpm y dependencias huérfanas, reduciendo inmediatamente el porcentaje de duplicación global sin haber creado una sola abstracción nueva. Al automatizar este paso, el agente debe inspeccionar el booleano auto\_fixable: true en cada elemento del arreglo actions\[\] del reporte JSON y verificar la ausencia de advertencias en reachability\_caveats o workspace\_diagnostics, ya que fallow evalúa las guardias de seguridad de borrado por instancia individual y no por tipo de acción general.

### **Paso 2: Aplicación de la Regla de Tres y Filtrado de Ruido Estructural**

Por defecto, fallow dupes reporta cualquier par duplicado (minOccurrences: 2) con un mínimo de 50 tokens y 5 líneas, excluyendo automáticamente del flujo de tokens las declaraciones de importación ES, las re-exportaciones y las llamadas estáticas a require() de nivel superior para evitar que el cableado de módulos genere falsos positivos. Sin embargo, mientras que un porcentaje de duplicación global inferior al 5 % se considera saludable y un rango entre el 5 % y el 15 % requiere revisión moderada, superar el 15 % evidencia un problema cultural de copiado y pegado donde refactorizar cada par aislado suele introducir acoplamientos prematuros entre contextos que evolucionarán de forma divergente.  
Para enfocar la capacidad de los agentes exclusivamente en las verdaderas "fábricas de errores" —aquellos bloques triplicados o multiplicados donde un cambio futuro de lógica de negocio inevitablemente actualizará dos copias y omitirá la tercera—, resulta indispensable configurar la Regla de Tres en .fallowrc.json ({ "duplicates": { "minOccurrences": 3 } }) o mediante banderas de línea de comandos:

```sh
fallow dupes --min-occurrences 3 --min-tokens 50 --min-lines 5 --format json --quiet 2>/dev/null || true
```

Adicionalmente, el motor de fallow ordena los grupos de clones (clone\_groups\[\]) mediante un algoritmo de clasificación consciente de la dispersión (_Spread-Aware Ranking_). El puntaje de prioridad se calcula multiplicando la cantidad de tokens duplicados por el número de ocurrencias y aplicando una bonificación máxima del 15 % basada en la propiedad spread. La dispersión mide la distancia máxima en el árbol de directorios entre las copias o, cuando las copias residen dentro del mismo archivo, suma un escalón de dispersión por cada 250 líneas de separación entre ellas. Procesar el arreglo clone\_groups\[\] en el orden exacto entregado por \--top garantiza que la refactorización aborde primero las duplicaciones más extensas, repetidas y distantes arquitectónicamente.

### **Paso 3: Selección del Modo de Detección y Directivas de Familias de Clones**

La duplicación en proyectos reales de TypeScript rara vez se limita a copias literales idénticas. De hecho, fallow convierte internamente los archivos .ts a su equivalente .js despojando las anotaciones de tipos durante la comparación, lo que le permite detectar clones incluso cuando un desarrollador migró una copia a TypeScript y dejó otra en JavaScript. La estrategia de refactorización debe escalar gradualmente a través de los modos de detección según la taxonomía estructural del clon:

| Nivel / Modo en Fallow                   | Comando / Configuración                            | Tipo de Clon Detectado                                                                                                         | Implicación para la Estrategia de Refactorización                                                                                                 |
| :--------------------------------------- | :------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Exacto (**strict **/** mild**)**       | fallow dupes \--mode strict o mild (por defecto)   | **Tipo 1:** Copias literales idénticas (ignorando formato y espacios).                                                         | Extracción directa sin necesidad de parametrizar el cuerpo interno; reemplazo mecánico inmediato.                                                 |
| **Literales Variables (**weak**)**       | fallow dupes \--mode weak                          | **Tipo 1.5:** Estructura y variables idénticas, pero con distintos valores literales (strings/números).                        | Extracción de función convirtiendo las constantes literales divergentes en parámetros de entrada o diccionarios de configuración.                 |
| **Semántico (**semantic**)**             | fallow dupes \--mode semantic                      | **Tipo 2:** Lógica idéntica donde el desarrollador renombró identificadores o variables (ej. user por customer).               | Unificación de nombres de identificadores mediante metavariables AST (\$VAR) y consolidación de tipos mediante genéricos o uniones en TypeScript. |
| **Casi-Clones (**\--near**)**            | fallow dupes \--near (duplicates.near: true)       | **Tipo 3:** Funciones con pequeñas ediciones estructurales (mínimo 80 % de similitud de _shingles_ sobre tokens normalizados). | Requiere inyección de callbacks, objetos de opciones o banderas condicionales para absorber la rama divergente (ej. 5 de 6 ramas compartidas).    |
| **Intención Similar (**similar-code**)** | fallow similar-code (vía MCP: find\_similar\_code) | **Tipo 4:** Funciones completas con la misma intención semántica pero estructura sintáctica distinta (modelo local opt-in).    | Candidatos no verificados; exige revisión humana o validación con inspect\_similar\_code y el patrón _Branch by Abstraction_.                     |

Más allá de los grupos individuales, la clave arquitectónica del reporte de fallow reside en el arreglo clone\_families\[\]. Cuando múltiples clone\_groups\[\] comparten exactamente el mismo conjunto de archivos, fallow los agrupa en una familia de clones y emite una directiva prescriptiva automática: sugiere **Extract function** cuando todas las instancias de la familia residen dentro del mismo archivo fuente (indicando una refactorización local al módulo), y sugiere **Extract module** cuando las instancias abarcan más de un archivo, señalando que los grupos relacionados deben extraerse conjuntamente hacia un nuevo módulo o utilidad compartida.

## **Evaluación del Ecosistema de Herramientas y Librerías de Refactorización**

Para superar la lentitud de los agentes, el entorno de ejecución debe reemplazar la edición textual por herramientas que operen directamente sobre el árbol sintáctico (AST) o el grafo semántico de tipos. El ecosistema actual para TypeScript se divide en tres categorías complementarias que resuelven distintas fases de la transformación.

### **1\. Motores Sintácticos y de Reescritura Estructural (Rust / Tree-sitter / CST)**

Las herramientas de esta categoría parsean el código en milisegundos utilizando múltiples núcleos de CPU sin cargar el pesado TypeChecker de TypeScript. El estándar de facto para búsqueda y reemplazo estructural basado en Tree-sitter es ast-grep (sg, @ast-grep/cli, @ast-grep/napi y el servidor ast-grep-mcp). Esta herramienta permite escribir patrones isomórficos al código cotidiano utilizando metavariables como \$META (para capturar un nodo AST individual) y \$\$\$ARGS (para capturar cero o más nodos, tales como listas de argumentos o sentencias dentro de un bloque). Su sistema de reglas en YAML soporta operadores lógicos compuestos (all, any, not), restricciones relacionales (inside, has, stopBy) y bloques de transformación (transform y rewriters) capaces de descomponer y reensamblar nodos complejos siguiendo el paradigma _Find & Patch_. Además, provee enlaces nativos fuertemente tipados para Node.js (@ast-grep/napi) que refinan automáticamente los tipos de nodos sintácticos. Su limitación principal radica en que opera a nivel puramente sintáctico: carece de información de tipos entre archivos y utiliza analizadores separados para .ts y .tsx, por lo que una regla escrita para TypeScript estándar no debe asumirse como válida sin ajustes en archivos con JSX.  
Como alternativa o complemento declarativo destaca GritQL, desarrollado originalmente por Grit.io en Rust y adoptado de forma nativa por Biome tanto para su comando biome search como para su sistema de plugins de linter y codemods. Mientras que ast-grep estructura sus reglas complejas en YAML, GritQL ofrece un lenguaje de consulta similar a un DSL lógico donde los fragmentos de código envueltos en acentos graves (por ejemplo, \`$path&&$path()\` \=\> \`\$path?.()\`) se combinan con cláusulas condicionales (where, contains, or, some) sobre el árbol de sintaxis concreta (CST) de Biome o Tree-sitter. GritQL sobresale especialmente cuando una refactorización requiere componer múltiples transformaciones secuenciales o condicionar la reescritura de un sitio de llamada a la existencia de otro patrón dentro del mismo archivo (como verificar que la variable haya sido instanciada mediante una clase específica).

### **2\. Librerías de Manipulación Semántica y Codemods en JavaScript/TypeScript**

Cuando la refactorización exige conocer el tipo inferido de una expresión, rastrear referencias a través de exportaciones renombradas o calcular rutas de importación relativas y alias de tsconfig.json, las herramientas basadas únicamente en Tree-sitter resultan insuficientes. En este estrato, ts-morph (junto con envoltorios MCP como mcp-ts-morph) constituye la librería de alto nivel sobre la API del compilador de TypeScript más completa del ecosistema. A diferencia del impresor AST nativo de TypeScript —que descarta el formato original del archivo obligando a re-formatear todo el documento—, ts-morph permite manipular nodos preservando el estilo circundante, gestionar declaraciones de importación (addImportDeclaration, organizeImports), calcular especificadores de módulos exactos entre archivos (getRelativePathAsModuleSpecifierTo) y encontrar todas las referencias de un símbolo en el proyecto (findReferencesAsNodes). Por su parte, herramientas como Putout (@putout/plugin-typescript) y jscodeshift permiten escribir codemods sobre Babel y ESLint; sin embargo, al ejecutar el recorrido del árbol sintáctico en JavaScript puro, introducen una sobrecarga de serialización y cómputo significativamente mayor que los motores nativos en Rust.

### **3\. La Convergencia Híbrida para Agentes:** ts-surgeon

La herramienta más avanzada diseñada específicamente para erradicar la lentitud de los agentes de codificación en TypeScript es ts-surgeon (@commoncurriculum/ts-surgeon). Su arquitectura fusiona la velocidad de búsqueda y reescritura estructural de ast-grep con la inteligencia semántica del TypeChecker de ts-morph en una única interfaz CLI pensada para ser invocada directamente por agentes.  
Su primera capacidad diferencial es el filtrado por predicados de tipos mediante el comando rewrite\_where, el cual busca patrones sintácticos con ast-grep y filtra las coincidencias consultando a ts-morph en las mismas coordenadas UTF-16 en memoria antes de aplicar cualquier cambio. Este mecanismo soporta tres predicados de verificación sobre los nodos capturados: "is" (coincidencia exacta por símbolo o nombre de alias), "extends" (verifica que el tipo herede de la cadena de tipos base) y "assignable" (evalúa la compatibilidad estructural de tipos de TypeScript respecto a una declaración ubicada en typeDeclarationPath).  
Su segunda capacidad clave para eliminar código duplicado o reorganizar módulos es la extracción y movimiento de símbolos con resolución automática de dependencias mediante move\_symbol\_to\_file. Al mover una función, clase o interfaz hacia un archivo compartido, ts-surgeon traslada automáticamente todas las dependencias internas que sean utilizadas exclusivamente por el símbolo movido; simultáneamente, aquellas dependencias internas que sigan siendo referenciadas por otros símbolos en el archivo de origen permanecen en su lugar, pero la herramienta les añade automáticamente la cláusula export e inyecta el import correspondiente en el archivo de destino.  
Además, ts-surgeon resuelve de raíz la penalización de los \~350 ms de carga de ts-morph y los segundos de parseo de tsconfig.json mediante su modo batch, el cual permite que múltiples operaciones compartan un único proyecto parseado en memoria donde cada paso sucesivo observa el AST mutado por el paso anterior sin releer del disco. Finalmente, incluye un plugin para entornos de agentes (como OpenCode) que intercepta búsquedas grep recursivas sobre archivos de código para redirigir al agente hacia consultas AST, y aplica heurísticas sobre archivos de plantillas (.vue, .svelte, .astro, .gts, .html) que quedan fuera del programa estándar de TypeScript, emitiendo advertencias durante renombrados y bloqueando safe\_delete\_symbol si una plantilla aún referencia el identificador.

| Herramienta / Librería       | Motor Subyacente                     | Conciencia de Tipos (TypeChecker)       | Velocidad de Ejecución                     | Caso de Uso Ideal en Refactorización de Duplicados                                                                     |
| :--------------------------- | :----------------------------------- | :-------------------------------------- | :----------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| fallow **/** fallow-mcp      | Rust \+ Oxc AST \+ Suffix/LCP Arrays | Opcional (\--type-aware)                | Ultra-rápida (1,48s en 20k archivos)       | Detección determinista de clones, agrupación en clone\_families, eliminación de código muerto y validación CI.         |
| ast-grep **(**sg **/ NAPI)** | Rust \+ Tree-sitter                  | No (puramente sintáctico)               | Instantánea (multinúcleo)                  | Reemplazo masivo de bloques triplicados en sitios de llamada mediante metavariables \$META y \$\$\$ARGS.               |
| GritQL **/** Biome           | Rust \+ Tree-sitter / Biome CST      | Limitada a cláusulas estructurales      | Instantánea (nativa en Rust)               | Migraciones compuestas con condiciones contextuales (where, contains) y reglas de linter con autofix.                  |
| ts-morph                     | TypeScript Compiler API              | Completa (Símbolos, Tipos, Referencias) | Moderada (\~350ms arranque \+ parseo O(n)) | Creación programática de módulos compartidos, inyección de import, resolución de rutas y alias de tsconfig.            |
| ts-surgeon                   | Híbrido (ts-morph \+ ast-grep)       | Completa \+ Predicados (rewrite\_where) | Alta en modo batch (AST en caché)          | Movimiento de símbolos entre archivos (move\_symbol\_to\_file), renombrado seguro y reescritura condicionada por tipo. |

## **Decisión Arquitectónica: Adoptar Herramientas Existentes frente a Construir Herramientas Propias**

Ante la disyuntiva de utilizar herramientas existentes o construir herramientas propias de refactorización, el análisis técnico ofrece una conclusión precisa: no se debe construir un analizador estático ni un motor de transformación sintáctica desde cero, pero sí resulta indispensable construir un arnés de orquestación propio y ligero (_Custom Refactoring Harness_) que conecte las herramientas existentes con el agente.  
La razón fundamental por la cual ninguna herramienta CLI existente puede refactorizar bloques duplicados arbitrarios de forma 100 % desatendida con un solo comando radica en la naturaleza de las seis refactorizaciones mecánicas fundamentales (_Core 6 Refactorings_: renombrar símbolo, extraer función, poner variable en línea, introducir variable, cambiar firma y mover símbolo). Mientras que operaciones como renombrar o mover un símbolo de nivel superior cuentan con rutas deterministas en CLI (resueltas por ts-surgeon), la operación _Extract Function_ —extraer un fragmento arbitrario de sentencias dentro de un método hacia una nueva función parametrizada— carece de una ruta puramente CLI en TypeScript y requiere ya sea la intervención de un servidor de lenguaje (LSP) o scripting personalizado sobre la API del compilador (getEditsForRefactor). Consolidar un bloque triplicado disperso en tres archivos exige primero analizar el flujo de datos para identificar qué variables locales leídas dentro del clon provienen del ámbito externo y cuáles se retornan, luego diseñar una firma de tipos unificada junto con un nombre semántico adecuado al dominio, y finalmente reemplazar los tres bloques originales por llamadas a la nueva función inyectando las sentencias import correspondientes.  
Los modelos de lenguaje son sumamente rápidos y precisos sintetizando la firma de la función extraída y el patrón de coincidencia cuando se les entregan únicamente los tres fragmentos de código del clon, pero colapsan al ejecutar la edición mecánica y la gestión de importaciones sobre archivos completos. Por el contrario, ast-grep, ts-morph y ts-surgeon ejecutan las mutaciones en el AST y el cableado de módulos en milisegundos con exactitud determinista, pero carecen de juicio semántico para diseñar la abstracción. La siguiente tabla contrasta el flujo tradicional de un agente frente a la arquitectura del arnés híbrido determinista propuesto:

| Etapa del Proceso               | Flujo Tradicional de Agente (Alta Latencia y Bloqueos)                                                           | Arnés Híbrido Determinista (Baja Latencia y Progreso Garantizado)                                                                                    |
| :------------------------------ | :--------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1\. Descubrimiento y Triaje** | Búsqueda textual recursiva con grep o expresiones regulares frágiles ante cambios de formato.                    | Ejecución de fallow dupes en JSON con podado previo de código muerto (\--include-dupes) y filtro minOccurrences: 3.                                  |
| **2\. Ingesta de Contexto**     | Lectura de los archivos fuente completos en cada llamada a herramientas, inflando el costo de API y la latencia. | Extracción exclusiva de los rangos de líneas reportados en instances\[\] ($\pm 5$ líneas) con validación por hash sha256 (ahorro del 64,8 % en API). |
| **3\. Rol del Agente de IA**    | Edición manual línea por línea de cada archivo consumidor y de las cabeceras import.                             | Síntesis acotada: el agente solo diseña el código de la función compartida y la regla declarativa de ast-grep con metavariables \$META.              |
| **4\. Mutación y Cableado**     | Aplicación secuencial de parches de texto propensos a desfases de líneas y múltiples recargas de tsc.            | Ejecución en memoria en una sola pasada (@ast-grep/napi \+ ts-morph / ts-surgeon), inyectando y organizando import automáticamente.                  |
| **5\. Verificación y Cierre**   | Bucle de prueba y error leyendo trazas de compilación fallidas en toda la consola.                               | Compuerta determinista en menos de 2 segundos mediante fallow audit y actualización de línea base con \--save-baseline.                              |

En consecuencia, la estrategia óptima combina dos acciones: instalar los servidores MCP y paquetes CLI oficiales (fallow-mcp junto con fallow-skills, @ast-grep/cli / ast-grep-mcp y @commoncurriculum/ts-surgeon) para dotar al agente de visibilidad estructural inmediata, y construir un arnés programático propio en TypeScript de menos de 100 líneas que utilice @ast-grep/napi y ts-morph en memoria para aplicar las refactorizaciones en lote sin recargar tsconfig.json.

## **Implementación Paso a Paso del Pipeline de Refactorización Automatizada**

### **Fase 1: Ingesta Determinista y Extracción de Micro-Contexto (Patrón Dirac)**

En lugar de instruir al agente con órdenes abiertas para buscar y refactorizar duplicados en el repositorio, un script coordinador ejecuta fallow dupes filtrando por minOccurrences: 3 en modo semántico y captura el documento JSON tipado (identificado por el campo raíz kind: "dupes"):

```sh
fallow dupes --min-occurrences 3 --mode semantic --format json --quiet 2>/dev/null || true
```

Cada entrada dentro de clone\_groups\[\] proporciona una huella digital estable (fingerprint, con formato dup:\<8hex\>), el conteo de tokens (token\_count), la métrica de dispersión (spread) y el arreglo de instances\[\] con las rutas de archivo y los rangos exactos de líneas donde habita cada copia (marcando además con is\_symlink: true si alguna instancia reside bajo un enlace simbólico). Asimismo, el arreglo clone\_families\[\] agrupa los clones que co-ocurren en el mismo conjunto de archivos.  
Aplicando la técnica de Ediciones Ancladas por Hash (_Hash-Anchored Edits_), el coordinador lee del disco únicamente los rangos de líneas detallados en instances\[\] más un margen de 5 líneas de contexto circundante para cada ocurrencia, calculando un hash sha256 sobre dichas líneas antes de enviarlas al modelo. Si se requiere desambiguar los tipos de las variables locales que entran al bloque duplicado, el coordinador consulta a ts-surgeon get\_type\_at\_position sobre el archivo y línea de inicio del clon, obteniendo los tipos inferidos exactos sin ejecutar tsc. Al suministrar al agente únicamente estos fragmentos de \~20 líneas junto con sus tipos inferidos, la latencia de razonamiento se reduce a un par de segundos.

### **Fase 2: Delegación Acotada al Agente (Diseño de Abstracción y Regla AST)**

Con los fragmentos del clon en su contexto, el agente tiene estrictamente prohibido editar los archivos consumidores a mano. Su única responsabilidad consiste en devolver una carga útil JSON con dos elementos: el código TypeScript de la nueva función parametrizada (o, si el clon corresponde a una función completa que ya existe en uno de los archivos, la instrucción de ejecutar ts-surgeon move\_symbol\_to\_file para promoverla a un módulo compartido arrastrando sus dependencias exclusivas) y el patrón de reescritura de ast-grep donde los identificadores o literales divergentes se expresan mediante metavariables \$META.  
Por ejemplo, si fallow dupes \--mode semantic detecta un bloque triplicado de validación y normalización en tres servicios distintos donde varían el nombre de la variable de entidad, la propiedad inspeccionada y los literales de error, el agente produce esta regla de ast-grep:

```xml
id: consolidate-entity-validation-dup-a1b2c3d4
language: TypeScript
rule:
  pattern: |
    if (!$ENTITY.$FIELD) {
      logger.warn($WARN_MSG, { id: $ENTITY?.id });
      throw new DomainError($ERR_CODE, $ERR_MSG);
    }
    const $RESULT = normalizePayload($ENTITY.$FIELD, $$$OPTS);
fix: |
  const $RESULT = assertAndNormalizeEntity($ENTITY, "$FIELD", {
    warnMsg: $WARN_MSG,
    errCode: $ERR_CODE,
    errMsg: $ERR_MSG,
    opts: [$$$OPTS]
  });
```

Cuando exista la posibilidad de que ese mismo patrón sintáctico coincida en archivos donde \$ENTITY posee un tipo incompatible, el flujo puede invocar ts-surgeon rewrite\_where pasando el predicado "assignable" (junto con where.typeDeclarationPath) o "extends" para filtrar las coincidencias sintácticas de ast-grep a través del TypeChecker de ts-morph antes de mutar el código.

### **Fase 3: El Arnés Programático Propio en TypeScript (**@ast-grep/napi **\+** ts-morph**)**

Aquí es donde la creación de una herramienta interna ligera resuelve el problema de raíz. Cuando ast-grep reemplaza los tres bloques duplicados por una llamada a assertAndNormalizeEntity(...), cada archivo modificado necesita importar dicho símbolo desde el nuevo módulo compartido utilizando el especificador de ruta relativo correcto, sin duplicar sentencias import previas y limpiando aquellas importaciones antiguas (como DomainError o normalizePayload) que hayan dejado de utilizarse en el archivo tras la extracción.  
Implementar un script propio (scripts/apply-duplication-refactor.ts) combinando @ast-grep/napi y ts-morph permite ejecutar la creación del módulo compartido, la reescritura estructural en los sitios de llamada y el ajuste de todas las importaciones manteniendo una única instancia de Project de ts-morph en memoria:

```ts
import { parse, Lang } from '@ast-grep/napi';
import { Project, SourceFile } from 'ts-morph';

interface RefactorBatchPayload {
  sharedModulePath: string;
  exportedFunctionName: string;
  sharedFunctionCode: string;
  targetFiles: string[];
  astPattern: string;
  astRewrite: string;
}

export function ensureNamedImports(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  namedImports: string[]
): void {
  const existingImport =
    sourceFile
      .getImportDeclarations()
      .find((imp) => imp.getModuleSpecifierValue() === moduleSpecifier) ??
    sourceFile.addImportDeclaration({ moduleSpecifier });

  const missingImports = namedImports.filter(
    (name) => !existingImport.getNamedImports().some((ni) => ni.getName() === name)
  );

  if (missingImports.length > 0) {
    existingImport.addNamedImports(missingImports);
  }
}

export async function executeBatchRefactor(payload: RefactorBatchPayload): Promise<void> {
  // 1. Inicialización única del proyecto tsconfig (amortiza los ~350ms de carga)
  const project = new Project({
    tsConfigFilePath: './tsconfig.json'
  });

  // 2. Crear o actualizar el módulo compartido con la función extraída
  let sharedFile = project.getSourceFile(payload.sharedModulePath);
  if (!sharedFile) {
    sharedFile = project.createSourceFile(payload.sharedModulePath, '', { overwrite: false });
  }
  if (!sharedFile.getFunction(payload.exportedFunctionName)) {
    sharedFile.addStatements(`\n${payload.sharedFunctionCode}\n`);
  }

  // 3. Iterar únicamente sobre los archivos reportados en instances[] de Fallow
  for (const filePath of payload.targetFiles) {
    const sourceFile = project.getSourceFileOrThrow(filePath);
    const originalText = sourceFile.getFullText();

    // Distinguir gramática TS vs TSX para el motor Tree-sitter de ast-grep
    const lang = filePath.endsWith('.tsx') ? Lang.Tsx : Lang.TypeScript;
    const root = parse(lang, originalText).root();
    const matches = root.findAll(payload.astPattern);

    if (matches.length === 0) continue;

    // Aplicar reescrituras en orden inverso de offset para no invalidar posiciones
    const edits = matches
      .map((match) => match.replace(payload.astRewrite))
      .sort((a, b) => b.startPos - a.startPos);

    let updatedText = originalText;
    for (const edit of edits) {
      updatedText =
        updatedText.slice(0, edit.startPos) + edit.insertedText + updatedText.slice(edit.endPos);
    }

    // Actualizar el buffer en memoria de ts-morph sin tocar el disco aún
    sourceFile.replaceWithText(updatedText);

    // 4. Calcular el especificador de módulo e inyectar el import de forma idempotente
    const moduleSpecifier = sourceFile.getRelativePathAsModuleSpecifierTo(sharedFile);
    ensureNamedImports(sourceFile, moduleSpecifier, [payload.exportedFunctionName]);

    // 5. Limpiar imports que quedaron sin uso tras eliminar el código duplicado
    sourceFile.organizeImports();
  }

  // 6. Persistir todos los cambios al sistema de archivos en una sola operación I/O
  await project.save();
}
```

Este arnés programático elimina simultáneamente todos los puntos de fallo del flujo tradicional. El agente nunca manipula archivos de destino línea por línea, sino que entrega únicamente el objeto RefactorBatchPayload. A continuación, @ast-grep/napi ejecuta el emparejamiento estructural y la sustitución de metavariables en memoria a velocidad nativa de Rust, seleccionando el parser correcto entre Lang.Tsx y Lang.TypeScript según la extensión del archivo. Seguidamente, ts-morph calcula el especificador de ruta exacto entre cada archivo consumidor y el nuevo módulo compartido mediante getRelativePathAsModuleSpecifierTo, inserta la declaración de importación de forma idempotente a través de ensureNamedImports y ejecuta sourceFile.organizeImports() para purgar cualquier importación secundaria que haya quedado huérfana tras retirar el bloque duplicado. Finalmente, todas las mutaciones se persisten en disco mediante una única llamada a project.save(), pagando el costo de inicialización de tsconfig.json una sola vez por lote.

### **Fase 4: Estrategia para Clones Complejos (_Branch by Abstraction_) y Excepciones Intencionales**

Cuando fallow dupes \--near o fallow similar-code identifican duplicaciones de Tipo 3 o Tipo 4 dentro de funciones extensas con alto puntaje CRAP (alta complejidad ciclomática o cognitiva combinada con baja cobertura de pruebas y alta rotación en Git, reportadas por fallow health), reemplazar todas las instancias de golpe introduce un riesgo elevado de regresión.  
En tales escenarios, la disciplina recomendada consiste en aplicar el patrón **Branch by Abstraction**. Primero se introduce una capa de abstracción o interfaz unificada que coexiste con las implementaciones existentes, permitiendo redirigir y validar un sitio de llamada a la vez mediante banderas de características (_feature flags_, auditables con fallow flags) o pruebas unitarias focalizadas antes de retirar el código duplicado remanente. Por el contrario, si tras la inspección (fallow similar-code review o revisión del grupo) se determina que un grupo de clones es intencional por razones de desacoplamiento de dominio, su huella digital más el conteo de instancias debe registrarse en .fallowrc.json bajo duplicates.ignoredClones (por ejemplo, {"duplicates": {"ignoredClones": \["dup:6f12ab34:2"\]}}). De esta manera, fallow silencia el grupo revisado (contabilizándolo en stats.clone\_groups\_ignored) pero reactivará la alerta automáticamente si en el futuro cambian sus tokens o se añade una copia adicional.

### **Fase 5: Verificación en Bucle Cerrado y Bloqueo en Integración Continua**

Una vez que el arnés ejecuta un lote de refactorización, el pipeline cierra el ciclo mediante tres verificaciones deterministas que toman menos de dos segundos. En primer lugar, se validan las fronteras arquitectónicas ejecutando fallow audit \--format json \--quiet 2\>/dev/null || true (o fallow architecture / fallow guard). Al extraer código triplicado hacia un nuevo módulo compartido, es habitual que una ubicación mal elegida viole las reglas de capas del repositorio (soportadas por los presets bulletproof, layered, hexagonal y feature-sliced en .fallowrc.json) o introduzca dependencias circulares (circular-dependencies o re-export-cycle), anomalías que fallow audit detecta de inmediato sobre los archivos modificados. En segundo lugar, se ejecuta fallow fix \--yes \--format json \--quiet para eliminar automáticamente cualquier exportación auxiliar o miembro de enumeración que haya quedado sin consumidores tras la consolidación de los clones. En tercer lugar, se congela el progreso alcanzado actualizando el archivo de línea base del repositorio:

```sh
fallow dupes --save-baseline fallow-baselines/dupes.json
```

Al incorporar fallow audit en las Pull Requests (o fallow dupes \--baseline fallow-baselines/dupes.json en los flujos de GitHub Actions / GitLab CI), el sistema falla exclusivamente cuando un cambio introduce nueva duplicación por encima de la línea base, permitiendo drenar la deuda técnica existente por lotes sin bloquear el desarrollo cotidiano del equipo.

## **Conclusiones**

La lentitud y falta de progreso de los agentes de codificación al refactorizar código duplicado o triplicado en TypeScript no se resuelve incrementando el presupuesto de tokens ni los tiempos de espera del modelo, sino erradicando del flujo del agente la búsqueda textual con grep y la edición manual de archivos completos. La estrategia de máxima eficiencia descansa sobre tres pilares operativos integrados.  
El primer pilar consiste en filtrar antes de transformar mediante fallow: ejecutar fallow dead-code \--include-dupes seguido de fallow fix \--yes elimina instantáneamente las duplicaciones en código muerto, mientras que configurar minOccurrences: 3 con el ranking _Spread-Aware_ concentra el trabajo exclusivamente en bloques triplicados de alto impacto. El segundo pilar radica en equipar el entorno del agente con los servidores MCP y binarios especializados ya disponibles en el ecosistema —específicamente fallow-mcp (con fallow-skills), @ast-grep/cli y @commoncurriculum/ts-surgeon—, estandarizando todas las llamadas a fallow con \--format json \--quiet 2\>/dev/null || true para evitar interrupciones por códigos de salida 1. El tercer pilar es la implementación del arnés programático propio en TypeScript basado en @ast-grep/napi y ts-morph, el cual recorta únicamente las líneas de instances\[\] para que el agente sintetice la función canónica y el patrón AST en segundos, ejecutando luego en memoria y en una sola pasada la reescritura estructural, el cálculo de especificadores de importación y la limpieza de imports huérfanos en todo el proyecto.
