import Anthropic from '@anthropic-ai/sdk';
import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';
import { createSecurityPR } from './create-pr.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;
const BASE_BRANCH = process.env.BASE_BRANCH || 'main';

const REVIEWABLE_EXTENSIONS = [
  '.js', '.ts', '.jsx', '.tsx',
  '.json', '.yaml', '.yml', '.py'
];

const SKIP_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', '.next',
  'package-lock.json', 'yarn.lock'
];

function shouldSkip(filePath) {
  return SKIP_PATTERNS.some(p => filePath.includes(p));
}

function shouldReview(filePath) {
  if (shouldSkip(filePath)) return false;
  const ext = path.extname(filePath);
  const basename = path.basename(filePath);
  if (['.gitignore', '.env.example', '.env'].includes(basename)) return true;
  return REVIEWABLE_EXTENSIONS.includes(ext);
}

function collectFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (shouldSkip(fullPath)) continue;
    if (entry.isDirectory()) {
      collectFiles(fullPath, fileList);
    } else if (entry.isFile() && shouldReview(fullPath)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function buildFileMap(files) {
  const fileMap = {};
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.length > 100000) continue;
      fileMap[filePath] = content;
    } catch (e) {
      console.warn(`Could not read ${filePath}:`, e.message);
    }
  }
  return fileMap;
}

async function runSecurityReview(fileMap) {
  const filesSummary = Object.entries(fileMap)
    .map(([filePath, content]) => `=== ${filePath} ===\n${content}`)
    .join('\n\n');

  const prompt = `You are a security expert reviewing code from an app built with a no-code/low-code builder like Lovable. These apps often have common security vulnerabilities.

Analyze the following codebase and fix ALL security issues you find. Focus on:

1. **Missing .gitignore entries** - .env files, secrets files not gitignored
2. **Client-side only auth/RBAC** - authorization checks that only exist in the frontend with no server-side enforcement
3. **Missing audit logs** - sensitive operations (login, role changes, data access) with no logging
4. **Plaintext passwords** - temporary passwords or credentials stored/displayed in plaintext
5. **Insecure defaults** - debug modes left on, open CORS, missing rate limiting configs
6. **Exposed internal routes** - admin routes without server-side protection

DO NOT attempt to fix hardcoded secret values - flag those as manual actions instead.

Respond ONLY with a JSON object in this exact format (no markdown, no explanation outside JSON):
{
  "issues_found": [
    {
      "file": "path/to/file",
      "severity": "critical|high|medium|low",
      "type": "missing_gitignore|client_only_rbac|missing_audit_log|plaintext_password|insecure_default|exposed_route",
      "description": "Brief description of the issue",
      "fixable": true
    }
  ],
  "fixes": [
    {
      "file": "path/to/file",
      "content": "complete fixed file content here"
    }
  ],
  "new_files": [
    {
      "file": "path/to/new/file",
      "content": "content of new file to create",
      "reason": "why this file is needed"
    }
  ],
  "manual_actions_required": [
    {
      "severity": "critical",
      "action": "Description of something requiring human intervention (e.g., rotate an exposed API key)"
    }
  ],
  "summary": "One paragraph summary of what was found and fixed"
}

If no issues are found, return the same structure with empty arrays.

Here is the codebase:

${filesSummary}`;

  console.log('Sending code to Claude for security review...');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }]
  });

  const responseText = message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  const clean = responseText.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error('Failed to parse Claude response:', e.message);
    throw new Error('Claude returned invalid JSON');
  }
}

async function applyFixesAndCreatePR(review) {
  const { fixes, new_files, issues_found, manual_actions_required, summary } = review;
  const allFixes = [...(fixes || []), ...(new_files || [])];

  if (allFixes.length === 0) {
    console.log('✅ No fixable issues found. No PR needed.');
    if (manual_actions_required?.length > 0) {
      console.log('\n⚠️  MANUAL ACTIONS REQUIRED:');
      manual_actions_required.forEach(a => console.log(`  [${a.severity.toUpperCase()}] ${a.action}`));
    }
    return;
  }

  for (const fix of allFixes) {
    const dir = path.dirname(fix.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fix.file, fix.content, 'utf8');
    console.log(`Fixed: ${fix.file}`);
  }

  await createSecurityPR({
    octokit, REPO_OWNER, REPO_NAME, BASE_BRANCH,
    allFixes, issues_found, manual_actions_required, summary
  });
}

async function main() {
  console.log('🔍 Collecting files for security review...');
  const files = collectFiles('.');
  console.log(`Found ${files.length} files to review`);

  const fileMap = buildFileMap(files);
  console.log(`Loaded ${Object.keys(fileMap).length} files`);

  const review = await runSecurityReview(fileMap);

  console.log('\n📋 Security Review Summary:');
  console.log(review.summary);
  console.log(`\nIssues found: ${review.issues_found?.length || 0}`);
  console.log(`Files to fix: ${(review.fixes?.length || 0) + (review.new_files?.length || 0)}`);

  await applyFixesAndCreatePR(review);
}

main().catch(err => {
  console.error('Security review failed:', err);
  process.exit(1);
});
