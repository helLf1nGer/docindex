# Contributing to DocIndex

Thank you for considering contributing to DocIndex! This document provides guidelines and instructions for contributing to the project.

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/docindex.git
   cd docindex
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests:
   ```bash
   npm test
   ```

4. Link the package locally for development:
   ```bash
   npm link
   ```

## Project Structure

- `src/index.js` - Main API implementation
- `src/cli.js` - Command-line interface
- `data/` - Directory for storing indexed documentation
- `tests/` - Test files
- `examples/` - Example usage
- `docs/` - Documentation

## Adding Features

When adding new features:

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Implement your feature
3. Add tests for your feature
4. Update documentation
5. Submit a pull request

## Code Style

- Use 2 spaces for indentation
- Follow JavaScript Standard Style
- Use async/await for asynchronous code
- Add JSDoc comments for functions

## Testing

- Write tests for all new functionality
- Ensure all tests pass before submitting a pull request
- Use Jest for testing

## Documentation

- Update README.md with any new features
- Add or update documentation in the `docs/` directory
- Include examples for new features

## Submitting Pull Requests

1. Ensure your code passes all tests
2. Update documentation as needed
3. Include a clear description of the changes
4. Reference any related issues

## Reporting Issues

When reporting issues, please include:

- A clear description of the issue
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Node.js version, etc.)

## Feature Requests

Feature requests are welcome! Please provide:

- A clear description of the feature
- Why the feature would be useful
- Any implementation ideas you have

## License

By contributing to DocIndex, you agree that your contributions will be licensed under the project's MIT license.