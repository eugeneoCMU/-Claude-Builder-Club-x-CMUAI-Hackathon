type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) || "info";

function prefix(level: LogLevel, scope: string): string {
  const ts = new Date().toISOString().slice(11, 23);
  return `[${ts}] [${level.toUpperCase()}] [${scope}]`;
}

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[minLevel];
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => {
      if (shouldLog("debug")) console.debug(prefix("debug", scope), ...args);
    },
    info: (...args: unknown[]) => {
      if (shouldLog("info")) console.info(prefix("info", scope), ...args);
    },
    warn: (...args: unknown[]) => {
      if (shouldLog("warn")) console.warn(prefix("warn", scope), ...args);
    },
    error: (...args: unknown[]) => {
      if (shouldLog("error")) console.error(prefix("error", scope), ...args);
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
