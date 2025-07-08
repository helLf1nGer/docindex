# Using DocIndex with AI Agents

This guide explains how to use DocIndex with AI agents from any project or folder on your local machine.

## Overview

DocIndex provides a REST API that AI agents can use to search and retrieve documentation. This allows your AI agents to access up-to-date documentation for various technologies, libraries, and frameworks.

## Setup Steps

### 1. Install DocIndex Globally

First, install DocIndex globally so it's available from any project:

```bash
# Clone the repository
git clone https://github.com/yourusername/docindex.git
cd docindex

# Install globally
npm install -g .
```

### 2. Start the DocIndex Server

Start the DocIndex server from any directory:

```bash
# Start the simple server (no dependencies)
docindex-simple-server

# Or start the full-featured server (requires dependencies)
docindex-server
```

The server will run on port 3000 by default. You can specify a different port:

```bash
docindex-simple-server 8080
```

### 3. Index Documentation

Index documentation that your AI agent will need:

```bash
# Index JavaScript documentation
docindex-enhanced add --url https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide --name "MDN JavaScript" --depth 2 --pages 100

# Index Python documentation
docindex-enhanced add --url https://docs.python.org/3/tutorial/ --name "Python Tutorial" --depth 2 --pages 50

# Add custom documentation links
docindex add-custom --url https://your-internal-docs.com --name "Internal API" --tags internal,api
```

## Integrating with AI Agents

### Option 1: Direct HTTP Requests

Your AI agent can make HTTP requests to the DocIndex server:

```javascript
// Example in JavaScript
async function searchDocumentation(query) {
  const response = await fetch(`http://localhost:3000/search?q=${encodeURIComponent(query)}`);
  const results = await response.json();
  return results;
}

// Use in your AI agent
async function aiAgent(userQuery) {
  // Search documentation for relevant information
  const docResults = await searchDocumentation(userQuery);
  
  // Process the results and incorporate into the agent's response
  const relevantDocs = processDocResults(docResults);
  
  // Generate response using the documentation
  return generateResponse(userQuery, relevantDocs);
}
```

```python
# Example in Python
import requests

def search_documentation(query):
    response = requests.get(f"http://localhost:3000/search?q={query}")
    return response.json()

# Use in your AI agent
def ai_agent(user_query):
    # Search documentation for relevant information
    doc_results = search_documentation(user_query)
    
    # Process the results and incorporate into the agent's response
    relevant_docs = process_doc_results(doc_results)
    
    # Generate response using the documentation
    return generate_response(user_query, relevant_docs)
```

### Option 2: Using the DocIndex Library

You can also use DocIndex as a library in your project:

```bash
# Add DocIndex to your project
npm install --save path/to/docindex
```

```javascript
// Example in JavaScript
const { searchDocumentation } = require('docindex/src/enhanced-index');

function aiAgent(userQuery) {
  // Search documentation directly
  const results = searchDocumentation(userQuery);
  
  // Process results and generate response
  // ...
}
```

### Option 3: Using with Roo Cline

If you're using Roo Cline, you can access DocIndex through the MCP interface:

```
DocIndex > search?q=your_query
```

## Example: Creating a Documentation-Aware AI Agent

Here's a complete example of an AI agent that uses DocIndex to enhance its responses:

```javascript
const axios = require('axios');

class DocIndexAIAgent {
  constructor(serverUrl = 'http://localhost:3000') {
    this.serverUrl = serverUrl;
  }
  
  async searchDocumentation(query) {
    try {
      const response = await axios.get(`${this.serverUrl}/search?q=${encodeURIComponent(query)}`);
      return response.data;
    } catch (error) {
      console.error('Error searching documentation:', error.message);
      return { documentationMatches: [], customLinkMatches: [] };
    }
  }
  
  extractRelevantContent(results) {
    const relevantContent = [];
    
    // Extract content from documentation matches
    for (const source of results.documentationMatches) {
      for (const pageMatch of source.pageMatches) {
        // Add page title and URL
        relevantContent.push({
          type: 'page',
          title: pageMatch.page.title,
          url: pageMatch.page.url,
          source: source.source.name
        });
        
        // Add matching headings
        for (const heading of pageMatch.matches.headings) {
          relevantContent.push({
            type: 'heading',
            text: heading.text,
            url: pageMatch.page.url,
            source: source.source.name
          });
        }
        
        // Add matching paragraphs
        for (const paragraph of pageMatch.matches.paragraphs) {
          relevantContent.push({
            type: 'paragraph',
            text: paragraph.text || paragraph.snippet,
            url: pageMatch.page.url,
            source: source.source.name
          });
        }
        
        // Add matching code blocks
        for (const codeBlock of pageMatch.matches.codeBlocks) {
          relevantContent.push({
            type: 'code',
            code: codeBlock.code,
            language: codeBlock.language,
            url: pageMatch.page.url,
            source: source.source.name
          });
        }
      }
    }
    
    // Extract content from custom link matches
    for (const link of results.customLinkMatches) {
      relevantContent.push({
        type: 'link',
        name: link.name,
        url: link.url,
        tags: link.tags
      });
    }
    
    return relevantContent;
  }
  
  async processUserQuery(query) {
    // Search for documentation related to the query
    const docResults = await this.searchDocumentation(query);
    const relevantContent = this.extractRelevantContent(docResults);
    
    // Generate a response using the documentation
    let response = `I found the following information about "${query}":\n\n`;
    
    if (relevantContent.length === 0) {
      response = `I couldn't find any documentation about "${query}". Please try a different query.`;
    } else {
      // Group content by source
      const contentBySource = {};
      
      for (const content of relevantContent) {
        const sourceName = content.source || 'Custom Links';
        if (!contentBySource[sourceName]) {
          contentBySource[sourceName] = [];
        }
        contentBySource[sourceName].push(content);
      }
      
      // Format response
      for (const [source, contents] of Object.entries(contentBySource)) {
        response += `## ${source}\n\n`;
        
        for (const content of contents) {
          if (content.type === 'heading') {
            response += `### ${content.text}\n`;
          } else if (content.type === 'paragraph') {
            response += `${content.text}\n\n`;
          } else if (content.type === 'code') {
            response += `\`\`\`${content.language}\n${content.code}\n\`\`\`\n\n`;
          } else if (content.type === 'link') {
            response += `- [${content.name}](${content.url}) ${content.tags ? `(${content.tags.join(', ')})` : ''}\n`;
          } else if (content.type === 'page') {
            response += `[View full documentation](${content.url})\n\n`;
          }
        }
        
        response += '\n';
      }
    }
    
    return response;
  }
}

// Example usage
async function main() {
  const agent = new DocIndexAIAgent();
  const response = await agent.processUserQuery('javascript promises');
  console.log(response);
}

main().catch(console.error);
```

## Using with Different AI Frameworks

### Using with LangChain

```javascript
const { DocIndexAIAgent } = require('./docindex-agent');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { HumanMessage, SystemMessage } = require('langchain/schema');

async function langchainAgent(query) {
  // Get documentation from DocIndex
  const docAgent = new DocIndexAIAgent();
  const docContent = await docAgent.processUserQuery(query);
  
  // Create LangChain chat model
  const chat = new ChatOpenAI({
    temperature: 0.7
  });
  
  // Create messages with documentation context
  const messages = [
    new SystemMessage(`You are a helpful assistant with access to documentation. 
    Use the following documentation to answer the user's question:
    
    ${docContent}`),
    new HumanMessage(query)
  ];
  
  // Get response from LangChain
  const response = await chat.call(messages);
  return response.content;
}
```

### Using with Hugging Face Transformers

```python
import requests
from transformers import pipeline

class DocIndexAgent:
    def __init__(self, server_url='http://localhost:3000'):
        self.server_url = server_url
        self.generator = pipeline('text-generation', model='gpt2')
    
    def search_documentation(self, query):
        response = requests.get(f"{self.server_url}/search?q={query}")
        return response.json()
    
    def process_query(self, query):
        # Get documentation
        doc_results = self.search_documentation(query)
        
        # Process results (simplified)
        context = ""
        for source in doc_results.get('documentationMatches', []):
            for page in source.get('pageMatches', []):
                for para in page.get('matches', {}).get('paragraphs', []):
                    context += para.get('text', '') + "\n\n"
        
        # Generate response with documentation context
        prompt = f"Documentation: {context}\n\nQuestion: {query}\n\nAnswer:"
        response = self.generator(prompt, max_length=200)[0]['generated_text']
        
        return response

# Example usage
agent = DocIndexAgent()
response = agent.process_query("How do JavaScript promises work?")
print(response)
```

## Best Practices

1. **Index Relevant Documentation**: Index documentation that's relevant to your AI agent's domain.

2. **Preprocess Results**: Filter and process DocIndex results to extract the most relevant information.

3. **Provide Context**: Include documentation context in your AI agent's prompts or inputs.

4. **Cite Sources**: Have your AI agent cite the documentation sources in its responses.

5. **Handle Missing Information**: Gracefully handle cases where no relevant documentation is found.

6. **Keep Documentation Updated**: Periodically update your indexed documentation to ensure it's current.

## Troubleshooting

### AI Agent Can't Connect to DocIndex

- Ensure the DocIndex server is running
- Check that the server URL is correct
- Verify there are no network restrictions blocking the connection

### No Relevant Documentation Found

- Index more documentation sources
- Try different search queries
- Check that the documentation has been indexed correctly

### Server Performance Issues

- Reduce the depth and page count when indexing large documentation sites
- Consider running the server on a more powerful machine
- Implement caching in your AI agent for frequently accessed documentation