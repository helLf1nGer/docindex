#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// Configuration
const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE, '.docindex-mcp');
const PID_FILE = path.join(CONFIG_DIR, 'docindex-mcp.pid');
const LOG_FILE = path.join(CONFIG_DIR, 'docindex-mcp.log');
const DEFAULT_PORT = 3000;

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Set up the CLI program
program
  .name('docindex-mcp')
  .description('Documentation indexing and search service for MCP-enabled IDEs')
  .version('0.1.0');

// Start command
program
  .command('start')
  .description('Start the DocIndex MCP server')
  .option('-p, --port <port>', 'Port to run the server on', DEFAULT_PORT)
  .option('-d, --daemon', 'Run as a background daemon', false)
  .action(async (options) => {
    try {
      // Check if server is already running
      const isRunning = await checkIfRunning(options.port);
      
      if (isRunning) {
        console.log(chalk.yellow('DocIndex MCP server is already running.'));
        console.log(chalk.cyan('Use "docindex-mcp status" to check the status.'));
        
        // Register with MCP anyway
        console.log(chalk.cyan('\nRegistering with MCP...'));
        registerWithMCP(options.port);
        return;
      }
      
      const port = options.port;
      const spinner = ora('Starting DocIndex MCP server...').start();
      
      if (options.daemon) {
        // Start as a background daemon
        try {
          const child = spawn('node', [path.join(__dirname, '../lib/server.js'), port], {
            detached: true,
            stdio: ['ignore', fs.openSync(LOG_FILE, 'a'), fs.openSync(LOG_FILE, 'a')]
          });
          
          // Detach the child process
          child.unref();
          
          // Save PID
          fs.writeFileSync(PID_FILE, child.pid.toString());
          
          spinner.succeed(`DocIndex MCP server started on port ${port} (daemon mode).`);
          console.log(chalk.cyan(`Server is running in the background.`));
          console.log(chalk.cyan(`Use "docindex-mcp status" to check the status.`));
          console.log(chalk.cyan(`Use "docindex-mcp stop" to stop the server.`));
          
          // Register with MCP
          console.log(chalk.cyan('\nRegistering with MCP...'));
          registerWithMCP(port);
        } catch (error) {
          spinner.fail(`Failed to start DocIndex MCP server: ${error.message}`);
          process.exit(1);
        }
      } else {
        // Start in foreground
        const server = spawn('node', [path.join(__dirname, '../lib/server.js'), port], {
          detached: false,
          stdio: 'inherit'
        });
        
        // Save PID
        fs.writeFileSync(PID_FILE, server.pid.toString());
        
        spinner.succeed(`DocIndex MCP server started on port ${port}.`);
        console.log(chalk.cyan(`Press Ctrl+C to stop the server.`));
        
        // Register with MCP
        console.log(chalk.cyan('\nRegistering with MCP...'));
        registerWithMCP(port);
        
        // Handle process exit
        process.on('SIGINT', () => {
          console.log(chalk.yellow('\nStopping DocIndex MCP server...'));
          server.kill();
          if (fs.existsSync(PID_FILE)) {
            fs.unlinkSync(PID_FILE);
          }
          process.exit(0);
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Stop command
program
  .command('stop')
  .description('Stop the DocIndex MCP server')
  .action(async () => {
    try {
      const spinner = ora('Stopping DocIndex MCP server...').start();
      
      // Try to kill the process
      if (fs.existsSync(PID_FILE)) {
        const pid = fs.readFileSync(PID_FILE, 'utf8');
        try {
          process.kill(parseInt(pid));
          fs.unlinkSync(PID_FILE);
          spinner.succeed('DocIndex MCP server stopped.');
          
          // Unregister from MCP
          console.log(chalk.cyan('\nUnregistering from MCP...'));
          unregisterFromMCP();
        } catch (error) {
          spinner.warn(`Could not kill process with PID ${pid}: ${error.message}`);
          if (fs.existsSync(PID_FILE)) {
            fs.unlinkSync(PID_FILE);
          }
          spinner.succeed('Removed PID file.');
        }
      } else {
        spinner.fail('DocIndex MCP server is not running or PID file not found.');
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Check the status of the DocIndex MCP server')
  .action(async () => {
    try {
      // Try to get the port from PID file
      let port = DEFAULT_PORT;
      if (fs.existsSync(PID_FILE)) {
        const pid = fs.readFileSync(PID_FILE, 'utf8');
        // We don't have a reliable way to get the port from the PID
        // So we'll just use the default port
      }
      
      const isRunning = await checkIfRunning(port);
      
      if (isRunning) {
        console.log(chalk.green('DocIndex MCP server is running.'));
        console.log(chalk.cyan(`Server is running on port ${port}.`));
        console.log(chalk.cyan(`API URL: http://localhost:${port}`));
        console.log(chalk.cyan(`Use "docindex-mcp stop" to stop the server.`));
      } else {
        console.log(chalk.yellow('DocIndex MCP server is not running.'));
        console.log(chalk.cyan(`Use "docindex-mcp start" to start the server.`));
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Register command
program
  .command('register')
  .description('Register DocIndex with MCP')
  .option('-p, --port <port>', 'Port the server is running on', DEFAULT_PORT)
  .action((options) => {
    try {
      const port = options.port;
      const spinner = ora('Registering DocIndex with MCP...').start();
      
      registerWithMCP(port, spinner);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Unregister command
program
  .command('unregister')
  .description('Unregister DocIndex from MCP')
  .action(() => {
    try {
      const spinner = ora('Unregistering DocIndex from MCP...').start();
      
      unregisterFromMCP(spinner);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Add documentation command
program
  .command('add')
  .description('Add documentation source')
  .option('-u, --url <url>', 'URL of the documentation')
  .option('-n, --name <name>', 'Name of the documentation source')
  .option('-t, --tags <tags>', 'Comma-separated list of tags')
  .option('-d, --depth <depth>', 'Maximum crawl depth', '3')
  .option('-p, --pages <pages>', 'Maximum pages to crawl', '100')
  .action(async (options) => {
    try {
      // Check if server is running
      const isRunning = await checkIfRunning();
      
      if (!isRunning) {
        console.log(chalk.yellow('DocIndex MCP server is not running.'));
        console.log(chalk.cyan(`Use "docindex-mcp start" to start the server.`));
        return;
      }
      
      // Forward to the server
      const { addDocumentation } = require('../lib/client');
      await addDocumentation(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Search command
program
  .command('search <query>')
  .description('Search indexed documentation')
  .action(async (query) => {
    try {
      // Check if server is running
      const isRunning = await checkIfRunning();
      
      if (!isRunning) {
        console.log(chalk.yellow('DocIndex MCP server is not running.'));
        console.log(chalk.cyan(`Use "docindex-mcp start" to start the server.`));
        return;
      }
      
      // Forward to the server
      const { searchDocumentation } = require('../lib/client');
      await searchDocumentation(query);
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .description('List all documentation sources')
  .action(async () => {
    try {
      // Check if server is running
      const isRunning = await checkIfRunning();
      
      if (!isRunning) {
        console.log(chalk.yellow('DocIndex MCP server is not running.'));
        console.log(chalk.cyan(`Use "docindex-mcp start" to start the server.`));
        return;
      }
      
      // Forward to the server
      const { listDocumentation } = require('../lib/client');
      await listDocumentation();
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Helper function to check if server is running
async function checkIfRunning(port = DEFAULT_PORT) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/health',
      method: 'GET',
      timeout: 1000
    }, (res) => {
      if (res.statusCode === 200) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    
    req.on('error', () => {
      resolve(false);
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

// Helper function to register with MCP
function registerWithMCP(port, spinner) {
  try {
    const mcpUpdater = require('../lib/mcp-updater');
    mcpUpdater.register(port);
    
    if (spinner) {
      spinner.succeed('DocIndex registered with MCP successfully.');
    } else {
      console.log(chalk.green('DocIndex registered with MCP successfully.'));
    }
    
    console.log(chalk.cyan('You can now use DocIndex in MCP-enabled IDEs:'));
    console.log(chalk.cyan('  DocIndex > search?q=your_query'));
  } catch (error) {
    if (spinner) {
      spinner.fail(`Failed to register with MCP: ${error.message}`);
    } else {
      console.error(chalk.red(`Failed to register with MCP: ${error.message}`));
    }
  }
}

// Helper function to unregister from MCP
function unregisterFromMCP(spinner) {
  try {
    const mcpUpdater = require('../lib/mcp-updater');
    mcpUpdater.unregister();
    
    if (spinner) {
      spinner.succeed('DocIndex unregistered from MCP successfully.');
    } else {
      console.log(chalk.green('DocIndex unregistered from MCP successfully.'));
    }
  } catch (error) {
    if (spinner) {
      spinner.fail(`Failed to unregister from MCP: ${error.message}`);
    } else {
      console.error(chalk.red(`Failed to unregister from MCP: ${error.message}`));
    }
  }
}

// Parse command line arguments
program.parse(process.argv);

// If no arguments provided, show help
if (process.argv.length <= 2) {
  program.help();
}