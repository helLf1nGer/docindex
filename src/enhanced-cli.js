#!/usr/bin/env node

const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const {
  addDocumentationSource,
  addCustomLink,
  updateDocumentation,
  searchDocumentation,
  listDocumentationSources,
  listCustomLinks,
  removeDocumentationSource,
  removeCustomLink
} = require('./enhanced-index');

// Set up the CLI program
program
  .name('docindex')
  .description('A tool for indexing, storing, retrieving, and reusing documentation from different service websites')
  .version('0.2.0');

// Add documentation source command
program
  .command('add')
  .description('Add a new documentation source')
  .option('-u, --url <url>', 'URL of the documentation')
  .option('-n, --name <name>', 'Name of the documentation source')
  .option('-t, --tags <tags>', 'Comma-separated list of tags', val => val.split(','))
  .option('-d, --depth <depth>', 'Maximum crawl depth', parseInt, 3)
  .option('-p, --pages <pages>', 'Maximum pages to crawl', parseInt, 100)
  .action(async (options) => {
    try {
      // If options are missing, prompt for them
      if (!options.url || !options.name) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'url',
            message: 'Enter the URL of the documentation:',
            when: !options.url,
            validate: input => input.trim() !== '' ? true : 'URL is required'
          },
          {
            type: 'input',
            name: 'name',
            message: 'Enter a name for this documentation source:',
            when: !options.name,
            validate: input => input.trim() !== '' ? true : 'Name is required'
          },
          {
            type: 'input',
            name: 'tags',
            message: 'Enter tags (comma-separated):',
            when: !options.tags,
            filter: input => input ? input.split(',').map(tag => tag.trim()) : []
          },
          {
            type: 'input',
            name: 'depth',
            message: 'Enter maximum crawl depth:',
            default: 3,
            when: !options.depth,
            filter: input => parseInt(input)
          },
          {
            type: 'input',
            name: 'pages',
            message: 'Enter maximum pages to crawl:',
            default: 100,
            when: !options.pages,
            filter: input => parseInt(input)
          }
        ]);
        
        // Merge answers with options
        options = { ...options, ...answers };
      }
      
      const spinner = ora('Adding documentation source...').start();
      
      // Ensure depth and pages are numbers
      const depth = parseInt(options.depth) || 3;
      const pages = parseInt(options.pages) || 100;
      
      const source = await addDocumentationSource(
        options.url,
        options.name,
        options.tags || [],
        depth,
        pages
      );
      
      spinner.succeed(`Documentation source "${source.name}" added successfully`);
      console.log(chalk.green('\nSource details:'));
      console.log(chalk.cyan(`Name: ${source.name}`));
      console.log(chalk.cyan(`URL: ${source.url}`));
      console.log(chalk.cyan(`Tags: ${source.tags.join(', ') || 'none'}`));
      console.log(chalk.cyan(`Pages indexed: ${source.pageCount || 0}`));
      console.log(chalk.cyan(`Added at: ${new Date(source.addedAt).toLocaleString()}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Add custom link command
program
  .command('add-custom')
  .description('Add a custom documentation link')
  .option('-u, --url <url>', 'URL of the custom documentation')
  .option('-n, --name <name>', 'Name of the custom documentation')
  .option('-t, --tags <tags>', 'Comma-separated list of tags', val => val.split(','))
  .action(async (options) => {
    try {
      // If options are missing, prompt for them
      if (!options.url || !options.name) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'url',
            message: 'Enter the URL of the custom documentation:',
            when: !options.url,
            validate: input => input.trim() !== '' ? true : 'URL is required'
          },
          {
            type: 'input',
            name: 'name',
            message: 'Enter a name for this custom documentation:',
            when: !options.name,
            validate: input => input.trim() !== '' ? true : 'Name is required'
          },
          {
            type: 'input',
            name: 'tags',
            message: 'Enter tags (comma-separated):',
            when: !options.tags,
            filter: input => input ? input.split(',').map(tag => tag.trim()) : []
          }
        ]);
        
        // Merge answers with options
        options = { ...options, ...answers };
      }
      
      const link = addCustomLink(
        options.url,
        options.name,
        options.tags || []
      );
      
      console.log(chalk.green(`Custom link "${link.name}" added successfully`));
      console.log(chalk.cyan(`Name: ${link.name}`));
      console.log(chalk.cyan(`URL: ${link.url}`));
      console.log(chalk.cyan(`Tags: ${link.tags.join(', ') || 'none'}`));
      console.log(chalk.cyan(`Added at: ${new Date(link.addedAt).toLocaleString()}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Update documentation command
program
  .command('update [name]')
  .description('Update documentation for a source')
  .option('-d, --depth <depth>', 'Maximum crawl depth', parseInt, 3)
  .option('-p, --pages <pages>', 'Maximum pages to crawl', parseInt, 100)
  .action(async (name, options) => {
    try {
      // If name is not provided, show a list of sources to choose from
      if (!name) {
        const sources = listDocumentationSources();
        
        if (sources.length === 0) {
          console.log(chalk.yellow('No documentation sources found. Add one first with the "add" command.'));
          return;
        }
        
        const { selectedSource } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedSource',
            message: 'Select a documentation source to update:',
            choices: sources.map(source => ({
              name: `${source.name} (${source.url})`,
              value: source.name
            }))
          }
        ]);
        
        name = selectedSource;
      }
      
      const spinner = ora(`Updating documentation for "${name}"...`).start();
      
      // Ensure depth and pages are numbers
      const depth = parseInt(options.depth) || 3;
      const pages = parseInt(options.pages) || 100;
      
      const result = await updateDocumentation(name, depth, pages);
      
      spinner.succeed(`Documentation for "${name}" updated successfully`);
      console.log(chalk.green(`\nIndexed ${result.pageCount} pages`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Search documentation command
program
  .command('search <query>')
  .description('Search indexed documentation')
  .action((query) => {
    try {
      console.log(chalk.cyan(`Searching for "${query}"...`));
      
      const results = searchDocumentation(query);
      
      if (results.documentationMatches.length === 0 && results.customLinkMatches.length === 0) {
        console.log(chalk.yellow('No results found.'));
        return;
      }
      
      // Display documentation matches
      if (results.documentationMatches.length > 0) {
        console.log(chalk.green(`\nFound matches in ${results.documentationMatches.length} documentation sources:`));
        
        results.documentationMatches.forEach((result, index) => {
          console.log(chalk.cyan(`\n${index + 1}. ${result.source.name} (${result.source.url})`));
          
          result.pageMatches.forEach((pageMatch, pageIndex) => {
            console.log(chalk.yellow(`  Page: ${pageMatch.page.title}`));
            console.log(`  URL: ${pageMatch.page.url}`);
            
            if (pageMatch.matches.headings.length > 0) {
              console.log(chalk.yellow('  Matching headings:'));
              pageMatch.matches.headings.forEach(heading => {
                console.log(`  - ${heading.text}`);
              });
            }
            
            if (pageMatch.matches.paragraphs.length > 0) {
              console.log(chalk.yellow('  Matching content:'));
              pageMatch.matches.paragraphs.forEach(paragraph => {
                console.log(`  - ${paragraph.snippet}`);
              });
            }
            
            if (pageMatch.matches.codeBlocks.length > 0) {
              console.log(chalk.yellow('  Matching code blocks:'));
              pageMatch.matches.codeBlocks.forEach(block => {
                console.log(`  - ${block.code.substring(0, 50)}${block.code.length > 50 ? '...' : ''}`);
              });
            }
          });
        });
      }
      
      // Display custom link matches
      if (results.customLinkMatches.length > 0) {
        console.log(chalk.green(`\nFound ${results.customLinkMatches.length} custom links:`));
        
        results.customLinkMatches.forEach((link, index) => {
          console.log(chalk.cyan(`\n${index + 1}. ${link.name} (${link.url})`));
          if (link.tags && link.tags.length > 0) {
            console.log(`  Tags: ${link.tags.join(', ')}`);
          }
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// List documentation sources command
program
  .command('list')
  .description('List all documentation sources')
  .action(() => {
    try {
      const sources = listDocumentationSources();
      const customLinks = listCustomLinks();
      
      if (sources.length === 0 && customLinks.length === 0) {
        console.log(chalk.yellow('No documentation sources or custom links found.'));
        return;
      }
      
      // Display documentation sources
      if (sources.length > 0) {
        console.log(chalk.green(`\nDocumentation Sources (${sources.length}):`));
        
        sources.forEach((source, index) => {
          console.log(chalk.cyan(`\n${index + 1}. ${source.name}`));
          console.log(`  URL: ${source.url}`);
          if (source.tags && source.tags.length > 0) {
            console.log(`  Tags: ${source.tags.join(', ')}`);
          }
          console.log(`  Pages indexed: ${source.pageCount || 0}`);
          console.log(`  Added: ${new Date(source.addedAt).toLocaleString()}`);
          console.log(`  Last Updated: ${new Date(source.lastUpdated).toLocaleString()}`);
        });
      }
      
      // Display custom links
      if (customLinks.length > 0) {
        console.log(chalk.green(`\nCustom Links (${customLinks.length}):`));
        
        customLinks.forEach((link, index) => {
          console.log(chalk.cyan(`\n${index + 1}. ${link.name}`));
          console.log(`  URL: ${link.url}`);
          if (link.tags && link.tags.length > 0) {
            console.log(`  Tags: ${link.tags.join(', ')}`);
          }
          console.log(`  Added: ${new Date(link.addedAt).toLocaleString()}`);
        });
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Remove documentation source command
program
  .command('remove [name]')
  .description('Remove a documentation source')
  .action(async (name) => {
    try {
      // If name is not provided, show a list of sources to choose from
      if (!name) {
        const sources = listDocumentationSources();
        
        if (sources.length === 0) {
          console.log(chalk.yellow('No documentation sources found.'));
          return;
        }
        
        const { selectedSource } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedSource',
            message: 'Select a documentation source to remove:',
            choices: sources.map(source => ({
              name: `${source.name} (${source.url})`,
              value: source.name
            }))
          }
        ]);
        
        name = selectedSource;
      }
      
      // Confirm removal
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove the documentation source "${name}"?`,
          default: false
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('Operation cancelled.'));
        return;
      }
      
      const source = removeDocumentationSource(name);
      
      console.log(chalk.green(`Documentation source "${source.name}" removed successfully`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Remove custom link command
program
  .command('remove-custom [name]')
  .description('Remove a custom link')
  .action(async (name) => {
    try {
      // If name is not provided, show a list of links to choose from
      if (!name) {
        const links = listCustomLinks();
        
        if (links.length === 0) {
          console.log(chalk.yellow('No custom links found.'));
          return;
        }
        
        const { selectedLink } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedLink',
            message: 'Select a custom link to remove:',
            choices: links.map(link => ({
              name: `${link.name} (${link.url})`,
              value: link.name
            }))
          }
        ]);
        
        name = selectedLink;
      }
      
      // Confirm removal
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove the custom link "${name}"?`,
          default: false
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('Operation cancelled.'));
        return;
      }
      
      const link = removeCustomLink(name);
      
      console.log(chalk.green(`Custom link "${link.name}" removed successfully`));
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// If no arguments provided, show help
if (process.argv.length <= 2) {
  program.help();
}