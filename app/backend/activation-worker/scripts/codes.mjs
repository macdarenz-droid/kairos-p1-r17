/**
 * The owner's code tool (D279): `npm run codes -- make | list | revoke | free`, on the owner's own computer, signed in
 * with `npx wrangler login`. Never run in CI. The checks, the SQL and the words are in codeAdmin.mjs; this file reads the
 * command line, asks before a change, runs wrangler and prints.
 *
 * It runs this package's own wrangler (the one `npx wrangler` finds) with Node itself, never through a shell, so no shell
 * on any system can split or change the SQL:
 *   wrangler d1 execute kairos-activation-db --remote|--local --json --command=<SQL>
 * Not `--file`: with --remote, wrangler 4.141.0 sends a file through D1's import, which pauses the database and answers
 * only a count of queries and rows, never the rows themselves (read in its code, `executeRemotely`). `--command` uses
 * D1's query and answers each statement's rows, with --local and --remote alike. So no file is written either.
 *
 * Codes are printed once, only after wrangler confirms they were saved. Nothing prints a fingerprint.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  CodeToolError, firstUseBy, formatList, formatMade, freeQuestion, makeCodes, nextStep, placeText, readCodes, readCommand, readMade,
  readWranglerJson, revokeQuestion, sqlFree, sqlList, sqlMake, sqlRevoke, USAGE,
} from './codeAdmin.mjs';

const DATABASE = 'kairos-activation-db';
/** This package's folder: wrangler reads wrangler.jsonc (and the local copy's .wrangler/state) from here. */
const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

/** @returns {string} the path of this package's wrangler, run with Node */
function wranglerScript() {
  const require = createRequire(import.meta.url);
  let manifest;
  try {
    manifest = require.resolve('wrangler/package.json');
  } catch {
    throw new CodeToolError('wrangler is not installed here yet. Run npm ci in app/backend/activation-worker, then try again.');
  }
  return join(dirname(manifest), JSON.parse(readFileSync(manifest, 'utf8')).bin.wrangler);
}

/** @param {string} text @returns {string} the last lines, with no colour codes or fingerprints */
function lastLines(text) {
  return text.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/[0-9a-f]{64}/gi, '<fingerprint>').trim().split('\n').slice(-6).join('\n');
}

/**
 * Runs the statements in one `wrangler d1 execute` and answers each statement's rows.
 * @param {readonly string[]} statements from codeAdmin.mjs, every value already checked
 * @param {'remote' | 'local'} where
 * @returns {Promise<Array<Array<Record<string, unknown>>>>}
 */
function runSql(statements, where) {
  const args = [wranglerScript(), 'd1', 'execute', DATABASE, where === 'local' ? '--local' : '--remote', '--json', `--command=${statements.join(';\n')};`];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: PACKAGE_DIR, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    child.on('error', (error) => reject(new CodeToolError(`wrangler could not start: ${error.message}`)));
    child.on('close', (code) => {
      try {
        const results = readWranglerJson(out);
        if (code !== 0) throw new CodeToolError(`wrangler stopped with an error (exit code ${code}).`);
        resolve(results);
      } catch (error) {
        const detail = out.trim() === '' && err.trim() !== '' ? `\n${lastLines(err)}` : '';
        reject(new CodeToolError(`${error instanceof Error ? error.message : String(error)}${detail}`));
      }
    });
  });
}

/** @param {string} line */
function say(line = '') {
  process.stdout.write(`${line}\n`);
}

/**
 * Asks a question and waits for one line. Only "yes" goes on; anything else, or no answer, changes nothing.
 * @param {string} question
 * @returns {Promise<boolean>}
 */
function typedYes(question) {
  return new Promise((resolve) => {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    prompt.on('close', () => { if (!answered) resolve(false); });
    prompt.question(question, (answer) => {
      answered = true;
      // A terminal shows what was typed; an answer piped in is shown here instead.
      if (!process.stdin.isTTY) process.stdout.write(`${answer}\n`);
      prompt.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

/** @param {import('./codeAdmin.mjs').MakeCommand} command */
async function make(command) {
  const now = new Date();
  const codes = makeCodes(command.count);
  const statements = await sqlMake(codes, { label: command.label, devices: command.devices, days: command.days, now });
  say(`Saving ${command.count} new ${command.count === 1 ? 'code' : 'codes'} in ${placeText(command.where)}…`);
  let results;
  try {
    results = await runSql(statements, command.where);
  } catch (error) {
    throw new CodeToolError([
      'wrangler did not confirm that the codes were saved, so they are not shown (a code nobody has seen opens nothing).',
      error instanceof Error ? error.message : String(error),
      `If list shows new codes with the label "${command.label}" made just now, revoke them. Then run make again.`,
    ].join('\n'));
  }
  say();
  say(formatMade(await readMade(codes, results), { label: command.label, devices: command.devices, firstUseBy: firstUseBy(now, command.days) }));
}

/** @param {import('./codeAdmin.mjs').ListCommand} command */
async function list(command) {
  say(`Invite codes in ${placeText(command.where)}${command.label === null ? '' : `, label "${command.label}"`}:`);
  say();
  say(formatList((await runSql(sqlList({ label: command.label }), command.where))[0]));
}

/**
 * The code as it is now, printed, or a CodeToolError when there is none.
 * @param {number} id
 * @param {'remote' | 'local'} where
 */
async function showCode(id, where) {
  const rows = (await runSql(sqlList({ id }), where))[0];
  const [code] = readCodes(rows);
  if (code === undefined) throw new CodeToolError(`There is no code ${id} in ${placeText(where)}. Nothing changed. Run list to see the ids.`);
  say(`Code ${id} in ${placeText(where)}:`);
  say();
  say(formatList(rows, { summary: false }));
  say();
  return code;
}

/** @param {import('./codeAdmin.mjs').RevokeCommand} command */
async function revoke(command) {
  const code = await showCode(command.id, command.where);
  if (code.revoked) {
    say(`Code ${command.id} is revoked already. Nothing changed.`);
    return;
  }
  say(revokeQuestion(command.id, code.inUse, command.where));
  if (!(await typedYes('Type yes to revoke it: '))) {
    say('Nothing changed.');
    return;
  }
  const [changed, rows] = await runSql([...sqlRevoke(command.id, new Date()), ...sqlList({ id: command.id })], command.where);
  say(changed.length === 1 ? `Code ${command.id} is revoked.` : `Code ${command.id} did not change: it was revoked a moment ago, or it is gone.`);
  say();
  say(formatList(rows, { summary: false }));
}

/** @param {import('./codeAdmin.mjs').FreeCommand} command */
async function free(command) {
  const code = await showCode(command.id, command.where);
  const device = code.devices.find((candidate) => candidate.id === command.device);
  if (device === undefined) throw new CodeToolError(`Code ${command.id} has no device ${command.device}. Nothing changed. Its devices are listed above.`);
  if (device.removedAt !== null) {
    say(`Device ${command.device} is removed from code ${command.id} already. Nothing changed.`);
    return;
  }
  say(freeQuestion(command.id, command.device, command.where));
  if (!(await typedYes('Type yes to free it: '))) {
    say('Nothing changed.');
    return;
  }
  const [changed, rows] = await runSql([...sqlFree(command.id, command.device, new Date()), ...sqlList({ id: command.id })], command.where);
  const [after] = readCodes(rows);
  const usage = after === undefined ? '' : ` The code is now used on ${after.inUse} of ${after.deviceLimit} ${after.deviceLimit === 1 ? 'device' : 'devices'}.`;
  say(changed.length === 1 ? `Device ${command.device} is removed from code ${command.id}.${usage}` : `Device ${command.device} did not change: it was removed a moment ago.`);
  say();
  say(formatList(rows, { summary: false }));
}

/** The database of the command being run, for the next-step words after an error; null until the command line is read. */
let where = /** @type {import('./codeAdmin.mjs').Where | null} */ (null);

async function main() {
  const command = readCommand(process.argv.slice(2));
  if (command.kind === 'help') {
    say(USAGE);
    return;
  }
  where = command.where;
  if (command.kind === 'make') await make(command);
  else if (command.kind === 'list') await list(command);
  else if (command.kind === 'revoke') await revoke(command);
  else await free(command);
}

main().catch((error) => {
  if (error instanceof CodeToolError) {
    process.stderr.write(`${error.message}\n`);
    const next = nextStep(error.message, where);
    if (next !== null) process.stderr.write(`${next}\n`);
  } else {
    // A bug in the tool: say so plainly, without a stack trace.
    process.stderr.write(`The code tool stopped unexpectedly: ${lastLines(error instanceof Error ? error.message : String(error))}\n`);
  }
  process.exitCode = 1;
});
