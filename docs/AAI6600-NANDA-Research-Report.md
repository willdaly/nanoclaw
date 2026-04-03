---
title: "Creating and Registering AI Agents in the NANDA Sandbox: A Society of Agents for Automated Cake Ordering"
author: "Will Daly"
course: "AAI6600 Applied Artificial Intelligence"
institution: "Northeastern University"
date: "April 2026"
---

# Creating and Registering AI Agents in the NANDA Sandbox: A Society of Agents for Automated Cake Ordering

Will Daly

AAI6600 Applied Artificial Intelligence

Northeastern University

April 2026

---

## Abstract

This paper describes the design, implementation, and registration of the Cake Ordering Swarm, a Society of Agents built for the NANDA (Networked Agents for Networked Data and Actions) Sandbox. The system consists of four specialized AI agents—Front-of-House, Sommelier, Logistician, and Diplomat—that collaborate to handle end-to-end cake ordering through natural-language conversation. The architecture demonstrates the integration of Model Context Protocol (MCP), Agent-to-Agent (A2A) delegation, retrieval-augmented generation (RAG) via cosine-similarity vector search, and large language model (LLM) inference through the Anthropic Claude API. The system was deployed on a public Linux server and successfully registered with the NANDA Index and Registry, producing a discoverable Agent Fact Card at a well-known endpoint. Results confirm that a multi-agent system built on open infrastructure protocols can coordinate complex, multi-step tasks while maintaining individual agent specialization and inter-agent composability.

*Keywords:* NANDA, multi-agent systems, Model Context Protocol, agent-to-agent protocol, retrieval-augmented generation, Society of Agents

---

## Introduction

The emergence of autonomous AI agents capable of executing multi-step tasks has created pressure on existing internet infrastructure. The protocols that underpin the modern web—DNS, HTTP, HTML—were designed to serve human users navigating static or semi-static content. They were not designed for agents that need to discover peer agents, negotiate capabilities, delegate subtasks, and compose results asynchronously. Project NANDA (Networked Agents for Networked Data and Actions), an R&D initiative originating at MIT Media Lab, addresses this gap by building foundational infrastructure for what it calls the Open Agentic Web: a new layer of the internet designed for autonomous, multi-agent AI systems (NANDA Project, 2024).

This paper documents the design and implementation of a Society of Agents submitted to the NANDA Sandbox. A Society of Agents is a structured collective where each member agent has a distinct specialization, and coordination emerges through well-defined inter-agent communication rather than a single monolithic model. The problem domain chosen for this project is automated cake ordering: a deceptively rich domain that requires natural-language understanding, dietary knowledge, inventory search, logistics reasoning, and order fulfillment—each a distinct cognitive task well-suited to a dedicated agent.

The project has four objectives: (1) design a Society of Agents using current agent framework technology; (2) implement agents with complementary capabilities spanning RAG, MCP tooling, A2A orchestration, and registry interaction; (3) deploy the system on publicly accessible infrastructure; and (4) register the agent society in the NANDA Index and Registry using standardized Agent Fact Card metadata.

---

## Background and Related Work

### The NANDA Ecosystem

The NANDA project provides three primary components for the Open Agentic Web: an Index, a Registry, and a specification for Agent Fact Cards. The Registry (hosted at registry.chat39.com) stores agent metadata and provides discovery endpoints. The Index (index.projectnanda.org) aggregates registered agents for search and browsing. Agent Fact Cards are JSON-LD documents that describe an agent's identity, capabilities, endpoint, and protocol support, served at the standardized path `/.well-known/agent.json` on the agent's public URL (NANDA Project, 2024).

This infrastructure mirrors the role DNS plays for human-web discovery: it provides a shared namespace and resolution mechanism so that agents can find one another without prior coordination. The NANDA specification draws on earlier work in service-oriented architecture and semantic web research, particularly the work on linked data and machine-readable service descriptions (Berners-Lee et al., 2001), adapted for the agentic context.

### Agent Frameworks

Several frameworks exist for building AI agent systems. LangChain (Chase, 2022) provides a Python-native toolkit for chaining LLM calls, managing memory, and integrating tools. AutoGen (Wu et al., 2023) from Microsoft Research introduced conversational multi-agent patterns where agents exchange messages to coordinate work. CrewAI (Moura, 2023) adds role-based agent definitions and crew-level task management. OpenAI's Agents SDK and Anthropic's Claude Agent SDK represent first-party frameworks that tightly integrate tool use with their respective LLMs.

For this project, the Anthropic Claude Agent SDK was selected. The SDK provides native support for tool use (MCP-compatible function calling), streaming responses, and container-isolated agent execution. Each agent in the society runs inside a Linux container with an isolated filesystem, preventing unintended cross-agent state sharing while still allowing deliberate communication through defined tool interfaces.

### Model Context Protocol

The Model Context Protocol (MCP) is an open standard for defining the interface between an LLM and its available tools (Anthropic, 2024). An MCP server exposes a set of named tools with JSON Schema-defined parameters; the LLM decides when to call each tool and how to interpret the results. MCP provides a language-agnostic, transport-agnostic contract that allows agents to expose capabilities that other agents—or humans via LLM frontends—can invoke. This makes MCP a natural substrate for A2A communication in a heterogeneous multi-agent environment.

### Retrieval-Augmented Generation

Retrieval-Augmented Generation (RAG) augments LLM generation with retrieved context from an external knowledge source (Lewis et al., 2020). In a typical RAG pipeline, a user query is encoded as a vector, the encoding is compared against a pre-indexed corpus of document vectors, and the top-k most similar documents are injected into the LLM's context window before generation. This allows the model to answer questions grounded in domain-specific knowledge without retraining. For this project, a lightweight in-process RAG implementation was built using TF-IDF term vectors and cosine similarity, eliminating the need for an external vector database while demonstrating the core retrieval mechanics.

---

## System Design

### Society Architecture

The Cake Ordering Swarm is composed of four specialized agents, each with a distinct role and a distinct MCP tool interface:

**Front-of-House** is the customer-facing orchestrator. It receives incoming messages, maintains conversational context, and delegates specialized subtasks to peer agents via MCP tool calls. It embodies the A2A orchestration pattern: rather than performing retrieval or logistics reasoning itself, it invokes the appropriate specialist and synthesizes the result into a customer-facing response. This separation of concerns keeps the Front-of-House prompt lean and its behavior predictable.

**Sommelier** is the menu intelligence agent. It specializes in retrieval-augmented generation over the cake catalog. When called via the `sommelier_search_cakes` MCP tool, it executes a cosine-similarity search across a 12-item catalog and returns the top three matches with full details including price, allergens, dietary certifications, and available sizes. It also exposes `sommelier_list_all_cakes` for full catalog browsing.

**Logistician** handles all fulfillment operations. It exposes two MCP tools: `logistician_check_delivery`, which determines whether a delivery slot is available for a given ZIP code, date, and time, accounting for business rules such as 48-hour lead time and out-of-zone restrictions; and `logistician_place_order`, which generates a confirmed booking receipt with a unique order ID.

**Diplomat** manages the society's identity within the NANDA ecosystem. It exposes `diplomat_generate_agent_fact_card`, which returns the full AgentCard JSON describing the swarm's capabilities, agents, and endpoint; and `diplomat_register_to_nanda`, which simulates submitting that card to the NANDA Registry. The Diplomat is the society's ambassador: it knows the A2A protocol, understands AgentCard schema, and can explain the swarm's architecture to other agents or to human operators.

### Technology Stack

The system is implemented in TypeScript, running on Node.js 20. Agent execution is handled by the Claude Agent SDK, with each agent receiving its persona and constraints via a `CLAUDE.md` file in its group directory—a pattern that allows persistent, human-readable agent memory that can be inspected and modified without redeployment.

The MCP server (`ipc-mcp-stdio.ts`) is implemented using the `@modelcontextprotocol/sdk` package and runs inside each agent container, exposing all six specialist tools via the stdio transport. This allows the Front-of-House agent to call Sommelier, Logistician, or Diplomat tools as transparently as it calls any other MCP tool—the routing is handled by the host process, not the agent itself.

The host process (`src/index.ts`) is a single Node.js orchestrator that manages message ingestion from channels (web, WhatsApp, Telegram), maintains a SQLite database of messages and groups, and dispatches agent containers in response to incoming messages. The web channel (`src/channels/web.ts`) exposes a WebSocket interface for browser-based interaction and serves the Agent Fact Card at `/.well-known/agent.json`.

---

## Implementation

### Retrieval-Augmented Generation

The Sommelier agent's search capability is built on a pure-TypeScript RAG engine with no external dependencies. The catalog of 12 cakes is indexed at module load time: each item's description and tag array are tokenized (lowercased, punctuation-stripped, stopwords removed), and a sparse TF-IDF-style term frequency vector is built over a shared vocabulary derived from the full corpus.

At query time, the incoming natural-language query is tokenized using the same pipeline and encoded as a vocabulary-aligned vector. Cosine similarity is computed between the query vector and each pre-built document vector using the standard dot-product formula normalized by vector magnitudes. The top three results by cosine score are returned. Results with a score of zero are excluded, ensuring that semantically empty queries return no false positives.

This approach demonstrates the core mechanics of dense-retrieval RAG without the operational complexity of an external vector database. The vocabulary is roughly 200 terms across 12 documents, making the vectors sparse but sufficient for the domain. The design choice to pre-build document vectors at module load time means search latency is essentially a dot-product over 200-dimensional integer vectors: sub-millisecond even at scale within this catalog size.

### Agent-to-Agent Delegation

A2A delegation in this system follows the orchestrator–worker pattern. The Front-of-House agent's `CLAUDE.md` defines explicit delegation rules: when a customer asks about the menu, invoke `sommelier_search_cakes`; when a customer asks about delivery, invoke `logistician_check_delivery`; when a customer is ready to order, invoke `logistician_place_order`. This keeps the Front-of-House's decision-making declarative and auditable.

Crucially, the specialist agents are not LLM agents themselves—they are MCP tools backed by deterministic TypeScript logic. The Sommelier's search is a vector operation; the Logistician's delivery check is a rule lookup against a schedule data structure. Only the Front-of-House makes LLM calls for natural-language understanding and response generation. This design keeps inference costs low and specialist behavior predictable, while still allowing the system to handle the full range of conversational variation that customers present.

The Diplomat agent breaks this pattern: it is a full LLM agent that understands the NANDA protocol and can explain the swarm's architecture. It is designed to be invoked when a peer agent (rather than a customer) initiates discovery, or when an operator asks about registration status.

### NANDA Registration

The Agent Fact Card is constructed dynamically by the `buildAgentFacts()` function in `src/channels/web.ts`. The card conforms to the NANDA AgentFacts v1.2 JSON-LD schema and includes the agent's identifier, handle, description, version, public endpoint URL, capability URNs, skills inventory, member agent list, and authentication requirements (none, for the sandbox environment).

Registration is performed by the `scripts/register-with-nanda.ts` script, which issues two requests to the NANDA Registry: a `POST /register` request with the agent's identity and endpoint metadata, and a `PUT /update/<agent_id>` request to report the agent's live status, capabilities, and tags. The script validates the public URL, supports a `--dry-run` mode for previewing payloads, and a CI workflow in `.github/workflows/nanda-registration-dry-run.yml` runs the dry-run automatically on every pull request that touches registration-relevant files.

The live registration for this submission was executed on April 3, 2026, targeting the NANDA Registry at `registry.chat39.com:6900`. The registry returned a confirmation record with the assigned agent facts URL: `https://list39.org/@cake_ordering_swarm_v1.json`. The agent is accessible at `http://172.105.158.89:3000`, with the Agent Fact Card served at `http://172.105.158.89:3000/.well-known/agent.json`.

---

## Results

### Deployment

The system was deployed on a Linux VPS (Linode) running Node.js 20. The nanoclaw service is managed as a systemd user unit, enabling automatic restart on failure and start on boot. The web channel is exposed on port 3000 and provides both a browser-accessible WebSocket demo interface and the NANDA-standard `/.well-known/agent.json` endpoint.

The web demo interface allows a user to interact with the Front-of-House agent in a browser without any messaging channel setup. A sample interaction proceeds as follows: the user types "I need a vegan birthday cake for about 20 people," the Front-of-House invokes `sommelier_search_cakes` with the query "vegan birthday cake 20 people," receives the top three matches (Vegan Dark Chocolate Torte, Vegan Spiced Carrot Cake, Vegan Biscoff Caramel Cake), and presents them with pricing, allergen information, and size options. The user selects a cake; the Front-of-House invokes `logistician_check_delivery` with their ZIP code and preferred date; and upon confirmation, calls `logistician_place_order` to produce a receipt with a unique order ID.

### NANDA Registration Outcome

The registration completed successfully. The POST to `/register` was acknowledged, and the subsequent PUT to `/update/cake-ordering-swarm-v1` reported the agent as alive with its full capability set. The registry lookup response confirmed:

```json
{
  "agent_id": "cake-ordering-swarm-v1",
  "agent_url": "http://172.105.158.89:3000",
  "agentFactsURL": "https://list39.org/@cake_ordering_swarm_v1.json",
  "updated_at": "2026-04-03T08:27:44.544000"
}
```

This confirms that the Cake Ordering Swarm is discoverable by any NANDA-aware agent or tooling that queries the registry for agents with capabilities `urn:nanda:cap:rag-search`, `urn:nanda:cap:order-placement`, `urn:nanda:cap:a2a-orchestration`, or `urn:nanda:cap:nanda-registration`.

---

## Discussion

### Contributions

This project makes three practical contributions. First, it demonstrates that a Society of Agents can be built using a single lightweight runtime (Node.js with the Claude Agent SDK) without a dedicated orchestration framework. The orchestration logic resides in the Front-of-House agent's `CLAUDE.md` instructions, making it human-readable and modifiable without code changes.

Second, the in-process RAG engine demonstrates that meaningful retrieval capability can be implemented without an external vector database. For domains with bounded catalogs (a bakery, a product inventory, a knowledge base of fixed articles), a TF-IDF cosine search over pre-built term vectors is computationally trivial and operationally simple. This lowers the barrier to RAG adoption in resource-constrained or prototype contexts.

Third, the NANDA registration infrastructure (the `register-with-nanda.ts` script, the `/.well-known/agent.json` endpoint, and the CI dry-run workflow) provides a reusable pattern for any agent system seeking to participate in the Open Agentic Web. The CI workflow in particular ensures that registration metadata is kept accurate as the codebase evolves.

### Limitations

Several limitations should be noted. The delivery and ordering logic is simulated rather than integrated with a real commerce backend. A production deployment would need to connect `logistician_place_order` to an actual order management system. Similarly, the cosine-similarity RAG engine is effective for a 12-item catalog but would require migration to an approximate nearest-neighbor index (such as FAISS or a hosted vector database) for catalogs of significant scale.

The system currently operates over HTTP rather than HTTPS. While the `--allow-http` flag permits registration, the NANDA specification recommends HTTPS for production deployments to ensure agent identity is verifiable. Adding TLS via a reverse proxy (nginx with Let's Encrypt) would bring the deployment to production standards.

Finally, the A2A pattern implemented here is synchronous: the Front-of-House calls a tool and waits for a result. The emerging A2A protocol specification (Google, 2025) describes asynchronous, event-driven agent communication with explicit task state management. Migrating to this model would enable more complex coordination patterns, such as the Front-of-House delegating to Sommelier and Logistician in parallel, or delegating a multi-turn negotiation to the Diplomat.

### Future Work

Three natural extensions of this work are identified. First, integrating agents from other groups' societies—as encouraged by the assignment—would test the interoperability premise of the NANDA ecosystem. The Cake Ordering Swarm's Diplomat is designed for precisely this purpose: it can generate and expose the AgentCard that peer agents would query to decide whether to delegate to this swarm. Second, the web demo interface could be evolved into a full A2A endpoint that accepts structured task requests from peer agents rather than requiring human-readable conversational input. Third, the RAG catalog could be replaced with a live embedding search against a vector database, demonstrating the full pipeline from embedding model to approximate nearest-neighbor retrieval to LLM-augmented response generation.

---

## Conclusion

This paper has described the design, implementation, and registration of the Cake Ordering Swarm, a four-agent Society of Agents built for the NANDA Sandbox. The system integrates LLM inference, MCP tooling, A2A orchestration, retrieval-augmented generation, and NANDA registry participation into a single deployable Node.js application. Each agent is specialized—Front-of-House for orchestration, Sommelier for menu intelligence, Logistician for fulfillment, Diplomat for registry interaction—and their collaboration is mediated by the Model Context Protocol, providing a typed, inspectable interface between agents.

The project demonstrates that the foundational infrastructure of the Open Agentic Web—Agent Fact Cards, registry endpoints, capability URNs—is accessible to builders working with standard web technologies. As the NANDA ecosystem matures and more agents register, the discovery and delegation patterns demonstrated here will become the building blocks of agent networks that span organizational and technological boundaries. The Cake Ordering Swarm is a small but concrete step toward that future.

---

## References

Anthropic. (2024). *Model Context Protocol specification*. https://modelcontextprotocol.io

Berners-Lee, T., Hendler, J., & Lassila, O. (2001). The semantic web. *Scientific American, 284*(5), 34–43. https://doi.org/10.1038/scientificamerican0501-34

Chase, H. (2022). *LangChain* [Software]. https://github.com/langchain-ai/langchain

Google. (2025). *Agent-to-Agent (A2A) protocol specification*. https://google.github.io/A2A

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel, S., & Kiela, D. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *Advances in Neural Information Processing Systems, 33*, 9459–9474.

Moura, J. (2023). *CrewAI: Framework for orchestrating role-playing, autonomous AI agents* [Software]. https://github.com/joaomdmoura/crewAI

NANDA Project. (2024). *Internet of AI agents: Research and publications*. MIT Media Lab. https://projnanda.github.io/projnanda

Wu, Q., Bansal, G., Zhang, J., Wu, Y., Zhang, S., Zhu, E., Li, B., Jiang, L., Zhang, X., & Wang, C. (2023). AutoGen: Enabling next-gen LLM applications via multi-agent conversation framework. *arXiv preprint arXiv:2308.08155*. https://arxiv.org/abs/2308.08155
