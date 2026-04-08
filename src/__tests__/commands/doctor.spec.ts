import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('doctor checks', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe('checkNodeVersion', () => {
    it('should return ok for Node 22+', async () => {
      const originalVersion = process.version;
      Object.defineProperty(process, 'version', { value: 'v22.12.0', configurable: true });

      const { checkNodeVersion } = await import('../../commands/doctor/checks.js');
      const result = checkNodeVersion();

      expect(result.status).toBe('ok');
      expect(result.name).toBe('Node.js');
      expect(result.value).toBe('v22.12.0');
      expect(result.required).toBe('>=22.0.0');

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true });
    });

    it('should return error for Node < 22', async () => {
      const originalVersion = process.version;
      Object.defineProperty(process, 'version', { value: 'v16.20.0', configurable: true });

      const { checkNodeVersion } = await import('../../commands/doctor/checks.js');
      const result = checkNodeVersion();

      expect(result.status).toBe('error');
      expect(result.message).toContain('required');

      Object.defineProperty(process, 'version', { value: originalVersion, configurable: true });
    });
  });

  describe('checkNpmVersion', () => {
    it('should return ok when npm is installed', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue('10.2.0\n'),
      }));

      const { checkNpmVersion } = await import('../../commands/doctor/checks.js');
      const result = checkNpmVersion();

      expect(result.status).toBe('ok');
      expect(result.name).toBe('npm');
      expect(result.value).toBe('10.2.0');
    });

    it('should return error when npm is not found', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('command not found');
        }),
      }));

      const { checkNpmVersion } = await import('../../commands/doctor/checks.js');
      const result = checkNpmVersion();

      expect(result.status).toBe('error');
      expect(result.value).toBe('not found');
    });
  });

  describe('checkM365Cli', () => {
    it('should return ok when M365 CLI is installed', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue('7.5.0\n'),
      }));

      const { checkM365Cli } = await import('../../commands/doctor/checks.js');
      const result = checkM365Cli();

      expect(result.status).toBe('ok');
      expect(result.name).toBe('M365 CLI');
      expect(result.value).toBe('7.5.0');
    });

    it('should return error when M365 CLI is not installed', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('command not found: m365');
        }),
      }));

      const { checkM365Cli } = await import('../../commands/doctor/checks.js');
      const result = checkM365Cli();

      expect(result.status).toBe('error');
      expect(result.value).toBe('not found');
      expect(result.message).toContain('npm install');
    });
  });

  describe('checkClaudeCode', () => {
    it('should return ok when Claude Code is installed', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue('2.1.37\n'),
      }));

      const { checkClaudeCode } = await import('../../commands/doctor/checks.js');
      const result = checkClaudeCode();

      expect(result.status).toBe('ok');
      expect(result.name).toBe('Claude Code');
      expect(result.value).toBe('2.1.37');
    });

    it('should return error when Claude Code is not installed', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error('command not found: claude');
        }),
      }));

      const { checkClaudeCode } = await import('../../commands/doctor/checks.js');
      const result = checkClaudeCode();

      expect(result.status).toBe('error');
      expect(result.value).toBe('not found');
      expect(result.message).toContain('Install Claude Code');
    });
  });

  describe('checkAgentSdk', () => {
    it('should return ok when Agent SDK is available', async () => {
      vi.doMock('child_process', () => ({ execSync: vi.fn() }));

      const { checkAgentSdk } = await import('../../commands/doctor/checks.js');
      const result = checkAgentSdk();

      // Agent SDK is a bundled dependency, so it should always resolve
      expect(result.status).toBe('ok');
      expect(result.name).toBe('Agent SDK');
      expect(result.value).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('checkApiKey', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.ANTHROPIC_API_KEY;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should detect ANTHROPIC_API_KEY with masked display', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-abcdefghijklmnopqrstuvwxyz';

      vi.doMock('child_process', () => ({ execSync: vi.fn() }));
      const { checkApiKey } = await import('../../commands/doctor/checks.js');
      const result = checkApiKey();

      expect(result.status).toBe('ok');
      expect(result.value).toContain('ANTHROPIC_API_KEY');
      expect(result.value).toContain('sk-ant-');
      expect(result.value).not.toContain('abcdefghijklmnopqrstuvwxyz');
    });

    it('should show Claude Code native auth when no API key set', async () => {
      vi.doMock('child_process', () => ({ execSync: vi.fn() }));
      const { checkApiKey } = await import('../../commands/doctor/checks.js');
      const result = checkApiKey();

      expect(result.status).toBe('ok');
      expect(result.value).toBe('Claude Code (native)');
    });
  });

  describe('checkTerminal', () => {
    it('should return ok for TTY terminal', async () => {
      vi.doMock('child_process', () => ({ execSync: vi.fn() }));
      vi.doMock('../../utils/terminalCapabilities.js', () => ({
        getTerminalCapabilities: vi.fn().mockReturnValue({
          isTTY: true,
          width: 120,
          height: 40,
        }),
      }));

      const { checkTerminal } = await import('../../commands/doctor/checks.js');
      const result = checkTerminal();

      expect(result.status).toBe('ok');
      expect(result.value).toContain('120x40');
    });

    it('should return warn for non-TTY terminal', async () => {
      vi.doMock('child_process', () => ({ execSync: vi.fn() }));
      vi.doMock('../../utils/terminalCapabilities.js', () => ({
        getTerminalCapabilities: vi.fn().mockReturnValue({
          isTTY: false,
          width: 80,
          height: 24,
        }),
      }));

      const { checkTerminal } = await import('../../commands/doctor/checks.js');
      const result = checkTerminal();

      expect(result.status).toBe('warn');
      expect(result.message).toContain('Not running in interactive terminal');
    });
  });

  describe('checkPantoumVersion', () => {
    it('should return the PANTOUM version', async () => {
      vi.doMock('child_process', () => ({ execSync: vi.fn() }));
      vi.doMock('../../utils/version.js', () => ({
        getVersion: vi.fn().mockReturnValue('1.2.3'),
      }));

      const { checkPantoumVersion } = await import('../../commands/doctor/checks.js');
      const result = checkPantoumVersion();

      expect(result.status).toBe('ok');
      expect(result.value).toBe('v1.2.3');
    });
  });

  describe('runAllChecks', () => {
    it('should return all check categories', async () => {
      vi.doMock('child_process', () => ({
        execSync: vi.fn().mockReturnValue('10.0.0\n'),
      }));
      vi.doMock('../../utils/terminalCapabilities.js', () => ({
        getTerminalCapabilities: vi.fn().mockReturnValue({
          isTTY: true,
          width: 120,
          height: 40,
        }),
      }));
      vi.doMock('../../utils/version.js', () => ({
        getVersion: vi.fn().mockReturnValue('0.1.0'),
      }));

      const { runAllChecks } = await import('../../commands/doctor/checks.js');
      const checks = runAllChecks();

      expect(checks.system).toBeDefined();
      expect(checks.system.length).toBe(4);
      expect(checks.dependencies).toBeDefined();
      expect(checks.dependencies.length).toBe(1);
      expect(checks.ai).toBeDefined();
      expect(checks.ai.length).toBe(3);
      expect(checks.pantoum).toBeDefined();
      expect(checks.pantoum.length).toBe(1);
    });
  });
});

describe('runDoctor', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should output valid JSON in json mode', async () => {
    vi.doMock('child_process', () => ({
      execSync: vi.fn().mockReturnValue('10.0.0\n'),
    }));
    vi.doMock('../../utils/terminalCapabilities.js', () => ({
      getTerminalCapabilities: vi.fn().mockReturnValue({
        isTTY: true,
        width: 120,
        height: 40,
      }),
    }));
    vi.doMock('../../utils/version.js', () => ({
      getVersion: vi.fn().mockReturnValue('0.1.0'),
    }));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { runDoctor } = await import('../../commands/doctor.js');

    await runDoctor({ json: true });

    // Find the JSON output call (first call should be the JSON)
    const jsonCall = consoleSpy.mock.calls.find((call) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });
    expect(jsonCall).toBeDefined();

    const output = JSON.parse(jsonCall![0] as string);
    expect(output.status).toBeDefined();
    expect(output.checks).toBeDefined();
    expect(output.checks.system).toBeDefined();
    expect(output.checks.dependencies).toBeDefined();
    expect(output.checks.ai).toBeDefined();
    expect(output.checks.pantoum).toBeDefined();

    consoleSpy.mockRestore();
  });

  it('should include verbose detail messages', async () => {
    vi.doMock('child_process', () => ({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not found');
      }),
    }));
    vi.doMock('../../utils/terminalCapabilities.js', () => ({
      getTerminalCapabilities: vi.fn().mockReturnValue({
        isTTY: false,
        width: 80,
        height: 24,
      }),
    }));
    vi.doMock('../../utils/version.js', () => ({
      getVersion: vi.fn().mockReturnValue('0.1.0'),
    }));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { runDoctor } = await import('../../commands/doctor.js');

    await runDoctor({ verbose: true });

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    // Verbose mode shows arrow-prefixed detail messages
    expect(allOutput).toContain('→');

    consoleSpy.mockRestore();
  });

  it('should display text output by default', async () => {
    vi.doMock('child_process', () => ({
      execSync: vi.fn().mockReturnValue('10.0.0\n'),
    }));
    vi.doMock('../../utils/terminalCapabilities.js', () => ({
      getTerminalCapabilities: vi.fn().mockReturnValue({
        isTTY: true,
        width: 120,
        height: 40,
      }),
    }));
    vi.doMock('../../utils/version.js', () => ({
      getVersion: vi.fn().mockReturnValue('0.1.0'),
    }));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { runDoctor } = await import('../../commands/doctor.js');

    await runDoctor();

    const allOutput = consoleSpy.mock.calls.map((c) => c[0]).join('\n');
    expect(allOutput).toContain('PANTOUM Doctor');
    expect(allOutput).toContain('System:');
    expect(allOutput).toContain('Dependencies:');
    expect(allOutput).toContain('AI:');

    consoleSpy.mockRestore();
  });
});
