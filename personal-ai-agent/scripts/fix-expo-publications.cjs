const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "node_modules");
const repaired = [];
const unresolved = [];

function walk(directory) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const packageDir = path.join(directory, entry.name);
    const configPath = path.join(packageDir, "expo-module.config.json");

    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const publication = config.android && config.android.publication;
        if (publication && !publication.version) {
          const packageJsonPath = path.join(packageDir, "package.json");
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
          if (typeof packageJson.version === "string" && packageJson.version.length > 0) {
            publication.version = packageJson.version;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
            repaired.push({ package: packageJson.name || entry.name, version: packageJson.version });
          } else {
            unresolved.push(packageJson.name || entry.name);
          }
        }
      } catch (error) {
        unresolved.push(packageDir + ": " + error.message);
      }
    }

    walk(packageDir);
  }
}

walk(root);
if (unresolved.length) {
  console.error("Expo Android publication metadata could not be repaired:", unresolved);
  process.exit(1);
}
console.log("Expo Android publication metadata check passed; repaired:", JSON.stringify(repaired));
