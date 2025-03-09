# Integrating DocIndex with Roo Cline MCP

This guide explains how to integrate DocIndex with Roo Cline's Machine Comprehension Protocol (MCP) to enable AI agents to access documentation.

## Overview

DocIndex provides a REST API server that can be registered with Roo Cline's MCP system. This allows Roo to search and retrieve documentation directly through the MCP interface.

## Setup Steps

### 1. Install Dependencies (Optional)

If you want to use the full-featured server, install the dependencies:

```bash
npm run install-deps
```

If you encounter any issues with dependencies, you can use the simple server which doesn't require additional dependencies.

### 2. Update MCP Settings

Run the script to update your MCP settings file:

```bash
npm run update-specific-mcp
```

This will add DocIndex as an MCP server in your Roo Cline settings file located in:
- **Windows**: `%USERPROFILE%\AppData\Roaming\Code\User\globalStorage\rooveterinaryinc.roo-cline\settings\cline_mcp_settings.json`
- **macOS**: `~/Library/Application Support/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`
- **Linux**: `~/.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/settings/cline_mcp_settings.json`

### 3. Start the DocIndex Server

#### Option 1: Full-featured Server (requires dependencies)

Start the full-featured server:

```bash
npm run start:server
```

#### Option 2: Simple Server (no external dependencies)

Start the simple server which uses only Node.js built-in modules:

```bash
npm run start:simple-server
```

#### One-command Setup and Start

To update MCP settings and start the server in one command:

```bash
# For full-featured server (requires dependencies)
npm run setup-and-start

# For simple server (no external dependencies)
npm run setup-and-start:simple
```

The server will run on port 3000 by default.

### 4. Index Documentation (Optional)

If you haven't already indexed documentation, you can do so using the enhanced CLI:

```bash
npm run start:enhanced add --url https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide --name "MDN JavaScript" --depth 2 --pages 100
```

## Using DocIndex with Roo Cline

Once the server is running and registered with MCP, you can use it in Roo Cline:

### Searching Documentation

In Roo Cline, you can search documentation using:

```
DocIndex > search?q=your_search_term
```

For example:
```
DocIndex > search?q=javascript objects
```

### Listing Documentation Sources

To list all indexed documentation sources:

```
DocIndex > sources
```

### Listing Custom Links

To list all custom documentation links:

```
DocIndex > links
```

## API Endpoints

### Full-featured Server Endpoints

The full-featured DocIndex server provides the following endpoints:

- `GET /search?q=query` - Search documentation
- `GET /sources` - List documentation sources
- `GET /links` - List custom links
- `POST /sources` - Add documentation source
- `POST /links` - Add custom link
- `PUT /sources/:name` - Update documentation
- `DELETE /sources/:name` - Remove documentation source
- `DELETE /links/:name` - Remove custom link
- `GET /health` - Health check

### Simple Server Endpoints

The simple server provides a subset of endpoints:

- `GET /search?q=query` - Search documentation
- `GET /sources` - List documentation sources
- `GET /links` - List custom links
- `GET /health` - Health check

## Troubleshooting

### Server Won't Start

If the full-featured server won't start due to missing dependencies:

1. Try installing dependencies:
   ```bash
   npm run install-deps
   ```

2. If dependency installation fails, use the simple server instead:
   ```bash
   npm run start:simple-server
   ```

### MCP Integration Issues

If Roo Cline can't connect to DocIndex:
- Ensure the server is running
- Check that the MCP settings file was updated correctly
- Verify the server URL in the MCP settings matches the actual server address

### Documentation Not Found

If searches return no results:
- Make sure you've indexed documentation using the enhanced CLI
- Check that the indexing completed successfully
- Try indexing with a smaller depth and page count first

## Advanced Configuration

### Changing the Server Port

To run the server on a different port:

```bash
# For full-featured server
npm run start:server 8080

# For simple server
npm run start:simple-server 8080
```

Remember to update the MCP settings with the new port:

```bash
node update-specific-mcp.js 8080
```

### Custom Server Name

To use a different name for the server in MCP:

```bash
node update-specific-mcp.js 3000 MyDocs
```

## Security Considerations

### Path Security

DocIndex implements several security measures to ensure proper path handling:

1. **Safe Path Utilities**: All file operations use path sanitization to prevent path traversal attacks
2. **Environment Variable Configuration**: Paths can be configured via environment variables instead of hardcoded values
3. **Home Directory Detection**: Uses OS-specific methods to determine user directories securely
4. **Input Validation**: Sanitizes all user input before using it in file operations

### Configuration

You can customize the data storage location by setting these environment variables:

```bash
# Base directory for all DocIndex data
export DOCSI_BASE_DIR=~/custom-docindex

# Specific directories (optional)
export DOCSI_DATA_DIR=~/custom-docindex/data
export DOCSI_CACHE_DIR=~/custom-docindex/cache
export DOCSI_MODEL_DIR=~/custom-docindex/models
```

This is especially useful in multi-user environments or when working with sensitive documentation.