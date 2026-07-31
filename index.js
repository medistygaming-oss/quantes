// ===================== VAZGUÇXN • PREMIUM BOT SYSTEM =====================
// discord.js v14 | Slash Komutlar & Modüler Yapı
// Kapsam: Guard • Setup • Ticket • Aktiflik • Ban Affı • Farm/Ot • DM Duyuru
//         FiveM Ingame & ID Sorgu • Kullanıcı Analiz • Ses Topla • Veritabanı Sıfırla
// ===========================================================================

process.on("unhandledRejection", (r) => console.error("UNHANDLED_REJECTION:", r));
process.on("uncaughtException", (e) => console.error("UNCAUGHT_EXCEPTION:", e));

const fs = require("fs");
const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");
const { joinVoiceChannel } = require("@discordjs/voice");

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ChannelType,
  ActivityType,
  SlashCommandBuilder,
  Events,
  REST,
  Routes
} = require("discord.js");

// ===================== FETCH fallback =====================
let _fetch = global.fetch;
if (!_fetch) {
  try {
    _fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
  } catch (e) {
    console.error("❌ fetch yok!");
    process.exit(1);
  }
}

// ===================== ENV =====================
const TOKEN = (process.env.DISCORD_TOKEN || "").trim();
const CLIENT_ID = (process.env.CLIENT_ID || "").trim();
const GUILD_ID = (process.env.GUILD_ID || "").trim();

if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN eksik!");
  process.exit(1);
}

// ===================== Render Keep-Alive =====================
const app = express();
app.get("/", (req, res) => res.status(200).send("OK"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log("🌐 Web aktif:", PORT));

// ===================== MARKA / AYARLAR =====================
const OWNER_IDS = (process.env.OWNER_IDS || "827905938923978823,1129811807570247761")
  .split(",").map((x) => x.trim()).filter(Boolean);
const isOwner = (id) => OWNER_IDS.includes(id);

const ENV_STAFF_IDS = (process.env.STAFF_IDS || "").split(",").map((x) => x.trim()).filter(Boolean);
let staffIds, staffRoles;

function isStaff(target) {
  if (!target) return false;

  let userId = null;
  let member = null;

  if (typeof target === "string") {
    userId = target;
  } else if (target.user) {
    userId = target.user.id;
    member = target.member || (target.roles ? target : null);
  } else if (target.id) {
    userId = target.id;
    if (target.roles) member = target;
  }

  if (userId) {
    if (isOwner(userId)) return true;
    if (staffIds && staffIds.has(userId)) return true;
    if (staffRoles && staffRoles.has(userId)) return true;
  }

  if (member && member.roles && member.roles.cache && staffRoles) {
    for (const roleId of staffRoles) {
      if (member.roles.cache.has(roleId)) return true;
    }
  }

  return false;
}

const GUARD_MASTER_ID = "827905938923978823";
const isGuardCommandUser = (id) => id === GUARD_MASTER_ID;

const DEFAULT_IMAGE_URL = "https://media.discordapp.net/attachments/1525920078720143551/1531761971769380914/ChatGPT_Image_28_Tem_2026_23_33_51.png";
const BOT_IMAGE_URL = String(process.env.BOT_IMAGE_URL || "").replace(/[\r\n]+/g, "").trim() || DEFAULT_IMAGE_URL;
const TICKET_BANNER_URL = String(process.env.TICKET_BANNER_URL || "").replace(/[\r\n]+/g, "").trim() || BOT_IMAGE_URL;
const PANEL_AUTHOR = String(process.env.PANEL_AUTHOR || "Chapo Assistant").replace(/[\r\n]+/g, " ").trim();
const FOOTER_TEXT = String(process.env.FOOTER_TEXT || "Vazexa Bot's").replace(/[\r\n]+/g, " ").trim();
const CFX_CODE = String(process.env.CFX_CODE || "8emv3b3").replace(/[\r\n]+/g, "").trim();

const NAVY = 0x0b1a3a;

// ===================== YENİ ÖZEL EMOJİ SETİ =====================
const EMOJI = {
  baglan: "<a:baglan:1532447358229680240>",
  basarili: "<a:basarili:1532447454979428382>",
  data: "<:data:1532447448423862383>",
  basarisiz: "<a:basarisiz:1532447452093878292>",
  discord: "<:discord:1532447462323916942>",
  dm: "<:dm:1532447476194218136>",
  fivem: "<:fivem:1532447469718470817>",
  kalem: "<:kalem:1532447446385557647>",
  kanal: "<:kanal:1532447471425290441>",
  linkk: "<:linkk:1532447473849864442>",
  mikrofon: "<:mikrofon:1532447467948478566>",
  moryildiz: "<a:moryildiz:1532447460453126355>",
  ot: "<:ot:1532447478006153317>",
  sagok: "<a:sagok:1532447458276147420>",
  sebep: "<:sebep:1532447482808635593>",
  steam: "<a:steam:1532447465641611456>"
};

// ===================== SMALL CAPS & FORMAT HELPERS =====================
function toSmallCaps(text) {
  if (!text) return "";
  const map = {
    'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ғ','g':'ɢ','h':'ʜ','i':'ɪ','ı':'ı',
    'j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','ö':'ö','p':'ᴘ','q':'q','r':'ʀ',
    's':'s','ş':'ş','t':'ᴛ','u':'ᴜ','ü':'ü','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ',
    'A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','İ':'ɪ̇',
    'J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','Ö':'ö','P':'ᴘ','Q':'q','R':'ʀ',
    'S':'s','Ş':'ş','T':'ᴛ','U':'ᴜ','Ü':'ü','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ'
  };
  return String(text).split('').map(c => map[c] || c).join('');
}

const line = (emoji, text) => `${emoji} · ${toSmallCaps(text)}`;

// ===================== MONGODB & DATA STORAGE =====================
const MONGODB_URI = (process.env.MONGODB_URI || process.env.MONGODB_URL || "").trim();
const MONGODB_DB = (process.env.MONGODB_DB || "vazguxn_bot").trim();

let mongoCol = null;
let mongoReady = false;

async function initMongo() {
  if (!MONGODB_URI) {
    console.log("ℹ️ MONGODB_URI tanımlı değil, yerel JSON kullanılacak.");
    return;
  }
  try {
    const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    mongoCol = client.db(MONGODB_DB).collection("kv_store");
    mongoReady = true;
    console.log("✅ MongoDB bağlantısı OK.");
  } catch (e) {
    console.error("❌ MongoDB bağlantı hatası:", e.message);
  }
}

async function pullFromMongo(key, localFile) {
  if (!mongoReady) return;
  try {
    const doc = await mongoCol.findOne({ _id: key });
    if (doc && doc.value !== undefined) {
      fs.writeFileSync(localFile, JSON.stringify(doc.value, null, 2));
    }
  } catch (e) {
    console.error(`Mongo pull hata (${key}):`, e.message);
  }
}

async function pushToMongo(key, value) {
  if (!mongoReady) return;
  try {
    await mongoCol.updateOne({ _id: key }, { $set: { value, updatedAt: new Date() } }, { upsert: true });
  } catch (e) {
    console.error(`Mongo push hata (${key}):`, e.message);
  }
}

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function saveJSON(file, data, mongoKey) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch {}
  pushToMongo(mongoKey || path.basename(file), data).catch(() => {});
}

const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const GUARD_FILE = path.join(DATA_DIR, "guard.json");
const WHITELIST_FILE = path.join(DATA_DIR, "whitelist.json");
const STAFF_FILE = path.join(DATA_DIR, "staff.json");
const STAFF_ROLES_FILE = path.join(DATA_DIR, "staff_roles.json");
const BANS_FILE = path.join(DATA_DIR, "bans.json");
const FARM_FILE = path.join(DATA_DIR, "farm.json");
const EVENTS_FILE = path.join(DATA_DIR, "events.json");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity.json");

let config, guardConfig, whitelist, bansData, farmData, eventsData, activityStore;

// ===================== CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

const ticketOwners = new Map();
const guardCounters = new Map();
const aktiflikList = new Map();
const ingameList = new Map();
const pendingOtDeliveries = new Map();
let aktiflikLogChannelId = null;

// ===================== HELPERS & EMBED SYSTEM =====================
function baseEmbed(guild) {
  const authorIcon = guild?.iconURL?.({ size: 128 }) || undefined;
  return new EmbedBuilder()
    .setColor(NAVY)
    .setThumbnail(BOT_IMAGE_URL || null)
    .setAuthor({ name: PANEL_AUTHOR, iconURL: authorIcon })
    .setFooter({ text: FOOTER_TEXT, iconURL: authorIcon })
    .setTimestamp();
}
function createEmbed(guild, { title, description, fields, image }) {
  const e = baseEmbed(guild);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (fields?.length) e.addFields(fields);
  if (image) e.setImage(image);
  return e;
}
async function replyE(interaction, embed, ephemeral = false) {
  const payload = { embeds: [embed] };
  if (ephemeral) payload.flags = 64;
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload).catch(() => {});
  return interaction.reply(payload).catch(() => {});
}
async function sendLog(guild, embed) {
  const ch = guild.channels.cache.get(config.logs?.guardLog || config.logChannelId);
  if (ch) ch.send({ embeds: [embed] }).catch(() => {});
}

function noPerm(interaction) {
  return replyE(interaction, createEmbed(interaction.guild, {
    title: line(EMOJI.basarisiz, "yeᴛkɪ yok"),
    description: line(EMOJI.sebep, "bu komuᴛu kullanma yeᴛkɪn yok.")
  }), true);
}

// ===================== FiveM Cache (TAM İLK İNDEX İLE BİREBİR) =====================
let lastPlayersFetchAt = 0;
let cachedPlayersJson = null;

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await _fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function cleanFiveMName(name = "") {
  return String(name).replace(/\^\d/g, "").toLowerCase();
}

async function getServerPlayersCached() {
  const now = Date.now();
  if (cachedPlayersJson && now - lastPlayersFetchAt < 30000) return cachedPlayersJson;

  const url = `https://frontend.cfx-services.net/api/servers/single/${CFX_CODE}`;
  const res = await fetchWithTimeout(url, {}, 6000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  cachedPlayersJson = json;
  lastPlayersFetchAt = now;
  return json;
}

async function getPlayerFromCFX(playerId) {
  const json = await getServerPlayersCached();
  const players = json?.Data?.players || [];
  const p = players.find((x) => String(x.id) === String(playerId));
  if (!p) return { found: false };

  const ids = Array.isArray(p.identifiers) ? p.identifiers : [];
  return {
    found: true,
    id: p.id,
    name: p.name,
    ping: p.ping,
    steam: ids.find((i) => i.startsWith("steam:")) || "Yok",
    discord: ids.find((i) => i.startsWith("discord:"))?.replace("discord:", "") || "Yok"
  };
}

// ===================== AKTİVİTE & İSTATİSTİK YÖNETİMİ =====================
function ensureActivity(id) {
  if (!activityStore[id]) {
    activityStore[id] = { lastMessageAt: null, lastVoiceJoinAt: null, ingameCount: 0, events: [] };
  }
  return activityStore[id];
}
function touchLastMessage(id) {
  ensureActivity(id).lastMessageAt = Date.now();
  saveJSON(ACTIVITY_FILE, activityStore, "activity.json");
}
function touchLastVoiceJoin(id) {
  ensureActivity(id).lastVoiceJoinAt = Date.now();
  saveJSON(ACTIVITY_FILE, activityStore, "activity.json");
}

function formatAgo(ms) {
  if (!ms) return "Hiç";
  const diff = Date.now() - ms;
  if (diff < 0) return "Az önce";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Az önce";
  if (min < 60) return `${min} dakika önce`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} saat önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function parseDurationToMs(text) {
  if (!text) return null;
  const t = String(text).toLowerCase().replace(",", ".");

  let totalMs = 0;
  let matched = false;

  const dayMatch = t.match(/(\d+(?:\.\d+)?)\s*(g|gün|gun|d|day)\b/);
  const hourMatch = t.match(/(\d+(?:\.\d+)?)\s*(sa|saat|h|hr|hour)\b/);
  const minMatch = t.match(/(\d+(?:\.\d+)?)\s*(dk|dak|dakika|m|min)\b/);

  if (dayMatch) { totalMs += parseFloat(dayMatch[1]) * 86400000; matched = true; }
  if (hourMatch) { totalMs += parseFloat(hourMatch[1]) * 3600000; matched = true; }
  if (minMatch) { totalMs += parseFloat(minMatch[1]) * 60000; matched = true; }

  if (matched) return totalMs;

  const onlyNum = t.match(/^(\d+(?:\.\d+)?)$/);
  if (onlyNum) return parseFloat(onlyNum[1]) * 60000;

  return null;
}

function formatRemaining(ms) {
  if (ms <= 0) return "Süre doldu";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h} saat ${m} dakika sonra`;
  if (h > 0) return `${h} saat sonra`;
  return `${m} dakika sonra`;
}

// ===================== GUARD SİSTEMİ =====================
function isGuardOwner(id) {
  return isOwner(id) || whitelist.has(id);
}
function saveGuard() { saveJSON(GUARD_FILE, guardConfig); }
function saveWhitelist() { saveJSON(WHITELIST_FILE, Array.from(whitelist)); }
function saveStaff() { saveJSON(STAFF_FILE, Array.from(staffIds)); }
function saveStaffRoles() { saveJSON(STAFF_ROLES_FILE, Array.from(staffRoles)); }
function saveConfig() { saveJSON(CONFIG_FILE, config); }

function getCounterBucket(guildId) {
  if (!guardCounters.has(guildId)) guardCounters.set(guildId, new Map());
  return guardCounters.get(guildId);
}
function ensureUserCounter(guildId, userId) {
  const bucket = getCounterBucket(guildId);
  if (!bucket.has(userId)) {
    bucket.set(userId, { ban: 0, kick: 0, channel: 0, role: 0, lastReset: Date.now() });
  }
  return bucket.get(userId);
}
function maybeResetWindow(counter) {
  const windowMs = Math.max(1, Number(guardConfig.windowMinutes || 10)) * 60 * 1000;
  if (Date.now() - counter.lastReset >= windowMs) {
    counter.ban = 0; counter.kick = 0; counter.channel = 0; counter.role = 0;
    counter.lastReset = Date.now();
  }
}
function isGuardEnabled(systemKey) {
  if (!guardConfig.enabled) return false;
  if (!guardConfig.systems?.[systemKey]) return false;
  return true;
}
function getLimit(key) {
  const n = Number(guardConfig.limits?.[key] ?? 0);
  return Number.isNaN(n) ? 0 : Math.max(0, Math.floor(n));
}

function guardPanelEmbed(guild) {
  const on = `${EMOJI.basarili} · **AÇIK**`;
  const off = `${EMOJI.basarisiz} · **KAPALI**`;
  const win = Math.max(1, Number(guardConfig.windowMinutes || 10));

  return createEmbed(guild, {
    title: line(EMOJI.moryildiz, "guard panel"),
    description:
      `${EMOJI.data} · **${toSmallCaps("sistem durumu")}**\n` +
      `${EMOJI.sebep} · Ban Guard: ${isGuardEnabled("ban") ? on : off}\n` +
      `${EMOJI.sebep} · Kick Guard: ${isGuardEnabled("kick") ? on : off}\n` +
      `${EMOJI.sebep} · Kanal Guard: ${isGuardEnabled("channel") ? on : off}\n` +
      `${EMOJI.sebep} · Rol Guard: ${isGuardEnabled("role") ? on : off}\n\n` +
      `${EMOJI.data} · **${toSmallCaps("limitler")} (/${win} dk)**\n` +
      `${EMOJI.sagok} · Ban Limit: **${getLimit("ban")}**\n` +
      `${EMOJI.sagok} · Kick Limit: **${getLimit("kick")}**\n` +
      `${EMOJI.sagok} · Kanal Silme Limit: **${getLimit("channel")}**\n` +
      `${EMOJI.sagok} · Rol Silme Limit: **${getLimit("role")}**\n\n` +
      `${EMOJI.moryildiz} · **Whitelist:** ${whitelist.size} kişi\n\n` +
      `${EMOJI.sagok} · Komutlar: \`/guard panel\` \`/guard limit\` \`/guard sistem\` \`/guard whitelist\``,
    image: BOT_IMAGE_URL || undefined
  });
}

async function fetchExecutor(guild, type) {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 1, type });
    return logs.entries.first() || null;
  } catch {
    return null;
  }
}
async function punishMember(guild, userId, reason) {
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;
    if (isGuardOwner(member.id)) return false;
    await member.kick(reason).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
async function guardHit(guild, executorId, key, reasonText) {
  if (!guild || !executorId) return;
  if (isGuardOwner(executorId)) return;

  const limit = getLimit(key);
  if (limit === 0) return;

  const counter = ensureUserCounter(guild.id, executorId);
  maybeResetWindow(counter);
  counter[key] = (counter[key] || 0) + 1;

  await sendLog(guild, createEmbed(guild, {
    title: line(EMOJI.basarisiz, "guard alarm"),
    description:
      `${EMOJI.data} · İşlem: **${key.toUpperCase()}**\n` +
      `${EMOJI.sagok} · Yapan: <@${executorId}>\n` +
      `${EMOJI.data} · Sayaç: **${counter[key]}/${limit}**\n` +
      `${EMOJI.sebep} · Sebep: **${reasonText}**`,
    image: BOT_IMAGE_URL || undefined
  }));

  if (counter[key] >= limit) {
    const punished = await punishMember(guild, executorId, `GUARD: ${reasonText} (limit aşıldı)`);
    await sendLog(guild, createEmbed(guild, {
      title: line(EMOJI.basarisiz, "guard mudahale"),
      description:
        `${EMOJI.basarili} · Limit aşıldı, işlem uygulandı.\n` +
        `${EMOJI.sagok} · Yapan: <@${executorId}>\n` +
        `${EMOJI.data} · Sistem: **${key.toUpperCase()}**\n` +
        `${EMOJI.sebep} · Sonuç: **${punished ? "Kick uygulandı" : "Üye bulunamadı / yetki yok"}**`,
      image: BOT_IMAGE_URL || undefined
    }));
  }
}

client.on("guildBanAdd", async (ban) => {
  try {
    const guild = ban.guild;
    if (!isGuardEnabled("ban")) return;
    const entry = await fetchExecutor(guild, 22);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(ban.user.id)) return;
    await guardHit(guild, entry.executor.id, "ban", `Üye banlandı: ${ban.user.tag}`);
  } catch {}
});
client.on("guildMemberRemove", async (member) => {
  try {
    const guild = member.guild;
    if (!isGuardEnabled("kick")) return;
    const entry = await fetchExecutor(guild, 20);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(member.id)) return;
    await guardHit(guild, entry.executor.id, "kick", `Üye kicklendi: ${member.user.tag}`);
  } catch {}
});
client.on("channelDelete", async (channel) => {
  try {
    const guild = channel.guild;
    if (!guild || !isGuardEnabled("channel")) return;
    const entry = await fetchExecutor(guild, 12);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(channel.id)) return;
    await guardHit(guild, entry.executor.id, "channel", `Kanal silindi: #${channel.name}`);
  } catch {}
});
client.on("roleDelete", async (role) => {
  try {
    const guild = role.guild;
    if (!guild || !isGuardEnabled("role")) return;
    const entry = await fetchExecutor(guild, 32);
    if (!entry?.executor?.id) return;
    if (entry.target?.id && String(entry.target.id) !== String(role.id)) return;
    await guardHit(guild, entry.executor.id, "role", `Rol silindi: ${role.name}`);
  } catch {}
});

// ===================== EVENT LISTENERS FOR LOGS & ACTIVITY =====================
client.on("messageCreate", (message) => {
  if (!message.guild || message.author.bot) return;
  touchLastMessage(message.author.id);
});

client.on("voiceStateUpdate", (oldState, newState) => {
  try {
    const member = newState.member;
    if (!member || member.user.bot) return;
    if (!oldState.channelId && newState.channelId) {
      touchLastVoiceJoin(member.id);
    }
  } catch {}
});

// ===================== TICKET SİSTEMİ =====================
function isTicketOpen() {
  return (config.ticketDurum || "acik") === "acik";
}

function ticketPanelEmbed(guild) {
  const acik = isTicketOpen();
  const durumKutusu = "```\n[ DURUM: " + (acik ? "AKTİF" : "KAPALI") + " ]\n```";
  const aciklama = (config.ticketPanelMesaji || "").trim() ||
    "sᴇɴᴅᴇ ᴋᴀᴢᴀɴᴀɴʟᴀʀıɴ ᴛᴀʀᴀғıɴᴅᴀ ᴏʟᴍᴀᴋ ɪ̇sᴛı̇ʏᴏʀsᴀɴ ʙᴀşᴠᴜʀᴜ ᴏʟᴜşᴛᴜʀ ʙᴜᴛᴏɴᴜɴᴀ ᴛıᴋʟᴀ!";

  return createEmbed(guild, {
    title: config.ticketPanelBaslik || `${guild.name} | ${toSmallCaps("başvuru sistemi")}`,
    description: `${durumKutusu}\n${aciklama}`,
    image: TICKET_BANNER_URL || undefined
  });
}

function ticketPanelRow() {
  const acik = isTicketOpen();
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open")
      .setStyle(ButtonStyle.Primary)
      .setLabel(acik ? toSmallCaps("başvuru oluştur") : toSmallCaps("başvurular kapalı"))
      .setEmoji(EMOJI.kalem)
      .setDisabled(!acik)
  );
}

async function refreshTicketPanelMessage(guild) {
  if (!config.ticketPanelChannelId || !config.ticketPanelMessageId) return false;
  try {
    const ch = await guild.channels.fetch(config.ticketPanelChannelId).catch(() => null);
    if (!ch) return false;
    const msg = await ch.messages.fetch(config.ticketPanelMessageId).catch(() => null);
    if (!msg) return false;
    await msg.edit({ embeds: [ticketPanelEmbed(guild)], components: [ticketPanelRow()] });
    return true;
  } catch {
    return false;
  }
}

async function handleTicketOpen(interaction) {
  const guild = interaction.guild;
  await interaction.deferReply({ flags: 64 });

  if (!isTicketOpen()) {
    return replyE(interaction, createEmbed(guild, {
      title: line(EMOJI.basarisiz, "başvurular kapalı"),
      description: line(EMOJI.sebep, "başvurular şu an geçici olarak kapalıdır.")
    }), true);
  }

  if (!config.ticketCategoryId || !config.ticketStaffRoleId) {
    return replyE(interaction, createEmbed(guild, {
      title: line(EMOJI.basarisiz, "sistem ayarsız"),
      description: line(EMOJI.sebep, "ticket kategorisi veya yetkili rolü ayarlanmamış.")
    }), true);
  }

  const category = guild.channels.cache.get(config.ticketCategoryId);
  if (!category) {
    return replyE(interaction, createEmbed(guild, {
      title: line(EMOJI.basarisiz, "kategori hatası"),
      description: line(EMOJI.sebep, "ticket kategorisi bulunamadı.")
    }), true);
  }

  const safe = (interaction.user.username || "user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  const name = `basvuru-${safe}`;

  const existing = guild.channels.cache.find((c) => c.parentId === category.id && c.name === name);
  if (existing) {
    return replyE(interaction, createEmbed(guild, {
      title: line(EMOJI.basarisiz, "zaten açık ticket var"),
      description: line(EMOJI.sagok, `zaten açık olan bir ticketiniz bulunmaktadır: ${existing}`)
    }), true);
  }

  const ch = await guild.channels.create({
    name,
    parent: category.id,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: config.ticketStaffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });
  ticketOwners.set(ch.id, interaction.user.id);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`basvuru_kabul_${interaction.user.id}`).setLabel(toSmallCaps("kabul et")).setStyle(ButtonStyle.Success).setEmoji(EMOJI.basarili),
    new ButtonBuilder().setCustomId(`basvuru_reddet_${interaction.user.id}`).setLabel(toSmallCaps("reddet")).setStyle(ButtonStyle.Danger).setEmoji(EMOJI.basarisiz),
    new ButtonBuilder().setCustomId("ticket_close").setLabel(toSmallCaps("kapat & sil")).setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.data)
  );

  const basvuruFormu = `> **_Günde kaç saat aktif olabilirsin?:_**
> **_Kaç yaşındasın?:_**
> **_Oynadığın ekipler:_**
> **_FiveM'de kaç saatin var?:_**
> **_Gelişmiş map bilgin var mı?:_**
> **_En az 5/10 adet kill POV (zorunlu):_**
> **_Referansın var mı?:_**`;

  await ch.send({
    content: `<@${interaction.user.id}> | <@&${config.ticketStaffRoleId}>`,
    embeds: [createEmbed(guild, {
      title: `${EMOJI.moryildiz} · ${toSmallCaps("hoş geldin")}, ${interaction.user.username}`,
      description: `**${toSmallCaps("başvuru formu")}**\n\n*Alttaki formu doldurup yetkili arkadaşların cevap vermesini beklemeden lütfen formu iletiniz.*\n\n${basvuruFormu}`,
      image: TICKET_BANNER_URL || undefined
    })],
    components: [row]
  });

  return replyE(interaction, createEmbed(guild, {
    title: line(EMOJI.basarili, "ticket açıldı"),
    description: line(EMOJI.sagok, `ticket kanalınız oluşturuldu: ${ch}`)
  }), true);
}

async function handleBasvuruKarar(interaction, kabul) {
  const guild = interaction.guild;
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff(interaction) && !isAdmin) return noPerm(interaction);

  await interaction.deferReply({ flags: 64 });

  const applicantId = interaction.customId.replace(kabul ? "basvuru_kabul_" : "basvuru_reddet_", "");
  const member = await guild.members.fetch(applicantId).catch(() => null);

  if (kabul && !member) {
    return replyE(interaction, createEmbed(guild, {
      title: line(EMOJI.basarisiz, "üye bulunamadı"),
      description: line(EMOJI.sebep, "başvuru sahibi sunucudan ayrılmış.")
    }), true);
  }

  if (kabul) {
    const rolesToAdd = [];
    if (config.ekipRoleId && guild.roles.cache.has(config.ekipRoleId)) rolesToAdd.push(config.ekipRoleId);
    if (config.newRoleId && guild.roles.cache.has(config.newRoleId)) rolesToAdd.push(config.newRoleId);
    if (rolesToAdd.length) await member.roles.add(rolesToAdd).catch(() => {});
  }

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("basvuru_kabul_done").setLabel(kabul ? toSmallCaps("kabul edildi") : toSmallCaps("kabul et")).setStyle(ButtonStyle.Success).setEmoji(EMOJI.basarili).setDisabled(true),
    new ButtonBuilder().setCustomId("basvuru_reddet_done").setLabel(kabul ? toSmallCaps("reddet") : toSmallCaps("reddedildi")).setStyle(ButtonStyle.Danger).setEmoji(EMOJI.basarisiz).setDisabled(true),
    new ButtonBuilder().setCustomId("ticket_close").setLabel(toSmallCaps("kapat & sil")).setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.data)
  );
  await interaction.message.edit({ components: [disabledRow] }).catch(() => {});

  await interaction.channel.send({
    embeds: [createEmbed(guild, {
      title: kabul ? line(EMOJI.basarili, "başvuru kabul edildi") : line(EMOJI.basarisiz, "başvuru reddedildi"),
      description: kabul
        ? `${EMOJI.basarili} · ${member} adlı kullanıcının başvurusu **kabul edildi** (<@${interaction.user.id}> tarafından).`
        : `${EMOJI.basarisiz} · Başvuru **reddedildi** (<@${interaction.user.id}> tarafından).`
    })]
  }).catch(() => {});

  if (member) {
    await member.send({
      embeds: [createEmbed(guild, {
        title: kabul ? line(EMOJI.basarili, "başvurun kabul edildi") : line(EMOJI.basarisiz, "başvurun reddedildi"),
        description: kabul
          ? `${EMOJI.basarili} · Tebrikler! **${guild.name}** sunucusundaki başvurun kabul edildi.\n${EMOJI.sagok} · Ekibimize katıldığın için teşekkürler!`
          : `${EMOJI.basarisiz} · **${guild.name}** sunucusundaki başvurun reddedildi.\n${EMOJI.sagok} · İlerleyen zamanlarda tekrar başvurabilirsin.`
      })]
    }).catch(() => {});
  }

  return replyE(interaction, createEmbed(guild, {
    title: kabul ? line(EMOJI.basarili, "başvuru onaylandı") : line(EMOJI.basarisiz, "başvuru reddedildi"),
    description: line(EMOJI.sagok, kabul ? "kullanıcıya rol verildi ve dm gönderildi." : "başvuru reddedildi ve üye bilgilendirildi.")
  }), true);
}

async function handleTicketClose(interaction) {
  await interaction.deferReply({ flags: 64 });
  const opener = ticketOwners.get(interaction.channel.id);
  const admin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (interaction.user.id !== opener && !admin && !isStaff(interaction)) {
    return replyE(interaction, createEmbed(interaction.guild, {
      title: line(EMOJI.basarisiz, "yetki yok"),
      description: line(EMOJI.sebep, "bu kanalı kapatma yetkin yok.")
    }), true);
  }
  await interaction.channel.delete().catch(() => {});
  ticketOwners.delete(interaction.channel.id);
}

// ===================== SYSTEM 1: AKTİFLİK TESTİ SİSTEMİ =====================
function aktiflikRows(closed) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("aktiflik_join")
      .setLabel(toSmallCaps("aktifliğe katıl"))
      .setStyle(ButtonStyle.Success)
      .setEmoji(EMOJI.basarili)
      .setDisabled(!!closed),
    new ButtonBuilder()
      .setCustomId("aktiflik_cancel")
      .setLabel(toSmallCaps("iptal et"))
      .setStyle(ButtonStyle.Danger)
      .setEmoji(EMOJI.basarisiz)
      .setDisabled(!!closed)
  );
}

function aktiflikEmbed(guild, data) {
  const remaining = data.endsAt - Date.now();
  return createEmbed(guild, {
    title: `${EMOJI.moryildiz} · ${toSmallCaps("aktiflik testi başladı")}`,
    description:
      `<@&${data.roleId}> rolüne sahip kişilerin aktiflik testine katılımı **ZORUNLUDUR**.\n` +
      `Lütfen aşağıdaki butona tıklayarak katılım sağlayınız.\n` +
      `Katılım sağlamayan kişiler süre sonunda tespit edilerek işlem yapılacaktır.\n\n` +
      `**Bitiş Zamanı:** ${data.closed ? "Sona erdi" : formatRemaining(remaining > 0 ? remaining : 0)}\n` +
      `**Katılımcı Sayısı:** \`${data.joined.size} Kişi\``,
    image: TICKET_BANNER_URL || undefined
  });
}

async function refreshAktiflikMessage(guild, msgId) {
  const data = aktiflikList.get(msgId);
  if (!data) return;
  const channel = guild.channels.cache.get(data.channelId);
  if (!channel) return;
  const msg = await channel.messages.fetch(msgId).catch(() => null);
  if (!msg) return;
  await msg.edit({
    embeds: [aktiflikEmbed(guild, data)],
    components: [aktiflikRows(data.closed)]
  }).catch(() => {});
}

async function closeAktiflik(guild, msgId, reason) {
  const data = aktiflikList.get(msgId);
  if (!data || data.closed) return;

  data.closed = true;
  if (data.timer) {
    clearTimeout(data.timer);
    data.timer = null;
  }

  await refreshAktiflikMessage(guild, msgId);

  const role = guild.roles.cache.get(data.roleId);
  const logCh = aktiflikLogChannelId ? guild.channels.cache.get(aktiflikLogChannelId) : null;
  const announceCh = guild.channels.cache.get(data.channelId);

  let members;
  try { members = await guild.members.fetch(); } catch { members = guild.members.cache; }

  const roleMembers = role ? members.filter((m) => !m.user.bot && m.roles.cache.has(data.roleId)) : new Map();
  const notJoined = roleMembers.filter((m) => !data.joined.has(m.id));

  if (announceCh) {
    await announceCh.send({
      embeds: [createEmbed(guild, {
        title: `${EMOJI.moryildiz} · [AKTİFLİK SONUCU] <@&${data.roleId}> rolüne ait aktiflik testi sona erdi. **${notJoined.size}** kişi katılmadı.`
      })]
    }).catch(() => {});
  }

  if (!logCh) return;

  for (const [, member] of notJoined) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`aktiflik_kick_${member.id}_${data.roleId}`)
        .setLabel(toSmallCaps("ekipten at"))
        .setStyle(ButtonStyle.Danger)
        .setEmoji(EMOJI.basarisiz),
      new ButtonBuilder()
        .setCustomId(`aktiflik_stats_${member.id}`)
        .setLabel(toSmallCaps("istatistikler"))
        .setStyle(ButtonStyle.Primary)
        .setEmoji(EMOJI.data)
    );

    await logCh.send({
      embeds: [createEmbed(guild, {
        description:
          `<@${member.id}> ( \`${member.id}\` ) adlı kullanıcı **${new Date().toLocaleDateString("tr-TR")} ${new Date().toLocaleTimeString("tr-TR", {hour:'2-digit', minute:'2-digit'})}** tarihindeki aktiflik testine **katılmadı**.\n` +
          `Aşağıdaki butonları kullanarak ilgili üye hakkında işlem yapabilirsiniz.`
      })],
      components: [row]
    }).catch(() => {});
  }
}

async function handleAktiflikJoin(interaction) {
  const msgId = interaction.message.id;
  const data = aktiflikList.get(msgId);
  if (!data) return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarisiz, "test pasif"), description: line(EMOJI.sebep, "bu aktiflik testi artık aktif değil.") }), true);
  if (data.closed) return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarisiz, "test kapandı"), description: line(EMOJI.sebep, "bu test sona erdi.") }), true);
  if (data.joined.has(interaction.user.id)) return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarisiz, "zaten katıldın"), description: line(EMOJI.sagok, "bu teste katılımınız zaten mevcut.") }), true);

  data.joined.add(interaction.user.id);
  await refreshAktiflikMessage(interaction.guild, msgId);
  return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarili, "katılım sağlandı"), description: line(EMOJI.sagok, "aktiflik testine katılımınız başarıyla kaydedildi.") }), true);
}

async function handleAktiflikCancel(interaction) {
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff(interaction) && !isAdmin) return noPerm(interaction);

  await interaction.deferReply({ flags: 64 });
  const msgId = interaction.message.id;
  const data = aktiflikList.get(msgId);
  if (!data) return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarisiz, "test bulunamadı") }), true);
  if (data.closed) return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarisiz, "zaten kapalı") }), true);

  data.closed = true;
  if (data.timer) { clearTimeout(data.timer); data.timer = null; }
  await refreshAktiflikMessage(interaction.guild, msgId);
  return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarili, "test iptal edildi"), description: line(EMOJI.sagok, "aktiflik testi yetkili tarafından iptal edildi.") }), true);
}

async function handleAktiflikKick(interaction) {
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff(interaction) && !isAdmin) return noPerm(interaction);

  await interaction.deferReply({ flags: 64 });
  const parts = interaction.customId.replace("aktiflik_kick_", "").split("_");
  const targetId = parts[0];
  const roleId = parts[1];

  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!member) return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarisiz, "üye ayrılmış") }), true);

  if (roleId && interaction.guild.roles.cache.has(roleId)) {
    await member.roles.remove(roleId).catch(() => {});
  }
  return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarili, "ekipten atıldı"), description: line(EMOJI.sagok, `${member} üyesinin rolü alındı.`) }), true);
}

async function handleAktiflikStats(interaction) {
  const targetId = interaction.customId.replace("aktiflik_stats_", "");
  const member = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!member) return replyE(interaction, createEmbed(interaction.guild, { title: line(EMOJI.basarisiz, "üye bulunamadı") }), true);

  const stats = activityStore[member.id] || { lastMessageAt: null, lastVoiceJoinAt: null, ingameCount: 0 };

  const embed = createEmbed(interaction.guild, {
    title: `${toSmallCaps("kullanıcı aktiflik i̇statistiği")}`,
    description:
      `<@${member.id}> **${toSmallCaps("adlı üyenin aktiflik analizi:")}**\n\n` +
      `**${toSmallCaps("son mesaj:")}** \`${formatAgo(stats.lastMessageAt)}\`\n` +
      `**${toSmallCaps("son sese katılım:")}** \`${formatAgo(stats.lastVoiceJoinAt)}\`\n` +
      `**${toSmallCaps("toplam i̇ngame katılımı:")}** \`${stats.ingameCount} Defa\``
  }).setFooter({ text: `${interaction.user.username} tarafından istendi.`, iconURL: interaction.user.displayAvatarURL() });

  return replyE(interaction, embed, true);
}

// ===================== SYSTEM 2: BANLILAR LİSTESİ & BAN AFFI =====================
function banAffiPanelEmbed(guild) {
  return createEmbed(guild, {
    title: `${toSmallCaps("ban affı bekleyenler")}`,
    description: `Ekibimizde banlı olan kişiler için banları daha düzenli tutmak için banları artık buradan gönderiyoruz.`,
    image: TICKET_BANNER_URL || undefined
  });
}

function banAffiPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("banaffi_open")
      .setLabel(toSmallCaps("banlıyım!"))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(EMOJI.kalem)
  );
}

async function handleBanAffiSubmit(interaction) {
  const reason = interaction.fields.getTextInputValue("ban_reason");
  const user = interaction.user;

  const entry = {
    userId: user.id,
    tag: user.tag,
    username: user.username,
    reason,
    date: new Date().toLocaleDateString("tr-TR"),
    timestamp: Date.now()
  };

  bansData.unshift(entry);
  saveJSON(BANS_FILE, bansData, "bans.json");

  return replyE(interaction, createEmbed(interaction.guild, {
    title: line(EMOJI.basarili, "ban affı başvurusu alındı"),
    description: line(EMOJI.sagok, "ban detaylarınız sisteme başarıyla işlendi.")
  }), true);
}

function buildBanListEmbed(guild, page = 1) {
  const perPage = 4;
  const total = bansData.length;
  const maxPage = Math.max(1, Math.ceil(total / perPage));
  page = Math.max(1, Math.min(page, maxPage));

  const start = (page - 1) * perPage;
  const pageItems = bansData.slice(start, start + perPage);

  let desc = "";
  if (!pageItems.length) {
    desc = `${EMOJI.basarisiz} · ${toSmallCaps("kayıtlı banlı üye bulunamadı.")}`;
  } else {
    pageItems.forEach((item, idx) => {
      const globalIdx = start + idx + 1;
      desc += `**${globalIdx}. Banlı:** <@${item.userId}>\n` +
        `**Tarih:** ${item.date} (${formatAgo(item.timestamp)})\n` +
        `**Sebep:**\n\`\`\`\n${item.reason}\n\`\`\`\n\n`;
    });
  }

  const embed = createEmbed(guild, {
    title: `${toSmallCaps("detaylı ban lɪst")}`,
    description: desc
  }).setFooter({ text: `TOPLAM KAYIT: ${total}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`banlist_prev_${page}`).setEmoji("◀").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`banlist_page_${page}`).setLabel(`${page}/${maxPage}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`banlist_next_${page}`).setEmoji("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage)
  );

  return { embed, row };
}

// ===================== SYSTEM 3: FARM / OT SİSTEMİ =====================
function isOtOpen() {
  return (config.otDurum || "acik") === "acik";
}

function otPanelEmbed(guild) {
  const acik = isOtOpen();
  const durumKutusu = "```\n[ DURUM: " + (acik ? "AKTİF" : "KAPALI") + " ]\n```";

  return createEmbed(guild, {
    title: `${EMOJI.ot} · ${toSmallCaps("ot paneli")}`,
    description:
      `${durumKutusu}\n` +
      `Topladığınız otları sisteme işlemek için aşağıdaki butonu kullanınız.\n\n` +
      `*Lütfen otu teslim ettiğiniz kişinin ismini doğru giriniz.*`,
    image: TICKET_BANNER_URL || undefined
  });
}

function otPanelRow() {
  const acik = isOtOpen();
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ot_teslim_open")
      .setLabel(acik ? toSmallCaps("ot teslim et") : toSmallCaps("ot teslimi kapalı"))
      .setStyle(ButtonStyle.Success)
      .setEmoji(EMOJI.ot)
      .setDisabled(!acik)
  );
}

async function refreshOtPanelMessage(guild) {
  if (!config.otPanelChannelId || !config.otPanelMessageId) return false;
  try {
    const ch = await guild.channels.fetch(config.otPanelChannelId).catch(() => null);
    if (!ch) return false;
    const msg = await ch.messages.fetch(config.otPanelMessageId).catch(() => null);
    if (!msg) return false;
    await msg.edit({ embeds: [otPanelEmbed(guild)], components: [otPanelRow()] });
    return true;
  } catch {
    return false;
  }
}

async function handleOtTeslimSubmit(interaction) {
  if (!isOtOpen()) {
    return replyE(interaction, createEmbed(interaction.guild, {
      title: line(EMOJI.basarisiz, "ot teslimatı kapalı"),
      description: line(EMOJI.sebep, "ot teslimatları şu an kapalı durumdadır.")
    }), true);
  }

  const countStr = interaction.fields.getTextInputValue("ot_miktar");
  const targetStr = interaction.fields.getTextInputValue("ot_teslim_alan");
  const amount = parseInt(countStr.replace(/\D/g, "")) || 0;

  if (amount <= 0) {
    return replyE(interaction, createEmbed(interaction.guild, {
      title: line(EMOJI.basarisiz, "geçersiz miktar"),
      description: line(EMOJI.sebep, "lütfen geçerli bir ot miktarı giriniz.")
    }), true);
  }

  const deliveryId = `ot_${Date.now()}_${interaction.user.id}`;
  const deliveryData = {
    id: deliveryId,
    senderId: interaction.user.id,
    senderTag: interaction.user.tag,
    targetName: targetStr,
    amount,
    timestamp: Date.now(),
    status: "pending"
  };

  pendingOtDeliveries.set(deliveryId, deliveryData);

  const logCh = config.logs?.guardLog ? interaction.guild.channels.cache.get(config.logs.guardLog) : interaction.channel;

  const embed = createEmbed(interaction.guild, {
    title: `📥 · ${toSmallCaps("yeni ot teslimatı")}`,
    description:
      `**TESLİM EDEN:** <@${interaction.user.id}> (\`${interaction.user.id}\`)\n` +
      `**TESLİM ALAN:** ${targetStr}\n` +
      `**MİKTAR:** **${amount.toLocaleString("tr-TR")}**\n` +
      `**MEVCUT OT:** \`0 adet\`\n\n` +
      `*Onaylamak veya reddetmek için aşağıdaki menüyü kullanın.*`
  });

  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ot_approval_select_${deliveryId}`)
      .setPlaceholder(toSmallCaps("işlem seçiniz..."))
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel(toSmallCaps("kabul et")).setValue("kabul").setEmoji("✅"),
        new StringSelectMenuOptionBuilder().setLabel(toSmallCaps("reddet")).setValue("reddet").setEmoji("❌")
      )
  );

  await logCh.send({ embeds: [embed], components: [select] }).catch(() => {});

  return replyE(interaction, createEmbed(interaction.guild, {
    title: line(EMOJI.basarili, "teslimat talebi iletildi"),
    description: line(EMOJI.sagok, `${amount} adet ot teslimatınız yetkililere gönderildi.`)
  }), true);
}

async function handleOtApprovalSelect(interaction) {
  const choice = interaction.values[0];
  const deliveryId = interaction.customId.replace("ot_approval_select_", "");
  const delivery = pendingOtDeliveries.get(deliveryId);

  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isStaff(interaction) && !isAdmin) return noPerm(interaction);

  await interaction.deferUpdate();

  if (choice === "kabul") {
    let userRecord = farmData.find(x => x.userId === delivery.senderId);
    if (!userRecord) {
      userRecord = { userId: delivery.senderId, tag: delivery.senderTag, total: 0 };
      farmData.push(userRecord);
    }
    userRecord.total += delivery.amount;
    saveJSON(FARM_FILE, farmData, "farm.json");

    const sender = await interaction.guild.members.fetch(delivery.senderId).catch(() => null);
    if (sender) {
      sender.send({
        embeds: [createEmbed(interaction.guild, {
          title: line(EMOJI.basarili, "ot teslimatı onaylandı"),
          description: `${EMOJI.basarili} · **Tebrikler!** ${delivery.amount} adet ot teslimatınız onaylandı ve hesabınıza işlendi.`
        })]
      }).catch(() => {});
    }

    const disabledSelect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("done")
        .setPlaceholder(toSmallCaps("teslimat onaylandı"))
        .setDisabled(true)
        .addOptions(new StringSelectMenuOptionBuilder().setLabel("Onaylandı").setValue("done"))
    );
    await interaction.message.edit({ components: [disabledSelect] }).catch(() => {});
  } else {
    const sender = await interaction.guild.members.fetch(delivery.senderId).catch(() => null);
    if (sender) {
      sender.send({
        embeds: [createEmbed(interaction.guild, {
          title: line(EMOJI.basarisiz, "ot teslimatı reddedildi"),
          description: `${EMOJI.basarisiz} · Ot teslimat talebiniz yetkili tarafından reddedildi.`
        })]
      }).catch(() => {});
    }

    const disabledSelect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("done")
        .setPlaceholder(toSmallCaps("teslimat reddedildi"))
        .setDisabled(true)
        .addOptions(new StringSelectMenuOptionBuilder().setLabel("Reddedildi").setValue("done"))
    );
    await interaction.message.edit({ components: [disabledSelect] }).catch(() => {});
  }
}

function buildOtListEmbed(guild, page = 1) {
  const sorted = [...farmData].sort((a, b) => b.total - a.total);
  const perPage = 10;
  const totalCount = sorted.length;
  const maxPage = Math.max(1, Math.ceil(totalCount / perPage));
  page = Math.max(1, Math.min(page, maxPage));

  const start = (page - 1) * perPage;
  const pageItems = sorted.slice(start, start + perPage);

  let desc = "";
  if (!pageItems.length) {
    desc = `${EMOJI.basarisiz} · ${toSmallCaps("henüz kayıtlı ot teslimatı yok.")}`;
  } else {
    pageItems.forEach((item, idx) => {
      desc += `**${start + idx + 1}.** <@${item.userId}> : \`${item.total.toLocaleString("tr-TR")} adet\`\n`;
    });
  }

  const grandTotal = farmData.reduce((acc, curr) => acc + (curr.total || 0), 0);

  const embed = createEmbed(guild, {
    title: `${EMOJI.ot} · ${toSmallCaps("ot sıralaması")}`,
    description: `${desc}\n\n**GENEL TOPLAM:** \`${grandTotal.toLocaleString("tr-TR")} adet\``
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`otlist_prev_${page}`).setEmoji("◀").setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
    new ButtonBuilder().setCustomId(`otlist_page_${page}`).setLabel(`${page}/${maxPage}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`otlist_next_${page}`).setEmoji("▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= maxPage)
  );

  return { embed, row };
}

// ===================== SYSTEM 4: DM DUYURU SİSTEMİ =====================
async function handleDmDuyuru(interaction) {
  const role = interaction.options.getRole("rol");
  const text = interaction.options.getString("mesaj");

  await interaction.deferReply();

  let members;
  try { members = await interaction.guild.members.fetch(); } catch { members = interaction.guild.members.cache; }
  const roleMembers = Array.from(members.filter(m => !m.user.bot && m.roles.cache.has(role.id)).values());
  const totalCount = roleMembers.length;

  if (totalCount === 0) {
    return replyE(interaction, createEmbed(interaction.guild, {
      title: line(EMOJI.basarisiz, "üye yok"),
      description: line(EMOJI.sebep, "seçilen rolde duyuru gönderilecek üye bulunamadı.")
    }));
  }

  let successCount = 0;
  let failCount = 0;

  const getProgressBar = (percent) => {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    return `[ ${"█".repeat(filled)}${"░".repeat(empty)} ] %${percent}`;
  };

  const buildStatusEmbed = (statusStr, currentPercent) => {
    return createEmbed(interaction.guild, {
      title: `${EMOJI.dm} · ${toSmallCaps("toplu dm sistemi")}`,
      description:
        `\`\`\`\n${getProgressBar(currentPercent)}\n\`\`\`\n` +
        `**Hedef Rol:** ${role}\n` +
        `**Kişi Sayısı:** \`${totalCount}\`\n` +
        `**Durum:** ${statusStr}\n\n` +
        `**Başarılı:** \`${successCount}\`\n` +
        `**Başarısız:** \`${failCount}\` (DM Kapalı)`
    });
  };

  await interaction.editReply({ embeds: [buildStatusEmbed("İşleniyor...", 0)] });

  for (let i = 0; i < roleMembers.length; i++) {
    const member = roleMembers[i];
    const currentPercent = Math.round(((i + 1) / totalCount) * 100);

    const dmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel(toSmallCaps("sunucuya git")).setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${interaction.guild.id}`).setEmoji(EMOJI.baglan),
      new ButtonBuilder().setCustomId(`dm_delete_msg`).setLabel(toSmallCaps("mesajı sil")).setStyle(ButtonStyle.Danger).setEmoji(EMOJI.basarisiz)
    );

    try {
      await member.send({ content: text, components: [dmRow] });
      successCount++;
    } catch {
      failCount++;
    }

    if ((i + 1) % 2 === 0 || i === roleMembers.length - 1) {
      await interaction.editReply({ embeds: [buildStatusEmbed(i === roleMembers.length - 1 ? "Tamamlandı" : "İşleniyor...", currentPercent)] }).catch(() => {});
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ===================== SYSTEM 5: ETKİNLİK SORGU SİSTEMİ =====================
async function handleIgSorgu(interaction) {
  const type = interaction.options.getString("sorgu_tipi");

  await interaction.deferReply();

  const lastIngame = Array.from(ingameList.values()).pop();
  const participantIds = lastIngame ? lastIngame.users : [];

  if (type === "oyun") {
    try {
      const cfxJson = await getServerPlayersCached();
      const onlinePlayers = cfxJson?.Data?.players || [];
      const serverName = cfxJson?.Data?.hostname || "NO LOVE YES GUN #MD V18 | disc";

      const onlineList = [];
      const offlineList = [];

      for (const id of participantIds) {
        const found = onlinePlayers.find(p => Array.isArray(p.identifiers) && p.identifiers.some(i => i === `discord:${id}`));
        if (found) {
          onlineList.push(`<@${id}>`);
        } else {
          offlineList.push(`<@${id}>`);
        }
      }

      const embed = createEmbed(interaction.guild, {
        title: `🎮 · ${toSmallCaps("in-game kontrolü")}\n\n**${serverName}**`,
        description:
          `**Oyunda Olanlar (${onlineList.length})**\n` +
          (onlineList.length ? onlineList.join(", ") : "*Listeden kimse oyunda değil.*") + "\n\n" +
          `**Oyunda Olmayanlar (${offlineList.length})**\n` +
          (offlineList.length ? offlineList.join(", ") : "*Herkes oyunda!*")
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel(toSmallCaps("sunucuya hızlı bağlan")).setStyle(ButtonStyle.Link).setURL(`https://cfx.re/join/${CFX_CODE}`).setEmoji(EMOJI.baglan)
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
    } catch (e) {
      return replyE(interaction, createEmbed(interaction.guild, {
        title: line(EMOJI.basarisiz, "api hatası"),
        description: line(EMOJI.sebep, `fivem api sorgulanamadı: ${e.message}`)
      }));
    }
  } else {
    let members;
    try { members = await interaction.guild.members.fetch(); } catch { members = interaction.guild.members.cache; }

    const inVoice = [];
    const notInVoice = [];

    for (const id of participantIds) {
      const member = members.get(id);
      if (member && member.voice.channel) {
        inVoice.push({ member, channel: member.voice.channel });
      } else {
        notInVoice.push(`<@${id}>`);
      }
    }

    let voiceText = "";
    if (inVoice.length) {
      inVoice.forEach((item, idx) => {
        voiceText += `**${idx + 1}.** <@${item.member.id}> *(Kanal: ${EMOJI.kanal} ${item.channel.name})*\n`;
      });
    } else {
      voiceText = "*Seste kimse bulunamadı.*";
    }

    const embed = createEmbed(interaction.guild, {
      title: `${EMOJI.mikrofon} · ${toSmallCaps("ses durumu kontrolü")}`,
      description:
        `**Seste Olanlar (${inVoice.length})**\n${voiceText}\n` +
        `**Seste Olmayanlar (${notInVoice.length})**\n` +
        (notInVoice.length ? notInVoice.join(", ") : "*Herkes seste!*")
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("refresh_voice_check").setLabel(toSmallCaps("ses kontrol")).setStyle(ButtonStyle.Secondary).setEmoji(EMOJI.mikrofon)
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  }
}

// ===================== SYSTEM 6: KULLANICI & ROL SORGU SİSTEMİ =====================
async function handleKullaniciSorgu(interaction) {
  const option = interaction.options.getString("seçenek");
  const targetUser = interaction.options.getUser("kullanici") || interaction.user;
  const targetRole = interaction.options.getRole("rol_hedef");

  await interaction.deferReply();

  if (option === "kisi") {
    const stats = activityStore[targetUser.id] || { lastMessageAt: null, lastVoiceJoinAt: null, ingameCount: 0, events: [] };
    const lastEvent = stats.events.length ? stats.events[stats.events.length - 1] : null;

    const chartUrl = `https://quickchart.io/chart?c={type:'line',data:{labels:['24.03','25.03','26.03','27.03','28.03'],datasets:[{label:'Katılım',data:[0,1,${stats.ingameCount},1,2],borderColor:'rgb(235,54,84)',fill:false}]}}`;

    const embed = createEmbed(interaction.guild, {
      title: `${toSmallCaps("kullanıcı raporu")}: ${targetUser.username}`,
      description:
        `**GENEL BAKIŞ**\n\n` +
        `**TOPLAM KATILIM**\n\`\`\`\n[ ${stats.ingameCount} Defa ]\n\`\`\`\n` +
        `**SON ETKİNLİK**\n\`\`\`\n${lastEvent ? lastEvent.name : "Yok"}\n(${lastEvent ? lastEvent.date : "Kayıt Yok"})\n\`\`\`\n\n` +
        `📋 · **SON İŞLEM KAYITLARI**\n` +
        (lastEvent ? `**1.** ${lastEvent.name} (${lastEvent.date})` : "*Henüz işlem kaydı yok.*"),
      image: chartUrl
    }).setFooter({ text: "ingame Analiz Sistemi" });

    return interaction.editReply({ embeds: [embed] });
  } else {
    if (!targetRole) {
      return replyE(interaction, createEmbed(interaction.guild, {
        title: line(EMOJI.basarisiz, "rol seçilmedi"),
        description: line(EMOJI.sebep, "lütfen sorgulanacak hedef rolü seçiniz.")
      }));
    }

    let members;
    try { members = await interaction.guild.members.fetch(); } catch { members = interaction.guild.members.cache; }
    const roleMembers = members.filter(m => !m.user.bot && m.roles.cache.has(targetRole.id));

    const lowParticipation = [];
    roleMembers.forEach(m => {
      const stats = activityStore[m.id] || { ingameCount: 0 };
      if (stats.ingameCount < 2) {
        lowParticipation.push(`<@${m.id}> (\`${stats.ingameCount} katılım\`)`);
      }
    });

    const embed = createEmbed(interaction.guild, {
      title: `${toSmallCaps("rol katılım analizi")}: ${targetRole.name}`,
      description:
        `**Düşük / 0 Katılım Sağlayan Kişiler (${lowParticipation.length})**\n\n` +
        (lowParticipation.length ? lowParticipation.slice(0, 25).join("\n") : "*Bu roldeki herkes aktif katılım sağlamış!*")
    });

    return interaction.editReply({ embeds: [embed] });
  }
}

// ===================== SYSTEM 7: SES TOPLAMA SİSTEMİ =====================
async function handleSesTopla(interaction) {
  const option = interaction.options.getString("seçenek");
  const targetChannel = interaction.member.voice.channel;

  if (!targetChannel) {
    return replyE(interaction, createEmbed(interaction.guild, {
      title: line(EMOJI.basarisiz, "ses kanalı yok"),
      description: line(EMOJI.sebep, "önce bir ses kanalına girmelisin.")
    }), true);
  }

  await interaction.deferReply();

  let count = 0;
  const lastIngame = Array.from(ingameList.values()).pop();
  const ingameUserIds = lastIngame ? lastIngame.users : [];

  const voiceChannels = interaction.guild.channels.cache.filter(c => c.isVoiceBased() && c.id !== targetChannel.id);

  for (const [, channel] of voiceChannels) {
    for (const [, member] of channel.members) {
      if (option === "INGAME" && !ingameUserIds.includes(member.id)) continue;
      const ok = await member.voice.setChannel(targetChannel).then(() => true).catch(() => false);
      if (ok) count++;
    }
  }

  return interaction.editReply({
    embeds: [createEmbed(interaction.guild, {
      title: line(EMOJI.basarili, "ses toplandı"),
      description: `**Hedef Kanal:** ${targetChannel}\n**Taşınan Üye Sayısı:** \`${count}\``
    })]
  });
}

// ===================== SYSTEM 8: VERİTABANI SIFIRLAMA SİSTEMİ =====================
async function handleVeritabaniSifirla(interaction) {
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isOwner(interaction.user.id) && !isStaff(interaction) && !isAdmin) return noPerm(interaction);

  const select = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("veritabani_sifirla_select")
      .setPlaceholder(toSmallCaps("sıfırlamak istediğin veritabanını seç..."))
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(toSmallCaps("ingame verileri"))
          .setDescription("Oyun içi etkinlik kayıtlarını siler.")
          .setValue("ingame")
          .setEmoji(EMOJI.data),
        new StringSelectMenuOptionBuilder()
          .setLabel(toSmallCaps("ot verileri"))
          .setDescription("Ot teslimat kayıtlarını siler.")
          .setValue("ot")
          .setEmoji(EMOJI.ot),
        new StringSelectMenuOptionBuilder()
          .setLabel(toSmallCaps("ban verileri"))
          .setDescription("Ban affı başvuru kayıtlarını siler.")
          .setValue("ban")
          .setEmoji(EMOJI.sebep)
      )
  );

  return interaction.reply({
    embeds: [createEmbed(interaction.guild, {
      title: line(EMOJI.data, "veritabanı sıfırlama menüsü"),
      description: `👇 **${toSmallCaps("lütfen sıfırlamak istediğiniz veritabanı dosyasını seçiniz:")}**`
    })],
    components: [select],
    flags: 64
  });
}

async function handleVeritabaniSifirlaSelect(interaction) {
  const value = interaction.values[0];

  if (value === "ingame") {
    eventsData = [];
    saveJSON(EVENTS_FILE, eventsData, "events.json");
    return interaction.update({
      embeds: [createEmbed(interaction.guild, { title: line(EMOJI.basarili, "ingame verileri sıfırlandı"), description: line(EMOJI.sagok, "oyun içi etkinlik kayıtları başarıyla silindi.") })],
      components: []
    });
  } else if (value === "ot") {
    farmData = [];
    saveJSON(FARM_FILE, farmData, "farm.json");
    return interaction.update({
      embeds: [createEmbed(interaction.guild, { title: line(EMOJI.basarili, "ot verileri sıfırlandı"), description: line(EMOJI.sagok, "ot teslimat kayıtları başarıyla silindi.") })],
      components: []
    });
  } else if (value === "ban") {
    bansData = [];
    saveJSON(BANS_FILE, bansData, "bans.json");
    return interaction.update({
      embeds: [createEmbed(interaction.guild, { title: line(EMOJI.basarili, "ban verileri sıfırlandı"), description: line(EMOJI.sagok, "ban affı başvuru kayıtları başarıyla silindi.") })],
      components: []
    });
  }
}

// ===================== SYSTEM 9: OYUNCU KİMLİK SORGU SİSTEMİ =====================
async function handleIdSorgu(interaction) {
  const option = interaction.options.getString("seçenek");
  const value = interaction.options.getString("deger").trim();

  await interaction.deferReply().catch(() => {});

  try {
    const json = await getServerPlayersCached();
    const players = json?.Data?.players || [];

    let p = null;

    if (option === "id") {
      p = players.find((x) => String(x.id) === String(value));
    } else if (option === "steam") {
      p = players.find((x) => Array.isArray(x.identifiers) && x.identifiers.some((i) => i.toLowerCase().includes(value.toLowerCase())));
    } else if (option === "discord") {
      const cleanId = value.replace(/\D/g, "");
      p = players.find((x) => Array.isArray(x.identifiers) && x.identifiers.some((i) => i === `discord:${cleanId}`));
    }

    if (!p) {
      const anyIdentifiers = players.some((x) => Array.isArray(x.identifiers) && x.identifiers.length);
      if ((option === "steam" || option === "discord") && !anyIdentifiers) {
        return replyE(interaction, createEmbed(interaction.guild, {
          title: line(EMOJI.basarisiz, "kimlik verisi alınamadı"),
          description: line(EMOJI.sebep, "sunucudan steam/discord kimlik bilgileri şu an çekilemiyor (sunucu endpointi kapalı olabilir). ID ile aramayı deneyin.")
        }), false);
      }
      return replyE(interaction, createEmbed(interaction.guild, {
        title: line(EMOJI.basarisiz, "oyuncu bulunamadı"),
        description: line(EMOJI.sebep, `seçtiğiniz kriterle (${option}: ${value}) eşleşen oyuncu bulunamadı.`)
      }), false);
    }

    const ids = Array.isArray(p.identifiers) ? p.identifiers : [];
    const steamHex = ids.find((i) => i.startsWith("steam:")) || "Yok";
    const license = ids.find((i) => i.startsWith("license:")) || "Yok";
    const discordId = ids.find((i) => i.startsWith("discord:"))?.replace("discord:", "") || "Yok";

    return replyE(interaction, createEmbed(interaction.guild, {
      title: line(EMOJI.fivem, "fivem oyuncu sorgu"),
      fields: [
        { name: line(EMOJI.data, "İsim"), value: `\`${p.name}\`` },
        { name: line(EMOJI.kalem, "ID"), value: `\`${p.id}\``, inline: true },
        { name: line(EMOJI.sagok, "Ping"), value: `\`${p.ping}\``, inline: true },
        { name: line(EMOJI.steam, "Steam Hex"), value: `\`${steamHex}\`` },
        { name: line(EMOJI.discord, "Discord"), value: discordId !== "Yok" ? `<@${discordId}> \`(${discordId})\`` : "`Yok`" }
      ]
    }), false);
  } catch (err) {
    return replyE(interaction, createEmbed(interaction.guild, {
      title: line(EMOJI.basarisiz, "api hatası"),
      description: line(EMOJI.sebep, err?.message || "FiveM API bağlantı hatası")
    }), false);
  }
}

// ===================== AKTİF EKİPLER PARSER (ORİJİNAL KOD BİREBİR) =====================
function parseEkipFromNickname(nickname) {
  if (!nickname) return null;
  const match = nickname.match(/^(.*?)\s+x\s+.+$/i);
  if (!match) return null;
  let ekip = match[1].trim();
  ekip = ekip.replace(/^[\(\[]+/, "").replace(/[\)\]]+$/, "").trim();
  if (!ekip) return null;
  return ekip;
}

async function buildAktifEkiplerEmbed(guild) {
  let members;
  try {
    members = await guild.members.fetch();
  } catch {
    members = guild.members.cache;
  }

  const teamMap = new Map();
  let eslesenUyeSayisi = 0;

  for (const [, member] of members) {
    if (member.user.bot) continue;
    const displayName = member.displayName || member.user.username;
    const ekip = parseEkipFromNickname(displayName);
    if (!ekip) continue;

    eslesenUyeSayisi++;
    const key = ekip.toLowerCase();
    if (!teamMap.has(key)) {
      teamMap.set(key, { displayName: ekip, count: 0 });
    }
    teamMap.get(key).count++;
  }

  const sorted = Array.from(teamMap.values()).sort((a, b) => b.count - a.count);

  const list = sorted.length
    ? sorted.map((t, idx) => `**${idx + 1}.** ${EMOJI.moryildiz} · **${t.displayName}** — \`${t.count}\` kişi`).join("\n")
    : line(EMOJI.basarisiz, "Nickname formatına uyan (Ekip İsmi) x Kullanıcı hiç kimse bulunamadı.");

  return createEmbed(guild, {
    title: line(EMOJI.moryildiz, "aktif ekipler"),
    description:
      `${EMOJI.data} · Toplam Ekip Sayısı: **${sorted.length}**\n` +
      `${EMOJI.sagok} · Eşleşen Üye Sayısı: **${eslesenUyeSayisi}**\n\n` +
      list,
    image: BOT_IMAGE_URL || undefined
  });
}

// ===================== SLASH COMMAND REGISTRATION =====================
const commands = [
  new SlashCommandBuilder()
    .setName("guard")
    .setDescription(toSmallCaps("guard sistemi yönetimi"))
    .addSubcommand((s) => s.setName("panel").setDescription(toSmallCaps("guard panelini gösterir")))
    .addSubcommand((s) => s
      .setName("limit")
      .setDescription(toSmallCaps("guard limitini ayarlar"))
      .addStringOption((o) => o.setName("sistem").setDescription("Sistem seçin").setRequired(true)
        .addChoices({ name: "Ban", value: "ban" }, { name: "Kick", value: "kick" }, { name: "Kanal", value: "channel" }, { name: "Rol", value: "role" }))
      .addIntegerOption((o) => o.setName("miktar").setDescription("Yeni limit miktarı").setRequired(true).setMinValue(0)))
    .addSubcommand((s) => s
      .setName("sistem")
      .setDescription(toSmallCaps("guard sistemini açar/kapatır"))
      .addStringOption((o) => o.setName("sistem").setDescription("Sistem seçin").setRequired(true)
        .addChoices({ name: "Ban", value: "ban" }, { name: "Kick", value: "kick" }, { name: "Kanal", value: "channel" }, { name: "Rol", value: "role" }))
      .addBooleanOption((o) => o.setName("durum").setDescription("Sistem açık mı kapalı mı?").setRequired(true)))
    .addSubcommand((s) => s
      .setName("whitelist")
      .setDescription(toSmallCaps("whitelist yönetimi"))
      .addStringOption((o) => o.setName("islem").setDescription("Yapılacak işlem").setRequired(true)
        .addChoices({ name: "Ekle", value: "ekle" }, { name: "Kaldır", value: "kaldir" }, { name: "Liste", value: "liste" }))
      .addUserOption((o) => o.setName("kullanici").setDescription("Hedef kullanıcı"))),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription(toSmallCaps("log kanallarını otomatik kurar"))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

  new SlashCommandBuilder()
    .setName("logkanal")
    .setDescription(toSmallCaps("guard alarmlarının düşeceği log kanalını ayarlar"))
    .addChannelOption((o) => o.setName("kanal").setDescription("Log kanalı seçin").setRequired(true).addChannelTypes(ChannelType.GuildText)),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription(toSmallCaps("başvuru sistemi yönetimi"))
    .addSubcommand((s) => s.setName("kategori").setDescription(toSmallCaps("kategori ayarlar")).addChannelOption((o) => o.setName("kategori").setDescription("Hedef kategori").setRequired(true).addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand((s) => s.setName("panel").setDescription(toSmallCaps("başvuru panelini gönderir")).addRoleOption((o) => o.setName("yetkili_rol").setDescription("Yetkili rolü seçin").setRequired(true)))
    .addSubcommand((s) => s.setName("ekiprol").setDescription(toSmallCaps("ekip rolünü ayarlar")).addRoleOption((o) => o.setName("rol").setDescription("Verilecek ekip rolü").setRequired(true)))
    .addSubcommand((s) => s.setName("yenirol").setDescription(toSmallCaps("new rolünü ayarlar")).addRoleOption((o) => o.setName("rol").setDescription("Verilecek yeni rol").setRequired(true)))
    .addSubcommand((s) => s.setName("durum").setDescription(toSmallCaps("durumu değiştirir")).addStringOption((o) => o.setName("durum").setDescription("Başvuru durumu").setRequired(true).addChoices({ name: "Aktif", value: "acik" }, { name: "Kapalı", value: "kapali" }))),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription(toSmallCaps("bir kullanıcıyı sunucudan yasaklar"))
    .addUserOption((o) => o.setName("kullanici").setDescription("Yasaklanacak kullanıcı").setRequired(true))
    .addStringOption((o) => o.setName("sebep").setDescription("Ban sebebi")),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription(toSmallCaps("bir kullanıcıyı sunucudan atar"))
    .addUserOption((o) => o.setName("kullanici").setDescription("Atılacak kullanıcı").setRequired(true))
    .addStringOption((o) => o.setName("sebep").setDescription("Kick sebebi")),

  new SlashCommandBuilder()
    .setName("ses")
    .setDescription(toSmallCaps("ses kanalı işlemleri"))
    .addSubcommand((s) => s.setName("gir").setDescription(toSmallCaps("botu bulunduğun ses kanalına sokar"))),

  new SlashCommandBuilder()
    .setName("ses-topla")
    .setDescription(toSmallCaps("ses kanallarındaki üyeleri bulunduğun kanala toplar"))
    .addStringOption((o) => o.setName("seçenek").setDescription("Kimi çekmek istiyorsun?").setRequired(true)
      .addChoices({ name: "HERKES", value: "HERKES" }, { name: "INGAME", value: "INGAME" })),

  new SlashCommandBuilder()
    .setName("nuke")
    .setDescription(toSmallCaps("kanalı temizler")),

  new SlashCommandBuilder()
    .setName("ingame")
    .setDescription(toSmallCaps("ingame kadro paneli"))
    .addSubcommand((s) => s
      .setName("olustur")
      .setDescription(toSmallCaps("yeni kadro paneli açar"))
      .addStringOption((o) => o.setName("baslik").setDescription("Panel başlığı").setRequired(true))
      .addIntegerOption((o) => o.setName("limit").setDescription("Maksimum kişi limiti").setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName("sure").setDescription("Panel geçerlilik süresi")))
    .addSubcommand((s) => s.setName("iptal").setDescription(toSmallCaps("kadro panelini iptal eder"))),

  new SlashCommandBuilder()
    .setName("yetkili")
    .setDescription(toSmallCaps("yetkili listesini yönetir"))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
    .addSubcommand((s) => s.setName("ekle").setDescription("Yetkili kullanıcı veya rol ekler")
      .addUserOption((o) => o.setName("kullanici").setDescription("Eklenecek kullanıcı"))
      .addRoleOption((o) => o.setName("rol").setDescription("Eklenecek yetkili rolü")))
    .addSubcommand((s) => s.setName("kaldir").setDescription("Yetkili kullanıcı veya rol kaldırır")
      .addUserOption((o) => o.setName("kullanici").setDescription("Kaldırılacak kullanıcı"))
      .addRoleOption((o) => o.setName("rol").setDescription("Kaldırılacak yetkili rolü")))
    .addSubcommand((s) => s.setName("liste").setDescription("Yetkili listesini gösterir")),

  new SlashCommandBuilder()
    .setName("aktiflik")
    .setDescription(toSmallCaps("aktiflik testi yönetimi"))
    .addSubcommand((s) => s.setName("baslat").setDescription(toSmallCaps("aktiflik testi başlatır")).addRoleOption((o) => o.setName("rol").setDescription("Test yapılacak rol").setRequired(true)).addStringOption((o) => o.setName("sure").setDescription("Test süresi (ör: 30dk, 2sa, 3g)").setRequired(true)))
    .addSubcommand((s) => s.setName("log").setDescription(toSmallCaps("log kanalını ayarlar")).addChannelOption((o) => o.setName("kanal").setDescription("Katılmayanlar log kanalı").setRequired(true).addChannelTypes(ChannelType.GuildText))),

  new SlashCommandBuilder()
    .setName("banaffi")
    .setDescription(toSmallCaps("ban affı sistemi yönetimi"))
    .addSubcommand((s) => s.setName("panel").setDescription(toSmallCaps("ban affı başvuru panelini gönderir")))
    .addSubcommand((s) => s.setName("sifirla").setDescription(toSmallCaps("tüm ban affı kayıtlarını sıfırlar")))
    .addSubcommand((s) => s.setName("sil").setDescription(toSmallCaps("belirli bir üyenin ban kaydını siler")).addUserOption((o) => o.setName("kullanici").setDescription("Kaydı silinecek kullanıcı").setRequired(true))),

  new SlashCommandBuilder()
    .setName("ban-list")
    .setDescription(toSmallCaps("kayıtlı detaylı banlılar listesini gösterir")),

  new SlashCommandBuilder()
    .setName("ot")
    .setDescription(toSmallCaps("farm ot paneli sistemi"))
    .addSubcommand((s) => s.setName("panel").setDescription(toSmallCaps("ot teslimat panelini gönderir")))
    .addSubcommand((s) => s.setName("durum").setDescription(toSmallCaps("ot panelinin durumunu değiştirir")).addStringOption((o) => o.setName("durum").setDescription("Durum").setRequired(true).addChoices({ name: "Aktif", value: "acik" }, { name: "Kapalı", value: "kapali" }))),

  new SlashCommandBuilder()
    .setName("durumot")
    .setDescription(toSmallCaps("ot panelinin durumunu (aktif/kapalı) değiştirir"))
    .addStringOption((o) => o.setName("durum").setDescription("Durum seçin").setRequired(true)
      .addChoices({ name: "Aktif", value: "acik" }, { name: "Kapalı", value: "kapali" })),

  new SlashCommandBuilder()
    .setName("ot-list")
    .setDescription(toSmallCaps("ot teslimat sıralamasını gösterir")),

  new SlashCommandBuilder()
    .setName("dmduyuru")
    .setDescription(toSmallCaps("belirtilen roldeki üyelere canlı duyuru gönderir"))
    .addRoleOption((o) => o.setName("rol").setDescription("Hedef rol").setRequired(true))
    .addStringOption((o) => o.setName("mesaj").setDescription("Duyuru metni").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ig-sorgu")
    .setDescription(toSmallCaps("etkinlik katılımcılarının oyun ve ses kontrolünü yapar"))
    .addStringOption((o) => o.setName("sorgu_tipi").setDescription("Hangi kontrol yapılsın?").setRequired(true)
      .addChoices({ name: "Oyun Kontrolü", value: "oyun" }, { name: "Ses Kontrolü", value: "ses" })),

  new SlashCommandBuilder()
    .setName("kullanici-sorgu")
    .setDescription(toSmallCaps("etkinlik katılım analiz sistemi"))
    .addStringOption((o) => o.setName("seçenek").setDescription("Sorgu türü").setRequired(true)
      .addChoices({ name: "kisi", value: "kisi" }, { name: "rol", value: "rol" }))
    .addUserOption((o) => o.setName("kullanici").setDescription("Kişi seçeneği için kullanıcı"))
    .addRoleOption((o) => o.setName("rol_hedef").setDescription("Rol seçeneği için hedef rol")),

  new SlashCommandBuilder()
    .setName("veritabani-sifirla")
    .setDescription(toSmallCaps("veritabanı verilerini sıfırlama menüsü")),

  new SlashCommandBuilder()
    .setName("idsorgu")
    .setDescription(toSmallCaps("sunucudaki bir oyuncuyu detaylı sorgular"))
    .addStringOption((o) => o.setName("seçenek").setDescription("Arama türü").setRequired(true)
      .addChoices({ name: "id", value: "id" }, { name: "steam", value: "steam" }, { name: "discord", value: "discord" }))
    .addStringOption((o) => o.setName("deger").setDescription("ID / Hex / Discord ID").setRequired(true)),

  new SlashCommandBuilder()
    .setName("id")
    .setDescription(toSmallCaps("fivem sunucusundaki oyuncu ID bilgisini gösterir"))
    .addIntegerOption((o) => o.setName("oyuncu_id").setDescription("FiveM oyuncu ID").setRequired(true).setMinValue(0)),

  new SlashCommandBuilder()
    .setName("tag")
    .setDescription(toSmallCaps("fivem sunucusunda tag araması yapar"))
    .addStringOption((o) => o.setName("arama").setDescription("Aranacak isim parçası").setRequired(true)),

  new SlashCommandBuilder()
    .setName("aktifekipler")
    .setDescription(toSmallCaps("aktif ekipleri listeler"))
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] }).catch(() => {});
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log("✅ Slash komutlar sunucuya kaydedildi (eski global komutlar temizlendi).");
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log("✅ Slash komutlar global kaydedildi.");
    }
  } catch (e) {
    console.error("❌ Komut kaydı başarısız:", e);
  }
}

// ===================== INTERACTION ROUTING =====================
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ---- MODAL SUBMITS ----
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "ban_affi_modal") return handleBanAffiSubmit(interaction);
      if (interaction.customId === "ot_teslim_modal") return handleOtTeslimSubmit(interaction);
      return;
    }

    // ---- SELECT MENUS ----
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "veritabani_sifirla_select") return handleVeritabaniSifirlaSelect(interaction);
      if (interaction.customId.startsWith("ot_approval_select_")) return handleOtApprovalSelect(interaction);
      return;
    }

    // ---- BUTTONS ----
    if (interaction.isButton()) {
      if (interaction.customId === "ticket_open") return handleTicketOpen(interaction);
      if (interaction.customId.startsWith("basvuru_kabul_")) return handleBasvuruKarar(interaction, true);
      if (interaction.customId.startsWith("basvuru_reddet_")) return handleBasvuruKarar(interaction, false);
      if (interaction.customId === "ticket_close") return handleTicketClose(interaction);

      if (interaction.customId === "aktiflik_join") return handleAktiflikJoin(interaction);
      if (interaction.customId === "aktiflik_cancel") return handleAktiflikCancel(interaction);
      if (interaction.customId.startsWith("aktiflik_kick_")) return handleAktiflikKick(interaction);
      if (interaction.customId.startsWith("aktiflik_stats_")) return handleAktiflikStats(interaction);

      if (interaction.customId === "banaffi_open") {
        const modal = new ModalBuilder()
          .setCustomId("ban_affi_modal")
          .setTitle(toSmallCaps("ban affı başvuru formu"));

        const reasonInput = new TextInputBuilder()
          .setCustomId("ban_reason")
          .setLabel(toSmallCaps("ban sebebinizi ve açıklamanızı girin"))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith("banlist_prev_")) {
        const page = parseInt(interaction.customId.replace("banlist_prev_", "")) - 1;
        const { embed, row } = buildBanListEmbed(interaction.guild, page);
        return interaction.update({ embeds: [embed], components: [row] });
      }
      if (interaction.customId.startsWith("banlist_next_")) {
        const page = parseInt(interaction.customId.replace("banlist_next_", "")) + 1;
        const { embed, row } = buildBanListEmbed(interaction.guild, page);
        return interaction.update({ embeds: [embed], components: [row] });
      }

      if (interaction.customId === "ot_teslim_open") {
        if (!isOtOpen()) {
          return replyE(interaction, createEmbed(interaction.guild, {
            title: line(EMOJI.basarisiz, "ot teslimatı kapalı"),
            description: line(EMOJI.sebep, "ot teslimatları şu an kapalı durumdadır.")
          }), true);
        }

        const modal = new ModalBuilder()
          .setCustomId("ot_teslim_modal")
          .setTitle(toSmallCaps("ot teslim formu"));

        const countInput = new TextInputBuilder()
          .setCustomId("ot_miktar")
          .setLabel(toSmallCaps("kaç adet ot teslim ettiniz?"))
          .setPlaceholder("Sadece sayı giriniz (Örn: 500)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const targetInput = new TextInputBuilder()
          .setCustomId("ot_teslim_alan")
          .setLabel(toSmallCaps("kime teslim ettiniz?"))
          .setPlaceholder("Kişinin adı veya ID'si")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(countInput),
          new ActionRowBuilder().addComponents(targetInput)
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith("otlist_prev_")) {
        const page = parseInt(interaction.customId.replace("otlist_prev_", "")) - 1;
        const { embed, row } = buildOtListEmbed(interaction.guild, page);
        return interaction.update({ embeds: [embed], components: [row] });
      }
      if (interaction.customId.startsWith("otlist_next_")) {
        const page = parseInt(interaction.customId.replace("otlist_next_", "")) + 1;
        const { embed, row } = buildOtListEmbed(interaction.guild, page);
        return interaction.update({ embeds: [embed], components: [row] });
      }

      if (interaction.customId === "dm_delete_msg") {
        return interaction.message.delete().catch(() => {});
      }

      return;
    }

    // ---- SLASH COMMANDS ----
    if (!interaction.isChatInputCommand()) return;
    const { commandName, guild } = interaction;
    if (!guild) return;

    if (commandName === "guard") {
      const sub = interaction.options.getSubcommand();
      if (!isGuardCommandUser(interaction.user.id)) return noPerm(interaction);

      if (sub === "panel") return replyE(interaction, guardPanelEmbed(guild));
      if (sub === "limit") {
        const s = interaction.options.getString("sistem");
        const m = interaction.options.getInteger("miktar");
        guardConfig.limits[s] = m; saveGuard();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "limit güncellendi") }), false);
      }
      if (sub === "sistem") {
        const s = interaction.options.getString("sistem");
        const d = interaction.options.getBoolean("durum");
        guardConfig.systems[s] = d; saveGuard();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "sistem güncellendi") }), false);
      }
      if (sub === "whitelist") {
        const islem = interaction.options.getString("islem");
        const user = interaction.options.getUser("kullanici");
        if (islem === "liste") {
          const list = whitelist.size ? Array.from(whitelist).map((id, i) => `**${i + 1}.** <@${id}>`).join("\n") : "Whitelist boş.";
          return replyE(interaction, createEmbed(guild, { title: line(EMOJI.moryildiz, `whitelist (${whitelist.size})`), description: list }));
        }
        if (islem === "ekle" && user) { whitelist.add(user.id); saveWhitelist(); return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "whitelist eklendi") })); }
        if (islem === "kaldir" && user) { whitelist.delete(user.id); saveWhitelist(); return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarisiz, "whitelist kaldırıldı") })); }
      }
    }

    if (commandName === "yetkili") {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!isOwner(interaction.user.id) && !isAdmin) return noPerm(interaction);

      const sub = interaction.options.getSubcommand();
      const targetUser = interaction.options.getUser("kullanici");
      const targetRole = interaction.options.getRole("rol");

      if (sub === "ekle") {
        if (!targetUser && !targetRole) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.basarisiz, "eksik parametre"),
            description: line(EMOJI.sebep, "lütfen eklenecek bir kullanıcı veya rol seçiniz.")
          }), true);
        }

        const added = [];
        if (targetUser) {
          staffIds.add(targetUser.id);
          saveStaff();
          added.push(`Kullanıcı: ${targetUser}`);
        }
        if (targetRole) {
          staffRoles.add(targetRole.id);
          saveStaffRoles();
          added.push(`Rol: ${targetRole}`);
        }

        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.basarili, "yetkili eklendi"),
          description: line(EMOJI.sagok, `başarıyla eklendi:\n${added.join("\n")}`)
        }));
      }

      if (sub === "kaldir") {
        if (!targetUser && !targetRole) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.basarisiz, "eksik parametre"),
            description: line(EMOJI.sebep, "lütfen kaldırılacak bir kullanıcı veya rol seçiniz.")
          }), true);
        }

        const removed = [];
        if (targetUser) {
          staffIds.delete(targetUser.id);
          saveStaff();
          removed.push(`Kullanıcı: ${targetUser}`);
        }
        if (targetRole) {
          staffRoles.delete(targetRole.id);
          saveStaffRoles();
          removed.push(`Rol: ${targetRole}`);
        }

        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.basarili, "yetkili kaldırıldı"),
          description: line(EMOJI.sagok, `başarıyla kaldırıldı:\n${removed.join("\n")}`)
        }));
      }

      if (sub === "liste") {
        const userList = staffIds.size
          ? Array.from(staffIds).map((id, i) => `**${i + 1}.** <@${id}>`).join("\n")
          : "Yetkili kullanıcı yok.";
        const roleList = staffRoles.size
          ? Array.from(staffRoles).map((id, i) => `**${i + 1}.** <@&${id}>`).join("\n")
          : "Yetkili rol yok.";

        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.moryildiz, "yetkili listesi"),
          fields: [
            { name: line(EMOJI.data, `Yetkili Rolleri (${staffRoles.size})`), value: roleList },
            { name: line(EMOJI.kalem, `Yetkili Kullanıcıları (${staffIds.size})`), value: userList }
          ]
        }));
      }
    }

    if (commandName === "setup") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);
      await interaction.deferReply();
      const category = await guild.channels.create({ name: "📂・ᴍᴏᴅᴇʀᴀsʏᴏɴ-ʟᴏɢs", type: ChannelType.GuildCategory });
      const logs = [
        { name: "・ban-log", key: "banLog" },
        { name: "・kick-log", key: "kickLog" },
        { name: "・rol-log", key: "roleLog" },
        { name: "・kanal-log", key: "channelLog" },
        { name: "・ticket-log", key: "ticketLog" },
        { name: "・guard-log", key: "guardLog" }
      ];
      if (!config.logs) config.logs = {};
      for (const l of logs) {
        const ch = await guild.channels.create({ name: l.name, type: ChannelType.GuildText, parent: category.id });
        config.logs[l.key] = ch.id;
      }
      config.logChannelId = config.logs.guardLog;
      saveConfig();
      return interaction.editReply({ embeds: [createEmbed(guild, { title: line(EMOJI.basarili, "setup tamamlandı") })] });
    }

    if (commandName === "logkanal") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);
      const ch = interaction.options.getChannel("kanal");
      config.logChannelId = ch.id; saveConfig();
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "log kanalı ayarlandı"), description: `Kanal: ${ch}` }));
    }

    if (commandName === "ticket") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);
      const sub = interaction.options.getSubcommand();
      if (sub === "kategori") {
        const cat = interaction.options.getChannel("kategori");
        config.ticketCategoryId = cat.id; saveConfig();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "kategori ayarlandı") }));
      }
      if (sub === "panel") {
        const staffRole = interaction.options.getRole("yetkili_rol");
        config.ticketStaffRoleId = staffRole.id; saveConfig();
        const panelMsg = await interaction.channel.send({ embeds: [ticketPanelEmbed(guild)], components: [ticketPanelRow()] }).catch(() => null);
        if (panelMsg) { config.ticketPanelChannelId = panelMsg.channel.id; config.ticketPanelMessageId = panelMsg.id; saveConfig(); }
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "panel gönderildi") }));
      }
      if (sub === "durum") {
        config.ticketDurum = interaction.options.getString("durum"); saveConfig();
        await refreshTicketPanelMessage(guild);
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "durum güncellendi"), description: line(EMOJI.sagok, `ticket paneli durumu **${config.ticketDurum === "acik" ? "AKTİF" : "KAPALI"}** olarak güncellendi.`) }));
      }
    }

    if (commandName === "durumot") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);
      const durum = interaction.options.getString("durum");
      config.otDurum = durum;
      saveConfig();
      await refreshOtPanelMessage(guild);
      return replyE(interaction, createEmbed(guild, {
        title: line(EMOJI.basarili, "ot paneli durumu güncellendi"),
        description: line(EMOJI.sagok, `ot paneli durumu **${durum === "acik" ? "AKTİF" : "KAPALI"}** olarak ayarlandı.`)
      }), true);
    }

    if (commandName === "aktiflik") {
      const sub = interaction.options.getSubcommand();
      if (sub === "baslat") {
        if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);
        const role = interaction.options.getRole("rol");
        const sureText = interaction.options.getString("sure");
        const durationMs = parseDurationToMs(sureText);
        if (!durationMs) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarisiz, "geçersiz süre") }), true);

        const data = {
          roleId: role.id,
          durationMs,
          endsAt: Date.now() + durationMs,
          joined: new Set(),
          closed: false,
          timer: null,
          channelId: interaction.channel.id,
          guildId: guild.id
        };

        const msg = await interaction.channel.send({ content: `${role}`, embeds: [aktiflikEmbed(guild, data)], components: [aktiflikRows(false)] });
        aktiflikList.set(msg.id, data);
        data.timer = setTimeout(() => closeAktiflik(guild, msg.id, "Süre doldu"), durationMs);
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "aktiflik testi başlatıldı") }));
      }
      if (sub === "log") {
        if (!isOwner(interaction.user.id)) return noPerm(interaction);
        const ch = interaction.options.getChannel("kanal");
        aktiflikLogChannelId = ch.id; config.aktiflikLogChannelId = ch.id; saveConfig();
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "aktiflik log kanalı ayarlandı") }));
      }
    }

    if (commandName === "banaffi") {
      const sub = interaction.options.getSubcommand();
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);

      if (sub === "panel") {
        await interaction.channel.send({ embeds: [banAffiPanelEmbed(guild)], components: [banAffiPanelRow()] });
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "ban affı paneli gönderildi") }), true);
      }
      if (sub === "sifirla") {
        bansData = []; saveJSON(BANS_FILE, bansData, "bans.json");
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "ban affı verileri sıfırlandı") }));
      }
      if (sub === "sil") {
        const target = interaction.options.getUser("kullanici");
        bansData = bansData.filter(x => x.userId !== target.id);
        saveJSON(BANS_FILE, bansData, "bans.json");
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "kullanıcı ban kaydı silindi") }));
      }
    }

    if (commandName === "ban-list") {
      const { embed, row } = buildBanListEmbed(guild, 1);
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === "ot") {
      const sub = interaction.options.getSubcommand();
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);

      if (sub === "panel") {
        const panelMsg = await interaction.channel.send({ embeds: [otPanelEmbed(guild)], components: [otPanelRow()] });
        if (panelMsg) {
          config.otPanelChannelId = panelMsg.channel.id;
          config.otPanelMessageId = panelMsg.id;
          saveConfig();
        }
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "ot paneli gönderildi") }), true);
      }
      if (sub === "durum") {
        const durum = interaction.options.getString("durum");
        config.otDurum = durum;
        saveConfig();
        await refreshOtPanelMessage(guild);
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "ot paneli durumu güncellendi"), description: line(EMOJI.sagok, `ot paneli durumu **${durum === "acik" ? "AKTİF" : "KAPALI"}** olarak ayarlandı.`) }), true);
      }
    }

    if (commandName === "ot-list") {
      const { embed, row } = buildOtListEmbed(guild, 1);
      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === "dmduyuru") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);
      return handleDmDuyuru(interaction);
    }

    if (commandName === "ig-sorgu") {
      return handleIgSorgu(interaction);
    }

    if (commandName === "kullanici-sorgu") {
      return handleKullaniciSorgu(interaction);
    }

    if (commandName === "ses-topla") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);
      return handleSesTopla(interaction);
    }

    if (commandName === "veritabani-sifirla") {
      return handleVeritabaniSifirla(interaction);
    }

    // ---- /id (HERKESE AÇIK) ----
    if (commandName === "id") {
      const playerId = interaction.options.getInteger("oyuncu_id");

      await interaction.deferReply().catch(() => {});

      try {
        const data = await getPlayerFromCFX(playerId);

        if (!data.found) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.basarisiz, "oyuncu bulunamadı"),
            description: line(EMOJI.sebep, "bu id ile oynayan bir oyuncu bulunamadı.")
          }), false);
        }

        const fields = [
          { name: line(EMOJI.data, "İsim"), value: `\`${data.name}\`` },
          { name: line(EMOJI.kalem, "ID"), value: `\`${data.id}\``, inline: true },
          { name: line(EMOJI.sagok, "Ping"), value: `\`${data.ping}\``, inline: true }
        ];

        if (data.steam && data.steam !== "Yok") {
          fields.push({ name: line(EMOJI.steam, "Steam"), value: `\`${data.steam}\`` });
        }
        if (data.discord && data.discord !== "Yok") {
          fields.push({ name: line(EMOJI.discord, "Discord"), value: `<@${data.discord}> \`(${data.discord})\`` });
        }

        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.fivem, "fivem oyuncu"),
          fields
        }), false);
      } catch (err) {
        console.error("ID CMD ERROR:", err);
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.basarisiz, "api hatası"),
          description: line(EMOJI.sebep, err?.message || "FiveM API bağlantı hatası")
        }), false);
      }
    }

    // ---- /tag (HERKESE AÇIK) ----
    if (commandName === "tag") {
      const search = interaction.options.getString("arama").trim();
      if (!search) {
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.data, "kullanım"),
          description: line(EMOJI.sagok, "`/tag arama:kaisen`")
        }), false);
      }

      await interaction.deferReply().catch(() => {});

      try {
        const json = await getServerPlayersCached();
        const players = json?.Data?.players || [];
        const matched = players.filter((p) => cleanFiveMName(p.name).includes(search.toLowerCase()));

        if (!matched.length) {
          return replyE(interaction, createEmbed(guild, {
            title: line(EMOJI.basarisiz, "oyuncu bulunamadı"),
            description: line(EMOJI.sebep, "aradığınız isimle eşleşen oyuncu bulunamadı.")
          }), false);
        }

        const list = matched
          .slice(0, 25)
          .map((p) => `${EMOJI.sagok} · **${p.name}** (ID: \`${p.id}\` | Ping: \`${p.ping}\`)`)
          .join("\n");

        return replyE(interaction, createEmbed(guild, {
          title: `${EMOJI.kanal} · ${toSmallCaps("tag arama")}`,
          description: `${EMOJI.basarili} · Toplam: **${matched.length} kişi**\n\n${list}`
        }), false);
      } catch (err) {
        console.error("TAG ERROR:", err);
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.basarisiz, "api hatası"),
          description: line(EMOJI.sebep, err?.message || "FiveM API bağlantı hatası")
        }), false);
      }
    }

    // ---- /idsorgu ----
    if (commandName === "idsorgu") {
      return handleIdSorgu(interaction);
    }

    // ---- /aktifekipler (HERKESE AÇIK) ----
    if (commandName === "aktifekipler") {
      await interaction.deferReply().catch(() => {});
      try {
        const embed = await buildAktifEkiplerEmbed(guild);
        return replyE(interaction, embed, false);
      } catch (err) {
        console.error("AKTIFEKIPLER ERROR:", err);
        return replyE(interaction, createEmbed(guild, {
          title: line(EMOJI.basarisiz, "hata"),
          description: line(EMOJI.sebep, "ekip listesi hesaplanırken bir hata oluştu.")
        }), false);
      }
    }

    if (commandName === "ban") {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers);
      if (!isOwner(interaction.user.id) && !isStaff(interaction) && !isAdmin) return noPerm(interaction);
      const user = interaction.options.getUser("kullanici");
      const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi";
      await guild.members.ban(user.id, { reason }).catch(() => {});
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "üye banlandı"), description: line(EMOJI.sagok, `kullanıcı ${user} yasaklandı.`) }));
    }

    if (commandName === "kick") {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers);
      if (!isOwner(interaction.user.id) && !isStaff(interaction) && !isAdmin) return noPerm(interaction);
      const user = interaction.options.getUser("kullanici");
      const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi";
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) await member.kick(reason).catch(() => {});
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "üye atıldı"), description: line(EMOJI.sagok, `kullanıcı ${user} atıldı.`) }));
    }

    if (commandName === "ses") {
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);
      const vc = interaction.member.voice.channel;
      if (!vc) return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarisiz, "ses kanalı yok") }), true);
      joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
      return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "sese girildi"), description: line(EMOJI.sagok, `kanal: ${vc}`) }));
    }

    if (commandName === "nuke") {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
      if (!isOwner(interaction.user.id) && !isStaff(interaction) && !isAdmin) return noPerm(interaction);
      const oldCh = interaction.channel;
      const pos = oldCh.position;
      const newCh = await oldCh.clone().catch(() => null);
      if (newCh) {
        await newCh.setPosition(pos).catch(() => {});
        await oldCh.delete().catch(() => {});
        await newCh.send({ embeds: [createEmbed(guild, { title: line(EMOJI.basarili, "kanal temizlendi") })] });
      }
    }

    if (commandName === "ingame") {
      const sub = interaction.options.getSubcommand();
      if (!isOwner(interaction.user.id) && !isStaff(interaction)) return noPerm(interaction);
      if (sub === "olustur") {
        const title = interaction.options.getString("baslik");
        const limit = interaction.options.getInteger("limit");
        const sureText = interaction.options.getString("sure");
        const durationMs = parseDurationToMs(sureText);
        const data = { title, limit, users: [], endsAt: durationMs ? Date.now() + durationMs : null, closed: false, channelId: interaction.channel.id, ownerId: interaction.user.id };
        const msg = await interaction.channel.send({
          embeds: [createEmbed(guild, { title: line(EMOJI.moryildiz, title), description: `\`[ MAIN KADRO: 0 / ${limit} ]\`` })],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("ingame_join").setLabel(toSmallCaps("katıl")).setStyle(ButtonStyle.Success).setEmoji(EMOJI.basarili),
            new ButtonBuilder().setCustomId("ingame_leave").setLabel(toSmallCaps("ayrıl")).setStyle(ButtonStyle.Danger).setEmoji(EMOJI.basarisiz)
          )]
        });
        ingameList.set(msg.id, data);
        return replyE(interaction, createEmbed(guild, { title: line(EMOJI.basarili, "kadro paneli oluşturuldu") }), true);
      }
    }
  } catch (e) {
    console.error("Interaction Hata:", e);
  }
});

// ===================== PRESENCE & READY =====================
function setBotPresence() {
  if (!client.user) return;
  client.user.setPresence({ activities: [{ name: "Vazexa 🤍 Chapo", type: ActivityType.Playing }], status: "dnd" });
}
client.once(Events.ClientReady, () => {
  console.log(`🟢 Bot aktif: ${client.user.tag}`);
  setBotPresence();
  setInterval(setBotPresence, 5 * 60 * 1000);
});

// ===================== BOOTSTRAP =====================
(async () => {
  await initMongo();
  await pullFromMongo("config.json", CONFIG_FILE);
  await pullFromMongo("guard.json", GUARD_FILE);
  await pullFromMongo("whitelist.json", WHITELIST_FILE);
  await pullFromMongo("staff.json", STAFF_FILE);
  await pullFromMongo("staff_roles.json", STAFF_ROLES_FILE);
  await pullFromMongo("bans.json", BANS_FILE);
  await pullFromMongo("farm.json", FARM_FILE);
  await pullFromMongo("events.json", EVENTS_FILE);
  await pullFromMongo("activity.json", ACTIVITY_FILE);

  config = loadJSON(CONFIG_FILE, { logChannelId: null, ticketCategoryId: null, ticketStaffRoleId: null, ekipRoleId: null, newRoleId: null, ticketDurum: "acik", ticketPanelChannelId: null, ticketPanelMessageId: null, otDurum: "acik", otPanelChannelId: null, otPanelMessageId: null, aktiflikLogChannelId: null, logs: {} });
  aktiflikLogChannelId = config.aktiflikLogChannelId || null;
  guardConfig = loadJSON(GUARD_FILE, { enabled: true, systems: { ban: true, kick: true, channel: true, role: true }, limits: { ban: 2, kick: 3, channel: 1, role: 2 }, windowMinutes: 10 });
  whitelist = new Set(loadJSON(WHITELIST_FILE, []));
  staffIds = new Set(loadJSON(STAFF_FILE, ENV_STAFF_IDS));
  staffRoles = new Set(loadJSON(STAFF_ROLES_FILE, []));
  bansData = loadJSON(BANS_FILE, []);
  farmData = loadJSON(FARM_FILE, []);
  eventsData = loadJSON(EVENTS_FILE, []);
  activityStore = loadJSON(ACTIVITY_FILE, {});

  if (CLIENT_ID) await registerCommands();

  await client.login(TOKEN);
})();
