const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const resourcesDir = path.join(rootDir, "src-tauri", "resources");
const binariesDir = path.join(rootDir, "src-tauri", "binaries");
const serverEntry = path.join(rootDir, "server", "server.js");
const pkgBin = path.join(rootDir, "node_modules", ".bin", "pkg");

const hostTriple = execFileSync("rustc", ["-vV"], { encoding: "utf8" })
.split("\n")
.find((l) => l.startsWith("host:"))
.split(" ")[1]
.trim();

const BUILDS = [
{
  triple: "aarch64-apple-darwin",
  pkgTarget: "node18-macos-arm64",
  arch: "arm64",
},
{
  triple: "x86_64-apple-darwin",
  pkgTarget: "node18-macos-x64",
  arch: "x86_64",
},
];

// static resources
fs.mkdirSync(resourcesDir, { recursive: true });
fs.copyFileSync(
path.join(rootDir, "data", "scenarios.json"),
path.join(resourcesDir, "scenarios.json"),
);
fs.rmSync(path.join(resourcesDir, "public"), { recursive: true, force: true });
fs.cpSync(path.join(rootDir, "public"), path.join(resourcesDir, "public"), {
recursive: true,
});

fs.mkdirSync(binariesDir, { recursive: true });

for (const { triple, pkgTarget, arch } of BUILDS) {
const out = path.join(binariesDir, `chatroom-server-${triple}`);

const args = [serverEntry, "--target", pkgTarget, "--output", out];
if (triple !== hostTriple) {
  // bytecode compilation would need to execute a target-arch node
  args.push("--no-bytecode", "--public-packages", "*", "--public");
}

console.log(`\n[build-server-binary] ${pkgTarget} -> ${path.basename(out)}`);
fs.rmSync(out, { force: true });
execFileSync(pkgBin, args, { stdio: "inherit" });

if (!fs.existsSync(out)) {
  throw new Error(`pkg exited 0 but did not write ${out}`);
}

fs.chmodSync(out, 0o755);
execFileSync("codesign", ["--sign", "-", "--force", out], {
  stdio: "inherit",
});

// confirm we got the arch we asked for, not a duplicate of the host
const desc = execFileSync("file", ["-b", out], { encoding: "utf8" }).trim();
if (!desc.includes(arch)) {
  throw new Error(`expected ${arch} for ${triple}, got: ${desc}`);
}

const mb = (fs.statSync(out).size / 1e6).toFixed(1);
console.log(`  ok  ${path.basename(out)}  ${mb} MB  ${desc}`);
}
