#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

// Get the user's home directory dynamically
const HOME_DIR = os.homedir();

// Determine MCP settings path based on the OS
function getMcpSettingsPath() {
  if (process.platform === 'win32') {
    return path.join(HOME_DIR, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json');
  } else if (process.platform === 'darwin') {
    return path.join(HOME_DIR, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json');
  } else {
    // Linux and other platforms
    return path.join(HOME_DIR, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json');
  }
}

// Specific MCP settings path
const MCP_SETTINGS_PATH = getMcpSettingsPath();

// Server port
const SERVER_PORT = process.argv[2] || 3000;

// Server name
const SERVER_NAME = process.argv[3] || 'DocIndex';

// Function to update MCP settings
function updateMcpSettings() {
  console.log(`Updating specific MCP settings at: ${MCP_SETTINGS_PATH}`);
  
  try {
    // Check if the file exists
    if (!fs.existsSync(MCP_SETTINGS_PATH)) {
      console.error(`Error: MCP settings file not found at ${MCP_SETTINGS_PATH}`);
      console.error('Make sure you have Roo Cline installed and have opened it at least once.');
      process.exit(1);
    }
    
    // Read the current settings
    const settingsContent = fs.readFileSync(MCP_SETTINGS_PATH, 'utf8');
    const settings = JSON.parse(settingsContent);
    
    // Ensure mcpServers object exists
    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }
    
    // Create DocIndex server configuration
    const docIndexServer = {
      url: `http://localhost:${SERVER_PORT}`,
      description: "Documentation indexing and search service",
      endpoints: {
        search: {
          path: "/search",
          method: "GET",
          queryParams: ["q"],
          description: "Search indexed documentation"
        },
        sources: {
          path: "/sources",
          method: "GET",
          description: "List all documentation sources"
        },
        links: {
          path: "/links",
          method: "GET",
          description: "List all custom links"
        }
      }
    };
    
    // Add or update DocIndex server
    settings.mcpServers[SERVER_NAME] = docIndexServer;
    
    // Write updated settings back to file
    fs.writeFileSync(MCP_SETTINGS_PATH, JSON.stringify(settings, null, 2));
    
    console.log(`Successfully added/updated "${SERVER_NAME}" server in MCP settings.`);
    console.log(`Server URL: http://localhost:${SERVER_PORT}`);
    console.log('\nYou can now start the DocIndex server with:');
    console.log(`  npm run start:server ${SERVER_PORT}`);
    console.log('\nThe server will be available to Roo Cline at:');
    console.log(`  ${SERVER_NAME} > search?q=your_query`);
    
  } catch (error) {
    console.error(`Error updating MCP settings: ${error.message}`);
    process.exit(1);
  }
}

// Run the update function
updateMcpSettings();