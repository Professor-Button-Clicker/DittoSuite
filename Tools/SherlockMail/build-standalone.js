import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist', 'SherlockMail');

console.log('');
console.log('  Building SherlockMail standalone distribution...');
console.log('');

// ── Step 1: Clean previous build ──
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true });
  console.log('  [1/5] Cleaned previous build');
} else {
  console.log('  [1/5] No previous build to clean');
}
mkdirSync(DIST, { recursive: true });

// ── Step 2: Copy application files ──
console.log('  [2/5] Copying application files...');

const fileCopies = [
  ['server.js', 'server.js'],
  ['public', 'public'],
  ['src', 'src'],
];

for (const [src, dest] of fileCopies) {
  cpSync(join(__dirname, src), join(DIST, dest), { recursive: true });
  console.log(`         ${src}`);
}

mkdirSync(join(DIST, 'data'), { recursive: true });
console.log('         data/ (created)');

// Write a trimmed package.json for the distribution (no devDependencies, no electron-builder config)
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
const distPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  main: 'server.js',
  type: 'module',
  scripts: {
    start: 'node server.js',
  },
  dependencies: pkg.dependencies,
};
writeFileSync(join(DIST, 'package.json'), JSON.stringify(distPkg, null, 2) + '\n');
console.log('         package.json (trimmed)');

// ── Step 3: Copy Node.js binary ──
console.log('  [3/5] Copying Node.js runtime...');
const nodeExe = process.execPath;
cpSync(nodeExe, join(DIST, 'node.exe'));
console.log(`         ${nodeExe}`);

// ── Step 4: Install production dependencies ──
console.log('  [4/5] Installing production dependencies...');
execSync('npm install --omit=dev --no-audit --no-fund', { cwd: DIST, stdio: 'inherit' });

// ── Step 5: Create launcher executable ──
console.log('  [5/5] Creating launcher...');

const launcherSource = `
using System;
using System.Diagnostics;
using System.IO;

class SherlockMailLauncher {
    static int Main(string[] args) {
        string exeDir = Path.GetDirectoryName(
            System.Reflection.Assembly.GetExecutingAssembly().Location);
        string node = Path.Combine(exeDir, "node.exe");
        string server = Path.Combine(exeDir, "server.js");

        if (!File.Exists(node)) {
            Console.Error.WriteLine("Error: node.exe not found in " + exeDir);
            Console.Error.WriteLine("Ensure node.exe is in the same directory as SherlockMail.exe");
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
            return 1;
        }

        string arguments = "\\"" + server + "\\"";
        if (args.Length > 0) {
            arguments += " " + String.Join(" ", args);
        }

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = node;
        psi.Arguments = arguments;
        psi.WorkingDirectory = exeDir;
        psi.UseShellExecute = false;

        try {
            Process p = Process.Start(psi);
            Console.CancelKeyPress += (s, e) => {
                e.Cancel = true;
                try { p.Kill(); } catch {}
            };
            p.WaitForExit();
            return p.ExitCode;
        } catch (Exception ex) {
            Console.Error.WriteLine("Failed to start SherlockMail: " + ex.Message);
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
            return 1;
        }
    }
}
`;

const csPath = join(DIST, '_launcher.cs');
const exePath = join(DIST, 'SherlockMail.exe');
writeFileSync(csPath, launcherSource);

let launcherCreated = false;

// Try .NET Framework csc (available on virtually all Windows installations)
const cscPaths = [
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
];

for (const cscPath of cscPaths) {
  if (!existsSync(cscPath)) continue;
  try {
    execSync(`"${cscPath}" /nologo /out:"${exePath}" /target:exe /optimize+ "${csPath}"`, { stdio: 'pipe' });
    launcherCreated = true;
    console.log('         SherlockMail.exe (compiled)');
    break;
  } catch { /* try next */ }
}

if (!launcherCreated) {
  // Try dotnet csc
  try {
    execSync(`dotnet csc /nologo /out:"${exePath}" /target:exe /optimize+ "${csPath}"`, { stdio: 'pipe' });
    launcherCreated = true;
    console.log('         SherlockMail.exe (compiled via dotnet)');
  } catch { /* fallback below */ }
}

if (!launcherCreated) {
  // Fallback: create a batch launcher
  writeFileSync(join(DIST, 'SherlockMail.cmd'), '@echo off\r\ncd /d "%~dp0"\r\nnode.exe server.js %*\r\n');
  console.log('         SherlockMail.cmd (batch fallback — C# compiler not found)');
  console.log('');
  console.log('  Note: Install .NET Framework SDK or .NET SDK to get a proper .exe launcher.');
  console.log('  You can also run the app directly with: node server.js');
}

// Clean up temp C# source
rmSync(csPath, { force: true });

// ── Summary ──
console.log('');
console.log('  Build complete!');
console.log(`  Distribution: ${DIST}`);
console.log('');
console.log('  To run:');
if (launcherCreated) {
  console.log('    SherlockMail.exe');
  console.log('    SherlockMail.exe --port 8080');
  console.log('    SherlockMail.exe --data-dir "C:\\Cases" --no-browser');
} else {
  console.log('    SherlockMail.cmd');
  console.log('    node server.js --port 8080');
}
console.log('');
console.log('  To distribute: zip the SherlockMail folder and share.');
console.log('  No Node.js or Electron installation required on the target machine.');
console.log('');
