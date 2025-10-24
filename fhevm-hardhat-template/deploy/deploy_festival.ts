import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const Factory = await ethers.getContractFactory("FestivalRegistry");
  const contract = await Factory.deploy(await deployer.getAddress());
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const networkName = network.name === "unknown" && chainId === 31337 ? "localhost" : network.name;

  console.log(`FestivalRegistry deployed at: ${address} (chainId=${chainId}, network=${networkName})`);

  // Create an example festival and deploy ticket collection
  const now = Math.floor(Date.now() / 1000);
  const tx = await contract.createFestival(
    1,
    "ipfs://festival-metadata-cid",
    await deployer.getAddress(),
    now + 3600,
    now + 3600 * 24,
    "Main Venue",
    true
  );
  await tx.wait();

  const ticketAddr = await contract.ticketCollection(1);
  console.log("Festival #1 ticket collection:", ticketAddr);

  // Write deployments file
  const outDir = path.join(__dirname, "..", "deployments", networkName);
  fs.mkdirSync(outDir, { recursive: true });

  const projectRoot = path.join(__dirname, "..");
  const abiPath = path.join(
    projectRoot,
    "artifacts",
    "contracts",
    "FestivalRegistry.sol",
    "FestivalRegistry.json"
  );

  let abiJson: any = undefined;
  try {
    const raw = fs.readFileSync(abiPath, "utf-8");
    abiJson = JSON.parse(raw);
  } catch (e) {
    console.warn("Unable to read ABI from artifacts, did you compile?", e);
  }

  const out = {
    address,
    chainId,
    network: networkName,
    abi: abiJson?.abi ?? [],
    festivals: {
      1: {
        ticket: ticketAddr,
        metadataURI: "ipfs://festival-metadata-cid"
      }
    }
  };

  const outFile = path.join(outDir, "FestivalRegistry.json");
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log("Wrote deployment:", outFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
