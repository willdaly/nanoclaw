/**
 * Stdio MCP Server for NanoClaw
 * Standalone process that agent teams subagents can inherit.
 * Reads context from environment variables, writes IPC files for the host.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';
import { searchCakeCatalog, CAKE_CATALOG } from './cake-data.js';

const IPC_DIR = '/workspace/ipc';
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

// Context from environment variables (set by the agent runner)
const chatJid = process.env.NANOCLAW_CHAT_JID!;
const groupFolder = process.env.NANOCLAW_GROUP_FOLDER!;
const isMain = process.env.NANOCLAW_IS_MAIN === '1';

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

const server = new McpServer({
  name: 'nanoclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times.",
  {
    text: z.string().describe('The message text to send'),
    sender: z.string().optional().describe('Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.'),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'message',
      chatJid,
      text: args.text,
      sender: args.sender || undefined,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools. Returns the task ID for future reference. To modify an existing task, use update_task instead.

CONTEXT MODE - Choose based on task type:
\u2022 "group": Task runs in the group's conversation context, with access to chat history. Use for tasks that need context about ongoing discussions, user preferences, or recent interactions.
\u2022 "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

If unsure which mode to use, you can ask the user. Examples:
- "Remind me about our discussion" \u2192 group (needs conversation context)
- "Check the weather every morning" \u2192 isolated (self-contained task)
- "Follow up on my request" \u2192 group (needs to know what was requested)
- "Generate a daily report" \u2192 isolated (just needs instructions in prompt)

MESSAGING BEHAVIOR - The task agent's output is sent to the user or group. It can also use send_message for immediate delivery, or wrap output in <internal> tags to suppress it. Include guidance in the prompt about whether the agent should:
\u2022 Always send a message (e.g., reminders, daily briefings)
\u2022 Only send a message when there's something to report (e.g., "notify me if...")
\u2022 Never send a message (background maintenance tasks)

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
\u2022 cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
\u2022 interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
\u2022 once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
  {
    prompt: z.string().describe('What the agent should do when the task runs. For isolated mode, include all necessary context here.'),
    schedule_type: z.enum(['cron', 'interval', 'once']).describe('cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time'),
    schedule_value: z.string().describe('cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)'),
    context_mode: z.enum(['group', 'isolated']).default('group').describe('group=runs with chat history and memory, isolated=fresh session (include context in prompt)'),
    target_group_jid: z.string().optional().describe('(Main group only) JID of the group to schedule the task for. Defaults to the current group.'),
  },
  async (args) => {
    // Validate schedule_value before writing IPC
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}". Must be positive milliseconds (e.g., "300000" for 5 min).` }],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'once') {
      if (/[Zz]$/.test(args.schedule_value) || /[+-]\d{2}:\d{2}$/.test(args.schedule_value)) {
        return {
          content: [{ type: 'text' as const, text: `Timestamp must be local time without timezone suffix. Got "${args.schedule_value}" — use format like "2026-02-01T15:30:00".` }],
          isError: true,
        };
      }
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [{ type: 'text' as const, text: `Invalid timestamp: "${args.schedule_value}". Use local time format like "2026-02-01T15:30:00".` }],
          isError: true,
        };
      }
    }

    // Non-main groups can only schedule for themselves
    const targetJid = isMain && args.target_group_jid ? args.target_group_jid : chatJid;

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const data = {
      type: 'schedule_task',
      taskId,
      prompt: args.prompt,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode || 'group',
      targetJid,
      createdBy: groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Task ${taskId} scheduled: ${args.schedule_type} - ${args.schedule_value}` }],
    };
  },
);

server.tool(
  'list_tasks',
  "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
  {},
  async () => {
    const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

    try {
      if (!fs.existsSync(tasksFile)) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));

      const tasks = isMain
        ? allTasks
        : allTasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);

      if (tasks.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No scheduled tasks found.' }] };
      }

      const formatted = tasks
        .map(
          (t: { id: string; prompt: string; schedule_type: string; schedule_value: string; status: string; next_run: string }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
        )
        .join('\n');

      return { content: [{ type: 'text' as const, text: `Scheduled tasks:\n${formatted}` }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}` }],
      };
    }
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task. It will not run until resumed.',
  { task_id: z.string().describe('The task ID to pause') },
  async (args) => {
    const data = {
      type: 'pause_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} pause requested.` }] };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string().describe('The task ID to resume') },
  async (args) => {
    const data = {
      type: 'resume_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} resume requested.` }] };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string().describe('The task ID to cancel') },
  async (args) => {
    const data = {
      type: 'cancel_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} cancellation requested.` }] };
  },
);

server.tool(
  'update_task',
  'Update an existing scheduled task. Only provided fields are changed; omitted fields stay the same.',
  {
    task_id: z.string().describe('The task ID to update'),
    prompt: z.string().optional().describe('New prompt for the task'),
    schedule_type: z.enum(['cron', 'interval', 'once']).optional().describe('New schedule type'),
    schedule_value: z.string().optional().describe('New schedule value (see schedule_task for format)'),
  },
  async (args) => {
    // Validate schedule_value if provided
    if (args.schedule_type === 'cron' || (!args.schedule_type && args.schedule_value)) {
      if (args.schedule_value) {
        try {
          CronExpressionParser.parse(args.schedule_value);
        } catch {
          return {
            content: [{ type: 'text' as const, text: `Invalid cron: "${args.schedule_value}".` }],
            isError: true,
          };
        }
      }
    }
    if (args.schedule_type === 'interval' && args.schedule_value) {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [{ type: 'text' as const, text: `Invalid interval: "${args.schedule_value}".` }],
          isError: true,
        };
      }
    }

    const data: Record<string, string | undefined> = {
      type: 'update_task',
      taskId: args.task_id,
      groupFolder,
      isMain: String(isMain),
      timestamp: new Date().toISOString(),
    };
    if (args.prompt !== undefined) data.prompt = args.prompt;
    if (args.schedule_type !== undefined) data.schedule_type = args.schedule_type;
    if (args.schedule_value !== undefined) data.schedule_value = args.schedule_value;

    writeIpcFile(TASKS_DIR, data);

    return { content: [{ type: 'text' as const, text: `Task ${args.task_id} update requested.` }] };
  },
);

server.tool(
  'register_group',
  `Register a new chat/group so the agent can respond to messages there. Main group only.

Use available_groups.json to find the JID for a group. The folder name must be channel-prefixed: "{channel}_{group-name}" (e.g., "whatsapp_family-chat", "telegram_dev-team", "discord_general"). Use lowercase with hyphens for the group name part.`,
  {
    jid: z.string().describe('The chat JID (e.g., "120363336345536173@g.us", "tg:-1001234567890", "dc:1234567890123456")'),
    name: z.string().describe('Display name for the group'),
    folder: z.string().describe('Channel-prefixed folder name (e.g., "whatsapp_family-chat", "telegram_dev-team")'),
    trigger: z.string().describe('Trigger word (e.g., "@Andy")'),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [{ type: 'text' as const, text: 'Only the main group can register new groups.' }],
        isError: true,
      };
    }

    const data = {
      type: 'register_group',
      jid: args.jid,
      name: args.name,
      folder: args.folder,
      trigger: args.trigger,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [{ type: 'text' as const, text: `Group "${args.name}" registered. It will start receiving messages immediately.` }],
    };
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// CAKE ORDERING SWARM — Agent Tools
// Three specialist agents exposed as MCP tools to the Nanoclaw agent SDK.
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
// 1. SOMMELIER AGENT — Vector DB / RAG tool
//    Searches the cake catalog via cosine-similarity on keyword term vectors.
// ───────────────────────────────────────────────────────────────────────────

server.tool(
  'sommelier_search_cakes',
  `[Sommelier Agent] Search the cake menu using natural language. Returns the top 3 most relevant cakes with full details including price, allergens, and available sizes.

Examples: "vegan chocolate", "nut-free birthday cake", "gluten-free option for celiac guests", "light summery fruit cake".

Use this tool whenever a customer asks about the menu, specific dietary needs, or wants a recommendation.`,
  {
    query: z.string().describe('Natural language search query, e.g. "dairy-free celebration cake" or "something chocolatey and vegan"'),
    top_k: z.number().int().min(1).max(6).default(3).describe('Number of results to return (default: 3)'),
  },
  async (args) => {
    const results = searchCakeCatalog(args.query, args.top_k ?? 3);

    if (results.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            agent: 'Sommelier',
            query: args.query,
            results: [],
            message: 'No cakes matched that query. Try broader terms like "chocolate", "vegan", or "gluten-free".',
          }, null, 2),
        }],
      };
    }

    const formatted = results.map(r => ({
      id: r.cake.id,
      name: r.cake.name,
      description: r.cake.description,
      price: `$${r.cake.price.toFixed(2)}`,
      allergens: r.cake.allergens.length > 0 ? r.cake.allergens : ['none'],
      dietaryNotes: [
        r.cake.tags.includes('vegan') ? 'Vegan' : null,
        r.cake.tags.includes('gluten-free') ? 'Gluten-Free' : null,
        r.cake.tags.includes('dairy-free') ? 'Dairy-Free' : null,
        r.cake.tags.includes('allergen-free') ? 'Allergen-Free' : null,
      ].filter(Boolean),
      availableSizes: r.cake.availableSizes,
      servings: r.cake.servings,
      relevanceScore: Math.round(r.score * 100) / 100,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          agent: 'Sommelier',
          query: args.query,
          resultsFound: results.length,
          recommendations: formatted,
        }, null, 2),
      }],
    };
  },
);

server.tool(
  'sommelier_list_all_cakes',
  '[Sommelier Agent] List the complete cake catalog with all items, prices, and allergen information. Use when the customer wants to browse everything available.',
  {},
  async () => {
    const catalog = CAKE_CATALOG.map(cake => ({
      id: cake.id,
      name: cake.name,
      price: `$${cake.price.toFixed(2)}`,
      allergens: cake.allergens.length > 0 ? cake.allergens : ['none'],
      dietaryNotes: [
        cake.tags.includes('vegan') ? 'Vegan' : null,
        cake.tags.includes('gluten-free') ? 'Gluten-Free' : null,
        cake.tags.includes('dairy-free') ? 'Dairy-Free' : null,
        cake.tags.includes('allergen-free') ? 'Allergen-Free' : null,
      ].filter(Boolean),
      availableSizes: cake.availableSizes,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ agent: 'Sommelier', totalItems: catalog.length, catalog }, null, 2),
      }],
    };
  },
);

// ───────────────────────────────────────────────────────────────────────────
// 2. LOGISTICIAN AGENT — MCP Booking & Execution tool
//    Checks delivery availability and places orders, returning mock receipts.
// ───────────────────────────────────────────────────────────────────────────

// Slots stored in 24h for reliable comparison; displayed in 12h AM/PM to the customer.
const DELIVERY_SLOTS: Record<string, string[]> = {
  monday:    ['10:00', '12:00', '14:00', '16:00'],
  tuesday:   ['10:00', '12:00', '14:00', '16:00'],
  wednesday: ['10:00', '12:00', '14:00', '16:00'],
  thursday:  ['10:00', '12:00', '14:00', '16:00'],
  friday:    ['10:00', '12:00', '14:00'],
  saturday:  ['10:00', '12:00'],
  sunday:    [],
};

function to12h(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${mStr} ${period}`;
}

/** Normalise user-supplied time to 24h HH:MM for slot comparison.
 *  Accepts "2:00 PM", "2 PM", "14:00", "14" etc. */
function normalise24h(raw: string): string {
  const cleaned = raw.trim().toUpperCase();
  const pmMatch = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*PM$/);
  const amMatch = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*AM$/);
  if (pmMatch) {
    const h = (parseInt(pmMatch[1], 10) % 12) + 12;
    return `${String(h).padStart(2, '0')}:${pmMatch[2] ?? '00'}`;
  }
  if (amMatch) {
    const h = parseInt(amMatch[1], 10) % 12;
    return `${String(h).padStart(2, '0')}:${amMatch[2] ?? '00'}`;
  }
  // Already 24h or plain number
  if (/^\d{1,2}$/.test(cleaned)) return `${cleaned.padStart(2, '0')}:00`;
  return cleaned.slice(0, 5); // pass through as-is
}

server.tool(
  'logistician_check_delivery',
  `[Logistician Agent] Check delivery availability for a given date, time, and ZIP code. Call this before placing an order to confirm the slot is available.

Returns available slots for the requested date, or the nearest available options if the requested slot is taken.`,
  {
    postcode: z.string().describe('US ZIP code for delivery (e.g. "02139")'),
    requested_date: z.string().describe('Requested delivery date in ISO format YYYY-MM-DD'),
    requested_time: z.string().describe('Requested delivery time — accepts 12-hour (e.g. "2:00 PM") or 24-hour (e.g. "14:00") format'),
  },
  async (args) => {
    const date = new Date(args.requested_date);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() as keyof typeof DELIVERY_SLOTS;
    const slots = DELIVERY_SLOTS[dayName] ?? [];

    // Simulate zone check: ZIP codes outside the continental US are out of range
    const zip = args.postcode.trim().replace(/\D/g, '').slice(0, 5);
    const zipNum = parseInt(zip, 10);
    const outOfZone =
      (zipNum >= 99500 && zipNum <= 99999) || // Alaska
      (zipNum >= 96700 && zipNum <= 96899) || // Hawaii
      (zipNum >= 600   && zipNum <= 988)   || // US territories (PR, GU, VI: 006xx–009xx)
      (zipNum >= 9000  && zipNum <= 9899);    // APO/FPO

    if (outOfZone) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            agent: 'Logistician',
            available: false,
            reason: `ZIP code ${args.postcode} is outside our delivery zone. We deliver within the continental United States only. Please arrange pickup instead.`,
            pickupAddress: '18 Brattle Street, Cambridge, MA 02138',
            pickupHours: 'Tue–Sun 8:00 AM–6:00 PM',
          }, null, 2),
        }],
      };
    }

    if (slots.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            agent: 'Logistician',
            available: false,
            reason: `We do not offer deliveries on ${dayName.charAt(0).toUpperCase() + dayName.slice(1)}s.`,
            nextAvailableDay: 'Monday',
            availableSlots: DELIVERY_SLOTS['monday'].map(to12h),
          }, null, 2),
        }],
      };
    }

    const requested24h = normalise24h(args.requested_time);
    const slotAvailable = slots.includes(requested24h);

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          agent: 'Logistician',
          requestedDate: args.requested_date,
          requestedTime: to12h(requested24h),
          dayOfWeek: dayName,
          zipCode: args.postcode,
          available: slotAvailable,
          allSlotsForDay: slots.map(to12h),
          message: slotAvailable
            ? `Great news! The ${to12h(requested24h)} slot on ${args.requested_date} is available for delivery to ${args.postcode}.`
            : `The ${to12h(requested24h)} slot is unavailable. Please choose from: ${slots.map(to12h).join(', ')}.`,
          deliveryFee: '$12.00',
          cutoffTime: '48 hours before delivery',
        }, null, 2),
      }],
    };
  },
);

server.tool(
  'logistician_place_order',
  `[Logistician Agent] Place a cake order and receive a booking confirmation receipt. Only call this after confirming delivery availability with logistician_check_delivery.

Returns a unique order ID, itemised receipt, and estimated delivery window.`,
  {
    cake_id: z.string().describe('The cake ID from the sommelier search results (e.g. "vegan-choc-001")'),
    size: z.string().describe('Cake size (e.g. "8-inch")'),
    customer_name: z.string().describe('Full name of the customer'),
    customer_phone: z.string().describe('Customer phone number'),
    delivery_postcode: z.string().describe('Delivery ZIP code'),
    delivery_date: z.string().describe('Confirmed delivery date YYYY-MM-DD'),
    delivery_time: z.string().describe('Confirmed delivery time HH:MM'),
    special_instructions: z.string().optional().describe('Personalization, dietary notes, or delivery instructions'),
  },
  async (args) => {
    const cake = CAKE_CATALOG.find(c => c.id === args.cake_id);

    if (!cake) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            agent: 'Logistician',
            success: false,
            error: `Unknown cake ID "${args.cake_id}". Please use sommelier_search_cakes to find valid cake IDs.`,
          }, null, 2),
        }],
        isError: true,
      };
    }

    if (!cake.availableSizes.includes(args.size)) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            agent: 'Logistician',
            success: false,
            error: `Size "${args.size}" not available for ${cake.name}. Available sizes: ${cake.availableSizes.join(', ')}.`,
          }, null, 2),
        }],
        isError: true,
      };
    }

    const orderId = `COW-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const deliveryFee = 12.00;
    const subtotal = cake.price;
    const total = subtotal + deliveryFee;

    const receipt = {
      agent: 'Logistician',
      success: true,
      orderId,
      status: 'CONFIRMED',
      placedAt: new Date().toISOString(),
      customer: {
        name: args.customer_name,
        phone: args.customer_phone,
      },
      items: [
        {
          description: `${cake.name} (${args.size})`,
          servings: cake.servings[args.size] || 'N/A',
          price: `$${subtotal.toFixed(2)}`,
        },
      ],
      delivery: {
        zipCode: args.delivery_postcode,
        date: args.delivery_date,
        timeSlot: args.delivery_time,
        fee: `$${deliveryFee.toFixed(2)}`,
      },
      pricing: {
        subtotal: `$${subtotal.toFixed(2)}`,
        deliveryFee: `$${deliveryFee.toFixed(2)}`,
        total: `$${total.toFixed(2)}`,
      },
      specialInstructions: args.special_instructions || 'None',
      paymentStatus: 'PENDING — pay on delivery',
      cancellationPolicy: 'Free cancellation up to 48 hours before delivery.',
      confirmationNote: `Your order ${orderId} is confirmed! We will contact ${args.customer_phone} with a 30-minute delivery window on the day.`,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(receipt, null, 2) }],
    };
  },
);

// ───────────────────────────────────────────────────────────────────────────
// 3. DIPLOMAT AGENT — NANDA Registry tool
//    Generates an A2A-compatible Agent Fact Card and simulates registration
//    to the NANDA Index and Registry.
// ───────────────────────────────────────────────────────────────────────────

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3000';

const SWARM_AGENT_CARD = {
  name: 'Cake Ordering Swarm',
  description:
    'A Society of Agents for the NANDA Sandbox that handles end-to-end cake ordering. Composed of four specialist agents: Front-of-House (customer orchestration), Sommelier (menu RAG), Logistician (booking & delivery), and Diplomat (registry metadata).',
  url: PUBLIC_URL,
  version: '1.0.0',
  provider: {
    organization: 'University Project — NANDA Sandbox',
    contact: 'nanda-sandbox@example.ac.uk',
  },
  capabilities: {
    streaming: false,
    pushNotifications: false,
    stateTransitionHistory: true,
    multiAgentCollaboration: true,
    vectorSearch: true,
    mcpTools: true,
  },
  skills: [
    {
      id: 'cake-menu-rag',
      name: 'Menu RAG Search',
      description:
        'Natural-language search over a cake catalog using cosine-similarity vector retrieval (Sommelier Agent). Surfaces matching items with allergen info, pricing, and serving sizes.',
      inputModes: ['text'],
      outputModes: ['text', 'application/json'],
    },
    {
      id: 'delivery-check',
      name: 'Delivery Availability Check',
      description:
        'Checks delivery slot availability for a given ZIP code, date, and time (Logistician Agent). Returns available windows and delivery fees.',
      inputModes: ['text'],
      outputModes: ['application/json'],
    },
    {
      id: 'cake-order-placement',
      name: 'Order Placement & Receipt',
      description:
        'Places a confirmed cake order and returns a structured booking receipt with order ID (Logistician Agent).',
      inputModes: ['text'],
      outputModes: ['application/json'],
    },
    {
      id: 'nanda-registration',
      name: 'NANDA Registry Registration',
      description:
        'Generates and submits an Agent Fact Card to the NANDA Index (Diplomat Agent). Follows the A2A AgentCard specification.',
      inputModes: ['application/json'],
      outputModes: ['application/json'],
    },
  ],
  agents: [
    {
      name: 'Front-of-House',
      role: 'Orchestrator',
      description: 'Customer-facing agent that understands requests and delegates to specialist sub-agents via A2A.',
    },
    {
      name: 'Sommelier',
      role: 'Menu Expert (RAG)',
      description: 'Retrieves relevant cake options from a vector-indexed catalog using cosine-similarity search.',
    },
    {
      name: 'Logistician',
      role: 'Booking & Execution (MCP)',
      description: 'Handles delivery availability checks and order placement via simulated MCP tool calls.',
    },
    {
      name: 'Diplomat',
      role: 'Registry & Metadata',
      description: 'Generates AgentCard metadata and registers the swarm with the NANDA Index.',
    },
  ],
};

server.tool(
  'diplomat_generate_agent_fact_card',
  `[Diplomat Agent] Generate the Agent Fact Card for the Cake Ordering Swarm. Returns a structured JSON document that describes all agents in the society, their capabilities, and their skills — formatted for submission to the NANDA Index and Registry.

Call this when asked to "describe the swarm", "show agent metadata", or "prepare NANDA registration".`,
  {},
  async () => {
    const factCard = {
      ...SWARM_AGENT_CARD,
      generatedAt: new Date().toISOString(),
      schemaVersion: 'a2a/agent-card/v1',
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(factCard, null, 2) }],
    };
  },
);

// Primary NANDA registry: MBTA Winter 2026 team's public registry (same class, live endpoint)
// Fallback: official NANDA index (requires JWT — set NANDA_JWT env var)
const MBTA_REGISTRY = 'http://97.107.132.213:6900/register';
const NANDA_INDEX = process.env.NANDA_REGISTRY_URL || MBTA_REGISTRY;

server.tool(
  'diplomat_register_to_nanda',
  `[Diplomat Agent] Register the Cake Ordering Swarm with the NANDA Index and Registry. Posts the Agent Fact Card to the live NANDA registry endpoint and returns the real registration response.

Primary registry: MBTA Winter 2026 public NANDA registry (same class project, open endpoint).
Set NANDA_REGISTRY_URL env var to override with a different registry.`,
  {
    override_url: z.string().optional().describe('Optional: override the NANDA registry endpoint URL'),
    notes: z.string().optional().describe('Optional notes to include in the registration payload'),
  },
  async (args) => {
    const registryEndpoint = args.override_url || NANDA_INDEX;

    const factCard = {
      ...SWARM_AGENT_CARD,
      generatedAt: new Date().toISOString(),
      schemaVersion: 'a2a/agent-card/v1',
      registrationNotes: args.notes,
    };

    // Build the registration payload matching the MBTA registry schema
    const payload = {
      agent_id: 'cake-ordering-swarm',
      name: factCard.name,
      description: factCard.description,
      capabilities: factCard.skills.map((s: { id: string }) => s.id),
      agent_url: PUBLIC_URL,
      facts_url: `${PUBLIC_URL}/.well-known/agent.json`,
      status: 'alive',
      protocol: 'a2a',
      version: factCard.version,
    };

    let registrationResult: Record<string, unknown>;
    try {
      const response = await fetch(registryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.text();
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { parsed = body; }
      registrationResult = {
        status: response.status,
        statusText: response.statusText,
        body: parsed,
      };
    } catch (err) {
      registrationResult = {
        status: 0,
        statusText: 'Network error',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const result = {
      agent: 'Diplomat',
      action: 'NANDA Registry Registration',
      request: {
        method: 'POST',
        endpoint: registryEndpoint,
        payload,
      },
      response: registrationResult,
      factsUrl: `${PUBLIC_URL}/.well-known/agent.json`,
      submittedFactCard: factCard,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
