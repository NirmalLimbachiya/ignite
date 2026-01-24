#!/usr/bin/env bun

import { execSync, spawn } from "child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";

interface BenchmarkResult {
  name: string;
  runs: number[];
  mean: number;
  min: number;
  max: number;
  stdDev: number;
}

interface BenchmarkSuite {
  timestamp: string;
  system: {
    platform: string;
    arch: string;
    dockerVersion: string;
    bunVersion: string;
  };
  results: {
    coldStart: BenchmarkResult;
    warmStart: BenchmarkResult;
    dockerOverhead: BenchmarkResult;
    auditMode: BenchmarkResult;
  };
}

const ITERATIONS = 10;
const WARMUP_RUNS = 2;

function runCommand(cmd: string): { stdout: string; duration: number } {
  const start = performance.now();
  const stdout = execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  const duration = performance.now() - start;
  return { stdout, duration };
}

function runCommandTimed(cmd: string): number {
  const start = performance.now();
  try {
    execSync(cmd, { stdio: ["pipe", "pipe", "pipe"] });
  } catch {}
  return performance.now() - start;
}

function calculateStats(runs: number[]): Omit<BenchmarkResult, "name"> {
  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  const min = Math.min(...runs);
  const max = Math.max(...runs);
  const variance = runs.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / runs.length;
  const stdDev = Math.sqrt(variance);
  return { runs, mean, min, max, stdDev };
}

function createTestService(dir: string): void {
  mkdirSync(dir, { recursive: true });
  
  writeFileSync(join(dir, "package.json"), JSON.stringify({
    name: "benchmark-service",
    version: "1.0.0",
    type: "module"
  }, null, 2));
  
  writeFileSync(join(dir, "service.yaml"), `name: benchmark-service
version: 1.0.0
runtime: bun
entry: index.ts
`);
  
  writeFileSync(join(dir, "index.ts"), `console.log("Benchmark service executed");
process.exit(0);
`);
}

function clearDockerCache(): void {
  try {
    execSync("docker system prune -f", { stdio: "pipe" });
  } catch {}
}

async function benchmarkColdStart(servicePath: string, ignitePath: string): Promise<BenchmarkResult> {
  console.log("\n📊 Benchmarking cold start...");
  const runs: number[] = [];
  
  for (let i = 0; i < ITERATIONS; i++) {
    clearDockerCache();
    execSync("docker rmi ignite-runtime-bun 2>/dev/null || true", { stdio: "pipe" });
    
    const duration = runCommandTimed(`${ignitePath} run ${servicePath}`);
    runs.push(duration);
    process.stdout.write(`  Run ${i + 1}/${ITERATIONS}: ${duration.toFixed(0)}ms\n`);
  }
  
  return { name: "Cold Start", ...calculateStats(runs) };
}

async function benchmarkWarmStart(servicePath: string, ignitePath: string): Promise<BenchmarkResult> {
  console.log("\n📊 Benchmarking warm start...");
  
  for (let i = 0; i < WARMUP_RUNS; i++) {
    runCommandTimed(`${ignitePath} run ${servicePath}`);
  }
  
  const runs: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const duration = runCommandTimed(`${ignitePath} run ${servicePath}`);
    runs.push(duration);
    process.stdout.write(`  Run ${i + 1}/${ITERATIONS}: ${duration.toFixed(0)}ms\n`);
  }
  
  return { name: "Warm Start", ...calculateStats(runs) };
}

async function benchmarkDockerOverhead(servicePath: string): Promise<BenchmarkResult> {
  console.log("\n📊 Benchmarking Docker overhead vs native...");
  
  const nativeRuns: number[] = [];
  const dockerRuns: number[] = [];
  
  for (let i = 0; i < WARMUP_RUNS; i++) {
    runCommandTimed(`bun run ${join(servicePath, "index.ts")}`);
  }
  
  for (let i = 0; i < ITERATIONS; i++) {
    const nativeDuration = runCommandTimed(`bun run ${join(servicePath, "index.ts")}`);
    nativeRuns.push(nativeDuration);
  }
  
  for (let i = 0; i < ITERATIONS; i++) {
    const dockerDuration = runCommandTimed(
      `docker run --rm -v ${servicePath}:/app -w /app oven/bun:alpine bun run index.ts`
    );
    dockerRuns.push(dockerDuration);
  }
  
  const nativeMean = nativeRuns.reduce((a, b) => a + b, 0) / nativeRuns.length;
  const dockerMean = dockerRuns.reduce((a, b) => a + b, 0) / dockerRuns.length;
  const overheadRuns = dockerRuns.map((d, i) => d - nativeRuns[i]);
  
  console.log(`  Native mean: ${nativeMean.toFixed(0)}ms`);
  console.log(`  Docker mean: ${dockerMean.toFixed(0)}ms`);
  console.log(`  Overhead: ${(dockerMean - nativeMean).toFixed(0)}ms`);
  
  return { name: "Docker Overhead", ...calculateStats(overheadRuns) };
}

async function benchmarkAuditMode(servicePath: string, ignitePath: string): Promise<BenchmarkResult> {
  console.log("\n📊 Benchmarking audit mode overhead...");
  
  const normalRuns: number[] = [];
  const auditRuns: number[] = [];
  
  for (let i = 0; i < WARMUP_RUNS; i++) {
    runCommandTimed(`${ignitePath} run ${servicePath}`);
    runCommandTimed(`${ignitePath} run ${servicePath} --audit`);
  }
  
  for (let i = 0; i < ITERATIONS; i++) {
    const normalDuration = runCommandTimed(`${ignitePath} run ${servicePath}`);
    normalRuns.push(normalDuration);
    
    const auditDuration = runCommandTimed(`${ignitePath} run ${servicePath} --audit`);
    auditRuns.push(auditDuration);
  }
  
  const normalMean = normalRuns.reduce((a, b) => a + b, 0) / normalRuns.length;
  const auditMean = auditRuns.reduce((a, b) => a + b, 0) / auditRuns.length;
  const overheadRuns = auditRuns.map((a, i) => a - normalRuns[i]);
  
  console.log(`  Normal mean: ${normalMean.toFixed(0)}ms`);
  console.log(`  Audit mean: ${auditMean.toFixed(0)}ms`);
  console.log(`  Overhead: ${(auditMean - normalMean).toFixed(0)}ms`);
  
  return { name: "Audit Mode Overhead", ...calculateStats(overheadRuns) };
}

function getSystemInfo(): BenchmarkSuite["system"] {
  const dockerVersion = execSync("docker --version", { encoding: "utf-8" }).trim();
  const bunVersion = execSync("bun --version", { encoding: "utf-8" }).trim();
  
  return {
    platform: process.platform,
    arch: process.arch,
    dockerVersion,
    bunVersion
  };
}

function formatResults(suite: BenchmarkSuite): string {
  const lines: string[] = [
    "# Ignite Benchmark Results",
    "",
    `**Date**: ${suite.timestamp}`,
    "",
    "## System",
    "",
    "| Property | Value |",
    "|----------|-------|",
    `| Platform | ${suite.system.platform} |`,
    `| Architecture | ${suite.system.arch} |`,
    `| Docker | ${suite.system.dockerVersion} |`,
    `| Bun | ${suite.system.bunVersion} |`,
    "",
    "## Results",
    "",
    "| Benchmark | Mean | Min | Max | Std Dev |",
    "|-----------|------|-----|-----|---------|",
  ];
  
  for (const result of Object.values(suite.results)) {
    lines.push(
      `| ${result.name} | ${result.mean.toFixed(0)}ms | ${result.min.toFixed(0)}ms | ${result.max.toFixed(0)}ms | ±${result.stdDev.toFixed(0)}ms |`
    );
  }
  
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- **Cold Start**: Time to run a service with no Docker cache (worst case)");
  lines.push("- **Warm Start**: Time to run a service with Docker image cached (typical case)");
  lines.push("- **Docker Overhead**: Additional time Docker adds vs native Bun execution");
  lines.push("- **Audit Mode Overhead**: Additional time for security audit flags");
  lines.push("");
  lines.push(`*${ITERATIONS} iterations per benchmark, ${WARMUP_RUNS} warmup runs excluded*`);
  
  return lines.join("\n");
}

async function main() {
  console.log("🚀 Ignite Benchmark Suite\n");
  console.log("=".repeat(50));
  
  const testDir = "/tmp/ignite-benchmark-service";
  const ignitePath = join(process.cwd(), "packages/cli/dist/index.js");
  
  if (!existsSync(ignitePath)) {
    console.error("❌ CLI not built. Run 'bun run build' first.");
    process.exit(1);
  }
  
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true });
  }
  createTestService(testDir);
  
  const suite: BenchmarkSuite = {
    timestamp: new Date().toISOString(),
    system: getSystemInfo(),
    results: {
      coldStart: await benchmarkColdStart(testDir, `bun ${ignitePath}`),
      warmStart: await benchmarkWarmStart(testDir, `bun ${ignitePath}`),
      dockerOverhead: await benchmarkDockerOverhead(testDir),
      auditMode: await benchmarkAuditMode(testDir, `bun ${ignitePath}`)
    }
  };
  
  console.log("\n" + "=".repeat(50));
  console.log("📋 Summary\n");
  
  const markdown = formatResults(suite);
  console.log(markdown);
  
  const outputPath = join(process.cwd(), "benchmarks", "results.md");
  writeFileSync(outputPath, markdown);
  console.log(`\n✅ Results saved to ${outputPath}`);
  
  const jsonPath = join(process.cwd(), "benchmarks", "results.json");
  writeFileSync(jsonPath, JSON.stringify(suite, null, 2));
  console.log(`✅ Raw data saved to ${jsonPath}`);
  
  rmSync(testDir, { recursive: true });
}

main().catch(console.error);
