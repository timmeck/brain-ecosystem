export const retryModule = {
  name: 'retry',
  language: 'typescript',
  filePath: 'src/utils/retry.ts',
  source: `export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delayMs * attempt));
      }
    }
  }
  throw lastError;
}`,
  description: 'Retry function with exponential backoff',
};

export const loggerModule = {
  name: 'logger',
  language: 'typescript',
  filePath: 'src/utils/logger.ts',
  source: `import winston from 'winston';

export function createLogger(name: string, level: string = 'info') {
  return winston.createLogger({
    level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message }) =>
        \`[\${timestamp}] [\${level}] [\${name}] \${message}\`
      ),
    ),
    transports: [new winston.transports.Console()],
  });
}`,
  description: 'Winston logger factory with timestamp formatting',
};

export const hashModule = {
  name: 'hash',
  language: 'python',
  filePath: 'utils/hash.py',
  source: `import hashlib

def sha256(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()

def md5(data: str) -> str:
    return hashlib.md5(data.encode()).hexdigest()
`,
  description: 'Hash utility functions',
};

export const similarRetryModule = {
  name: 'retryWithBackoff',
  language: 'typescript',
  filePath: 'lib/retry-with-backoff.ts',
  source: `export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 500,
): Promise<T> {
  let error: Error | undefined;
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i)));
    }
  }
  throw error;
}`,
  description: 'Retry with exponential backoff',
};
