import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getVersion', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('should return version from package.json', async () => {
    // Mock fs before importing the module
    vi.doMock('fs', () => ({
      readFileSync: vi.fn().mockReturnValue(JSON.stringify({ version: '1.2.3' })),
    }));

    const { getVersion } = await import('../../utils/version.js');
    const version = getVersion();
    expect(version).toBe('1.2.3');
  });

  it('should return 0.0.0 on error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.doMock('fs', () => ({
      readFileSync: vi.fn().mockImplementation(() => {
        throw new Error('File not found');
      }),
    }));

    const { getVersion } = await import('../../utils/version.js');
    const version = getVersion();
    expect(version).toBe('0.0.0');
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to read version from package.json:',
      expect.any(Error),
    );
  });

  it('should return 0.0.0 when version field is missing', async () => {
    vi.doMock('fs', () => ({
      readFileSync: vi.fn().mockReturnValue(JSON.stringify({ name: 'test' })),
    }));

    const { getVersion } = await import('../../utils/version.js');
    const version = getVersion();
    expect(version).toBe('0.0.0');
  });

  it('should cache the version after first call', async () => {
    const mockReadFileSync = vi.fn().mockReturnValue(JSON.stringify({ version: '2.0.0' }));
    vi.doMock('fs', () => ({
      readFileSync: mockReadFileSync,
    }));

    const { getVersion } = await import('../../utils/version.js');

    // First call
    getVersion();
    // Second call - should use cache
    getVersion();

    // readFileSync should only be called once due to caching
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });
});
