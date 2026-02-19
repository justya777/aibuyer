import winston from 'winston';
import { inspect } from 'util';

const logLevel = process.env.LOG_LEVEL || 'info';

const SENSITIVE_KEY_REGEX = /(authorization|access[_-]?token|token|secret)/i;
const SENSITIVE_STRING_REGEXES = [
  /(access_token=)([^&\s]+)/gi,
  /([?&](?:token|secret)=)([^&\s]+)/gi,
  /(authorization["']?\s*[:=]\s*["']?bearer\s+)([a-z0-9\-_\.]+)/gi,
  /("?(?:access[_-]?token|authorization|token|secret)"?\s*:\s*")([^"]+)(")/gi,
];

function redactString(input: string): string {
  return SENSITIVE_STRING_REGEXES.reduce((value, regex) => {
    return value.replace(regex, (_match, prefix: string, _secret: string, suffix?: string) => {
      if (suffix) return `${prefix}[REDACTED]${suffix}`;
      return `${prefix}[REDACTED]`;
    });
  }, input);
}

export function redactSensitivePayload<T>(value: T): T {
  if (value == null) return value;

  if (typeof value === 'string') {
    return redactString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitivePayload(entry)) as T;
  }

  if (typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(input)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        output[key] = '[REDACTED]';
      } else {
        output[key] = redactSensitivePayload(nestedValue);
      }
    }
    return output as T;
  }

  return value;
}

const redactFormat = winston.format((info) => {
  const redacted = redactSensitivePayload(info);
  return redacted as winston.Logform.TransformableInfo;
});

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'facebook-mcp-server' },
  transports: [
    // Write to all logs with level `info` and below to combined.log
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// If we're not in production then also log to the console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        let output = `${timestamp} [${level}]: ${message}`;
        
        if (Object.keys(meta).length > 0) {
          try {
            output += ` ${JSON.stringify(meta)}`;
          } catch (error) {
            // Handle circular references by using util.inspect
            output += ` ${inspect(meta, { depth: 2, colors: false })}`;
          }
        }
        
        return output;
      })
    )
  }));
}
