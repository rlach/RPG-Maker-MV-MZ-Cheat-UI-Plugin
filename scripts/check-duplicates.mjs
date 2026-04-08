import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const reportDir = path.join(repoRoot, '.jscpd-report');
const reportPath = path.join(reportDir, 'jscpd-report.json');
const isStrictMode = process.argv.includes('--strict');
const strictArgs = isStrictMode ? ['--min-lines', '10', '--min-tokens', '20'] : [];
function removeDirectoryIfExists(dirPath) {
    if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
    }
}

function normalizePath(filePath) {
    return filePath.replaceAll('\\', '/');
}

function duplicationKey(duplication) {
    const first = duplication.firstFile;
    const second = duplication.secondFile;
    const left = `${normalizePath(first.name)}:${first.start}-${first.end}`;
    const right = `${normalizePath(second.name)}:${second.start}-${second.end}`;
    return [left, right].sort((a, b) => a.localeCompare(b)).join('::');
}

removeDirectoryIfExists(reportDir);

const result = spawnSync(
    `npm exec jscpd -- ./cheat-engine/www --config ./.jscpd.json ${strictArgs.join(' ')} --silent`,
    [],
    {
        cwd: repoRoot,
        encoding: 'utf-8',
        shell: true,
    }
);

if (result.error) {
    console.error('[jscpd] Failed to start:', result.error.message);
    process.exit(1);
}

if (result.status !== 0 && result.status !== 1) {
    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
}

if (!fs.existsSync(reportPath)) {
    console.error('[jscpd] Report file was not generated.');
    process.exit(1);
}

const rawReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
const rawDuplicates = Array.isArray(rawReport.duplicates) ? rawReport.duplicates : [];
const seen = new Set();
const duplicates = rawDuplicates.filter((duplication) => {
    const firstName = normalizePath(duplication.firstFile?.name || '');
    const secondName = normalizePath(duplication.secondFile?.name || '');
    if (!firstName || !secondName) {
        return false;
    }

    const key = duplicationKey(duplication);
    if (seen.has(key)) {
        return false;
    }
    seen.add(key);
    return true;
});

duplicates.sort((a, b) => {
    const lineDiff = Number(b.lines || 0) - Number(a.lines || 0);
    if (lineDiff !== 0) {
        return lineDiff;
    }

    const tokenDiff = Number(b.tokens || 0) - Number(a.tokens || 0);
    if (tokenDiff !== 0) {
        return tokenDiff;
    }

    return duplicationKey(a).localeCompare(duplicationKey(b));
});

const filteredReport = {
    ...rawReport,
    duplicates,
    summary: {
        totalClones: duplicates.length,
        sameFileClones: duplicates.filter(
            (duplication) =>
                normalizePath(duplication.firstFile.name) ===
                normalizePath(duplication.secondFile.name)
        ).length,
        crossFileClones: duplicates.filter(
            (duplication) =>
                normalizePath(duplication.firstFile.name) !==
                normalizePath(duplication.secondFile.name)
        ).length,
    },
};

fs.writeFileSync(reportPath, JSON.stringify(filteredReport, null, 2) + '\n');

if (duplicates.length === 0) {
    console.log(`Found 0 clones (${isStrictMode ? 'strict' : 'default'} mode).`);
    console.log(`JSON report saved to ${path.relative(repoRoot, reportPath)}`);
    process.exit(0);
}

console.log(`Found ${duplicates.length} clones (${isStrictMode ? 'strict' : 'default'} mode).`);
console.log(`- same-file: ${filteredReport.summary.sameFileClones}`);
console.log(`- cross-file: ${filteredReport.summary.crossFileClones}`);
for (const duplication of duplicates) {
    const first = duplication.firstFile;
    const second = duplication.secondFile;
    console.log(`- ${normalizePath(first.name)}:${first.start}-${first.end}`);
    console.log(`  ${normalizePath(second.name)}:${second.start}-${second.end}`);
    console.log(`  ${duplication.lines} lines`);
}
console.log(`JSON report saved to ${path.relative(repoRoot, reportPath)}`);
process.exit(1);
