#!/usr/bin/env node
/**
 * DocSI MCP Server - Simple version
 * 
 * This is a simplified version of the MCP server for DocSI that can be
 * used to verify the MCP integration works correctly. It provides basic
 * functionality without relying on the full service architecture.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Initialize logger to console for now
const logger = console;

/**
 * Simple DocSI MCP Server
 */
class SimpleDocSIMcpServer {
  private server: Server;
  private dataDir: string;
  
  constructor() {
    // Create MCP server
    this.server = new Server(
      {
        name: 'docsi',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    // Set up data directory
    this.dataDir = process.env.DOCSI_DATA_DIR || path.join(os.homedir(), '.docsi');
    this.ensureDataDirectory();
    
    // Initialize handlers
    this.setupToolHandlers();
    
    // Handle errors
    this.server.onerror = (error) => {
      logger.error('[MCP Error]', error);
    };
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }
  
  /**
   * Make sure data directory exists
   */
  private ensureDataDirectory(){
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive});
        logger.info(`Created data directory: ${this.dataDir}`);
      }
      
      const sourcesDir = path.join(this.dataDir, 'sources');
      if (!fs.existsSync(sourcesDir)) {
        fs.mkdirSync(sourcesDir);
      }
      
      const cacheDir = path.join(this.dataDir, 'cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir);
      }
    } catch (error) {
      logger.error('Failed to create data directory:', error);
    }
  }
  
  /**
   * Set up MCP tool handlers
   */
  private setupToolHandlers(){
    // Handler for listing available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'docsi-check',
            description: 'Check if the DocSI MCP server is functioning properly',
            inputSchema: {
              type: 'object',
              properties: {
                echo: {
                  type: 'string',
                  description: 'Text to echo back'
                }
              }
            }
          },
          {
            name: 'docsi-info',
            description: 'Get information about the DocSI installation',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });
    
    // Handler for tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments} = request.params;
      
      try {
        switch (name) {
          case 'docsi-check':
            return {
              content: [
                {
                  type: 'text',
                  text: `DocSI MCP server is functioning properly! Echo: ${args?.echo || 'No echo provided'}`
                }
              ]
            };
            
          case 'docsi-info':
            return {
              content: [
                {
                  type: 'text',
                  text: `
DocSI Information:
------------------
Version: 1.0.0
Data Directory: ${this.dataDir}
Running Since: ${new Date().toISOString()}
ProtocolContext Protocol
Transport: stdio
Node Version: ${process.version}
Platform: ${process.platform}
                  `.trim()
                }
              ]
            };
            
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool ${name}: ${message}`
            }
          ],
          isError: true
        };
      }
    });
  }
  
  /**
   * Start the MCP server
   */
  public async start(): Promise {
    try {
      // Connect to stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      logger.info('DocSI MCP server running on stdio');
    } catch (error) {
      logger.error('Failed to start DocSI MCP server:', error);
      process.exit(1);
    }
  }
}

// Create and start server
logger.info('Starting Simple DocSI MCP server...');
const server = new SimpleDocSIMcpServer();
server.start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});