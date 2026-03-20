const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function validateCommand(cmd) {
  // Allow all commands
  return true;
}

// Fake package database
const PACKAGES = {
  'curl': 'https://github.com/curl/curl/releases/download/curl-8_5_0/curl-8.5.0.tar.gz',
  'wget': 'https://ftp.gnu.org/gnu/wget/wget-1.21.tar.gz',
  'git': 'https://github.com/git/git/archive/master.tar.gz',
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
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Content-Type', 'application/json');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { command } = req.body || {};

    if (!command || typeof command !== 'string') {
      res.status(400).json({ error: 'Command is required' });
      return;
    }

    if (!validateCommand(command)) {
      res.status(403).json({ error: 'Command not allowed' });
      return;
    }

    // Check for fake sudo apt install
    if (command.includes('sudo') && (command.includes('apt') || command.includes('apt-get'))) {
      const result = await executeSudoAptInstall(command);
      if (result) {
        return res.status(200).json({
          success: true,
          output: result,
          error: null,
          code: 0
        });
      }
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 30000);

    // Build environment with custom /bin in PATH
    const binPath = path.join(__dirname, 'bin');
    const customPath = `${binPath}:/bin:/usr/bin:/usr/local/bin:/sbin:/usr/sbin`;

    const child = spawn('bash', ['-c', command], {
      cwd: '/tmp',
      env: { 
        ...process.env, 
        PATH: customPath
      },
      timeout: 30000
    });

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      
      res.status(200).json({
        success: code === 0,
        output: stdout,
        error: stderr || null,
        code: code
      });
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      
      res.status(200).json({
        success: false,
        output: stdout,
        error: error.message,
        code: 1
      });
    });

  } catch (error) {
    res.status(200).json({
      success: false,
      output: '',
      error: error.message,
      code: 1
    });
  }
};
