import type { PreflightCheck } from '@ignite/shared';
import type { LoadedService } from '../service/service.types.js';

const MEMORY_PER_DEP_MB = 2;
const BASE_MEMORY_MB = 50;

export function analyzeMemory(service: LoadedService): PreflightCheck {
  const configuredMemoryMb = service.config.service.memoryMb;
  const depCount = service.dependencyCount ?? 0;
  const estimatedMemoryMb = BASE_MEMORY_MB + depCount * MEMORY_PER_DEP_MB;

  if (configuredMemoryMb < estimatedMemoryMb * 0.8) {
    return {
      name: 'memory-allocation',
      status: 'fail',
      message: `Configured memory ${configuredMemoryMb}MB may be insufficient. Estimated need: ${estimatedMemoryMb}MB based on ${depCount} dependencies`,
      value: configuredMemoryMb,
      threshold: estimatedMemoryMb,
    };
  }

  if (configuredMemoryMb < estimatedMemoryMb) {
    return {
      name: 'memory-allocation',
      status: 'warn',
      message: `Configured memory ${configuredMemoryMb}MB is close to estimated need of ${estimatedMemoryMb}MB`,
      value: configuredMemoryMb,
      threshold: estimatedMemoryMb,
    };
  }

  return {
    name: 'memory-allocation',
    status: 'pass',
    message: `Configured memory ${configuredMemoryMb}MB exceeds estimated need of ${estimatedMemoryMb}MB`,
    value: configuredMemoryMb,
    threshold: estimatedMemoryMb,
  };
}

export function analyzeDependencies(service: LoadedService): PreflightCheck {
  const depCount = service.dependencyCount ?? 0;
  const nodeModulesSizeMb = service.nodeModulesSize
    ? Math.round(service.nodeModulesSize / 1024 / 1024)
    : 0;

  if (depCount > 100) {
    return {
      name: 'dependency-count',
      status: 'warn',
      message: `High dependency count (${depCount}). node_modules size: ${nodeModulesSizeMb}MB. Consider reducing dependencies for faster cold starts.`,
      value: depCount,
      threshold: 100,
    };
  }

  if (depCount > 50) {
    return {
      name: 'dependency-count',
      status: 'pass',
      message: `Moderate dependency count (${depCount}). node_modules size: ${nodeModulesSizeMb}MB`,
      value: depCount,
      threshold: 50,
    };
  }

  return {
    name: 'dependency-count',
    status: 'pass',
    message: `Low dependency count (${depCount}). node_modules size: ${nodeModulesSizeMb}MB`,
    value: depCount,
    threshold: 50,
  };
}
