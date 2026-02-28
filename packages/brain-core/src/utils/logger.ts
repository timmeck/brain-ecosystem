import winston from 'winston';
import path from 'node:path';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]${metaStr} ${message}`;
});

let loggerInstance: winston.Logger | null = null;

export interface LoggerOptions {
  level?: string;
  file?: string;
  maxSize?: number;
  maxFiles?: number;
  /** Environment variable name for log level override (e.g. 'BRAIN_LOG_LEVEL') */
  envVar?: string;
  /** Default log filename when no file is specified (e.g. 'brain.log') */
  defaultFilename?: string;
  /** Data directory to place the log file in */
  dataDir?: string;
}

export function createLogger(opts?: LoggerOptions): winston.Logger {
  if (loggerInstance) return loggerInstance;

  const envVar = opts?.envVar ?? 'BRAIN_LOG_LEVEL';
  const defaultFilename = opts?.defaultFilename ?? 'brain.log';

  const level = opts?.level ?? process.env[envVar] ?? 'info';
  const logFile = opts?.file ?? (opts?.dataDir ? path.join(opts.dataDir, defaultFilename) : defaultFilename);
  const maxSize = opts?.maxSize ?? 10 * 1024 * 1024; // 10MB
  const maxFiles = opts?.maxFiles ?? 3;

  const transports: winston.transport[] = [
    new winston.transports.File({
      filename: logFile,
      maxsize: maxSize,
      maxFiles,
      format: combine(timestamp(), logFormat),
    }),
  ];

  if (process.env['NODE_ENV'] !== 'production') {
    transports.push(
      new winston.transports.Console({
        format: combine(colorize(), timestamp(), logFormat),
      })
    );
  }

  loggerInstance = winston.createLogger({ level, transports });
  return loggerInstance;
}

export function getLogger(): winston.Logger {
  if (!loggerInstance) {
    return createLogger();
  }
  return loggerInstance;
}

export function resetLogger(): void {
  loggerInstance = null;
}
