import { loadService, runPreflight, getLastExecutionMs } from '@ignite/core';
import { logger } from '@ignite/shared';

export async function preflightCommand(servicePath: string): Promise<void> {
  try {
    logger.info(`Running preflight checks for ${servicePath}...`);

    const service = await loadService(servicePath);
    const lastExecution = getLastExecutionMs(service.config.service.name);

    const result = await runPreflight(service, {
      lastExecutionMs: lastExecution,
    });

    console.log('');

    for (const check of result.checks) {
      const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
      const color = check.status === 'pass' ? '\x1b[32m' : check.status === 'warn' ? '\x1b[33m' : '\x1b[31m';
      const reset = '\x1b[0m';
      console.log(`  ${color}${icon}${reset} ${check.name}`);
      console.log(`    ${check.message}`);
      console.log('');
    }

    const overallIcon = result.overallStatus === 'pass' ? '✓' : result.overallStatus === 'warn' ? '⚠' : '✗';
    const overallColor = result.overallStatus === 'pass' ? '\x1b[32m' : result.overallStatus === 'warn' ? '\x1b[33m' : '\x1b[31m';
    const reset = '\x1b[0m';

    console.log(`${overallColor}${overallIcon} Preflight: ${result.overallStatus.toUpperCase()}${reset}`);
    console.log('');

    if (result.overallStatus === 'fail') {
      process.exit(1);
    }
  } catch (err) {
    logger.error(`Preflight failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
