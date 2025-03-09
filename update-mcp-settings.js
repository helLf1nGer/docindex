#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Default MCP settings path
const DEFAULT_MCP_SETTINGS_PATH = path.join(
  process.env.APPDATA || 
  (process.platform === 'darwin' ? 
    path.join(process.env.HOME, 'Library', 'Application Support') : 
    path.join(process.env.HOME, '.config')),
  'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'cline_mcp_settings.json'
);

// Get the MCP settings path from command line arguments or use default
const mcpSettingsPath = process.argv[2] || DEFAULT_MCP_SETTINGS_PATH;

// Get the server port from command line arguments or use default
const serverPort = process.argv[3] || 3000;

// Get the server name from command line arguments or use default
const serverName = process.argv[4] || 'DocIndex';

// Function to update MCP settings
async function updateMcpSettings() {
  console.log(`Updating MCP settings at: ${mcpSettingsPath}`);
  
  try {
    // Check if the file exists
    if (!fs.existsSync(mcpSettingsPath)) {
      console.error(`Error: MCP settings file not found at ${mcpSettingsPath}`);
      console.log('Creating a new settings file...');
      
      // Create directory if it doesn't exist
      const settingsDir = path.dirname(mcpSettingsPath);
      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }
      
      // Create a new settings file with default content
      fs.writeFileSync(mcpSettingsPath, JSON.stringify({ mcpServers: {} }, null, 2));
    }
    
    // Read the current settings
    const settingsContent = fs.readFileSync(mcpSettingsPath, 'utf8');
    const settings = JSON.parse(settingsContent);
    
    // Ensure mcpServers object exists
    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }
    
    // Create DocIndex server configuration
    const docIndexServer = {
      url: `http://localhost:${serverPort}`,
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
    
    // Check if DocIndex server already exists
    if (settings.mcpServers[serverName]) {
      console.log(`Server "${serverName}" already exists in MCP settings.`);
      
      const answer = await new Promise(resolve => {
        rl.question(`Do you want to update it? (y/n): `, resolve);
      });
      
      if (answer.toLowerCase() !== 'y') {
        console.log('Operation cancelled.');
        rl.close();
        return;
      }
    }
    
    // Add or update DocIndex server
    settings.mcpServers[serverName] = docIndexServer;
    
    // Write updated settings back to file
    fs.writeFileSync(mcpSettingsPath, JSON.stringify(settings, null, 2));
    
    console.log(`Successfully added/updated "${serverName}" server in MCP settings.`);
    console.log(`Server URL: http://localhost:${serverPort}`);
    console.log('\nYou can now start the DocIndex server with:');
    console.log(`  npm run start:server ${serverPort}`);
    console.log('\nThe server will be available to Roo Cline at:');
    console.log(`  ${serverName} > search?q=your_query`);
    
  } catch (error) {
    console.error(`Error updating MCP settings: ${error.message}`);
  } finally {
    rl.close();
  }
}

// Run the update function
updateMcpSettings();