import { CdpWalletProvider } from "./cdpWalletProvider";
import { Coinbase, Wallet, WalletData } from "@coinbase/coinbase-sdk";
import { WalletProvider } from "./walletProvider";

const MOCK_ADDRESS = "0x1A24737073f04B025Eb5bA390885C1E083186aa6";
const MOCK_WALLET_ID = "941dd2e8-20bd-4997-b7ff-7a2aab1499b0";
const MOCK_SEED = "a889d0411a4374ba5840103ae3cdee5fe2118a44a1cd43c59b6de1df9b1dbd17";
const MOCK_NETWORK_ID = "base-sepolia";
const MOCK_MNEMONIC =
  "move pilot elephant tilt brief chimney where nerve cheese target tortoise forest use manage document";

describe("CdpWalletProvider", () => {
  const MOCK_WALLET_DATA: WalletData = {
    walletId: MOCK_WALLET_ID,
    seed: MOCK_SEED,
    networkId: MOCK_NETWORK_ID,
    defaultAddressId: MOCK_ADDRESS,
  } as WalletData;
  let mockWallet: jest.Mocked<Wallet>;

  beforeEach(async () => {
    mockWallet = {
      getDefaultAddress: jest.fn().mockResolvedValue({ getId: () => MOCK_ADDRESS }),
      getNetworkId: jest.fn().mockReturnValue(MOCK_NETWORK_ID),
      export: jest.fn().mockResolvedValue(MOCK_WALLET_DATA),
    } as unknown as jest.Mocked<Wallet>;

    jest.spyOn(Wallet, "create").mockResolvedValue(mockWallet);
    jest.spyOn(Wallet, "import").mockResolvedValue(mockWallet);
    jest
      .spyOn(WalletProvider.prototype, "trackInitialization" as keyof WalletProvider)
      .mockResolvedValue("0x" as `0x${string}`);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("exportWallet", () => {
    it("should export wallet data for a newly created wallet", async () => {
      const provider = await CdpWalletProvider.configureWithWallet({
        apiKeyName: "test-key",
        apiKeyPrivateKey: "test-private-key",
        networkId: Coinbase.networks.BaseSepolia,
      });

      const walletData = await provider.exportWallet();

      expect(walletData).toEqual(MOCK_WALLET_DATA);
      expect(Wallet.create).toHaveBeenCalledWith({
        networkId: Coinbase.networks.BaseSepolia,
      });
    });

    it("should throw error when wallet is not initialized", async () => {
      (Wallet.create as jest.Mock).mockRejectedValueOnce(new Error("Failed to initialize wallet"));

      await expect(
        CdpWalletProvider.configureWithWallet({
          apiKeyName: "test-key",
          apiKeyPrivateKey: "test-private-key",
        }),
      ).rejects.toThrow("Failed to initialize wallet");
    });

    it("should import existing wallet from mnemonic", async () => {
      const provider = await CdpWalletProvider.configureWithWallet({
        apiKeyName: "test-key",
        apiKeyPrivateKey: "test-private-key",
        mnemonicPhrase: MOCK_MNEMONIC,
        networkId: Coinbase.networks.BaseSepolia,
      });

      expect(Wallet.import).toHaveBeenCalledWith(
        { mnemonicPhrase: MOCK_MNEMONIC },
        Coinbase.networks.BaseSepolia,
      );

      const walletData = await provider.exportWallet();
      expect(walletData).toEqual(MOCK_WALLET_DATA);
    });

    it("should import existing wallet from wallet data", async () => {
      const provider = await CdpWalletProvider.configureWithWallet({
        apiKeyName: "test-key",
        apiKeyPrivateKey: "test-private-key",
        cdpWalletData: JSON.stringify(MOCK_WALLET_DATA),
      });

      expect(Wallet.import).toHaveBeenCalledWith(MOCK_WALLET_DATA);

      const walletData = await provider.exportWallet();
      expect(walletData).toEqual(MOCK_WALLET_DATA);
    });
  });
});
