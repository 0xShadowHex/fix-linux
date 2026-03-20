const { spawn } = require('child_process');

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
  res.setHeader('Transfer-Encoding', 'chunked');

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

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 30000);

    const child = spawn('bash', ['-c', command], {
      cwd: '/tmp',
      env: { ...process.env, PATH: '/bin:/usr/bin:/usr/local/bin:/sbin:/usr/sbin' },
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
