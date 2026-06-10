import { Command } from 'commander';
import { addTemplateCommand } from './templates/add';

const program = new Command();

program
  .name('llm-to-apps')
  .description('LLM to Apps platform CLI')
  .version('0.1.0');

const templates = program
  .command('templates')
  .description('Manage application templates');

templates
  .command('add')
  .description('Fetch, validate, and register a template manifest')
  .argument('<manifest-url>', 'Raw URL to a template manifest.json')
  .action(addTemplateCommand);

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);

  console.error(message);
  process.exitCode = 1;
});
