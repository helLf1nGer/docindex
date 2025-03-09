/**
 * MCP Settings Updater
 * 
 * This module handles updating MCP settings files to register/unregister DocIndex.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Default MCP settings paths for different IDEs
const MCP_SETTINGS_PATHS = {
  vscode: path.join(
    process.env.APPDATA || 
    (process.platform === 'darwin' ? 
      path.join(os.homedir(), 'Library', 'Application Support') : 
      path.join(os.homedir(), '.config')),
    'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json'
  ),
  // Add other IDEs as they become available with MCP support
};

// Server name in MCP settings
const SERVER_NAME = 'DocIndex';

/**
 * Register DocIndex with MCP
 * @param {number} port - The port the server is running on
 */
function register(port = 3000) {
  // Try to update settings for all supported IDEs
  let success = false;
  
  for (const [ide, settingsPath] of Object.entries(MCP_SETTINGS_PATHS)) {
    if (updateMcpSettings(settingsPath, port, true)) {
      console.log(`Registered DocIndex with ${ide.toUpperCase()} MCP settings.`);
      success = true;
    }
  }
  
  if (!success) {
    throw new Error('Could not find any MCP settings files to update.');
  }
}

/**
 * Unregister DocIndex from MCP
 */
function unregister() {
  // Try to update settings for all supported IDEs
  let success = false;
  
  for (const [ide, settingsPath] of Object.entries(MCP_SETTINGS_PATHS)) {
    if (updateMcpSettings(settingsPath, 0, false)) {
      console.log(`Unregistered DocIndex from ${ide.toUpperCase()} MCP settings.`);
      success = true;
    }
  }
  
  if (!success) {
    throw new Error('Could not find any MCP settings files to update.');
  }
}

/**
 * Update MCP settings file
 * @param {string} settingsPath - Path to the MCP settings file
 * @param {number} port - The port the server is running on
 * @param {boolean} register - Whether to register or unregister
 * @returns {boolean} - Whether the update was successful
 */
function updateMcpSettings(settingsPath, port, register) {
  try {
    // Check if the file exists
    if (!fs.existsSync(settingsPath)) {
      // If registering, create the directory and an empty settings file
      if (register) {
        const settingsDir = path.dirname(settingsPath);
        if (!fs.existsSync(settingsDir)) {
          fs.mkdirSync(settingsDir, { recursive: true });
        }
        fs.writeFileSync(settingsPath, JSON.stringify({ mcpServers: {} }, null, 2));
      } else {
        // If unregistering and file doesn't exist, nothing to do
        return false;
      }
    }
    
    // Read the current settings
    const settingsContent = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(settingsContent);
    
    // Ensure mcpServers object exists
    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }
    
    if (register) {
      // Get the full path to the docindex-mcp.js file
      const scriptPath = path.resolve(__dirname, '..', 'bin', 'docindex-mcp.js');
      
      // Create DocIndex server configuration with command-based approach using full path
      const docIndexServer = {
        command: "node",
        args: [scriptPath, "start", "--daemon"],
        url: `http://localhost:${port}`,
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
    } else {
      // Remove DocIndex server
      if (settings.mcpServers[SERVER_NAME]) {
        delete settings.mcpServers[SERVER_NAME];
      } else {
        // Server not found, nothing to do
        return false;
      }
    }
    
    // Write updated settings back to file
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    
    return true;
  } catch (error) {
    console.error(`Error updating MCP settings at ${settingsPath}: ${error.message}`);
    return false;
  }
}

module.exports = {
  register,
  unregister
};