import winston from 'winston';
import { inspect } from 'util';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
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
