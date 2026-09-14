/**
 * Asks for a password and prints the line to paste into the environment file.
 */

import readline from "node:readline";
import { hashPassword } from "../lib/password.js";

/**
 * Reads the password from a terminal, twice, without echoing what is typed.
 */
async function askTwice() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const write = rl.output.write.bind(rl.output);
  let muted = false;
  rl.output.write = (chunk, ...rest) => (muted ? true : write(chunk, ...rest));

  const ask = (question) =>
    new Promise((resolve) => {
      rl.question(question, (answer) => {
        muted = false;
        write("\n");
        resolve(answer);
      });
      muted = true;
    });

  const password = await ask("New administrator password: ");
  const again = password ? await ask("Type it again: ") : "";

  rl.close();
  return { password, again };
}

/**
 * Reads the password from piped input, taking the first line.
 */
async function readPiped() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const password = chunks.join("").split("\n")[0].trim();
  return { password, again: password };
}

const { password, again } = process.stdin.isTTY ? await askTwice() : await readPiped();

if (!password) {
  console.error("Nothing typed. No hash produced.");
  process.exit(1);
}

if (password !== again) {
  console.error("Those did not match. No hash produced.");
  process.exit(1);
}

console.log("\nPaste this line into your .env file:\n");
console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
