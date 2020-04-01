import path from 'path';

function getArg(args, { arg, defaultValue = null } = {}) {
  if (!arg) return null;

  const idx = args.findIndex((a) => a === arg);
  return idx === -1 ? defaultValue : args[idx + 1];
}

export default async function run(args) {
  const directory = getArg(args, { arg: '-e', defaultValue: './index.js' });
  const fn = getArg(args, { arg: '-f', defaultValue: 'dev' });

  // eslint-disable-next-line
  require(path.resolve(process.cwd(), directory))[fn]();
}
