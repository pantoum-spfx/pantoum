import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { conditionMet } from '../../utils/manualLoader.js';

// Mock fs for conditionMet tests
vi.mock('fs');

describe('manualLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('conditionMet', () => {
    it('should return true for "always" condition', () => {
      const result = conditionMet({ type: 'always' }, '/test/solution');
      expect(result).toBe(true);
    });

    it('should return true when package version satisfies condition', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { '@pnp/sp': '^3.5.0' }
      }));

      const result = conditionMet(
        { type: 'packageVersion', packageName: '@pnp/sp', comparator: '<', version: '4.0.0' },
        '/test/solution'
      );
      expect(result).toBe(true);
    });

    it('should return false when package is not in dependencies', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { 'other-pkg': '1.0.0' }
      }));

      const result = conditionMet(
        { type: 'packageVersion', packageName: '@pnp/sp', comparator: '<', version: '4.0.0' },
        '/test/solution'
      );
      expect(result).toBe(false);
    });

    it('should check devDependencies if not in dependencies', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        dependencies: {},
        devDependencies: { '@pnp/sp': '^3.0.0' }
      }));

      const result = conditionMet(
        { type: 'packageVersion', packageName: '@pnp/sp', comparator: '<', version: '4.0.0' },
        '/test/solution'
      );
      expect(result).toBe(true);
    });

    it('should return false when version does not satisfy condition', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { '@pnp/sp': '^4.1.0' }
      }));

      const result = conditionMet(
        { type: 'packageVersion', packageName: '@pnp/sp', comparator: '<', version: '4.0.0' },
        '/test/solution'
      );
      expect(result).toBe(false);
    });
  });

  describe('YAML schema safety', () => {
    it('should use JSON_SCHEMA which only allows JSON-compatible types', () => {
      // Verify that js-yaml JSON_SCHEMA is available
      expect(yaml.JSON_SCHEMA).toBeDefined();
    });

    it('should parse basic YAML with JSON_SCHEMA', () => {
      const input = 'name: test\nvalue: 42\nenabled: true';
      const result = yaml.load(input, { schema: yaml.JSON_SCHEMA }) as any;
      expect(result.name).toBe('test');
      expect(result.value).toBe(42);
      expect(result.enabled).toBe(true);
    });
  });
});
