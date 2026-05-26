import chalk from 'chalk';

export type StepState = 'pending' | 'running' | 'ok' | 'failed' | 'skipped';

interface Step {
  name: string;
  state: StepState;
  detail?: string;
  startedAt?: number;
  endedAt?: number;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Multi-step progress tracker. Renders all steps as a live grid in a TTY,
 * falls back to per-event log lines otherwise. Designed for parallel pipelines
 * like `hex analyze` where seven subcommands run together.
 */
export class ProgressTracker {
  private steps = new Map<string, Step>();
  private order: string[] = [];
  private renderedLines = 0;
  private timer: NodeJS.Timeout | null = null;
  private frame = 0;
  private isTty: boolean;
  private active = false;

  constructor(stepNames: string[]) {
    for (const name of stepNames) {
      this.steps.set(name, { name, state: 'pending' });
      this.order.push(name);
    }
    this.isTty = Boolean(process.stdout.isTTY);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    if (!this.isTty) {
      // Non-TTY: print a single header and rely on update() to log linearly.
      console.log(chalk.dim(`steps: ${this.order.join(', ')}`));
      return;
    }
    this.render();
    this.timer = setInterval(() => {
      this.frame++;
      this.render();
    }, 100);
  }

  update(name: string, state: StepState, detail?: string): void {
    const step = this.steps.get(name);
    if (!step) return;
    if (state === 'running' && step.state !== 'running') {
      step.startedAt = Date.now();
    }
    if ((state === 'ok' || state === 'failed' || state === 'skipped') && !step.endedAt) {
      step.endedAt = Date.now();
    }
    step.state = state;
    if (detail !== undefined) step.detail = detail;

    if (this.isTty && this.active) {
      this.render();
    } else if (!this.isTty) {
      console.log(this.formatStep(step, false));
    }
  }

  finish(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.isTty && this.active) {
      this.render();
    }
    this.active = false;
  }

  /** True if any step ended in 'failed' state. */
  hasFailures(): boolean {
    for (const step of this.steps.values()) {
      if (step.state === 'failed') return true;
    }
    return false;
  }

  /** Snapshot of every step's final state. */
  results(): Step[] {
    return this.order.map((name) => ({ ...this.steps.get(name)! }));
  }

  private formatStep(step: Step, animate: boolean): string {
    let symbol: string;
    switch (step.state) {
      case 'pending':
        symbol = chalk.gray('·');
        break;
      case 'running':
        symbol = chalk.cyan(animate ? FRAMES[this.frame % FRAMES.length] : '⠿');
        break;
      case 'ok':
        symbol = chalk.green('✔');
        break;
      case 'failed':
        symbol = chalk.red('✖');
        break;
      case 'skipped':
        symbol = chalk.yellow('⊘');
        break;
    }
    const duration =
      step.startedAt && step.endedAt
        ? ` (${((step.endedAt - step.startedAt) / 1000).toFixed(1)}s)`
        : step.startedAt && step.state === 'running' && animate
          ? ` (${((Date.now() - step.startedAt) / 1000).toFixed(1)}s)`
          : '';
    const name = chalk.bold(step.name);
    const detail = step.detail ? chalk.dim(` — ${step.detail}`) : '';
    return `  ${symbol} ${name}${chalk.dim(duration)}${detail}`;
  }

  private render(): void {
    if (!this.isTty) return;
    if (this.renderedLines > 0) {
      process.stdout.write(`\x1b[${this.renderedLines}A`);
      process.stdout.write('\x1b[J');
    }
    const lines = this.order.map((name) => this.formatStep(this.steps.get(name)!, true));
    process.stdout.write(lines.join('\n') + '\n');
    this.renderedLines = lines.length;
  }
}
