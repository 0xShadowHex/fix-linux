const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

function validateCommand(cmd) {
  // Allow all commands
  return true;
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

    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
      shell: '/bin/bash',
      cwd: '/tmp',
      env: { ...process.env, PATH: '/bin:/usr/bin:/usr/local/bin:/sbin:/usr/sbin' }
    });

    res.status(200).json({
      success: true,
      output: stdout,
      error: stderr || null
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      output: error.stdout || '',
      error: error.stderr || error.message,
      code: error.code || 1
    });
  }
};
