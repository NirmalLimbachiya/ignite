import type { PreflightCheck } from '@ignite/shared';
import { getImageInfo } from '../runtime/docker-runtime.js';

const IMAGE_SIZE_WARN_THRESHOLD_MB = 500;
const IMAGE_SIZE_FAIL_THRESHOLD_MB = 1000;

export async function analyzeImage(imageName: string): Promise<PreflightCheck> {
  const imageInfo = await getImageInfo(imageName);

  if (!imageInfo) {
    return {
      name: 'image-size',
      status: 'fail',
      message: `Image "${imageName}" not found. Build the image first.`,
    };
  }

  const sizeMb = Math.round(imageInfo.size / 1024 / 1024);

  if (sizeMb > IMAGE_SIZE_FAIL_THRESHOLD_MB) {
    return {
      name: 'image-size',
      status: 'fail',
      message: `Image size ${sizeMb}MB exceeds ${IMAGE_SIZE_FAIL_THRESHOLD_MB}MB limit`,
      value: sizeMb,
      threshold: IMAGE_SIZE_FAIL_THRESHOLD_MB,
    };
  }

  if (sizeMb > IMAGE_SIZE_WARN_THRESHOLD_MB) {
    return {
      name: 'image-size',
      status: 'warn',
      message: `Image size ${sizeMb}MB exceeds recommended ${IMAGE_SIZE_WARN_THRESHOLD_MB}MB`,
      value: sizeMb,
      threshold: IMAGE_SIZE_WARN_THRESHOLD_MB,
    };
  }

  return {
    name: 'image-size',
    status: 'pass',
    message: `Image size ${sizeMb}MB is within limits`,
    value: sizeMb,
    threshold: IMAGE_SIZE_WARN_THRESHOLD_MB,
  };
}
