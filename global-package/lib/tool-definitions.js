/**
 * Basic search tool definition
 */
export const SEARCH_TOOL = {
  name: "search",
  description: "Search indexed documentation for specific topics or keywords",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query"
      }
    },
    required: ["query"]
  }
};

/**
 * Semantic search tool definition
 */
export const SEMANTIC_SEARCH_TOOL = {
  name: "semantic-search",
  description: "Perform semantic search across documentation using embeddings for more accurate results",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query"
      }
    },
    required: ["query"]
  }
};

/**
 * API search tool definition
 */
export const API_SEARCH_TOOL = {
  name: "api-search",
  description: "Search for API components (functions, classes, methods) across documentation",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query"
      },
      type: {
        type: "string",
        description: "Type of API component to search for (function, class, method)",
        enum: ["function", "class", "method", "all"]
      }
    },
    required: ["query"]
  }
};

/**
 * Related content tool definition
 */
export const RELATED_CONTENT_TOOL = {
  name: "related-content",
  description: "Find content related to a specific document or API component",
  inputSchema: {
    type: "object",
    properties: {
      url_or_id: {
        type: "string",
        description: "URL or ID of the document or component"
      }
    },
    required: ["url_or_id"]
  }
};

/**
 * Get document tool definition
 */
export const GET_DOCUMENT_TOOL = {
  name: "get-document",
  description: "Get the full content of a document by URL or ID",
  inputSchema: {
    type: "object",
    properties: {
      url_or_id: {
        type: "string",
        description: "URL or ID of the document"
      }
    },
    required: ["url_or_id"]
  }
};

/**
 * Get semantic document tool definition
 */
export const GET_SEMANTIC_DOCUMENT_TOOL = {
  name: "get-semantic-document",
  description: "Get the semantically parsed structure of a document by URL or ID",
  inputSchema: {
    type: "object",
    properties: {
      url_or_id: {
        type: "string",
        description: "URL or ID of the document"
      }
    },
    required: ["url_or_id"]
  }
};

/**
 * Get API specification tool definition
 */
export const GET_API_SPEC_TOOL = {
  name: "get-api-spec",
  description: "Get the API specification extracted from a document by URL or ID",
  inputSchema: {
    type: "object",
    properties: {
      url_or_id: {
        type: "string",
        description: "URL or ID of the document"
      }
    },
    required: ["url_or_id"]
  }
};

/**
 * Get relationships tool definition
 */
export const GET_RELATIONSHIPS_TOOL = {
  name: "get-relationships",
  description: "Get the relationships between a document or API component and other entities",
  inputSchema: {
    type: "object",
    properties: {
      url_or_id: {
        type: "string",
        description: "URL or ID of the document or component"
      }
    },
    required: ["url_or_id"]
  }
};

/**
 * List pages tool definition
 */
export const LIST_PAGES_TOOL = {
  name: "list-pages",
  description: "List all indexed pages for a documentation source",
  inputSchema: {
    type: "object",
    properties: {
      source: {
        type: "string",
        description: "Name of the documentation source"
      }
    },
    required: ["source"]
  }
};

/**
 * Get data directory tool definition
 */
export const GET_DATA_DIR_TOOL = {
  name: "get-data-dir",
  description: "Get the path to the data directory where indexed documentation is stored",
  inputSchema: {
    type: "object",
    properties: {}
  }
};

/**
 * Add source tool definition
 */
export const ADD_SOURCE_TOOL = {
  name: "add-source",
  description: "Add a new documentation source to index",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL of the documentation"
      },
      name: {
        type: "string",
        description: "Name of the documentation source"
      },
      tags: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Tags for categorizing the documentation"
      },
      depth: {
        type: "integer",
        description: "Maximum crawl depth",
        default: 3
      },
      pages: {
        type: "integer",
        description: "Maximum pages to crawl",
        default: 100
      }
    },
    required: ["url", "name"]
  }
};

/**
 * Refresh source tool definition
 */
export const REFRESH_SOURCE_TOOL = {
  name: "refresh-source",
  description: "Refresh documentation for an existing source",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the documentation source to refresh"
      },
      depth: {
        type: "integer",
        description: "Maximum crawl depth",
        default: 3
      },
      pages: {
        type: "integer",
        description: "Maximum pages to crawl",
        default: 100
      }
    },
    required: ["name"]
  }
};

/**
 * Refresh all tool definition
 */
export const REFRESH_ALL_TOOL = {
  name: "refresh-all",
  description: "Refresh all documentation sources",
  inputSchema: {
    type: "object",
    properties: {
      depth: {
        type: "integer",
        description: "Maximum crawl depth",
        default: 3
      },
      pages: {
        type: "integer",
        description: "Maximum pages to crawl",
        default: 100
      }
    }
  }
};

/**
 * Add link tool definition
 */
export const ADD_LINK_TOOL = {
  name: "add-link",
  description: "Add a custom documentation link",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL of the documentation"
      },
      name: {
        type: "string",
        description: "Name of the link"
      },
      tags: {
        type: "array",
        items: {
          type: "string"
        },
        description: "Tags for categorizing the link"
      }
    },
    required: ["url", "name"]
  }
};

/**
 * List sources tool definition
 */
export const LIST_SOURCES_TOOL = {
  name: "list-sources",
  description: "List all indexed documentation sources",
  inputSchema: {
    type: "object",
    properties: {}
  }
};

/**
 * List links tool definition
 */
export const LIST_LINKS_TOOL = {
  name: "list-links",
  description: "List all custom documentation links",
  inputSchema: {
    type: "object",
    properties: {}
  }
};

/**
 * Get all tool definitions
 * @returns {object[]} - Array of all tool definitions
 */
export function getAllTools() {
  return [
    SEARCH_TOOL,
    SEMANTIC_SEARCH_TOOL,
    API_SEARCH_TOOL,
    RELATED_CONTENT_TOOL,
    GET_DOCUMENT_TOOL,
    GET_SEMANTIC_DOCUMENT_TOOL,
    GET_API_SPEC_TOOL,
    GET_RELATIONSHIPS_TOOL,
    LIST_PAGES_TOOL,
    GET_DATA_DIR_TOOL,
    ADD_SOURCE_TOOL,
    REFRESH_SOURCE_TOOL,
    REFRESH_ALL_TOOL,
    ADD_LINK_TOOL,
    LIST_SOURCES_TOOL,
    LIST_LINKS_TOOL
  ];
}