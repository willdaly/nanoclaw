import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

import { GROUPS_DIR } from '../config.js';
import { setRegisteredGroup } from '../db.js';
import { logger } from '../logger.js';
import { Channel } from '../types.js';
import { registerChannel, ChannelOpts } from './registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WEB_JID = 'web:cake-demo';
const WEB_PORT = parseInt(process.env.WEB_PORT || '3000', 10);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${WEB_PORT}`;
const GROUP_FOLDER = 'web_cake-demo';
const SOURCE_CLAUDE_MD = path.join(
  GROUPS_DIR,
  'cake-front-of-house',
  'CLAUDE.md',
);

function buildAgentFacts() {
  return {
    '@context': 'https://spec.projectnanda.org/agentfacts/v1.2.jsonld',
    id: `uuid:cake-ordering-swarm-v1`,
    handle: '@willdaly/cake-ordering-swarm',
    name: 'Cake Ordering Swarm',
    description:
      'A Society of Agents for the NANDA Sandbox that handles end-to-end cake ordering. Cambridge, MA artisan bakery.',
    version: '1.0.0',
    url: PUBLIC_URL,
    endpoint: PUBLIC_URL,
    capabilities: [
      'urn:nanda:cap:rag-search',
      'urn:nanda:cap:order-placement',
      'urn:nanda:cap:a2a-orchestration',
      'urn:nanda:cap:nanda-registration',
    ],
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
