#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { statsCommand } from './commands/stats.js';
import { updateSkillsCommand } from './commands/update-skills.js';
import { claudeCommand } from './commands/claude.js';
import { dashboardCommand } from './commands/dashboard.js';
import { analyzeCommand } from './commands/analyze.js';
import { doctorCommand } from './commands/doctor.js';
import { aiStatusCommand } from './commands/ai-status.js';
import { updateCommand } from './commands/update.js';
import { issueCommand } from './commands/issue.js';
import { noteCommand } from './commands/note.js';
import { diffCommand } from './commands/diff.js';
import { factsCommand } from './commands/facts.js';
import { modelCommand, invariantCommand } from './commands/model.js';
import { reviewCommand, rulesCommand } from './commands/review.js';
import { diagramCommand } from './commands/diagram.js';
import { mcpCommand } from './commands/mcp.js';
import { fixReviewCommand } from './commands/fix-review.js';

// Single source of truth for the version: package.json (always shipped at the
// package root, one dir up from dist/index.js). Avoids drift between the npm
// version and what `hex --version` reports.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const program = new Command();

program
  .name('hex')
  .description('CLI toolkit for Solidity smart contract auditors')
  .version(pkg.version);

program.addCommand(initCommand);
program.addCommand(statsCommand);
program.addCommand(updateSkillsCommand);
program.addCommand(claudeCommand);
program.addCommand(dashboardCommand);
program.addCommand(analyzeCommand);
program.addCommand(doctorCommand);
program.addCommand(aiStatusCommand);
program.addCommand(updateCommand);
program.addCommand(issueCommand);
program.addCommand(noteCommand);
program.addCommand(diffCommand);
program.addCommand(factsCommand);
program.addCommand(modelCommand);
program.addCommand(invariantCommand);
program.addCommand(reviewCommand);
program.addCommand(rulesCommand);
program.addCommand(diagramCommand);
program.addCommand(mcpCommand);
program.addCommand(fixReviewCommand);

program.parse();
