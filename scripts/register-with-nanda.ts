#!/usr/bin/env tsx
import fs from 'fs';
import path from 'path';

type Json = Record<string, unknown>;

const DEFAULT_REGISTRY_BASE = 'http://registry.chat39.com:6900';
const DEFAULT_AGENT_ID = 'nanoclaw-main';

interface CliOptions {
  dryRun: boolean;
  verbose: boolean;
  allowHttp: boolean;
  registry?: string;
  agentId?: string;
  publicUrl?: string;
  factsUrl?: string;
  capabilities?: string;
  tags?: string;
  name?: string;
  description?: string;
}

function usage(): string {
  return [
    'Usage: npm run register:nanda -- [options]',
    '',
    'Options:',
    '  --dry-run                 Print payloads only, do not call the registry',
    '  --verbose                 Print extra diagnostic output',
    '  --allow-http              Allow non-HTTPS public URLs',
    '  --registry <url>          Registry base URL (default: http://registry.chat39.com:6900)',
    '  --agent-id <id>           Agent ID (default: NANDA_AGENT_ID or nanoclaw-main)',
    '  --public-url <url>        Public URL for your running app',
    '  --facts-url <url>         Agent facts URL (default: <public-url>/.well-known/agent.json)',
    '  --capabilities <csv>      Capability list (comma-separated)',
    '  --tags <csv>              Tag list (comma-separated)',
    '  --name <value>            Optional display name',
    '  --description <value>     Optional display description',
    '  --help                    Show help',
  ].join('\n');
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    verbose: false,
    allowHttp: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }
    if (arg === '--allow-http') {
      options.allowHttp = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }

    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    if (arg === '--registry') {
      options.registry = next;
    } else if (arg === '--agent-id') {
      options.agentId = next;
    } else if (arg === '--public-url') {
      options.publicUrl = next;
    } else if (arg === '--facts-url') {
      options.factsUrl = next;
    } else if (arg === '--capabilities') {
      options.capabilities = next;
    } else if (arg === '--tags') {
      options.tags = next;
    } else if (arg === '--name') {
      options.name = next;
    } else if (arg === '--description') {
      options.description = next;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }

    i += 1;
  }

  return options;
}

function readEnvFile(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return {};

  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function getValue(
  key: string,
  envFromFile: Record<string, string>,
  fallback = '',
): string {
  return process.env[key] || envFromFile[key] || fallback;
}

function parseCsv(input: string): string[] {
  return input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeRegistryBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('NANDA registry URL cannot be empty');
  }

  if (trimmed.endsWith('/register')) {
    return trimmed.slice(0, -'/register'.length);
  }

  return trimmed;
}

function validateHttps(urlValue: string, allowHttp: boolean, field: string): void {
  let parsed: URL;
  try {
    parsed = new URL(urlValue);
  } catch {
    throw new Error(`${field} is not a valid URL: ${urlValue}`);
  }

  if (parsed.protocol !== 'https:' && !allowHttp) {
    throw new Error(
      `${field} must be HTTPS. Use --allow-http only for temporary development endpoints.`,
    );
  }
}

async function fetchJson(url: string, options?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });

  const bodyText = await response.text();
  let body: unknown = bodyText;
  try {
    body = JSON.parse(bodyText);
  } catch {
    // Keep plain text body when JSON parsing fails.
  }

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status} ${response.statusText}) for ${url}: ${JSON.stringify(body)}`,
    );
  }

  return body;
}

async function putStatusWithFallback(
  agentId: string,
  registryBase: string,
  payload: Json,
): Promise<string> {
  const candidates = [
    `${registryBase}/agents/${encodeURIComponent(agentId)}/status`,
    `${registryBase}/update/${encodeURIComponent(agentId)}`,
  ];

  let lastError: Error | null = null;
  for (const endpoint of candidates) {
    try {
      await fetchJson(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return endpoint;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('404')) {
        lastError =
          err instanceof Error ? err : new Error('Status update endpoint not found');
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('No compatible status update endpoint found');
}

async function resolveCapabilities(
  factsUrl: string,
  configured: string,
  verbose: boolean,
): Promise<string[]> {
  const fromConfig = parseCsv(configured);
  if (fromConfig.length > 0) {
    return fromConfig;
  }

  const facts = (await fetchJson(factsUrl)) as Json;
  const fromFacts = Array.isArray(facts.capabilities)
    ? facts.capabilities
        .filter((item) => typeof item === 'string')
        .map((item) => String(item))
    : [];

  if (fromFacts.length === 0) {
    throw new Error(
      'No capabilities were provided and none were found in the fact card. Set NANDA_AGENT_CAPABILITIES.',
    );
  }

  if (verbose) {
    console.log(`Loaded ${fromFacts.length} capabilities from ${factsUrl}`);
  }

  return fromFacts;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const envFromFile = readEnvFile();

  const registryBase = normalizeRegistryBase(
    options.registry || getValue('NANDA_REGISTRY_URL', envFromFile, DEFAULT_REGISTRY_BASE),
  );
  const agentId = options.agentId || getValue('NANDA_AGENT_ID', envFromFile, DEFAULT_AGENT_ID);
  const publicUrl = options.publicUrl || getValue('PUBLIC_URL', envFromFile);
  if (!publicUrl) {
    throw new Error('PUBLIC_URL is required. Set it in environment or pass --public-url.');
  }

  const factsUrl =
    options.factsUrl ||
    getValue('NANDA_FACTS_URL', envFromFile, `${publicUrl.replace(/\/+$/, '')}/.well-known/agent.json`);

  validateHttps(publicUrl, options.allowHttp, 'PUBLIC_URL');
  validateHttps(factsUrl, options.allowHttp, 'facts URL');

  const capabilities = await resolveCapabilities(
    factsUrl,
    options.capabilities || getValue('NANDA_AGENT_CAPABILITIES', envFromFile, ''),
    options.verbose,
  );
  const tags = parseCsv(options.tags || getValue('NANDA_AGENT_TAGS', envFromFile, 'nanoclaw'));

  const registerEndpoint = `${registryBase}/register`;
  const statusEndpoints = [
    `${registryBase}/agents/${encodeURIComponent(agentId)}/status`,
    `${registryBase}/update/${encodeURIComponent(agentId)}`,
  ];

  const registerPayload: Json = {
    agent_id: agentId,
    agent_url: publicUrl,
    api_url: publicUrl,
    agent_facts_url: factsUrl,
  };

  const maybeName = options.name || getValue('NANDA_AGENT_NAME', envFromFile, '');
  const maybeDescription =
    options.description || getValue('NANDA_AGENT_DESCRIPTION', envFromFile, '');
  if (maybeName) registerPayload.name = maybeName;
  if (maybeDescription) registerPayload.description = maybeDescription;

  const statusPayload: Json = {
    alive: true,
    capabilities,
    tags,
  };

  console.log('NANDA registration plan');
  console.log(`- Registry: ${registryBase}`);
  console.log(`- Agent ID: ${agentId}`);
  console.log(`- Public URL: ${publicUrl}`);
  console.log(`- Facts URL: ${factsUrl}`);
  console.log(`- Capabilities: ${capabilities.join(', ')}`);
  console.log(`- Tags: ${tags.join(', ')}`);

  if (options.verbose || options.dryRun) {
    console.log('\nPOST payload:');
    console.log(JSON.stringify(registerPayload, null, 2));
    console.log('\nPUT payload:');
    console.log(JSON.stringify(statusPayload, null, 2));
    console.log('\nPUT endpoint candidates:');
    for (const endpoint of statusEndpoints) {
      console.log(`- ${endpoint}`);
    }
  }

  if (options.dryRun) {
    console.log('\nDry run complete. No requests were sent.');
    return;
  }

  await fetchJson(registerEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registerPayload),
  });
  console.log('POST /register succeeded');

  const statusEndpoint = await putStatusWithFallback(
    agentId,
    registryBase,
    statusPayload,
  );
  console.log(`PUT status succeeded via ${statusEndpoint}`);

  const lookup = await fetchJson(
    `${registryBase}/lookup/${encodeURIComponent(agentId)}`,
  );
  console.log('\nLookup result:');
  console.log(JSON.stringify(lookup, null, 2));
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`NANDA registration failed: ${message}`);
  process.exitCode = 1;
});
