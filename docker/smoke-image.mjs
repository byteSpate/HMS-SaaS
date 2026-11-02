// Checks that a built app image starts, runs as non-root and answers its health check (T-FND-05,
// K sections 2 and 5). Used by .github/workflows/images.yml and by hand after a local build:
//   node docker/smoke-image.mjs <image> <port> <path> [NAME=value ...]
// The values are throwaway: the API opens no database connection until a request needs one.
import { spawnSync } from 'node:child_process';

const [image, port, path, ...environment] = process.argv.slice(2);
if (!image || !port || !path) {
  console.error('usage: node docker/smoke-image.mjs <image> <port> <path> [NAME=value ...]');
  process.exit(2);
}

const STARTUP_LIMIT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;
const container = `hms-smoke-${process.pid}`;

function docker(...args) {
  // A developer and CI tool: it runs whichever docker the machine's PATH provides, on purpose.
  // eslint-disable-next-line sonarjs/no-os-command-from-path
  return spawnSync('docker', args, { encoding: 'utf8' });
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isHealthy() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function waitUntilHealthy() {
  const deadline = Date.now() + STARTUP_LIMIT_MS;
  while (Date.now() < deadline) {
    if (await isHealthy()) return true;
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

function runContainer() {
  const environmentArguments = environment.flatMap((pair) => ['--env', pair]);
  return docker(
    'run',
    '--detach',
    '--name',
    container,
    '--publish',
    `127.0.0.1:${port}:${port}`,
    ...environmentArguments,
    image,
  );
}

async function main() {
  const started = runContainer();
  if (started.status !== 0) throw new Error(`docker run failed: ${started.stderr}`);
  try {
    const uid = docker('exec', container, 'id', '-u').stdout.trim();
    if (uid === '0' || uid === '') throw new Error(`container must not run as root (uid "${uid}")`);
    if (!(await waitUntilHealthy())) {
      throw new Error(`no 200 from ${path}. Logs:\n${docker('logs', container).stdout}`);
    }
    console.log(`${image}: uid ${uid}, ${path} answered 200`);
  } finally {
    docker('rm', '--force', container);
  }
}

await main();
