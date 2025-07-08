import { Document } from './Document.js';

/**
 * Entity that represents a document that has been processed with semantic understanding
 */
export interface SemanticDocument {
  /** The original document this semantic document is derived from */
  documentId: string;
  
  /** When the semantic analysis was performed */
  analyzedAt: Date;
  
  /** Model used for embedding generation */
  embeddingModel: string;
  
  /** Vector embedding representation of the document */
  embedding: number[];
  
  /** API components extracted from the document */
  apiComponents: ApiComponent[];
  
  /** Code examples extracted from the document */
  codeExamples: CodeExample[];
  
  /** Conceptual sections extracted from the document */
  conceptualSections: ConceptualSection[];
  
  /** Procedure steps extracted from the document */
  procedureSteps: ProcedureStep[];
  
  /** Warnings and notes extracted from the document */
  warnings: Notice[];
  
  /** Notes extracted from the document */
  notes: Notice[];
  
  /** Entities mentioned in the document */
  entities: Entity[];
  
  /** Key concepts covered in the document */
  concepts: Concept[];
  
  /** Knowledge graph nodes and relationships */
  knowledgeGraph?: KnowledgeGraphFragment;
}

/**
 * Represents an API component (function, method, class, etc.)
 */
export interface ApiComponent {
  /** Type of API component */
  type: 'function' | 'method' | 'class' | 'type' | 'interface' | 'constant' | 'property';
  
  /** Name of the component */
  name: string;
  
  /** Description of the component */
  description: string;
  
  /** Source code or signature */
  code: string;
  
  /** Parameters for function or method */
  parameters?: Parameter[];
  
  /** Return type and description */
  returnType?: {
    type: string;
    description: string;
  };
  
  /** For classes, list of methods */
  methods?: ApiComponent[];
  
  /** For classes, list of properties */
  properties?: ApiComponent[];
  
  /** For methods, parent class or object */
  parent?: string;
  
  /** For classes, parent class */
  extends?: string;
  
  /** For interfaces, implemented interfaces */
  implements?: string[];
  
  /** Examples of usage */
  examples?: string[];
}

/**
 * Represents a function/method parameter
 */
export interface Parameter {
  /** Parameter name */
  name: string;
  
  /** Parameter type */
  type: string;
  
  /** Parameter description */
  description: string;
  
  /** Whether the parameter is required */
  required: boolean;
  
  /** Default value if any */
  defaultValue?: string;
}

/**
 * Represents a code example
 */
export interface CodeExample {
  /** Example code */
  code: string;
  
  /** Programming language */
  language: string;
  
  /** Example title */
  title: string;
  
  /** Example description */
  description: string;
  
  /** API components used in this example */
  usedComponents?: string[];
}

/**
 * Represents a conceptual section in documentation
 */
export interface ConceptualSection {
  /** Section title */
  title: string;
  
  /** Heading level (h1, h2, etc.) */
  level: number;
  
  /** Section content */
  content: string;
  
  /** Subsections */
  subsections: ConceptualSection[];
  
  /** Key concepts covered in this section */
  concepts?: string[];
}

/**
 * Represents procedure steps (how-to instructions)
 */
export interface ProcedureStep {
  /** Procedure title */
  title: string;
  
  /** Procedure description */
  description: string;
  
  /** Ordered steps */
  steps: string[];
}

/**
 * Represents a warning or note in documentation
 */
export interface Notice {
  /** Notice text */
  text: string;
  
  /** HTML content of the notice */
  html: string;
  
  /** Severity (for warnings) */
  severity?: 'info' | 'warning' | 'error';
}

/**
 * Represents an entity mentioned in documentation
 */
export interface Entity {
  /** Entity name */
  name: string;
  
  /** Entity type */
  type: 'api' | 'technology' | 'concept' | 'product' | 'library' | 'framework' | 'person' | 'company';
  
  /** Entity description */
  description?: string;
  
  /** References to this entity in the document */
  references: {
    /** Text snippet containing the reference */
    context: string;
    
    /** Position in the document */
    position: number;
  }[];
}

/**
 * Represents a concept covered in documentation
 */
export interface Concept {
  /** Concept name */
  name: string;
  
  /** Concept description */
  description: string;
  
  /** Related concepts */
  relatedConcepts: string[];
  
  /** Relevance score (0-1) */
  relevance: number;
}

/**
 * Represents a fragment of a knowledge graph
 */
export interface KnowledgeGraphFragment {
  /** Graph nodes */
  nodes: {
    /** Node ID */
    id: string;
    
    /** Node type */
    type: string;
    
    /** Node properties */
    properties: Record<string, any>;
  }[];
  
  /** Graph relationships */
  relationships: {
    /** Source node ID */
    source: string;
    
    /** Target node ID */
    target: string;
    
    /** Relationship type */
    type: string;
    
    /** Relationship properties */
    properties?: Record<string, any>;
  }[];
}