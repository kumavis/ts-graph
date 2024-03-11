const { Project } = require("ts-morph");

const [,, tsConfigPath, sourceFilePattern] = process.argv;
console.warn(`Analyzing source files in ${sourceFilePattern} using TypeScript config file at ${tsConfigPath}`);
if (!tsConfigPath || !sourceFilePattern) {
  console.error("Usage: node index.js <tsConfigPath> <sourceFilePattern>");
  process.exit(1);
}

// Initialize a project
const project = new Project({
  // specify TypeScript config file path (if available)
  tsConfigFilePath: tsConfigPath,
});

// Add source files you want to analyze
project.addSourceFilesAtPaths(sourceFilePattern);

const graph = { nodes: {}, links: []};
const refMap = new Map();

const link = (source, target, type) => {
  if (!graph.nodes[source]) {
    graph.nodes[source] = { label: source };
  }
  if (!graph.nodes[target]) {
    graph.nodes[target] = { label: target };
  }
  graph.links.push({ source, target, type });
}

const isBasicType = (type) => {
  const typeName = type.getText();
  // List of base JavaScript types
  const baseTypes = [
    'string',
    'number',
    'boolean',
    'null',
    'undefined',
    'symbol',
    'object',
    'function',
    'bigint',
    'void',
    'any',
    'unknown',
    'never',
    'Uint8Array',
    'Uint8ClampedArray',
    'Uint16Array',
    'Uint32Array',
    'Int8Array',
    'Int16Array',
    'Int32Array',
    'Float32Array',
    'Float64Array',
    'ArrayBuffer',
    'DataView',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Promise',
    'RegExp',
    'Date',
    'Error',
    'EvalError',
    'RangeError',
    'ReferenceError',
    'SyntaxError',
    'TypeError',
    'URIError',
    'Array',
    'Object',
    'Function',
    'Boolean',
    'Number',
    'String',
    'Symbol',
    'BigInt',
    'Generator',
    'GeneratorFunction',
    'AsyncGenerator',
    'AsyncGeneratorFunction',
    'Iterable',
    'Iterator',
    'AsyncIterable',
    'AsyncIterator',
    'IterableIterator',
    'AsyncIterableIterator',
    'ArrayLike',
  ];
  return baseTypes.includes(typeName);
};

const getTypeParts = (type) => {
  if (type.isUnion()) {
    return type.getUnionTypes().map(t => getTypeParts(t)).flat();
  }
  if (type.isArray()) {
    const elementType = type.getArrayElementType();
    if (!elementType) return [type];
    return getTypeParts(elementType);
  }
  if (type.isTuple()) {
    return type.getElementTypes().map(t => getTypeParts(t)).flat();
  }
  if (type.isIntersection()) {
    return type.getIntersectionTypes().map(t => getTypeParts(t)).flat();
  }
  // if (type.isTypeAlias()) {
  //   return getTypeParts(type.getType());
  // }
  // if (type.isObject()) {
  //   // return type.getProperties().map(p => getTypeParts(p.getType())).flat();
  //   // return type.getProperties().map(p => p.getType());
  // }
  // if (type.isTypeParameter()) {
  //   return getTypeParts(type.getConstraint());
  // }
  if (type.isTypeReference?.()) {
    return type.getTypeArguments().map(t => getTypeParts(t)).flat();
  }
  if (type.isLiteral()) {
    return [type];
  }
  if (isBasicType(type)) {
    return [type];
  }
  // if (type.getText().startsWith("Promise<")) {
    const matches = 
      Reflect.ownKeys(type.__proto__)
      .filter(key => 
        key.startsWith('is')
        && !['isAssignableTo'].includes(key)
        && type[key]()
      )
    console.warn(`Unparseable type: ${type.getText()}\n  matches: [${matches}]`);
  // }
  return [type]
};

const analyzeClass = (classDeclaration) => {
    // Get class name
    const className = classDeclaration.getName();
    if (!className) return;

    if (refMap.has(classDeclaration)) {
      return console.warn("Skipping duplicate class", className);
    }

    refMap.set(classDeclaration, true);

    // Inheritance (extends
    const baseClass = classDeclaration.getBaseClass();
    if (baseClass) {
      if (!isBasicType(baseClass)) {
        link(className, baseClass.getName(), "extends");
      }
    }

    // Analyze methods for used types
    for (const method of classDeclaration.getMethods()) {
      const returnType = method.getReturnType();
      const allParts = getTypeParts(returnType);
      for (const part of allParts) {
        const partLabel = part.getText();
        if (!isBasicType(part)) {
          link(className, partLabel, "returns");
        }
      }
      // Analyze parameters
      for (const param of method.getParameters()) {
        const paramType = param.getType();
        const allParts = getTypeParts(paramType);
        // Add parameter types
        for (const part of allParts) {
          const partLabel = part.getText();
          if (!isBasicType(part)) {
            link(className, partLabel, "call arg");
          }
        }
      }
    }
};

const analyzeInterface = (interfaceDeclaration) => {
    // Get interface name
    const interfaceName = interfaceDeclaration.getName();
    if (!interfaceName) return;

    // Inheritance (extends)
    for (const baseType of interfaceDeclaration.getBaseTypes()) {
      if (!isBasicType(baseType)) {
        link(interfaceName, baseType.getText(), "extends");
      }
    }

    // Analyze methods for used types
    for (const method of interfaceDeclaration.getMethods()) {
      const returnType = method.getReturnType();
      const allParts = getTypeParts(returnType);
      // Add return type to 'uses'
      for (const part of allParts) {
        const partLabel = part.getText();
        if (!isBasicType(part)) {
          link(interfaceName, partLabel, "returns");
        }
      }

      // const allPartLabels = allParts.map(p => p.getText());
      // if (returnType !== "void") {
      //   // graph[interfaceName].uses.push(...allPartLabels);
      // }

      // Analyze parameters
      for (const param of method.getParameters()) {
        const paramType = param.getType();
        const allParts = getTypeParts(paramType);
        for (const part of allParts) {
          const partLabel = part.getText();
          if (!isBasicType(part)) {
            link(interfaceName, partLabel, "call arg");
          }
        }
        // Add parameter types to 'uses'
        // graph[interfaceName].uses.push(paramType);
      }
    }
};

// Analyze source files
const analyzeTypes = () => {
  for (const sourceFile of project.getSourceFiles()) {
    const classes = sourceFile.getClasses();
    const interfaces = sourceFile.getInterfaces();
    for (const classDeclaration of classes) {
      analyzeClass(classDeclaration);
    }
    for (const interfaceDeclaration of interfaces) {
      analyzeInterface(interfaceDeclaration);
    }
  }
  // // Traverse source files and their nodes
  // project.getSourceFiles().forEach(sourceFile => {
  //   sourceFile.forEachDescendant(node => {
  //       if (node.getType) { // Check if the node has a type (e.g., variables, parameters)
  //           const type = node.getType();
  //           processType(type);
  //       }
  //   });
  // });

  return graph;
};

function escapeDotString(str) {
  return str
    // Escapes double quotes by prefixing them with a backslash
    .replace(/(["])/g, '\\$1')
    // Sanitizes the string to create a valid DOT identifier
    // This example removes or replaces special characters, but you might adjust the logic
    .replace(/[^a-zA-Z0-9]/g, '_');
}

function generateDotFile(graph) {
  let dot = 'digraph G {\n';
  dot += '    rankdir=LR;\n';
  
  // For each node, add a node declaration
  for (const [id, node] of Object.entries(graph.nodes)) {
      dot += `  ${escapeDotString(id)} [label="${escapeDotString(node.label)}"];\n`;
  }
  
  // For each link, add an edge declaration
  for (const link of graph.links) {
      // const arrow = link.type === 'directed' ? '->' : '--';
      const arrow = '->';
      dot += `  ${escapeDotString(link.source)} ${arrow} ${escapeDotString(link.target)};\n`;
  }
  
  dot += '}\n';
  return dot;
}

analyzeTypes()
const dotOutput = generateDotFile(graph);
console.log(dotOutput);

// Example usage
// console.log(analyzeTypes());
