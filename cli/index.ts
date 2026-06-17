import { Command } from 'commander'
import { addTemplateCommand } from './templates/add'
import { checkTemplateUpdatesCommand, updateTemplateCommand } from './templates/updates'

const program = new Command()

program.name('os7').description('OS7 platform CLI').version('0.1.0')

const templates = program.command('templates').description('Manage application templates')

templates
  .command('add')
  .description('Fetch, validate, and register a template manifest')
  .argument('<manifest-url>', 'Raw URL to a template manifest.json')
  .action(addTemplateCommand)

templates
  .command('check-updates')
  .description('Check registered templates for newer manifests')
  .option('--apply', 'Update database rows when newer manifests are found')
  .action(checkTemplateUpdatesCommand)

templates
  .command('update')
  .description('Update one registered template from its update source')
  .argument('<template-id>', 'Template id to update')
  .option('--manifest-url <url>', 'Use an explicit manifest URL')
  .option('--ref <ref>', 'GitHub ref to use when inferring the update URL')
  .option('--path <path>', 'Manifest path to use when inferring the update URL')
  .action(updateTemplateCommand)

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)

  console.error(message)
  process.exitCode = 1
})
