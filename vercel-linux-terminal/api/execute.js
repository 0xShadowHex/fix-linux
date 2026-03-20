const { spawn } = require('child_process');
const path = require('path');

function validateCommand(cmd) {
  return true;
}

const PACKAGES = {
  'curl': 'dummy',
  'wget': 'dummy',
  'git': 'dummy',
  'build-essential': 'dummy',
  'gcc': 'dummy',
  'g++': 'dummy',
  'make': 'dummy',
  'python3': 'dummy',
  'node': 'dummy',
  'htop': 'dummy',
  'vim': 'dummy',
  'nano': 'dummy'
};

async function fakeAptInstall(packages) {
  let output = '';
  
  for (const pkg of packages) {
    if (!PACKAGES[pkg]) {
      output += `E: Unable to locate package ${pkg}\n`;
      continue;
    }
    
    output += `Reading package lists... Done\n`;
    output += `Building dependency tree... Done\n`;
    output += `Setting up ${pkg} (${pkg}-latest) ...\n`;
    output += `Processing triggers for ${pkg} ...\n`;
  }
  
  output += `Done.\n`;
  return output;
}

async function executeSudoAptInstall(cmd) {
  const match = cmd.match(/(?:sudo\s+)?(?:apt|apt-get)\s+(?:install|add)\s+(.+)/i);
  
  if (!match) {
    return null;
  }
  
  const packagesStr = match[1].trim();
  const packages = packagesStr.split(/\s+/).filter(p => p);
  
  return await fakeAptInstall(packages);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Transfer-Encoding', 'chunked');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).write(JSON.stringify({ error: 'Method not allowed' }));
    res.end();
    return;
  }

  try {
    const { command } = req.body || {};

    if (!command || typeof command !== 'string') {
      res.status(400).write(JSON.stringify({ error: 'Command is required' }));
      res.end();
      return;
    }

    if (!validateCommand(command)) {
      res.status(403).write(JSON.stringify({ error: 'Command not allowed' }));
      res.end();
      return;
    }

    // Check for fake sudo apt install
    if (command.includes('sudo') && (command.includes('apt') || command.includes('apt-get'))) {
      const result = await executeSudoAptInstall(command);
      if (result) {
        res.status(200);
        res.write(JSON.stringify({ type: 'output', data: result }) + '\n');
        res.write(JSON.stringify({ type: 'end', code: 0 }) + '\n');
        res.end();
        return;
      }
    }

    const binPath = path.join(__dirname, 'bin');
    const customPath = `${binPath}:/bin:/usr/bin:/usr/local/bin:/sbin:/usr/sbin`;

    res.status(200);

    const child = spawn('bash', ['-c', command], {
      cwd: '/tmp',
      env: { 
        ...process.env, 
        PATH: customPath
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let finished = false;

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line) {
          res.write(JSON.stringify({ type: 'output', data: line }) + '\n');
        }
      }
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line) {
          res.write(JSON.stringify({ type: 'error', data: line }) + '\n');
        }
      }
    });

    child.on('close', (code) => {
      if (!finished) {
        finished = true;
        res.write(JSON.stringify({ type: 'end', code: code || 0 }) + '\n');
        res.end();
      }
    });

    child.on('error', (error) => {
      if (!finished) {
        finished = true;
        res.write(JSON.stringify({ type: 'error', data: error.message }) + '\n');
        res.write(JSON.stringify({ type: 'end', code: 1 }) + '\n');
        res.end();
      }
    });

    // Timeout
    setTimeout(() => {
      if (!finished && child && !child.killed) {
        finished = true;
        child.kill();
        res.write(JSON.stringify({ type: 'error', data: 'Command timeout (30s)' }) + '\n');
        res.write(JSON.stringify({ type: 'end', code: 124 }) + '\n');
        res.end();
      }
    }, 30000);

  } catch (error) {
    res.write(JSON.stringify({ type: 'error', data: error.message }) + '\n');
    res.write(JSON.stringify({ type: 'end', code: 1 }) + '\n');
    res.end();
  }
};
