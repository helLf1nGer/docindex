# Installing DocIndex

This guide covers how to install and set up DocIndex, including both the regular and enhanced versions.

## Prerequisites

- Node.js 14.x or higher
- npm 6.x or higher

## Basic Installation

### Global Installation

To install DocIndex globally, making the `docindex` command available system-wide:

```bash
npm install -g docindex
```

### Local Installation

To install DocIndex in your current project:

```bash
npm install docindex
```

## Verifying Installation

After installation, you can verify that DocIndex is working correctly:

```bash
docindex --version
```

You should see the version number displayed.

## Installing from Source

If you want to install from source:

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/docindex.git
   cd docindex
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Link the package globally:
   ```bash
   npm link
   ```

## Using the Enhanced Version

DocIndex comes with two versions:

1. **Regular Version**: Basic documentation indexing for single pages
2. **Enhanced Version**: Advanced crawling for entire documentation sites

### Accessing the Enhanced Version

The enhanced version is available as a separate command:

```bash
docindex-enhanced --help
```

### Switching Between Versions

You can switch the default `docindex` command to use either version:

```bash
# Switch to enhanced version
npm run switch:enhanced

# Switch back to regular version
npm run switch:regular
```

After switching, the `docindex` command will use the selected version.

## Configuration

DocIndex stores its configuration and data in the following locations:

- Configuration: `~/.docindex/config.json`
- Indexed documentation: `~/.docindex/data/`

No additional configuration is needed to get started.

## Troubleshooting

### Command Not Found

If you get a "command not found" error after global installation:

1. Make sure Node.js is in your PATH
2. Try installing with `sudo` on Linux/macOS:
   ```bash
   sudo npm install -g docindex
   ```
3. On Windows, run the command prompt as Administrator

### Permission Issues

If you encounter permission issues when indexing documentation:

1. Make sure you have write access to the `~/.docindex` directory
2. On Linux/macOS, you can fix permissions with:
   ```bash
   sudo chown -R $(whoami) ~/.docindex
   ```

## Updating

To update to the latest version:

```bash
npm update -g docindex
```

Or if installed from source:

```bash
git pull
npm install
npm link