import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

import {
  ALLOW_INSECURE_PUBLIC_URL,
  GROUPS_DIR,
  NANDA_AGENT_CAPABILITIES,
  NANDA_AGENT_DESCRIPTION,
  NANDA_AGENT_HANDLE,
  NANDA_AGENT_ID,
  NANDA_AGENT_NAME,
  NANDA_AGENT_VERSION,
  PUBLIC_URL,
  WEB_PORT,
} from '../config.js';
import { setRegisteredGroup } from '../db.js';
import { logger } from '../logger.js';
import { Channel } from '../types.js';
import { registerChannel, ChannelOpts } from './registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WEB_JID = 'web:cake-demo';
const GROUP_FOLDER = 'web_cake-demo';
const SOURCE_CLAUDE_MD = path.join(
  GROUPS_DIR,
  'cake-front-of-house',
  'CLAUDE.md',
);

const DEFAULT_CAPABILITIES = [
  'urn:nanda:cap:rag-search',
  'urn:nanda:cap:order-placement',
  'urn:nanda:cap:a2a-orchestration',
  'urn:nanda:cap:nanda-registration',
];

function parseCsv(input: string): string[] {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getCapabilities(): string[] {
  const fromEnv = parseCsv(NANDA_AGENT_CAPABILITIES);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_CAPABILITIES;
}

function logPublicUrlWarnings(): void {
  let parsed: URL;
  try {
    parsed = new URL(PUBLIC_URL);
  } catch {
    logger.warn({ publicUrl: PUBLIC_URL }, 'PUBLIC_URL is not a valid URL');
    return;
  }

  const isLocalHost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '0.0.0.0';
  const isProduction = process.env.NODE_ENV === 'production';

  if (parsed.protocol !== 'https:') {
    if (isProduction && !ALLOW_INSECURE_PUBLIC_URL) {
      throw new Error(
        `PUBLIC_URL must be HTTPS in production (current: ${PUBLIC_URL}). Set ALLOW_INSECURE_PUBLIC_URL=true only for temporary exceptions.`,
      );
    }
    logger.warn(
      { publicUrl: PUBLIC_URL },
      'PUBLIC_URL is not HTTPS; agent discovery traffic may be insecure',
    );
  }

  if (isLocalHost) {
    if (isProduction && !ALLOW_INSECURE_PUBLIC_URL) {
      throw new Error(
        `PUBLIC_URL points to a local interface in production (current: ${PUBLIC_URL}). Set ALLOW_INSECURE_PUBLIC_URL=true only for temporary exceptions.`,
      );
    }
    logger.warn(
      { publicUrl: PUBLIC_URL },
      'PUBLIC_URL points to a local interface and is not publicly discoverable',
    );
  }
}

function buildAgentFacts() {
  return {
    '@context': 'https://spec.projectnanda.org/agentfacts/v1.2.jsonld',
    id: `uuid:${NANDA_AGENT_ID}`,
    handle: NANDA_AGENT_HANDLE,
    name: NANDA_AGENT_NAME,
    description: NANDA_AGENT_DESCRIPTION,
    version: NANDA_AGENT_VERSION,
    url: PUBLIC_URL,
    endpoint: PUBLIC_URL,
    capabilities: getCapabilities(),
    skills: [
      {
        id: 'cake-menu-rag',
        name: 'Cake Menu Search',
        description:
          'Natural-language vector search over the cake catalog with allergen & pricing info',
      },
      {
        id: 'delivery-check',
        name: 'Delivery Availability',
        description: 'Slot availability check by ZIP code, date and time',
      },
      {
        id: 'cake-order-placement',
        name: 'Order Placement',
        description: 'Places orders and returns a receipt with order ID',
      },
      {
        id: 'nanda-registration',
        name: 'NANDA Registration',
        description:
          'Generates AgentFacts and registers the swarm with the NANDA Index',
      },
    ],
    agents: [
      { name: 'Front-of-House', role: 'Orchestrator' },
      { name: 'Sommelier', role: 'RAG / Menu Expert' },
      { name: 'Logistician', role: 'MCP / Booking & Delivery' },
      { name: 'Diplomat', role: 'Registry & A2A Metadata' },
    ],
    auth: { type: 'none' },
    meta: {
      schema_version: '1.2',
      published: new Date().toISOString(),
    },
  };
}

export class WebChannel implements Channel {
  name = 'web';

  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private connected = false;
  private opts: ChannelOpts;

  constructor(opts: ChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.ensureGroup();
    logPublicUrlWarnings();

    const htmlPath = path.join(__dirname, 'web-ui.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

    this.server = http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);
      } else if (req.url === '/.well-known/agent.json') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(buildAgentFacts(), null, 2));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.wss = new WebSocketServer({ server: this.server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      logger.info('Web demo: browser connected');

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type: string;
            text?: string;
          };
          if (msg.type === 'message' && msg.text) {
            const now = new Date().toISOString();
            this.opts.onChatMetadata(
              WEB_JID,
              now,
              'Cake Ordering Swarm — Web Demo',
              'web',
              false,
            );
            this.opts.onMessage(WEB_JID, {
              id: crypto.randomUUID(),
              chat_jid: WEB_JID,
              sender: 'web:user',
              sender_name: 'Demo User',
              content: msg.text,
              timestamp: now,
              is_from_me: false,
              is_bot_message: false,
            });
          }
        } catch {
          // ignore malformed frames
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(WEB_PORT, () => {
        this.connected = true;
        logger.info(`Web demo available at ${PUBLIC_URL}`);
        resolve();
      });
      this.server!.on('error', reject);
    });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!jid.startsWith('web:')) return;
    const payload = JSON.stringify({
      type: 'message',
      role: 'assistant',
      text,
      timestamp: new Date().toISOString(),
    });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!jid.startsWith('web:')) return;
    const payload = JSON.stringify({ type: 'typing', isTyping });
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('web:');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.wss?.close();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private ensureGroup(): void {
    const groupDir = path.join(GROUPS_DIR, GROUP_FOLDER);
    if (!fs.existsSync(groupDir)) {
      fs.mkdirSync(groupDir, { recursive: true });
    }

    const claudeMd = path.join(groupDir, 'CLAUDE.md');
    if (!fs.existsSync(claudeMd) && fs.existsSync(SOURCE_CLAUDE_MD)) {
      fs.copyFileSync(SOURCE_CLAUDE_MD, claudeMd);
    }

    setRegisteredGroup(WEB_JID, {
      name: 'Cake Ordering Swarm — Web Demo',
      folder: GROUP_FOLDER,
      trigger: '@Andy',
      added_at: new Date().toISOString(),
      requiresTrigger: false,
      isMain: false,
    });
  }
}

registerChannel('web', (opts: ChannelOpts) => new WebChannel(opts));
