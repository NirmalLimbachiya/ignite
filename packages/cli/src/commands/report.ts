import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadService, runPreflight, createReport, formatReportAsText, getLastExecutionMs } from '@ignite/core';
import { logger } from '@ignite/shared';

interface ReportOptions {
  output?: string;
  json?: boolean;
}

export async function reportCommand(servicePath: string, options: ReportOptions): Promise<void> {
  try {
    const service = await loadService(servicePath);
    const serviceName = service.config.service.name;

    logger.info(`Generating report for: ${serviceName}`);

    const lastExecution = getLastExecutionMs(serviceName);
    const preflightResult = await runPreflight(service, {
      lastExecutionMs: lastExecution,
    });

    const report = createReport(preflightResult);

    if (options.output) {
      const outputPath = join(process.cwd(), options.output);
      const content = options.json
        ? JSON.stringify(report, null, 2)
        : formatReportAsText(report);

      await writeFile(outputPath, content);
      logger.success(`Report saved to ${outputPath}`);
    } else if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatReportAsText(report));
    }
  } catch (err) {
    logger.error(`Report generation failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
