#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { statsCommand } from './commands/stats.js';
import { depsCommand } from './commands/deps.js';
import { accessCommand } from './commands/access.js';
import { stateCommand } from './commands/state.js';
import { callsCommand } from './commands/calls.js';
import { annotationsCommand } from './commands/annotations.js';
import { contextCommand } from './commands/context.js';
import { renderFindingsCommand } from './commands/render-findings.js';
import { updateSkillsCommand } from './commands/update-skills.js';
import { dashboardCommand } from './commands/dashboard.js';

const program = new Command();

program
  .name('solaudit')
  .description('CLI toolkit for Solidity smart contract auditors')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(statsCommand);
program.addCommand(depsCommand);
program.addCommand(accessCommand);
program.addCommand(stateCommand);
program.addCommand(callsCommand);
program.addCommand(annotationsCommand);
program.addCommand(contextCommand);
program.addCommand(renderFindingsCommand);
program.addCommand(updateSkillsCommand);
program.addCommand(dashboardCommand);

program.parse();
