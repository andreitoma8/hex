#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { statsCommand } from './commands/stats.js';
import { depsCommand } from './commands/deps.js';
import { accessCommand } from './commands/access.js';
import { stateCommand } from './commands/state.js';
import { callsCommand } from './commands/calls.js';
import { patternsCommand } from './commands/patterns.js';
import { constraintsCommand } from './commands/constraints.js';
import { surfaceCommand } from './commands/surface.js';
import { contextCommand } from './commands/context.js';
import { updateSkillsCommand } from './commands/update-skills.js';
import { claudeCommand } from './commands/claude.js';
import { dashboardCommand } from './commands/dashboard.js';
import { analyzeCommand } from './commands/analyze.js';
import { doctorCommand } from './commands/doctor.js';
import { aiStatusCommand } from './commands/ai-status.js';
import { updateCommand } from './commands/update.js';
import { issueCommand } from './commands/issue.js';

// Single source of truth for the version: package.json (always shipped at the
// package root, one dir up from dist/index.js). Avoids drift between the npm
// version and what `hex --version` reports.
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const program = new Command();

program
  .name('hex')
  .description('CLI toolkit for Solidity smart contract auditors')
  .version(pkg.version);

program.addCommand(initCommand);
program.addCommand(statsCommand);
program.addCommand(depsCommand);
program.addCommand(accessCommand);
program.addCommand(stateCommand);
program.addCommand(callsCommand);
program.addCommand(patternsCommand);
program.addCommand(constraintsCommand);
program.addCommand(surfaceCommand);
program.addCommand(contextCommand);
program.addCommand(updateSkillsCommand);
program.addCommand(claudeCommand);
program.addCommand(dashboardCommand);
program.addCommand(analyzeCommand);
program.addCommand(doctorCommand);
program.addCommand(aiStatusCommand);
program.addCommand(updateCommand);
program.addCommand(issueCommand);

program.parse();
