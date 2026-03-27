import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

// Read config values from .env (falls back to process.env).
// Secrets (API keys, tokens) are NOT read here — they are loaded only
// by the credential proxy (credential-proxy.ts), never exposed to containers.
const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'ASSISTANT_HAS_OWN_NUMBER',
  'WEB_PORT',
  'PUBLIC_URL',
  'NANDA_REGISTRY_URL',
  'NANDA_AGENT_ID',
  'NANDA_AGENT_HANDLE',
  'NANDA_AGENT_NAME',
  'NANDA_AGENT_DESCRIPTION',
  'NANDA_AGENT_VERSION',
  'NANDA_AGENT_CAPABILITIES',
  'NANDA_AGENT_TAGS',
  'ALLOW_INSECURE_PUBLIC_URL',
]);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const ASSISTANT_HAS_OWN_NUMBER =
  (process.env.ASSISTANT_HAS_OWN_NUMBER ||
    envConfig.ASSISTANT_HAS_OWN_NUMBER) === 'true';
export const WEB_PORT = parseInt(
  process.env.WEB_PORT || envConfig.WEB_PORT || '3000',
  10,
);
export const PUBLIC_URL =
  process.env.PUBLIC_URL || envConfig.PUBLIC_URL || `http://localhost:${WEB_PORT}`;
export const NANDA_REGISTRY_URL =
  process.env.NANDA_REGISTRY_URL ||
  envConfig.NANDA_REGISTRY_URL ||
  'http://registry.chat39.com:6900';
export const NANDA_AGENT_ID =
  process.env.NANDA_AGENT_ID || envConfig.NANDA_AGENT_ID || 'nanoclaw-main';
export const NANDA_AGENT_HANDLE =
  process.env.NANDA_AGENT_HANDLE ||
  envConfig.NANDA_AGENT_HANDLE ||
  '@nanoclaw/main';
export const NANDA_AGENT_NAME =
  process.env.NANDA_AGENT_NAME || envConfig.NANDA_AGENT_NAME || 'NanoClaw Agent';
export const NANDA_AGENT_DESCRIPTION =
  process.env.NANDA_AGENT_DESCRIPTION ||
  envConfig.NANDA_AGENT_DESCRIPTION ||
  'A container-isolated Claude assistant orchestrator with multi-channel routing.';
export const NANDA_AGENT_VERSION =
  process.env.NANDA_AGENT_VERSION || envConfig.NANDA_AGENT_VERSION || '1.0.0';
export const NANDA_AGENT_CAPABILITIES =
  process.env.NANDA_AGENT_CAPABILITIES || envConfig.NANDA_AGENT_CAPABILITIES || '';
export const NANDA_AGENT_TAGS =
  process.env.NANDA_AGENT_TAGS || envConfig.NANDA_AGENT_TAGS || '';
export const ALLOW_INSECURE_PUBLIC_URL =
  (process.env.ALLOW_INSECURE_PUBLIC_URL ||
    envConfig.ALLOW_INSECURE_PUBLIC_URL ||
    'false') === 'true';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'sender-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const CREDENTIAL_PROXY_PORT = parseInt(
  process.env.CREDENTIAL_PROXY_PORT || '3001',
  10,
);
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default — how long to keep container alive after last result
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
