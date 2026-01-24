import { loadService, executeService, runPreflight, createReport, formatReportAsText, getImageName, buildServiceImage } from '@ignite/core';
import { logger, ConfigError } from '@ignite/shared';

interface RunOptions {
  input?: string;
  skipPreflight?: boolean;
  json?: boolean;
}

export async function runCommand(servicePath: string, options: RunOptions): Promise<void> {
  try {
    const service = await loadService(servicePath);
    const serviceName = service.config.service.name;
    const imageName = getImageName(serviceName);

    logger.info(`Running service: ${serviceName}`);

    let input: unknown;
    if (options.input) {
      try {
        input = JSON.parse(options.input);
      } catch {
        throw new ConfigError(`Invalid JSON input: ${options.input}`);
      }
    }

    logger.info(`Building image for ${serviceName}...`);
    await buildServiceImage(service, imageName);

    let preflightResult = await runPreflight(service, { imageName });

    if (!options.skipPreflight && preflightResult.overallStatus === 'fail') {
      logger.failure('Preflight checks failed. Use --skip-preflight to force execution.');
      process.exit(1);
    }

    const metrics = await executeService(service, { input, skipBuild: true });

    const report = createReport(preflightResult, metrics);

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReportAsText(report));
    }

    if (metrics.exitCode !== 0) {
      process.exit(metrics.exitCode);
    }
  } catch (err) {
    logger.error(`Execution failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
