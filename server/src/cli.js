import path from 'path';
import cp from 'child_process';

function getArg(args, { arg, defaultValue = null } = {}) {
  if (!arg) return null;

  const idx = args.findIndex((a) => a === arg);
  return idx === -1 ? defaultValue : args[idx + 1];
}

export default async function run(args) {
  const directory = getArg(args, { arg: '-e', defaultValue: './index.js' });
  const fn = getArg(args, { arg: '-f', defaultValue: 'dev' });
  const useBabel = getArg(args, { arg: '-b', defaultValue: 'false' }) === 'true';

  if (useBabel) {
    // eslint-disable-next-line
    cp.execSync(`npx babel-node -e 'require("${path.resolve(process.cwd(), directory)}").${fn}()'`, { stdio: 'inherit' });
  } else {
    cp.execSync(`node -e 'require("${path.resolve(process.cwd(), directory)}").${fn}()'`, { stdio: 'inherit' });
  }
}
