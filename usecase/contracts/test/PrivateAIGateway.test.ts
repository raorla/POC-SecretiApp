import { expect } from "chai";
import { ethers } from "hardhat";
import { PrivateAIGateway } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("PrivateAIGateway", function () {
  let gateway: PrivateAIGateway;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let keyManagerApp: string;
  let aiOracleApp: string;

  beforeEach(async function () {
    [owner, user] = await ethers.getSigners();
    
    // Use random addresses for apps in tests
    keyManagerApp = ethers.Wallet.createRandom().address;
    aiOracleApp = ethers.Wallet.createRandom().address;
    
    const PrivateAIGateway = await ethers.getContractFactory("PrivateAIGateway");
    gateway = await PrivateAIGateway.deploy(keyManagerApp, aiOracleApp);
    await gateway.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      expect(await gateway.owner()).to.equal(owner.address);
    });

    it("Should set the correct app addresses", async function () {
      expect(await gateway.keyManagerApp()).to.equal(keyManagerApp);
      expect(await gateway.aiOracleApp()).to.equal(aiOracleApp);
    });
  });

  describe("Session Management", function () {
    it("Should create a session", async function () {
      const aiProvider = "openai";
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const encryptedKeyHash = ethers.keccak256(ethers.toUtf8Bytes("test-key"));
      
      const tx = await gateway.connect(user).createSession(
        aiProvider,
        expiresAt,
        encryptedKeyHash
      );
      
      const receipt = await tx.wait();
      expect(receipt?.status).to.equal(1);
      
      // Check SessionCreated event
      const event = receipt?.logs.find(
        (log) => gateway.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "SessionCreated"
      );
      expect(event).to.not.be.undefined;
    });

    it("Should not create expired session", async function () {
      const aiProvider = "openai";
      const expiresAt = Math.floor(Date.now() / 1000) - 3600; // Past time
      const encryptedKeyHash = ethers.keccak256(ethers.toUtf8Bytes("test-key"));
      
      await expect(
        gateway.connect(user).createSession(aiProvider, expiresAt, encryptedKeyHash)
      ).to.be.revertedWith("Expiration must be in future");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update apps", async function () {
      const newKeyManagerApp = ethers.Wallet.createRandom().address;
      const newAiOracleApp = ethers.Wallet.createRandom().address;
      
      await gateway.connect(owner).updateApps(newKeyManagerApp, newAiOracleApp);
      
      expect(await gateway.keyManagerApp()).to.equal(newKeyManagerApp);
      expect(await gateway.aiOracleApp()).to.equal(newAiOracleApp);
    });

    it("Should not allow non-owner to update apps", async function () {
      const newKeyManagerApp = ethers.Wallet.createRandom().address;
      const newAiOracleApp = ethers.Wallet.createRandom().address;
      
      await expect(
        gateway.connect(user).updateApps(newKeyManagerApp, newAiOracleApp)
      ).to.be.revertedWithCustomError(gateway, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to pause/unpause", async function () {
      await gateway.connect(owner).pause();
      expect(await gateway.paused()).to.be.true;
      
      await gateway.connect(owner).unpause();
      expect(await gateway.paused()).to.be.false;
    });
  });
});
