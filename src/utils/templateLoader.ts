/**
 * Template loader utility for migration prompts
 * Loads markdown templates and performs variable substitution
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Template directory relative to this file
const TEMPLATE_DIR = path.join(__dirname, '..', 'templates');

/**
 * Available template names
 */
export type TemplateName =
  | 'migration-preamble'
  | 'migration-preamble-removal'
  | 'pnp-v4-migration'
  | 'mgt-migration'
  | 'build-error-fix'
  | 'm365-cli-error-fix'
  | 'eslint-optimization'
  | 'migration-verification'
  | 'migration-fix'
  | 'third-party-migration';

/**
 * Template variables for substitution
 */
export interface TemplateVariables {
  packageName?: string;
  fromVersion?: string;
  toVersion?: string;
  fromMajor?: string;
  toMajor?: string;
  actualTargetVersion?: string;
  isRemoval?: boolean;
  [key: string]: string | boolean | undefined;
}

/** Strip YAML frontmatter (---...---) from template content */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}

// Cache for loaded templates
const templateCache = new Map<string, string>();

// Track which templates were rendered during the current operation
let templateLog: string[] = [];

/** Get list of templates rendered since last clear */
export function getRenderedTemplates(): string[] { return [...templateLog]; }

/** Clear the rendered templates log (call at start of each phase/solution) */
export function clearTemplateLog(): void { templateLog = []; }

/**
 * Load a template file and return its contents
 * Templates are cached after first load
 */
function loadTemplate(name: TemplateName): string {
  // Check cache first
  if (templateCache.has(name)) {
    return templateCache.get(name)!;
  }

  const templatePath = path.join(TEMPLATE_DIR, `${name}.md`);

  try {
    const content = stripFrontmatter(fs.readFileSync(templatePath, 'utf-8'));
    templateCache.set(name, content);
    return content;
  } catch (error) {
    // Return empty string if template not found - caller can use inline fallback
    console.warn(`Template not found: ${name}`);
    return '';
  }
}

/**
 * Substitute variables in a template string
 * Supports {{variable}} syntax and {{#if condition}}...{{/if}} blocks
 */
function substituteVariables(template: string, variables: TemplateVariables): string {
  let result = template;

  // Handle {{#if condition}}...{{/if}} blocks
  result = result.replace(
    /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, condition, content) => {
      return variables[condition] ? content : '';
    }
  );

  // Handle simple {{variable}} substitutions
  result = result.replace(
    /\{\{(\w+)\}\}/g,
    (_, varName) => {
      const value = variables[varName];
      if (value === undefined) return '';
      return String(value);
    }
  );

  return result;
}

/**
 * Load a template and substitute variables in one call
 */
export function renderTemplate(name: TemplateName, variables: TemplateVariables): string {
  templateLog.push(name);
  const template = loadTemplate(name);
  if (!template) return '';
  return substituteVariables(template, variables);
}

