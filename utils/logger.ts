/**
 * Centralized logging utility for production health and debugging.
 */
class Logger {
  private isDevelopment = import.meta.env.MODE === 'development';

  public info(message: string, ...data: any[]) {
    if (this.isDevelopment) {
      console.log(`[INFO] [${new Date().toISOString()}] ${message}`, ...data);
    }
  }

  public warn(message: string, ...data: any[]) {
    console.warn(`[WARN] [${new Date().toISOString()}] ${message}`, ...data);
  }

  public error(message: string, error?: Error | unknown, ...data: any[]) {
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`, error, ...data);
  }

  public audit(action: string, details: Record<string, any>) {
    if (this.isDevelopment) {
      console.group(`[AUDIT] ${action}`);
      console.table(details);
      console.groupEnd();
    }
  }
}

export const logger = new Logger();
