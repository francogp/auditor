import fs from 'node:fs';
import path from 'node:path';

interface UXIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning';
  rule: string;
  message: string;
}

interface UXReport {
  timestamp: string;
  filesScanned: number;
  totalIssues: number;
  gsapComponentsFound: number;
  issues: UXIssue[];
  passed: boolean;
}

function parseArgs(): { json: boolean; projectPath: string } {
  const args = process.argv.slice(2);
  const json = args.includes('--json') || args.includes('json');
  const pathArg = args.find(a => !a.startsWith('-') && a !== 'json');
  const projectPath = pathArg ? path.resolve(pathArg) : process.cwd();
  return { json, projectPath };
}

function findVueFiles(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist') {
        findVueFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      fileList.push(fullPath);
    }
  }

  return fileList;
}

export function auditUX(projectPath: string): UXReport {
  const srcDir = path.join(projectPath, 'src');
  const files = findVueFiles(srcDir);
  const issues: UXIssue[] = [];
  let gsapComponentsCount = 0;

  for (const file of files) {
    const relativeFile = path.relative(projectPath, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    const hasGsap = /gsap|useGsap|v-gsap/i.test(content);
    if (hasGsap) {
      gsapComponentsCount++;
    }

    let inStyle = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const lineNum = i + 1;

      if (/<style/i.test(line)) inStyle = true;
      if (/<\/style>/i.test(line)) inStyle = false;

      // 1. Enforce GSAP Mandate: Flag forbidden CSS @keyframes or transition:
      if (inStyle) {
        if (/@keyframes\b/i.test(line)) {
          issues.push({
            file: relativeFile,
            line: lineNum,
            severity: 'error',
            rule: 'gsap-mandatory-animation',
            message: 'CSS @keyframes violates GSAP animation mandate; migrate to GSAP timeline/tween',
          });
        }

        // Check for manual transition: (unless standard opacity/color hover transitions or fallow-ignore)
        if (/\btransition:\s*(?!none\b|all\s+0s)[^;]+;/i.test(line) && !line.includes('// style-ok')) {
          issues.push({
            file: relativeFile,
            line: lineNum,
            severity: 'warning',
            rule: 'gsap-over-css-transition',
            message: 'CSS transition detected; prefer GSAP (v-gsap-hover / useGsapTransition) for animations',
          });
        }
      }

      // 2. Fitts' Law: Very small interactive targets (e.g. min-height < 24px on buttons)
      if (inStyle && /min-height:\s*([0-1]?[0-9]|2[0-3])px/i.test(line) && !line.includes('// fitts-ok')) {
        issues.push({
          file: relativeFile,
          line: lineNum,
          severity: 'warning',
          rule: 'fitts-law-target-size',
          message: 'Interactive target height < 24px might be too small for mobile touch targets',
        });
      }

      // 3. Miller's Law: Excessive form fields in single component
      if (i === 0) {
        const inputCount = (content.match(/<input\b/gi) || []).length;
        if (inputCount > 10 && !/step|wizard|pagination|tab/i.test(content)) {
          issues.push({
            file: relativeFile,
            line: 1,
            severity: 'warning',
            rule: 'millers-law-form-chunking',
            message: `Component has ${inputCount} input fields; consider progressive disclosure or stepper`,
          });
        }
      }
    }
  }

  const errors = issues.filter(i => i.severity === 'error');

  return {
    timestamp: new Date().toISOString(),
    filesScanned: files.length,
    totalIssues: issues.length,
    gsapComponentsFound: gsapComponentsCount,
    issues,
    passed: errors.length === 0,
  };
}

function renderBoxDrawing(report: UXReport): void {
  console.log('\n┌──────────────────────────────────────────────────────────────────────────────┐');
  console.log('│                       ENTERPRISE ARCHITECTURE - UX & MOTION AUDIT                    │');
  console.log('├──────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ Files Scanned:                  ${String(report.filesScanned).padEnd(44)} │`);
  console.log(`│ GSAP-Powered Components:        ${String(report.gsapComponentsFound).padEnd(44)} │`);
  console.log(`│ Total Issues:                   ${String(report.totalIssues).padEnd(44)} │`);
  console.log(`│ Status:                         ${(report.passed ? '✅ PASSED (0 hard errors)' : '❌ FAILED').padEnd(44)} │`);
  console.log('├──────────────────────────────────────────────────────────────────────────────┤');

  if (report.issues.length === 0) {
    console.log('│ ✨ All scanned Vue components comply with UX laws and GSAP animation standards.│');
  } else {
    for (const issue of report.issues.slice(0, 15)) {
      const tag = issue.severity === 'error' ? '❌' : '⚠️';
      const loc = `${issue.file}:${issue.line}`;
      console.log(`│ ${tag} [${issue.rule}] ${loc.padEnd(52)} │`);
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
  const report = auditUX(projectPath);

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
