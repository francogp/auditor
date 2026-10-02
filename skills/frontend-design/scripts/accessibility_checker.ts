import fs from 'node:fs';
import path from 'node:path';

interface A11yIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning';
  rule: string;
  message: string;
}

interface A11yReport {
  timestamp: string;
  filesScanned: number;
  totalIssues: number;
  issues: A11yIssue[];
  passed: boolean;
}

function parseArgs(): { json: boolean; projectPath: string } {
  const args = process.argv.slice(2);
  const json = args.includes('--json') || args.includes('json');
  const pathArg = args.find(a => !a.startsWith('-') && a !== 'json');
  const projectPath = pathArg ? path.resolve(pathArg) : process.cwd();
  return { json, projectPath };
}

function findVueAndHtmlFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        findVueAndHtmlFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.vue') || entry.name.endsWith('.html'))) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

export function checkAccessibility(projectPath: string): A11yReport {
  const srcDir = path.join(projectPath, 'src');
  const files = findVueAndHtmlFiles(srcDir);
  const issues: A11yIssue[] = [];

  for (const file of files) {
    const relativeFile = path.relative(projectPath, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineNum = i + 1;

      // 1. Form input without label or aria-label
      if (/<input\b[^>]*>/i.test(line) && !/type=["']hidden["']/i.test(line)) {
        if (!/aria-label=/i.test(line) && !/aria-labelledby=/i.test(line) && !/id=/i.test(line) && !/:aria-label=/i.test(line)) {
          issues.push({
            file: relativeFile,
            line: lineNum,
            severity: 'warning',
            rule: 'form-label',
            message: 'Input tag may be missing aria-label, aria-labelledby, or associating id',
          });
        }
      }

      // 2. Button without text or aria-label
      if (/<button\b[^>]*>/i.test(line)) {
        // If button is self-closing or inline empty with just an icon
        const hasAria = /aria-label=/i.test(line) || /:aria-label=/i.test(line) || /title=/i.test(line);
        const hasText = />[^<]{2,}</.test(line) || /{{/.test(line);
        if (!hasAria && !hasText && line.includes('</button>')) {
          issues.push({
            file: relativeFile,
            line: lineNum,
            severity: 'warning',
            rule: 'button-accessible-name',
            message: 'Button element appears to lack accessible text or aria-label',
          });
        }
      }

      // 3. Image without alt attribute
      if (/<img\b[^>]*>/i.test(line)) {
        if (!/\balt=/i.test(line) && !/:alt=/i.test(line)) {
          issues.push({
            file: relativeFile,
            line: lineNum,
            severity: 'warning',
            rule: 'image-alt',
            message: '<img> tag is missing alt or :alt attribute',
          });
        }
      }

      // 4. Positive tabindex (> 0 is an accessibility anti-pattern)
      const tabIndexMatch = line.match(/\btabindex=["']([1-9]\d*)["']/i);
      if (tabIndexMatch) {
        issues.push({
          file: relativeFile,
          line: lineNum,
          severity: 'error',
          rule: 'no-positive-tabindex',
          message: `Avoid positive tabindex="${tabIndexMatch[1]}"; use 0 for focusable or -1 for programmatic focus`,
        });
      }

      // 5. role="button" without tabindex
      if (/role=["']button["']/i.test(line) && !/tabindex=/i.test(line)) {
        issues.push({
          file: relativeFile,
          line: lineNum,
          severity: 'warning',
          rule: 'role-button-tabindex',
          message: 'Element with role="button" should declare tabindex="0" for keyboard accessibility',
        });
      }

      // 6. Autoplay media without muted
      if (/<(?:video|audio)\b[^>]*autoplay/i.test(line) && !/\bmuted\b/i.test(line)) {
        issues.push({
          file: relativeFile,
          line: lineNum,
          severity: 'error',
          rule: 'media-autoplay-muted',
          message: 'Autoplay media elements must be muted to satisfy browser accessibility policies',
        });
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error');

  return {
    timestamp: new Date().toISOString(),
    filesScanned: files.length,
    totalIssues: issues.length,
    issues,
    passed: errors.length === 0,
  };
}

function renderBoxDrawing(report: A11yReport): void {
  console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                 ENTERPRISE ARCHITECTURE - ACCESSIBILITY CHECKER (WCAG)               │');
  console.log('├──────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ Files Scanned:                  ${String(report.filesScanned).padEnd(44)} │`);
  console.log(`│ Total Issues:                   ${String(report.totalIssues).padEnd(44)} │`);
  console.log(`│ Status:                         ${(report.passed ? '✅ PASSED (0 critical errors)' : '❌ FAILED').padEnd(44)} │`);
  console.log('├──────────────────────────────────────────────────────────────────────────────┤');

  if (report.issues.length === 0) {
    console.log('│ ✨ All scanned Vue components comply with WCAG accessibility guidelines.     │');
  } else {
    for (const issue of report.issues.slice(0, 15)) {
      const tag = issue.severity === 'error' ? '❌' : '⚠️';
      const loc = `${issue.file}:${issue.line}`;
      console.log(`│ ${tag} [${issue.rule}] ${loc.padEnd(55)} │`);
      const msg = issue.message.length > 74 ? issue.message.substring(0, 71) + '...' : issue.message;
      console.log(`│    ${msg.padEnd(74)} │`);
    }
    if (report.issues.length > 15) {
      console.log(`│ ... and ${report.issues.length - 15} more findings.                                       │`);
    }
  }
  console.log('└──────────────────────────────────────────────────────────────────────────────┘\n');
}

function main(): void {
  const { json, projectPath } = parseArgs();
  const report = checkAccessibility(projectPath);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    renderBoxDrawing(report);
  }

  if (!report.passed) {
    process.exit(1);
  }
}

main();
