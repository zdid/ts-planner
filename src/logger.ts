/**
 * Logger unifié pour ts-planner
 * Format: <TIMESTAMP> [<NIVEAU>] [ts-planner] <MESSAGE>
 * Exemple: 2025-06-17T18:00:00.123456 [INFO] [ts-planner] [mqtt] Connecté à 192.168.1.51:1883
 */

import { format } from 'util';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export function log(level: LogLevel, message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  const formattedMessage = args.length > 0 ? format(message, ...args) : message;
  console.log(`${timestamp} [${level}] [ts-planner] ${formattedMessage}`);
}

export function debug(message: string, ...args: any[]): void {
  log('DEBUG', message, ...args);
}

export function info(message: string, ...args: any[]): void {
  log('INFO', message, ...args);
}

export function warn(message: string, ...args: any[]): void {
  log('WARN', message, ...args);
}

export function error(message: string, ...args: any[]): void {
  log('ERROR', message, ...args);
}