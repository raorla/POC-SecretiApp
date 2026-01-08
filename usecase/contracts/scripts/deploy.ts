import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying PrivateAIGateway with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy PrivateAIGateway
  const PrivateAIGateway = await ethers.getContractFactory("PrivateAIGateway");
  
  // Use environment variables for app addresses
  const keyManagerApp = process.env.KEY_MANAGER_APP || ethers.ZeroAddress;
  const aiOracleApp = process.env.AI_ORACLE_APP || ethers.ZeroAddress;
  
  console.log("KeyManager App:", keyManagerApp);
  console.log("AIOracle App:", aiOracleApp);
  
  const gateway = await PrivateAIGateway.deploy(keyManagerApp, aiOracleApp);
  await gateway.waitForDeployment();
  
  const gatewayAddress = await gateway.getAddress();
  console.log("PrivateAIGateway deployed to:", gatewayAddress);
  
  // Verify contract on Arbiscan
  if (process.env.ARBISCAN_API_KEY) {
    console.log("Waiting for block confirmations...");
    await gateway.deploymentTransaction()?.wait(5);
    
    console.log("Verifying contract on Arbiscan...");
    try {
      await run("verify:verify", {
        address: gatewayAddress,
        constructorArguments: [keyManagerApp, aiOracleApp],
      });
      console.log("Contract verified successfully!");
    } catch (error) {
      console.log("Verification failed:", error);
    }
  }
  
  // Save deployment info
  const deploymentInfo = {
    network: "arbitrumSepolia",
    chainId: 421614,
    contracts: {
      PrivateAIGateway: gatewayAddress,
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };
  
  console.log("\nDeployment Info:", JSON.stringify(deploymentInfo, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
