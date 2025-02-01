// TODO: Remove this once we have a real implementation
/* eslint-disable @typescript-eslint/no-unused-vars */

import { Decimal } from "decimal.js";
import {
  PublicClient,
  ReadContractParameters,
  ReadContractReturnType,
  TransactionRequest,
  TransactionSerializable,
  createPublicClient,
  http,
  keccak256,
  serializeTransaction,
} from "viem";
import { EvmWalletProvider } from "./evmWalletProvider";
import { Network } from "../network";
import { NETWORK_ID_TO_CHAIN_ID, NETWORK_ID_TO_VIEM_CHAIN } from "../network/network";
import {
  Coinbase,
  CreateERC20Options,
  CreateTradeOptions,
  ExternalAddress,
  SmartContract,
  Trade,
  Wallet,
  WalletData,
  hashTypedDataMessage,
  hashMessage,
} from "@coinbase/coinbase-sdk";

/**
 * Configuration options for the CdpActionProvider.
 */
export interface CdpWalletProviderConfig {
  /**
   * CDP API Key Name.
   */
  apiKeyName?: string;

  /**
   * CDP API Key Private Key.
   */
  apiKeyPrivateKey?: string;
}

/**
 * Configuration options for the CDP Agentkit with a Wallet.
 */
interface ConfigureCdpAgentkitWithWalletOptions extends CdpWalletProviderConfig {
  networkId?: string;
  cdpWalletData?: string;
  mnemonicPhrase?: string;
}

/**
 * A wallet provider that uses the Coinbase SDK.
 */
export class CdpWalletProvider extends EvmWalletProvider {
  #cdpWallet?: Wallet;
  #address?: string;
  #network?: Network;
  #publicClient?: PublicClient;

  /**
   * Constructs a new CdpWalletProvider.
   *
   * @param config - The configuration options for the CdpWalletProvider.
   */
  private constructor(config: CdpWalletProviderConfig) {
    super();

    if (config.apiKeyName && config.apiKeyPrivateKey) {
      Coinbase.configure({ apiKeyName: config.apiKeyName, privateKey: config.apiKeyPrivateKey });
    } else {
      Coinbase.configureFromJson();
    }
  }

  /**
   * Configures a new CdpWalletProvider with a wallet.
   *
   * @param config - Optional configuration parameters
   * @returns A Promise that resolves to a new CdpAgentkit instance
   * @throws Error if required environment variables are missing or wallet initialization fails
   */
  public static async configureWithWallet(
    config: ConfigureCdpAgentkitWithWalletOptions = {},
  ): Promise<CdpWalletProvider> {
    const cdpWalletProvider = new CdpWalletProvider(config);

    const mnemonicPhrase = config.mnemonicPhrase || process.env.MNEMONIC_PHRASE;
    const networkId = config.networkId || process.env.NETWORK_ID || Coinbase.networks.BaseSepolia;

    try {
      if (config.cdpWalletData) {
        const walletData = JSON.parse(config.cdpWalletData) as WalletData;
        cdpWalletProvider.#cdpWallet = await Wallet.import(walletData);
      } else if (mnemonicPhrase) {
        cdpWalletProvider.#cdpWallet = await Wallet.import(
          { mnemonicPhrase: mnemonicPhrase },
          networkId,
        );
      } else {
        cdpWalletProvider.#cdpWallet = await Wallet.create({ networkId: networkId });
      }
    } catch (error) {
      throw new Error(`Failed to initialize wallet: ${error}`);
    }

    cdpWalletProvider.#address = (await cdpWalletProvider.#cdpWallet.getDefaultAddress())?.getId();
    cdpWalletProvider.#network = {
      protocolFamily: "evm" as const,
      chainId: NETWORK_ID_TO_CHAIN_ID[networkId],
      networkId: networkId,
    };

    cdpWalletProvider.#publicClient = createPublicClient({
      chain: NETWORK_ID_TO_VIEM_CHAIN[networkId],
      transport: http(),
    });

    return cdpWalletProvider;
  }

  /**
   * Signs a message.
   *
   * @param message - The message to sign.
   * @returns The signed message.
   */
  async signMessage(message: string): Promise<`0x${string}`> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    const messageHash = hashMessage(message);
    const payload = await this.#cdpWallet.createPayloadSignature(messageHash);

    return payload.getSignature() as `0x${string}`;
  }

  /**
   * Signs a typed data object.
   *
   * @param typedData - The typed data object to sign.
   * @returns The signed typed data object.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async signTypedData(typedData: any): Promise<`0x${string}`> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    const messageHash = hashTypedDataMessage(
      typedData.domain!,
      typedData.types!,
      typedData.message!,
    );

    const payload = await this.#cdpWallet.createPayloadSignature(messageHash);

    return payload.getSignature() as `0x${string}`;
  }

  /**
   * Signs a transaction.
   *
   * @param transaction - The transaction to sign.
   * @returns The signed transaction.
   */
  async signTransaction(transaction: TransactionRequest): Promise<`0x${string}`> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    const serializedTx = serializeTransaction(transaction as TransactionSerializable);
    const transactionHash = keccak256(serializedTx);
    const payload = await this.#cdpWallet.createPayloadSignature(transactionHash);

    return payload.getSignature() as `0x${string}`;
  }

  /**
   * Sends a transaction.
   *
   * @param transaction - The transaction to send.
   * @returns The hash of the transaction.
   */
  async sendTransaction(transaction: TransactionRequest): Promise<`0x${string}`> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    try {
      const preparedTransaction = await this.prepareTransaction(
        transaction.to!,
        transaction.value!,
        transaction.data!,
      );

      // console.log("preparedTransaction", preparedTransaction);
      // // const transactionHex = await this.convertToSignableHex(preparedTransaction);
      // const transactionHex = serializeTransaction(preparedTransaction as TransactionSerializable);
      // console.log("transactionHex", transactionHex);
      // const transactionHash = keccak256(transactionHex);

      const signature = await this.signTransaction({
        ...preparedTransaction,
        data: undefined,
      } as unknown as TransactionRequest);
      console.log("signature", signature);

      const externalAddress = new ExternalAddress(this.#cdpWallet.getNetworkId(), this.#address!);
      console.log("broadcasting with:", {
        networkId: this.#cdpWallet.getNetworkId(),
        addressId: this.#address,
        signature: signature,
      });

      const tx = await externalAddress
        .broadcastExternalTransaction(signature!)
        .catch(error => {
          console.error("Broadcast error:", error);
          throw error;
        });

      return tx.transactionHash as `0x${string}`;
    } catch (error) {
      console.error("Send transaction error:", error);
      throw error;
    }
  }

  /**
   * Prepares a transaction.
   *
   * @param to - The address to send the transaction to.
   * @param value - The value of the transaction.
   * @param data - The data of the transaction.
   * @returns The prepared transaction.
   */
  async prepareTransaction(
    to: `0x${string}`,
    value: bigint,
    data: `0x${string}`,
  ): Promise<TransactionSerializable> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    const nonce = await this.#publicClient!.getTransactionCount({
      address: this.#address! as `0x${string}`,
    });

    const gasPrice = await this.#publicClient!.getGasPrice();
    const gas = await this.#publicClient!.estimateGas({
      to,
      value,
      data,
    });

    return {
      to,
      value,
      data,
      nonce,
      gasPrice,
      gas,
      type: "legacy",
    };
  }

  /**
   * Converts a TransactionRequest into a signable hex string using Viem.
   *
   * @param transaction - The transaction request to convert.
   * @returns A signable hex string.
   */
  async convertToSignableHex(transaction: TransactionSerializable): Promise<string> {
    console.log("transaction", transaction);
    const { to, value, data, nonce, gasPrice, gas } = transaction;

    const encodedTransaction = serializeTransaction({
      to,
      value,
      data,
      nonce,
      gasPrice,
      gas,
      type: "legacy",
    } as TransactionSerializable);

    console.log("encodedTransaction", encodedTransaction);
    return encodedTransaction;
  }

  /**
   * Adds signature to a transaction and serializes it for broadcast.
   *
   * @param transaction - The transaction to sign.
   * @param signature - The signature to add to the transaction.
   * @returns A serialized transaction.
   */
  async addSignatureAndSerialize(
    transaction: TransactionSerializable,
    signature: `0x${string}`,
  ): Promise<string> {
    // Decode the signature into its components
    const r = `0x${signature.slice(2, 66)}`; // First 32 bytes
    const s = `0x${signature.slice(66, 130)}`; // Next 32 bytes
    const v = BigInt(parseInt(signature.slice(130, 132), 16)); // Last byte

    const signedTransaction = {
      ...transaction,
      r,
      s,
      v,
      type: "legacy" as const,
    };

    return serializeTransaction(signedTransaction as unknown as TransactionSerializable);
  }

  /**
   * Gets the address of the wallet.
   *
   * @returns The address of the wallet.
   */
  getAddress(): string {
    if (!this.#address) {
      throw new Error("Address not initialized");
    }

    return this.#address;
  }

  /**
   * Gets the network of the wallet.
   *
   * @returns The network of the wallet.
   */
  getNetwork(): Network {
    if (!this.#network) {
      throw new Error("Network not initialized");
    }

    return this.#network;
  }

  /**
   * Gets the name of the wallet provider.
   *
   * @returns The name of the wallet provider.
   */
  getName(): string {
    return "cdp_wallet_provider";
  }

  /**
   * Gets the balance of the wallet.
   *
   * @returns The balance of the wallet in wei
   */
  async getBalance(): Promise<bigint> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    const balance = await this.#cdpWallet.getBalance("eth");
    return BigInt(balance.mul(10 ** 18).toString());
  }

  /**
   * Waits for a transaction receipt.
   *
   * @param txHash - The hash of the transaction to wait for.
   * @returns The transaction receipt.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async waitForTransactionReceipt(txHash: `0x${string}`): Promise<any> {
    // TODO: Implement
    throw Error("Unimplemented");
  }

  /**
   * Reads a contract.
   *
   * @param params - The parameters to read the contract.
   * @returns The response from the contract.
   */
  async readContract(params: ReadContractParameters): Promise<ReadContractReturnType> {
    // TODO: Implement
    throw Error("Unimplemented");
  }

  /**
   * Creates a trade.
   *
   * @param options - The options for the trade.
   * @returns The trade.
   */
  async createTrade(options: CreateTradeOptions): Promise<Trade> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    return this.#cdpWallet.createTrade(options);
  }

  /**
   * Deploys a token.
   *
   * @param options - The options for the token deployment.
   * @returns The deployed token.
   */
  async deployToken(options: CreateERC20Options): Promise<SmartContract> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    return this.#cdpWallet.deployToken(options);
  }

  /**
   * Deploys a contract.
   *
   * @param options - The options for contract deployment
   * @param options.solidityVersion - The version of the Solidity compiler to use (e.g. "0.8.0+commit.c7dfd78e")
   * @param options.solidityInputJson - The JSON input for the Solidity compiler containing contract source and settings
   * @param options.contractName - The name of the contract to deploy
   * @param options.constructorArgs - Key-value map of constructor args
   *
   * @returns A Promise that resolves to the deployed contract instance
   * @throws Error if wallet is not initialized
   */
  async deployContract(options: {
    solidityVersion: string;
    solidityInputJson: string;
    contractName: string;
    constructorArgs: Record<string, unknown>;
  }): Promise<SmartContract> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    return this.#cdpWallet.deployContract(options);
  }

  /**
   * Deploys a new NFT (ERC-721) smart contract.
   *
   * @param options - Configuration options for the NFT contract deployment
   * @param options.name - The name of the collection
   * @param options.symbol - The token symbol for the collection
   * @param options.baseURI - The base URI for token metadata.
   *
   * @returns A Promise that resolves to the deployed SmartContract instance
   * @throws Error if the wallet is not properly initialized
   * @throws Error if the deployment fails for any reason (network issues, insufficient funds, etc.)
   */
  async deployNFT(options: {
    name: string;
    symbol: string;
    baseURI: string;
  }): Promise<SmartContract> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    return this.#cdpWallet.deployNFT(options);
  }

  /**
   * Transfer the native asset of the network.
   *
   * @param to - The destination address.
   * @param value - The amount to transfer in Wei.
   * @returns The transaction hash.
   */
  async nativeTransfer(to: `0x${string}`, value: string): Promise<`0x${string}`> {
    if (!this.#cdpWallet) {
      throw new Error("Wallet not initialized");
    }

    const transferResult = await this.#cdpWallet.createTransfer({
      amount: new Decimal(value),
      assetId: Coinbase.assets.Eth,
      destination: to,
      gasless: false,
    });

    const result = await transferResult.wait();

    if (!result.getTransactionHash()) {
      throw new Error("Transaction hash not found");
    }

    return result.getTransactionHash() as `0x${string}`;
  }
}
