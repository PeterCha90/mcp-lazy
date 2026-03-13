import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ServerConfig } from "../utils/config.js";
import { VERSION } from "../version.js";

interface LoadedServer {
  client: Client;
  transport: unknown;
  loadedAt: Date;
}

export class ServerLoader {
  private servers = new Map<string, LoadedServer>();
  private serverConfigs: Record<string, ServerConfig>;
  private loading = new Map<string, Promise<Client>>();

  constructor(serverConfigs: Record<string, ServerConfig>) {
    this.serverConfigs = serverConfigs;
  }

  async getClient(serverName: string): Promise<Client> {
    // Return cached client
    const existing = this.servers.get(serverName);
    if (existing) {
      return existing.client;
    }

    // Deduplicate concurrent loads
    const pendingLoad = this.loading.get(serverName);
    if (pendingLoad) {
      return pendingLoad;
    }

    const loadPromise = this.loadServer(serverName);
    this.loading.set(serverName, loadPromise);

    try {
      const client = await loadPromise;
      return client;
    } finally {
      this.loading.delete(serverName);
    }
  }

  private async loadServer(serverName: string): Promise<Client> {
    const config = this.serverConfigs[serverName];
    if (!config) {
      throw new Error(`Unknown server: ${serverName}`);
    }

    try {
      return await this.attemptConnect(serverName, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("timed out")) {
        try {
          return await this.attemptConnect(serverName, config);
        } catch (retryError) {
          throw retryError;
        }
      }
      throw error;
    }
  }

  private async attemptConnect(serverName: string, config: ServerConfig): Promise<Client> {
    const timeoutMs = 30000;

    if (!config.command) {
      throw new Error(`Server ${serverName} has no command configured`);
    }

    const client = new Client({
      name: `mcp-lazy-proxy/${serverName}`,
      version: VERSION,
    });

    const env = { ...process.env, ...config.env } as Record<string, string>;
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env,
    });

    const connectPromise = client.connect(transport);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Server ${serverName} timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    await Promise.race([connectPromise, timeoutPromise]);

    this.servers.set(serverName, {
      client,
      transport: transport as unknown,
      loadedAt: new Date(),
    });

    return client;
  }

  getLoadedServers(): string[] {
    return [...this.servers.keys()];
  }

  isLoaded(serverName: string): boolean {
    return this.servers.has(serverName);
  }

  async closeServer(serverName: string): Promise<void> {
    const server = this.servers.get(serverName);
    if (server) {
      await server.client.close();
      this.servers.delete(serverName);
    }
  }

  async closeAll(): Promise<void> {
    const closePromises = [...this.servers.keys()].map((name) =>
      this.closeServer(name)
    );
    await Promise.allSettled(closePromises);
  }

  hasConfig(serverName: string): boolean {
    return serverName in this.serverConfigs;
  }
}
