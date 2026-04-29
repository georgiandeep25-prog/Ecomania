import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const deploymentsDir = path.join(rootDir, "deployments");
const outputPath = path.join(rootDir, "frontend", "src", "lib", "contract-config.js");

function getPreferredDeployment() {
  const preferredNetworks = ["local", "testnet", "mainnet"];
  for (const networkName of preferredNetworks) {
    const candidate = path.join(deploymentsDir, `${networkName}.json`);
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    }
  }

  return null;
}

const deployment = getPreferredDeployment();
const fileContents = `export const ecomaniaConfig = ${JSON.stringify(
  {
    contractName: "Ecomania",
    fallbackContractId: deployment?.contractId || "",
    fallbackNetwork: deployment?.network || "testnet",
    generatedAt: deployment?.deployedAt || "",
    limits: {
      minActionQuantity: 1,
      maxActionQuantity: 100,
      minGoalActions: 1,
      maxGoalActions: 500
    }
  },
  null,
  2
)};\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, fileContents);

console.log(`Frontend contract config written to ${outputPath}`);
