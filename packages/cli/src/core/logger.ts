import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export function info(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

export function warn(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

export function error(message: string): void {
  console.error(chalk.red('✖'), message);
}

export function success(message: string): void {
  console.log(chalk.green('✔'), message);
}

export function dim(message: string): void {
  console.log(chalk.dim(message));
}

export function spinner(text: string): Ora {
  return ora({ text, color: 'cyan' }).start();
}

export const logger = { info, warn, error, success, dim, spinner };
