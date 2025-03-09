import chalk from 'chalk';
import { 
  getSemanticDocument, 
  getApiSpecification, 
  getEntityRelationships 
} from '../semantic-manager.js';

/**
 * Handle get semantic document request
 * @param {object} args - Request arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleGetSemanticDocument(args, docManager) {
  const { url_or_id } = args;
  console.error(chalk.blue(`Getting semantic document for: ${url_or_id}`));
  
  try {
    const document = await getSemanticDocument(url_or_id, docManager);
    
    if (!document) {
      return {
        content: [{
          type: "text",
          text: `No semantic document found for: ${url_or_id}`
        }],
        isError: true
      };
    }
    
    // Format the semantic document for display
    let output = `# ${document.title}\n\n`;
    output += `URL: ${document.url}\n\n`;
    
    // API Components
    if (document.apiComponents && document.apiComponents.length > 0) {
      output += `## API Components\n\n`;
      
      document.apiComponents.forEach((component, index) => {
        output += `### ${component.type}: ${component.name || 'Unnamed'}\n\n`;
        
        if (component.description) {
          output += `${component.description}\n\n`;
        }
        
        if (component.parameters && component.parameters.length > 0) {
          output += `Parameters:\n`;
          component.parameters.forEach(param => {
            output += `- \`${param.name}\`${param.type ? `: ${param.type}` : ''}\n`;
            if (param.description) {
              output += `  ${param.description}\n`;
            }
            if (param.defaultValue) {
              output += `  Default: \`${param.defaultValue}\`\n`;
            }
          });
          output += '\n';
        }
        
        if (component.code) {
          output += `\`\`\`\n${component.code}\n\`\`\`\n\n`;
        }
      });
    }
    
    // Code Examples
    if (document.codeExamples && document.codeExamples.length > 0) {
      output += `## Code Examples\n\n`;
      
      document.codeExamples.forEach((example, index) => {
        output += `### ${example.title}\n\n`;
        
        if (example.description) {
          output += `${example.description}\n\n`;
        }
        
        output += `\`\`\`${example.language || ''}\n${example.code}\n\`\`\`\n\n`;
      });
    }
    
    // Conceptual Sections
    if (document.conceptualSections && document.conceptualSections.length > 0) {
      output += `## Conceptual Content\n\n`;
      
      document.conceptualSections.forEach((section, index) => {
        const headingLevel = '#'.repeat(Math.min(section.level + 2, 6));
        output += `${headingLevel} ${section.title}\n\n`;
        
        if (section.content) {
          output += `${section.content}\n\n`;
        }
      });
    }
    
    // Procedure Steps
    if (document.procedureSteps && document.procedureSteps.length > 0) {
      output += `## Procedures\n\n`;
      
      document.procedureSteps.forEach((procedure, index) => {
        output += `### ${procedure.title}\n\n`;
        
        if (procedure.description) {
          output += `${procedure.description}\n\n`;
        }
        
        procedure.steps.forEach((step, stepIndex) => {
          output += `${stepIndex + 1}. ${step}\n`;
        });
        
        output += '\n';
      });
    }
    
    // Warnings
    if (document.warnings && document.warnings.length > 0) {
      output += `## Warnings\n\n`;
      
      document.warnings.forEach((warning, index) => {
        output += `> ⚠️ **Warning:** ${warning.text}\n\n`;
      });
    }
    
    // Notes
    if (document.notes && document.notes.length > 0) {
      output += `## Notes\n\n`;
      
      document.notes.forEach((note, index) => {
        output += `> ℹ️ **Note:** ${note.text}\n\n`;
      });
    }
    
    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}\n\nMake sure you're using a valid URL or document ID.`
      }],
      isError: true
    };
  }
}

/**
 * Handle get API specification request
 * @param {object} args - Request arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleGetApiSpec(args, docManager) {
  const { url_or_id } = args;
  console.error(chalk.blue(`Getting API specification for: ${url_or_id}`));
  
  try {
    const apiSpec = await getApiSpecification(url_or_id, docManager);
    
    if (!apiSpec) {
      return {
        content: [{
          type: "text",
          text: `No API specification found for: ${url_or_id}`
        }],
        isError: true
      };
    }
    
    // Format the API specification for display
    let output = `# API Specification\n\n`;
    output += `Source: ${apiSpec.source || url_or_id}\n\n`;
    
    // Functions
    if (apiSpec.functions && apiSpec.functions.length > 0) {
      output += `## Functions\n\n`;
      
      apiSpec.functions.forEach((func, index) => {
        output += `### ${func.name}\n\n`;
        
        if (func.description) {
          output += `${func.description}\n\n`;
        }
        
        if (func.parameters && func.parameters.length > 0) {
          output += `Parameters:\n`;
          func.parameters.forEach(param => {
            output += `- \`${param.name}\`${param.type ? `: ${param.type}` : ''}\n`;
            if (param.description) {
              output += `  ${param.description}\n`;
            }
            if (param.defaultValue) {
              output += `  Default: \`${param.defaultValue}\`\n`;
            }
          });
          output += '\n';
        }
      });
    }
    
    // Classes
    if (apiSpec.classes && apiSpec.classes.length > 0) {
      output += `## Classes\n\n`;
      
      apiSpec.classes.forEach((cls, index) => {
        output += `### ${cls.name}${cls.extends ? ` extends ${cls.extends}` : ''}\n\n`;
        
        if (cls.description) {
          output += `${cls.description}\n\n`;
        }
      });
    }
    
    // Endpoints
    if (apiSpec.endpoints && apiSpec.endpoints.length > 0) {
      output += `## API Endpoints\n\n`;
      
      apiSpec.endpoints.forEach((endpoint, index) => {
        output += `### ${endpoint.name}\n\n`;
        
        if (endpoint.description) {
          output += `${endpoint.description}\n\n`;
        }
        
        if (endpoint.parameters && endpoint.parameters.length > 0) {
          output += `Parameters:\n`;
          endpoint.parameters.forEach(param => {
            output += `- \`${param.name}\`${param.type ? `: ${param.type}` : ''}\n`;
            if (param.description) {
              output += `  ${param.description}\n`;
            }
          });
          output += '\n';
        }
      });
    }
    
    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}\n\nMake sure you're using a valid URL or document ID.`
      }],
      isError: true
    };
  }
}

/**
 * Handle get relationships request
 * @param {object} args - Request arguments
 * @param {object} docManager - Documentation manager
 * @returns {Promise<object>} - MCP response
 */
export async function handleGetRelationships(args, docManager) {
  const { url_or_id } = args;
  console.error(chalk.blue(`Getting relationships for: ${url_or_id}`));
  
  try {
    const relationships = await getEntityRelationships(url_or_id, docManager);
    
    if (!relationships || Object.keys(relationships).length === 0) {
      return {
        content: [{
          type: "text",
          text: `No relationships found for: ${url_or_id}`
        }],
        isError: true
      };
    }
    
    // Format the relationships for display
    let output = `# Relationships for ${relationships.entityName || url_or_id}\n\n`;
    
    if (relationships.extends && relationships.extends.length > 0) {
      output += `## Extends\n\n`;
      relationships.extends.forEach((entity, index) => {
        output += `${index + 1}. [${entity.name}](${entity.url})\n`;
      });
      output += '\n';
    }
    
    if (relationships.extendedBy && relationships.extendedBy.length > 0) {
      output += `## Extended By\n\n`;
      relationships.extendedBy.forEach((entity, index) => {
        output += `${index + 1}. [${entity.name}](${entity.url})\n`;
      });
      output += '\n';
    }
    
    if (relationships.uses && relationships.uses.length > 0) {
      output += `## Uses\n\n`;
      relationships.uses.forEach((entity, index) => {
        output += `${index + 1}. [${entity.name}](${entity.url})\n`;
      });
      output += '\n';
    }
    
    if (relationships.usedBy && relationships.usedBy.length > 0) {
      output += `## Used By\n\n`;
      relationships.usedBy.forEach((entity, index) => {
        output += `${index + 1}. [${entity.name}](${entity.url})\n`;
      });
      output += '\n';
    }
    
    if (relationships.requires && relationships.requires.length > 0) {
      output += `## Requires\n\n`;
      relationships.requires.forEach((entity, index) => {
        output += `${index + 1}. [${entity.name}](${entity.url})\n`;
      });
      output += '\n';
    }
    
    if (relationships.requiredBy && relationships.requiredBy.length > 0) {
      output += `## Required By\n\n`;
      relationships.requiredBy.forEach((entity, index) => {
        output += `${index + 1}. [${entity.name}](${entity.url})\n`;
      });
      output += '\n';
    }
    
    if (relationships.relatedTo && relationships.relatedTo.length > 0) {
      output += `## Related To\n\n`;
      relationships.relatedTo.forEach((entity, index) => {
        output += `${index + 1}. [${entity.name}](${entity.url})\n`;
      });
      output += '\n';
    }
    
    return {
      content: [{
        type: "text",
        text: output
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}\n\nMake sure you're using a valid URL or document ID.`
      }],
      isError: true
    };
  }
}