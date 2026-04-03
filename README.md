# Cake Ordering Swarm — NANDA Sandbox Submission

## AAI6600 Applied Artificial Intelligence | Northeastern University | Spring 2026

A Society of Agents that handles end-to-end cake ordering through natural-language conversation. Built for the [NANDA Sandbox](https://nanda.media.mit.edu/) and registered with the [NANDA Index](https://index.projectnanda.org/) and [Registry](https://nanda-registry.com/).

- **Live deployment:** [http://172.105.158.89:3000](http://172.105.158.89:3000)
- **Agent Fact Card:** [http://172.105.158.89:3000/.well-known/agent.json](http://172.105.158.89:3000/.well-known/agent.json)
- **Registry entry:** [https://list39.org/@cake_ordering_swarm_v1.json](https://list39.org/@cake_ordering_swarm_v1.json)

---

## Society of Agents

| Agent | Role | Technologies |
| ----- | ---- | ------------ |
| **Front-of-House** | Customer orchestrator — receives messages, delegates to specialists, synthesizes responses | LLM (Claude), A2A delegation, MCP |
| **Sommelier** | Menu intelligence — natural-language search over the cake catalog | RAG, TF-IDF cosine similarity, MCP |
| **Logistician** | Fulfillment — delivery slot checks and order placement | MCP tool execution, business logic |
| **Diplomat** | Registry ambassador — generates AgentCards and handles NANDA registration | A2A protocol, JSON-LD, NANDA API |

All agents run in isolated Linux containers via the Claude Agent SDK. Inter-agent communication uses the Model Context Protocol (MCP): the Front-of-House calls specialist agents as MCP tools, keeping each agent's responsibilities clearly separated.

---

## Architecture

```
Browser / WhatsApp / Telegram
        │
        ▼
  Host Process (Node.js)
  src/index.ts — message loop, SQLite, channel registry
        │
        ▼
  Agent Container (Claude Agent SDK)
  container/agent-runner/src/ipc-mcp-stdio.ts — MCP server
        │
        ├── sommelier_search_cakes      ← TF-IDF cosine RAG over cake catalog
        ├── sommelier_list_all_cakes
        ├── logistician_check_delivery  ← delivery slot + zone logic
        ├── logistician_place_order     ← order receipt generation
        ├── diplomat_generate_agent_fact_card  ← AgentCard JSON-LD
        └── diplomat_register_to_nanda         ← NANDA registry POST/PUT
```

Per-agent personas and memory are defined in `groups/<agent-name>/CLAUDE.md`. The web channel (`src/channels/web.ts`) serves the Agent Fact Card at `/.well-known/agent.json` and provides a browser demo UI via WebSocket.

---

## Key Files

| File | Purpose |
| ---- | ------- |
| `src/index.ts` | Orchestrator: message loop, agent dispatch |
| `src/channels/web.ts` | Web channel + `/.well-known/agent.json` endpoint |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | All 6 MCP tools (Sommelier, Logistician, Diplomat) |
| `container/agent-runner/src/cake-data.ts` | Cake catalog + in-process RAG engine |
| `scripts/register-with-nanda.ts` | NANDA registration script |
| `groups/cake-front-of-house/CLAUDE.md` | Front-of-House agent persona |
| `groups/cake-sommelier/CLAUDE.md` | Sommelier agent persona |
| `groups/cake-logistician/CLAUDE.md` | Logistician agent persona |
| `groups/cake-diplomat/CLAUDE.md` | Diplomat agent persona |
| `docs/AAI6600-NANDA-Research-Report.pdf` | APA report |

---

## Running the Demo

### Prerequisites

- Node.js 20+
- Docker (or Apple Container on macOS Apple Silicon)

### Install and start

```bash
npm install
npm run build
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in a browser. The web demo UI connects via WebSocket to the Front-of-House agent.

### Example interactions

```
"I need a vegan birthday cake for about 20 people"
"Do you have anything gluten-free and nut-free?"
"Can you deliver to 02139 on Friday afternoon?"
"Place the order for Jane Smith, phone 617-555-0100"
```

The Front-of-House will delegate to the Sommelier for menu search, the Logistician for delivery and order placement, and can invoke the Diplomat to describe the swarm's NANDA registration.

---

## Reproducing the NANDA Registration

The Agent Fact Card is served dynamically at `/.well-known/agent.json` on any running deployment.

To re-register with the NANDA Registry:

```bash
# Preview payloads without sending (dry run)
npm run register:nanda -- --dry-run --allow-http

# Live registration
npm run register:nanda -- --allow-http
```

Required environment variables (add to `.env`):

```bash
PUBLIC_URL=http://172.105.158.89:3000
NANDA_REGISTRY_URL=http://registry.chat39.com:6900
NANDA_AGENT_ID=cake-ordering-swarm-v1
NANDA_AGENT_HANDLE=@willdaly/cake-ordering-swarm
NANDA_AGENT_NAME=Cake Ordering Swarm
NANDA_AGENT_DESCRIPTION=A Society of Agents for the NANDA Sandbox that handles end-to-end cake ordering.
NANDA_AGENT_CAPABILITIES=urn:nanda:cap:rag-search,urn:nanda:cap:order-placement,urn:nanda:cap:a2a-orchestration,urn:nanda:cap:nanda-registration
NANDA_AGENT_TAGS=cake,rag,a2a,mcp,society-of-agents,nanda-sandbox
ALLOW_INSECURE_PUBLIC_URL=true
```

A CI workflow (`.github/workflows/nanda-registration-dry-run.yml`) runs the dry-run automatically on every pull request.

---

## RAG Implementation

The Sommelier's vector search is implemented in `container/agent-runner/src/cake-data.ts` with no external dependencies:

1. At startup, each of the 12 catalog items is tokenized (lowercased, stopwords removed) and encoded as a TF-IDF-style term frequency vector over a shared vocabulary.
2. At query time, the natural-language query is encoded with the same pipeline.
3. Cosine similarity is computed between the query vector and all document vectors.
4. The top-3 results by score (score > 0) are returned with full details.

---

## Requirements

- Node.js 20+
- Docker or Apple Container (macOS)
- Anthropic API key (set `ANTHROPIC_API_KEY` in `.env`)

---

## License

MIT
